import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// src/lib/engine-location.ts builds the engine URLs from the base path.
	// The same value as kit.paths.base in svelte.config.ts.
	define: {
		__FLUX_BASE_PATH__: JSON.stringify(process.env.BASE_PATH ?? '')
	},
	optimizeDeps: {
		include: ['chevrotain']
	},
	server: {
		watch: {
			ignored: ['**/dev-*/**']
		},
		fs: {
			allow: ['docs']
		}
	},
	test: {
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/**/*.{test,spec}.ts'],
			reporter: ['text', 'json-summary'],
			reportsDirectory: './coverage',
			thresholds: {
				statements: 80,
				branches: 65,
				functions: 85,
				lines: 85
			}
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
