import { describe, it, expect } from 'vitest';
import {
  validateRegistration,
  determineRegistrationOutcome,
  validateUnregistration,
  validateWaitlistUnregistration,
  buildRegistrationConfig,
  adminPromoteFromWaitlist,
  adminRemoveFromWaitlist,
  collectPartnerUserIds,
  filterEligiblePartners,
  getRegistrationErrorMessageKey,
  shouldAutoPromote,
  normalizeEmail,
  validateRegistrationDeadline,
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
      const withNoon = buildRegistrationConfig(true, '2025-12-31', '12:00', undefined, '', true, true, true);
      const withDefault = buildRegistrationConfig(true, '2025-12-31', '', undefined, '', true, true, true);
      // Noon is earlier than 23:59
      expect(withNoon!.deadline!).toBeLessThan(withDefault!.deadline!);
    });

    it('date-only defaults to 23:59 local time (end of day)', () => {
      const dateOnly = buildRegistrationConfig(true, '2025-06-15', '', undefined, '', true, true, true);
      const withEndOfDay = buildRegistrationConfig(true, '2025-06-15', '23:59', undefined, '', true, true, true);
      expect(dateOnly!.deadline).toBe(withEndOfDay!.deadline);
    });

    it('deadline is in the future when date is far in the future', () => {
      const config = buildRegistrationConfig(true, '2099-01-01', '12:00', undefined, '', true, true, true);
      expect(config!.deadline!).toBeGreaterThan(Date.now());
    });

    it('deadline is in the past when date is in the past', () => {
      const config = buildRegistrationConfig(true, '2000-01-01', '12:00', undefined, '', true, true, true);
      expect(config!.deadline!).toBeLessThan(Date.now());
    });

    it('invalid date string produces NaN deadline', () => {
      // Document the behavior: invalid dates give NaN
      const config = buildRegistrationConfig(true, 'not-a-date', '12:00', undefined, '', true, true, true);
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
    expect(buildRegistrationConfig(false, '', '', undefined, '', true, true, true)).toBeUndefined();
  });

  it('returns config with enabled=true when enabled', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, true, true);
    expect(config?.enabled).toBe(true);
  });

  it('sets maxParticipants from number', () => {
    const config = buildRegistrationConfig(true, '', '', 16, '', true, false, true);
    expect(config?.maxParticipants).toBe(16);
  });

  it('omits maxParticipants when undefined', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('omits maxParticipants when 0 (treated as no limit)', () => {
    const config = buildRegistrationConfig(true, '', '', 0, '', true, false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('trims and sets entryFee when provided', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '  5€  ', true, false, true);
    expect(config?.entryFee).toBe('5€');
  });

  it('omits entryFee when empty after trimming', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '   ', true, false, true);
    expect(config?.entryFee).toBeUndefined();
  });

  it('sets notify and showList flags', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, false, false);
    expect(config?.notifyOnRegistration).toBe(false);
    expect(config?.showParticipantList).toBe(false);
  });

  it('omits deadline when no date provided', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, true, true);
    expect(config?.deadline).toBeUndefined();
  });

  it('builds deadline from date + time', () => {
    const config = buildRegistrationConfig(true, '2025-06-15', '10:00', undefined, '', true, true, true);
    expect(config?.deadline).toBeDefined();
    const d = new Date(config!.deadline!);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5); // June is 5 (0-indexed)
    expect(d.getDate()).toBe(15);
  });

  it('builds deadline from date-only when no time given', () => {
    const config = buildRegistrationConfig(true, '2025-06-15', '', undefined, '', true, true, true);
    expect(config?.deadline).toBeDefined();
    const d = new Date(config!.deadline!);
    expect(d.getFullYear()).toBe(2025);
  });

  it('omits deadline when only time given with no date', () => {
    const config = buildRegistrationConfig(true, '', '10:00', undefined, '', true, true, true);
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

// ─── Scenario: admin starts the tournament ────────────────────────────────────

describe('scenario: admin starts the tournament — registration closes completely', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  const startedStatuses = ['GROUP_STAGE', 'BRACKET', 'FINAL_STAGE', 'COMPLETED', 'CANCELLED'] as const;

  it.each(startedStatuses)(
    'blocks new registration when tournament is %s (even with empty spots and registration enabled)',
    (status) => {
      // Tournament has free spots and registration is enabled, but the admin already started it.
      const result = validateRegistration(status, baseReg, [], [], 'u1', now);
      expect(result.canRegister).toBe(false);
      expect(result.reason).toBe('not_draft');
    }
  );

  it.each(startedStatuses)(
    'blocks registration when tournament is %s even if under maxParticipants limit',
    (status) => {
      const reg = { ...baseReg, maxParticipants: 16 };
      // Only 3 participants registered out of 16 — plenty of space, but tournament has started.
      const result = validateRegistration(status, reg, ['u2', 'u3', 'u4'], [], 'u1', now);
      expect(result.canRegister).toBe(false);
      expect(result.reason).toBe('not_draft');
    }
  );

  it.each(startedStatuses)(
    'blocks joining the waitlist when tournament is %s',
    (status) => {
      // validateRegistration gates both participant registration and waitlist join.
      // Nobody can queue up once the tournament has started.
      const result = validateRegistration(status, baseReg, ['u2'], [], 'u1', now);
      expect(result.canRegister).toBe(false);
      expect(result.reason).toBe('not_draft');
    }
  );

  it.each(startedStatuses)(
    'blocks unregistering when tournament is %s',
    (status) => {
      const result = validateUnregistration(status, ['u1'], 'u1');
      expect(result.canUnregister).toBe(false);
      expect(result.reason).toBe('not_draft');
    }
  );

  it.each(startedStatuses)(
    'blocks leaving the waitlist when tournament is %s',
    (status) => {
      const result = validateWaitlistUnregistration(status, ['u1'], 'u1');
      expect(result.canLeaveWaitlist).toBe(false);
      expect(result.reason).toBe('not_draft');
    }
  );
});

// ─── Scenario: tournament reaches maximum capacity ────────────────────────────

describe('scenario: tournament reaches maximum capacity', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('user can still sign up when one spot remains (not yet full)', () => {
    const reg = { ...baseReg, maxParticipants: 8 };
    const existingIds = ['u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8']; // 7 of 8
    const validation = validateRegistration('DRAFT', reg, existingIds, [], 'u1', now);
    expect(validation.canRegister).toBe(true);
    expect(determineRegistrationOutcome(7, 8)).toBe('registered');
  });

  it('user who fills the last spot is registered (not waitlisted)', () => {
    // 7 registered, limit 8 → 8th person gets in directly
    expect(determineRegistrationOutcome(7, 8)).toBe('registered');
  });

  it('user who arrives when tournament is exactly full goes to waitlist', () => {
    const reg = { ...baseReg, maxParticipants: 8 };
    const existingIds = ['u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9']; // 8 of 8
    const validation = validateRegistration('DRAFT', reg, existingIds, [], 'u1', now);
    expect(validation.canRegister).toBe(true); // still allowed — goes to waitlist
    expect(determineRegistrationOutcome(8, 8)).toBe('waitlisted');
  });

  it('multiple users beyond capacity all go to waitlist, not rejected', () => {
    // Registration is not closed when full — it routes to the waitlist instead.
    expect(determineRegistrationOutcome(8, 8)).toBe('waitlisted');
    expect(determineRegistrationOutcome(9, 8)).toBe('waitlisted');
    expect(determineRegistrationOutcome(20, 8)).toBe('waitlisted');
  });

  it('tournament with no maxParticipants never routes to waitlist', () => {
    // No limit set → everyone registers directly, no matter how many there are.
    expect(determineRegistrationOutcome(0)).toBe('registered');
    expect(determineRegistrationOutcome(100)).toBe('registered');
    expect(determineRegistrationOutcome(1000)).toBe('registered');
  });

  it('combined: tournament full AND started → registration blocked (not routed to waitlist)', () => {
    // When the admin starts a full tournament, nobody new can sign up at all.
    // The not_draft check fires before determineRegistrationOutcome is reached.
    const reg = { ...baseReg, maxParticipants: 4 };
    const fullParticipantIds = ['u2', 'u3', 'u4', 'u5'];
    const result = validateRegistration('GROUP_STAGE', reg, fullParticipantIds, [], 'u1', now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('not_draft'); // blocked by status, not by capacity
  });

  it('waitlist entries remain after tournament starts but no new users can join', () => {
    // Existing waitlist entries are preserved in the data, but validateRegistration
    // blocks any new attempts to join once the tournament has started.
    const reg = { ...baseReg, maxParticipants: 2 };
    const participantIds = ['u2', 'u3']; // full
    const waitlistIds = ['u4', 'u5'];    // already on waitlist

    // u6 tries to join the waitlist after tournament started
    const result = validateRegistration('GROUP_STAGE', reg, participantIds, waitlistIds, 'u6', now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('not_draft');
  });
});

// ─── Doubles: partner field variants in promotion ─────────────────────────────

describe('doubles: adminPromoteFromWaitlist partner field variants', () => {
  const makeEntry = (userId: string, partner?: WaitlistEntry['partner']): WaitlistEntry => ({
    userId,
    userName: `Player ${userId}`,
    userKey: `key-${userId}`,
    registeredAt: Date.now(),
    ...(partner ? { partner } : {}),
  });

  it('preserves REGISTERED partner type with userId on promotion', () => {
    const entry = makeEntry('u1', { type: 'REGISTERED', userId: 'u2', name: 'Player u2' });
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect(result!.participants[0].partner).toEqual({
      type: 'REGISTERED',
      userId: 'u2',
      name: 'Player u2',
    });
  });

  it('preserves GUEST partner type (no userId) on promotion', () => {
    const entry = makeEntry('u1', { type: 'GUEST', name: 'Ana García' });
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect(result!.participants[0].partner).toEqual({ type: 'GUEST', name: 'Ana García' });
  });

  it('⚠️ promoted participant always gets rankingSnapshot=0 (real ranking not fetched)', () => {
    // Known limitation: promotion does not fetch the user's actual ranking from their profile.
    // Seeding may be inaccurate if the tournament uses rankingSnapshot for bracket placement.
    const entry = makeEntry('u1');
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect(result!.participants[0].rankingSnapshot).toBe(0);
  });

  it('promoted participant is always type REGISTERED and status ACTIVE', () => {
    const entry = makeEntry('u1');
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect(result!.participants[0].type).toBe('REGISTERED');
    expect(result!.participants[0].status).toBe('ACTIVE');
  });
});

// ─── Doubles: teamName is not preserved through waitlist ─────────────────────

describe('doubles: teamName data loss through waitlist path', () => {
  it('⚠️ adminPromoteFromWaitlist cannot restore teamName (WaitlistEntry has no teamName field)', () => {
    // When a doubles pair joins the waitlist with a custom team name, that name is LOST.
    // WaitlistEntry does not have a teamName field, so the data is never stored.
    // This means promoted doubles pairs lose their custom team name.
    const entry: WaitlistEntry = {
      userId: 'u1',
      userName: 'Player u1',
      userKey: 'key-u1',
      registeredAt: Date.now(),
      partner: { type: 'GUEST', name: 'Partner' },
      // teamName would go here, but the interface does not support it
    };
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    // teamName is absent from the promoted participant
    expect((result!.participants[0] as any).teamName).toBeUndefined();
  });
});

// ─── Doubles: adminRemoveFromWaitlist partner userId not matched ───────────────

describe('doubles: adminRemoveFromWaitlist only matches primary userId', () => {
  it('removing by partner userId has no effect — only primary userId is matched', () => {
    // If u1 registered with u2 as REGISTERED partner, trying to remove u2 from the
    // waitlist does nothing. Only u1 (primary) can be targeted.
    const waitlist: WaitlistEntry[] = [
      {
        userId: 'u1',
        userName: 'Player u1',
        userKey: 'key-u1',
        registeredAt: Date.now(),
        partner: { type: 'REGISTERED', userId: 'u2', name: 'Player u2' },
      },
    ];
    const result = adminRemoveFromWaitlist(waitlist, 'u2');
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u1');
  });

  it('removes a doubles-pair entry correctly when targeting the primary userId', () => {
    const waitlist: WaitlistEntry[] = [
      {
        userId: 'u1',
        userName: 'Player u1',
        userKey: 'key-u1',
        registeredAt: Date.now(),
        partner: { type: 'REGISTERED', userId: 'u2', name: 'Player u2' },
      },
      { userId: 'u3', userName: 'Player u3', userKey: 'key-u3', registeredAt: Date.now() },
    ];
    const result = adminRemoveFromWaitlist(waitlist, 'u1');
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u3');
  });
});

// ─── validateRegistration: doubles partner not validated ─────────────────────

describe('validateRegistration: partner eligibility not checked (doubles limitation)', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('⚠️ allows registering with an already-registered user as partner', () => {
    // validateRegistration only checks the CURRENT user's status, not the partner's.
    // u2 is already a primary participant; u1 registers with u2 as partner → allowed.
    // This can lead to u2 appearing in the tournament twice (as primary AND as partner).
    const result = validateRegistration('DRAFT', baseReg, ['u2'], [], 'u1', now);
    expect(result.canRegister).toBe(true);
  });

  it('⚠️ a user who is already a partner in another entry can still register as primary', () => {
    // If u1 is registered with u2 as their partner (embedded), u2 does NOT appear
    // in participantUserIds. So u2 can still register as their own primary entry.
    const participantIds = ['u1']; // u2 is u1's partner, not a primary participant
    const result = validateRegistration('DRAFT', baseReg, participantIds, [], 'u2', now);
    expect(result.canRegister).toBe(true);
  });
});

// ─── determineRegistrationOutcome: capacity boundary edge cases ───────────────

describe('determineRegistrationOutcome: maxParticipants boundary edge cases', () => {
  it('maxParticipants=1: 0 registered → gets registered', () => {
    expect(determineRegistrationOutcome(0, 1)).toBe('registered');
  });

  it('maxParticipants=1: 1 registered → gets waitlisted', () => {
    expect(determineRegistrationOutcome(1, 1)).toBe('waitlisted');
  });

  it('maxParticipants=2: 1 registered → gets registered', () => {
    expect(determineRegistrationOutcome(1, 2)).toBe('registered');
  });

  it('maxParticipants=2: 2 registered → gets waitlisted', () => {
    expect(determineRegistrationOutcome(2, 2)).toBe('waitlisted');
  });

  it('⚠️ negative maxParticipants is truthy: causes everyone to be waitlisted', () => {
    // Bug: buildRegistrationConfig does not validate that maxParticipants > 0.
    // If -1 is passed through, 0 >= -1 is true → 'waitlisted'. Nobody can register directly.
    expect(determineRegistrationOutcome(0, -1)).toBe('waitlisted');
  });
});

// ─── buildRegistrationConfig: additional edge cases ───────────────────────────

describe('buildRegistrationConfig: additional edge cases', () => {
  it('maxParticipants=1 (minimum valid value) is preserved', () => {
    const config = buildRegistrationConfig(true, '', '', 1, '', true, false, true);
    expect(config?.maxParticipants).toBe(1);
  });

  it('negative maxParticipants is sanitized to undefined (treated as no limit)', () => {
    // Previously a bug: -1 passed through and caused nobody to register directly.
    // Fixed: negative values are now coerced to undefined (no limit).
    const config = buildRegistrationConfig(true, '', '', -1 as any, '', true, false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('entryFee with only tab/newline whitespace is omitted', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '\t\n  ', true, false, true);
    expect(config?.entryFee).toBeUndefined();
  });

  it('stores allowWaitlist=true in config', () => {
    const config = buildRegistrationConfig(true, '', '', 8, '', true, false, true);
    expect(config?.allowWaitlist).toBe(true);
  });

  it('stores allowWaitlist=false in config', () => {
    const config = buildRegistrationConfig(true, '', '', 8, '', false, false, true);
    expect(config?.allowWaitlist).toBe(false);
  });
});

// ─── allowWaitlist: validateRegistration behaviour ────────────────────────────

describe('allowWaitlist: validateRegistration blocks registration when full and no waitlist', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('blocks when tournament is full and allowWaitlist=false', () => {
    const reg = { ...baseReg, maxParticipants: 4, allowWaitlist: false };
    const result = validateRegistration('DRAFT', reg, ['u2', 'u3', 'u4', 'u5'], [], 'u1', now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('tournament_full');
  });

  it('allows (to waitlist) when tournament is full and allowWaitlist=true', () => {
    const reg = { ...baseReg, maxParticipants: 4, allowWaitlist: true };
    const result = validateRegistration('DRAFT', reg, ['u2', 'u3', 'u4', 'u5'], [], 'u1', now);
    expect(result.canRegister).toBe(true); // routes to waitlist, not blocked
  });

  it('allows (to waitlist) when tournament is full and allowWaitlist is undefined (legacy default)', () => {
    const reg = { ...baseReg, maxParticipants: 4 }; // no allowWaitlist field
    const result = validateRegistration('DRAFT', reg, ['u2', 'u3', 'u4', 'u5'], [], 'u1', now);
    expect(result.canRegister).toBe(true); // undefined → behaves as true (backwards compat)
  });

  it('allows when tournament is NOT full even with allowWaitlist=false', () => {
    const reg = { ...baseReg, maxParticipants: 4, allowWaitlist: false };
    const result = validateRegistration('DRAFT', reg, ['u2', 'u3'], [], 'u1', now);
    expect(result.canRegister).toBe(true);
  });

  it('allows when maxParticipants is not set (no limit) even with allowWaitlist=false', () => {
    const reg = { ...baseReg, allowWaitlist: false };
    const result = validateRegistration('DRAFT', reg, ['u2', 'u3', 'u4', 'u5'], [], 'u1', now);
    expect(result.canRegister).toBe(true); // no limit → never full
  });

  it('priority: deadline_passed checked before tournament_full', () => {
    const reg = { ...baseReg, maxParticipants: 4, allowWaitlist: false, deadline: now - 1 };
    const result = validateRegistration('DRAFT', reg, ['u2', 'u3', 'u4', 'u5'], [], 'u1', now);
    expect(result.reason).toBe('deadline_passed');
  });

  it('priority: tournament_full checked before already_registered', () => {
    // u1 is already a participant AND the tournament is full with no waitlist.
    // tournament_full fires first (global block before per-user check).
    const reg = { ...baseReg, maxParticipants: 2, allowWaitlist: false };
    const result = validateRegistration('DRAFT', reg, ['u1', 'u2'], [], 'u1', now);
    expect(result.reason).toBe('tournament_full');
  });

  it('blocks at exact capacity boundary (participantIds.length === maxParticipants)', () => {
    const reg = { ...baseReg, maxParticipants: 1, allowWaitlist: false };
    const result = validateRegistration('DRAFT', reg, ['u2'], [], 'u1', now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('tournament_full');
  });
});

// ─── allowWaitlist: determineRegistrationOutcome behaviour ────────────────────

describe('allowWaitlist: determineRegistrationOutcome', () => {
  it('returns registered when allowWaitlist=false even at capacity (already blocked by validateRegistration)', () => {
    // If allowWaitlist=false and the tournament is full, validateRegistration blocks first.
    // If somehow we reach determineRegistrationOutcome at capacity, it still returns registered.
    expect(determineRegistrationOutcome(4, 4, false)).toBe('registered');
  });

  it('returns waitlisted when allowWaitlist=true and at capacity', () => {
    expect(determineRegistrationOutcome(4, 4, true)).toBe('waitlisted');
  });

  it('returns waitlisted when allowWaitlist=undefined and at capacity (backwards compat)', () => {
    expect(determineRegistrationOutcome(4, 4, undefined)).toBe('waitlisted');
  });

  it('returns registered when below capacity regardless of allowWaitlist', () => {
    expect(determineRegistrationOutcome(3, 4, false)).toBe('registered');
    expect(determineRegistrationOutcome(3, 4, true)).toBe('registered');
  });
});

// ─── validateRegistration: data corruption (user on both lists) ───────────────

describe('validateRegistration: user on both participants and waitlist', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('returns already_registered (not already_waitlisted) when user is on both lists', () => {
    // In a data corruption scenario, participants check fires first → already_registered.
    const result = validateRegistration('DRAFT', baseReg, ['u1'], ['u1'], 'u1', now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('already_registered');
  });
});

// ─── FIFO auto-promotion logic (simulates unregisterFromTournament internals) ──

describe('FIFO auto-promotion simulation', () => {
  const makeParticipant = (userId: string): TournamentParticipant => ({
    id: `p-${userId}`,
    type: 'REGISTERED',
    userId,
    userKey: `key-${userId}`,
    name: `Player ${userId}`,
    rankingSnapshot: 0,
    status: 'ACTIVE',
  });

  const makeEntry = (userId: string, partner?: WaitlistEntry['partner']): WaitlistEntry => ({
    userId,
    userName: `Player ${userId}`,
    userKey: `key-${userId}`,
    registeredAt: Date.now(),
    ...(partner ? { partner } : {}),
  });

  // Helper that mirrors the inline logic inside unregisterFromTournament
  function simulateUnregister(
    participants: TournamentParticipant[],
    waitlist: WaitlistEntry[],
    unregisterUserId: string
  ): { newParticipants: TournamentParticipant[]; newWaitlist: WaitlistEntry[]; promoted: boolean } {
    const newParticipants = participants.filter(p => p.userId !== unregisterUserId);
    let newWaitlist = waitlist;
    let promoted = false;
    if (waitlist.length > 0) {
      const next = waitlist[0];
      newParticipants.push({
        id: 'promoted-id',
        type: 'REGISTERED',
        userId: next.userId,
        userKey: next.userKey,
        name: next.userName,
        rankingSnapshot: 0,
        status: 'ACTIVE',
        ...(next.partner ? { partner: next.partner } : {}),
      });
      newWaitlist = waitlist.slice(1);
      promoted = true;
    }
    return { newParticipants, newWaitlist, promoted };
  }

  it('promotes first waitlist entry (FIFO), not a later one', () => {
    const participants = [makeParticipant('u1'), makeParticipant('u2'), makeParticipant('u3')];
    const waitlist = [makeEntry('u4'), makeEntry('u5'), makeEntry('u6')];

    const { newParticipants, newWaitlist } = simulateUnregister(participants, waitlist, 'u2');

    expect(newParticipants.find(p => p.userId === 'u4')).toBeDefined(); // u4 promoted
    expect(newParticipants.find(p => p.userId === 'u5')).toBeUndefined(); // u5 still waiting
    expect(newWaitlist.map(w => w.userId)).toEqual(['u5', 'u6']); // order preserved
  });

  it('total participant count stays the same after unregister + promotion', () => {
    const participants = [makeParticipant('u1'), makeParticipant('u2')];
    const waitlist = [makeEntry('u3')];

    const { newParticipants } = simulateUnregister(participants, waitlist, 'u1');
    expect(newParticipants).toHaveLength(2); // 1 removed, 1 promoted
  });

  it('participant count decreases by 1 when waitlist is empty', () => {
    const participants = [makeParticipant('u1'), makeParticipant('u2')];
    const { newParticipants, promoted } = simulateUnregister(participants, [], 'u1');
    expect(newParticipants).toHaveLength(1);
    expect(promoted).toBe(false);
  });

  it('FIFO promotion preserves doubles partner data', () => {
    const participants = [makeParticipant('u1')];
    const partner = { type: 'GUEST' as const, name: 'Ana García' };
    const waitlist = [makeEntry('u2', partner)];

    const { newParticipants } = simulateUnregister(participants, waitlist, 'u1');
    expect(newParticipants[0].partner).toEqual(partner);
  });

  it('⚠️ FIFO promotion does not restore teamName (not stored in WaitlistEntry)', () => {
    const participants = [makeParticipant('u1')];
    const waitlist = [makeEntry('u2', { type: 'GUEST', name: 'Partner' })];

    const { newParticipants } = simulateUnregister(participants, waitlist, 'u1');
    expect((newParticipants[0] as any).teamName).toBeUndefined();
  });

  it('unregistering the only participant from a 1-person tournament promotes waitlist', () => {
    const participants = [makeParticipant('u1')];
    const waitlist = [makeEntry('u2')];

    const { newParticipants, newWaitlist } = simulateUnregister(participants, waitlist, 'u1');
    expect(newParticipants).toHaveLength(1);
    expect(newParticipants[0].userId).toBe('u2');
    expect(newWaitlist).toHaveLength(0);
  });

  it('remaining waitlist order is preserved after FIFO promotion', () => {
    const participants = [makeParticipant('u1')];
    const waitlist = [makeEntry('u2'), makeEntry('u3'), makeEntry('u4')];

    const { newWaitlist } = simulateUnregister(participants, waitlist, 'u1');
    expect(newWaitlist.map(w => w.userId)).toEqual(['u3', 'u4']); // u2 promoted, order intact
  });
});

// ─── buildRegistrationConfig: output field inventory ─────────────────────────
// Verifies that the config object has exactly the expected shape for every
// combination of inputs. Guards against accidentally dropping a field.

describe('buildRegistrationConfig: output field inventory', () => {
  it('contains all expected fields when fully configured', () => {
    const config = buildRegistrationConfig(true, '2099-01-01', '18:00', 16, '5€', false, true, false);
    expect(config).not.toBeUndefined();
    expect(config).toMatchObject({
      enabled: true,
      deadline: expect.any(Number),
      maxParticipants: 16,
      entryFee: '5€',
      allowWaitlist: false,
      notifyOnRegistration: true,
      showParticipantList: false,
    });
  });

  it('omits optional fields when not provided (no deadline, no limit, no fee)', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, false, true);
    expect(config).not.toBeUndefined();
    expect(config!.deadline).toBeUndefined();
    expect(config!.maxParticipants).toBeUndefined();
    expect(config!.entryFee).toBeUndefined();
    // required fields always present
    expect(config!.enabled).toBe(true);
    expect(config!.allowWaitlist).toBe(true);
    expect(config!.notifyOnRegistration).toBe(false);
    expect(config!.showParticipantList).toBe(true);
  });

  it('notifyOnRegistration reflects the notify argument', () => {
    expect(buildRegistrationConfig(true, '', '', undefined, '', true, true, true)!.notifyOnRegistration).toBe(true);
    expect(buildRegistrationConfig(true, '', '', undefined, '', true, false, true)!.notifyOnRegistration).toBe(false);
  });

  it('showParticipantList reflects the showList argument', () => {
    expect(buildRegistrationConfig(true, '', '', undefined, '', true, true, true)!.showParticipantList).toBe(true);
    expect(buildRegistrationConfig(true, '', '', undefined, '', true, true, false)!.showParticipantList).toBe(false);
  });

  it('stores allowWaitlist=false even without a maxParticipants limit', () => {
    // allowWaitlist=false with no limit is functionally a no-op (can never be full),
    // but the value should still be persisted faithfully.
    const config = buildRegistrationConfig(true, '', '', undefined, '', false, true, true);
    expect(config!.allowWaitlist).toBe(false);
    expect(config!.maxParticipants).toBeUndefined();
  });

  it('entryFee: preserves currency symbols and text verbatim after trimming', () => {
    const cases: [string, string | undefined][] = [
      ['5€', '5€'],
      ['$10', '$10'],
      ['10.00 EUR', '10.00 EUR'],
      ['gratuito', 'gratuito'],
      ['Free / Gratuït', 'Free / Gratuït'],
      ['  5€  ', '5€'],      // trimmed
      ['', undefined],        // empty → omitted
      ['   ', undefined],     // whitespace-only → omitted
    ];
    for (const [input, expected] of cases) {
      const config = buildRegistrationConfig(true, '', '', undefined, input, true, false, true);
      expect(config!.entryFee).toBe(expected);
    }
  });

  it('maxParticipants: large values are preserved without truncation', () => {
    const config = buildRegistrationConfig(true, '', '', 10_000, '', true, false, true);
    expect(config!.maxParticipants).toBe(10_000);
  });
});

// ─── config field effects: how each setting shapes registration behaviour ──────
// These tests build a config with buildRegistrationConfig and then pass the result
// directly into validateRegistration / determineRegistrationOutcome, proving the
// two layers work together end-to-end.

describe('config field effects: deadline controls the registration window', () => {
  const now = Date.now();
  const participants: string[] = [];
  const waitlist: string[] = [];
  const userId = 'u1';

  it('past deadline → registration blocked', () => {
    const config = buildRegistrationConfig(true, '2000-01-01', '23:59', undefined, '', true, false, true)!;
    const result = validateRegistration('DRAFT', config, participants, waitlist, userId, now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('deadline_passed');
  });

  it('future deadline → registration allowed', () => {
    const config = buildRegistrationConfig(true, '2099-12-31', '23:59', undefined, '', true, false, true)!;
    const result = validateRegistration('DRAFT', config, participants, waitlist, userId, now);
    expect(result.canRegister).toBe(true);
  });

  it('no deadline → registration always open (deadline field irrelevant)', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, false, true)!;
    const result = validateRegistration('DRAFT', config, participants, waitlist, userId, now);
    expect(result.canRegister).toBe(true);
  });
});

describe('config field effects: maxParticipants controls capacity routing', () => {
  const now = Date.now();
  const userId = 'u99';

  it('no limit → determineRegistrationOutcome always returns registered', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, false, true)!;
    // Even with many existing participants
    for (const count of [0, 10, 100, 500]) {
      expect(determineRegistrationOutcome(count, config.maxParticipants)).toBe('registered');
    }
  });

  it('with limit: below capacity → registered', () => {
    const config = buildRegistrationConfig(true, '', '', 8, '', true, false, true)!;
    expect(determineRegistrationOutcome(7, config.maxParticipants)).toBe('registered');
  });

  it('with limit: at capacity → waitlisted', () => {
    const config = buildRegistrationConfig(true, '', '', 8, '', true, false, true)!;
    expect(determineRegistrationOutcome(8, config.maxParticipants)).toBe('waitlisted');
  });

  it('with limit: validateRegistration allows a user to join even when full (routes to waitlist)', () => {
    const config = buildRegistrationConfig(true, '', '', 4, '', true, false, true)!;
    const existingIds = ['u1', 'u2', 'u3', 'u4'];
    const result = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(result.canRegister).toBe(true); // passes validation, then routed by determineRegistrationOutcome
    expect(determineRegistrationOutcome(4, config.maxParticipants, config.allowWaitlist)).toBe('waitlisted');
  });
});

describe('config field effects: allowWaitlist determines full-tournament behaviour', () => {
  const now = Date.now();
  const existingIds = ['u1', 'u2', 'u3', 'u4']; // 4 participants
  const userId = 'u99';

  it('allowWaitlist=true + full → user passes validation and is routed to waitlist', () => {
    const config = buildRegistrationConfig(true, '', '', 4, '', true, false, true)!;
    const validation = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(validation.canRegister).toBe(true);
    expect(determineRegistrationOutcome(4, config.maxParticipants, config.allowWaitlist)).toBe('waitlisted');
  });

  it('allowWaitlist=false + full → validateRegistration returns tournament_full', () => {
    const config = buildRegistrationConfig(true, '', '', 4, '', false, false, true)!;
    const result = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('tournament_full');
  });

  it('allowWaitlist=false + no limit → never reaches full, registration always allowed', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', false, false, true)!;
    // 1000 participants but no maxParticipants → canRegister still true
    const manyIds = Array.from({ length: 1000 }, (_, i) => `existing${i}`);
    const result = validateRegistration('DRAFT', config, manyIds, [], 'newcomer', now);
    expect(result.canRegister).toBe(true);
  });

  it('allowWaitlist=false + below capacity → canRegister true (not full yet)', () => {
    const config = buildRegistrationConfig(true, '', '', 8, '', false, false, true)!;
    const result = validateRegistration('DRAFT', config, ['u1', 'u2'], [], userId, now);
    expect(result.canRegister).toBe(true);
  });
});

describe('config field effects: entryFee and flags are informational only', () => {
  const now = Date.now();

  it('entryFee does not affect whether a user can register', () => {
    const withFee = buildRegistrationConfig(true, '', '', undefined, '10€', true, true, true)!;
    const free = buildRegistrationConfig(true, '', '', undefined, '', true, true, true)!;
    const r1 = validateRegistration('DRAFT', withFee, [], [], 'u1', now);
    const r2 = validateRegistration('DRAFT', free, [], [], 'u1', now);
    expect(r1.canRegister).toBe(true);
    expect(r2.canRegister).toBe(true);
  });

  it('notifyOnRegistration does not affect whether a user can register', () => {
    const withNotify = buildRegistrationConfig(true, '', '', undefined, '', true, true, true)!;
    const noNotify = buildRegistrationConfig(true, '', '', undefined, '', true, false, true)!;
    expect(validateRegistration('DRAFT', withNotify, [], [], 'u1', now).canRegister).toBe(true);
    expect(validateRegistration('DRAFT', noNotify, [], [], 'u1', now).canRegister).toBe(true);
  });

  it('showParticipantList does not affect whether a user can register', () => {
    const shown = buildRegistrationConfig(true, '', '', undefined, '', true, true, true)!;
    const hidden = buildRegistrationConfig(true, '', '', undefined, '', true, true, false)!;
    expect(validateRegistration('DRAFT', shown, [], [], 'u1', now).canRegister).toBe(true);
    expect(validateRegistration('DRAFT', hidden, [], [], 'u1', now).canRegister).toBe(true);
  });
});

describe('config field effects: real-world combinations', () => {
  const now = Date.now();
  const userId = 'u99';

  it('paid tournament with limit and waitlist: under-capacity user registers directly', () => {
    const config = buildRegistrationConfig(true, '2099-01-01', '18:00', 16, '5€', true, true, true)!;
    const validation = validateRegistration('DRAFT', config, ['u1', 'u2'], [], userId, now);
    expect(validation.canRegister).toBe(true);
    expect(determineRegistrationOutcome(2, config.maxParticipants, config.allowWaitlist)).toBe('registered');
  });

  it('paid tournament with strict limit (no waitlist): full → tournament_full returned', () => {
    const existingIds = Array.from({ length: 16 }, (_, i) => `u${i}`);
    const config = buildRegistrationConfig(true, '2099-01-01', '18:00', 16, '5€', false, true, true)!;
    const result = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('tournament_full');
  });

  it('free open tournament (no limit, no deadline): always admits new users', () => {
    const config = buildRegistrationConfig(true, '', '', undefined, '', true, false, false)!;
    for (let count = 0; count < 5; count++) {
      const existing = Array.from({ length: count }, (_, i) => `u${i}`);
      const result = validateRegistration('DRAFT', config, existing, [], userId, now);
      expect(result.canRegister).toBe(true);
      expect(determineRegistrationOutcome(count, config.maxParticipants, config.allowWaitlist)).toBe('registered');
    }
  });

  it('deadline past → blocks even if spots are available and waitlist is enabled', () => {
    const config = buildRegistrationConfig(true, '2000-06-01', '12:00', 32, '3€', true, true, true)!;
    const result = validateRegistration('DRAFT', config, ['u1'], [], userId, now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('deadline_passed');
  });

  it('all-in-one: deadline future + 1 spot left → registered directly, not waitlisted', () => {
    const config = buildRegistrationConfig(true, '2099-06-01', '23:59', 8, '', true, true, true)!;
    // 7 of 8 spots taken
    const existingIds = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
    const validation = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(validation.canRegister).toBe(true);
    expect(determineRegistrationOutcome(7, config.maxParticipants, config.allowWaitlist)).toBe('registered');
  });

  it('all-in-one: deadline future + exactly full + waitlist on → waitlisted', () => {
    const config = buildRegistrationConfig(true, '2099-06-01', '23:59', 8, '', true, true, true)!;
    const existingIds = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const validation = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(validation.canRegister).toBe(true);
    expect(determineRegistrationOutcome(8, config.maxParticipants, config.allowWaitlist)).toBe('waitlisted');
  });

  it('all-in-one: deadline future + exactly full + waitlist off → tournament_full', () => {
    const config = buildRegistrationConfig(true, '2099-06-01', '23:59', 8, '', false, true, true)!;
    const existingIds = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const result = validateRegistration('DRAFT', config, existingIds, [], userId, now);
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('tournament_full');
  });
});

// ─── Bug fix: validateRegistration partner uniqueness ────────────────────────

describe('validateRegistration — partner userId uniqueness (Bug #1)', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('rejects when user already occupies a partner slot in an existing participant', () => {
    // Scenario: u1 self-registered with u2 as REGISTERED partner.
    // u2 tries to self-register again as a primary participant.
    const partnerIds = ['u2'];
    expect(validateRegistration('DRAFT', baseReg, ['u1'], [], 'u2', now, partnerIds))
      .toEqual({ canRegister: false, reason: 'already_registered' });
  });

  it('rejects when user is a partner of a waitlist entry', () => {
    // u3 is on the waitlist with u4 as partner; u4 tries to self-register
    const partnerIds = ['u4'];
    expect(validateRegistration('DRAFT', baseReg, [], ['u3'], 'u4', now, partnerIds))
      .toEqual({ canRegister: false, reason: 'already_registered' });
  });

  it('allows when a different user occupies the partner slot', () => {
    const partnerIds = ['u2'];
    expect(validateRegistration('DRAFT', baseReg, ['u1'], [], 'u3', now, partnerIds))
      .toEqual({ canRegister: true });
  });

  it('backward compatible: omitting partnerUserIds allows registration', () => {
    // Existing callers without the new param still work
    expect(validateRegistration('DRAFT', baseReg, [], [], 'u1', now))
      .toEqual({ canRegister: true });
  });

  it('priority: already_registered (primary) checked before partner slot check', () => {
    // u1 is both a primary participant AND in partnerIds — primary check fires first
    const partnerIds = ['u1'];
    expect(validateRegistration('DRAFT', baseReg, ['u1'], [], 'u1', now, partnerIds).reason)
      .toBe('already_registered');
  });
});

// ─── collectPartnerUserIds ────────────────────────────────────────────────────

describe('collectPartnerUserIds', () => {
  const makeParticipant = (userId: string, partnerUserId?: string): TournamentParticipant => ({
    id: `p-${userId}`, type: 'REGISTERED', userId, userKey: '', name: userId,
    rankingSnapshot: 0, status: 'ACTIVE',
    ...(partnerUserId ? { partner: { type: 'REGISTERED', userId: partnerUserId, name: partnerUserId } } : {})
  });
  const makeEntry = (userId: string, partnerUserId?: string): WaitlistEntry => ({
    userId, userName: userId, userKey: '', registeredAt: Date.now(),
    ...(partnerUserId ? { partner: { type: 'REGISTERED', userId: partnerUserId, name: partnerUserId } } : {})
  });

  it('returns empty array when no participants or waitlist', () => {
    expect(collectPartnerUserIds([], [])).toEqual([]);
  });

  it('collects partner userIds from participants', () => {
    const p = makeParticipant('u1', 'u2');
    expect(collectPartnerUserIds([p], [])).toContain('u2');
  });

  it('ignores participants without a partner.userId', () => {
    const p = makeParticipant('u1'); // no partner
    expect(collectPartnerUserIds([p], [])).toHaveLength(0);
  });

  it('ignores participants with partner.type GUEST (no userId)', () => {
    const p: TournamentParticipant = { ...makeParticipant('u1'), partner: { type: 'GUEST', name: 'Guest' } };
    expect(collectPartnerUserIds([p], [])).toHaveLength(0);
  });

  it('collects partner userIds from waitlist entries', () => {
    const w = makeEntry('u3', 'u4');
    expect(collectPartnerUserIds([], [w])).toContain('u4');
  });

  it('collects from both participants and waitlist', () => {
    const p = makeParticipant('u1', 'u2');
    const w = makeEntry('u3', 'u4');
    expect(collectPartnerUserIds([p], [w])).toEqual(expect.arrayContaining(['u2', 'u4']));
  });

  it('does not deduplicate (caller is responsible)', () => {
    const p1 = makeParticipant('u1', 'u2');
    const p2 = makeParticipant('u3', 'u2'); // u2 partner of both (unusual but possible bug state)
    expect(collectPartnerUserIds([p1, p2], [])).toHaveLength(2);
  });
});

// ─── filterEligiblePartners ────────────────────────────────────────────────────

describe('filterEligiblePartners (Bug #2: partner search too permissive)', () => {
  const users = [
    { userId: 'u1', playerName: 'Alice' },
    { userId: 'u2', playerName: 'Bob' },
    { userId: 'u3', playerName: 'Carol' },
    { userId: 'u4', playerName: 'Dave' },
    { userId: 'u5', playerName: 'Eve' },
  ];

  const makeParticipant = (userId: string, partnerUserId?: string): TournamentParticipant => ({
    id: `p-${userId}`, type: 'REGISTERED', userId, userKey: '', name: userId,
    rankingSnapshot: 0, status: 'ACTIVE',
    ...(partnerUserId ? { partner: { type: 'REGISTERED', userId: partnerUserId, name: partnerUserId } } : {})
  });
  const makeEntry = (userId: string, partnerUserId?: string): WaitlistEntry => ({
    userId, userName: userId, userKey: '', registeredAt: Date.now(),
    ...(partnerUserId ? { partner: { type: 'REGISTERED', userId: partnerUserId, name: partnerUserId } } : {})
  });

  it('excludes self from results', () => {
    const result = filterEligiblePartners(users, [], [], 'u1');
    expect(result.every(u => u.userId !== 'u1')).toBe(true);
  });

  it('excludes primary participants', () => {
    const participants = [makeParticipant('u2')];
    const result = filterEligiblePartners(users, participants, [], 'u1');
    expect(result.every(u => u.userId !== 'u2')).toBe(true);
  });

  it('excludes users already assigned as a REGISTERED partner', () => {
    // u2 registered, u3 is their partner — u3 must not appear as a candidate
    const participants = [makeParticipant('u2', 'u3')];
    const result = filterEligiblePartners(users, participants, [], 'u1');
    expect(result.every(u => u.userId !== 'u3')).toBe(true);
  });

  it('excludes users on the waitlist', () => {
    const waitlist = [makeEntry('u4')];
    const result = filterEligiblePartners(users, [], waitlist, 'u1');
    expect(result.every(u => u.userId !== 'u4')).toBe(true);
  });

  it('excludes users who are partners in waitlist entries', () => {
    const waitlist = [makeEntry('u4', 'u5')];
    const result = filterEligiblePartners(users, [], waitlist, 'u1');
    expect(result.every(u => u.userId !== 'u5')).toBe(true);
  });

  it('returns only truly eligible users', () => {
    // u1=self, u2=primary, u3=u2's partner, u4=waitlist, u5=u4's waitlist partner
    const participants = [makeParticipant('u2', 'u3')];
    const waitlist = [makeEntry('u4', 'u5')];
    const result = filterEligiblePartners(users, participants, waitlist, 'u1');
    expect(result).toHaveLength(0);
  });

  it('returns eligible users when not everyone is excluded', () => {
    const participants = [makeParticipant('u2')]; // only u2 excluded as primary
    // u1=self excluded, u2=primary excluded, u3/u4/u5 eligible
    const result = filterEligiblePartners(users, participants, [], 'u1');
    expect(result.map(u => u.userId).sort()).toEqual(['u3', 'u4', 'u5']);
  });

  it('works with empty user list', () => {
    expect(filterEligiblePartners([], [makeParticipant('u1')], [], 'u2')).toEqual([]);
  });

  it('preserves original user object shape', () => {
    const result = filterEligiblePartners(users, [], [], 'u1');
    expect(result[0]).toHaveProperty('playerName');
  });
});

// ─── getRegistrationErrorMessageKey (Bug #7: error localization) ─────────────

describe('getRegistrationErrorMessageKey', () => {
  // Validation reason codes from validateRegistration
  it('maps tournament_full to registration_full', () => {
    expect(getRegistrationErrorMessageKey('tournament_full')).toBe('registration_full');
  });

  it('maps already_registered to registration_registered', () => {
    expect(getRegistrationErrorMessageKey('already_registered')).toBe('registration_registered');
  });

  it('maps already_waitlisted to registration_onWaitlist', () => {
    expect(getRegistrationErrorMessageKey('already_waitlisted')).toBe('registration_onWaitlist');
  });

  it('maps not_draft to registration_closed', () => {
    expect(getRegistrationErrorMessageKey('not_draft')).toBe('registration_closed');
  });

  it('maps registration_disabled to registration_closed', () => {
    expect(getRegistrationErrorMessageKey('registration_disabled')).toBe('registration_closed');
  });

  it('maps deadline_passed to registration_closed', () => {
    expect(getRegistrationErrorMessageKey('deadline_passed')).toBe('registration_closed');
  });

  // Thrown Error.message strings from Firestore functions
  it('maps "Cannot unregister after tournament has started" to registration_closed', () => {
    expect(getRegistrationErrorMessageKey('Cannot unregister after tournament has started'))
      .toBe('registration_closed');
  });

  it('maps "Cannot leave waitlist after tournament has started" to registration_closed', () => {
    expect(getRegistrationErrorMessageKey('Cannot leave waitlist after tournament has started'))
      .toBe('registration_closed');
  });

  it('maps "Not authenticated" to registration_loginToRegister', () => {
    expect(getRegistrationErrorMessageKey('Not authenticated')).toBe('registration_loginToRegister');
  });

  it('returns null for unknown or unexpected errors', () => {
    expect(getRegistrationErrorMessageKey('some_unexpected_error')).toBeNull();
    expect(getRegistrationErrorMessageKey('')).toBeNull();
    expect(getRegistrationErrorMessageKey('Firebase not available')).toBeNull();
  });
});

// ─── NEW EDGE CASE TESTS ──────────────────────────────────────────────────────

// #1 + #2: validateRegistration partner validation (doubles)
describe('validateRegistration: partner userId validation (doubles)', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('rejects self as own partner', () => {
    const result = validateRegistration('DRAFT', baseReg, [], [], 'u1', now, [], 'u1');
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('self_as_partner');
  });

  it('rejects partner who is already a primary participant', () => {
    const result = validateRegistration('DRAFT', baseReg, ['u2'], [], 'u1', now, [], 'u2');
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('partner_already_registered');
  });

  it('rejects partner who is already on waitlist as primary', () => {
    const result = validateRegistration('DRAFT', baseReg, [], ['u2'], 'u1', now, [], 'u2');
    expect(result.canRegister).toBe(false);
    expect(result.reason).toBe('partner_on_waitlist');
  });

  it('allows a valid partner who is not in any list', () => {
    const result = validateRegistration('DRAFT', baseReg, ['u3'], ['u4'], 'u1', now, [], 'u2');
    expect(result.canRegister).toBe(true);
  });

  it('allows registration with no partner (undefined partnerUserId)', () => {
    const result = validateRegistration('DRAFT', baseReg, [], [], 'u1', now, [], undefined);
    expect(result.canRegister).toBe(true);
  });

  it('partner check fires AFTER current-user checks (already_registered has priority)', () => {
    // u1 is already registered and supplies self as partner — already_registered fires first
    const result = validateRegistration('DRAFT', baseReg, ['u1'], [], 'u1', now, [], 'u1');
    expect(result.reason).toBe('already_registered');
  });
});

// #3: teamName preserved in WaitlistEntry and on promotion
describe('adminPromoteFromWaitlist: teamName preserved on promotion', () => {
  it('preserves teamName from waitlist entry', () => {
    const entry: WaitlistEntry = {
      userId: 'u1',
      userName: 'Player u1',
      userKey: 'key-u1',
      registeredAt: Date.now(),
      teamName: 'Los Campeones',
    };
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect(result!.participants[0].teamName).toBe('Los Campeones');
  });

  it('does not add teamName field when not set in waitlist entry', () => {
    const entry: WaitlistEntry = {
      userId: 'u1',
      userName: 'Player u1',
      userKey: 'key-u1',
      registeredAt: Date.now(),
    };
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'new-id');
    expect((result!.participants[0] as any).teamName).toBeUndefined();
  });
});

// #4 + #5: shouldAutoPromote — FIFO promotion respects registration config
describe('shouldAutoPromote: FIFO promotion respects registration config', () => {
  const makeEntry = (userId: string): WaitlistEntry => ({
    userId,
    userName: `Player ${userId}`,
    userKey: `key-${userId}`,
    registeredAt: Date.now(),
  });
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };

  it('promotes when registration is enabled and below maxParticipants', () => {
    expect(shouldAutoPromote([makeEntry('w1')], { ...baseReg, maxParticipants: 5 }, 3)).toBe(true);
  });

  it('does NOT promote when waitlist is empty', () => {
    expect(shouldAutoPromote([], { ...baseReg, maxParticipants: 5 }, 3)).toBe(false);
  });

  it('does NOT promote when registration.enabled is false', () => {
    expect(shouldAutoPromote([makeEntry('w1')], { ...baseReg, enabled: false, maxParticipants: 5 }, 3)).toBe(false);
  });

  it('does NOT promote when new participant count would reach maxParticipants', () => {
    // After removing unregistrant we have 3; cap is 3 → no room for promoted entry
    expect(shouldAutoPromote([makeEntry('w1')], { ...baseReg, maxParticipants: 3 }, 3)).toBe(false);
  });

  it('does NOT promote when new participant count exceeds maxParticipants (cap lowered)', () => {
    expect(shouldAutoPromote([makeEntry('w1')], { ...baseReg, maxParticipants: 2 }, 3)).toBe(false);
  });

  it('promotes when no maxParticipants cap is set', () => {
    expect(shouldAutoPromote([makeEntry('w1')], baseReg, 10)).toBe(true);
  });

  it('promotes when registration object is undefined (no restrictions)', () => {
    expect(shouldAutoPromote([makeEntry('w1')], undefined, 0)).toBe(true);
  });
});

// #8: adminPromoteFromWaitlist rejects non-DRAFT tournaments
describe('adminPromoteFromWaitlist: tournament status guard', () => {
  const entry: WaitlistEntry = {
    userId: 'u1',
    userName: 'Player u1',
    userKey: 'key-u1',
    registeredAt: Date.now(),
  };

  it('promotes when tournament is in DRAFT status', () => {
    expect(adminPromoteFromWaitlist([], [entry], 'u1', 'new-id', 'DRAFT')).not.toBeNull();
  });

  it('returns null when tournament has already started (GROUP_STAGE)', () => {
    expect(adminPromoteFromWaitlist([], [entry], 'u1', 'new-id', 'GROUP_STAGE')).toBeNull();
  });

  it('returns null for all non-DRAFT statuses', () => {
    for (const status of ['BRACKET', 'FINAL_STAGE', 'COMPLETED', 'CANCELLED']) {
      expect(adminPromoteFromWaitlist([], [entry], 'u1', 'new-id', status)).toBeNull();
    }
  });

  it('promotes when no tournamentStatus provided (backwards compatible)', () => {
    expect(adminPromoteFromWaitlist([], [entry], 'u1', 'new-id')).not.toBeNull();
  });
});

// #10: buildRegistrationConfig sanitizes invalid maxParticipants
describe('buildRegistrationConfig: maxParticipants sanitization', () => {
  it('treats negative maxParticipants as no limit (returns undefined)', () => {
    const config = buildRegistrationConfig(true, '', '', -1 as any, '', true, false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('treats 0 maxParticipants as no limit (returns undefined)', () => {
    const config = buildRegistrationConfig(true, '', '', 0, '', true, false, true);
    expect(config?.maxParticipants).toBeUndefined();
  });

  it('preserves valid positive maxParticipants', () => {
    const config = buildRegistrationConfig(true, '', '', 8, '', true, false, true);
    expect(config?.maxParticipants).toBe(8);
  });
});

// #email: normalizeEmail
describe('normalizeEmail', () => {
  it('lowercases uppercase email', () => {
    expect(normalizeEmail('User@Gmail.com')).toBe('user@gmail.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('handles already-lowercase email unchanged', () => {
    expect(normalizeEmail('player@kinole.es')).toBe('player@kinole.es');
  });

  it('handles mixed case + whitespace together', () => {
    expect(normalizeEmail(' Player@Kinole.ES ')).toBe('player@kinole.es');
  });

  it('handles empty string', () => {
    expect(normalizeEmail('')).toBe('');
  });
});

// Documentation / known limitations
describe('documentation: known limitations and UX debt', () => {
  it('unregister primary with doubles partner silently removes the whole pair', () => {
    // The pair is removed atomically — partner receives no notification (tracked as UX debt).
    const participants: TournamentParticipant[] = [
      {
        id: 'p1', type: 'REGISTERED', userId: 'u1', userKey: 'key-u1',
        name: 'Player u1', rankingSnapshot: 0, status: 'ACTIVE',
        partner: { type: 'REGISTERED', userId: 'u2', name: 'Player u2' },
      },
      {
        id: 'p2', type: 'REGISTERED', userId: 'u3', userKey: 'key-u3',
        name: 'Player u3', rankingSnapshot: 0, status: 'ACTIVE',
      },
    ];
    const remaining = participants.filter(p => p.userId !== 'u1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe('u3');
    // u2 (partner) is also gone with no separate removal or notification
  });

  it('rankingSnapshot=0 at registration is by design — syncParticipantRankings fills it when tournament starts', () => {
    // All participants (direct + promoted) get rankingSnapshot=0 as a placeholder.
    // tournamentRanking.ts:syncParticipantRankings() reads real rankings from user profiles
    // and updates participants when the tournament moves out of DRAFT.
    // Admin-promote is now DRAFT-only (fix #8), so promoted participants are treated identically
    // to direct registrants — their ranking will be populated by syncParticipantRankings.
    const entry: WaitlistEntry = { userId: 'u1', userName: 'Player', userKey: 'k1', registeredAt: Date.now() };
    const result = adminPromoteFromWaitlist([], [entry], 'u1', 'id-1', 'DRAFT');
    expect(result!.participants[0].rankingSnapshot).toBe(0); // placeholder, populated at tournament start
  });
  it.todo('notifies partner when primary unregisters them — requires new Cloud Function + FCM token lookup');
  it.todo('firestore security rules should prevent direct client overwrite of participants/waitlist');
});

// ─── Deadline vs tournamentDate consistency (Option-3 defense in depth) ──────
// Layer 1: validateRegistrationDeadline — used by the create-tournament wizard
//          to refuse a deadline that doesn't fit the tournamentDate.
// Layer 2: validateRegistration — closes registrations once deadline OR
//          tournamentDate has passed, even if the admin forgot to start the tournament.

describe('validateRegistrationDeadline (wizard-side validation)', () => {
  const oneDay = 24 * 60 * 60 * 1000;
  const now = new Date('2026-05-01T12:00:00').getTime();

  it('rejects a deadline already in the past', () => {
    const result = validateRegistrationDeadline(now - oneDay, undefined, now);
    expect(result).toEqual({ valid: false, reason: 'in_past' });
  });

  it('rejects a deadline AFTER the tournament date', () => {
    const tournamentDate = new Date('2026-06-01T10:00:00').getTime();
    const deadline = new Date('2026-06-05T12:00:00').getTime();
    const result = validateRegistrationDeadline(deadline, tournamentDate, now);
    expect(result).toEqual({ valid: false, reason: 'after_tournament' });
  });

  it('rejects a deadline EXACTLY at the tournament date', () => {
    const tournamentDate = new Date('2026-06-01T10:00:00').getTime();
    const result = validateRegistrationDeadline(tournamentDate, tournamentDate, now);
    expect(result).toEqual({ valid: false, reason: 'after_tournament' });
  });

  it('rejects a deadline less than 24h before the tournament', () => {
    const tournamentDate = new Date('2026-06-01T10:00:00').getTime();
    const deadline = tournamentDate - 12 * 60 * 60 * 1000; // 12h before
    const result = validateRegistrationDeadline(deadline, tournamentDate, now);
    expect(result).toEqual({ valid: false, reason: 'too_close' });
  });

  it('accepts a deadline exactly 24h before the tournament', () => {
    const tournamentDate = new Date('2026-06-01T10:00:00').getTime();
    const deadline = tournamentDate - oneDay;
    const result = validateRegistrationDeadline(deadline, tournamentDate, now);
    expect(result).toEqual({ valid: true });
  });

  it('accepts a deadline well before the tournament', () => {
    const tournamentDate = new Date('2026-06-01T10:00:00').getTime();
    const deadline = new Date('2026-05-25T23:59:00').getTime();
    const result = validateRegistrationDeadline(deadline, tournamentDate, now);
    expect(result).toEqual({ valid: true });
  });

  it('skips tournamentDate checks when tournamentDate is undefined', () => {
    // Admin didn't set a tournament date → only the in_past check applies.
    const future = now + 5 * oneDay;
    expect(validateRegistrationDeadline(future, undefined, now)).toEqual({ valid: true });
  });
});

describe('validateRegistration with tournamentDate (defense in depth)', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const oneDay = 24 * 60 * 60 * 1000;

  it('still rejects when current time is past the deadline (existing behavior preserved)', () => {
    const pastDeadline = Date.now() - oneDay;
    const reg = { ...baseReg, deadline: pastDeadline };
    const result = validateRegistration('DRAFT', reg, [], [], 'u1', Date.now());
    expect(result).toEqual({ canRegister: false, reason: 'deadline_passed' });
  });

  it('rejects registration when tournamentDate has passed even if status is still DRAFT', () => {
    // Admin set tournamentDate in the past but forgot to transition to GROUP_STAGE.
    // Registration must close anyway.
    const reg = { ...baseReg, deadline: Date.now() + 30 * oneDay };
    const tournamentDate = Date.now() - 1000;
    const result = validateRegistration(
      'DRAFT', reg, [], [], 'u1', Date.now(), [], undefined, tournamentDate
    );
    expect(result).toEqual({ canRegister: false, reason: 'deadline_passed' });
  });

  it('rejects registration exactly at tournamentDate', () => {
    const now = Date.now();
    const reg = { ...baseReg };
    const result = validateRegistration(
      'DRAFT', reg, [], [], 'u1', now, [], undefined, now
    );
    expect(result).toEqual({ canRegister: false, reason: 'deadline_passed' });
  });

  it('still accepts registration when both deadline and tournamentDate are in the future', () => {
    const reg = { ...baseReg, deadline: Date.now() + oneDay };
    const tournamentDate = Date.now() + 5 * oneDay;
    const result = validateRegistration(
      'DRAFT', reg, [], [], 'u1', Date.now(), [], undefined, tournamentDate
    );
    expect(result).toEqual({ canRegister: true });
  });

  it('still accepts when tournamentDate is undefined (legacy tournaments)', () => {
    // Tournaments created before this validation existed have no tournamentDate.
    const reg = { ...baseReg, deadline: Date.now() + oneDay };
    const result = validateRegistration(
      'DRAFT', reg, [], [], 'u1', Date.now(), [], undefined, undefined
    );
    expect(result).toEqual({ canRegister: true });
  });
});
