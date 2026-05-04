<script lang="ts">
	import { Settings, ArrowLeftRight, RefreshCw, Check } from '@lucide/svelte';
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
		if (onSwitchSides) {
			onSwitchSides();
		} else {
			switchSides();
		}
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
<Modal isOpen={isOpen} title={m.scoring_customize()} onClose={close} maxWidth="380px">
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
		<div class="colors-section">
			<!-- Team 1 -->
			<div class="team-card">
				<div class="team-card-header">
					<span class="team-color-dot" style="background-color: {$team1.color}"></span>
					<span class="team-name">{$team1.name}</span>
				</div>
				<div class="color-grid">
					{#each PRESET_COLORS as color (color)}
						<button
							class="swatch"
							class:selected={color === $team1.color}
							style="background-color: {color}"
							onclick={() => setTeamColor(1, color)}
							aria-label="Color {color}"
						>
							{#if color === $team1.color}
								<Check size={20} strokeWidth={3} class="check-icon" />
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- Team 2 -->
			<div class="team-card">
				<div class="team-card-header">
					<span class="team-color-dot" style="background-color: {$team2.color}"></span>
					<span class="team-name">{$team2.name}</span>
				</div>
				<div class="color-grid">
					{#each PRESET_COLORS as color (color)}
						<button
							class="swatch"
							class:selected={color === $team2.color}
							style="background-color: {color}"
							onclick={() => setTeamColor(2, color)}
							aria-label="Color {color}"
						>
							{#if color === $team2.color}
								<Check size={20} strokeWidth={3} class="check-icon" />
							{/if}
						</button>
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

	/* Panel layout */
	.panel-content {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
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

	/* Name size row */
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

	/* Team color cards */
	.colors-section {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.team-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem 0.75rem;
		border-radius: 10px;
		background: color-mix(in srgb, var(--muted) 25%, transparent);
		border: 1px solid var(--border);
	}

	.team-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.team-color-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, var(--foreground) 15%, transparent);
		box-shadow: 0 0 0 1px var(--background) inset;
	}

	.team-name {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.color-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.swatch {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 1.5px solid color-mix(in srgb, var(--foreground) 12%, transparent);
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.15s ease;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		-webkit-tap-highlight-color: transparent;
	}

	.swatch:active {
		transform: scale(0.92);
	}

	.swatch.selected {
		border-color: var(--background);
		box-shadow: 0 0 0 2px var(--primary), 0 2px 8px rgba(0, 0, 0, 0.25);
		transform: scale(1.05);
	}

	.swatch :global(.check-icon) {
		color: white;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
		pointer-events: none;
	}
</style>
