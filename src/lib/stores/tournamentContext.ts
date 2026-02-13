/**
 * Tournament context for /game page
 * Stores information about current tournament match being played
 * Includes persistence to localStorage for offline support
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { MatchRound, MatchGame } from '$lib/types/history';

const TOURNAMENT_CONTEXT_KEY = 'crokinoleTournamentContext';

/**
 * Game configuration locked by tournament
 */
export interface TournamentGameConfig {
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;
  roundsToPlay?: number;
  matchesToWin: number;
  show20s: boolean;
  showHammer: boolean;
  gameType: 'singles' | 'doubles';
}

/**
 * Offline data for sync when connection returns
 */
export interface TournamentOfflineData {
  pendingRounds: MatchRound[];
  pendingGames: MatchGame[];
  currentGameNumber: number;
  lastSyncAttempt?: number;
  syncError?: string;
}

/**
 * Tournament match context - full context for playing a tournament match
 */
export interface TournamentMatchContext {
  // Tournament identification
  tournamentId: string;
  tournamentKey: string;
  tournamentName: string;

  // Match identification
  matchId: string;
  phase: 'GROUP' | 'FINAL';
  roundNumber?: number;
  totalRounds?: number;  // Total rounds in group stage
  groupId?: string;
  groupName?: string;  // "Grupo A", "Grupo B", etc.
  groupStageType?: 'ROUND_ROBIN' | 'SWISS';  // Type of group stage
  bracketRoundName?: string;  // "Octavos", "Cuartos", "Semifinales", "Final"
  bracketType?: 'gold' | 'silver';  // Which bracket: gold or silver
  isConsolation?: boolean;  // True if this is a consolation bracket match

  // Participants
  participantAId: string;
  participantBId: string;
  participantAName: string;
  participantBName: string;
  participantAPhotoURL?: string;  // Avatar URL for participant A (or first member in doubles)
  participantBPhotoURL?: string;  // Avatar URL for participant B (or first member in doubles)
  participantAPartnerPhotoURL?: string;  // For doubles: second member of team A
  participantBPartnerPhotoURL?: string;  // For doubles: second member of team B

  // Current user context
  currentUserId?: string;
  currentUserParticipantId?: string;  // Which participant the current user is (A or B id)
  currentUserSide?: 'A' | 'B';        // Which side the current user plays
  currentUserRanking?: number;        // User's ranking points (only for logged-in users)

  // Game configuration (locked by tournament)
  gameConfig: TournamentGameConfig;

  // Match state (for resuming)
  matchStartedAt?: number;
  currentGameData?: {
    gamesWonA: number;
    gamesWonB: number;
    currentGameNumber: number;
  };

  // Existing rounds from Firebase (for resuming IN_PROGRESS matches)
  existingRounds?: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }>;

  // Offline support
  offlineData?: TournamentOfflineData;
}

/**
 * Store for tournament context in game page
 */
export const gameTournamentContext = writable<TournamentMatchContext | null>(null);

/**
 * Load tournament context from localStorage
 */
export function loadTournamentContext(): TournamentMatchContext | null {
  if (!browser) return null;

  try {
    const stored = localStorage.getItem(TOURNAMENT_CONTEXT_KEY);
    if (stored) {
      const context = JSON.parse(stored) as TournamentMatchContext;
      gameTournamentContext.set(context);
      console.log('✅ Tournament context loaded from localStorage');
      return context;
    }
  } catch (error) {
    console.error('❌ Error loading tournament context:', error);
  }
  return null;
}

/**
 * Save tournament context to localStorage
 */
export function saveTournamentContext(context: TournamentMatchContext | null): void {
  if (!browser) return;

  try {
    if (context) {
      localStorage.setItem(TOURNAMENT_CONTEXT_KEY, JSON.stringify(context));
      console.log('✅ Tournament context saved to localStorage');
    } else {
      localStorage.removeItem(TOURNAMENT_CONTEXT_KEY);
      console.log('✅ Tournament context cleared from localStorage');
    }
  } catch (error) {
    console.error('❌ Error saving tournament context:', error);
  }
}

/**
 * Set tournament context and persist to localStorage
 */
export function setTournamentContext(context: TournamentMatchContext | null): void {
  gameTournamentContext.set(context);
  saveTournamentContext(context);
}

/**
 * Clear tournament context and remove from localStorage
 */
export function clearTournamentContext(): void {
  gameTournamentContext.set(null);
  saveTournamentContext(null);
}

/**
 * Update tournament context partially and persist
 */
export function updateTournamentContext(updates: Partial<TournamentMatchContext>): void {
  const current = get(gameTournamentContext);
  console.log('🔄 updateTournamentContext llamado:', { hasContext: !!current, updates });
  if (current) {
    const updated = { ...current, ...updates };
    gameTournamentContext.set(updated);
    saveTournamentContext(updated);
    console.log('💾 Contexto actualizado y guardado:', { existingRounds: updated.existingRounds?.length });
  }
}

/**
 * Add offline data (rounds/games) to context for later sync
 */
export function addOfflineRound(round: MatchRound): void {
  const current = get(gameTournamentContext);
  if (current) {
    const offlineData = current.offlineData || {
      pendingRounds: [],
      pendingGames: [],
      currentGameNumber: 1
    };
    offlineData.pendingRounds.push(round);
    offlineData.lastSyncAttempt = Date.now();
    updateTournamentContext({ offlineData });
  }
}

/**
 * Add offline game to context for later sync
 */
export function addOfflineGame(game: MatchGame): void {
  const current = get(gameTournamentContext);
  if (current) {
    const offlineData = current.offlineData || {
      pendingRounds: [],
      pendingGames: [],
      currentGameNumber: 1
    };
    offlineData.pendingGames.push(game);
    offlineData.currentGameNumber = game.gameNumber + 1;
    offlineData.pendingRounds = []; // Clear rounds after game is saved
    offlineData.lastSyncAttempt = Date.now();
    updateTournamentContext({ offlineData });
  }
}

/**
 * Clear offline data after successful sync
 */
export function clearOfflineData(): void {
  const current = get(gameTournamentContext);
  if (current) {
    updateTournamentContext({ offlineData: undefined });
  }
}

/**
 * Set sync error message
 */
export function setOfflineSyncError(error: string): void {
  const current = get(gameTournamentContext);
  if (current) {
    const offlineData = current.offlineData || {
      pendingRounds: [],
      pendingGames: [],
      currentGameNumber: 1
    };
    offlineData.syncError = error;
    offlineData.lastSyncAttempt = Date.now();
    updateTournamentContext({ offlineData });
  }
}

/**
 * Check if currently in tournament mode
 */
export function isInTournamentMode(): boolean {
  return get(gameTournamentContext) !== null;
}

/**
 * Check if there's pending offline data to sync
 */
export function hasPendingOfflineData(): boolean {
  const current = get(gameTournamentContext);
  if (!current?.offlineData) return false;
  return current.offlineData.pendingRounds.length > 0 ||
         current.offlineData.pendingGames.length > 0;
}

/**
 * Get current tournament context value
 */
export function getTournamentContext(): TournamentMatchContext | null {
  return get(gameTournamentContext);
}
