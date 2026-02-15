/**
 * Tournament group stage management
 * Round Robin and Swiss pairing operations
 */

import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
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

  console.log(`Fixing tournament ${tournamentId} qualificationMode to: ${qualificationMode}`);
  console.log('Current qualificationMode:', tournament.groupStage.qualificationMode);
  console.log('Current rankingSystem (legacy):', tournament.groupStage.rankingSystem);

  // Update the qualificationMode
  tournament.groupStage.qualificationMode = qualificationMode;

  try {
    await updateTournamentPublic(tournamentId, {
      groupStage: tournament.groupStage
    });
    console.log('✅ Tournament qualificationMode updated successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error updating tournament:', error);
    return false;
  }
}
import { generateRoundRobinSchedule as generateRRScheduleAlgorithm, splitIntoGroups } from '$lib/algorithms/roundRobin';
import { generateSwissPairings as generateSwissPairingsAlgorithm, assignTablesWithVariety } from '$lib/algorithms/swiss';
import { resolveTiebreaker, updateHeadToHeadRecord, calculateMatchPoints } from '$lib/algorithms/tiebreaker';
import type { GroupMatch, GroupStanding, Group } from '$lib/types/tournament';

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
        qualifiedForFinal: false
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
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  const groupStageType = tournament.groupStage?.type || 'ROUND_ROBIN';
  if (groupStageType !== 'SWISS') {
    console.error('Tournament is not configured for Swiss');
    return false;
  }

  if (!tournament.groupStage) {
    console.error('Group stage not initialized');
    return false;
  }

  try {
    // Get current standings
    const group = tournament.groupStage.groups[0]; // Swiss has single group
    const standings = group?.standings || [];

    // Get previous pairings
    const previousPairings = group?.pairings || [];

    // Filter out disqualified and withdrawn participants
    const activeParticipants = tournament.participants.filter(
      p => p.status !== 'DISQUALIFIED' && p.status !== 'WITHDRAWN'
    );
    const activeParticipantIds = new Set(activeParticipants.map(p => p.id));

    // Also filter standings to only include active participants
    const activeStandings = standings.filter(s => activeParticipantIds.has(s.participantId));
    console.log(`🎯 Swiss pairings: ${activeParticipants.length}/${tournament.participants.length} active participants`);

    // Generate new pairings (only with active participants)
    const matches = generateSwissPairingsAlgorithm(
      activeParticipants,
      activeStandings,
      previousPairings,
      roundNumber
    );

    // Assign tables with variety
    const tableHistory = new Map<string, number[]>();

    // Build table history from previous pairings
    previousPairings.forEach(pairing => {
      pairing.matches.forEach(match => {
        if (match.tableNumber) {
          if (!tableHistory.has(match.participantA)) {
            tableHistory.set(match.participantA, []);
          }
          if (match.participantB !== 'BYE' && !tableHistory.has(match.participantB)) {
            tableHistory.set(match.participantB, []);
          }
          tableHistory.get(match.participantA)!.push(match.tableNumber);
          if (match.participantB !== 'BYE') {
            tableHistory.get(match.participantB)!.push(match.tableNumber);
          }
        }
      });
    });

    const matchesWithTables = assignTablesWithVariety(matches, tournament.numTables, tableHistory);

    // Add new pairing
    const newPairings = [
      ...previousPairings,
      {
        roundNumber,
        matches: matchesWithTables
      }
    ];

    // Update group
    const updatedGroups = tournament.groupStage.groups.map(g => {
      if (g.id === group.id) {
        return {
          ...g,
          pairings: newPairings
        };
      }
      return g;
    });

    return await updateTournament(tournamentId, {
      groupStage: {
        ...tournament.groupStage,
        groups: updatedGroups,
        currentRound: roundNumber
      }
    });
  } catch (error) {
    console.error('❌ Error generating Swiss pairings:', error);
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
          round.matches[matchIndex] = {
            ...round.matches[matchIndex],
            ...result,
            completedAt: result.status === 'COMPLETED' ? Date.now() : undefined
          };
          matchUpdated = true;
          break;
        }
      }
    } else if (groupStage.type === 'SWISS' && group.pairings) {
      for (const pairing of group.pairings) {
        const matchIndex = pairing.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          pairing.matches[matchIndex] = {
            ...pairing.matches[matchIndex],
            ...result,
            completedAt: result.status === 'COMPLETED' ? Date.now() : undefined
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
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) {
    console.error('Tournament or group stage not found');
    return false;
  }

  try {
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
          headToHeadRecord: {} // Initialize head-to-head record
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
            // Tie
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
      // Support qualificationMode (new) and legacy fields (rankingSystem, swissRankingSystem)
      const qualificationMode = tournament.groupStage?.qualificationMode || tournament.groupStage?.rankingSystem || tournament.groupStage?.swissRankingSystem || 'WINS';

      console.log(`🔄 [recalculateStandings] Group: ${group.name}`);
      console.log(`🔄 System: ${isSwiss ? 'SWISS' : 'ROUND ROBIN'}, Mode: ${qualificationMode}, GameType: ${tournament.gameType}`);

      if (isSwiss) {
        standingsMap.forEach(standing => {
          standing.swissPoints = standing.matchesWon * 2 + standing.matchesTied * 1;
        });
      }

      // Apply tie-breaker and sort
      const standings = Array.from(standingsMap.values());
      console.log(`🔄 Standings before tiebreaker:`, standings.map(s => {
        const p = tournament.participants.find(pp => pp.id === s.participantId);
        return { name: p?.name, pts: s.points, twenties: s.total20s };
      }));

      const sortedStandings = resolveTiebreaker(standings, tournament.participants, isSwiss, qualificationMode);

      // Log ties detected
      const tieBreakerResults = sortedStandings.filter(s => s.tiedWith && s.tiedWith.length > 0);
      if (tieBreakerResults.length > 0) {
        console.log(`⚠️ [recalculateStandings] TIES DETECTED in ${group.name}:`);
        tieBreakerResults.forEach(s => {
          const p = tournament.participants.find(pp => pp.id === s.participantId);
          const tiedNames = s.tiedWith?.map(id => tournament.participants.find(pp => pp.id === id)?.name).join(', ');
          console.log(`  - ${p?.name} (pos ${s.position}) tied with: ${tiedNames} [reason: ${s.tieReason}]`);
        });
      } else {
        console.log(`✅ [recalculateStandings] No unresolved ties in ${group.name}`);
      }

      // Update group standings
      group.standings = sortedStandings;
    }

    // Update tournament (public - allows non-authenticated users with tournament key)
    return await updateTournamentPublic(tournamentId, {
      groupStage: tournament.groupStage
    });
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
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) {
    console.error('Tournament or group stage not found');
    return false;
  }

  // Verify all matches are complete
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
      console.error(`Group ${group.name} has ${incompleteMatches.length} incomplete matches`);
      return false;
    }
  }

  // Mark group stage as complete (public - allows non-authenticated users)
  return await updateTournamentPublic(tournamentId, {
    groupStage: {
      ...tournament.groupStage,
      isComplete: true
    }
  });
}
