/**
 * Pure logic for building public tournament summaries.
 *
 * The public /tournaments listing reads the lightweight /tournamentSummaries
 * collection instead of the full tournament docs (which embed participants,
 * groups, matches and brackets — hundreds of KB each). The
 * syncTournamentSummary trigger keeps summaries up to date; this module holds
 * the testable logic, mirrored client-side in
 * src/lib/firebase/publicTournaments.ts (buildTournamentSummary) for the
 * superadmin backfill tool.
 */

export interface TournamentSummary {
	key: string;
	name: string;
	edition?: number;
	country: string;
	city: string;
	address?: string;
	/** Always present: falls back to createdAt so no summary is ever missing it */
	tournamentDate: number;
	status: string;
	gameType: 'singles' | 'doubles';
	participantsCount: number;
	tier?: string;
	createdAt: number;
	isImported?: boolean;
	posterUrl?: string;
}

/**
 * Convert Firestore Timestamp (admin or client SDK, duck-typed) or epoch
 * number to epoch milliseconds. Returns undefined for anything else.
 */
export function toEpochMillis(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as { toMillis?: unknown }).toMillis === 'function'
	) {
		return (value as { toMillis: () => number }).toMillis();
	}
	return undefined;
}

/**
 * Build the public summary for a tournament doc.
 * Returns null when the tournament must NOT be public (test tournaments).
 * Never produces undefined values (Firestore rejects them on write).
 */
export function buildTournamentSummary(
	data: Record<string, unknown>,
	nowMs: number
): TournamentSummary | null {
	if (data.isTest === true) return null;

	const createdAt = toEpochMillis(data.createdAt) ?? nowMs;
	const tournamentDate = toEpochMillis(data.tournamentDate) ?? createdAt;

	let participantsCount = 0;
	const participants = data.participants;
	if (Array.isArray(participants)) {
		for (const p of participants) {
			if (p && (p as { status?: string }).status === 'ACTIVE') participantsCount++;
		}
	}

	const summary: TournamentSummary = {
		key: typeof data.key === 'string' ? data.key : '',
		name: typeof data.name === 'string' ? data.name : '',
		country: typeof data.country === 'string' ? data.country : '',
		city: typeof data.city === 'string' ? data.city : '',
		tournamentDate,
		status: typeof data.status === 'string' ? data.status : 'DRAFT',
		gameType: data.gameType === 'doubles' ? 'doubles' : 'singles',
		participantsCount,
		createdAt
	};

	if (typeof data.edition === 'number') summary.edition = data.edition;
	if (typeof data.address === 'string' && data.address) summary.address = data.address;
	const rankingConfig = data.rankingConfig as { enabled?: boolean; tier?: string } | undefined;
	if (rankingConfig?.enabled && rankingConfig.tier) summary.tier = rankingConfig.tier;
	if (data.isImported === true) summary.isImported = true;
	if (typeof data.posterUrl === 'string' && data.posterUrl) summary.posterUrl = data.posterUrl;

	return summary;
}

/**
 * Compare two summaries to skip no-op writes. Live tournaments update the main
 * doc on every scored round; the summary only changes on status/participant/
 * config edits, so skipping identical writes avoids one summary write (and one
 * fan-out to every listing viewer) per round.
 */
export function summariesEqual(
	a: TournamentSummary | null,
	b: TournamentSummary | null
): boolean {
	if (a === null || b === null) return a === b;
	// Both objects are built by buildTournamentSummary with deterministic key
	// order, so JSON comparison is reliable.
	return JSON.stringify(a) === JSON.stringify(b);
}
