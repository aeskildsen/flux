import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';
import type { Config } from '@sveltejs/kit';
import { escapeHtml, highlightFlux } from './src/lib/lang/highlighter.ts';

const config: Config = {
	kit: {
		adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined }),
		paths: {
			base: process.env.BASE_PATH ?? ''
		},
		alias: {
			'svelte-supersonic': './svelte-supersonic/src/lib/index.ts',
			$docs: './docs'
		}
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

export default config;
