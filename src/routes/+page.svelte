<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { language, t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { canAccessAdmin } from '$lib/stores/admin';
	import { APP_VERSION } from '$lib/constants';
	import { adminTheme } from '$lib/stores/theme';
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

	function toggleTheme() {
		adminTheme.toggle();
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

<main class="landing" data-theme={$adminTheme}>
	<!-- Background image -->
	<div class="bg-image"></div>

	<!-- Navigation bar -->
	<nav class="navbar">
		<div class="nav-left">
			{#if $canAccessAdmin}
				<button class="admin-btn" on:click={goToAdmin} title={$t('adminPanel')}>
					Admin
				</button>
			{/if}
		</div>

		<div class="nav-right">
			<div class="lang-selector">
				<button class:active={$gameSettings.language === 'es'} on:click={() => changeLanguage('es')}>ES</button>
				<button class:active={$gameSettings.language === 'ca'} on:click={() => changeLanguage('ca')}>CA</button>
				<button class:active={$gameSettings.language === 'en'} on:click={() => changeLanguage('en')}>EN</button>
			</div>
			<button class="nav-btn icon-btn" on:click={toggleTheme} title={$adminTheme === 'light' ? $t('darkMode') : $t('lightMode')}>
				{#if $adminTheme === 'light'}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="5"/>
						<line x1="12" y1="1" x2="12" y2="3"/>
						<line x1="12" y1="21" x2="12" y2="23"/>
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
						<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
						<line x1="1" y1="12" x2="3" y2="12"/>
						<line x1="21" y1="12" x2="23" y2="12"/>
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
						<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					</svg>
				{/if}
			</button>
			<div class="profile-wrap">
				<button class="nav-btn icon-btn profile-btn" on:click={() => quickMenuComponent?.toggleMenu()} aria-label="Profile">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
					</svg>
				</button>
				<QuickMenu bind:this={quickMenuComponent} on:login={handleLogin} on:profile={handleProfileOpen} />
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<div class="content">
		<!-- Hero Section -->
		<div class="hero">
			<h1 class="hero-title">
				<span class="title-main">Scorekinole</span>
				<span class="title-suffix">
					<span class="title-arena">Arena</span>
					<span class="title-version">v{APP_VERSION}</span>
				</span>
			</h1>
			<p class="hero-subtitle">{$t('appTitle')}</p>

			<button class="cta-button" on:click={startScoring}>
				<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
					<path d="M8 5v14l11-7z"/>
				</svg>
				<span>{$t('newGame')}</span>
			</button>
		</div>

		<!-- Features Section -->
		<div class="features-grid">
			<div class="feature-card">
				<div class="feature-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
					</svg>
				</div>
				<span class="feature-label">{$t('timer')}</span>
			</div>

			<div class="feature-card">
				<div class="feature-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
					</svg>
				</div>
				<span class="feature-label">{$t('rounds')}</span>
			</div>

			<div class="feature-card">
				<div class="feature-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
					</svg>
				</div>
				<span class="feature-label">{$t('matchHistory')}</span>
			</div>

			<div class="feature-card">
				<div class="feature-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M2 19.63L13.43 8.2l2.12 2.12-9.31 9.31-2.12-2.12 1.41-1.41L3.41 18l-1.41 1.63zm19.41-14.21l-2.12-2.12a1.5 1.5 0 00-2.12 0L14 6.46l4.24 4.24 3.17-3.17a1.5 1.5 0 000-2.11zM8.12 11.46l-1.41 1.41 4.24 4.24 1.41-1.41-4.24-4.24z"/>
					</svg>
				</div>
				<span class="feature-label">{$t('hammer')}</span>
			</div>

			<div class="feature-card">
				<div class="feature-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
					</svg>
				</div>
				<span class="feature-label">{$t('twenties')}</span>
			</div>

			<div class="feature-card">
				<div class="feature-icon">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z"/>
					</svg>
				</div>
				<span class="feature-label">{$t('syncAll')}</span>
			</div>
		</div>

		<!-- Quick Links Section -->
		<div class="links-section">
			<button class="link-card" on:click={goToRankings}>
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
				</svg>
				<span>{$t('viewRankings')}</span>
			</button>

			<button class="link-card disabled" disabled title={$t('comingSoon')}>
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
				</svg>
				<span>{$t('viewTournaments')}</span>
			</button>
		</div>
	</div>

	<!-- Footer -->
	<footer class="footer">
		<span class="footer-copy">© Scorekinole by XaviC</span>
	</footer>
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
		color: #fff;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		transition: background-color 0.3s, color 0.3s;
		position: relative;
	}

	.landing[data-theme='light'] {
		background: #f8fafc;
		color: #1a1a2e;
	}

	/* Background image */
	.bg-image {
		position: absolute;
		inset: 0;
		background-image: url('/scorekinole.jpeg');
		background-size: cover;
		background-position: center;
		opacity: 0.08;
		pointer-events: none;
	}

	.landing[data-theme='light'] .bg-image {
		opacity: 0.06;
	}

	/* Navigation */
	.navbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		position: relative;
		z-index: 100;
	}

	.nav-left, .nav-right {
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

	.landing[data-theme='light'] .admin-btn {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.3);
		color: #10b981;
	}

	.landing[data-theme='light'] .admin-btn:hover {
		background: rgba(16, 185, 129, 0.2);
	}

	.nav-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s;
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.landing[data-theme='light'] .nav-btn {
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.15);
		color: rgba(0, 0, 0, 0.6);
	}

	.landing[data-theme='light'] .nav-btn:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #1a1a2e;
	}

	.icon-btn {
		width: 32px;
		height: 32px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
	}

	.icon-btn svg {
		width: 16px;
		height: 16px;
	}

	.lang-selector {
		display: flex;
		gap: 0.25rem;
	}

	.lang-selector button {
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

	.lang-selector button:hover {
		border-color: rgba(255, 255, 255, 0.3);
		color: #fff;
	}

	.lang-selector button.active {
		background: #00ff88;
		border-color: #00ff88;
		color: #0a0e1a;
	}

	.landing[data-theme='light'] .lang-selector button {
		border-color: rgba(0, 0, 0, 0.15);
		color: rgba(0, 0, 0, 0.5);
	}

	.landing[data-theme='light'] .lang-selector button:hover {
		border-color: rgba(0, 0, 0, 0.3);
		color: #1a1a2e;
	}

	.landing[data-theme='light'] .lang-selector button.active {
		background: #10b981;
		border-color: #10b981;
		color: #fff;
	}

	.profile-wrap {
		position: relative;
		display: flex;
		align-items: center;
		z-index: 1000;
	}

	/* Content */
	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		gap: 2rem;
		position: relative;
		z-index: 0;
	}

	/* Hero Section */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
	}

	.hero-title {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
		margin: 0;
	}

	.title-main {
		font-family: 'Lexend', sans-serif;
		font-size: 2.5rem;
		font-weight: 700;
		color: #00ff88;
		letter-spacing: -0.01em;
	}

	.landing[data-theme='light'] .title-main {
		color: #10b981;
	}

	.title-suffix {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin-left: 0.2rem;
		position: relative;
		top: -0.25rem;
	}

	.title-arena {
		font-style: italic;
		font-weight: 700;
		font-size: 0.75rem;
		color: #e85a5a;
		transform: rotate(-8deg);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1;
	}

	.title-version {
		font-style: italic;
		font-weight: 500;
		font-size: 0.5rem;
		color: rgba(255, 255, 255, 0.4);
		transform: rotate(-8deg);
		letter-spacing: 0.05em;
		line-height: 1;
		margin-top: 0.12rem;
		margin-left: 0.1rem;
	}

	.landing[data-theme='light'] .title-version {
		color: rgba(0, 0, 0, 0.35);
	}

	.hero-subtitle {
		margin: 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
	}

	.landing[data-theme='light'] .hero-subtitle {
		color: rgba(0, 0, 0, 0.5);
	}

	.cta-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		width: 100%;
		max-width: 280px;
		padding: 1rem 1.5rem;
		margin-top: 0.75rem;
		background: #00ff88;
		border: none;
		border-radius: 10px;
		color: #0a0e1a;
		font-family: 'Lexend', sans-serif;
		font-size: 1.2rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 20px rgba(0, 255, 136, 0.25);
	}

	.cta-button svg {
		flex-shrink: 0;
	}

	.cta-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 28px rgba(0, 255, 136, 0.35);
	}

	.cta-button:active {
		transform: translateY(0);
	}

	.landing[data-theme='light'] .cta-button {
		background: #10b981;
		color: #fff;
		box-shadow: 0 4px 20px rgba(16, 185, 129, 0.25);
	}

	.landing[data-theme='light'] .cta-button:hover {
		box-shadow: 0 6px 28px rgba(16, 185, 129, 0.35);
	}

	/* Features Section */
	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		max-width: 400px;
		width: 100%;
	}

	.feature-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.75rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
		transition: all 0.2s;
	}

	.feature-card:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.landing[data-theme='light'] .feature-card {
		background: rgba(0, 0, 0, 0.02);
		border-color: rgba(0, 0, 0, 0.06);
	}

	.landing[data-theme='light'] .feature-card:hover {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.1);
	}

	.feature-icon {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.6);
	}

	.feature-icon svg {
		width: 20px;
		height: 20px;
	}

	.landing[data-theme='light'] .feature-icon {
		color: rgba(0, 0, 0, 0.5);
	}

	.feature-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	.landing[data-theme='light'] .feature-label {
		color: rgba(0, 0, 0, 0.5);
	}

	/* Links Section */
	.links-section {
		display: flex;
		gap: 0.75rem;
		max-width: 400px;
		width: 100%;
	}

	.link-card {
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

	.link-card svg {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.link-card:hover:not(.disabled) {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.link-card.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.landing[data-theme='light'] .link-card {
		background: rgba(0, 0, 0, 0.03);
		border-color: rgba(0, 0, 0, 0.1);
		color: rgba(0, 0, 0, 0.6);
	}

	.landing[data-theme='light'] .link-card:hover:not(.disabled) {
		background: rgba(0, 0, 0, 0.06);
		border-color: rgba(0, 0, 0, 0.2);
		color: #1a1a2e;
	}

	/* Footer */
	.footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		position: relative;
		z-index: 1;
	}

	.footer-version,
	.footer-copy {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.3);
	}

	.footer-divider {
		font-size: 0.6rem;
		color: rgba(255, 255, 255, 0.2);
	}

	.landing[data-theme='light'] .footer-version,
	.landing[data-theme='light'] .footer-copy {
		color: rgba(0, 0, 0, 0.3);
	}

	.landing[data-theme='light'] .footer-divider {
		color: rgba(0, 0, 0, 0.2);
	}

	/* Tablet+ */
	@media (min-width: 600px) {
		.title-main {
			font-size: 3rem;
		}

		.title-arena {
			font-size: 0.9rem;
		}

		.title-version {
			font-size: 0.6rem;
		}

		.features-grid {
			grid-template-columns: repeat(6, 1fr);
			max-width: 600px;
		}

		.feature-card {
			padding: 1rem 0.5rem;
		}

		.links-section {
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

		.hero {
			align-items: flex-start;
			text-align: left;
		}

		.title-main {
			font-size: 1.8rem;
		}

		.hero-subtitle {
			font-size: 0.85rem;
		}

		.cta-button {
			max-width: 220px;
			padding: 0.75rem 1.25rem;
			font-size: 1rem;
		}

		.features-grid {
			display: none;
		}

		.links-section {
			flex-direction: column;
			max-width: 180px;
		}

		.link-card {
			padding: 0.6rem 0.75rem;
			font-size: 0.8rem;
		}

		.footer {
			position: absolute;
			bottom: 0;
			left: 0;
			right: 0;
		}
	}
</style>
