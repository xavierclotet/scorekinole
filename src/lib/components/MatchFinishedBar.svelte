<script lang="ts">
	import { fly } from 'svelte/transition';
	import { Trophy, ChevronRight } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		/** Winner team name — empty string when the match is a tie */
		winnerName?: string;
		/** Final score string, e.g. "8 – 0". Empty hides the score chip. */
		score?: string;
		/** Which match this was: round/group label (tournament) or "Amistoso" (friendly). */
		context?: string;
		isTie?: boolean;
		/** True when this finished match came from a tournament (decides the primary CTA) */
		fromTournament?: boolean;
		/** Disables the tournament CTA while the next match is being fetched */
		tournamentLoading?: boolean;
		/** Go to the next / any tournament match */
		onTournament?: () => void;
		/** Start a new friendly match */
		onFriendly?: () => void;
	}

	let {
		winnerName = '',
		score = '',
		context = '',
		isTie = false,
		fromTournament = false,
		tournamentLoading = false,
		onTournament,
		onFriendly
	}: Props = $props();
</script>

<div
	class="finished-bar"
	class:tie={isTie}
	role="status"
	aria-live="polite"
	in:fly={{ y: 48, duration: 260 }}
>
	<div class="info">
		<span class="status">
			{#if isTie}
				<span class="dot" aria-hidden="true"></span>
			{:else}
				<Trophy size={14} aria-hidden="true" />
			{/if}
			{#if fromTournament}
				{m.scoring_matchFinished()}
				{#if context}
					<span class="context-chip">{context}</span>
				{/if}
			{:else}
				{m.scoring_friendlyMatchFinished()}
			{/if}
		</span>
		<span class="result">
			{#if isTie}
				{m.scoring_tie()}
			{:else}
				{m.scoring_wonByName({ name: winnerName })}
			{/if}
			{#if score}
				<span class="score">· {score}</span>
			{/if}
		</span>
	</div>

	<div class="actions">
		{#if fromTournament}
			<button class="cta primary" onclick={onTournament} disabled={tournamentLoading}>
				{m.scoring_nextMatch()}
				<ChevronRight size={16} aria-hidden="true" />
			</button>
			<button class="cta ghost" onclick={onFriendly}>
				{m.common_newMatch()}
			</button>
		{:else}
			<button class="cta primary" onclick={onFriendly}>
				{m.common_newMatch()}
				<ChevronRight size={16} aria-hidden="true" />
			</button>
			<button class="cta ghost" onclick={onTournament} disabled={tournamentLoading}>
				{m.tournament_playMatch()}
			</button>
		{/if}
	</div>
</div>

<style>
	/* In-flow flex child of .game-page (column): the teams grid above shrinks to
	   make room, so the bar never overlaps the cards. */
	.finished-bar {
		flex-shrink: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
		padding: 0.85rem 1.1rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
		background: #0f1117;
		border-top: 1px solid color-mix(in srgb, var(--primary) 32%, transparent);
		box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.45);
	}
	.finished-bar.tie {
		border-top-color: rgba(148, 163, 184, 0.35);
	}

	/* ── Info block ──────────────────────────────────────────── */
	.info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: 'Lexend', sans-serif;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--primary);
	}
	.finished-bar.tie .status {
		color: #94a3b8;
	}

	/* Match identity (round/group, or "Amistoso") — the "which match was this" tag */
	.context-chip {
		display: inline-flex;
		align-items: center;
		margin-left: 0.2rem;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--primary) 18%, transparent);
		color: #fff;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: none;
		white-space: nowrap;
	}
	.finished-bar.tie .context-chip {
		background: rgba(148, 163, 184, 0.2);
		color: #e2e8f0;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #94a3b8;
	}

	.result {
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 700;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.result .score {
		color: rgba(255, 255, 255, 0.5);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	/* ── Actions ─────────────────────────────────────────────── */
	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		margin-left: auto;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		font-family: 'Lexend', sans-serif;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0.6rem 1.1rem;
		border-radius: 10px;
		border: 1px solid transparent;
		cursor: pointer;
		white-space: nowrap;
		transition: transform 0.12s ease, background 0.2s ease, opacity 0.2s ease;
	}
	.cta.primary {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.cta.ghost {
		background: transparent;
		color: rgba(255, 255, 255, 0.72);
		border-color: rgba(255, 255, 255, 0.16);
	}
	.cta:active {
		transform: scale(0.96);
	}
	.cta:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	/* ── Narrow screens: stack and make primary full-width ───── */
	@media (max-width: 520px) {
		.finished-bar {
			flex-direction: column;
			align-items: stretch;
			gap: 0.7rem;
		}
		.actions {
			margin-left: 0;
		}
		.cta.primary {
			flex: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cta:active {
			transform: none;
		}
	}
</style>
