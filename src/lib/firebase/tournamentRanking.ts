/**
 * Tournament ranking points calculation and application
 */

import { isFirebaseEnabled } from './config';
import { getTournament, updateTournament, updateTournamentPublic } from './tournaments';
import { calculateRankingPoints, distributeRankingPoints } from '$lib/algorithms/ranking';
import { calculateFsiWinnerPoints } from '$lib/algorithms/rankingFsi';
import { calculateConsolationPositions } from '$lib/algorithms/bracket';
import { browser } from '$app/environment';
import { getUserProfileById, removeTournamentRecord } from './userProfile';
import { recalculateUserRanking } from './rankings';
import type { TournamentInfo } from './rankings';
import { savingParticipantResults } from '$lib/stores/tournament';
import type { ConsolationBracket } from '$lib/types/tournament';
import { getParticipantDisplayName, normalizeTier } from '$lib/types/tournament';

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

    // 1. Fetch all participant AND partner profiles to get their tournament records
    const allUserIds = new Set<string>();
    for (const p of tournament.participants) {
      if (p.userId) allUserIds.add(p.userId);
      if (p.partner?.userId) allUserIds.add(p.partner.userId);
    }
    const profileEntries = await Promise.all(
      Array.from(allUserIds).map(async (uid) => {
        const profile = await getUserProfileById(uid);
        return [uid, profile] as const;
      })
    );
    const profileMap = new Map(profileEntries.filter(([, p]) => p !== null));

    // 2. Collect unique tournament IDs from all participants' records
    // Include both current and previous year to support ranking fallback for seeding
    const previousYear = currentYear - 1;
    const tournamentIds = new Set<string>();
    for (const [, profile] of profileMap) {
      if (!profile?.tournaments) continue;
      for (const record of profile.tournaments) {
        const recordYear = new Date(record.tournamentDate).getFullYear();
        if (recordYear === currentYear || recordYear === previousYear) {
          tournamentIds.add(record.tournamentId);
        }
      }
    }

    // 3. Fetch tournament docs to get tier + gameType for recalculation
    const tournamentsMap = new Map<string, TournamentInfo>();
    if (tournamentIds.size > 0) {
      const tournamentDocs = await Promise.all(
        Array.from(tournamentIds).map(id => getTournament(id))
      );
      for (const t of tournamentDocs) {
        if (t) {
          tournamentsMap.set(t.id, {
            id: t.id,
            tier: t.rankingConfig?.tier,
            gameType: t.gameType || 'singles',
            country: t.country || '',
            completedAt: t.completedAt || 0
          });
        }
      }
    }

    // 4. Recalculate ranking for each participant (and partner) using current algorithm
    // If current year ranking is 0, fall back to previous year for seeding purposes
    const updatedParticipants = tournament.participants.map((participant) => {
      let rankingPoints = 0;

      if (participant.userId) {
        const profile = profileMap.get(participant.userId);
        if (profile?.tournaments) {
          rankingPoints = recalculateUserRanking(profile.tournaments, tournamentsMap, currentYear, 2);
          // Fallback: use previous year ranking for seeding when current year has no points
          if (rankingPoints === 0) {
            rankingPoints = recalculateUserRanking(profile.tournaments, tournamentsMap, previousYear, 2);
          }
        }
      }

      // Also calculate partner ranking for doubles
      let updatedPartner = participant.partner;
      if (participant.partner?.userId) {
        let partnerRanking = 0;
        const partnerProfile = profileMap.get(participant.partner.userId);
        if (partnerProfile?.tournaments) {
          partnerRanking = recalculateUserRanking(partnerProfile.tournaments, tournamentsMap, currentYear, 2);
          // Fallback: use previous year ranking for seeding when current year has no points
          if (partnerRanking === 0) {
            partnerRanking = recalculateUserRanking(partnerProfile.tournaments, tournamentsMap, previousYear, 2);
          }
        }
        updatedPartner = { ...participant.partner, rankingSnapshot: partnerRanking };
      }

      return {
        ...participant,
        rankingSnapshot: rankingPoints,
        ...(updatedPartner ? { partner: updatedPartner } : {})
      };
    });

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
/**
 * Map a bracket round index to its `ConsolationSource` name.
 * Mirrors the offsets used by `getLosersWithPositions` /
 * `generateConsolationBracketStructure` (QF=3, R16=4, R32=5, R64=6 from the
 * end). Returns `null` for the final / semifinal / unsupported sizes.
 */
function getConsolationSourceForRound(roundIdx: number, totalRounds: number): 'QF' | 'R16' | 'R32' | 'R64' | null {
  const offset = totalRounds - roundIdx;
  if (offset === 3) return 'QF';
  if (offset === 4) return 'R16';
  if (offset === 5) return 'R32';
  if (offset === 6) return 'R64';
  return null;
}

/**
 * Sum total points scored by a participant across the WHOLE tournament:
 * group-stage matches + bracket main rounds + 3rd-place + consolation.
 * Used to break ties WITHIN a tied display range so the better-performing
 * player still earns more ranking points.
 */
function getTotalTournamentPoints(tournament: any, participantId: string): number {
  let total = 0;
  const addFromMatch = (m: any) => {
    if (!m) return;
    if (m.participantA === participantId) total += m.totalPointsA ?? 0;
    if (m.participantB === participantId) total += m.totalPointsB ?? 0;
  };
  if (tournament.groupStage?.groups) {
    for (const g of tournament.groupStage.groups) {
      const rounds = g.schedule || g.pairings || [];
      for (const r of rounds) for (const m of r.matches || []) addFromMatch(m);
    }
  }
  for (const bracket of [tournament.finalStage?.goldBracket, tournament.finalStage?.silverBracket, tournament.finalStage?.bracket]) {
    if (!bracket) continue;
    for (const r of bracket.rounds || []) for (const m of r.matches || []) addFromMatch(m);
    addFromMatch(bracket.thirdPlaceMatch);
    if (bracket.consolationBrackets) {
      for (const c of bracket.consolationBrackets) {
        for (const r of c.rounds || []) for (const m of r.matches || []) addFromMatch(m);
      }
    }
  }
  return total;
}

/**
 * Mark groups of round losers that DIDN'T get concrete positions from a
 * complete consolation bracket as a tied DISPLAY range:
 *   - QF losers without QF-consolation     → display "5–8"
 *   - R16 losers without R16-consolation   → display "9–16"
 *   - Semifinal losers without 3rd-place   → display "3–4"
 *
 * Within each tied group, `finalPosition` is REORDERED DESC by total
 * tournament points so the best-performing tied loser keeps the lowest
 * (best) numeric position internally — ranking-points calculation
 * differentiates performance even though the display shows a tied range.
 */
function markTiedRoundLosers(
  bracket: any,
  updatedParticipants: any[],
  tournament: any,
  isActiveParticipant: (p: any) => boolean
): void {
  if (!bracket?.rounds || bracket.rounds.length < 2) return;
  const totalRounds = bracket.rounds.length;

  const coveredSources = new Set<string>(
    (bracket.consolationBrackets || [])
      .filter((c: any) => c.isComplete)
      .map((c: any) => c.source)
  );
  const has3rdPlaceMatch =
    bracket.thirdPlaceMatch?.winner != null
    && bracket.thirdPlaceMatch.participantA
    && bracket.thirdPlaceMatch.participantB;

  for (let roundIdx = totalRounds - 2; roundIdx >= 0; roundIdx--) {
    const round = bracket.rounds[roundIdx];
    if (!round?.matches) continue;

    const isSemi = roundIdx === totalRounds - 2;
    if (isSemi && has3rdPlaceMatch) continue;
    if (!isSemi) {
      const source = getConsolationSourceForRound(roundIdx, totalRounds);
      if (source && coveredSources.has(source)) continue;
    }

    const loserIds: string[] = [];
    for (const m of round.matches) {
      if (m.winner && m.participantA && m.participantB
          && m.participantA !== 'BYE' && m.participantB !== 'BYE') {
        const loserId = m.winner === m.participantA ? m.participantB : m.participantA;
        loserIds.push(loserId);
      }
    }
    if (loserIds.length < 2) continue;

    const groupParticipants = loserIds
      .map(id => updatedParticipants.find(p => p.id === id))
      .filter(p => p && p.finalPosition !== undefined && isActiveParticipant(p));
    if (groupParticipants.length < 2) continue;

    const positions = groupParticipants
      .map(p => p!.finalPosition!)
      .sort((a, b) => a - b);
    const minPos = positions[0];
    const maxPos = positions[positions.length - 1];
    if (minPos === maxPos) continue;

    // Sort group DESC by total tournament points so the best-performing
    // tied loser gets the lowest (best) numeric position internally and
    // therefore the most ranking points. All tied participants still
    // share the same Start/End so the display label reads identically.
    groupParticipants.sort(
      (a, b) => getTotalTournamentPoints(tournament, b!.id) - getTotalTournamentPoints(tournament, a!.id)
    );
    groupParticipants.forEach((p, idx) => {
      p!.finalPosition = minPos + idx;
      p!.finalPositionStart = minPos;
      p!.finalPositionEnd = maxPos;
    });
  }
}

export function calculateFinalPositionsForTournament(tournament: any): any[] {
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

  if (tournament.phaseType === 'TWO_PHASE' || tournament.phaseType === 'GROUP_ONLY') {
    tournament.groupStage?.groups.forEach((group: any) => {
      group.standings.forEach((standing: any) => {
        const participant = updatedParticipants.find(p => p.id === standing.participantId);
        if (participant && !participant.finalPosition && isActiveParticipant(participant)) {
          participant.finalPosition = standing.position;
        }
      });
    });
  }

  if (tournament.finalStage && (tournament.finalStage.isComplete || tournament.status === 'FINAL_STAGE' || tournament.status === 'COMPLETED')) {
    const isSplitDivisions = tournament.finalStage.mode === 'SPLIT_DIVISIONS';

    // Diagnostic: Silver bracket state
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      const sb = tournament.finalStage.silverBracket;
      const sfr = sb.rounds?.[sb.rounds.length - 1];
      const sfm = sfr?.matches?.[0];
    }

    const clearBracketParticipantPositions = (bracket: any) => {
      if (!bracket || !bracket.rounds) return;
      const clear = (id: string | undefined) => {
        if (!id) return;
        const p = updatedParticipants.find(x => x.id === id);
        if (p) {
          p.finalPosition = undefined;
          p.finalPositionStart = undefined;
          p.finalPositionEnd = undefined;
        }
      };
      bracket.rounds.forEach((round: any) => {
        round.matches.forEach((match: any) => {
          clear(match.participantA);
          clear(match.participantB);
        });
      });
      if (bracket.thirdPlaceMatch) {
        clear(bracket.thirdPlaceMatch.participantA);
        clear(bracket.thirdPlaceMatch.participantB);
      }
    };

    // Use goldBracket for SPLIT_DIVISIONS mode, otherwise fallback to bracket for legacy data
    const goldBracketRef = tournament.finalStage.goldBracket || tournament.finalStage.bracket;
    clearBracketParticipantPositions(goldBracketRef);
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      clearBracketParticipantPositions(tournament.finalStage.silverBracket);
    }

    const assignBracketPositions = (bracket: any, startPosition: number): number => {

      if (!bracket || !bracket.rounds || bracket.rounds.length === 0) {
        return 0;
      }

      let positionsAssigned = 0;
      let currentPosition = startPosition;

      // Process final match (1st and 2nd place)
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      const finalMatch = finalRound?.matches[0];

      if (finalMatch?.winner && finalMatch.participantA && finalMatch.participantB) {
        // Validate winner is actually one of the two participants
        const isValidWinner = finalMatch.winner === finalMatch.participantA || finalMatch.winner === finalMatch.participantB;
        if (!isValidWinner) {
          console.warn(`🏅 ⚠️ Final match winner ${finalMatch.winner} is NOT participantA (${finalMatch.participantA}) or participantB (${finalMatch.participantB})! Using participantA/B to determine 1st/2nd.`);
        }

        const winnerId = isValidWinner ? finalMatch.winner : finalMatch.participantA;
        const loserId = winnerId === finalMatch.participantA ? finalMatch.participantB : finalMatch.participantA;

        const winner = updatedParticipants.find(p => p.id === winnerId);
        if (winner && isActiveParticipant(winner)) {
          winner.finalPosition = currentPosition++;
          positionsAssigned++;
        }
        const loser = updatedParticipants.find(p => p.id === loserId);
        if (loser && isActiveParticipant(loser)) {
          loser.finalPosition = currentPosition++;
          positionsAssigned++;
        }
      }

      // Process 3rd place match
      const thirdPlaceMatch = bracket.thirdPlaceMatch;
      let thirdPlaceProcessed = false;

      if (thirdPlaceMatch?.winner && thirdPlaceMatch.participantA && thirdPlaceMatch.participantB) {
        // Validate winner is actually one of the two participants
        const isValid3rdWinner = thirdPlaceMatch.winner === thirdPlaceMatch.participantA || thirdPlaceMatch.winner === thirdPlaceMatch.participantB;
        if (!isValid3rdWinner) {
          console.warn(`🏅 ⚠️ 3rd place match winner ${thirdPlaceMatch.winner} is NOT a participant of this match!`);
        }

        const thirdWinnerId = isValid3rdWinner ? thirdPlaceMatch.winner : thirdPlaceMatch.participantA;
        const fourthPlaceId = thirdWinnerId === thirdPlaceMatch.participantA ? thirdPlaceMatch.participantB : thirdPlaceMatch.participantA;

        const thirdPlace = updatedParticipants.find(p => p.id === thirdWinnerId);
        if (thirdPlace && !thirdPlace.finalPosition && isActiveParticipant(thirdPlace)) {
          thirdPlace.finalPosition = currentPosition++;
          positionsAssigned++;
        } else if (thirdPlace?.finalPosition) {
          currentPosition++;
          positionsAssigned++;
        }
        const fourthPlace = updatedParticipants.find(p => p.id === fourthPlaceId);
        if (fourthPlace && !fourthPlace.finalPosition && isActiveParticipant(fourthPlace)) {
          fourthPlace.finalPosition = currentPosition++;
          positionsAssigned++;
        } else if (fourthPlace?.finalPosition) {
          currentPosition++;
          positionsAssigned++;
        }
        thirdPlaceProcessed = true;
      }

      // Process remaining rounds (for larger brackets with more than 4 participants)
      for (let i = bracket.rounds.length - 2; i >= 0; i--) {
        const round = bracket.rounds[i];
        // Only skip semifinal round if third place match was successfully processed
        if (i === bracket.rounds.length - 2 && thirdPlaceProcessed) {
          continue;
        }

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
          }
        });
      }

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
        return;
      }


      for (const consolation of bracket.consolationBrackets as ConsolationBracket[]) {
        if (!consolation.isComplete) {
          // Auto-fix: if all matches are done but isComplete wasn't persisted, fix it
          const allMatchesDone = consolation.rounds.every((round: any) =>
            round.matches.every((m: any) => m.status === 'COMPLETED' || m.status === 'WALKOVER')
          );
          if (allMatchesDone) {
            consolation.isComplete = true;
          } else {
            continue;
          }
        }

        const positions = calculateConsolationPositions(consolation);

        positions.forEach((position, participantId) => {
          const participant = updatedParticipants.find(p => p.id === participantId);
          if (participant && isActiveParticipant(participant)) {
            const adjustedPosition = position + positionOffset;
            // Guard: don't overwrite positions from final/3rd-place matches
            // Only overwrite positions that are within this consolation's range or higher
            const thresholdPosition = consolation.startPosition + positionOffset;
            if (!participant.finalPosition || participant.finalPosition >= thresholdPosition) {
              participant.finalPosition = adjustedPosition;
            }
          }
        });
      }
    };

    // Process gold bracket consolation (positions 5-8, 9-16)
    processConsolationBrackets(goldBracket, 0);

    // Process silver bracket consolation (offset by gold bracket size)
    // For new data (global seeds), consolation startPosition already includes offset → pass 0
    // For old data (local seeds), consolation startPosition is local → pass goldPositionsAssigned
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      const silverBkt = tournament.finalStage.silverBracket;
      const silverFirstSeed = silverBkt?.rounds?.[0]?.matches?.[0]?.seedA || silverBkt?.rounds?.[0]?.matches?.[0]?.seedB || 0;
      const silverConsoOffset = silverFirstSeed > 1 ? 0 : goldPositionsAssigned;
      processConsolationBrackets(silverBkt, silverConsoOffset);
    }

    // ── Tied-position display ───────────────────────────────────────────
    // After main + consolation processing, mark groups of round losers that
    // didn't get concrete positioning (i.e. no consolation covers them and
    // no 3rd-place match for semis) as tied ranges, e.g. "5–8" for the 4 QF
    // losers of an 8-player bracket without consolation. Internal
    // `finalPosition` is REORDERED within the range by total tournament
    // points so ranking-points still differentiate performance.
    markTiedRoundLosers(goldBracket, updatedParticipants, tournament, isActiveParticipant);
    if (isSplitDivisions && tournament.finalStage.silverBracket) {
      markTiedRoundLosers(tournament.finalStage.silverBracket, updatedParticipants, tournament, isActiveParticipant);
    }
  }

  // For TWO_PHASE tournaments with a final stage, only bracket participants get finalPosition and ranking points
  // Participants who didn't qualify for the bracket do NOT get ranking points
  // Clear finalPosition for non-bracket participants (they were set from group standings earlier)
  if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStage && tournament.finalStage) {

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


    // Clear finalPosition for participants NOT in the bracket
    // They should not receive ranking points
    let clearedCount = 0;
    updatedParticipants.forEach(p => {
      if (!bracketParticipantIds.has(p.id)) {
        if (p.finalPosition !== undefined) {
          clearedCount++;
        }
        p.finalPosition = undefined;
      }
    });

    // Log final positions after cleanup
    const positionedParticipants = updatedParticipants.filter(p => p.finalPosition !== undefined);
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

  // --- Validation: detect and fix position gaps/duplicates ---
  const positioned = updatedParticipants.filter((p: any) => p.finalPosition && isActiveParticipant(p));
  if (positioned.length > 0) {
    const positionMap = new Map<number, any[]>();
    positioned.forEach((p: any) => {
      const pos = p.finalPosition;
      if (!positionMap.has(pos)) positionMap.set(pos, []);
      positionMap.get(pos)!.push(p);
    });

    // Check for duplicates
    const duplicates = Array.from(positionMap.entries()).filter(([_, players]) => players.length > 1);
    if (duplicates.length > 0) {
      duplicates.forEach(([pos, players]) => {
      });

      // Fix: re-assign positions sequentially to eliminate gaps and duplicates
      positioned.sort((a: any, b: any) => a.finalPosition - b.finalPosition);
      positioned.forEach((p: any, idx: number) => {
        const newPos = idx + 1;
        if (p.finalPosition !== newPos) {
          p.finalPosition = newPos;
        }
      });
    }

    // Check for gaps (positions should be 1 to N)
    const maxPos = Math.max(...positioned.map((p: any) => p.finalPosition));
    if (maxPos > positioned.length) {
      // Fix: compact positions
      positioned.sort((a: any, b: any) => a.finalPosition - b.finalPosition);
      positioned.forEach((p: any, idx: number) => {
        const newPos = idx + 1;
        if (p.finalPosition !== newPos) {
          p.finalPosition = newPos;
        }
      });
    }
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

  // If ranking is disabled, skip all processing
  if (!rankingEnabled) {
    return true;
  }

  // Show loader
  savingParticipantResults.set(true);

  try {
    const { addTournamentRecord } = await import('./userProfile');

    const tier = normalizeTier(tournament.rankingConfig?.tier);
    const scoringSystem = tournament.rankingConfig?.scoringSystem ?? 'CLASSIC';

    // Treat missing status as ACTIVE for backward compatibility with legacy data
    const totalParticipants = tournament.participants.filter((p: any) => p.status === 'ACTIVE' || !p.status).length;
    const activeParticipants = tournament.participants.filter((p: any) => (p.status === 'ACTIVE' || !p.status) && p.finalPosition);


    const isDoubles = tournament.gameType === 'doubles';

    // For FSI: compute winner points once from the full active field; reuse per participant
    const fsiWinnerPoints = scoringSystem === 'FSI'
      ? calculateFsiWinnerPoints(
          activeParticipants.map((p: any) => ({ rankingSnapshot: p.rankingSnapshot || 0 })),
          tier
        )
      : 0;

    for (const participant of activeParticipants) {
      const position = participant.finalPosition || 0;
      const pointsEarned = scoringSystem === 'FSI'
        ? distributeRankingPoints(position, fsiWinnerPoints, totalParticipants, tournament.gameType)
        : calculateRankingPoints(position, tier, totalParticipants, tournament.gameType);
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

      // DOUBLES: Process both members of the pair with their OWN ranking values
      if (isDoubles && participant.partner) {

        // Member 1: Process if has userId (REGISTERED or persistent GUEST)
        if (participant.userId) {
          await addTournamentRecord(participant.userId, tournamentRecord, rankingAfter);
        }

        // Member 2: Build separate record with partner's own ranking
        if (participant.partner.userId) {
          const partnerRankingBefore = participant.partner.rankingSnapshot || 0;
          const partnerRankingAfter = partnerRankingBefore + pointsEarned;
          const partnerRecord = {
            ...tournamentRecord,
            rankingBefore: partnerRankingBefore,
            rankingAfter: partnerRankingAfter,
          };
          await addTournamentRecord(participant.partner.userId, partnerRecord, partnerRankingAfter);
        }
      } else {
        // SINGLES: Process if has userId (REGISTERED or persistent GUEST)
        if (participant.userId) {
          await addTournamentRecord(participant.userId, tournamentRecord, rankingAfter);
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
