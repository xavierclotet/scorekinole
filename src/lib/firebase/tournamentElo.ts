/**
 * Tournament ELO calculation and application
 */

import { isFirebaseEnabled } from './config';
import { getTournament, updateTournament } from './tournaments';
import { calculateExpectedPositions, calculateAllEloDeltas } from '$lib/algorithms/elo';
import { browser } from '$app/environment';
import type { EloCalculation } from '$lib/types/tournament';
import { getOrCreateUserByName, getUserProfileById, removeTournamentRecord } from './userProfile';

/**
 * Fetch current ELO for all participants from Firestore users collection
 * This ensures we use their accumulated ELO, not the default 1500
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function syncParticipantElos(tournamentId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (!tournament.eloConfig.enabled) {
    console.log('ELO not enabled for this tournament');
    return true;
  }

  try {
    const updatedParticipants = await Promise.all(
      tournament.participants.map(async (participant) => {
        let userElo = 1500; // Default ELO

        // Try to find user's current ELO
        if (participant.userId) {
          // REGISTERED user - get by userId
          const profile = await getUserProfileById(participant.userId);
          if (profile?.elo !== undefined) {
            userElo = profile.elo;
          }
        } else {
          // GUEST user - search by name
          const result = await getOrCreateUserByName(participant.name);
          if (result) {
            const profile = await getUserProfileById(result.userId);
            if (profile?.elo !== undefined) {
              userElo = profile.elo;
            }
          }
        }

        console.log(`📊 ${participant.name}: ELO ${userElo}`);

        return {
          ...participant,
          eloSnapshot: userElo,
          currentElo: userElo
        };
      })
    );

    await updateTournament(tournamentId, {
      participants: updatedParticipants
    });

    console.log(`✅ Synced ELO for ${updatedParticipants.length} participants`);
    return true;
  } catch (error) {
    console.error('❌ Error syncing participant ELOs:', error);
    return false;
  }
}

/**
 * Calculate expected positions for all participants
 *
 * Called when tournament starts - first syncs ELOs from user profiles
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function calculateTournamentExpectedPositions(
  tournamentId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (!tournament.eloConfig.enabled) {
    console.log('ELO not enabled for this tournament');
    return true; // Not an error
  }

  try {
    // First, sync ELOs from user profiles to get their current accumulated ELO
    await syncParticipantElos(tournamentId);

    // Re-fetch tournament to get updated ELOs
    const updatedTournament = await getTournament(tournamentId);
    if (!updatedTournament) {
      console.error('Tournament not found after ELO sync');
      return false;
    }

    const expectedPositions = calculateExpectedPositions(updatedTournament.participants);

    // Update participants with expected positions
    const finalParticipants = updatedTournament.participants.map(p => ({
      ...p,
      expectedPosition: expectedPositions.get(p.id) || 0
    }));

    return await updateTournament(tournamentId, {
      participants: finalParticipants
    });
  } catch (error) {
    console.error('❌ Error calculating expected positions:', error);
    return false;
  }
}

/**
 * Calculate final positions from tournament results
 *
 * Called when tournament completes
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function calculateFinalPositions(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  try {
    const updatedParticipants = [...tournament.participants];

    if (tournament.phaseType === 'TWO_PHASE') {
      // Get positions from group stage standings
      tournament.groupStage?.groups.forEach(group => {
        group.standings.forEach(standing => {
          const participant = updatedParticipants.find(p => p.id === standing.participantId);
          if (participant && !participant.finalPosition) {
            // Assign position based on group standings
            // This is preliminary; bracket results will override for qualified participants
            participant.finalPosition = standing.position;
          }
        });
      });
    }

    // Override with bracket results (more precise for top finishers)
    if (tournament.finalStage && tournament.finalStage.isComplete) {
      const bracket = tournament.finalStage.bracket;

      // First, handle the final match (positions 1 and 2)
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const finalMatch = finalRound.matches[0];
      if (finalMatch.winner && finalMatch.participantA && finalMatch.participantB) {
        const winner = updatedParticipants.find(p => p.id === finalMatch.winner);
        if (winner) {
          winner.finalPosition = 1;
        }
        const loser = updatedParticipants.find(
          p => p.id === (finalMatch.winner === finalMatch.participantA ? finalMatch.participantB : finalMatch.participantA)
        );
        if (loser) {
          loser.finalPosition = 2;
        }
      }

      // Handle 3rd place match (positions 3 and 4)
      const thirdPlaceMatch = bracket.thirdPlaceMatch;
      if (thirdPlaceMatch?.winner && thirdPlaceMatch.participantA && thirdPlaceMatch.participantB) {
        const thirdPlace = updatedParticipants.find(p => p.id === thirdPlaceMatch.winner);
        if (thirdPlace) {
          thirdPlace.finalPosition = 3;
        }
        const fourthPlace = updatedParticipants.find(
          p => p.id === (thirdPlaceMatch.winner === thirdPlaceMatch.participantA ? thirdPlaceMatch.participantB : thirdPlaceMatch.participantA)
        );
        if (fourthPlace) {
          fourthPlace.finalPosition = 4;
        }
      }

      // Process remaining rounds (for positions 5-8, 9-16, etc.)
      let currentPosition = 5; // Start from 5 since 1-4 are handled
      for (let i = bracket.rounds.length - 2; i >= 0; i--) {
        const round = bracket.rounds[i];

        // Skip semifinals (already processed via 3rd place match)
        if (i === bracket.rounds.length - 2) continue;

        round.matches.forEach(match => {
          if (match.winner && match.participantA && match.participantB) {
            // Loser of this round gets current position
            const loser = updatedParticipants.find(
              p => p.id === (match.winner === match.participantA ? match.participantB : match.participantA)
            );
            if (loser && !loser.finalPosition) {
              loser.finalPosition = currentPosition++;
            }
          }
        });
      }
    }

    // For participants without final position (didn't make bracket), order by total points
    if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStage) {
      let nextPosition = updatedParticipants.filter(p => p.finalPosition).length + 1;

      // Ensure groups is an array
      const groups = Array.isArray(tournament.groupStage.groups)
        ? tournament.groupStage.groups
        : Object.values(tournament.groupStage.groups);

      // Collect all standings from all groups for participants without final position
      const remainingStandings: Array<{
        participantId: string;
        totalPointsScored: number;
        total20s: number;
        points: number;
      }> = [];

      groups.forEach((group: any) => {
        const standings = Array.isArray(group.standings)
          ? group.standings
          : Object.values(group.standings || {});

        standings.forEach((standing: any) => {
          const participant = updatedParticipants.find(p => p.id === standing.participantId);
          if (participant && !participant.finalPosition) {
            remainingStandings.push({
              participantId: standing.participantId,
              totalPointsScored: standing.totalPointsScored || 0,
              total20s: standing.total20s || 0,
              points: standing.points || 0
            });
          }
        });
      });

      // Sort by total points scored (descending), then by 20s (descending), then by match points (descending)
      remainingStandings.sort((a, b) => {
        if (b.totalPointsScored !== a.totalPointsScored) {
          return b.totalPointsScored - a.totalPointsScored;
        }
        if (b.total20s !== a.total20s) {
          return b.total20s - a.total20s;
        }
        return b.points - a.points;
      });

      // Assign positions
      remainingStandings.forEach(standing => {
        const participant = updatedParticipants.find(p => p.id === standing.participantId);
        if (participant) {
          participant.finalPosition = nextPosition++;
        }
      });
    }

    // For ONE_PHASE tournaments without positions yet
    if (tournament.phaseType === 'ONE_PHASE') {
      updatedParticipants.forEach((p, index) => {
        if (!p.finalPosition) {
          p.finalPosition = index + 1;
        }
      });
    }

    return await updateTournament(tournamentId, {
      participants: updatedParticipants
    });
  } catch (error) {
    console.error('❌ Error calculating final positions:', error);
    return false;
  }
}

/**
 * Calculate ELO deltas for all participants
 *
 * @param tournamentId Tournament ID
 * @returns Array of ELO calculations
 */
export async function calculateEloDeltas(tournamentId: string): Promise<EloCalculation[]> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return [];
  }

  if (!tournament.eloConfig.enabled) {
    console.log('ELO not enabled for this tournament');
    return [];
  }

  try {
    const eloResults = calculateAllEloDeltas(tournament.participants, tournament.eloConfig);

    // Convert to EloCalculation format
    const calculations: EloCalculation[] = eloResults.map(result => {
      const participant = tournament.participants.find(p => p.id === result.participantId)!;

      return {
        tournamentId: tournament.id,
        participantId: result.participantId,
        calculatedAt: Date.now(),
        initialElo: result.initialElo,
        expectedPosition: participant.expectedPosition,
        actualPosition: participant.finalPosition || 0,
        kFactor: tournament.eloConfig.kFactor,
        delta: result.delta,
        finalElo: result.finalElo,
        isDoubles: tournament.gameType === 'doubles',
        partnerParticipantId: participant.partner?.userId,
        pairAverageElo:
          tournament.gameType === 'doubles' && participant.partner
            ? (participant.eloSnapshot +
                (tournament.participants.find(p => p.id === participant.partner?.userId)
                  ?.eloSnapshot || 1500)) /
              2
            : undefined
      };
    });

    return calculations;
  } catch (error) {
    console.error('❌ Error calculating ELO deltas:', error);
    return [];
  }
}

/**
 * Apply ELO updates to user profiles
 * Updates both REGISTERED users (by userId) and GUEST users (by name match or create)
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function applyEloUpdates(tournamentId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (!tournament.eloConfig.enabled) {
    console.log('ELO not enabled for this tournament');
    return true; // Not an error
  }

  try {
    // Import helper functions
    const { getOrCreateUserByName, addTournamentRecord } = await import('./userProfile');

    const calculations = await calculateEloDeltas(tournamentId);
    const totalParticipants = tournament.participants.filter(p => p.status === 'ACTIVE').length;

    // Update each participant's ELO (both REGISTERED and GUEST)
    for (const calc of calculations) {
      const participant = tournament.participants.find(p => p.id === calc.participantId);
      if (!participant) continue;

      // Build tournament record
      const tournamentRecord = {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentDate: tournament.completedAt || Date.now(),
        finalPosition: participant.finalPosition || 0,
        totalParticipants,
        eloBefore: calc.initialElo,
        eloAfter: calc.finalElo,
        eloDelta: calc.delta
      };

      let userId: string | null = null;

      if (participant.type === 'REGISTERED' && participant.userId) {
        // REGISTERED user - use existing userId
        userId = participant.userId;
      } else {
        // GUEST user - find or create by exact name match
        const result = await getOrCreateUserByName(participant.name);
        if (result) {
          userId = result.userId;
          if (result.created) {
            console.log(`📝 Created new user for GUEST "${participant.name}"`);
          }
        }
      }

      if (userId) {
        // Add tournament record and update ELO
        await addTournamentRecord(userId, tournamentRecord, calc.finalElo);
      } else {
        console.warn(`⚠️ Could not find/create user for participant "${participant.name}"`);
      }
    }

    // Update participant current ELO in tournament document
    const updatedParticipants = tournament.participants.map(p => {
      const calc = calculations.find(c => c.participantId === p.id);
      if (calc) {
        return {
          ...p,
          currentElo: calc.finalElo
        };
      }
      return p;
    });

    await updateTournament(tournamentId, {
      participants: updatedParticipants
    });

    console.log(`✅ Applied ELO updates for ${calculations.length} participants`);
    return true;
  } catch (error) {
    console.error('❌ Error applying ELO updates:', error);
    return false;
  }
}

/**
 * Revert ELO updates for all participants when a tournament is deleted
 * This removes the tournament from each user's history and reverts their ELO
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function revertTournamentElo(tournamentId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  // Only revert if ELO was enabled and tournament was completed (ELO was applied)
  if (!tournament.eloConfig.enabled) {
    console.log('ELO not enabled for this tournament - nothing to revert');
    return true;
  }

  if (tournament.status !== 'COMPLETED') {
    console.log('Tournament not completed - ELO was never applied, nothing to revert');
    return true;
  }

  try {
    console.log(`🔄 Reverting ELO for tournament "${tournament.name}" (${tournamentId})`);

    // Process each participant
    for (const participant of tournament.participants) {
      if (participant.status !== 'ACTIVE') continue;

      let userId: string | null = null;

      if (participant.type === 'REGISTERED' && participant.userId) {
        // REGISTERED user - use existing userId
        userId = participant.userId;
      } else {
        // GUEST user - find by exact name match
        const result = await getOrCreateUserByName(participant.name);
        if (result && !result.created) {
          userId = result.userId;
        }
      }

      if (userId) {
        await removeTournamentRecord(userId, tournamentId);
      }

      // Also handle partner in doubles
      if (tournament.gameType === 'doubles' && participant.partner) {
        let partnerUserId: string | null = null;

        if (participant.partner.type === 'REGISTERED' && participant.partner.userId) {
          partnerUserId = participant.partner.userId;
        } else {
          const result = await getOrCreateUserByName(participant.partner.name);
          if (result && !result.created) {
            partnerUserId = result.userId;
          }
        }

        if (partnerUserId) {
          await removeTournamentRecord(partnerUserId, tournamentId);
        }
      }
    }

    console.log(`✅ Reverted ELO for all participants in tournament "${tournament.name}"`);
    return true;
  } catch (error) {
    console.error('❌ Error reverting tournament ELO:', error);
    return false;
  }
}
