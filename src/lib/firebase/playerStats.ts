import { writable } from 'svelte/store';
import { collection, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
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

/** Trigger the backfillPlayerStats Cloud Function (superadmin only). */
export async function recomputeAllStats(): Promise<{ processed: number }> {
  const fns = getFunctions(getApp(), 'europe-west1');
  const call = httpsCallable<unknown, { processed: number }>(fns, 'backfillPlayerStats');
  const res = await call({});
  return res.data;
}
