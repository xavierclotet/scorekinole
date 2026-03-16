import { describe, it, expect } from 'vitest';
import { getHammerFromStarter, resolveHammerAssignment } from './matchStartOptions';

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
