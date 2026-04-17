import { describe, it, expect, afterEach } from 'vitest';
import { chooseCommentAction, setBufferNamesGetter } from './monaco-adapter.js';

describe('setBufferNamesGetter', () => {
	afterEach(() => {
		// Reset to empty getter after each test
		setBufferNamesGetter(() => []);
	});

	it('can be set and does not throw', () => {
		expect(() => setBufferNamesGetter(() => ['kick', 'snare'])).not.toThrow();
	});

	it('accepts a getter that returns an empty array', () => {
		expect(() => setBufferNamesGetter(() => [])).not.toThrow();
	});
});

describe('chooseCommentAction', () => {
	it('returns "line" for a single-line selection', () => {
		expect(chooseCommentAction(5, 5)).toBe('line');
	});

	it('returns "line" for a 2-line selection', () => {
		expect(chooseCommentAction(1, 2)).toBe('line');
	});

	it('returns "line" for a 3-line selection', () => {
		expect(chooseCommentAction(1, 3)).toBe('line');
	});

	it('returns "block" for a 4-line selection', () => {
		expect(chooseCommentAction(1, 4)).toBe('block');
	});

	it('returns "block" for a large selection', () => {
		expect(chooseCommentAction(10, 50)).toBe('block');
	});
});
