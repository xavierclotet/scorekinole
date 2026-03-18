/**
 * Resolves whether the current user is side A in a tournament match.
 * Falls back to comparing userId with participant IDs if currentUserSide is missing.
 */
export function resolveIsUserSideA(context: {
	currentUserSide?: 'A' | 'B';
	currentUserId?: string;
	participantAId: string;
	participantBId: string;
}): boolean {
	if (context.currentUserSide) return context.currentUserSide === 'A';
	if (context.currentUserId) {
		if (context.currentUserId === context.participantAId) return true;
		if (context.currentUserId === context.participantBId) return false;
	}
	return true; // Default to side A if undetermined
}
