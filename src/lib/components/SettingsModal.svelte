<script lang="ts">
	import Modal from './Modal.svelte';
	import NumberControl from './NumberControl.svelte';
	import { gameSettings } from '$lib/stores/gameSettings';
	import * as m from '$lib/paraglide/messages.js';
	import { setLocale, getLocale } from '$lib/paraglide/runtime.js';
	import { switchSides, switchColors } from '$lib/stores/teams';
	import { gameTournamentContext, updateTournamentContext } from '$lib/stores/tournamentContext';
	import { currentUser } from '$lib/firebase/auth';
	import { saveUserLanguage } from '$lib/firebase/userProfile';
	import type { GameSettings } from '$lib/types/settings';

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
	}

	let { isOpen = false, onClose = () => {} }: Props = $props();

	// Tournament mode detection
	let inTournamentMode = $derived(!!$gameTournamentContext);
	let tournamentName = $derived($gameTournamentContext?.tournamentName || '');

	// Current language from Paraglide (reads from cookie)
	let currentLang = $derived(getLocale());

	// Handle language change - use Paraglide directly
	async function handleLanguageChange(lang: 'es' | 'ca' | 'en') {
		setLocale(lang);
		// If user is authenticated, also save to their profile
		if ($currentUser) {
			await saveUserLanguage(lang);
		}
	}

	function handleGameModeChange(mode: 'points' | 'rounds') {
		gameSettings.update(s => ({ ...s, gameMode: mode }));
		gameSettings.save();
	}

	function handleGameTypeChange(type: 'singles' | 'doubles') {
		gameSettings.update(s => ({ ...s, gameType: type }));
		gameSettings.save();
	}

	function handleToggle(key: 'show20s' | 'showHammer' | 'showTimer' | 'showScoreTable' | 'allowTiesInRoundsMode') {
		gameSettings.update(s => ({ ...s, [key]: !s[key] }));
		gameSettings.save();
	}

	function handleNumberChange(key: keyof GameSettings, newValue: number) {
		gameSettings.update(s => ({ ...s, [key]: newValue }));
		gameSettings.save();
	}

	function handleSwitchSides() {
		switchSides();
		// En modo torneo, también actualizar el lado del usuario en el contexto
		if ($gameTournamentContext) {
			const newSide = $gameTournamentContext.currentUserSide === 'A' ? 'B' : 'A';
			updateTournamentContext({ currentUserSide: newSide });
		}
	}

	function handleSwitchColors() {
		switchColors();
	}

	function handleClearStorage() {
		localStorage.clear();
		window.location.reload();
	}
</script>

<Modal {isOpen} title={m.common_settings()} onClose={onClose}>
	<div class="settings-modal">
		<div class="settings-content">

		<!-- Tournament Mode Banner -->
		{#if inTournamentMode}
			<div class="tournament-banner">
				<span class="lock-icon">🔒</span>
				<span class="banner-text">{m.scoring_lockedByTournament()}: {tournamentName}</span>
			</div>
		{/if}

		<!-- Game Settings Row (Type + Mode side by side) -->
		<div class="settings-row">
			<!-- Game Type Section (Individual/Parejas) -->
			<section class="settings-section" class:disabled={inTournamentMode}>
				<h3>{m.scoring_gameType()}</h3>
				<div class="button-group">
					<button
						class="mode-button"
						class:active={$gameSettings.gameType === 'singles'}
						onclick={() => !inTournamentMode && handleGameTypeChange('singles')}
						type="button"
						disabled={inTournamentMode}
					>
						{m.scoring_singles()}
					</button>
					<button
						class="mode-button"
						class:active={$gameSettings.gameType === 'doubles'}
						onclick={() => !inTournamentMode && handleGameTypeChange('doubles')}
						type="button"
						disabled={inTournamentMode}
					>
						{m.scoring_doubles()}
					</button>
				</div>
			</section>

			<!-- Game Mode Section -->
			<section class="settings-section" class:disabled={inTournamentMode}>
				<h3>{m.scoring_gameMode()}</h3>
				<div class="button-group">
					<button
						class="mode-button"
						class:active={$gameSettings.gameMode === 'points'}
						onclick={() => !inTournamentMode && handleGameModeChange('points')}
						type="button"
						disabled={inTournamentMode}
					>
						{m.scoring_modePoints()}
					</button>
					<button
						class="mode-button"
						class:active={$gameSettings.gameMode === 'rounds'}
						onclick={() => !inTournamentMode && handleGameModeChange('rounds')}
						type="button"
						disabled={inTournamentMode}
					>
						{m.scoring_modeRounds()}
					</button>
				</div>
			</section>
		</div>

		<!-- Points/Rounds Configuration -->
		<section class="settings-section config-section" class:disabled={inTournamentMode}>
			<div class="mode-config">
				{#if $gameSettings.gameMode === 'points'}
					<NumberControl
						value={$gameSettings.pointsToWin}
						onchange={(value) => !inTournamentMode && handleNumberChange('pointsToWin', value)}
						min={1}
						max={200}
						step={1}
						label={m.scoring_pointsToWin()}
						disabled={inTournamentMode}
					/>
					<NumberControl
						value={$gameSettings.matchesToWin}
						onchange={(value) => !inTournamentMode && handleNumberChange('matchesToWin', value)}
						min={1}
						max={10}
						step={1}
						label={m.scoring_matchesToWin()}
						disabled={inTournamentMode}
					/>
				{:else}
					<NumberControl
						value={$gameSettings.roundsToPlay}
						onchange={(value) => !inTournamentMode && handleNumberChange('roundsToPlay', value)}
						min={1}
						max={20}
						step={1}
						label={m.scoring_roundsToPlay()}
						disabled={inTournamentMode}
					/>
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
					<label class="toggle-item compact" class:disabled={inTournamentMode} onclick={(e) => { e.preventDefault(); !inTournamentMode && handleToggle('allowTiesInRoundsMode'); }}>
						<span class="toggle-label">{m.scoring_allowTies()}</span>
						<input type="checkbox" checked={$gameSettings.allowTiesInRoundsMode} readonly disabled={inTournamentMode} />
						<span class="toggle-switch"></span>
					</label>
				{/if}
			</div>
		</section>

		<!-- Feature Toggles -->
		<section class="settings-section" class:disabled={inTournamentMode}>
			<h3>{m.scoring_features()}</h3>
			<div class="toggle-grid">
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
				<label class="toggle-item" class:disabled={inTournamentMode} onclick={(e) => { e.preventDefault(); !inTournamentMode && handleToggle('show20s'); }}>
					<span class="toggle-label">{m.scoring_track20s()}</span>
					<input type="checkbox" checked={$gameSettings.show20s} readonly disabled={inTournamentMode} />
					<span class="toggle-switch"></span>
				</label>

				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
				<label class="toggle-item" class:disabled={inTournamentMode} onclick={(e) => { e.preventDefault(); !inTournamentMode && handleToggle('showHammer'); }}>
					<span class="toggle-label">{m.scoring_hammer()}</span>
					<input type="checkbox" checked={$gameSettings.showHammer} readonly disabled={inTournamentMode} />
					<span class="toggle-switch"></span>
				</label>

				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
				<label class="toggle-item" onclick={(e) => { e.preventDefault(); handleToggle('showTimer'); }}>
					<span class="toggle-label">{m.scoring_showTimer()}</span>
					<input type="checkbox" checked={$gameSettings.showTimer} readonly />
					<span class="toggle-switch"></span>
				</label>
			</div>
		</section>

		<!-- Timer Configuration - Only shown if showTimer is true -->
		{#if $gameSettings.showTimer}
			<section class="settings-section">
				<h3>{m.scoring_timer()}</h3>
				<div class="timer-controls">
					<NumberControl
						value={$gameSettings.timerMinutes}
						onchange={(value) => handleNumberChange('timerMinutes', value)}
						min={0}
						max={60}
						step={1}
						label={m.scoring_minutes()}
					/>
					<NumberControl
						value={$gameSettings.timerSeconds}
						onchange={(value) => handleNumberChange('timerSeconds', value)}
						min={0}
						max={45}
						step={15}
						label={m.scoring_seconds()}
					/>
				</div>
			</section>
		{/if}

		<!-- Actions Section -->
		<section class="settings-section advanced-section">
			<h3>{m.scoring_actions()}</h3>
			<div class="action-buttons">
				<button class="action-button" onclick={handleSwitchSides} type="button">
					<span class="icon">⇄</span>
					<span>{m.scoring_switchSides()}</span>
				</button>
				<button class="action-button" onclick={handleSwitchColors} type="button">
					<span class="icon">🎨</span>
					<span>{m.scoring_switchColors()}</span>
				</button>
			</div>
		</section>

		<!-- Language Section -->
		<section class="settings-section">
			<h3>{m.scoring_language()}</h3>
			<div class="button-group-three">
				<button
					class="mode-button"
					class:active={currentLang === 'es'}
					onclick={() => handleLanguageChange('es')}
					type="button"
				>
					Español
				</button>
				<button
					class="mode-button"
					class:active={currentLang === 'ca'}
					onclick={() => handleLanguageChange('ca')}
					type="button"
				>
					Català
				</button>
				<button
					class="mode-button"
					class:active={currentLang === 'en'}
					onclick={() => handleLanguageChange('en')}
					type="button"
				>
					English
				</button>
			</div>
		</section>

		<!-- Clear Storage -->
		<button class="clear-storage-btn" onclick={handleClearStorage} type="button">
			Limpiar datos locales
		</button>
		</div>
	</div>
</Modal>

<style>
	.settings-modal {
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: 70vh;
		overflow: hidden;
	}

	.settings-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		overflow-y: auto;
		min-height: 0;
		flex: 1;
	}

	/* Tournament Mode Banner */
	.tournament-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.85rem;
		background: rgba(255, 200, 100, 0.08);
		border: 1px solid rgba(255, 200, 100, 0.25);
		border-radius: 6px;
		margin-bottom: 0.25rem;
	}

	.tournament-banner .lock-icon {
		font-size: 0.9rem;
	}

	.tournament-banner .banner-text {
		color: #ffcc66;
		font-weight: 500;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
	}

	/* Disabled sections in tournament mode */
	.settings-section.disabled {
		opacity: 0.4;
		pointer-events: none;
	}

	.settings-section.disabled h3 {
		color: var(--muted-foreground);
	}

	.toggle-item.disabled {
		opacity: 0.4;
		pointer-events: none;
		cursor: not-allowed;
	}

	/* Scrollbar styling */
	.settings-content::-webkit-scrollbar {
		width: 4px;
	}

	.settings-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.settings-content::-webkit-scrollbar-thumb {
		background: var(--muted);
		border-radius: 2px;
	}

	.settings-content::-webkit-scrollbar-thumb:hover {
		background: var(--muted-foreground);
	}

	/* Two-column layout for related settings */
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

	.config-section .mode-config {
		margin-top: 0;
	}

	.settings-section h3 {
		margin: 0;
		font-size: 0.7rem;
		color: var(--muted-foreground);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.button-group {
		display: flex;
		gap: 0.4rem;
	}

	.button-group-three {
		display: flex;
		gap: 0.4rem;
	}

	.mode-config {
		margin-top: 0.4rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.mode-button {
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
		border-color: var(--border);
		color: var(--foreground);
	}

	.mode-button.active {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--foreground);
		border-color: color-mix(in srgb, var(--primary) 40%, transparent);
		font-weight: 600;
	}

	.timer-controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.toggle-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.4rem;
	}

	.toggle-item {
		display: flex;
		flex-direction: row;
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
		border-color: var(--border);
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

	/* Responsive */
	@media (max-width: 600px) {
		.settings-modal {
			max-height: 75vh;
		}

		.settings-content {
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

		.mode-config {
			gap: 0.4rem;
		}

		.timer-controls {
			gap: 0.4rem;
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
	}

	/* Portrait mobile - maximize vertical space */
	@media (max-width: 600px) and (orientation: portrait) {
		.settings-modal {
			max-height: 80vh;
		}
	}

	/* Landscape optimization */
	@media (orientation: landscape) {
		.settings-content {
			gap: 0.4rem;
		}

		.settings-section {
			gap: 0.4rem;
			padding: 0.6rem;
		}

		.settings-section h3 {
			font-size: 0.65rem;
		}

		.mode-config {
			margin-top: 0.25rem;
		}
	}

	@media (orientation: landscape) and (max-height: 600px) {
		.settings-modal {
			max-height: 70vh;
		}

		.settings-content {
			padding: 0.5rem;
			gap: 0.35rem;
		}

		.settings-section {
			padding: 0.5rem;
		}

		.settings-section h3 {
			font-size: 0.6rem;
		}

		.mode-button {
			padding: 0.4rem 0.5rem;
			font-size: 0.75rem;
		}

		.mode-config,
		.timer-controls,
		.toggle-grid {
			gap: 0.35rem;
		}

		.toggle-item {
			padding: 0.4rem 0.5rem;
		}

		.toggle-label {
			font-size: 0.7rem;
		}

		.toggle-switch {
			width: 30px;
			height: 16px;
		}

		.toggle-switch::before {
			width: 12px;
			height: 12px;
		}

		.toggle-item input:checked ~ .toggle-switch::before {
			transform: translateX(14px);
		}
	}

	/* Clear storage button - very subtle */
	.clear-storage-btn {
		margin-top: 1rem;
		padding: 0.4rem 0.6rem;
		background: transparent;
		border: none;
		color: var(--muted-foreground);
		opacity: 0.5;
		font-size: 0.65rem;
		cursor: pointer;
		transition: color 0.15s ease;
		align-self: center;
	}

	.clear-storage-btn:hover {
		opacity: 0.8;
	}

	/* Actions Section */
	.advanced-section {
		border-top: 1px solid var(--border);
		margin-top: 0.25rem;
		padding-top: 0.5rem;
	}

	.action-buttons {
		display: flex;
		gap: 0.4rem;
	}

	.action-button {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
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

	.action-button:hover {
		background: var(--accent);
		border-color: var(--border);
		color: var(--foreground);
	}

	.action-button:active {
		transform: scale(0.98);
	}

	.action-button .icon {
		font-size: 0.9rem;
	}

	@media (max-width: 600px) {
		.action-buttons {
			gap: 0.35rem;
		}

		.action-button {
			padding: 0.5rem 0.4rem;
			font-size: 0.75rem;
		}

		.action-button .icon {
			font-size: 0.9rem;
		}
	}
</style>
