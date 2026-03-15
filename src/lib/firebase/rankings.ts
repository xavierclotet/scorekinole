/**
 * Firebase functions for public rankings page
 * No admin authentication required - public read access
 */

import { db, isFirebaseEnabled } from './config';
import type { UserProfile } from './userProfile';
import type { TournamentRecord, TournamentTier } from '$lib/types/tournament';
import { normalizeTier } from '$lib/types/tournament';
import { calculateRankingPoints } from '$lib/algorithms/ranking';
import {
  collection,
  getDocs,
  doc,
  getDoc,
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
  key?: string;
  tier?: TournamentTier;
  gameType: 'singles' | 'doubles';
  country: string;
  completedAt: number;
}

/**
 * Tournament record with additional details for display
 */
export interface TournamentRecordWithDetails extends TournamentRecord {
  tier?: TournamentTier;
  country?: string;
  key?: string;
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
  bestSinglesResult: number | null;
  bestDoublesResult: number | null;
  tournaments: TournamentRecordWithDetails[];
  otherTournaments: TournamentRecordWithDetails[];
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
 * Includes both REGISTERED users (authProvider: 'google') and persistent GUEST users (authProvider: null)
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
      // Include all users (registered and guest) with tournament history
      // Exclude merged users (mergedTo set means they've been migrated to another account)
      if (!data.mergedTo && data.tournaments && data.tournaments.length > 0) {
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
        key: data.key,
        tier: data.rankingConfig?.tier,
        gameType: data.gameType || 'singles',
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
export function getAvailableCountries(tournamentsMap: Map<string, TournamentInfo>, year?: number): string[] {
  const countries = new Set<string>();
  tournamentsMap.forEach(tournament => {
    if (tournament.country) {
      if (year && tournament.completedAt) {
        const tournamentYear = new Date(tournament.completedAt).getFullYear();
        if (tournamentYear !== year) return;
      }
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
 * Get a user's current ranking by their userId
 * Fetches user profile and calculates Best-of-N ranking
 *
 * @param userId - Firestore user ID
 * @param year - Year to filter (defaults to current year)
 * @param bestOfN - Number of best results to count (defaults to 2)
 * @returns Total ranking points, or 0 if user not found
 */
export async function getUserRanking(
  userId: string,
  year: number = new Date().getFullYear(),
  bestOfN: number = 2
): Promise<number> {
  if (!browser || !isFirebaseEnabled()) {
    return 0;
  }

  try {
    const userRef = doc(db!, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return 0;
    }

    const profile = userSnap.data() as UserProfile;
    return calculateUserRanking(profile.tournaments, year, bestOfN);
  } catch (error) {
    console.error('Error getting user ranking:', error);
    return 0;
  }
}

/**
 * Calculate a single user's ranking using Best-of-N system
 * Used for tournament seeding when adding participants
 *
 * @param tournaments - User's tournament records
 * @param year - Year to filter (defaults to current year)
 * @param bestOfN - Number of best results to count (defaults to 2)
 * @returns Total ranking points (sum of top N results)
 */
export function calculateUserRanking(
  tournaments: TournamentRecord[] | undefined,
  year: number = new Date().getFullYear(),
  bestOfN: number = 2
): number {
  if (!tournaments?.length) return 0;

  // Filter tournaments by year
  const tournamentsThisYear = tournaments.filter(record => {
    const recordYear = new Date(record.tournamentDate).getFullYear();
    return recordYear === year;
  });

  if (tournamentsThisYear.length === 0) return 0;

  // Sort by points (rankingDelta) descending and take top N
  const sorted = [...tournamentsThisYear].sort((a, b) => b.rankingDelta - a.rankingDelta);
  const topN = sorted.slice(0, bestOfN);

  // Sum points
  return topN.reduce((sum, t) => sum + t.rankingDelta, 0);
}

/**
 * Recalculate a user's ranking using the current ranking algorithm.
 * Unlike calculateUserRanking() which reads stored rankingDelta values,
 * this function recalculates points from scratch using calculateRankingPoints()
 * with normalizeTier() — matching exactly what the /rankings page shows.
 *
 * @param tournaments - User's tournament records
 * @param tournamentsMap - Map of tournamentId → { tier, gameType } for recalculation
 * @param year - Year to filter
 * @param bestOfN - Number of best results to count
 * @returns Total ranking points (sum of top N recalculated results)
 */
export function recalculateUserRanking(
  tournaments: TournamentRecord[] | undefined,
  tournamentsMap: Map<string, TournamentInfo>,
  year: number = new Date().getFullYear(),
  bestOfN: number = 2
): number {
  if (!tournaments?.length) return 0;

  const recalculated = tournaments
    .filter(record => new Date(record.tournamentDate).getFullYear() === year)
    .map(record => {
      const info = tournamentsMap.get(record.tournamentId);
      if (!info) return record.rankingDelta; // fallback to stored value
      return calculateRankingPoints(
        record.finalPosition,
        normalizeTier(info.tier),
        record.totalParticipants,
        info.gameType
      );
    })
    .sort((a, b) => b - a)
    .slice(0, bestOfN);

  return recalculated.reduce((sum, pts) => sum + pts, 0);
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

    // 1. Filter user's tournaments by year and country, score with current system
    // Use lightweight intermediate objects to avoid spreading TournamentRecord for every entry
    const scored: { record: TournamentRecord; points: number; info: TournamentInfo }[] = [];
    let bestPosition = Infinity;
    let bestSingles = Infinity;
    let bestDoubles = Infinity;

    for (const record of user.tournaments) {
      const info = tournamentsMap.get(record.tournamentId);
      if (!info) continue;

      // Year filter
      const year = new Date(record.tournamentDate).getFullYear();
      if (year !== filters.year) continue;

      // Country filter
      if (filters.filterType === 'country' && filters.countryValue) {
        if (info.country !== filters.countryValue) continue;
      }

      // Recalculate points using current Series system (normalizes legacy tiers)
      const points = calculateRankingPoints(
        record.finalPosition,
        normalizeTier(info.tier),
        record.totalParticipants,
        info.gameType
      );

      scored.push({ record, points, info });
      if (record.finalPosition < bestPosition) bestPosition = record.finalPosition;
      if (info.gameType === 'singles' && record.finalPosition < bestSingles) bestSingles = record.finalPosition;
      if (info.gameType === 'doubles' && record.finalPosition < bestDoubles) bestDoubles = record.finalPosition;
    }

    if (scored.length === 0) continue;

    // 2. Sort by recalculated points descending
    scored.sort((a, b) => b.points - a.points);

    // 3. Take top N results (0 = all)
    const topCount = filters.bestOfN === 0 ? scored.length : Math.min(filters.bestOfN, scored.length);

    // 4. Sum points and build detail objects only for included tournaments
    let totalPoints = 0;
    const tournamentsWithDetails: TournamentRecordWithDetails[] = [];
    for (let i = 0; i < topCount; i++) {
      const { record, points, info } = scored[i];
      totalPoints += points;
      tournamentsWithDetails.push({
        ...record,
        rankingDelta: points,
        tier: info.tier ? normalizeTier(info.tier) : undefined,
        country: info.country,
        key: info.key
      });
    }

    // 5. Other tournaments with points (not counted in top-N, empty when "all")
    const otherTournaments: TournamentRecordWithDetails[] = [];
    if (filters.bestOfN > 0) {
      for (let i = topCount; i < scored.length; i++) {
        const { record, points, info } = scored[i];
        if (points <= 0) break; // Already sorted desc, no more positive values
        otherTournaments.push({
          ...record,
          rankingDelta: points,
          tier: info.tier ? normalizeTier(info.tier) : undefined,
          country: info.country,
          key: info.key
        });
      }
    }

    result.push({
      odId: user.odId,
      playerName: user.playerName || 'Unknown',
      photoURL: user.photoURL || null,
      totalPoints,
      tournamentsCount: topCount,
      bestResult: bestPosition === Infinity ? null : bestPosition,
      bestSinglesResult: bestSingles === Infinity ? null : bestSingles,
      bestDoublesResult: bestDoubles === Infinity ? null : bestDoubles,
      tournaments: tournamentsWithDetails,
      otherTournaments
    });
  }

  // 7. Sort by total points descending, then tiebreakers:
  // best singles position (lower wins), best doubles position (lower wins), name
  result.sort((a, b) =>
    b.totalPoints - a.totalPoints
    || (a.bestSinglesResult ?? Infinity) - (b.bestSinglesResult ?? Infinity)
    || (a.bestDoublesResult ?? Infinity) - (b.bestDoublesResult ?? Infinity)
    || a.playerName.localeCompare(b.playerName)
  );

  return result;
}
