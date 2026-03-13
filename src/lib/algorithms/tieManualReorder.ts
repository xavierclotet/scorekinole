/**
 * Manual tie reorder utilities
 *
 * Pure functions extracted from QualifierSelection.svelte for:
 * - Moving tied participants up/down (shoot-out resolution)
 * - Confirming current order
 * - Checking if moves are allowed
 *
 * These operate on sorted standings arrays (sorted by position ascending).
 */

import type { GroupStanding } from '$lib/types/tournament';

/**
 * Check if participant can move up (has a tie with the one above)
 */
export function canMoveUp(standings: GroupStanding[], participantId: string): boolean {
	const idx = standings.findIndex(s => s.participantId === participantId);
	if (idx <= 0) return false;
	const current = standings[idx];
	const above = standings[idx - 1];
	return current.tiedWith?.includes(above.participantId) ?? false;
}

/**
 * Check if participant can move down (has a tie with the one below)
 */
export function canMoveDown(standings: GroupStanding[], participantId: string): boolean {
	const idx = standings.findIndex(s => s.participantId === participantId);
	if (idx < 0 || idx >= standings.length - 1) return false;
	const current = standings[idx];
	const below = standings[idx + 1];
	return current.tiedWith?.includes(below.participantId) ?? false;
}

/**
 * Move a participant up (swap with the one above).
 * Returns new standings array, or null if move is not allowed.
 */
export function moveUp(standings: GroupStanding[], participantId: string): GroupStanding[] | null {
	const idx = standings.findIndex(s => s.participantId === participantId);
	if (idx <= 0) return null;

	const result = standings.map(s => ({ ...s, tiedWith: s.tiedWith ? [...s.tiedWith] : undefined }));
	const current = result[idx];
	const above = result[idx - 1];

	if (!current.tiedWith?.includes(above.participantId)) return null;

	// Swap positions
	const tempPos = current.position;
	current.position = above.position;
	above.position = tempPos;

	// Swap array order
	result[idx] = above;
	result[idx - 1] = current;

	// Clear the tie between these two
	current.tiedWith = current.tiedWith?.filter(id => id !== above.participantId);
	above.tiedWith = above.tiedWith?.filter(id => id !== current.participantId);

	// If no more ties, clear tieReason
	if (!current.tiedWith || current.tiedWith.length === 0) {
		current.tiedWith = undefined;
		current.tieReason = undefined;
	}
	if (!above.tiedWith || above.tiedWith.length === 0) {
		above.tiedWith = undefined;
		above.tieReason = undefined;
	}

	return result;
}

/**
 * Move a participant down (swap with the one below).
 * Returns new standings array, or null if move is not allowed.
 */
export function moveDown(standings: GroupStanding[], participantId: string): GroupStanding[] | null {
	const idx = standings.findIndex(s => s.participantId === participantId);
	if (idx < 0 || idx >= standings.length - 1) return null;

	const result = standings.map(s => ({ ...s, tiedWith: s.tiedWith ? [...s.tiedWith] : undefined }));
	const current = result[idx];
	const below = result[idx + 1];

	if (!current.tiedWith?.includes(below.participantId)) return null;

	// Swap positions
	const tempPos = current.position;
	current.position = below.position;
	below.position = tempPos;

	// Swap array order
	result[idx] = below;
	result[idx + 1] = current;

	// Clear the tie between these two
	current.tiedWith = current.tiedWith?.filter(id => id !== below.participantId);
	below.tiedWith = below.tiedWith?.filter(id => id !== current.participantId);

	if (!current.tiedWith || current.tiedWith.length === 0) {
		current.tiedWith = undefined;
		current.tieReason = undefined;
	}
	if (!below.tiedWith || below.tiedWith.length === 0) {
		below.tiedWith = undefined;
		below.tieReason = undefined;
	}

	return result;
}

/**
 * Confirm current order for a participant (clear their tie without moving).
 * Clears ties for this participant and removes references from tied partners.
 * Returns new standings array.
 */
export function confirmOrder(standings: GroupStanding[], participantId: string): GroupStanding[] {
	const result = standings.map(s => ({ ...s, tiedWith: s.tiedWith ? [...s.tiedWith] : undefined }));
	const standing = result.find(s => s.participantId === participantId);
	if (!standing || !standing.tiedWith) return result;

	const tiedWithIds = [...standing.tiedWith];

	// Clear this participant's tie
	standing.tiedWith = undefined;
	standing.tieReason = undefined;

	// Also clear the tie reference from other participants
	for (const otherId of tiedWithIds) {
		const other = result.find(s => s.participantId === otherId);
		if (other && other.tiedWith) {
			other.tiedWith = other.tiedWith.filter(id => id !== participantId);
			if (other.tiedWith.length === 0) {
				other.tiedWith = undefined;
				other.tieReason = undefined;
			}
		}
	}

	return result;
}

/**
 * Check if any standings have unresolved ties
 */
export function hasUnresolvedTies(standings: GroupStanding[]): boolean {
	return standings.some(s => s.tiedWith && s.tiedWith.length > 0 && s.tieReason === 'unresolved');
}
