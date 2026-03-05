import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: true
}));

import { get } from 'svelte/store';
import {
	currentMatch,
	startCurrentMatch,
	resetCurrentMatch,
	addGameToCurrentMatch,
	addRoundToCurrentMatch,
	clearCurrentMatchRounds,
	updateCurrentMatchRound,
	buildCompletedMatch
} from './history';
import type { MatchRound, MatchGame } from '$lib/types/history';

function makeRound(overrides: Partial<MatchRound> = {}): MatchRound {
	return {
		team1Points: 0,
		team2Points: 0,
		team1Twenty: 0,
		team2Twenty: 0,
		hammerTeam: null,
		roundNumber: 1,
		...overrides
	};
}

function makeGame(overrides: Partial<MatchGame> = {}): MatchGame {
	return {
		team1Points: 20,
		team2Points: 15,
		gameNumber: 1,
		rounds: [],
		winner: 1,
		...overrides
	};
}

function makeMatchData() {
	return {
		team1Name: 'Team A',
		team2Name: 'Team B',
		team1Color: '#ff0000',
		team2Color: '#0000ff',
		team1Score: 2,
		team2Score: 1,
		winner: 1 as 1 | 2 | null,
		gameMode: 'points' as const,
		gameType: 'singles' as const,
		matchesToWin: 2,
		games: [makeGame()]
	};
}

beforeEach(() => {
	currentMatch.set(null);
	vi.spyOn(Date, 'now').mockReturnValue(1000000);
});

describe('startCurrentMatch', () => {
	it('creates match with startTime, empty games and rounds', () => {
		startCurrentMatch();
		const match = get(currentMatch);

		expect(match).not.toBeNull();
		expect(match!.startTime).toBe(1000000);
		expect(match!.games).toEqual([]);
		expect(match!.rounds).toEqual([]);
	});
});

describe('resetCurrentMatch', () => {
	it('sets currentMatch to null', () => {
		startCurrentMatch();
		expect(get(currentMatch)).not.toBeNull();

		resetCurrentMatch();
		expect(get(currentMatch)).toBeNull();
	});
});

describe('addGameToCurrentMatch', () => {
	it('appends game and clears rounds when match exists', () => {
		startCurrentMatch();
		// Add some rounds first
		addRoundToCurrentMatch(makeRound({ roundNumber: 1, team1Points: 20 }));
		addRoundToCurrentMatch(makeRound({ roundNumber: 2, team2Points: 15 }));
		expect(get(currentMatch)!.rounds).toHaveLength(2);

		const game = makeGame({ gameNumber: 1 });
		addGameToCurrentMatch(game);

		const match = get(currentMatch)!;
		expect(match.games).toHaveLength(1);
		expect(match.games[0]).toEqual(game);
		expect(match.rounds).toEqual([]); // rounds cleared
	});

	it('creates a new match with the game when no match exists', () => {
		expect(get(currentMatch)).toBeNull();

		const game = makeGame({ gameNumber: 1, team1Points: 25 });
		addGameToCurrentMatch(game);

		const match = get(currentMatch)!;
		expect(match).not.toBeNull();
		expect(match.startTime).toBe(1000000);
		expect(match.games).toHaveLength(1);
		expect(match.games[0]).toEqual(game);
		expect(match.rounds).toEqual([]);
	});
});

describe('addRoundToCurrentMatch', () => {
	it('appends round when match exists', () => {
		startCurrentMatch();

		const round1 = makeRound({ roundNumber: 1, team1Points: 20, team1Twenty: 1 });
		const round2 = makeRound({ roundNumber: 2, team2Points: 15 });
		addRoundToCurrentMatch(round1);
		addRoundToCurrentMatch(round2);

		const match = get(currentMatch)!;
		expect(match.rounds).toHaveLength(2);
		expect(match.rounds[0]).toEqual(round1);
		expect(match.rounds[1]).toEqual(round2);
	});

	it('creates a new match with the round when no match exists', () => {
		expect(get(currentMatch)).toBeNull();

		const round = makeRound({ roundNumber: 1, team1Points: 20 });
		addRoundToCurrentMatch(round);

		const match = get(currentMatch)!;
		expect(match).not.toBeNull();
		expect(match.startTime).toBe(1000000);
		expect(match.games).toEqual([]);
		expect(match.rounds).toHaveLength(1);
		expect(match.rounds[0]).toEqual(round);
	});
});

describe('clearCurrentMatchRounds', () => {
	it('sets rounds to empty array while preserving games', () => {
		startCurrentMatch();
		addRoundToCurrentMatch(makeRound({ roundNumber: 1 }));
		addRoundToCurrentMatch(makeRound({ roundNumber: 2 }));
		const game = makeGame({ gameNumber: 1 });
		addGameToCurrentMatch(game);
		// Add more rounds for the next game
		addRoundToCurrentMatch(makeRound({ roundNumber: 1, team2Points: 20 }));
		expect(get(currentMatch)!.rounds).toHaveLength(1);
		expect(get(currentMatch)!.games).toHaveLength(1);

		clearCurrentMatchRounds();

		const match = get(currentMatch)!;
		expect(match.rounds).toEqual([]);
		expect(match.games).toHaveLength(1); // games preserved
		expect(match.games[0]).toEqual(game);
	});

	it('returns null when currentMatch is null', () => {
		expect(get(currentMatch)).toBeNull();

		clearCurrentMatchRounds();

		expect(get(currentMatch)).toBeNull();
	});
});

describe('updateCurrentMatchRound', () => {
	it('patches the specific round at the given index', () => {
		startCurrentMatch();
		addRoundToCurrentMatch(makeRound({ roundNumber: 1, team1Points: 20, team1Twenty: 0 }));
		addRoundToCurrentMatch(makeRound({ roundNumber: 2, team2Points: 15, team2Twenty: 0 }));

		updateCurrentMatchRound(0, { team1Twenty: 1 });

		const match = get(currentMatch)!;
		expect(match.rounds[0].team1Twenty).toBe(1);
		expect(match.rounds[0].team1Points).toBe(20); // unchanged
		expect(match.rounds[0].roundNumber).toBe(1); // unchanged
		// Second round untouched
		expect(match.rounds[1].team2Points).toBe(15);
		expect(match.rounds[1].team2Twenty).toBe(0);
	});

	it('is a no-op when index is out of bounds', () => {
		startCurrentMatch();
		addRoundToCurrentMatch(makeRound({ roundNumber: 1, team1Points: 20 }));

		const before = get(currentMatch)!;
		updateCurrentMatchRound(5, { team1Points: 99 });

		const after = get(currentMatch)!;
		expect(after.rounds).toHaveLength(1);
		expect(after.rounds[0].team1Points).toBe(20); // unchanged
	});

	it('is a no-op when currentMatch is null', () => {
		expect(get(currentMatch)).toBeNull();

		updateCurrentMatchRound(0, { team1Points: 99 });

		expect(get(currentMatch)).toBeNull();
	});
});

describe('buildCompletedMatch', () => {
	it('generates id, uses startTime from currentMatch, sets endTime and duration', () => {
		// Start match at t=1000000
		startCurrentMatch();
		expect(get(currentMatch)!.startTime).toBe(1000000);

		// Advance time for completion
		vi.spyOn(Date, 'now').mockReturnValue(1500000);
		// Also mock Math.random for predictable id
		vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

		const result = buildCompletedMatch(makeMatchData());

		expect(result.id).toMatch(/^match_1500000_/);
		expect(result.startTime).toBe(1000000); // from currentMatch
		expect(result.endTime).toBe(1500000);
		expect(result.duration).toBe(500000); // 1500000 - 1000000
		expect(result.team1Name).toBe('Team A');
		expect(result.team2Name).toBe('Team B');
		expect(result.winner).toBe(1);

		Math.random.mockRestore?.();
	});

	it('clears currentMatch after building', () => {
		startCurrentMatch();
		expect(get(currentMatch)).not.toBeNull();

		vi.spyOn(Date, 'now').mockReturnValue(1500000);
		buildCompletedMatch(makeMatchData());

		expect(get(currentMatch)).toBeNull();
	});

	it('uses Date.now() for startTime when no currentMatch exists', () => {
		expect(get(currentMatch)).toBeNull();

		vi.spyOn(Date, 'now').mockReturnValue(2000000);
		const result = buildCompletedMatch(makeMatchData());

		// Both startTime and endTime should be Date.now() = 2000000
		expect(result.startTime).toBe(2000000);
		expect(result.endTime).toBe(2000000);
		expect(result.duration).toBe(0);
	});
});
