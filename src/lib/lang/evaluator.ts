/**
 * Flux DSL evaluator — supports `loop [degrees...]` with numeric generators.
 *
 * Each sequence element is compiled to a Sampler: a `() => number` function.
 * Plain integers are constant samplers; `0rand4` samples a fresh random degree
 * on every call (eager(0) semantics — proper eager(1) cycle-boundary resampling
 * requires scheduler cycle tracking and is not yet implemented).
 */

import type { CstNode, IToken } from 'chevrotain';
import { FluxLexer } from './lexer.js';
import { parser, preprocessTokens } from './parser.js';
import { degreeToMidi, DEFAULT_SCALE } from '../scales.js';

// Default root: C5 = MIDI 60
const DEFAULT_ROOT_MIDI = 60;

export type EvalEvent = { note: number; duration: number };

export type EvalResult =
	| { ok: true; generator: Generator<EvalEvent, never, unknown> }
	| { ok: false; error: string };

/** A sampler draws a degree value when called. */
type Sampler = () => number;

export function evaluate(source: string): EvalResult {
	const { tokens, errors: lexErrors } = FluxLexer.tokenize(source);
	if (lexErrors.length > 0) {
		return { ok: false, error: `Lex error: ${lexErrors[0].message}` };
	}

	parser.input = preprocessTokens(tokens, source);
	const cst = parser.program();
	if (parser.errors.length > 0) {
		return { ok: false, error: `Parse error: ${parser.errors[0].message}` };
	}

	const statements = (cst.children.statement ?? []) as CstNode[];
	for (const stmt of statements) {
		const loopNodes = stmt.children.loopStatement as CstNode[] | undefined;
		if (!loopNodes?.length) continue;

		const loopNode = loopNodes[0];
		const seqNodes = (loopNode.children.sequenceExpr ?? loopNode.children.sequenceGenerator) as
			| CstNode[]
			| undefined;
		if (!seqNodes?.length) {
			return { ok: false, error: 'loop has no sequence body' };
		}

		const samplers = extractSamplers(seqNodes[0]);
		if (samplers.length === 0) {
			return { ok: false, error: 'loop sequence is empty' };
		}

		return { ok: true, generator: cyclicLoop(samplers) };
	}

	return { ok: false, error: 'No loop statement found' };
}

/**
 * Walk sequenceGenerator → sequenceElement[] → compile each to a Sampler.
 * Elements that can't be resolved (nested lists, unsupported generators) are skipped.
 */
function extractSamplers(seqNode: CstNode): Sampler[] {
	const elements = (seqNode.children.sequenceElement ?? []) as CstNode[];
	const samplers: Sampler[] = [];

	for (const elem of elements) {
		const genExpr = ((elem.children.generatorExpr as CstNode[]) ?? [])[0];
		if (!genExpr) continue;
		const atomic = ((genExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
		if (!atomic) continue;
		const numGen = ((atomic.children.numericGenerator as CstNode[]) ?? [])[0];
		if (!numGen) continue;
		const sampler = numGenToSampler(numGen);
		if (sampler) samplers.push(sampler);
	}

	return samplers;
}

/** Compile a numericGenerator CST node to a Sampler. */
function numGenToSampler(numGen: CstNode): Sampler | null {
	const lit = ((numGen.children.numericLiteral as CstNode[]) ?? [])[0];
	if (!lit) return null;
	const minVal = litToNumber(lit);
	if (minVal === null) return null;

	// rand / tilde: uniform random integer in [min, max] inclusive
	const randNode =
		((numGen.children.randGen as CstNode[]) ?? [])[0] ??
		((numGen.children.tildeGen as CstNode[]) ?? [])[0];
	if (randNode) {
		const maxLit = ((randNode.children.numericLiteral as CstNode[]) ?? [])[0];
		const maxVal = maxLit ? litToNumber(maxLit) : null;
		if (maxVal === null) return () => minVal;
		return () => Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
	}

	// gau: Gaussian — mean=min, sdev=arg
	const gauNode = ((numGen.children.gauGen as CstNode[]) ?? [])[0];
	if (gauNode) {
		const sdevLit = ((gauNode.children.numericLiteral as CstNode[]) ?? [])[0];
		const sdev = sdevLit ? litToNumber(sdevLit) : null;
		if (sdev === null) return () => minVal;
		return () => gaussSample(minVal, sdev);
	}

	// exp: exponential random — lo=min, hi=arg
	const expNode = ((numGen.children.expGen as CstNode[]) ?? [])[0];
	if (expNode) {
		const maxLit = ((expNode.children.numericLiteral as CstNode[]) ?? [])[0];
		const maxVal = maxLit ? litToNumber(maxLit) : null;
		if (maxVal === null) return () => minVal;
		return () => expSample(minVal, maxVal);
	}

	// bro: Brownian motion — lo=min, hi=arg1, maxStep=arg2 (stateful)
	const broNode = ((numGen.children.broGen as CstNode[]) ?? [])[0];
	if (broNode) {
		const lits = (broNode.children.numericLiteral as CstNode[]) ?? [];
		const maxVal = lits[0] ? litToNumber(lits[0]) : null;
		const maxStep = lits[1] ? litToNumber(lits[1]) : null;
		if (maxVal === null) return () => minVal;
		return makeBrownSampler(minVal, maxVal, maxStep ?? 1);
	}

	// Deterministic series generators — stateful, cycle through pre-computed sequence.
	// In each case children.numericLiteral = [arg, length] (SUBRULE + SUBRULE2).
	type DetGen = 'stepGen' | 'mulGen' | 'linGen' | 'geoGen';
	for (const key of ['stepGen', 'mulGen', 'linGen', 'geoGen'] as DetGen[]) {
		const node = ((numGen.children[key] as CstNode[]) ?? [])[0];
		if (!node) continue;
		const lits = (node.children.numericLiteral as CstNode[]) ?? [];
		const arg = lits[0] ? litToNumber(lits[0]) : null;
		const len = lits[1] ? litToNumber(lits[1]) : null;
		if (arg === null || len === null || len < 1) return () => minVal;
		const length = Math.round(len);
		let values: number[];
		if (key === 'stepGen') values = stepSeries(minVal, arg, length);
		else if (key === 'mulGen') values = mulSeries(minVal, arg, length);
		else if (key === 'linGen') values = linSeries(minVal, arg, length);
		else values = geoSeries(minVal, arg, length);
		return makeSeriesSampler(values);
	}

	// Plain literal — constant sampler
	return () => minVal;
}

/** Read the numeric value from a numericLiteral CST node. */
function litToNumber(lit: CstNode): number | null {
	const negative = ((lit.children.Minus as IToken[]) ?? []).length > 0;
	const intTok = ((lit.children.Integer as IToken[]) ?? [])[0];
	const floatTok = ((lit.children.Float as IToken[]) ?? [])[0];
	if (intTok) return (negative ? -1 : 1) * parseInt(intTok.image, 10);
	if (floatTok) return (negative ? -1 : 1) * parseFloat(floatTok.image);
	return null;
}

// ---------------------------------------------------------------------------
// Generator math helpers
// ---------------------------------------------------------------------------

/** Box-Muller Gaussian sample. */
function gaussSample(mean: number, sdev: number): number {
	const u1 = Math.random() || Number.EPSILON; // avoid log(0)
	const u2 = Math.random();
	return mean + sdev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Exponential random between lo and hi (requires lo > 0). */
function expSample(lo: number, hi: number): number {
	const safeLo = lo <= 0 ? Number.EPSILON : lo;
	return safeLo * Math.pow(hi / safeLo, Math.random());
}

/** Returns a stateful Brownian sampler clamped to [lo, hi]. */
function makeBrownSampler(lo: number, hi: number, maxStep: number): Sampler {
	let current = (lo + hi) / 2;
	return () => {
		current += (Math.random() * 2 - 1) * maxStep;
		current = Math.max(lo, Math.min(hi, current));
		return current;
	};
}

/** Returns a stateful sampler that cycles through a pre-computed sequence. */
function makeSeriesSampler(values: number[]): Sampler {
	let i = 0;
	return () => values[i++ % values.length];
}

/** Pseries: start, start+step, start+2*step, … (length values). */
function stepSeries(start: number, step: number, length: number): number[] {
	return Array.from({ length }, (_, i) => start + step * i);
}

/** Pgeom: start, start*mul, start*mul², … (length values). */
function mulSeries(start: number, multiplier: number, length: number): number[] {
	return Array.from({ length }, (_, i) => start * Math.pow(multiplier, i));
}

/** Linear interpolation from first to last in `length` steps (inclusive both ends). */
function linSeries(first: number, last: number, length: number): number[] {
	if (length <= 1) return [first];
	return Array.from({ length }, (_, i) => first + (last - first) * (i / (length - 1)));
}

/** Geometric interpolation from first to last in `length` steps (inclusive both ends). */
function geoSeries(first: number, last: number, length: number): number[] {
	if (length <= 1) return [first];
	const safeLo = first <= 0 ? Number.EPSILON : first;
	return Array.from({ length }, (_, i) => safeLo * Math.pow(last / safeLo, i / (length - 1)));
}

function* cyclicLoop(samplers: Sampler[]): Generator<EvalEvent, never, unknown> {
	const duration = 4 / samplers.length;
	let i = 0;
	while (true) {
		yield {
			note: degreeToMidi(samplers[i % samplers.length](), DEFAULT_ROOT_MIDI, DEFAULT_SCALE),
			duration
		};
		i++;
	}
}
