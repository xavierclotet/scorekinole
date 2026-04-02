<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { gameSettings } from '$lib/stores/gameSettings';
	import * as m from '$lib/paraglide/messages.js';
	import { setCurrentGameStartHammer } from '$lib/stores/matchState';
	import { randomizeHammerStart } from '$lib/utils/matchStartOptions';
	import { Dices } from '@lucide/svelte';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
	}

	let { isOpen = $bindable(false), onclose }: Props = $props();

	function isDarkColor(hexColor: string): boolean {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance < 0.5;
	}

	let team1TextColor = $derived($team1.color && isDarkColor($team1.color) ? '#ffffff' : '#1a1a1a');
	let team2TextColor = $derived($team2.color && isDarkColor($team2.color) ? '#ffffff' : '#1a1a1a');

	// Check if doubles mode
	let isDoubles = $derived($gameSettings.gameType === 'doubles');

	// Build display names (include partner in doubles mode)
	let team1DisplayName = $derived((() => {
		const mainName = $team1.name || 'Team 1';
		if (isDoubles && $team1.partner?.name) {
			return `${mainName} & ${$team1.partner.name}`;
		}
		return mainName;
	})());

	let team2DisplayName = $derived((() => {
		const mainName = $team2.name || 'Team 2';
		if (isDoubles && $team2.partner?.name) {
			return `${mainName} & ${$team2.partner.name}`;
		}
		return mainName;
	})());

	function selectStartingTeam(teamNumber: 1 | 2) {
		const hammerTeam = teamNumber === 1 ? 2 : 1;

		if (teamNumber === 1) {
			team1.update(t => ({ ...t, hasHammer: false }));
			team2.update(t => ({ ...t, hasHammer: true }));
		} else {
			team1.update(t => ({ ...t, hasHammer: true }));
			team2.update(t => ({ ...t, hasHammer: false }));
		}

		setCurrentGameStartHammer(hammerTeam);
		close();
	}

	function selectRandom() {
		const hammerTeam = randomizeHammerStart();
		if (hammerTeam === 1) {
			team1.update(t => ({ ...t, hasHammer: true }));
			team2.update(t => ({ ...t, hasHammer: false }));
		} else {
			team1.update(t => ({ ...t, hasHammer: false }));
			team2.update(t => ({ ...t, hasHammer: true }));
		}
		setCurrentGameStartHammer(hammerTeam);
		close();
	}

	function close() {
		isOpen = false;
		onclose?.();
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay">
		<div class="dialog" onclick={stopPropagation}>
			<p class="question">{m.scoring_hammerDialogTitle()}</p>
			<div class="options">
				<button
					class="option"
					style="--btn-color: {$team1.color}; --btn-text: {team1TextColor};"
					onclick={() => selectStartingTeam(1)}
				>
					<span class="name">{team1DisplayName}</span>
				</button>
				<button
					class="option"
					style="--btn-color: {$team2.color}; --btn-text: {team2TextColor};"
					onclick={() => selectStartingTeam(2)}
				>
					<span class="name">{team2DisplayName}</span>
				</button>
			</div>
			<div class="divider">
				<span class="divider-line"></span>
				<span class="divider-text">o</span>
				<span class="divider-line"></span>
			</div>
			<button class="random-btn" onclick={selectRandom}>
				<Dices size={15} strokeWidth={1.8} />
				<span>{m.scoring_hammerRandom()}</span>
			</button>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: var(--card);
		border: 1px solid var(--game-border);
		border-radius: 12px;
		padding: 1.5rem;
		width: min(520px, 94vw);
	}

	.question {
		margin: 0 0 1.25rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: var(--game-text-muted);
		text-align: center;
	}

	.options {
		display: flex;
		gap: 0.75rem;
	}

	.option {
		flex: 1;
		background: var(--btn-color);
		color: var(--btn-text);
		border: none;
		border-radius: 8px;
		padding: 1rem;
		cursor: pointer;
		transition: transform 0.1s ease, opacity 0.1s ease;
	}

	.option:hover {
		opacity: 0.9;
	}

	.option:active {
		transform: scale(0.98);
	}

	.name {
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		display: block;
		word-break: break-word;
		line-height: 1.3;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0.9rem 0;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--game-border);
	}

	.divider-text {
		font-family: 'Lexend', sans-serif;
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--game-text-dim);
		text-transform: lowercase;
		letter-spacing: 0.05em;
	}

	.random-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 0.65rem;
		background: var(--game-btn-bg);
		border: 1px solid var(--game-border);
		border-radius: 8px;
		color: var(--game-text-muted);
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.random-btn:hover {
		background: var(--game-btn-bg-hover);
		border-color: var(--game-btn-border);
		color: var(--game-text);
	}

	.random-btn:active {
		transform: scale(0.98);
	}

	@media (max-width: 480px) {
		.dialog {
			padding: 1.25rem;
			width: min(520px, 92vw);
		}

		.question {
			font-size: 0.9rem;
			margin-bottom: 1rem;
		}

		.options {
			gap: 0.6rem;
		}

		.option {
			padding: 0.85rem 0.75rem;
		}

		.name {
			font-size: 0.9rem;
		}
	}
</style>
