import { describe, it, expect } from 'vitest';
import { getUserProfileUrl, getPartnerProfileUrl } from './userProfileUrl';

describe('getUserProfileUrl', () => {
	// --- Basic resolution ---

	it('returns null when no userId or userKey', () => {
		expect(getUserProfileUrl({})).toBeNull();
	});

	it('uses userId when userKey is not available', () => {
		expect(getUserProfileUrl({ userId: 'dG0LKFPimJP0fXqucKoxofcfNS73' }))
			.toBe('/users/dG0LKFPimJP0fXqucKoxofcfNS73');
	});

	it('prefers userKey over userId', () => {
		expect(getUserProfileUrl({ userId: 'longFirebaseUid123', userKey: 'ABC123' }))
			.toBe('/users/ABC123');
	});

	it('uses userKey alone', () => {
		expect(getUserProfileUrl({ userKey: 'XY9Z4W' }))
			.toBe('/users/XY9Z4W');
	});

	// --- Singles tournaments (no tournament param) ---

	it('singles: no tournament param even when tournamentName provided', () => {
		expect(getUserProfileUrl(
			{ userKey: 'ABC123' },
			{ isDoubles: false, tournamentName: 'Copa Primavera' }
		)).toBe('/users/ABC123');
	});

	it('singles: no tournament param when isDoubles is undefined', () => {
		expect(getUserProfileUrl(
			{ userId: 'uid123' },
			{ tournamentName: 'Copa Primavera' }
		)).toBe('/users/uid123');
	});

	// --- Doubles tournaments (with tournament param) ---

	it('doubles: appends tournament param', () => {
		expect(getUserProfileUrl(
			{ userKey: 'ABC123' },
			{ isDoubles: true, tournamentName: 'Copa Primavera' }
		)).toBe('/users/ABC123?tournament=Copa%20Primavera');
	});

	it('doubles: encodes special characters in tournament name', () => {
		expect(getUserProfileUrl(
			{ userId: 'uid123' },
			{ isDoubles: true, tournamentName: 'Torneo 2025 #1 (dobles)' }
		)).toBe('/users/uid123?tournament=Torneo%202025%20%231%20(dobles)');
	});

	it('doubles: uses userKey with fallback to userId', () => {
		expect(getUserProfileUrl(
			{ userId: 'longUid', userKey: 'KEY001' },
			{ isDoubles: true, tournamentName: 'Dobles Open' }
		)).toBe('/users/KEY001?tournament=Dobles%20Open');
	});

	it('doubles: no tournament param when tournamentName is empty', () => {
		expect(getUserProfileUrl(
			{ userKey: 'ABC123' },
			{ isDoubles: true, tournamentName: '' }
		)).toBe('/users/ABC123');
	});

	it('doubles: no tournament param when tournamentName is undefined', () => {
		expect(getUserProfileUrl(
			{ userKey: 'ABC123' },
			{ isDoubles: true }
		)).toBe('/users/ABC123');
	});

	// --- Accented / unicode tournament names ---

	it('handles accented tournament names', () => {
		expect(getUserProfileUrl(
			{ userKey: 'XYZ789' },
			{ isDoubles: true, tournamentName: 'Campionat de Catalunya' }
		)).toBe('/users/XYZ789?tournament=Campionat%20de%20Catalunya');
	});
});

describe('getPartnerProfileUrl', () => {
	it('returns null when no userId or userKey', () => {
		expect(getPartnerProfileUrl({})).toBeNull();
	});

	it('returns base URL without tournament param when no tournamentName', () => {
		expect(getPartnerProfileUrl({ userKey: 'PAR001' }))
			.toBe('/users/PAR001');
	});

	it('prefers userKey over userId', () => {
		expect(getPartnerProfileUrl({ userId: 'longUid', userKey: 'PAR001' }, 'Dobles Open'))
			.toBe('/users/PAR001?tournament=Dobles%20Open');
	});

	it('falls back to userId when no userKey', () => {
		expect(getPartnerProfileUrl({ userId: 'partnerUid' }, 'Dobles Open'))
			.toBe('/users/partnerUid?tournament=Dobles%20Open');
	});

	it('appends encoded tournament name', () => {
		expect(getPartnerProfileUrl({ userKey: 'PAR001' }, 'Torneo Dobles #2'))
			.toBe('/users/PAR001?tournament=Torneo%20Dobles%20%232');
	});
});
