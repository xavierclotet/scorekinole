<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import NumberControl from './NumberControl.svelte';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { t } from '$lib/stores/language';
	import type { Language } from '$lib/i18n/translations';
	import type { GameSettings } from '$lib/types/settings';

	export let isOpen: boolean = false;
	export let onClose: () => void = () => {};

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

	function handleToggle(key: 'show20s' | 'showHammer') {
		gameSettings.update(s => ({ ...s, [key]: !s[key] }));
		gameSettings.save();
	}

	function handleNumberChange(key: keyof GameSettings, newValue: number) {
		gameSettings.update(s => ({ ...s, [key]: newValue }));
		gameSettings.save();
	}

	function handleTextChange(key: 'eventTitle' | 'matchPhase', value: string) {
		gameSettings.update(s => ({ ...s, [key]: value }));
		gameSettings.save();
	}
</script>

<Modal {isOpen} title={$t('settings')} onClose={onClose}>
	<div class="settings-content">
		<!-- Event Information Section -->
		<section class="settings-section">
			<h3>{$t('eventInfo')}</h3>
			<div class="event-inputs-grid">
				<div class="input-group">
					<label for="event-title">{$t('eventTitle')}</label>
					<input
						id="event-title"
						type="text"
						class="text-input"
						value={$gameSettings.eventTitle}
						on:input={(e) => handleTextChange('eventTitle', e.currentTarget.value)}
						placeholder="Ej: TORNEIG DE CASA MEVA"
						maxlength="50"
					/>
				</div>
				<div class="input-group">
					<label for="match-phase">{$t('matchPhase')}</label>
					<input
						id="match-phase"
						type="text"
						class="text-input"
						value={$gameSettings.matchPhase}
						on:input={(e) => handleTextChange('matchPhase', e.currentTarget.value)}
						placeholder="Ej: Final, Semifinal, Grup A"
						maxlength="30"
					/>
				</div>
			</div>
		</section>

		<!-- Game Mode Section -->
		<section class="settings-section">
			<h3>{$t('gameMode')}</h3>
			<div class="button-group">
				<button
					class="mode-button"
					class:active={$gameSettings.gameMode === 'points'}
					on:click={() => handleGameModeChange('points')}
					type="button"
				>
					{$t('modePoints')}
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.gameMode === 'rounds'}
					on:click={() => handleGameModeChange('rounds')}
					type="button"
				>
					{$t('modeRounds')}
				</button>
			</div>

			<!-- Points/Rounds Configuration -->
			<div class="mode-config">
				{#if $gameSettings.gameMode === 'points'}
					<NumberControl
						value={$gameSettings.pointsToWin}
						on:change={(e) => handleNumberChange('pointsToWin', e.detail)}
						min={1}
						max={200}
						step={1}
						label={$t('pointsToWin')}
					/>
					<NumberControl
						value={$gameSettings.matchesToWin}
						on:change={(e) => handleNumberChange('matchesToWin', e.detail)}
						min={1}
						max={10}
						step={1}
						label={$t('matchesToWin')}
					/>
				{:else}
					<NumberControl
						value={$gameSettings.roundsToPlay}
						on:change={(e) => handleNumberChange('roundsToPlay', e.detail)}
						min={1}
						max={20}
						step={1}
						label={$t('roundsToPlay')}
					/>
				{/if}
			</div>
		</section>

		<!-- Game Type Section -->
		<section class="settings-section">
			<h3>{$t('gameType')}</h3>
			<div class="button-group">
				<button
					class="mode-button"
					class:active={$gameSettings.gameType === 'singles'}
					on:click={() => handleGameTypeChange('singles')}
					type="button"
				>
					{$t('singles')}
				</button>
				<button
					class="mode-button"
					class:active={$gameSettings.gameType === 'doubles'}
					on:click={() => handleGameTypeChange('doubles')}
					type="button"
				>
					{$t('doubles')}
				</button>
			</div>
		</section>

		<!-- Timer Configuration -->
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
					max={59}
					step={1}
					label="{$t('seconds')}"
				/>
			</div>
		</section>

		<!-- Feature Toggles -->
		<section class="settings-section">
			<h3>{$t('features')}</h3>
			<div class="toggle-list">
				<label class="toggle-item" on:click|preventDefault={() => handleToggle('show20s')}>
					<span>{$t('track20s')}</span>
					<input type="checkbox" checked={$gameSettings.show20s} readonly />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" on:click|preventDefault={() => handleToggle('showHammer')}>
					<span>{$t('hammer')}</span>
					<input type="checkbox" checked={$gameSettings.showHammer} readonly />
					<span class="toggle-switch"></span>
				</label>
			</div>
		</section>
	</div>
</Modal>

<style>
	.settings-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
		max-height: 70vh;
		overflow-y: auto;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.settings-section h3 {
		margin: 0;
		font-size: 1.2rem;
		color: #00ff88;
		font-weight: 700;
	}

	.button-group {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.mode-config {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.mode-button {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
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

	.toggle-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.toggle-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		cursor: pointer;
		position: relative;
	}

	.toggle-item span:first-child {
		font-size: 1rem;
		color: #fff;
		flex: 1;
	}

	.toggle-item input[type="checkbox"] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-switch {
		position: relative;
		width: 50px;
		height: 26px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 13px;
		transition: all 0.3s;
	}

	.toggle-switch::before {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
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
		transform: translateX(24px);
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

	.event-inputs-grid {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.8);
		font-weight: 600;
	}

	.text-input {
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		font-family: inherit;
		transition: all 0.2s;
	}

	.text-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.text-input:focus {
		outline: none;
		border-color: #00ff88;
		background: rgba(255, 255, 255, 0.15);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.event-inputs-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 600px) {
		.settings-content {
			max-height: 60vh;
		}

		.button-group {
			grid-template-columns: 1fr;
		}

		.timer-controls {
			grid-template-columns: 1fr;
		}

		.event-inputs-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
