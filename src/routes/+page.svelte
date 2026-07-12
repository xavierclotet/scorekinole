<script lang="ts">
	import { goto } from '$app/navigation';
	import { safeGetItem, safeSetItem } from '$lib/utils/safeStorage';
	import * as m from '$lib/paraglide/messages.js';
	import { canAccessAdmin } from '$lib/stores/admin';
	import { APP_VERSION } from '$lib/constants';
	import { getLocale } from '$lib/paraglide/runtime.js';

	import ProfileDropdown from '$lib/components/ProfileDropdown.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import SEO from '$lib/components/SEO.svelte';
	import PoweredByBadge from '$lib/components/PoweredByBadge.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { Button } from '$lib/components/ui/button';
	import Screenshot from '$lib/components/Screenshot.svelte';
	import Play from '@lucide/svelte/icons/play';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import Download from '@lucide/svelte/icons/download';
	import X from '@lucide/svelte/icons/x';
	import Trophy from '@lucide/svelte/icons/trophy';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { canInstall, triggerInstall, showIOSInstallBanner, dismissIOSInstallBanner } from '$lib/stores/pwaInstall';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let profileModalLoader: Promise<typeof import('$lib/components/ProfileModal.svelte')> | null = null;
	let loginModalLoader: Promise<typeof import('$lib/components/LoginModal.svelte')> | null = null;
	let whatsNewModalLoader: Promise<typeof import('$lib/components/WhatsNewModal.svelte')> | null = null;
	const loadProfileModal = () => (profileModalLoader ??= import('$lib/components/ProfileModal.svelte'));
	const loadLoginModal = () => (loginModalLoader ??= import('$lib/components/LoginModal.svelte'));
	const loadWhatsNewModal = () => (whatsNewModalLoader ??= import('$lib/components/WhatsNewModal.svelte'));

	const LAST_SEEN_VERSION_KEY = 'scorekinole_last_seen_version';

	const jsonLd = [
		{
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": "Scorekinole",
			"url": "https://scorekinole.es",
			"logo": "https://scorekinole.es/icon-512.png",
			"description": "Professional crokinole live scoring application for tournaments, clubs, and casual games",
			"descriptionES": "Aplicación profesional de puntuación en vivo de crokinole para torneos, clubes y partidas informales"
		},
		{
			"@context": "https://schema.org",
			"@type": "WebSite",
			"name": "Scorekinole",
			"url": "https://scorekinole.es",
			"potentialAction": {
				"@type": "SearchAction",
				"target": {
					"@type": "EntryPoint",
					"urlTemplate": "https://scorekinole.es/tournaments?q={search_term_string}"
				},
				"query-input": "required name=search_term_string"
			},
			"inLanguage": ["en", "es", "ca"],
			"description": "Crokinole live scoring, tournaments, and player rankings"
		},
		{
			"@context": "https://schema.org",
			"@type": "WebApplication",
			"name": "Scorekinole",
			"url": "https://scorekinole.es",
			"applicationCategory": "SportsApplication",
			"operatingSystem": "Web",
			"description": "The ultimate crokinole live scoring app. Track match scores, manage live tournaments, view brackets, and follow player rankings in real-time.",
			"descriptionES": "La app definitiva de puntuación en vivo de crokinole. Sigue partidas, gestiona torneos, visualiza brackets y consulta rankings en tiempo real.",
			"offers": {
				"@type": "Offer",
				"price": "0",
				"priceCurrency": "USD"
			}
		}
	];

	let locale = $derived(getLocale());

	let seoTitle = $derived(
		locale === 'es'
			? 'Scorekinole - Puntuación en vivo de Crokinole y Gestión de Torneos'
			: locale === 'ca'
				? 'Scorekinole - Puntuació en viu de Crokinole i Gestió de Tornejos'
				: 'Scorekinole - Crokinole Live Scoring & Tournament App'
	);

	let seoDescription = $derived(
		locale === 'es'
			? 'Scorekinole es la app gratuita definitiva para puntuación en vivo de crokinole. Sigue partidas, gestiona torneos, consulta rankings de jugadores y estadísticas en tiempo real.'
			: locale === 'ca'
				? 'Scorekinole és l\'app gratuïta definitiva per a puntuació en viu de crokinole. Segueix partides, gestiona tornejos, consulta rànquings de jugadors i estadístiques en temps real.'
				: 'Scorekinole is the ultimate free crokinole live scoring app. Track scores, manage live tournaments, view player rankings, and run round robins, Swiss, or brackets in real-time.'
	);

	let seoKeywords = $derived(
		locale === 'es'
			? 'puntuación en vivo crokinole, crokinole, puntuación crokinole, app crokinole, torneo crokinole, live scoring, scorekinole, seguimiento crokinole, crokinole en vivo, puntos crokinole'
			: locale === 'ca'
				? 'puntuació en viu crokinole, crokinole, puntuació crokinole, app crokinole, torneig crokinole, live scoring, scorekinole, seguiment crokinole, crokinole en viu, punts crokinole'
				: 'live scoring crokinole, crokinole, crokinole scoring, crokinole app, crokinole tournament, live scoring, scorekinole, crokinole tracker, crokinole live scoring, crokinole points'
	);

	let showProfile = $state(false);
	let showLogin = $state(false);
	let showWhatsNew = $state(false);
	let hasNewVersion = $state(false);
	let showToast = $state(false);
	let showErrorToast = $state(false);
	let errorToastMessage = $state('');

	onMount(() => {
		if (!browser) return;
		const lastSeen = safeGetItem(LAST_SEEN_VERSION_KEY);
		const hasSettings = safeGetItem('crokinoleGame');

		if (!lastSeen && !hasSettings) {
			safeSetItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
		} else if (lastSeen !== APP_VERSION) {
			hasNewVersion = true;
			showToast = true;
			setTimeout(() => { showToast = false; }, 5000);
		}

		const prefetch = () => { loadLoginModal(); loadProfileModal(); loadWhatsNewModal(); };
		const idleId = 'requestIdleCallback' in window
			? requestIdleCallback(prefetch, { timeout: 4000 })
			: setTimeout(prefetch, 2500);

		return () => {
			if ('cancelIdleCallback' in window && typeof idleId === 'number') cancelIdleCallback(idleId);
		};
	});

	function openWhatsNew() {
		showWhatsNew = true;
		hasNewVersion = false;
		showToast = false;
		if (browser) {
			safeSetItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
		}
	}

	function closeWhatsNew() {
		showWhatsNew = false;
	}

	function dismissToast() {
		showToast = false;
	}

	function startScoring() {
		goto('/game');
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

	async function handleProfileUpdate({ playerName, country }: { playerName: string; country?: string }) {
		try {
			const { saveUserProfile } = await import('$lib/firebase/userProfile');
			const result = await saveUserProfile(playerName, { country });
			if (!result) throw new Error('saveUserProfile returned null');
			currentUser.update(u => u ? { ...u, name: playerName } : null);
			showProfile = false;
		} catch (error) {
			console.error('Error updating profile:', error);
			errorToastMessage = m.common_profileSaveError();
			showErrorToast = true;
		}
	}

	function goToMyStats() {
		if ($currentUser) {
			goto('/my-stats');
		} else {
			showLogin = true;
		}
	}

	const liveScoringFeatures = [
		m.landing_liveScoring_f1(),
		m.landing_liveScoring_f2(),
		m.landing_liveScoring_f3(),
		m.landing_liveScoring_f4(),
		m.landing_liveScoring_f5(),
		m.landing_liveScoring_f6(),
	];

	const tournamentsFeatures = [
		m.landing_tournaments_f1(),
		m.landing_tournaments_f2(),
		m.landing_tournaments_f3(),
		m.landing_tournaments_f4(),
		m.landing_tournaments_f5(),
	];

	const adminFeatures = [
		m.landing_admin_f1(),
		m.landing_admin_f2(),
		m.landing_admin_f3(),
		m.landing_admin_f4(),
		m.landing_admin_f5(),
	];

	const rankingFeatures = [
		m.landing_ranking_f1(),
		m.landing_ranking_f2(),
		m.landing_ranking_f3(),
		m.landing_ranking_f4(),
	];

	const mystatsFeatures = [
		m.landing_mystats_f1(),
		m.landing_mystats_f2(),
		m.landing_mystats_f3(),
		m.landing_mystats_f4(),
	];

	const leaderboardsFeatures = [
		m.landing_leaderboards_f1(),
		m.landing_leaderboards_f2(),
		m.landing_leaderboards_f3(),
		m.landing_leaderboards_f4(),
	];
</script>

<SEO
	title={seoTitle}
	description={seoDescription}
	keywords={seoKeywords}
	canonical="https://scorekinole.es/"
	locale={locale}
	{jsonLd}
/>

<main class="landing">
	<!-- Navigation bar -->
	<nav class="navbar">
		<div class="nav-left">
			<Button
				variant="outline"
				size="sm"
				onclick={() => goto('/blog')}
				class="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary font-semibold px-6 min-w-20"
			>
				Blog
			</Button>
			{#if $canAccessAdmin}
				<Button
					variant="outline"
					size="sm"
					onclick={goToAdmin}
					title={m.admin_panel()}
					class="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary font-semibold px-6 min-w-20"
				>
					Admin
				</Button>
			{/if}
		</div>

		<div class="nav-right" data-webmcp="profile-dropdown-container">
			<LanguageSelector />
			<ThemeToggle />
			<ProfileDropdown onlogin={handleLogin} onprofile={handleProfileOpen} />
		</div>
	</nav>

	<!-- Hero Section -->
	<section class="hero">
		<!-- Background image — only in hero, not in showcase -->
		<div class="bg-image"></div>

		<h1 class="hero-title">
			<span class="title-main">Scorekinole</span>
			<span class="title-suffix">
				<button class="title-version" onclick={openWhatsNew}>
					v{APP_VERSION}
					{#if hasNewVersion}<span class="version-dot"></span>{/if}
				</button>
			</span>
		</h1>
		<p class="hero-subtitle">{m.scoring_appTitle()}</p>

		<Button
			size="lg"
			onclick={startScoring}
			data-webmcp="btn-new-game"
			class="hero-cta"
		>
			<Play class="size-6" />
			{m.common_newGame()}
		</Button>

		<!-- Quick Links -->
		<div class="quick-links">
			<Button
				variant="ghost"
				href="/tournaments"
				data-webmcp="link-tournaments"
				class="quick-link"
			>
				<svg class="quick-link-icon" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
				</svg>
				<span class="quick-link-label">{m.common_tournaments()}</span>
			</Button>

			<Button
				variant="ghost"
				href="/ranking"
				data-webmcp="link-rankings"
				class="quick-link"
			>
				<svg class="quick-link-icon" viewBox="0 0 24 24" fill="currentColor">
					<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
				</svg>
				<span class="quick-link-label">{m.common_rankings()}</span>
			</Button>

			<Button
				variant="ghost"
				onclick={goToMyStats}
				data-webmcp="link-stats"
				class="quick-link"
			>
				<BarChart3 class="quick-link-icon" />
				<span class="quick-link-label">{m.common_myStats()}</span>
			</Button>

			<Button
				variant="ghost"
				href="/leaderboards"
				data-webmcp="link-leaderboards"
				class="quick-link"
			>
				<Trophy class="quick-link-icon" />
				<span class="quick-link-label">{m.leaderboards_title?.() ?? 'Leaderboards'}</span>
			</Button>

			<Button
				variant="ghost"
				href="/blog"
				data-webmcp="link-blog"
				class="quick-link"
			>
				<svg class="quick-link-icon" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 14v4h-2v-4h-4v-2h4V8h2v4h4v2h-4zm-9 5H4V5h6v14zm-2-8v-2H6v2h2zm0 4v-2H6v2h2zm0 4v-2H6v2h2zm12-10h-2V5h-6v2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-6h2v6c0 2.2-1.8 4-4 4H5c-2.2 0-4-1.8-4-4V9c0-2.2 1.8-4 4-4h4V3h6v2h4v4z"/>
				</svg>
				<span class="quick-link-label">Blog</span>
			</Button>
		</div>

		<!-- Install PWA + Support -->
		<div class="support-section">
			{#if $canInstall}
				<button class="install-btn" onclick={() => triggerInstall()}>
					<Download class="size-4" />
					<span>{m.common_installApp()}</span>
				</button>
			{:else if $showIOSInstallBanner}
				<div class="ios-install-banner">
					<button class="ios-install-close" onclick={dismissIOSInstallBanner} aria-label="Close">
						<X class="size-3.5" />
					</button>
					<p class="ios-install-title">{m.common_iosInstallTitle()}</p>
					<div class="ios-install-steps">
						<div class="ios-install-step">
							<span class="ios-step-number">1</span>
							<span>{m.common_iosInstallStep1({ icon: '' })}</span>
							<svg class="ios-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
								<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
								<polyline points="16 6 12 2 8 6"/>
								<line x1="12" y1="2" x2="12" y2="15"/>
							</svg>
						</div>
						<div class="ios-install-step">
							<span class="ios-step-number">2</span>
							<span>{m.common_iosInstallStep2()}</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
		<div class="support-section">
			<a href="https://ko-fi.com/I3I11SVYEM" target="_blank" rel="noopener noreferrer" class="kofi-btn">
				<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
					<path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
				</svg>
				<span>{m.common_giveSupport()}</span>
			</a>
		</div>

		<!-- Scroll indicator -->
		<button class="scroll-indicator" onclick={() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' })}>
			<span class="scroll-text">{m.landing_scroll()}</span>
			<ChevronDown class="scroll-arrow" />
		</button>
	</section>

	<!-- Showcase sections -->
	<section class="showcase" id="showcase">
		<p class="showcase-eyebrow">{m.landing_eyebrow()}</p>

		<!-- 1. Live Scoring -->
		<div class="showcase-feature">
			<div class="feature-text">
				<h2 class="feature-title">{m.landing_liveScoring_title()}</h2>
				<p class="feature-desc">{m.landing_liveScoring_desc()}</p>
				<ul class="feature-list">
					{#each liveScoringFeatures as feat}
						<li class="feature-list-item">
							<span class="check-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
							<span>{feat}</span>
						</li>
					{/each}
				</ul>
				<Button variant="outline" onclick={startScoring} class="feature-cta">
					{m.common_newGame()}
				</Button>
			</div>
			<div class="feature-screenshot">
				<Screenshot path="/landing/scoring.png" label="scoring.png" icon="game" alt="Scorekinole live scoring interface" />
			</div>
		</div>

		<!-- 2. Tournaments -->
		<div class="showcase-feature reverse">
			<div class="feature-text">
				<h2 class="feature-title">{m.landing_tournaments_title()}</h2>
				<p class="feature-desc">{m.landing_tournaments_desc()}</p>
				<ul class="feature-list">
					{#each tournamentsFeatures as feat}
						<li class="feature-list-item">
							<span class="check-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
							<span>{feat}</span>
						</li>
					{/each}
				</ul>
				<Button variant="outline" href="/tournaments" class="feature-cta">
					{m.common_tournaments()}
				</Button>
			</div>
			<div class="feature-screenshot">
				<Screenshot path="/landing/tournaments.png" label="tournaments.png" icon="tournaments" alt="Scorekinole tournament list" />
			</div>
		</div>

		<!-- 3. Tournament Admin -->
		<div class="showcase-feature">
			<div class="feature-text">
				<h2 class="feature-title">{m.landing_admin_title()}</h2>
				<p class="feature-desc">{m.landing_admin_desc()}</p>
				<ul class="feature-list">
					{#each adminFeatures as feat}
						<li class="feature-list-item">
							<span class="check-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
							<span>{feat}</span>
						</li>
					{/each}
				</ul>
				<Button variant="outline" href="/admin/tournaments" class="feature-cta">
					{m.common_tournamentAdmin()}
				</Button>
			</div>
			<div class="feature-screenshot">
				<Screenshot path="/landing/admin.png" label="admin.png" icon="admin" alt="Scorekinole tournament admin" />
			</div>
		</div>

		<!-- 4. Rankings -->
		<div class="showcase-feature reverse">
			<div class="feature-text">
				<h2 class="feature-title">{m.landing_ranking_title()}</h2>
				<p class="feature-desc">{m.landing_ranking_desc()}</p>
				<ul class="feature-list">
					{#each rankingFeatures as feat}
						<li class="feature-list-item">
							<span class="check-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
							<span>{feat}</span>
						</li>
					{/each}
				</ul>
				<Button variant="outline" href="/ranking" class="feature-cta">
					{m.common_rankings()}
				</Button>
			</div>
			<div class="feature-screenshot">
				<Screenshot path="/landing/ranking.png" label="ranking.png" icon="ranking" alt="Scorekinole player rankings" />
			</div>
		</div>

		<!-- 5. My Stats -->
		<div class="showcase-feature">
			<div class="feature-text">
				<h2 class="feature-title">{m.landing_mystats_title()}</h2>
				<p class="feature-desc">{m.landing_mystats_desc()}</p>
				<ul class="feature-list">
					{#each mystatsFeatures as feat}
						<li class="feature-list-item">
							<span class="check-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
							<span>{feat}</span>
						</li>
					{/each}
				</ul>
				<Button variant="outline" onclick={goToMyStats} class="feature-cta">
					{m.common_myStats()}
				</Button>
			</div>
			<div class="feature-screenshot">
				<Screenshot path="/landing/mystats.png" label="mystats.png" icon="stats" alt="Scorekinole player stats" />
			</div>
		</div>

		<!-- 6. Leaderboards -->
		<div class="showcase-feature reverse">
			<div class="feature-text">
				<h2 class="feature-title">{m.landing_leaderboards_title2()}</h2>
				<p class="feature-desc">{m.landing_leaderboards_desc()}</p>
				<ul class="feature-list">
					{#each leaderboardsFeatures as feat}
						<li class="feature-list-item">
							<span class="check-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
							<span>{feat}</span>
						</li>
					{/each}
				</ul>
				<Button variant="outline" href="/leaderboards" class="feature-cta">
					{m.leaderboards_title?.() ?? 'Leaderboards'}
				</Button>
			</div>
			<div class="feature-screenshot">
				<Screenshot path="/landing/leaderboards.png" label="leaderboards.png" icon="leaderboards" alt="Scorekinole leaderboards" />
			</div>
		</div>
	</section>

	<!-- Final CTA -->
	<section class="final-cta">
		<h2 class="cta-title">{m.landing_cta_title()}</h2>
		<p class="cta-desc">{m.landing_cta_desc()}</p>
		<Button
			size="lg"
			onclick={startScoring}
			data-webmcp="btn-new-game"
			class="cta-button"
		>
			<Play class="size-6" />
			{m.common_newGame()}
		</Button>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<span class="footer-copy">© 2026 Scorekinole by XaviC</span>
		<span class="footer-dot">·</span>
		<a href="/blog" class="footer-link">Blog</a>
		<span class="footer-dot">·</span>
		<PoweredByBadge size="sm" />
	</footer>
</main>

{#if showToast}
	<div class="version-toast" role="status">
		<button class="toast-content" onclick={openWhatsNew}>
			<span class="toast-version">v{APP_VERSION}</span>
			<span class="toast-text">{m.update_seeWhatsNew()}</span>
		</button>
		<button class="toast-dismiss" onclick={dismissToast} aria-label="Dismiss">
			<X size={14} />
		</button>
	</div>
{/if}

{#if showProfile}
	{#await loadProfileModal() then { default: ProfileModal }}
		<ProfileModal isOpen={showProfile} user={$currentUser} isAdmin={$canAccessAdmin} onclose={() => showProfile = false} onupdate={handleProfileUpdate} />
	{/await}
{/if}
{#if showLogin}
	{#await loadLoginModal() then { default: LoginModal }}
		<LoginModal isOpen={showLogin} onclose={() => showLogin = false} />
	{/await}
{/if}

<Toast bind:visible={showErrorToast} message={errorToastMessage} type="error" />
{#if showWhatsNew}
	{#await loadWhatsNewModal() then { default: WhatsNewModal }}
		<WhatsNewModal isOpen={showWhatsNew} onclose={closeWhatsNew} />
	{/await}
{/if}

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
		background: #0a0e1a;
		color: #fff;
	}

	/*
	 * ⚠️ shadcn-svelte Button Tailwind classes don't apply outside primitives
	 * (per AGENTS.md). We MUST scope :global(button) styles for layout / padding / gap.
	 * Without this, buttons render with no padding between text and border.
	 */
	.landing :global(button:not(.title-version):not(.scroll-indicator):not(.install-btn):not(.kofi-btn):not(.ios-install-close):not(.toast-content):not(.toast-dismiss)) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		font-family: 'Lexend', sans-serif;
		font-weight: 600;
		line-height: 1.2;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.landing :global(button:not(.title-version):not(.scroll-indicator):not(.install-btn):not(.kofi-btn):not(.ios-install-close):not(.toast-content):not(.toast-dismiss) > svg) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.landing {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #0a0e1a;
		color: #fff;
		padding: 0;
		transition: background-color 0.3s, color 0.3s;
		position: relative;
	}

	:global([data-theme='light']) .landing,
	:global([data-theme='violet-light']) .landing {
		background: #f8fafc;
		color: #1a1a2e;
	}

	/* Background image — scoryed to hero only */
	.hero {
		position: relative;
	}

	.hero .bg-image {
		position: absolute;
		inset: 0;
		background-image: url('/scorekinole_background.jpeg');
		background-size: cover;
		background-position: center;
		opacity: 0.08;
		pointer-events: none;
		z-index: 0;
	}

	:global([data-theme='light']) .landing .bg-image,
	:global([data-theme='violet-light']) .landing .bg-image {
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

	/* Hero */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: calc(100dvh - 72px);
		gap: 1.25rem;
		text-align: center;
		padding: 2rem 1rem 5.5rem;
		position: relative;
		z-index: 0;
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
		letter-spacing: -0.01em;
		background: linear-gradient(135deg, var(--primary) 0%, color-mix(in oklch, var(--primary), white 40%) 50%, var(--primary) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.title-suffix {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin-left: 0.2rem;
		position: relative;
		top: -0.25rem;
	}

	.title-version {
		position: relative;
		font-style: italic;
		font-weight: 500;
		font-size: 0.5rem;
		color: rgba(255, 255, 255, 0.4);
		transform: rotate(-8deg);
		letter-spacing: 0.05em;
		line-height: 1;
		margin-top: 0.12rem;
		margin-left: 0.1rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		transition: color 0.15s;
	}

	.title-version:hover {
		color: var(--primary);
	}

	:global([data-theme='light']) .landing .title-version,
	:global([data-theme='violet-light']) .landing .title-version {
		color: rgba(0, 0, 0, 0.35);
	}

	:global([data-theme='light']) .landing .title-version:hover,
	:global([data-theme='violet-light']) .landing .title-version:hover {
		color: var(--primary);
	}

	.version-dot {
		position: absolute;
		top: -3px;
		right: -6px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #ef4444;
		animation: dot-pulse 2s ease-in-out infinite;
	}

	@keyframes dot-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.hero-subtitle {
		margin: 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
		max-width: 600px;
	}

	:global([data-theme='light']) .landing .hero-subtitle,
	:global([data-theme='violet-light']) .landing .hero-subtitle {
		color: rgba(0, 0, 0, 0.5);
	}

	.hero :global(button[data-webmcp="btn-new-game"]) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		height: 3.5rem;
		width: 100%;
		max-width: 280px;
		padding: 0 2rem;
		border-radius: 0.75rem;
		font-size: 1.25rem;
		font-weight: 700;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 25%, transparent);
		transition: all 0.2s;
	}

	.hero :global(button[data-webmcp="btn-new-game"] > svg) {
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
	}

	.hero :global(button[data-webmcp="btn-new-game"]:hover) {
		box-shadow: 0 6px 28px color-mix(in srgb, var(--primary) 35%, transparent);
		transform: translateY(-2px);
	}

	.hero :global(button[data-webmcp="btn-new-game"]:active) {
		transform: translateY(0);
	}

	/* Quick Links — these are shadcn <Button> instances, so styles must be :global */
	.quick-links {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.4rem;
		width: 100%;
		max-width: 500px;
	}

	.quick-links :global(.quick-link) {
		display: flex !important;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-height: 60px;
		padding: 0.75rem 0.5rem;
		background: color-mix(in srgb, var(--primary) 12%, transparent) !important;
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent) !important;
		color: var(--foreground) !important;
		transition: all 0.2s;
	}

	.quick-links :global(.quick-link:hover) {
		background: color-mix(in srgb, var(--primary) 25%, transparent) !important;
		border-color: var(--primary) !important;
		color: var(--primary) !important;
	}

	.quick-links :global(.quick-link-icon) {
		width: 1rem;
		height: 1rem;
	}

	.quick-links :global(.quick-link-label) {
		font-size: 0.7rem;
		font-weight: 500;
	}



	/* Support section */
	.support-section {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}

	.install-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
		border-radius: 9999px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.install-btn:hover {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
		transform: translateY(-1px);
	}

	.install-btn:active {
		transform: translateY(0);
	}

	.ios-install-banner {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		padding-right: 2rem;
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
		border-radius: 12px;
		max-width: 320px;
		width: 100%;
	}

	.ios-install-close {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: none;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
		cursor: pointer;
		transition: background 0.15s;
	}

	.ios-install-close:hover {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
	}

	.ios-install-title {
		margin: 0;
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--primary);
	}

	.ios-install-steps {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.ios-install-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
	}

	:global([data-theme='light']) .landing .ios-install-step,
	:global([data-theme='violet-light']) .landing .ios-install-step {
		color: rgba(0, 0, 0, 0.6);
	}

	.ios-step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: 0.65rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.ios-share-icon {
		flex-shrink: 0;
		color: var(--primary);
	}

	.kofi-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.75rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border-radius: 6px;
		font-family: 'Lexend', sans-serif;
		font-size: 0.75rem;
		font-weight: 500;
		text-decoration: none;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.kofi-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
	}

	.kofi-btn:active {
		transform: translateY(0);
	}

	.kofi-btn svg {
		flex-shrink: 0;
	}

	/* Scroll indicator */
	.scroll-indicator {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.4);
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 500;
		transition: color 0.2s;
		z-index: 10;
	}

	.scroll-indicator:hover {
		color: var(--primary);
	}

	:global([data-theme='light']) .landing .scroll-indicator,
	:global([data-theme='violet-light']) .landing .scroll-indicator {
		color: rgba(0, 0, 0, 0.4);
	}

	:global([data-theme='light']) .landing .scroll-indicator:hover,
	:global([data-theme='violet-light']) .landing .scroll-indicator:hover {
		color: var(--primary);
	}

	.scroll-indicator :global(.scroll-arrow) {
		width: 1.5rem;
		height: 1.5rem;
		animation: bounce 2s infinite;
	}

	@keyframes bounce {
		0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
		40% { transform: translateY(-6px); }
		60% { transform: translateY(-3px); }
	}

	/* Showcase */
	.showcase {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4rem;
		padding: 4rem 1.5rem;
		max-width: 1000px;
		margin: 0 auto;
		position: relative;
		z-index: 0;
	}

	.showcase-eyebrow {
		font-size: 1.25rem;
		font-weight: 600;
		text-align: center;
		max-width: 500px;
		margin: 0;
		color: var(--foreground);
		opacity: 0.9;
	}

	.showcase-feature {
		display: flex;
		align-items: flex-start;
		gap: 3rem;
		width: 100%;
		max-width: 900px;
	}

	.showcase-feature.reverse {
		flex-direction: row-reverse;
	}

	.feature-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		align-items: flex-start;
	}

	.feature-title {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0;
		color: var(--primary);
	}

	.feature-desc {
		font-size: 1rem;
		line-height: 1.6;
		margin: 0;
		color: var(--foreground);
		opacity: 0.75;
	}

	.feature-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.feature-list-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--foreground);
		opacity: 0.85;
		line-height: 1.45;
	}

	.check-icon {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
	}

	.check-icon svg {
		width: 12px;
		height: 12px;
	}

	.feature-text :global(.feature-cta) {
		align-self: flex-start;
		margin-top: 0.75rem;
		padding: 0.6rem 1.25rem;
		font-size: 0.9rem;
		font-weight: 600;
		border-radius: 0.5rem;
		gap: 0.5rem;
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
		transition: all 0.2s;
	}

	.feature-text :global(.feature-cta:hover) {
		background: color-mix(in srgb, var(--primary) 22%, transparent);
		border-color: color-mix(in srgb, var(--primary) 50%, transparent);
	}

	.feature-text :global(.feature-cta > svg) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.feature-screenshot {
		flex: 0 0 300px;
		width: 300px;
		max-width: 100%;
	}

	@media (max-width: 700px) {
		.feature-screenshot {
			flex: 0 0 auto;
			width: 100%;
			max-width: 320px;
			margin: 0 auto;
		}
	}

	/* Final CTA */
	.final-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
		padding: 4rem 1.5rem;
		position: relative;
		z-index: 0;
		max-width: 600px;
		margin: 0 auto;
	}

	.cta-title {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
		color: var(--primary);
	}

	.cta-desc {
		font-size: 1rem;
		margin: 0;
		color: var(--foreground);
		opacity: 0.7;
		line-height: 1.5;
	}

	.final-cta :global(.cta-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		height: 3.5rem;
		padding: 0 2.5rem;
		border-radius: 0.75rem;
		font-size: 1.25rem;
		font-weight: 700;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 25%, transparent);
		transition: all 0.2s;
	}

	.final-cta :global(.cta-button > svg) {
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
	}

	.final-cta :global(.cta-button:hover) {
		box-shadow: 0 6px 28px color-mix(in srgb, var(--primary) 35%, transparent);
		transform: translateY(-2px);
	}

	.final-cta :global(.cta-button:active) {
		transform: translateY(0);
	}

	/* Version toast */
	.version-toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0.5rem 0.5rem 0.5rem 0.75rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
		z-index: 100;
		animation: toast-slide-up 0.3s ease-out;
	}

	@keyframes toast-slide-up {
		from { transform: translateX(-50%) translateY(100%); opacity: 0; }
		to { transform: translateX(-50%) translateY(0); opacity: 1; }
	}

	.toast-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		color: var(--foreground);
	}

	.toast-version {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		padding: 0.15rem 0.5rem;
		border-radius: 6px;
	}

	.toast-text {
		font-size: 0.8rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.toast-dismiss {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--muted-foreground);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s;
	}

	.toast-dismiss:hover {
		color: var(--foreground);
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

	.footer-dot {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.2);
	}

	.footer-link {
		font-size: 0.8rem;
		color: #60a5fa;
		text-decoration: none;
		transition: color 0.15s;
	}

	.footer-link:hover {
		color: #93c5fd;
		text-decoration: underline;
	}

	:global([data-theme='light']) .landing .footer-copy,
	:global([data-theme='violet-light']) .landing .footer-copy {
		color: rgba(0, 0, 0, 0.3);
	}

	:global([data-theme='light']) .landing .footer-dot,
	:global([data-theme='violet-light']) .landing .footer-dot {
		color: rgba(0, 0, 0, 0.2);
	}

	:global([data-theme='light']) .landing .footer-link,
	:global([data-theme='violet-light']) .landing .footer-link {
		color: #2563eb;
	}

	:global([data-theme='light']) .landing .footer-link:hover,
	:global([data-theme='violet-light']) .landing .footer-link:hover {
		color: #1d4ed8;
	}

	/* Mobile */
	@media (max-width: 700px) {
		.showcase-feature,
		.showcase-feature.reverse {
			flex-direction: column;
			gap: 2rem;
		}

		.feature-title {
			font-size: 1.5rem;
		}

		.feature-desc {
			font-size: 0.9rem;
		}

		.showcase {
			gap: 3rem;
			padding: 3rem 1rem;
		}

		.showcase-eyebrow {
			font-size: 1.1rem;
		}

		.cta-title {
			font-size: 1.5rem;
		}

		.title-main {
			font-size: 2.25rem;
		}
	}

	/* Tablet+ */
	@media (min-width: 700px) {
		.title-main {
			font-size: 3rem;
		}

		.title-version {
			font-size: 0.6rem;
		}
	}

	/* Landscape phones (short height) — compact hero + don't reflow showcase */
	@media (orientation: landscape) and (max-height: 500px) {
		.landing {
			min-height: auto;
			height: auto;
		}

		.navbar {
			padding: 0.4rem 1rem;
		}

		.hero {
			min-height: auto;
			padding: 0.5rem 1rem 1rem;
			gap: 0.75rem;
		}

		.title-main {
			font-size: 1.6rem;
		}

		.title-version {
			font-size: 0.4rem;
		}

		.hero-subtitle {
			font-size: 0.75rem;
		}

		.hero :global(button[data-webmcp="btn-new-game"]) {
			height: 2.5rem;
			font-size: 0.9rem;
			max-width: 220px;
		}

		.quick-links {
			max-width: 260px;
		}

		.quick-links :global(.quick-link) {
			min-height: 40px;
		}

		.footer {
			padding: 0.25rem;
		}

		.footer-copy {
			font-size: 0.65rem;
		}

		.support-section {
			margin-top: 0;
		}

		.install-btn {
			padding: 0.25rem 0.6rem;
			font-size: 0.65rem;
		}

		.kofi-btn {
			padding: 0.2rem 0.5rem;
			font-size: 0.6rem;
		}

		.scroll-indicator {
			display: none;
		}
	}
</style>