import { db, auth, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { MatchHistory } from '$lib/types/history';
import {
	collection,
	doc,
	setDoc,
	getDocs,
	getDoc,
	deleteDoc,
	updateDoc,
	query,
	where,
	serverTimestamp
} from 'firebase/firestore';

/**
 * Generate a unique match ID
 */
function generateMatchId(): string {
	return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sync match to Firestore (root-level matches collection)
 */
export async function syncMatchToCloud(
	match: MatchHistory,
	options: { manualTeamSelection?: 1 | 2 | null } = {}
): Promise<MatchHistory> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - match not synced to cloud');
		return { ...match, syncStatus: 'local' };
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated - match not synced');
		return { ...match, syncStatus: 'local' };
	}

	try {
		const matchId = match.id || generateMatchId();
		const matchRef = doc(db!, 'matches', matchId);

		// Check if document already exists (ignore permission errors for non-existent docs)
		let docExists = false;
		try {
			const docSnap = await getDoc(matchRef);
			docExists = docSnap.exists();
		} catch (err) {
			// Document doesn't exist or user doesn't have read permission yet
			console.log('⚠️ Could not check if document exists (will attempt CREATE)');
		}

		// Debug: log user info and Firebase auth state
		console.log('🔍 Syncing match with user:', {
			userId: user.id,
			userName: user.name,
			userEmail: user.email,
			firebaseAuthCurrentUser: auth?.currentUser?.uid,
			documentExists: docExists,
			operation: docExists ? 'UPDATE' : 'CREATE'
		});

		// Detect which team the logged-in user played on
		const team1Name = match.team1Name || '';
		const team2Name = match.team2Name || '';

		let team1UserId = match.players?.team1?.userId || null;
		let team2UserId = match.players?.team2?.userId || null;

		// Priority 1: Manual team selection (explicit user choice)
		if (options.manualTeamSelection !== undefined) {
			if (options.manualTeamSelection === 1) {
				team1UserId = user.id;
				team2UserId = null;
			} else if (options.manualTeamSelection === 2) {
				team1UserId = null;
				team2UserId = user.id;
			}
			// else if null: user didn't play, leave both as null
		}
		// Priority 2: Auto-detection based on player name (only if not already set)
		else if (!team1UserId && !team2UserId) {
			// If user's name matches team1, user played as team1
			if (user.name && team1Name === user.name) {
				team1UserId = user.id;
			}
			// If user's name matches team2, user played as team2
			else if (user.name && team2Name === user.name) {
				team2UserId = user.id;
			}
		}

		const matchData: MatchHistory = {
			...match,
			id: matchId,
			savedBy: {
				userId: user.id,
				userName: user.name || 'Unknown',
				userEmail: user.email || ''
			},
			players: {
				team1: {
					name: team1Name,
					userId: team1UserId
				},
				team2: {
					name: team2Name,
					userId: team2UserId
				}
			},
			syncStatus: 'synced'
		};

		// Prepare data for Firestore
		const firestoreData = {
			...matchData,
			syncedAt: serverTimestamp(),
			status: 'active' // Mark as active (not deleted)
		};

		// Debug: log data being sent to Firestore
		console.log('📤 Sending to Firestore:', {
			matchId,
			savedBy: matchData.savedBy,
			players: matchData.players,
			status: 'active',
			allKeys: Object.keys(firestoreData),
			fullData: firestoreData
		});

		console.log('🔍 Full Firestore data:', JSON.stringify(firestoreData, null, 2));
		console.log('🔍 Verifying savedBy.userId path:', {
			savedByExists: !!firestoreData.savedBy,
			userIdExists: !!firestoreData.savedBy?.userId,
			savedByUserId: firestoreData.savedBy?.userId,
			authUid: auth?.currentUser?.uid,
			match: firestoreData.savedBy?.userId === auth?.currentUser?.uid
		});

		await setDoc(matchRef, firestoreData);
		console.log('✅ Match synced to cloud:', matchId);

		return matchData;
	} catch (error) {
		console.error('❌ Error syncing match:', error);
		return { ...match, syncStatus: 'error' as const };
	}
}

/**
 * Get all active (non-deleted) matches from Firestore where current user played
 */
export async function getMatchesFromCloud(): Promise<MatchHistory[]> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - returning empty cloud matches');
		return [];
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated');
		return [];
	}

	try {
		const matchesRef = collection(db!, 'matches');
		const matchesMap = new Map<string, MatchHistory>();

		// Query 1: Matches where user played as team1 (only active)
		try {
			const q1 = query(
				matchesRef,
				where('players.team1.userId', '==', user.id),
				where('status', '==', 'active')
			);
			const snapshot1 = await getDocs(q1);
			snapshot1.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query team1 failed:', err.message);
		}

		// Query 2: Matches where user played as team2 (only active)
		try {
			const q2 = query(
				matchesRef,
				where('players.team2.userId', '==', user.id),
				where('status', '==', 'active')
			);
			const snapshot2 = await getDocs(q2);
			snapshot2.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query team2 failed:', err.message);
		}

		// Query 3: Fallback by savedBy.userId (for matches saved by this user)
		try {
			const q3 = query(
				matchesRef,
				where('savedBy.userId', '==', user.id),
				where('status', '==', 'active')
			);
			const snapshot3 = await getDocs(q3);
			snapshot3.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query savedBy failed:', err.message);
		}

		// Convert Map to Array and sort by startTime (descending)
		const matches = Array.from(matchesMap.values()).sort((a, b) => {
			return b.startTime - a.startTime;
		});

		console.log(`✅ Retrieved ${matches.length} active matches from cloud`);
		return matches;
	} catch (error) {
		console.error('❌ Error getting matches from cloud:', error);
		return [];
	}
}

/**
 * Sync local matches to cloud
 */
export async function syncLocalMatchesToCloud(
	localMatches: MatchHistory[],
	options?: { manualTeamSelection?: 1 | 2 | null }
): Promise<MatchHistory[]> {
	if (!browser || !isFirebaseEnabled() || !get(currentUser)) {
		return localMatches.map((m) => ({ ...m, syncStatus: 'local' }));
	}

	const syncedMatches: MatchHistory[] = [];

	for (const match of localMatches) {
		// Skip already synced matches
		if (match.syncStatus === 'synced') {
			syncedMatches.push(match);
			continue;
		}

		const syncedMatch = await syncMatchToCloud(match, options);
		syncedMatches.push(syncedMatch);
	}

	console.log(`✅ Synced ${syncedMatches.length} matches to cloud`);
	return syncedMatches;
}

/**
 * Soft delete match from Firestore (mark as deleted)
 */
export async function softDeleteMatchFromCloud(matchId: string): Promise<boolean> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - match not deleted from cloud');
		return true;
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated');
		return false;
	}

	try {
		const matchRef = doc(db!, 'matches', matchId);
		await updateDoc(matchRef, {
			status: 'deleted',
			deletedAt: serverTimestamp(),
			deletedBy: user.id
		});
		console.log('✅ Match marked as deleted:', matchId);
		return true;
	} catch (error) {
		console.error('❌ Error soft deleting match:', error);
		return false;
	}
}

/**
 * Permanently delete match from Firestore
 */
export async function permanentlyDeleteMatchFromCloud(matchId: string): Promise<boolean> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - match not deleted from cloud');
		return true;
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated');
		return false;
	}

	try {
		const matchRef = doc(db!, 'matches', matchId);
		await deleteDoc(matchRef);
		console.log('✅ Match permanently deleted from cloud:', matchId);
		return true;
	} catch (error) {
		console.error('❌ Error permanently deleting match from cloud:', error);
		return false;
	}
}

/**
 * Restore deleted match
 */
export async function restoreMatchFromCloud(matchId: string): Promise<boolean> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled');
		return false;
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated');
		return false;
	}

	try {
		const matchRef = doc(db!, 'matches', matchId);
		await updateDoc(matchRef, {
			status: 'active',
			restoredAt: serverTimestamp(),
			restoredBy: user.id
		});
		console.log('✅ Match restored:', matchId);
		return true;
	} catch (error) {
		console.error('❌ Error restoring match:', error);
		return false;
	}
}

/**
 * Get deleted matches from Firestore where current user played
 */
export async function getDeletedMatchesFromCloud(): Promise<MatchHistory[]> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - returning empty deleted matches');
		return [];
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated');
		return [];
	}

	try {
		const matchesRef = collection(db!, 'matches');
		const matchesMap = new Map<string, MatchHistory>();

		// Query 1: Deleted matches where user played as team1
		try {
			const q1 = query(
				matchesRef,
				where('players.team1.userId', '==', user.id),
				where('status', '==', 'deleted')
			);
			const snapshot1 = await getDocs(q1);
			snapshot1.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query deleted team1 failed:', err.message);
		}

		// Query 2: Deleted matches where user played as team2
		try {
			const q2 = query(
				matchesRef,
				where('players.team2.userId', '==', user.id),
				where('status', '==', 'deleted')
			);
			const snapshot2 = await getDocs(q2);
			snapshot2.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query deleted team2 failed:', err.message);
		}

		// Query 3: Fallback by savedBy.userId
		try {
			const q3 = query(
				matchesRef,
				where('savedBy.userId', '==', user.id),
				where('status', '==', 'deleted')
			);
			const snapshot3 = await getDocs(q3);
			snapshot3.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query deleted savedBy failed:', err.message);
		}

		const matches = Array.from(matchesMap.values()).sort((a, b) => {
			return b.startTime - a.startTime;
		});

		console.log(`✅ Retrieved ${matches.length} deleted matches from cloud`);
		return matches;
	} catch (error) {
		console.error('❌ Error getting deleted matches:', error);
		return [];
	}
}

/**
 * Check if match needs team confirmation before syncing
 */
export function matchNeedsTeamConfirmation(match: MatchHistory): boolean {
	// If match is already synced, no confirmation needed
	if (match.syncStatus === 'synced') {
		return false;
	}

	// Check if both teams have no userId assigned
	const team1UserId = match.players?.team1?.userId;
	const team2UserId = match.players?.team2?.userId;

	// Needs confirmation if both userIds are null/undefined
	return !team1UserId && !team2UserId;
}
