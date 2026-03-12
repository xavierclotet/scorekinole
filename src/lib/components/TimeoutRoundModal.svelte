<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Clock, Minus, Plus } from '@lucide/svelte';

	interface Props {
		team1Name: string;
		team2Name: string;
		team1Color: string;
		team2Color: string;
		gameType: 'singles' | 'doubles';
		show20s: boolean;
		onaccept: (data: { team1Points: number; team2Points: number; team1Twenty: number; team2Twenty: number }) => void;
	}

	let { team1Name, team2Name, team1Color, team2Color, gameType, show20s, onaccept }: Props = $props();

	// Round result: null = not selected, 0 = tie, 1 = team1 wins, 2 = team2 wins
	let roundWinner = $state<0 | 1 | 2 | null>(null);

	// 20s counters
	let team1Twenty = $state(0);
	let team2Twenty = $state(0);

	// Max 20s: singles = 8, doubles = 12
	let maxTwenty = $derived(gameType === 'singles' ? 8 : 12);

	// Derived points from winner selection
	let team1Points = $derived(roundWinner === 1 ? 2 : roundWinner === 0 ? 1 : roundWinner === 2 ? 0 : 0);
	let team2Points = $derived(roundWinner === 2 ? 2 : roundWinner === 0 ? 1 : roundWinner === 1 ? 0 : 0);

	let canAccept = $derived(roundWinner !== null);

	function handleAccept() {
		if (roundWinner === null) return;
		onaccept({
			team1Points,
			team2Points,
			team1Twenty,
			team2Twenty
		});
	}

	// Color helpers
	function getColorForDarkBg(teamColor: string): string {
		const hex = teamColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance < 0.2 ? '#ffffff' : teamColor;
	}

	function getSelectedBgColor(teamColor: string): string {
		const hex = teamColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		if (luminance < 0.2) {
			const lr = Math.round(r + (255 - r) * 0.4);
			const lg = Math.round(g + (255 - g) * 0.4);
			const lb = Math.round(b + (255 - b) * 0.4);
			return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
		}
		return teamColor;
	}

	function isDarkColor(hexColor: string): boolean {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
	}

	let t1Color = $derived(getColorForDarkBg(team1Color));
	let t2Color = $derived(getColorForDarkBg(team2Color));
	let t1SelBg = $derived(getSelectedBgColor(team1Color));
	let t2SelBg = $derived(getSelectedBgColor(team2Color));
	let t1SelText = $derived(isDarkColor(team1Color) ? '#ffffff' : '#000000');
	let t2SelText = $derived(isDarkColor(team2Color) ? '#ffffff' : '#000000');

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="dialog" onclick={stopPropagation}>
		<div class="header">
			<div class="header-icon">
				<Clock size={28} />
			</div>
			<h3 class="title">{m.timeout_title()}</h3>
			<p class="description">{m.timeout_description()}</p>
			<p class="instruction">{m.timeout_annotateRound()}</p>
		</div>

		<!-- Round winner selection -->
		<div class="section-label">{m.timeout_whoWon()}</div>
		<div class="winner-options">
			<button
				class="winner-btn"
				class:selected={roundWinner === 1}
				style="--btn-color: {t1Color}; --btn-sel-bg: {t1SelBg}; --btn-sel-text: {t1SelText};"
				onclick={() => roundWinner = 1}
			>
				<span class="winner-name">{team1Name}</span>
				<span class="winner-sub">{m.timeout_wins()} (2-0)</span>
			</button>

			<button
				class="winner-btn tie-btn"
				class:selected={roundWinner === 0}
				onclick={() => roundWinner = 0}
			>
				<span class="winner-name">{m.scoring_tie()}</span>
				<span class="winner-sub">(1-1)</span>
			</button>

			<button
				class="winner-btn"
				class:selected={roundWinner === 2}
				style="--btn-color: {t2Color}; --btn-sel-bg: {t2SelBg}; --btn-sel-text: {t2SelText};"
				onclick={() => roundWinner = 2}
			>
				<span class="winner-name">{team2Name}</span>
				<span class="winner-sub">{m.timeout_wins()} (0-2)</span>
			</button>
		</div>

		<!-- 20s selectors -->
		{#if show20s}
			<div class="section-label twenties-label">{m.timeout_twenties()}</div>
			<div class="twenties-row">
				<div class="twenty-selector">
					<span class="twenty-team-name" style="color: {t1Color}">{team1Name}</span>
					<div class="stepper">
						<button class="stepper-btn" onclick={() => team1Twenty = Math.max(0, team1Twenty - 1)} disabled={team1Twenty <= 0}>
							<Minus size={18} />
						</button>
						<span class="stepper-value">{team1Twenty}</span>
						<button class="stepper-btn" onclick={() => team1Twenty = Math.min(maxTwenty, team1Twenty + 1)} disabled={team1Twenty >= maxTwenty}>
							<Plus size={18} />
						</button>
					</div>
				</div>

				<div class="twenty-selector">
					<span class="twenty-team-name" style="color: {t2Color}">{team2Name}</span>
					<div class="stepper">
						<button class="stepper-btn" onclick={() => team2Twenty = Math.max(0, team2Twenty - 1)} disabled={team2Twenty <= 0}>
							<Minus size={18} />
						</button>
						<span class="stepper-value">{team2Twenty}</span>
						<button class="stepper-btn" onclick={() => team2Twenty = Math.min(maxTwenty, team2Twenty + 1)} disabled={team2Twenty >= maxTwenty}>
							<Plus size={18} />
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class="actions">
			<button class="accept-btn" disabled={!canAccept} onclick={handleAccept}>
				{m.timeout_accept()}
			</button>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
	}

	.dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.5rem 2rem;
		width: min(480px, 94vw);
		max-height: 90vh;
		overflow-y: auto;
	}

	.header {
		text-align: center;
		margin-bottom: 1.25rem;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.5rem;
		color: #ff7070;
		animation: iconPulse 1.5s ease-in-out infinite;
	}

	@keyframes iconPulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.7; transform: scale(1.05); }
	}

	.title {
		margin: 0 0 0.4rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1.2rem;
		font-weight: 700;
		color: #ff7070;
	}

	.description {
		margin: 0 0 0.25rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.4;
	}

	.instruction {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.8);
	}

	.section-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.7rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.4);
		text-align: center;
		margin-bottom: 0.5rem;
	}

	/* Winner options */
	.winner-options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.winner-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.winner-btn:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.winner-btn:active {
		transform: scale(0.98);
	}

	.winner-btn.selected {
		background: color-mix(in srgb, var(--btn-sel-bg) 20%, transparent);
		border-color: var(--btn-color);
	}

	.winner-btn.tie-btn {
		--btn-color: rgba(255, 255, 255, 0.5);
		--btn-sel-bg: rgba(255, 255, 255, 0.15);
		--btn-sel-text: #ffffff;
	}

	.winner-btn.tie-btn.selected {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.4);
	}

	.winner-name {
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		color: var(--btn-color, rgba(255, 255, 255, 0.8));
	}

	.winner-btn.selected .winner-name {
		color: var(--btn-color, #ffffff);
	}

	.winner-sub {
		font-family: 'Lexend', sans-serif;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.35);
	}

	.winner-btn.selected .winner-sub {
		color: rgba(255, 255, 255, 0.55);
	}

	/* 20s selectors */
	.twenties-label {
		margin-top: 1rem;
	}

	.twenties-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	.twenty-selector {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}

	.twenty-team-name {
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		word-break: break-word;
		line-height: 1.2;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 0;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		overflow: hidden;
	}

	.stepper-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.stepper-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.95);
	}

	.stepper-btn:active:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
	}

	.stepper-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	.stepper-value {
		font-family: 'Lexend', sans-serif;
		font-size: 1.3rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: rgba(255, 255, 255, 0.9);
		min-width: 2.5ch;
		text-align: center;
		user-select: none;
	}

	/* Accept button */
	.actions {
		display: flex;
		justify-content: center;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.accept-btn {
		padding: 0.7rem 2.5rem;
		border-radius: 8px;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		background: #ff7070;
		border: none;
		color: #fff;
	}

	.accept-btn:hover:not(:disabled) {
		background: #ff5555;
	}

	.accept-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.accept-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 480px) {
		.dialog {
			padding: 1.25rem;
		}

		.title {
			font-size: 1.05rem;
		}

		.description,
		.instruction {
			font-size: 0.8rem;
		}

		.winner-btn {
			padding: 0.65rem 0.85rem;
		}

		.winner-name {
			font-size: 0.9rem;
		}

		.accept-btn {
			padding: 0.6rem 2rem;
			font-size: 0.9rem;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.dialog {
			padding: 1rem 1.5rem;
			max-height: 95vh;
		}

		.header {
			margin-bottom: 0.5rem;
		}

		.header-icon {
			margin-bottom: 0.25rem;
		}

		.title {
			font-size: 0.95rem;
			margin-bottom: 0.2rem;
		}

		.description,
		.instruction {
			font-size: 0.75rem;
		}

		.winner-btn {
			padding: 0.5rem 0.75rem;
		}

		.winner-name {
			font-size: 0.85rem;
		}

		.twenties-label {
			margin-top: 0.5rem;
		}

		.actions {
			margin-top: 0.75rem;
			padding-top: 0.5rem;
		}

		.accept-btn {
			padding: 0.5rem 1.5rem;
			font-size: 0.85rem;
		}
	}
</style>
