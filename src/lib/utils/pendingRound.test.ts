import { describe, it, expect } from 'vitest';
import { reconstructPendingRound } from './pendingRound';

// Regression suite for the "reload during the 20s dialog" bug:
// pendingRoundData lived only in page memory while twentyDialogPending was
// persisted, so after a reload the dialog reopened but closing it dropped the
// round and permanently desynced the lastRoundPoints baseline (no further
// round could ever complete). reconstructPendingRound rebuilds the lost data
// from the score deltas.

describe('reconstructPendingRound', () => {
	it('reconstructs a 2-0 round for team 1', () => {
		expect(reconstructPendingRound(2, 0, { team1: 0, team2: 0 })).toEqual({
			winningTeam: 1,
			team1Points: 2,
			team2Points: 0
		});
	});

	it('reconstructs a 0-2 round for team 2', () => {
		expect(reconstructPendingRound(0, 2, { team1: 0, team2: 0 })).toEqual({
			winningTeam: 2,
			team1Points: 0,
			team2Points: 2
		});
	});

	it('reconstructs a 1-1 tied round', () => {
		expect(reconstructPendingRound(1, 1, { team1: 0, team2: 0 })).toEqual({
			winningTeam: 0,
			team1Points: 1,
			team2Points: 1
		});
	});

	it('uses the baseline from previous rounds, not absolute scores', () => {
		// Score 6-3 with 3 completed rounds totalling 4-3 → pending round is 2-0
		expect(reconstructPendingRound(6, 3, { team1: 4, team2: 3 })).toEqual({
			winningTeam: 1,
			team1Points: 2,
			team2Points: 0
		});
	});

	it('returns null when no round is pending (scores equal baseline)', () => {
		expect(reconstructPendingRound(4, 2, { team1: 4, team2: 2 })).toBeNull();
	});

	it('returns null when the delta is not exactly 2 total points', () => {
		// Mid-round (only 1 point tapped)
		expect(reconstructPendingRound(5, 2, { team1: 4, team2: 2 })).toBeNull();
		// More than a round ahead (corrupted/overshot state)
		expect(reconstructPendingRound(7, 2, { team1: 4, team2: 2 })).toBeNull();
	});

	it('returns null when a delta is negative (scores below baseline)', () => {
		// e.g. user decremented one team below the last-round baseline and the
		// other team is 3 ahead: total delta is 2 but the round data would be
		// -1 / 3, which is not a valid crokinole round.
		expect(reconstructPendingRound(3, 1, { team1: 0, team2: 2 })).toBeNull();
	});

	it('works at non-zero symmetric baselines', () => {
		expect(reconstructPendingRound(3, 3, { team1: 2, team2: 2 })).toEqual({
			winningTeam: 0,
			team1Points: 1,
			team2Points: 1
		});
	});
});
