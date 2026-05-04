/**
 * Tied-position tests for `calculateFinalPositionsForTournament`.
 *
 * Verifies that when a bracket round has no concrete positioning mechanism
 * (no complete consolation bracket for that round, no 3rd-place match for
 * the semifinal), the round losers share a tied display range
 * (`finalPosition` start, `finalPositionEnd` end) while still receiving
 * unique internal `finalPosition` values reordered by total tournament
 * points so ranking-points differentiate performance.
 */

import { describe, it, expect } from 'vitest';
import { calculateFinalPositionsForTournament } from './tournamentRanking';

// ─── Helpers ──────────────────────────────────────────────────────────

interface MiniMatch {
  id: string;
  participantA?: string;
  participantB?: string;
  winner?: string;
  status: 'PENDING' | 'COMPLETED' | 'WALKOVER';
  totalPointsA?: number;
  totalPointsB?: number;
  position?: number;
}

interface MiniBracket {
  totalRounds: number;
  rounds: Array<{ matches: MiniMatch[] }>;
  thirdPlaceMatch?: MiniMatch;
  consolationBrackets?: Array<{
    source: 'QF' | 'R16' | 'R32' | 'R64';
    isComplete: boolean;
    rounds: Array<{ matches: MiniMatch[] }>;
    startPosition?: number;
  }>;
  config?: any;
}

function makeParticipant(id: string, name = id) {
  return {
    id,
    type: 'GUEST' as const,
    name,
    status: 'ACTIVE' as const,
    rankingSnapshot: 1000
  };
}

function makeMatch(
  id: string,
  a: string,
  b: string,
  winner: string,
  pointsA = 8,
  pointsB = 4
): MiniMatch {
  return { id, participantA: a, participantB: b, winner, status: 'COMPLETED', totalPointsA: pointsA, totalPointsB: pointsB };
}

// 8-player bracket: rounds = [QF (4 matches), SF (2 matches), Final (1 match)]
function build8PlayerBracket(opts: {
  thirdPlace?: { participantA: string; participantB: string; winner: string };
  consolationQfComplete?: boolean;
  qfWinners?: [string, string, string, string]; // winners of QF[0..3]
  qfPoints?: Array<[number, number]>; // [pointsA, pointsB] for each QF
  semiWinner1?: string; semiWinner2?: string;
  finalWinner?: string;
}): MiniBracket {
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const qfWinners = opts.qfWinners ?? ['p1', 'p3', 'p5', 'p7'];
  const qfPoints = opts.qfPoints ?? [[8, 4], [8, 4], [8, 4], [8, 4]];
  const semi1Winner = opts.semiWinner1 ?? qfWinners[0];
  const semi2Winner = opts.semiWinner2 ?? qfWinners[2];
  const finalWinner = opts.finalWinner ?? semi1Winner;
  const finalLoser = finalWinner === semi1Winner ? semi2Winner : semi1Winner;

  const qfMatches: MiniMatch[] = [
    makeMatch('qf0', players[0], players[1], qfWinners[0], qfPoints[0][0], qfPoints[0][1]),
    makeMatch('qf1', players[2], players[3], qfWinners[1], qfPoints[1][0], qfPoints[1][1]),
    makeMatch('qf2', players[4], players[5], qfWinners[2], qfPoints[2][0], qfPoints[2][1]),
    makeMatch('qf3', players[6], players[7], qfWinners[3], qfPoints[3][0], qfPoints[3][1]),
  ];

  const sfMatches: MiniMatch[] = [
    makeMatch('sf0', qfWinners[0], qfWinners[1], semi1Winner),
    makeMatch('sf1', qfWinners[2], qfWinners[3], semi2Winner),
  ];

  const finalMatches: MiniMatch[] = [
    makeMatch('final', semi1Winner, semi2Winner, finalWinner),
  ];

  const bracket: MiniBracket = {
    totalRounds: 3,
    rounds: [
      { matches: qfMatches },
      { matches: sfMatches },
      { matches: finalMatches }
    ]
  };

  if (opts.thirdPlace) {
    bracket.thirdPlaceMatch = makeMatch('3rd', opts.thirdPlace.participantA, opts.thirdPlace.participantB, opts.thirdPlace.winner);
  }

  // Note: ignoring consolationQfComplete for now in test setup since the
  // ranking function only needs `bracket.consolationBrackets` to be present
  // and complete to skip tied-marking. We test the WITHOUT-consolation
  // path here.
  return bracket;
}

function buildTournament(numPlayers: number, bracket: MiniBracket) {
  const players = Array.from({ length: numPlayers }, (_, i) => makeParticipant(`p${i + 1}`));
  return {
    id: 't1',
    phaseType: 'ONE_PHASE',
    status: 'COMPLETED',
    participants: players,
    finalStage: {
      isComplete: true,
      goldBracket: bracket
    }
  };
}

function pos(participants: any[], id: string): { p?: number; start?: number; end?: number } {
  const p = participants.find(x => x.id === id);
  return { p: p?.finalPosition, start: p?.finalPositionStart, end: p?.finalPositionEnd };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Tied positions: 8-player no consolation', () => {
  it('NO 3rd-place match → semis tied 3–4, QF tied 5–8', () => {
    const bracket = build8PlayerBracket({
      qfWinners: ['p1', 'p3', 'p5', 'p7'],
      qfPoints: [[7, 5], [8, 2], [7, 6], [8, 1]], // p2=5, p4=2, p6=6, p8=1
      semiWinner1: 'p1', semiWinner2: 'p5',
      finalWinner: 'p1'
    });
    const t = buildTournament(8, bracket);
    const out = calculateFinalPositionsForTournament(t);

    expect(pos(out, 'p1')).toEqual({ p: 1, end: undefined });
    expect(pos(out, 'p5')).toEqual({ p: 2, end: undefined });

    // Semis (p3, p7) tied at 3–4
    const p3Pos = pos(out, 'p3');
    const p7Pos = pos(out, 'p7');
    expect(p3Pos.end).toBe(4);
    expect(p7Pos.end).toBe(4);
    expect(new Set([p3Pos.p, p7Pos.p])).toEqual(new Set([3, 4]));

    // QF losers (p2, p4, p6, p8) tied at 5–8 — internal finalPosition is
    // reordered DESC by total tournament points so the better performer
    // gets the lowest (best) numeric position:
    //   p6 (6 pts) > p2 (5 pts) > p4 (2 pts) > p8 (1 pt)
    expect(pos(out, 'p6')).toEqual({ p: 5, start: 5, end: 8 });
    expect(pos(out, 'p2')).toEqual({ p: 6, start: 5, end: 8 });
    expect(pos(out, 'p4')).toEqual({ p: 7, start: 5, end: 8 });
    expect(pos(out, 'p8')).toEqual({ p: 8, start: 5, end: 8 });
  });

  it('WITH 3rd-place match → 3 and 4 are concrete, QF tied 5–8', () => {
    const bracket = build8PlayerBracket({
      qfWinners: ['p1', 'p3', 'p5', 'p7'],
      qfPoints: [[7, 5], [8, 2], [7, 6], [8, 1]],
      semiWinner1: 'p1', semiWinner2: 'p5',
      finalWinner: 'p1',
      thirdPlace: { participantA: 'p3', participantB: 'p7', winner: 'p3' }
    });
    const t = buildTournament(8, bracket);
    const out = calculateFinalPositionsForTournament(t);

    expect(pos(out, 'p1')).toEqual({ p: 1, end: undefined });
    expect(pos(out, 'p5')).toEqual({ p: 2, end: undefined });
    expect(pos(out, 'p3')).toEqual({ p: 3, end: undefined });
    expect(pos(out, 'p7')).toEqual({ p: 4, end: undefined });

    // QF still tied 5–8
    expect(pos(out, 'p6').end).toBe(8);
    expect(pos(out, 'p2').end).toBe(8);
    expect(pos(out, 'p4').end).toBe(8);
    expect(pos(out, 'p8').end).toBe(8);
  });
});

describe('Tied positions: 8-player WITH consolation (no ties)', () => {
  it('complete QF consolation → QF losers get concrete positions, no tied range', () => {
    const bracket = build8PlayerBracket({
      qfWinners: ['p1', 'p3', 'p5', 'p7'],
      semiWinner1: 'p1', semiWinner2: 'p5',
      finalWinner: 'p1',
      thirdPlace: { participantA: 'p3', participantB: 'p7', winner: 'p3' }
    });
    bracket.consolationBrackets = [{
      source: 'QF',
      isComplete: true,
      startPosition: 5,
      rounds: [
        { matches: [
          makeMatch('c0', 'p2', 'p8', 'p2'),
          makeMatch('c1', 'p4', 'p6', 'p4'),
        ]},
        { matches: [
          makeMatch('c-final', 'p2', 'p4', 'p2'),
        ]}
      ]
    }];
    const t = buildTournament(8, bracket);
    const out = calculateFinalPositionsForTournament(t);

    // QF losers got concrete positions from consolation — no tied range
    for (const id of ['p2', 'p4', 'p6', 'p8']) {
      expect(pos(out, id).end).toBeUndefined();
    }
  });
});

describe('Tied positions: 16-player no consolation', () => {
  it('R16 losers tied 9–16, QF losers tied 5–8', () => {
    // Build 16-player bracket: rounds=[R16 (8), QF (4), SF (2), Final (1)]
    // p1 wins all the way. R16 winners: p1,p3,p5,p7,p9,p11,p13,p15
    // QF winners: p1,p5,p9,p13. SF winners: p1,p9. Final: p1
    const r16: MiniMatch[] = [
      makeMatch('r16-0', 'p1', 'p2', 'p1', 8, 5),
      makeMatch('r16-1', 'p3', 'p4', 'p3', 8, 6),
      makeMatch('r16-2', 'p5', 'p6', 'p5', 8, 4),
      makeMatch('r16-3', 'p7', 'p8', 'p7', 8, 7),
      makeMatch('r16-4', 'p9', 'p10', 'p9', 8, 1),
      makeMatch('r16-5', 'p11', 'p12', 'p11', 8, 2),
      makeMatch('r16-6', 'p13', 'p14', 'p13', 8, 3),
      makeMatch('r16-7', 'p15', 'p16', 'p15', 8, 0),
    ];
    const qf: MiniMatch[] = [
      makeMatch('qf-0', 'p1', 'p3', 'p1', 8, 4),
      makeMatch('qf-1', 'p5', 'p7', 'p5', 8, 4),
      makeMatch('qf-2', 'p9', 'p11', 'p9', 8, 4),
      makeMatch('qf-3', 'p13', 'p15', 'p13', 8, 4),
    ];
    const sf: MiniMatch[] = [
      makeMatch('sf-0', 'p1', 'p5', 'p1'),
      makeMatch('sf-1', 'p9', 'p13', 'p9'),
    ];
    const fin: MiniMatch[] = [
      makeMatch('final', 'p1', 'p9', 'p1'),
    ];
    const bracket: MiniBracket = {
      totalRounds: 4,
      rounds: [{ matches: r16 }, { matches: qf }, { matches: sf }, { matches: fin }],
      thirdPlaceMatch: makeMatch('3rd', 'p5', 'p13', 'p5'),
    };

    const t = buildTournament(16, bracket);
    const out = calculateFinalPositionsForTournament(t);

    expect(pos(out, 'p1')).toEqual({ p: 1, end: undefined });
    expect(pos(out, 'p9')).toEqual({ p: 2, end: undefined });
    expect(pos(out, 'p5')).toEqual({ p: 3, end: undefined });
    expect(pos(out, 'p13')).toEqual({ p: 4, end: undefined });

    // QF losers (p3, p7, p11, p15) tied 5–8
    for (const id of ['p3', 'p7', 'p11', 'p15']) {
      expect(pos(out, id).end).toBe(8);
      expect(pos(out, id).p).toBeGreaterThanOrEqual(5);
      expect(pos(out, id).p).toBeLessThanOrEqual(8);
    }

    // R16 losers (p2, p4, p6, p8, p10, p12, p14, p16) tied 9–16
    for (const id of ['p2', 'p4', 'p6', 'p8', 'p10', 'p12', 'p14', 'p16']) {
      expect(pos(out, id).end).toBe(16);
      expect(pos(out, id).p).toBeGreaterThanOrEqual(9);
      expect(pos(out, id).p).toBeLessThanOrEqual(16);
    }
  });
});

describe('Tied positions: edge cases', () => {
  it('single match in round (only 1 loser) → no tie applied', () => {
    // 4-player bracket: rounds=[SF (2), Final (1)]
    const sf: MiniMatch[] = [
      makeMatch('sf0', 'p1', 'p2', 'p1', 7, 5),
      makeMatch('sf1', 'p3', 'p4', 'p3', 7, 6),
    ];
    const fin: MiniMatch[] = [
      makeMatch('final', 'p1', 'p3', 'p1'),
    ];
    const bracket: MiniBracket = {
      totalRounds: 2,
      rounds: [{ matches: sf }, { matches: fin }],
      thirdPlaceMatch: makeMatch('3rd', 'p2', 'p4', 'p2')
    };
    const t = buildTournament(4, bracket);
    const out = calculateFinalPositionsForTournament(t);
    // All 4 have concrete positions, no ties
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      expect(pos(out, id).end).toBeUndefined();
    }
  });

  it('group-stage points contribute to tied-group ordering', () => {
    // p2 had a great group stage (high points) but lost cuartos with the
    // same low score as p4/p6/p8. The combined total still puts p2 first
    // within the QF tied range.
    const bracket = build8PlayerBracket({
      qfWinners: ['p1', 'p3', 'p5', 'p7'],
      qfPoints: [[7, 0], [7, 0], [7, 0], [7, 0]], // all losers got 0 in QF
      semiWinner1: 'p1', semiWinner2: 'p5',
      finalWinner: 'p1',
      thirdPlace: { participantA: 'p3', participantB: 'p7', winner: 'p3' }
    });
    const t = buildTournament(8, bracket) as any;
    t.groupStage = {
      groups: [{
        standings: [],
        schedule: [{
          matches: [
            makeMatch('g0', 'p2', 'p1', 'p1', 30, 7),
            makeMatch('g1', 'p4', 'p1', 'p1', 5, 7),
            makeMatch('g2', 'p6', 'p1', 'p1', 10, 7),
            makeMatch('g3', 'p8', 'p1', 'p1', 2, 7),
          ]
        }]
      }]
    };
    const out = calculateFinalPositionsForTournament(t);
    // p2 (30 group pts) — best in tie → pos 5
    // p6 (10) → pos 6, p4 (5) → pos 7, p8 (2) → pos 8
    expect(pos(out, 'p2').p).toBe(5);
    expect(pos(out, 'p6').p).toBe(6);
    expect(pos(out, 'p4').p).toBe(7);
    expect(pos(out, 'p8').p).toBe(8);
    expect(pos(out, 'p2').end).toBe(8);
  });

  it('every tied participant has the same finalPositionStart AND finalPositionEnd', () => {
    const bracket = build8PlayerBracket({
      qfWinners: ['p1', 'p3', 'p5', 'p7'],
      semiWinner1: 'p1', semiWinner2: 'p5',
      finalWinner: 'p1',
      thirdPlace: { participantA: 'p3', participantB: 'p7', winner: 'p3' }
    });
    const t = buildTournament(8, bracket);
    const out = calculateFinalPositionsForTournament(t);
    const starts = ['p2', 'p4', 'p6', 'p8'].map(id => pos(out, id).start);
    const ends = ['p2', 'p4', 'p6', 'p8'].map(id => pos(out, id).end);
    expect(new Set(starts).size).toBe(1); // all share same start
    expect(new Set(ends).size).toBe(1);   // all share same end
    expect(starts[0]).toBe(5);
    expect(ends[0]).toBe(8);
  });
});
