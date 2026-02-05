import type { RequestHandler } from './$types';

const BASE_URL = 'https://scorekinole.web.app';

export const GET: RequestHandler = async () => {
	const pages = [
		{ url: '/', priority: '1.0', changefreq: 'weekly' },
		{ url: '/tournaments', priority: '0.9', changefreq: 'daily' },
		{ url: '/rankings', priority: '0.8', changefreq: 'daily' }
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map(
		(page) => `  <url>
    <loc>${BASE_URL}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
