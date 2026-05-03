import type { BracketMatch, BracketRound, BracketWithConfig, ConsolationBracket, FinalStage } from '$lib/types/tournament';

function swapId(value: string | undefined | null, a: string, b: string): string | undefined {
  if (value === a) return b;
  if (value === b) return a;
  return value ?? undefined;
}

function collectIds(finalStage: FinalStage): Set<string> {
  const ids = new Set<string>();

  function addId(v: string | undefined | null) {
    if (v) ids.add(v);
  }

  function scanMatch(m: BracketMatch) {
    addId(m.participantA);
    addId(m.participantB);
    addId(m.winner);
    addId(m.noShowParticipant);
    addId(m.currentHammer);
  }

  function scanRounds(rounds: BracketRound[]) {
    for (const r of rounds) r.matches.forEach(scanMatch);
  }

  function scanBracket(b: BracketWithConfig) {
    scanRounds(b.rounds);
    if (b.thirdPlaceMatch) scanMatch(b.thirdPlaceMatch);
    b.consolationBrackets?.forEach(c => scanRounds(c.rounds));
  }

  scanBracket(finalStage.goldBracket);
  if (finalStage.silverBracket) scanBracket(finalStage.silverBracket);
  finalStage.parallelBrackets?.forEach(p => scanBracket(p.bracket));
  addId(finalStage.winner);
  addId(finalStage.silverWinner);

  return ids;
}

function swapMatch(match: BracketMatch, a: string, b: string): BracketMatch {
  return {
    ...match,
    participantA: swapId(match.participantA, a, b),
    participantB: swapId(match.participantB, a, b),
    winner: swapId(match.winner, a, b),
    noShowParticipant: swapId(match.noShowParticipant, a, b),
    currentHammer: swapId(match.currentHammer, a, b),
  };
}

function swapRounds(rounds: BracketRound[], a: string, b: string): BracketRound[] {
  return rounds.map(r => ({
    ...r,
    matches: r.matches.map(m => swapMatch(m, a, b)),
  }));
}

function swapConsolationBracket(cb: ConsolationBracket, a: string, b: string): ConsolationBracket {
  return {
    ...cb,
    rounds: swapRounds(cb.rounds, a, b),
  };
}

function swapBracketWithConfig(bracket: BracketWithConfig, a: string, b: string): BracketWithConfig {
  return {
    ...bracket,
    rounds: swapRounds(bracket.rounds, a, b),
    thirdPlaceMatch: bracket.thirdPlaceMatch ? swapMatch(bracket.thirdPlaceMatch, a, b) : undefined,
    consolationBrackets: bracket.consolationBrackets?.map(c => swapConsolationBracket(c, a, b)),
  };
}

/**
 * Swap two participant IDs symmetrically across an entire FinalStage.
 *
 * Pure: returns a new FinalStage, never mutates the input.
 *
 * Used by one-shot scripts that fix swapped participants in a tournament's
 * bracket data (and potentially by future admin UI flows). Covers all bracket
 * variants: gold, silver, consolation sub-brackets, third-place match, and
 * parallel brackets (A/B/C Finals).
 */
export function swapBracketParticipants(
  finalStage: FinalStage,
  participantId1: string,
  participantId2: string
): FinalStage {
  if (participantId1 === participantId2) {
    throw new Error('swapBracketParticipants: participantId1 and participantId2 must differ');
  }

  const a = participantId1;
  const b = participantId2;

  const present = collectIds(finalStage);
  if (!present.has(a) || !present.has(b)) {
    return finalStage;
  }

  return {
    ...finalStage,
    goldBracket: swapBracketWithConfig(finalStage.goldBracket, a, b),
    silverBracket: finalStage.silverBracket
      ? swapBracketWithConfig(finalStage.silverBracket, a, b)
      : undefined,
    parallelBrackets: finalStage.parallelBrackets?.map(p => ({
      ...p,
      bracket: swapBracketWithConfig(p.bracket, a, b),
    })),
    winner: swapId(finalStage.winner, a, b),
    silverWinner: swapId(finalStage.silverWinner, a, b),
  };
}
