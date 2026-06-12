/**
 * Superadmin backfill for the /tournamentSummaries collection.
 *
 * Summaries are normally maintained by the syncTournamentSummary Cloud
 * Function; this one-off tool (admin → Tools → Backup) creates them for
 * tournaments that existed before the function was deployed, and removes
 * stale summaries (deleted or isTest tournaments).
 *
 * buildTournamentSummary is MIRRORED from
 * functions/src/tournamentSummaryCore.ts — keep both in sync.
 */

import { db, isFirebaseEnabled } from './config';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { browser } from '$app/environment';

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

function toEpochMillis(value: unknown): number | undefined {
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

export interface BackfillResult {
	written: number;
	removed: number;
	skippedTest: number;
}

/**
 * Rebuild every tournament summary from the source /tournaments collection.
 * Requires superadmin (enforced by Firestore rules on /tournamentSummaries).
 * Reads the full tournaments collection — expensive, one-off use only.
 */
export async function backfillTournamentSummaries(): Promise<BackfillResult | null> {
	if (!browser || !isFirebaseEnabled()) {
		console.warn('Firebase disabled');
		return null;
	}

	try {
		const [tournamentsSnap, summariesSnap] = await Promise.all([
			getDocs(collection(db!, 'tournaments')),
			getDocs(collection(db!, 'tournamentSummaries'))
		]);

		const now = Date.now();
		const result: BackfillResult = { written: 0, removed: 0, skippedTest: 0 };
		const validIds = new Set<string>();

		// Firestore batches cap at 500 operations
		const batches = [writeBatch(db!)];
		let opsInBatch = 0;
		const addOp = (op: (batch: ReturnType<typeof writeBatch>) => void) => {
			if (opsInBatch >= 450) {
				batches.push(writeBatch(db!));
				opsInBatch = 0;
			}
			op(batches[batches.length - 1]);
			opsInBatch++;
		};

		tournamentsSnap.forEach((docSnap) => {
			const summary = buildTournamentSummary(docSnap.data(), now);
			if (!summary) {
				result.skippedTest++;
				return;
			}
			validIds.add(docSnap.id);
			addOp((batch) => batch.set(doc(db!, 'tournamentSummaries', docSnap.id), summary));
			result.written++;
		});

		// Remove stale summaries (tournament deleted or now flagged isTest)
		summariesSnap.forEach((docSnap) => {
			if (!validIds.has(docSnap.id)) {
				addOp((batch) => batch.delete(doc(db!, 'tournamentSummaries', docSnap.id)));
				result.removed++;
			}
		});

		for (const batch of batches) {
			await batch.commit();
		}

		console.log(
			`✅ Tournament summaries backfilled: ${result.written} written, ${result.removed} removed, ${result.skippedTest} test skipped`
		);
		return result;
	} catch (error) {
		console.error('❌ Error backfilling tournament summaries:', error);
		return null;
	}
}
