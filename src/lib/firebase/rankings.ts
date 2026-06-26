/**
 * Firebase functions for public rankings page
 * No admin authentication required - public read access
 */

import { db, isFirebaseEnabled } from './config';
import type { UserProfile } from './userProfile';
import type { TournamentRecord, TournamentTier } from '$lib/types/tournament';
import { normalizeTier } from '$lib/types/tournament';
import { calculateRankingPoints } from '$lib/algorithms/ranking';
import { normalizeCountryForFilter } from '$lib/utils/countryNames';
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
  shortName?: string;
  edition?: number;
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
  key?: string;
  playerName: string;
  photoURL: string | null;
  country?: string;
  totalPoints: number;
  tournamentsCount: number;
  bestResult: number | null;
  bestSinglesResult: number | null;
  bestDoublesResult: number | null;
  /**
   * Olympic-style medal tables over the COUNTED tournaments (the ones that sum into totalPoints):
   * `medals[pos]` = how many counted tournaments the player finished in position `pos`.
   * Split by discipline because singles medals outrank doubles ones in the tie-break.
   */
  singlesMedals: number[];
  doublesMedals: number[];
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

// ---------------------------------------------------------------------------
// Field-masked fetches via the Firestore REST API.
//
// The web SDK has no select()/field-mask support, so getDocs() on /tournaments
// downloads each COMPLETED tournament doc in full — including the embedded
// matches, groups and bracket, which can be hundreds of KB per tournament —
// only to keep 7 small fields. The REST runQuery endpoint accepts a `select`
// projection, cutting the ranking page's network payload drastically.
// Security rules apply identically to REST access (both collections are
// public-read). On any REST failure we fall back to the SDK path.
// ---------------------------------------------------------------------------

/** Decode a Firestore REST `Value` into a plain JS value. */
function decodeRestValue(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue as string);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeRestFields((v.mapValue as { fields?: Record<string, never> }).fields);
  if ('arrayValue' in v) {
    return ((v.arrayValue as { values?: Record<string, never>[] }).values || []).map(decodeRestValue);
  }
  return undefined; // bytes/reference/geopoint — not used by ranking data
}

function decodeRestFields(fields?: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const key of Object.keys(fields)) {
    out[key] = decodeRestValue(fields[key]);
  }
  return out;
}

interface RestDoc {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

async function runRestQuery(structuredQuery: object): Promise<RestDoc[]> {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error('Missing Firebase REST config');

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery })
  });
  if (!res.ok) throw new Error(`Firestore REST query failed: ${res.status}`);

  const rows: { document?: { name: string; fields?: Record<string, Record<string, unknown>> } }[] =
    await res.json();
  const docs: RestDoc[] = [];
  for (const row of rows) {
    if (!row.document) continue; // readTime-only progress entries
    const name = row.document.name;
    docs.push({
      id: name.slice(name.lastIndexOf('/') + 1),
      data: decodeRestFields(row.document.fields)
    });
  }
  return docs;
}

/** Shared filter: keep only non-merged users with tournament history. */
function buildUsersWithTournaments(docs: RestDoc[]): UserWithId[] {
  const users: UserWithId[] = [];
  for (const { id, data } of docs) {
    // Include all users (registered and guest) with tournament history
    // Exclude merged users (mergedTo set means they've been migrated to another account)
    if (!data.mergedTo && data.tournaments && data.tournaments.length > 0) {
      users.push({ ...(data as UserProfile), odId: id });
    }
  }
  return users;
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
    const docs = await runRestQuery({
      from: [{ collectionId: 'users' }],
      select: {
        fields: [
          { fieldPath: 'playerName' },
          { fieldPath: 'key' },
          { fieldPath: 'photoURL' },
          { fieldPath: 'country' },
          { fieldPath: 'tournaments' },
          { fieldPath: 'mergedTo' }
        ]
      }
    });
    return buildUsersWithTournaments(docs);
  } catch (restError) {
    console.warn('REST users fetch failed, falling back to SDK:', restError);
  }

  try {
    const usersRef = collection(db!, 'users');
    const snapshot = await getDocs(usersRef);
    const docs: RestDoc[] = [];
    snapshot.forEach(docSnap => docs.push({ id: docSnap.id, data: docSnap.data() }));
    return buildUsersWithTournaments(docs);
  } catch (error) {
    console.error('❌ Error getting users with tournaments:', error);
    return [];
  }
}

/** Shared mapping: raw tournament docs → TournamentInfo map, skipping test tournaments. */
function buildTournamentsMap(docs: RestDoc[]): Map<string, TournamentInfo> {
  const tournamentsMap = new Map<string, TournamentInfo>();
  for (const { id, data } of docs) {
    // Skip test tournaments - only include real tournaments (isTest !== true)
    if (data.isTest === true) continue;

    const completedAt = data.completedAt instanceof Timestamp
      ? data.completedAt.toMillis()
      : data.completedAt;

    tournamentsMap.set(id, {
      id,
      key: data.key,
      shortName: data.shortName,
      edition: data.edition,
      tier: data.rankingConfig?.tier,
      gameType: data.gameType || 'singles',
      country: data.country || '',
      completedAt: completedAt || 0
    });
  }
  return tournamentsMap;
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
    const docs = await runRestQuery({
      from: [{ collectionId: 'tournaments' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'COMPLETED' }
        }
      },
      select: {
        fields: [
          { fieldPath: 'key' },
          { fieldPath: 'shortName' },
          { fieldPath: 'edition' },
          { fieldPath: 'rankingConfig.tier' },
          { fieldPath: 'gameType' },
          { fieldPath: 'country' },
          { fieldPath: 'completedAt' },
          { fieldPath: 'isTest' }
        ]
      }
    });
    return buildTournamentsMap(docs);
  } catch (restError) {
    console.warn('REST tournaments fetch failed, falling back to SDK:', restError);
  }

  try {
    const tournamentsRef = collection(db!, 'tournaments');
    const q = query(tournamentsRef, where('status', '==', 'COMPLETED'));
    const snapshot = await getDocs(q);
    const docs: RestDoc[] = [];
    snapshot.forEach(docSnap => docs.push({ id: docSnap.id, data: docSnap.data() }));
    return buildTournamentsMap(docs);
  } catch (error) {
    console.error('❌ Error getting completed tournaments:', error);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Stale-while-revalidate cache for the ranking page.
// The compact data (users-with-tournaments + TournamentInfo entries) is small
// enough for localStorage, so repeat visits render instantly from cache while
// a background fetch refreshes the data.
// ---------------------------------------------------------------------------

const RANKING_CACHE_KEY = 'rankingPageCache.v1';

export interface RankingCacheData {
  users: UserWithId[];
  tournamentsMap: Map<string, TournamentInfo>;
}

export function readRankingCache(): RankingCacheData | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(RANKING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users) || !Array.isArray(parsed.tournaments)) return null;
    return {
      users: parsed.users,
      tournamentsMap: new Map(parsed.tournaments)
    };
  } catch {
    return null;
  }
}

export function writeRankingCache(users: UserWithId[], tournamentsMap: Map<string, TournamentInfo>): void {
  if (!browser) return;
  try {
    localStorage.setItem(
      RANKING_CACHE_KEY,
      JSON.stringify({ users, tournaments: Array.from(tournamentsMap.entries()), savedAt: Date.now() })
    );
  } catch {
    // Quota exceeded or storage unavailable — drop the cache, the page still works
    try { localStorage.removeItem(RANKING_CACHE_KEY); } catch { /* ignore */ }
  }
}

/**
 * Extract unique countries from registered players who have tournament activity.
 * When `year` is provided, only include users with at least one tournament in that year
 * (matched against the tournamentsMap, which already excludes test tournaments).
 */
export function getAvailableCountries(
  users: UserWithId[],
  tournamentsMap: Map<string, TournamentInfo>,
  year?: number
): string[] {
  const countries = new Set<string>();
  for (const user of users) {
    const country = normalizeCountryForFilter(user.country);
    if (!country) continue;
    if (!user.tournaments?.length) continue;

    if (year) {
      const hasInYear = user.tournaments.some(record => {
        if (!tournamentsMap.has(record.tournamentId)) return false;
        return new Date(record.tournamentDate).getFullYear() === year;
      });
      if (!hasInYear) continue;
    }

    countries.add(country);
  }
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
 * Estimate a participant's ranking snapshot for FSI preview / seeding.
 *
 * Uses the stored rankingDelta values (cheap, no Firestore reads) via calculateUserRanking,
 * with a fallback to the previous year when the current year has no results — mirroring the
 * behaviour of syncParticipantRankings() so the wizard estimate matches what gets synced at start.
 *
 * @param tournaments - User's tournament records (from their profile)
 * @param year - Reference year (defaults to current year)
 * @param bestOfN - Number of best results to count (defaults to 2)
 * @returns Estimated ranking points (0 for guests / users with no records)
 */
export function estimateParticipantRanking(
  tournaments: TournamentRecord[] | undefined,
  year: number = new Date().getFullYear(),
  bestOfN: number = 2
): number {
  const current = calculateUserRanking(tournaments, year, bestOfN);
  if (current > 0) return current;
  // Fallback to previous year (a player whose current season hasn't started yet still has a level)
  return calculateUserRanking(tournaments, year - 1, bestOfN);
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
 * Olympic-style medal comparison for breaking ties between players on equal points.
 * `counts[pos]` = how many (counted) tournaments the player finished in position `pos`.
 * The player with more 1st places ranks first; ties cascade to 2nd places, then 3rd, etc.
 * Returns a negative number when `a` should rank ahead of `b` (Array.prototype.sort convention).
 */
export function compareMedalCounts(a: number[], b: number[]): number {
  const maxPos = Math.max(a.length, b.length);
  for (let pos = 1; pos < maxPos; pos++) {
    const diff = (b[pos] || 0) - (a[pos] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
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

    // Country filter applies to the player's nationality, not the tournament's host country.
    // Subnational codes (e.g. CAT → ES) are normalized so Catalan players count as Spanish.
    // Excludes guest/unregistered players (no `user.country`) when a country is selected.
    if (filters.filterType === 'country' && filters.countryValue) {
      if (normalizeCountryForFilter(user.country) !== filters.countryValue) continue;
    }

    // 1. Filter user's tournaments by year, score with current system
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

      // Validate tournament data: finalPosition must be a positive integer
      // (position 0 or negative is invalid — would place medals at index 0
      // which compareMedalCounts skips, making them invisible in tiebreaking).
      // totalParticipants <= 0 yields winnerPoints=0 → all positions get 0 pts,
      // polluting rankings with ghost players. Skip invalid records.
      const pos = record.finalPosition;
      const totalParts = record.totalParticipants;
      const isInvalidRecord = pos <= 0 || !Number.isFinite(pos) || pos > totalParts || !Number.isFinite(totalParts) || totalParts <= 0;
      if (isInvalidRecord) continue;

      // Recalculate points using current Series system (normalizes legacy tiers)
      const points = calculateRankingPoints(
        pos,
        normalizeTier(info.tier),
        totalParts,
        info.gameType
      );

      scored.push({ record, points, info });
      if (pos < bestPosition) bestPosition = pos;
      if (info.gameType === 'singles' && pos < bestSingles) bestSingles = pos;
      if (info.gameType === 'doubles' && pos < bestDoubles) bestDoubles = pos;
    }

    if (scored.length === 0) continue;

    // 2. Sort by recalculated points descending
    scored.sort((a, b) => b.points - a.points);

    // 3. Take top N results (0 = all). After validation all scored entries
    //    have positive points, so 0-point ghost players never enter the ranking.
    const topCount = filters.bestOfN === 0 ? scored.length : Math.min(filters.bestOfN, scored.length);

    // 4. Sum points and build detail objects only for included tournaments.
    //    Build the medal tables from the counted tournaments only (the ones that sum into the
    //    score), split by discipline so singles results outrank doubles ones in the tie-break.
    let totalPoints = 0;
    const singlesMedals: number[] = [];
    const doublesMedals: number[] = [];
    const tournamentsWithDetails: TournamentRecordWithDetails[] = [];
    for (let i = 0; i < topCount; i++) {
      const { record, points, info } = scored[i];
      totalPoints += points;
      const medals = info.gameType === 'doubles' ? doublesMedals : singlesMedals;
      // finalPosition already validated as >= 1 above
      medals[record.finalPosition] = (medals[record.finalPosition] || 0) + 1;
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
      key: user.key,
      playerName: user.playerName || 'Unknown',
      photoURL: user.photoURL || null,
      country: user.country || undefined,
      totalPoints,
      tournamentsCount: topCount,
      bestResult: bestPosition === Infinity ? null : bestPosition,
      bestSinglesResult: bestSingles === Infinity ? null : bestSingles,
      bestDoublesResult: bestDoubles === Infinity ? null : bestDoubles,
      singlesMedals,
      doublesMedals,
      tournaments: tournamentsWithDetails,
      otherTournaments
    });
  }

  // 7. Sort by total points descending, then Olympic-style tie-breakers over the counted tournaments:
  //    more singles medals (gold → silver → bronze → …), then more doubles medals, then name.
  result.sort((a, b) =>
    b.totalPoints - a.totalPoints
    || compareMedalCounts(a.singlesMedals, b.singlesMedals)
    || compareMedalCounts(a.doublesMedals, b.doublesMedals)
    || a.playerName.localeCompare(b.playerName)
  );

  return result;
}
