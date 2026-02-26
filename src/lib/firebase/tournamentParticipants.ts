/**
 * Tournament participant management
 */

import { getTournament, updateTournament } from './tournaments';
import {
  advanceWinner as advanceWinnerAlgorithm,
  replaceLoserPlaceholder,
  advanceConsolationWinner as advanceConsolationWinnerAlgorithm,
  isLoserPlaceholder,
  isBye
} from '$lib/algorithms/bracket';
import type { TournamentParticipant, Bracket, BracketWithConfig } from '$lib/types/tournament';

/**
 * Add participant to tournament
 *
 * @param tournamentId Tournament ID
 * @param participantData Participant data
 * @returns true if successful
 */
export async function addParticipant(
  tournamentId: string,
  participantData: Partial<TournamentParticipant>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Cannot add participants to tournament that is not in DRAFT status');
    return false;
  }

  // Ranking will be fetched when tournament starts via syncParticipantRankings
  // For now, just use default (0)
  const ranking = 0;

  // Preserve all fields from participantData, only override defaults
  const participant: TournamentParticipant = {
    ...participantData,
    id: participantData.id || `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    type: participantData.type || 'GUEST',
    name: participantData.name || 'Participante',
    rankingSnapshot: ranking,
    status: 'ACTIVE'
  } as TournamentParticipant;

  const updatedParticipants = [...tournament.participants, participant];

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Add multiple participants to tournament in a single operation
 *
 * @param tournamentId Tournament ID
 * @param participantsData Array of participant data
 * @returns true if successful
 */
export async function addParticipants(
  tournamentId: string,
  participantsData: Partial<TournamentParticipant>[]
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Cannot add participants to tournament that is not in DRAFT status');
    return false;
  }

  // Ranking will be fetched when tournament starts via syncParticipantRankings
  // For now, just use default (0)
  const ranking = 0;

  // Create all participant objects, preserving all fields from participantData
  console.log('📥 addParticipants received:', participantsData.map(p => ({
    name: p.name,
    type: p.type,
    userId: p.userId,
    partner: p.partner ? { name: p.partner.name, type: p.partner.type, userId: p.partner.userId } : undefined
  })));

  const newParticipants = participantsData.map((participantData, index) => {
    const participant: TournamentParticipant = {
      ...participantData,
      id: participantData.id || `participant-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
      type: participantData.type || 'GUEST',
      name: participantData.name || 'Participante',
      rankingSnapshot: ranking,
      status: 'ACTIVE'
    } as TournamentParticipant;

    console.log('📤 Created participant:', {
      name: participant.name,
      type: participant.type,
      userId: participant.userId,
      partner: participant.partner ? { name: participant.partner.name, type: participant.partner.type, userId: participant.partner.userId } : undefined
    });

    return participant;
  });

  const updatedParticipants = [...tournament.participants, ...newParticipants];

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Remove participant from tournament
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @returns true if successful
 */
export async function removeParticipant(
  tournamentId: string,
  participantId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Cannot remove participants from tournament that is not in DRAFT status');
    return false;
  }

  const updatedParticipants = tournament.participants.filter(p => p.id !== participantId);

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Update participant
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @param updates Partial participant data
 * @returns true if successful
 */
export async function updateParticipant(
  tournamentId: string,
  participantId: string,
  updates: Partial<TournamentParticipant>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  const updatedParticipants = tournament.participants.map(p => {
    if (p.id === participantId) {
      return { ...p, ...updates };
    }
    return p;
  });

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Withdraw participant from tournament
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @returns true if successful
 */
export async function withdrawParticipant(
  tournamentId: string,
  participantId: string
): Promise<boolean> {
  return await updateParticipant(tournamentId, participantId, {
    status: 'WITHDRAWN',
    withdrawnAt: Date.now()
  });
}

/**
 * Resolve consolation bracket placeholders and cascade walkovers for a disqualified participant.
 *
 * Steps:
 * 1. Replace LOSER: placeholders with actual losers from completed/WO matches in main bracket
 * 2. Mark any consolation match involving the DSQ player as WALKOVER
 * 3. Advance winners from those WALKOVER'd consolation matches (cascade)
 */
function resolveConsolationForDSQ(
  bracket: BracketWithConfig,
  participantId: string
): void {
  if (!bracket.consolationBrackets) return;

  for (let cIdx = 0; cIdx < bracket.consolationBrackets.length; cIdx++) {
    let consolation = bracket.consolationBrackets[cIdx];

    // Step 1: Replace loser placeholders with actual losers from main bracket rounds
    const sourceRoundIndex = consolation.source === 'QF'
      ? bracket.totalRounds - 3
      : bracket.totalRounds - 4;

    if (sourceRoundIndex >= 0 && sourceRoundIndex < bracket.rounds.length) {
      const sourceRound = bracket.rounds[sourceRoundIndex];
      for (let i = 0; i < sourceRound.matches.length; i++) {
        const match = sourceRound.matches[i];
        if ((match.status === 'COMPLETED' || match.status === 'WALKOVER') && match.winner) {
          const loserId = match.participantA === match.winner ? match.participantB : match.participantA;
          const loserSeed = match.participantA === loserId ? match.seedA : match.seedB;
          if (loserId && !isBye(loserId)) {
            const updated = replaceLoserPlaceholder(consolation, consolation.source, i, loserId, loserSeed);
            consolation.rounds = updated.rounds;
          }
        }
      }
    }

    // Step 2: Mark consolation matches involving DSQ player as WALKOVER
    const newlyWalkoverMatchIds: string[] = [];
    for (const round of consolation.rounds) {
      for (const match of round.matches) {
        if (match.status === 'PENDING' &&
            (match.participantA === participantId || match.participantB === participantId)) {
          const opponent = match.participantA === participantId ? match.participantB : match.participantA;
          if (opponent && !isBye(opponent) && !isLoserPlaceholder(opponent)) {
            console.log(`🚫 DSQ consolation cascade: ${match.id} -> ${opponent} wins`);
            match.status = 'WALKOVER';
            match.winner = opponent;
            newlyWalkoverMatchIds.push(match.id);
          }
        }
      }
    }

    // Step 3: Advance winners from newly-WALKOVER'd consolation matches
    for (const woMatchId of newlyWalkoverMatchIds) {
      let woMatch: { winner: string; participantA?: string; participantB?: string } | undefined;
      for (const round of consolation.rounds) {
        const m = round.matches.find(m => m.id === woMatchId);
        if (m && m.winner) {
          woMatch = m;
          break;
        }
      }
      if (woMatch?.winner) {
        const loserId = woMatch.participantA === woMatch.winner ? woMatch.participantB : woMatch.participantA;
        consolation = advanceConsolationWinnerAlgorithm(
          consolation, woMatchId, woMatch.winner, loserId
        );
      }
    }

    bracket.consolationBrackets[cIdx] = consolation;
  }
}

/**
 * Disqualify participant from tournament
 * Also marks all their pending matches as WALKOVER (opponent wins)
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @returns true if successful
 */
export async function disqualifyParticipant(
  tournamentId: string,
  participantId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  // Update participant status
  const updatedParticipants = tournament.participants.map(p => {
    if (p.id === participantId) {
      return { ...p, status: 'DISQUALIFIED' as const, disqualifiedAt: Date.now() };
    }
    return p;
  });

  // Prepare updates object
  const updates: any = { participants: updatedParticipants };

  // Mark pending bracket matches as WALKOVER
  if (tournament.finalStage) {
    const finalStage = { ...tournament.finalStage };

    // Process gold bracket - mark matches as WALKOVER and advance winners
    if (finalStage.goldBracket?.rounds) {
      // Track which matches we mark as WALKOVER in this call
      const newlyWalkoverMatchIds = new Set<string>();

      let updatedGoldBracket: BracketWithConfig = {
        ...finalStage.goldBracket,
        rounds: finalStage.goldBracket.rounds.map(round => ({
          ...round,
          matches: round.matches.map(match => {
            if (match.status === 'PENDING' &&
                (match.participantA === participantId || match.participantB === participantId)) {
              const opponent = match.participantA === participantId ? match.participantB : match.participantA;
              console.log(`🚫 Marking bracket match ${match.id} as WALKOVER - ${opponent} wins`);
              newlyWalkoverMatchIds.add(match.id);
              return {
                ...match,
                status: 'WALKOVER' as const,
                winner: opponent
              };
            }
            return match;
          })
        }))
      };

      // Advance winners for WALKOVER matches (process round by round to handle chain)
      for (const round of updatedGoldBracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'WALKOVER' && match.winner && newlyWalkoverMatchIds.has(match.id)) {
            console.log(`🔄 Advancing winner ${match.winner} from match ${match.id}`);
            // advanceWinnerAlgorithm expects Bracket and returns Bracket, so we extract and restore config
            const bracketOnly: Bracket = {
              rounds: updatedGoldBracket.rounds,
              totalRounds: updatedGoldBracket.totalRounds,
              thirdPlaceMatch: updatedGoldBracket.thirdPlaceMatch
            };
            const advancedBracket = advanceWinnerAlgorithm(bracketOnly, match.id, match.winner);
            updatedGoldBracket = {
              ...advancedBracket,
              config: updatedGoldBracket.config,
              consolationBrackets: updatedGoldBracket.consolationBrackets
            };
          }
        }
      }

      // Process third place match - only mark as WALKOVER if opponent is determined
      if (updatedGoldBracket.thirdPlaceMatch &&
          updatedGoldBracket.thirdPlaceMatch.status === 'PENDING' &&
          (updatedGoldBracket.thirdPlaceMatch.participantA === participantId ||
           updatedGoldBracket.thirdPlaceMatch.participantB === participantId)) {
        const opponent = updatedGoldBracket.thirdPlaceMatch.participantA === participantId
          ? updatedGoldBracket.thirdPlaceMatch.participantB
          : updatedGoldBracket.thirdPlaceMatch.participantA;
        // Only mark as WALKOVER if opponent is determined
        if (opponent) {
          console.log(`🚫 Marking third place match as WALKOVER - ${opponent} wins`);
          updatedGoldBracket.thirdPlaceMatch = {
            ...updatedGoldBracket.thirdPlaceMatch,
            status: 'WALKOVER' as const,
            winner: opponent
          };
        } else {
          console.log(`⏳ Third place match has disqualified participant but opponent not yet determined`);
        }
      }

      // Process consolation brackets: resolve placeholders, mark DSQ matches, advance winners
      resolveConsolationForDSQ(updatedGoldBracket, participantId);

      finalStage.goldBracket = updatedGoldBracket;
    }

    // Process silver bracket - mark matches as WALKOVER and advance winners
    if (finalStage.silverBracket?.rounds) {
      // Track which matches we mark as WALKOVER in this call
      const newlyWalkoverMatchIds = new Set<string>();

      let updatedSilverBracket: BracketWithConfig = {
        ...finalStage.silverBracket,
        rounds: finalStage.silverBracket.rounds.map(round => ({
          ...round,
          matches: round.matches.map(match => {
            if (match.status === 'PENDING' &&
                (match.participantA === participantId || match.participantB === participantId)) {
              const opponent = match.participantA === participantId ? match.participantB : match.participantA;
              console.log(`🚫 Marking silver bracket match ${match.id} as WALKOVER - ${opponent} wins`);
              newlyWalkoverMatchIds.add(match.id);
              return {
                ...match,
                status: 'WALKOVER' as const,
                winner: opponent
              };
            }
            return match;
          })
        }))
      };

      // Advance winners for WALKOVER matches
      for (const round of updatedSilverBracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'WALKOVER' && match.winner && newlyWalkoverMatchIds.has(match.id)) {
            console.log(`🔄 Advancing winner ${match.winner} from silver match ${match.id}`);
            // advanceWinnerAlgorithm expects Bracket and returns Bracket, so we extract and restore config
            const bracketOnly: Bracket = {
              rounds: updatedSilverBracket.rounds,
              totalRounds: updatedSilverBracket.totalRounds,
              thirdPlaceMatch: updatedSilverBracket.thirdPlaceMatch
            };
            const advancedBracket = advanceWinnerAlgorithm(bracketOnly, match.id, match.winner);
            updatedSilverBracket = {
              ...advancedBracket,
              config: updatedSilverBracket.config,
              consolationBrackets: updatedSilverBracket.consolationBrackets
            };
          }
        }
      }

      // Process third place match - only mark as WALKOVER if opponent is determined
      if (updatedSilverBracket.thirdPlaceMatch &&
          updatedSilverBracket.thirdPlaceMatch.status === 'PENDING' &&
          (updatedSilverBracket.thirdPlaceMatch.participantA === participantId ||
           updatedSilverBracket.thirdPlaceMatch.participantB === participantId)) {
        const opponent = updatedSilverBracket.thirdPlaceMatch.participantA === participantId
          ? updatedSilverBracket.thirdPlaceMatch.participantB
          : updatedSilverBracket.thirdPlaceMatch.participantA;
        if (opponent) {
          console.log(`🚫 Marking silver third place match as WALKOVER - ${opponent} wins`);
          updatedSilverBracket.thirdPlaceMatch = {
            ...updatedSilverBracket.thirdPlaceMatch,
            status: 'WALKOVER' as const,
            winner: opponent
          };
        }
      }

      // Process consolation brackets: resolve placeholders, mark DSQ matches, advance winners
      resolveConsolationForDSQ(updatedSilverBracket, participantId);

      finalStage.silverBracket = updatedSilverBracket;
    }

    updates.finalStage = finalStage;
  }

  // Mark pending group stage matches as WALKOVER
  if (tournament.groupStage?.groups) {
    const groupStage = { ...tournament.groupStage };

    groupStage.groups = groupStage.groups.map(group => {
      const updatedGroup = { ...group };

      // Round Robin schedule
      if (updatedGroup.schedule) {
        updatedGroup.schedule = updatedGroup.schedule.map(round => ({
          ...round,
          matches: round.matches.map(match => {
            if (match.status === 'PENDING' &&
                (match.participantA === participantId || match.participantB === participantId)) {
              const opponent = match.participantA === participantId ? match.participantB : match.participantA;
              console.log(`🚫 Marking group match ${match.id} as WALKOVER - ${opponent} wins`);
              return {
                ...match,
                status: 'WALKOVER' as const,
                winner: opponent
              };
            }
            return match;
          })
        }));
      }

      // Swiss pairings
      if (updatedGroup.pairings) {
        updatedGroup.pairings = updatedGroup.pairings.map(pairing => ({
          ...pairing,
          matches: pairing.matches.map(match => {
            if (match.status === 'PENDING' &&
                (match.participantA === participantId || match.participantB === participantId)) {
              const opponent = match.participantA === participantId ? match.participantB : match.participantA;
              console.log(`🚫 Marking Swiss match ${match.id} as WALKOVER - ${opponent} wins`);
              return {
                ...match,
                status: 'WALKOVER' as const,
                winner: opponent
              };
            }
            return match;
          })
        }));
      }

      return updatedGroup;
    });

    updates.groupStage = groupStage;
  }

  return await updateTournament(tournamentId, updates);
}

/**
 * Fix any pending matches that involve disqualified participants
 * This is useful for tournaments where DSQ was applied before the auto-walkover logic existed
 *
 * @param tournamentId Tournament ID
 * @returns true if any matches were fixed
 */
export async function fixDisqualifiedMatches(tournamentId: string): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  // Get all disqualified participant IDs
  const disqualifiedIds = new Set(
    tournament.participants
      .filter(p => p.status === 'DISQUALIFIED')
      .map(p => p.id)
  );

  if (disqualifiedIds.size === 0) {
    console.log('No disqualified participants found');
    return false;
  }

  console.log(`🔧 Fixing matches for ${disqualifiedIds.size} disqualified participants`);

  let hasChanges = false;
  const updates: any = {};

  // Fix bracket matches
  if (tournament.finalStage) {
    const finalStage = { ...tournament.finalStage };

    // Process gold bracket
    if (finalStage.goldBracket?.rounds) {
      let updatedGoldBracket: BracketWithConfig = {
        ...finalStage.goldBracket,
        rounds: finalStage.goldBracket.rounds.map(round => ({
          ...round,
          matches: round.matches.map(match => {
            if (match.status === 'PENDING') {
              const isADisqualified = match.participantA && disqualifiedIds.has(match.participantA);
              const isBDisqualified = match.participantB && disqualifiedIds.has(match.participantB);

              if (isADisqualified && match.participantB && !isBDisqualified) {
                console.log(`🔧 Fixing match ${match.id}: ${match.participantB} wins by DSQ`);
                hasChanges = true;
                return { ...match, status: 'WALKOVER' as const, winner: match.participantB };
              }
              if (isBDisqualified && match.participantA && !isADisqualified) {
                console.log(`🔧 Fixing match ${match.id}: ${match.participantA} wins by DSQ`);
                hasChanges = true;
                return { ...match, status: 'WALKOVER' as const, winner: match.participantA };
              }
            }
            return match;
          })
        }))
      };

      // Advance winners for fixed matches
      for (const round of updatedGoldBracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'WALKOVER' && match.winner) {
            const bracketOnly: Bracket = {
              rounds: updatedGoldBracket.rounds,
              totalRounds: updatedGoldBracket.totalRounds,
              thirdPlaceMatch: updatedGoldBracket.thirdPlaceMatch
            };
            const advancedBracket = advanceWinnerAlgorithm(bracketOnly, match.id, match.winner);
            updatedGoldBracket = {
              ...advancedBracket,
              config: updatedGoldBracket.config,
              consolationBrackets: updatedGoldBracket.consolationBrackets
            };
          }
        }
      }

      // Fix third place match
      if (updatedGoldBracket.thirdPlaceMatch?.status === 'PENDING') {
        const match = updatedGoldBracket.thirdPlaceMatch;
        const isADisqualified = match.participantA && disqualifiedIds.has(match.participantA);
        const isBDisqualified = match.participantB && disqualifiedIds.has(match.participantB);

        if (isADisqualified && match.participantB && !isBDisqualified) {
          console.log(`🔧 Fixing 3rd place match: ${match.participantB} wins by DSQ`);
          hasChanges = true;
          updatedGoldBracket.thirdPlaceMatch = { ...match, status: 'WALKOVER' as const, winner: match.participantB };
        } else if (isBDisqualified && match.participantA && !isADisqualified) {
          console.log(`🔧 Fixing 3rd place match: ${match.participantA} wins by DSQ`);
          hasChanges = true;
          updatedGoldBracket.thirdPlaceMatch = { ...match, status: 'WALKOVER' as const, winner: match.participantA };
        }
      }

      // Fix consolation brackets for each disqualified participant
      for (const dsqId of disqualifiedIds) {
        resolveConsolationForDSQ(updatedGoldBracket, dsqId);
      }

      finalStage.goldBracket = updatedGoldBracket;
    }

    // Process silver bracket (same logic)
    if (finalStage.silverBracket?.rounds) {
      let updatedSilverBracket: BracketWithConfig = {
        ...finalStage.silverBracket,
        rounds: finalStage.silverBracket.rounds.map(round => ({
          ...round,
          matches: round.matches.map(match => {
            if (match.status === 'PENDING') {
              const isADisqualified = match.participantA && disqualifiedIds.has(match.participantA);
              const isBDisqualified = match.participantB && disqualifiedIds.has(match.participantB);

              if (isADisqualified && match.participantB && !isBDisqualified) {
                console.log(`🔧 Fixing silver match ${match.id}: ${match.participantB} wins by DSQ`);
                hasChanges = true;
                return { ...match, status: 'WALKOVER' as const, winner: match.participantB };
              }
              if (isBDisqualified && match.participantA && !isADisqualified) {
                console.log(`🔧 Fixing silver match ${match.id}: ${match.participantA} wins by DSQ`);
                hasChanges = true;
                return { ...match, status: 'WALKOVER' as const, winner: match.participantA };
              }
            }
            return match;
          })
        }))
      };

      // Advance winners
      for (const round of updatedSilverBracket.rounds) {
        for (const match of round.matches) {
          if (match.status === 'WALKOVER' && match.winner) {
            const bracketOnly: Bracket = {
              rounds: updatedSilverBracket.rounds,
              totalRounds: updatedSilverBracket.totalRounds,
              thirdPlaceMatch: updatedSilverBracket.thirdPlaceMatch
            };
            const advancedBracket = advanceWinnerAlgorithm(bracketOnly, match.id, match.winner);
            updatedSilverBracket = {
              ...advancedBracket,
              config: updatedSilverBracket.config,
              consolationBrackets: updatedSilverBracket.consolationBrackets
            };
          }
        }
      }

      // Fix consolation brackets for each disqualified participant
      for (const dsqId of disqualifiedIds) {
        resolveConsolationForDSQ(updatedSilverBracket, dsqId);
      }

      finalStage.silverBracket = updatedSilverBracket;
    }

    if (hasChanges) {
      updates.finalStage = finalStage;
    }
  }

  if (hasChanges) {
    console.log('🔧 Saving fixed matches...');
    return await updateTournament(tournamentId, updates);
  }

  console.log('No matches needed fixing');
  return false;
}
