/**
 * Tournament ELO calculation and application
 */

import { db, isFirebaseEnabled } from './config';
import { getTournament, updateTournament } from './tournaments';
import { calculateExpectedPositions, calculateAllEloDeltas } from '$lib/algorithms/elo';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { browser } from '$app/environment';
import type { EloCalculation } from '$lib/types/tournament';

/**
 * Calculate expected positions for all participants
 *
 * Called when tournament starts
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
    const expectedPositions = calculateExpectedPositions(tournament.participants);

    // Update participants with expected positions
    const updatedParticipants = tournament.participants.map(p => ({
      ...p,
      expectedPosition: expectedPositions.get(p.id) || 0
    }));

    return await updateTournament(tournamentId, {
      participants: updatedParticipants
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
      let currentPosition = 1;

      // Process rounds in reverse (final first)
      for (let i = bracket.rounds.length - 1; i >= 0; i--) {
        const round = bracket.rounds[i];

        round.matches.forEach(match => {
          if (match.winner && match.participantA && match.participantB) {
            // Winner gets current position (or better)
            const winner = updatedParticipants.find(p => p.id === match.winner);
            if (winner && (!winner.finalPosition || currentPosition < winner.finalPosition)) {
              winner.finalPosition = currentPosition;
            }

            // Loser gets next position
            const loser = updatedParticipants.find(
              p => p.id === (match.winner === match.participantA ? match.participantB : match.participantA)
            );
            if (loser && !loser.finalPosition) {
              loser.finalPosition = currentPosition + 1;
            }
          }
        });

        currentPosition = currentPosition * 2; // Double for next round
      }
    }

    // For participants without final position (didn't make bracket), use group stage
    if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStage) {
      let nextPosition = updatedParticipants.filter(p => p.finalPosition).length + 1;

      tournament.groupStage.groups.forEach(group => {
        const sortedStandings = [...group.standings].sort((a, b) => a.position - b.position);

        sortedStandings.forEach(standing => {
          const participant = updatedParticipants.find(p => p.id === standing.participantId);
          if (participant && !participant.finalPosition) {
            participant.finalPosition = nextPosition++;
          }
        });
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
        kFactor: tournament.eloConfig.isFirstTournament
          ? tournament.eloConfig.kFactor * 0.75
          : tournament.eloConfig.kFactor,
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
    const calculations = await calculateEloDeltas(tournamentId);

    // Update each registered user's ELO
    for (const calc of calculations) {
      const participant = tournament.participants.find(p => p.id === calc.participantId);

      if (participant && participant.type === 'REGISTERED' && participant.userId) {
        const userRef = doc(db!, 'users', participant.userId);

        await updateDoc(userRef, {
          elo: calc.finalElo,
          tournamentsPlayed: (participant as any).tournamentsPlayed || 0 + 1,
          updatedAt: serverTimestamp()
        });

        console.log(`✅ Updated ELO for user ${participant.userId}: ${calc.initialElo} → ${calc.finalElo} (${calc.delta > 0 ? '+' : ''}${calc.delta})`);
      }
    }

    // Update participant current ELO in tournament
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
