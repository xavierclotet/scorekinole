import { describe, it, expect } from 'vitest';
import {
	getUserProfileUrl,
	getPartnerProfileUrl,
	slugifyPlayerName,
	buildUserProfileParam,
	extractUserKeyFromParam
} from './userProfileUrl';

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

// ─────────────────────────────────────────────────
// Friendly slug URLs (slug-KEY scheme)
// ─────────────────────────────────────────────────

describe('slugifyPlayerName', () => {
	it('lowercases and replaces spaces with dashes', () => {
		expect(slugifyPlayerName('Xavi Clotet')).toBe('xavi-clotet');
	});

	it('strips accents and diacritics', () => {
		expect(slugifyPlayerName('José María Aznárez')).toBe('jose-maria-aznarez');
		expect(slugifyPlayerName('Núria Güell')).toBe('nuria-guell');
	});

	it('converts ñ and ç', () => {
		expect(slugifyPlayerName('Begoña Muñoz')).toBe('begona-munoz');
		expect(slugifyPlayerName('Çelik França')).toBe('celik-franca');
	});

	it('collapses consecutive non-alphanumeric characters', () => {
		expect(slugifyPlayerName("Joan  (el 'Crack') !!")).toBe('joan-el-crack');
	});

	it('trims leading and trailing dashes', () => {
		expect(slugifyPlayerName('--Marc--')).toBe('marc');
	});

	it('returns empty string for names with nothing usable', () => {
		expect(slugifyPlayerName('🎯🎯🎯')).toBe('');
		expect(slugifyPlayerName('')).toBe('');
	});

	it('caps very long names without trailing dash', () => {
		const slug = slugifyPlayerName('A'.repeat(30) + ' ' + 'B'.repeat(30));
		expect(slug.length).toBeLessThanOrEqual(40);
		expect(slug.endsWith('-')).toBe(false);
	});

	it('keeps numbers', () => {
		expect(slugifyPlayerName('Player 99')).toBe('player-99');
	});
});

describe('buildUserProfileParam', () => {
	it('builds slug-key when name and key exist', () => {
		expect(buildUserProfileParam('Xavi Clotet', '4A7ZV2')).toBe('xavi-clotet-4A7ZV2');
	});

	it('returns bare key when name yields no slug', () => {
		expect(buildUserProfileParam('🎯', 'ABC123')).toBe('ABC123');
		expect(buildUserProfileParam(undefined, 'ABC123')).toBe('ABC123');
	});

	it('falls back to userId when no key (no slug prefix — the uid must stay resolvable)', () => {
		expect(buildUserProfileParam('Xavi Clotet', undefined, 'firebaseUid123')).toBe('firebaseUid123');
	});

	it('returns null when neither key nor id exist', () => {
		expect(buildUserProfileParam('Xavi Clotet', undefined)).toBeNull();
		expect(buildUserProfileParam(undefined, undefined, undefined)).toBeNull();
	});
});

describe('extractUserKeyFromParam', () => {
	it('extracts trailing key from slug-key param', () => {
		expect(extractUserKeyFromParam('xavi-clotet-4A7ZV2')).toBe('4A7ZV2');
	});

	it('accepts a bare 6-char key (legacy links)', () => {
		expect(extractUserKeyFromParam('4A7ZV2')).toBe('4A7ZV2');
	});

	it('takes only the last token even if the slug has 6-char words', () => {
		expect(extractUserKeyFromParam('andreu-soldevila-AB12CD')).toBe('AB12CD');
	});

	it('returns null for Firebase UIDs (long, no dash before last 6 chars)', () => {
		expect(extractUserKeyFromParam('dG0LKFPimJP0fXqucKoxofcfNS73')).toBeNull();
	});

	it('returns null for short or non-matching params', () => {
		expect(extractUserKeyFromParam('abc')).toBeNull();
		expect(extractUserKeyFromParam('xavi-cl')).toBeNull(); // last token is not 6 chars
	});

	it('a trailing 6-letter name token is indistinguishable from a key (resolution falls back to ID lookup)', () => {
		// Documented limitation: "clotet" is 6 alphanumeric chars, so it parses as a key.
		// The /users/[id] page handles this: key lookup fails → tries the param as doc ID.
		expect(extractUserKeyFromParam('xavi-clotet')).toBe('clotet');
	});
});
