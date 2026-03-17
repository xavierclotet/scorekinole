import { describe, it, expect } from 'vitest';
import type { TournamentParticipant } from '$lib/types/tournament';
import { getUserProfileUrl, getPartnerProfileUrl } from './userProfileUrl';

/**
 * Tests that simulate how participant objects are built by the selectors
 * and how they're used to generate profile URLs in tournament views.
 */

// Simulates SinglesPlayerSelector.selectUser()
function buildSinglesParticipant(user: {
	playerName: string;
	userId: string;
	key?: string;
	photoURL?: string | null;
	authProvider?: string | null;
}): Partial<TournamentParticipant> {
	const isGuest = user.authProvider === null;
	return {
		id: 'test-id',
		type: isGuest ? 'GUEST' : 'REGISTERED',
		name: user.playerName,
		userId: user.userId,
		userKey: user.key || undefined,
		photoURL: isGuest ? undefined : (user.photoURL || undefined),
		rankingSnapshot: 0,
		status: 'ACTIVE'
	};
}

// Simulates PairSelector.addPair()
function buildDoublesPair(
	p1: { playerName: string; userId: string; key?: string; photoURL?: string },
	p2: { playerName: string; userId: string; key?: string; photoURL?: string },
	teamName?: string
): Partial<TournamentParticipant> {
	return {
		id: 'test-pair-id',
		name: p1.playerName,
		type: 'REGISTERED',
		userId: p1.userId,
		userKey: p1.key || undefined,
		photoURL: p1.photoURL,
		teamName: teamName || undefined,
		partner: {
			type: 'REGISTERED',
			userId: p2.userId,
			userKey: p2.key || undefined,
			name: p2.playerName,
			photoURL: p2.photoURL
		},
		rankingSnapshot: 0,
		status: 'ACTIVE'
	};
}

describe('Singles participant with userKey', () => {
	it('registered user with key gets userKey in participant', () => {
		const participant = buildSinglesParticipant({
			playerName: 'Joan Garcia',
			userId: 'firebaseUid123',
			key: 'JOA001',
			authProvider: 'google.com'
		});
		expect(participant.userKey).toBe('JOA001');
		expect(getUserProfileUrl(participant)).toBe('/users/JOA001');
	});

	it('registered user without key falls back to userId', () => {
		const participant = buildSinglesParticipant({
			playerName: 'Pere López',
			userId: 'firebaseUid456',
			authProvider: 'google.com'
		});
		expect(participant.userKey).toBeUndefined();
		expect(getUserProfileUrl(participant)).toBe('/users/firebaseUid456');
	});

	it('guest user has no userKey or userId link', () => {
		const participant = buildSinglesParticipant({
			playerName: 'Guest Player',
			userId: 'guestUid',
			authProvider: null
		});
		// Guest type but has userId from search — still generates URL
		expect(participant.userKey).toBeUndefined();
		expect(participant.type).toBe('GUEST');
	});

	it('singles URL has no tournament param', () => {
		const participant = buildSinglesParticipant({
			playerName: 'Joan',
			userId: 'uid',
			key: 'JOA001',
			authProvider: 'google.com'
		});
		const url = getUserProfileUrl(participant, {
			isDoubles: false,
			tournamentName: 'Copa 2025'
		});
		expect(url).toBe('/users/JOA001');
		expect(url).not.toContain('tournament');
	});
});

describe('Doubles pair with userKey', () => {
	const pair = buildDoublesPair(
		{ playerName: 'Joan', userId: 'uid1', key: 'JOA001', photoURL: 'photo1.jpg' },
		{ playerName: 'Marc', userId: 'uid2', key: 'MAR002', photoURL: 'photo2.jpg' },
		'Los Campeones'
	);

	it('primary player has userKey', () => {
		expect(pair.userKey).toBe('JOA001');
	});

	it('partner has userKey', () => {
		expect(pair.partner?.userKey).toBe('MAR002');
	});

	it('primary player URL uses userKey with tournament param', () => {
		const url = getUserProfileUrl(pair, {
			isDoubles: true,
			tournamentName: 'Dobles Open'
		});
		expect(url).toBe('/users/JOA001?tournament=Dobles%20Open');
	});

	it('partner URL uses userKey with tournament param', () => {
		const url = getPartnerProfileUrl(pair.partner!, 'Dobles Open');
		expect(url).toBe('/users/MAR002?tournament=Dobles%20Open');
	});
});

describe('Doubles pair without userKey (old tournaments)', () => {
	const pair = buildDoublesPair(
		{ playerName: 'Joan', userId: 'longFirebaseUid1' },
		{ playerName: 'Marc', userId: 'longFirebaseUid2' }
	);

	it('falls back to userId for primary player', () => {
		const url = getUserProfileUrl(pair, {
			isDoubles: true,
			tournamentName: 'Legacy Tournament'
		});
		expect(url).toBe('/users/longFirebaseUid1?tournament=Legacy%20Tournament');
	});

	it('falls back to userId for partner', () => {
		const url = getPartnerProfileUrl(pair.partner!, 'Legacy Tournament');
		expect(url).toBe('/users/longFirebaseUid2?tournament=Legacy%20Tournament');
	});
});

describe('Mixed: one player with key, partner without', () => {
	const pair = buildDoublesPair(
		{ playerName: 'Joan', userId: 'uid1', key: 'JOA001' },
		{ playerName: 'Guest Marc', userId: 'longUid2' }
	);

	it('primary uses userKey', () => {
		const url = getUserProfileUrl(pair, { isDoubles: true, tournamentName: 'T' });
		expect(url).toBe('/users/JOA001?tournament=T');
	});

	it('partner falls back to userId', () => {
		const url = getPartnerProfileUrl(pair.partner!, 'T');
		expect(url).toBe('/users/longUid2?tournament=T');
	});
});
