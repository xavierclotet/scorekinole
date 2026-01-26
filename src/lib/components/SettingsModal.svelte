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

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
	}

	let { isOpen = false, onClose = () => {} }: Props = $props();

	// Tournament mode detection
	let inTournamentMode = $derived(!!$gameTournamentContext);
	let tournamentName = $derived($gameTournamentContext?.tournamentName || '');

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

		<!-- Game Settings Row (Type + Mode side by side) -->
		<div class="settings-row">
			<!-- Game Type Section (Individual/Parejas) -->
			<section class="settings-section" class:disabled={inTournamentMode}>
				<h3>{$t('gameType')}</h3>
				<div class="button-group">
					<button
						class="mode-button"
						class:active={$gameSettings.gameType === 'singles'}
						onclick={() => !inTournamentMode && handleGameTypeChange('singles')}
						type="button"
						disabled={inTournamentMode}
					>
						{$t('singles')}
					</button>
					<button
						class="mode-button"
						class:active={$gameSettings.gameType === 'doubles'}
						onclick={() => !inTournamentMode && handleGameTypeChange('doubles')}
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
						onclick={() => !inTournamentMode && handleGameModeChange('points')}
						type="button"
						disabled={inTournamentMode}
					>
						{$t('modePoints')}
					</button>
					<button
						class="mode-button"
						class:active={$gameSettings.gameMode === 'rounds'}
						onclick={() => !inTournamentMode && handleGameModeChange('rounds')}
						type="button"
						disabled={inTournamentMode}
					>
						{$t('modeRounds')}
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
						label={$t('pointsToWin')}
						disabled={inTournamentMode}
					/>
					<NumberControl
						value={$gameSettings.matchesToWin}
						onchange={(value) => !inTournamentMode && handleNumberChange('matchesToWin', value)}
						min={1}
						max={10}
						step={1}
						label={$t('matchesToWin')}
						disabled={inTournamentMode}
					/>
				{:else}
					<NumberControl
						value={$gameSettings.roundsToPlay}
						onchange={(value) => !inTournamentMode && handleNumberChange('roundsToPlay', value)}
						min={1}
						max={20}
						step={1}
						label={$t('roundsToPlay')}
						disabled={inTournamentMode}
					/>
					<label class="toggle-item compact" class:disabled={inTournamentMode} onclick={(e) => { e.preventDefault(); !inTournamentMode && handleToggle('allowTiesInRoundsMode'); }}>
						<span class="toggle-label">{$t('allowTies')}</span>
						<input type="checkbox" checked={$gameSettings.allowTiesInRoundsMode} readonly disabled={inTournamentMode} />
						<span class="toggle-switch"></span>
					</label>
				{/if}
			</div>
		</section>

		<!-- Feature Toggles -->
		<section class="settings-section" class:disabled={inTournamentMode}>
			<h3>{$t('features')}</h3>
			<div class="toggle-grid">
				<label class="toggle-item" class:disabled={inTournamentMode} onclick={(e) => { e.preventDefault(); !inTournamentMode && handleToggle('show20s'); }}>
					<span class="toggle-label">{$t('track20s')}</span>
					<input type="checkbox" checked={$gameSettings.show20s} readonly disabled={inTournamentMode} />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" class:disabled={inTournamentMode} onclick={(e) => { e.preventDefault(); !inTournamentMode && handleToggle('showHammer'); }}>
					<span class="toggle-label">{$t('hammer')}</span>
					<input type="checkbox" checked={$gameSettings.showHammer} readonly disabled={inTournamentMode} />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" onclick={(e) => { e.preventDefault(); handleToggle('showTimer'); }}>
					<span class="toggle-label">{$t('showTimer')}</span>
					<input type="checkbox" checked={$gameSettings.showTimer} readonly />
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
						onchange={(value) => handleNumberChange('timerMinutes', value)}
						min={0}
						max={60}
						step={1}
						label="{$t('minutes')}"
					/>
					<NumberControl
						value={$gameSettings.timerSeconds}
						onchange={(value) => handleNumberChange('timerSeconds', value)}
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
				<button class="action-button" onclick={handleSwitchSides} type="button">
					<span class="icon">⇄</span>
					<span>{$t('switchSides')}</span>
				</button>
				<button class="action-button" onclick={handleSwitchColors} type="button">
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
					onclick={() => handleLanguageChange('es')}
					type="button"
				>
					Español
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.language === 'ca'}
					onclick={() => handleLanguageChange('ca')}
					type="button"
				>
					Català
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.language === 'en'}
					onclick={() => handleLanguageChange('en')}
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
		color: rgba(255, 255, 255, 0.4);
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
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
	}

	.settings-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.25);
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
		background: rgba(255, 255, 255, 0.02);
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
		color: rgba(255, 255, 255, 0.5);
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
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-button:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.mode-button.active {
		background: rgba(74, 222, 128, 0.15);
		color: #fff;
		border-color: rgba(74, 222, 128, 0.4);
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
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		cursor: pointer;
		position: relative;
		transition: all 0.15s ease;
	}

	.toggle-item:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.toggle-label {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.8);
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
		background: rgba(255, 255, 255, 0.15);
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
		background: rgba(255, 255, 255, 0.7);
		border-radius: 50%;
		transition: all 0.2s ease;
	}

	.toggle-item input:checked ~ .toggle-switch {
		background: #4ade80;
	}

	.toggle-item input:checked ~ .toggle-switch::before {
		transform: translateX(16px);
		background: #fff;
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

	/* Actions Section */
	.advanced-section {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
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
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-button:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		color: #fff;
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
