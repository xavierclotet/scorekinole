import type { Timestamp } from 'firebase/firestore';

/**
 * Status of a match invitation
 */
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

/**
 * Type of invitation - determines where the guest joins
 * - 'opponent': Guest joins opposite team as player (default, existing behavior)
 * - 'my_partner': Guest joins host's team as partner
 * - 'opponent_partner': Guest joins opposite team as partner
 */
export type InviteType = 'opponent' | 'my_partner' | 'opponent_partner';

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
	/** Game type: singles (1v1) or doubles (2v2). Optional for backwards compatibility. */
	gameType?: 'singles' | 'doubles';
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

	/** Type of invitation - determines where the guest joins */
	inviteType: InviteType;

	// ─────────────────────────────────────────────────────────────────
	// Guest (invitee) information - populated when accepted
	// ─────────────────────────────────────────────────────────────────

	/** Guest's Firebase user ID (set when accepted) */
	guestUserId?: string;

	/** Guest's display name (set when accepted) */
	guestUserName?: string;

	/** Guest's profile photo URL (set when accepted) */
	guestUserPhotoURL?: string | null;

	/** Which team the guest is assigned to */
	guestTeamNumber?: 1 | 2;

	/** Whether guest joins as player or partner */
	guestRole?: 'player' | 'partner';

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
	/** Type of invitation - defaults to 'opponent' for backwards compatibility */
	inviteType?: InviteType;
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
