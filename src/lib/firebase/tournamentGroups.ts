/**
 * Tournament group stage management
 * Round Robin and Swiss pairing operations
 */

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { getTournament, updateTournament, updateTournamentPublic, parseTournamentData } from './tournaments';
import { cleanUndefined } from './cleanUndefined';
import type { QualificationMode } from '$lib/types/tournament';

/**
 * Fix tournament qualification mode (temporary utility)
 * Use this to update tournaments that were created without qualificationMode set
 *
 * Usage from browser console:
 * import { fixTournamentQualificationMode } from '$lib/firebase/tournamentGroups';
 * await fixTournamentQualificationMode('tournament-id', 'POINTS');
 */
export async function fixTournamentQualificationMode(
  tournamentId: string,
  qualificationMode: QualificationMode
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) {
    console.error('Tournament or group stage not found');
    return false;
  }

  // Update the qualificationMode
  tournament.groupStage.qualificationMode = qualificationMode;

  try {
    await updateTournamentPublic(tournamentId, {
      groupStage: tournament.groupStage
    });
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament:', error);
    return false;
  }
}
import { generateRoundRobinSchedule as generateRRScheduleAlgorithm, splitIntoGroups } from '$lib/algorithms/roundRobin';
import { generateSwissPairings as generateSwissPairingsAlgorithm, assignTablesWithVariety } from '$lib/algorithms/swiss';
import { resolveTiebreaker, updateHeadToHeadRecord, calculateMatchPoints } from '$lib/algorithms/tiebreaker';
import type { GroupMatch, GroupStanding } from '$lib/types/tournament';

/**
 * Generate Round Robin schedule for tournament
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function generateRoundRobinSchedule(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Can only generate schedule in DRAFT status');
    return false;
  }

  const groupStageType = tournament.groupStage?.type || 'ROUND_ROBIN';
  if (tournament.phaseType !== 'TWO_PHASE' || groupStageType !== 'ROUND_ROBIN') {
    console.error('Tournament is not configured for Round Robin');
    return false;
  }

  try {
    // Split participants into groups
    const numGroups = tournament.groupStage?.numGroups || tournament.numGroups || 1;
    const groups = splitIntoGroups(tournament.participants, numGroups);

    // Generate schedule for each group
    for (const group of groups) {
      const rounds = generateRRScheduleAlgorithm(group.participants);
      group.schedule = rounds;

      // Initialize standings
      group.standings = group.participants.map(participantId => ({
        participantId,
        position: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
        points: 0,
        total20s: 0,
        totalPointsScored: 0,
        qualifiedForFinal: false,
        headToHeadRecord: {}
      }));
    }

    // Calculate total rounds
    const totalRounds = groups[0]?.schedule?.length || 0;

    // Update tournament
    return await updateTournament(tournamentId, {
      groupStage: {
        type: 'ROUND_ROBIN',
        groups,
        currentRound: 1,
        totalRounds,
        isComplete: false
      }
    });
  } catch (error) {
    console.error('❌ Error generating Round Robin schedule:', error);
    return false;
  }
}

/**
 * Generate Swiss pairings for a round
 *
 * @param tournamentId Tournament ID
 * @param roundNumber Round number to generate
 * @returns true if successful
 */
export async function generateSwissPairings(
  tournamentId: string,
  roundNumber: number
): Promise<boolean> {
  if (!db) {
    console.error('Firestore not initialized');
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      // Read tournament inside transaction (atomic — prevents race conditions)
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());

      if (tournament.groupStage?.type !== 'SWISS') {
        throw new Error('Tournament is not configured for Swiss');
      }
      if (!tournament.groupStage) {
        throw new Error('Group stage not initialized');
      }

      const group = tournament.groupStage.groups[0]; // Swiss has single group
      if (!group) throw new Error('No group found');

      // Guard: don't generate a round that already exists
      const existingRound = group.pairings?.find(p => p.roundNumber === roundNumber);
      if (existingRound) {
        throw new Error(`Round ${roundNumber} already exists`);
      }

      // Recalculate standings in-memory from match results (avoids separate read/write)
      const standingsMap = new Map<string, GroupStanding>();
      group.participants.forEach(participantId => {
        standingsMap.set(participantId, {
          participantId,
          position: 0,
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          matchesTied: 0,
          points: 0,
          swissPoints: 0,
          total20s: 0,
          totalPointsScored: 0,
          qualifiedForFinal: false,
          headToHeadRecord: {}
        });
      });

      const allMatches: GroupMatch[] = [];
      if (group.pairings) {
        group.pairings.forEach(pairing => allMatches.push(...pairing.matches));
      }

      allMatches
        .filter(m => m.status === 'COMPLETED' || m.status === 'WALKOVER')
        .forEach(match => {
          const standingA = standingsMap.get(match.participantA);
          const standingB = match.participantB !== 'BYE' ? standingsMap.get(match.participantB) : null;
          if (!standingA) return;

          standingA.matchesPlayed++;
          if (standingB) standingB.matchesPlayed++;

          standingA.total20s += match.total20sA || 0;
          standingA.totalPointsScored += match.totalPointsA || 0;
          if (standingB) {
            standingB.total20s += match.total20sB || 0;
            standingB.totalPointsScored += match.totalPointsB || 0;
          }

          if (match.winner === match.participantA) {
            standingA.matchesWon++;
            if (standingB) standingB.matchesLost++;
          } else if (match.winner === match.participantB && standingB) {
            standingA.matchesLost++;
            standingB.matchesWon++;
          } else if (!match.winner) {
            standingA.matchesTied++;
            if (standingB) standingB.matchesTied++;
          }

          if (standingB && match.participantB !== 'BYE') {
            const allStandings = Array.from(standingsMap.values());
            const updated = updateHeadToHeadRecord(
              allStandings,
              match.participantA,
              match.participantB,
              match.winner || null,
              match.total20sA || 0,
              match.total20sB || 0
            );
            updated.forEach(s => standingsMap.set(s.participantId, s));
          }
        });

      standingsMap.forEach(standing => {
        standing.points = calculateMatchPoints(standing.matchesWon, standing.matchesTied);
        standing.swissPoints = standing.matchesWon * 2 + standing.matchesTied * 1;
      });

      const qualificationMode = tournament.groupStage.qualificationMode || tournament.groupStage.rankingSystem || tournament.groupStage.swissRankingSystem || 'WINS';
      const show20s = tournament.show20s !== false;
      const standings = resolveTiebreaker(
        Array.from(standingsMap.values()),
        tournament.participants,
        true,
        qualificationMode,
        show20s,
        tournament.groupStage.tiebreakerPriority
      );

      // Get previous pairings
      const previousPairings = group.pairings || [];

      // Filter out disqualified and withdrawn participants
      const activeParticipants = tournament.participants.filter(
        p => p.status !== 'DISQUALIFIED' && p.status !== 'WITHDRAWN'
      );
      const activeParticipantIds = new Set(activeParticipants.map(p => p.id));
      const activeStandings = standings.filter(s => activeParticipantIds.has(s.participantId));

      // Generate new pairings (only with active participants)
      const matches = generateSwissPairingsAlgorithm(
        activeParticipants,
        activeStandings,
        previousPairings,
        roundNumber
      );

      // Assign tables with variety
      const tableHistory = new Map<string, number[]>();
      previousPairings.forEach(pairing => {
        pairing.matches.forEach(match => {
          if (match.tableNumber) {
            if (!tableHistory.has(match.participantA)) tableHistory.set(match.participantA, []);
            if (match.participantB !== 'BYE' && !tableHistory.has(match.participantB)) tableHistory.set(match.participantB, []);
            tableHistory.get(match.participantA)!.push(match.tableNumber);
            if (match.participantB !== 'BYE') tableHistory.get(match.participantB)!.push(match.tableNumber);
          }
        });
      });

      const matchesWithTables = assignTablesWithVariety(matches, tournament.numTables, tableHistory);

      // Add new pairing
      const newPairings = [
        ...previousPairings,
        { roundNumber, matches: matchesWithTables }
      ];

      // Update group with new pairings and fresh standings
      const updatedGroups = tournament.groupStage.groups.map(g => {
        if (g.id === group.id) {
          return { ...g, pairings: newPairings, standings };
        }
        return g;
      });

      // Update BYE player standings inline
      const byeMatch = matchesWithTables.find(m => m.participantB === 'BYE');
      const updatedGroup = updatedGroups.find(g => g.id === group.id);
      if (byeMatch && updatedGroup?.standings) {
        const byeStanding = updatedGroup.standings.find(s => s.participantId === byeMatch.participantA);
        if (byeStanding) {
          byeStanding.matchesPlayed++;
          byeStanding.matchesWon++;
          byeStanding.points += 2;
          byeStanding.totalPointsScored += (byeMatch.totalPointsA || 8);
          byeStanding.total20s += (byeMatch.total20sA || 0);
          if (byeStanding.swissPoints !== undefined) byeStanding.swissPoints += 2;
        }

        // Recalculate positions after BYE update
        updatedGroup.standings = resolveTiebreaker(
          updatedGroup.standings,
          tournament.participants,
          true,
          qualificationMode,
          show20s,
          tournament.groupStage.tiebreakerPriority
        );
      }

      // Atomic write inside transaction
      transaction.update(tournamentRef, {
        groupStage: cleanUndefined({
          ...tournament.groupStage,
          groups: updatedGroups,
          currentRound: roundNumber
        }),
        updatedAt: serverTimestamp()
      });
    }, { maxAttempts: 5 });

    console.log('✅ Swiss pairings generated for round', roundNumber);
    return true;
  } catch (error) {
    console.error('❌ Error generating Swiss pairings:', error);
    return false;
  }
}

/**
 * Safely update the number of Swiss rounds without overwriting match data.
 * Uses Firestore dot notation to only update the specific fields,
 * avoiding the race condition of spreading the entire groupStage.
 */
export async function updateSwissRoundsConfig(
  tournamentId: string,
  numRounds: number
): Promise<boolean> {
  if (!db) {
    console.error('Firestore not initialized');
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const data = snapshot.data();
      if (data.groupStage?.type !== 'SWISS') {
        throw new Error('Tournament is not Swiss type');
      }

      const currentRound = data.groupStage?.currentRound || 1;
      if (numRounds < currentRound) {
        throw new Error(`Cannot set Swiss rounds to ${numRounds}, current round is ${currentRound}`);
      }

      // Dot notation: only updates these specific nested fields
      // without touching groups, standings, matches, etc.
      transaction.update(tournamentRef, {
        numSwissRounds: numRounds,
        'groupStage.numSwissRounds': numRounds,
        'groupStage.totalRounds': numRounds,
        updatedAt: serverTimestamp()
      });
    });

    console.log('✅ Swiss rounds config updated to', numRounds);
    return true;
  } catch (error) {
    console.error('❌ Error updating Swiss rounds config:', error);
    return false;
  }
}

/**
 * Update group match result
 *
 * @param tournamentId Tournament ID
 * @param groupId Group ID
 * @param matchId Match ID
 * @param result Match result data
 * @returns true if successful
 */
export async function updateGroupMatch(
  tournamentId: string,
  groupId: string,
  matchId: string,
  result: Partial<GroupMatch>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) {
    console.error('Tournament or group stage not found');
    return false;
  }

  try {
    const groupStage = tournament.groupStage;
    const group = groupStage.groups.find(g => g.id === groupId);
    if (!group) {
      console.error('Group not found');
      return false;
    }

    // Update match in schedule or pairings
    let matchUpdated = false;

    if (groupStage.type === 'ROUND_ROBIN' && group.schedule) {
      for (const round of group.schedule) {
        const matchIndex = round.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          const existing = round.matches[matchIndex];
          const completedAt = result.status === 'COMPLETED' ? Date.now() : undefined;
          round.matches[matchIndex] = {
            ...existing,
            ...result,
            completedAt,
            duration: (result.status === 'COMPLETED' && completedAt && existing.startedAt)
              ? completedAt - existing.startedAt : undefined
          };
          matchUpdated = true;
          break;
        }
      }
    } else if (groupStage.type === 'SWISS' && group.pairings) {
      for (const pairing of group.pairings) {
        const matchIndex = pairing.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          const existing = pairing.matches[matchIndex];
          const completedAt = result.status === 'COMPLETED' ? Date.now() : undefined;
          pairing.matches[matchIndex] = {
            ...existing,
            ...result,
            completedAt,
            duration: (result.status === 'COMPLETED' && completedAt && existing.startedAt)
              ? completedAt - existing.startedAt : undefined
          };
          matchUpdated = true;
          break;
        }
      }
    }

    if (!matchUpdated) {
      console.error('Match not found');
      return false;
    }

    // Recalculate standings
    await recalculateStandings(tournamentId, groupId);

    return true;
  } catch (error) {
    console.error('❌ Error updating group match:', error);
    return false;
  }
}

/**
 * Recalculate group standings
 *
 * @param tournamentId Tournament ID
 * @param groupId Optional group ID (if null, recalculates all groups)
 * @returns true if successful
 */
export async function recalculateStandings(
  tournamentId: string,
  groupId?: string
): Promise<boolean> {
  if (!db) {
    console.error('Firestore not initialized');
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.groupStage) {
        throw new Error('Group stage not found');
      }

      const groupsToUpdate = groupId
        ? tournament.groupStage.groups.filter(g => g.id === groupId)
        : tournament.groupStage.groups;

      for (const group of groupsToUpdate) {
        // Initialize standings
        const standingsMap = new Map<string, GroupStanding>();

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
            qualifiedForFinal: false,
            headToHeadRecord: {}
          });
        });

        // Get all matches
        const matches: GroupMatch[] = [];
        if (group.schedule) {
          group.schedule.forEach(round => matches.push(...round.matches));
        }
        if (group.pairings) {
          group.pairings.forEach(pairing => matches.push(...pairing.matches));
        }

        // Calculate statistics from completed matches
        matches
          .filter(m => m.status === 'COMPLETED' || m.status === 'WALKOVER')
          .forEach(match => {
            const standingA = standingsMap.get(match.participantA);
            const standingB =
              match.participantB !== 'BYE' ? standingsMap.get(match.participantB) : null;

            if (!standingA) return;

            // Update matches played
            standingA.matchesPlayed++;
            if (standingB) {
              standingB.matchesPlayed++;
            }

            // Update 20s and points scored
            standingA.total20s += match.total20sA || 0;
            standingA.totalPointsScored += match.totalPointsA || 0;

            if (standingB) {
              standingB.total20s += match.total20sB || 0;
              standingB.totalPointsScored += match.totalPointsB || 0;
            }

            // Update wins/losses/ties
            if (match.winner === match.participantA) {
              standingA.matchesWon++;
              if (standingB) {
                standingB.matchesLost++;
              }
            } else if (match.winner === match.participantB && standingB) {
              standingA.matchesLost++;
              standingB.matchesWon++;
            } else if (!match.winner) {
              standingA.matchesTied++;
              if (standingB) {
                standingB.matchesTied++;
              }
            }

            // Update head-to-head (including 20s for mini-league tiebreaker)
            if (standingB && match.participantB !== 'BYE') {
              const standings = Array.from(standingsMap.values());
              const updatedStandings = updateHeadToHeadRecord(
                standings,
                match.participantA,
                match.participantB,
                match.winner || null,
                match.total20sA || 0,
                match.total20sB || 0
              );
              updatedStandings.forEach(s => standingsMap.set(s.participantId, s));
            }
          });

        // Calculate points
        standingsMap.forEach(standing => {
          standing.points = calculateMatchPoints(standing.matchesWon, standing.matchesTied);
        });

        // For Swiss: calculate swissPoints (2/1/0 - same as Round Robin)
        const isSwiss = tournament.groupStage?.type === 'SWISS';
        const qualificationMode = tournament.groupStage?.qualificationMode || tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS';

        if (isSwiss) {
          standingsMap.forEach(standing => {
            standing.swissPoints = standing.matchesWon * 2 + standing.matchesTied * 1;
          });
        }

        // Apply tie-breaker and sort
        const standings = Array.from(standingsMap.values());
        const tiebreakerPriority = tournament.groupStage?.tiebreakerPriority;
        const sortedStandings = resolveTiebreaker(standings, tournament.participants, isSwiss, qualificationMode, tournament.show20s !== false, tiebreakerPriority);

        // Update group standings
        group.standings = sortedStandings;
      }

      transaction.update(tournamentRef, {
        groupStage: cleanUndefined(tournament.groupStage),
        updatedAt: serverTimestamp()
      });
    });

    return true;
  } catch (error) {
    console.error('❌ Error recalculating standings:', error);
    return false;
  }
}

/**
 * Mark participant as no-show (walkover)
 *
 * @param tournamentId Tournament ID
 * @param groupId Group ID
 * @param matchId Match ID
 * @param participantId Participant who didn't show
 * @returns true if successful
 */
export async function markNoShow(
  tournamentId: string,
  groupId: string,
  matchId: string,
  participantId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) {
    console.error('Tournament or group stage not found');
    return false;
  }

  const group = tournament.groupStage.groups.find(g => g.id === groupId);
  if (!group) {
    console.error('Group not found');
    return false;
  }

  // Find match
  let match: GroupMatch | undefined;

  if (group.schedule) {
    for (const round of group.schedule) {
      match = round.matches.find(m => m.id === matchId);
      if (match) break;
    }
  }

  if (group.pairings && !match) {
    for (const pairing of group.pairings) {
      match = pairing.matches.find(m => m.id === matchId);
      if (match) break;
    }
  }

  if (!match) {
    console.error('Match not found');
    return false;
  }

  // Determine winner (opponent)
  const winner =
    match.participantA === participantId ? match.participantB : match.participantA;

  // Update match as walkover
  return await updateGroupMatch(tournamentId, groupId, matchId, {
    status: 'WALKOVER',
    winner,
    gamesWonA: match.participantA === winner ? 2 : 0,
    gamesWonB: match.participantB === winner ? 2 : 0,
    noShowParticipant: participantId,
    walkedOverAt: Date.now()
  });
}

/**
 * Complete group stage
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function completeGroupStage(tournamentId: string): Promise<boolean> {
  if (!db) {
    console.error('Firestore not initialized');
    return false;
  }

  try {
    const tournamentRef = doc(db, 'tournaments', tournamentId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(tournamentRef);
      if (!snapshot.exists()) throw new Error('Tournament not found');

      const tournament = parseTournamentData(snapshot.data());
      if (!tournament.groupStage) {
        throw new Error('Group stage not found');
      }

      // Verify all matches are complete (using fresh data from transaction)
      for (const group of tournament.groupStage.groups) {
        const matches: GroupMatch[] = [];
        if (group.schedule) {
          group.schedule.forEach(round => matches.push(...round.matches));
        }
        if (group.pairings) {
          group.pairings.forEach(pairing => matches.push(...pairing.matches));
        }

        const incompleteMatches = matches.filter(
          m => m.status !== 'COMPLETED' && m.status !== 'WALKOVER'
        );

        if (incompleteMatches.length > 0) {
          throw new Error(`Group ${group.name} has ${incompleteMatches.length} incomplete matches`);
        }
      }

      // Mark group stage as complete atomically
      transaction.update(tournamentRef, {
        groupStage: cleanUndefined({
          ...tournament.groupStage,
          isComplete: true
        }),
        updatedAt: serverTimestamp()
      });
    });

    return true;
  } catch (error) {
    console.error('❌ Error completing group stage:', error);
    return false;
  }
}
