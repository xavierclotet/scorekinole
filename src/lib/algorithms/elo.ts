/**
 * ELO rating calculation algorithm
 * Based on position-based ranking system
 */

import type { EloConfig, TournamentParticipant } from '$lib/types/tournament';
import type { EloInput, EloResult } from '$lib/types/elo';

/**
 * Calculate expected positions based on initial ELO
 *
 * Higher ELO = Lower position number (1st, 2nd, 3rd...)
 *
 * @param participants Tournament participants with ELO snapshots
 * @returns Map of participant ID to expected position
 */
export function calculateExpectedPositions(
  participants: TournamentParticipant[]
): Map<string, number> {
  // Sort by ELO snapshot (descending)
  const sorted = [...participants].sort((a, b) => b.eloSnapshot - a.eloSnapshot);

  const expectedPositions = new Map<string, number>();

  // Handle ties in ELO (same ELO = average of positions)
  let currentPosition = 1;

  for (let i = 0; i < sorted.length; i++) {
    const participant = sorted[i];

    // Check for tied ELOs
    const tiedGroup = [participant];
    let j = i + 1;

    while (j < sorted.length && sorted[j].eloSnapshot === participant.eloSnapshot) {
      tiedGroup.push(sorted[j]);
      j++;
    }

    if (tiedGroup.length > 1) {
      // Average position for tied participants
      const avgPosition =
        (currentPosition + (currentPosition + tiedGroup.length - 1)) / 2;

      tiedGroup.forEach(p => {
        expectedPositions.set(p.id, avgPosition);
      });

      currentPosition += tiedGroup.length;
      i = j - 1; // Skip already processed tied participants
    } else {
      expectedPositions.set(participant.id, currentPosition);
      currentPosition++;
    }
  }

  return expectedPositions;
}

/**
 * Calculate ELO delta for a participant
 *
 * Formula: (expectedPosition - actualPosition) × kFactor
 * Capped at ±maxDelta
 *
 * @param expectedPosition Expected rank (1 = best)
 * @param actualPosition Actual final rank
 * @param config ELO configuration
 * @returns ELO delta (positive = gain, negative = loss)
 */
export function calculateEloDelta(
  expectedPosition: number,
  actualPosition: number,
  config: EloConfig
): number {
  // Adjust kFactor if first tournament
  const kFactor = config.isFirstTournament ? config.kFactor * 0.75 : config.kFactor;

  // Calculate raw delta
  let delta = (expectedPosition - actualPosition) * kFactor;

  // Apply cap
  if (delta > config.maxDelta) {
    delta = config.maxDelta;
  } else if (delta < -config.maxDelta) {
    delta = -config.maxDelta;
  }

  return Math.round(delta);
}

/**
 * Calculate ELO delta for doubles
 *
 * For doubles:
 * 1. Calculate pair average ELO
 * 2. Calculate delta based on pair ELO
 * 3. Divide delta by 2 for each player
 *
 * @param participant1Elo First player's ELO
 * @param participant2Elo Second player's ELO
 * @param expectedPosition Expected rank of the pair
 * @param actualPosition Actual final rank of the pair
 * @param config ELO configuration
 * @returns ELO delta for each player (same value for both)
 */
export function calculateDoublesEloDelta(
  participant1Elo: number,
  participant2Elo: number,
  expectedPosition: number,
  actualPosition: number,
  config: EloConfig
): number {
  // Calculate pair average ELO
  const pairAverageElo = (participant1Elo + participant2Elo) / 2;

  // Calculate delta as if it's a singles player with pair average ELO
  const fullDelta = calculateEloDelta(expectedPosition, actualPosition, config);

  // Divide by 2 for each player
  return Math.round(fullDelta / 2);
}

/**
 * Calculate ELO for all participants
 *
 * @param participants Participants with final positions
 * @param config ELO configuration
 * @returns Array of ELO results
 */
export function calculateAllEloDeltas(
  participants: TournamentParticipant[],
  config: EloConfig
): EloResult[] {
  if (!config.enabled) {
    return [];
  }

  const expectedPositions = calculateExpectedPositions(participants);
  const results: EloResult[] = [];

  for (const participant of participants) {
    if (!participant.finalPosition) {
      continue; // Skip if no final position
    }

    const expectedPosition = expectedPositions.get(participant.id) || 0;
    const actualPosition = participant.finalPosition;

    let delta: number;

    if (participant.partner) {
      // Doubles: find partner and calculate
      const partner = participants.find(
        p => p.id === participant.partner?.userId || p.name === participant.partner?.name
      );

      if (partner) {
        delta = calculateDoublesEloDelta(
          participant.eloSnapshot,
          partner.eloSnapshot,
          expectedPosition,
          actualPosition,
          config
        );
      } else {
        // Partner not found, use singles calculation
        delta = calculateEloDelta(expectedPosition, actualPosition, config);
      }
    } else {
      // Singles
      delta = calculateEloDelta(expectedPosition, actualPosition, config);
    }

    const finalElo = participant.eloSnapshot + delta;

    results.push({
      participantId: participant.id,
      initialElo: participant.eloSnapshot,
      delta,
      finalElo
    });
  }

  return results;
}

/**
 * Get ELO from input
 *
 * Utility function to calculate ELO from raw input
 *
 * @param input ELO calculation input
 * @returns ELO result
 */
export function calculateEloFromInput(input: EloInput): EloResult {
  const config: EloConfig = {
    enabled: true,
    initialElo: input.initialElo,
    kFactor: input.kFactor,
    maxDelta: input.maxDelta,
    isFirstTournament: false
  };

  let delta: number;

  if (input.isDoubles && input.partnerElo !== undefined) {
    delta = calculateDoublesEloDelta(
      input.initialElo,
      input.partnerElo,
      input.expectedPosition,
      input.actualPosition,
      config
    );
  } else {
    delta = calculateEloDelta(input.expectedPosition, input.actualPosition, config);
  }

  return {
    participantId: input.participantId,
    initialElo: input.initialElo,
    delta,
    finalElo: input.initialElo + delta
  };
}

/**
 * Validate ELO configuration
 *
 * @param config ELO configuration
 * @returns true if valid
 */
export function validateEloConfig(config: EloConfig): boolean {
  if (!config.enabled) return true;

  if (config.initialElo < 0 || config.initialElo > 3000) return false;
  if (config.kFactor <= 0 || config.kFactor > 100) return false;
  if (config.maxDelta <= 0 || config.maxDelta > 200) return false;

  return true;
}
