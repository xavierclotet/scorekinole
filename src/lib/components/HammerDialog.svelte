<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import { t } from '$lib/stores/language';
	import { setCurrentGameStartHammer } from '$lib/stores/matchState';
	import { createEventDispatcher } from 'svelte';

	export let isOpen: boolean = false;

	const dispatch = createEventDispatcher();

	function isDarkColor(hexColor: string): boolean {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance < 0.5;
	}

	$: team1TextColor = $team1.color && isDarkColor($team1.color) ? '#ffffff' : '#1a1a1a';
	$: team2TextColor = $team2.color && isDarkColor($team2.color) ? '#ffffff' : '#1a1a1a';

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

	function close() {
		isOpen = false;
		dispatch('close');
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="overlay">
		<div class="dialog" on:click|stopPropagation>
			<p class="question">{$t('hammerDialogTitle')}</p>
			<div class="options">
				<button
					class="option"
					style="--btn-color: {$team1.color}; --btn-text: {team1TextColor};"
					on:click={() => selectStartingTeam(1)}
				>
					<span class="name">{$team1.name || 'Team 1'}</span>
				</button>
				<button
					class="option"
					style="--btn-color: {$team2.color}; --btn-text: {team2TextColor};"
					on:click={() => selectStartingTeam(2)}
				>
					<span class="name">{$team2.name || 'Team 2'}</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.5rem;
		width: min(400px, 90vw);
	}

	.question {
		margin: 0 0 1.25rem 0;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 480px) {
		.dialog {
			padding: 1.25rem;
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
