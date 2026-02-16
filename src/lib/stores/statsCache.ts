// Cache for my-stats page to avoid re-fetching on every navigation
import { writable } from 'svelte/store';
import type { MatchHistory } from '$lib/types/history';

interface StatsCache {
    matches: MatchHistory[];
    lastUpdated: number;
}

export const statsCache = writable<StatsCache | null>(null);

// Cache validity duration (e.g., 5 minutes)
export const CACHE_DURATION = 5 * 60 * 1000;
