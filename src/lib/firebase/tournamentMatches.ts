/**
 * Tournament match management
 * Update match results and handle no-shows
 * Includes functions for /game page integration
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseEnabled } from './config';
import type { GroupMatch, GroupStanding, BracketMatch, Tournament } from '$lib/types/tournament';
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
    // Get matchesToWin from groupStage
    const matchesToWin = tournament.groupStage?.matchesToWin || 1;
    const requiredWins = Math.ceil(matchesToWin / 2);

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

  // Get ranking system configuration
  // Supports both new rankingSystem and legacy swissRankingSystem
  const rankingSystem = tournament.groupStage.rankingSystem || tournament.groupStage.swissRankingSystem || 'WINS';
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

  // Sort standings based on ranking system
  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    if (rankingSystem === 'POINTS') {
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
  roundNumber?: number;
  bracketRoundName?: string;
  participantAName: string;
  participantBName: string;
  gameConfig: TournamentGameConfig;
  isInProgress?: boolean;  // True if match is IN_PROGRESS (for resume functionality)
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

  // Final stage - check for per-phase configuration
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

  // Determine which config to use based on bracket round name and silver bracket
  const prefix = isSilverBracket ? 'silver' : '';
  const roundNameLower = bracketRoundName?.toLowerCase() || '';

  // Check for per-phase config
  if (roundNameLower.includes('final') && !roundNameLower.includes('semi')) {
    // Final match
    const gameMode = isSilverBracket
      ? (fs.silverFinalGameMode || fs.silverGameMode || fs.gameMode)
      : (fs.finalGameMode || fs.gameMode);
    const pointsToWin = isSilverBracket
      ? (fs.silverFinalPointsToWin || fs.silverPointsToWin || fs.pointsToWin)
      : (fs.finalPointsToWin || fs.pointsToWin);
    const roundsToPlay = isSilverBracket
      ? (fs.silverFinalRoundsToPlay || fs.silverRoundsToPlay || fs.roundsToPlay)
      : (fs.finalRoundsToPlay || fs.roundsToPlay);
    const matchesToWin = isSilverBracket
      ? (fs.silverFinalMatchesToWin || fs.silverMatchesToWin || fs.matchesToWin)
      : (fs.finalMatchesToWin || fs.matchesToWin);

    return {
      gameMode,
      pointsToWin,
      roundsToPlay,
      matchesToWin,
      show20s: tournament.show20s,
      showHammer: tournament.showHammer,
      gameType: tournament.gameType
    };
  } else if (roundNameLower.includes('semi')) {
    // Semifinal
    const gameMode = isSilverBracket
      ? (fs.silverSemifinalGameMode || fs.silverGameMode || fs.gameMode)
      : (fs.semifinalGameMode || fs.gameMode);
    const pointsToWin = isSilverBracket
      ? (fs.silverSemifinalPointsToWin || fs.silverPointsToWin || fs.pointsToWin)
      : (fs.semifinalPointsToWin || fs.pointsToWin);
    const roundsToPlay = isSilverBracket
      ? (fs.silverSemifinalRoundsToPlay || fs.silverRoundsToPlay || fs.roundsToPlay)
      : (fs.semifinalRoundsToPlay || fs.roundsToPlay);
    const matchesToWin = isSilverBracket
      ? (fs.silverSemifinalMatchesToWin || fs.silverMatchesToWin || fs.matchesToWin)
      : (fs.semifinalMatchesToWin || fs.matchesToWin);

    return {
      gameMode,
      pointsToWin,
      roundsToPlay,
      matchesToWin,
      show20s: tournament.show20s,
      showHammer: tournament.showHammer,
      gameType: tournament.gameType
    };
  } else {
    // Early rounds (octavos, cuartos, etc.)
    const gameMode = isSilverBracket
      ? (fs.silverEarlyRoundsGameMode || fs.silverGameMode || fs.gameMode)
      : (fs.earlyRoundsGameMode || fs.gameMode);
    const pointsToWin = isSilverBracket
      ? (fs.silverEarlyRoundsPointsToWin || fs.silverPointsToWin || fs.pointsToWin)
      : (fs.earlyRoundsPointsToWin || fs.pointsToWin);
    const roundsToPlay = isSilverBracket
      ? (fs.silverEarlyRoundsToPlay || fs.silverRoundsToPlay || fs.roundsToPlay)
      : (fs.earlyRoundsToPlay || fs.roundsToPlay);
    const matchesToWin = isSilverBracket
      ? (fs.silverMatchesToWin || fs.matchesToWin)
      : fs.matchesToWin;

    return {
      gameMode,
      pointsToWin,
      roundsToPlay,
      matchesToWin,
      show20s: tournament.show20s,
      showHammer: tournament.showHammer,
      gameType: tournament.gameType
    };
  }
}

/**
 * Get participant name by ID
 */
function getParticipantName(tournament: Tournament, participantId: string): string {
  if (participantId === 'BYE') return 'BYE';
  const participant = tournament.participants.find(p => p.id === participantId);
  return participant?.name || 'Unknown';
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

  // Find participant ID(s) for this user
  const userParticipants = tournament.participants.filter(p => p.userId === userId);
  if (userParticipants.length === 0) {
    console.log('User not found as participant in tournament');
    return [];
  }

  const userParticipantIds = new Set(userParticipants.map(p => p.id));

  // Check group stage matches
  if (tournament.groupStage && !tournament.groupStage.isComplete) {
    for (const group of tournament.groupStage.groups) {
      // Check Round Robin schedule
      if (group.schedule) {
        for (const round of group.schedule) {
          for (const match of round.matches) {
            if (match.status === 'PENDING' &&
                (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
              pendingMatches.push({
                match,
                phase: 'GROUP',
                groupId: group.id,
                roundNumber: round.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP')
              });
            }
          }
        }
      }

      // Check Swiss pairings
      if (group.pairings) {
        for (const pairing of group.pairings) {
          for (const match of pairing.matches) {
            if (match.status === 'PENDING' &&
                (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
              pendingMatches.push({
                match,
                phase: 'GROUP',
                groupId: group.id,
                roundNumber: pairing.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP')
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
    for (const round of tournament.finalStage.bracket.rounds) {
      for (const match of round.matches) {
        if (match.status === 'PENDING' &&
            match.participantA && match.participantB &&
            (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
          pendingMatches.push({
            match,
            phase: 'FINAL',
            roundNumber: round.roundNumber,
            bracketRoundName: round.name,
            participantAName: getParticipantName(tournament, match.participantA),
            participantBName: getParticipantName(tournament, match.participantB),
            gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, false)
          });
        }
      }
    }

    // Silver bracket (if exists)
    if (tournament.finalStage.silverBracket) {
      for (const round of tournament.finalStage.silverBracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'PENDING' &&
              match.participantA && match.participantB &&
              (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
            pendingMatches.push({
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: `${round.name} (Silver)`,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, true)
            });
          }
        }
      }
    }

    // Third place match
    if (tournament.finalStage.bracket.thirdPlaceMatch) {
      const match = tournament.finalStage.bracket.thirdPlaceMatch;
      if (match.status === 'PENDING' &&
          match.participantA && match.participantB &&
          (userParticipantIds.has(match.participantA) || userParticipantIds.has(match.participantB))) {
        pendingMatches.push({
          match,
          phase: 'FINAL',
          bracketRoundName: 'Tercer Puesto',
          participantAName: getParticipantName(tournament, match.participantA),
          participantBName: getParticipantName(tournament, match.participantB),
          gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', false)
        });
      }
    }
  }

  return pendingMatches;
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
                roundNumber: round.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgress(match.status)
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
                roundNumber: pairing.roundNumber,
                participantAName: getParticipantName(tournament, match.participantA),
                participantBName: getParticipantName(tournament, match.participantB),
                gameConfig: getGameConfigForMatch(tournament, 'GROUP'),
                isInProgress: isInProgress(match.status)
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
    // Gold bracket
    for (const round of tournament.finalStage.bracket.rounds) {
      for (const match of round.matches) {
        if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
          const matchInfo: PendingMatchInfo = {
            match,
            phase: 'FINAL',
            roundNumber: round.roundNumber,
            bracketRoundName: round.name,
            participantAName: getParticipantName(tournament, match.participantA),
            participantBName: getParticipantName(tournament, match.participantB),
            gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, false),
            isInProgress: isInProgress(match.status)
          };
          if (isInProgress(match.status)) {
            inProgressMatches.push(matchInfo);
          } else {
            pendingMatches.push(matchInfo);
          }
        }
      }
    }

    // Silver bracket
    if (tournament.finalStage.silverBracket) {
      for (const round of tournament.finalStage.silverBracket.rounds) {
        for (const match of round.matches) {
          if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
            const matchInfo: PendingMatchInfo = {
              match,
              phase: 'FINAL',
              roundNumber: round.roundNumber,
              bracketRoundName: `${round.name} (Silver)`,
              participantAName: getParticipantName(tournament, match.participantA),
              participantBName: getParticipantName(tournament, match.participantB),
              gameConfig: getGameConfigForMatch(tournament, 'FINAL', round.name, true),
              isInProgress: isInProgress(match.status)
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

    // Third place match (Gold bracket)
    if (tournament.finalStage.bracket.thirdPlaceMatch) {
      const match = tournament.finalStage.bracket.thirdPlaceMatch;
      if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
        const matchInfo: PendingMatchInfo = {
          match,
          phase: 'FINAL',
          bracketRoundName: 'Tercer Puesto',
          participantAName: getParticipantName(tournament, match.participantA),
          participantBName: getParticipantName(tournament, match.participantB),
          gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', false),
          isInProgress: isInProgress(match.status)
        };
        if (isInProgress(match.status)) {
          inProgressMatches.push(matchInfo);
        } else {
          pendingMatches.push(matchInfo);
        }
      }
    }

    // Third place match (Silver bracket)
    if (tournament.finalStage.silverBracket?.thirdPlaceMatch) {
      const match = tournament.finalStage.silverBracket.thirdPlaceMatch;
      if (shouldIncludeMatch(match.status) && match.participantA && match.participantB) {
        const matchInfo: PendingMatchInfo = {
          match,
          phase: 'FINAL',
          bracketRoundName: 'Tercer Puesto (Silver)',
          participantAName: getParticipantName(tournament, match.participantA),
          participantBName: getParticipantName(tournament, match.participantB),
          gameConfig: getGameConfigForMatch(tournament, 'FINAL', 'Tercer Puesto', true),
          isInProgress: isInProgress(match.status)
        };
        if (isInProgress(match.status)) {
          inProgressMatches.push(matchInfo);
        } else {
          pendingMatches.push(matchInfo);
        }
      }
    }
  }

  // Return pending matches first, then in-progress matches (for emergency resume)
  return [...pendingMatches, ...inProgressMatches];
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
        return 'not_found';
      };

      // Try gold bracket first
      let result = findAndUpdateMatch(tournament.finalStage.bracket);

      // Try silver bracket if not found
      if (result === 'not_found' && tournament.finalStage.silverBracket) {
        result = findAndUpdateMatch(tournament.finalStage.silverBracket);
      }

      if (result === 'in_progress') {
        return { success: false, error: 'Match is already in progress on another device' };
      }
      if (result === 'completed') {
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
      // Check gold bracket
      for (const round of tournament.finalStage.bracket.rounds) {
        const match = round.matches.find(m => m.id === matchId);
        if (match) {
          foundMatch = match;
          break;
        }
      }

      // Check 3rd place
      if (!foundMatch && tournament.finalStage.bracket.thirdPlaceMatch?.id === matchId) {
        foundMatch = tournament.finalStage.bracket.thirdPlaceMatch;
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

    if (phase === 'GROUP' && tournament.groupStage) {
      for (const group of tournament.groupStage.groups) {
        if (groupId && group.id !== groupId) continue;

        if (group.schedule) {
          for (const round of group.schedule) {
            const matchIndex = round.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              round.matches[matchIndex].status = 'PENDING';
              round.matches[matchIndex].startedAt = undefined;
              round.matches[matchIndex].rounds = undefined;
              matchFound = true;
              break;
            }
          }
        }

        if (!matchFound && group.pairings) {
          for (const pairing of group.pairings) {
            const matchIndex = pairing.matches.findIndex(m => m.id === matchId);
            if (matchIndex !== -1) {
              pairing.matches[matchIndex].status = 'PENDING';
              pairing.matches[matchIndex].startedAt = undefined;
              pairing.matches[matchIndex].rounds = undefined;
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
      const resetMatch = (match: any) => {
        match.status = 'PENDING';
        match.startedAt = undefined;
        match.rounds = undefined;
        match.gamesWonA = undefined;
        match.gamesWonB = undefined;
      };

      // Check gold bracket
      for (const round of tournament.finalStage.bracket.rounds) {
        const matchIndex = round.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          resetMatch(round.matches[matchIndex]);
          matchFound = true;
          break;
        }
      }

      // Check 3rd place
      if (!matchFound && tournament.finalStage.bracket.thirdPlaceMatch?.id === matchId) {
        resetMatch(tournament.finalStage.bracket.thirdPlaceMatch);
        matchFound = true;
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

    // Calculate total 20s from rounds
    const total20sA = rounds.reduce((sum, r) => sum + (r.twentiesA || 0), 0);
    const total20sB = rounds.reduce((sum, r) => sum + (r.twentiesB || 0), 0);

    console.log('🔄 updateTournamentMatchRounds:', {
      matchId,
      phase,
      groupId,
      roundsCount: rounds.length,
      total20sA,
      total20sB,
      currentGameData,
      hasSilverBracket: !!tournament.finalStage?.silverBracket
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
        if (currentGameData) {
          match.gamesWonA = currentGameData.gamesWonA;
          match.gamesWonB = currentGameData.gamesWonB;
        }
      };

      // Check gold bracket
      for (const round of tournament.finalStage.bracket.rounds) {
        const matchIndex = round.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          updateMatchRounds(round.matches[matchIndex]);
          matchFound = true;
          break;
        }
      }

      // Check 3rd place
      if (!matchFound && tournament.finalStage.bracket.thirdPlaceMatch?.id === matchId) {
        updateMatchRounds(tournament.finalStage.bracket.thirdPlaceMatch);
        matchFound = true;
      }

      // Check silver bracket
      if (!matchFound && tournament.finalStage.silverBracket) {
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
    winner: string;
    gamesWonA: number;
    gamesWonB: number;
    totalPointsA: number;
    totalPointsB: number;
    total20sA: number;
    total20sB: number;
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
        rounds: result.rounds
      });
      return success;
    } else {
      // For bracket matches, use updateBracketMatch and advanceWinner
      const { updateBracketMatch, advanceWinner, updateSilverBracketMatch, advanceSilverWinner } = await import('./tournamentBracket');

      // First, determine if this is a silver bracket match
      const tournament = await getTournament(tournamentId);
      if (!tournament || !tournament.finalStage) {
        return false;
      }

      let isSilverBracket = false;
      if (tournament.finalStage.silverBracket) {
        // Check if match is in silver bracket
        for (const round of tournament.finalStage.silverBracket.rounds) {
          if (round.matches.some(m => m.id === matchId)) {
            isSilverBracket = true;
            break;
          }
        }
        if (!isSilverBracket && tournament.finalStage.silverBracket.thirdPlaceMatch?.id === matchId) {
          isSilverBracket = true;
        }
      }

      // Update match result
      const updateFn = isSilverBracket ? updateSilverBracketMatch : updateBracketMatch;
      const updateSuccess = await updateFn(tournamentId, matchId, {
        status: 'COMPLETED',
        winner: result.winner,
        gamesWonA: result.gamesWonA,
        gamesWonB: result.gamesWonB,
        totalPointsA: result.totalPointsA,
        totalPointsB: result.totalPointsB,
        total20sA: result.total20sA,
        total20sB: result.total20sB,
        rounds: result.rounds
      });

      if (!updateSuccess) {
        return false;
      }

      // Advance winner to next match
      const advanceFn = isSilverBracket ? advanceSilverWinner : advanceWinner;
      return await advanceFn(tournamentId, matchId, result.winner);
    }
  } catch (error) {
    console.error('❌ Error completing tournament match:', error);
    return false;
  }
}
