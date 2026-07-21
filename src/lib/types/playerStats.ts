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
  medalMatches: number;     medalMatchesWon: number;    // semifinal + final + 3rd-place
  marginSum: number;        marginWins: number;
}

export interface RecordRef {
  value: number; tournamentId: string; tournamentName: string; date: number; opponentName?: string;
}
export interface DoublesResult {
  tournamentId: string; date: number; tournamentName: string;
  category: string; partnerId: string | null; partnerName: string; rank: number; totalTeams: number;
}
export interface PlayerStats {
  userId: string;
  displayName: string;
  photoURL?: string;
  country?: string;
  byYear: Record<string, CounterBlock>;
  records: { maxTwentiesInRound: RecordRef | null; maxTwentiesInGame: RecordRef | null; bestWinStreak: number };
  /** Best 20s in a single game, split by game format ('4r' | '7p' | '9p'). */
  maxTwentiesByFormat?: Record<string, RecordRef | null>;
  singlesTitles: number; singlesPodiums: number;
  doublesTitles: number; doublesPodiums: number;
  doublesResults: DoublesResult[];
}

export function emptyCounterBlock(): CounterBlock {
  return {
    matches: 0, matchesWon: 0, games: 0, rounds: 0, roundsWon: 0,
    twenties: 0, roundsWithTwenty: 0, perfectRounds: 0,
    hammerRounds: 0, hammerTwenties: 0, hammerRoundsWon: 0,
    nonHammerRounds: 0, nonHammerTwenties: 0, nonHammerRoundsWon: 0,
    koMatches: 0, koMatchesWon: 0, koRounds: 0, koTwenties: 0,
    groupMatches: 0, groupMatchesWon: 0, groupRounds: 0, groupTwenties: 0,
    finalsPlayed: 0, finalsWon: 0, medalMatches: 0, medalMatchesWon: 0,
    marginSum: 0, marginWins: 0,
  };
}
