import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/lib/firestore.rules.spec.ts'],
		testTimeout: 15_000,
		hookTimeout: 30_000
	}
});
