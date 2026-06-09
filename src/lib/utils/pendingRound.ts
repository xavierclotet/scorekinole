/**
 * Reconstruct the pending round data when the in-memory copy was lost.
 *
 * Scenario: a round completes (totalChange === 2) and the 20s dialog opens.
 * `twentyDialogPending` IS persisted to localStorage, but the page-level
 * `pendingRoundData` is in-memory only. If the user reloads mid-dialog, the
 * dialog reopens but closing it had no round to finalize — the round was
 * silently dropped and the lastRoundPoints baseline stayed 2 points behind
 * the team scores, so no future round could ever complete (totalChange === 2
 * could never be reached again).
 *
 * The round delta is current team points minus the accumulated points at the
 * end of the last completed round (lastRoundPoints). A valid crokinole round
 * always adds exactly 2 points in total (2-0, 0-2 or 1-1).
 *
 * Returns null when the current scores don't describe a completable round.
 */
export function reconstructPendingRound(
    team1Points: number,
    team2Points: number,
    baseline: { team1: number; team2: number }
): { winningTeam: 0 | 1 | 2; team1Points: number; team2Points: number } | null {
    const delta1 = team1Points - baseline.team1;
    const delta2 = team2Points - baseline.team2;

    if (delta1 < 0 || delta2 < 0 || delta1 + delta2 !== 2) return null;

    const winningTeam: 0 | 1 | 2 = delta1 > delta2 ? 1 : delta2 > delta1 ? 2 : 0;
    return { winningTeam, team1Points: delta1, team2Points: delta2 };
}
