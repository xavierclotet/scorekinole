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

	// Local state for settings (edited values before save)
	let localSettings: GameSettings = { ...$gameSettings };

	// Sync local settings when modal opens
	$: if (isOpen) {
		localSettings = { ...$gameSettings };
	}

	function handleSave() {
		gameSettings.set(localSettings);
		gameSettings.save();
		onClose();
	}

	function handleCancel() {
		localSettings = { ...$gameSettings };
		onClose();
	}

	function handleLanguageChange(lang: Language) {
		localSettings = { ...localSettings, language: lang };
	}

	function handleGameModeChange(mode: 'points' | 'rounds') {
		localSettings = { ...localSettings, gameMode: mode };
	}

	function handleGameTypeChange(type: 'singles' | 'doubles') {
		localSettings = { ...localSettings, gameType: type };
	}

	function handleToggle(key: 'show20s' | 'showHammer') {
		localSettings = { ...localSettings, [key]: !localSettings[key] };
	}

	function handleNumberChange(key: keyof GameSettings, newValue: number) {
		localSettings = { ...localSettings, [key]: newValue };
	}
</script>

<Modal {isOpen} title={$t('settings')} onClose={handleCancel}>
	<div class="settings-content">
		<!-- Game Mode Section -->
		<section class="settings-section">
			<h3>{$t('gameMode')}</h3>
			<div class="button-group">
				<button
					class="mode-button"
					class:active={localSettings.gameMode === 'points'}
					on:click={() => handleGameModeChange('points')}
					type="button"
				>
					{$t('modePoints')}
				</button>
				<button
					class="mode-button"
					class:active={localSettings.gameMode === 'rounds'}
					on:click={() => handleGameModeChange('rounds')}
					type="button"
				>
					{$t('modeRounds')}
				</button>
			</div>
		</section>

		<!-- Game Type Section -->
		<section class="settings-section">
			<h3>{$t('gameType')}</h3>
			<div class="button-group">
				<button
					class="mode-button"
					class:active={localSettings.gameType === 'singles'}
					on:click={() => handleGameTypeChange('singles')}
					type="button"
				>
					{$t('singles')}
				</button>
				<button
					class="mode-button"
					class:active={localSettings.gameType === 'doubles'}
					on:click={() => handleGameTypeChange('doubles')}
					type="button"
				>
					{$t('doubles')}
				</button>
			</div>
		</section>

		<!-- Points/Rounds Configuration -->
		<section class="settings-section">
			{#if localSettings.gameMode === 'points'}
				<NumberControl
					value={localSettings.pointsToWin}
					on:change={(e) => handleNumberChange('pointsToWin', e.detail)}
					min={1}
					max={200}
					step={1}
					label={$t('pointsToWin')}
				/>
				<NumberControl
					value={localSettings.matchesToWin}
					on:change={(e) => handleNumberChange('matchesToWin', e.detail)}
					min={1}
					max={10}
					step={1}
					label={$t('matchesToWin')}
				/>
			{:else}
				<NumberControl
					value={localSettings.roundsToPlay}
					on:change={(e) => handleNumberChange('roundsToPlay', e.detail)}
					min={1}
					max={20}
					step={1}
					label={$t('roundsToPlay')}
				/>
			{/if}
		</section>

		<!-- Timer Configuration -->
		<section class="settings-section">
			<h3>{$t('timer')}</h3>
			<div class="timer-controls">
				<NumberControl
					value={localSettings.timerMinutes}
					on:change={(e) => handleNumberChange('timerMinutes', e.detail)}
					min={0}
					max={60}
					step={1}
					label="{$t('minutes')}"
				/>
				<NumberControl
					value={localSettings.timerSeconds}
					on:change={(e) => handleNumberChange('timerSeconds', e.detail)}
					min={0}
					max={59}
					step={1}
					label="{$t('seconds')}"
				/>
			</div>
		</section>

		<!-- Language Selection -->
		<section class="settings-section">
			<h3>{$t('language')}</h3>
			<div class="language-grid">
				<button
					class="language-button"
					class:active={localSettings.language === 'es'}
					on:click={() => handleLanguageChange('es')}
				>
					🇪🇸 Español
				</button>
				<button
					class="language-button"
					class:active={localSettings.language === 'ca'}
					on:click={() => handleLanguageChange('ca')}
				>
					🏴 Català
				</button>
				<button
					class="language-button"
					class:active={localSettings.language === 'en'}
					on:click={() => handleLanguageChange('en')}
				>
					🇬🇧 English
				</button>
			</div>
		</section>

		<!-- Feature Toggles -->
		<section class="settings-section">
			<h3>{$t('features')}</h3>
			<div class="toggle-list">
				<label class="toggle-item" on:click|preventDefault={() => handleToggle('show20s')}>
					<span>{$t('track20s')}</span>
					<input type="checkbox" checked={localSettings.show20s} readonly />
					<span class="toggle-switch"></span>
				</label>

				<label class="toggle-item" on:click|preventDefault={() => handleToggle('showHammer')}>
					<span>{$t('hammer')}</span>
					<input type="checkbox" checked={localSettings.showHammer} readonly />
					<span class="toggle-switch"></span>
				</label>
			</div>
		</section>

		<!-- App Info -->
		<section class="settings-section app-info">
			<p><strong>{$t('appTitle')}</strong></p>
			<p>{$t('version')}: {localSettings.appVersion}</p>
		</section>
	</div>

	<!-- Modal Actions -->
	<div class="modal-actions" slot="actions">
		<Button variant="secondary" on:click={handleCancel}>
			{$t('cancel')}
		</Button>
		<Button variant="primary" on:click={handleSave}>
			{$t('save')}
		</Button>
	</div>
</Modal>

<style>
	.settings-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem 0;
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

	.language-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	.language-button {
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.language-button:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.language-button.active {
		background: #00ff88;
		color: #000;
		border-color: #00ff88;
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

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	/* Responsive */
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

		.modal-actions {
			flex-direction: column-reverse;
		}

		.modal-actions :global(button) {
			width: 100%;
		}
	}
</style>
