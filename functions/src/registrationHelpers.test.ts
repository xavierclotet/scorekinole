import { describe, it, expect } from 'vitest';
import {
  detectNewParticipants,
  detectNewWaitlistEntries,
  detectPromotedFromWaitlist,
  type RegistrationParticipant,
  type RegistrationWaitlistEntry,
} from './registrationHelpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function p(id: string, userId?: string, name = id): RegistrationParticipant {
  return { id, userId: userId ?? id, name };
}

function w(userId: string, userName = userId): RegistrationWaitlistEntry {
  return { userId, userName };
}

// ─── detectNewParticipants ────────────────────────────────────────────────────

describe('detectNewParticipants (Bug #6: identity-based detection)', () => {
  it('returns empty when nothing changed', () => {
    const before = [p('p1'), p('p2')];
    expect(detectNewParticipants(before, before)).toHaveLength(0);
  });

  it('detects a newly added participant by id', () => {
    const before = [p('p1'), p('p2')];
    const after  = [p('p1'), p('p2'), p('p3')];
    expect(detectNewParticipants(before, after)).toEqual([p('p3')]);
  });

  it('detects the correct new participant even when old ones are reordered', () => {
    // Bug repro: array length heuristic would pick the last element which is p1 (old)
    const before = [p('p1'), p('p2')];
    const after  = [p('p3'), p('p2'), p('p1')]; // reordered + new p3 at front
    const result = detectNewParticipants(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p3');
  });

  it('detects multiple new participants when batch-added', () => {
    const before = [p('p1')];
    const after  = [p('p1'), p('p2'), p('p3')];
    expect(detectNewParticipants(before, after)).toHaveLength(2);
  });

  it('returns empty when participant count stays the same (promotion scenario)', () => {
    // p1 left, p3 joined — no net growth
    const before = [p('p1'), p('p2')];
    const after  = [p('p2'), p('p3')];
    // detectNewParticipants only finds NEW ids, p3 is new
    const result = detectNewParticipants(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p3');
  });

  it('skips participants without an id field', () => {
    const before: RegistrationParticipant[] = [];
    const after: RegistrationParticipant[]  = [{ name: 'no-id' }]; // id undefined
    expect(detectNewParticipants(before, after)).toHaveLength(0);
  });

  it('returns empty when both lists are empty', () => {
    expect(detectNewParticipants([], [])).toHaveLength(0);
  });
});

// ─── detectNewWaitlistEntries ─────────────────────────────────────────────────

describe('detectNewWaitlistEntries (Bug #6: identity-based detection)', () => {
  it('returns empty when nothing changed', () => {
    const before = [w('u1'), w('u2')];
    expect(detectNewWaitlistEntries(before, before)).toHaveLength(0);
  });

  it('detects a newly added waitlist entry by userId', () => {
    const before = [w('u1')];
    const after  = [w('u1'), w('u2')];
    expect(detectNewWaitlistEntries(before, after)).toEqual([w('u2')]);
  });

  it('detects correct entry even when list is reordered', () => {
    const before = [w('u1'), w('u2')];
    const after  = [w('u3'), w('u2'), w('u1')]; // new u3 at front, reordered
    const result = detectNewWaitlistEntries(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u3');
  });

  it('returns empty when both lists are empty', () => {
    expect(detectNewWaitlistEntries([], [])).toHaveLength(0);
  });
});

// ─── detectPromotedFromWaitlist ───────────────────────────────────────────────

describe('detectPromotedFromWaitlist (Bug #3: push notification on promotion)', () => {
  it('detects user promoted when they appear as new participant and were on waitlist', () => {
    // u1 unregisters, u3 (was on waitlist) is auto-promoted
    const beforeParticipants = [p('p1', 'u1'), p('p2', 'u2')];
    const afterParticipants  = [p('p2', 'u2'), p('p3', 'u3')]; // p1 gone, p3 (u3) joined
    const beforeWaitlist     = [w('u3'), w('u4')];

    const result = detectPromotedFromWaitlist(beforeParticipants, afterParticipants, beforeWaitlist);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u3');
  });

  it('does NOT flag a direct registration as a promotion', () => {
    // Tournament gains a new participant who was NOT on the waitlist
    const beforeParticipants = [p('p1', 'u1')];
    const afterParticipants  = [p('p1', 'u1'), p('p2', 'u2')];
    const beforeWaitlist: RegistrationWaitlistEntry[] = []; // empty waitlist

    expect(detectPromotedFromWaitlist(beforeParticipants, afterParticipants, beforeWaitlist))
      .toHaveLength(0);
  });

  it('does NOT flag existing participants', () => {
    // No change in participants, no promotion
    const participants = [p('p1', 'u1'), p('p2', 'u2')];
    expect(detectPromotedFromWaitlist(participants, participants, [w('u3')]))
      .toHaveLength(0);
  });

  it('detects promotion even when participant count stays the same (swap)', () => {
    // Exactly the promotion scenario: p count unchanged, waitlist shrank
    const beforeParticipants = [p('p1', 'u1'), p('p2', 'u2'), p('p3', 'u3')];
    const afterParticipants  = [p('p2', 'u2'), p('p3', 'u3'), p('p4', 'u4')];
    const beforeWaitlist     = [w('u4')];

    const result = detectPromotedFromWaitlist(beforeParticipants, afterParticipants, beforeWaitlist);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u4');
  });

  it('returns empty when waitlist was empty (no promotion possible)', () => {
    const beforeParticipants = [p('p1', 'u1')];
    const afterParticipants  = [p('p2', 'u2')]; // swapped but no waitlist
    expect(detectPromotedFromWaitlist(beforeParticipants, afterParticipants, []))
      .toHaveLength(0);
  });

  it('returns empty when both lists are empty', () => {
    expect(detectPromotedFromWaitlist([], [], [])).toHaveLength(0);
  });

  it('handles participant without userId gracefully', () => {
    const beforeParticipants: RegistrationParticipant[] = [{ id: 'p1' }]; // no userId
    const afterParticipants: RegistrationParticipant[]  = [{ id: 'p2' }]; // no userId
    const beforeWaitlist = [w('u1')];
    // Neither matches, so no promotion detected
    expect(detectPromotedFromWaitlist(beforeParticipants, afterParticipants, beforeWaitlist))
      .toHaveLength(0);
  });
});
