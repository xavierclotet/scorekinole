/**
 * Tournament transition logic
 * Handle qualification and bracket preview
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { getTournament } from './tournaments';
import type { TournamentParticipant } from '$lib/types/tournament';

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
 * Update qualified participants for a group
 *
 * @param tournamentId Tournament ID
 * @param groupIndex Group index
 * @param qualifiedParticipantIds Array of participant IDs to qualify
 * @returns true if successful
 */
export async function updateQualifiers(
  tournamentId: string,
  groupIndex: number,
  qualifiedParticipantIds: string[]
): Promise<boolean> {
  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament || !tournament.groupStage) {
      console.error('Tournament or group stage not found');
      return false;
    }

    const group = tournament.groupStage.groups[groupIndex];
    if (!group) {
      console.error('Group not found');
      return false;
    }

    // Update standings with qualification status
    const updatedStandings = group.standings.map(standing => ({
      ...standing,
      qualifiedForFinal: qualifiedParticipantIds.includes(standing.participantId)
    }));

    // Update in-memory
    tournament.groupStage.groups[groupIndex].standings = updatedStandings;

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

    return true;
  } catch (error) {
    console.error('Error updating qualifiers:', error);
    return false;
  }
}

/**
 * Auto-select top N qualifiers from each group
 *
 * @param tournamentId Tournament ID
 * @param qualifiersPerGroup Number of qualifiers per group
 * @returns true if successful
 */
export async function autoSelectQualifiers(
  tournamentId: string,
  qualifiersPerGroup: number
): Promise<boolean> {
  try {
    const tournament = await getTournament(tournamentId);
    if (!tournament || !tournament.groupStage) {
      console.error('Tournament or group stage not found');
      return false;
    }

    if (!db) {
      console.error('Firestore not initialized');
      return false;
    }

    // Update each group
    for (let gi = 0; gi < tournament.groupStage.groups.length; gi++) {
      const group = tournament.groupStage.groups[gi];

      // Sort standings by position and take top N
      const topN = group.standings
        .sort((a, b) => a.position - b.position)
        .slice(0, qualifiersPerGroup)
        .map(s => s.participantId);

      // Update standings in-memory
      tournament.groupStage.groups[gi].standings = group.standings.map(standing => ({
        ...standing,
        qualifiedForFinal: topN.includes(standing.participantId)
      }));
    }

    // Clean undefined values before writing to Firestore
    const cleanedGroupStage = cleanUndefined(tournament.groupStage);

    // Write entire groupStage back to Firestore to preserve array structure
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      groupStage: cleanedGroupStage
    });

    return true;
  } catch (error) {
    console.error('Error auto-selecting qualifiers:', error);
    return false;
  }
}

/**
 * Get all qualified participants with their seeds
 *
 * @param tournamentId Tournament ID
 * @returns Array of qualified participants with seed info
 */
export async function getQualifiedParticipants(
  tournamentId: string
): Promise<Array<{ participant: TournamentParticipant; seed: number; groupName: string; position: number }>> {
  const tournament = await getTournament(tournamentId);
  if (!tournament || !tournament.groupStage) {
    return [];
  }

  const qualified: Array<{ participant: TournamentParticipant; seed: number; groupName: string; position: number }> = [];

  // Collect all qualified participants from all groups
  for (const group of tournament.groupStage.groups) {
    const qualifiedStandings = group.standings
      .filter(s => s.qualifiedForFinal)
      .sort((a, b) => a.position - b.position);

    qualifiedStandings.forEach(standing => {
      const participant = tournament.participants.find(p => p.id === standing.participantId);
      if (participant) {
        qualified.push({
          participant,
          seed: qualified.length + 1,
          groupName: group.name,
          position: standing.position
        });
      }
    });
  }

  return qualified;
}

/**
 * Calculate suggested number of qualifiers based on total participants
 *
 * The goal is to have a fair bracket that uses power of 2 participants.
 * Logic:
 * - Find the largest power of 2 that is <= half of total participants
 * - But ensure at least 4 qualify (for semifinals) if possible
 *
 * Examples:
 * - 8 participants → 4 qualifiers (semifinals)
 * - 10-15 participants → 8 qualifiers (quarterfinals)
 * - 16-31 participants → 8 qualifiers (quarterfinals)
 * - 32+ participants → 16 qualifiers
 * - 6 participants → 4 qualifiers
 * - 4-5 participants → 4 qualifiers (all or almost all qualify)
 *
 * @param totalParticipants Total number of participants in the tournament
 * @param numGroups Number of groups (to calculate per-group suggestion)
 * @returns Object with total suggested qualifiers and per-group suggestion
 */
export function calculateSuggestedQualifiers(
  totalParticipants: number,
  numGroups: number = 1
): { total: number; perGroup: number } {
  if (totalParticipants < 4) {
    // Very small tournament - all qualify
    const validSize = totalParticipants >= 2 ? (totalParticipants <= 2 ? 2 : 4) : 2;
    return { total: validSize, perGroup: Math.ceil(validSize / numGroups) };
  }

  // Target: around half the participants, but must be power of 2
  const halfParticipants = Math.floor(totalParticipants / 2);

  // Find the largest power of 2 that is <= halfParticipants
  // But ensure minimum of 4 (semifinals)
  let suggested = 4; // Minimum: semifinals

  // Powers of 2: 4, 8, 16, 32
  const powersOf2 = [4, 8, 16, 32];

  for (const power of powersOf2) {
    if (power <= halfParticipants) {
      suggested = power;
    } else {
      break;
    }
  }

  // Special case: if we have exactly power of 2 participants,
  // we might want half of them
  if (totalParticipants === 8) suggested = 4;
  if (totalParticipants === 16) suggested = 8;
  if (totalParticipants === 32) suggested = 16;

  // Ensure suggested doesn't exceed total participants
  if (suggested > totalParticipants) {
    // Find the largest valid power of 2 <= total
    suggested = powersOf2.filter(p => p <= totalParticipants).pop() || 2;
  }

  // Calculate per group
  const perGroup = Math.ceil(suggested / numGroups);

  return { total: suggested, perGroup };
}

/**
 * Validate that number of qualifiers is valid for bracket
 * Now supports any number >= 2 (uses BYEs for non-power-of-2 counts)
 *
 * @param numQualifiers Total number of qualifiers
 * @returns true if valid (any number >= 2)
 */
export function isValidBracketSize(numQualifiers: number): boolean {
  return numQualifiers >= 2;
}

/**
 * Get bracket round names based on number of participants
 *
 * @param numParticipants Number of participants in bracket
 * @returns Array of round names
 */
export function getBracketRoundNames(numParticipants: number): string[] {
  const rounds: string[] = [];
  let currentSize = numParticipants;

  while (currentSize >= 2) {
    if (currentSize === 2) {
      rounds.push('finals');
    } else if (currentSize === 4) {
      rounds.push('semifinals');
    } else if (currentSize === 8) {
      rounds.push('quarterfinals');
    } else if (currentSize === 16) {
      rounds.push('round16');
    } else if (currentSize === 32) {
      rounds.push('round32');
    } else {
      rounds.push(`round${currentSize}`);
    }
    currentSize = currentSize / 2;
  }

  return rounds;
}
