import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────
// Mocks — must be declared before importing ./firestore
// ─────────────────────────────────────────────────

const { getDocsMock } = vi.hoisted(() => ({ getDocsMock: vi.fn() }));

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false,
	building: false,
	version: 'test'
}));

vi.mock('./config', () => ({
	db: {},
	auth: {},
	isFirebaseEnabled: () => true
}));

vi.mock('./auth', () => ({
	currentUser: {
		subscribe: (fn: (v: unknown) => void) => {
			fn(null);
			return () => {};
		}
	}
}));

vi.mock('firebase/firestore', () => {
	class Timestamp {
		private ms: number;
		constructor(ms: number) {
			this.ms = ms;
		}
		toMillis() {
			return this.ms;
		}
		static fromMillis(ms: number) {
			return new Timestamp(ms);
		}
	}
	return {
		collection: vi.fn(),
		doc: vi.fn(),
		setDoc: vi.fn(),
		getDocs: getDocsMock,
		getDoc: vi.fn(),
		deleteDoc: vi.fn(),
		updateDoc: vi.fn(),
		query: vi.fn(),
		where: vi.fn(),
		serverTimestamp: vi.fn(),
		Timestamp
	};
});

import { getTournamentMatchesForUser } from './firestore';

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────

const USER = 'user-1';
const OPPONENT_USER = 'user-2';

/** Firestore QuerySnapshot stub: only forEach is used by the code under test */
function mockSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
	getDocsMock.mockResolvedValue({
		forEach: (cb: (d: { id: string; data: () => Record<string, unknown> }) => void) => {
			docs.forEach((d) => cb({ id: d.id, data: () => d.data }));
		}
	});
}

function makeMatch(overrides: Record<string, unknown> = {}) {
	return {
		id: 'm1',
		participantA: 'p1',
		participantB: 'p2',
		status: 'COMPLETED',
		winner: 'p1',
		totalPointsA: 8,
		totalPointsB: 4,
		total20sA: 3,
		total20sB: 1,
		startedAt: 1000,
		completedAt: 2000,
		duration: 1000,
		...overrides
	};
}

function makeTournament(overrides: Record<string, unknown> = {}) {
	return {
		id: 'tour-1',
		name: 'Open BCN',
		status: 'COMPLETED',
		gameType: 'singles',
		participants: [
			{ id: 'p1', name: 'Alice', userId: USER, status: 'ACTIVE' },
			{ id: 'p2', name: 'Bob', userId: OPPONENT_USER, status: 'ACTIVE' },
			{ id: 'p3', name: 'Carol', userId: 'user-3', status: 'ACTIVE' }
		],
		groupStage: {
			groups: [
				{
					id: 'g1',
					name: 'Grupo A',
					schedule: [{ roundNumber: 1, matches: [makeMatch()] }]
				}
			]
		},
		createdAt: 100,
		startedAt: 200,
		completedAt: 5000,
		updatedAt: 5000,
		...overrides
	};
}

beforeEach(() => {
	getDocsMock.mockReset();
});

// ─────────────────────────────────────────────────
// Basic conversion
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — basic conversion', () => {
	it('returns a group match where the user played, from their perspective (user = team1)', async () => {
		mockSnapshot([{ id: 'tour-1', data: makeTournament() }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(1);
		const m = matches[0];
		expect(m.team1Name).toBe('Alice');
		expect(m.team2Name).toBe('Bob');
		expect(m.team1Score).toBe(8);
		expect(m.team2Score).toBe(4);
		expect(m.winner).toBe(1);
		expect(m.players?.team1?.userId).toBe(USER);
		expect(m.players?.team2?.userId).toBe(OPPONENT_USER);
		expect(m.eventTitle).toBe('Open BCN');
	});

	it('swaps perspective when the user is participantB', async () => {
		mockSnapshot([{ id: 'tour-1', data: makeTournament() }]);
		const { matches } = await getTournamentMatchesForUser(OPPONENT_USER);

		expect(matches).toHaveLength(1);
		const m = matches[0];
		// Bob's perspective: he is team1, lost 4-8
		expect(m.team1Name).toBe('Bob');
		expect(m.team2Name).toBe('Alice');
		expect(m.team1Score).toBe(4);
		expect(m.team2Score).toBe(8);
		expect(m.winner).toBe(2);
	});

	it('returns no matches for a user not in the tournament, but still reports the tournament ID', async () => {
		mockSnapshot([{ id: 'tour-1', data: makeTournament() }]);
		const { matches, completedTournamentIds } = await getTournamentMatchesForUser('stranger');

		expect(matches).toHaveLength(0);
		expect(completedTournamentIds?.has('tour-1')).toBe(true);
	});

	it('finds matches when the user participated as a doubles partner', async () => {
		const tournament = makeTournament({
			gameType: 'doubles',
			participants: [
				{
					id: 'p1',
					name: 'Alice',
					userId: 'main-1',
					status: 'ACTIVE',
					partner: { name: 'Pat', userId: USER }
				},
				{ id: 'p2', name: 'Bob', userId: OPPONENT_USER, status: 'ACTIVE' }
			]
		});
		mockSnapshot([{ id: 'tour-1', data: tournament }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(1);
		// The user's team (where they are partner) is team1
		expect(matches[0].players?.team1?.partner?.userId).toBe(USER);
		expect(matches[0].gameType).toBe('doubles');
	});
});

// ─────────────────────────────────────────────────
// Test tournaments are excluded (must mirror /ranking)
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — isTest filtering', () => {
	it('excludes matches from test tournaments', async () => {
		mockSnapshot([
			{ id: 'tour-real', data: makeTournament({ id: 'tour-real', name: 'Real Open' }) },
			{ id: 'tour-test', data: makeTournament({ id: 'tour-test', name: 'Test Open', isTest: true }) }
		]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(1);
		expect(matches[0].eventTitle).toBe('Real Open');
	});

	it('excludes test tournaments from completedTournamentIds', async () => {
		mockSnapshot([
			{ id: 'tour-real', data: makeTournament({ id: 'tour-real' }) },
			{ id: 'tour-test', data: makeTournament({ id: 'tour-test', isTest: true }) }
		]);
		const { completedTournamentIds } = await getTournamentMatchesForUser(USER);

		expect(completedTournamentIds?.has('tour-real')).toBe(true);
		expect(completedTournamentIds?.has('tour-test')).toBe(false);
	});
});

// ─────────────────────────────────────────────────
// Match exclusions
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — match exclusions', () => {
	it('excludes WALKOVER and PENDING matches', async () => {
		const tournament = makeTournament({
			groupStage: {
				groups: [
					{
						id: 'g1',
						name: 'Grupo A',
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeMatch({ id: 'm-wo', status: 'WALKOVER' }),
									makeMatch({ id: 'm-pending', status: 'PENDING' }),
									makeMatch({ id: 'm-ok' })
								]
							}
						]
					}
				]
			}
		});
		mockSnapshot([{ id: 'tour-1', data: tournament }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(1);
		expect(matches[0].id).toContain('m-ok');
	});

	it('excludes BYE matches and matches against nonexistent participants', async () => {
		const tournament = makeTournament({
			groupStage: {
				groups: [
					{
						id: 'g1',
						name: 'Grupo A',
						schedule: [
							{
								roundNumber: 1,
								matches: [
									makeMatch({ id: 'm-bye', participantB: 'BYE' }),
									makeMatch({ id: 'm-ghost', participantB: 'ghost-id' })
								]
							}
						]
					}
				]
			}
		});
		mockSnapshot([{ id: 'tour-1', data: tournament }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────
// Rounds → games conversion
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — rounds and games', () => {
	it('groups rounds by gameNumber into separate games', async () => {
		const rounds = [
			{ gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
			{ gameNumber: 1, roundInGame: 2, pointsA: 0, pointsB: 2, twentiesA: 0, twentiesB: 2 },
			{ gameNumber: 2, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 3, twentiesB: 1 }
		];
		mockSnapshot([
			{
				id: 'tour-1',
				data: makeTournament({
					groupStage: {
						groups: [
							{ id: 'g1', name: 'Grupo A', schedule: [{ roundNumber: 1, matches: [makeMatch({ rounds })] }] }
						]
					}
				})
			}
		]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(1);
		expect(matches[0].games).toHaveLength(2);
		const [g1, g2] = matches[0].games;
		expect(g1.rounds).toHaveLength(2);
		expect(g1.team1Points).toBe(2);
		expect(g1.team2Points).toBe(2);
		expect(g1.winner).toBeNull(); // tied game
		expect(g2.rounds).toHaveLength(1);
		expect(g2.winner).toBe(1);
		// 20s from the user's perspective
		expect(g2.rounds[0].team1Twenty).toBe(3);
		expect(g2.rounds[0].team2Twenty).toBe(1);
	});

	it('maps hammer to the user perspective', async () => {
		const rounds = [
			{ gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 0, twentiesB: 0, hammer: 'p2' }
		];
		mockSnapshot([
			{
				id: 'tour-1',
				data: makeTournament({
					groupStage: {
						groups: [
							{ id: 'g1', name: 'Grupo A', schedule: [{ roundNumber: 1, matches: [makeMatch({ rounds })] }] }
						]
					}
				})
			}
		]);
		// From Alice's (p1) perspective the hammer belongs to team 2
		const { matches } = await getTournamentMatchesForUser(USER);
		expect(matches[0].games[0].rounds[0].hammerTeam).toBe(2);

		// From Bob's (p2) perspective the hammer belongs to team 1
		const { matches: bobMatches } = await getTournamentMatchesForUser(OPPONENT_USER);
		expect(bobMatches[0].games[0].rounds[0].hammerTeam).toBe(1);
	});

	it('creates a summary game with totals when no detailed rounds exist (imported tournaments)', async () => {
		mockSnapshot([{ id: 'tour-1', data: makeTournament() }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		const m = matches[0];
		expect(m.games).toHaveLength(1);
		expect(m.games[0].rounds).toHaveLength(0);
		expect(m.games[0].team1Points).toBe(8);
		expect(m.games[0].team2Points).toBe(4);
		expect(m.games[0].winner).toBe(1);
		// total 20s exposed for stats when rounds are missing
		expect(m.total20sTeam1).toBe(3);
		expect(m.total20sTeam2).toBe(1);
	});
});

// ─────────────────────────────────────────────────
// Final stage / brackets
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — final stage', () => {
	it('skips goldBracket when parallelBrackets exist (no duplicated matches)', async () => {
		const finalMatch = makeMatch({ id: 'final-1', startedAt: 9000, completedAt: 9500 });
		const tournament = makeTournament({
			groupStage: undefined,
			finalStage: {
				goldBracket: {
					rounds: [{ roundNumber: 1, name: 'Final', matches: [finalMatch] }],
					totalRounds: 1
				},
				parallelBrackets: [
					{
						name: 'A',
						bracket: { rounds: [{ roundNumber: 1, name: 'Final A', matches: [finalMatch] }], totalRounds: 1 }
					}
				]
			}
		});
		mockSnapshot([{ id: 'tour-1', data: tournament }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		// Only the parallel bracket copy must be returned, not the gold duplicate
		expect(matches).toHaveLength(1);
		expect(matches[0].id).toContain('parallel0');
	});

	it('sorts matches by startTime descending across stages', async () => {
		const tournament = makeTournament({
			groupStage: {
				groups: [
					{
						id: 'g1',
						name: 'Grupo A',
						schedule: [{ roundNumber: 1, matches: [makeMatch({ id: 'old', startedAt: 1000, completedAt: 1500 })] }]
					}
				]
			},
			finalStage: {
				goldBracket: {
					rounds: [
						{ roundNumber: 1, name: 'Final', matches: [makeMatch({ id: 'recent', startedAt: 9000, completedAt: 9500 })] }
					],
					totalRounds: 1
				}
			}
		});
		mockSnapshot([{ id: 'tour-1', data: tournament }]);
		const { matches } = await getTournamentMatchesForUser(USER);

		expect(matches).toHaveLength(2);
		expect(matches[0].id).toContain('recent');
		expect(matches[1].id).toContain('old');
	});
});

// ─────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — errors', () => {
	it('returns empty matches and null IDs when the query fails', async () => {
		getDocsMock.mockRejectedValue(new Error('firestore down'));
		const { matches, completedTournamentIds } = await getTournamentMatchesForUser(USER);

		expect(matches).toEqual([]);
		// null (not an empty Set) so callers keep profile records instead of dropping all
		expect(completedTournamentIds).toBeNull();
	});
});

// ─────────────────────────────────────────────────
// Palmarés metadata
// ─────────────────────────────────────────────────
describe('getTournamentMatchesForUser — tournamentMeta', () => {
	it('returns singles meta with tier and edition', async () => {
		mockSnapshot([
			{
				id: 'tour-1',
				data: makeTournament({
					gameType: 'singles',
					edition: 3,
					rankingConfig: { enabled: true, tier: 'SERIES_25' }
				})
			}
		]);
		const { tournamentMeta } = await getTournamentMatchesForUser(USER);

		const meta = tournamentMeta.get('tour-1');
		expect(meta).toBeDefined();
		expect(meta?.gameType).toBe('singles');
		expect(meta?.tier).toBe('SERIES_25');
		expect(meta?.edition).toBe(3);
		expect(meta?.partnerName).toBeUndefined();
	});

	it('resolves partnerName when the user is the main participant', async () => {
		mockSnapshot([
			{
				id: 'tour-1',
				data: makeTournament({
					gameType: 'doubles',
					participants: [
						{
							id: 'p1',
							name: 'Alice',
							userId: USER,
							status: 'ACTIVE',
							partner: { name: 'Pat', userId: 'pat-1' }
						},
						{ id: 'p2', name: 'Bob', userId: OPPONENT_USER, status: 'ACTIVE' }
					]
				})
			}
		]);
		const { tournamentMeta } = await getTournamentMatchesForUser(USER);
		expect(tournamentMeta.get('tour-1')?.partnerName).toBe('Pat');
		expect(tournamentMeta.get('tour-1')?.partnerUserId).toBe('pat-1');
	});

	it('resolves partnerName when the user is the partner', async () => {
		mockSnapshot([
			{
				id: 'tour-1',
				data: makeTournament({
					gameType: 'doubles',
					participants: [
						{
							id: 'p1',
							name: 'Alice',
							userId: 'main-1',
							status: 'ACTIVE',
							partner: { name: 'Pat', userId: USER }
						},
						{ id: 'p2', name: 'Bob', userId: OPPONENT_USER, status: 'ACTIVE' }
					]
				})
			}
		]);
		const { tournamentMeta } = await getTournamentMatchesForUser(USER);
		expect(tournamentMeta.get('tour-1')?.partnerName).toBe('Alice');
		expect(tournamentMeta.get('tour-1')?.partnerUserId).toBe('main-1');
	});

	it('omits meta for test tournaments', async () => {
		mockSnapshot([
			{ id: 'tour-test', data: makeTournament({ id: 'tour-test', isTest: true }) }
		]);
		const { tournamentMeta } = await getTournamentMatchesForUser(USER);
		expect(tournamentMeta.has('tour-test')).toBe(false);
	});
});
