import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// APS-2-7: load test-only DATABASE_URL from the repo-root .env.test BEFORE any
// test file imports trigger getPool(). Falls back silently when the file is
// absent (CI sets DATABASE_URL directly via secrets), but the guard in
// context-service.test.ts still refuses to run against a production URL.
loadDotenv({ path: resolve(__dirname, '../../.env.test') });

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		testTimeout: 30000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/services/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 70,
				statements: 80,
			},
		},
	},
});
