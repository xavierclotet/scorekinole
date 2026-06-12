/**
 * Participant duplication logic for the create wizard's duplicate mode
 * (/admin/tournaments/create?duplicate=<id>).
 *
 * Extracted from the page component so the edge cases are unit-testable:
 * legacy docs without a participants array, old doubles pair format
 * ("P1 / P2" without partner object), deleted user profiles, withdrawn or
 * disqualified players, and stale name/photo snapshots.
 */
import type { TournamentParticipant } from '$lib/types/tournament';
import { generateId as defaultGenerateId } from '$lib/utils/id';

/** Structural subset of UserProfile the duplication needs. */
export interface DuplicationProfile {
	playerName?: string;
	photoURL?: string | null;
	tournaments?: unknown;
}

export interface DuplicateParticipantsDeps {
	/** Resolve a user profile, null when missing/unreadable. */
	getProfile: (userId: string) => Promise<DuplicationProfile | null>;
	/** Estimate current ranking points from a profile's tournament records (FSI preview). */
	estimateRanking: (tournaments: any) => number;
	/** Unique-id factory; defaults to crypto.randomUUID. Injectable for tests. */
	generateId?: () => string;
}

/**
 * Build fresh participant rows for a duplicated tournament:
 * - New unique ids, status reset to ACTIVE (withdrawn/DSQ players start clean).
 * - Result fields (finalPosition, withdrawnAt, disqualifiedAt) are NOT copied.
 * - REGISTERED players get name/photo/ranking refreshed from their profile;
 *   a deleted or unreadable profile keeps the original snapshot values.
 * - userKey is preserved so participant profile links stay clean.
 * - Old doubles pair format ("P1 / P2" with no partner object) is migrated to
 *   the partner-object format as GUEST entries.
 */
export async function duplicateParticipants(
	participants: TournamentParticipant[] | undefined | null,
	gameType: 'singles' | 'doubles',
	deps: DuplicateParticipantsDeps
): Promise<Partial<TournamentParticipant>[]> {
	const generateId = deps.generateId ?? defaultGenerateId;

	return Promise.all(
		(participants ?? []).map(async (p) => {
			// MIGRATION: old pair format → partner object. Split on the FIRST
			// separator only, so "Ana / Luis / Marc" keeps "Luis / Marc" intact
			// instead of silently dropping everything after the second name.
			if (gameType === 'doubles' && !p.partner && p.name.includes(' / ')) {
				const sep = p.name.indexOf(' / ');
				return {
					id: generateId(),
					type: 'GUEST' as const,
					name: p.name.slice(0, sep).trim(),
					teamName: undefined, // old format had no separate team name
					partner: {
						type: 'GUEST' as const,
						name: p.name.slice(sep + 3).trim()
					},
					rankingSnapshot: 0,
					status: 'ACTIVE' as const
				};
			}

			let name = p.name;
			let photoURL = p.photoURL;
			let rankingSnapshot = 0;
			let partnerName = p.partner?.name;
			let partnerPhotoURL = p.partner?.photoURL;
			let partnerRankingSnapshot = 0;

			if (p.userId && p.type === 'REGISTERED') {
				try {
					const profile = await deps.getProfile(p.userId);
					if (profile?.playerName) name = profile.playerName;
					if (profile?.photoURL) photoURL = profile.photoURL;
					rankingSnapshot = deps.estimateRanking(profile?.tournaments);
				} catch {
					/* keep original snapshot values */
				}
			}

			if (p.partner?.userId && p.partner.type === 'REGISTERED') {
				try {
					const partnerProfile = await deps.getProfile(p.partner.userId);
					if (partnerProfile?.playerName) partnerName = partnerProfile.playerName;
					if (partnerProfile?.photoURL) partnerPhotoURL = partnerProfile.photoURL;
					partnerRankingSnapshot = deps.estimateRanking(partnerProfile?.tournaments);
				} catch {
					/* keep original snapshot values */
				}
			}

			return {
				id: generateId(),
				type: p.type,
				userId: p.userId,
				userKey: p.userKey,
				name,
				teamName: p.teamName,
				email: p.email,
				photoURL,
				partner: p.partner
					? {
							type: p.partner.type,
							userId: p.partner.userId,
							userKey: p.partner.userKey,
							name: partnerName ?? p.partner.name,
							email: p.partner.email,
							photoURL: partnerPhotoURL,
							rankingSnapshot: partnerRankingSnapshot
						}
					: undefined,
				rankingSnapshot,
				status: 'ACTIVE' as const
			};
		})
	);
}
