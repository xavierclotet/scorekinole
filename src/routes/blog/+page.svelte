<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import SEO from '$lib/components/SEO.svelte';
	import AppMenu from '$lib/components/AppMenu.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';
	import { blogPosts } from '$lib/content/blog';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Tag from '@lucide/svelte/icons/tag';

	let locale = $derived(getLocale());

	let seoTitle = $derived(locale === 'es'
		? 'Blog de Crokinole - Noticias, guías y novedades'
		: locale === 'ca'
			? 'Blog de Crokinole - Notícies, guies i novetats'
			: 'Crokinole Blog - News, guides and updates'
	);

	let seoDesc = $derived(locale === 'es'
		? 'Tutoriales, guías de torneos, reglas del crokinole y novedades de Scorekinole. Aprende y mejora tu juego.'
		: locale === 'ca'
			? 'Tutorials, guies de tornejos, regles del crokinole i novetats de Scorekinole. Aprèn i millora el teu joc.'
			: 'Crokinole tutorials, tournament guides, rules, and Scorekinole updates. Learn and improve your game.'
	);

	let sortedPosts = $derived([...blogPosts].sort((a, b) => b.date.localeCompare(a.date)));
</script>

<SEO
	title={seoTitle}
	description={seoDesc}
	keywords="crokinole blog, crokinole news, crokinole guides, tutorial crokinole, noticias crokinole, guía crokinole"
	canonical="https://scorekinole.es/blog"
	locale={locale}
/>

<div class="blog-container" data-theme={$theme}>
	<header class="page-header">
		<div class="header-row">
			<div class="header-left">
				<AppMenu showHome homeHref="/" />
			</div>
			<div class="header-center">
				<h1>Blog</h1>
			</div>
			<div class="header-right">
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="blog-content">
		{#if sortedPosts.length === 0}
			<div class="empty-state">
				<p>Próximamente...</p>
			</div>
		{:else}
			<div class="posts-grid">
				{#each sortedPosts as post}
					<article class="post-card" onclick={() => goto(`/blog/${post.slug}`)} onkeydown={(e) => e.key === 'Enter' && goto(`/blog/${post.slug}`)} tabindex="0" role="button" aria-label={post.title}>
						<div class="post-meta">
							<span class="post-date">
								<Calendar size={14} />
								{post.date}
							</span>
						</div>
						<h2 class="post-title">{post.title}</h2>
						<p class="post-desc">{post.description}</p>
						<div class="post-footer">
							<div class="post-tags">
								{#each post.tags.slice(0, 3) as tag}
									<span class="tag">
										<Tag size={12} />
										{tag}
									</span>
								{/each}
							</div>
							<span class="read-more">{locale === 'es' ? 'Leer más' : locale === 'ca' ? 'Llegir més' : 'Read more'} →</span>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.blog-container {
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--background);
	}

	.page-header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--background) 85%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}

	.header-row {
		display: flex;
		align-items: center;
		padding: 0.5rem 1rem;
		gap: 0.5rem;
	}

	.header-left {
		flex-shrink: 0;
	}

	.header-center {
		flex: 1;
		text-align: center;
	}

	.header-center h1 {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--foreground);
		margin: 0;
	}

	.header-right {
		flex-shrink: 0;
	}

	.blog-content {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: var(--muted-foreground);
		font-size: 1.1rem;
	}

	.posts-grid {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.post-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
		outline: none;
	}

	.post-card:hover,
	.post-card:focus-visible {
		border-color: var(--primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 15%, transparent);
	}

	.post-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 0.8rem;
		color: var(--muted-foreground);
	}

	.post-date {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.post-title {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--foreground);
		margin: 0 0 0.5rem 0;
		line-height: 1.3;
	}

	.post-desc {
		font-size: 0.9rem;
		color: var(--muted-foreground);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.post-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.5rem;
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 500;
	}

	.read-more {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--primary);
		white-space: nowrap;
	}
</style>
