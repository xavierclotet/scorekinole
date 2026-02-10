<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { language } from '$lib/stores/language';
	import * as m from '$lib/paraglide/messages.js';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { canAccessAdmin } from '$lib/stores/admin';
	import { APP_VERSION } from '$lib/constants';
	import { adminTheme } from '$lib/stores/theme';
	import ProfileDropdown from '$lib/components/ProfileDropdown.svelte';
	import ProfileModal from '$lib/components/ProfileModal.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import { currentUser } from '$lib/firebase/auth';
	import { saveUserProfile } from '$lib/firebase/userProfile';
	import SEO from '$lib/components/SEO.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Play } from '@lucide/svelte';
	import * as Carousel from '$lib/components/ui/carousel/index.js';

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
			"operatingSystem": "Web, Android",
			"description": "Track crokinole scores, manage live tournaments, and view player rankings",
			"offers": {
				"@type": "Offer",
				"price": "0",
				"priceCurrency": "USD"
			}
		}
	];

	let showProfile = false;
	let showLogin = false;

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

	function goToAdmin() {
		goto('/admin');
	}

	function toggleTheme() {
		adminTheme.toggleMode(); // Solo cambia light/dark, preserva el color
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

<SEO
	title="Scorekinole - Professional Crokinole Scoring App"
	description="Track crokinole scores, manage live tournaments, and view player rankings. The ultimate free scoring app for crokinole players and tournament organizers worldwide."
	keywords="crokinole, crokinole scoring, crokinole app, crokinole tournament, live scoring, scorekinole, crokinole tracker, crokinole points"
	canonical="https://scorekinole.web.app/"
	{jsonLd}
/>

<main class="landing" data-theme={$adminTheme}>
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

		<div class="nav-right">
			<LanguageSelector />
			<button class="nav-btn icon-btn" onclick={toggleTheme} title={$adminTheme === 'light' || $adminTheme === 'violet-light' ? m.common_darkMode() : m.common_lightMode()}>
				{#if $adminTheme === 'light' || $adminTheme === 'violet-light'}
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
					<div class="w-7 h-7 flex items-center justify-center text-[1.25rem]">
						🔨
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
						<span class="title-arena">Arena</span>
						<span class="title-version">v{APP_VERSION}</span>
					</span>
				</h1>
				<p class="hero-subtitle">{m.scoring_appTitle()}</p>

				<Button
					size="lg"
					onclick={startScoring}
					class="h-14 w-full max-w-[280px] gap-3 rounded-xl px-8 text-xl font-bold shadow-[0_4px_20px_rgba(0,255,136,0.25)] hover:shadow-[0_6px_28px_rgba(0,255,136,0.35)] hover:-translate-y-0.5 active:translate-y-0"
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.scoring_timer()}</span>
						</div>
					</Carousel.Item>
					<!-- Hammer -->
					<Carousel.Item class="basis-1/4">
						<div class="mobile-feature-card">
							<div class="w-6 h-6 flex items-center justify-center text-base">🔨</div>
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.scoring_hammer()}</span>
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.scoring_twenties()}</span>
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.common_offlineMode()}</span>
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.common_rankings()}</span>
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.common_liveTournaments()}</span>
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.common_tournamentAdmin()}</span>
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
							<span class="text-[0.65rem] font-medium text-feature-label text-center leading-tight">{m.history_matchHistory()}</span>
						</div>
					</Carousel.Item>
				</Carousel.Content>
				<Carousel.Previous />
				<Carousel.Next />
			</Carousel.Root>
		</div>

		<!-- Quick Links Section -->
		<div class="links-section flex gap-3 max-w-[400px] w-full">
			<button class="link-card flex-1 flex items-center justify-center gap-2 h-12 px-4 bg-link-card-bg border border-link-card-border rounded-lg text-link-card-text text-[0.85rem] font-medium cursor-pointer transition-all hover:bg-link-card-bg-hover hover:border-link-card-border-hover hover:text-link-card-text-hover" onclick={goToRankings}>
				<svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
					<path d="M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z"/>
				</svg>
				<span>{m.common_viewRankings()}</span>
			</button>

			<button class="link-card flex-1 flex items-center justify-center gap-2 h-12 px-4 bg-link-card-bg border border-link-card-border rounded-lg text-link-card-text text-[0.85rem] font-medium cursor-pointer transition-all hover:bg-link-card-bg-hover hover:border-link-card-border-hover hover:text-link-card-text-hover" onclick={() => goto('/tournaments')}>
				<svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
				</svg>
				<span>{m.common_viewTournaments()}</span>
			</button>
		</div>

		<!-- Support Section -->
		<div class="support-section flex justify-center items-center mt-2">
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
		<span class="footer-copy">© 2026 Scorekinole by XaviC</span>
	</footer>
</main>

<ProfileModal isOpen={showProfile} user={$currentUser} isAdmin={$canAccessAdmin} onclose={() => showProfile = false} onupdate={handleProfileUpdate} />
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

	.landing[data-theme='light'],
	.landing[data-theme='violet-light'] {
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

	.landing[data-theme='light'] .bg-image,
	.landing[data-theme='violet-light'] .bg-image {
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

	.landing[data-theme='light'] .nav-btn,
	.landing[data-theme='violet-light'] .nav-btn {
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.15);
		color: rgba(0, 0, 0, 0.6);
	}

	.landing[data-theme='light'] .nav-btn:hover,
	.landing[data-theme='violet-light'] .nav-btn:hover {
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
		color: var(--primary);
		letter-spacing: -0.01em;
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

	.landing[data-theme='light'] .title-version,
	.landing[data-theme='violet-light'] .title-version {
		color: rgba(0, 0, 0, 0.35);
	}

	.hero-subtitle {
		margin: 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
	}

	.landing[data-theme='light'] .hero-subtitle,
	.landing[data-theme='violet-light'] .hero-subtitle {
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
		background: var(--feature-card-bg);
		border: 1px solid var(--feature-card-border);
		border-radius: 8px;
		min-height: 56px;
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

	.landing[data-theme='light'] .footer-copy,
	.landing[data-theme='violet-light'] .footer-copy {
		color: rgba(0, 0, 0, 0.3);
	}

	/* Tablet+ */
	@media (min-width: 700px) {
		.title-main {
			font-size: 3rem;
		}

		.title-arena {
			font-size: 0.9rem;
		}

		.title-version {
			font-size: 0.6rem;
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
