<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { TournamentRecord, TournamentTier } from '$lib/types/tournament';
	import type { PalmaresMeta } from '$lib/types/history';
	import { buildPalmaresRows } from '$lib/utils/palmares';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import User from '@lucide/svelte/icons/user';

	interface Props {
		records: TournamentRecord[];
		meta: Map<string, PalmaresMeta>;
		year?: string;
	}
	let { records, meta, year = '' }: Props = $props();

	let open = $state(true);
	let rows = $derived(buildPalmaresRows(records, meta));

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit'
		});
	}

	function medal(position: number): string {
		return position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '';
	}

	function tierClass(tier?: TournamentTier): string {
		return tier === 'SERIES_35'
			? 'tier-gold'
			: tier === 'SERIES_25'
				? 'tier-silver'
				: tier === 'SERIES_15'
					? 'tier-bronze'
					: '';
	}
</script>

{#if rows.length > 0}
	<section class="palmares-card">
		<button class="palmares-header" onclick={() => (open = !open)} aria-expanded={open}>
			<Trophy class="size-4" />
			<span class="palmares-title">{m.stats_palmares()}{year ? ` ${year}` : ''}</span>
			<span class="palmares-count">{rows.length}</span>
			<span class="palmares-chevron" class:rotated={open}><ChevronRight class="size-5" /></span>
		</button>

		{#if open}
			<!-- Desktop: 6-column table -->
			<div class="palmares-table">
				<div class="prow phead">
					<span>{m.stats_palmaresDate()}</span>
					<span>{m.stats_palmaresTournament()}</span>
					<span>{m.stats_palmaresSeries()}</span>
					<span>{m.stats_palmaresCategory()}</span>
					<span>{m.stats_palmaresPartner()}</span>
					<span class="num">{m.stats_palmaresRank()}</span>
					<span class="num">{m.stats_palmaresPlayers()}</span>
					<span class="num">{m.stats_palmaresPoints()}</span>
				</div>
				{#each rows as r (r.tournamentId)}
					<div class="prow">
						<span class="c-date">{formatDate(r.date)}</span>
						<span class="c-tournament">{r.edition ? `${r.edition} ` : ''}{r.tournamentName}</span>
						<span class="c-series">
							{#if r.tierLabel}<span class="series-badge {tierClass(r.tier)}">{r.tierLabel}</span>{:else}<span class="muted">—</span>{/if}
						</span>
						<span class="c-category">
							{#if r.gameType}
								<span class="mode-pill">
									{#if r.gameType === 'doubles'}<Users class="size-3" />{:else}<User class="size-3" />{/if}
									{r.gameType === 'doubles' ? m.scoring_doubles() : m.scoring_singles()}
								</span>
							{:else}<span class="muted">—</span>{/if}
						</span>
						<span class="c-partner">
							{#if r.partnerName && r.partnerUserId}
								<a class="partner-link" href="/users/{r.partnerUserId}">{r.partnerName}</a>
							{:else if r.partnerName}
								{r.partnerName}
							{:else}—{/if}
						</span>
						<span class="c-rank num">
							{#if medal(r.position)}<span class="medal">{medal(r.position)}</span>{/if}
							<strong>{r.position}</strong>
						</span>
						<span class="c-players num">{r.participants}</span>
						<span class="c-points num">{r.points}</span>
					</div>
				{/each}
			</div>

			<!-- Mobile: condensed 2-line cards -->
			<div class="palmares-list">
				{#each rows as r (r.tournamentId)}
					<div class="mrow">
						<div class="mrow-top">
							<span class="m-tournament">{r.edition ? `${r.edition} ` : ''}{r.tournamentName}</span>
							<span class="m-rank">{#if medal(r.position)}{medal(r.position)} {/if}<strong>{r.position}</strong><span class="of">/{r.participants}</span></span>
						</div>
						<div class="mrow-bottom">
							<span class="m-meta">
								{formatDate(r.date)}
								{#if r.gameType}· {r.gameType === 'doubles' ? m.scoring_doubles() : m.scoring_singles()}{#if r.tierLabel} {r.tierLabel}{/if}{/if}
								{#if r.partnerName}· {#if r.partnerUserId}<a class="partner-link" href="/users/{r.partnerUserId}">{r.partnerName}</a>{:else}{r.partnerName}{/if}{/if}
							</span>
							<span class="m-points">{r.points} {m.stats_palmaresPoints()}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.palmares-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		margin: 0 0 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.palmares-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.85rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--foreground);
		text-align: left;
	}

	.palmares-header :global(svg) {
		color: var(--primary);
		flex-shrink: 0;
	}

	.palmares-title {
		font-weight: 700;
		font-size: 0.95rem;
	}

	.palmares-count {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		border-radius: 99px;
		padding: 0.1rem 0.5rem;
	}

	.palmares-chevron {
		margin-left: auto;
		color: var(--muted-foreground);
		transition: transform 0.2s;
	}
	.palmares-chevron.rotated {
		transform: rotate(90deg);
	}

	/* ── Desktop table ── */
	.palmares-table {
		border-top: 1px solid var(--border);
	}

	.prow {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr) 5.5rem 7rem 7rem 3.5rem 4.5rem 3.5rem;
		gap: 0.75rem;
		align-items: center;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
		font-size: 0.85rem;
	}
	.prow:last-child {
		border-bottom: none;
	}

	.phead {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground);
		background: var(--secondary);
	}

	.num {
		text-align: right;
		justify-self: end;
		font-variant-numeric: tabular-nums;
	}

	.c-date {
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}

	.c-tournament {
		font-weight: 600;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.c-category {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.mode-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--muted-foreground);
		background: var(--secondary);
		border-radius: 6px;
		padding: 0.1rem 0.4rem;
	}

	.series-badge {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--muted-foreground);
		background: var(--secondary);
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 0.1rem 0.4rem;
		white-space: nowrap;
	}

	/* Tiered like medals: gold (Series 35) / silver (25) / bronze (15). */
	.series-badge.tier-gold {
		color: #b8860b;
		background: color-mix(in srgb, #e0b400 20%, transparent);
		border-color: color-mix(in srgb, #e0b400 45%, transparent);
	}
	.series-badge.tier-silver {
		color: #7c8896;
		background: color-mix(in srgb, #9aa7b4 22%, transparent);
		border-color: color-mix(in srgb, #9aa7b4 45%, transparent);
	}
	.series-badge.tier-bronze {
		color: #c4793b;
		background: color-mix(in srgb, #cd7f32 20%, transparent);
		border-color: color-mix(in srgb, #cd7f32 45%, transparent);
	}

	.partner-link {
		color: var(--primary);
		text-decoration: none;
		font-weight: 500;
	}
	.partner-link:hover {
		text-decoration: underline;
	}

	.c-partner {
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.c-rank {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.c-rank strong {
		font-weight: 800;
	}
	.medal {
		font-size: 0.9rem;
		line-height: 1;
	}
	.of {
		color: var(--muted-foreground);
		font-size: 0.72rem;
		margin-left: 1px;
	}

	.c-players {
		color: var(--muted-foreground);
	}

	.c-points {
		font-weight: 700;
		color: var(--primary);
	}

	/* ── Mobile list (hidden on desktop) ── */
	.palmares-list {
		display: none;
		border-top: 1px solid var(--border);
	}

	.mrow {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}
	.mrow:last-child {
		border-bottom: none;
	}

	.mrow-top,
	.mrow-bottom {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.m-tournament {
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.m-rank {
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
	.m-rank strong {
		font-weight: 800;
	}

	.m-meta {
		font-size: 0.75rem;
		color: var(--muted-foreground);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.m-points {
		flex-shrink: 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--primary);
	}

	@media (max-width: 640px) {
		.palmares-table {
			display: none;
		}
		.palmares-list {
			display: block;
		}
	}
</style>
