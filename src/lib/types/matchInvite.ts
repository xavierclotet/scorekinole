import type { Timestamp } from 'firebase/firestore';

/**
 * Status of a match invitation
 */
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

/**
 * Match context stored with the invitation
 * Used to display match configuration to the invited player
 */
export interface MatchInviteContext {
	team1Name: string;
	team1Color: string;
	team2Name: string;
	team2Color: string;
	gameMode: 'points' | 'rounds';
	pointsToWin: number;
	roundsToPlay: number;
	matchesToWin: number;
}

/**
 * Represents a match invitation for friendly matches
 *
 * Flow:
 * 1. Host creates invitation → generates 6-char code
 * 2. Guest scans QR or enters code → accepts invitation
 * 3. Guest's userId is stored in the invitation
 * 4. When match completes, both userIds are saved to /matches
 *
 * Expiration: 1 hour from creation
 */
export interface MatchInvite {
	/** Document ID (auto-generated) */
	id: string;

	/** 6-character alphanumeric invite code (e.g., "ETNP6A") */
	inviteCode: string;

	/** When the invitation was created */
	createdAt: Timestamp;

	/** When the invitation expires (1 hour from creation) */
	expiresAt: Timestamp;

	/** Current status of the invitation */
	status: InviteStatus;

	// ─────────────────────────────────────────────────────────────────
	// Host (inviter) information
	// ─────────────────────────────────────────────────────────────────

	/** Host's Firebase user ID */
	hostUserId: string;

	/** Host's display name */
	hostUserName: string;

	/** Host's profile photo URL (can be null) */
	hostUserPhotoURL: string | null;

	/** Which team the host assigned themselves to (1 or 2) */
	hostTeamNumber: 1 | 2;

	// ─────────────────────────────────────────────────────────────────
	// Guest (invitee) information - populated when accepted
	// ─────────────────────────────────────────────────────────────────

	/** Guest's Firebase user ID (set when accepted) */
	guestUserId?: string;

	/** Guest's display name (set when accepted) */
	guestUserName?: string;

	/** Guest's profile photo URL (set when accepted) */
	guestUserPhotoURL?: string | null;

	/** Which team the guest is assigned to (opposite of host) */
	guestTeamNumber?: 1 | 2;

	// ─────────────────────────────────────────────────────────────────
	// Match context
	// ─────────────────────────────────────────────────────────────────

	/** Match configuration to display to invited player */
	matchContext: MatchInviteContext;
}

/**
 * Data needed to create a new invitation
 */
export interface CreateInviteData {
	hostUserId: string;
	hostUserName: string;
	hostUserPhotoURL: string | null;
	hostTeamNumber: 1 | 2;
	matchContext: MatchInviteContext;
}

/**
 * Data needed to accept an invitation
 */
export interface AcceptInviteData {
	guestUserId: string;
	guestUserName: string;
	guestUserPhotoURL: string | null;
}
