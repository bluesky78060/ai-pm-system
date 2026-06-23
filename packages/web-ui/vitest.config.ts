import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// APS-3-4: web-ui 테스트 인프라. jsdom 환경 + RTL. vite plugin(react) 재사용.
// 테스트 파일은 명시적 import({ describe, it, expect, vi } from 'vitest')를 사용하며,
// tsconfig.app.json은 테스트를 exclude해 `tsc -b` 빌드에서 제외(빌드 무영향).
export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.test.{ts,tsx}'],
	},
});
