/**
 * Validates that every bundled .flux file under static/examples/ compiles
 * cleanly through lex + parse + evaluator-static checks. Prevents example
 * regressions as the DSL evolves.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInstance } from './evaluator.js';

const examplesDir = path.join(process.cwd(), 'static', 'examples');
const exampleFiles = readdirSync(examplesDir)
	.filter((f) => f.endsWith('.flux'))
	.sort();

describe('bundled examples', () => {
	it.each(exampleFiles)('%s compiles without errors', (file) => {
		const src = readFileSync(path.join(examplesDir, file), 'utf8');
		const result = createInstance(src);
		if (!result.ok) {
			throw new Error(`${file}: ${result.error}`);
		}
		expect(result.ok).toBe(true);
	});
});
