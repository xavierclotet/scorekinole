/** Per-year SINGLES tournament counters. All metrics derive from these. */
export interface CounterBlock {
  matches: number;          matchesWon: number;
  games: number;
  rounds: number;           roundsWon: number;
  twenties: number;         roundsWithTwenty: number;   perfectRounds: number;
  hammerRounds: number;     hammerTwenties: number;     hammerRoundsWon: number;
  nonHammerRounds: number;  nonHammerTwenties: number;  nonHammerRoundsWon: number;
  koMatches: number;        koMatchesWon: number;       koRounds: number;   koTwenties: number;
  groupMatches: number;     groupMatchesWon: number;    groupRounds: number; groupTwenties: number;
  finalsPlayed: number;     finalsWon: number;
  marginSum: number;        marginWins: number;
}

export function emptyBlock(): CounterBlock {
  return {
    matches: 0, matchesWon: 0,
    games: 0,
    rounds: 0, roundsWon: 0,
    twenties: 0, roundsWithTwenty: 0, perfectRounds: 0,
    hammerRounds: 0, hammerTwenties: 0, hammerRoundsWon: 0,
    nonHammerRounds: 0, nonHammerTwenties: 0, nonHammerRoundsWon: 0,
    koMatches: 0, koMatchesWon: 0, koRounds: 0, koTwenties: 0,
    groupMatches: 0, groupMatchesWon: 0, groupRounds: 0, groupTwenties: 0,
    finalsPlayed: 0, finalsWon: 0,
    marginSum: 0, marginWins: 0,
  };
}

/** Add every numeric field of `src` into `target` (mutates target). */
export function addBlock(target: CounterBlock, src: CounterBlock): void {
  (Object.keys(target) as (keyof CounterBlock)[]).forEach((k) => {
    target[k] += src[k];
  });
}

export type MatchPhase = 'group' | 'ko' | 'final';

export interface RawRound {
  gameNumber: number;
  roundInGame: number;
  pointsA: number | null;
  pointsB: number | null;
  twentiesA: number;
  twentiesB: number;
  hammer?: string | null;   // participant id who had the hammer
}

export interface RawMatch {
  participantA?: string;
  participantB?: string;
  winner?: string;
  totalPointsA?: number;
  totalPointsB?: number;
  rounds?: RawRound[];
}

/** Per-match record candidates, surfaced to the caller for max() tracking. */
export interface MatchRecordCtx {
  maxTwentiesInRound: number;
  maxTwentiesInGame: number;
}

/**
 * Accumulate one SINGLES match into `block` from `meId`'s perspective.
 * Round-level counters are added only when `match.rounds` is present.
 * Returns the match's record candidates (0 when no round detail).
 */
export function accumulateMatch(
  block: CounterBlock,
  match: RawMatch,
  meId: string,
  phase: MatchPhase
): MatchRecordCtx {
  const isA = match.participantA === meId;
  const won = !!match.winner && match.winner === meId;

  // Match-level counters (apply even without round detail).
  block.matches += 1;
  if (won) block.matchesWon += 1;
  if (phase === 'group') { block.groupMatches += 1; if (won) block.groupMatchesWon += 1; }
  else { block.koMatches += 1; if (won) block.koMatchesWon += 1; }
  if (phase === 'final') { block.finalsPlayed += 1; if (won) block.finalsWon += 1; }

  if (won) {
    const mine = (isA ? match.totalPointsA : match.totalPointsB) ?? 0;
    const opp = (isA ? match.totalPointsB : match.totalPointsA) ?? 0;
    block.marginSum += mine - opp;
    block.marginWins += 1;
  }

  const ctx: MatchRecordCtx = { maxTwentiesInRound: 0, maxTwentiesInGame: 0 };
  const rounds = match.rounds;
  if (!rounds || rounds.length === 0) return ctx;

  const games = new Set<number>();
  const twentiesByGame = new Map<number, number>();

  for (const r of rounds) {
    games.add(r.gameNumber);
    const myTwenties = isA ? r.twentiesA : r.twentiesB;
    const myPoints = (isA ? r.pointsA : r.pointsB) ?? 0;
    const oppPoints = (isA ? r.pointsB : r.pointsA) ?? 0;
    const hadHammer = !!r.hammer && r.hammer === meId;
    const oppHadHammer = !!r.hammer && r.hammer !== meId;

    block.rounds += 1;
    block.twenties += myTwenties;
    if (myPoints > oppPoints) block.roundsWon += 1;
    if (myTwenties > 0) block.roundsWithTwenty += 1;
    if (myTwenties === 8) block.perfectRounds += 1;   // singles: 8 discs = perfect

    if (hadHammer) {
      block.hammerRounds += 1;
      block.hammerTwenties += myTwenties;
      if (myPoints > oppPoints) block.hammerRoundsWon += 1;
    } else if (oppHadHammer) {
      block.nonHammerRounds += 1;
      block.nonHammerTwenties += myTwenties;
      if (myPoints > oppPoints) block.nonHammerRoundsWon += 1;
    }

    if (phase === 'group') { block.groupRounds += 1; block.groupTwenties += myTwenties; }
    else { block.koRounds += 1; block.koTwenties += myTwenties; }

    if (myTwenties > ctx.maxTwentiesInRound) ctx.maxTwentiesInRound = myTwenties;
    twentiesByGame.set(r.gameNumber, (twentiesByGame.get(r.gameNumber) ?? 0) + myTwenties);
  }

  block.games += games.size;
  for (const total of twentiesByGame.values()) {
    if (total > ctx.maxTwentiesInGame) ctx.maxTwentiesInGame = total;
  }
  return ctx;
}
