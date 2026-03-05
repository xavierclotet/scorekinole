/**
 * Mock Firestore with optimistic concurrency control
 *
 * Simulates real Firestore transactional behavior:
 * - Each document has { data, version }
 * - Transactions read versions, buffer writes
 * - On commit: verify read versions still match → conflict = retry (up to 25x)
 * - This validates that runTransaction() protects against concurrent writes
 */

export interface StoredDocument {
  data: Record<string, unknown>;
  version: number;
}

interface PendingWrite {
  path: string;
  data: Record<string, unknown>;
  merge: boolean;
}

class MockDocumentSnapshot {
  private _data: Record<string, unknown> | null;

  constructor(data: Record<string, unknown> | null) {
    this._data = data ? structuredClone(data) : null;
  }

  exists(): boolean {
    return this._data !== null;
  }

  data(): Record<string, unknown> | undefined {
    return this._data ?? undefined;
  }
}

export class MockDocumentReference {
  constructor(
    public readonly path: string,
    public readonly id: string
  ) {}
}

class MockTransaction {
  private reads = new Map<string, number>(); // path → version at read time
  private writes: PendingWrite[] = [];

  constructor(private store: MockFirestore) {}

  async get(ref: MockDocumentReference): Promise<MockDocumentSnapshot> {
    const doc = this.store.getDocument(ref.path);
    if (doc) {
      this.reads.set(ref.path, doc.version);
      return new MockDocumentSnapshot(doc.data);
    }
    this.reads.set(ref.path, -1);
    return new MockDocumentSnapshot(null);
  }

  update(ref: MockDocumentReference, data: Record<string, unknown>): void {
    this.writes.push({ path: ref.path, data, merge: true });
  }

  set(ref: MockDocumentReference, data: Record<string, unknown>): void {
    this.writes.push({ path: ref.path, data, merge: false });
  }

  /**
   * Try to commit. Returns true if versions still match, false if conflict.
   */
  tryCommit(): boolean {
    // Verify all read versions still match current versions
    for (const [path, readVersion] of this.reads) {
      const current = this.store.getDocument(path);
      const currentVersion = current ? current.version : -1;
      if (currentVersion !== readVersion) {
        return false; // Conflict detected
      }
    }

    // Apply all writes atomically
    for (const write of this.writes) {
      const existing = this.store.getDocument(write.path);
      if (write.merge && existing) {
        // Merge: shallow merge top-level fields
        const merged = { ...existing.data, ...write.data };
        this.store.setDocument(write.path, merged);
      } else {
        this.store.setDocument(write.path, write.data);
      }
    }

    return true;
  }
}

export class MockFirestore {
  private documents = new Map<string, StoredDocument>();

  // Stats for assertions
  totalRetries = 0;
  totalCommits = 0;

  getDocument(path: string): StoredDocument | undefined {
    return this.documents.get(path);
  }

  setDocument(path: string, data: Record<string, unknown>): void {
    const existing = this.documents.get(path);
    this.documents.set(path, {
      data: structuredClone(data),
      version: (existing?.version ?? 0) + 1
    });
  }

  /**
   * Simulate Firestore runTransaction with optimistic concurrency.
   * Retries up to maxRetries times on conflict.
   */
  async runTransaction<T>(
    callback: (transaction: MockTransaction) => Promise<T>,
    maxRetries = 25
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const txn = new MockTransaction(this);
      const result = await callback(txn);

      if (txn.tryCommit()) {
        this.totalCommits++;
        return result;
      }

      // Conflict — retry
      this.totalRetries++;
      // Yield to event loop to allow interleaving with other transactions
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    throw new Error(`Transaction failed after ${maxRetries + 1} attempts`);
  }

  /**
   * Simulate the BROKEN pattern: read-then-blind-write (no transaction).
   * This reproduces the original bug where concurrent writes overwrite each other.
   */
  async runWithoutTransaction(
    callback: (transaction: MockTransaction) => Promise<void>
  ): Promise<void> {
    // Read phase
    const txn = new MockTransaction(this);
    await callback(txn);
    // Always commit — ignores version conflicts (the bug)
    txn.tryCommit();
    this.totalCommits++;
  }

  resetStats(): void {
    this.totalRetries = 0;
    this.totalCommits = 0;
  }
}
