/**
 * Firebase functions for pair (doubles team) management
 *
 * Pairs are stored in a separate `/pairs` collection.
 * The pairId is deterministic: pair_{sortedId1}_{sortedId2}
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  collection,
  arrayUnion,
  serverTimestamp,
  or
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import type { Pair, PairMember, PairTournamentRecord } from '$lib/types/pair';
import { generatePairId, getMemberIdentifier } from '$lib/types/pair';

/**
 * Get pair by ID
 */
export async function getPairById(pairId: string): Promise<Pair | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  try {
    const pairRef = doc(db!, 'pairs', pairId);
    const pairSnap = await getDoc(pairRef);

    if (pairSnap.exists()) {
      return pairSnap.data() as Pair;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting pair:', error);
    return null;
  }
}

/**
 * Get or create a pair
 * Returns existing pair if found, creates new one if not
 */
export async function getOrCreatePair(
  member1: PairMember,
  member2: PairMember,
  teamName?: string
): Promise<Pair | null> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return null;
  }

  const id1 = getMemberIdentifier(member1);
  const id2 = getMemberIdentifier(member2);
  const pairId = generatePairId(id1, id2);

  // Determine sorted order
  const [sortedId1, sortedId2] = [id1, id2].sort();
  const [sortedMember1, sortedMember2] = sortedId1 === id1
    ? [member1, member2]
    : [member2, member1];

  try {
    // Check if pair exists
    const existing = await getPairById(pairId);
    if (existing) {
      console.log('✅ Found existing pair:', existing.teamName || `${existing.member1Name} / ${existing.member2Name}`);

      // Update team name if provided and different
      if (teamName && teamName !== existing.teamName) {
        await updatePairTeamName(pairId, teamName);
        return { ...existing, teamName };
      }
      return existing;
    }

    // Create new pair - omit teamName if empty to avoid undefined in Firestore
    const newPair: Pair = {
      id: pairId,
      member1UserId: sortedId1,
      member2UserId: sortedId2,
      member1Name: sortedMember1.name,
      member2Name: sortedMember2.name,
      member1Type: sortedMember1.type,
      member2Type: sortedMember2.type,
      tournaments: [],
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any
    };

    // Only add teamName if it has a value
    if (teamName && teamName.trim()) {
      newPair.teamName = teamName.trim();
    }

    const pairRef = doc(db!, 'pairs', pairId);
    await setDoc(pairRef, newPair);

    console.log('✅ Created new pair:', teamName || `${sortedMember1.name} / ${sortedMember2.name}`);
    return newPair;
  } catch (error) {
    console.error('❌ Error creating pair:', error);
    return null;
  }
}

/**
 * Update pair's team name
 */
export async function updatePairTeamName(
  pairId: string,
  teamName: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  try {
    const pairRef = doc(db!, 'pairs', pairId);
    await setDoc(pairRef, {
      teamName,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log('✅ Updated pair team name:', teamName);
    return true;
  } catch (error) {
    console.error('❌ Error updating pair team name:', error);
    return false;
  }
}

/**
 * Add tournament record to pair
 */
export async function addPairTournamentRecord(
  pairId: string,
  record: PairTournamentRecord
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  try {
    const pairRef = doc(db!, 'pairs', pairId);
    await setDoc(pairRef, {
      tournaments: arrayUnion(record),
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log('✅ Added tournament record to pair:', record.tournamentName);
    return true;
  } catch (error) {
    console.error('❌ Error adding pair tournament record:', error);
    return false;
  }
}

/**
 * Search pairs by member userId or name
 * Used for finding existing pairs when adding participants
 */
export async function searchPairsByMember(
  memberIdentifier: string,
  limit: number = 10
): Promise<Pair[]> {
  if (!browser || !isFirebaseEnabled()) {
    return [];
  }

  try {
    const pairsRef = collection(db!, 'pairs');

    // Search in both member positions
    const q = query(
      pairsRef,
      or(
        where('member1UserId', '==', memberIdentifier),
        where('member2UserId', '==', memberIdentifier)
      )
    );

    const snapshot = await getDocs(q);
    const pairs: Pair[] = [];

    snapshot.forEach(docSnap => {
      pairs.push(docSnap.data() as Pair);
    });

    // Sort by most recent tournament (if any)
    pairs.sort((a, b) => {
      const aLatest = a.tournaments?.[a.tournaments.length - 1]?.tournamentDate || 0;
      const bLatest = b.tournaments?.[b.tournaments.length - 1]?.tournamentDate || 0;
      return bLatest - aLatest;
    });

    return pairs.slice(0, limit);
  } catch (error) {
    console.error('❌ Error searching pairs:', error);
    return [];
  }
}

/**
 * Get recent pairs for the current user (for quick selection UI)
 * Returns pairs where the current user is a member
 */
export async function getRecentPairsForUser(
  userId: string,
  limit: number = 5
): Promise<Pair[]> {
  return searchPairsByMember(userId, limit);
}

/**
 * Search pairs by team name (partial match)
 */
export async function searchPairsByTeamName(
  searchQuery: string,
  limit: number = 10
): Promise<Pair[]> {
  if (!browser || !isFirebaseEnabled() || !searchQuery.trim()) {
    return [];
  }

  try {
    // Firestore doesn't support native partial text search
    // We fetch all pairs and filter client-side (acceptable for small collections)
    const pairsRef = collection(db!, 'pairs');
    const snapshot = await getDocs(pairsRef);

    const queryLower = searchQuery.toLowerCase();
    const matches: Pair[] = [];

    snapshot.forEach(docSnap => {
      const pair = docSnap.data() as Pair;
      const teamNameMatch = pair.teamName?.toLowerCase().includes(queryLower);
      const member1Match = pair.member1Name.toLowerCase().includes(queryLower);
      const member2Match = pair.member2Name.toLowerCase().includes(queryLower);

      if (teamNameMatch || member1Match || member2Match) {
        matches.push(pair);
      }
    });

    // Sort by team name or combined member names
    matches.sort((a, b) => {
      const aName = a.teamName || `${a.member1Name} / ${a.member2Name}`;
      const bName = b.teamName || `${b.member1Name} / ${b.member2Name}`;
      return aName.localeCompare(bName);
    });

    return matches.slice(0, limit);
  } catch (error) {
    console.error('❌ Error searching pairs by team name:', error);
    return [];
  }
}

/**
 * Get display name for a pair
 */
export function getPairDisplayName(pair: Pair, overrideTeamName?: string): string {
  if (overrideTeamName) {
    return overrideTeamName;
  }
  if (pair.teamName) {
    return pair.teamName;
  }
  return `${pair.member1Name} / ${pair.member2Name}`;
}
