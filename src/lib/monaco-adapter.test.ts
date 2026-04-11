import { describe, it, expect } from 'vitest';
import { chooseCommentAction } from './monaco-adapter.js';

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
