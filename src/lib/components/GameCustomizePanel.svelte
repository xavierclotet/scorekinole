<script lang="ts">
	import { Settings, ArrowLeftRight, RefreshCw } from '@lucide/svelte';
	import Modal from './Modal.svelte';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, switchSides, switchColors } from '$lib/stores/teams';
	import { PRESET_COLORS } from '$lib/constants';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		inTournamentMode?: boolean;
		onSwitchSides?: () => void;
	}

	let { inTournamentMode = false, onSwitchSides }: Props = $props();

	let isOpen = $state(false);

	function open() {
		isOpen = true;
	}

	function close() {
		isOpen = false;
	}

	function handleSwitchSides() {
		switchSides();
		if (onSwitchSides) onSwitchSides();
	}

	function handleSwitchColors() {
		switchColors();
	}

	function setNameSize(size: 'small' | 'medium' | 'large') {
		gameSettings.update(s => ({ ...s, nameSize: size }));
		gameSettings.save();
	}

	function setTeamColor(teamNumber: 1 | 2, color: string) {
		if (teamNumber === 1) {
			team1.update(t => ({ ...t, color }));
		} else {
			team2.update(t => ({ ...t, color }));
		}
	}
</script>

<!-- Floating trigger button -->
<button
	class="customize-btn"
	onclick={(e) => { e.stopPropagation(); open(); }}
	ontouchend={(e) => e.stopPropagation()}
	aria-label={m.scoring_customize()}
	title={m.scoring_customize()}
>
	<Settings size={20} />
</button>

<!-- Customize Panel Modal -->
<Modal isOpen={isOpen} title={m.scoring_customize()} onClose={close} maxWidth="300px">
	<div class="panel-content">

		<!-- Quick Actions -->
		<div class="action-row">
			<button class="action-btn" onclick={handleSwitchSides}>
				<ArrowLeftRight size={16} />
				<span>{m.scoring_switchSides()}</span>
			</button>
			<button class="action-btn" onclick={handleSwitchColors}>
				<RefreshCw size={16} />
				<span>{m.scoring_switchColors()}</span>
			</button>
		</div>

		<!-- Name Size -->
		<div class="size-row">
			<span class="size-label">{m.scoring_nameSize()}</span>
			<div class="size-group">
				{#each (['small', 'medium', 'large'] as const) as size (size)}
					<button
						class="size-btn"
						class:active={($gameSettings.nameSize || 'medium') === size}
						onclick={() => setNameSize(size)}
					>
						{size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
					</button>
				{/each}
			</div>
		</div>

		<!-- Team Colors -->
		<div class="colors-row">
			<!-- Team 1 -->
			<div class="team-colors">
				<div class="team-colors-label">{$team1.name}</div>
				<div class="color-swatches">
					{#each PRESET_COLORS as color (color)}
						<button
							class="swatch"
							class:selected={color === $team1.color}
							style="background-color: {color}"
							onclick={() => setTeamColor(1, color)}
							aria-label="Color {color}"
						></button>
					{/each}
				</div>
			</div>
			<!-- Team 2 -->
			<div class="team-colors">
				<div class="team-colors-label">{$team2.name}</div>
				<div class="color-swatches">
					{#each PRESET_COLORS as color (color)}
						<button
							class="swatch"
							class:selected={color === $team2.color}
							style="background-color: {color}"
							onclick={() => setTeamColor(2, color)}
							aria-label="Color {color}"
						></button>
					{/each}
				</div>
			</div>
		</div>

	</div>
</Modal>

<style>
	/* Floating trigger button */
	.customize-btn {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.15s ease, background 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.customize-btn:active {
		transform: translateX(-50%) scale(0.92);
		background: rgba(0, 0, 0, 0.7);
	}

	/* On mobile portrait (stacked cards), center between the two cards */
	@media (max-width: 600px) {
		.customize-btn {
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
		}

		.customize-btn:active {
			transform: translate(-50%, -50%) scale(0.92);
		}
	}

	/* Panel content */
	.panel-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Quick action buttons */
	.action-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		height: 38px;
		padding: 0 0.75rem;
		border-radius: 8px;
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
		color: var(--foreground);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.action-btn:active {
		background: color-mix(in srgb, var(--primary) 20%, transparent);
	}

	.size-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.size-label {
		font-size: 0.72rem;
		color: var(--muted-foreground);
		font-weight: 500;
		white-space: nowrap;
		width: 4.5rem;
		flex-shrink: 0;
	}

	.size-group {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.35rem;
		flex: 1;
	}

	.size-btn {
		height: 32px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--muted) 50%, transparent);
		border: 1px solid var(--border);
		color: var(--muted-foreground);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.size-btn.active {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		border-color: var(--primary);
		color: var(--primary);
	}

	.size-btn:active:not(.active) {
		background: color-mix(in srgb, var(--muted) 80%, transparent);
	}

	/* Team colors */
	.colors-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.team-colors {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.team-colors-label {
		font-size: 0.72rem;
		color: var(--muted-foreground);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 4rem;
		flex-shrink: 0;
	}

	.color-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		padding: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.swatch:active {
		transform: scale(1.15);
	}

	.swatch.selected {
		border-color: var(--primary);
		box-shadow: 0 0 0 1px var(--background), 0 0 0 3px var(--primary);
	}
</style>
