<script lang="ts">
	import { t } from '$lib/stores/language';
	import { resetTeams, switchSides, switchColors } from '$lib/stores/teams';
	import { resetMatchState } from '$lib/stores/matchState';
	import { resetTimerFromSettings } from '$lib/stores/timer';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { currentUser, signOut } from '$lib/firebase/auth';
	import { get } from 'svelte/store';

	// Menu open/close state
	let isOpen = false;

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}

	// Reset round: clear points and reset timer
	function handleResetRound() {
		resetTeams();
		const settings = get(gameSettings);
		resetTimerFromSettings(settings.timerMinutes, settings.timerSeconds);
		closeMenu();
	}

	// Reset match: clear everything
	function handleResetMatch() {
		resetTeams();
		resetMatchState();
		const settings = get(gameSettings);
		resetTimerFromSettings(settings.timerMinutes, settings.timerSeconds);
		closeMenu();
	}

	// Switch team sides
	function handleSwitchSides() {
		switchSides();
		closeMenu();
	}

	// Switch team colors
	function handleSwitchColors() {
		switchColors();
		closeMenu();
	}

	// Auth actions
	async function handleSignOut() {
		await signOut();
		closeMenu();
	}

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (isOpen && !target.closest('.quick-menu-container')) {
			closeMenu();
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="quick-menu-container">
	<button class="menu-button" on:click|stopPropagation={toggleMenu} aria-label="Quick menu">
		☰
	</button>

	{#if isOpen}
		<div class="quick-menu" on:click|stopPropagation>
			<!-- Auth section -->
			{#if $currentUser}
				<button class="quick-menu-item" on:click={handleSignOut}>
					<span class="icon">↪</span>
					<span>{$t('logout')}</span>
				</button>
				<div class="divider"></div>
			{/if}

			<!-- Game actions -->
			{#if $gameSettings.gameMode === 'points'}
				<button class="quick-menu-item" on:click={handleResetRound}>
					<span class="icon">↻</span>
					<span>{$t('newGame')}</span>
				</button>
			{/if}

			<button class="quick-menu-item" on:click={handleResetMatch}>
				<span class="icon">⟲</span>
				<span>{$t('newMatch')}</span>
			</button>

			<button class="quick-menu-item" on:click={handleSwitchSides}>
				<span class="icon">⇄</span>
				<span>{$t('switchSides')}</span>
			</button>

			<button class="quick-menu-item" on:click={handleSwitchColors}>
				<span class="icon">🎨</span>
				<span>{$t('switchColors')}</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.quick-menu-container {
		position: relative;
	}

	.menu-button {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.menu-button:hover {
		background: rgba(255, 255, 255, 0.15);
		transform: scale(1.05);
	}

	.menu-button:active {
		transform: scale(0.95);
	}

	.quick-menu {
		position: absolute;
		top: 40px;
		left: 0;
		background: rgba(26, 31, 53, 0.98);
		border: 2px solid rgba(0, 255, 136, 0.3);
		border-radius: 12px;
		padding: 0.5rem;
		min-width: 200px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.quick-menu-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.quick-menu-item:hover {
		background: rgba(0, 255, 136, 0.1);
		color: #00ff88;
	}

	.quick-menu-item:active {
		transform: scale(0.98);
	}

	.icon {
		font-size: 1.25rem;
		width: 24px;
		text-align: center;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0.5rem 0;
	}

	/* Responsive */
	@media (max-width: 480px) {
		.menu-button {
			width: 28px;
			height: 28px;
			font-size: 0.9rem;
		}

		.quick-menu {
			top: 36px;
			min-width: 180px;
		}

		.quick-menu-item {
			font-size: 0.9rem;
			padding: 0.6rem 0.8rem;
		}

		.icon {
			font-size: 1.1rem;
			width: 20px;
		}
	}
</style>
