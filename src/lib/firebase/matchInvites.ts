import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { MatchInvite, CreateInviteData, AcceptInviteData } from '$lib/types/matchInvite';
import { PRODUCTION_URL } from '$lib/constants';
import {
	collection,
	doc,
	setDoc,
	getDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	getDocs,
	onSnapshot,
	serverTimestamp,
	Timestamp
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Invite code length (6 characters) */
const INVITE_CODE_LENGTH = 6;

/** Invite expiration time in milliseconds (1 hour) */
const INVITE_EXPIRATION_MS = 60 * 60 * 1000;

/** Characters used for invite codes (uppercase alphanumeric, excluding confusing chars) */
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random invite code (6 uppercase alphanumeric characters)
 * Excludes confusing characters like O, 0, I, 1, L
 */
export function generateInviteCode(): string {
	let code = '';
	for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
		const randomIndex = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
		code += INVITE_CODE_CHARS[randomIndex];
	}
	return code;
}

/**
 * Check if an invite has expired
 */
export function isInviteExpired(invite: MatchInvite): boolean {
	if (!invite.expiresAt) return true;

	const expiresAtMs =
		invite.expiresAt instanceof Timestamp
			? invite.expiresAt.toMillis()
			: (invite.expiresAt as number);

	return Date.now() > expiresAtMs;
}

/**
 * Get the remaining time for an invite in milliseconds
 * Returns 0 if expired
 */
export function getInviteTimeRemaining(invite: MatchInvite): number {
	if (!invite.expiresAt) return 0;

	const expiresAtMs =
		invite.expiresAt instanceof Timestamp
			? invite.expiresAt.toMillis()
			: (invite.expiresAt as number);

	const remaining = expiresAtMs - Date.now();
	return remaining > 0 ? remaining : 0;
}

/**
 * Generate the full invite URL for a given code
 * Always uses production URL to ensure QR codes work when scanned
 */
export function getInviteUrl(inviteCode: string): string {
	// Always use production URL for invites so QR codes work
	return `${PRODUCTION_URL}/join?invite=${inviteCode}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new match invitation
 * Automatically cancels any existing pending invitation from this user
 */
export async function createInvite(data: CreateInviteData): Promise<MatchInvite | null> {
	if (!browser || !isFirebaseEnabled() || !db) {
		console.warn('Firebase disabled - cannot create invite');
		return null;
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated - cannot create invite');
		return null;
	}

	try {
		// Cancel any existing pending invites from this user
		await cancelPendingInvitesForUser(user.id);

		// Generate unique invite code
		let inviteCode = generateInviteCode();
		let attempts = 0;
		const maxAttempts = 10;

		// Ensure code is unique (very unlikely to collide, but check anyway)
		while (attempts < maxAttempts) {
			const existing = await getInviteByCode(inviteCode);
			if (!existing) break;
			inviteCode = generateInviteCode();
			attempts++;
		}

		if (attempts >= maxAttempts) {
			console.error('Failed to generate unique invite code');
			return null;
		}

		// Create invite document
		const inviteRef = doc(collection(db, 'matchInvites'));
		const now = Timestamp.now();
		const expiresAt = Timestamp.fromMillis(now.toMillis() + INVITE_EXPIRATION_MS);

		const invite: MatchInvite = {
			id: inviteRef.id,
			inviteCode,
			createdAt: now,
			expiresAt,
			status: 'pending',
			hostUserId: data.hostUserId,
			hostUserName: data.hostUserName,
			hostUserPhotoURL: data.hostUserPhotoURL,
			hostTeamNumber: data.hostTeamNumber,
			matchContext: data.matchContext
		};

		await setDoc(inviteRef, invite);

		console.log(`Created invite: ${inviteCode}`);
		return invite;
	} catch (error) {
		console.error('Error creating invite:', error);
		return null;
	}
}

/**
 * Get an invitation by its code
 */
export async function getInviteByCode(inviteCode: string): Promise<MatchInvite | null> {
	if (!browser || !isFirebaseEnabled() || !db) {
		return null;
	}

	try {
		const invitesRef = collection(db, 'matchInvites');
		const q = query(invitesRef, where('inviteCode', '==', inviteCode.toUpperCase()));
		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			return null;
		}

		const doc = snapshot.docs[0];
		return { id: doc.id, ...doc.data() } as MatchInvite;
	} catch (error) {
		console.error('Error getting invite by code:', error);
		return null;
	}
}

/**
 * Get an invitation by its document ID
 */
export async function getInviteById(inviteId: string): Promise<MatchInvite | null> {
	if (!browser || !isFirebaseEnabled() || !db) {
		return null;
	}

	try {
		const inviteRef = doc(db, 'matchInvites', inviteId);
		const snapshot = await getDoc(inviteRef);

		if (!snapshot.exists()) {
			return null;
		}

		return { id: snapshot.id, ...snapshot.data() } as MatchInvite;
	} catch (error) {
		console.error('Error getting invite by ID:', error);
		return null;
	}
}

/**
 * Accept an invitation (called by the guest)
 * Returns the updated invitation or null on error
 */
export async function acceptInvite(
	inviteCode: string,
	guestData: AcceptInviteData
): Promise<MatchInvite | null> {
	if (!browser || !isFirebaseEnabled() || !db) {
		console.warn('Firebase disabled - cannot accept invite');
		return null;
	}

	try {
		// Get the invitation
		const invite = await getInviteByCode(inviteCode);

		if (!invite) {
			console.warn('Invite not found:', inviteCode);
			return null;
		}

		// Validate invitation
		if (invite.status !== 'pending') {
			console.warn('Invite is not pending:', invite.status);
			return null;
		}

		if (isInviteExpired(invite)) {
			console.warn('Invite has expired');
			// Update status to expired
			await updateDoc(doc(db, 'matchInvites', invite.id), { status: 'expired' });
			return null;
		}

		if (invite.hostUserId === guestData.guestUserId) {
			console.warn('Cannot accept your own invite');
			return null;
		}

		// Determine guest team number (opposite of host)
		const guestTeamNumber: 1 | 2 = invite.hostTeamNumber === 1 ? 2 : 1;

		// Update invitation with guest info
		const inviteRef = doc(db, 'matchInvites', invite.id);
		await updateDoc(inviteRef, {
			status: 'accepted',
			guestUserId: guestData.guestUserId,
			guestUserName: guestData.guestUserName,
			guestUserPhotoURL: guestData.guestUserPhotoURL,
			guestTeamNumber
		});

		// Return updated invitation
		return {
			...invite,
			status: 'accepted',
			guestUserId: guestData.guestUserId,
			guestUserName: guestData.guestUserName,
			guestUserPhotoURL: guestData.guestUserPhotoURL,
			guestTeamNumber
		};
	} catch (error) {
		console.error('Error accepting invite:', error);
		return null;
	}
}

/**
 * Decline an invitation (called by the guest)
 * Updates the invitation status to 'declined' so the host is notified
 */
export async function declineInvite(
	inviteCode: string,
	guestData: AcceptInviteData
): Promise<boolean> {
	if (!browser || !isFirebaseEnabled() || !db) {
		console.warn('Firebase disabled - cannot decline invite');
		return false;
	}

	try {
		const invite = await getInviteByCode(inviteCode);

		if (!invite) {
			console.warn('Invite not found:', inviteCode);
			return false;
		}

		if (invite.status !== 'pending') {
			console.warn('Invite is not pending:', invite.status);
			return false;
		}

		if (isInviteExpired(invite)) {
			console.warn('Invite has expired');
			return false;
		}

		// Update invitation with declined status and guest info
		const inviteRef = doc(db, 'matchInvites', invite.id);
		await updateDoc(inviteRef, {
			status: 'declined',
			guestUserId: guestData.guestUserId,
			guestUserName: guestData.guestUserName,
			guestUserPhotoURL: guestData.guestUserPhotoURL
		});

		console.log(`Declined invite: ${inviteCode}`);
		return true;
	} catch (error) {
		console.error('Error declining invite:', error);
		return false;
	}
}

/**
 * Cancel an invitation (called by the host)
 * Only cancels if the invite is still pending (not already accepted/declined)
 * Returns 'cancelled' if successfully cancelled, 'already_accepted' if guest already accepted,
 * or false on error
 */
export async function cancelInvite(inviteId: string): Promise<'cancelled' | 'already_accepted' | false> {
	if (!browser || !isFirebaseEnabled() || !db) {
		return false;
	}

	const user = get(currentUser);
	if (!user) {
		return false;
	}

	try {
		const invite = await getInviteById(inviteId);

		if (!invite) {
			console.warn('Invite not found');
			return false;
		}

		// Only host can cancel
		if (invite.hostUserId !== user.id) {
			console.warn('Only the host can cancel this invite');
			return false;
		}

		// Check if invite is still pending - prevent race condition
		if (invite.status !== 'pending') {
			console.warn('Cannot cancel invite that is not pending:', invite.status);
			// If already accepted, return special value so caller can handle appropriately
			if (invite.status === 'accepted') {
				return 'already_accepted';
			}
			return false;
		}

		// Update status to cancelled
		const inviteRef = doc(db, 'matchInvites', inviteId);
		await updateDoc(inviteRef, { status: 'cancelled' });

		console.log(`Cancelled invite: ${invite.inviteCode}`);
		return 'cancelled';
	} catch (error) {
		console.error('Error cancelling invite:', error);
		return false;
	}
}

/**
 * Delete an invitation completely (called by host)
 */
export async function deleteInvite(inviteId: string): Promise<boolean> {
	if (!browser || !isFirebaseEnabled() || !db) {
		return false;
	}

	const user = get(currentUser);
	if (!user) {
		return false;
	}

	try {
		const invite = await getInviteById(inviteId);

		if (!invite) {
			return true; // Already deleted
		}

		// Only host can delete
		if (invite.hostUserId !== user.id) {
			console.warn('Only the host can delete this invite');
			return false;
		}

		await deleteDoc(doc(db, 'matchInvites', inviteId));
		console.log(`Deleted invite: ${invite.inviteCode}`);
		return true;
	} catch (error) {
		console.error('Error deleting invite:', error);
		return false;
	}
}

/**
 * Cancel all pending invites for a user (internal use)
 * Called when creating a new invite to ensure only one active invite per user
 */
async function cancelPendingInvitesForUser(userId: string): Promise<void> {
	if (!browser || !isFirebaseEnabled() || !db) {
		return;
	}

	try {
		const invitesRef = collection(db, 'matchInvites');
		const q = query(
			invitesRef,
			where('hostUserId', '==', userId),
			where('status', '==', 'pending')
		);
		const snapshot = await getDocs(q);

		const cancelPromises = snapshot.docs.map((docSnap) =>
			updateDoc(doc(db, 'matchInvites', docSnap.id), { status: 'cancelled' })
		);

		await Promise.all(cancelPromises);

		if (snapshot.size > 0) {
			console.log(`Cancelled ${snapshot.size} pending invite(s) for user`);
		}
	} catch (error) {
		console.error('Error cancelling pending invites:', error);
	}
}

/**
 * Subscribe to real-time updates for an invitation
 * Used by the host to see when guest accepts
 *
 * @param inviteId - The invitation document ID
 * @param callback - Called when the invitation is updated
 * @returns Unsubscribe function
 */
export function subscribeToInvite(
	inviteId: string,
	callback: (invite: MatchInvite | null) => void
): () => void {
	if (!browser || !isFirebaseEnabled() || !db) {
		callback(null);
		return () => {};
	}

	const inviteRef = doc(db, 'matchInvites', inviteId);

	const unsubscribe = onSnapshot(
		inviteRef,
		(snapshot) => {
			if (!snapshot.exists()) {
				callback(null);
				return;
			}

			const invite = { id: snapshot.id, ...snapshot.data() } as MatchInvite;
			callback(invite);
		},
		(error) => {
			console.error('Error subscribing to invite:', error);
			callback(null);
		}
	);

	return unsubscribe;
}

/**
 * Get the current user's active (pending) invite, if any
 */
export async function getActiveInviteForUser(): Promise<MatchInvite | null> {
	if (!browser || !isFirebaseEnabled() || !db) {
		return null;
	}

	const user = get(currentUser);
	if (!user) {
		return null;
	}

	try {
		const invitesRef = collection(db, 'matchInvites');
		const q = query(
			invitesRef,
			where('hostUserId', '==', user.id),
			where('status', '==', 'pending')
		);
		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			return null;
		}

		// Return the most recent pending invite
		const invite = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MatchInvite;

		// Check if expired
		if (isInviteExpired(invite)) {
			await updateDoc(doc(db, 'matchInvites', invite.id), { status: 'expired' });
			return null;
		}

		return invite;
	} catch (error) {
		console.error('Error getting active invite:', error);
		return null;
	}
}
