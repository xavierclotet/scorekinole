/**
 * Defensive input validation for tournament match result writes.
 *
 * Firestore rules allow any authenticated user to submit scoring updates
 * (the scorer is whoever holds the device). These caps catch client bugs,
 * typos, and naïve tampering attempts that would corrupt standings before
 * the payload is committed. The social trust model (participants see bad
 * scores and flag them) remains the ultimate integrity guarantee.
 */

export const MATCH_RESULT_LIMITS = {
  MAX_GAMES_WON: 10,            // Allows up to best-of-19 series
  MAX_TOTAL_POINTS: 5000,       // Generous ceiling for multi-game matches
  MAX_TOTAL_20S: 500,
  MAX_ROUNDS_PER_MATCH: 50,     // Anti-abuse: no legitimate match has >50 rounds
  MAX_ROUND_POINTS: 250,        // Singles w/12 discs: theoretical max ~240
  MAX_ROUND_20S: 12,            // Singles w/12 discs: all could land as 20s
  MAX_VIDEO_URL_LEN: 500,
  MAX_VIDEO_ID_LEN: 100,
} as const;

export interface MatchRoundInput {
  gameNumber: number;
  roundInGame: number;
  pointsA: number | null;
  pointsB: number | null;
  twentiesA: number;
  twentiesB: number;
  hammer?: string | null;
}

export interface MatchResultInput {
  gamesWonA?: number;
  gamesWonB?: number;
  totalPointsA?: number;
  totalPointsB?: number;
  total20sA?: number;
  total20sB?: number;
  videoUrl?: string;
  videoId?: string;
  rounds?: MatchRoundInput[];
}

export type ValidationResult = { valid: true } | { valid: false; error: string };

function isNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * Validates a tournament match result payload. Returns a discriminated union;
 * caller decides how to surface errors. Does not throw.
 *
 * Null/undefined optional fields are accepted. `rounds[].pointsA/pointsB` may
 * be null (in-progress round). Numeric fields must be non-negative integers
 * within their respective caps.
 */
export function validateMatchResult(result: MatchResultInput): ValidationResult {
  const L = MATCH_RESULT_LIMITS;

  const scalarChecks: Array<[string, number | undefined, number]> = [
    ['gamesWonA', result.gamesWonA, L.MAX_GAMES_WON],
    ['gamesWonB', result.gamesWonB, L.MAX_GAMES_WON],
    ['totalPointsA', result.totalPointsA, L.MAX_TOTAL_POINTS],
    ['totalPointsB', result.totalPointsB, L.MAX_TOTAL_POINTS],
    ['total20sA', result.total20sA, L.MAX_TOTAL_20S],
    ['total20sB', result.total20sB, L.MAX_TOTAL_20S],
  ];

  for (const [field, value, max] of scalarChecks) {
    if (value === undefined) continue;
    if (!isNonNegativeInt(value)) {
      return { valid: false, error: `${field} must be a non-negative integer` };
    }
    if (value > max) {
      return { valid: false, error: `${field} exceeds maximum ${max}` };
    }
  }

  if (result.rounds !== undefined) {
    if (!Array.isArray(result.rounds)) {
      return { valid: false, error: 'rounds must be an array' };
    }
    if (result.rounds.length > L.MAX_ROUNDS_PER_MATCH) {
      return {
        valid: false,
        error: `rounds array exceeds maximum ${L.MAX_ROUNDS_PER_MATCH} entries`
      };
    }

    for (let i = 0; i < result.rounds.length; i++) {
      const r = result.rounds[i];
      if (r === null || typeof r !== 'object') {
        return { valid: false, error: `rounds[${i}] must be an object` };
      }

      if (!isNonNegativeInt(r.gameNumber)) {
        return { valid: false, error: `rounds[${i}].gameNumber must be a non-negative integer` };
      }
      if (!isNonNegativeInt(r.roundInGame)) {
        return { valid: false, error: `rounds[${i}].roundInGame must be a non-negative integer` };
      }

      for (const field of ['pointsA', 'pointsB'] as const) {
        const v = r[field];
        if (v === null) continue;
        if (!isNonNegativeInt(v)) {
          return { valid: false, error: `rounds[${i}].${field} must be a non-negative integer or null` };
        }
        if (v > L.MAX_ROUND_POINTS) {
          return { valid: false, error: `rounds[${i}].${field} exceeds maximum ${L.MAX_ROUND_POINTS}` };
        }
      }

      for (const field of ['twentiesA', 'twentiesB'] as const) {
        const v = r[field];
        if (!isNonNegativeInt(v)) {
          return { valid: false, error: `rounds[${i}].${field} must be a non-negative integer` };
        }
        if (v > L.MAX_ROUND_20S) {
          return { valid: false, error: `rounds[${i}].${field} exceeds maximum ${L.MAX_ROUND_20S}` };
        }
      }
    }
  }

  if (result.videoUrl !== undefined && result.videoUrl !== null) {
    if (typeof result.videoUrl !== 'string') {
      return { valid: false, error: 'videoUrl must be a string' };
    }
    if (result.videoUrl.length > L.MAX_VIDEO_URL_LEN) {
      return { valid: false, error: `videoUrl exceeds ${L.MAX_VIDEO_URL_LEN} characters` };
    }
  }

  if (result.videoId !== undefined && result.videoId !== null) {
    if (typeof result.videoId !== 'string') {
      return { valid: false, error: 'videoId must be a string' };
    }
    if (result.videoId.length > L.MAX_VIDEO_ID_LEN) {
      return { valid: false, error: `videoId exceeds ${L.MAX_VIDEO_ID_LEN} characters` };
    }
  }

  return { valid: true };
}
