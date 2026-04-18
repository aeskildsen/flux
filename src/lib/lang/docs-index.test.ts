/**
 * docs-index.ts unit tests.
 *
 * These cover the markdown parser and the public lookup API. The purpose is
 * to lock in the contract the hover provider depends on: that every
 * user-facing token in the DSL has a discoverable, deterministic key in
 * the runtime doc index.
 */

import { describe, it, expect } from 'vitest';
import {
	lookupDocSection,
	getDocMarkdown,
	_extractKeysForTest,
	_parseSectionsForTest,
	_resetDocIndex
} from './docs-index.js';

// ---------------------------------------------------------------------------
// extractKeys
// ---------------------------------------------------------------------------

describe('extractKeys', () => {
	it("extracts the modifier name with leading sigil: 'stut(n)", () => {
		expect(_extractKeysForTest("### `'stut(n)` — stutter")).toEqual(["'stut"]);
	});

	it("extracts bare modifier: 'lock", () => {
		expect(_extractKeysForTest("### `'lock` — freeze forever")).toEqual(["'lock"]);
	});

	it('extracts decorator @key', () => {
		expect(_extractKeysForTest('### `@key` — compound pitch context')).toEqual(['@key']);
	});

	it('extracts content type note', () => {
		expect(_extractKeysForTest('## `note` — polyphonic pitched events')).toEqual(['note']);
	});

	it('extracts both `rand` and `~` when a heading has two code spans', () => {
		expect(_extractKeysForTest('### White noise `rand` / `~`')).toEqual(['rand', '~']);
	});

	it('skips bracketed synthetic forms', () => {
		expect(_extractKeysForTest('## Sequence lists `[...]`')).toEqual([]);
	});

	it('strips curly-brace argument suffix: utf8{word}', () => {
		expect(_extractKeysForTest('## UTF-8 byte generator `utf8{word}`')).toEqual(['utf8']);
	});

	it("strips arp algorithm suffix: 'arp(\\\\up)", () => {
		expect(_extractKeysForTest("### `'arp(\\up)` — ascending")).toEqual(["'arp"]);
	});

	it('returns empty array when heading has no code span', () => {
		expect(_extractKeysForTest('## Timing')).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// parseSections
// ---------------------------------------------------------------------------

describe('parseSections', () => {
	it('closes sections at same-or-shallower headings', () => {
		const md = [
			'# Top',
			'',
			'Top body.',
			'',
			'## A',
			'',
			'A body.',
			'',
			'## B',
			'',
			'B body.',
			''
		].join('\n');
		const secs = _parseSectionsForTest('test', md);
		const headings = secs.map((s) => s.heading);
		expect(headings).toContain('## A');
		expect(headings).toContain('## B');
		const a = secs.find((s) => s.heading === '## A')!;
		expect(a.body).toContain('A body');
		expect(a.body).not.toContain('B body');
	});

	it('includes the first fenced code block in the body', () => {
		const md = [
			'### `foo`',
			'',
			'First paragraph.',
			'',
			'```flux',
			'foo bar',
			'```',
			'',
			'More prose.'
		].join('\n');
		const secs = _parseSectionsForTest('test', md);
		const foo = secs.find((s) => s.heading.includes('foo'))!;
		expect(foo.body).toContain('First paragraph');
		expect(foo.body).toContain('```flux');
		expect(foo.body).toContain('foo bar');
	});
});

// ---------------------------------------------------------------------------
// Real doc index — coverage across every docs file
// ---------------------------------------------------------------------------

describe('runtime doc index — lookupDocSection', () => {
	it("finds modifiers.md section for 'stut", () => {
		_resetDocIndex();
		const s = lookupDocSection("'stut");
		expect(s).not.toBeNull();
		expect(s!.source).toBe('modifiers');
		// The modifiers.md body for 'stut describes repetition — match loosely.
		expect(s!.body.toLowerCase()).toMatch(/repeat|stut/);
	});

	it("finds modifiers.md section for 'lock", () => {
		const s = lookupDocSection("'lock");
		expect(s).not.toBeNull();
		expect(s!.source).toBe('modifiers');
	});

	it("finds modifiers.md section for 'rev", () => {
		const s = lookupDocSection("'rev");
		expect(s).not.toBeNull();
		expect(s!.body.toLowerCase()).toContain('revers');
	});

	it("finds modifiers.md section for 'numSlices", () => {
		const s = lookupDocSection("'numSlices");
		expect(s).not.toBeNull();
		expect(s!.source).toBe('modifiers');
	});

	it('finds decorators.md section for @key', () => {
		const s = lookupDocSection('@key');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('decorators');
		expect(s!.body.toLowerCase()).toMatch(/root|scale/);
	});

	it('finds decorators.md section for @buf', () => {
		const s = lookupDocSection('@buf');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('decorators');
		expect(s!.body.toLowerCase()).toContain('slice');
	});

	it('finds generators.md section for rand', () => {
		const s = lookupDocSection('rand');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('generators');
	});

	it('finds generators.md section for ~ (tilde shorthand)', () => {
		const s = lookupDocSection('~');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('generators');
	});

	it('finds generators.md section for step', () => {
		const s = lookupDocSection('step');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('generators');
	});

	it('finds generators.md section for utf8', () => {
		const s = lookupDocSection('utf8');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('generators');
		expect(s!.body.toLowerCase()).toContain('utf-8');
	});

	it('finds content-types.md section for note', () => {
		// modifiers.md does not define `note` at a heading level, so this is
		// served from content-types.md.
		const s = lookupDocSection('note');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('content-types');
	});

	it('finds content-types.md section for sample', () => {
		const s = lookupDocSection('sample');
		expect(s).not.toBeNull();
		// `sample` is documented in both content-types.md and buffers.md —
		// either is acceptable as long as the lookup resolves.
		expect(['content-types', 'buffers']).toContain(s!.source);
	});

	it('finds synthdefs.md section for fm', () => {
		const s = lookupDocSection('fm');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('synthdefs');
	});

	it('finds synthdefs.md section for samplePlayer', () => {
		const s = lookupDocSection('samplePlayer');
		expect(s).not.toBeNull();
		expect(s!.source).toBe('synthdefs');
	});

	it('finds params.md section for the top-level Params heading ? no', () => {
		// Top-level "# Params" has no code-span key, so it's unindexed.
		// Instead, params.md is surfaced via sub-headings like "## Syntax" —
		// none of which have code spans either. This test documents the
		// deliberate decision to treat params.md as context-only; the
		// `"param` hover path uses getParamHover() not the doc index.
		expect(lookupDocSection('Params')).toBeNull();
	});

	it('returns null for unknown keys', () => {
		expect(lookupDocSection('definitelyNotAKey_xyz')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// getDocMarkdown — rendered output shape
// ---------------------------------------------------------------------------

describe('getDocMarkdown', () => {
	it("renders a bold heading + body for 'stut", () => {
		const md = getDocMarkdown("'stut");
		expect(md).not.toBeNull();
		expect(md!.startsWith('**')).toBe(true);
		expect(md!.toLowerCase()).toContain('stutter');
	});

	it('rendered markdown contains no leading # characters', () => {
		const md = getDocMarkdown('@scale')!;
		// First line should not start with markdown hash — we strip those.
		expect(md.split('\n')[0].startsWith('#')).toBe(false);
	});

	it('returns null for unknown keys', () => {
		expect(getDocMarkdown('nopeNope')).toBeNull();
	});
});
