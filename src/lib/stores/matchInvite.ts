import { writable, derived } from 'svelte/store';
import type { MatchInvite, InviteType } from '$lib/types/matchInvite';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of active invitations by invite type
 * Each type (opponent, my_partner, opponent_partner) can have its own invite
 */
export type ActiveInvitesMap = Record<InviteType, MatchInvite | null>;

// ─────────────────────────────────────────────────────────────────────────────
// Stores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initial state for active invites map
 */
const initialActiveInvites: ActiveInvitesMap = {
	opponent: null,
	my_partner: null,
	opponent_partner: null
};

/**
 * Map of currently active invitations by type
 * Each invite type has its own unique code so we know who's accepting what role
 */
export const activeInvites = writable<ActiveInvitesMap>({ ...initialActiveInvites });

/**
 * Whether the invite modal is open
 */
export const isInviteModalOpen = writable<boolean>(false);

/**
 * Unsubscribe functions for real-time invite listeners, keyed by invite type
 */
const inviteUnsubscribes: Partial<Record<InviteType, () => void>> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Derived Stores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether there's any active pending invitation
 */
export const hasAnyActiveInvite = derived(activeInvites, ($invites) =>
	Object.values($invites).some((invite) => invite?.status === 'pending')
);

/**
 * Get active invite for a specific type
 */
export function getActiveInviteForType(type: InviteType) {
	return derived(activeInvites, ($invites) => $invites[type]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set an active invitation for a specific type
 */
export function setActiveInvite(type: InviteType, invite: MatchInvite | null): void {
	activeInvites.update((invites) => ({
		...invites,
		[type]: invite
	}));
}

/**
 * Clear the active invitation for a specific type and cleanup its listener
 */
export function clearActiveInvite(type: InviteType): void {
	// Cleanup subscription for this type
	if (inviteUnsubscribes[type]) {
		inviteUnsubscribes[type]!();
		delete inviteUnsubscribes[type];
	}

	activeInvites.update((invites) => ({
		...invites,
		[type]: null
	}));
}

/**
 * Clear all active invitations and cleanup all listeners
 */
export function clearAllActiveInvites(): void {
	// Cleanup all subscriptions
	for (const type of Object.keys(inviteUnsubscribes) as InviteType[]) {
		if (inviteUnsubscribes[type]) {
			inviteUnsubscribes[type]!();
			delete inviteUnsubscribes[type];
		}
	}

	activeInvites.set({ ...initialActiveInvites });
}

/**
 * Set the unsubscribe function for a specific invite type listener
 */
export function setInviteUnsubscribe(type: InviteType, unsubscribe: () => void): void {
	// Clean up any existing subscription for this type first
	if (inviteUnsubscribes[type]) {
		inviteUnsubscribes[type]!();
	}
	inviteUnsubscribes[type] = unsubscribe;
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

// ─────────────────────────────────────────────────────────────────────────────
// Legacy compatibility - single invite access (for components not yet updated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use getActiveInviteForType() instead
 * Returns the first active invite found (for backward compatibility)
 */
export const activeInvite = derived(activeInvites, ($invites) => {
	// Return the first non-null invite (prioritize opponent for singles compatibility)
	return $invites.opponent || $invites.my_partner || $invites.opponent_partner || null;
});
