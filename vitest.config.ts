import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'functions/src/**/*.test.ts'],
		// Exclude Firestore rules tests — they require the Firebase emulator.
		// Run them with: npm run test:rules
		exclude: ['src/**/*.rules.test.ts'],
		environment: 'node'
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
			'$app/environment': path.resolve(__dirname, './src/__mocks__/app-environment.ts')
		}
	}
});
