import { describe, it, expect } from 'vitest';
import { validateRegistration, determineRegistrationOutcome } from './tournamentRegistration';

describe('validateRegistration', () => {
  const baseReg = { enabled: true, notifyOnRegistration: false, showParticipantList: true };
  const now = Date.now();

  it('rejects when tournament is not DRAFT', () => {
    const result = validateRegistration('GROUP_STAGE', baseReg, [], [], 'user1', now);
    expect(result).toEqual({ canRegister: false, reason: 'not_draft' });
  });

  it('rejects when registration is not enabled', () => {
    const result = validateRegistration('DRAFT', { ...baseReg, enabled: false }, [], [], 'user1', now);
    expect(result).toEqual({ canRegister: false, reason: 'registration_disabled' });
  });

  it('rejects when registration is undefined', () => {
    const result = validateRegistration('DRAFT', undefined, [], [], 'user1', now);
    expect(result).toEqual({ canRegister: false, reason: 'registration_disabled' });
  });

  it('rejects when deadline has passed', () => {
    const reg = { ...baseReg, deadline: now - 1000 };
    const result = validateRegistration('DRAFT', reg, [], [], 'user1', now);
    expect(result).toEqual({ canRegister: false, reason: 'deadline_passed' });
  });

  it('allows when deadline has not passed', () => {
    const reg = { ...baseReg, deadline: now + 100000 };
    const result = validateRegistration('DRAFT', reg, [], [], 'user1', now);
    expect(result).toEqual({ canRegister: true });
  });

  it('rejects when user already in participants', () => {
    const result = validateRegistration('DRAFT', baseReg, ['user1'], [], 'user1', now);
    expect(result).toEqual({ canRegister: false, reason: 'already_registered' });
  });

  it('rejects when user already in waitlist', () => {
    const result = validateRegistration('DRAFT', baseReg, [], ['user1'], 'user1', now);
    expect(result).toEqual({ canRegister: false, reason: 'already_waitlisted' });
  });

  it('allows valid registration', () => {
    const result = validateRegistration('DRAFT', baseReg, ['user2'], [], 'user1', now);
    expect(result).toEqual({ canRegister: true });
  });
});

describe('determineRegistrationOutcome', () => {
  it('returns registered when no limit', () => {
    expect(determineRegistrationOutcome(5)).toBe('registered');
  });

  it('returns registered when under limit', () => {
    expect(determineRegistrationOutcome(5, 10)).toBe('registered');
  });

  it('returns waitlisted when at limit', () => {
    expect(determineRegistrationOutcome(10, 10)).toBe('waitlisted');
  });

  it('returns waitlisted when over limit', () => {
    expect(determineRegistrationOutcome(12, 10)).toBe('waitlisted');
  });
});
