import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' }), sveltekit()],
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
						// Capacitor
						if (id.includes('@capacitor')) {
							return 'capacitor';
						}
					}
				}
			}
		}
	}
});
