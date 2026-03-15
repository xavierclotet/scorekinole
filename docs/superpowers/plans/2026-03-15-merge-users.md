# Merge Universal de Usuarios — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the limited Guest→Registered merge with a universal merge that works for any user combination and updates tournament participant references.

**Architecture:** New `mergeUsers()` function in `admin.ts` replaces `mergeGuestToRegistered()`. It merges tournament records (deduplicating by `tournamentId`), updates all tournament documents where the source userId appears (in `participant.userId` or `partner.userId`), and marks the source as merged. The existing merge modal in `/admin/users` is updated to allow selecting any user as target (not just registered users without tournaments).

**Tech Stack:** SvelteKit, TypeScript, Firebase Firestore, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/firebase/admin.ts` | Modify | Replace `mergeGuestToRegistered` with `mergeUsers`, remove `getRegisteredUsers` |
| `src/lib/firebase/admin.test.ts` | Create | Tests for `mergeUsers` (pure logic extraction) |
| `src/routes/admin/users/+page.svelte` | Modify | Update merge modal: search input instead of dropdown, remove guest-only restriction |
| `messages/es.json` | Modify | Update i18n keys for universal merge |

---

## Chunk 1: Backend — `mergeUsers` function

### Task 1: Create test file for merge logic

**Files:**
- Create: `src/lib/firebase/admin.test.ts`

- [ ] **Step 1: Write tests for `mergeUsers`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Track mock calls ──────────────────────────────────────────────────────────

let mockUsers: Map<string, any> = new Map();
let mockTournaments: Map<string, any> = new Map();
let updatedDocs: Map<string, any> = new Map();
let isAdminResult = true;

// ─── vi.mock setup ──────────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));

vi.mock('./auth', () => ({
  currentUser: { subscribe: (fn: any) => { fn({ id: 'admin-user' }); return () => {}; } }
}));

vi.mock('./admin-utils', async () => ({
  isAdmin: async () => isAdminResult
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: any, collection: string, id: string) => ({ path: `${collection}/${id}`, id }),
  getDoc: async (ref: any) => {
    const data = ref.path.startsWith('users/')
      ? mockUsers.get(ref.id)
      : mockTournaments.get(ref.id);
    return {
      exists: () => !!data,
      data: () => data ? { ...data } : undefined
    };
  },
  getDocs: async () => ({
    forEach: (fn: any) => {
      mockTournaments.forEach((data, id) => {
        fn({ id, data: () => ({ ...data }) });
      });
    }
  }),
  setDoc: async (ref: any, data: any, _options?: any) => {
    updatedDocs.set(ref.path || ref.id, data);
  },
  updateDoc: async (ref: any, data: any) => {
    updatedDocs.set(ref.path || ref.id, data);
  },
  collection: () => ({}),
  query: (...args: any[]) => args,
  where: () => ({}),
  orderBy: () => ({}),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  arrayUnion: (...args: any[]) => args
}));

// Use dynamic import after mocks
const { mergeUsers } = await import('./admin');

describe('mergeUsers', () => {
  beforeEach(() => {
    mockUsers.clear();
    mockTournaments.clear();
    updatedDocs.clear();
    isAdminResult = true;
  });

  it('returns error if source user not found', async () => {
    mockUsers.set('target-id', { playerName: 'Target' });
    const result = await mergeUsers('missing-id', 'target-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error if target user not found', async () => {
    mockUsers.set('source-id', { playerName: 'Source' });
    const result = await mergeUsers('source-id', 'missing-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error if source and target are the same', async () => {
    mockUsers.set('same-id', { playerName: 'Same' });
    const result = await mergeUsers('same-id', 'same-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('same');
  });

  it('returns error if source already merged', async () => {
    mockUsers.set('source-id', { playerName: 'Source', mergedTo: 'other' });
    mockUsers.set('target-id', { playerName: 'Target' });
    const result = await mergeUsers('source-id', 'target-id');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already merged');
  });

  it('merges tournaments deduplicating by tournamentId', async () => {
    mockUsers.set('source-id', {
      playerName: 'Source',
      tournaments: [
        { tournamentId: 't1', rankingDelta: 10 },
        { tournamentId: 't2', rankingDelta: 20 }
      ]
    });
    mockUsers.set('target-id', {
      playerName: 'Target',
      tournaments: [
        { tournamentId: 't2', rankingDelta: 25 }, // duplicate — keep target's
        { tournamentId: 't3', rankingDelta: 30 }
      ]
    });

    const result = await mergeUsers('source-id', 'target-id');
    expect(result.success).toBe(true);

    // Target should have t1 (from source), t2 (kept target's), t3 (target's)
    const targetUpdate = updatedDocs.get('users/target-id');
    expect(targetUpdate).toBeDefined();
    expect(targetUpdate.tournaments).toHaveLength(3);
    // t2 should be target's version (rankingDelta: 25)
    const t2 = targetUpdate.tournaments.find((t: any) => t.tournamentId === 't2');
    expect(t2.rankingDelta).toBe(25);
  });

  it('merges when source has no tournaments', async () => {
    mockUsers.set('source-id', { playerName: 'Source' });
    mockUsers.set('target-id', { playerName: 'Target', tournaments: [{ tournamentId: 't1' }] });

    const result = await mergeUsers('source-id', 'target-id');
    expect(result.success).toBe(true);
  });

  it('merges when target has no tournaments', async () => {
    mockUsers.set('source-id', {
      playerName: 'Source',
      tournaments: [{ tournamentId: 't1', rankingDelta: 10 }]
    });
    mockUsers.set('target-id', { playerName: 'Target' });

    const result = await mergeUsers('source-id', 'target-id');
    expect(result.success).toBe(true);

    const targetUpdate = updatedDocs.get('users/target-id');
    expect(targetUpdate.tournaments).toHaveLength(1);
  });

  it('marks source with mergedTo and target with mergedFrom', async () => {
    mockUsers.set('source-id', { playerName: 'Source', tournaments: [] });
    mockUsers.set('target-id', { playerName: 'Target', tournaments: [] });

    await mergeUsers('source-id', 'target-id');

    const sourceUpdate = updatedDocs.get('users/source-id');
    expect(sourceUpdate.mergedTo).toBe('target-id');

    const targetUpdate = updatedDocs.get('users/target-id');
    expect(targetUpdate.mergedFrom).toContain('source-id');
  });

  it('works for guest-to-guest merge', async () => {
    mockUsers.set('guest-1', { playerName: 'Guest 1', authProvider: null, tournaments: [{ tournamentId: 't1' }] });
    mockUsers.set('guest-2', { playerName: 'Guest 2', authProvider: null, tournaments: [{ tournamentId: 't2' }] });

    const result = await mergeUsers('guest-1', 'guest-2');
    expect(result.success).toBe(true);
  });

  it('works for guest-to-registered merge', async () => {
    mockUsers.set('guest-1', { playerName: 'Guest', authProvider: null, tournaments: [{ tournamentId: 't1' }] });
    mockUsers.set('reg-1', { playerName: 'Registered', authProvider: 'google', tournaments: [{ tournamentId: 't2' }] });

    const result = await mergeUsers('guest-1', 'reg-1');
    expect(result.success).toBe(true);
  });

  it('works for registered-to-registered merge', async () => {
    mockUsers.set('reg-1', { playerName: 'Reg 1', authProvider: 'google', tournaments: [] });
    mockUsers.set('reg-2', { playerName: 'Reg 2', authProvider: 'google', tournaments: [] });

    const result = await mergeUsers('reg-1', 'reg-2');
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/firebase/admin.test.ts`
Expected: FAIL — `mergeUsers` is not exported

---

### Task 2: Implement `mergeUsers` function

**Files:**
- Modify: `src/lib/firebase/admin.ts:587-675` (replace `mergeGuestToRegistered`)

- [ ] **Step 3: Replace `mergeGuestToRegistered` with `mergeUsers`**

Replace the `mergeGuestToRegistered` function (lines 587-675) and `getRegisteredUsers` function (lines 681-720) with:

```typescript
/**
 * Merge two user profiles (universal — works for any combination of guest/registered).
 *
 * Steps:
 * 1. Validate both users exist, aren't the same, source not already merged
 * 2. Merge tournaments[] (deduplicate by tournamentId, keep target's version on conflict)
 * 3. Update tournament documents: replace source userId in participant.userId / partner.userId
 * 4. Mark source as mergedTo, target gets mergedFrom
 *
 * @param sourceUserId User to merge FROM (will be marked as merged)
 * @param targetUserId User to merge INTO (will receive tournaments)
 */
export async function mergeUsers(
  sourceUserId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string; tournamentsUpdated?: number }> {
  if (!browser || !isFirebaseEnabled()) {
    return { success: false, error: 'Firebase disabled' };
  }

  const user = get(currentUser);
  if (!user) {
    return { success: false, error: 'No user authenticated' };
  }

  const adminStatus = await isAdmin();
  if (!adminStatus) {
    return { success: false, error: 'Unauthorized: User is not admin' };
  }

  if (sourceUserId === targetUserId) {
    return { success: false, error: 'Cannot merge a user with themselves (same userId)' };
  }

  try {
    // 1. Read both profiles
    const sourceRef = doc(db!, 'users', sourceUserId);
    const targetRef = doc(db!, 'users', targetUserId);

    const [sourceSnap, targetSnap] = await Promise.all([
      getDoc(sourceRef),
      getDoc(targetRef)
    ]);

    if (!sourceSnap.exists()) {
      return { success: false, error: 'Source user not found' };
    }
    if (!targetSnap.exists()) {
      return { success: false, error: 'Target user not found' };
    }

    const sourceData = sourceSnap.data() as UserProfile;
    const targetData = targetSnap.data() as UserProfile;

    if (sourceData.mergedTo) {
      return { success: false, error: 'Source user was already merged' };
    }

    // 2. Merge tournaments (deduplicate by tournamentId — target wins on conflict)
    const sourceTournaments = sourceData.tournaments || [];
    const targetTournaments = targetData.tournaments || [];
    const targetTournamentIds = new Set(targetTournaments.map(t => t.tournamentId));
    const newTournaments = sourceTournaments.filter(t => !targetTournamentIds.has(t.tournamentId));
    const mergedTournaments = [...targetTournaments, ...newTournaments];

    // 3. Update tournament documents where source userId appears
    let tournamentsUpdated = 0;
    const tournamentIdsToCheck = new Set(sourceTournaments.map(t => t.tournamentId));

    for (const tournamentId of tournamentIdsToCheck) {
      const tournamentRef = doc(db!, 'tournaments', tournamentId);
      const tournamentSnap = await getDoc(tournamentRef);
      if (!tournamentSnap.exists()) continue;

      const tournamentData = tournamentSnap.data();
      const participants = tournamentData.participants || [];
      let changed = false;

      const updatedParticipants = participants.map((p: any) => {
        const updated = { ...p };

        // Replace source userId in main participant
        if (updated.userId === sourceUserId) {
          updated.userId = targetUserId;
          // Copy photo and type from target profile if available
          if (targetData.photoURL) updated.photoURL = targetData.photoURL;
          if (targetData.authProvider) updated.type = 'REGISTERED';
          changed = true;
        }

        // Replace source userId in partner
        if (updated.partner?.userId === sourceUserId) {
          updated.partner = {
            ...updated.partner,
            userId: targetUserId
          };
          if (targetData.photoURL) updated.partner.photoURL = targetData.photoURL;
          if (targetData.authProvider) updated.partner.type = 'REGISTERED';
          changed = true;
        }

        return updated;
      });

      if (changed) {
        await setDoc(tournamentRef, { participants: updatedParticipants }, { merge: true });
        tournamentsUpdated++;
      }
    }

    // 4. Update target user profile
    const existingMergedFrom = targetData.mergedFrom || [];
    await setDoc(targetRef, {
      tournaments: mergedTournaments,
      mergedFrom: [...existingMergedFrom, sourceUserId],
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 5. Mark source as merged
    await setDoc(sourceRef, {
      mergedTo: targetUserId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Merged user ${sourceUserId} into ${targetUserId}`);
    console.log(`   - Tournaments merged: ${newTournaments.length} new + ${targetTournaments.length} existing`);
    console.log(`   - Tournament docs updated: ${tournamentsUpdated}`);

    return { success: true, tournamentsUpdated };
  } catch (error) {
    console.error('❌ Error merging users:', error);
    return { success: false, error: 'Error during merge operation' };
  }
}
```

- [ ] **Step 4: Update exports**

In `admin.ts`, remove the old `getRegisteredUsers` export. Update the import in the page later.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/firebase/admin.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase/admin.ts src/lib/firebase/admin.test.ts
git commit -m "feat: replace mergeGuestToRegistered with universal mergeUsers"
```

---

## Chunk 2: Fix `fetchAllUsers` to include users without `createdAt`

### Task 3: Fix fetchAllUsers query

**Files:**
- Modify: `src/lib/firebase/admin.ts:105-131`

The current `fetchAllUsers` uses `orderBy('createdAt', 'desc')` which **excludes** documents without `createdAt` (Firestore behavior). This causes users created by `addTournamentRecord` (which only writes `tournaments` + `updatedAt`) to be invisible.

- [ ] **Step 7: Fix the query to not exclude users without `createdAt`**

Change `fetchAllUsers` to not use `orderBy('createdAt')`. Instead, fetch all users without ordering (or order by a field that all users have). Since this is a search function that loads all users, ordering is less important — client-side sort is fine:

```typescript
export async function fetchAllUsers(): Promise<AdminUserInfo[]> {
  if (!browser || !isFirebaseEnabled()) return [];

  const user = get(currentUser);
  if (!user) return [];

  const adminStatus = await isAdmin();
  if (!adminStatus) return [];

  try {
    const usersRef = collection(db!, 'users');
    // Don't use orderBy('createdAt') — Firestore excludes documents
    // that don't have the ordered field. Users created by addTournamentRecord
    // may lack createdAt.
    const snapshot = await getDocs(usersRef);

    const users: AdminUserInfo[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      users.push({ userId: docSnap.id, ...data });
    });

    // Sort client-side (createdAt desc, users without createdAt at the end)
    users.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? a.createdAt ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? b.createdAt ?? 0;
      return bTime - aTime;
    });

    console.log(`✅ Fetched all ${users.length} users for search`);
    return users;
  } catch (error) {
    console.error('❌ Error fetching all users:', error);
    return [];
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/firebase/admin.ts
git commit -m "fix: fetchAllUsers includes users without createdAt field"
```

---

## Chunk 3: Update UI — merge modal

### Task 4: Update the merge modal in `/admin/users`

**Files:**
- Modify: `src/routes/admin/users/+page.svelte`
- Modify: `messages/es.json`

- [ ] **Step 9: Update i18n keys in `messages/es.json`**

Add/update these keys:

```json
"admin_mergeUsers": "Fusionar usuarios",
"admin_mergeUsersTitle": "Fusionar usuarios",
"admin_mergeSearchTarget": "Buscar usuario destino...",
"admin_mergeConfirm": "Confirmar fusión",
"admin_merging": "Fusionando...",
"admin_mergeSuccess": "Usuarios fusionados correctamente",
"admin_mergeError": "Error durante la fusión",
"admin_mergeTournamentsToMove": "{n} torneos a migrar",
"admin_mergeTargetTournaments": "{n} torneos existentes",
"admin_mergeTournamentsUpdated": "{n} documentos de torneo actualizados"
```

Update existing key:
```json
"admin_migrateUserTitle": "Fusionar usuarios"
```

- [ ] **Step 10: Update imports in `+page.svelte`**

Replace line 10:
```typescript
// Old:
import { ..., mergeGuestToRegistered, getRegisteredUsers, ... } from '$lib/firebase/admin';
// New:
import { ..., mergeUsers, ... } from '$lib/firebase/admin';
```

Remove `getRegisteredUsers` from import. Remove `registeredUsersList` state variable.

- [ ] **Step 11: Update merge button — show for all users (not just guests)**

Replace line 454-462:

```svelte
<!-- Old: {#if isGuestUser(user)} -->
{#if !user.mergedTo}
  <button
    class="action-btn migrate-btn"
    onclick={(e) => { e.stopPropagation(); showMigrateModal(user); }}
    title={m.admin_mergeUsers()}
  >
    🔗
  </button>
{/if}
```

- [ ] **Step 12: Update `showMigrateModal` — no longer loads registered users**

```typescript
async function showMigrateModal(user: AdminUserInfo) {
  userToMigrate = user;
  selectedTargetUserId = '';
  migrationError = null;
  mergeSearchQuery = '';
  // Ensure allUsersCache is loaded for the target search
  if (!allUsersCache) {
    allUsersCache = await fetchAllUsers();
  }
}
```

- [ ] **Step 13: Add merge search state and derived filtered targets**

Add new state variables:

```typescript
let mergeSearchQuery = $state('');

let mergeTargetCandidates = $derived(() => {
  if (!allUsersCache || !userToMigrate) return [];
  const q = normalizeText(mergeSearchQuery);
  if (!q) return [];
  return allUsersCache.filter(u => {
    // Exclude self, already-merged users
    if (u.userId === userToMigrate!.userId) return false;
    if (u.mergedTo) return false;
    // Search by name, email, or userId
    return (
      normalizeText(u.playerName ?? '').includes(q) ||
      normalizeText(u.email ?? '').includes(q) ||
      u.userId.includes(mergeSearchQuery.trim())
    );
  }).slice(0, 10); // Limit to 10 results
});
```

- [ ] **Step 14: Update `confirmMigrate` to use `mergeUsers`**

```typescript
async function confirmMigrate() {
  if (!userToMigrate || !selectedTargetUserId) return;

  isMigrating = true;
  migrationError = null;

  const result = await mergeUsers(userToMigrate.userId, selectedTargetUserId);

  if (result.success) {
    // Update local state
    users = users.map(u => {
      if (u.userId === userToMigrate!.userId) {
        return { ...u, mergedTo: selectedTargetUserId };
      }
      return u;
    });
    cancelMigrate();
    allUsersCache = null;
    await loadInitialUsers();
  } else {
    migrationError = result.error || m.admin_mergeError();
  }

  isMigrating = false;
}
```

- [ ] **Step 15: Replace merge modal template — search input instead of dropdown**

Replace the migrate modal (lines 640-693) with:

```svelte
{#if userToMigrate}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="migrate-overlay" data-theme={$adminTheme} onclick={cancelMigrate} role="presentation">
    <div class="migrate-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <h3>{m.admin_mergeUsersTitle()}</h3>

      <div class="migrate-source">
        <span class="migrate-label">{m.admin_sourceUser()}</span>
        <div class="user-preview">
          {#if userToMigrate.photoURL}
            <img src={userToMigrate.photoURL} alt="" class="preview-avatar" referrerpolicy="no-referrer" />
          {:else}
            <div class="preview-avatar-placeholder">
              {userToMigrate.playerName?.charAt(0).toUpperCase() || '?'}
            </div>
          {/if}
          <div class="user-preview-info">
            <strong>{userToMigrate.playerName}</strong>
            <small>{m.admin_mergeTournamentsToMove({ n: String(userToMigrate.tournaments?.length ?? 0) })}</small>
            <small>{m.admin_rankingToMigrate({ n: String(userToMigrate.tournaments?.reduce((sum, t) => sum + (t.rankingDelta || 0), 0) ?? 0) })}</small>
          </div>
        </div>
      </div>

      <div class="migrate-arrow">↓</div>

      <div class="migrate-target">
        <span class="migrate-label">{m.admin_selectTargetUser()}</span>
        <input
          type="text"
          class="merge-search-input"
          placeholder={m.admin_mergeSearchTarget()}
          bind:value={mergeSearchQuery}
        />

        {#if mergeSearchQuery.trim().length > 0}
          <div class="merge-results">
            {#each mergeTargetCandidates() as candidate (candidate.userId)}
              <button
                class={['merge-result-item', selectedTargetUserId === candidate.userId && 'selected']}
                onclick={() => { selectedTargetUserId = candidate.userId; }}
              >
                {#if candidate.photoURL}
                  <img src={candidate.photoURL} alt="" class="result-avatar" referrerpolicy="no-referrer" />
                {:else}
                  <div class="result-avatar-placeholder">
                    {candidate.playerName?.charAt(0).toUpperCase() || '?'}
                  </div>
                {/if}
                <div class="result-info">
                  <strong>{candidate.playerName}</strong>
                  <small>{candidate.email || candidate.userId}</small>
                  <small>{m.admin_mergeTargetTournaments({ n: String(candidate.tournaments?.length ?? 0) })}</small>
                </div>
                {#if candidate.authProvider}
                  <span class="result-badge registered">REG</span>
                {:else}
                  <span class="result-badge guest">GUEST</span>
                {/if}
              </button>
            {:else}
              <div class="merge-no-results">No se encontraron usuarios</div>
            {/each}
          </div>
        {/if}
      </div>

      {#if migrationError}
        <p class="migration-error">{migrationError}</p>
      {/if}

      <div class="migrate-actions">
        <button class="cancel-btn" onclick={cancelMigrate} disabled={isMigrating}>
          {m.common_cancel()}
        </button>
        <button
          class="confirm-btn migrate-confirm-btn"
          onclick={confirmMigrate}
          disabled={isMigrating || !selectedTargetUserId}
        >
          {isMigrating ? m.admin_merging() : m.admin_mergeConfirm()}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 16: Add styles for the merge search results**

Add to the `<style>` block:

```css
.merge-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  font-size: 14px;
  background: var(--background, white);
  color: var(--foreground, #111);
}

.merge-results {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  margin-top: 8px;
}

.merge-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  border-bottom: 1px solid var(--border, #e5e7eb);
  color: var(--foreground, #111);
}

.merge-result-item:last-child {
  border-bottom: none;
}

.merge-result-item:hover {
  background: color-mix(in srgb, var(--primary, #3b82f6) 10%, transparent);
}

.merge-result-item.selected {
  background: color-mix(in srgb, var(--primary, #3b82f6) 15%, transparent);
  outline: 2px solid var(--primary, #3b82f6);
  outline-offset: -2px;
}

.result-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.result-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  background: color-mix(in srgb, var(--primary, #3b82f6) 15%, transparent);
  color: var(--primary, #3b82f6);
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.result-info strong {
  font-size: 13px;
}

.result-info small {
  font-size: 11px;
  opacity: 0.7;
}

.result-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.result-badge.registered {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #16a34a;
}

.result-badge.guest {
  background: color-mix(in srgb, #f59e0b 15%, transparent);
  color: #d97706;
}

.merge-no-results {
  padding: 16px;
  text-align: center;
  font-size: 13px;
  opacity: 0.6;
}
```

- [ ] **Step 17: Commit**

```bash
git add src/routes/admin/users/+page.svelte messages/es.json
git commit -m "feat: universal merge UI with search in /admin/users"
```

---

## Chunk 4: Manual test & cleanup

### Task 5: Verify end-to-end

- [ ] **Step 18: Run all tests**

```bash
npm test
```

Expected: All tests pass, including new `admin.test.ts`.

- [ ] **Step 19: Manual verification checklist**

1. Open `/admin/users`
2. Search for a user — verify both guest and registered users show 🔗 button
3. Click 🔗 on a user — verify modal shows with search input
4. Search for target user by name — verify results appear
5. Select target — verify it gets highlighted
6. Click "Confirmar fusión" — verify success
7. Verify source user now shows as merged
8. Check target user's tournaments array in Firestore — has merged records
9. Check tournament documents — participant.userId updated

- [ ] **Step 20: Final commit**

```bash
git add -A
git commit -m "feat: universal user merge with tournament reference updates"
```
