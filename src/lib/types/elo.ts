/**
 * ELO rating system types
 */

/**
 * ELO calculation input
 */
export interface EloInput {
  participantId: string;
  initialElo: number;
  expectedPosition: number;
  actualPosition: number;
  kFactor: number;
  maxDelta: number;
  isDoubles: boolean;
  partnerElo?: number;
}

/**
 * ELO calculation result
 */
export interface EloResult {
  participantId: string;
  initialElo: number;
  delta: number;
  finalElo: number;
}

/**
 * ELO update for user profile
 */
export interface EloUpdate {
  userId: string;
  oldElo: number;
  newElo: number;
  delta: number;
  tournamentId: string;
  tournamentName: string;
  updatedAt: number;
}

/**
 * ELO history entry
 */
export interface EloHistory {
  tournamentId: string;
  tournamentName: string;
  date: number;
  position: number;
  expectedPosition: number;
  eloBefore: number;
  eloAfter: number;
  delta: number;
}
