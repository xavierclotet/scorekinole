/**
 * Tests for getUserActiveMatches
 *
 * Validates that players (both primary and partner in doubles) can find their
 * pending and in-progress matches across all tournament phases:
 * - Round Robin group stage
 * - Swiss group stage
 * - Final stage (gold/silver brackets, consolation, third place)
 * - Doubles partner detection
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('./config', () => ({
  db: {},
  isFirebaseEnabled: () => true
}));
vi.mock('./tournaments', () => ({
  parseTournamentData: (data: unknown) => data,
  getTournament: vi.fn()
}));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  runTransaction: vi.fn(),
  serverTimestamp: () => Date.now()
}));

const { getUserActiveMatches, getPendingMatchesForUser, getAllPendingMatches } = await import('./tournamentMatches');

import {
  createTestTournament,
  createSwissTournament,
  createMultiGroupTournament
} from './__mocks__/testTournamentFactory';
import type { Tournament, TournamentParticipant, GroupMatch, BracketMatch } from '$lib/types/tournament';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Make a participant REGISTERED with a userId */
function registerParticipant(tournament: Tournament, participantId: string, userId: string) {
  const p = tournament.participants.find(p => p.id === participantId);
  if (p) {
    p.type = 'REGISTERED';
    p.userId = userId;
  }
}

/** Register a partner with a userId (doubles) */
function registerPartner(tournament: Tournament, participantId: string, partnerUserId: string) {
  const p = tournament.participants.find(p => p.id === participantId);
  if (p && p.partner) {
    p.partner.type = 'REGISTERED';
    p.partner.userId = partnerUserId;
  }
}

/** Set all matches in a round to a given status */
function setRoundStatus(tournament: Tournament, groupIndex: number, roundIndex: number, status: string) {
  const group = tournament.groupStage!.groups[groupIndex];
  const rounds = group.schedule || group.pairings || [];
  for (const match of rounds[roundIndex].matches) {
    if (match.participantB !== 'BYE') {
      match.status = status as GroupMatch['status'];
    }
  }
}

/** Find a specific match involving a participant */
function findMatchForParticipant(tournament: Tournament, participantId: string, groupIndex = 0): GroupMatch | undefined {
  const group = tournament.groupStage!.groups[groupIndex];
  const rounds = group.schedule || group.pairings || [];
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.participantA === participantId || match.participantB === participantId) {
        return match;
      }
    }
  }
  return undefined;
}

/** Create a minimal bracket tournament for final stage testing */
function createBracketTournament(numParticipants = 4): Tournament {
  const participants: TournamentParticipant[] = [];
  for (let i = 0; i < numParticipants; i++) {
    participants.push({
      id: `p-${i + 1}`,
      type: 'REGISTERED',
      userId: `user-${i + 1}`,
      name: `Player ${i + 1}`,
      status: 'ACTIVE',
      rankingSnapshot: 1000 - i * 10
    });
  }

  const semifinal1: BracketMatch = {
    id: 'sf-1',
    participantA: 'p-1',
    participantB: 'p-4',
    status: 'PENDING',
    tableNumber: 1
  };
  const semifinal2: BracketMatch = {
    id: 'sf-2',
    participantA: 'p-2',
    participantB: 'p-3',
    status: 'PENDING',
    tableNumber: 2
  };
  const finalMatch: BracketMatch = {
    id: 'final-1',
    participantA: undefined,
    participantB: undefined,
    status: 'PENDING'
  };
  const thirdPlace: BracketMatch = {
    id: 'third-1',
    participantA: undefined,
    participantB: undefined,
    status: 'PENDING'
  };

  return {
    id: 'bracket-test',
    key: 'BRK01',
    name: 'Bracket Test',
    country: 'ES',
    city: 'Barcelona',
    status: 'FINAL_STAGE',
    phaseType: 'TWO_PHASE',
    gameType: 'singles',
    show20s: true,
    showHammer: true,
    numTables: 4,
    rankingConfig: { enabled: false },
    participants,
    finalStage: {
      isComplete: false,
      goldBracket: {
        rounds: [
          { roundNumber: 1, name: 'Semifinals', matches: [semifinal1, semifinal2] },
          { roundNumber: 2, name: 'Finals', matches: [finalMatch] }
        ],
        thirdPlaceMatch: thirdPlace,
        config: {
          earlyRounds: { gameMode: 'points', pointsToWin: 7, matchesToWin: 1 },
          semifinal: { gameMode: 'points', pointsToWin: 100, matchesToWin: 2 },
          final: { gameMode: 'points', pointsToWin: 100, matchesToWin: 3 }
        }
      }
    },
    createdAt: Date.now(),
    createdBy: { userId: 'admin-1', userName: 'Admin' },
    updatedAt: Date.now()
  } as Tournament;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('getUserActiveMatches', () => {
  describe('singles - Round Robin', () => {
    it('finds PENDING matches for a registered user', async () => {
      const tournament = createTestTournament({ numParticipants: 6 });
      // Set all matches to PENDING (factory sets them to IN_PROGRESS)
      for (const round of tournament.groupStage!.groups[0].schedule!) {
        for (const match of round.matches) {
          match.status = 'PENDING';
          match.tableNumber = 1;
        }
      }
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.phase === 'GROUP')).toBe(true);
      // All matches should involve player-1
      for (const m of matches) {
        const match = m.match as GroupMatch;
        expect(
          match.participantA === 'player-1' || match.participantB === 'player-1'
        ).toBe(true);
      }
    });

    it('finds IN_PROGRESS matches for a registered user', async () => {
      const tournament = createTestTournament({ numParticipants: 6 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      // At least one should be in progress
      expect(matches.some(m => m.isInProgress)).toBe(true);
    });

    it('returns empty for a user not in the tournament', async () => {
      const tournament = createTestTournament({ numParticipants: 6 });

      const matches = await getUserActiveMatches(tournament, 'user-stranger');

      expect(matches).toEqual([]);
    });

    it('does not return COMPLETED matches', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      // Complete all matches
      for (const round of tournament.groupStage!.groups[0].schedule!) {
        for (const match of round.matches) {
          match.status = 'COMPLETED';
        }
      }

      const matches = await getUserActiveMatches(tournament, 'user-alice');
      expect(matches).toEqual([]);
    });

    it('does not return BYE matches', async () => {
      // 5 players → one BYE per round
      const tournament = createTestTournament({ numParticipants: 5 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      // No match should have BYE as opponent
      for (const m of matches) {
        const match = m.match as GroupMatch;
        expect(match.participantA).not.toBe('BYE');
        expect(match.participantB).not.toBe('BYE');
      }
    });

    it('returns correct participant names', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      // Names should be resolved (not IDs)
      for (const m of matches) {
        expect(m.participantAName).not.toBe('TBD');
        expect(m.participantBName).not.toBe('TBD');
        expect(m.participantAName).not.toBe('Unknown');
        expect(m.participantBName).not.toBe('Unknown');
      }
    });

    it('includes groupId and roundNumber for group matches', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      for (const m of matches) {
        expect(m.groupId).toBe('group-1');
        expect(m.roundNumber).toBeDefined();
        expect(m.roundNumber).toBeGreaterThan(0);
      }
    });
  });

  describe('singles - Swiss', () => {
    it('finds matches in Swiss pairings', async () => {
      const tournament = createSwissTournament({ numParticipants: 8 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].phase).toBe('GROUP');
    });

    it('finds matches for any participant regardless of side A or B', async () => {
      const tournament = createSwissTournament({ numParticipants: 8 });

      // Find any match involving player-4 (could be on either side)
      const group = tournament.groupStage!.groups[0];
      const allMatches = group.pairings!.flatMap(p => p.matches);
      const p4Match = allMatches.find(m => m.participantA === 'player-4' || m.participantB === 'player-4');
      expect(p4Match).toBeDefined();

      registerParticipant(tournament, 'player-4', 'user-bob');
      const matches = await getUserActiveMatches(tournament, 'user-bob');

      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('doubles - partner detection', () => {
    it('finds matches for the primary player in doubles', async () => {
      const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
    });

    it('finds matches for the partner player in doubles', async () => {
      const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
      // Register the partner with a userId
      registerPartner(tournament, 'player-1', 'user-partner-alice');

      const matches = await getUserActiveMatches(tournament, 'user-partner-alice');

      expect(matches.length).toBeGreaterThan(0);
      // The matches should be the same ones that player-1 would see
      for (const m of matches) {
        const match = m.match as GroupMatch;
        expect(
          match.participantA === 'player-1' || match.participantB === 'player-1'
        ).toBe(true);
      }
    });

    it('partner and primary player see the same matches', async () => {
      const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
      registerParticipant(tournament, 'player-1', 'user-alice');
      registerPartner(tournament, 'player-1', 'user-partner-alice');

      const primaryMatches = await getUserActiveMatches(tournament, 'user-alice');
      const partnerMatches = await getUserActiveMatches(tournament, 'user-partner-alice');

      expect(primaryMatches.length).toBe(partnerMatches.length);
      const primaryMatchIds = primaryMatches.map(m => m.match.id).sort();
      const partnerMatchIds = partnerMatches.map(m => m.match.id).sort();
      expect(primaryMatchIds).toEqual(partnerMatchIds);
    });

    it('returns empty for a guest partner without userId', async () => {
      const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
      // partner has no userId (GUEST) — cannot look up via userId
      const matches = await getUserActiveMatches(tournament, 'nonexistent-user');
      expect(matches).toEqual([]);
    });

    it('shows team names for doubles matches', async () => {
      const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
      registerParticipant(tournament, 'player-1', 'user-alice');

      // Set a team name
      const p1 = tournament.participants.find(p => p.id === 'player-1')!;
      p1.teamName = 'Los Invencibles';

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      // One of the names should be the team name
      const hasTeamName = matches.some(m =>
        m.participantAName === 'Los Invencibles' || m.participantBName === 'Los Invencibles'
      );
      expect(hasTeamName).toBe(true);
    });

    it('shows "Player / Partner" format when no team name', async () => {
      const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      // Should show "Player 1 / Partner 1" format
      const hasSlashFormat = matches.some(m =>
        m.participantAName.includes(' / ') || m.participantBName.includes(' / ')
      );
      expect(hasSlashFormat).toBe(true);
    });
  });

  describe('multi-group tournaments', () => {
    it('finds matches in the correct group', async () => {
      const tournament = createMultiGroupTournament(12, 2);
      // player-1 is in group 0 (snake draft: 1,3,5... go to group 0)
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
      // All matches should be from group-1
      expect(matches.every(m => m.groupId === 'group-1')).toBe(true);
    });

    it('user in different group still finds their matches', async () => {
      const tournament = createMultiGroupTournament(12, 2);
      // player-2 goes to group 1 (snake draft: even indices)
      registerParticipant(tournament, 'player-2', 'user-bob');

      const matches = await getUserActiveMatches(tournament, 'user-bob');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.groupId === 'group-2')).toBe(true);
    });
  });

  describe('final stage - bracket matches', () => {
    it('finds semifinal match for a user', async () => {
      const tournament = createBracketTournament(4);

      const matches = await getUserActiveMatches(tournament, 'user-1');

      expect(matches).toHaveLength(1);
      expect(matches[0].phase).toBe('FINAL');
      expect(matches[0].bracketRoundName).toBe('Semifinals');
      expect(matches[0].match.id).toBe('sf-1');
    });

    it('does not find bracket match with unresolved participants (TBD)', async () => {
      const tournament = createBracketTournament(4);

      // Final match has undefined participants — should not be returned
      const matches = await getUserActiveMatches(tournament, 'user-1');

      // Only the semifinal, not the final (which has undefined participants)
      const finalMatches = matches.filter(m => m.bracketRoundName === 'Finals');
      expect(finalMatches).toHaveLength(0);
    });

    it('finds third place match when participants are set', async () => {
      const tournament = createBracketTournament(4);

      // Simulate: semifinals done, third place match ready
      const goldBracket = tournament.finalStage!.goldBracket!;
      for (const match of goldBracket.rounds![0].matches) {
        match.status = 'COMPLETED';
      }
      goldBracket.thirdPlaceMatch!.participantA = 'p-3';
      goldBracket.thirdPlaceMatch!.participantB = 'p-4';
      goldBracket.thirdPlaceMatch!.status = 'PENDING';
      goldBracket.thirdPlaceMatch!.tableNumber = 1;

      const matches = await getUserActiveMatches(tournament, 'user-3');

      expect(matches.length).toBeGreaterThanOrEqual(1);
      const thirdPlaceMatches = matches.filter(m => m.bracketRoundName === 'Tercer Puesto');
      expect(thirdPlaceMatches).toHaveLength(1);
    });

    it('returns gameConfig with correct matchesToWin for semifinals', async () => {
      const tournament = createBracketTournament(4);

      const matches = await getUserActiveMatches(tournament, 'user-1');

      expect(matches).toHaveLength(1);
      // Semifinals should use semifinal config (matchesToWin: 2)
      expect(matches[0].gameConfig.matchesToWin).toBe(2);
    });

    it('isComplete=true blocks final stage matches', async () => {
      const tournament = createBracketTournament(4);
      tournament.finalStage!.isComplete = true;

      const matches = await getUserActiveMatches(tournament, 'user-1');

      expect(matches).toEqual([]);
    });
  });

  describe('groupStage.isComplete gate', () => {
    it('returns no group matches when groupStage.isComplete is true', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');
      tournament.groupStage!.isComplete = true;

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches).toEqual([]);
    });

    it('returns group matches when groupStage.isComplete is false', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles tournament with no groupStage and no finalStage', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');
      delete (tournament as any).groupStage;
      delete (tournament as any).finalStage;

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches).toEqual([]);
    });

    it('handles group with no schedule and no pairings', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');
      delete (tournament.groupStage!.groups[0] as any).schedule;

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      expect(matches).toEqual([]);
    });

    it('user registered in multiple teams (unlikely but handles gracefully)', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      // Same userId on two different participants
      registerParticipant(tournament, 'player-1', 'user-alice');
      registerParticipant(tournament, 'player-2', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      // Should find matches for both participants
      const participantIds = new Set<string>();
      for (const m of matches) {
        const match = m.match as GroupMatch;
        if (match.participantA === 'player-1' || match.participantB === 'player-1') participantIds.add('player-1');
        if (match.participantA === 'player-2' || match.participantB === 'player-2') participantIds.add('player-2');
      }
      expect(participantIds.size).toBe(2);
    });

    it('tableNumber is passed through for matches', async () => {
      const tournament = createTestTournament({ numParticipants: 4 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      // Factory assigns table numbers
      for (const m of matches) {
        expect(m.tableNumber).toBeDefined();
      }
    });

    it('handles mixed statuses: some COMPLETED, some PENDING in same round', async () => {
      const tournament = createTestTournament({ numParticipants: 6 });
      registerParticipant(tournament, 'player-1', 'user-alice');

      // Complete some matches in round 1 but leave player-1's match pending
      const round1 = tournament.groupStage!.groups[0].schedule![0];
      for (const match of round1.matches) {
        if (match.participantA !== 'player-1' && match.participantB !== 'player-1') {
          match.status = 'COMPLETED';
        }
      }

      const matches = await getUserActiveMatches(tournament, 'user-alice');

      // Should still find player-1's match
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});

// ─── getPendingMatchesForUser (modal flow for logged-in users) ───────────────

describe('getPendingMatchesForUser', () => {
  it('finds matches for a registered user (singles)', async () => {
    const tournament = createTestTournament({ numParticipants: 6 });
    registerParticipant(tournament, 'player-1', 'user-alice');

    const matches = await getPendingMatchesForUser(tournament, 'user-alice');

    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const match = m.match as GroupMatch;
      expect(match.participantA === 'player-1' || match.participantB === 'player-1').toBe(true);
    }
  });

  it('returns empty for user not in tournament', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });

    const matches = await getPendingMatchesForUser(tournament, 'user-stranger');

    expect(matches).toEqual([]);
  });

  it('finds matches for a registered partner in doubles', async () => {
    const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
    registerPartner(tournament, 'player-2', 'user-partner-bob');

    const matches = await getPendingMatchesForUser(tournament, 'user-partner-bob');

    expect(matches.length).toBeGreaterThan(0);
    // All matches should involve player-2 (the team where partner is registered)
    for (const m of matches) {
      const match = m.match as GroupMatch;
      expect(match.participantA === 'player-2' || match.participantB === 'player-2').toBe(true);
    }
  });

  it('primary and partner see the same matches via getPendingMatchesForUser', async () => {
    const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
    registerParticipant(tournament, 'player-1', 'user-alice');
    registerPartner(tournament, 'player-1', 'user-partner-alice');

    const primaryMatches = await getPendingMatchesForUser(tournament, 'user-alice');
    const partnerMatches = await getPendingMatchesForUser(tournament, 'user-partner-alice');

    expect(primaryMatches.length).toBe(partnerMatches.length);
    expect(primaryMatches.length).toBeGreaterThan(0);

    const primaryIds = primaryMatches.map(m => m.match.id).sort();
    const partnerIds = partnerMatches.map(m => m.match.id).sort();
    expect(primaryIds).toEqual(partnerIds);
  });

  it('returns IN_PROGRESS matches before PENDING matches', async () => {
    const tournament = createTestTournament({ numParticipants: 6 });
    registerParticipant(tournament, 'player-1', 'user-alice');

    // Set one match to PENDING, rest stay IN_PROGRESS (factory default)
    const rounds = tournament.groupStage!.groups[0].schedule!;
    let setOneToPending = false;
    for (const round of rounds) {
      for (const match of round.matches) {
        if ((match.participantA === 'player-1' || match.participantB === 'player-1') && !setOneToPending) {
          match.status = 'PENDING';
          match.tableNumber = 1;
          setOneToPending = true;
        }
      }
    }

    const matches = await getPendingMatchesForUser(tournament, 'user-alice');

    // IN_PROGRESS matches come first, then PENDING
    const firstInProgressIdx = matches.findIndex(m => m.isInProgress);
    const firstPendingIdx = matches.findIndex(m => !m.isInProgress);

    if (firstPendingIdx !== -1 && firstInProgressIdx !== -1) {
      expect(firstInProgressIdx).toBeLessThan(firstPendingIdx);
    }
  });

  it('guest partner without userId cannot find matches', async () => {
    const tournament = createTestTournament({ numParticipants: 4, gameType: 'doubles' });
    // Partner is GUEST — no userId set

    const matches = await getPendingMatchesForUser(tournament, 'some-random-id');

    expect(matches).toEqual([]);
  });

  describe('Swiss tournaments', () => {
    it('finds matches for registered user in Swiss pairings', async () => {
      const tournament = createSwissTournament({ numParticipants: 8 });
      registerParticipant(tournament, 'player-3', 'user-charlie');

      const matches = await getPendingMatchesForUser(tournament, 'user-charlie');

      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const match = m.match as GroupMatch;
        expect(match.participantA === 'player-3' || match.participantB === 'player-3').toBe(true);
      }
    });

    it('finds matches for registered partner in Swiss doubles', async () => {
      const tournament = createSwissTournament({ numParticipants: 6, gameType: 'doubles' });
      registerPartner(tournament, 'player-1', 'user-partner-one');

      const matches = await getPendingMatchesForUser(tournament, 'user-partner-one');

      expect(matches.length).toBeGreaterThan(0);
    });
  });
});

// ─── getAllPendingMatches (modal flow for guest/non-logged users) ─────────────

describe('getAllPendingMatches', () => {
  it('returns all PENDING and IN_PROGRESS matches for Round Robin', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });

    const matches = await getAllPendingMatches(tournament);

    // C(4,2) = 6 total matches in a 4-player RR
    // Factory sets all to IN_PROGRESS, so all 6 should be returned
    expect(matches.length).toBe(6);
  });

  it('does not return COMPLETED matches', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });

    // Complete all matches
    for (const round of tournament.groupStage!.groups[0].schedule!) {
      for (const match of round.matches) {
        match.status = 'COMPLETED';
      }
    }

    const matches = await getAllPendingMatches(tournament);

    expect(matches).toEqual([]);
  });

  it('excludes BYE matches', async () => {
    const tournament = createTestTournament({ numParticipants: 5 });

    const matches = await getAllPendingMatches(tournament);

    for (const m of matches) {
      const match = m.match as GroupMatch;
      expect(match.participantB).not.toBe('BYE');
    }
  });

  it('returns matches for Swiss pairings', async () => {
    const tournament = createSwissTournament({ numParticipants: 8 });

    const matches = await getAllPendingMatches(tournament);

    // 8 players = 4 matches per round, all set to IN_PROGRESS by factory
    expect(matches.length).toBe(4);
    expect(matches[0].phase).toBe('GROUP');
  });

  it('returns bracket matches for FINAL_STAGE', async () => {
    const tournament = createBracketTournament(4);

    const matches = await getAllPendingMatches(tournament);

    // 2 semifinals are PENDING with both participants set
    expect(matches.length).toBe(2);
    expect(matches.every(m => m.phase === 'FINAL')).toBe(true);
  });

  it('does not return bracket matches with unresolved participants', async () => {
    const tournament = createBracketTournament(4);

    const matches = await getAllPendingMatches(tournament);

    // Finals match has undefined participants — should be excluded
    const finalMatches = matches.filter(m => m.bracketRoundName === 'Finals');
    expect(finalMatches).toHaveLength(0);
  });

  it('returns all matches from all groups in multi-group tournament', async () => {
    const tournament = createMultiGroupTournament(12, 2);

    const matches = await getAllPendingMatches(tournament);

    // Both groups should have matches
    const groups = new Set(matches.map(m => m.groupId));
    expect(groups.size).toBe(2);
  });

  it('guest user sees all matches without needing userId', async () => {
    // This is the key test: a guest with the tournament key should see ALL matches
    const tournament = createTestTournament({ numParticipants: 6, gameType: 'doubles' });
    // No participants have userId — all are GUEST

    const matches = await getAllPendingMatches(tournament);

    // Should return all non-BYE pending/in-progress matches
    expect(matches.length).toBeGreaterThan(0);
    // Names should use "Player / Partner" format for doubles
    for (const m of matches) {
      expect(m.participantAName).toBeTruthy();
      expect(m.participantBName).toBeTruthy();
    }
  });

  it('includes tableNumber when assigned', async () => {
    const tournament = createTestTournament({ numParticipants: 4 });

    const matches = await getAllPendingMatches(tournament);

    // Factory assigns table numbers
    expect(matches.some(m => m.tableNumber !== undefined)).toBe(true);
  });
});
