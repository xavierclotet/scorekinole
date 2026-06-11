/**
 * Concurrent-edit protection in MatchResultDialog — decision logic tests.
 *
 * Mirrors the external-update $effect of MatchResultDialog.svelte:
 * when the match changes in Firebase while the dialog is open,
 * - no local edits  → live-sync (reinitialize from remote)
 * - unsaved edits   → keep local work, show the reload banner
 *
 * Regression for: an admin editing a result while another device synced the
 * same match lost everything they had typed (the dialog reinitialized).
 */
import { describe, it, expect } from 'vitest';
import type { GroupMatch } from '$lib/types/tournament';

// --- Pure mirrors of the component logic ---

/** Mirrors remoteSnapshot() in MatchResultDialog.svelte */
function remoteSnapshot(match: Partial<GroupMatch> | null): string {
  return JSON.stringify({
    r: match?.rounds ?? [],
    s: match?.status ?? '',
    w: match?.winner ?? null
  });
}

/** Mirrors the external-update $effect decision */
function decideOnRemoteChange(params: {
  visible: boolean;
  initialized: boolean;
  match: Partial<GroupMatch> | null;
  loadedRemoteSnapshot: string;
  userEdited: boolean;
}): 'ignore' | 'clear-banner' | 'show-banner' | 'reinitialize' {
  const { visible, initialized, match, loadedRemoteSnapshot, userEdited } = params;
  if (!visible || !initialized) return 'ignore';
  const remote = remoteSnapshot(match);
  if (remote === loadedRemoteSnapshot) return 'clear-banner';
  return userEdited ? 'show-banner' : 'reinitialize';
}

// --- Fixtures ---

const ROUND = { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 };

const pendingMatch: Partial<GroupMatch> = {
  id: 'm1',
  participantA: 'p1',
  participantB: 'p2',
  status: 'PENDING'
};

// --- Tests ---

describe('MatchResultDialog concurrent-edit decision', () => {
  it('no remote change → nothing happens (banner stays hidden)', () => {
    const loaded = remoteSnapshot(pendingMatch);
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: true,
        match: pendingMatch,
        loadedRemoteSnapshot: loaded,
        userEdited: true
      })
    ).toBe('clear-banner');
  });

  it('remote rounds arrive while VIEWING (no edits) → live-sync reinitializes', () => {
    const loaded = remoteSnapshot(pendingMatch);
    const updated = { ...pendingMatch, status: 'IN_PROGRESS' as const, rounds: [ROUND] };
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: true,
        match: updated,
        loadedRemoteSnapshot: loaded,
        userEdited: false
      })
    ).toBe('reinitialize');
  });

  it('remote rounds arrive while EDITING → local work kept, banner shown', () => {
    const loaded = remoteSnapshot(pendingMatch);
    const updated = { ...pendingMatch, status: 'IN_PROGRESS' as const, rounds: [ROUND] };
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: true,
        match: updated,
        loadedRemoteSnapshot: loaded,
        userEdited: true
      })
    ).toBe('show-banner');
  });

  it('another admin COMPLETES the match while editing → banner shown', () => {
    const loaded = remoteSnapshot(pendingMatch);
    const completed = { ...pendingMatch, status: 'COMPLETED' as const, winner: 'p1' };
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: true,
        match: completed,
        loadedRemoteSnapshot: loaded,
        userEdited: true
      })
    ).toBe('show-banner');
  });

  it('value-only change in remote rounds (same length) is also detected', () => {
    const base = { ...pendingMatch, rounds: [ROUND] };
    const loaded = remoteSnapshot(base);
    const valueChanged = { ...pendingMatch, rounds: [{ ...ROUND, pointsA: 0, pointsB: 2 }] };
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: true,
        match: valueChanged,
        loadedRemoteSnapshot: loaded,
        userEdited: false
      })
    ).toBe('reinitialize');
  });

  it('does nothing before initialization or when dialog is closed', () => {
    const updated = { ...pendingMatch, rounds: [ROUND] };
    expect(
      decideOnRemoteChange({
        visible: false,
        initialized: true,
        match: updated,
        loadedRemoteSnapshot: remoteSnapshot(pendingMatch),
        userEdited: true
      })
    ).toBe('ignore');
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: false,
        match: updated,
        loadedRemoteSnapshot: remoteSnapshot(pendingMatch),
        userEdited: true
      })
    ).toBe('ignore');
  });

  it('after "Cargar cambios" (reload) the new snapshot is considered current', () => {
    const updated = { ...pendingMatch, status: 'IN_PROGRESS' as const, rounds: [ROUND] };
    // loadExternalUpdate() → reinit loads the remote data and stores its snapshot
    const reloaded = remoteSnapshot(updated);
    expect(
      decideOnRemoteChange({
        visible: true,
        initialized: true,
        match: updated,
        loadedRemoteSnapshot: reloaded,
        userEdited: false
      })
    ).toBe('clear-banner');
  });
});
