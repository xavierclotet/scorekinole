/**
 * Firebase functions for public rankings page
 * No admin authentication required - public read access
 */

import { db, isFirebaseEnabled } from './config';
import type { UserProfile } from './userProfile';
import type { TournamentRecord, TournamentTier } from '$lib/types/tournament';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { browser } from '$app/environment';

/**
 * User with ID for ranking calculations
 */
export interface UserWithId extends UserProfile {
  odId: string;
}

/**
 * Tournament info for lookup (minimal data needed)
 */
export interface TournamentInfo {
  id: string;
  tier?: TournamentTier;
  country: string;
  completedAt: number;
}

/**
 * Tournament record with additional details for display
 */
export interface TournamentRecordWithDetails extends TournamentRecord {
  tier?: TournamentTier;
  country?: string;
}

/**
 * Ranked player with calculated points
 */
export interface RankedPlayer {
  odId: string;
  playerName: string;
  photoURL: string | null;
  totalPoints: number;
  tournamentsCount: number;
  bestResult: number | null;
  tournaments: TournamentRecordWithDetails[];
}

/**
 * Ranking filter options
 */
export interface RankingFilters {
  year: number;
  filterType: 'all' | 'country';
  countryValue?: string;
  bestOfN: number;
}

/**
 * Get all users with tournament history
 * Public access - no admin check required
 */
export async function getAllUsersWithTournaments(): Promise<UserWithId[]> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return [];
  }

  try {
    const usersRef = collection(db!, 'users');
    const snapshot = await getDocs(usersRef);

    const users: UserWithId[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as UserProfile;
      // Only include users with tournament history
      if (data.tournaments && data.tournaments.length > 0) {
        users.push({
          ...data,
          odId: docSnap.id
        });
      }
    });

    console.log(`✅ Retrieved ${users.length} users with tournaments`);
    return users;
  } catch (error) {
    console.error('❌ Error getting users with tournaments:', error);
    return [];
  }
}

/**
 * Get all completed tournaments for tier/country lookup
 * Returns a Map for efficient lookup by tournament ID
 */
export async function getCompletedTournaments(): Promise<Map<string, TournamentInfo>> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return new Map();
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const q = query(tournamentsRef, where('status', '==', 'COMPLETED'));
    const snapshot = await getDocs(q);

    const tournamentsMap = new Map<string, TournamentInfo>();
    let testCount = 0;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      // Skip test tournaments - only include real tournaments (isTest !== true)
      if (data.isTest === true) {
        testCount++;
        return;
      }

      const completedAt = data.completedAt instanceof Timestamp
        ? data.completedAt.toMillis()
        : data.completedAt;

      tournamentsMap.set(docSnap.id, {
        id: docSnap.id,
        tier: data.rankingConfig?.tier,
        country: data.country || '',
        completedAt: completedAt || 0
      });
    });

    console.log(`✅ Retrieved ${tournamentsMap.size} completed tournaments (excluded ${testCount} test tournaments)`);
    return tournamentsMap;
  } catch (error) {
    console.error('❌ Error getting completed tournaments:', error);
    return new Map();
  }
}

/**
 * Extract unique countries from completed tournaments
 */
export function getAvailableCountries(tournamentsMap: Map<string, TournamentInfo>): string[] {
  const countries = new Set<string>();
  tournamentsMap.forEach(tournament => {
    if (tournament.country) {
      countries.add(tournament.country);
    }
  });
  return Array.from(countries).sort();
}

/**
 * Extract available years from completed tournaments
 */
export function getAvailableYears(tournamentsMap: Map<string, TournamentInfo>): number[] {
  const years = new Set<number>();
  tournamentsMap.forEach(tournament => {
    if (tournament.completedAt) {
      const year = new Date(tournament.completedAt).getFullYear();
      years.add(year);
    }
  });
  // Sort descending (newest first)
  return Array.from(years).sort((a, b) => b - a);
}

/**
 * Calculate rankings based on Best-of-N system
 * Only counts the N best tournament results for each player
 */
export function calculateRankings(
  users: UserWithId[],
  tournamentsMap: Map<string, TournamentInfo>,
  filters: RankingFilters
): RankedPlayer[] {
  const result: RankedPlayer[] = [];

  for (const user of users) {
    if (!user.tournaments?.length) continue;

    // 1. Filter user's tournaments by year and country
    const matchingTournaments = user.tournaments.filter(record => {
      const tournament = tournamentsMap.get(record.tournamentId);
      if (!tournament) return false;

      // Year filter using tournamentDate from record
      const year = new Date(record.tournamentDate).getFullYear();
      if (year !== filters.year) return false;

      // Country filter
      if (filters.filterType === 'country' && filters.countryValue) {
        return tournament.country === filters.countryValue;
      }

      return true; // filterType === 'all'
    });

    if (matchingTournaments.length === 0) continue;

    // 2. Sort by points (rankingDelta) descending
    matchingTournaments.sort((a, b) => b.rankingDelta - a.rankingDelta);

    // 3. Take top N results
    const topN = matchingTournaments.slice(0, filters.bestOfN);

    // 4. Sum points
    const totalPoints = topN.reduce((sum, t) => sum + t.rankingDelta, 0);

    // 5. Add tournament details for modal display
    const tournamentsWithDetails: TournamentRecordWithDetails[] = topN.map(t => {
      const tournamentInfo = tournamentsMap.get(t.tournamentId);
      return {
        ...t,
        tier: tournamentInfo?.tier,
        country: tournamentInfo?.country
      };
    });

    // 6. Calculate best result (lowest finalPosition)
    const bestResult = matchingTournaments.length > 0
      ? Math.min(...matchingTournaments.map(t => t.finalPosition))
      : null;

    result.push({
      odId: user.odId,
      playerName: user.playerName || 'Unknown',
      photoURL: user.photoURL || null,
      totalPoints,
      tournamentsCount: topN.length,
      bestResult,
      tournaments: tournamentsWithDetails
    });
  }

  // 7. Sort by total points descending
  result.sort((a, b) => b.totalPoints - a.totalPoints);

  return result;
}
