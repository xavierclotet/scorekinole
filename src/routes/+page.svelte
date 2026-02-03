<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { language } from '$lib/stores/language';
	import * as m from '$lib/paraglide/messages.js';
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

	async function handleProfileUpdate({ playerName }: { playerName: string }) {
		try {
			const result = await saveUserProfile(playerName);
			if (result) {
				currentUser.update(u => u ? { ...u, name: playerName } : null);
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
				<button class="admin-btn" onclick={goToAdmin} title={m.admin_panel()}>
					Admin
				</button>
			{/if}
		</div>

		<div class="nav-right">
			<div class="lang-selector">
				<button class:active={$gameSettings.language === 'es'} onclick={() => changeLanguage('es')}>ES</button>
				<button class:active={$gameSettings.language === 'ca'} onclick={() => changeLanguage('ca')}>CA</button>
				<button class:active={$gameSettings.language === 'en'} onclick={() => changeLanguage('en')}>EN</button>
			</div>
			<button class="nav-btn icon-btn" onclick={toggleTheme} title={$adminTheme === 'light' ? m.common_darkMode() : m.common_lightMode()}>
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
				<button class="nav-btn icon-btn profile-btn" onclick={() => quickMenuComponent?.toggleMenu()} aria-label="Profile">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
					</svg>
				</button>
				<QuickMenu bind:this={quickMenuComponent} onlogin={handleLogin} onprofile={handleProfileOpen} />
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<div class="content">
		<!-- Main Layout: Features Left - Hero Center - Features Right -->
		<div class="main-layout">
			<!-- Left Features Column -->
			<div class="features-column features-left">
				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
						</svg>
					</div>
					<span class="feature-label">{m.scoring_timer()}</span>
				</div>

				<div class="feature-card">
					<div class="feature-icon emoji">
						🔨
					</div>
					<span class="feature-label">{m.scoring_hammer()}</span>
				</div>

				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
						</svg>
					</div>
					<span class="feature-label">{m.scoring_twenties()}</span>
				</div>

				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z"/>
						</svg>
					</div>
					<span class="feature-label">{m.common_offlineMode()}</span>
				</div>
			</div>

			<!-- Hero Section (Center) -->
			<div class="hero">
				<h1 class="hero-title">
					<span class="title-main">Scorekinole</span>
					<span class="title-suffix">
						<span class="title-arena">Arena</span>
						<span class="title-version">v{APP_VERSION}</span>
					</span>
				</h1>
				<p class="hero-subtitle">{m.scoring_appTitle()}</p>

				<button class="cta-button" onclick={startScoring}>
					<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
						<path d="M8 5v14l11-7z"/>
					</svg>
					<span>{m.common_newGame()}</span>
				</button>
			</div>

			<!-- Right Features Column -->
			<div class="features-column features-right">
				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
						</svg>
					</div>
					<span class="feature-label">{m.common_rankings()}</span>
				</div>

				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
						</svg>
					</div>
					<span class="feature-label">{m.common_liveTournaments()}</span>
				</div>

				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
						</svg>
					</div>
					<span class="feature-label">{m.common_tournamentAdmin()}</span>
				</div>

				<div class="feature-card">
					<div class="feature-icon">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
						</svg>
					</div>
					<span class="feature-label">{m.history_matchHistory()}</span>
				</div>
			</div>
		</div>

		<!-- Quick Links Section -->
		<div class="links-section">
			<button class="link-card" onclick={goToRankings}>
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
				</svg>
				<span>{m.common_viewRankings()}</span>
			</button>

			<button class="link-card disabled" disabled title={m.common_comingSoon()}>
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
				</svg>
				<span>{m.common_viewTournaments()}</span>
			</button>
		</div>

		<!-- Support Section -->
		<div class="support-section">
			<a href="https://ko-fi.com/I3I11SVYEM" target="_blank" rel="noopener noreferrer" class="kofi-btn">
				<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
					<path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
				</svg>
				<span>{m.common_giveSupport()}</span>
			</a>
		</div>
	</div>

	<!-- Footer -->
	<footer class="footer">
		<span class="footer-copy">© Scorekinole by XaviC</span>
	</footer>
</main>

<ProfileModal isOpen={showProfile} user={$currentUser} onclose={() => showProfile = false} onupdate={handleProfileUpdate} />
<LoginModal isOpen={showLogin} onclose={() => showLogin = false} />

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
		margin-top: 3.75rem;
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

	/* Main Layout - Three columns */
	.main-layout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2.5rem;
		width: 100%;
		max-width: 800px;
	}

	.features-column {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 80px;
	}

	/* Hide side columns on mobile portrait - show only hero */
	@media (max-width: 600px) and (orientation: portrait) {
		.features-column {
			display: none;
		}
		.main-layout {
			flex-direction: column;
		}
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
		width: 125px;
		min-height: 70px;
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

	.feature-icon.emoji {
		font-size: 1.25rem;
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

	/* Support Section */
	.support-section {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-top: 0.5rem;
	}

	.kofi-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		background: #10B981;
		color: #fff;
		border-radius: 8px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		text-decoration: none;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.kofi-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
	}

	.kofi-btn:active {
		transform: translateY(0);
	}

	.kofi-btn svg {
		flex-shrink: 0;
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

	.footer-copy {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.3);
	}

	.landing[data-theme='light'] .footer-copy {
		color: rgba(0, 0, 0, 0.3);
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

		/* In landscape, show features columns */
		.features-column {
			display: flex;
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

		.support-section {
			display: none;
		}
	}
</style>
