<script lang="ts">
	import { t } from '$lib/stores/language';
	import { currentUser, signOut } from '$lib/firebase/auth';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Menu open/close state
	let isOpen = false;
	let justOpened = false;

	export function toggleMenu() {
		if (!isOpen) {
			isOpen = true;
			justOpened = true;
			setTimeout(() => { justOpened = false; }, 100);
		} else {
			isOpen = false;
		}
	}

	function closeMenu() {
		isOpen = false;
	}

	// Auth actions
	function handleLogin(event: MouseEvent) {
		event.stopPropagation();
		dispatch('login');
		closeMenu();
	}

	function handleProfile(event: MouseEvent) {
		event.stopPropagation();
		dispatch('profile');
		closeMenu();
	}

	async function handleSignOut(event: MouseEvent) {
		event.stopPropagation();
		await signOut();
		closeMenu();
	}

	// Click outside to close
	function handleClickOutside(event: MouseEvent) {
		if (justOpened) return;
		const target = event.target as HTMLElement;
		// Don't close if clicking inside menu container or on profile button
		if (isOpen && !target.closest('.quick-menu-container') && !target.closest('.profile-btn')) {
			closeMenu();
		}
	}
</script>

<svelte:window on:mousedown={handleClickOutside} />

<div class="quick-menu-container">
	{#if isOpen}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="quick-menu" on:click|stopPropagation role="menu">
			{#if $currentUser}
				<!-- User info header -->
				<div class="menu-header">
					{#if $currentUser.photoURL}
						<img src={$currentUser.photoURL} alt="" class="header-photo" referrerpolicy="no-referrer" />
					{:else}
						<div class="header-photo-placeholder">
							{$currentUser.email?.charAt(0).toUpperCase() || '?'}
						</div>
					{/if}
					<div class="header-info">
						<span class="header-name">{$currentUser.name || 'User'}</span>
						<span class="header-email">{$currentUser.email}</span>
					</div>
				</div>

				<!-- Menu actions -->
				<div class="menu-actions">
					<button class="menu-item" on:click|stopPropagation={handleProfile}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
							<circle cx="12" cy="7" r="4"/>
						</svg>
						<span>{$t('myProfile')}</span>
					</button>
					<button class="menu-item logout" on:click|stopPropagation={handleSignOut}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
							<polyline points="16 17 21 12 16 7"/>
							<line x1="21" y1="12" x2="9" y2="12"/>
						</svg>
						<span>{$t('logout')}</span>
					</button>
				</div>
			{:else}
				<!-- Not logged in -->
				<div class="menu-actions guest">
					<button class="menu-item login" on:click|stopPropagation={handleLogin}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
							<polyline points="10 17 15 12 10 7"/>
							<line x1="15" y1="12" x2="3" y2="12"/>
						</svg>
						<span>{$t('login')}</span>
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.quick-menu-container {
		position: static;
	}

	.quick-menu {
		position: fixed;
		top: 3.5rem;
		right: 1rem;
		background: #12151f;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		min-width: 220px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
		z-index: 99999;
		animation: menuSlide 0.15s ease-out;
		pointer-events: auto !important;
	}

	.quick-menu * {
		pointer-events: auto !important;
	}

	@keyframes menuSlide {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Header section */
	.menu-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: rgba(255, 255, 255, 0.02);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.header-photo {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.header-photo-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.9rem;
		font-weight: 600;
		color: #64b5f6;
		flex-shrink: 0;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		flex: 1;
	}

	.header-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-email {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.45);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Menu actions */
	.menu-actions {
		padding: 0.375rem;
	}

	.menu-actions.guest {
		padding: 0.5rem;
	}

	.menu-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.menu-item svg {
		width: 16px;
		height: 16px;
		stroke-width: 2;
		flex-shrink: 0;
		opacity: 0.7;
	}

	.menu-item:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
	}

	.menu-item:hover svg {
		opacity: 1;
	}

	.menu-item:active {
		transform: scale(0.98);
	}

	.menu-item.logout:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #f87171;
	}

	.menu-item.logout:hover svg {
		stroke: #f87171;
	}

	.menu-item.login {
		justify-content: center;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.625rem 1rem;
	}

	.menu-item.login:hover {
		background: rgba(59, 130, 246, 0.15);
		color: #60a5fa;
	}

	.menu-item.login:hover svg {
		stroke: #60a5fa;
	}

	/* Responsive */
	@media (max-width: 480px) {
		.quick-menu {
			min-width: 200px;
			right: -0.5rem;
		}

		.menu-header {
			padding: 0.75rem;
		}

		.header-photo,
		.header-photo-placeholder {
			width: 32px;
			height: 32px;
		}

		.header-name {
			font-size: 0.8rem;
		}

		.menu-item {
			font-size: 0.75rem;
			padding: 0.45rem 0.625rem;
		}

		.menu-item svg {
			width: 14px;
			height: 14px;
		}
	}
</style>
