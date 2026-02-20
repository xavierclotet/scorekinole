/**
 * Tournament ranking points calculation and application
 */

import { isFirebaseEnabled } from './config';
import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
import { calculateRankingPoints } from '$lib/algorithms/ranking';
import { calculateConsolationPositions } from '$lib/algorithms/bracket';
import { browser } from '$app/environment';
import { getUserProfileById, removeTournamentRecord } from './userProfile';
import { calculateUserRanking } from './rankings';
import { savingParticipantResults } from '$lib/stores/tournament';
import type { ConsolationBracket } from '$lib/types/tournament';
import { getParticipantDisplayName } from '$lib/types/tournament';

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
    const currentYear = new Date().getFullYear();
    const updatedParticipants = await Promise.all(
      tournament.participants.map(async (participant) => {
        let rankingPoints = 0;

        // Both REGISTERED and GUEST participants can have ranking history in /users
        // GUEST participants with a userId (persistent identity) also accumulate ranking points
        if (participant.userId) {
          const profile = await getUserProfileById(participant.userId);
          if (profile?.tournaments) {
            // Calculate Best-of-2 ranking points from tournament history
            rankingPoints = calculateUserRanking(profile.tournaments, currentYear, 2);
          }
        }

        return {
          ...participant,
          rankingSnapshot: rankingPoints
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
 * IMPORTANT: Disqualified participants are excluded from final positions.
 * They don't earn ranking points and don't occupy positions in the final classification.
 *
 * @param tournament Tournament object
 * @returns Updated participants array with finalPosition set
 */
export function calculateFinalPositionsForTournament(tournament: any): any[] {
  console.log('🏅 calculateFinalPositionsForTournament called');
  console.log('🏅 Tournament:', { id: tournament.id, status: tournament.status, phaseType: tournament.phaseType });
  console.log('🏅 Has finalStage:', !!tournament.finalStage, 'isComplete:', tournament.finalStage?.isComplete);

  // Ensure all participants have status field (legacy data migration)
  const updatedParticipants = tournament.participants.map((p: any) => ({
    ...p,
    status: p.status || 'ACTIVE' // Default to ACTIVE if not set
  }));
  const isDoubles = tournament.gameType === 'doubles';

  // Helper to get display name for logs (handles doubles with teamName)
  const getDisplayName = (p: any) => getParticipantDisplayName(p, isDoubles);

  // Helper to check if participant is active (not disqualified)
  // Disqualified participants should NOT receive finalPosition or ranking points
  const isActiveParticipant = (p: any) => p && p.status !== 'DISQUALIFIED';

  if (tournament.phaseType === 'TWO_PHASE') {
    console.log('🏅 TWO_PHASE: assigning initial positions from group standings');
    tournament.groupStage?.groups.forEach((group: any) => {
      group.standings.forEach((standing: any) => {
        const participant = updatedParticipants.find(p => p.id === standing.participantId);
        if (participant && !participant.finalPosition) {
          participant.finalPosition = standing.position;
        }
      });
    });
  }

  if (tournament.finalStage && (tournament.finalStage.isComplete || tournament.status === 'FINAL_STAGE' || tournament.status === 'COMPLETED')) {
    console.log('🏅 Processing finalStage bracket positions');
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';
    console.log('🏅 isSplitDivisions:', isSplitDivisions);

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

    // Use goldBracket for SPLIT_DIVISIONS mode, otherwise fallback to bracket for legacy data
    const goldBracketRef = tournament.finalStage.goldBracket || tournament.finalStage.bracket;
    clearBracketParticipantPositions(goldBracketRef);
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      clearBracketParticipantPositions(tournament.finalStage.silverBracket);
    }

    const assignBracketPositions = (bracket: any, startPosition: number): number => {
      console.log('🏅 assignBracketPositions called, startPosition:', startPosition);
      console.log('🏅 Bracket rounds:', bracket?.rounds?.length, 'thirdPlaceMatch:', !!bracket?.thirdPlaceMatch);

      if (!bracket || !bracket.rounds || bracket.rounds.length === 0) {
        console.log('🏅 No bracket or rounds, returning 0');
        return 0;
      }

      let positionsAssigned = 0;
      let currentPosition = startPosition;

      // Process final match (1st and 2nd place)
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const finalMatch = finalRound?.matches[0];
      console.log('🏅 Final match:', { winner: finalMatch?.winner, participantA: finalMatch?.participantA, participantB: finalMatch?.participantB });

      if (finalMatch?.winner && finalMatch.participantA && finalMatch.participantB) {
        const winner = updatedParticipants.find(p => p.id === finalMatch.winner);
        if (winner && isActiveParticipant(winner)) {
          winner.finalPosition = currentPosition++;
          positionsAssigned++;
          console.log(`🏅 1st place: ${getDisplayName(winner)} -> position ${winner.finalPosition}`);
        } else if (winner) {
          console.log(`🏅 1st place ${getDisplayName(winner)} is DISQUALIFIED, skipping`);
        }
        const loserId = finalMatch.winner === finalMatch.participantA ? finalMatch.participantB : finalMatch.participantA;
        const loser = updatedParticipants.find(p => p.id === loserId);
        if (loser && isActiveParticipant(loser)) {
          loser.finalPosition = currentPosition++;
          positionsAssigned++;
          console.log(`🏅 2nd place: ${getDisplayName(loser)} -> position ${loser.finalPosition}`);
        } else if (loser) {
          console.log(`🏅 2nd place ${getDisplayName(loser)} is DISQUALIFIED, skipping`);
        }
      } else {
        console.log('🏅 Final match not complete or missing participants');
      }

      // Process 3rd place match
      const thirdPlaceMatch = bracket.thirdPlaceMatch;
      let thirdPlaceProcessed = false;
      console.log('🏅 Third place match:', { winner: thirdPlaceMatch?.winner, participantA: thirdPlaceMatch?.participantA, participantB: thirdPlaceMatch?.participantB });

      if (thirdPlaceMatch?.winner && thirdPlaceMatch.participantA && thirdPlaceMatch.participantB) {
        const thirdPlace = updatedParticipants.find(p => p.id === thirdPlaceMatch.winner);
        if (thirdPlace && isActiveParticipant(thirdPlace)) {
          thirdPlace.finalPosition = currentPosition++;
          positionsAssigned++;
          console.log(`🏅 3rd place: ${getDisplayName(thirdPlace)} -> position ${thirdPlace.finalPosition}`);
        } else if (thirdPlace) {
          console.log(`🏅 3rd place ${getDisplayName(thirdPlace)} is DISQUALIFIED, skipping`);
        }
        const fourthPlaceId = thirdPlaceMatch.winner === thirdPlaceMatch.participantA ? thirdPlaceMatch.participantB : thirdPlaceMatch.participantA;
        const fourthPlace = updatedParticipants.find(p => p.id === fourthPlaceId);
        if (fourthPlace && isActiveParticipant(fourthPlace)) {
          fourthPlace.finalPosition = currentPosition++;
          positionsAssigned++;
          console.log(`🏅 4th place: ${getDisplayName(fourthPlace)} -> position ${fourthPlace.finalPosition}`);
        } else if (fourthPlace) {
          console.log(`🏅 4th place ${getDisplayName(fourthPlace)} is DISQUALIFIED, skipping`);
        }
        thirdPlaceProcessed = true;
      } else {
        console.log('🏅 Third place match not complete or missing participants');
      }

      // Process remaining rounds (for larger brackets with more than 4 participants)
      console.log('🏅 Processing remaining rounds, thirdPlaceProcessed:', thirdPlaceProcessed);
      for (let i = bracket.rounds.length - 2; i >= 0; i--) {
        const round = bracket.rounds[i];
        // Only skip semifinal round if third place match was successfully processed
        if (i === bracket.rounds.length - 2 && thirdPlaceProcessed) {
          console.log(`🏅 Skipping round ${i} (semifinal) because 3rd place match was processed`);
          continue;
        }

        console.log(`🏅 Processing round ${i} with ${round.matches.length} matches`);
        const roundLosers: string[] = [];
        round.matches.forEach((match: any) => {
          if (match.winner && match.participantA && match.participantB) {
            const loserId = match.winner === match.participantA ? match.participantB : match.participantA;
            roundLosers.push(loserId);
          }
        });

        roundLosers.forEach(loserId => {
          const loser = updatedParticipants.find(p => p.id === loserId);
          if (loser && !loser.finalPosition && isActiveParticipant(loser)) {
            loser.finalPosition = currentPosition++;
            positionsAssigned++;
            console.log(`🏅 Round ${i} loser: ${getDisplayName(loser)} -> position ${loser.finalPosition}`);
          } else if (loser && !loser.finalPosition) {
            console.log(`🏅 Round ${i} loser ${getDisplayName(loser)} is DISQUALIFIED, skipping`);
          }
        });
      }

      console.log('🏅 Total positions assigned:', positionsAssigned);
      return positionsAssigned;
    };

    // Use goldBracket for SPLIT_DIVISIONS mode, otherwise fallback to bracket for legacy data
    const goldBracket = tournament.finalStage.goldBracket || tournament.finalStage.bracket;
    const goldPositionsAssigned = assignBracketPositions(goldBracket, 1);

    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      const silverStartPosition = goldPositionsAssigned + 1;
      assignBracketPositions(tournament.finalStage.silverBracket, silverStartPosition);
    }

    // Process consolation brackets for positions 5-8 and 9-16
    const processConsolationBrackets = (bracket: any, positionOffset: number = 0) => {
      if (!bracket?.consolationBrackets || bracket.consolationBrackets.length === 0) {
        console.log('🏅 No consolation brackets to process');
        return;
      }

      console.log(`🏅 Processing ${bracket.consolationBrackets.length} consolation bracket(s)`);

      for (const consolation of bracket.consolationBrackets as ConsolationBracket[]) {
        if (!consolation.isComplete) {
          console.log(`🏅 Consolation bracket ${consolation.source} not complete, skipping`);
          continue;
        }

        const positions = calculateConsolationPositions(consolation);
        console.log(`🏅 Consolation ${consolation.source} positions:`, Array.from(positions.entries()));

        positions.forEach((position, participantId) => {
          const participant = updatedParticipants.find(p => p.id === participantId);
          if (participant && isActiveParticipant(participant)) {
            const adjustedPosition = position + positionOffset;
            participant.finalPosition = adjustedPosition;
            console.log(`🏅 Consolation position: ${getDisplayName(participant)} -> ${adjustedPosition}`);
          } else if (participant) {
            console.log(`🏅 Consolation ${getDisplayName(participant)} is DISQUALIFIED, skipping`);
          }
        });
      }
    };

    // Process gold bracket consolation (positions 5-8, 9-16)
    processConsolationBrackets(goldBracket, 0);

    // Process silver bracket consolation (offset by gold bracket size)
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      processConsolationBrackets(tournament.finalStage.silverBracket, goldPositionsAssigned);
    }
  }

  // For TWO_PHASE tournaments with a final stage, only bracket participants get finalPosition and ranking points
  // Participants who didn't qualify for the bracket do NOT get ranking points
  // Clear finalPosition for non-bracket participants (they were set from group standings earlier)
  if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStage && tournament.finalStage) {
    console.log('🏅 TWO_PHASE cleanup: clearing non-bracket participants');

    // Collect all participant IDs that are in the bracket (excluding BYE)
    const bracketParticipantIds = new Set<string>();

    const collectBracketParticipants = (bracket: any) => {
      if (!bracket || !bracket.rounds) return;
      bracket.rounds.forEach((round: any) => {
        round.matches.forEach((match: any) => {
          if (match.participantA && match.participantA !== 'BYE') bracketParticipantIds.add(match.participantA);
          if (match.participantB && match.participantB !== 'BYE') bracketParticipantIds.add(match.participantB);
        });
      });
      if (bracket.thirdPlaceMatch) {
        if (bracket.thirdPlaceMatch.participantA && bracket.thirdPlaceMatch.participantA !== 'BYE') {
          bracketParticipantIds.add(bracket.thirdPlaceMatch.participantA);
        }
        if (bracket.thirdPlaceMatch.participantB && bracket.thirdPlaceMatch.participantB !== 'BYE') {
          bracketParticipantIds.add(bracket.thirdPlaceMatch.participantB);
        }
      }
      // Also collect from consolation brackets
      if (bracket.consolationBrackets) {
        for (const consolation of bracket.consolationBrackets as ConsolationBracket[]) {
          consolation.rounds.forEach((round: any) => {
            round.matches.forEach((match: any) => {
              if (match.participantA && match.participantA !== 'BYE') bracketParticipantIds.add(match.participantA);
              if (match.participantB && match.participantB !== 'BYE') bracketParticipantIds.add(match.participantB);
            });
          });
        }
      }
    };

    // Use goldBracket for SPLIT_DIVISIONS mode, otherwise fallback to bracket for legacy data
    const goldBracketForCleanup = tournament.finalStage.goldBracket || tournament.finalStage.bracket;
    if (goldBracketForCleanup) {
      collectBracketParticipants(goldBracketForCleanup);
    }
    if (tournament.finalStage.silverBracket) {
      collectBracketParticipants(tournament.finalStage.silverBracket);
    }

    console.log('🏅 Bracket participant IDs:', Array.from(bracketParticipantIds));

    // Clear finalPosition for participants NOT in the bracket
    // They should not receive ranking points
    let clearedCount = 0;
    updatedParticipants.forEach(p => {
      if (!bracketParticipantIds.has(p.id)) {
        if (p.finalPosition !== undefined) {
          console.log(`🏅 Clearing finalPosition for non-bracket participant: ${getDisplayName(p)} (was ${p.finalPosition})`);
          clearedCount++;
        }
        p.finalPosition = undefined;
      }
    });
    console.log(`🏅 Cleared ${clearedCount} non-bracket participants`);

    // Log final positions after cleanup
    const positionedParticipants = updatedParticipants.filter(p => p.finalPosition !== undefined);
    console.log('🏅 Participants with finalPosition after cleanup:', positionedParticipants.map(p => ({ name: getDisplayName(p), pos: p.finalPosition })));
  }

  // For ONE_PHASE tournaments, only bracket participants get finalPosition
  // Non-bracket participants do NOT get ranking points
  if (tournament.phaseType === 'ONE_PHASE') {
    // Collect all participant IDs that are in the bracket (excluding BYE)
    const bracketParticipantIds = new Set<string>();

    const collectBracketParticipants = (bracket: any) => {
      if (!bracket || !bracket.rounds) return;
      bracket.rounds.forEach((round: any) => {
        round.matches.forEach((match: any) => {
          if (match.participantA && match.participantA !== 'BYE') bracketParticipantIds.add(match.participantA);
          if (match.participantB && match.participantB !== 'BYE') bracketParticipantIds.add(match.participantB);
        });
      });
      if (bracket.thirdPlaceMatch) {
        if (bracket.thirdPlaceMatch.participantA && bracket.thirdPlaceMatch.participantA !== 'BYE') {
          bracketParticipantIds.add(bracket.thirdPlaceMatch.participantA);
        }
        if (bracket.thirdPlaceMatch.participantB && bracket.thirdPlaceMatch.participantB !== 'BYE') {
          bracketParticipantIds.add(bracket.thirdPlaceMatch.participantB);
        }
      }
      // Also collect from consolation brackets
      if (bracket.consolationBrackets) {
        for (const consolation of bracket.consolationBrackets as ConsolationBracket[]) {
          consolation.rounds.forEach((round: any) => {
            round.matches.forEach((match: any) => {
              if (match.participantA && match.participantA !== 'BYE') bracketParticipantIds.add(match.participantA);
              if (match.participantB && match.participantB !== 'BYE') bracketParticipantIds.add(match.participantB);
            });
          });
        }
      }
    };

    // Use goldBracket for SPLIT_DIVISIONS mode, otherwise fallback to bracket for legacy data
    const goldBracketForOnePhase = tournament.finalStage?.goldBracket || tournament.finalStage?.bracket;
    if (goldBracketForOnePhase) {
      collectBracketParticipants(goldBracketForOnePhase);
    }
    if (tournament.finalStage?.silverBracket) {
      collectBracketParticipants(tournament.finalStage.silverBracket);
    }

    // Only assign positions to participants who are NOT already positioned
    // AND who are in the bracket (they didn't get positioned by assignBracketPositions)
    // This handles participants eliminated in early rounds of the bracket
    let nextBracketPosition = updatedParticipants.filter(p => p.finalPosition).length + 1;

    updatedParticipants.forEach(p => {
      // Only assign position if:
      // 1. They don't have a position yet
      // 2. They ARE in the bracket (participated in at least one match)
      // 3. They are NOT disqualified
      if (!p.finalPosition && bracketParticipantIds.has(p.id) && isActiveParticipant(p)) {
        p.finalPosition = nextBracketPosition++;
      }
    });

    // Participants not in bracket remain without finalPosition (no ranking points)
  }

  return updatedParticipants;
}

/**
 * Calculate final positions from tournament results
 *
 * @param tournamentId Tournament ID
 * @returns Updated tournament object with finalPosition set, or null if failed
 */
export async function calculateFinalPositions(tournamentId: string): Promise<any | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return null;
  }

  try {
    const updatedParticipants = calculateFinalPositionsForTournament(tournament);

    const result = await updateTournamentPublic(tournamentId, {
      participants: updatedParticipants
    });

    if (!result) {
      console.error('Failed to save final positions');
      return null;
    }

    // Return the updated tournament object to avoid Firestore read consistency issues
    return {
      ...tournament,
      participants: updatedParticipants
    };
  } catch (error) {
    console.error('Error calculating final positions:', error);
    return null;
  }
}

/**
 * Apply ranking points to user profiles
 *
 * @param tournamentId Tournament ID
 * @param preloadedTournament Optional pre-loaded tournament to avoid Firestore read consistency issues
 * @returns true if successful
 */
export async function applyRankingUpdates(
  tournamentId: string,
  preloadedTournament?: any
): Promise<boolean> {
  console.log('🏅 applyRankingUpdates called for tournament:', tournamentId);

  if (!browser || !isFirebaseEnabled()) {
    console.warn('Firebase disabled');
    return false;
  }

  // Use preloaded tournament if provided, otherwise fetch from Firestore
  let tournament = preloadedTournament;
  if (!tournament) {
    tournament = await getTournament(tournamentId);
  }

  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  const rankingEnabled = tournament.rankingConfig?.enabled ?? false;
  console.log('🏅 Tournament rankingConfig:', tournament.rankingConfig, 'enabled:', rankingEnabled);

  // If ranking is disabled, skip all processing
  if (!rankingEnabled) {
    console.log('🏅 Ranking disabled - skipping participant ranking updates');
    return true;
  }

  // Show loader
  savingParticipantResults.set(true);

  try {
    const { addTournamentRecord } = await import('./userProfile');

    const tier = tournament.rankingConfig?.tier || 'CLUB';

    // Treat missing status as ACTIVE for backward compatibility with legacy data
    const totalParticipants = tournament.participants.filter((p: any) => p.status === 'ACTIVE' || !p.status).length;
    const activeParticipants = tournament.participants.filter((p: any) => (p.status === 'ACTIVE' || !p.status) && p.finalPosition);

    console.log('🏅 Active participants with finalPosition:', activeParticipants.length, 'total ACTIVE:', totalParticipants, 'tier:', tier);

    const isDoubles = tournament.gameType === 'doubles';

    for (const participant of activeParticipants) {
      const position = participant.finalPosition || 0;
      const pointsEarned = calculateRankingPoints(position, tier, totalParticipants, tournament.gameType);
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

      // DOUBLES: Process both members of the pair (all participants with userId)
      // Both REGISTERED and GUEST participants with userId get entries in /users
      if (isDoubles && participant.partner) {
        console.log(`🏅 Processing doubles: ${participant.name} / ${participant.partner.name}`);

        // Member 1: Process if has userId (REGISTERED or persistent GUEST)
        if (participant.userId) {
          await addTournamentRecord(participant.userId, tournamentRecord, rankingAfter);
          console.log(`🏅 Added record for member 1: ${participant.name} (+${pointsEarned} points)`);
        }

        // Member 2: Process if has userId (REGISTERED or persistent GUEST)
        if (participant.partner.userId) {
          await addTournamentRecord(participant.partner.userId, tournamentRecord, rankingAfter);
          console.log(`🏅 Added record for member 2: ${participant.partner.name} (+${pointsEarned} points)`);
        }
      } else {
        // SINGLES: Process if has userId (REGISTERED or persistent GUEST)
        if (participant.userId) {
          await addTournamentRecord(participant.userId, tournamentRecord, rankingAfter);
          console.log(`🏅 Added record for: ${participant.name} (+${pointsEarned} points)`);
        }
      }
    }

    // Note: Points earned can be calculated anytime with calculateRankingPoints(finalPosition, tier)
    // No need to store currentRanking - it's redundant

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
      // Treat missing status as ACTIVE for backward compatibility
      if (participant.status && participant.status !== 'ACTIVE') continue;

      // Remove record for any participant with userId (REGISTERED or persistent GUEST)
      if (participant.userId) {
        await removeTournamentRecord(participant.userId, tournamentId);
      }

      if (tournament.gameType === 'doubles' && participant.partner) {
        if (participant.partner.userId) {
          await removeTournamentRecord(participant.partner.userId, tournamentId);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error reverting tournament ranking:', error);
    return false;
  }
}
