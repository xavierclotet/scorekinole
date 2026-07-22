<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { translateText } from '$lib/utils/translate';
	import SEO from '$lib/components/SEO.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';
	import { blogPosts, type BlogPost } from '$lib/content/blog';
	import { renderMarkdown } from '$lib/utils/blogMarkdown';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Calendar from '@lucide/svelte/icons/calendar';
	import User from '@lucide/svelte/icons/user';
	import Languages from '@lucide/svelte/icons/languages';

	let slug = $derived(page.params.slug);
	let post = $derived(blogPosts.find((p) => p.slug === slug) ?? null);

	let locale = $derived(getLocale());

	let seoTitle = $derived(post ? `${post.title} - Scorekinole` : 'Blog - Scorekinole');
	let seoDesc = $derived(post?.description ?? '');

	let translating = $state(false);
	let translatedContent = $state<string | null>(null);
	let showTranslation = $state(false);
	let translationError = $state<string | null>(null);

	// Reset translation state when navigating to another post
	$effect(() => {
		slug;
		translating = false;
		translatedContent = null;
		showTranslation = false;
		translationError = null;
	});

	let articleJsonLd = $derived(post ? {
		"@context": "https://schema.org",
		"@type": "Article",
		"headline": post.title,
		"description": post.description,
		"datePublished": post.date,
		"author": {
			"@type": "Organization",
			"name": "Scorekinole",
			"url": "https://scorekinole.es"
		},
		"publisher": {
			"@type": "Organization",
			"name": "Scorekinole",
			"logo": "https://scorekinole.es/icon-512.png"
		},
		"mainEntityOfPage": {
			"@type": "WebPage",
			"@id": `https://scorekinole.es/blog/${post.slug}`
		}
	} : null);

	let breadcrumbJsonLd = $derived(post ? {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		"itemListElement": [
			{
				"@type": "ListItem",
				"position": 1,
				"name": "Scorekinole",
				"item": "https://scorekinole.es"
			},
			{
				"@type": "ListItem",
				"position": 2,
				"name": "Blog",
				"item": "https://scorekinole.es/blog"
			},
			{
				"@type": "ListItem",
				"position": 3,
				"name": post.title,
				"item": `https://scorekinole.es/blog/${post.slug}`
			}
		]
	} : null);

	let pageJsonLd = $derived(
		[articleJsonLd, breadcrumbJsonLd].filter(Boolean)
	);

	let sortedPosts = $derived([...blogPosts].sort((a, b) => b.date.localeCompare(a.date)));
	let currentIdx = $derived(sortedPosts.findIndex((p) => p.slug === slug));
	let prevPost = $derived(currentIdx > 0 ? sortedPosts[currentIdx - 1] : null);
	let nextPost = $derived(currentIdx >= 0 && currentIdx < sortedPosts.length - 1 ? sortedPosts[currentIdx + 1] : null);

	function formatDate(dateStr: string): string {
		const [y, m, d] = dateStr.split('-');
		if (locale === 'en') {
			const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
		}
		return `${parseInt(d)}/${parseInt(m)}/${y}`;
	}

	let renderedContent = $derived(post ? renderMarkdown(post.content) : '');
	let renderedTranslated = $derived(translatedContent ? renderMarkdown(translatedContent) : '');

	async function handleTranslate() {
		if (!post || translating) return;

		// Toggle back to the original without re-fetching
		if (showTranslation) {
			showTranslation = false;
			return;
		}

		// Reuse an existing translation
		if (translatedContent) {
			showTranslation = true;
			return;
		}

		translating = true;
		translationError = null;
		const requestSlug = slug;

		const result = await translateText(
			post.content,
			'autodetect',
			locale
		);

		// Ignore the response if the user navigated to another post meanwhile
		if (requestSlug !== slug) return;

		if (result.success && result.translatedText) {
			translatedContent = result.translatedText;
			showTranslation = true;
		} else {
			translationError = result.error || 'Translation error';
		}

		translating = false;
	}
</script>

<SEO
	title={seoTitle}
	description={seoDesc}
	canonical={`https://scorekinole.es/blog/${slug}`}
	ogType="article"
	locale={locale}
	jsonLd={pageJsonLd.length > 0 ? pageJsonLd : undefined}
	noindex={!post}
/>

<div class="post-container" data-theme={$theme}>
	{#if !post}
		<main class="not-found">
			<h2>{locale === 'es' ? 'Artículo no encontrado' : 'Article not found'}</h2>
			<p>{locale === 'es' ? 'El artículo que buscas no existe.' : 'The article you are looking for does not exist.'}</p>
			<button class="back-link" onclick={() => goto('/blog')}>
				<ArrowLeft size={16} />
				{locale === 'es' ? 'Volver al blog' : 'Back to blog'}
			</button>
		</main>
	{:else}
		<header class="post-header">
			<div class="header-row">
				<button class="back-btn" onclick={() => goto('/blog')}>
					<ArrowLeft size={18} />
					<span>Blog</span>
				</button>
				<ThemeToggle />
			</div>
		</header>

		<main class="post-content">
			<article>
				<div class="post-meta">
					<span class="meta-item">
						<Calendar size={14} />
						{formatDate(post.date)}
					</span>
					<span class="meta-item">
						<User size={14} />
						{post.author}
					</span>
				</div>

				<h1 class="post-title">{post.title}</h1>
				<p class="post-desc">{post.description}</p>

				<div class="post-tags">
					{#each post.tags as tag}
						<button class="tag" onclick={() => goto(`/blog?tag=${encodeURIComponent(tag)}`)}>
							{tag}
						</button>
					{/each}
				</div>

				<div class="translate-bar">
					<button
						class="translate-btn"
						onclick={handleTranslate}
						disabled={translating}
					>
						<Languages size={16} />
						{translating
							? (locale === 'es' ? 'Traduciendo...' : 'Translating...')
							: showTranslation
								? (locale === 'es' ? 'Mostrar original' : 'Show original')
								: (locale === 'es' ? 'Traducir' : 'Translate')}
					</button>
				</div>

				<div class="post-body" class:translated={showTranslation && translatedContent}>
					{@html showTranslation && translatedContent ? renderedTranslated : renderedContent}
				</div>

				{#if translationError}
					<div class="translation-error">{translationError}</div>
				{/if}
			</article>

			<nav class="post-nav" aria-label="Artículos relacionados">
				{#if prevPost}
					<button class="nav-link prev" onclick={() => goto(`/blog/${prevPost.slug}`)}>
						<ArrowLeft size={16} />
						<div class="nav-text">
							<span class="nav-label">{locale === 'es' ? 'Anterior' : 'Previous'}</span>
							<span class="nav-title">{prevPost.title}</span>
						</div>
					</button>
				{:else}
					<div></div>
				{/if}
				{#if nextPost}
					<button class="nav-link next" onclick={() => goto(`/blog/${nextPost.slug}`)}>
						<div class="nav-text">
							<span class="nav-label">{locale === 'es' ? 'Siguiente' : 'Next'}</span>
							<span class="nav-title">{nextPost.title}</span>
						</div>
						<ArrowRight size={16} />
					</button>
				{/if}
			</nav>
		</main>
	{/if}
</div>

<style>
	.post-container {
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--background);
	}

	.post-header {
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
		justify-content: space-between;
		padding: 0.5rem 1rem;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		color: var(--muted-foreground);
		font-size: 0.9rem;
		font-weight: 500;
		padding: 6px 10px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.back-btn:hover {
		color: var(--foreground);
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
	}

	.not-found {
		max-width: 600px;
		margin: 4rem auto;
		text-align: center;
		padding: 2rem;
	}

	.not-found h2 {
		color: var(--foreground);
		margin-bottom: 1rem;
	}

	.not-found p {
		color: var(--muted-foreground);
		margin-bottom: 2rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.post-content {
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}

	.post-meta {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		font-size: 0.85rem;
		color: var(--muted-foreground);
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.post-title {
		font-size: 1.75rem;
		font-weight: 800;
		color: var(--foreground);
		margin: 0 0 0.75rem 0;
		line-height: 1.2;
	}

	.post-desc {
		font-size: 1rem;
		color: var(--muted-foreground);
		margin: 0 0 1rem 0;
		line-height: 1.5;
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 1.5rem;
	}

	.tag {
		padding: 0.25rem 0.6rem;
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
		border: none;
		border-radius: 4px;
		font-size: 0.75rem;
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

	.translate-bar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 1rem;
	}

	.translate-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		background: color-mix(in srgb, var(--primary) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
		border-radius: 6px;
		color: var(--primary);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.translate-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--primary) 20%, transparent);
	}

	.translate-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.post-body {
		font-size: 0.95rem;
		color: var(--foreground);
		line-height: 1.7;
	}

	.post-body.translated {
		border-left: 3px solid var(--primary);
		padding-left: 1rem;
	}

	.post-body :global(h2) {
		font-size: 1.3rem;
		font-weight: 700;
		margin: 1.5rem 0 0.75rem;
		color: var(--foreground);
	}

	.post-body :global(h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 1.25rem 0 0.5rem;
		color: var(--foreground);
	}

	.post-body :global(p) {
		margin: 0 0 1rem;
	}

	.post-body :global(ul), .post-body :global(ol) {
		margin: 0 0 1rem;
		padding-left: 1.5rem;
	}

	.post-body :global(li) {
		margin-bottom: 0.35rem;
	}

	.post-body :global(strong) {
		font-weight: 600;
	}

	.translation-error {
		margin-top: 0.75rem;
		padding: 0.5rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border-radius: 6px;
		color: #ef4444;
		font-size: 0.8rem;
	}

	.post-nav {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		color: var(--foreground);
	}

	.nav-link:hover {
		border-color: var(--primary);
	}

	.nav-link.next {
		text-align: right;
		justify-content: flex-end;
		grid-column: 2;
	}

	.nav-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.nav-label {
		font-size: 0.7rem;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.nav-title {
		font-size: 0.85rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
