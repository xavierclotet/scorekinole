/**
 * Unit tests for GameCustomizePanel.svelte pure logic.
 *
 * No DOM / Svelte mount — tests mirror the pure functions from the component.
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Mirrors handleSwitchSides (GameCustomizePanel.svelte) ───────────────────
//
// REGRESSION GUARD (v2.5.32):
// The previous implementation called switchSides() AND onSwitchSides(),
// which caused a double swap in tournament mode (parent's onSwitchSides
// also calls switchSides() internally). Net effect: team.name appeared
// unchanged while avatars (derived from context) flipped — visible asymmetry.
//
// New contract: when a parent provides onSwitchSides, the panel delegates
// completely. Otherwise, it performs the swap locally.

function handleSwitchSides(
	switchSides: () => void,
	onSwitchSides?: () => void
) {
	if (onSwitchSides) {
		onSwitchSides();
	} else {
		switchSides();
	}
}

// ─── Mirrors setNameSize (GameCustomizePanel.svelte) ─────────────────────────

type NameSize = 'small' | 'medium' | 'large';

interface Settings {
	nameSize: NameSize;
	[key: string]: unknown;
}

function applyNameSize(current: Settings, size: NameSize): Settings {
	return { ...current, nameSize: size };
}

// ─── Mirrors setTeamColor (GameCustomizePanel.svelte) ────────────────────────

interface TeamState {
	color: string;
	name: string;
}

function applyTeamColor(
	team: TeamState,
	teamNumber: 1 | 2,
	targetTeam: 1 | 2,
	color: string
): TeamState {
	if (teamNumber === targetTeam) {
		return { ...team, color };
	}
	return team;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleSwitchSides', () => {
	it('calls switchSides when no callback is provided (friendly mode)', () => {
		const switchSides = vi.fn();
		handleSwitchSides(switchSides);
		expect(switchSides).toHaveBeenCalledOnce();
	});

	it('does NOT call switchSides when a callback is provided (tournament mode)', () => {
		// Regression: previously called switchSides() AND the callback,
		// causing parent's switchSides() to fire a second time → no net swap.
		const switchSides = vi.fn();
		const onSwitchSides = vi.fn();
		handleSwitchSides(switchSides, onSwitchSides);
		expect(switchSides).not.toHaveBeenCalled();
	});

	it('calls onSwitchSides callback when provided', () => {
		const switchSides = vi.fn();
		const onSwitchSides = vi.fn();
		handleSwitchSides(switchSides, onSwitchSides);
		expect(onSwitchSides).toHaveBeenCalledOnce();
	});

	it('does NOT crash when onSwitchSides is not provided', () => {
		const switchSides = vi.fn();
		expect(() => handleSwitchSides(switchSides, undefined)).not.toThrow();
	});

	it('integration: parent+panel produces exactly ONE swap end-to-end', () => {
		// Models the real flow: parent's handler internally calls switchSides
		// + flips currentUserSide. Panel's handler must defer to parent only.
		// If both ran switchSides, we'd see 2 calls = no net change.
		const switchSides = vi.fn();
		let currentUserSide: 'A' | 'B' = 'A';

		const parentHandleSwitchSides = () => {
			switchSides();
			currentUserSide = currentUserSide === 'A' ? 'B' : 'A';
		};

		// Simulate user clicking "Switch sides" in the modal (tournament mode)
		handleSwitchSides(switchSides, parentHandleSwitchSides);

		expect(switchSides).toHaveBeenCalledOnce();
		expect(currentUserSide).toBe('B');
	});
});

describe('applyNameSize', () => {
	it('updates nameSize in settings', () => {
		const settings: Settings = { nameSize: 'medium' };
		expect(applyNameSize(settings, 'small').nameSize).toBe('small');
		expect(applyNameSize(settings, 'large').nameSize).toBe('large');
	});

	it('returns a new object (immutable update)', () => {
		const settings: Settings = { nameSize: 'medium' };
		const result = applyNameSize(settings, 'small');
		expect(result).not.toBe(settings);
		expect(settings.nameSize).toBe('medium'); // original unchanged
	});

	it('preserves other settings fields', () => {
		const settings: Settings = { nameSize: 'medium', someOtherProp: 42 };
		const result = applyNameSize(settings, 'large');
		expect(result.someOtherProp).toBe(42);
	});

	it('is idempotent: setting same size twice yields same result', () => {
		const settings: Settings = { nameSize: 'medium' };
		const once = applyNameSize(settings, 'large');
		const twice = applyNameSize(once, 'large');
		expect(twice.nameSize).toBe('large');
	});
});

describe('applyTeamColor', () => {
	const baseTeam: TeamState = { color: '#ffffff', name: 'Team A' };

	it('updates color when teamNumber matches targetTeam', () => {
		const result = applyTeamColor(baseTeam, 1, 1, '#ff0000');
		expect(result.color).toBe('#ff0000');
	});

	it('does NOT update color when teamNumber does not match targetTeam', () => {
		const result = applyTeamColor(baseTeam, 2, 1, '#ff0000');
		expect(result.color).toBe('#ffffff');
	});

	it('returns a new object on update (immutable)', () => {
		const result = applyTeamColor(baseTeam, 1, 1, '#00ff00');
		expect(result).not.toBe(baseTeam);
	});

	it('returns the same object reference when no update applied', () => {
		const result = applyTeamColor(baseTeam, 2, 1, '#00ff00');
		expect(result).toBe(baseTeam);
	});

	it('preserves team name when updating color', () => {
		const result = applyTeamColor(baseTeam, 1, 1, '#abc123');
		expect(result.name).toBe('Team A');
	});

	it('works for team 2 updates', () => {
		const team2: TeamState = { color: '#0000ff', name: 'Team B' };
		const result = applyTeamColor(team2, 2, 2, '#123456');
		expect(result.color).toBe('#123456');
	});
});
