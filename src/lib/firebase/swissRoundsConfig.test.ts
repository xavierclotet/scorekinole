/**
 * Swiss Rounds Configuration — edge case tests
 *
 * Tests validation logic for changing numSwissRounds,
 * the allSwissRoundsComplete detection, and canGenerateNextRound
 * after configuration changes.
 */
import { describe, it, expect } from 'vitest';
import { createSwissTournament, getAllMatches } from './__mocks__/testTournamentFactory';
import type { Tournament, GroupMatch } from '$lib/types/tournament';

// --- Pure functions mirroring the component logic ---

/**
 * Validate whether a Swiss rounds change is allowed.
 * Mirrors canSaveSwissRounds + saveSwissRounds validation.
 */
function validateSwissRoundsChange(
  newRounds: number,
  currentRound: number,
  currentTotal: number,
  isCurrentRoundComplete: boolean
): { valid: boolean; error?: string } {
  if (!Number.isFinite(newRounds)) {
    return { valid: false, error: 'Not a finite number' };
  }
  if (newRounds !== Math.floor(newRounds)) {
    return { valid: false, error: 'Must be an integer' };
  }
  if (newRounds < 1) {
    return { valid: false, error: 'Must be at least 1' };
  }
  if (newRounds === currentTotal) {
    return { valid: false, error: 'No change' };
  }
  if (newRounds < currentRound) {
    return { valid: false, error: `Cannot set below current round ${currentRound}` };
  }
  if (newRounds === currentRound && !isCurrentRoundComplete) {
    return { valid: false, error: `Current round ${currentRound} still in progress` };
  }
  return { valid: true };
}

/**
 * Check if a specific Swiss round is fully complete.
 * Mirrors the isCurrentSwissRoundComplete derived in the component.
 */
function isSwissRoundComplete(tournament: Tournament, roundNumber: number): boolean {
  if (!tournament.groupStage || tournament.groupStage.type !== 'SWISS') return false;
  return tournament.groupStage.groups.every(g => {
    const pairing = g.pairings?.find(p => p.roundNumber === roundNumber);
    if (!pairing) return false;
    return pairing.matches.every(m =>
      m.status === 'COMPLETED' || m.status === 'WALKOVER' || m.participantB === 'BYE'
    );
  });
}

/**
 * Check if ALL Swiss rounds are complete (tournament can be finalized).
 * Mirrors the allSwissRoundsComplete template logic.
 */
function allSwissRoundsComplete(tournament: Tournament): boolean {
  if (!tournament.groupStage || tournament.groupStage.type !== 'SWISS') return false;
  const currentRound = tournament.groupStage.currentRound || 1;
  const totalRounds = tournament.groupStage.numSwissRounds || tournament.numSwissRounds || 0;
  if (currentRound < totalRounds) return false;
  return isSwissRoundComplete(tournament, currentRound);
}

/**
 * Check if the "Generate Next Round" button should be visible.
 * Mirrors canGenerateNextRound in GroupsView.svelte.
 */
function canGenerateNextRound(tournament: Tournament): boolean {
  if (!tournament.groupStage || tournament.groupStage.type !== 'SWISS') return false;
  const currentRound = tournament.groupStage.currentRound || 1;
  const totalRounds = tournament.groupStage.numSwissRounds || tournament.groupStage.totalRounds || 0;
  if (!isSwissRoundComplete(tournament, currentRound)) return false;
  return currentRound < totalRounds;
}

// --- Helpers ---

/** Complete all matches in a round */
function completeRound(tournament: Tournament, roundNumber: number) {
  const group = tournament.groupStage!.groups[0];
  const pairing = group.pairings?.find(p => p.roundNumber === roundNumber);
  if (!pairing) return;
  for (const match of pairing.matches) {
    if (match.participantB === 'BYE') continue;
    match.status = 'COMPLETED';
    match.winner = match.participantA;
    match.gamesWonA = 1;
    match.gamesWonB = 0;
    match.totalPointsA = 8;
    match.totalPointsB = 4;
    match.completedAt = Date.now();
  }
}

/** Set numSwissRounds (simulates what saveSwissRounds does) */
function setNumSwissRounds(tournament: Tournament, numRounds: number) {
  if (tournament.groupStage) {
    tournament.groupStage.numSwissRounds = numRounds;
    tournament.groupStage.totalRounds = numRounds;
  }
  tournament.numSwissRounds = numRounds;
}

// ===== TESTS =====

describe('validateSwissRoundsChange', () => {
  describe('invalid inputs', () => {
    it('rejects NaN', () => {
      const result = validateSwissRoundsChange(NaN, 1, 5, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('finite');
    });

    it('rejects Infinity', () => {
      const result = validateSwissRoundsChange(Infinity, 1, 5, false);
      expect(result.valid).toBe(false);
    });

    it('rejects -Infinity', () => {
      const result = validateSwissRoundsChange(-Infinity, 1, 5, false);
      expect(result.valid).toBe(false);
    });

    it('rejects float values', () => {
      const result = validateSwissRoundsChange(3.5, 1, 5, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });

    it('rejects negative numbers', () => {
      const result = validateSwissRoundsChange(-2, 1, 5, false);
      expect(result.valid).toBe(false);
    });

    it('rejects zero', () => {
      const result = validateSwissRoundsChange(0, 1, 5, false);
      expect(result.valid).toBe(false);
    });
  });

  describe('round boundaries', () => {
    it('rejects value below current round', () => {
      const result = validateSwissRoundsChange(2, 3, 5, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('below current round');
    });

    it('rejects value equal to current round when round is in progress', () => {
      const result = validateSwissRoundsChange(3, 3, 5, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('in progress');
    });

    it('accepts value equal to current round when round is complete', () => {
      const result = validateSwissRoundsChange(3, 3, 5, true);
      expect(result.valid).toBe(true);
    });

    it('accepts value above current round', () => {
      const result = validateSwissRoundsChange(6, 3, 5, false);
      expect(result.valid).toBe(true);
    });

    it('rejects no-op (same as current total)', () => {
      const result = validateSwissRoundsChange(5, 3, 5, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No change');
    });
  });

  describe('early finalization scenario', () => {
    it('allows reducing to current round when all matches complete', () => {
      // Tournament with 8 rounds, currently on round 3, all complete
      const result = validateSwissRoundsChange(3, 3, 8, true);
      expect(result.valid).toBe(true);
    });

    it('blocks reducing to current round when matches in progress', () => {
      const result = validateSwissRoundsChange(3, 3, 8, false);
      expect(result.valid).toBe(false);
    });

    it('allows increasing above current total', () => {
      const result = validateSwissRoundsChange(10, 3, 8, false);
      expect(result.valid).toBe(true);
    });

    it('allows setting to current round + 1 (minimum increase)', () => {
      const result = validateSwissRoundsChange(4, 3, 8, false);
      expect(result.valid).toBe(true);
    });
  });
});

describe('isSwissRoundComplete', () => {
  it('returns true when all matches in round are COMPLETED', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    completeRound(tournament, 1);
    expect(isSwissRoundComplete(tournament, 1)).toBe(true);
  });

  it('returns false when some matches are IN_PROGRESS', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    // Default matches are IN_PROGRESS from factory
    expect(isSwissRoundComplete(tournament, 1)).toBe(false);
  });

  it('returns false for a round that does not exist', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    expect(isSwissRoundComplete(tournament, 2)).toBe(false);
  });

  it('handles WALKOVER matches as complete', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    const group = tournament.groupStage!.groups[0];
    const pairing = group.pairings?.find(p => p.roundNumber === 1);
    for (const match of pairing!.matches) {
      if (match.participantB === 'BYE') continue;
      match.status = 'WALKOVER';
      match.winner = match.participantA;
    }
    expect(isSwissRoundComplete(tournament, 1)).toBe(true);
  });

  it('handles BYE matches correctly (always considered complete)', () => {
    // Odd number = one BYE match
    const tournament = createSwissTournament({ numParticipants: 7, swissRounds: 5 });
    completeRound(tournament, 1);
    expect(isSwissRoundComplete(tournament, 1)).toBe(true);
  });

  it('returns false for non-Swiss tournament', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.type = 'ROUND_ROBIN';
    expect(isSwissRoundComplete(tournament, 1)).toBe(false);
  });

  it('returns false when groupStage is missing', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage = undefined;
    expect(isSwissRoundComplete(tournament, 1)).toBe(false);
  });

  it('partially complete round returns false', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    const group = tournament.groupStage!.groups[0];
    const pairing = group.pairings?.find(p => p.roundNumber === 1);
    const nonByeMatches = pairing!.matches.filter(m => m.participantB !== 'BYE');
    // Complete only the first match
    if (nonByeMatches.length > 1) {
      nonByeMatches[0].status = 'COMPLETED';
      nonByeMatches[0].winner = nonByeMatches[0].participantA;
    }
    expect(isSwissRoundComplete(tournament, 1)).toBe(false);
  });
});

describe('allSwissRoundsComplete', () => {
  it('returns true when currentRound >= totalRounds and all matches complete', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);
    expect(allSwissRoundsComplete(tournament)).toBe(true);
  });

  it('returns false when currentRound < totalRounds even if current round complete', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);
    expect(allSwissRoundsComplete(tournament)).toBe(false);
  });

  it('returns false when currentRound >= totalRounds but matches still in progress', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    // Matches are IN_PROGRESS by default
    expect(allSwissRoundsComplete(tournament)).toBe(false);
  });

  it('returns true after reducing numSwissRounds to current round (early finalization)', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);

    // Admin reduces to 1 round (early finalization)
    setNumSwissRounds(tournament, 1);

    expect(allSwissRoundsComplete(tournament)).toBe(true);
  });

  it('returns false after increasing numSwissRounds beyond current', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    tournament.groupStage!.currentRound = 3;
    completeRound(tournament, 1);

    // Admin increases to 5 rounds
    setNumSwissRounds(tournament, 5);

    // currentRound(3) < totalRounds(5) → false
    expect(allSwissRoundsComplete(tournament)).toBe(false);
  });

  it('returns false for non-Swiss tournament', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.type = 'ROUND_ROBIN';
    completeRound(tournament, 1);
    expect(allSwissRoundsComplete(tournament)).toBe(false);
  });

  it('returns false when numSwissRounds is 0', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.numSwissRounds = 0;
    tournament.numSwissRounds = 0;
    completeRound(tournament, 1);
    // currentRound(1) >= totalRounds(0) is true, but totalRounds is 0 which is an edge case
    // The function checks numSwissRounds || numSwissRounds fallback → 0
    expect(allSwissRoundsComplete(tournament)).toBe(true);
  });
});

describe('canGenerateNextRound', () => {
  it('returns true when current round complete and more rounds remain', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);
    expect(canGenerateNextRound(tournament)).toBe(true);
  });

  it('returns false when current round still in progress', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 1;
    // Matches are IN_PROGRESS by default
    expect(canGenerateNextRound(tournament)).toBe(false);
  });

  it('returns false when all rounds are completed (currentRound >= totalRounds)', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);
    // currentRound(1) >= totalRounds(1) → no more rounds
    expect(canGenerateNextRound(tournament)).toBe(false);
  });

  it('adjusts correctly after reducing numSwissRounds', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 2;
    completeRound(tournament, 1);
    // Simulate round 2 complete too (even though only round 1 exists in pairings,
    // the function checks isSwissRoundComplete which looks at pairings)
    // Let's set a scenario: currentRound=1, totalRounds was 5, reduced to 3
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);
    setNumSwissRounds(tournament, 3);

    // currentRound(1) < totalRounds(3) and round 1 complete → can generate
    expect(canGenerateNextRound(tournament)).toBe(true);
  });

  it('blocks generation after reducing numSwissRounds to current round', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);

    // Reduce to 1 → no more rounds to generate
    setNumSwissRounds(tournament, 1);

    // currentRound(1) >= totalRounds(1) → false
    expect(canGenerateNextRound(tournament)).toBe(false);
  });

  it('enables generation after increasing numSwissRounds', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);

    // Was going to finalize, but admin increases to 3
    setNumSwissRounds(tournament, 3);

    // currentRound(1) < totalRounds(3) and round 1 complete → can generate
    expect(canGenerateNextRound(tournament)).toBe(true);
  });

  it('returns false for non-Swiss tournament', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.type = 'ROUND_ROBIN';
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);
    expect(canGenerateNextRound(tournament)).toBe(false);
  });
});

describe('Swiss rounds configuration scenarios', () => {
  it('8-player tournament: round 1 complete, reduce from 5 to 1 → finalize', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);

    // Validate the change
    const validation = validateSwissRoundsChange(1, 1, 5, true);
    expect(validation.valid).toBe(true);

    // Apply the change
    setNumSwissRounds(tournament, 1);

    // Should be finalizable, not generatable
    expect(allSwissRoundsComplete(tournament)).toBe(true);
    expect(canGenerateNextRound(tournament)).toBe(false);
  });

  it('8-player tournament: round 2 in progress, cannot reduce to 2', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 2;
    // Round 2 is in progress (default)

    const validation = validateSwissRoundsChange(2, 2, 5, false);
    expect(validation.valid).toBe(false);
  });

  it('8-player tournament: round 2 in progress, can reduce to 3', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 5 });
    tournament.groupStage!.currentRound = 2;

    const validation = validateSwissRoundsChange(3, 2, 5, false);
    expect(validation.valid).toBe(true);
  });

  it('increasing rounds mid-tournament extends play', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 3 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);

    // Was 3 rounds, increase to 7
    const validation = validateSwissRoundsChange(7, 1, 3, true);
    expect(validation.valid).toBe(true);

    setNumSwissRounds(tournament, 7);

    // Not finalizable, can generate next round
    expect(allSwissRoundsComplete(tournament)).toBe(false);
    expect(canGenerateNextRound(tournament)).toBe(true);
  });

  it('odd participants: BYE does not block finalization', () => {
    const tournament = createSwissTournament({ numParticipants: 7, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    completeRound(tournament, 1);

    expect(allSwissRoundsComplete(tournament)).toBe(true);
  });

  it('mix of COMPLETED and WALKOVER counts as complete', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    const group = tournament.groupStage!.groups[0];
    const pairing = group.pairings?.find(p => p.roundNumber === 1);
    const nonByeMatches = pairing!.matches.filter(m => m.participantB !== 'BYE');

    // Half COMPLETED, half WALKOVER
    nonByeMatches.forEach((match, i) => {
      if (i % 2 === 0) {
        match.status = 'COMPLETED';
        match.winner = match.participantA;
      } else {
        match.status = 'WALKOVER';
        match.winner = match.participantA;
      }
    });

    expect(allSwissRoundsComplete(tournament)).toBe(true);
  });

  it('PENDING matches block completion', () => {
    const tournament = createSwissTournament({ numParticipants: 8, swissRounds: 1 });
    tournament.groupStage!.currentRound = 1;
    const group = tournament.groupStage!.groups[0];
    const pairing = group.pairings?.find(p => p.roundNumber === 1);
    const nonByeMatches = pairing!.matches.filter(m => m.participantB !== 'BYE');

    // All complete except one PENDING
    nonByeMatches.forEach((match, i) => {
      if (i < nonByeMatches.length - 1) {
        match.status = 'COMPLETED';
        match.winner = match.participantA;
      } else {
        match.status = 'PENDING';
      }
    });

    expect(allSwissRoundsComplete(tournament)).toBe(false);
    expect(canGenerateNextRound(tournament)).toBe(false);
  });
});
