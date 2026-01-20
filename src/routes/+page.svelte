<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { language, t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { canAccessAdmin } from '$lib/stores/admin';
	import { APP_VERSION } from '$lib/constants';
	import QuickMenu from '$lib/components/QuickMenu.svelte';
	import ProfileModal from '$lib/components/ProfileModal.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';

	let showProfile = false;
	let showLogin = false;
	let quickMenuComponent: any;

	onMount(() => {
		gameSettings.load();
		const unsubSettings = gameSettings.subscribe($settings => {
			language.set($settings.language);
		});
		return () => unsubSettings();
	});

	function startScoring() {
		goto('/game');
	}

	function goToRankings() {
		goto('/rankings');
	}

	function changeLanguage(lang: 'es' | 'ca' | 'en') {
		gameSettings.update(settings => ({ ...settings, language: lang }));
		gameSettings.save();
	}

	function goToAdmin() {
		goto('/admin');
	}

	function handleLogin() {
		showLogin = true;
	}

	function handleProfileOpen() {
		showProfile = true;
	}

	async function handleProfileUpdate(event: CustomEvent<{ playerName: string }>) {
		try {
			const result = await saveUserProfile(event.detail.playerName);
			if (result) {
				currentUser.update(u => u ? { ...u, name: event.detail.playerName } : null);
			}
		} catch (error) {
			console.error('Error updating profile:', error);
		}
		showProfile = false;
	}
</script>

<svelte:head>
	<title>Scorekinole - Crokinole Scorer Arena App</title>
	<meta name="description" content="Professional scoring app for Crokinole games. Track points, rounds, and matches with ease." />
</svelte:head>

<main class="landing">
	<!-- Top bar -->
	<div class="top-bar">
		<div class="top-left">
			{#if $canAccessAdmin}
				<button class="admin-btn" on:click={goToAdmin} title={$t('adminPanel')}>
					<span>Admin</span>
				</button>
			{/if}
		</div>
		<div class="top-right">
			<div class="lang-btns">
				<button class:active={$gameSettings.language === 'es'} on:click={() => changeLanguage('es')}>ES</button>
				<button class:active={$gameSettings.language === 'ca'} on:click={() => changeLanguage('ca')}>CA</button>
				<button class:active={$gameSettings.language === 'en'} on:click={() => changeLanguage('en')}>EN</button>
			</div>
			<div class="profile-wrap">
				<QuickMenu bind:this={quickMenuComponent} on:login={handleLogin} on:profile={handleProfileOpen} />
				<button class="profile-btn" on:click={() => quickMenuComponent?.toggleMenu()} aria-label="Profile">
					<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
						<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
					</svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="content">
		<div class="brand">
			<img src="/icon.png" alt="Scorekinole" class="logo" />
			<div class="brand-text">
				<h1>Scorekinole</h1>
				<p>{$t('appTitle')}</p>
			</div>
		</div>

		<div class="actions">
			<button class="btn-primary" on:click={startScoring}>
				{$t('newGame')}
			</button>

			<div class="nav-links">
				<button class="nav-link" on:click={goToRankings}>
					<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
						<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
					</svg>
					<span>{$t('viewRankings')}</span>
				</button>
				<button class="nav-link disabled" disabled title={$t('comingSoon')}>
					<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
						<path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
					</svg>
					<span>{$t('viewTournaments')}</span>
				</button>
			</div>
		</div>

		<div class="features">
			<span>⏱️ {$t('timer')}</span>
			<span>📊 {$t('rounds')}</span>
			<span>🏆 {$t('matchHistory')}</span>
			<span>🔨 {$t('hammer')}</span>
			<span>⭐ {$t('twenties')}</span>
			<span>☁️ {$t('syncAll')}</span>
		</div>
	</div>

	<footer>v{APP_VERSION}</footer>
</main>

<ProfileModal isOpen={showProfile} user={$currentUser} on:close={() => showProfile = false} on:update={handleProfileUpdate} />
<LoginModal isOpen={showLogin} on:close={() => showLogin = false} />

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
		background: #0a0e1a;
		color: #fff;
	}

	.landing {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #0a0e1a;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
	}

	/* Top bar */
	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
	}

	.top-left, .top-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.admin-btn {
		padding: 0.4rem 0.8rem;
		background: rgba(0, 255, 136, 0.1);
		border: 1px solid rgba(0, 255, 136, 0.3);
		border-radius: 6px;
		color: #00ff88;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.admin-btn:hover {
		background: rgba(0, 255, 136, 0.2);
	}

	.lang-btns {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.lang-btns button {
		padding: 0.4rem 0.7rem;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.lang-btns button:hover {
		border-color: rgba(255, 255, 255, 0.3);
		color: #fff;
	}

	.lang-btns button.active {
		background: #00ff88;
		border-color: #00ff88;
		color: #0a0e1a;
	}

	.profile-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.profile-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
	}

	.profile-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	/* Content */
	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1.5rem;
		gap: 2rem;
	}

	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.logo {
		width: 90px;
		height: 90px;
		border-radius: 16px;
		box-shadow: 0 8px 32px rgba(0, 255, 136, 0.2);
	}

	.brand-text {
		text-align: center;
	}

	.brand-text h1 {
		margin: 0;
		font-size: 2.5rem;
		font-weight: 700;
		color: #00ff88;
		font-family: 'Orbitron', monospace;
		letter-spacing: 0.02em;
	}

	.brand-text p {
		margin: 0.25rem 0 0 0;
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Actions */
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		width: 100%;
		max-width: 320px;
	}

	.btn-primary {
		width: 100%;
		padding: 1rem 2rem;
		background: #00ff88;
		border: none;
		border-radius: 10px;
		color: #0a0e1a;
		font-size: 1.2rem;
		font-weight: 700;
		font-family: 'Orbitron', monospace;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 20px rgba(0, 255, 136, 0.25);
	}

	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 24px rgba(0, 255, 136, 0.35);
	}

	.btn-primary:active {
		transform: translateY(0);
	}

	.nav-links {
		display: flex;
		gap: 0.75rem;
		width: 100%;
	}

	.nav-link {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.nav-link:hover:not(.disabled) {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.nav-link.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.nav-link svg {
		flex-shrink: 0;
	}

	/* Features */
	.features {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.features span {
		padding: 0.4rem 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 4px;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Footer */
	footer {
		padding: 1rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.8rem;
	}

	/* Tablet+ */
	@media (min-width: 600px) {
		.content {
			gap: 2.5rem;
		}

		.brand {
			flex-direction: row;
			gap: 1.5rem;
		}

		.logo {
			width: 100px;
			height: 100px;
		}

		.brand-text {
			text-align: left;
		}

		.brand-text h1 {
			font-size: 3rem;
		}

		.actions {
			max-width: 400px;
		}
	}

	/* Landscape phones */
	@media (orientation: landscape) and (max-height: 500px) {
		.content {
			flex-direction: row;
			justify-content: space-around;
			padding: 1rem 2rem;
			gap: 2rem;
		}

		.brand {
			flex-direction: row;
			gap: 1rem;
		}

		.logo {
			width: 70px;
			height: 70px;
		}

		.brand-text h1 {
			font-size: 1.8rem;
		}

		.brand-text p {
			font-size: 0.85rem;
		}

		.actions {
			max-width: 280px;
		}

		.btn-primary {
			padding: 0.75rem 1.5rem;
			font-size: 1rem;
		}

		.nav-link {
			padding: 0.6rem 0.75rem;
			font-size: 0.8rem;
		}

		.features {
			display: none;
		}

		footer {
			position: absolute;
			bottom: 0;
			left: 0;
			right: 0;
		}
	}
</style>
