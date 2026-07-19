<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
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
	import X from '@lucide/svelte/icons/x';

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

	function formatDate(dateStr: string): string {
		const [y, m, d] = dateStr.split('-');
		if (locale === 'en') {
			const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
		}
		return `${parseInt(d)}/${parseInt(m)}/${y}`;
	}

	let sortedPosts = $derived([...blogPosts].sort((a, b) => b.date.localeCompare(a.date)));

	let allTags = $derived(
		[...new Set(blogPosts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b))
	);

	let showAllTags = $state(false);
	let visibleTags = $derived(showAllTags ? allTags : allTags.slice(0, 10));
	let hiddenCount = $derived(allTags.length - visibleTags.length);

	let activeTag = $derived(browser ? page.url.searchParams.get('tag') || '' : '');

	let filteredPosts = $derived(
		activeTag
			? sortedPosts.filter((p) => p.tags.includes(activeTag))
			: sortedPosts
	);

	function setTag(tag: string) {
		if (tag === activeTag) {
			goto('/blog', { replaceState: true });
		} else {
			goto(`/blog?tag=${encodeURIComponent(tag)}`, { replaceState: true });
		}
	}
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
				<AppMenu showHome homeHref="/" currentPage="blog" />
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
			{#if filteredPosts.length === 0}
			<div class="empty-state">
				<p>{m.blog_noArticlesWithTag()}</p>
				<button class="clear-filter-btn" onclick={() => goto('/blog', { replaceState: true })}>
					<X size={14} />
					{m.blog_clearFilter()}
				</button>
			</div>
		{:else}
			<div class="tag-filters">
				<button
					class="filter-chip special"
					class:active={activeTag === ''}
					onclick={() => goto('/blog', { replaceState: true })}
				>
					{m.blog_all()}
				</button>
				{#each visibleTags as tag}
					<button
						class="filter-chip"
						class:active={tag === activeTag}
						onclick={() => setTag(tag)}
					>
						{tag}
					</button>
				{/each}
				{#if hiddenCount > 0}
					<button class="filter-chip special" onclick={() => showAllTags = true}>
						+{hiddenCount}
						{locale === 'es' ? 'más' : locale === 'ca' ? 'més' : 'more'}
					</button>
				{/if}
				{#if showAllTags && allTags.length > 10}
					<button class="filter-chip special" onclick={() => showAllTags = false}>
						{locale === 'es' ? 'Mostrar menos' : locale === 'ca' ? 'Mostrar menys' : 'Show less'}
					</button>
				{/if}
			</div>

			{#if activeTag}
				<p class="filter-info">
					{filteredPosts.length}
					{filteredPosts.length === 1
						? (locale === 'es' ? 'artículo con etiqueta' : locale === 'ca' ? 'article amb etiqueta' : 'article with tag')
						: (locale === 'es' ? 'artículos con etiqueta' : locale === 'ca' ? 'articles amb etiqueta' : 'articles with tag')}
					<strong>"{activeTag}"</strong>
				</p>
			{/if}

			<div class="posts-grid">
				{#each filteredPosts as post}
					<article class="post-card" onclick={() => goto(`/blog/${post.slug}`)} onkeydown={(e) => e.key === 'Enter' && goto(`/blog/${post.slug}`)} tabindex="0" role="button" aria-label={post.title}>
						<div class="post-meta">
							<span class="post-date">
								<Calendar size={14} />
								{formatDate(post.date)}
							</span>
						</div>
						<h2 class="post-title">{post.title}</h2>
						<p class="post-desc">{post.description}</p>
						<div class="post-footer">
							<div class="post-tags">
								{#each post.tags.slice(0, 3) as tag}
									<button
										class="tag"
										onclick={(e) => { e.stopPropagation(); setTag(tag); }}
										onkeydown={(e) => e.stopPropagation()}
									>
										<Tag size={12} />
										{tag}
									</button>
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

	.tag-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.filter-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.4rem 0.75rem;
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		color: var(--muted-foreground);
		border: 1px solid var(--border);
		border-radius: 20px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.filter-chip:hover {
		border-color: var(--primary);
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 12%, transparent);
	}

	.filter-chip.special {
		border-color: color-mix(in srgb, #f97316 30%, transparent);
		color: #f97316;
		background: color-mix(in srgb, #f97316 10%, transparent);
	}

	.filter-chip.special:hover {
		border-color: #f97316;
		background: color-mix(in srgb, #f97316 20%, transparent);
	}

	.filter-chip.special.active {
		background: #f97316;
		color: #fff;
		border-color: #f97316;
	}

	.filter-chip.active {
		background: var(--primary);
		color: var(--primary-foreground);
		border-color: var(--primary);
	}

	.filter-info {
		font-size: 0.85rem;
		color: var(--muted-foreground);
		margin: 0 0 1rem 0;
	}

	.filter-info strong {
		color: var(--foreground);
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: var(--muted-foreground);
		font-size: 1.1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.clear-filter-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
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
		border: none;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.tag:hover,
	.tag:focus-visible {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
	}

	.tag:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 1px;
	}

	.read-more {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--primary);
		white-space: nowrap;
	}
</style>
