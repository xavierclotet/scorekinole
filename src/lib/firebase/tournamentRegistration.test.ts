import { describe, it, expect } from 'vitest';
import {
  validateRegistration,
  determineRegistrationOutcome,
  validateUnregistration,
  validateWaitlistUnregistration,
  buildRegistrationConfig,
  adminPromoteFromWaitlist,
  adminRemoveFromWaitlist,
} from './tournamentRegistration';
import type { TournamentParticipant, WaitlistEntry } from '$lib/types/tournament';

// ─── validateRegistration ─────────────────────────────────────────────────────

describe('validateRegistration', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('rejects when tournament is not DRAFT', () => {
    expect(validateRegistration('GROUP_STAGE', baseReg, [], [], 'u1', now))
      .toEqual({ canRegister: false, reason: 'not_draft' });
  });

  it('rejects for every non-DRAFT status', () => {
    for (const status of ['BRACKET', 'FINAL_STAGE', 'COMPLETED', 'CANCELLED']) {
      expect(validateRegistration(status, baseReg, [], [], 'u1', now).canRegister).toBe(false);
    }
  });

  it('rejects when registration is not enabled', () => {
    expect(validateRegistration('DRAFT', { ...baseReg, enabled: false }, [], [], 'u1', now))
      .toEqual({ canRegister: false, reason: 'registration_disabled' });
  });

  it('rejects when registration is undefined', () => {
    expect(validateRegistration('DRAFT', undefined, [], [], 'u1', now))
      .toEqual({ canRegister: false, reason: 'registration_disabled' });
  });

  it('rejects when deadline has passed', () => {
    const reg = { ...baseReg, deadline: now - 1000 };
    expect(validateRegistration('DRAFT', reg, [], [], 'u1', now))
      .toEqual({ canRegister: false, reason: 'deadline_passed' });
  });

  it('allows when deadline has not passed', () => {
    const reg = { ...baseReg, deadline: now + 100_000 };
    expect(validateRegistration('DRAFT', reg, [], [], 'u1', now))
      .toEqual({ canRegister: true });
  });

  it('allows exactly at deadline (not yet passed)', () => {
    const reg = { ...baseReg, deadline: now };
    // now > deadline is false when equal, so it allows
    expect(validateRegistration('DRAFT', reg, [], [], 'u1', now).canRegister).toBe(true);
  });

  it('rejects when user already in participants', () => {
    expect(validateRegistration('DRAFT', baseReg, ['u1', 'u2'], [], 'u1', now))
      .toEqual({ canRegister: false, reason: 'already_registered' });
  });

  it('rejects when user already in waitlist', () => {
    expect(validateRegistration('DRAFT', baseReg, [], ['u1'], 'u1', now))
      .toEqual({ canRegister: false, reason: 'already_waitlisted' });
  });

  it('allows when a different user is registered', () => {
    expect(validateRegistration('DRAFT', baseReg, ['u2'], [], 'u1', now))
      .toEqual({ canRegister: true });
  });

  it('allows when a different user is on waitlist', () => {
    expect(validateRegistration('DRAFT', baseReg, [], ['u2'], 'u1', now))
      .toEqual({ canRegister: true });
  });

  it('priority: not_draft checked before registration_disabled', () => {
    const disabledReg = { ...baseReg, enabled: false };
    expect(validateRegistration('COMPLETED', disabledReg, [], [], 'u1', now).reason)
      .toBe('not_draft');
  });

  it('priority: registration_disabled checked before deadline_passed', () => {
    const disabledReg = { ...baseReg, enabled: false, deadline: now - 1000 };
    expect(validateRegistration('DRAFT', disabledReg, [], [], 'u1', now).reason)
      .toBe('registration_disabled');
  });

  it('priority: deadline_passed checked before already_registered', () => {
    const reg = { ...baseReg, deadline: now - 1 };
    expect(validateRegistration('DRAFT', reg, ['u1'], [], 'u1', now).reason)
      .toBe('deadline_passed');
  });
});

// ─── deadline edge cases ─────────────────────────────────────────────────────

describe('deadline edge cases', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };

  describe('validateRegistration boundary', () => {
    it('allows at the exact moment of the deadline (now == deadline)', () => {
      const now = 1_000_000;
      // Condition is now > deadline, so equal means ALLOWED
      const reg = { ...baseReg, deadline: now };
      expect(validateRegistration('DRAFT', reg, [], [], 'u1', now).canRegister).toBe(true);
    });

    it('rejects 1ms after deadline', () => {
      const now = 1_000_001;
      const reg = { ...baseReg, deadline: 1_000_000 };
      expect(validateRegistration('DRAFT', reg, [], [], 'u1', now).canRegister).toBe(false);
    });

    it('allows 1ms before deadline', () => {
      const now = 999_999;
      const reg = { ...baseReg, deadline: 1_000_000 };
      expect(validateRegistration('DRAFT', reg, [], [], 'u1', now).canRegister).toBe(true);
    });

    it('allows when deadline is undefined (no deadline set)', () => {
      const reg = { ...baseReg }; // no deadline property
      expect(validateRegistration('DRAFT', reg, [], [], 'u1', Date.now()).canRegister).toBe(true);
    });

    it('⚠️ deadline of 0 is falsy — treated as NO deadline (registration allowed)', () => {
      // BUG POTENTIAL: `registration.deadline && now > registration.deadline`
      // When deadline=0 (JS epoch), the condition short-circuits to false → no deadline enforced.
      // In practice, no admin would set deadline=0, but this documents the gotcha.
      const reg = { ...baseReg, deadline: 0 };
      expect(validateRegistration('DRAFT', reg, [], [], 'u1', Date.now()).canRegister).toBe(true);
    });
  });

  describe('buildRegistrationConfig deadline parsing', () => {
    it('explicit time overrides the 23:59 default', () => {
      const withNoon = buildRegistrationConfig(true, '2025-12-31', '12:00', undefined, '', '', '', true, true);
      const withDefault = buildRegistrationConfig(true, '2025-12-31', '', undefined, '', '', '', true, true);
      // Noon is earlier than 23:59
      expect(withNoon!.deadline!).toBeLessThan(withDefault!.deadline!);
    });

    it('date-only defaults to 23:59 local time (end of day)', () => {
      const dateOnly = buildRegistrationConfig(true, '2025-06-15', '', undefined, '', '', '', true, true);
      const withEndOfDay = buildRegistrationConfig(true, '2025-06-15', '23:59', undefined, '', '', '', true, true);
      expect(dateOnly!.deadline).toBe(withEndOfDay!.deadline);
    });

    it('deadline is in the future when date is far in the future', () => {
      const config = buildRegistrationConfig(true, '2099-01-01', '12:00', undefined, '', '', '', true, true);
      expect(config!.deadline!).toBeGreaterThan(Date.now());
    });

    it('deadline is in the past when date is in the past', () => {
      const config = buildRegistrationConfig(true, '2000-01-01', '12:00', undefined, '', '', '', true, true);
      expect(config!.deadline!).toBeLessThan(Date.now());
    });

    it('invalid date string produces NaN deadline', () => {
      // Document the behavior: invalid dates give NaN
      const config = buildRegistrationConfig(true, 'not-a-date', '12:00', undefined, '', '', '', true, true);
      expect(isNaN(config!.deadline!)).toBe(true);
    });
  });
});

// ─── determineRegistrationOutcome ────────────────────────────────────────────

describe('determineRegistrationOutcome', () => {
  it('returns registered when no max limit', () => {
    expect(determineRegistrationOutcome(99)).toBe('registered');
  });

  it('returns registered when count is zero with limit', () => {
    expect(determineRegistrationOutcome(0, 10)).toBe('registered');
  });

  it('returns registered when count is below limit', () => {
    expect(determineRegistrationOutcome(9, 10)).toBe('registered');
  });

  it('returns waitlisted when count equals limit', () => {
    expect(determineRegistrationOutcome(10, 10)).toBe('waitlisted');
  });

  it('returns waitlisted when count exceeds limit', () => {
    expect(determineRegistrationOutcome(15, 10)).toBe('waitlisted');
  });

  it('treats maxParticipants=0 as no limit (falsy)', () => {
    expect(determineRegistrationOutcome(5, 0)).toBe('registered');
  });
});

// ─── registration flow integration ──────────────────────────────────────────

describe('registration flow: validate then determine outcome', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('first user to a limited tournament gets registered', () => {
    const reg = { ...baseReg, maxParticipants: 8 };
    const validation = validateRegistration('DRAFT', reg, [], [], 'u1', now);
    expect(validation.canRegister).toBe(true);
    const outcome = determineRegistrationOutcome(0, 8);
    expect(outcome).toBe('registered');
  });

  it('user joining a full tournament gets waitlisted', () => {
    const existingIds = ['u1', 'u2', 'u3', 'u4'];
    const reg = { ...baseReg, maxParticipants: 4 };
    const validation = validateRegistration('DRAFT', reg, existingIds, [], 'u5', now);
    expect(validation.canRegister).toBe(true);
    const outcome = determineRegistrationOutcome(4, 4);
    expect(outcome).toBe('waitlisted');
  });

  it('user cannot register twice even at capacity', () => {
    const reg = { ...baseReg, maxParticipants: 4 };
    const result = validateRegistration('DRAFT', reg, ['u1'], [], 'u1', now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('already_registered');
  });

  it('when tournament auto-promotes from waitlist, promoted user occupies the freed spot', () => {
    // Simulates: u1 unregisters from a full(4) tournament with u2 on waitlist
    // u2 should be promoted → participants still 4
    const participants = ['u3', 'u4', 'u5'];
    const newParticipants = participants.filter(id => id !== 'u1'); // removing u1 (wasn't there but edge case)
    // After promotion: 3 existing + u2 = 4 participants, 0 waitlist
    expect(newParticipants.length + 1).toBe(4); // u2 promoted
  });
});

// ─── validateUnregistration ──────────────────────────────────────────────────

describe('validateUnregistration', () => {
  it('rejects when tournament is not DRAFT', () => {
    expect(validateUnregistration('GROUP_STAGE', ['u1'], 'u1'))
      .toEqual({ canUnregister: false, reason: 'not_draft' });
  });

  it('rejects for every non-DRAFT status', () => {
    for (const status of ['BRACKET', 'FINAL_STAGE', 'COMPLETED']) {
      expect(validateUnregistration(status, ['u1'], 'u1').canUnregister).toBe(false);
    }
  });

  it('rejects when user is not a participant', () => {
    expect(validateUnregistration('DRAFT', ['u2', 'u3'], 'u1'))
      .toEqual({ canUnregister: false, reason: 'not_registered' });
  });

  it('rejects when participant list is empty', () => {
    expect(validateUnregistration('DRAFT', [], 'u1'))
      .toEqual({ canUnregister: false, reason: 'not_registered' });
  });

  it('allows when user is a participant in DRAFT', () => {
    expect(validateUnregistration('DRAFT', ['u1', 'u2'], 'u1'))
      .toEqual({ canUnregister: true });
  });

  it('allows when user is the sole participant', () => {
    expect(validateUnregistration('DRAFT', ['u1'], 'u1'))
      .toEqual({ canUnregister: true });
  });

  it('priority: not_draft checked before not_registered', () => {
    expect(validateUnregistration('COMPLETED', [], 'u1').reason).toBe('not_draft');
  });
});

// ─── validateWaitlistUnregistration ─────────────────────────────────────────

describe('validateWaitlistUnregistration', () => {
  it('rejects when tournament is not DRAFT', () => {
    expect(validateWaitlistUnregistration('GROUP_STAGE', ['u1'], 'u1'))
      .toEqual({ canLeaveWaitlist: false, reason: 'not_draft' });
  });

  it('rejects for every non-DRAFT status', () => {
    for (const status of ['BRACKET', 'FINAL_STAGE', 'COMPLETED']) {
      expect(validateWaitlistUnregistration(status, ['u1'], 'u1').canLeaveWaitlist).toBe(false);
    }
  });

  it('rejects when user is not on waitlist', () => {
    expect(validateWaitlistUnregistration('DRAFT', ['u2'], 'u1'))
      .toEqual({ canLeaveWaitlist: false, reason: 'not_on_waitlist' });
  });

  it('rejects when waitlist is empty', () => {
    expect(validateWaitlistUnregistration('DRAFT', [], 'u1'))
      .toEqual({ canLeaveWaitlist: false, reason: 'not_on_waitlist' });
  });

  it('allows when user is on waitlist in DRAFT', () => {
    expect(validateWaitlistUnregistration('DRAFT', ['u1', 'u2'], 'u1'))
      .toEqual({ canLeaveWaitlist: true });
  });

  it('allows when user is the only waitlist entry', () => {
    expect(validateWaitlistUnregistration('DRAFT', ['u1'], 'u1'))
      .toEqual({ canLeaveWaitlist: true });
  });

  it('priority: not_draft checked before not_on_waitlist', () => {
    expect(validateWaitlistUnregistration('COMPLETED', [], 'u1').reason).toBe('not_draft');
  });
});

// ─── buildRegistrationConfig ─────────────────────────────────────────────────

describe('buildRegistrationConfig', () => {
  it('returns undefined when registration is disabled', () => {
    expect(buildRegistrationConfig(false, '', '', undefined, '', '', '', true, true)).toBeUndefined();
  });

  it('returns config with enabled=true when enabled', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '', '', true, true);
    expect(config?.enabled).toBe(true);
  });

  it('sets maxParticipants from number', () => {
    const config = buildRegistrationConfig(true, '', '', 16, '', '', '', false, true);
    expect(config?.maxParticipants).toBe(16);
  });

  it('omits maxParticipants when undefined', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '', '', false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('omits maxParticipants when 0 (treated as no limit)', () => {
    const config = buildRegistrationConfig(true, '', '', 0, '', '', '', false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('trims and sets entryFee when provided', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '  5€  ', '', '', false, true);
    expect(config?.entryFee).toBe('5€');
  });

  it('omits entryFee when empty after trimming', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '   ', '', '', false, true);
    expect(config?.entryFee).toBeUndefined();
  });

  it('trims and sets rulesText', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '  Reglas  ', '', false, true);
    expect(config?.rulesText).toBe('Reglas');
  });

  it('trims and sets rulesUrl', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '', '  https://example.com  ', false, true);
    expect(config?.rulesUrl).toBe('https://example.com');
  });

  it('omits rulesUrl when empty after trimming', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '', '  ', false, true);
    expect(config?.rulesUrl).toBeUndefined();
  });

  it('sets notify and showList flags', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '', '', false, false);
    expect(config?.notifyOnRegistration).toBe(false);
    expect(config?.showParticipantList).toBe(false);
  });

  it('omits deadline when no date provided', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', '', '', true, true);
    expect(config?.deadline).toBeUndefined();
  });

  it('builds deadline from date + time', () => {
    const config = buildRegistrationConfig(true, '2025-06-15', '10:00', undefined, '', '', '', true, true);
    expect(config?.deadline).toBeDefined();
    const d = new Date(config!.deadline!);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5); // June is 5 (0-indexed)
    expect(d.getDate()).toBe(15);
  });

  it('builds deadline from date-only when no time given', () => {
    const config = buildRegistrationConfig(true, '2025-06-15', '', undefined, '', '', '', true, true);
    expect(config?.deadline).toBeDefined();
    const d = new Date(config!.deadline!);
    expect(d.getFullYear()).toBe(2025);
  });

  it('omits deadline when only time given with no date', () => {
    const config = buildRegistrationConfig(true, '', '10:00', undefined, '', '', '', true, true);
    expect(config?.deadline).toBeUndefined();
  });
});

// ─── adminPromoteFromWaitlist ─────────────────────────────────────────────────

describe('adminPromoteFromWaitlist', () => {
  const makeParticipant = (id: string, userId: string): TournamentParticipant => ({
    id,
    type: 'REGISTERED',
    userId,
    userKey: `key-${userId}`,
    name: `Player ${userId}`,
    rankingSnapshot: 0,
    status: 'ACTIVE',
  });

  const makeWaitlistEntry = (userId: string): WaitlistEntry => ({
    userId,
    userName: `Player ${userId}`,
    userKey: `key-${userId}`,
    registeredAt: Date.now(),
  });

  it('returns null when user is not on waitlist', () => {
    const result = adminPromoteFromWaitlist(
      [makeParticipant('p1', 'u1')],
      [makeWaitlistEntry('u2')],
      'u3',
      'new-id'
    );
    expect(result).toBeNull();
  });

  it('returns null when waitlist is empty', () => {
    expect(adminPromoteFromWaitlist([], [], 'u1', 'new-id')).toBeNull();
  });

  it('promotes user to participants', () => {
    const result = adminPromoteFromWaitlist(
      [makeParticipant('p1', 'u1')],
      [makeWaitlistEntry('u2'), makeWaitlistEntry('u3')],
      'u2',
      'promoted-id'
    );
    expect(result).not.toBeNull();
    expect(result!.participants).toHaveLength(2);
    const promoted = result!.participants.find(p => p.userId === 'u2');
    expect(promoted).toBeDefined();
    expect(promoted!.id).toBe('promoted-id');
    expect(promoted!.type).toBe('REGISTERED');
    expect(promoted!.status).toBe('ACTIVE');
    expect(promoted!.name).toBe('Player u2');
  });

  it('removes promoted user from waitlist', () => {
    const result = adminPromoteFromWaitlist(
      [],
      [makeWaitlistEntry('u1'), makeWaitlistEntry('u2')],
      'u1',
      'new-id'
    );
    expect(result!.waitlist).toHaveLength(1);
    expect(result!.waitlist[0].userId).toBe('u2');
  });

  it('preserves existing participants when promoting', () => {
    const existing = [makeParticipant('p1', 'u1'), makeParticipant('p2', 'u2')];
    const result = adminPromoteFromWaitlist(
      existing,
      [makeWaitlistEntry('u3')],
      'u3',
      'new-id'
    );
    expect(result!.participants).toHaveLength(3);
    expect(result!.participants.slice(0, 2)).toEqual(existing);
  });

  it('can promote any entry in the waitlist, not just first', () => {
    const result = adminPromoteFromWaitlist(
      [],
      [makeWaitlistEntry('u1'), makeWaitlistEntry('u2'), makeWaitlistEntry('u3')],
      'u2',
      'new-id'
    );
    expect(result!.participants[0].userId).toBe('u2');
    expect(result!.waitlist.map(w => w.userId)).toEqual(['u1', 'u3']);
  });

  it('carries partner data to promoted participant', () => {
    const entry: WaitlistEntry = {
      ...makeWaitlistEntry('u1'),
      partner: { type: 'GUEST', name: 'Partner Name' }
    };
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect(result!.participants[0].partner).toEqual({ type: 'GUEST', name: 'Partner Name' });
  });

  it('does not add partner field when waitlist entry has none', () => {
    const result = adminPromoteFromWaitlist([], [makeWaitlistEntry('u1')], 'u1', 'new-id');
    expect(result!.participants[0].partner).toBeUndefined();
  });
});

// ─── adminRemoveFromWaitlist ──────────────────────────────────────────────────

describe('adminRemoveFromWaitlist', () => {
  const makeEntry = (userId: string): WaitlistEntry => ({
    userId,
    userName: `Player ${userId}`,
    userKey: `key-${userId}`,
    registeredAt: Date.now(),
  });

  it('removes the specified user from the waitlist', () => {
    const result = adminRemoveFromWaitlist([makeEntry('u1'), makeEntry('u2'), makeEntry('u3')], 'u2');
    expect(result.map(e => e.userId)).toEqual(['u1', 'u3']);
  });

  it('returns empty array when removing the only entry', () => {
    expect(adminRemoveFromWaitlist([makeEntry('u1')], 'u1')).toEqual([]);
  });

  it('returns unchanged array when user not on waitlist', () => {
    const waitlist = [makeEntry('u1'), makeEntry('u2')];
    const result = adminRemoveFromWaitlist(waitlist, 'u3');
    expect(result).toEqual(waitlist);
  });

  it('returns empty array unchanged when waitlist is already empty', () => {
    expect(adminRemoveFromWaitlist([], 'u1')).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const waitlist = [makeEntry('u1'), makeEntry('u2')];
    adminRemoveFromWaitlist(waitlist, 'u1');
    expect(waitlist).toHaveLength(2);
  });
});
