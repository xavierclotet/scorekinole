import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			pages: 'www',
			assets: 'www',
			// SPA shell for non-prerendered routes. Renamed from index.html because
			// the prerendered landing (/) now owns www/index.html — Firebase Hosting
			// rewrites unmatched URLs to /200.html (see firebase.json).
			fallback: '200.html',
			precompress: false,
			strict: false
		}),
		paths: {
			base: ''
		}
	}
};

export default config;
