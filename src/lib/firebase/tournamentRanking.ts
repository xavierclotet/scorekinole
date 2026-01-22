/**
 * Tournament ranking points calculation and application
 */

import { isFirebaseEnabled } from './config';
import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
import { calculateRankingPoints } from '$lib/algorithms/ranking';
import { browser } from '$app/environment';
import { getOrCreateUserByName, getUserProfileById, removeTournamentRecord } from './userProfile';
import { savingParticipantResults } from '$lib/stores/tournament';

/**
 * Sync current ranking for all participants from Firestore users collection
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function syncParticipantRankings(tournamentId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (!tournament.rankingConfig?.enabled) {
    return true;
  }

  try {
    const updatedParticipants = await Promise.all(
      tournament.participants.map(async (participant) => {
        let currentRanking = 0;

        if (participant.userId) {
          const profile = await getUserProfileById(participant.userId);
          if (profile?.ranking !== undefined) {
            currentRanking = profile.ranking;
          }
        } else {
          const result = await getOrCreateUserByName(participant.name);
          if (result) {
            const profile = await getUserProfileById(result.userId);
            if (profile?.ranking !== undefined) {
              currentRanking = profile.ranking;
            }
          }
        }

        return {
          ...participant,
          rankingSnapshot: currentRanking,
          currentRanking: currentRanking
        };
      })
    );

    await updateTournament(tournamentId, {
      participants: updatedParticipants
    });

    return true;
  } catch (error) {
    console.error('Error syncing participant rankings:', error);
    return false;
  }
}

/**
 * Calculate final positions in-memory (without saving)
 * Used to include positions in the same update that marks tournament as COMPLETED
 *
 * @param tournament Tournament object
 * @returns Updated participants array with finalPosition set
 */
export function calculateFinalPositionsForTournament(tournament: any): any[] {
  const updatedParticipants = [...tournament.participants];

  if (tournament.phaseType === 'TWO_PHASE') {
    tournament.groupStage?.groups.forEach((group: any) => {
      group.standings.forEach((standing: any) => {
        const participant = updatedParticipants.find(p => p.id === standing.participantId);
        if (participant && !participant.finalPosition) {
          participant.finalPosition = standing.position;
        }
      });
    });
  }

  if (tournament.finalStage && (tournament.finalStage.isComplete || tournament.status === 'FINAL_STAGE')) {
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';

    const clearBracketParticipantPositions = (bracket: any) => {
      if (!bracket || !bracket.rounds) return;
      bracket.rounds.forEach((round: any) => {
        round.matches.forEach((match: any) => {
          if (match.participantA) {
            const p = updatedParticipants.find(x => x.id === match.participantA);
            if (p) p.finalPosition = undefined;
          }
          if (match.participantB) {
            const p = updatedParticipants.find(x => x.id === match.participantB);
            if (p) p.finalPosition = undefined;
          }
        });
      });
      if (bracket.thirdPlaceMatch) {
        if (bracket.thirdPlaceMatch.participantA) {
          const p = updatedParticipants.find(x => x.id === bracket.thirdPlaceMatch.participantA);
          if (p) p.finalPosition = undefined;
        }
        if (bracket.thirdPlaceMatch.participantB) {
          const p = updatedParticipants.find(x => x.id === bracket.thirdPlaceMatch.participantB);
          if (p) p.finalPosition = undefined;
        }
      }
    };

    clearBracketParticipantPositions(tournament.finalStage.bracket);
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      clearBracketParticipantPositions(tournament.finalStage.silverBracket);
    }

    const assignBracketPositions = (bracket: any, startPosition: number): number => {
      if (!bracket || !bracket.rounds || bracket.rounds.length === 0) {
        return 0;
      }

      let positionsAssigned = 0;
      let currentPosition = startPosition;

      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const finalMatch = finalRound?.matches[0];
      if (finalMatch?.winner && finalMatch.participantA && finalMatch.participantB) {
        const winner = updatedParticipants.find(p => p.id === finalMatch.winner);
        if (winner) {
          winner.finalPosition = currentPosition++;
          positionsAssigned++;
        }
        const loser = updatedParticipants.find(
          p => p.id === (finalMatch.winner === finalMatch.participantA ? finalMatch.participantB : finalMatch.participantA)
        );
        if (loser) {
          loser.finalPosition = currentPosition++;
          positionsAssigned++;
        }
      }

      const thirdPlaceMatch = bracket.thirdPlaceMatch;
      if (thirdPlaceMatch?.winner && thirdPlaceMatch.participantA && thirdPlaceMatch.participantB) {
        const thirdPlace = updatedParticipants.find(p => p.id === thirdPlaceMatch.winner);
        if (thirdPlace) {
          thirdPlace.finalPosition = currentPosition++;
          positionsAssigned++;
        }
        const fourthPlace = updatedParticipants.find(
          p => p.id === (thirdPlaceMatch.winner === thirdPlaceMatch.participantA ? thirdPlaceMatch.participantB : thirdPlaceMatch.participantA)
        );
        if (fourthPlace) {
          fourthPlace.finalPosition = currentPosition++;
          positionsAssigned++;
        }
      }

      for (let i = bracket.rounds.length - 2; i >= 0; i--) {
        const round = bracket.rounds[i];
        if (i === bracket.rounds.length - 2 && thirdPlaceMatch) continue;

        const roundLosers: string[] = [];
        round.matches.forEach((match: any) => {
          if (match.winner && match.participantA && match.participantB) {
            const loserId = match.winner === match.participantA ? match.participantB : match.participantA;
            roundLosers.push(loserId);
          }
        });

        roundLosers.forEach(loserId => {
          const loser = updatedParticipants.find(p => p.id === loserId);
          if (loser && !loser.finalPosition) {
            loser.finalPosition = currentPosition++;
            positionsAssigned++;
          }
        });
      }

      return positionsAssigned;
    };

    const goldBracket = tournament.finalStage.bracket;
    const goldPositionsAssigned = assignBracketPositions(goldBracket, 1);

    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      const silverStartPosition = goldPositionsAssigned + 1;
      assignBracketPositions(tournament.finalStage.silverBracket, silverStartPosition);
    }
  }

  if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStage) {
    let nextPosition = updatedParticipants.filter(p => p.finalPosition).length + 1;

    const groups = Array.isArray(tournament.groupStage.groups)
      ? tournament.groupStage.groups
      : Object.values(tournament.groupStage.groups);

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

    remainingStandings.sort((a, b) => {
      if (b.totalPointsScored !== a.totalPointsScored) {
        return b.totalPointsScored - a.totalPointsScored;
      }
      if (b.total20s !== a.total20s) {
        return b.total20s - a.total20s;
      }
      return b.points - a.points;
    });

    remainingStandings.forEach(standing => {
      const participant = updatedParticipants.find(p => p.id === standing.participantId);
      if (participant) {
        participant.finalPosition = nextPosition++;
      }
    });
  }

  if (tournament.phaseType === 'ONE_PHASE') {
    updatedParticipants.forEach((p, index) => {
      if (!p.finalPosition) {
        p.finalPosition = index + 1;
      }
    });
  }

  return updatedParticipants;
}

/**
 * Calculate final positions from tournament results
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
    const updatedParticipants = calculateFinalPositionsForTournament(tournament);

    return await updateTournamentPublic(tournamentId, {
      participants: updatedParticipants
    });
  } catch (error) {
    console.error('Error calculating final positions:', error);
    return false;
  }
}

/**
 * Apply ranking points to user profiles
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function applyRankingUpdates(tournamentId: string): Promise<boolean> {
  console.log('🏅 applyRankingUpdates called for tournament:', tournamentId);

  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  const rankingEnabled = tournament.rankingConfig?.enabled ?? false;
  console.log('🏅 Tournament rankingConfig:', tournament.rankingConfig, 'enabled:', rankingEnabled);

  // Show loader
  savingParticipantResults.set(true);

  try {
    const { addTournamentRecord } = await import('./userProfile');

    const tier = rankingEnabled ? (tournament.rankingConfig?.tier || 'CLUB') : 'CLUB';
    const totalParticipants = tournament.participants.filter(p => p.status === 'ACTIVE').length;
    const activeParticipants = tournament.participants.filter(p => p.status === 'ACTIVE' && p.finalPosition);

    console.log('🏅 Active participants with finalPosition:', activeParticipants.length);

    for (const participant of activeParticipants) {
      const position = participant.finalPosition || 0;
      // Only calculate ranking points if ranking is enabled, otherwise 0
      const pointsEarned = rankingEnabled ? calculateRankingPoints(position, tier) : 0;
      const rankingBefore = participant.rankingSnapshot || 0;
      const rankingAfter = rankingBefore + pointsEarned;

      const tournamentRecord = {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentDate: tournament.completedAt || Date.now(),
        finalPosition: position,
        totalParticipants,
        rankingBefore: rankingBefore,
        rankingAfter: rankingAfter,
        rankingDelta: pointsEarned
      };

      let userId: string | null = null;

      if (participant.type === 'REGISTERED' && participant.userId) {
        userId = participant.userId;
      } else {
        const result = await getOrCreateUserByName(participant.name);
        if (result) {
          userId = result.userId;
        }
      }

      if (userId) {
        await addTournamentRecord(userId, tournamentRecord, rankingAfter);
      }
    }

    // Only update participant rankings in tournament if ranking is enabled
    if (rankingEnabled) {
      const updatedParticipants = tournament.participants.map(p => {
        if (p.status === 'ACTIVE' && p.finalPosition) {
          const pointsEarned = calculateRankingPoints(p.finalPosition, tier);
          return {
            ...p,
            currentRanking: (p.rankingSnapshot || 0) + pointsEarned
          };
        }
        return p;
      });

      await updateTournamentPublic(tournamentId, {
        participants: updatedParticipants
      });
    }

    return true;
  } catch (error) {
    console.error('Error applying ranking updates:', error);
    return false;
  } finally {
    // Hide loader
    savingParticipantResults.set(false);
  }
}

/**
 * Revert ranking updates for all participants when a tournament is deleted
 *
 * @param tournamentId Tournament ID
 * @returns true if successful
 */
export async function revertTournamentRanking(tournamentId: string): Promise<boolean> {
  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (!tournament.rankingConfig?.enabled) {
    return true;
  }

  if (tournament.status !== 'COMPLETED') {
    return true;
  }

  try {
    for (const participant of tournament.participants) {
      if (participant.status !== 'ACTIVE') continue;

      let userId: string | null = null;

      if (participant.type === 'REGISTERED' && participant.userId) {
        userId = participant.userId;
      } else {
        const result = await getOrCreateUserByName(participant.name);
        if (result && !result.created) {
          userId = result.userId;
        }
      }

      if (userId) {
        await removeTournamentRecord(userId, tournamentId);
      }

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

    return true;
  } catch (error) {
    console.error('Error reverting tournament ranking:', error);
    return false;
  }
}
