import { db, auth, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { MatchHistory, MatchGame, MatchRound } from '$lib/types/history';
import type { Tournament, GroupMatch, BracketMatch, TournamentParticipant } from '$lib/types/tournament';
import { getParticipantDisplayName } from '$lib/types/tournament';
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
	serverTimestamp,
	Timestamp
} from 'firebase/firestore';

/**
 * Generate a unique match ID
 */
function generateMatchId(): string {
	return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save a friendly match directly to Firestore
 * Only saves if at least one player has a userId
 * @returns The saved match with syncStatus, or null if not saved
 */
export async function saveFriendlyMatchToFirestore(
	match: MatchHistory,
	team1UserId: string | null | undefined,
	team2UserId: string | null | undefined,
	team1PartnerUserId?: string | null,
	team2PartnerUserId?: string | null,
	team1PartnerName?: string,
	team2PartnerName?: string
): Promise<MatchHistory | null> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - match not saved');
		return null;
	}

	// Only save if at least one player is registered (including partners)
	if (!team1UserId && !team2UserId && !team1PartnerUserId && !team2PartnerUserId) {
		console.log('No registered players - match not saved to cloud');
		return null;
	}

	// Get current user for savedBy field (if logged in)
	const user = get(currentUser);

	try {
		const matchId = match.id || generateMatchId();
		const matchRef = doc(db!, 'matches', matchId);

		const matchData: MatchHistory = {
			...match,
			id: matchId,
			savedBy: user
				? {
						userId: user.id,
						userName: user.name || 'Unknown',
						userEmail: user.email || ''
					}
				: undefined,
			players: {
				team1: {
					name: match.team1Name,
					userId: team1UserId || null,
					...(team1PartnerName && {
						partner: {
							name: team1PartnerName,
							userId: team1PartnerUserId || null
						}
					})
				},
				team2: {
					name: match.team2Name,
					userId: team2UserId || null,
					...(team2PartnerName && {
						partner: {
							name: team2PartnerName,
							userId: team2PartnerUserId || null
						}
					})
				}
			},
			syncStatus: 'synced'
		};

		const firestoreData = {
			...matchData,
			syncedAt: serverTimestamp(),
			status: 'active'
		};

		await setDoc(matchRef, firestoreData);
		console.log('✅ Friendly match saved to Firestore:', matchId);

		return matchData;
	} catch (error) {
		console.error('❌ Error saving friendly match:', error);
		return null;
	}
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

		// Query 3: Matches where user played as partner on team1 (only active)
		try {
			const q3 = query(
				matchesRef,
				where('players.team1.partner.userId', '==', user.id),
				where('status', '==', 'active')
			);
			const snapshot3 = await getDocs(q3);
			snapshot3.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query team1 partner failed:', err.message);
		}

		// Query 4: Matches where user played as partner on team2 (only active)
		try {
			const q4 = query(
				matchesRef,
				where('players.team2.partner.userId', '==', user.id),
				where('status', '==', 'active')
			);
			const snapshot4 = await getDocs(q4);
			snapshot4.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query team2 partner failed:', err.message);
		}

		// Query 5: Fallback by savedBy.userId (for matches saved by this user)
		try {
			const q5 = query(
				matchesRef,
				where('savedBy.userId', '==', user.id),
				where('status', '==', 'active')
			);
			const snapshot5 = await getDocs(q5);
			snapshot5.forEach((docSnap) => {
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

		// Query 3: Deleted matches where user played as partner on team1
		try {
			const q3 = query(
				matchesRef,
				where('players.team1.partner.userId', '==', user.id),
				where('status', '==', 'deleted')
			);
			const snapshot3 = await getDocs(q3);
			snapshot3.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query deleted team1 partner failed:', err.message);
		}

		// Query 4: Deleted matches where user played as partner on team2
		try {
			const q4 = query(
				matchesRef,
				where('players.team2.partner.userId', '==', user.id),
				where('status', '==', 'deleted')
			);
			const snapshot4 = await getDocs(q4);
			snapshot4.forEach((docSnap) => {
				matchesMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as MatchHistory);
			});
		} catch (err: any) {
			console.warn('Query deleted team2 partner failed:', err.message);
		}

		// Query 5: Fallback by savedBy.userId
		try {
			const q5 = query(
				matchesRef,
				where('savedBy.userId', '==', user.id),
				where('status', '==', 'deleted')
			);
			const snapshot5 = await getDocs(q5);
			snapshot5.forEach((docSnap) => {
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

/**
 * Get all tournament matches for the current user
 * Queries tournaments where user participated and extracts their completed matches
 */
export async function getUserTournamentMatches(): Promise<MatchHistory[]> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled - returning empty tournament matches');
		return [];
	}

	const user = get(currentUser);
	if (!user) {
		console.warn('No user authenticated');
		return [];
	}

	try {
		const tournamentsRef = collection(db!, 'tournaments');
		const snapshot = await getDocs(tournamentsRef);

		const tournamentMatches: MatchHistory[] = [];



		snapshot.forEach((docSnap) => {
			const data = docSnap.data();

			// Only include completed tournaments
			if (data.status !== 'COMPLETED') {

				return;
			}

			// Convert timestamps
			const tournament: Tournament = {
				...data,
				createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
				startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
				completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
				updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
			} as Tournament;

			// Find user's participant(s) in this tournament
			const userParticipants = tournament.participants?.filter(
				(p: TournamentParticipant) => p.userId === user.id || p.partner?.userId === user.id
			) || [];

			if (userParticipants.length === 0) {
				return; // User not in this tournament
			}

			const userParticipantIds = new Set(userParticipants.map((p: TournamentParticipant) => p.id));
			const isDoubles = tournament.gameType === 'doubles';



			// Helper to get participant name
			const getParticipantName = (participantId: string): string => {
				const participant = tournament.participants?.find((p: TournamentParticipant) => p.id === participantId);
				return participant ? getParticipantDisplayName(participant, isDoubles) : 'Unknown';
			};

			// Helper to check if participant exists in tournament
			const participantExists = (participantId: string): boolean => {
				if (!participantId || participantId === 'BYE') return false;
				return tournament.participants?.some((p: TournamentParticipant) => p.id === participantId) ?? false;
			};

			// Helper to convert tournament match to MatchHistory
			const convertMatch = (
				match: GroupMatch | BracketMatch,
				phase: string,
				phaseDetails?: string,
				uniqueContext?: string
			): MatchHistory | null => {
				// Only include COMPLETED matches - exclude WALKOVER entirely (no real play)
				if (match.status !== 'COMPLETED') {
					return null;
				}

				// Skip matches without valid participants
				if (!match.participantA || !match.participantB) {
					return null;
				}

				// Skip BYE matches - these aren't real matches
				if (match.participantA === 'BYE' || match.participantB === 'BYE') {
					return null;
				}

				// Skip matches where either participant doesn't exist in the tournament
				// (these are also BYE matches with invalid IDs)
				if (!participantExists(match.participantA) || !participantExists(match.participantB)) {
					return null;
				}

				// Check if user played in this match
				const userIsA = userParticipantIds.has(match.participantA);
				const userIsB = userParticipantIds.has(match.participantB);
				if (!userIsA && !userIsB) {
					return null;
				}

				// Determine team positions from user's perspective
				// User's team is always "team1" in the output
				const team1Id = userIsA ? match.participantA : match.participantB;
				const team2Id = userIsA ? match.participantB : match.participantA;
				const team1Name = getParticipantName(team1Id!);
				const team2Name = getParticipantName(team2Id!);

				// Determine winner (1 = user's team, 2 = opponent, null = tie/walkover)
				let winner: 1 | 2 | null = null;
				if (match.winner) {
					if (match.winner === team1Id) {
						winner = 1;
					} else if (match.winner === team2Id) {
						winner = 2;
					}
				}

				// Get total scores
				const totalPoints1 = userIsA ? (match.totalPointsA ?? 0) : (match.totalPointsB ?? 0);
				const totalPoints2 = userIsA ? (match.totalPointsB ?? 0) : (match.totalPointsA ?? 0);

				// Get total 20s (for imported tournaments without detailed rounds)
				const total20s1 = userIsA ? (match.total20sA ?? 0) : (match.total20sB ?? 0);
				const total20s2 = userIsA ? (match.total20sB ?? 0) : (match.total20sA ?? 0);

				// Convert rounds to games structure
				const games: MatchGame[] = [];

				if (match.rounds && match.rounds.length > 0) {
					// Group rounds by gameNumber
					const roundsByGame = new Map<number, typeof match.rounds>();
					for (const round of match.rounds) {
						const gameNum = round.gameNumber ?? 1;
						if (!roundsByGame.has(gameNum)) {
							roundsByGame.set(gameNum, []);
						}
						roundsByGame.get(gameNum)!.push(round);
					}

					// Create game entries
					for (const [gameNum, gameRounds] of roundsByGame) {
						const matchRounds: MatchRound[] = gameRounds.map((r, idx) => {
							// hammerSide only exists on BracketMatch rounds
							const hammerSide = 'hammerSide' in r ? r.hammerSide : undefined;
							return {
								team1Points: userIsA ? (r.pointsA ?? 0) : (r.pointsB ?? 0),
								team2Points: userIsA ? (r.pointsB ?? 0) : (r.pointsA ?? 0),
								team1Twenty: userIsA ? (r.twentiesA ?? 0) : (r.twentiesB ?? 0),
								team2Twenty: userIsA ? (r.twentiesB ?? 0) : (r.twentiesA ?? 0),
								hammerTeam: hammerSide ? (userIsA ? (hammerSide === 'A' ? 1 : 2) : (hammerSide === 'B' ? 1 : 2)) : null,
								roundNumber: r.roundInGame ?? idx + 1
							};
						});

						const team1GamePoints = matchRounds.reduce((sum, r) => sum + r.team1Points, 0);
						const team2GamePoints = matchRounds.reduce((sum, r) => sum + r.team2Points, 0);

						games.push({
							gameNumber: gameNum,
							team1Points: team1GamePoints,
							team2Points: team2GamePoints,
							rounds: matchRounds,
							winner: team1GamePoints > team2GamePoints ? 1 : team2GamePoints > team1GamePoints ? 2 : null
						});
					}
				} else {
					// No detailed rounds - create summary based on total scores
					// Show one "game" with the total points
					games.push({
						gameNumber: 1,
						team1Points: totalPoints1,
						team2Points: totalPoints2,
						rounds: [],
						winner: winner
					});
				}

				// Create unique ID including phase and context info to avoid duplicates
				const contextStr = uniqueContext ? `_${uniqueContext}` : '';
				const matchId = `tournament_${tournament.id}_${phase}${contextStr}_${match.id}`;
				const completedAt = match.completedAt ?? tournament.completedAt ?? tournament.updatedAt;

				return {
					id: matchId,
					team1Name,
					team2Name,
					team1Color: '#4CAF50',
					team2Color: '#2196F3',
					team1Score: totalPoints1,
					team2Score: totalPoints2,
					winner,
					gameMode: 'points',
					gameType: tournament.gameType || 'singles',
					matchesToWin: 1,
					games,
					startTime: match.startedAt ?? completedAt,
					endTime: completedAt,
					duration: 0,
					eventTitle: tournament.name,
					matchPhase: phaseDetails || phase,
					showHammer: tournament.showHammer,
					show20s: tournament.show20s,
					// Store total 20s for imported tournaments without detailed rounds
					total20sTeam1: total20s1 > 0 ? total20s1 : undefined,
					total20sTeam2: total20s2 > 0 ? total20s2 : undefined,
					syncStatus: 'synced',
					players: (() => {
						const team1Participant = tournament.participants?.find((p: TournamentParticipant) => p.id === team1Id);
						const team2Participant = tournament.participants?.find((p: TournamentParticipant) => p.id === team2Id);
						return {
							team1: {
								name: team1Name,
								userId: user.id,
								...(team1Participant?.partner ? { partner: { name: team1Participant.partner.name, userId: team1Participant.partner.userId || null } } : {})
							},
							team2: {
								name: team2Name,
								userId: null,
								...(team2Participant?.partner ? { partner: { name: team2Participant.partner.name, userId: team2Participant.partner.userId || null } } : {})
							}
						};
					})()
				};
			};

			// Extract matches from group stage
			if (tournament.groupStage?.groups) {
				for (const group of tournament.groupStage.groups) {
					// Round Robin matches
					if (group.schedule) {
						for (const round of group.schedule) {
							for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
								const match = round.matches[matchIdx];
								const uniqueCtx = `${group.id}_R${round.roundNumber}_M${matchIdx}`;
								const converted = convertMatch(match, 'GROUP', `${group.name} - R${round.roundNumber}`, uniqueCtx);
								if (converted) tournamentMatches.push(converted);
							}
						}
					}
					// Swiss matches
					if (group.pairings) {
						for (const pairing of group.pairings) {
							for (let matchIdx = 0; matchIdx < pairing.matches.length; matchIdx++) {
								const match = pairing.matches[matchIdx];
								const uniqueCtx = `${group.id}_S${pairing.roundNumber}_M${matchIdx}`;
								const converted = convertMatch(match, 'SWISS', `Swiss R${pairing.roundNumber}`, uniqueCtx);
								if (converted) tournamentMatches.push(converted);
							}
						}
					}
				}
			}

			// Extract matches from final stage
			if (tournament.finalStage) {
				// Gold bracket (skip if parallelBrackets exist — in PARALLEL_BRACKETS mode,
				// goldBracket data is duplicated into parallelBrackets[0])
				if (tournament.finalStage.goldBracket?.rounds && !tournament.finalStage.parallelBrackets?.length) {
					for (const round of tournament.finalStage.goldBracket.rounds) {
						for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
							const match = round.matches[matchIdx];
							const uniqueCtx = `gold_R${round.roundNumber}_M${matchIdx}`;
							const converted = convertMatch(match, 'FINAL', round.name || `Round ${round.roundNumber}`, uniqueCtx);
							if (converted) tournamentMatches.push(converted);
						}
					}
					// Third place match
					if (tournament.finalStage.goldBracket.thirdPlaceMatch) {
						const converted = convertMatch(tournament.finalStage.goldBracket.thirdPlaceMatch, 'FINAL', '3rd Place', '3rdPlace');
						if (converted) tournamentMatches.push(converted);
					}
					// Consolation brackets
					if (tournament.finalStage.goldBracket.consolationBrackets) {
						for (let consIdx = 0; consIdx < tournament.finalStage.goldBracket.consolationBrackets.length; consIdx++) {
							const consolation = tournament.finalStage.goldBracket.consolationBrackets[consIdx];
							for (const round of consolation.rounds) {
								for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
									const match = round.matches[matchIdx];
									const uniqueCtx = `cons${consIdx}_R${round.roundNumber}_M${matchIdx}`;
									const converted = convertMatch(match, 'CONSOLATION', `Pos ${consolation.startPosition}+`, uniqueCtx);
									if (converted) tournamentMatches.push(converted);
								}
							}
						}
					}
				}

				// Silver bracket
				if (tournament.finalStage.silverBracket?.rounds) {
					for (const round of tournament.finalStage.silverBracket.rounds) {
						for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
							const match = round.matches[matchIdx];
							const uniqueCtx = `silver_R${round.roundNumber}_M${matchIdx}`;
							const converted = convertMatch(match, 'SILVER', round.name || `Round ${round.roundNumber}`, uniqueCtx);
							if (converted) tournamentMatches.push(converted);
						}
					}
				}

				// Parallel brackets (A/B/C finals)
				if (tournament.finalStage.parallelBrackets) {
					for (let bracketIdx = 0; bracketIdx < tournament.finalStage.parallelBrackets.length; bracketIdx++) {
						const namedBracket = tournament.finalStage.parallelBrackets[bracketIdx];
						for (const round of namedBracket.bracket.rounds) {
							for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
								const match = round.matches[matchIdx];
								const uniqueCtx = `parallel${bracketIdx}_R${round.roundNumber}_M${matchIdx}`;
								const converted = convertMatch(match, namedBracket.name, round.name || `Round ${round.roundNumber}`, uniqueCtx);
								if (converted) tournamentMatches.push(converted);
							}
						}
					}
				}
			}
		});

		// Sort by startTime descending
		tournamentMatches.sort((a, b) => b.startTime - a.startTime);

		console.log(`✅ Retrieved ${tournamentMatches.length} tournament matches for user`);
		return tournamentMatches;
	} catch (error) {
		console.error('❌ Error getting tournament matches:', error);
		return [];
	}
}
