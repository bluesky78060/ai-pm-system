import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// APS-2-7 / APS-1-32: load the test-only DATABASE_URL from the repo-root .env.test
// before any test file import can trigger getPool().
//
// `override: true` is required. dotenv's config() defaults to override:false, so a
// DATABASE_URL already exported in the shell silently wins and .env.test is ignored
// entirely ("injected env (0)").
//
// The return-value check is required too. When the file is missing or has no
// DATABASE_URL key, dotenv is a silent no-op and the shell value survives. .env.test
// is gitignored, so a fresh clone starts in exactly that state. Without this guard the
// 2026-05-18 incident path reopens: if the shell value is the one hardcoded production
// compute, the guard in context-service.test.ts catches it, but a recreated Neon
// endpoint, a Render database, or another project's DB passes straight through green.
//
// The `.trim()` matters: dotenv strips whitespace from unquoted values, but preserves it
// inside quotes, so DATABASE_URL="   " would otherwise be truthy and slip through to fail
// later with an opaque pg parse error instead of this message.
//
// Scope: this guard covers the Vitest path only. `override: true` also applies to every
// other key .env.test defines, not just DATABASE_URL — keep that file to test-only values.
// Running the server itself (start / start:api / dev:api) deliberately uses the ambient
// DATABASE_URL and is not covered here; see APS-1-25 for centralising the compute guard.
const loaded = loadDotenv({ path: resolve(__dirname, '../../.env.test'), override: true });
if (loaded.error || !loaded.parsed?.DATABASE_URL?.trim()) {
	throw new Error(
		'APS-1-32: .env.test could not be read, or it has no DATABASE_URL key. ' +
			'Refusing to fall back to the shell DATABASE_URL. ' +
			'Create .env.test at the repo root (see .env.test.example). ' +
			'On CI, check that the TEST_DATABASE_URL secret is injected (fork PRs do not get it).',
	);
}

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
