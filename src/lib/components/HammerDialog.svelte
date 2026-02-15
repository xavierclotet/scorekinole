<script lang="ts">
	import { team1, team2 } from '$lib/stores/teams';
	import * as m from '$lib/paraglide/messages.js';
	import { setCurrentGameStartHammer } from '$lib/stores/matchState';

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
					<span class="name">{$team1.name || 'Team 1'}</span>
				</button>
				<button
					class="option"
					style="--btn-color: {$team2.color}; --btn-text: {team2TextColor};"
					onclick={() => selectStartingTeam(2)}
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
		width: min(520px, 94vw);
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
		word-break: break-word;
		line-height: 1.3;
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
