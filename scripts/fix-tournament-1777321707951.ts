/**
 * One-shot fix for tournament tournament-1777321707951-hboxi866q.
 *
 * Quarterfinal Xavi Clotet vs Isis González was entered with the wrong
 * winner: the last round was attributed to Isis when Xavi actually won it.
 * Real winner: Xavi Clotet. System winner: Isis González.
 * Tournament is COMPLETED; ranking points already written by the
 * onTournamentComplete Cloud Function.
 *
 * The script:
 *   1. Flips pointsA↔pointsB and twentiesA↔twentiesB in the LAST round of
 *      the QF, recomputes the match aggregates, and sets winner=Xavi.
 *      Leaves participantA/participantB positions intact.
 *   2. Symmetrically swaps Isis↔Xavi in every OTHER bracket match
 *      (semifinals, final, consolation, silver, thirdPlace).
 *   3. Swaps positions in finalStandings.
 *   4. Swaps tournamentRecord positions in /users/{xavi} and /users/{isis}
 *      and recomputes any aggregate ranking field if present.
 *
 * Usage:
 *   npx tsx scripts/fix-tournament-1777321707951.ts --dry-run
 *   npx tsx scripts/fix-tournament-1777321707951.ts --apply
 *
 * After --apply succeeds, delete this script and the snapshot JSON.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { swapBracketParticipants } from '../src/lib/algorithms/bracketSwap';
import type {
  Tournament,
  FinalStage,
  BracketMatch,
  BracketRound,
  BracketWithConfig,
  ConsolationBracket,
  TournamentParticipant,
  TournamentRecord,
} from '../src/lib/types/tournament';

// === Configuration ===
const TOURNAMENT_ID = 'tournament-1777321707951-hboxi866q';
const WRONG_WINNER_USER_ID = 'mkfa1f0m0QfDPDdzJSvgho0ZAzp1';   // Isis González
const RIGHT_WINNER_USER_ID = 'OrvBoj8jCLUp4RKZZe54JvqHM3K2';   // Xavi Clotet

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = resolve(__dirname, '../.firebase-keys/scorekinole-admin.json');
const SNAPSHOT_PATH = resolve(__dirname, `.fix-${TOURNAMENT_ID}.snapshot.json`);

// === Init firebase-admin ===
import { readFileSync } from 'fs';
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// === Args ===
const args = new Set(process.argv.slice(2));
const isApply = args.has('--apply');
const isDryRun = !isApply;

if (WRONG_WINNER_USER_ID === RIGHT_WINNER_USER_ID) {
  console.error('Refusing to run: WRONG and RIGHT user IDs are identical.');
  process.exit(1);
}

// =====================================================================
// Helpers (pure)
// =====================================================================

type RoundEntry = NonNullable<BracketMatch['rounds']>[number];

interface QfLocation {
  /** Where the match lives, for human-readable output. */
  description: string;
  /** Identifies the slot for downstream re-injection of overrides. */
  slot:
    | { kind: 'goldRound'; roundIndex: number; matchIndex: number }
    | { kind: 'silverRound'; roundIndex: number; matchIndex: number }
    | { kind: 'goldThirdPlace' }
    | { kind: 'silverThirdPlace' }
    | { kind: 'goldConsolation'; consolationIndex: number; roundIndex: number; matchIndex: number }
    | { kind: 'silverConsolation'; consolationIndex: number; roundIndex: number; matchIndex: number }
    | { kind: 'parallelRound'; bracketIndex: number; roundIndex: number; matchIndex: number }
    | { kind: 'parallelThirdPlace'; bracketIndex: number }
    | { kind: 'parallelConsolation'; bracketIndex: number; consolationIndex: number; roundIndex: number; matchIndex: number };
}

interface QfFindResult {
  match: BracketMatch;
  location: QfLocation;
  roundNumber?: number;
  totalRounds?: number;
  isThirdPlace?: boolean;
  bracketWithConfig?: BracketWithConfig;
}

function matchHasBothIds(m: BracketMatch, idA: string, idB: string): boolean {
  const a = m.participantA;
  const b = m.participantB;
  if (!a || !b) return false;
  return (a === idA && b === idB) || (a === idB && b === idA);
}

function findQfMatch(finalStage: FinalStage, idA: string, idB: string): QfFindResult | null {
  function scanBracket(
    bracket: BracketWithConfig,
    locFor: (kind: 'round' | 'thirdPlace' | 'consolation', extra?: any) => QfLocation,
    descPrefix: string
  ): QfFindResult | null {
    // Main rounds
    for (let ri = 0; ri < bracket.rounds.length; ri++) {
      const round = bracket.rounds[ri];
      for (let mi = 0; mi < round.matches.length; mi++) {
        const m = round.matches[mi];
        if (matchHasBothIds(m, idA, idB)) {
          return {
            match: m,
            location: locFor('round', { roundIndex: ri, matchIndex: mi }),
            roundNumber: round.roundNumber,
            totalRounds: bracket.totalRounds,
            isThirdPlace: false,
            bracketWithConfig: bracket,
          };
        }
      }
    }
    // Third place
    if (bracket.thirdPlaceMatch && matchHasBothIds(bracket.thirdPlaceMatch, idA, idB)) {
      return {
        match: bracket.thirdPlaceMatch,
        location: locFor('thirdPlace'),
        roundNumber: bracket.totalRounds,
        totalRounds: bracket.totalRounds,
        isThirdPlace: true,
        bracketWithConfig: bracket,
      };
    }
    // Consolation
    if (bracket.consolationBrackets) {
      for (let ci = 0; ci < bracket.consolationBrackets.length; ci++) {
        const cons = bracket.consolationBrackets[ci];
        for (let ri = 0; ri < cons.rounds.length; ri++) {
          const round = cons.rounds[ri];
          for (let mi = 0; mi < round.matches.length; mi++) {
            const m = round.matches[mi];
            if (matchHasBothIds(m, idA, idB)) {
              return {
                match: m,
                location: locFor('consolation', { consolationIndex: ci, roundIndex: ri, matchIndex: mi }),
                bracketWithConfig: bracket,
              };
            }
          }
        }
      }
    }
    return null;
  }

  // Gold
  const goldHit = scanBracket(
    finalStage.goldBracket,
    (kind, extra) => {
      if (kind === 'round') {
        return {
          description: `goldBracket.rounds[${extra.roundIndex}].matches[${extra.matchIndex}]`,
          slot: { kind: 'goldRound', roundIndex: extra.roundIndex, matchIndex: extra.matchIndex },
        };
      }
      if (kind === 'thirdPlace') {
        return {
          description: 'goldBracket.thirdPlaceMatch',
          slot: { kind: 'goldThirdPlace' },
        };
      }
      return {
        description: `goldBracket.consolationBrackets[${extra.consolationIndex}].rounds[${extra.roundIndex}].matches[${extra.matchIndex}]`,
        slot: {
          kind: 'goldConsolation',
          consolationIndex: extra.consolationIndex,
          roundIndex: extra.roundIndex,
          matchIndex: extra.matchIndex,
        },
      };
    },
    'gold'
  );
  if (goldHit) return goldHit;

  // Silver
  if (finalStage.silverBracket) {
    const silverHit = scanBracket(
      finalStage.silverBracket,
      (kind, extra) => {
        if (kind === 'round') {
          return {
            description: `silverBracket.rounds[${extra.roundIndex}].matches[${extra.matchIndex}]`,
            slot: { kind: 'silverRound', roundIndex: extra.roundIndex, matchIndex: extra.matchIndex },
          };
        }
        if (kind === 'thirdPlace') {
          return {
            description: 'silverBracket.thirdPlaceMatch',
            slot: { kind: 'silverThirdPlace' },
          };
        }
        return {
          description: `silverBracket.consolationBrackets[${extra.consolationIndex}].rounds[${extra.roundIndex}].matches[${extra.matchIndex}]`,
          slot: {
            kind: 'silverConsolation',
            consolationIndex: extra.consolationIndex,
            roundIndex: extra.roundIndex,
            matchIndex: extra.matchIndex,
          },
        };
      },
      'silver'
    );
    if (silverHit) return silverHit;
  }

  // Parallel brackets
  if (finalStage.parallelBrackets) {
    for (let bi = 0; bi < finalStage.parallelBrackets.length; bi++) {
      const named = finalStage.parallelBrackets[bi];
      const parHit = scanBracket(
        named.bracket,
        (kind, extra) => {
          if (kind === 'round') {
            return {
              description: `parallelBrackets[${bi}](${named.label}).rounds[${extra.roundIndex}].matches[${extra.matchIndex}]`,
              slot: { kind: 'parallelRound', bracketIndex: bi, roundIndex: extra.roundIndex, matchIndex: extra.matchIndex },
            };
          }
          if (kind === 'thirdPlace') {
            return {
              description: `parallelBrackets[${bi}](${named.label}).thirdPlaceMatch`,
              slot: { kind: 'parallelThirdPlace', bracketIndex: bi },
            };
          }
          return {
            description: `parallelBrackets[${bi}](${named.label}).consolationBrackets[${extra.consolationIndex}].rounds[${extra.roundIndex}].matches[${extra.matchIndex}]`,
            slot: {
              kind: 'parallelConsolation',
              bracketIndex: bi,
              consolationIndex: extra.consolationIndex,
              roundIndex: extra.roundIndex,
              matchIndex: extra.matchIndex,
            },
          };
        },
        `parallel[${bi}]`
      );
      if (parHit) return parHit;
    }
  }

  return null;
}

/**
 * Flip pointsA↔pointsB and twentiesA↔twentiesB in the LAST entry of the
 * rounds array. Returns a new array; original is untouched.
 */
function flipLastRound(rounds: RoundEntry[]): RoundEntry[] {
  if (rounds.length === 0) return rounds;
  const last = rounds[rounds.length - 1];
  const flipped: RoundEntry = {
    ...last,
    pointsA: last.pointsB,
    pointsB: last.pointsA,
    twentiesA: last.twentiesB,
    twentiesB: last.twentiesA,
  };
  return [...rounds.slice(0, -1), flipped];
}

interface PhaseConfigLite {
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;
  roundsToPlay?: number;
}

function getPhaseConfigLite(
  bracket: BracketWithConfig | undefined,
  roundNumber: number | undefined,
  totalRounds: number | undefined,
  isThirdPlace: boolean | undefined
): PhaseConfigLite {
  if (!bracket?.config) {
    return { gameMode: 'points', pointsToWin: 7 };
  }
  const cfg = bracket.config;
  const isFinal = roundNumber !== undefined && totalRounds !== undefined && roundNumber === totalRounds && !isThirdPlace;
  const isSemi = roundNumber !== undefined && totalRounds !== undefined && (roundNumber === totalRounds - 1 || isThirdPlace);
  if (isFinal) return cfg.final;
  if (isSemi) return cfg.semifinal;
  return cfg.earlyRounds;
}

interface AggregateResult {
  gamesWonA: number;
  gamesWonB: number;
  totalPointsA: number;
  totalPointsB: number;
  total20sA: number;
  total20sB: number;
  winnerSlot: 'A' | 'B' | 'TIE';
}

/**
 * Recompute per-match aggregates from a rounds array.
 *
 * Mirrors the logic in MatchResultDialog.svelte:
 *   - Points mode: a "game" = all rounds with the same gameNumber. Winner of
 *     a game requires sum-of-points >= pointsToWin AND lead >= 2.
 *   - Rounds mode: a "game" = a single round (the round itself is the game).
 *     Per the existing project code, winner is whoever has more points in that round.
 */
function recomputeAggregates(rounds: RoundEntry[], cfg: PhaseConfigLite): AggregateResult {
  const totalPointsA = rounds.reduce((s, r) => s + (r.pointsA ?? 0), 0);
  const totalPointsB = rounds.reduce((s, r) => s + (r.pointsB ?? 0), 0);
  const total20sA = rounds.reduce((s, r) => s + (r.twentiesA ?? 0), 0);
  const total20sB = rounds.reduce((s, r) => s + (r.twentiesB ?? 0), 0);

  let gamesWonA = 0;
  let gamesWonB = 0;

  if (cfg.gameMode === 'points') {
    const pointsToWin = cfg.pointsToWin ?? 7;
    const gameNumbers = Array.from(new Set(rounds.map(r => r.gameNumber ?? 1)));
    for (const gn of gameNumbers) {
      const gr = rounds.filter(r => (r.gameNumber ?? 1) === gn);
      const ptsA = gr.reduce((s, r) => s + (r.pointsA ?? 0), 0);
      const ptsB = gr.reduce((s, r) => s + (r.pointsB ?? 0), 0);
      if (ptsA >= pointsToWin && ptsA - ptsB >= 2) gamesWonA++;
      else if (ptsB >= pointsToWin && ptsB - ptsA >= 2) gamesWonB++;
    }
  } else {
    // Rounds mode: each round is a game, more points wins
    gamesWonA = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && (r.pointsA ?? 0) > (r.pointsB ?? 0)).length;
    gamesWonB = rounds.filter(r => r.pointsA !== null && r.pointsB !== null && (r.pointsB ?? 0) > (r.pointsA ?? 0)).length;
  }

  let winnerSlot: 'A' | 'B' | 'TIE';
  if (gamesWonA > gamesWonB) winnerSlot = 'A';
  else if (gamesWonB > gamesWonA) winnerSlot = 'B';
  else if (totalPointsA > totalPointsB) winnerSlot = 'A';
  else if (totalPointsB > totalPointsA) winnerSlot = 'B';
  else winnerSlot = 'TIE';

  return { gamesWonA, gamesWonB, totalPointsA, totalPointsB, total20sA, total20sB, winnerSlot };
}

/**
 * Replace a single bracket match inside a FinalStage at the given location.
 * Returns a new FinalStage (does not mutate input).
 */
function replaceMatchAt(finalStage: FinalStage, slot: QfLocation['slot'], newMatch: BracketMatch): FinalStage {
  function replaceInRounds(rounds: BracketRound[], roundIndex: number, matchIndex: number): BracketRound[] {
    return rounds.map((r, ri) =>
      ri !== roundIndex
        ? r
        : { ...r, matches: r.matches.map((m, mi) => (mi !== matchIndex ? m : newMatch)) }
    );
  }
  function replaceInConsolation(
    cons: ConsolationBracket[],
    consolationIndex: number,
    roundIndex: number,
    matchIndex: number
  ): ConsolationBracket[] {
    return cons.map((c, ci) =>
      ci !== consolationIndex ? c : { ...c, rounds: replaceInRounds(c.rounds, roundIndex, matchIndex) }
    );
  }

  switch (slot.kind) {
    case 'goldRound':
      return {
        ...finalStage,
        goldBracket: {
          ...finalStage.goldBracket,
          rounds: replaceInRounds(finalStage.goldBracket.rounds, slot.roundIndex, slot.matchIndex),
        },
      };
    case 'goldThirdPlace':
      return { ...finalStage, goldBracket: { ...finalStage.goldBracket, thirdPlaceMatch: newMatch } };
    case 'goldConsolation':
      return {
        ...finalStage,
        goldBracket: {
          ...finalStage.goldBracket,
          consolationBrackets: finalStage.goldBracket.consolationBrackets
            ? replaceInConsolation(
                finalStage.goldBracket.consolationBrackets,
                slot.consolationIndex,
                slot.roundIndex,
                slot.matchIndex
              )
            : undefined,
        },
      };
    case 'silverRound':
      if (!finalStage.silverBracket) return finalStage;
      return {
        ...finalStage,
        silverBracket: {
          ...finalStage.silverBracket,
          rounds: replaceInRounds(finalStage.silverBracket.rounds, slot.roundIndex, slot.matchIndex),
        },
      };
    case 'silverThirdPlace':
      if (!finalStage.silverBracket) return finalStage;
      return { ...finalStage, silverBracket: { ...finalStage.silverBracket, thirdPlaceMatch: newMatch } };
    case 'silverConsolation':
      if (!finalStage.silverBracket) return finalStage;
      return {
        ...finalStage,
        silverBracket: {
          ...finalStage.silverBracket,
          consolationBrackets: finalStage.silverBracket.consolationBrackets
            ? replaceInConsolation(
                finalStage.silverBracket.consolationBrackets,
                slot.consolationIndex,
                slot.roundIndex,
                slot.matchIndex
              )
            : undefined,
        },
      };
    case 'parallelRound':
      if (!finalStage.parallelBrackets) return finalStage;
      return {
        ...finalStage,
        parallelBrackets: finalStage.parallelBrackets.map((p, bi) =>
          bi !== slot.bracketIndex
            ? p
            : { ...p, bracket: { ...p.bracket, rounds: replaceInRounds(p.bracket.rounds, slot.roundIndex, slot.matchIndex) } }
        ),
      };
    case 'parallelThirdPlace':
      if (!finalStage.parallelBrackets) return finalStage;
      return {
        ...finalStage,
        parallelBrackets: finalStage.parallelBrackets.map((p, bi) =>
          bi !== slot.bracketIndex ? p : { ...p, bracket: { ...p.bracket, thirdPlaceMatch: newMatch } }
        ),
      };
    case 'parallelConsolation':
      if (!finalStage.parallelBrackets) return finalStage;
      return {
        ...finalStage,
        parallelBrackets: finalStage.parallelBrackets.map((p, bi) =>
          bi !== slot.bracketIndex
            ? p
            : {
                ...p,
                bracket: {
                  ...p.bracket,
                  consolationBrackets: p.bracket.consolationBrackets
                    ? replaceInConsolation(
                        p.bracket.consolationBrackets,
                        slot.consolationIndex,
                        slot.roundIndex,
                        slot.matchIndex
                      )
                    : undefined,
                },
              }
        ),
      };
  }
}

/**
 * Iterate over every BracketMatch in a FinalStage with a stable description.
 */
function* iterAllMatches(finalStage: FinalStage): Generator<{ desc: string; match: BracketMatch }> {
  function* fromBracket(bracket: BracketWithConfig, prefix: string): Generator<{ desc: string; match: BracketMatch }> {
    for (let ri = 0; ri < bracket.rounds.length; ri++) {
      const round = bracket.rounds[ri];
      for (let mi = 0; mi < round.matches.length; mi++) {
        yield { desc: `${prefix}.rounds[${ri}].matches[${mi}]`, match: round.matches[mi] };
      }
    }
    if (bracket.thirdPlaceMatch) {
      yield { desc: `${prefix}.thirdPlaceMatch`, match: bracket.thirdPlaceMatch };
    }
    if (bracket.consolationBrackets) {
      for (let ci = 0; ci < bracket.consolationBrackets.length; ci++) {
        const cons = bracket.consolationBrackets[ci];
        for (let ri = 0; ri < cons.rounds.length; ri++) {
          const round = cons.rounds[ri];
          for (let mi = 0; mi < round.matches.length; mi++) {
            yield {
              desc: `${prefix}.consolationBrackets[${ci}].rounds[${ri}].matches[${mi}]`,
              match: round.matches[mi],
            };
          }
        }
      }
    }
  }

  yield* fromBracket(finalStage.goldBracket, 'goldBracket');
  if (finalStage.silverBracket) yield* fromBracket(finalStage.silverBracket, 'silverBracket');
  if (finalStage.parallelBrackets) {
    for (let bi = 0; bi < finalStage.parallelBrackets.length; bi++) {
      const named = finalStage.parallelBrackets[bi];
      yield* fromBracket(named.bracket, `parallelBrackets[${bi}](${named.label})`);
    }
  }
}

/**
 * Diff two FinalStage trees and return per-match changes (excluding the QF
 * which is overwritten directly).
 */
function diffDownstream(
  before: FinalStage,
  after: FinalStage,
  excludeMatchId: string
): Array<{ desc: string; matchId: string; changes: string[] }> {
  const beforeMatches = new Map<string, { desc: string; match: BracketMatch }>();
  for (const entry of iterAllMatches(before)) {
    beforeMatches.set(entry.match.id, entry);
  }
  const out: Array<{ desc: string; matchId: string; changes: string[] }> = [];
  for (const entry of iterAllMatches(after)) {
    if (entry.match.id === excludeMatchId) continue;
    const beforeEntry = beforeMatches.get(entry.match.id);
    if (!beforeEntry) continue;
    const b = beforeEntry.match;
    const a = entry.match;
    const changes: string[] = [];
    if (b.participantA !== a.participantA) changes.push(`participantA: ${b.participantA ?? '∅'} → ${a.participantA ?? '∅'}`);
    if (b.participantB !== a.participantB) changes.push(`participantB: ${b.participantB ?? '∅'} → ${a.participantB ?? '∅'}`);
    if (b.winner !== a.winner) changes.push(`winner: ${b.winner ?? '∅'} → ${a.winner ?? '∅'}`);
    if ((b.noShowParticipant ?? null) !== (a.noShowParticipant ?? null)) {
      changes.push(`noShowParticipant: ${b.noShowParticipant ?? '∅'} → ${a.noShowParticipant ?? '∅'}`);
    }
    if ((b.currentHammer ?? null) !== (a.currentHammer ?? null)) {
      changes.push(`currentHammer: ${b.currentHammer ?? '∅'} → ${a.currentHammer ?? '∅'}`);
    }
    if (changes.length > 0) {
      out.push({ desc: entry.desc, matchId: entry.match.id, changes });
    }
  }
  return out;
}

// =====================================================================
// Pretty printers
// =====================================================================

function shortId(id: string | undefined | null): string {
  if (!id) return '∅';
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function nameFor(participants: TournamentParticipant[], id: string | undefined | null): string {
  if (!id) return '∅';
  const p = participants.find(p => p.id === id || p.userId === id);
  if (!p) return shortId(id);
  return `${p.name}${p.partner ? ` / ${p.partner.name}` : ''} [${shortId(id)}]`;
}

function fmtRound(r: RoundEntry | undefined): string {
  if (!r) return '∅';
  return `g${r.gameNumber}/r${r.roundInGame} ptsA=${r.pointsA ?? 'null'} ptsB=${r.pointsB ?? 'null'} 20sA=${r.twentiesA} 20sB=${r.twentiesB}${r.hammer ? ` hammer=${shortId(r.hammer)}` : ''}`;
}

function printQfDiff(
  match: BracketMatch,
  loc: QfLocation,
  participants: TournamentParticipant[],
  beforeRounds: RoundEntry[],
  afterRounds: RoundEntry[],
  beforeAgg: AggregateResult,
  afterAgg: AggregateResult,
  newWinnerId: string | undefined,
  expectedWinnerId: string,
  cfg: PhaseConfigLite
) {
  console.log('--- QF MATCH ---');
  console.log(`  location: ${loc.description}`);
  console.log(`  match.id: ${match.id}`);
  console.log(`  status: ${match.status}`);
  console.log(`  phase config: gameMode=${cfg.gameMode} pointsToWin=${cfg.pointsToWin ?? '∅'} roundsToPlay=${cfg.roundsToPlay ?? '∅'}`);
  console.log(`  participantA: ${nameFor(participants, match.participantA)}`);
  console.log(`  participantB: ${nameFor(participants, match.participantB)}`);
  console.log(`  current winner: ${nameFor(participants, match.winner)}`);
  console.log(`  current aggregates: gamesWon ${beforeAgg.gamesWonA}-${beforeAgg.gamesWonB}, totalPoints ${beforeAgg.totalPointsA}-${beforeAgg.totalPointsB}, 20s ${beforeAgg.total20sA}-${beforeAgg.total20sB}`);
  console.log(`  current rounds (${beforeRounds.length}):`);
  beforeRounds.forEach((r, i) => console.log(`    [${i}] ${fmtRound(r)}`));
  console.log('  → PROPOSED:');
  console.log(`  proposed last round: ${fmtRound(afterRounds[afterRounds.length - 1])}`);
  console.log(`  proposed aggregates: gamesWon ${afterAgg.gamesWonA}-${afterAgg.gamesWonB}, totalPoints ${afterAgg.totalPointsA}-${afterAgg.totalPointsB}, 20s ${afterAgg.total20sA}-${afterAgg.total20sB}`);
  console.log(`  proposed winner slot: ${afterAgg.winnerSlot}`);
  console.log(`  proposed winner ID: ${nameFor(participants, newWinnerId)}`);
  if (newWinnerId !== expectedWinnerId) {
    console.log(`  ⚠️  WARNING: proposed winner does NOT match expected (${nameFor(participants, expectedWinnerId)}).`);
    console.log('  ⚠️  Simple last-round flip did not produce the expected outcome.');
    console.log('  ⚠️  Human intervention required before --apply.');
  } else {
    console.log(`  ✓ proposed winner matches expected (${nameFor(participants, expectedWinnerId)}).`);
  }
}

function printDownstreamDiff(
  diffs: Array<{ desc: string; matchId: string; changes: string[] }>,
  participants: TournamentParticipant[]
) {
  console.log('--- DOWNSTREAM BRACKET CHANGES ---');
  if (diffs.length === 0) {
    console.log('  (none — neither participant appears anywhere else in the bracket)');
    return;
  }
  // Translate ID changes to names for readability
  const idToName = (id: string) => {
    const m = id.match(/(.{6}….{4}|[A-Za-z0-9]{4,})/);
    void m;
    return id;
  };
  for (const d of diffs) {
    console.log(`  ${d.desc} (id=${d.matchId})`);
    for (const c of d.changes) {
      // Replace IDs in the change string with names where possible
      const replaced = c.replace(/[A-Za-z0-9]{20,}/g, m => nameFor(participants, m));
      console.log(`    - ${replaced}`);
    }
    void idToName;
  }
}

function printFinalStandingsDiff(
  before: TournamentParticipant[],
  after: TournamentParticipant[]
) {
  console.log('--- finalStandings (participants[].finalPosition) DIFF ---');
  let any = false;
  const beforeById = new Map(before.map(p => [p.id, p]));
  for (const p of after) {
    const b = beforeById.get(p.id);
    if (!b) continue;
    if ((b.finalPosition ?? null) !== (p.finalPosition ?? null)) {
      any = true;
      console.log(`  ${p.name}${p.partner ? ` / ${p.partner.name}` : ''} (${shortId(p.id)}): finalPosition ${b.finalPosition ?? '∅'} → ${p.finalPosition ?? '∅'}`);
    }
  }
  if (!any) console.log('  (none)');
}

function printUserDiff(
  label: string,
  userDocBefore: Record<string, unknown>,
  recordBefore: TournamentRecord | undefined,
  recordAfter: TournamentRecord
) {
  console.log(`--- USER RECORD: ${label} ---`);
  console.log(`  top-level keys: ${Object.keys(userDocBefore).sort().join(', ')}`);
  console.log('  current tournamentRecord:');
  console.log(`    ${JSON.stringify(recordBefore)}`);
  console.log('  proposed tournamentRecord:');
  console.log(`    ${JSON.stringify(recordAfter)}`);
  if (!recordBefore) return;
  const fieldChanges: string[] = [];
  for (const k of new Set([...Object.keys(recordBefore), ...Object.keys(recordAfter)]) as Set<keyof TournamentRecord>) {
    if ((recordBefore as any)[k] !== (recordAfter as any)[k]) {
      fieldChanges.push(`${String(k)}: ${JSON.stringify((recordBefore as any)[k])} → ${JSON.stringify((recordAfter as any)[k])}`);
    }
  }
  if (fieldChanges.length > 0) {
    console.log('  changed fields:');
    fieldChanges.forEach(c => console.log(`    - ${c}`));
  } else {
    console.log('  (no field changes for this user)');
  }
}

// =====================================================================
// Main
// =====================================================================

async function main() {
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Tournament: ${TOURNAMENT_ID}`);
  console.log(`Wrong winner: ${WRONG_WINNER_USER_ID}`);
  console.log(`Right winner: ${RIGHT_WINNER_USER_ID}`);
  console.log(`Service account: ${SERVICE_ACCOUNT_PATH}`);
  console.log(`Snapshot path (only used on --apply): ${SNAPSHOT_PATH}`);
  console.log('');

  if (isApply) {
    console.error('--apply not implemented yet (Task 13). Re-run with --dry-run.');
    process.exit(1);
  }

  // ----- READ -----
  const tournamentRef = db.collection('tournaments').doc(TOURNAMENT_ID);
  const wrongUserRef = db.collection('users').doc(WRONG_WINNER_USER_ID);
  const rightUserRef = db.collection('users').doc(RIGHT_WINNER_USER_ID);

  const [tSnap, wSnap, rSnap] = await Promise.all([
    tournamentRef.get(),
    wrongUserRef.get(),
    rightUserRef.get(),
  ]);

  if (!tSnap.exists) {
    console.error(`Tournament document /tournaments/${TOURNAMENT_ID} does not exist.`);
    process.exit(1);
  }
  if (!wSnap.exists) {
    console.error(`User document /users/${WRONG_WINNER_USER_ID} (wrong winner) does not exist.`);
    process.exit(1);
  }
  if (!rSnap.exists) {
    console.error(`User document /users/${RIGHT_WINNER_USER_ID} (right winner) does not exist.`);
    process.exit(1);
  }

  const tournament = tSnap.data() as unknown as Tournament;
  const wrongUser = wSnap.data() as Record<string, unknown>;
  const rightUser = rSnap.data() as Record<string, unknown>;

  console.log(`Tournament name: ${tournament.name}`);
  console.log(`Tournament status: ${tournament.status}`);
  console.log(`Tournament gameType: ${tournament.gameType}`);
  console.log(`Total participants: ${tournament.participants?.length ?? 0}`);
  console.log('');

  if (!tournament.finalStage) {
    console.error('Tournament has no finalStage; cannot locate QF match. Aborting.');
    process.exit(1);
  }

  // Match user IDs to participant IDs (participants reference users via .userId or .partner.userId)
  const wrongParticipant = tournament.participants?.find(
    p => p.userId === WRONG_WINNER_USER_ID || p.partner?.userId === WRONG_WINNER_USER_ID
  );
  const rightParticipant = tournament.participants?.find(
    p => p.userId === RIGHT_WINNER_USER_ID || p.partner?.userId === RIGHT_WINNER_USER_ID
  );
  if (!wrongParticipant || !rightParticipant) {
    console.error('Could not locate one or both users among tournament.participants[].');
    console.error(`  wrong (userId=${WRONG_WINNER_USER_ID}): ${wrongParticipant ? 'found' : 'NOT FOUND'}`);
    console.error(`  right (userId=${RIGHT_WINNER_USER_ID}): ${rightParticipant ? 'found' : 'NOT FOUND'}`);
    process.exit(1);
  }

  console.log(`Wrong winner participant: ${wrongParticipant.name} (id=${wrongParticipant.id})`);
  console.log(`Right winner participant: ${rightParticipant.name} (id=${rightParticipant.id})`);
  console.log(`  finalPosition: wrong=${wrongParticipant.finalPosition ?? '∅'} right=${rightParticipant.finalPosition ?? '∅'}`);
  console.log('');

  // For doubles tournaments, the bracket-level participantA/B references the
  // participant.id, NOT the user UID. The script's WRONG/RIGHT IDs are user
  // UIDs, so we look the QF up by participant.id pair. For singles the
  // participant.id may match the user UID or be a generated id; we use
  // participant.id for the bracket search either way.
  const wrongPid = wrongParticipant.id;
  const rightPid = rightParticipant.id;

  // ----- LOCATE QF -----
  const qfHit = findQfMatch(tournament.finalStage, wrongPid, rightPid);
  if (!qfHit) {
    console.error(`Could not locate any bracket match with both ${wrongPid} and ${rightPid}. Aborting.`);
    process.exit(1);
  }

  const qfMatch = qfHit.match;
  const qfLoc = qfHit.location;
  const qfMatchId = qfMatch.id;

  // ----- PLAN QF FIX -----
  const cfg = getPhaseConfigLite(qfHit.bracketWithConfig, qfHit.roundNumber, qfHit.totalRounds, qfHit.isThirdPlace);
  const beforeRounds = qfMatch.rounds ?? [];
  if (beforeRounds.length === 0) {
    console.error(`QF match ${qfMatchId} has no rounds[]; cannot flip last round.`);
    process.exit(1);
  }

  const newRounds = flipLastRound(beforeRounds);

  const beforeAgg = recomputeAggregates(beforeRounds, cfg);
  const afterAgg = recomputeAggregates(newRounds, cfg);

  // Map A/B winner-slot back to participant.id
  let newWinnerPid: string | undefined;
  if (afterAgg.winnerSlot === 'A') newWinnerPid = qfMatch.participantA;
  else if (afterAgg.winnerSlot === 'B') newWinnerPid = qfMatch.participantB;
  else newWinnerPid = undefined;

  printQfDiff(qfMatch, qfLoc, tournament.participants ?? [], beforeRounds, newRounds, beforeAgg, afterAgg, newWinnerPid, rightPid, cfg);
  console.log('');

  // Build the proposed new QF match. We DO NOT touch participantA/participantB
  // here (they are correct — only the score was attributed wrong). We do
  // recompute aggregates and the winner.
  const proposedQf: BracketMatch = {
    ...qfMatch,
    rounds: newRounds,
    gamesWonA: afterAgg.gamesWonA,
    gamesWonB: afterAgg.gamesWonB,
    totalPointsA: afterAgg.totalPointsA,
    totalPointsB: afterAgg.totalPointsB,
    total20sA: afterAgg.total20sA,
    total20sB: afterAgg.total20sB,
    winner: newWinnerPid,
  };

  // ----- PLAN DOWNSTREAM SWAP -----
  // First do the symmetric swap on the entire FinalStage (this also swaps
  // inside the QF, but we'll override the QF immediately afterwards).
  const swappedFinalStage = swapBracketParticipants(tournament.finalStage, wrongPid, rightPid);
  // Now overwrite the QF with our carefully constructed match (preserving
  // its original participantA/participantB ordering).
  const finalStageAfter = replaceMatchAt(swappedFinalStage, qfLoc.slot, proposedQf);

  const downstreamDiffs = diffDownstream(tournament.finalStage, finalStageAfter, qfMatchId);
  printDownstreamDiff(downstreamDiffs, tournament.participants ?? []);
  console.log('');

  // Also report the top-level finalStage.winner / silverWinner change (if any)
  const fsBefore = tournament.finalStage;
  const fsAfter = finalStageAfter;
  const topLevelChanges: string[] = [];
  if (fsBefore.winner !== fsAfter.winner) {
    topLevelChanges.push(`finalStage.winner: ${nameFor(tournament.participants ?? [], fsBefore.winner)} → ${nameFor(tournament.participants ?? [], fsAfter.winner)}`);
  }
  if (fsBefore.silverWinner !== fsAfter.silverWinner) {
    topLevelChanges.push(`finalStage.silverWinner: ${nameFor(tournament.participants ?? [], fsBefore.silverWinner)} → ${nameFor(tournament.participants ?? [], fsAfter.silverWinner)}`);
  }
  if (topLevelChanges.length > 0) {
    console.log('--- finalStage TOP-LEVEL WINNER CHANGES ---');
    topLevelChanges.forEach(c => console.log(`  - ${c}`));
    console.log('');
  }

  // ----- PLAN finalStandings (participant.finalPosition) SWAP -----
  const newParticipants = (tournament.participants ?? []).map(p => {
    if (p.id === wrongPid) return { ...p, finalPosition: rightParticipant.finalPosition };
    if (p.id === rightPid) return { ...p, finalPosition: wrongParticipant.finalPosition };
    return p;
  });
  printFinalStandingsDiff(tournament.participants ?? [], newParticipants);
  console.log('');

  // ----- PLAN USER RECORDS SWAP -----
  const wrongTournaments = (wrongUser.tournaments as TournamentRecord[] | undefined) ?? [];
  const rightTournaments = (rightUser.tournaments as TournamentRecord[] | undefined) ?? [];

  const wrongRecord = wrongTournaments.find(r => r.tournamentId === TOURNAMENT_ID);
  const rightRecord = rightTournaments.find(r => r.tournamentId === TOURNAMENT_ID);

  if (!wrongRecord) {
    console.error(`Wrong-winner user ${WRONG_WINNER_USER_ID} has no tournamentRecord for ${TOURNAMENT_ID}. Aborting.`);
    process.exit(1);
  }
  if (!rightRecord) {
    console.error(`Right-winner user ${RIGHT_WINNER_USER_ID} has no tournamentRecord for ${TOURNAMENT_ID}. Aborting.`);
    process.exit(1);
  }

  // Swap finalPosition + ranking deltas/aftermath. rankingBefore stays
  // (it's a snapshot of pre-tournament ranking). rankingDelta and
  // rankingAfter swap, because they were computed from the swapped position.
  const newWrongRecord: TournamentRecord = {
    ...wrongRecord,
    finalPosition: rightRecord.finalPosition,
    rankingDelta: rightRecord.rankingDelta,
    // rankingBefore is each user's own pre-tournament snapshot — KEEP it.
    // rankingAfter = rankingBefore + (new rankingDelta).
    rankingAfter: (wrongRecord.rankingBefore ?? 0) + (rightRecord.rankingDelta ?? 0),
  };
  const newRightRecord: TournamentRecord = {
    ...rightRecord,
    finalPosition: wrongRecord.finalPosition,
    rankingDelta: wrongRecord.rankingDelta,
    rankingAfter: (rightRecord.rankingBefore ?? 0) + (wrongRecord.rankingDelta ?? 0),
  };

  printUserDiff(`WRONG (${WRONG_WINNER_USER_ID})`, wrongUser, wrongRecord, newWrongRecord);
  console.log('');
  printUserDiff(`RIGHT (${RIGHT_WINNER_USER_ID})`, rightUser, rightRecord, newRightRecord);
  console.log('');

  // ----- DISCOVERY -----
  console.log('--- DISCOVERY: full top-level structure of each user doc ---');
  const summarize = (label: string, doc: Record<string, unknown>) => {
    console.log(`  ${label}:`);
    for (const [k, v] of Object.entries(doc).sort(([a], [b]) => a.localeCompare(b))) {
      let summary: string;
      if (Array.isArray(v)) summary = `Array(${v.length})`;
      else if (v === null) summary = 'null';
      else if (typeof v === 'object') summary = `Object(keys=${Object.keys(v as object).length})`;
      else if (typeof v === 'string') summary = v.length > 80 ? `"${v.slice(0, 77)}..."` : JSON.stringify(v);
      else summary = String(v);
      console.log(`    ${k}: ${summary}`);
    }
  };
  summarize(`/users/${WRONG_WINNER_USER_ID}`, wrongUser);
  console.log('');
  summarize(`/users/${RIGHT_WINNER_USER_ID}`, rightUser);
  console.log('');

  // Tournament records: count + show all entries (compact) so we can
  // detect any other aggregate arrays / cached fields.
  console.log(`  /users/${WRONG_WINNER_USER_ID}.tournaments: ${wrongTournaments.length} record(s)`);
  wrongTournaments.forEach((r, i) => console.log(`    [${i}] ${r.tournamentId} pos=${r.finalPosition} delta=${r.rankingDelta}`));
  console.log(`  /users/${RIGHT_WINNER_USER_ID}.tournaments: ${rightTournaments.length} record(s)`);
  rightTournaments.forEach((r, i) => console.log(`    [${i}] ${r.tournamentId} pos=${r.finalPosition} delta=${r.rankingDelta}`));
  console.log('');

  console.log('Dry run complete. Re-run with --apply to commit.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
