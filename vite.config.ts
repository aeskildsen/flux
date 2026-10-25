import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit, type Config } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { readBuildInfo } from './scripts/build-info.ts';
import { escapeHtml, highlightFlux } from './src/lib/lang/highlighter.ts';

// The SvelteKit configuration. eslint.config.js also uses it.
export const svelteConfig: Config = {
	adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined }),
	paths: {
		// BASE_PATH is empty or starts with a slash, for example /flux in CI.
		base: (process.env.BASE_PATH ?? '') as '' | `/${string}`
	},
	preprocess: [
		mdsvex({
			extensions: ['.svx', '.md'],
			highlight: {
				highlighter: (code, lang) =>
					lang === 'flux' ? highlightFlux(code) : `<pre><code>${escapeHtml(code)}</code></pre>`
			}
		})
	],
	extensions: ['.svelte', '.svx', '.md']
};

export default defineConfig(({ command }) => ({
	plugins: [sveltekit(svelteConfig)],
	// src/lib/engine-location.ts builds the engine URLs from the base path.
	// The same value as paths.base in svelteConfig.
	define: {
		__FLUX_BASE_PATH__: JSON.stringify(process.env.BASE_PATH ?? ''),
		// src/lib/build-info.ts: the version, the commit and the engine version.
		__FLUX_BUILD__: JSON.stringify(
			readBuildInfo({ env: process.env, root: process.cwd(), dev: command === 'serve' })
		)
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
}));
