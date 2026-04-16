/**
 * highlighter.ts unit tests.
 *
 * The highlighter output is consumed by mdsvex and then compiled by Svelte.
 * Svelte treats `{...}` as expression delimiters and `<...>` as tags, so the
 * highlighter must escape those characters or the build fails on any DSL
 * sample containing them (e.g. `utf8{coffee}`).
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, highlightFlux } from './highlighter.js';

describe('escapeHtml', () => {
	it('escapes Svelte expression delimiters', () => {
		expect(escapeHtml('{')).toBe('&#123;');
		expect(escapeHtml('}')).toBe('&#125;');
	});

	it('escapes HTML tag characters', () => {
		expect(escapeHtml('<>')).toBe('&lt;&gt;');
	});

	it('escapes ampersand before other entities', () => {
		expect(escapeHtml('&{')).toBe('&amp;&#123;');
	});
});

describe('highlightFlux', () => {
	it('emits curly braces as HTML entities so Svelte does not parse them as expressions', () => {
		const html = highlightFlux('note lead utf8{coffee} % 14');
		expect(html).not.toMatch(/>\{</);
		expect(html).not.toMatch(/>\}</);
		expect(html).toContain('&#123;');
		expect(html).toContain('&#125;');
	});

	it('emits angle brackets as HTML entities for chord literals', () => {
		const html = highlightFlux('mono lead <1 2 3>');
		expect(html).toContain('&lt;');
		expect(html).toContain('&gt;');
	});
});
