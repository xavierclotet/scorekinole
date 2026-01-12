/**
 * Tournament match management
 * Update match results and handle no-shows
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import type { GroupMatch, GroupStanding } from '$lib/types/tournament';
import { getTournament } from './tournaments';

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

    // Update wins/losses/ties
    if (match.winner === match.participantA) {
      standingA.matchesWon++;
      standingA.points += 3;
      standingB.matchesLost++;
    } else if (match.winner === match.participantB) {
      standingB.matchesWon++;
      standingB.points += 3;
      standingA.matchesLost++;
    } else {
      // Tie (shouldn't happen in Best of X, but handle it)
      standingA.matchesTied++;
      standingA.points += 1;
      standingB.matchesTied++;
      standingB.points += 1;
    }

    // Update 20s
    if (match.total20sA) standingA.total20s += match.total20sA;
    if (match.total20sB) standingB.total20s += match.total20sB;

    // Update total points scored
    if (match.totalPointsA) standingA.totalPointsScored += match.totalPointsA;
    if (match.totalPointsB) standingB.totalPointsScored += match.totalPointsB;
  });

  // Sort standings
  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;
    // 2. Total 20s
    if (b.total20s !== a.total20s) return b.total20s - a.total20s;
    // 3. Total points scored
    return b.totalPointsScored - a.totalPointsScored;
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
