import path from 'path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import monacoEditorPluginModule from 'vite-plugin-monaco-editor';
const monacoEditorPlugin =
	(monacoEditorPluginModule as unknown as { default: typeof monacoEditorPluginModule }).default ??
	monacoEditorPluginModule;

export default defineConfig({
	plugins: [
		sveltekit(),
		monacoEditorPlugin({
			customDistPath: (root, buildOutDir) => {
				const outDir = path.isAbsolute(buildOutDir) ? buildOutDir : path.join(root, buildOutDir);
				return path.join(outDir, 'monacoeditorwork');
			}
		})
	],
	optimizeDeps: {
		include: ['chevrotain']
	},
	server: {
		watch: {
			ignored: ['**/dev-*/**']
		},
		fs: {
			allow: ['svelte-supersonic']
		}
	},
	test: {
		expect: { requireAssertions: true },
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
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
