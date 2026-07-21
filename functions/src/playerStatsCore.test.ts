import { describe, it, expect } from 'vitest';
import { emptyBlock, addBlock, accumulateMatch, type RawMatch } from './playerStatsCore';
import { computeUserStats, statsInputChanged, type RawTournament } from './playerStatsCore';

describe('CounterBlock helpers', () => {
  it('emptyBlock is all zeros', () => {
    const b = emptyBlock();
    expect(Object.values(b).every((v) => v === 0)).toBe(true);
    expect(b.matches).toBe(0);
    expect(b.hammerTwenties).toBe(0);
  });

  it('addBlock sums every field into the target (mutating)', () => {
    const a = emptyBlock();
    const b = emptyBlock();
    b.matches = 2; b.twenties = 5; b.koRounds = 3;
    addBlock(a, b);
    expect(a.matches).toBe(2);
    expect(a.twenties).toBe(5);
    expect(a.koRounds).toBe(3);
  });
});

describe('accumulateMatch (singles, perspective = participant id)', () => {
  const match: RawMatch = {
    participantA: 'pA', participantB: 'pB', winner: 'pA',
    totalPointsA: 8, totalPointsB: 4,
    rounds: [
      // game 1
      { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 8, twentiesB: 3, hammer: 'pA' },
      { gameNumber: 1, roundInGame: 2, pointsA: 0, pointsB: 2, twentiesA: 2, twentiesB: 5, hammer: 'pB' },
      // game 2
      { gameNumber: 2, roundInGame: 1, pointsA: 1, pointsB: 1, twentiesA: 0, twentiesB: 0, hammer: 'pA' },
    ],
  };

  it('accumulates from A perspective', () => {
    const b = emptyBlock();
    const ctx = accumulateMatch(b, match, 'pA', 'group');
    expect(b.matches).toBe(1);
    expect(b.matchesWon).toBe(1);
    expect(b.games).toBe(2);
    expect(b.rounds).toBe(3);
    expect(b.roundsWon).toBe(1);              // r1 won (2>0); r2 lost; r3 tie
    expect(b.twenties).toBe(10);              // 8 + 2 + 0
    expect(b.roundsWithTwenty).toBe(2);       // r1, r2
    expect(b.perfectRounds).toBe(1);          // r1 = 8
    expect(b.hammerRounds).toBe(2);           // r1, r3
    expect(b.hammerTwenties).toBe(8);         // r1 (8) + r3 (0)
    expect(b.hammerRoundsWon).toBe(1);        // r1 won with hammer
    expect(b.nonHammerRounds).toBe(1);        // r2
    expect(b.nonHammerTwenties).toBe(2);
    expect(b.groupMatches).toBe(1);
    expect(b.groupRounds).toBe(3);
    expect(b.groupTwenties).toBe(10);
    expect(b.marginWins).toBe(1);
    expect(b.marginSum).toBe(4);              // 8 - 4
    expect(ctx.maxTwentiesInRound).toBe(8);
    expect(ctx.maxTwentiesInGame).toBe(10);   // game1: 8+2=10, game2: 0
  });

  it('accumulates from B perspective and tags ko/finals', () => {
    const b = emptyBlock();
    accumulateMatch(b, match, 'pB', 'final');
    expect(b.matchesWon).toBe(0);
    expect(b.twenties).toBe(8);               // 3 + 5 + 0
    expect(b.koMatches).toBe(1);
    expect(b.koRounds).toBe(3);
    expect(b.koTwenties).toBe(8);
    expect(b.finalsPlayed).toBe(1);
    expect(b.finalsWon).toBe(0);
    expect(b.marginWins).toBe(0);             // didn't win → no margin
  });
});

function singlesTournament(over: Partial<RawTournament> = {}): RawTournament {
  return {
    id: 't1', name: 'Open 2025', status: 'COMPLETED', gameType: 'singles',
    tournamentDate: Date.UTC(2025, 4, 10),
    participants: [
      { id: 'pA', userId: 'u1', name: 'Juan', finalPosition: 1, status: 'ACTIVE' },
      { id: 'pB', userId: 'u2', name: 'Ana', finalPosition: 2, status: 'ACTIVE' },
    ],
    groupStage: { groups: [{ schedule: [{ matches: [{
      participantA: 'pA', participantB: 'pB', winner: 'pA', totalPointsA: 8, totalPointsB: 4,
      rounds: [
        { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 6, twentiesB: 1, hammer: 'pA' },
        { gameNumber: 1, roundInGame: 2, pointsA: 2, pointsB: 0, twentiesA: 4, twentiesB: 2, hammer: 'pB' },
      ],
    }] }] }] },
    finalStage: { goldBracket: { rounds: [{ name: 'finals', matches: [{
      participantA: 'pA', participantB: 'pB', winner: 'pA', totalPointsA: 7, totalPointsB: 5,
      rounds: [{ gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 8, twentiesB: 0, hammer: 'pA' }],
    }] }] } },
    ...over,
  };
}

describe('computeUserStats', () => {
  it('aggregates singles counters by year and tracks records + titles', () => {
    const stats = computeUserStats('u1', [singlesTournament()]);
    const y = stats.byYear['2025'];
    expect(y.matches).toBe(2);              // 1 group + 1 final
    expect(y.matchesWon).toBe(2);
    expect(y.twenties).toBe(18);            // 6+4 (group) + 8 (final)
    expect(y.finalsPlayed).toBe(1);
    expect(y.finalsWon).toBe(1);
    expect(y.koMatches).toBe(1);
    expect(stats.records.maxTwentiesInRound!.value).toBe(8);
    expect(stats.records.maxTwentiesInGame!.value).toBe(10); // group game1 = 6+4
    expect(stats.records.bestWinStreak).toBe(2);
    expect(stats.singlesTitles).toBe(1);
    expect(stats.singlesPodiums).toBe(1);
    expect(stats.displayName).toBe('Juan');
    expect(stats.userId).toBe('u1');
  });

  it('records a doubles result (palmarés) and skips round counters for doubles', () => {
    const dbl: RawTournament = {
      id: 'd1', name: 'Doubles Cup', status: 'COMPLETED', gameType: 'doubles',
      tournamentDate: Date.UTC(2024, 1, 2), rankingConfig: { tier: 'SERIES_25' },
      participants: [
        { id: 'tm', userId: 'u1', name: 'Juan', status: 'ACTIVE', finalPosition: 1,
          partner: { userId: 'u3', name: 'Leo' } },
        { id: 'tm2', userId: 'u4', name: 'Sam', status: 'ACTIVE', finalPosition: 2,
          partner: { userId: 'u5', name: 'Mia' } },
      ],
    };
    const stats = computeUserStats('u1', [dbl]);
    expect(stats.byYear['2024']?.rounds ?? 0).toBe(0);  // no singles round counters
    expect(stats.doublesTitles).toBe(1);
    expect(stats.doublesPodiums).toBe(1);
    expect(stats.doublesResults).toHaveLength(1);
    expect(stats.doublesResults[0]).toMatchObject({
      tournamentName: 'Doubles Cup', category: 'SERIES_25', partnerName: 'Leo', rank: 1, totalTeams: 2,
    });
  });

  it('returns empty stats when the user never appears', () => {
    const stats = computeUserStats('ghost', [singlesTournament()]);
    expect(Object.keys(stats.byYear)).toHaveLength(0);
    expect(stats.singlesTitles).toBe(0);
    expect(stats.records.maxTwentiesInRound).toBeNull();
  });

  it('classifies finals robustly: app "finals" / imported "Final" count, "semifinals" does not', () => {
    const t: RawTournament = {
      id: 't2', name: 'KO Cup', status: 'COMPLETED', gameType: 'singles',
      tournamentDate: Date.UTC(2025, 5, 1),
      participants: [
        { id: 'pA', userId: 'u1', name: 'Juan', finalPosition: 1, status: 'ACTIVE' },
        { id: 'pB', userId: 'u2', name: 'Ana', finalPosition: 2, status: 'ACTIVE' },
      ],
      finalStage: { goldBracket: { rounds: [
        { name: 'semifinals', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pB' }] },
        { name: 'finals', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pA' }] },
      ] } },
    };
    const stats = computeUserStats('u1', [t]);
    const y = stats.byYear['2025'];
    expect(y.finalsPlayed).toBe(1);          // only the 'finals' round
    expect(y.finalsWon).toBe(1);
    expect(y.koMatches).toBe(2);             // semifinal + final are both KO matches
    expect(y.matches).toBe(2);
    expect(y.medalMatches).toBe(2);          // semifinal + final
    expect(y.medalMatchesWon).toBe(1);       // lost the semi, won the final
  });

  it('counts the 3rd-place match as a medal-round match but not as a final', () => {
    const t: RawTournament = {
      id: 't4', name: 'Bronze Cup', status: 'COMPLETED', gameType: 'singles',
      tournamentDate: Date.UTC(2025, 7, 1),
      participants: [
        { id: 'pA', userId: 'u1', name: 'Juan', finalPosition: 3, status: 'ACTIVE' },
        { id: 'pB', userId: 'u2', name: 'Ana', finalPosition: 4, status: 'ACTIVE' },
      ],
      finalStage: { goldBracket: {
        rounds: [{ name: 'semifinals', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pB' }] }],
        thirdPlaceMatch: { participantA: 'pA', participantB: 'pB', winner: 'pA' },
      } },
    };
    const y = computeUserStats('u1', [t]).byYear['2025'];
    expect(y.finalsPlayed).toBe(0);
    expect(y.medalMatches).toBe(2);          // semifinal + 3rd-place
    expect(y.medalMatchesWon).toBe(1);
    expect(y.koMatches).toBe(2);             // both still count as knockout
  });

  it('ignores BYE walkovers in both the current and the legacy shape', () => {
    const t: RawTournament = {
      id: 't6', name: 'Bye Cup', status: 'COMPLETED', gameType: 'singles',
      tournamentDate: Date.UTC(2025, 9, 1),
      participants: [
        { id: 'pA', userId: 'u1', name: 'Juan', finalPosition: 1, status: 'ACTIVE' },
        { id: 'pB', userId: 'u2', name: 'Ana', finalPosition: 2, status: 'ACTIVE' },
      ],
      finalStage: { goldBracket: { rounds: [
        // current shape: empty side, winner = the real player (a free win if not skipped)
        { name: 'R16', matches: [{ participantA: 'pA', winner: 'pA' }] },
        // legacy shape: 'unknown-BYE' placeholder that a 0-0 score crowned as winner (a free loss)
        { name: 'R8', matches: [{ participantA: 'pA', participantB: 'unknown-BYE', winner: 'unknown-BYE', totalPointsA: 0, totalPointsB: 0 }] },
        { name: 'finals', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pA' }] },
      ] } },
    };
    const y = computeUserStats('u1', [t]).byYear['2025'];
    expect(y.matches).toBe(1);        // only the final was actually played
    expect(y.matchesWon).toBe(1);
    expect(y.koMatches).toBe(1);
    expect(y.koMatchesWon).toBe(1);
  });

  it('does not double-count when goldBracket mirrors parallelBrackets[0]', () => {
    const round = { name: 'finals', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pA' }] };
    const t: RawTournament = {
      id: 't5', name: 'Parallel Cup', status: 'COMPLETED', gameType: 'singles',
      tournamentDate: Date.UTC(2025, 8, 1),
      participants: [
        { id: 'pA', userId: 'u1', name: 'Juan', finalPosition: 1, status: 'ACTIVE' },
        { id: 'pB', userId: 'u2', name: 'Ana', finalPosition: 2, status: 'ACTIVE' },
      ],
      finalStage: {
        goldBracket: { rounds: [round] },                     // copy written by the wizard
        parallelBrackets: [{ bracket: { rounds: [round] } }],  // the real source
      },
    };
    const y = computeUserStats('u1', [t]).byYear['2025'];
    expect(y.matches).toBe(1);
    expect(y.koMatches).toBe(1);
    expect(y.finalsPlayed).toBe(1);
  });

  it('classifies an imported-style "Final" round as a final', () => {
    const t: RawTournament = {
      id: 't3', name: 'Imported Cup', status: 'COMPLETED', gameType: 'singles',
      tournamentDate: Date.UTC(2025, 6, 1),
      participants: [
        { id: 'pA', userId: 'u1', name: 'Juan', finalPosition: 1, status: 'ACTIVE' },
        { id: 'pB', userId: 'u2', name: 'Ana', finalPosition: 2, status: 'ACTIVE' },
      ],
      finalStage: { goldBracket: { rounds: [
        { name: 'Final', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pA' }] },
      ] } },
    };
    const stats = computeUserStats('u1', [t]);
    expect(stats.byYear['2025'].finalsPlayed).toBe(1);
    expect(stats.byYear['2025'].finalsWon).toBe(1);
  });

  it('handles the user being the partner (not primary) of a doubles team', () => {
    const dbl: RawTournament = {
      id: 'd2', name: 'Partner Cup', status: 'COMPLETED', gameType: 'doubles',
      tournamentDate: Date.UTC(2025, 2, 3),
      participants: [
        { id: 'tm', userId: 'u9', name: 'Sam', status: 'ACTIVE', finalPosition: 1,
          partner: { userId: 'u1', name: 'Juan' } },
        { id: 'tm2', userId: 'u4', name: 'Lee', status: 'ACTIVE', finalPosition: 2,
          partner: { userId: 'u5', name: 'Mia' } },
      ],
    };
    const stats = computeUserStats('u1', [dbl]);
    expect(stats.displayName).toBe('Juan');
    expect(stats.doublesTitles).toBe(1);
    expect(stats.doublesResults[0].partnerName).toBe('Sam');
    expect(stats.doublesResults[0].partnerId).toBe('u9');
  });

  it('records best 20s in a game per format (4r from groupStage, 9p from finalStage)', () => {
    const t: RawTournament = {
      id: 'tf', name: 'Formats Cup', status: 'COMPLETED', gameType: 'singles',
      tournamentDate: Date.UTC(2025, 0, 1),
      participants: [
        { id: 'pA', userId: 'u1', name: 'Juan', status: 'ACTIVE', finalPosition: 1 },
        { id: 'pB', userId: 'u2', name: 'Ana', status: 'ACTIVE', finalPosition: 2 },
      ],
      groupStage: { gameMode: 'rounds', roundsToPlay: 4, groups: [{ schedule: [{ matches: [{
        participantA: 'pA', participantB: 'pB', winner: 'pA',
        rounds: [
          { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 5, twentiesB: 0, hammer: 'pA' },
          { gameNumber: 1, roundInGame: 2, pointsA: 2, pointsB: 0, twentiesA: 3, twentiesB: 0, hammer: 'pA' },
        ],
      }] }] }] },
      finalStage: { goldBracket: { config: { final: { gameMode: 'points', pointsToWin: 9 } }, rounds: [{ name: 'finals', matches: [{
        participantA: 'pA', participantB: 'pB', winner: 'pA',
        rounds: [{ gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 7, twentiesB: 0, hammer: 'pA' }],
      }] }] } },
    };
    const stats = computeUserStats('u1', [t]);
    expect(stats.maxTwentiesByFormat['4r']?.value).toBe(8); // group game: 5 + 3
    expect(stats.maxTwentiesByFormat['9p']?.value).toBe(7); // final game: 7
    expect(stats.maxTwentiesByFormat['7p']).toBeUndefined();
  });
});

describe('statsInputChanged (post-completion edits)', () => {
  const base = () => ({
    name: 'Cup', gameType: 'singles', isTest: false, tournamentDate: Date.UTC(2025, 0, 1),
    rankingConfig: { enabled: true, tier: 'SERIES_25' },
    groupStage: { groups: [{ schedule: [{ matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pA', totalPointsA: 8, totalPointsB: 3 }] }] }] },
    finalStage: { goldBracket: { rounds: [{ name: 'finals', matches: [{ participantA: 'pA', participantB: 'pB', winner: 'pA' }] }] } },
    participants: [
      { id: 'pA', userId: 'u1', name: 'Juan', status: 'ACTIVE', finalPosition: 1 },
      { id: 'pB', userId: 'u2', name: 'Ana', status: 'ACTIVE', finalPosition: 2 },
    ],
  });

  it('is false when nothing changed', () => {
    expect(statsInputChanged(base(), base())).toBe(false);
  });

  it('is false when only ranking bookkeeping changed (the function writing back its own results)', () => {
    const after = base() as Record<string, unknown> & ReturnType<typeof base>;
    after.participants = after.participants.map((p) => ({ ...p, rankingPoints: 120, previousRanking: 4 }));
    after.rankingUpdatesApplied = true;
    after.participantUserIds = ['u1', 'u2'];
    after.summary = { champion: 'Juan' };
    expect(statsInputChanged(base(), after)).toBe(false);
  });

  it('is true when a match score is corrected', () => {
    const after = base();
    after.groupStage.groups[0].schedule[0].matches[0].totalPointsB = 9;
    expect(statsInputChanged(base(), after)).toBe(true);
  });

  it('is true when a winner is corrected', () => {
    const after = base();
    after.finalStage.goldBracket.rounds[0].matches[0].winner = 'pB';
    expect(statsInputChanged(base(), after)).toBe(true);
  });

  it('is true when final positions, the date or the test flag change', () => {
    const pos = base(); pos.participants[0].finalPosition = 2;
    const date = base(); date.tournamentDate = Date.UTC(2024, 0, 1);
    const test = base(); test.isTest = true;
    expect(statsInputChanged(base(), pos)).toBe(true);
    expect(statsInputChanged(base(), date)).toBe(true);
    expect(statsInputChanged(base(), test)).toBe(true);
  });
});
