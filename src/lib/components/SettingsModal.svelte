<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import NumberControl from './NumberControl.svelte';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { t } from '$lib/stores/language';
	import { switchSides, switchColors } from '$lib/stores/teams';
	import { gameTournamentContext, updateTournamentContext } from '$lib/stores/tournamentContext';
	import type { Language } from '$lib/i18n/translations';
	import type { GameSettings } from '$lib/types/settings';

	export let isOpen: boolean = false;
	export let onClose: () => void = () => {};

	// Tournament mode detection
	$: inTournamentMode = !!$gameTournamentContext;
	$: tournamentName = $gameTournamentContext?.tournamentName || '';

	// Auto-save: directly update the store on every change
	function handleLanguageChange(lang: Language) {
		gameSettings.update(s => ({ ...s, language: lang }));
		gameSettings.save();
	}

	function handleGameModeChange(mode: 'points' | 'rounds') {
		gameSettings.update(s => ({ ...s, gameMode: mode }));
		gameSettings.save();
	}

	function handleGameTypeChange(type: 'singles' | 'doubles') {
		gameSettings.update(s => ({ ...s, gameType: type }));
		gameSettings.save();
	}

	function handleToggle(key: 'show20s' | 'showHammer' | 'showTimer' | 'showScoreTable') {
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
</script>

<Modal {isOpen} title={$t('settings')} onClose={onClose}>
	<div class="settings-modal">
		<div class="settings-content">

		<!-- Tournament Mode Banner -->
		{#if inTournamentMode}
			<div class="tournament-banner">
				<span class="lock-icon">🔒</span>
				<span class="banner-text">{$t('lockedByTournament') || 'Bloqueado por torneo'}: {tournamentName}</span>
			</div>
		{/if}

		<!-- Game Type Section (Individual/Parejas) -->
		<section class="settings-section" class:disabled={inTournamentMode}>
			<h3>{$t('gameType')}</h3>
			<div class="button-group">
				<button
					class="mode-button"
					class:active={$gameSettings.gameType === 'singles'}
					on:click={() => !inTournamentMode && handleGameTypeChange('singles')}
					type="button"
					disabled={inTournamentMode}
				>
					{$t('singles')}
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.gameType === 'doubles'}
					on:click={() => !inTournamentMode && handleGameTypeChange('doubles')}
					type="button"
					disabled={inTournamentMode}
				>
					{$t('doubles')}
				</button>
			</div>
		</section>

		<!-- Game Mode Section -->
		<section class="settings-section" class:disabled={inTournamentMode}>
			<h3>{$t('gameMode')}</h3>
			<div class="button-group">
				<button
					class="mode-button"
					class:active={$gameSettings.gameMode === 'points'}
					on:click={() => !inTournamentMode && handleGameModeChange('points')}
					type="button"
					disabled={inTournamentMode}
				>
					{$t('modePoints')}
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.gameMode === 'rounds'}
					on:click={() => !inTournamentMode && handleGameModeChange('rounds')}
					type="button"
					disabled={inTournamentMode}
				>
					{$t('modeRounds')}
				</button>
			</div>

			<!-- Points/Rounds Configuration -->
			<div class="mode-config">
				{#if $gameSettings.gameMode === 'points'}
					<NumberControl
						value={$gameSettings.pointsToWin}
						on:change={(e) => !inTournamentMode && handleNumberChange('pointsToWin', e.detail)}
						min={1}
						max={200}
						step={1}
						label={$t('pointsToWin')}
						disabled={inTournamentMode}
					/>
					<NumberControl
						value={$gameSettings.matchesToWin}
						on:change={(e) => !inTournamentMode && handleNumberChange('matchesToWin', e.detail)}
						min={1}
						max={10}
						step={1}
						label={$t('matchesToWin')}
						disabled={inTournamentMode}
					/>
				{:else}
					<NumberControl
						value={$gameSettings.roundsToPlay}
						on:change={(e) => !inTournamentMode && handleNumberChange('roundsToPlay', e.detail)}
						min={1}
						max={20}
						step={1}
						label={$t('roundsToPlay')}
						disabled={inTournamentMode}
					/>
				{/if}
			</div>
		</section>

		<!-- Feature Toggles -->
		<section class="settings-section" class:disabled={inTournamentMode}>
			<h3>{$t('features')}</h3>
			<div class="toggle-grid">
				<label class="toggle-item" class:disabled={inTournamentMode} on:click|preventDefault={() => !inTournamentMode && handleToggle('show20s')}>
					<span class="toggle-label">{$t('track20s')}</span>
					<input type="checkbox" checked={$gameSettings.show20s} readonly disabled={inTournamentMode} />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" class:disabled={inTournamentMode} on:click|preventDefault={() => !inTournamentMode && handleToggle('showHammer')}>
					<span class="toggle-label">{$t('hammer')}</span>
					<input type="checkbox" checked={$gameSettings.showHammer} readonly disabled={inTournamentMode} />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" on:click|preventDefault={() => handleToggle('showTimer')}>
					<span class="toggle-label">{$t('showTimer')}</span>
					<input type="checkbox" checked={$gameSettings.showTimer} readonly />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" on:click|preventDefault={() => handleToggle('showScoreTable')}>
					<span class="toggle-label">{$t('showScoreTable')}</span>
					<input type="checkbox" checked={$gameSettings.showScoreTable} readonly />
					<span class="toggle-switch"></span>
				</label>
			</div>
		</section>

		<!-- Timer Configuration - Only shown if showTimer is true -->
		{#if $gameSettings.showTimer}
			<section class="settings-section">
				<h3>{$t('timer')}</h3>
				<div class="timer-controls">
					<NumberControl
						value={$gameSettings.timerMinutes}
						on:change={(e) => handleNumberChange('timerMinutes', e.detail)}
						min={0}
						max={60}
						step={1}
						label="{$t('minutes')}"
					/>
					<NumberControl
						value={$gameSettings.timerSeconds}
						on:change={(e) => handleNumberChange('timerSeconds', e.detail)}
						min={0}
						max={45}
						step={15}
						label="{$t('seconds')}"
					/>
				</div>
			</section>
		{/if}

		<!-- Actions Section -->
		<section class="settings-section advanced-section">
			<h3>{$t('actions')}</h3>
			<div class="action-buttons">
				<button class="action-button" on:click={handleSwitchSides} type="button">
					<span class="icon">⇄</span>
					<span>{$t('switchSides')}</span>
				</button>
				<button class="action-button" on:click={handleSwitchColors} type="button">
					<span class="icon">🎨</span>
					<span>{$t('switchColors')}</span>
				</button>
			</div>
		</section>

		<!-- Language Section -->
		<section class="settings-section">
			<h3>{$t('language')}</h3>
			<div class="button-group-three">
				<button
					class="mode-button"
					class:active={$gameSettings.language === 'es'}
					on:click={() => handleLanguageChange('es')}
					type="button"
				>
					Español
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.language === 'ca'}
					on:click={() => handleLanguageChange('ca')}
					type="button"
				>
					Català
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.language === 'en'}
					on:click={() => handleLanguageChange('en')}
					type="button"
				>
					English
				</button>
			</div>
		</section>
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
		gap: 1.25rem;
		padding: 1rem;
		overflow-y: auto;
		min-height: 0;
		flex: 1;
		padding-bottom: 1rem;
	}

	/* Tournament Mode Banner */
	.tournament-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 200, 100, 0.1));
		border: 2px solid rgba(0, 255, 136, 0.4);
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}

	.tournament-banner .lock-icon {
		font-size: 1.2rem;
	}

	.tournament-banner .banner-text {
		color: #00ff88;
		font-weight: 600;
		font-size: 0.9rem;
	}

	/* Disabled sections in tournament mode */
	.settings-section.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.settings-section.disabled h3 {
		color: rgba(0, 255, 136, 0.5);
	}

	.toggle-item.disabled {
		opacity: 0.5;
		pointer-events: none;
		cursor: not-allowed;
	}

	/* Scrollbar styling */
	.settings-content::-webkit-scrollbar {
		width: 8px;
	}

	.settings-content::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	.settings-content::-webkit-scrollbar-thumb {
		background: var(--accent-green, #00ff88);
		border-radius: 4px;
	}

	.settings-content::-webkit-scrollbar-thumb:hover {
		background: var(--accent-green-light, #00ffaa);
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.settings-section h3 {
		margin: 0;
		font-size: 1.1rem;
		color: #00ff88;
		font-weight: 700;
	}

	.button-group {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.button-group-three {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
	}

	.mode-config {
		margin-top: 0.5rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.mode-button {
		padding: 0.65rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mode-button:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.mode-button.active {
		background: #00ff88;
		color: #000;
		border-color: #00ff88;
	}

	.timer-controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.toggle-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
	}

	.toggle-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		cursor: pointer;
		position: relative;
		transition: all 0.2s;
	}

	.toggle-item:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(0, 255, 136, 0.3);
	}

	.toggle-label {
		font-size: 0.85rem;
		color: #fff;
		text-align: center;
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
		width: 44px;
		height: 24px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		transition: all 0.3s;
		flex-shrink: 0;
	}

	.toggle-switch::before {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		background: #fff;
		border-radius: 50%;
		transition: all 0.3s;
	}

	.toggle-item input:checked ~ .toggle-switch {
		background: #00ff88;
	}

	.toggle-item input:checked ~ .toggle-switch::before {
		transform: translateX(20px);
	}

	.app-info {
		text-align: center;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
	}

	.app-info p {
		margin: 0.25rem 0;
	}

	/* Responsive */
	@media (max-width: 600px) {
		.settings-modal {
			max-height: 75vh;
		}

		.settings-content {
			gap: 1rem;
			padding-bottom: 2rem;
		}

		.settings-section {
			gap: 0.5rem;
		}

		.settings-section h3 {
			font-size: 1rem;
		}

		.mode-button {
			padding: 0.5rem 0.75rem;
			font-size: 0.9rem;
		}

		.mode-config {
			gap: 0.5rem;
		}

		.timer-controls {
			gap: 0.5rem;
		}

		.toggle-grid {
			gap: 0.5rem;
		}

		.toggle-item {
			padding: 0.65rem 0.5rem;
		}

		.toggle-label {
			font-size: 0.8rem;
		}

		.toggle-switch {
			width: 40px;
			height: 22px;
		}

		.toggle-switch::before {
			width: 18px;
			height: 18px;
		}

		.toggle-item input:checked ~ .toggle-switch::before {
			transform: translateX(18px);
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
			gap: 1rem;
		}

		.settings-section {
			gap: 0.5rem;
		}

		.settings-section h3 {
			font-size: 1rem;
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
			padding: 0.75rem;
			gap: 0.75rem;
		}

		.settings-section h3 {
			font-size: 0.95rem;
		}

		.mode-button {
			padding: 0.5rem 0.75rem;
			font-size: 0.85rem;
		}

		.mode-config,
		.timer-controls,
		.toggle-grid {
			gap: 0.5rem;
		}

		.toggle-item {
			padding: 0.6rem 0.5rem;
		}

		.toggle-label {
			font-size: 0.75rem;
		}

		.toggle-switch {
			width: 38px;
			height: 20px;
		}

		.toggle-switch::before {
			width: 16px;
			height: 16px;
		}

		.toggle-item input:checked ~ .toggle-switch::before {
			transform: translateX(18px);
		}
	}

	/* Advanced Actions Section */
	.advanced-section {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 1rem;
		margin-top: 0.5rem;
	}

	.description {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0;
		text-align: center;
	}

	.action-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.action-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0.75rem;
		background: rgba(255, 255, 255, 0.08);
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		color: #fff;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-button:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(0, 255, 136, 0.4);
		transform: translateY(-2px);
	}

	.action-button:active {
		transform: translateY(0);
	}

	.action-button .icon {
		font-size: 1.5rem;
	}

	@media (max-width: 600px) {
		.action-buttons {
			gap: 0.5rem;
		}

		.action-button {
			padding: 0.75rem 0.5rem;
			font-size: 0.85rem;
		}

		.action-button .icon {
			font-size: 1.3rem;
		}

		.description {
			font-size: 0.8rem;
		}
	}
</style>
