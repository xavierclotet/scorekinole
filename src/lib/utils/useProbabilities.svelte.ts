/**
 * Reactive composable for win probability computation.
 * Encapsulates state, derived values, and async Firestore H2H fetching.
 * Used by LiveTournamentView, admin groups page, and admin bracket page.
 */

import type { Tournament } from '$lib/types/tournament';
import type { H2HRecord, WinProbability } from '$lib/algorithms/probability';
import {
	computeTournamentProbabilities,
	getPendingUserIdPairs
} from '$lib/utils/tournamentProbability';
import { getH2HFromPreviousTournaments } from '$lib/firebase/h2h';
import { isFirebaseEnabled } from '$lib/firebase/config';

export function useProbabilities(getTournament: () => Tournament | null) {
	let firestoreH2H = $state<Map<string, H2HRecord> | undefined>(undefined);

	let probabilities = $derived.by(() => {
		const t = getTournament();
		return t ? computeTournamentProbabilities(t, firestoreH2H) : null;
	});

	// Serialize pending pairs to a stable key so the $effect only re-runs
	// when the actual set of pending match pairs changes, not on every tournament update.
	let pendingPairsKey = $derived.by(() => {
		const t = getTournament();
		if (!t) return '';
		return getPendingUserIdPairs(t)
			.map((p) => p.join(':'))
			.sort()
			.join(',');
	});

	$effect(() => {
		const key = pendingPairsKey;
		if (!key || !isFirebaseEnabled()) return;
		const pairs = key.split(',').map((k) => k.split(':') as [string, string]);
		getH2HFromPreviousTournaments(pairs).then((h2h) => {
			if (h2h.size > 0) firestoreH2H = h2h;
		});
	});

	return {
		get probabilities() {
			return probabilities;
		}
	};
}
