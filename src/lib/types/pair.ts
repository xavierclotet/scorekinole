/**
 * Pair types for doubles tournaments
 *
 * Pairs are stored in a separate `/pairs` collection in Firebase.
 * The pairId is deterministic: pair_{sortedUserId1}_{sortedUserId2}
 * This allows automatic detection of existing pairs.
 */

import type { Timestamp } from 'firebase/firestore';

/**
 * Tournament record for a pair (history of tournaments played together)
 */
export interface PairTournamentRecord {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: number;        // Timestamp
  finalPosition: number;
  totalParticipants: number;
  rankingDelta: number;          // Points earned (for potential Best-of-N calculation)
}

/**
 * Pair entity - represents two players who play doubles together
 */
export interface Pair {
  id: string;                    // Deterministic: pair_{sortedUserId1}_{sortedUserId2}
  teamName?: string;             // Optional artistic name (e.g., "Los Invencibles")

  // Members (sorted alphabetically by userId)
  member1UserId: string;         // First member userId (or name if GUEST)
  member2UserId: string;         // Second member userId (or name if GUEST)
  member1Name: string;           // Cached display name
  member2Name: string;           // Cached display name

  // Member types (for knowing if they're registered or guest)
  member1Type: 'REGISTERED' | 'GUEST';
  member2Type: 'REGISTERED' | 'GUEST';

  // Tournament history (no ranking field - calculated dynamically with Best-of-N)
  tournaments?: PairTournamentRecord[];

  // Metadata
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/**
 * Generate deterministic pair ID from two user identifiers
 * Uses sorted order to ensure same pair always gets same ID
 *
 * @param id1 - First user's ID (userId for REGISTERED, name for GUEST)
 * @param id2 - Second user's ID (userId for REGISTERED, name for GUEST)
 * @returns Deterministic pair ID
 */
export function generatePairId(id1: string, id2: string): string {
  const sorted = [id1, id2].sort();
  return `pair_${sorted[0]}_${sorted[1]}`;
}

/**
 * Member info for creating/updating pairs
 */
export interface PairMember {
  type: 'REGISTERED' | 'GUEST';
  userId?: string;               // Only for REGISTERED
  name: string;
}

/**
 * Get the identifier used for pair ID generation
 */
export function getMemberIdentifier(member: PairMember): string {
  return member.type === 'REGISTERED' && member.userId
    ? member.userId
    : member.name;
}
