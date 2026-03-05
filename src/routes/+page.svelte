<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { canAccessAdmin } from '$lib/stores/admin';
	import { APP_VERSION } from '$lib/constants';

	import ProfileDropdown from '$lib/components/ProfileDropdown.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ProfileModal from '$lib/components/ProfileModal.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import SEO from '$lib/components/SEO.svelte';
	import PoweredByBadge from '$lib/components/PoweredByBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Play, BarChart3, Download, X } from '@lucide/svelte';
	import { canInstall, triggerInstall, showIOSInstallBanner, dismissIOSInstallBanner } from '$lib/stores/pwaInstall';
	import * as Carousel from '$lib/components/ui/carousel/index.js';
	import WhatsNewModal from '$lib/components/WhatsNewModal.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const LAST_SEEN_VERSION_KEY = 'scorekinole_last_seen_version';

	const jsonLd = [
		{
			"@context": "https://schema.org",
			"@type": "Organization",
			"name": "Scorekinole",
			"url": "https://scorekinole.web.app",
			"logo": "https://scorekinole.web.app/icon-512.png",
			"description": "Professional crokinole scoring application for tournaments and casual games"
		},
		{
			"@context": "https://schema.org",
			"@type": "WebApplication",
			"name": "Scorekinole",
			"url": "https://scorekinole.web.app",
			"applicationCategory": "SportsApplication",
			"operatingSystem": "Web",
			"description": "Track crokinole scores, manage live tournaments, and view player rankings",
			"offers": {
				"@type": "Offer",
				"price": "0",
				"priceCurrency": "USD"
			}
		}
	];

	let showProfile = $state(false);
	let showLogin = $state(false);
	let showWhatsNew = $state(false);
	let hasNewVersion = $state(false);
	let showToast = $state(false);

	onMount(() => {
		if (!browser) return;
		const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
		const hasSettings = localStorage.getItem('crokinoleGame');

		if (!lastSeen && !hasSettings) {
			// Brand new user — set silently, don't show modal
			localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
		} else if (lastSeen !== APP_VERSION) {
			// Existing user with a version change — show toast + badge
			hasNewVersion = true;
			showToast = true;
			setTimeout(() => { showToast = false; }, 5000);
		}
	});

	function openWhatsNew() {
		showWhatsNew = true;
		hasNewVersion = false;
		showToast = false;
		if (browser) {
			localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
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

	function goToRankings() {
		goto('/rankings');
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
			const result = await saveUserProfile(playerName, { country });
			if (result) {
				currentUser.update(u => u ? { ...u, name: playerName } : null);
			}
		} catch (error) {
			console.error('Error updating profile:', error);
		}
		showProfile = false;
	}

	function goToMyStats() {
		if ($currentUser) {
			goto('/my-stats');
		} else {
			showLogin = true;
		}
	}
</script>

<SEO
	title="Scorekinole - Professional Crokinole Scoring App"
	description="Track crokinole scores, manage live tournaments, and view player rankings. The ultimate free scoring app for crokinole players and tournament organizers worldwide."
	keywords="crokinole, crokinole scoring, crokinole app, crokinole tournament, live scoring, scorekinole, crokinole tracker, crokinole points"
	canonical="https://scorekinole.web.app/"
	{jsonLd}
/>

<main class="landing">
	<!-- Background image -->
	<div class="bg-image"></div>

	<!-- Navigation bar -->
	<nav class="navbar">
		<div class="nav-left">
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

	<!-- Main Content -->
	<div class="content">
		<!-- Main Layout: Features Left - Hero Center - Features Right -->
		<div class="main-layout">
			<!-- Left Features Column -->
			<div class="features-column flex flex-col gap-2 min-w-[80px]">
				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.scoring_timer()}</span>
				</div>

				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center">
						<img class="hammer-icon" src="/4150-rblxbanhammer.png" alt="Hammer" width="24" height="24" />
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.scoring_hammer()}</span>
				</div>

				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.scoring_twenties()}</span>
				</div>

				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.common_offlineMode()}</span>
				</div>
			</div>

			<!-- Hero Section (Center) -->
			<div class="hero">
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
					class="h-14 w-full max-w-[280px] gap-3 rounded-xl px-8 text-xl font-bold shadow-[0_4px_20px_color-mix(in_srgb,var(--primary)_25%,transparent)] hover:shadow-[0_6px_28px_color-mix(in_srgb,var(--primary)_35%,transparent)] hover:-translate-y-0.5 active:translate-y-0"
				>
					<Play class="size-6" />
					{m.common_newGame()}
				</Button>
			</div>

			<!-- Right Features Column -->
			<div class="features-column flex flex-col gap-2 min-w-[80px]">
				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.common_rankings()}</span>
				</div>

				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.common_liveTournaments()}</span>
				</div>

				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.common_tournamentAdmin()}</span>
				</div>

				<div class="flex flex-col items-center gap-1.5 py-3 px-2 min-[600px]:py-4 bg-feature-card-bg border border-feature-card-border rounded-[10px] transition-all w-[125px] min-h-[70px] hover:bg-feature-card-bg-hover hover:border-feature-card-border-hover">
					<div class="w-7 h-7 flex items-center justify-center text-feature-icon">
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
							<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
						</svg>
					</div>
					<span class="text-[0.7rem] font-medium text-feature-label text-center">{m.history_matchHistory()}</span>
				</div>
			</div>
		</div>

		<!-- Mobile Features Carousel - only visible on screens < 700px -->
		<div class="mobile-features-carousel">
			<Carousel.Root class="w-full max-w-sm" opts={{ align: 'start', loop: true }}>
				<Carousel.Content>
					<!-- Timer -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.scoring_timer()}</span>
						</div>
					</Carousel.Item>
					<!-- Hammer -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center"><img class="hammer-icon" src="/4150-rblxbanhammer.png" alt="Hammer" width="20" height="20" /></div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.scoring_hammer()}</span>
						</div>
					</Carousel.Item>
					<!-- Twenties -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.scoring_twenties()}</span>
						</div>
					</Carousel.Item>
					<!-- Offline -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.common_offlineMode()}</span>
						</div>
					</Carousel.Item>
					<!-- Rankings -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.common_rankings()}</span>
						</div>
					</Carousel.Item>
					<!-- Live Tournaments -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.common_liveTournaments()}</span>
						</div>
					</Carousel.Item>
					<!-- Admin -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.common_tournamentAdmin()}</span>
						</div>
					</Carousel.Item>
					<!-- History -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-feature-icon">
								<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
									<path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
								</svg>
							</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight line-clamp-2">{m.history_matchHistory()}</span>
						</div>
					</Carousel.Item>
				</Carousel.Content>
				<Carousel.Previous />
				<Carousel.Next />
			</Carousel.Root>
		</div>

		<!-- Quick Links -->
		<div class="grid grid-cols-3 gap-2 w-full max-w-[320px]">
			<Button
				variant="ghost"
				onclick={() => goto('/tournaments')}
				data-webmcp="link-tournaments"
				class="flex-col h-auto min-h-[60px] gap-1 px-2 py-3 bg-[var(--link-card-bg)] border border-[var(--link-card-border)] text-[var(--link-card-text)] hover:bg-[var(--link-card-bg-hover)] hover:border-[var(--link-card-border-hover)] hover:text-[var(--link-card-text-hover)]"
			>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
				</svg>
				<span class="text-[0.7rem] font-medium">{m.common_tournaments()}</span>
			</Button>

			<Button
				variant="ghost"
				onclick={goToRankings}
				data-webmcp="link-rankings"
				class="flex-col h-auto min-h-[60px] gap-1 px-2 py-3 bg-[var(--link-card-bg)] border border-[var(--link-card-border)] text-[var(--link-card-text)] hover:bg-[var(--link-card-bg-hover)] hover:border-[var(--link-card-border-hover)] hover:text-[var(--link-card-text-hover)]"
			>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
					<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
				</svg>
				<span class="text-[0.7rem] font-medium">{m.common_rankings()}</span>
			</Button>

			<Button
				variant="ghost"
				onclick={goToMyStats}
				data-webmcp="link-stats"
				class="flex-col h-auto min-h-[60px] gap-1 px-2 py-3 bg-[var(--link-card-bg)] border border-[var(--link-card-border)] text-[var(--link-card-text)] hover:bg-[var(--link-card-bg-hover)] hover:border-[var(--link-card-border-hover)] hover:text-[var(--link-card-text-hover)]"
			>
				<BarChart3 class="w-4 h-4" />
				<span class="text-[0.7rem] font-medium">{m.common_myStats()}</span>
			</Button>
		</div>

		<!-- Install PWA + Support Section -->
		<div class="support-section flex justify-center items-center gap-3 mt-2">
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
		<div class="support-section flex justify-center items-center mt-2">
			<a href="https://ko-fi.com/I3I11SVYEM" target="_blank" rel="noopener noreferrer" class="kofi-btn">
				<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
					<path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
				</svg>
				<span>{m.common_giveSupport()}</span>
			</a>
		</div>
	</div>

	<!-- Footer -->
	<footer class="footer">
		<span class="footer-copy">© 2026 Scorekinole by XaviC</span>
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

<ProfileModal isOpen={showProfile} user={$currentUser} isAdmin={$canAccessAdmin} onclose={() => showProfile = false} onupdate={handleProfileUpdate} />
<LoginModal isOpen={showLogin} onclose={() => showLogin = false} />
<WhatsNewModal isOpen={showWhatsNew} onclose={closeWhatsNew} />

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
		padding: 0;
		transition: background-color 0.3s, color 0.3s;
		position: relative;
	}

	:global([data-theme='light']) .landing,
	:global([data-theme='violet-light']) .landing {
		background: #f8fafc;
		color: #1a1a2e;
	}

	/* Background image */
	.bg-image {
		position: absolute;
		inset: 0;
		background-image: url('/scorekinole_background.jpeg');
		background-size: cover;
		background-position: center;
		opacity: 0.08;
		pointer-events: none;
	}

	/* Invert hammer icon on dark themes */
	.landing .hammer-icon {
		filter: invert(1) brightness(1.5);
	}
	:global([data-theme='light']) .landing .hammer-icon,
	:global([data-theme='violet-light']) .landing .hammer-icon {
		filter: none;
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
		gap: 4rem;
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

	.hero-subtitle {
		margin: 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
	}

	:global([data-theme='light']) .landing .hero-subtitle,
	:global([data-theme='violet-light']) .landing .hero-subtitle {
		color: rgba(0, 0, 0, 0.5);
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

	/* Mobile Features Carousel - hidden by default */
	.mobile-features-carousel {
		display: none;
		width: 100%;
		max-width: 100vw;
		padding: 0 3rem; /* Extra padding for arrow buttons */
		justify-content: center;
	}

	.mobile-feature-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.5rem 0.25rem;
		margin: 0 5px;
		background: var(--feature-card-bg);
		border: 1px solid var(--feature-card-border);
		border-radius: 8px;
		height: 64px;
		transition: all 0.2s;
	}

	.mobile-feature-card:hover {
		background: var(--feature-card-bg-hover);
		border-color: var(--feature-card-border-hover);
	}

	/* Hide side columns on mobile - show carousel instead */
	@media (max-width: 700px) {
		.features-column {
			display: none;
		}
		.main-layout {
			flex-direction: column;
		}
		.mobile-features-carousel {
			display: flex;
		}
		.hero {
			gap: 1.5rem;
		}
		.content {
			padding: 1rem;
			gap: 2rem;
		}
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

	/* iOS Install Banner */
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

	:global([data-theme='light']) .landing .footer-copy,
	:global([data-theme='violet-light']) .landing .footer-copy {
		color: rgba(0, 0, 0, 0.3);
	}

	:global([data-theme='light']) .landing .footer-dot,
	:global([data-theme='violet-light']) .landing .footer-dot {
		color: rgba(0, 0, 0, 0.2);
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

	/* Landscape phones */
	@media (orientation: landscape) and (max-height: 500px) {
		.landing {
			min-height: auto;
			height: 100vh;
			height: 100dvh;
			overflow-y: auto;
		}

		.navbar {
			padding: 0.4rem 1rem;
		}

		.content {
			padding: 0 2rem 0.25rem;
			gap: 0.5rem;
		}

		.hero {
			gap: 1rem;
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

		.mobile-features-carousel {
			display: none !important;
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

		.ios-install-banner {
			padding: 0.4rem 0.75rem;
			padding-right: 1.5rem;
			gap: 0.25rem;
		}

		.ios-install-title {
			font-size: 0.65rem;
		}

		.ios-install-step {
			font-size: 0.6rem;
		}

		.kofi-btn {
			padding: 0.2rem 0.5rem;
			font-size: 0.6rem;
		}

		/* Compact New Game button */
		.hero :global(button[data-webmcp="btn-new-game"]) {
			height: 2.5rem;
			font-size: 0.9rem;
			max-width: 220px;
		}

		/* Compact quick links */
		.content :global(.grid) {
			gap: 0.35rem;
			max-width: 260px;
		}

		.content :global(.grid) :global(button) {
			min-height: 40px;
			padding: 0.3rem 0.25rem;
		}
	}

	/* Very short landscape phones (<460px height) */
	@media (orientation: landscape) and (max-height: 460px) {
		.navbar {
			padding: 0.2rem 0.75rem;
		}

		.content {
			padding: 0 1.5rem 0.15rem;
			gap: 0.3rem;
		}

		.hero {
			gap: 1rem;
		}

		.title-main {
			font-size: 1.3rem;
		}

		.hero-subtitle {
			font-size: 0.65rem;
		}

		.hero :global(button[data-webmcp="btn-new-game"]) {
			height: 2rem;
			font-size: 0.8rem;
			max-width: 180px;
		}

		.content :global(.grid) {
			max-width: 220px;
		}

		.content :global(.grid) :global(button) {
			min-height: 32px;
			padding: 0.2rem 0.15rem;
		}

		.content :global(.grid) :global(button) :global(svg) {
			width: 0.75rem;
			height: 0.75rem;
		}

		.content :global(.grid) :global(button) :global(span) {
			font-size: 0.55rem;
		}

		.footer {
			padding: 0.15rem;
		}
	}
</style>
