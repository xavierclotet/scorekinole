import { writable } from 'svelte/store';
import { collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseEnabled } from './config';
import { browser } from '$app/environment';
import type { PlayerStats } from '$lib/types/playerStats';

interface PlayerStatsCache { players: PlayerStats[]; lastUpdated: number; }
export const playerStatsCache = writable<PlayerStatsCache | null>(null);
export const PLAYER_STATS_TTL = 5 * 60 * 1000;

/** Read the whole /playerStats collection (small docs). Returns [] if Firebase is unavailable. */
export async function getAllPlayerStats(): Promise<PlayerStats[]> {
  if (!browser || !isFirebaseEnabled()) return [];
  try {
    const snap = await getDocs(collection(db!, 'playerStats'));
    const out: PlayerStats[] = [];
    snap.forEach((d) => out.push({ ...(d.data() as PlayerStats), userId: d.id }));
    return out;
  } catch (error) {
    console.error('Error loading playerStats:', error);
    return [];
  }
}
