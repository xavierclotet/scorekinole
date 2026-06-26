import { toEpochMillis } from './tournamentSummaryCore';

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

export interface RawParticipant {
  id: string;
  userId?: string;
  name: string;
  status?: string;
  finalPosition?: number;
  partner?: { userId?: string; name: string };
}

export interface RawTournament {
  id: string;
  name: string;
  status: string;
  gameType: 'singles' | 'doubles';
  isTest?: boolean;
  tournamentDate?: unknown;   // epoch number or Firestore Timestamp
  completedAt?: unknown;
  rankingConfig?: { tier?: string };
  participants: RawParticipant[];
  groupStage?: { groups?: Array<{
    schedule?: Array<{ matches?: RawMatch[] }>;
    pairings?: Array<{ matches?: RawMatch[] }>;
  }> };
  finalStage?: {
    goldBracket?: RawBracket;
    silverBracket?: RawBracket;
    parallelBrackets?: Array<{ bracket?: RawBracket }>;
  };
}

interface RawBracket {
  rounds?: Array<{ name?: string; matches?: RawMatch[] }>;
  thirdPlaceMatch?: RawMatch;
  consolationBrackets?: Array<{ rounds?: Array<{ matches?: RawMatch[] }> }>;
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
  byYear: Record<string, CounterBlock>;
  records: { maxTwentiesInRound: RecordRef | null; maxTwentiesInGame: RecordRef | null; bestWinStreak: number };
  singlesTitles: number; singlesPodiums: number;
  doublesTitles: number; doublesPodiums: number;
  doublesResults: DoublesResult[];
}

export function emptyPlayerStats(userId: string): PlayerStats {
  return {
    userId, displayName: '',
    byYear: {},
    records: { maxTwentiesInRound: null, maxTwentiesInGame: null, bestWinStreak: 0 },
    singlesTitles: 0, singlesPodiums: 0, doublesTitles: 0, doublesPodiums: 0, doublesResults: [],
  };
}

function tournamentMillis(t: RawTournament): number {
  return toEpochMillis(t.tournamentDate) ?? toEpochMillis(t.completedAt) ?? 0;
}
function yearOf(ms: number): string { return String(new Date(ms).getUTCFullYear()); }

function activeParticipants(t: RawTournament): RawParticipant[] {
  return t.participants.filter((p) => p.status === 'ACTIVE' || !p.status);
}

/** All bracket matches with their phase ('final' for the championship final, else 'ko'). */
function* bracketMatches(t: RawTournament): Generator<{ match: RawMatch; phase: MatchPhase }> {
  const fs = t.finalStage;
  if (!fs) return;
  const brackets: (RawBracket | undefined)[] = [
    fs.goldBracket, fs.silverBracket,
    ...(fs.parallelBrackets ?? []).map((nb) => nb.bracket),
  ];
  for (const br of brackets) {
    if (!br) continue;
    for (const round of br.rounds ?? []) {
      const phase: MatchPhase = round.name === 'Final' ? 'final' : 'ko';
      for (const m of round.matches ?? []) yield { match: m, phase };
    }
    if (br.thirdPlaceMatch) yield { match: br.thirdPlaceMatch, phase: 'ko' };
    for (const cb of br.consolationBrackets ?? [])
      for (const round of cb.rounds ?? [])
        for (const m of round.matches ?? []) yield { match: m, phase: 'ko' };
  }
}

/** All group-stage matches (round robin `schedule` + swiss `pairings`). */
function* groupMatchesIter(t: RawTournament): Generator<RawMatch> {
  for (const g of t.groupStage?.groups ?? []) {
    for (const r of g.schedule ?? []) for (const m of r.matches ?? []) yield m;
    for (const r of g.pairings ?? []) for (const m of r.matches ?? []) yield m;
  }
}

export function computeUserStats(userId: string, tournaments: RawTournament[]): PlayerStats {
  const stats = emptyPlayerStats(userId);
  const sorted = [...tournaments]
    .filter((t) => t.status === 'COMPLETED' && t.isTest !== true)
    .sort((a, b) => tournamentMillis(a) - tournamentMillis(b));

  // Win-streak timeline: { ms, won } for each singles match the user played.
  const timeline: Array<{ ms: number; won: boolean }> = [];

  for (const t of sorted) {
    const part = t.participants.find(
      (p) => p.userId === userId || p.partner?.userId === userId
    );
    if (!part) continue;

    const ms = tournamentMillis(t);
    const year = yearOf(ms);
    stats.displayName = part.userId === userId ? part.name : (part.partner?.name ?? part.name);

    const pos = part.finalPosition ?? 0;
    const totalTeams = activeParticipants(t).length;

    if (t.gameType === 'doubles') {
      if (pos === 1) stats.doublesTitles += 1;
      if (pos > 0 && pos <= 3) stats.doublesPodiums += 1;
      const partnerName = part.userId === userId ? (part.partner?.name ?? '') : part.name;
      const partnerId = part.userId === userId ? (part.partner?.userId ?? null) : (part.userId ?? null);
      stats.doublesResults.push({
        tournamentId: t.id, date: ms, tournamentName: t.name,
        category: t.rankingConfig?.tier ?? 'OPEN',
        partnerId, partnerName, rank: pos, totalTeams,
      });
      continue; // doubles never contributes singles round counters
    }

    // ---- singles ----
    if (pos === 1) stats.singlesTitles += 1;
    if (pos > 0 && pos <= 3) stats.singlesPodiums += 1;

    const block = stats.byYear[year] ?? (stats.byYear[year] = emptyBlock());
    const nameById = new Map(t.participants.map((p) => [p.id, p.name]));

    const all: Array<{ match: RawMatch; phase: MatchPhase }> = [
      ...[...groupMatchesIter(t)].map((match) => ({ match, phase: 'group' as MatchPhase })),
      ...bracketMatches(t),
    ];

    for (const { match, phase } of all) {
      if (match.participantA !== part.id && match.participantB !== part.id) continue;
      if (!match.winner && !match.rounds) continue; // unplayed / TBD
      const ctx = accumulateMatch(block, match, part.id, phase);

      if (match.winner) timeline.push({ ms, won: match.winner === part.id });

      const oppId = match.participantA === part.id ? match.participantB : match.participantA;
      const opponentName = (oppId && nameById.get(oppId)) || undefined;
      if (ctx.maxTwentiesInRound > (stats.records.maxTwentiesInRound?.value ?? -1)) {
        stats.records.maxTwentiesInRound = {
          value: ctx.maxTwentiesInRound, tournamentId: t.id, tournamentName: t.name, date: ms, opponentName,
        };
      }
      if (ctx.maxTwentiesInGame > (stats.records.maxTwentiesInGame?.value ?? -1)) {
        stats.records.maxTwentiesInGame = {
          value: ctx.maxTwentiesInGame, tournamentId: t.id, tournamentName: t.name, date: ms, opponentName,
        };
      }
    }
  }

  // Longest consecutive run of wins over the chronological timeline.
  timeline.sort((a, b) => a.ms - b.ms);
  let cur = 0;
  for (const m of timeline) { cur = m.won ? cur + 1 : 0; if (cur > stats.records.bestWinStreak) stats.records.bestWinStreak = cur; }

  return stats;
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
