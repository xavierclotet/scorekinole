/**
 * Unit tests for TeamCard.svelte derivation logic.
 *
 * No DOM / Svelte mount — tests mirror the pure derivations from the component.
 * These guard the tournament-mode display name to keep it in sync with
 * `currentUserSide`, preventing the asymmetry bug where avatars (derived from
 * context) flipped while names (read from store) did not.
 */
import { describe, it, expect } from 'vitest';

interface TeamLike {
	name: string;
}

interface TournamentCtxLike {
	currentUserSide: 'A' | 'B';
	participantAName: string;
	participantBName: string;
}

// ─── Mirrors `displayName` derived (TeamCard.svelte) ─────────────────────────

function deriveDisplayName(
	team: TeamLike,
	teamNumber: 1 | 2,
	inTournamentMode: boolean,
	ctx: TournamentCtxLike | null
): string {
	if (!inTournamentMode || !ctx) return team.name;
	const isUserSideA = ctx.currentUserSide === 'A';
	return teamNumber === 1
		? (isUserSideA ? ctx.participantAName : ctx.participantBName)
		: (isUserSideA ? ctx.participantBName : ctx.participantAName);
}

// ─── Mirrors `playerName` derived (first half before " / " for doubles) ──────

function derivePlayerName(
	team: TeamLike,
	displayName: string,
	inTournamentMode: boolean
): string {
	if (!inTournamentMode) return team.name;
	if (displayName.includes(' / ')) return displayName.split(' / ')[0];
	return displayName;
}

// ─── Mirrors `partnerName` derived (second half after " / " for doubles) ─────

function derivePartnerName(
	displayName: string,
	inTournamentMode: boolean,
	ctx: TournamentCtxLike | null,
	isDoubles: boolean
): string | undefined {
	if (!inTournamentMode || !ctx) return undefined;
	if (!isDoubles) return undefined;
	if (displayName.includes(' / ')) return displayName.split(' / ')[1];
	return undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deriveDisplayName', () => {
	const team1: TeamLike = { name: 'Stale Store Name 1' };
	const team2: TeamLike = { name: 'Stale Store Name 2' };

	it('falls back to team.name in friendly (non-tournament) mode', () => {
		expect(deriveDisplayName(team1, 1, false, null)).toBe('Stale Store Name 1');
		expect(deriveDisplayName(team2, 2, false, null)).toBe('Stale Store Name 2');
	});

	it('falls back to team.name when tournament context is null', () => {
		expect(deriveDisplayName(team1, 1, true, null)).toBe('Stale Store Name 1');
	});

	it('returns participantAName for team1 when user is on side A', () => {
		const ctx: TournamentCtxLike = {
			currentUserSide: 'A',
			participantAName: 'Xavi',
			participantBName: 'Joana'
		};
		expect(deriveDisplayName(team1, 1, true, ctx)).toBe('Xavi');
		expect(deriveDisplayName(team2, 2, true, ctx)).toBe('Joana');
	});

	it('returns participantBName for team1 when user is on side B', () => {
		const ctx: TournamentCtxLike = {
			currentUserSide: 'B',
			participantAName: 'Xavi',
			participantBName: 'Joana'
		};
		expect(deriveDisplayName(team1, 1, true, ctx)).toBe('Joana');
		expect(deriveDisplayName(team2, 2, true, ctx)).toBe('Xavi');
	});

	it('REGRESSION: name flips when currentUserSide flips, even if store is stale', () => {
		// Models the old asymmetry bug: in the buggy flow, switchSides() ran
		// twice so team.name returned to its original value, but currentUserSide
		// flipped once (avatars swapped, names didn't). With derivation from
		// context, the displayed name follows currentUserSide regardless of the
		// store, eliminating the asymmetry.
		const ctx: TournamentCtxLike = {
			currentUserSide: 'A',
			participantAName: 'Xavi',
			participantBName: 'Joana'
		};
		expect(deriveDisplayName(team1, 1, true, ctx)).toBe('Xavi');

		// User flips currentUserSide — store unchanged (simulating stale state)
		const flippedCtx = { ...ctx, currentUserSide: 'B' as const };
		expect(deriveDisplayName(team1, 1, true, flippedCtx)).toBe('Joana');
	});

	it('handles doubles names with " / " separator unchanged', () => {
		const ctx: TournamentCtxLike = {
			currentUserSide: 'A',
			participantAName: 'Xavi / Marc',
			participantBName: 'Joana / Laura'
		};
		expect(deriveDisplayName(team1, 1, true, ctx)).toBe('Xavi / Marc');
		expect(deriveDisplayName(team2, 2, true, ctx)).toBe('Joana / Laura');
	});
});

describe('derivePlayerName (avatar initials)', () => {
	const team: TeamLike = { name: 'Friendly Name' };

	it('returns team.name in friendly mode', () => {
		expect(derivePlayerName(team, 'ignored', false)).toBe('Friendly Name');
	});

	it('returns full displayName for singles (no " / ")', () => {
		expect(derivePlayerName(team, 'Xavi', true)).toBe('Xavi');
	});

	it('returns first player for doubles', () => {
		expect(derivePlayerName(team, 'Xavi / Marc', true)).toBe('Xavi');
	});
});

describe('derivePartnerName (avatar initials)', () => {
	const ctx: TournamentCtxLike = {
		currentUserSide: 'A',
		participantAName: 'Xavi / Marc',
		participantBName: 'Joana / Laura'
	};

	it('returns undefined in friendly mode', () => {
		expect(derivePartnerName('Xavi / Marc', false, null, true)).toBeUndefined();
	});

	it('returns undefined when context is null', () => {
		expect(derivePartnerName('Xavi / Marc', true, null, true)).toBeUndefined();
	});

	it('returns undefined in singles tournament', () => {
		expect(derivePartnerName('Xavi', true, ctx, false)).toBeUndefined();
	});

	it('returns second player for doubles tournament', () => {
		expect(derivePartnerName('Xavi / Marc', true, ctx, true)).toBe('Marc');
	});

	it('returns undefined when displayName has no " / " separator', () => {
		expect(derivePartnerName('Xavi', true, ctx, true)).toBeUndefined();
	});
});
