import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for Firestore security rules tests.
 * Requires the Firebase emulator to be running:
 *   firebase emulators:start --only firestore
 *
 * Run with:
 *   npm run test:rules
 */
export default defineConfig({
	test: {
		include: ['src/**/*.rules.test.ts'],
		environment: 'node',
		testTimeout: 30000,
		hookTimeout: 30000,
		pool: 'forks',
		poolOptions: {
			forks: { singleFork: true }
		}
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib')
		}
	}
});
