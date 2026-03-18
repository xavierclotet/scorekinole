import { describe, it, expect } from 'vitest';
import { resolveIsUserSideA } from './tournamentSideMapping';

describe('resolveIsUserSideA', () => {
	const baseContext = {
		participantAId: 'user-A',
		participantBId: 'user-B'
	};

	// Bug #2: currentUserSide undefined caused all side mappings to invert

	it('returns true when currentUserSide is A', () => {
		expect(resolveIsUserSideA({ ...baseContext, currentUserSide: 'A' })).toBe(true);
	});

	it('returns false when currentUserSide is B', () => {
		expect(resolveIsUserSideA({ ...baseContext, currentUserSide: 'B' })).toBe(false);
	});

	it('falls back to participantAId match when currentUserSide is undefined', () => {
		expect(resolveIsUserSideA({
			...baseContext,
			currentUserId: 'user-A'
			// currentUserSide not set
		})).toBe(true);
	});

	it('falls back to participantBId match when currentUserSide is undefined', () => {
		expect(resolveIsUserSideA({
			...baseContext,
			currentUserId: 'user-B'
		})).toBe(false);
	});

	it('defaults to true (side A) when no side info is determinable', () => {
		expect(resolveIsUserSideA({
			...baseContext
			// No currentUserSide, no currentUserId
		})).toBe(true);
	});

	it('defaults to true when currentUserId matches neither participant', () => {
		expect(resolveIsUserSideA({
			...baseContext,
			currentUserId: 'user-unknown'
		})).toBe(true);
	});

	it('prefers currentUserSide over userId fallback', () => {
		// currentUserSide says B, but userId matches A — trust currentUserSide
		expect(resolveIsUserSideA({
			...baseContext,
			currentUserSide: 'B',
			currentUserId: 'user-A'
		})).toBe(false);
	});
});
