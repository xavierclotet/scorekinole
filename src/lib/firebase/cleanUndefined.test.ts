import { describe, it, expect } from 'vitest';
import { cleanUndefined } from './cleanUndefined';

describe('cleanUndefined', () => {
  it('removes undefined values from flat objects', () => {
    const result = cleanUndefined({ a: 1, b: undefined, c: 'hello' });
    expect(result).toEqual({ a: 1, c: 'hello' });
    expect('b' in result).toBe(false);
  });

  it('removes undefined values recursively in nested objects', () => {
    const result = cleanUndefined({
      level1: {
        level2: {
          keep: 'yes',
          remove: undefined,
          level3: { deep: undefined, value: 42 }
        }
      }
    });
    expect(result).toEqual({
      level1: { level2: { keep: 'yes', level3: { value: 42 } } }
    });
  });

  it('handles arrays with undefined values inside objects', () => {
    const result = cleanUndefined({
      items: [
        { id: 1, name: 'a', extra: undefined },
        { id: 2, name: undefined }
      ]
    });
    expect(result).toEqual({
      items: [
        { id: 1, name: 'a' },
        { id: 2 }
      ]
    });
  });

  it('filters undefined elements from arrays', () => {
    const arr = [1, undefined, 3, undefined, 5];
    const result = cleanUndefined(arr);
    expect(result).toEqual([1, 3, 5]);
  });

  it('converts NaN to null', () => {
    const result = cleanUndefined({ score: NaN, valid: 10 });
    expect(result).toEqual({ score: null, valid: 10 });
  });

  it('converts Infinity to null', () => {
    const result = cleanUndefined({ a: Infinity, b: -Infinity, c: 0 });
    expect(result).toEqual({ a: null, b: null, c: 0 });
  });

  it('converts Timestamp-like objects to millis', () => {
    const fakeTimestamp = { toMillis: () => 1700000000000 };
    const result = cleanUndefined({ createdAt: fakeTimestamp });
    expect(result).toEqual({ createdAt: 1700000000000 });
  });

  it('preserves null values', () => {
    const result = cleanUndefined({ a: null, b: 1 });
    expect(result).toEqual({ a: null, b: 1 });
  });

  it('preserves empty objects and arrays', () => {
    const result = cleanUndefined({ obj: {}, arr: [] });
    expect(result).toEqual({ obj: {}, arr: [] });
  });

  it('handles top-level null and undefined', () => {
    expect(cleanUndefined(null)).toBe(null);
    expect(cleanUndefined(undefined)).toBe(undefined);
  });

  it('handles primitives (string, number, boolean)', () => {
    expect(cleanUndefined('hello')).toBe('hello');
    expect(cleanUndefined(42)).toBe(42);
    expect(cleanUndefined(true)).toBe(true);
    expect(cleanUndefined(false)).toBe(false);
  });

  it('handles deeply nested Timestamps and NaN together', () => {
    const fakeTimestamp = { toMillis: () => 999 };
    const result = cleanUndefined({
      match: {
        score: NaN,
        time: fakeTimestamp,
        winner: undefined,
        rounds: [{ points: Infinity, player: 'a' }]
      }
    });
    expect(result).toEqual({
      match: {
        score: null,
        time: 999,
        rounds: [{ points: null, player: 'a' }]
      }
    });
  });

  it('handles real-world standings with tiedWith/tieReason undefined', () => {
    const standings = [
      { participantId: 'p1', points: 6, tiedWith: undefined, tieReason: undefined },
      { participantId: 'p2', points: 4, tiedWith: ['p3'], tieReason: 'h2h' },
      { participantId: 'p3', points: 4, tiedWith: ['p2'], tieReason: 'h2h' }
    ];
    const result = cleanUndefined(standings);
    expect(result[0]).toEqual({ participantId: 'p1', points: 6 });
    expect('tiedWith' in result[0]).toBe(false);
    expect('tieReason' in result[0]).toBe(false);
    expect(result[1].tiedWith).toEqual(['p3']);
  });

  it('handles real-world groupStage with mixed undefined at multiple levels', () => {
    const groupStage = {
      type: 'SWISS',
      groups: [{
        id: 'g1',
        standings: [
          { participantId: 'p1', points: 6, tiedWith: undefined, buchholz: undefined },
          { participantId: 'p2', points: 4, tiedWith: ['p3'], buchholz: 3.5 }
        ],
        pairings: [{
          roundNumber: 1,
          matches: [{ id: 'm1', winner: undefined, duration: undefined, status: 'PENDING' }]
        }]
      }]
    };
    const result = cleanUndefined(groupStage);

    // No undefined at any level
    const p1 = result.groups[0].standings[0];
    expect('tiedWith' in p1).toBe(false);
    expect('buchholz' in p1).toBe(false);

    const match = result.groups[0].pairings[0].matches[0];
    expect('winner' in match).toBe(false);
    expect('duration' in match).toBe(false);
    expect(match.status).toBe('PENDING');
  });
});

describe('cleanUndefined: real tournament configurations', () => {
  it('Swiss tournament: round 2 standings with varied tiebreaker fields', () => {
    const groupStage = {
      type: 'SWISS',
      currentRound: 2,
      totalRounds: 3,
      isComplete: false,
      numSwissRounds: 3,
      qualificationMode: 'WINS',
      gameMode: 'rounds',
      roundsToPlay: 4,
      matchesToWin: 1,
      groups: [{
        id: 'swiss-group',
        name: 'Swiss',
        participants: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        standings: [
          // Winner: no tie fields
          { participantId: 'p1', position: 1, points: 4, matchesWon: 2, matchesPlayed: 2, matchesLost: 0, matchesTied: 0, swissPoints: 4, total20s: 3, totalPointsScored: 16, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined, buchholz: undefined },
          // Tied pair: h2h resolved
          { participantId: 'p2', position: 2, points: 2, matchesWon: 1, matchesPlayed: 2, matchesLost: 1, matchesTied: 0, swissPoints: 2, total20s: 1, totalPointsScored: 11, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined, buchholz: 4.0 },
          { participantId: 'p3', position: 3, points: 2, matchesWon: 1, matchesPlayed: 2, matchesLost: 1, matchesTied: 0, swissPoints: 2, total20s: 0, totalPointsScored: 10, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined, buchholz: 2.0 },
          // Unresolved tie
          { participantId: 'p4', position: 4, points: 0, matchesWon: 0, matchesPlayed: 2, matchesLost: 2, matchesTied: 0, swissPoints: 0, total20s: 0, totalPointsScored: 6, qualifiedForFinal: false, tiedWith: ['p5'], tieReason: 'unresolved' },
          { participantId: 'p5', position: 4, points: 0, matchesWon: 0, matchesPlayed: 2, matchesLost: 2, matchesTied: 0, swissPoints: 0, total20s: 0, totalPointsScored: 6, qualifiedForFinal: false, tiedWith: ['p4'], tieReason: 'unresolved' },
          // BYE player
          { participantId: 'p6', position: 6, points: 2, matchesWon: 1, matchesPlayed: 2, matchesLost: 1, matchesTied: 0, swissPoints: 2, total20s: 0, totalPointsScored: 8, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined }
        ],
        pairings: [
          { roundNumber: 1, matches: [
            { id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 5, total20sA: 2, total20sB: 1, gamesWonA: 2, gamesWonB: 0, tableNumber: 1, startedAt: 1000, completedAt: 2000, duration: 1000 },
            { id: 'm2', participantA: 'p3', participantB: 'p4', status: 'COMPLETED', winner: 'p3', totalPointsA: 8, totalPointsB: 3, total20sA: 0, total20sB: 0, gamesWonA: 2, gamesWonB: 0, tableNumber: 2, startedAt: 1000, completedAt: 2000, duration: 1000 },
            { id: 'm3', participantA: 'p5', participantB: 'p6', status: 'WALKOVER', winner: 'p6', totalPointsA: 0, totalPointsB: 8 }
          ]},
          { roundNumber: 2, matches: [
            { id: 'm4', participantA: 'p1', participantB: 'p3', status: 'IN_PROGRESS', winner: undefined, tableNumber: 1, startedAt: 3000 },
            { id: 'm5', participantA: 'p2', participantB: 'p6', status: 'PENDING', winner: undefined, tableNumber: undefined },
            { id: 'm6', participantA: 'p4', participantB: 'p5', status: 'PENDING', winner: undefined, tableNumber: undefined }
          ]}
        ]
      }]
    };

    const result = cleanUndefined(groupStage);

    // Standings: no undefined tiedWith/tieReason/buchholz
    for (const s of result.groups[0].standings) {
      for (const [key, value] of Object.entries(s)) {
        expect(value).not.toBeUndefined();
      }
    }
    // Unresolved ties preserved
    expect(result.groups[0].standings[3].tiedWith).toEqual(['p5']);

    // Pending matches: winner/tableNumber removed
    const pendingMatch = result.groups[0].pairings[1].matches[1];
    expect('winner' in pendingMatch).toBe(false);
    expect('tableNumber' in pendingMatch).toBe(false);
  });

  it('Round Robin tournament: multi-group with headToHeadRecord', () => {
    const groupStage = {
      type: 'ROUND_ROBIN',
      currentRound: 3,
      totalRounds: 3,
      isComplete: true,
      qualificationMode: 'WINS',
      gameMode: 'points',
      pointsToWin: 7,
      roundsToPlay: undefined,  // not used in points mode
      matchesToWin: 1,
      numGroups: 2,
      groups: [
        {
          id: 'g1', name: 'Group A',
          participants: ['p1', 'p2', 'p3', 'p4'],
          standings: [
            { participantId: 'p1', position: 1, points: 6, matchesWon: 3, matchesPlayed: 3, matchesLost: 0, matchesTied: 0, total20s: 5, totalPointsScored: 24, qualifiedForFinal: true, headToHeadRecord: { p2: { result: 'WIN', twenties: 2 }, p3: { result: 'WIN', twenties: 1 }, p4: { result: 'WIN', twenties: 2 } }, tiedWith: undefined, tieReason: undefined },
            { participantId: 'p2', position: 2, points: 4, matchesWon: 2, matchesPlayed: 3, matchesLost: 1, matchesTied: 0, total20s: 3, totalPointsScored: 18, qualifiedForFinal: true, headToHeadRecord: { p1: { result: 'LOSS', twenties: 0 }, p3: { result: 'WIN', twenties: 1 }, p4: { result: 'WIN', twenties: 2 } }, tiedWith: undefined, tieReason: undefined },
            { participantId: 'p3', position: 3, points: 2, matchesWon: 1, matchesPlayed: 3, matchesLost: 2, matchesTied: 0, total20s: 1, totalPointsScored: 12, qualifiedForFinal: false, headToHeadRecord: {}, tiedWith: undefined, tieReason: undefined },
            { participantId: 'p4', position: 4, points: 0, matchesWon: 0, matchesPlayed: 3, matchesLost: 3, matchesTied: 0, total20s: 0, totalPointsScored: 6, qualifiedForFinal: false, headToHeadRecord: {}, tiedWith: undefined, tieReason: undefined }
          ],
          schedule: [
            { roundNumber: 1, matches: [
              { id: 'rr1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 6, total20sA: 2, total20sB: 0, gamesWonA: 2, gamesWonB: 0, tableNumber: 1, completedAt: 1000, duration: 600 },
              { id: 'rr2', participantA: 'p3', participantB: 'p4', status: 'COMPLETED', winner: 'p3', totalPointsA: 8, totalPointsB: 3, total20sA: 1, total20sB: 0, tableNumber: 2, completedAt: 1000, duration: 500 }
            ]},
            { roundNumber: 2, matches: [
              { id: 'rr3', participantA: 'p1', participantB: 'p3', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 4, tableNumber: 1, completedAt: 2000, duration: 700 },
              { id: 'rr4', participantA: 'p2', participantB: 'p4', status: 'COMPLETED', winner: 'p2', totalPointsA: 6, totalPointsB: 2, tableNumber: 2, completedAt: 2000, duration: 550 }
            ]},
            { roundNumber: 3, matches: [
              { id: 'rr5', participantA: 'p1', participantB: 'p4', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 1, tableNumber: 1, completedAt: 3000, duration: 400 },
              { id: 'rr6', participantA: 'p2', participantB: 'p3', status: 'COMPLETED', winner: 'p2', totalPointsA: 6, totalPointsB: 4, tableNumber: 2, completedAt: 3000, duration: 600 }
            ]}
          ]
        },
        {
          id: 'g2', name: 'Group B',
          participants: ['p5', 'p6', 'p7', 'p8'],
          standings: [
            { participantId: 'p5', position: 1, points: 4, matchesWon: 2, matchesPlayed: 3, matchesLost: 1, matchesTied: 0, total20s: 2, totalPointsScored: 20, qualifiedForFinal: true, tiedWith: ['p6'], tieReason: 'h2h' },
            { participantId: 'p6', position: 2, points: 4, matchesWon: 2, matchesPlayed: 3, matchesLost: 1, matchesTied: 0, total20s: 1, totalPointsScored: 19, qualifiedForFinal: true, tiedWith: ['p5'], tieReason: 'h2h' },
            { participantId: 'p7', position: 3, points: 4, matchesWon: 2, matchesPlayed: 3, matchesLost: 1, matchesTied: 0, total20s: 0, totalPointsScored: 18, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined },
            { participantId: 'p8', position: 4, points: 0, matchesWon: 0, matchesPlayed: 3, matchesLost: 3, matchesTied: 0, total20s: 0, totalPointsScored: 6, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined }
          ],
          schedule: []
        }
      ]
    };

    const result = cleanUndefined(groupStage);

    // roundsToPlay removed (was undefined in points mode)
    expect('roundsToPlay' in result).toBe(false);

    // Group A standings: no undefined fields
    for (const s of result.groups[0].standings) {
      for (const [key, value] of Object.entries(s)) {
        expect(value).not.toBeUndefined();
      }
    }

    // Group B: resolved ties preserved, unresolved removed
    expect(result.groups[1].standings[0].tiedWith).toEqual(['p6']);
    expect('tiedWith' in result.groups[1].standings[2]).toBe(false);

    // headToHeadRecord preserved intact
    expect(result.groups[0].standings[0].headToHeadRecord.p2.result).toBe('WIN');
  });

  it('bracket finalStage: single bracket with pending/completed matches', () => {
    const finalStage = {
      mode: 'SINGLE_BRACKET',
      isComplete: false,
      winner: undefined,
      silverWinner: undefined,
      consolationEnabled: false,
      thirdPlaceMatchEnabled: true,
      goldBracket: {
        rounds: [
          { name: 'semifinals', matches: [
            { id: 'sf1', participantA: 'p1', participantB: 'p4', seedA: 1, seedB: 4, status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 3, total20sA: 2, total20sB: 0, gamesWonA: 2, gamesWonB: 0, tableNumber: 1, startedAt: 1000, completedAt: 2000, duration: 1000 },
            { id: 'sf2', participantA: 'p2', participantB: 'p3', seedA: 2, seedB: 3, status: 'COMPLETED', winner: 'p2', totalPointsA: 7, totalPointsB: 5, total20sA: 1, total20sB: 1, gamesWonA: 2, gamesWonB: 1, tableNumber: 2, startedAt: 1000, completedAt: 2500, duration: 1500 }
          ]},
          { name: 'final', matches: [
            { id: 'f1', participantA: 'p1', participantB: 'p2', seedA: undefined, seedB: undefined, status: 'PENDING', winner: undefined, totalPointsA: undefined, totalPointsB: undefined, total20sA: undefined, total20sB: undefined, gamesWonA: undefined, gamesWonB: undefined, tableNumber: undefined, startedAt: undefined, completedAt: undefined, duration: undefined }
          ]}
        ],
        thirdPlaceMatch: {
          id: '3rd', participantA: 'p4', participantB: 'p3', status: 'PENDING', winner: undefined, tableNumber: undefined
        },
        config: {
          earlyRounds: { gameMode: 'rounds', roundsToPlay: 4, pointsToWin: undefined, matchesToWin: 1 },
          semifinal: { gameMode: 'points', pointsToWin: 7, roundsToPlay: undefined, matchesToWin: 2 },
          final: { gameMode: 'points', pointsToWin: 7, roundsToPlay: undefined, matchesToWin: 3 }
        }
      }
    };

    const result = cleanUndefined(finalStage);

    // Top-level undefined fields removed
    expect('winner' in result).toBe(false);
    expect('silverWinner' in result).toBe(false);

    // Completed match data preserved
    const sf1 = result.goldBracket.rounds[0].matches[0];
    expect(sf1.winner).toBe('p1');
    expect(sf1.totalPointsA).toBe(8);

    // Pending final: all undefined fields stripped
    const final = result.goldBracket.rounds[1].matches[0];
    expect('winner' in final).toBe(false);
    expect('totalPointsA' in final).toBe(false);
    expect('startedAt' in final).toBe(false);
    expect('seedA' in final).toBe(false);
    expect(final.status).toBe('PENDING');
    expect(final.participantA).toBe('p1');

    // Config: unused mode fields removed
    expect('pointsToWin' in result.goldBracket.config.earlyRounds).toBe(false);
    expect('roundsToPlay' in result.goldBracket.config.semifinal).toBe(false);
    expect(result.goldBracket.config.earlyRounds.roundsToPlay).toBe(4);
    expect(result.goldBracket.config.semifinal.pointsToWin).toBe(7);
  });

  it('split divisions: gold + silver brackets with consolation', () => {
    const finalStage = {
      mode: 'SPLIT_DIVISIONS',
      isComplete: false,
      winner: undefined,
      silverWinner: undefined,
      consolationEnabled: true,
      thirdPlaceMatchEnabled: true,
      goldBracket: {
        rounds: [
          { name: 'final', matches: [
            { id: 'gf1', participantA: 'p1', participantB: 'p2', status: 'PENDING', winner: undefined }
          ]}
        ],
        consolationBrackets: [{
          sourceRound: 'semifinals',
          rounds: [{ name: 'consolation-final', matches: [
            { id: 'gc1', participantA: 'p3', participantB: 'p4', status: 'PENDING', winner: undefined, totalPointsA: undefined }
          ]}]
        }]
      },
      silverBracket: {
        rounds: [
          { name: 'final', matches: [
            { id: 'sf1', participantA: 'p5', participantB: 'p6', status: 'COMPLETED', winner: 'p5', totalPointsA: 8, totalPointsB: 4 }
          ]}
        ],
        consolationBrackets: []
      }
    };

    const result = cleanUndefined(finalStage);

    // Gold pending match: undefined stripped
    const goldFinal = result.goldBracket.rounds[0].matches[0];
    expect('winner' in goldFinal).toBe(false);

    // Gold consolation pending: undefined stripped
    const goldConso = result.goldBracket.consolationBrackets[0].rounds[0].matches[0];
    expect('winner' in goldConso).toBe(false);
    expect('totalPointsA' in goldConso).toBe(false);

    // Silver completed: data preserved
    const silverFinal = result.silverBracket.rounds[0].matches[0];
    expect(silverFinal.winner).toBe('p5');
    expect(silverFinal.totalPointsA).toBe(8);
  });

  it('doubles tournament: partner fields and team names', () => {
    const groupStage = {
      type: 'ROUND_ROBIN',
      groups: [{
        id: 'g1',
        standings: [
          { participantId: 'team1', position: 1, points: 4, matchesWon: 2, matchesPlayed: 2, matchesLost: 0, matchesTied: 0, total20s: 3, totalPointsScored: 16, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined },
          { participantId: 'team2', position: 2, points: 2, matchesWon: 1, matchesPlayed: 2, matchesLost: 1, matchesTied: 0, total20s: 1, totalPointsScored: 10, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined },
          { participantId: 'team3', position: 3, points: 0, matchesWon: 0, matchesPlayed: 2, matchesLost: 2, matchesTied: 0, total20s: 0, totalPointsScored: 6, qualifiedForFinal: false, tiedWith: undefined, tieReason: undefined }
        ],
        schedule: []
      }]
    };
    const participants = [
      { id: 'team1', type: 'PAIR', name: 'Team Alpha', partnerId: undefined, partnerName: undefined, userId: 'u1', partnerUserId: 'u2', rankingSnapshot: 100, partnerRankingSnapshot: undefined },
      { id: 'team2', type: 'PAIR', name: 'Team Beta', partnerId: 'u3', partnerName: 'Partner 3', userId: 'u4', partnerUserId: undefined, rankingSnapshot: 90, partnerRankingSnapshot: 80 },
      { id: 'team3', type: 'PAIR', name: 'Team Gamma', partnerId: undefined, partnerName: undefined, userId: undefined, partnerUserId: undefined, rankingSnapshot: undefined, partnerRankingSnapshot: undefined }
    ];

    const resultGS = cleanUndefined(groupStage);
    const resultP = cleanUndefined(participants);

    // Standings clean
    for (const s of resultGS.groups[0].standings) {
      expect('tiedWith' in s).toBe(false);
    }

    // Participants: undefined partner fields removed
    expect('partnerId' in resultP[0]).toBe(false);
    expect('partnerName' in resultP[0]).toBe(false);
    expect('partnerRankingSnapshot' in resultP[0]).toBe(false);
    // Defined partner fields preserved
    expect(resultP[1].partnerId).toBe('u3');
    expect(resultP[1].partnerName).toBe('Partner 3');
    // All-undefined participant still has name and type
    expect(resultP[2].name).toBe('Team Gamma');
    expect(resultP[2].type).toBe('PAIR');
  });

  it('tournament with walkovers and BYE matches', () => {
    const pairings = [{
      roundNumber: 1,
      matches: [
        // Normal completed match
        { id: 'm1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 3, duration: 600 },
        // BYE walkover
        { id: 'm2', participantA: 'p3', participantB: 'BYE', status: 'WALKOVER', winner: 'p3', totalPointsA: 8, totalPointsB: 0, duration: undefined, tableNumber: undefined, startedAt: undefined, completedAt: undefined },
        // Force-finished (WO)
        { id: 'm3', participantA: 'p4', participantB: 'p5', status: 'WALKOVER', winner: 'p4', totalPointsA: undefined, totalPointsB: undefined, total20sA: undefined, total20sB: undefined, gamesWonA: undefined, gamesWonB: undefined, walkoverReason: 'NO_SHOW', duration: undefined }
      ]
    }];

    const result = cleanUndefined(pairings);

    // Normal match preserved
    expect(result[0].matches[0].winner).toBe('p1');
    expect(result[0].matches[0].duration).toBe(600);

    // BYE walkover: undefined fields removed, defined fields kept
    const bye = result[0].matches[1];
    expect(bye.winner).toBe('p3');
    expect('duration' in bye).toBe(false);
    expect('tableNumber' in bye).toBe(false);

    // Force-finished: reason preserved, undefined scores removed
    const wo = result[0].matches[2];
    expect(wo.walkoverReason).toBe('NO_SHOW');
    expect('totalPointsA' in wo).toBe(false);
    expect('gamesWonA' in wo).toBe(false);
  });

  it('completed tournament: finalStage with positions and ranking', () => {
    const tournament = {
      status: 'COMPLETED',
      completedAt: 1700000000000,
      participants: [
        { id: 'p1', name: 'Winner', finalPosition: 1, rankingPoints: 100, rankingDelta: undefined },
        { id: 'p2', name: 'Runner-up', finalPosition: 2, rankingPoints: 80, rankingDelta: undefined },
        { id: 'p3', name: 'Third', finalPosition: 3, rankingPoints: 60, rankingDelta: -5 },
        { id: 'p4', name: 'Fourth', finalPosition: 4, rankingPoints: undefined, rankingDelta: undefined }
      ],
      finalStage: {
        mode: 'SINGLE_BRACKET',
        isComplete: true,
        winner: 'p1',
        silverWinner: undefined,
        goldBracket: {
          rounds: [
            { name: 'final', matches: [
              { id: 'f1', participantA: 'p1', participantB: 'p2', status: 'COMPLETED', winner: 'p1', totalPointsA: 8, totalPointsB: 6, completedAt: 1700000000000 }
            ]}
          ],
          thirdPlaceMatch: {
            id: '3rd', participantA: 'p3', participantB: 'p4', status: 'COMPLETED', winner: 'p3', totalPointsA: 7, totalPointsB: 4
          }
        }
      }
    };

    const result = cleanUndefined(tournament);

    // Completed status preserved
    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).toBe(1700000000000);

    // Positions preserved
    expect(result.participants[0].finalPosition).toBe(1);
    expect(result.participants[1].finalPosition).toBe(2);

    // Undefined ranking fields removed
    expect('rankingDelta' in result.participants[0]).toBe(false);
    expect('rankingPoints' in result.participants[3]).toBe(false);
    // Defined ranking preserved
    expect(result.participants[2].rankingDelta).toBe(-5);

    // silverWinner removed (not split divisions)
    expect('silverWinner' in result.finalStage).toBe(false);
    expect(result.finalStage.winner).toBe('p1');
  });

  it('Swiss with NaN in standings (division by zero edge case)', () => {
    const standings = [
      { participantId: 'p1', points: 4, totalPointsScored: NaN, buchholz: Infinity, total20s: 0 },
      { participantId: 'p2', points: 2, totalPointsScored: 10, buchholz: -Infinity, total20s: NaN }
    ];

    const result = cleanUndefined(standings);

    expect(result[0].totalPointsScored).toBe(null);
    expect(result[0].buchholz).toBe(null);
    expect(result[1].buchholz).toBe(null);
    expect(result[1].total20s).toBe(null);
    // Normal values preserved
    expect(result[0].points).toBe(4);
    expect(result[1].totalPointsScored).toBe(10);
  });
});
