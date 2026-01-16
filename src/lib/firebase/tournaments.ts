/**
 * Firebase functions for tournament management
 * CRUD operations and tournament lifecycle management
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin } from './admin';
import type { Tournament, TournamentParticipant, TournamentStatus } from '$lib/types/tournament';
import type { UserProfile } from './userProfile';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Recursively remove undefined values from an object
 * Firestore doesn't accept undefined values
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as T;
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    });
    return cleaned as T;
  }

  return obj;
}

/**
 * Create a new tournament
 *
 * @param data Tournament data
 * @returns Tournament ID or null if failed
 */
export async function createTournament(data: Partial<Tournament>): Promise<string | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return null;
  }

  try {
    const tournamentId = `tournament-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tournamentRef = doc(db!, 'tournaments', tournamentId);

    // Build tournament object with only defined values
    const tournament: any = {
      id: tournamentId,
      key: data.key,
      name: data.name || 'Nuevo Torneo',
      edition: data.edition || 1,
      country: data.country || 'España',
      city: data.city || '',
      status: 'DRAFT',
      phaseType: data.phaseType || 'ONE_PHASE',
      gameType: data.gameType || 'singles',
      show20s: data.show20s ?? true,
      showHammer: data.showHammer ?? true,
      numTables: data.numTables || 1,
      eloConfig: data.eloConfig || {
        enabled: true,
        initialElo: 1500,
        kFactor: 2.0,
        maxDelta: 25
      },
      participants: [],
      finalStage: {
        type: 'SINGLE_ELIMINATION',
        bracket: {
          rounds: [],
          totalRounds: 0
        },
        isComplete: false
      },
      createdAt: Date.now(),
      createdBy: {
        userId: user.id,
        userName: user.name
      },
      updatedAt: Date.now()
    };

    // Add optional fields only if they exist in the data object
    if ('description' in data && data.description) tournament.description = data.description;
    if ('tournamentDate' in data && data.tournamentDate) tournament.tournamentDate = data.tournamentDate;

    // Add groupStage configuration if it exists in the data
    if ('groupStage' in data && data.groupStage) {
      tournament.groupStage = data.groupStage;
    }

    // Add finalStageConfig if it exists in the data
    if ('finalStageConfig' in data && data.finalStageConfig) {
      tournament.finalStageConfig = data.finalStageConfig;
    }

    await setDoc(tournamentRef, {
      ...tournament,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ Tournament created:', tournamentId);
    return tournamentId;
  } catch (error) {
    console.error('❌ Error creating tournament:', error);
    return null;
  }
}

/**
 * Get tournament by ID
 *
 * @param id Tournament ID
 * @returns Tournament or null
 */
export async function getTournament(id: string): Promise<Tournament | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.warn('Tournament not found:', id);
      return null;
    }

    const data = snapshot.data();

    // Convert Firestore timestamps to numbers
    const tournament: Tournament = {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
      startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
      completedAt:
        data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
    } as Tournament;

    return tournament;
  } catch (error) {
    console.error('❌ Error getting tournament:', error);
    return null;
  }
}

/**
 * Get all tournaments (admin only)
 *
 * @param limitCount Maximum number of tournaments to return
 * @param statusFilter Optional status filter
 * @returns Array of tournaments
 */
export async function getAllTournaments(
  limitCount: number = 100,
  statusFilter?: TournamentStatus
): Promise<Tournament[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return [];
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return [];
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    let q = query(tournamentsRef, orderBy('createdAt', 'desc'), limit(limitCount));

    if (statusFilter) {
      q = query(
        tournamentsRef,
        where('status', '==', statusFilter),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);

    const tournaments: Tournament[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      tournaments.push({
        ...data,
        createdAt:
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
        startedAt:
          data.startedAt instanceof Timestamp ? data.startedAt.toMillis() : data.startedAt,
        completedAt:
          data.completedAt instanceof Timestamp ? data.completedAt.toMillis() : data.completedAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt
      } as Tournament);
    });

    console.log(`✅ Retrieved ${tournaments.length} tournaments`);
    return tournaments;
  } catch (error) {
    console.error('❌ Error getting all tournaments:', error);
    return [];
  }
}

/**
 * Update tournament
 *
 * @param id Tournament ID
 * @param updates Partial tournament data
 * @returns true if successful
 */
export async function updateTournament(
  id: string,
  updates: Partial<Tournament>
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return false;
  }

  try {
    const tournamentRef = doc(db!, 'tournaments', id);

    // Recursively remove undefined values from updates
    const cleanUpdates = cleanUndefined(updates);

    await updateDoc(tournamentRef, {
      ...cleanUpdates,
      updatedAt: serverTimestamp()
    });

    console.log('✅ Tournament updated:', id);
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament:', error);
    return false;
  }
}

/**
 * Delete tournament
 *
 * IMPORTANT: This will revert ELO changes for all participants
 * before deleting the tournament document
 *
 * @param id Tournament ID
 * @returns true if successful
 */
export async function deleteTournament(id: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check admin permission
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    console.error('Unauthorized: User is not admin');
    return false;
  }

  try {
    // First, revert ELO changes for all participants
    const { revertTournamentElo } = await import('./tournamentElo');
    const eloReverted = await revertTournamentElo(id);

    if (!eloReverted) {
      console.warn('⚠️ Failed to revert ELO, but continuing with deletion');
    }

    // Then delete the tournament document
    const tournamentRef = doc(db!, 'tournaments', id);
    await deleteDoc(tournamentRef);

    console.log('✅ Tournament deleted:', id);
    return true;
  } catch (error) {
    console.error('❌ Error deleting tournament:', error);
    return false;
  }
}

/**
 * Cancel tournament (soft delete)
 *
 * @param id Tournament ID
 * @returns true if successful
 */
export async function cancelTournament(id: string): Promise<boolean> {
  return await updateTournament(id, {
    status: 'CANCELLED',
    completedAt: Date.now()
  });
}

/**
 * Tournament name with max edition info
 */
export interface TournamentNameInfo {
  name: string;
  maxEdition: number;
}

/**
 * Search unique tournament names for autocomplete
 * Returns name and max edition for auto-filling next edition number
 *
 * @param searchQuery Search query (partial name)
 * @returns Array of tournament name info with max editions
 */
export async function searchTournamentNames(searchQuery: string): Promise<TournamentNameInfo[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const snapshot = await getDocs(tournamentsRef);

    // Track max edition per tournament name
    const namesMap = new Map<string, number>();
    const queryLower = searchQuery.toLowerCase();

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.name) {
        // If there's a search query, filter by it
        if (!searchQuery || data.name.toLowerCase().includes(queryLower)) {
          const currentMax = namesMap.get(data.name) || 0;
          const edition = data.edition || 1;
          if (edition > currentMax) {
            namesMap.set(data.name, edition);
          }
        }
      }
    });

    // Convert to array of TournamentNameInfo and sort alphabetically
    const results: TournamentNameInfo[] = Array.from(namesMap.entries())
      .map(([name, maxEdition]) => ({ name, maxEdition }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return results.slice(0, 10); // Limit to 10 results
  } catch (error) {
    console.error('❌ Error searching tournament names:', error);
    return [];
  }
}

/**
 * Search users for participant selection
 *
 * @param query Search query (name or email)
 * @returns Array of user profiles
 */
export async function searchUsers(query: string): Promise<UserProfile[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  if (!query || query.length < 2) {
    return [];
  }

  try {
    const usersRef = collection(db!, 'users');
    const snapshot = await getDocs(usersRef);

    const users: UserProfile[] = [];
    const queryLower = query.toLowerCase();

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as UserProfile;
      const nameMatch = data.playerName?.toLowerCase().includes(queryLower);
      const emailMatch = data.email?.toLowerCase().includes(queryLower);

      if (nameMatch || emailMatch) {
        users.push({
          ...data,
          userId: docSnap.id,
          playerName: data.playerName || 'Usuario'
        } as UserProfile & { userId: string });
      }
    });

    // Sort by name
    users.sort((a, b) => (a.playerName || '').localeCompare(b.playerName || ''));

    return users.slice(0, 20); // Limit to 20 results
  } catch (error) {
    console.error('❌ Error searching users:', error);
    return [];
  }
}
