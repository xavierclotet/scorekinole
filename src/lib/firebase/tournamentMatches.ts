/**
 * Tournament match management
 * Update match results and handle no-shows
 * Includes functions for /game page integration
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseEnabled } from './config';
import type { GroupMatch, GroupStanding, BracketMatch, Tournament, TournamentParticipant } from '$lib/types/tournament';
import type { TournamentGameConfig } from '$lib/stores/tournamentContext';
import { getTournament } from './tournaments';
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
 * Reassign a freed table to a pending match without a table
 * Called after a match completes to dynamically assign tables
 *
 * @param tournament Tournament object
 * @param freedTable Table number that was freed
 * @param groupIndex Index of the group
 * @param roundIndex Index of the round (schedule or pairings)
 */
function reassignFreedTable(
  tournament: Tournament,
  freedTable: number,
  groupIndex: number,
  roundIndex: number
): void {
  const group = tournament.groupStage?.groups[groupIndex];
  if (!group) return;

  // Get matches from the same round
  const round = group.schedule
    ? group.schedule[roundIndex]
    : group.pairings?.[roundIndex];

  if (!round) return;

  // Find a pending match without a table assigned
  for (const match of round.matches) {
    if (
      match.status === 'PENDING' &&
      match.participantB !== 'BYE' &&
      !match.tableNumber
    ) {
      match.tableNumber = freedTable;
      console.log(`🎯 Reassigned table ${freedTable} to match ${match.id}`);
      return; // Only reassign to one match
    }
  }
}

/**
 * Update match result
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param result Match result data
 * @returns true if successful
 */
export async function updateMatchResult(
  tournamentId: string,
  matchId: string,
  result: {
    gamesWonA: number;
    gamesWonB: number;
    totalPointsA?: number;
    totalPointsB?: number;
    total20sA?: number;
    total20sB?: number;
    videoUrl?: string;
    videoId?: string;
    rounds?: Array<{
      gameNumber: number;
      roundInGame: number;
      pointsA: number | null;
      pointsB: number | null;
      twentiesA: number;
      twentiesB: number;
    }>;
  }
): Promise<boolean> {
  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament || !tournament.groupStage) {
      console.error('Tournament or group stage not found');
      return false;
    }

    // Find the match in the groups
    let matchFound = false;
    let groupIndex = -1;
    let matchIndex = -1;
    let roundIndex = -1;

    for (let gi = 0; gi < tournament.groupStage.groups.length; gi++) {
      const group = tournament.groupStage.groups[gi];

      // Check in schedule (Round Robin)
      if (group.schedule) {
        for (let ri = 0; ri < group.schedule.length; ri++) {
          const round = group.schedule[ri];
          for (let mi = 0; mi < round.matches.length; mi++) {
            if (round.matches[mi].id === matchId) {
              matchFound = true;
              groupIndex = gi;
              roundIndex = ri;
              matchIndex = mi;
              break;
            }
          }
          if (matchFound) break;
        }
      }

      // Check in pairings (Swiss)
      if (!matchFound && group.pairings) {
        for (let pi = 0; pi < group.pairings.length; pi++) {
          const pairing = group.pairings[pi];
          for (let mi = 0; mi < pairing.matches.length; mi++) {
            if (pairing.matches[mi].id === matchId) {
              matchFound = true;
              groupIndex = gi;
              roundIndex = pi;
              matchIndex = mi;
              break;
            }
          }
          if (matchFound) break;
        }
      }

      if (matchFound) break;
    }

    if (!matchFound) {
      console.error('Match not found in tournament');
      return false;
    }

    // Get the match to update
    const group = tournament.groupStage.groups[groupIndex];
    const match = group.schedule
      ? group.schedule[roundIndex].matches[matchIndex]
      : group.pairings![roundIndex].matches[matchIndex];

    // Determine winner based on game mode (handle ties)
    let winner: string | undefined;

    // Get gameMode from groupStage
    const gameMode = tournament.groupStage?.gameMode || 'rounds';

    // In rounds mode, compare total points; in points mode, compare games won
    const compareValueA = gameMode === 'rounds' ? (result.totalPointsA || 0) : result.gamesWonA;
    const compareValueB = gameMode === 'rounds' ? (result.totalPointsB || 0) : result.gamesWonB;

    if (compareValueA > compareValueB) {
      winner = match.participantA;
    } else if (compareValueB > compareValueA) {
      winner = match.participantB;
    }
    // If tied (compareValueA === compareValueB), winner remains undefined

    // Update match in-memory
    match.status = 'COMPLETED';
    match.winner = winner;
    match.gamesWonA = result.gamesWonA;
    match.gamesWonB = result.gamesWonB;
    match.completedAt = Date.now();

    if (result.totalPointsA !== undefined) {
      match.totalPointsA = result.totalPointsA;
    }
    if (result.totalPointsB !== undefined) {
      match.totalPointsB = result.totalPointsB;
    }
    if (result.total20sA !== undefined) {
      match.total20sA = result.total20sA;
    }
    if (result.total20sB !== undefined) {
      match.total20sB = result.total20sB;
    }
    if (result.rounds !== undefined) {
      match.rounds = result.rounds;
      console.log('💾 Saved rounds to match:', match.rounds);
    }
    if (result.videoUrl !== undefined) {
      match.videoUrl = result.videoUrl;
      match.videoId = result.videoId;
    }

    // Reassign the freed table to a pending match without a table
    if (match.tableNumber) {
      reassignFreedTable(tournament, match.tableNumber, groupIndex, roundIndex);
    }

    if (!db) {
      console.error('Firestore not initialized');
      return false;
    }

    // Clean undefined values before writing to Firestore
    const cleanedGroupStage = cleanUndefined(tournament.groupStage);

    // Write entire groupStage back to Firestore to preserve array structure
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      groupStage: cleanedGroupStage
    });

    // Update standings
    await updateStandings(tournamentId, groupIndex);

    return true;
  } catch (error) {
    console.error('Error updating match result:', error);
    return false;
  }
}

/**
 * Update video URL for a match
 * Works for both group stage and bracket matches
 */
export async function updateMatchVideo(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  videoUrl?: string,
  videoId?: string
): Promise<boolean> {
  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      console.error('Tournament not found');
      return false;
    }

    if (phase === 'GROUP') {
      // Find match in group stage
      if (!tournament.groupStage) return false;

      let matchFound = false;
      for (const group of tournament.groupStage.groups) {
        const schedule = group.schedule || group.pairings;
        if (!schedule) continue;
        for (const round of schedule) {
          const match = round.matches.find((m: GroupMatch) => m.id === matchId);
          if (match) {
            match.videoUrl = videoUrl;
            match.videoId = videoId;
            matchFound = true;
            break;
          }
        }
        if (matchFound) break;
      }

      if (!matchFound) return false;

      if (!db) return false;
      await updateDoc(doc(db, 'tournaments', tournamentId), {
        groupStage: cleanUndefined(tournament.groupStage)
      });
    } else {
      // Find match in bracket
      if (!tournament.finalStage) return false;

      let matchFound = false;

      // Search in gold bracket
      if (tournament.finalStage.goldBracket) {
        for (const round of tournament.finalStage.goldBracket.rounds) {
          const match = round.matches.find(m => m.id === matchId);
          if (match) {
            match.videoUrl = videoUrl;
            match.videoId = videoId;
            matchFound = true;
            break;
          }
        }
        // Check third place match
        if (!matchFound && tournament.finalStage.goldBracket.thirdPlaceMatch?.id === matchId) {
          tournament.finalStage.goldBracket.thirdPlaceMatch.videoUrl = videoUrl;
          tournament.finalStage.goldBracket.thirdPlaceMatch.videoId = videoId;
          matchFound = true;
        }
        // Check consolation brackets
        if (!matchFound && tournament.finalStage.goldBracket.consolationBrackets) {
          for (const consolation of tournament.finalStage.goldBracket.consolationBrackets) {
            for (const round of consolation.rounds) {
              const match = round.matches.find(m => m.id === matchId);
              if (match) {
                match.videoUrl = videoUrl;
                match.videoId = videoId;
                matchFound = true;
                break;
              }
            }
            if (matchFound) break;
          }
        }
      }

      // Search in silver bracket if not found
      if (!matchFound && tournament.finalStage.silverBracket) {
        for (const round of tournament.finalStage.silverBracket.rounds) {
          const match = round.matches.find(m => m.id === matchId);
          if (match) {
            match.videoUrl = videoUrl;
            match.videoId = videoId;
            matchFound = true;
            break;
          }
        }
        if (!matchFound && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          tournament.finalStage.silverBracket.thirdPlaceMatch.videoUrl = videoUrl;
          tournament.finalStage.silverBracket.thirdPlaceMatch.videoId = videoId;
          matchFound = true;
        }
      }

      if (!matchFound) return false;

      if (!db) return false;
      await updateDoc(doc(db, 'tournaments', tournamentId), {
        finalStage: cleanUndefined(tournament.finalStage)
      });
    }

    return true;
  } catch (error) {
    console.error('Error updating match video:', error);
    return false;
  }
}

/**
 * Mark participant as no-show
 *
 * @param tournamentId Tournament ID
 * @param matchId Match ID
 * @param noShowParticipantId Participant who didn't show
 * @returns true if successful
 */
export async function markNoShow(
  tournamentId: string,
  matchId: string,
  noShowParticipantId: string
): Promise<boolean> {
  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament || !tournament.groupStage) {
      console.error('Tournament or group stage not found');
      return false;
    }

    // Find the match
    let matchFound = false;
    let groupIndex = -1;
    let matchIndex = -1;
    let roundIndex = -1;
    let match: GroupMatch | null = null;

    for (let gi = 0; gi < tournament.groupStage.groups.length; gi++) {
      const group = tournament.groupStage.groups[gi];

      if (group.schedule) {
        for (let ri = 0; ri < group.schedule.length; ri++) {
          const round = group.schedule[ri];
          for (let mi = 0; mi < round.matches.length; mi++) {
            if (round.matches[mi].id === matchId) {
              matchFound = true;
              groupIndex = gi;
              roundIndex = ri;
              matchIndex = mi;
              match = round.matches[mi];
              break;
            }
          }
          if (matchFound) break;
        }
      }

      if (!matchFound && group.pairings) {
        for (let pi = 0; pi < group.pairings.length; pi++) {
          const pairing = group.pairings[pi];
          for (let mi = 0; mi < pairing.matches.length; mi++) {
            if (pairing.matches[mi].id === matchId) {
              matchFound = true;
              groupIndex = gi;
              roundIndex = pi;
              matchIndex = mi;
              match = pairing.matches[mi];
              break;
            }
          }
          if (matchFound) break;
        }
      }

      if (matchFound) break;
    }

    if (!matchFound || !match) {
      console.error('Match not found in tournament');
      return false;
    }

    // Determine winner (the one who showed up)
    const winner = match.participantA === noShowParticipantId
      ? match.participantB
      : match.participantA;

    // Update match with walkover
    // Get matchesToWin from groupStage (First to X wins)
    const requiredWins = tournament.groupStage?.matchesToWin || 1;

    // Update match in-memory
    match.status = 'WALKOVER';
    match.winner = winner;
    match.noShowParticipant = noShowParticipantId;
    match.walkedOverAt = Date.now();
    match.completedAt = Date.now();

    // Set games won
    if (winner === match.participantA) {
      match.gamesWonA = requiredWins;
      match.gamesWonB = 0;
    } else {
      match.gamesWonA = 0;
      match.gamesWonB = requiredWins;
    }

    if (!db) {
      console.error('Firestore not initialized');
      return false;
    }

    // Clean undefined values before writing to Firestore
    const cleanedGroupStage = cleanUndefined(tournament.groupStage);

    // Write entire groupStage back to Firestore to preserve array structure
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      groupStage: cleanedGroupStage
    });

    // Update standings
    await updateStandings(tournamentId, groupIndex);

    return true;
  } catch (error) {
    console.error('Error marking no-show:', error);
    return false;
  }
}

/**
 * Update group standings after match completion
 *
 * @param tournamentId Tournament ID
 * @param groupIndex Group index
 */
async function updateStandings(tournamentId: string, groupIndex: number): Promise<void> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) return;

  const group = tournament.groupStage.groups[groupIndex];
  if (!group) return;

  // Get qualification mode configuration
  // Supports qualificationMode (new) and legacy fields (rankingSystem, swissRankingSystem)
  const qualificationMode = tournament.groupStage.qualificationMode || tournament.groupStage.rankingSystem || tournament.groupStage.swissRankingSystem || 'WINS';
  const isSwiss = tournament.groupStage.type === 'SWISS';

  // Get all matches from schedule or pairings
  let matches: GroupMatch[] = [];

  if (group.schedule && Array.isArray(group.schedule)) {
    matches = group.schedule.flatMap(r => r.matches || []);
  } else if (group.pairings && Array.isArray(group.pairings)) {
    matches = group.pairings.flatMap(p => p.matches || []);
  }

  // Calculate standings
  const standingsMap = new Map<string, GroupStanding>();

  // Initialize standings for all participants
  group.participants.forEach(participantId => {
    standingsMap.set(participantId, {
      participantId,
      position: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      matchesTied: 0,
      points: 0,
      swissPoints: isSwiss ? 0 : undefined,
      total20s: 0,
      totalPointsScored: 0,
      qualifiedForFinal: false
    });
  });

  // Process completed matches
  matches.forEach(match => {
    if (match.status !== 'COMPLETED' && match.status !== 'WALKOVER') return;
    if (match.participantB === 'BYE') return;

    const standingA = standingsMap.get(match.participantA);
    const standingB = standingsMap.get(match.participantB);
    if (!standingA || !standingB) return;

    // Update matches played
    standingA.matchesPlayed++;
    standingB.matchesPlayed++;

    // Update wins/losses/ties and points based on ranking system
    // Both Round Robin and Swiss use 2/1/0 (win/tie/loss)
    if (match.winner === match.participantA) {
      standingA.matchesWon++;
      standingB.matchesLost++;
      standingA.points += 2;  // 2 points for win
      if (isSwiss) {
        standingA.swissPoints = (standingA.swissPoints || 0) + 2;
      }
    } else if (match.winner === match.participantB) {
      standingB.matchesWon++;
      standingA.matchesLost++;
      standingB.points += 2;  // 2 points for win
      if (isSwiss) {
        standingB.swissPoints = (standingB.swissPoints || 0) + 2;
      }
    } else {
      // Tie (shouldn't happen in Best of X, but handle it)
      standingA.matchesTied++;
      standingB.matchesTied++;
      standingA.points += 1;
      standingB.points += 1;
      if (isSwiss) {
        standingA.swissPoints = (standingA.swissPoints || 0) + 1;
        standingB.swissPoints = (standingB.swissPoints || 0) + 1;
      }
    }

    // Update 20s
    if (match.total20sA) standingA.total20s += match.total20sA;
    if (match.total20sB) standingB.total20s += match.total20sB;

    // Update total points scored (Crokinole points)
    if (match.totalPointsA) standingA.totalPointsScored += match.totalPointsA;
    if (match.totalPointsB) standingB.totalPointsScored += match.totalPointsB;
  });

  // Sort standings based on qualification mode
  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    if (qualificationMode === 'POINTS') {
      // Sort by total Crokinole points scored
      if (b.totalPointsScored !== a.totalPointsScored) return b.totalPointsScored - a.totalPointsScored;
      // Tiebreaker: total 20s
      if (b.total20s !== a.total20s) return b.total20s - a.total20s;
      // Tiebreaker: match points
      return (isSwiss ? (b.swissPoints || 0) - (a.swissPoints || 0) : b.points - a.points);
    } else {
      // Sort by match points (WINS system - default)
      // Both Swiss and Round Robin use 2/1/0
      if (isSwiss) {
        if ((b.swissPoints || 0) !== (a.swissPoints || 0)) return (b.swissPoints || 0) - (a.swissPoints || 0);
      } else {
        if (b.points !== a.points) return b.points - a.points;
      }
      // Tiebreaker 1: total 20s
      if (b.total20s !== a.total20s) return b.total20s - a.total20s;
      // Tiebreaker 2: total points scored
      return b.totalPointsScored - a.totalPointsScored;
    }
  });

  // Assign positions
  standings.forEach((standing, index) => {
    standing.position = index + 1;
  });

  // Update standings in-memory
  group.standings = standings;

  // Update in Firestore - write entire groupStage to preserve array structure
  if (!db) {
    console.error('Firestore not initialized');
    return;
  }

  // Clean undefined values before writing to Firestore
  const cleanedGroupStage = cleanUndefined(tournament.groupStage);

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    groupStage: cleanedGroupStage
  });
}

// ============================================================================
// /game Page Integration Functions
// These functions support playing tournament matches from the /game page
// ============================================================================

/**
 * Pending match info for display in match selection
 */
export interface PendingMatchInfo {
  match: GroupMatch | BracketMatch;
  phase: 'GROUP' | 'FINAL';
  groupId?: string;
  groupName?: string;  // Group name for display (e.g., "Grupo A")
  roundNumber?: number;
  bracketRoundName?: string;
  participantAName: string;
  participantBName: string;
  participantAPhotoURL?: string;  // Avatar URL for participant A (or first member in doubles)
  participantBPhotoURL?: string;  // Avatar URL for participant B (or first member in doubles)
  participantAPartnerPhotoURL?: string;  // For doubles: second member of team A
  participantBPartnerPhotoURL?: string;  // For doubles: second member of team B
  gameConfig: TournamentGameConfig;
  isInProgress?: boolean;  // True if match is IN_PROGRESS (for resume functionality)
  tableNumber?: number;    // Table number for display (e.g., M1, M2)
  isSilverBracket?: boolean;  // True if match is in the silver bracket (for SPLIT_DIVISIONS mode)
  isConsolation?: boolean;  // True if match is in a consolation bracket
}

/**
 * Get game configuration for a specific match based on tournament settings
 */
function getGameConfigForMatch(
  tournament: Tournament,
  phase: 'GROUP' | 'FINAL',
  bracketRoundName?: string,
  isSilverBracket?: boolean
): TournamentGameConfig {
  if (phase === 'GROUP' && tournament.groupStage) {
    return {
      gameMode: tournament.groupStage.gameMode,
      pointsToWin: tournament.groupStage.pointsToWin,
      roundsToPlay: tournament.groupStage.roundsToPlay,
      matchesToWin: tournament.groupStage.matchesToWin,
      show20s: tournament.show20s,
      showHammer: tournament.showHammer,
      gameType: tournament.gameType
    };
  }

  // Final stage - get config from the appropriate bracket
  const fs = tournament.finalStage;
  if (!fs) {
    // Fallback defaults
    return {
      gameMode: 'points',
      pointsToWin: 7,
      matchesToWin: 1,
      show20s: tournament.show20s,
      showHammer: tournament.showHammer,
      gameType: tournament.gameType
    };
  }

  // Get the bracket config based on silver or gold bracket
  const bracket = isSilverBracket ? fs.silverBracket : fs.goldBracket;
  if (!bracket || !bracket.config) {
    // Fallback defaults if no bracket config
    return {
      gameMode: 'points',
      pointsToWin: 7,
      matchesToWin: 1,
      show20s: tournament.show20s,
      showHammer: tournament.showHammer,
      gameType: tournament.gameType
    };
  }

  const bracketConfig = bracket.config;

  // Determine which phase config to use based on bracket round name
  // Round names from bracket.ts: 'finals', 'semifinals', 'quarterfinals', 'round16', etc.
  const roundNameLower = bracketRoundName?.toLowerCase() || '';

  // Important: 'quarterfinals' contains 'final' but is NOT the final round
  // Check for exact 'finals' or exclude 'quarter' from the 'final' check
  const isFinal = roundNameLower === 'finals' ||
    (roundNameLower.includes('final') && !roundNameLower.includes('semi') && !roundNameLower.includes('quarter'));
  const isSemifinal = roundNameLower.includes('semi') || roundNameLower.includes('tercer');

  // Get the phase config
  let phaseConfig;
  if (isFinal) {
    phaseConfig = bracketConfig.final;
  } else if (isSemifinal) {
    phaseConfig = bracketConfig.semifinal;
  } else {
    phaseConfig = bracketConfig.earlyRounds;
  }

  // Return config from the phase
  return {
    gameMode: phaseConfig.gameMode,
    pointsToWin: phaseConfig.gameMode === 'points' ? phaseConfig.pointsToWin : undefined,
    roundsToPlay: phaseConfig.gameMode === 'rounds' ? phaseConfig.roundsToPlay : undefined,
    matchesToWin: phaseConfig.matchesToWin,
    show20s: tournament.show20s,
    showHammer: tournament.showHammer,
    gameType: tournament.gameType
  };
}

/**
 * Special constant for loser placeholder prefix
 * Format: LOSER:roundName:matchPosition (e.g., "LOSER:QF:0")
 */
const LOSER_PLACEHOLDER_PREFIX = 'LOSER:';

/**
 * Check if a participant ID is a loser placeholder
 */
function isLoserPlaceholder(participantId: string | undefined): boolean {
  return participantId?.startsWith(LOSER_PLACEHOLDER_PREFIX) || false;
}

/**
 * Check if a match has both participants resolved (not placeholders)
 * Returns true if match is ready to be played
 */
function isMatchReadyToPlay(participantA: string | undefined, participantB: string | undefined): boolean {
  if (!participantA || !participantB) return false;
  if (participantA === 'BYE' || participantB === 'BYE') return false;
  if (isLoserPlaceholder(participantA) || isLoserPlaceholder(participantB)) return false;
  return true;
}

/**
 * Get participant name by ID
 * Handles special cases: BYE participants and LOSER: placeholders
 */
function getParticipantName(tournament: Tournament, participantId: string): string {
  if (!participantId) return 'TBD';
  if (participantId === 'BYE') return 'BYE';
  // Handle LOSER: placeholders (participants not yet determined from main bracket)
  if (isLoserPlaceholder(participantId)) return 'TBD';
  const participant = tournament.participants.find(p => p.id === participantId);
  if (!participant) return 'Unknown';

  // For doubles: use teamName if set, otherwise "Player1 / Player2"
  if (participant.partner) {
    return participant.teamName || `${participant.name} / ${participant.partner.name}`;
  }

  return participant.name;
}

/**
 * Photo info for a participant (supports doubles with partner photo)
 */
interface ParticipantPhotos {
  photoURL?: string;
  partnerPhotoURL?: string;  // For doubles
}

/**
 * Get participant photos by ID from cached data
 * Returns undefined for BYE, TBD, or participants without photos
 */
function getParticipantPhotos(
  participantId: string,
  participantPhotoMap: Map<string, ParticipantPhotos>
): ParticipantPhotos {
  if (!participantId || participantId === 'BYE' || isLoserPlaceholder(participantId)) {
    return {};
  }
  return participantPhotoMap.get(participantId) || {};
}

/**
 * Build a map of participant ID to photos (supports doubles with partner photos)
 * Uses the photoURL and partner.photoURL stored on each participant
 */
function buildParticipantPhotoMap(
  participants: TournamentParticipant[]
): Map<string, ParticipantPhotos> {
  const photoMap = new Map<string, ParticipantPhotos>();

  for (const p of participants) {
    if (p.status === 'ACTIVE') {
      const partnerPhoto = p.partner?.photoURL;
      if (p.photoURL || partnerPhoto) {
        photoMap.set(p.id, {
          photoURL: p.photoURL,
          partnerPhotoURL: partnerPhoto
        });
      }
    }
  }

  return photoMap;
}

/**
 * Get all photo properties for both participants in a match
 * Returns an object with all 4 photo fields ready to spread into PendingMatchInfo
 */
function getMatchPhotos(
  participantAId: string | undefined,
  participantBId: string | undefined,
  photoMap: Map<string, ParticipantPhotos>
): {
  participantAPhotoURL?: string;
  participantAPartnerPhotoURL?: string;
  participantBPhotoURL?: string;
  participantBPartnerPhotoURL?: string;
} {
  const photosA = participantAId ? getParticipantPhotos(participantAId, photoMap) : {};
  const photosB = participantBId ? getParticipantPhotos(participantBId, photoMap) : {};
  return {
    participantAPhotoURL: photosA.photoURL,
    participantAPartnerPhotoURL: photosA.partnerPhotoURL,
    participantBPhotoURL: photosB.photoURL,
    participantBPartnerPhotoURL: photosB.partnerPhotoURL
  };
}

/**
 * Get pending matches for a specific user (by userId)
 * Returns matches where the user is assigned as participant A or B
 */
export async function getPendingMatchesForUser(
  tournament: Tournament,
  userId: string
): Promise<PendingMatchInfo[]> {
  const pendingMatches: PendingMatchInfo[] = [];
  const inProgressMatches: PendingMatchInfo[] = [];

  // Helper to check if match should be included (PENDING or IN_PROGRESS)
  const shouldIncludeMatch = (status: string) => status === 'PENDING' || status === 'IN_PROGRESS';
  const isInProgressStatus = (status: string) => status === 'IN_PROGRESS';

  // Find participant ID(s) for this user
  const userParticipants = tournament.participants.filter(p => p.userId === userId);
  if (userParticipants.length === 0) {
    console.log('User not found as participant in tournament');
    return [];
  }

  const userParticipantIds = new Set(userParticipants.map(p => p.id));

  // Build photo map for all participants
  const photoMap = buildParticipantPhotoMap(tournament.participants);

  // Check group stage matches
  if (tournament.groupStage && !tournament.groupStage.isComplete) {
    for (const group of tournament.groupStage.groups) {
      // Check Round Robin schedule
      if (group.schedule) {
        for (const round of group.schedule) {
          for (const match of round.matches) {
            if (shouldIncludeMatch(match.status) &&
                (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
              const matchInfo: PendingMatchInfo = {
                match,
                phase: 'GROUP',
                groupId: group.id,
                groupName: group.name,
                roundNumber: round.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgressStatus(match.status),
                tableNumber: match.tableNumber
              };
              if (isInProgressStatus(match.status)) {
                inProgressMatches.push(matchInfo);
              } else {
                pendingMatches.push(matchInfo);
              }
            }
          }
        }
      }

      // Check Swiss pairings
      if (group.pairings) {
        for (const pairing of group.pairings) {
          for (const match of pairing.matches) {
            if (shouldIncludeMatch(match.status) &&
                (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
              const matchInfo: PendingMatchInfo = {
                match,
                phase: 'GROUP',
                groupId: group.id,
                groupName: group.name,
                roundNumber: pairing.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgressStatus(match.status),
                tableNumber: match.tableNumber
              };
              if (isInProgressStatus(match.status)) {
                inProgressMatches.push(matchInfo);
              } else {
                pendingMatches.push(matchInfo);
              }
            }
          }
        }
      }
    }
  }

  // Check final stage bracket
  if (tournament.finalStage && !tournament.finalStage.isComplete) {
    // Gold bracket
    const goldBracket = tournament.finalStage.goldBracket;
    if (goldBracket?.rounds) {
      for (const round of goldBracket.rounds) {
        for (const match of round.matches) {
          if (shouldIncludeMatch(match.status) &&
              match.participantA && match.participantB &&
              (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
            const matchInfo: PendingMatchInfo = {
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: round.name,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              ...getMatchPhotos(match.participantA, match.participantB, photoMap),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, false),
              isInProgress: isInProgressStatus(match.status),
              isSilverBracket: false,
              tableNumber: match.tableNumber
            };
            if (isInProgressStatus(match.status)) {
              inProgressMatches.push(matchInfo);
            } else {
              pendingMatches.push(matchInfo);
            }
          }
        }
      }

      // Third place match
      if (goldBracket.thirdPlaceMatch) {
        const match = goldBracket.thirdPlaceMatch;
        if (shouldIncludeMatch(match.status) &&
            match.participantA && match.participantB &&
            (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
          const matchInfo: PendingMatchInfo = {
            match,
            phase: 'FINAL',
            bracketRoundName: 'Tercer Puesto',
            participantAName: getParticipantName(tournament, match.participantA),
            participantBName: getParticipantName(tournament, match.participantB),
            ...getMatchPhotos(match.participantA, match.participantB, photoMap),
            gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', false),
            isInProgress: isInProgressStatus(match.status),
            isSilverBracket: false,
            tableNumber: match.tableNumber
          };
          if (isInProgressStatus(match.status)) {
            inProgressMatches.push(matchInfo);
          } else {
            pendingMatches.push(matchInfo);
          }
        }
      }
    }

    // Silver bracket (if exists)
    if (tournament.finalStage.silverBracket?.rounds) {
      for (const round of tournament.finalStage.silverBracket.rounds) {
        for (const match of round.matches) {
          if (shouldIncludeMatch(match.status) &&
              match.participantA && match.participantB &&
              (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
            const matchInfo: PendingMatchInfo = {
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: round.name,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              ...getMatchPhotos(match.participantA, match.participantB, photoMap),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, true),
              isInProgress: isInProgressStatus(match.status),
              isSilverBracket: true,
              tableNumber: match.tableNumber
            };
            if (isInProgressStatus(match.status)) {
              inProgressMatches.push(matchInfo);
            } else {
              pendingMatches.push(matchInfo);
            }
          }
        }
      }
    }
  }

  // Return in-progress matches first, then pending
  return [...inProgressMatches, ...pendingMatches];
}

/**
 * Get all pending matches in a tournament (for non-logged-in users)
 * Also includes IN_PROGRESS matches for resume functionality
 */
export async function getAllPendingMatches(tournament: Tournament): Promise<PendingMatchInfo[]> {
  const pendingMatches: PendingMatchInfo[] = [];
  const inProgressMatches: PendingMatchInfo[] = [];

  // Helper to check if match should be included
  const shouldIncludeMatch = (status: string) => status === 'PENDING' || status === 'IN_PROGRESS';
  const isInProgress = (status: string) => status === 'IN_PROGRESS';

  // Build photo map for all participants
  const photoMap = buildParticipantPhotoMap(tournament.participants);

  // Check group stage matches
  if (tournament.groupStage && !tournament.groupStage.isComplete) {
    for (const group of tournament.groupStage.groups) {
      // Check Round Robin schedule
      if (group.schedule) {
        for (const round of group.schedule) {
          for (const match of round.matches) {
            if (shouldIncludeMatch(match.status) && match.participantB !== 'BYE') {
              const matchInfo: PendingMatchInfo = {
                match,
                phase: 'GROUP',
                groupId: group.id,
                groupName: group.name,
                roundNumber: round.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgress(match.status),
                tableNumber: match.tableNumber
              };
              if (isInProgress(match.status)) {
                inProgressMatches.push(matchInfo);
              } else {
                pendingMatches.push(matchInfo);
              }
            }
          }
        }
      }

      // Check Swiss pairings
      if (group.pairings) {
        for (const pairing of group.pairings) {
          for (const match of pairing.matches) {
            if (shouldIncludeMatch(match.status) && match.participantB !== 'BYE') {
              const matchInfo: PendingMatchInfo = {
                match,
                phase: 'GROUP',
                groupId: group.id,
                groupName: group.name,
                roundNumber: pairing.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgress(match.status),
                tableNumber: match.tableNumber
              };
              if (isInProgress(match.status)) {
                inProgressMatches.push(matchInfo);
              } else {
                pendingMatches.push(matchInfo);
              }
            }
          }
        }
      }
    }
  }

  // Check final stage bracket
  if (tournament.finalStage && !tournament.finalStage.isComplete) {
    console.log('🔍 getAllPendingMatches - Checking final stage brackets');

    // Check if consolation is enabled
    const consolationEnabled = Boolean(
      tournament.finalStage?.consolationEnabled ??
      (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
    );

    // Gold bracket
    const goldBracket = tournament.finalStage.goldBracket;
    if (goldBracket?.rounds) {
      console.log('🥇 Gold bracket rounds:', goldBracket.rounds.length);
      for (const round of goldBracket.rounds) {
        console.log(`  📍 Round ${round.roundNumber} (${round.name}): ${round.matches.length} matches`);
        for (const match of round.matches) {
          const statusOk = shouldIncludeMatch(match.status);
          const hasA = !!match.participantA;
          const hasB = !!match.participantB;
          const included = statusOk && hasA && hasB;
          console.log(`    🎯 Match ${match.id}: status=${match.status}, table=${match.tableNumber}, A=${match.participantA || 'NONE'}, B=${match.participantB || 'NONE'} => ${included ? '✅ INCLUDED' : '❌ EXCLUDED'} (statusOk=${statusOk}, hasA=${hasA}, hasB=${hasB})`);
          if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
            const matchInfo: PendingMatchInfo = {
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: round.name,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              ...getMatchPhotos(match.participantA, match.participantB, photoMap),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, false),
              isInProgress: isInProgress(match.status),
              isSilverBracket: false,
              tableNumber: match.tableNumber
            };
            if (isInProgress(match.status)) {
              inProgressMatches.push(matchInfo);
            } else {
              pendingMatches.push(matchInfo);
            }
          }
        }
      }

      // Third place match (Gold bracket)
      if (goldBracket.thirdPlaceMatch) {
        const match = goldBracket.thirdPlaceMatch;
        if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
          const matchInfo: PendingMatchInfo = {
            match,
            phase: 'FINAL',
            bracketRoundName: 'Tercer Puesto',
            participantAName: getParticipantName(tournament, match.participantA),
            participantBName: getParticipantName(tournament, match.participantB),
            ...getMatchPhotos(match.participantA, match.participantB, photoMap),
            gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', false),
            isInProgress: isInProgress(match.status),
            isSilverBracket: false,
            tableNumber: match.tableNumber
          };
          if (isInProgress(match.status)) {
            inProgressMatches.push(matchInfo);
          } else {
            pendingMatches.push(matchInfo);
          }
        }
      }

      // Consolation brackets (Gold) - only if consolation is enabled
      if (consolationEnabled && goldBracket.consolationBrackets) {
        console.log('🎯 Gold consolation brackets:', goldBracket.consolationBrackets.length);
        for (const consolation of goldBracket.consolationBrackets) {
          const { startPosition, totalRounds } = consolation;
          const numParticipants = Math.pow(2, totalRounds);
          const posEnd = startPosition + numParticipants - 1;
          console.log(`  🏆 Gold Consolation (start=${startPosition}, rounds=${totalRounds})`);

          for (let roundIdx = 0; roundIdx < consolation.rounds.length; roundIdx++) {
            const round = consolation.rounds[roundIdx];
            const isFinalRound = roundIdx === totalRounds - 1;
            console.log(`    📍 Round ${roundIdx + 1}: ${round.matches.length} matches`);

            for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
              const match = round.matches[matchIdx];
              const statusOk = shouldIncludeMatch(match.status);
              const readyToPlay = isMatchReadyToPlay(match.participantA, match.participantB);
              const included = statusOk && readyToPlay;
              console.log(`      🎯 Match ${match.id}: status=${match.status}, A=${match.participantA || 'NONE'}, B=${match.participantB || 'NONE'} => ${included ? '✅ INCLUDED' : '❌ EXCLUDED'} (statusOk=${statusOk}, readyToPlay=${readyToPlay})`);
              // Use isMatchReadyToPlay to exclude matches with LOSER: placeholders
              if (statusOk && readyToPlay) {
                // Calculate position label for this match
                let bracketRoundName: string;
                if (isFinalRound) {
                  // Final round - specific positions
                  const numFinals = Math.ceil(round.matches.length / 2);
                  if (matchIdx < numFinals) {
                    const posA = startPosition + matchIdx * 2;
                    const posB = posA + 1;
                    bracketRoundName = `${posA}º-${posB}º`;
                  } else {
                    const loserMatchIdx = matchIdx - numFinals;
                    const posA = startPosition + numFinals * 2 + loserMatchIdx * 2;
                    const posB = posA + 1;
                    bracketRoundName = `${posA}º-${posB}º`;
                  }
                } else {
                  // Earlier rounds - show range
                  bracketRoundName = `${startPosition}º-${posEnd}º`;
                }

                const matchInfo: PendingMatchInfo = {
                  match,
                  phase: 'FINAL',
                  roundNumber: round.roundNumber,
                  bracketRoundName,
                  participantAName: getParticipantName(tournament, match.participantA!),
                  participantBName: getParticipantName(tournament, match.participantB!),
                  ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                  gameConfig: getGameConfigForMatch(tournament, 'FINAL', bracketRoundName, false),
                  isInProgress: isInProgress(match.status),
                  isSilverBracket: false,
                  tableNumber: match.tableNumber,
                  isConsolation: true
                };
                if (isInProgress(match.status)) {
                  inProgressMatches.push(matchInfo);
                } else {
                  pendingMatches.push(matchInfo);
                }
              }
            }
          }
        }
      }
    }

    // Silver bracket
    if (tournament.finalStage.silverBracket?.rounds) {
      console.log('🥈 Silver bracket rounds:', tournament.finalStage.silverBracket.rounds.length);
      for (const round of tournament.finalStage.silverBracket.rounds) {
        console.log(`  📍 Round ${round.roundNumber} (${round.name}): ${round.matches.length} matches`);
        for (const match of round.matches) {
          const statusOk = shouldIncludeMatch(match.status);
          const hasA = !!match.participantA;
          const hasB = !!match.participantB;
          const included = statusOk && hasA && hasB;
          console.log(`    🎯 Match ${match.id}: status=${match.status}, table=${match.tableNumber}, A=${match.participantA || 'NONE'}, B=${match.participantB || 'NONE'} => ${included ? '✅ INCLUDED' : '❌ EXCLUDED'} (statusOk=${statusOk}, hasA=${hasA}, hasB=${hasB})`);
          if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
            const matchInfo: PendingMatchInfo = {
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: round.name,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              ...getMatchPhotos(match.participantA, match.participantB, photoMap),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, true),
              isInProgress: isInProgress(match.status),
              isSilverBracket: true,
              tableNumber: match.tableNumber
            };
            if (isInProgress(match.status)) {
              inProgressMatches.push(matchInfo);
            } else {
              pendingMatches.push(matchInfo);
            }
          }
        }
      }

      // Third place match (Silver bracket)
      if (tournament.finalStage.silverBracket.thirdPlaceMatch) {
        const match = tournament.finalStage.silverBracket.thirdPlaceMatch;
        if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
          const matchInfo: PendingMatchInfo = {
            match,
            phase: 'FINAL',
            bracketRoundName: 'Tercer Puesto',
            participantAName: getParticipantName(tournament, match.participantA),
            participantBName: getParticipantName(tournament, match.participantB),
            ...getMatchPhotos(match.participantA, match.participantB, photoMap),
            gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', true),
            isInProgress: isInProgress(match.status),
            isSilverBracket: true,
            tableNumber: match.tableNumber
          };
          if (isInProgress(match.status)) {
            inProgressMatches.push(matchInfo);
          } else {
            pendingMatches.push(matchInfo);
          }
        }
      }

      // Consolation brackets (Silver) - only if consolation is enabled
      if (consolationEnabled && tournament.finalStage.silverBracket.consolationBrackets) {
        console.log('🎯 Silver consolation brackets:', tournament.finalStage.silverBracket.consolationBrackets.length);
        for (const consolation of tournament.finalStage.silverBracket.consolationBrackets) {
          const { startPosition, totalRounds } = consolation;
          const numParticipants = Math.pow(2, totalRounds);
          const posEnd = startPosition + numParticipants - 1;
          console.log(`  🥈 Silver Consolation (start=${startPosition}, rounds=${totalRounds})`);

          for (let roundIdx = 0; roundIdx < consolation.rounds.length; roundIdx++) {
            const round = consolation.rounds[roundIdx];
            const isFinalRound = roundIdx === totalRounds - 1;
            console.log(`    📍 Round ${roundIdx + 1}: ${round.matches.length} matches`);

            for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
              const match = round.matches[matchIdx];
              const statusOk = shouldIncludeMatch(match.status);
              const readyToPlay = isMatchReadyToPlay(match.participantA, match.participantB);
              const included = statusOk && readyToPlay;
              console.log(`      🎯 Match ${match.id}: status=${match.status}, A=${match.participantA || 'NONE'}, B=${match.participantB || 'NONE'} => ${included ? '✅ INCLUDED' : '❌ EXCLUDED'} (statusOk=${statusOk}, readyToPlay=${readyToPlay})`);
              // Use isMatchReadyToPlay to exclude matches with LOSER: placeholders
              if (statusOk && readyToPlay) {
                // Calculate position label for this match
                let bracketRoundName: string;
                if (isFinalRound) {
                  // Final round - specific positions
                  const numFinals = Math.ceil(round.matches.length / 2);
                  if (matchIdx < numFinals) {
                    const posA = startPosition + matchIdx * 2;
                    const posB = posA + 1;
                    bracketRoundName = `${posA}º-${posB}º`;
                  } else {
                    const loserMatchIdx = matchIdx - numFinals;
                    const posA = startPosition + numFinals * 2 + loserMatchIdx * 2;
                    const posB = posA + 1;
                    bracketRoundName = `${posA}º-${posB}º`;
                  }
                } else {
                  // Earlier rounds - show range
                  bracketRoundName = `${startPosition}º-${posEnd}º`;
                }

                const matchInfo: PendingMatchInfo = {
                  match,
                  phase: 'FINAL',
                  roundNumber: round.roundNumber,
                  bracketRoundName,
                  participantAName: getParticipantName(tournament, match.participantA!),
                  participantBName: getParticipantName(tournament, match.participantB!),
                  ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                  gameConfig: getGameConfigForMatch(tournament, 'FINAL', bracketRoundName, true),
                  isInProgress: isInProgress(match.status),
                  isSilverBracket: true,
                  tableNumber: match.tableNumber,
                  isConsolation: true
                };
                if (isInProgress(match.status)) {
                  inProgressMatches.push(matchInfo);
                } else {
                  pendingMatches.push(matchInfo);
                }
              }
            }
          }
        }
      }
    }
  }

  // Return pending matches first, then in-progress matches (for emergency resume)
  console.log('📊 getAllPendingMatches SUMMARY:', {
    pendingCount: pendingMatches.length,
    inProgressCount: inProgressMatches.length,
    totalReturned: pendingMatches.length + inProgressMatches.length,
    pendingTables: pendingMatches.map(m => m.tableNumber),
    inProgressTables: inProgressMatches.map(m => m.tableNumber)
  });
  return [...pendingMatches, ...inProgressMatches];
}

/**
 * Get active matches (PENDING or IN_PROGRESS) for a specific user
 * Used for auto-start functionality when user has exactly one active match
 */
export async function getUserActiveMatches(
  tournament: Tournament,
  userId: string
): Promise<PendingMatchInfo[]> {
  const matches: PendingMatchInfo[] = [];

  // Helper to check if match should be included (both PENDING and IN_PROGRESS)
  const shouldIncludeMatch = (status: string) => status === 'PENDING' || status === 'IN_PROGRESS';
  const isInProgress = (status: string) => status === 'IN_PROGRESS';

  // Find participant ID(s) for this user
  const userParticipants = tournament.participants.filter(p => p.userId === userId);
  if (userParticipants.length === 0) {
    console.log('getUserActiveMatches: User not found as participant in tournament');
    return [];
  }

  const userParticipantIds = new Set(userParticipants.map(p => p.id));

  // Build photo map for all participants
  const photoMap = buildParticipantPhotoMap(tournament.participants);

  // Check group stage matches
  if (tournament.groupStage && !tournament.groupStage.isComplete) {
    for (const group of tournament.groupStage.groups) {
      // Check Round Robin schedule
      if (group.schedule) {
        for (const round of group.schedule) {
          for (const match of round.matches) {
            if (shouldIncludeMatch(match.status) &&
                (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
              matches.push({
                match,
                phase: 'GROUP',
                groupId: group.id,
                groupName: group.name,
                roundNumber: round.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgress(match.status),
                tableNumber: match.tableNumber
              });
            }
          }
        }
      }

      // Check Swiss pairings
      if (group.pairings) {
        for (const pairing of group.pairings) {
          for (const match of pairing.matches) {
            if (shouldIncludeMatch(match.status) &&
                (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
              matches.push({
                match,
                phase: 'GROUP',
                groupId: group.id,
                groupName: group.name,
                roundNumber: pairing.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                ...getMatchPhotos(match.participantA, match.participantB, photoMap),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgress(match.status),
                tableNumber: match.tableNumber
              });
            }
          }
        }
      }
    }
  }

  // Check final stage bracket
  if (tournament.finalStage && !tournament.finalStage.isComplete) {
    // Gold bracket
    const goldBracket = tournament.finalStage.goldBracket;
    if (goldBracket?.rounds) {
      for (const round of goldBracket.rounds) {
        for (const match of round.matches) {
          if (shouldIncludeMatch(match.status) &&
              match.participantA && match.participantB &&
              (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
            matches.push({
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: round.name,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              ...getMatchPhotos(match.participantA, match.participantB, photoMap),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, false),
              isInProgress: isInProgress(match.status),
              isSilverBracket: false,
              tableNumber: match.tableNumber
            });
          }
        }
      }

      // Third place match
      if (goldBracket.thirdPlaceMatch) {
        const match = goldBracket.thirdPlaceMatch;
        if (shouldIncludeMatch(match.status) &&
            match.participantA && match.participantB &&
            (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
          matches.push({
            match,
            phase: 'FINAL',
            bracketRoundName: 'Tercer Puesto',
            participantAName: getParticipantName(tournament, match.participantA),
            participantBName: getParticipantName(tournament, match.participantB),
            ...getMatchPhotos(match.participantA, match.participantB, photoMap),
            gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', false),
            isInProgress: isInProgress(match.status),
            isSilverBracket: false,
            tableNumber: match.tableNumber
          });
        }
      }
    }

    // Silver bracket (if exists)
    if (tournament.finalStage.silverBracket?.rounds) {
      for (const round of tournament.finalStage.silverBracket.rounds) {
        for (const match of round.matches) {
          if (shouldIncludeMatch(match.status) &&
              match.participantA && match.participantB &&
              (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
            matches.push({
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: round.name,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              ...getMatchPhotos(match.participantA, match.participantB, photoMap),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, true),
              isInProgress: isInProgress(match.status),
              isSilverBracket: true,
              tableNumber: match.tableNumber
            });
          }
        }
      }
    }
  }

  console.log(`📊 getUserActiveMatches: Found ${matches.length} active matches for user ${userId}`);
  return matches;
}

/**
 * Start a tournament match (change status from PENDING to IN_PROGRESS)
 * Returns false if match is already IN_PROGRESS (concurrency check)
 */
export async function startTournamentMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId?: string,
  forceResume: boolean = false  // Allow resuming IN_PROGRESS matches (for emergency recovery)
): Promise<{ success: boolean; error?: string }> {
  console.log(`🚀 startTournamentMatch called: matchId=${matchId}, phase=${phase}, forceResume=${forceResume}`);

  if (!browser || !isFirebaseEnabled()) {
    return { success: false, error: 'Firebase disabled' };
  }

  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    // Check tournament status
    if (tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED') {
      return { success: false, error: 'Tournament is no longer active' };
    }

    let matchFound = false;
    let currentStatus: string | undefined;

    if (phase === 'GROUP' && tournament.groupStage) {
      // Find match in group stage
      for (const group of tournament.groupStage.groups) {
        if (groupId && group.id !== groupId) continue;

        // Check schedule (Round Robin)
        if (group.schedule) {
          for (const round of group.schedule) {
            const matchIndex = round.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              currentStatus = round.matches[matchIndex].status;
              if (currentStatus === 'IN_PROGRESS' && !forceResume) {
                return { success: false, error: 'Match is already in progress on another device' };
              }
              if (currentStatus === 'COMPLETED' || currentStatus === 'WALKOVER') {
                return { success: false, error: 'Match has already been completed' };
              }
              // Only update startedAt if this is a new start (not a resume)
              if (currentStatus !== 'IN_PROGRESS') {
                round.matches[matchIndex].status = 'IN_PROGRESS';
                round.matches[matchIndex].startedAt = Date.now();
              }
              matchFound = true;
              break;
            }
          }
        }

        // Check pairings (Swiss)
        if (!matchFound && group.pairings) {
          for (const pairing of group.pairings) {
            const matchIndex = pairing.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              currentStatus = pairing.matches[matchIndex].status;
              if (currentStatus === 'IN_PROGRESS' && !forceResume) {
                return { success: false, error: 'Match is already in progress on another device' };
              }
              if (currentStatus === 'COMPLETED' || currentStatus === 'WALKOVER') {
                return { success: false, error: 'Match has already been completed' };
              }
              // Only update startedAt if this is a new start (not a resume)
              if (currentStatus !== 'IN_PROGRESS') {
                pairing.matches[matchIndex].status = 'IN_PROGRESS';
                pairing.matches[matchIndex].startedAt = Date.now();
              }
              matchFound = true;
              break;
            }
          }
        }

        if (matchFound) break;
      }

      if (matchFound) {
        const cleanedGroupStage = cleanUndefined(tournament.groupStage);
        await updateDoc(doc(db!, 'tournaments', tournamentId), {
          groupStage: cleanedGroupStage
        });
      }
    } else if (phase === 'FINAL' && tournament.finalStage) {
      // Check consolationEnabled
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled ??
        (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
      );

      // Find match in bracket
      // Returns: 'found' | 'in_progress' | 'completed' | 'not_found'
      const findAndUpdateMatch = (bracket: any): 'found' | 'in_progress' | 'completed' | 'not_found' => {
        // Check 3rd place match
        if (bracket.thirdPlaceMatch?.id === matchId) {
          currentStatus = bracket.thirdPlaceMatch.status;
          if (currentStatus === 'IN_PROGRESS' && !forceResume) return 'in_progress';
          if (currentStatus === 'COMPLETED' || currentStatus === 'WALKOVER') return 'completed';
          // Only update startedAt if this is a new start (not a resume)
          if (currentStatus !== 'IN_PROGRESS') {
            bracket.thirdPlaceMatch.status = 'IN_PROGRESS';
            bracket.thirdPlaceMatch.startedAt = Date.now();
          }
          return 'found';
        }

        // Check rounds
        for (const round of bracket.rounds) {
          const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
          if (matchIndex !== -1) {
            currentStatus = round.matches[matchIndex].status;
            if (currentStatus === 'IN_PROGRESS' && !forceResume) return 'in_progress';
            if (currentStatus === 'COMPLETED' || currentStatus === 'WALKOVER') return 'completed';
            // Only update startedAt if this is a new start (not a resume)
            if (currentStatus !== 'IN_PROGRESS') {
              round.matches[matchIndex].status = 'IN_PROGRESS';
              round.matches[matchIndex].startedAt = Date.now();
            }
            return 'found';
          }
        }

        // Check consolation brackets (only if consolationEnabled)
        if (consolationEnabled && bracket.consolationBrackets) {
          for (const consolation of bracket.consolationBrackets) {
            for (const round of consolation.rounds) {
              const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
              if (matchIndex !== -1) {
                currentStatus = round.matches[matchIndex].status;
                if (currentStatus === 'IN_PROGRESS' && !forceResume) return 'in_progress';
                if (currentStatus === 'COMPLETED' || currentStatus === 'WALKOVER') return 'completed';
                // Only update startedAt if this is a new start (not a resume)
                if (currentStatus !== 'IN_PROGRESS') {
                  round.matches[matchIndex].status = 'IN_PROGRESS';
                  round.matches[matchIndex].startedAt = Date.now();
                }
                return 'found';
              }
            }
          }
        }

        return 'not_found';
      };

      // Try gold bracket first
      let result = findAndUpdateMatch(tournament.finalStage.goldBracket);

      // Try silver bracket if not found
      if (result === 'not_found' && tournament.finalStage.silverBracket) {
        result = findAndUpdateMatch(tournament.finalStage.silverBracket);
      }

      if (result === 'in_progress') {
        console.log(`❌ startTournamentMatch FAILED - Match ${matchId} is already in progress (status=${currentStatus})`);
        return { success: false, error: 'Match is already in progress on another device' };
      }
      if (result === 'completed') {
        console.log(`❌ startTournamentMatch FAILED - Match ${matchId} has already been completed (status=${currentStatus})`);
        return { success: false, error: 'Match has already been completed' };
      }
      matchFound = result === 'found';

      if (matchFound) {
        const cleanedFinalStage = cleanUndefined(tournament.finalStage);
        await updateDoc(doc(db!, 'tournaments', tournamentId), {
          finalStage: cleanedFinalStage
        });
      }
    }

    if (!matchFound) {
      return { success: false, error: 'Match not found' };
    }

    console.log('✅ Tournament match started:', matchId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error starting tournament match:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Resume a tournament match that was paused (status is IN_PROGRESS)
 * Returns the current match data including any saved rounds
 */
export async function resumeTournamentMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId?: string
): Promise<{ success: boolean; match?: GroupMatch | BracketMatch; error?: string }> {
  if (!browser || !isFirebaseEnabled()) {
    return { success: false, error: 'Firebase disabled' };
  }

  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    let foundMatch: GroupMatch | BracketMatch | undefined;

    if (phase === 'GROUP' && tournament.groupStage) {
      for (const group of tournament.groupStage.groups) {
        if (groupId && group.id !== groupId) continue;

        if (group.schedule) {
          for (const round of group.schedule) {
            const match = round.matches.find(m => m.id === matchId);
            if (match) {
              foundMatch = match;
              break;
            }
          }
        }

        if (!foundMatch && group.pairings) {
          for (const pairing of group.pairings) {
            const match = pairing.matches.find(m => m.id === matchId);
            if (match) {
              foundMatch = match;
              break;
            }
          }
        }

        if (foundMatch) break;
      }
    } else if (phase === 'FINAL' && tournament.finalStage) {
      // Check consolationEnabled
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled ??
        (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
      );

      // Check gold bracket
      if (tournament.finalStage.goldBracket?.rounds) {
        for (const round of tournament.finalStage.goldBracket.rounds) {
          const match = round.matches.find(m => m.id === matchId);
          if (match) {
            foundMatch = match;
            break;
          }
        }

        // Check 3rd place
        if (!foundMatch && tournament.finalStage.goldBracket.thirdPlaceMatch?.id === matchId) {
          foundMatch = tournament.finalStage.goldBracket.thirdPlaceMatch;
        }
      }

      // Check silver bracket
      if (!foundMatch && tournament.finalStage.silverBracket) {
        for (const round of tournament.finalStage.silverBracket.rounds) {
          const match = round.matches.find(m => m.id === matchId);
          if (match) {
            foundMatch = match;
            break;
          }
        }

        if (!foundMatch && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          foundMatch = tournament.finalStage.silverBracket.thirdPlaceMatch;
        }
      }

      // Check consolation brackets in gold bracket (only if consolationEnabled)
      if (!foundMatch && consolationEnabled && tournament.finalStage.goldBracket?.consolationBrackets) {
        for (const consolation of tournament.finalStage.goldBracket.consolationBrackets) {
          for (const round of consolation.rounds) {
            const match = round.matches.find((m: any) => m.id === matchId);
            if (match) {
              foundMatch = match;
              break;
            }
          }
          if (foundMatch) break;
        }
      }

      // Check consolation brackets in silver bracket (only if consolationEnabled)
      if (!foundMatch && consolationEnabled && tournament.finalStage.silverBracket?.consolationBrackets) {
        for (const consolation of tournament.finalStage.silverBracket.consolationBrackets) {
          for (const round of consolation.rounds) {
            const match = round.matches.find((m: any) => m.id === matchId);
            if (match) {
              foundMatch = match;
              break;
            }
          }
          if (foundMatch) break;
        }
      }
    }

    if (!foundMatch) {
      return { success: false, error: 'Match not found' };
    }

    if (foundMatch.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Match is not in progress' };
    }

    return { success: true, match: foundMatch };
  } catch (error) {
    console.error('❌ Error resuming tournament match:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Abandon a tournament match (revert from IN_PROGRESS to PENDING)
 * Used when user exits tournament mode without completing the match
 */
export async function abandonTournamentMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId?: string
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      return false;
    }

    let matchFound = false;

    // Helper to reset all match data
    const resetMatchData = (match: any) => {
      match.status = 'PENDING';
      match.startedAt = undefined;
      match.rounds = undefined;
      match.gamesWonA = undefined;
      match.gamesWonB = undefined;
      match.totalPointsA = undefined;
      match.totalPointsB = undefined;
      match.total20sA = undefined;
      match.total20sB = undefined;
    };

    if (phase === 'GROUP' && tournament.groupStage) {
      for (const group of tournament.groupStage.groups) {
        if (groupId && group.id !== groupId) continue;

        if (group.schedule) {
          for (const round of group.schedule) {
            const matchIndex = round.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              resetMatchData(round.matches[matchIndex]);
              matchFound = true;
              break;
            }
          }
        }

        if (!matchFound && group.pairings) {
          for (const pairing of group.pairings) {
            const matchIndex = pairing.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              resetMatchData(pairing.matches[matchIndex]);
              matchFound = true;
              break;
            }
          }
        }

        if (matchFound) break;
      }

      if (matchFound) {
        const cleanedGroupStage = cleanUndefined(tournament.groupStage);
        await updateDoc(doc(db!, 'tournaments', tournamentId), {
          groupStage: cleanedGroupStage
        });
      }
    } else if (phase === 'FINAL' && tournament.finalStage) {
      // Check consolationEnabled
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled ??
        (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
      );

      // Use the same resetMatchData helper for FINAL phase
      const resetMatch = resetMatchData;

      // Check gold bracket
      if (tournament.finalStage.goldBracket?.rounds) {
        for (const round of tournament.finalStage.goldBracket.rounds) {
          const matchIndex = round.matches.findIndex(m => m.id === matchId);
          if (matchIndex !== -1) {
            resetMatch(round.matches[matchIndex]);
            matchFound = true;
            break;
          }
        }

        // Check 3rd place
        if (!matchFound && tournament.finalStage.goldBracket.thirdPlaceMatch?.id === matchId) {
          resetMatch(tournament.finalStage.goldBracket.thirdPlaceMatch);
          matchFound = true;
        }
      }

      // Check silver bracket
      if (!matchFound && tournament.finalStage.silverBracket) {
        for (const round of tournament.finalStage.silverBracket.rounds) {
          const matchIndex = round.matches.findIndex(m => m.id === matchId);
          if (matchIndex !== -1) {
            resetMatch(round.matches[matchIndex]);
            matchFound = true;
            break;
          }
        }

        if (!matchFound && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          resetMatch(tournament.finalStage.silverBracket.thirdPlaceMatch);
          matchFound = true;
        }
      }

      // Check consolation brackets in gold bracket (only if consolationEnabled)
      if (!matchFound && consolationEnabled && tournament.finalStage.goldBracket?.consolationBrackets) {
        for (const consolation of tournament.finalStage.goldBracket.consolationBrackets) {
          for (const round of consolation.rounds) {
            const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
            if (matchIndex !== -1) {
              resetMatch(round.matches[matchIndex]);
              matchFound = true;
              break;
            }
          }
          if (matchFound) break;
        }
      }

      // Check consolation brackets in silver bracket (only if consolationEnabled)
      if (!matchFound && consolationEnabled && tournament.finalStage.silverBracket?.consolationBrackets) {
        for (const consolation of tournament.finalStage.silverBracket.consolationBrackets) {
          for (const round of consolation.rounds) {
            const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
            if (matchIndex !== -1) {
              resetMatch(round.matches[matchIndex]);
              matchFound = true;
              break;
            }
          }
          if (matchFound) break;
        }
      }

      if (matchFound) {
        const cleanedFinalStage = cleanUndefined(tournament.finalStage);
        await updateDoc(doc(db!, 'tournaments', tournamentId), {
          finalStage: cleanedFinalStage
        });
      }
    }

    if (matchFound) {
      console.log('✅ Tournament match abandoned:', matchId);
    }
    return matchFound;
  } catch (error) {
    console.error('❌ Error abandoning tournament match:', error);
    return false;
  }
}

/**
 * Update tournament match rounds in real-time (for sync mode: real_time)
 */
export async function updateTournamentMatchRounds(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId: string | undefined,
  rounds: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }>,
  currentGameData?: { gamesWonA: number; gamesWonB: number }
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      return false;
    }

    let matchFound = false;

    // Calculate totals from rounds
    const total20sA = rounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0);
    const total20sB = rounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0);
    // Calculate total points from rounds (for rounds mode display)
    const totalPointsA = rounds.reduce((sum, r) => sum + (r.pointsA || 0), 0);
    const totalPointsB = rounds.reduce((sum, r) => sum + (r.pointsB || 0), 0);

    // Check consolationEnabled
    const consolationEnabled = Boolean(
      tournament.finalStage?.consolationEnabled ??
      (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
    );

    console.log('🔄 updateTournamentMatchRounds:', {
      matchId,
      phase,
      groupId,
      roundsCount: rounds.length,
      total20sA,
      total20sB,
      totalPointsA,
      totalPointsB,
      currentGameData,
      hasSilverBracket: !!tournament.finalStage?.silverBracket,
      consolationEnabled,
      hasGoldConsolation: !!tournament.finalStage?.goldBracket?.consolationBrackets?.length,
      hasSilverConsolation: !!tournament.finalStage?.silverBracket?.consolationBrackets?.length
    });

    if (phase === 'GROUP' && tournament.groupStage) {
      for (const group of tournament.groupStage.groups) {
        if (groupId && group.id !== groupId) continue;

        if (group.schedule) {
          for (const round of group.schedule) {
            const matchIndex = round.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              round.matches[matchIndex].rounds = rounds;
              round.matches[matchIndex].total20sA = total20sA;
              round.matches[matchIndex].total20sB = total20sB;
              round.matches[matchIndex].totalPointsA = totalPointsA;
              round.matches[matchIndex].totalPointsB = totalPointsB;
              if (currentGameData) {
                round.matches[matchIndex].gamesWonA = currentGameData.gamesWonA;
                round.matches[matchIndex].gamesWonB = currentGameData.gamesWonB;
              }
              matchFound = true;
              break;
            }
          }
        }

        if (!matchFound && group.pairings) {
          for (const pairing of group.pairings) {
            const matchIndex = pairing.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              pairing.matches[matchIndex].rounds = rounds;
              pairing.matches[matchIndex].total20sA = total20sA;
              pairing.matches[matchIndex].total20sB = total20sB;
              pairing.matches[matchIndex].totalPointsA = totalPointsA;
              pairing.matches[matchIndex].totalPointsB = totalPointsB;
              if (currentGameData) {
                pairing.matches[matchIndex].gamesWonA = currentGameData.gamesWonA;
                pairing.matches[matchIndex].gamesWonB = currentGameData.gamesWonB;
              }
              matchFound = true;
              break;
            }
          }
        }

        if (matchFound) break;
      }

      if (matchFound) {
        const cleanedGroupStage = cleanUndefined(tournament.groupStage);
        await updateDoc(doc(db!, 'tournaments', tournamentId), {
          groupStage: cleanedGroupStage
        });
      }
    } else if (phase === 'FINAL' && tournament.finalStage) {
      const updateMatchRounds = (match: any) => {
        match.rounds = rounds;
        match.total20sA = total20sA;
        match.total20sB = total20sB;
        match.totalPointsA = totalPointsA;
        match.totalPointsB = totalPointsB;
        if (currentGameData) {
          match.gamesWonA = currentGameData.gamesWonA;
          match.gamesWonB = currentGameData.gamesWonB;
        }
      };

      // Check gold bracket
      if (tournament.finalStage.goldBracket?.rounds) {
        for (const round of tournament.finalStage.goldBracket.rounds) {
          const matchIndex = round.matches.findIndex(m => m.id === matchId);
          if (matchIndex !== -1) {
            updateMatchRounds(round.matches[matchIndex]);
            matchFound = true;
            break;
          }
        }

        // Check 3rd place
        if (!matchFound && tournament.finalStage.goldBracket.thirdPlaceMatch?.id === matchId) {
          updateMatchRounds(tournament.finalStage.goldBracket.thirdPlaceMatch);
          matchFound = true;
        }
      }

      // Check silver bracket
      if (!matchFound && tournament.finalStage.silverBracket?.rounds) {
        for (const round of tournament.finalStage.silverBracket.rounds) {
          const matchIndex = round.matches.findIndex(m => m.id === matchId);
          if (matchIndex !== -1) {
            updateMatchRounds(round.matches[matchIndex]);
            matchFound = true;
            break;
          }
        }

        if (!matchFound && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          updateMatchRounds(tournament.finalStage.silverBracket.thirdPlaceMatch);
          matchFound = true;
        }
      }

      // Check consolation brackets in gold bracket (only if consolationEnabled)
      if (!matchFound && consolationEnabled && tournament.finalStage.goldBracket?.consolationBrackets) {
        console.log('🔍 [GOLD CONSOLATION] Searching for matchId:', matchId);
        console.log('🔍 [GOLD CONSOLATION] Number of brackets:', tournament.finalStage.goldBracket.consolationBrackets.length);
        for (const consolation of tournament.finalStage.goldBracket.consolationBrackets) {
          console.log('🔍 [GOLD CONSOLATION] Bracket source:', consolation.source, '- rounds:', consolation.rounds.length);
          for (let ri = 0; ri < consolation.rounds.length; ri++) {
            const round = consolation.rounds[ri];
            const matchIds = round.matches.map((m: any) => m.id);
            console.log(`🔍 [GOLD CONSOLATION] Round ${ri + 1} matches:`, matchIds);
            const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
            if (matchIndex !== -1) {
              console.log('✅ [GOLD CONSOLATION] Found match! Updating rounds...');
              updateMatchRounds(round.matches[matchIndex]);
              matchFound = true;
              break;
            }
          }
          if (matchFound) break;
        }
        if (!matchFound) {
          console.log('⚠️ [GOLD CONSOLATION] Match NOT found in any consolation bracket');
        }
      }

      // Check consolation brackets in silver bracket (only if consolationEnabled)
      if (!matchFound && consolationEnabled && tournament.finalStage.silverBracket?.consolationBrackets) {
        console.log('🔍 [SILVER CONSOLATION] Searching for matchId:', matchId);
        console.log('🔍 [SILVER CONSOLATION] Number of brackets:', tournament.finalStage.silverBracket.consolationBrackets.length);
        for (const consolation of tournament.finalStage.silverBracket.consolationBrackets) {
          console.log('🔍 [SILVER CONSOLATION] Bracket source:', consolation.source, '- rounds:', consolation.rounds.length);
          for (let ri = 0; ri < consolation.rounds.length; ri++) {
            const round = consolation.rounds[ri];
            const matchIds = round.matches.map((m: any) => m.id);
            console.log(`🔍 [SILVER CONSOLATION] Round ${ri + 1} matches:`, matchIds);
            const matchIndex = round.matches.findIndex((m: any) => m.id === matchId);
            if (matchIndex !== -1) {
              console.log('✅ [SILVER CONSOLATION] Found match! Updating rounds...');
              updateMatchRounds(round.matches[matchIndex]);
              matchFound = true;
              break;
            }
          }
          if (matchFound) break;
        }
        if (!matchFound) {
          console.log('⚠️ [SILVER CONSOLATION] Match NOT found in any consolation bracket');
        }
      }

      if (matchFound) {
        console.log('✅ Match found in bracket, updating Firebase...');
        const cleanedFinalStage = cleanUndefined(tournament.finalStage);
        await updateDoc(doc(db!, 'tournaments', tournamentId), {
          finalStage: cleanedFinalStage
        });
        console.log('✅ Firebase updated successfully');
      } else {
        console.warn('⚠️ Match NOT found in any bracket! matchId:', matchId);
      }
    }

    return matchFound;
  } catch (error) {
    console.error('❌ Error updating tournament match rounds:', error);
    return false;
  }
}

/**
 * Complete a tournament match from /game page
 * This handles both group and bracket matches
 */
export async function completeTournamentMatch(
  tournamentId: string,
  matchId: string,
  phase: 'GROUP' | 'FINAL',
  groupId: string | undefined,
  result: {
    winner: string | null; // null for ties in rounds mode
    gamesWonA: number;
    gamesWonB: number;
    totalPointsA: number;
    totalPointsB: number;
    total20sA: number;
    total20sB: number;
    videoUrl?: string;
    videoId?: string;
    rounds: Array<{
      gameNumber: number;
      roundInGame: number;
      pointsA: number | null;
      pointsB: number | null;
      twentiesA: number;
      twentiesB: number;
    }>;
  }
): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    return false;
  }

  try {
    if (phase === 'GROUP') {
      // Use existing updateMatchResult for group matches
      const success = await updateMatchResult(tournamentId, matchId, {
        gamesWonA: result.gamesWonA,
        gamesWonB: result.gamesWonB,
        totalPointsA: result.totalPointsA,
        totalPointsB: result.totalPointsB,
        total20sA: result.total20sA,
        total20sB: result.total20sB,
        rounds: result.rounds,
        videoUrl: result.videoUrl,
        videoId: result.videoId
      });
      return success;
    } else {
      // For bracket matches, use updateBracketMatch and advanceWinner
      const { updateBracketMatch, advanceWinner, updateSilverBracketMatch, advanceSilverWinner, advanceConsolationWinner, updateConsolationMatch } = await import('./tournamentBracket');

      // First, determine if this is a silver bracket match or consolation match
      const tournament = await getTournament(tournamentId);
      if (!tournament || !tournament.finalStage) {
        return false;
      }

      // Check consolationEnabled
      const consolationEnabled = Boolean(
        tournament.finalStage.consolationEnabled ??
        (tournament.finalStage as unknown as Record<string, unknown>)?.['consolationEnabled ']
      );

      let isSilverBracket = false;
      let isConsolationMatch = false;
      let consolationBracketType: 'gold' | 'silver' = 'gold';
      let loserId: string | undefined;

      // Check if match is in gold bracket consolation (only if consolationEnabled)
      if (consolationEnabled && tournament.finalStage.goldBracket?.consolationBrackets) {
        for (const consolation of tournament.finalStage.goldBracket.consolationBrackets) {
          for (const round of consolation.rounds) {
            const match = round.matches.find(m => m.id === matchId);
            if (match) {
              isConsolationMatch = true;
              consolationBracketType = 'gold';
              // Find loser for 3rd place match advancement
              if (result.winner && match.participantA && match.participantB) {
                loserId = result.winner === match.participantA ? match.participantB : match.participantA;
              }
              break;
            }
          }
          if (isConsolationMatch) break;
        }
      }

      // Check if match is in silver bracket consolation (only if consolationEnabled)
      if (!isConsolationMatch && consolationEnabled && tournament.finalStage.silverBracket?.consolationBrackets) {
        for (const consolation of tournament.finalStage.silverBracket.consolationBrackets) {
          for (const round of consolation.rounds) {
            const match = round.matches.find(m => m.id === matchId);
            if (match) {
              isConsolationMatch = true;
              consolationBracketType = 'silver';
              // Find loser for 3rd place match advancement
              if (result.winner && match.participantA && match.participantB) {
                loserId = result.winner === match.participantA ? match.participantB : match.participantA;
              }
              break;
            }
          }
          if (isConsolationMatch) break;
        }
      }

      // Check if match is in silver bracket main rounds
      if (!isConsolationMatch && tournament.finalStage.silverBracket) {
        console.log(`🔍 Checking silver bracket for match ${matchId}...`);
        for (const round of tournament.finalStage.silverBracket.rounds) {
          const foundMatch = round.matches.find(m => m.id === matchId);
          if (foundMatch) {
            isSilverBracket = true;
            console.log(`  ✅ Found in silver bracket round ${round.roundNumber} (${round.roundName})`);
            console.log(`  📍 nextMatchId: ${foundMatch.nextMatchId || 'FINAL'}`);
            break;
          }
        }
        if (!isSilverBracket && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          isSilverBracket = true;
          console.log(`  ✅ Found as silver bracket 3rd place match`);
        }
        if (!isSilverBracket) {
          console.log(`  ⚠️ Match NOT found in silver bracket`);
        }
      }

      // Update match result
      let updateSuccess: boolean;
      const matchData = {
        status: 'COMPLETED' as const,
        winner: result.winner ?? undefined, // Convert null to undefined for type compatibility
        gamesWonA: result.gamesWonA,
        gamesWonB: result.gamesWonB,
        totalPointsA: result.totalPointsA,
        totalPointsB: result.totalPointsB,
        total20sA: result.total20sA,
        total20sB: result.total20sB,
        rounds: result.rounds,
        videoUrl: result.videoUrl,
        videoId: result.videoId
      };

      if (isConsolationMatch) {
        // Use consolation-specific update function with correct bracket type
        updateSuccess = await updateConsolationMatch(tournamentId, matchId, matchData, consolationBracketType);
      } else {
        const updateFn = isSilverBracket ? updateSilverBracketMatch : updateBracketMatch;
        updateSuccess = await updateFn(tournamentId, matchId, matchData);
      }

      if (!updateSuccess) {
        return false;
      }

      // Only advance winner if there is one (not a tie)
      // In bracket matches, ties shouldn't normally happen, but handle gracefully
      if (result.winner) {
        console.log(`🏆 Advancing winner: ${result.winner}, isSilverBracket: ${isSilverBracket}, isConsolationMatch: ${isConsolationMatch}`);
        if (isConsolationMatch) {
          // Use consolation-specific advancement (also advances loser to 3rd place matches)
          console.log(`  📤 Calling advanceConsolationWinner (${consolationBracketType})`);
          return await advanceConsolationWinner(tournamentId, matchId, result.winner, consolationBracketType, loserId);
        } else {
          const advanceFn = isSilverBracket ? advanceSilverWinner : advanceWinner;
          console.log(`  📤 Calling ${isSilverBracket ? 'advanceSilverWinner' : 'advanceWinner'}`);
          return await advanceFn(tournamentId, matchId, result.winner);
        }
      } else {
        console.log(`⚠️ No winner to advance (result.winner is falsy)`);
      }

      return true; // Match completed but no winner to advance (tie)
    }
  } catch (error) {
    console.error('❌ Error completing tournament match:', error);
    return false;
  }
}
