/**
 * Flux DSL source validator.
 *
 * Runs lex + parse + static evaluator checks against one or more .flux files.
 * Exits 1 if any file has an error. No audio engine involvement — purely static.
 *
 *   pnpm tsx scripts/parse.ts [file1.flux file2.flux ...]
 *
 * With no arguments, checks every .flux file in static/examples/.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createInstance } from '../src/lib/lang/evaluator.ts';

const root = process.cwd();

function resolveTargets(args: string[]): string[] {
	if (args.length > 0) return args.map((a) => path.resolve(root, a));
	const examplesDir = path.join(root, 'static', 'examples');
	return readdirSync(examplesDir)
		.filter((f) => f.endsWith('.flux'))
		.map((f) => path.join(examplesDir, f))
		.sort();
}

const targets = resolveTargets(process.argv.slice(2));
let failures = 0;

for (const file of targets) {
	const rel = path.relative(root, file);
	const src = readFileSync(file, 'utf8');
	const result = createInstance(src);
	if (result.ok) {
		console.log(`ok   ${rel}`);
	} else {
		failures++;
		console.log(`FAIL ${rel}`);
		console.log(`     ${result.error}`);
	}
}

console.log();
console.log(`${targets.length - failures}/${targets.length} passed`);
process.exit(failures > 0 ? 1 : 0);
