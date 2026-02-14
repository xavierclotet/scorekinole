import { writable, derived } from 'svelte/store';
import type { MatchInvite } from '$lib/types/matchInvite';

// ─────────────────────────────────────────────────────────────────────────────
// Stores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The currently active invitation created by the host
 * Used to track and display invitation status in real-time
 */
export const activeInvite = writable<MatchInvite | null>(null);

/**
 * Whether the invite modal is open
 */
export const isInviteModalOpen = writable<boolean>(false);

/**
 * Unsubscribe function for the real-time invite listener
 * Stored here so we can clean up when needed
 */
let inviteUnsubscribe: (() => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Derived Stores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether there's an active pending invitation
 */
export const hasActiveInvite = derived(activeInvite, ($invite) => $invite?.status === 'pending');

/**
 * Whether the active invitation has been accepted
 */
export const isInviteAccepted = derived(activeInvite, ($invite) => $invite?.status === 'accepted');

/**
 * The guest info from an accepted invitation
 */
export const acceptedGuest = derived(activeInvite, ($invite) => {
	if ($invite?.status !== 'accepted') return null;
	return {
		userId: $invite.guestUserId,
		userName: $invite.guestUserName,
		userPhotoURL: $invite.guestUserPhotoURL,
		teamNumber: $invite.guestTeamNumber
	};
});

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the active invitation and optionally start listening for updates
 */
export function setActiveInvite(invite: MatchInvite | null): void {
	activeInvite.set(invite);
}

/**
 * Clear the active invitation and cleanup any listeners
 */
export function clearActiveInvite(): void {
	if (inviteUnsubscribe) {
		inviteUnsubscribe();
		inviteUnsubscribe = null;
	}
	activeInvite.set(null);
}

/**
 * Set the unsubscribe function for the invite listener
 */
export function setInviteUnsubscribe(unsubscribe: () => void): void {
	// Clean up any existing subscription first
	if (inviteUnsubscribe) {
		inviteUnsubscribe();
	}
	inviteUnsubscribe = unsubscribe;
}

/**
 * Open the invite modal
 */
export function openInviteModal(): void {
	isInviteModalOpen.set(true);
}

/**
 * Close the invite modal
 */
export function closeInviteModal(): void {
	isInviteModalOpen.set(false);
}
