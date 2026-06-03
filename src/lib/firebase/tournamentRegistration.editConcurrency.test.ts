import { describe, it, expect } from 'vitest';
import {
  reconcileEditedRegistration,
  participantIdentityKey,
  rosterChanged,
  applyRankingSnapshots,
  type EditBaseline
} from './tournamentRegistration';
import type { TournamentParticipant, WaitlistEntry } from '$lib/types/tournament';

/**
 * Regression tests for the "admin edits players while registration is open" bug.
 *
 * Repro of the original report: an admin opens the edit wizard on a DRAFT
 * tournament with open registration. While the wizard is open, a player
 * self-registers (or is promoted from the waitlist). When the admin saves, the
 * wizard used to blindly overwrite `participants` with the snapshot it loaded at
 * open time, silently erasing the concurrent registration — the player had
 * registered ("but it IS there") yet vanished from the tournament detail.
 *
 * `reconcileEditedRegistration` is the fix: it merges the admin's edited list
 * against the live Firestore state so concurrent registrations survive while
 * the admin's explicit edits/removals are still honoured.
 */

// ─── factories ──────────────────────────────────────────────────────────────

function participant(
  id: string,
  overrides: Partial<TournamentParticipant> = {}
): TournamentParticipant {
  return {
    id,
    type: 'REGISTERED',
    userId: `user-${id}`,
    name: `Player ${id}`,
    rankingSnapshot: 0,
    status: 'ACTIVE',
    ...overrides
  };
}

function waitlistEntry(userId: string, overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    userId,
    userName: `Waiter ${userId}`,
    userKey: `key-${userId}`,
    registeredAt: 1000,
    ...overrides
  };
}

function baselineFrom(
  participants: TournamentParticipant[],
  waitlist: WaitlistEntry[]
): EditBaseline {
  return {
    participantIds: participants.map(p => p.id),
    waitlistUserIds: waitlist.map(w => w.userId)
  };
}

/** What the buggy code used to do: blind overwrite with the stale snapshot. */
function blindOverwrite(edited: { participants: TournamentParticipant[] }) {
  return edited.participants;
}

// ─── the reported bug ─────────────────────────────────────────────────────────

describe('reconcileEditedRegistration — the reported bug', () => {
  it('the OLD blind overwrite loses a concurrent self-registration (characterization)', () => {
    const a = participant('a');
    const b = participant('b');
    // Admin loaded [a, b], then added guest d by hand → edited = [a, b, d].
    const d = participant('d', { type: 'GUEST', userId: undefined });
    const edited = { participants: [a, b, d], waitlist: [] as WaitlistEntry[] };
    // Meanwhile c self-registered → Firestore now = [a, b, c].
    const c = participant('c');

    const overwritten = blindOverwrite(edited);

    // The bug: c is gone even though it registered successfully.
    expect(overwritten.map(p => p.id)).not.toContain('c');
  });

  it('the FIX preserves the concurrent self-registration while keeping the admin edits', () => {
    const a = participant('a');
    const b = participant('b');
    const d = participant('d', { type: 'GUEST', userId: undefined });
    const c = participant('c'); // registered after the wizard opened

    const baseline = baselineFrom([a, b], []);
    const edited = { participants: [a, b, d], waitlist: [] as WaitlistEntry[] };
    const current = { participants: [a, b, c], waitlist: [] as WaitlistEntry[] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    expect(result.participants.map(p => p.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

// ─── participant reconciliation ────────────────────────────────────────────────

describe('reconcileEditedRegistration — participants', () => {
  it('honours an admin removal of a participant that existed at open time', () => {
    const a = participant('a');
    const b = participant('b');
    const baseline = baselineFrom([a, b], []);
    // Admin removed b.
    const edited = { participants: [a], waitlist: [] as WaitlistEntry[] };
    const current = { participants: [a, b], waitlist: [] as WaitlistEntry[] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    expect(result.participants.map(p => p.id)).toEqual(['a']);
  });

  it("admin edits win for a kept participant (name / type / partner changes)", () => {
    const a = participant('a', { name: 'Old Name' });
    const baseline = baselineFrom([a], []);
    const editedA = participant('a', { name: 'New Name', teamName: 'Team Z' });
    const edited = { participants: [editedA], waitlist: [] as WaitlistEntry[] };
    const current = { participants: [a], waitlist: [] as WaitlistEntry[] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].name).toBe('New Name');
    expect(result.participants[0].teamName).toBe('Team Z');
  });

  it('preserves MULTIPLE concurrent registrations', () => {
    const a = participant('a');
    const baseline = baselineFrom([a], []);
    const edited = { participants: [a], waitlist: [] as WaitlistEntry[] };
    const current = {
      participants: [a, participant('c'), participant('e')],
      waitlist: [] as WaitlistEntry[]
    };

    const result = reconcileEditedRegistration(baseline, edited, current);

    expect(result.participants.map(p => p.id).sort()).toEqual(['a', 'c', 'e']);
  });

  it('does not duplicate an admin-added participant (id in edited, absent from current)', () => {
    const a = participant('a');
    const newGuest = participant('new-guest', { type: 'GUEST', userId: undefined });
    const baseline = baselineFrom([a], []);
    const edited = { participants: [a, newGuest], waitlist: [] as WaitlistEntry[] };
    const current = { participants: [a], waitlist: [] as WaitlistEntry[] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    const ids = result.participants.map(p => p.id);
    expect(ids).toEqual(['a', 'new-guest']);
    expect(ids.filter(id => id === 'new-guest')).toHaveLength(1);
  });

  it('is a no-op when nothing changed concurrently (result equals edited)', () => {
    const a = participant('a');
    const b = participant('b');
    const baseline = baselineFrom([a, b], []);
    const edited = { participants: [a, b], waitlist: [] as WaitlistEntry[] };
    const current = { participants: [a, b], waitlist: [] as WaitlistEntry[] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    expect(result.participants).toEqual([a, b]);
    expect(result.waitlist).toEqual([]);
  });

  it('handles empty everything', () => {
    const result = reconcileEditedRegistration(
      { participantIds: [], waitlistUserIds: [] },
      { participants: [], waitlist: [] },
      { participants: [], waitlist: [] }
    );
    expect(result.participants).toEqual([]);
    expect(result.waitlist).toEqual([]);
  });
});

// ─── waitlist reconciliation ───────────────────────────────────────────────────

describe('reconcileEditedRegistration — waitlist', () => {
  it('preserves a waitlist entry that joined while the wizard was open', () => {
    const a = participant('a');
    const w1 = waitlistEntry('w1');
    const w2 = waitlistEntry('w2'); // joined concurrently
    const baseline = baselineFrom([a], [w1]);
    const edited = { participants: [a], waitlist: [w1] };
    const current = { participants: [a], waitlist: [w1, w2] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    expect(result.waitlist.map(w => w.userId).sort()).toEqual(['w1', 'w2']);
  });

  it('honours an admin clearing the waitlist while still preserving a new concurrent entry', () => {
    const a = participant('a');
    const w1 = waitlistEntry('w1');
    const w2 = waitlistEntry('w2'); // joined concurrently, unknown to the admin
    const baseline = baselineFrom([a], [w1]);
    // Admin removed w1.
    const edited = { participants: [a], waitlist: [] as WaitlistEntry[] };
    const current = { participants: [a], waitlist: [w1, w2] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    // w1 honoured-removed, w2 preserved.
    expect(result.waitlist.map(w => w.userId)).toEqual(['w2']);
  });
});

// ─── the trickiest race: concurrent unregister → promotion ─────────────────────

describe('reconcileEditedRegistration — concurrent promotion (no duplicate)', () => {
  it('a user promoted from the waitlist appears once as a participant, not also on the waitlist', () => {
    // Open time: participants [a, b] (b full slot), waitlist [w1].
    const a = participant('a');
    const b = participant('b');
    const w1 = waitlistEntry('w1');
    const baseline = baselineFrom([a, b], [w1]);

    // Admin only renamed a; their stale view still shows b present and w1 waiting.
    const editedA = participant('a', { name: 'Renamed' });
    const edited = { participants: [editedA, b], waitlist: [w1] };

    // Concurrently: b unregistered → w1 auto-promoted to a NEW participant row.
    const promoted = participant('promoted-w1', { userId: 'w1' });
    const current = { participants: [a, promoted], waitlist: [] as WaitlistEntry[] };

    const result = reconcileEditedRegistration(baseline, edited, current);

    // The promoted user (userId w1) must be a participant exactly once...
    const w1AsParticipant = result.participants.filter(p => p.userId === 'w1');
    expect(w1AsParticipant).toHaveLength(1);
    // ...and must NOT still be sitting on the waitlist (the stale edited list).
    expect(result.waitlist.some(w => w.userId === 'w1')).toBe(false);
    // Admin's rename of a is still applied.
    expect(result.participants.find(p => p.id === 'a')?.name).toBe('Renamed');
  });
});

// ─── roster guard helpers (tournament-start race) ─────────────────────────────

describe('participantIdentityKey', () => {
  it('prefers userId', () => {
    expect(participantIdentityKey({ userId: 'u9', name: 'Whatever' })).toBe('u:u9');
  });
  it('falls back to normalized name when no userId', () => {
    expect(participantIdentityKey({ name: '  Juan  Pérez ' })).toBe('n:juan  pérez');
  });
});

describe('rosterChanged', () => {
  const keys = (ps: { userId?: string; name?: string }[]) => ps.map(participantIdentityKey);

  it('is false when the roster is identical', () => {
    const current = [participant('a'), participant('b')];
    expect(rosterChanged(keys(current), current)).toBe(false);
  });

  it('is false regardless of order (set comparison)', () => {
    const a = participant('a');
    const b = participant('b');
    expect(rosterChanged(keys([a, b]), [b, a])).toBe(false);
  });

  it('detects a concurrent self-registration (one extra player)', () => {
    const a = participant('a');
    const b = participant('b');
    const expected = keys([a, b]);
    expect(rosterChanged(expected, [a, b, participant('c')])).toBe(true);
  });

  it('detects a concurrent unregistration (one fewer player)', () => {
    const a = participant('a');
    const b = participant('b');
    expect(rosterChanged(keys([a, b]), [a])).toBe(true);
  });

  it('detects a swap that keeps the count the same (unregister + promotion)', () => {
    const a = participant('a');
    const b = participant('b');
    const promoted = participant('x', { userId: 'user-x' });
    expect(rosterChanged(keys([a, b]), [a, promoted])).toBe(true);
  });

  it('is robust to the participant id being regenerated (matches by userId)', () => {
    // Same player, different `id` (start regenerates ids for legacy rows).
    const before = [participant('legacy-1', { userId: 'user-z' })];
    const afterRegen = [participant('participant-99999', { userId: 'user-z' })];
    expect(rosterChanged(before.map(participantIdentityKey), afterRegen)).toBe(false);
  });
});

describe('applyRankingSnapshots', () => {
  it('applies the updated row to a matched participant', () => {
    const current = [participant('a', { userId: 'ua', rankingSnapshot: 0 })];
    const updated = participant('a', { userId: 'ua', rankingSnapshot: 1500 });
    const map = new Map([[participantIdentityKey(updated), updated]]);

    const result = applyRankingSnapshots(current, map);
    expect(result[0].rankingSnapshot).toBe(1500);
  });

  it('preserves a participant who registered concurrently (not in the snapshot map)', () => {
    const a = participant('a', { userId: 'ua', rankingSnapshot: 0 });
    const lateRegistrant = participant('late', { userId: 'ulate', rankingSnapshot: 0 });
    const current = [a, lateRegistrant];
    // The snapshot map was built before `late` registered → only knows `a`.
    const updatedA = participant('a', { userId: 'ua', rankingSnapshot: 1200 });
    const map = new Map([[participantIdentityKey(updatedA), updatedA]]);

    const result = applyRankingSnapshots(current, map);

    expect(result.map(p => p.userId).sort()).toEqual(['ulate', 'ua'].sort());
    expect(result.find(p => p.userId === 'ua')?.rankingSnapshot).toBe(1200);
    // Late registrant survives untouched — NOT dropped.
    expect(result.find(p => p.userId === 'ulate')).toBeTruthy();
  });
});
