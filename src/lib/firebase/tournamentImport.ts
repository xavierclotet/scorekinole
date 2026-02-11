/**
 * Firebase functions for historical tournament import
 * Allows importing completed tournaments with results after-the-fact
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin, isSuperAdmin } from './admin';
import { getUserProfile } from './userProfile';
import type {
  Tournament,
  TournamentParticipant,
  GroupStage,
  FinalStage,
  GroupStanding,
  BracketMatch,
  NamedBracket,
  RankingConfig,
  BracketWithConfig,
  BracketRound
} from '$lib/types/tournament';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
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
 * Input structure for creating a historical tournament
 */
export interface HistoricalTournamentInput {
  // Basic info
  name: string;
  description?: string;
  edition?: number;
  tournamentDate: number;
  address?: string;
  city: string;
  country: string;
  gameType: 'singles' | 'doubles';
  rankingConfig: RankingConfig;
  externalLink?: string;
  posterUrl?: string;

  // Structure
  phaseType: 'ONE_PHASE' | 'TWO_PHASE';
  show20s?: boolean;
  showHammer?: boolean;
  isTest?: boolean;

  // Participants
  participants: HistoricalParticipantInput[];

  // Group stage (optional)
  groupStage?: HistoricalGroupStageInput;

  // Final stage
  finalStage: HistoricalFinalStageInput;
}

export interface HistoricalParticipantInput {
  name: string;
  oderId?: string;          // If linked to existing user
  partnerName?: string;     // For doubles
  partnerUserId?: string;   // For doubles, if linked
  finalPosition?: number;
}

export interface HistoricalGroupStageInput {
  numGroups: number;
  qualificationMode?: 'WINS' | 'POINTS';
  groups: HistoricalGroupInput[];
}

export interface HistoricalGroupInput {
  name: string;
  standings: HistoricalStandingInput[];
}

export interface HistoricalStandingInput {
  participantName: string;
  position: number;
  points: number;          // Crokinole points scored (total game points)
  total20s?: number;
}

export interface HistoricalFinalStageInput {
  mode: 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS' | 'PARALLEL_BRACKETS';
  brackets: HistoricalBracketInput[];
}

export interface HistoricalBracketInput {
  name: string;                          // "A Finals", "B Finals", etc.
  label: string;                         // "A", "B", "C"
  sourcePositions: number[];             // Group positions that qualify
  rounds: HistoricalBracketRoundInput[];
}

export interface HistoricalBracketRoundInput {
  name: string;                          // "Cuartos", "Semifinales", "Final"
  matches: HistoricalMatchInput[];
}

export interface HistoricalMatchInput {
  participantAName: string;
  participantBName: string;
  scoreA: number;                        // Total points (e.g., 8)
  scoreB: number;                        // Total points (e.g., 2)
  twentiesA?: number;
  twentiesB?: number;
  isWalkover?: boolean;
}

/**
 * User search result for participant linking
 */
export interface UserSearchResult {
  userId: string;
  name: string;
  playerName?: string;
  ranking: number;
}

/**
 * Generate a unique 6-character alphanumeric key
 */
function generateTournamentKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let key = '';
  for (let i = 0; i < 6; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Check if a tournament key already exists
 */
async function isKeyUnique(key: string): Promise<boolean> {
  if (!db) return false;

  const tournamentsRef = collection(db, 'tournaments');
  const q = query(tournamentsRef, where('key', '==', key), limit(1));
  const snapshot = await getDocs(q);
  return snapshot.empty;
}

/**
 * Generate a unique tournament key
 */
async function generateUniqueKey(): Promise<string> {
  let key = generateTournamentKey();
  let attempts = 0;
  const maxAttempts = 10;

  while (!(await isKeyUnique(key)) && attempts < maxAttempts) {
    key = generateTournamentKey();
    attempts++;
  }

  return key;
}

/**
 * Search users by name for participant linking
 */
export async function searchUsersByName(searchQuery: string): Promise<UserSearchResult[]> {
  if (!browser || !isFirebaseEnabled() || !db) {
    return [];
  }

  if (!searchQuery || searchQuery.length < 2) {
    return [];
  }

  try {
    const usersRef = collection(db, 'users');
    const searchLower = searchQuery.toLowerCase();
    const searchUpper = searchLower + '\uf8ff';
    const resultsMap = new Map<string, UserSearchResult>();

    // Try searching by playerNameLower first
    try {
      const q1 = query(
        usersRef,
        where('playerNameLower', '>=', searchLower),
        where('playerNameLower', '<=', searchUpper),
        limit(10)
      );
      const snapshot1 = await getDocs(q1);
      snapshot1.forEach((doc) => {
        const data = doc.data();
        resultsMap.set(doc.id, {
          userId: doc.id,
          name: data.name || '',
          playerName: data.playerName || data.name || '',
          ranking: data.ranking || 1500
        });
      });
    } catch (e) {
      // Index might not exist, continue with fallback
      console.warn('playerNameLower search failed, trying fallback');
    }

    // Also search by nameLower as fallback
    if (resultsMap.size < 10) {
      try {
        const q2 = query(
          usersRef,
          where('nameLower', '>=', searchLower),
          where('nameLower', '<=', searchUpper),
          limit(10)
        );
        const snapshot2 = await getDocs(q2);
        snapshot2.forEach((doc) => {
          if (!resultsMap.has(doc.id)) {
            const data = doc.data();
            resultsMap.set(doc.id, {
              userId: doc.id,
              name: data.name || '',
              playerName: data.playerName || data.name || '',
              ranking: data.ranking || 1500
            });
          }
        });
      } catch (e) {
        console.warn('nameLower search failed');
      }
    }

    return Array.from(resultsMap.values()).slice(0, 10);
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

/**
 * Check if current user can import tournaments
 * Requires admin status AND canImportTournaments permission (or SuperAdmin)
 */
export async function canImportTournaments(): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    return false;
  }

  const adminStatus = await isAdmin();
  if (!adminStatus) {
    return false;
  }

  const superAdminStatus = await isSuperAdmin();
  if (superAdminStatus) {
    return true; // SuperAdmins can always import
  }

  const profile = await getUserProfile();
  return profile?.canImportTournaments === true;
}

/**
 * Create a historical tournament with completed status
 * Note: Imported tournaments do NOT count towards annual quota
 */
export async function createHistoricalTournament(
  input: HistoricalTournamentInput
): Promise<string | null> {
  if (!browser || !isFirebaseEnabled() || !db) {
    console.warn('Firebase disabled');
    return null;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  // Check import permission (admin + canImportTournaments or SuperAdmin)
  const canImport = await canImportTournaments();
  if (!canImport) {
    console.error('Unauthorized: User does not have import permission');
    return null;
  }

  const userProfile = await getUserProfile();
  const creatorName = userProfile?.playerName || user.name;

  try {
    const tournamentId = `tournament-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const tournamentKey = await generateUniqueKey();

    // Create participant map for name -> id lookup
    const participantMap = new Map<string, string>();
    const participants: TournamentParticipant[] = input.participants.map((p, index) => {
      const id = `participant-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 8)}`;
      const fullName = p.partnerName ? `${p.name} / ${p.partnerName}` : p.name;
      participantMap.set(fullName.toLowerCase(), id);
      participantMap.set(p.name.toLowerCase(), id);

      // Build participant object without undefined values (Firebase rejects undefined)
      const participant: TournamentParticipant = {
        id,
        type: p.oderId ? 'REGISTERED' : 'GUEST',
        name: p.name,
        rankingSnapshot: 0,
        currentRanking: 0,
        status: 'ACTIVE'
      };

      // Only add optional fields if they have values
      if (p.oderId) {
        participant.userId = p.oderId;
      }
      if (p.finalPosition !== undefined && p.finalPosition !== null) {
        participant.finalPosition = p.finalPosition;
      }
      if (p.partnerName) {
        const partnerObj: { type: 'REGISTERED' | 'GUEST'; name: string; userId?: string } = {
          type: p.partnerUserId ? 'REGISTERED' : 'GUEST',
          name: p.partnerName
        };
        if (p.partnerUserId) {
          partnerObj.userId = p.partnerUserId;
        }
        participant.partner = partnerObj;
      }

      return participant;
    });

    // Helper to find participant ID by name
    const findParticipantId = (name: string): string => {
      const id = participantMap.get(name.toLowerCase());
      if (!id) {
        console.warn(`Participant not found: ${name}`);
        return `unknown-${name}`;
      }
      return id;
    };

    // Build group stage if provided
    let groupStage: GroupStage | undefined;
    if (input.groupStage) {
      const groups = input.groupStage.groups.map((g, gIndex) => {
        const standings: GroupStanding[] = g.standings.map((s) => ({
          participantId: findParticipantId(s.participantName),
          position: s.position,
          matchesPlayed: 0,  // Not tracked in simplified import
          matchesWon: 0,     // Not tracked in simplified import
          matchesLost: 0,    // Not tracked in simplified import
          matchesTied: 0,    // Not tracked in simplified import
          // For imported tournaments: put crokinole points in both fields
          // so data shows regardless of qualificationMode (WINS or POINTS)
          points: s.points || 0,
          total20s: s.total20s || 0,
          totalPointsScored: s.points || 0,
          qualifiedForFinal: true // All are qualified in historical
        }));

        return {
          id: `group-${gIndex}`,
          name: g.name,
          participants: standings.map((s) => s.participantId),
          standings,
          schedule: [] // No detailed schedule for historical
        };
      });

      groupStage = {
        type: 'ROUND_ROBIN',
        groups,
        currentRound: 0,
        totalRounds: 0,
        isComplete: true,
        gameMode: 'points',
        pointsToWin: 7,
        matchesToWin: 1,
        numGroups: input.groupStage.numGroups,
        qualificationMode: input.groupStage.qualificationMode || 'WINS'
      };
    }

    // Build final stage
    const buildBracketMatch = (
      match: HistoricalMatchInput,
      position: number,
      matchIndex: number,
      roundIndex: number
    ): BracketMatch => {
      const participantA = findParticipantId(match.participantAName);
      const participantB = findParticipantId(match.participantBName);
      const winner = match.scoreA > match.scoreB ? participantA : participantB;

      return {
        id: `match-${roundIndex}-${matchIndex}-${Date.now()}`,
        position,
        participantA,
        participantB,
        status: match.isWalkover ? 'WALKOVER' : 'COMPLETED',
        winner,
        totalPointsA: match.scoreA ?? 0,
        totalPointsB: match.scoreB ?? 0,
        total20sA: match.twentiesA ?? 0,
        total20sB: match.twentiesB ?? 0,
        completedAt: input.tournamentDate
      };
    };

    // BYE matches are already calculated in the import wizard (step 4)
    // via addByeMatchesToBrackets() in knockoutStageParser.ts
    const buildBracket = (bracketInput: HistoricalBracketInput): BracketWithConfig => {
      const rounds: BracketRound[] = bracketInput.rounds.map((r, rIndex) => ({
        roundNumber: rIndex + 1,
        name: r.name,
        matches: r.matches.map((m, mIndex) =>
          buildBracketMatch(m, mIndex, mIndex, rIndex)
        )
      }));

      return {
        rounds,
        totalRounds: rounds.length,
        config: {
          earlyRounds: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
          semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
          final: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 }
        }
      };
    };

    let finalStage: FinalStage;

    if (input.finalStage.mode === 'PARALLEL_BRACKETS') {
      // Build parallel brackets (A/B/C)
      const parallelBrackets: NamedBracket[] = input.finalStage.brackets.map((b) => {
        const bracket = buildBracket(b);
        // Find winner from final round
        const finalRound = bracket.rounds[bracket.rounds.length - 1];
        const finalMatch = finalRound?.matches[0];
        const bracketWinner = finalMatch?.winner;

        // Build bracket object without undefined values
        const namedBracket: NamedBracket = {
          id: `bracket-${b.label.toLowerCase()}`,
          name: b.name,
          label: b.label,
          bracket,
          sourcePositions: b.sourcePositions
        };

        // Only add winner if it has a value
        if (bracketWinner) {
          namedBracket.winner = bracketWinner;
        }

        return namedBracket;
      });

      // Use first bracket as goldBracket for compatibility
      const firstBracketWinner = parallelBrackets[0]?.winner;
      finalStage = {
        mode: 'PARALLEL_BRACKETS',
        goldBracket: parallelBrackets[0]?.bracket || {
          rounds: [],
          totalRounds: 0,
          config: {
            earlyRounds: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
            semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
            final: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 }
          }
        },
        parallelBrackets,
        isComplete: true
      };

      // Only add winner if it has a value
      if (firstBracketWinner) {
        finalStage.winner = firstBracketWinner;
      }
    } else if (input.finalStage.mode === 'SPLIT_DIVISIONS' && input.finalStage.brackets.length >= 2) {
      // Gold/Silver divisions
      const goldBracket = buildBracket(input.finalStage.brackets[0]);
      const silverBracket = buildBracket(input.finalStage.brackets[1]);

      // Get winners from final matches
      const goldFinal = goldBracket.rounds[goldBracket.rounds.length - 1];
      const silverFinal = silverBracket.rounds[silverBracket.rounds.length - 1];
      const goldWinner = goldFinal?.matches[0]?.winner;
      const silverWinner = silverFinal?.matches[0]?.winner;

      // Build finalStage without undefined values
      finalStage = {
        mode: 'SPLIT_DIVISIONS',
        goldBracket,
        silverBracket,
        isComplete: true
      };

      // Only add winner fields if they have values
      if (goldWinner) {
        finalStage.winner = goldWinner;
      }
      if (silverWinner) {
        finalStage.silverWinner = silverWinner;
      }
    } else {
      // Single bracket
      const bracket = buildBracket(input.finalStage.brackets[0]);
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const bracketWinner = finalRound?.matches[0]?.winner;

      finalStage = {
        mode: 'SINGLE_BRACKET',
        goldBracket: bracket,
        isComplete: true
      };

      // Only add winner if it has a value
      if (bracketWinner) {
        finalStage.winner = bracketWinner;
      }
    }

    // Auto-calculate numTables: minimum needed for parallel play
    // = max(numGroups, maxFirstRoundMatchesInAnyBracket)
    const numGroups = input.groupStage?.numGroups || 0;
    let maxBracketFirstRoundMatches = 0;

    if (input.finalStage.mode === 'PARALLEL_BRACKETS') {
      // Sum of first round matches across all parallel brackets (they play simultaneously)
      maxBracketFirstRoundMatches = input.finalStage.brackets.reduce((sum, b) => {
        return sum + (b.rounds[0]?.matches.length || 0);
      }, 0);
    } else if (input.finalStage.mode === 'SPLIT_DIVISIONS') {
      // Gold and silver brackets can play in parallel
      const goldFirstRound = input.finalStage.brackets[0]?.rounds[0]?.matches.length || 0;
      const silverFirstRound = input.finalStage.brackets[1]?.rounds[0]?.matches.length || 0;
      maxBracketFirstRoundMatches = goldFirstRound + silverFirstRound;
    } else {
      // Single bracket
      maxBracketFirstRoundMatches = input.finalStage.brackets[0]?.rounds[0]?.matches.length || 0;
    }

    const calculatedNumTables = Math.max(numGroups, maxBracketFirstRoundMatches, 1);

    // Build tournament document (only include defined values - Firebase rejects undefined)
    const tournament: Partial<Tournament> = {
      id: tournamentId,
      key: tournamentKey,
      name: input.name,
      city: input.city,
      country: input.country,
      tournamentDate: input.tournamentDate,
      status: 'COMPLETED',
      phaseType: input.phaseType,
      gameType: input.gameType,
      show20s: input.show20s ?? true,
      showHammer: input.showHammer ?? false,
      isTest: input.isTest ?? false,
      numTables: calculatedNumTables,
      rankingConfig: input.rankingConfig,
      participants,
      finalStage,
      createdAt: Date.now(),
      createdBy: {
        userId: user.id,
        userName: creatorName
      },
      startedAt: input.tournamentDate,
      completedAt: input.tournamentDate,
      updatedAt: Date.now(),
      isImported: true,
      importedAt: Date.now(),
      importedBy: {
        userId: user.id,
        userName: creatorName
      }
    };

    // Add optional fields only if they have values
    if (input.description) {
      tournament.description = input.description;
    }
    if (input.edition !== undefined && input.edition !== null) {
      tournament.edition = input.edition;
    }
    if (input.address) {
      tournament.address = input.address;
    }
    if (groupStage) {
      tournament.groupStage = groupStage;
    }
    if (input.externalLink) {
      tournament.externalLink = input.externalLink;
    }
    if (input.posterUrl) {
      tournament.posterUrl = input.posterUrl;
    }

    console.log('📦 Tournament document to save:', JSON.stringify(tournament, null, 2));

    const tournamentRef = doc(db, 'tournaments', tournamentId);
    await setDoc(tournamentRef, {
      ...tournament,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      importedAt: serverTimestamp()
    });

    console.log('✅ Historical tournament created:', tournamentId);
    return tournamentId;
  } catch (error) {
    console.error('❌ Error creating historical tournament:', error);
    return null;
  }
}

/**
 * Update a historical tournament draft
 */
export async function updateHistoricalTournament(
  id: string,
  updates: Partial<HistoricalTournamentInput>
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled() || !db) {
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', id);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.error('Tournament not found');
      return false;
    }

    const data = snapshot.data();

    // Check ownership
    const superAdminStatus = await isSuperAdmin();
    if (!superAdminStatus && data.createdBy?.userId !== user.id) {
      console.error('Unauthorized');
      return false;
    }

    await updateDoc(tournamentRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error('Error updating historical tournament:', error);
    return false;
  }
}

/**
 * Input for creating an upcoming tournament (minimal info only)
 */
export interface UpcomingTournamentInput {
  name: string;
  description?: string;
  edition?: number;
  tournamentDate: number;
  address?: string;
  city: string;
  country: string;
  gameType: 'singles' | 'doubles';
  rankingConfig: RankingConfig;
  externalLink?: string;
  posterUrl?: string;
  isTest?: boolean;
}

/**
 * Create a new upcoming tournament (announcement only, no game config)
 * This creates a minimal tournament with just basic info and status DRAFT
 */
export async function createUpcomingTournament(
  input: UpcomingTournamentInput
): Promise<string | null> {
  if (!browser || !isFirebaseEnabled() || !db) {
    console.warn('Firebase disabled');
    return null;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return null;
  }

  // Check import permission
  const canImport = await canImportTournaments();
  if (!canImport) {
    console.error('Unauthorized: User does not have import permission');
    return null;
  }

  try {
    // Get user profile for name
    const profile = await getUserProfile(user.id);
    const userName = profile?.name || user.displayName || 'Unknown';

    // Generate tournament ID and key
    const tournamentId = `tournament-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const tournamentKey = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Build minimal tournament document (no finalStage, no groupStage, no participants)
    const tournament: Partial<Tournament> = {
      id: tournamentId,
      key: tournamentKey,
      name: input.name,
      city: input.city,
      country: input.country,
      tournamentDate: input.tournamentDate,
      status: 'DRAFT', // Use DRAFT for upcoming tournaments
      phaseType: 'ONE_PHASE', // Default, will be configured later
      gameType: input.gameType,
      show20s: true,
      showHammer: false,
      isTest: input.isTest ?? false,
      numTables: 1,
      rankingConfig: input.rankingConfig,
      participants: [], // Empty for now
      isImported: true, // Mark as imported to distinguish from regular DRAFT
      createdBy: {
        userId: user.id,
        userName
      }
    };

    // Add optional fields
    if (input.description) {
      tournament.description = input.description;
    }
    if (input.edition !== undefined && input.edition !== null) {
      tournament.edition = input.edition;
    }
    if (input.address) {
      tournament.address = input.address;
    }
    if (input.externalLink) {
      tournament.externalLink = input.externalLink;
    }
    if (input.posterUrl) {
      tournament.posterUrl = input.posterUrl;
    }

    console.log('📦 Upcoming tournament to save:', JSON.stringify(tournament, null, 2));

    const tournamentRef = doc(db, 'tournaments', tournamentId);
    await setDoc(tournamentRef, {
      ...tournament,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ Upcoming tournament created:', tournamentId);
    return tournamentId;
  } catch (error) {
    console.error('❌ Error creating upcoming tournament:', error);
    return null;
  }
}

/**
 * Complete an upcoming tournament by adding full configuration
 * This rebuilds the tournament with participants, groups, brackets, etc.
 * and sets isImported=false (converting from upcoming to normal tournament)
 */
export async function completeUpcomingTournament(
  id: string,
  input: HistoricalTournamentInput,
  keepAsUpcoming: boolean = false
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled() || !db) {
    console.warn('Firebase disabled');
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    console.warn('No user authenticated');
    return false;
  }

  // Check import permission
  const canImport = await canImportTournaments();
  if (!canImport) {
    console.error('Unauthorized: User does not have import permission');
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', id);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      console.error('Tournament not found');
      return false;
    }

    const existingData = snapshot.data();

    // Check ownership
    const superAdminStatus = await isSuperAdmin();
    if (!superAdminStatus && existingData.createdBy?.userId !== user.id) {
      console.error('Unauthorized');
      return false;
    }

    // Create participant map for name -> id lookup
    const participantMap = new Map<string, string>();
    const participants: TournamentParticipant[] = input.participants.map((p, index) => {
      const participantId = `participant-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 8)}`;
      const fullName = p.partnerName ? `${p.name} / ${p.partnerName}` : p.name;
      participantMap.set(fullName.toLowerCase(), participantId);
      participantMap.set(p.name.toLowerCase(), participantId);

      const participant: TournamentParticipant = {
        id: participantId,
        type: p.oderId ? 'REGISTERED' : 'GUEST',
        name: p.name,
        rankingSnapshot: 0,
        currentRanking: 0,
        status: 'ACTIVE'
      };

      if (p.oderId) {
        participant.userId = p.oderId;
      }
      if (p.finalPosition !== undefined && p.finalPosition !== null) {
        participant.finalPosition = p.finalPosition;
      }
      if (p.partnerName) {
        const partnerObj: { type: 'REGISTERED' | 'GUEST'; name: string; userId?: string } = {
          type: p.partnerUserId ? 'REGISTERED' : 'GUEST',
          name: p.partnerName
        };
        if (p.partnerUserId) {
          partnerObj.userId = p.partnerUserId;
        }
        participant.partner = partnerObj;
      }

      return participant;
    });

    // Helper to find participant ID by name
    const findParticipantId = (name: string): string => {
      // BYE is a special case - return 'BYE' directly
      if (name.toUpperCase() === 'BYE') {
        return 'BYE';
      }
      const foundId = participantMap.get(name.toLowerCase());
      if (!foundId) {
        console.warn(`Participant not found: ${name}`);
        return `unknown-${name}`;
      }
      return foundId;
    };

    // Build group stage if provided
    let groupStage: GroupStage | undefined;
    if (input.groupStage) {
      const groups = input.groupStage.groups.map((g, gIndex) => {
        const standings: GroupStanding[] = g.standings.map((s) => ({
          participantId: findParticipantId(s.participantName),
          position: s.position,
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          matchesTied: 0,
          // For imported tournaments: put crokinole points in both fields
          // so data shows regardless of qualificationMode (WINS or POINTS)
          points: s.points || 0,
          total20s: s.total20s || 0,
          totalPointsScored: s.points || 0,
          qualifiedForFinal: true
        }));

        return {
          id: `group-${gIndex}`,
          name: g.name,
          participants: standings.map((s) => s.participantId),
          standings,
          schedule: []
        };
      });

      groupStage = {
        type: 'ROUND_ROBIN',
        groups,
        currentRound: 0,
        totalRounds: 0,
        isComplete: true,
        gameMode: 'points',
        pointsToWin: 7,
        matchesToWin: 1,
        numGroups: input.groupStage.numGroups,
        qualificationMode: input.groupStage.qualificationMode || 'WINS'
      };
    }

    // Build final stage
    const buildBracketMatch = (
      match: HistoricalMatchInput,
      position: number,
      matchIndex: number,
      roundIndex: number
    ): BracketMatch => {
      const participantA = findParticipantId(match.participantAName);
      const participantB = findParticipantId(match.participantBName);
      const winner = match.scoreA > match.scoreB ? participantA : participantB;

      return {
        id: `match-${roundIndex}-${matchIndex}-${Date.now()}`,
        position,
        participantA,
        participantB,
        status: match.isWalkover ? 'WALKOVER' : 'COMPLETED',
        winner,
        totalPointsA: match.scoreA ?? 0,
        totalPointsB: match.scoreB ?? 0,
        total20sA: match.twentiesA ?? 0,
        total20sB: match.twentiesB ?? 0,
        completedAt: input.tournamentDate
      };
    };

    // BYE matches are already calculated in the import wizard (step 4)
    // via addByeMatchesToBrackets() in knockoutStageParser.ts
    const buildBracket = (bracketInput: HistoricalBracketInput): BracketWithConfig => {
      const rounds: BracketRound[] = bracketInput.rounds.map((r, rIndex) => ({
        roundNumber: rIndex + 1,
        name: r.name,
        matches: r.matches.map((m, mIndex) =>
          buildBracketMatch(m, mIndex, mIndex, rIndex)
        )
      }));

      return {
        rounds,
        totalRounds: rounds.length,
        config: {
          earlyRounds: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
          semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
          final: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 }
        }
      };
    };

    let finalStage: FinalStage;

    if (input.finalStage.mode === 'PARALLEL_BRACKETS') {
      const parallelBrackets: NamedBracket[] = input.finalStage.brackets.map((b) => {
        const bracket = buildBracket(b);
        const finalRound = bracket.rounds[bracket.rounds.length - 1];
        const finalMatch = finalRound?.matches[0];
        const bracketWinner = finalMatch?.winner;

        const namedBracket: NamedBracket = {
          id: `bracket-${b.label.toLowerCase()}`,
          name: b.name,
          label: b.label,
          bracket,
          sourcePositions: b.sourcePositions
        };

        if (bracketWinner) {
          namedBracket.winner = bracketWinner;
        }

        return namedBracket;
      });

      const firstBracketWinner = parallelBrackets[0]?.winner;
      finalStage = {
        mode: 'PARALLEL_BRACKETS',
        goldBracket: parallelBrackets[0]?.bracket || {
          rounds: [],
          totalRounds: 0,
          config: {
            earlyRounds: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
            semifinal: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
            final: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 }
          }
        },
        parallelBrackets,
        isComplete: true
      };

      if (firstBracketWinner) {
        finalStage.winner = firstBracketWinner;
      }
    } else if (input.finalStage.mode === 'SPLIT_DIVISIONS' && input.finalStage.brackets.length >= 2) {
      const goldBracket = buildBracket(input.finalStage.brackets[0]);
      const silverBracket = buildBracket(input.finalStage.brackets[1]);

      const goldFinal = goldBracket.rounds[goldBracket.rounds.length - 1];
      const silverFinal = silverBracket.rounds[silverBracket.rounds.length - 1];
      const goldWinner = goldFinal?.matches[0]?.winner;
      const silverWinner = silverFinal?.matches[0]?.winner;

      finalStage = {
        mode: 'SPLIT_DIVISIONS',
        goldBracket,
        silverBracket,
        isComplete: true
      };

      if (goldWinner) {
        finalStage.winner = goldWinner;
      }
      if (silverWinner) {
        finalStage.silverWinner = silverWinner;
      }
    } else {
      const bracket = buildBracket(input.finalStage.brackets[0]);
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const bracketWinner = finalRound?.matches[0]?.winner;

      finalStage = {
        mode: 'SINGLE_BRACKET',
        goldBracket: bracket,
        isComplete: true
      };

      if (bracketWinner) {
        finalStage.winner = bracketWinner;
      }
    }

    // Calculate numTables
    const numGroups = input.groupStage?.numGroups || 0;
    let maxBracketFirstRoundMatches = 0;

    if (input.finalStage.mode === 'PARALLEL_BRACKETS') {
      maxBracketFirstRoundMatches = input.finalStage.brackets.reduce((sum, b) => {
        return sum + (b.rounds[0]?.matches.length || 0);
      }, 0);
    } else if (input.finalStage.mode === 'SPLIT_DIVISIONS') {
      const goldFirstRound = input.finalStage.brackets[0]?.rounds[0]?.matches.length || 0;
      const silverFirstRound = input.finalStage.brackets[1]?.rounds[0]?.matches.length || 0;
      maxBracketFirstRoundMatches = goldFirstRound + silverFirstRound;
    } else {
      maxBracketFirstRoundMatches = input.finalStage.brackets[0]?.rounds[0]?.matches.length || 0;
    }

    const calculatedNumTables = Math.max(numGroups, maxBracketFirstRoundMatches, 1);

    // Build update data
    const updateData: Record<string, unknown> = {
      name: input.name,
      city: input.city,
      country: input.country,
      tournamentDate: input.tournamentDate,
      status: 'COMPLETED',
      phaseType: input.phaseType,
      gameType: input.gameType,
      show20s: input.show20s ?? true,
      showHammer: input.showHammer ?? false,
      isTest: input.isTest ?? false,
      numTables: calculatedNumTables,
      rankingConfig: input.rankingConfig,
      participants,
      finalStage,
      startedAt: input.tournamentDate,
      completedAt: input.tournamentDate,
      updatedAt: serverTimestamp(),
      // Convert from upcoming to imported (completed historical)
      isImported: keepAsUpcoming ? true : true // Keep as imported for historical tournaments
    };

    // Add optional fields
    if (input.edition !== undefined && input.edition !== null) {
      updateData.edition = input.edition;
    }
    if (input.address) {
      updateData.address = input.address;
    }
    if (groupStage) {
      updateData.groupStage = groupStage;
    }
    if (input.externalLink) {
      updateData.externalLink = input.externalLink;
    }

    await updateDoc(tournamentRef, updateData);

    console.log('✅ Upcoming tournament completed:', id);
    return true;
  } catch (error) {
    console.error('❌ Error completing upcoming tournament:', error);
    return false;
  }
}

/**
 * Link a historical participant to a registered user
 */
export async function linkParticipantToUser(
  tournamentId: string,
  participantId: string,
  userId: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled() || !db) {
    return false;
  }

  const user = get(currentUser);
  if (!user) {
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);
    const snapshot = await getDoc(tournamentRef);

    if (!snapshot.exists()) {
      return false;
    }

    const tournament = snapshot.data() as Tournament;

    // Check ownership
    const superAdminStatus = await isSuperAdmin();
    if (!superAdminStatus && tournament.createdBy?.userId !== user.id) {
      return false;
    }

    // Find and update participant
    const participants = tournament.participants.map((p) => {
      if (p.id === participantId) {
        return {
          ...p,
          type: 'REGISTERED' as const,
          userId
        };
      }
      return p;
    });

    await updateDoc(tournamentRef, {
      participants,
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error('Error linking participant:', error);
    return false;
  }
}

/**
 * Get all imported tournaments
 */
export async function getImportedTournaments(
  limitCount: number = 50
): Promise<Tournament[]> {
  if (!browser || !isFirebaseEnabled() || !db) {
    return [];
  }

  const user = get(currentUser);
  if (!user) {
    return [];
  }

  const adminStatus = await isAdmin();
  if (!adminStatus) {
    return [];
  }

  try {
    const tournamentsRef = collection(db, 'tournaments');
    const superAdminStatus = await isSuperAdmin();

    let q;
    if (superAdminStatus) {
      q = query(
        tournamentsRef,
        where('isImported', '==', true),
        orderBy('tournamentDate', 'desc'),
        limit(limitCount)
      );
    } else {
      q = query(
        tournamentsRef,
        where('isImported', '==', true),
        where('createdBy.userId', '==', user.id),
        orderBy('tournamentDate', 'desc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);
    const tournaments: Tournament[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      tournaments.push({
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt,
        tournamentDate: data.tournamentDate instanceof Timestamp ? data.tournamentDate.toMillis() : data.tournamentDate,
        importedAt: data.importedAt instanceof Timestamp ? data.importedAt.toMillis() : data.importedAt
      } as Tournament);
    });

    return tournaments;
  } catch (error) {
    console.error('Error getting historical tournaments:', error);
    return [];
  }
}
