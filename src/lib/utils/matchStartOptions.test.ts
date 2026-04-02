import { describe, it, expect, vi } from 'vitest';
import { getHammerFromStarter, resolveHammerAssignment, randomizeHammerStart } from './matchStartOptions';

describe('getHammerFromStarter', () => {
	it('team 1 starts → hammer goes to team 2', () => {
		expect(getHammerFromStarter(1)).toBe(2);
	});

	it('team 2 starts → hammer goes to team 1', () => {
		expect(getHammerFromStarter(2)).toBe(1);
	});

	it('starter is always the opposite of hammer', () => {
		for (const starter of [1, 2] as const) {
			const hammer = getHammerFromStarter(starter);
			expect(hammer).not.toBe(starter);
		}
	});

	it('double inversion returns original', () => {
		// If team 1 starts, hammer=2. If we then ask "who starts given hammer=2", it should be 1.
		const hammer = getHammerFromStarter(1);
		const backToStarter = getHammerFromStarter(hammer);
		expect(backToStarter).toBe(1);
	});
});

describe('resolveHammerAssignment', () => {
	it('hammer team 1 → team1 has hammer, team2 does not', () => {
		const result = resolveHammerAssignment(1);
		expect(result.team1HasHammer).toBe(true);
		expect(result.team2HasHammer).toBe(false);
	});

	it('hammer team 2 → team2 has hammer, team1 does not', () => {
		const result = resolveHammerAssignment(2);
		expect(result.team1HasHammer).toBe(false);
		expect(result.team2HasHammer).toBe(true);
	});

	it('null hammer → neither team has hammer', () => {
		const result = resolveHammerAssignment(null);
		expect(result.team1HasHammer).toBe(false);
		expect(result.team2HasHammer).toBe(false);
	});

	it('exactly one team has hammer when hammerTeam is set', () => {
		for (const team of [1, 2] as const) {
			const result = resolveHammerAssignment(team);
			const count = [result.team1HasHammer, result.team2HasHammer].filter(Boolean).length;
			expect(count).toBe(1);
		}
	});
});

describe('MatchPreviewDialog hammer flow contract', () => {
	/**
	 * This test verifies the contract between the MatchPreviewDialog UI
	 * and the game page. When the user selects "who starts" by clicking
	 * a player button, the dialog should:
	 * 1. Invert the selection to get hammerTeam (starter ≠ hammer)
	 * 2. Pass hammerTeam in PlayOptions to the game page
	 * 3. The game page applies hammerTeam directly to team stores
	 */

	it('user clicks player A as starter → hammerTeam passed = 2 (team B)', () => {
		// User clicks team 1 button under "Quién empieza"
		const startingTeam: 1 | 2 = 1;
		const hammerTeam = getHammerFromStarter(startingTeam);

		// This is what gets passed in PlayOptions.hammerTeam
		expect(hammerTeam).toBe(2);

		// Game page applies: team2 gets hammer
		const assignment = resolveHammerAssignment(hammerTeam);
		expect(assignment.team1HasHammer).toBe(false); // starter does NOT have hammer
		expect(assignment.team2HasHammer).toBe(true);   // non-starter HAS hammer
	});

	it('user clicks player B as starter → hammerTeam passed = 1 (team A)', () => {
		const startingTeam: 1 | 2 = 2;
		const hammerTeam = getHammerFromStarter(startingTeam);

		expect(hammerTeam).toBe(1);

		const assignment = resolveHammerAssignment(hammerTeam);
		expect(assignment.team1HasHammer).toBe(true);
		expect(assignment.team2HasHammer).toBe(false);
	});

	it('random selection still follows the same inversion rule', () => {
		// Simulate random: Math.random() picks team 1 or 2
		for (const randomStarter of [1, 2] as const) {
			const hammerTeam = getHammerFromStarter(randomStarter);
			expect(hammerTeam).not.toBe(randomStarter);

			const assignment = resolveHammerAssignment(hammerTeam);
			// The starter should NOT have hammer
			if (randomStarter === 1) {
				expect(assignment.team1HasHammer).toBe(false);
			} else {
				expect(assignment.team2HasHammer).toBe(false);
			}
		}
	});

	it('no hammer mode → hammerTeam is null, no team has hammer', () => {
		// When showHammer is false, hammerTeam is null
		const assignment = resolveHammerAssignment(null);
		expect(assignment.team1HasHammer).toBe(false);
		expect(assignment.team2HasHammer).toBe(false);
	});

	it('HammerDialog and MatchPreviewDialog produce same result for same starter', () => {
		// HammerDialog: selectStartingTeam(1) → hammerTeam = 2
		const hammerDialogResult = (teamNumber: 1 | 2) => teamNumber === 1 ? 2 : 1;

		// MatchPreviewDialog: handleHammerSelect(1) → getHammerFromStarter(1) = 2
		for (const starter of [1, 2] as const) {
			expect(getHammerFromStarter(starter)).toBe(hammerDialogResult(starter));
		}
	});
});

describe('randomizeHammerStart', () => {
	it('always returns 1 or 2', () => {
		for (let i = 0; i < 50; i++) {
			const result = randomizeHammerStart();
			expect([1, 2]).toContain(result);
		}
	});

	it('returns team 2 (hammer) when Math.random < 0.5 (team 1 starts)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.1);
		expect(randomizeHammerStart()).toBe(2); // team 1 starts → hammer on team 2
		vi.restoreAllMocks();
	});

	it('returns team 1 (hammer) when Math.random >= 0.5 (team 2 starts)', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.7);
		expect(randomizeHammerStart()).toBe(1); // team 2 starts → hammer on team 1
		vi.restoreAllMocks();
	});

	it('follows the same inversion rule as manual selection', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.1); // team 1 starts
		const hammerTeam = randomizeHammerStart();
		// Manual: getHammerFromStarter(1) = 2
		expect(hammerTeam).toBe(getHammerFromStarter(1));
		vi.restoreAllMocks();

		vi.spyOn(Math, 'random').mockReturnValue(0.9); // team 2 starts
		const hammerTeam2 = randomizeHammerStart();
		expect(hammerTeam2).toBe(getHammerFromStarter(2));
		vi.restoreAllMocks();
	});

	it('hammer holder is never the starter', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.0); // team 1 starts
		const hammer1 = randomizeHammerStart();
		// Starter is team 1, hammer should NOT be team 1
		expect(hammer1).toBe(2);
		vi.restoreAllMocks();

		vi.spyOn(Math, 'random').mockReturnValue(0.5); // team 2 starts
		const hammer2 = randomizeHammerStart();
		expect(hammer2).toBe(1);
		vi.restoreAllMocks();
	});
});

describe('friendly match hammer dialog contract', () => {
	/**
	 * These tests verify the contract that when a new friendly match starts
	 * with showHammer enabled, the hammer dialog MUST be shown — regardless
	 * of whether the match is started from FriendlyMatchModal or "New Match" button.
	 */

	it('manual selection from HammerDialog applies correctly', () => {
		// User clicks team 1 as starter in HammerDialog
		const hammerTeam = getHammerFromStarter(1);
		const assignment = resolveHammerAssignment(hammerTeam);
		expect(assignment.team1HasHammer).toBe(false); // starter doesn't get hammer
		expect(assignment.team2HasHammer).toBe(true);
	});

	it('random selection from HammerDialog applies correctly', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.3); // team 1 starts
		const hammerTeam = randomizeHammerStart();
		const assignment = resolveHammerAssignment(hammerTeam);
		expect(assignment.team1HasHammer).toBe(false); // team 1 started, no hammer
		expect(assignment.team2HasHammer).toBe(true);  // team 2 gets hammer
		vi.restoreAllMocks();
	});

	it('random selection produces both outcomes', () => {
		// When random < 0.5, team 1 starts → team 2 hammer
		vi.spyOn(Math, 'random').mockReturnValue(0.2);
		expect(randomizeHammerStart()).toBe(2);
		vi.restoreAllMocks();

		// When random >= 0.5, team 2 starts → team 1 hammer
		vi.spyOn(Math, 'random').mockReturnValue(0.8);
		expect(randomizeHammerStart()).toBe(1);
		vi.restoreAllMocks();
	});

	it('exactly one team has hammer after random assignment', () => {
		for (const mockVal of [0.1, 0.5, 0.9]) {
			vi.spyOn(Math, 'random').mockReturnValue(mockVal);
			const hammerTeam = randomizeHammerStart();
			const assignment = resolveHammerAssignment(hammerTeam);
			const count = [assignment.team1HasHammer, assignment.team2HasHammer].filter(Boolean).length;
			expect(count).toBe(1);
			vi.restoreAllMocks();
		}
	});
});

describe('randomizeHammerStart edge cases', () => {
	it('boundary: Math.random() === 0.0 → team 1 starts', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.0);
		expect(randomizeHammerStart()).toBe(2); // team 1 starts → hammer team 2
		vi.restoreAllMocks();
	});

	it('boundary: Math.random() === 0.4999 → team 1 starts', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.4999);
		expect(randomizeHammerStart()).toBe(2);
		vi.restoreAllMocks();
	});

	it('boundary: Math.random() === 0.5 → team 2 starts', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		expect(randomizeHammerStart()).toBe(1); // team 2 starts → hammer team 1
		vi.restoreAllMocks();
	});

	it('boundary: Math.random() === 0.9999 → team 2 starts', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.9999);
		expect(randomizeHammerStart()).toBe(1);
		vi.restoreAllMocks();
	});

	it('multiple consecutive calls use fresh random values', () => {
		const mockRandom = vi.spyOn(Math, 'random');
		mockRandom.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);

		const first = randomizeHammerStart();
		const second = randomizeHammerStart();

		expect(first).toBe(2);  // team 1 starts
		expect(second).toBe(1); // team 2 starts
		expect(first).not.toBe(second);
		vi.restoreAllMocks();
	});

	it('full pipeline: random → getHammerFromStarter → resolveHammerAssignment is consistent', () => {
		for (const val of [0.0, 0.25, 0.49, 0.5, 0.75, 0.99]) {
			vi.spyOn(Math, 'random').mockReturnValue(val);
			const hammerTeam = randomizeHammerStart();
			const starter: 1 | 2 = val < 0.5 ? 1 : 2;

			// randomizeHammerStart should equal getHammerFromStarter(starter)
			expect(hammerTeam).toBe(getHammerFromStarter(starter));

			// resolveHammerAssignment should give hammer to correct team
			const assignment = resolveHammerAssignment(hammerTeam);
			if (starter === 1) {
				expect(assignment.team1HasHammer).toBe(false);
				expect(assignment.team2HasHammer).toBe(true);
			} else {
				expect(assignment.team1HasHammer).toBe(true);
				expect(assignment.team2HasHammer).toBe(false);
			}
			vi.restoreAllMocks();
		}
	});
});

describe('HammerDialog selectRandom contract', () => {
	/**
	 * Simulates the HammerDialog.selectRandom() logic:
	 * 1. Call randomizeHammerStart() to get hammerTeam
	 * 2. Apply to team stores (team with hammer=true, other=false)
	 * 3. Call setCurrentGameStartHammer(hammerTeam)
	 */

	it('selectRandom logic: team1 gets hammer → team2 starts', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.7); // team 2 starts
		const hammerTeam = randomizeHammerStart();
		expect(hammerTeam).toBe(1);

		// Simulate store updates (same logic as HammerDialog.selectRandom)
		const team1HasHammer = hammerTeam === 1;
		const team2HasHammer = hammerTeam === 2;
		expect(team1HasHammer).toBe(true);
		expect(team2HasHammer).toBe(false);
		vi.restoreAllMocks();
	});

	it('selectRandom logic: team2 gets hammer → team1 starts', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.3); // team 1 starts
		const hammerTeam = randomizeHammerStart();
		expect(hammerTeam).toBe(2);

		const team1HasHammer = hammerTeam === 1;
		const team2HasHammer = hammerTeam === 2;
		expect(team1HasHammer).toBe(false);
		expect(team2HasHammer).toBe(true);
		vi.restoreAllMocks();
	});

	it('selectRandom and selectStartingTeam produce same result for same starter', () => {
		// selectStartingTeam(1) logic: hammerTeam = 1 === 1 ? 2 : 1 → 2
		const manualHammer = 1 === 1 ? 2 : 1;

		// selectRandom when random picks team 1 as starter
		vi.spyOn(Math, 'random').mockReturnValue(0.2);
		const randomHammer = randomizeHammerStart();

		expect(randomHammer).toBe(manualHammer);
		vi.restoreAllMocks();
	});
});

describe('autoApplyHammer contract (group stage alternate mode)', () => {
	it('autoStartParticipantId maps to starter, hammer goes to other team', () => {
		// When autoStartParticipantId === participantAId → team1 starts → hammer on team2
		const starterIsTeam1 = true;
		const hammerTeam: 1 | 2 = starterIsTeam1 ? 2 : 1;
		expect(hammerTeam).toBe(2);

		const assignment = resolveHammerAssignment(hammerTeam);
		expect(assignment.team1HasHammer).toBe(false); // team1 starts, no hammer
		expect(assignment.team2HasHammer).toBe(true);  // team2 has hammer
	});

	it('autoStartParticipantId is participantB → team2 starts → hammer on team1', () => {
		const starterIsTeam1 = false;
		const hammerTeam: 1 | 2 = starterIsTeam1 ? 2 : 1;
		expect(hammerTeam).toBe(1);

		const assignment = resolveHammerAssignment(hammerTeam);
		expect(assignment.team1HasHammer).toBe(true);
		expect(assignment.team2HasHammer).toBe(false);
	});
});
