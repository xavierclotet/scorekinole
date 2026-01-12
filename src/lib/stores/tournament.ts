/**
 * Tournament state management stores
 */

import { writable, derived } from 'svelte/store';
import type { Tournament } from '$lib/types/tournament';

/**
 * Current tournament being viewed/managed
 */
export const currentTournament = writable<Tournament | null>(null);

/**
 * Tournament loading state
 */
export const tournamentLoading = writable<boolean>(false);

/**
 * Tournament error state
 */
export const tournamentError = writable<string | null>(null);

/**
 * Derived: Is tournament in group stage?
 */
export const isGroupStage = derived(
  currentTournament,
  $tournament => $tournament?.status === 'GROUP_STAGE'
);

/**
 * Derived: Is tournament in final stage?
 */
export const isFinalStage = derived(
  currentTournament,
  $tournament => $tournament?.status === 'FINAL_STAGE'
);

/**
 * Derived: Is tournament completed?
 */
export const isTournamentCompleted = derived(
  currentTournament,
  $tournament => $tournament?.status === 'COMPLETED'
);

/**
 * Derived: Is tournament in draft mode?
 */
export const isTournamentDraft = derived(
  currentTournament,
  $tournament => $tournament?.status === 'DRAFT'
);

/**
 * Derived: Can edit tournament config?
 */
export const canEditTournamentConfig = derived(
  currentTournament,
  $tournament => $tournament?.status === 'DRAFT'
);

/**
 * Derived: Tournament participants
 */
export const tournamentParticipants = derived(
  currentTournament,
  $tournament => $tournament?.participants || []
);

/**
 * Derived: Active participants (not withdrawn or disqualified)
 */
export const activeParticipants = derived(
  tournamentParticipants,
  $participants => $participants.filter(p => p.status === 'ACTIVE')
);

/**
 * Derived: Number of participants
 */
export const participantCount = derived(
  tournamentParticipants,
  $participants => $participants.length
);

/**
 * Derived: Tournament progress percentage
 */
export const tournamentProgress = derived(currentTournament, $tournament => {
  if (!$tournament) return 0;

  switch ($tournament.status) {
    case 'DRAFT':
      return 0;
    case 'GROUP_STAGE':
      if (!$tournament.groupStage) return 25;

      // Ensure groups is an array (Firestore may return object)
      const groups = Array.isArray($tournament.groupStage.groups)
        ? $tournament.groupStage.groups
        : Object.values($tournament.groupStage.groups);

      const totalGroupMatches = groups.reduce((sum, group) => {
        const schedule = group.schedule
          ? Array.isArray(group.schedule)
            ? group.schedule
            : Object.values(group.schedule)
          : null;

        const pairings = group.pairings
          ? Array.isArray(group.pairings)
            ? group.pairings
            : Object.values(group.pairings)
          : null;

        const matches = schedule
          ? schedule.flatMap((r: any) => {
              const roundMatches = r.matches;
              return Array.isArray(roundMatches) ? roundMatches : Object.values(roundMatches || {});
            })
          : pairings
          ? pairings.flatMap((p: any) => {
              const pairingMatches = p.matches;
              return Array.isArray(pairingMatches) ? pairingMatches : Object.values(pairingMatches || {});
            })
          : [];
        return sum + matches.length;
      }, 0);

      const completedGroupMatches = groups.reduce((sum, group) => {
        const schedule = group.schedule
          ? Array.isArray(group.schedule)
            ? group.schedule
            : Object.values(group.schedule)
          : null;

        const pairings = group.pairings
          ? Array.isArray(group.pairings)
            ? group.pairings
            : Object.values(group.pairings)
          : null;

        const matches = schedule
          ? schedule.flatMap((r: any) => {
              const roundMatches = r.matches;
              return Array.isArray(roundMatches) ? roundMatches : Object.values(roundMatches || {});
            })
          : pairings
          ? pairings.flatMap((p: any) => {
              const pairingMatches = p.matches;
              return Array.isArray(pairingMatches) ? pairingMatches : Object.values(pairingMatches || {});
            })
          : [];
        return (
          sum +
          matches.filter((m: any) => m.status === 'COMPLETED' || m.status === 'WALKOVER').length
        );
      }, 0);
      return totalGroupMatches > 0 ? 25 + (completedGroupMatches / totalGroupMatches) * 25 : 25;

    case 'TRANSITION':
      return 50;

    case 'FINAL_STAGE':
      if (!$tournament.finalStage) return 75;
      const totalBracketMatches = $tournament.finalStage.bracket.rounds.reduce(
        (sum, r) => sum + r.matches.length,
        0
      );
      const completedBracketMatches = $tournament.finalStage.bracket.rounds.reduce(
        (sum, r) =>
          sum + r.matches.filter(m => m.status === 'COMPLETED' || m.status === 'WALKOVER').length,
        0
      );
      return (
        75 + (totalBracketMatches > 0 ? (completedBracketMatches / totalBracketMatches) * 25 : 0)
      );

    case 'COMPLETED':
      return 100;

    case 'CANCELLED':
      return 0;

    default:
      return 0;
  }
});

/**
 * Helper function to load tournament into store
 */
export function setCurrentTournament(tournament: Tournament | null) {
  currentTournament.set(tournament);
  tournamentError.set(null);
}

/**
 * Helper function to clear tournament from store
 */
export function clearCurrentTournament() {
  currentTournament.set(null);
  tournamentError.set(null);
  tournamentLoading.set(false);
}

/**
 * Helper function to set loading state
 */
export function setTournamentLoading(loading: boolean) {
  tournamentLoading.set(loading);
}

/**
 * Helper function to set error state
 */
export function setTournamentError(error: string | null) {
  tournamentError.set(error);
}
