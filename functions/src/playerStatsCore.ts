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
