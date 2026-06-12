<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Carousel from '$lib/components/ui/carousel/index.js';
</script>

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

<style>
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

	/* Invert hammer icon on dark themes */
	.hammer-icon {
		filter: invert(1) brightness(1.5);
	}

	:global([data-theme='light']) .hammer-icon,
	:global([data-theme='violet-light']) .hammer-icon {
		filter: none;
	}
</style>
