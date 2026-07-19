import { blogPosts } from '$lib/content/blog';

// Prerender each blog post to static HTML so Googlebot indexes the article
// content (previously these URLs were in the sitemap but served the empty
// 200.html SPA shell). entries() enumerates every slug for the prerenderer.
export const prerender = true;

export function entries() {
	return blogPosts.map((post) => ({ slug: post.slug }));
}
