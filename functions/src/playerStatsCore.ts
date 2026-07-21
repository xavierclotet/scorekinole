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
  medalMatches: number;     medalMatchesWon: number;    // semifinal + final + 3rd-place
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
    medalMatches: 0, medalMatchesWon: 0,
    marginSum: 0, marginWins: 0,
  };
}

/** Add every numeric field of `src` into `target` (mutates target). */
export function addBlock(target: CounterBlock, src: CounterBlock): void {
  (Object.keys(target) as (keyof CounterBlock)[]).forEach((k) => {
    target[k] += src[k];
  });
}

export type MatchPhase = 'group' | 'ko' | 'semi' | 'third' | 'final';

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

/** The subset of a tournament doc that player stats are derived from. */
export interface StatsInputSnapshot {
  name?: unknown;
  gameType?: unknown;
  isTest?: unknown;
  tournamentDate?: unknown;
  date?: unknown;
  completedAt?: unknown;
  rankingConfig?: unknown;
  groupStage?: unknown;
  finalStage?: unknown;
  participants?: readonly unknown[];
}

/**
 * Everything that feeds computeUserStats, and nothing else — ranking points, summaries and the
 * participantUserIds index are deliberately excluded so this function's own writes to the
 * tournament doc don't look like an edit.
 */
function statsFingerprint(t: StatsInputSnapshot): string {
  const participants = (t.participants ?? []).map((p) => {
    const q = p as { id?: string; userId?: string; name?: string; finalPosition?: number; status?: string; partner?: { userId?: string; name?: string } };
    return [q.id, q.userId, q.name, q.finalPosition, q.status, q.partner?.userId, q.partner?.name];
  });
  const tier = (t.rankingConfig as { tier?: string } | undefined)?.tier;
  return JSON.stringify([
    t.name, t.gameType, t.isTest === true, t.tournamentDate, t.date, t.completedAt, tier,
    t.groupStage ?? null, t.finalStage ?? null, participants,
  ]);
}

/**
 * Did an already-completed tournament change in a way that moves player stats?
 * Key-order differences between two snapshots can yield a false positive, which only costs one
 * redundant (idempotent) recompute — a false negative would leave leaderboards stale, so the
 * comparison stays deliberately broad.
 */
export function statsInputChanged(before: StatsInputSnapshot, after: StatsInputSnapshot): boolean {
  return statsFingerprint(before) !== statsFingerprint(after);
}

/**
 * A walkover, not a played match. Current brackets leave the empty side undefined and set `winner`
 * to the real player (bracket.ts:136-147); tournaments imported before tournaments.ts:2041 persist
 * the placeholder id `unknown-BYE` instead — and a 0-0 "score" that crowned the BYE as winner.
 * Either way the match must not reach the counters.
 */
export function isByeMatch(match: RawMatch): boolean {
  const bye = (id?: string) => !id || id.toUpperCase() === 'BYE' || id.toUpperCase() === 'UNKNOWN-BYE';
  return bye(match.participantA) || bye(match.participantB);
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
  groupStage?: {
    gameMode?: string;
    roundsToPlay?: number;
    pointsToWin?: number;
    groups?: Array<{
      schedule?: Array<{ matches?: RawMatch[] }>;
      pairings?: Array<{ matches?: RawMatch[] }>;
    }>;
  };
  finalStage?: {
    goldBracket?: RawBracket;
    silverBracket?: RawBracket;
    parallelBrackets?: Array<{ bracket?: RawBracket }>;
  };
}

interface PhaseCfg { gameMode?: string; roundsToPlay?: number; pointsToWin?: number; }

interface RawBracket {
  rounds?: Array<{ name?: string; matches?: RawMatch[] }>;
  thirdPlaceMatch?: RawMatch;
  consolationBrackets?: Array<{ rounds?: Array<{ matches?: RawMatch[] }> }>;
  config?: { earlyRounds?: PhaseCfg; semifinal?: PhaseCfg; final?: PhaseCfg };
}

/** The 3 tracked game formats. Games of any other format are ignored. */
export const GAME_FORMATS = ['4r', '7p', '9p'] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

/** Map a phase/stage config to one of the 3 tracked formats, or null to ignore. */
export function formatKey(cfg?: PhaseCfg): GameFormat | null {
  if (!cfg) return null;
  if (cfg.gameMode === 'rounds') return cfg.roundsToPlay === 4 ? '4r' : null;
  if (cfg.gameMode === 'points') return cfg.pointsToWin === 7 ? '7p' : cfg.pointsToWin === 9 ? '9p' : null;
  return null;
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
  /** Best 20s in a single game, split by game format ('4r' | '7p' | '9p'). */
  maxTwentiesByFormat: Partial<Record<GameFormat, RecordRef | null>>;
  singlesTitles: number; singlesPodiums: number;
  doublesTitles: number; doublesPodiums: number;
  doublesResults: DoublesResult[];
}

export function emptyPlayerStats(userId: string): PlayerStats {
  return {
    userId, displayName: '',
    byYear: {},
    records: { maxTwentiesInRound: null, maxTwentiesInGame: null, bestWinStreak: 0 },
    maxTwentiesByFormat: {},
    singlesTitles: 0, singlesPodiums: 0, doublesTitles: 0, doublesPodiums: 0, doublesResults: [],
  };
}

function tournamentMillis(t: RawTournament): number {
  return toEpochMillis(t.tournamentDate) ?? toEpochMillis(t.completedAt) ?? 0;
}
function yearOf(ms: number): string { return String(new Date(ms).getUTCFullYear()); }

function activeParticipants(t: RawTournament): RawParticipant[] {
  // treat missing status as ACTIVE (legacy records pre-dating the status field)
  return t.participants.filter((p) => p.status === 'ACTIVE' || !p.status);
}

function maybeRecord(
  current: RecordRef | null,
  candidate: number,
  ctx: { tournamentId: string; tournamentName: string; date: number; opponentName?: string }
): RecordRef | null {
  return candidate > (current?.value ?? -1) ? { value: candidate, ...ctx } : current;
}

/** All bracket matches with their phase ('final'/'semi'/'third' for the medal rounds, else 'ko') and game format. */
function* bracketMatches(t: RawTournament): Generator<{ match: RawMatch; phase: MatchPhase; format: GameFormat | null }> {
  const fs = t.finalStage;
  if (!fs) return;
  // In PARALLEL_BRACKETS mode goldBracket is a *copy* of parallelBrackets[0] (see
  // tournaments.ts:2141 and tournamentImport.ts:710), so walking both double-counts every match of
  // the first bracket. Same rule the client uses in getTournamentMatchesForUser.
  const parallel = (fs.parallelBrackets ?? []).map((nb) => nb.bracket);
  const brackets: (RawBracket | undefined)[] = parallel.length > 0
    ? [fs.silverBracket, ...parallel]
    : [fs.goldBracket, fs.silverBracket];
  for (const br of brackets) {
    if (!br) continue;
    for (const round of br.rounds ?? []) {
      // App emits lowercase 'finals'; imported data may use 'Final'. 'semifinals'/'quarterfinals'
      // also contain "final", so exclude them. Mirrors src/lib/firebase/tournamentMatches.ts:910.
      const n = (round.name ?? '').toLowerCase();
      const isFinal = n === 'finals' || (n.includes('final') && !n.includes('semi') && !n.includes('quarter'));
      const isSemi = n.includes('semi');
      const phase: MatchPhase = isFinal ? 'final' : isSemi ? 'semi' : 'ko';
      const cfg = isFinal ? br.config?.final : isSemi ? br.config?.semifinal : br.config?.earlyRounds;
      const format = formatKey(cfg);
      for (const m of round.matches ?? []) yield { match: m, phase, format };
    }
    if (br.thirdPlaceMatch) yield { match: br.thirdPlaceMatch, phase: 'third', format: formatKey(br.config?.final) };
    for (const cb of br.consolationBrackets ?? [])
      for (const round of cb.rounds ?? [])
        for (const m of round.matches ?? []) yield { match: m, phase: 'ko', format: formatKey(br.config?.earlyRounds) };
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
    if (ms === 0) continue; // no reliable date; don't bucket under "1970" or corrupt streak order
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

    const groupFmt = formatKey(t.groupStage);
    const all: Array<{ match: RawMatch; phase: MatchPhase; format: GameFormat | null }> = [
      ...[...groupMatchesIter(t)].map((match) => ({ match, phase: 'group' as MatchPhase, format: groupFmt })),
      ...bracketMatches(t),
    ];

    for (const { match, phase, format } of all) {
      if (match.participantA !== part.id && match.participantB !== part.id) continue;
      if (isByeMatch(match)) continue;              // walkover — never played
      if (!match.winner && !match.rounds) continue; // unplayed / TBD
      const ctx = accumulateMatch(block, match, part.id, phase);

      if (match.winner) timeline.push({ ms, won: match.winner === part.id });

      const oppId = match.participantA === part.id ? match.participantB : match.participantA;
      const opponentName = (oppId && nameById.get(oppId)) || undefined;
      const refCtx = { tournamentId: t.id, tournamentName: t.name, date: ms, opponentName };
      stats.records.maxTwentiesInRound = maybeRecord(stats.records.maxTwentiesInRound, ctx.maxTwentiesInRound, refCtx);
      stats.records.maxTwentiesInGame = maybeRecord(stats.records.maxTwentiesInGame, ctx.maxTwentiesInGame, refCtx);
      // Per-format "best 20s in a game" record (only the 3 tracked formats).
      if (format && ctx.maxTwentiesInGame > 0) {
        stats.maxTwentiesByFormat[format] = maybeRecord(stats.maxTwentiesByFormat[format] ?? null, ctx.maxTwentiesInGame, refCtx);
      }
    }
  }

  // Longest consecutive run of wins over the chronological timeline.
  timeline.sort((a, b) => a.ms - b.ms); // outer loop is already chronological; this guards future refactors
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
  if (phase === 'final' || phase === 'semi' || phase === 'third') {
    block.medalMatches += 1; if (won) block.medalMatchesWon += 1;
  }

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
