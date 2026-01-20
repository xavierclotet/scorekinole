<script lang="ts">
	import { t } from '$lib/stores/language';
	import { currentUser, signOut } from '$lib/firebase/auth';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Menu open/close state
	let isOpen = false;

	export function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}

	// Auth actions
	function handleLogin() {
		dispatch('login');
		closeMenu();
	}

	function handleProfile() {
		dispatch('profile');
		closeMenu();
	}

	async function handleSignOut() {
		await signOut();
		closeMenu();
	}

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (isOpen && !target.closest('.quick-menu-container') && !target.closest('.user-button') && !target.closest('.profile-btn')) {
			closeMenu();
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="quick-menu-container">
	{#if isOpen}
		<div class="quick-menu" on:click|stopPropagation>
			<!-- User Management Section -->
			{#if $currentUser}
				<!-- Logged in: Show Profile with user name -->
				<button class="quick-menu-item" on:click={handleProfile}>
					{#if $currentUser.photoURL}
						<img src={$currentUser.photoURL} alt="Profile" class="profile-photo" />
					{:else}
						<div class="profile-placeholder">
							{$currentUser.email?.charAt(0).toUpperCase() || '?'}
						</div>
					{/if}
					<span class="user-name">{$currentUser.name || $currentUser.email}</span>
				</button>
				<div class="divider"></div>
				<button class="quick-menu-item" on:click={handleSignOut}>
					<span class="icon">↪</span>
					<span>{$t('logout')}</span>
				</button>
			{:else}
				<!-- Not logged in: Show Login -->
				<button class="quick-menu-item" on:click={handleLogin}>
					<span class="icon">🔑</span>
					<span>{$t('login')}</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.quick-menu-container {
		position: relative;
		display: inline-block;
	}

	.quick-menu {
		position: absolute;
		top: -0.5rem;
		right: -2rem;
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

	.profile-photo {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid #00ff88;
	}

	.profile-placeholder {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(0, 255, 136, 0.2);
		border: 2px solid #00ff88;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 700;
		color: #00ff88;
	}

	.user-name {
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 150px;
		color: #00ff88;
		font-weight: 600;
	}

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0.5rem 0;
	}

	/* Responsive */
	@media (max-width: 480px) {
		.quick-menu {
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

		.profile-photo,
		.profile-placeholder {
			width: 24px;
			height: 24px;
		}

		.profile-placeholder {
			font-size: 0.75rem;
		}
	}
</style>
