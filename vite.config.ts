import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// 'locale-modules' in BOTH dev and build so paraglide always emits the
			// same filenames (one module per locale) regardless of command. When
			// dev and build used different layouts (message-modules for build),
			// switching `npm run build` → `npm run dev` left open browser tabs
			// requesting per-message files that no longer existed → spurious 404s.
			// Trade-off: build no longer tree-shakes per message, so each route
			// pulls the full all-messages chunk (~288 KB raw / locale) instead of
			// only the messages it uses. Accepted because most messages are used
			// app-wide, so the tree-shaking delta is small (re-measure if messages
			// grow a lot). True single-locale lazy-loading isn't supported by
			// Paraglide (sync message functions; see inlang/paraglide-js#88).
			outputStructure: 'locale-modules'
		}),
		tailwindcss(),
		sveltekit()
	],

	// Pre-bundle heavy dependencies so Vite doesn't re-process them on every page load.
	// NOTE: `@lucide/svelte` (the barrel) is intentionally NOT included — importing it
	// pulls a ~4.9 MB bundle into every page in dev. Always import icons per-file via
	// `@lucide/svelte/icons/<name>` (e.g. `import Play from '@lucide/svelte/icons/play'`).
	optimizeDeps: {
		include: [
			'firebase/app',
			'firebase/auth',
			'firebase/firestore',
			'firebase/storage',
			'firebase/messaging',
			'firebase/analytics',
			'chart.js',
			'bits-ui',
			'embla-carousel-svelte',
			'svelte5-chartjs',
		],
	},

	// Pre-transform frequently used routes on server start
	server: {
		fs: {
			allow: ['..'],
		},
		warmup: {
			clientFiles: [
				'src/routes/+page.svelte',
				'src/routes/game/+page.svelte',
				'src/routes/my-stats/+page.svelte',
				'src/lib/components/AppMenu.svelte',
				'src/lib/firebase/auth.ts',
				'src/lib/firebase/firestore.ts',
				'src/lib/stores/gameSettings.ts',
				'src/lib/paraglide/messages.js',
			],
		},
	},

	build: {
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (id.includes('node_modules')) {
						// Firebase - largest dependency, split into sub-chunks
						if (id.includes('firebase/auth') || id.includes('@firebase/auth')) {
							return 'firebase-auth';
						}
						if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) {
							return 'firebase-firestore';
						}
						if (id.includes('firebase/storage') || id.includes('@firebase/storage')) {
							return 'firebase-storage';
						}
						if (id.includes('firebase') || id.includes('@firebase')) {
							return 'firebase-core';
						}
					}
				}
			}
		}
	}
}));
