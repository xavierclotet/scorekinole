import type { TournamentRecord, TournamentTier } from '$lib/types/tournament';
import { normalizeTier } from '$lib/types/tournament';
import type { PalmaresMeta } from '$lib/types/history';
import { calculateRankingPoints, getTierInfo } from '$lib/algorithms/ranking';

export interface PalmaresRow {
	tournamentId: string;
	date: number;
	tournamentName: string;
	edition?: number;
	gameType?: 'singles' | 'doubles';
	tier?: TournamentTier;
	tierLabel?: string;
	partnerName?: string;
	partnerUserId?: string;
	position: number;
	participants: number;
	points: number;
}

/**
 * Joins a player's tournament records with the per-tournament meta and produces
 * display rows for the palmarés table, sorted most-recent first.
 *
 * Points are recomputed with the same Series formula /ranking uses, so the
 * numbers match the ranking page. When a record has no meta (its tournament doc
 * wasn't loaded), we fall back to the stored rankingDelta.
 */
export function buildPalmaresRows(
	records: TournamentRecord[],
	meta: Map<string, PalmaresMeta>
): PalmaresRow[] {
	const rows = records.map((r): PalmaresRow => {
		const m = meta.get(r.tournamentId);
		if (!m) {
			return {
				tournamentId: r.tournamentId,
				date: r.tournamentDate,
				tournamentName: r.tournamentName,
				position: r.finalPosition,
				participants: r.totalParticipants,
				points: r.rankingDelta ?? 0
			};
		}
		const tier = normalizeTier(m.tier);
		return {
			tournamentId: r.tournamentId,
			date: r.tournamentDate,
			tournamentName: r.tournamentName,
			edition: m.edition,
			gameType: m.gameType,
			tier,
			tierLabel: getTierInfo(tier).name,
			partnerName: m.partnerName,
			partnerUserId: m.partnerUserId,
			position: r.finalPosition,
			participants: r.totalParticipants,
			points: calculateRankingPoints(r.finalPosition, tier, r.totalParticipants, m.gameType)
		};
	});
	return rows.sort((a, b) => b.date - a.date);
}
