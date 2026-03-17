<script lang="ts">
	import Modal from './Modal.svelte';
	import NumberControl from './NumberControl.svelte';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, updateTeam } from '$lib/stores/teams';
	import * as m from '$lib/paraglide/messages.js';
	import { Play } from '@lucide/svelte';

	interface Props {
		isOpen?: boolean;
		onclose?: () => void;
		onstart?: () => void;
	}

	let { isOpen = false, onclose = () => {}, onstart }: Props = $props();

	// Color presets (same as ColorPickerModal)
	const presetColors: string[] = [
		'#E6BD80', '#1B100E', '#DADADA', '#BB484D', '#D06249',
		'#DFC530', '#559D5E', '#3CBCFB', '#014BC6', '#DA85CE', '#8B65A0'
	];

	// Local editable state
	let gameType = $state<'singles' | 'doubles'>('singles');
	let gameMode = $state<'points' | 'rounds'>('points');
	let pointsToWin = $state(7);
	let matchesToWin = $state(1);
	let roundsToPlay = $state(4);
	let allowTies = $state(true);
	let show20s = $state(false);
	let showHammer = $state(false);
	let showTimer = $state(true);
	let timerMinutes = $state(10);
	let timerSeconds = $state(0);
	let t1Name = $state('Team 1');
	let t2Name = $state('Team 2');
	let t1Color = $state('#1B100E');
	let t2Color = $state('#BB484D');

	// Sync from stores when modal opens
	$effect(() => {
		if (isOpen) {
			const s = $gameSettings;
			gameType = s.gameType;
			gameMode = s.gameMode;
			pointsToWin = s.pointsToWin ?? 7;
			matchesToWin = s.matchesToWin ?? 1;
			roundsToPlay = s.roundsToPlay ?? 4;
			allowTies = s.allowTiesInRoundsMode;
			show20s = s.show20s;
			showHammer = s.showHammer;
			showTimer = s.showTimer;
			timerMinutes = s.timerMinutes;
			timerSeconds = s.timerSeconds;
			t1Name = $team1.name;
			t2Name = $team2.name;
			t1Color = $team1.color;
			t2Color = $team2.color;
		}
	});

	function handleGameModeChange(mode: 'points' | 'rounds') {
		gameMode = mode;
		if (mode === 'rounds') {
			allowTies = false;
		}
	}

	function handleStart() {
		// Apply settings to store
		gameSettings.update(s => ({
			...s,
			gameType,
			gameMode,
			pointsToWin: gameMode === 'points' ? pointsToWin : undefined,
			matchesToWin: gameMode === 'points' ? matchesToWin : undefined,
			roundsToPlay: gameMode === 'rounds' ? roundsToPlay : undefined,
			allowTiesInRoundsMode: allowTies,
			show20s,
			showHammer,
			showTimer,
			timerMinutes,
			timerSeconds
		}));
		gameSettings.save();

		// Apply team names and colors
		updateTeam(1, { name: t1Name, color: t1Color });
		updateTeam(2, { name: t2Name, color: t2Color });

		onstart?.();
		onclose();
	}
</script>

<Modal {isOpen} title={m.scoring_friendlyMatch()} onClose={onclose}>
	<div class="friendly-modal">
		<div class="friendly-content">

		<!-- Game Type + Mode row -->
		<div class="settings-row">
			<section class="settings-section">
				<h3>{m.scoring_gameType()}</h3>
				<div class="button-group">
					<button
						class="mode-button"
						class:active={gameType === 'singles'}
						onclick={() => gameType = 'singles'}
						type="button"
					>
						{m.scoring_singles()}
					</button>
					<button
						class="mode-button"
						class:active={gameType === 'doubles'}
						onclick={() => gameType = 'doubles'}
						type="button"
					>
						{m.scoring_doubles()}
					</button>
				</div>
			</section>

			<section class="settings-section">
				<h3>{m.scoring_gameMode()}</h3>
				<div class="button-group">
					<button
						class="mode-button"
						class:active={gameMode === 'points'}
						onclick={() => handleGameModeChange('points')}
						type="button"
					>
						{m.scoring_modePoints()}
					</button>
					<button
						class="mode-button"
						class:active={gameMode === 'rounds'}
						onclick={() => handleGameModeChange('rounds')}
						type="button"
					>
						{m.scoring_modeRounds()}
					</button>
				</div>
			</section>
		</div>

		<!-- Points/Rounds Configuration -->
		<section class="settings-section config-section">
			<div class="mode-config">
				{#if gameMode === 'points'}
					<NumberControl
						bind:value={pointsToWin}
						min={1}
						max={200}
						step={1}
						label={m.scoring_pointsToWin()}
					/>
					<NumberControl
						bind:value={matchesToWin}
						min={1}
						max={10}
						step={1}
						label={m.scoring_matchesToWin()}
					/>
				{:else}
					<NumberControl
						bind:value={roundsToPlay}
						min={1}
						max={20}
						step={1}
						label={m.scoring_roundsToPlay()}
					/>
					<label class="toggle-item compact">
						<span class="toggle-label">{m.scoring_allowTies()}</span>
						<input type="checkbox" bind:checked={allowTies} />
						<span class="toggle-switch"></span>
					</label>
				{/if}
			</div>
		</section>

		<!-- Feature Toggles -->
		<section class="settings-section">
			<h3>{m.scoring_features()}</h3>
			<div class="toggle-grid">
				<label class="toggle-item">
					<span class="toggle-label">{m.scoring_track20s()}</span>
					<input type="checkbox" bind:checked={show20s} />
					<span class="toggle-switch"></span>
				</label>
				<label class="toggle-item">
					<span class="toggle-label">{m.scoring_hammer()}</span>
					<input type="checkbox" bind:checked={showHammer} />
					<span class="toggle-switch"></span>
				</label>
				<label class="toggle-item">
					<span class="toggle-label">{m.scoring_showTimer()}</span>
					<input type="checkbox" bind:checked={showTimer} />
					<span class="toggle-switch"></span>
				</label>
			</div>
		</section>

		<!-- Timer Configuration -->
		{#if showTimer}
			<section class="settings-section">
				<h3>{m.scoring_timer()}</h3>
				<div class="timer-controls">
					<NumberControl
						bind:value={timerMinutes}
						min={0}
						max={60}
						step={1}
						label={m.scoring_minutes()}
					/>
					<NumberControl
						bind:value={timerSeconds}
						min={0}
						max={45}
						step={15}
						label={m.scoring_seconds()}
					/>
				</div>
			</section>
		{/if}

		<!-- Teams -->
		<section class="settings-section">
			<h3>{m.scoring_team()} 1 / {m.scoring_team()} 2</h3>
			<div class="teams-row">
				<div class="team-card">
					<input
						class="team-name-input"
						type="text"
						bind:value={t1Name}
						maxlength="20"
						placeholder="Team 1"
					/>
					<div class="color-swatches">
						{#each presetColors as color (color)}
							<button
								class="swatch"
								class:selected={t1Color === color}
								style="background: {color}"
								onclick={() => t1Color = color}
								type="button"
								aria-label="Color {color}"
							></button>
						{/each}
					</div>
				</div>
				<div class="team-card">
					<input
						class="team-name-input"
						type="text"
						bind:value={t2Name}
						maxlength="20"
						placeholder="Team 2"
					/>
					<div class="color-swatches">
						{#each presetColors as color (color)}
							<button
								class="swatch"
								class:selected={t2Color === color}
								style="background: {color}"
								onclick={() => t2Color = color}
								type="button"
								aria-label="Color {color}"
							></button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- Play Button -->
		<button class="play-button" onclick={handleStart} type="button">
			<Play class="size-5" />
			<span>{m.common_play()}</span>
		</button>

		</div>
	</div>
</Modal>

<style>
	.friendly-modal {
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: 70vh;
		overflow: hidden;
	}

	.friendly-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		overflow-y: auto;
		min-height: 0;
		flex: 1;
	}

	.friendly-content::-webkit-scrollbar {
		width: 4px;
	}

	.friendly-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.friendly-content::-webkit-scrollbar-thumb {
		background: var(--muted);
		border-radius: 2px;
	}

	/* Layout */
	.settings-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		background: color-mix(in srgb, var(--muted) 50%, transparent);
		border-radius: 8px;
	}

	.config-section {
		padding: 0.5rem 0.75rem;
	}

	.settings-section h3 {
		margin: 0;
		font-size: 0.7rem;
		color: var(--muted-foreground);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	/* Button groups */
	.button-group {
		display: flex;
		gap: 0.4rem;
	}

	.mode-button {
		flex: 1;
		padding: 0.55rem 0.75rem;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-button:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.mode-button.active {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--foreground);
		border-color: color-mix(in srgb, var(--primary) 40%, transparent);
		font-weight: 600;
	}

	/* Number controls grid */
	.mode-config {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.timer-controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	/* Toggle grid */
	.toggle-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.4rem;
	}

	.toggle-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.65rem;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		position: relative;
		transition: all 0.15s ease;
	}

	.toggle-item:hover {
		background: var(--accent);
	}

	.toggle-label {
		font-size: 0.8rem;
		color: var(--foreground);
		opacity: 0.8;
		font-weight: 500;
	}

	.toggle-item input[type="checkbox"] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-switch {
		position: relative;
		width: 36px;
		height: 20px;
		background: var(--muted);
		border-radius: 10px;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.toggle-switch::before {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		background: var(--muted-foreground);
		border-radius: 50%;
		transition: all 0.2s ease;
	}

	.toggle-item input:checked ~ .toggle-switch {
		background: var(--primary);
	}

	.toggle-item input:checked ~ .toggle-switch::before {
		transform: translateX(16px);
		background: var(--primary-foreground);
	}

	/* Teams */
	.teams-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.team-card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.team-name-input {
		width: 100%;
		padding: 0.45rem 0.6rem;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--foreground);
		font-size: 0.85rem;
		font-weight: 500;
		transition: border-color 0.15s ease;
		box-sizing: border-box;
	}

	.team-name-input:focus {
		outline: none;
		border-color: var(--primary);
	}

	.team-name-input::placeholder {
		color: var(--muted-foreground);
	}

	.color-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.swatch {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s ease;
		padding: 0;
	}

	.swatch:hover {
		transform: scale(1.15);
	}

	.swatch.selected {
		border-color: var(--primary);
		box-shadow: 0 0 0 1px var(--background), 0 0 0 3px var(--primary);
	}

	/* Play button */
	.play-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem;
		margin-top: 0.25rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.play-button:hover {
		opacity: 0.9;
	}

	.play-button:active {
		transform: scale(0.98);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.friendly-modal {
			max-height: 75vh;
		}

		.friendly-content {
			gap: 0.4rem;
			padding: 0.5rem;
		}

		.settings-row {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}

		.settings-section {
			gap: 0.4rem;
			padding: 0.6rem;
		}

		.settings-section h3 {
			font-size: 0.65rem;
		}

		.mode-button {
			padding: 0.5rem 0.6rem;
			font-size: 0.8rem;
		}

		.toggle-grid {
			gap: 0.35rem;
		}

		.toggle-item {
			padding: 0.45rem 0.55rem;
		}

		.toggle-label {
			font-size: 0.75rem;
		}

		.toggle-switch {
			width: 32px;
			height: 18px;
		}

		.toggle-switch::before {
			width: 14px;
			height: 14px;
		}

		.toggle-item input:checked ~ .toggle-switch::before {
			transform: translateX(14px);
		}

		.swatch {
			width: 18px;
			height: 18px;
		}

		.play-button {
			padding: 0.65rem;
			font-size: 0.9rem;
		}
	}

	/* Landscape */
	@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
		.friendly-modal {
			max-height: 65vh;
		}

		.friendly-content {
			gap: 0.3rem;
			padding: 0.4rem;
		}

		.settings-section {
			gap: 0.3rem;
			padding: 0.4rem;
		}

		.settings-section h3 {
			font-size: 0.6rem;
		}

		.mode-button {
			padding: 0.35rem 0.5rem;
			font-size: 0.75rem;
		}

		.toggle-item {
			padding: 0.35rem 0.45rem;
		}

		.toggle-label {
			font-size: 0.7rem;
		}

		.swatch {
			width: 16px;
			height: 16px;
		}

		.play-button {
			padding: 0.5rem;
			font-size: 0.85rem;
		}
	}
</style>
