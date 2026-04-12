/**
 * Unit tests for GameCustomizePanel.svelte pure logic.
 *
 * No DOM / Svelte mount — tests mirror the pure functions from the component.
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Mirrors handleSwitchSides (GameCustomizePanel.svelte) ───────────────────

function handleSwitchSides(
	switchSides: () => void,
	onSwitchSides?: () => void
) {
	switchSides();
	if (onSwitchSides) onSwitchSides();
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
	it('calls switchSides', () => {
		const switchSides = vi.fn();
		handleSwitchSides(switchSides);
		expect(switchSides).toHaveBeenCalledOnce();
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

	it('calls switchSides before onSwitchSides', () => {
		const order: string[] = [];
		const switchSides = vi.fn(() => order.push('switchSides'));
		const onSwitchSides = vi.fn(() => order.push('onSwitchSides'));
		handleSwitchSides(switchSides, onSwitchSides);
		expect(order).toEqual(['switchSides', 'onSwitchSides']);
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
