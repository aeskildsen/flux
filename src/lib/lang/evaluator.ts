/**
 * Flux DSL evaluator — Phase 6d.
 *
 * ## API
 *
 *   const inst = createInstance(source);   // parse once, build runner tree
 *   if (!inst.ok) { ... inst.error ... }
 *
 *   const result = inst.evaluate({ cycleNumber: 0 });
 *   if (!result.ok) { ... result.error ... }
 *   result.events  // ScheduledEvent[]
 *
 * ## Cycle model
 *
 * Each generator node is compiled to a Runner — a stateful object that holds:
 *   - a raw `poll()` function (the underlying generator logic)
 *   - an EagerMode annotation ('lock, 'eager(1), 'eager(n))
 *   - a cached value and the cycle number it was last sampled on
 *
 * On `runner.sample(ctx)`:
 *   - lock:      return cached value; sample raw only on first ever call
 *   - eager(n):  sample raw at cycle start when cycleNumber % n === 0;
 *                cache the value for all remaining calls in that cycle
 *
 * ## Scale context (Phase 6c)
 *
 * A ScaleContext carries { scale, rootSemitone, octave, cent, mtranspose }.
 * Decorator blocks push a child context; the evaluator threads the active
 * context through the CST walk. `set` writes to the global (bottom-of-stack)
 * context. Decorators override for their block scope.
 *
 * Pitch chain:  degree → (+mtranspose) → scale lookup → (+rootSemitone) → (+octave offset) → MIDI
 *
 * rootMidi = C5_midi + rootSemitone + (octave - 5) * 12
 *          = 60      + rootSemitone + (octave - 5) * 12
 *
 * ## Modifier precedence
 *
 * Inner annotation overrides outer.  Compilation threads an `inherited`
 * EagerMode down the CST; a node with its own explicit annotation uses that
 * instead of inherited.
 *
 * ## Phase 6d additions
 *
 * - 'stut(n): repeat each event n times; total events = N×k, each slot = 1/(N×k)
 * - 'maybe(p): pass each event with probability p; empty array is ok
 * - 'shuf: shuffle elements once per cycle, then traverse in order
 * - 'pick: pick a random element each slot
 * - 'wran: weighted random selection (uses ? weight syntax per element)
 * - 'legato(n): gate-close time = n × slot
 * - 'offset(ms): shift all event times by ms
 * - 'mono: single synth node; events carry mono:true
 * - transposition: loop [0 2] + 3  adds scalar to each degree before pitch chain
 * - accidentals: 2b, 4# — semitone offset added before scale lookup
 * - line statement: evaluated once, produces fixed event array; 'at sets cycleOffset
 * - FX pipe: loop [0] | fx("lpf") emits FxEvent alongside note events
 *
 * ## Legacy compatibility
 *
 * The original `evaluate(source)` function is preserved unchanged — it wraps
 * createInstance + evaluate in a cyclic JS generator so existing call sites
 * keep working.
 */

import type { CstNode, IToken } from 'chevrotain';
import { FluxLexer } from './lexer.js';
import { parser, preprocessTokens } from './parser.js';
import { SCALES, DEFAULT_SCALE, degreeToMidi } from '../scales.js';
import type { Scale } from '../scales.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CycleContext = {
	cycleNumber: number;
};

export type ScheduledEvent = {
	note: number;
	beatOffset: number; // position within the cycle in beats (0 = cycle start)
	duration: number; // gate-close time in beats (legato × slot)
	cent?: number; // pitch deviation in cents (0 = none)
	cycleOffset?: number; // cycle-level offset (for 'at and 'repeat)
	offsetMs?: number; // ms shift (positive = late, negative = early)
	mono?: boolean; // if true, send set instead of new synth
	type?: 'note' | 'fx'; // 'fx' for FX events
	synthdef?: string; // FX synthdef name (only for type:'fx')
	params?: Record<string, number>; // FX params (only for type:'fx')
};

export type EvalCycleResult =
	| { ok: true; events: ScheduledEvent[]; done: boolean }
	| { ok: false; error: string };

export type EvalInstance =
	| {
			ok: true;
			evaluate: (ctx: CycleContext) => EvalCycleResult;
	  }
	| { ok: false; error: string };

// ---------------------------------------------------------------------------
// ScaleContext — pitch chain parameters
// ---------------------------------------------------------------------------

type ScaleContext = {
	scale: Scale;
	rootSemitone: number; // semitone offset from C (0–11)
	octave: number; // piano octave (default: 5)
	cent: number; // pitch deviation in cents (default: 0)
	mtranspose: number; // modal transposition in scale steps (default: 0)
};

const DEFAULT_SCALE_CONTEXT: ScaleContext = {
	scale: DEFAULT_SCALE,
	rootSemitone: 0,
	octave: 5,
	cent: 0,
	mtranspose: 0
};

/** Compute the MIDI note number for the root (degree 0) from a ScaleContext. */
function contextRootMidi(ctx: ScaleContext): number {
	return 60 + ctx.rootSemitone + (ctx.octave - 5) * 12;
}

/** Apply context to resolve a degree to a MIDI note number. */
function degreeToMidiCtx(degree: number, ctx: ScaleContext): number {
	return degreeToMidi(degree + ctx.mtranspose, contextRootMidi(ctx), ctx.scale);
}

// ---------------------------------------------------------------------------
// Pitch class → semitone
// ---------------------------------------------------------------------------

const PITCH_CLASS_SEMITONE: Record<string, number> = {
	c: 0,
	d: 2,
	e: 4,
	f: 5,
	g: 7,
	a: 9,
	b: 11
};

/**
 * Parse a pitch class string (e.g. "g#", "bb", "C") to a semitone offset (0–11).
 * The letter is case-insensitive. '#' adds 1, 'b' subtracts 1 per character.
 * Returns null if the string is not a recognized pitch class.
 */
function pitchClassToSemitone(image: string): number | null {
	if (!image || image.length === 0) return null;
	const letter = image[0].toLowerCase();
	const base = PITCH_CLASS_SEMITONE[letter];
	if (base === undefined) return null;
	let offset = 0;
	for (let i = 1; i < image.length; i++) {
		if (image[i] === '#') offset += 1;
		else if (image[i] === 'b') offset -= 1;
	}
	return (((base + offset) % 12) + 12) % 12;
}

// ---------------------------------------------------------------------------
// EagerMode
// ---------------------------------------------------------------------------

type EagerMode = { kind: 'lock' } | { kind: 'eager'; period: number }; // period ≥ 1: 1 = per-cycle (default), n = every n cycles

const DEFAULT_MODE: EagerMode = { kind: 'eager', period: 1 };

/** Parse a modifierSuffix CST node into an EagerMode, or return null if it's not a lock/eager modifier. */
function modifierToEagerMode(mod: CstNode): EagerMode | null {
	const nameTok = ((mod.children.Identifier as IToken[]) ?? [])[0];
	if (!nameTok) return null;
	const name = nameTok.image;
	if (name === 'lock') return { kind: 'lock' };
	if (name === 'eager') {
		const genExpr = ((mod.children.generatorExpr as CstNode[]) ?? [])[0];
		if (!genExpr) return { kind: 'eager', period: 1 };
		const period = extractConstantNumber(genExpr);
		// n < 1 is a semantic error — clamp to 1 so the evaluator keeps running;
		// the validator layer (future) will surface this as a user-facing error.
		return { kind: 'eager', period: Math.max(1, Math.round(period ?? 1)) };
	}
	return null;
}

/** Extract an EagerMode from a list of modifierSuffix nodes, or return null if none. */
function extractEagerMode(mods: CstNode[]): EagerMode | null {
	for (const mod of mods) {
		const mode = modifierToEagerMode(mod);
		if (mode) return mode;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Runner
//
// A Runner wraps a raw poll function with cycle-aware caching.
// ---------------------------------------------------------------------------

type PollFn = () => number;

type RunnerState = {
	poll: PollFn;
	mode: EagerMode;
	hasValue: boolean;
	cachedValue: number;
	lastSampledCycle: number;
};

function makeRunner(poll: PollFn, mode: EagerMode): RunnerState {
	return { poll, mode, hasValue: false, cachedValue: 0, lastSampledCycle: -1 };
}

/**
 * Sample a runner for the current event.
 *
 * @param runner     The runner to sample.
 * @param cycle  Current cycle number (from CycleContext).
 */
function sampleRunner(runner: RunnerState, cycle: number): number {
	const { mode } = runner;

	if (mode.kind === 'lock') {
		if (!runner.hasValue) {
			runner.cachedValue = runner.poll();
			runner.hasValue = true;
		}
		return runner.cachedValue;
	}

	// eager(n), n >= 1: poll at cycle start when cycle % period === 0,
	// or on the very first call.
	if (!runner.hasValue || (cycle % mode.period === 0 && cycle !== runner.lastSampledCycle)) {
		runner.cachedValue = runner.poll();
		runner.hasValue = true;
		runner.lastSampledCycle = cycle;
	}
	return runner.cachedValue;
}

// ---------------------------------------------------------------------------
// Constant extraction helper
// ---------------------------------------------------------------------------

/** Extract a constant number from a generatorExpr node (must be a plain numericLiteral). */
function extractConstantNumber(genExpr: CstNode): number | null {
	const atomic = ((genExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
	if (!atomic) return null;
	const numGen = ((atomic.children.numericGenerator as CstNode[]) ?? [])[0];
	if (!numGen) return null;
	const lit = ((numGen.children.numericLiteral as CstNode[]) ?? [])[0];
	if (!lit) return null;
	return litToNumber(lit);
}

// ---------------------------------------------------------------------------
// Step-generator series helpers (stateful, shared with legacy code below)
// ---------------------------------------------------------------------------

function stepSeries(start: number, step: number, length: number): number[] {
	return Array.from({ length }, (_, i) => start + step * i);
}

function mulSeries(start: number, multiplier: number, length: number): number[] {
	return Array.from({ length }, (_, i) => start * Math.pow(multiplier, i));
}

function linSeries(first: number, last: number, length: number): number[] {
	if (length <= 1) return [first];
	return Array.from({ length }, (_, i) => first + (last - first) * (i / (length - 1)));
}

function geoSeries(first: number, last: number, length: number): number[] {
	if (length <= 1) return [first];
	const safeLo = first <= 0 ? Number.EPSILON : first;
	return Array.from({ length }, (_, i) => safeLo * Math.pow(last / safeLo, i / (length - 1)));
}

function gaussSample(mean: number, sdev: number): number {
	const u1 = Math.random() || Number.EPSILON;
	const u2 = Math.random();
	return mean + sdev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function expSample(lo: number, hi: number): number {
	const safeLo = lo <= 0 ? Number.EPSILON : lo;
	return safeLo * Math.pow(hi / safeLo, Math.random());
}

// ---------------------------------------------------------------------------
// CST compilation: numericGenerator → PollFn
// ---------------------------------------------------------------------------

/**
 * Compile a generatorExpr CST node to a raw PollFn, ignoring eager/lock
 * modifiers (those are applied by the Runner layer above). Used to resolve
 * parenthesised sub-generators used as bases, e.g. (-2rand2)step1x4.
 */
function genExprToPollFn(genExpr: CstNode): PollFn | null {
	const atomic = ((genExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
	if (!atomic) return null;
	const numGen = ((atomic.children.numericGenerator as CstNode[]) ?? [])[0];
	if (numGen) return numGenToPollFn(numGen);
	return null; // sequenceGenerators cannot serve as scalar generator bases
}

function numGenToPollFn(numGen: CstNode): PollFn | null {
	// Base: numericLiteral (common path) or parenGenerator (nested sub-generator).
	const lit = ((numGen.children.numericLiteral as CstNode[]) ?? [])[0];
	const parenNode = ((numGen.children.parenGenerator as CstNode[]) ?? [])[0];

	let basePoll: PollFn;
	let baseLit: CstNode | null = null; // kept for the float-bounds check on rand/tilde

	if (lit) {
		const minVal = litToNumber(lit);
		if (minVal === null) return null;
		const fixed = minVal;
		basePoll = () => fixed;
		baseLit = lit;
	} else if (parenNode) {
		const innerGenExpr = ((parenNode.children.generatorExpr as CstNode[]) ?? [])[0];
		if (!innerGenExpr) return null;
		const inner = genExprToPollFn(innerGenExpr);
		if (!inner) return null;
		basePoll = inner;
	} else {
		return null;
	}

	const randNode =
		((numGen.children.randGen as CstNode[]) ?? [])[0] ??
		((numGen.children.tildeGen as CstNode[]) ?? [])[0];
	if (randNode) {
		const maxLit = ((randNode.children.numericLiteral as CstNode[]) ?? [])[0];
		const maxVal = maxLit ? litToNumber(maxLit) : null;
		if (maxVal === null) return basePoll;
		// Float bounds: if either bound is a float literal, use continuous range.
		// Paren bases default to integer (we can't inspect them statically).
		const floatBounds =
			(baseLit ? litIsFloat(baseLit) : false) || (maxLit ? litIsFloat(maxLit) : false);
		if (floatBounds) {
			return () => {
				const base = basePoll();
				return Math.random() * (maxVal - base) + base;
			};
		}
		return () => {
			const base = basePoll();
			return Math.floor(Math.random() * (maxVal - base + 1)) + base;
		};
	}

	const gauNode = ((numGen.children.gauGen as CstNode[]) ?? [])[0];
	if (gauNode) {
		const sdevLit = ((gauNode.children.numericLiteral as CstNode[]) ?? [])[0];
		const sdev = sdevLit ? litToNumber(sdevLit) : null;
		if (sdev === null) return basePoll;
		return () => gaussSample(basePoll(), sdev);
	}

	const expNode = ((numGen.children.expGen as CstNode[]) ?? [])[0];
	if (expNode) {
		const maxLit = ((expNode.children.numericLiteral as CstNode[]) ?? [])[0];
		const maxVal = maxLit ? litToNumber(maxLit) : null;
		if (maxVal === null) return basePoll;
		return () => expSample(basePoll(), maxVal);
	}

	const broNode = ((numGen.children.broGen as CstNode[]) ?? [])[0];
	if (broNode) {
		const lits = (broNode.children.numericLiteral as CstNode[]) ?? [];
		const maxVal = lits[0] ? litToNumber(lits[0]) : null;
		const maxStep = lits[1] ? litToNumber(lits[1]) : null;
		if (maxVal === null) return basePoll;
		const hi = maxVal;
		const step = maxStep ?? 1;
		const lo = basePoll(); // sample base once as the fixed lower bound
		let current = (lo + hi) / 2;
		return () => {
			current += (Math.random() * 2 - 1) * step;
			current = Math.max(lo, Math.min(hi, current));
			return current;
		};
	}

	type DetKey = 'stepGen' | 'mulGen' | 'linGen' | 'geoGen';
	for (const key of ['stepGen', 'mulGen', 'linGen', 'geoGen'] as DetKey[]) {
		const node = ((numGen.children[key] as CstNode[]) ?? [])[0];
		if (!node) continue;
		const lits = (node.children.numericLiteral as CstNode[]) ?? [];
		const arg = lits[0] ? litToNumber(lits[0]) : null;
		const len = lits[1] ? litToNumber(lits[1]) : null;
		if (arg === null || len === null || len < 1) return basePoll;
		const length = Math.round(len);
		// Compute or recompute the series from the current base value.
		// For paren bases the base is re-polled each time the series loops,
		// giving a new start point; for literal bases the value is constant.
		const makeSeries = (start: number): number[] => {
			if (key === 'stepGen') return stepSeries(start, arg, length);
			if (key === 'mulGen') return mulSeries(start, arg, length);
			if (key === 'linGen') return linSeries(start, arg, length);
			return geoSeries(start, arg, length);
		};
		let values = makeSeries(basePoll());
		let idx = 0;
		return () => {
			if (idx > 0 && idx % length === 0) values = makeSeries(basePoll());
			return values[idx++ % length];
		};
	}

	return basePoll;
}

/** Read the numeric value from a numericLiteral CST node. */
function litIsFloat(lit: CstNode): boolean {
	return ((lit.children.Float as IToken[]) ?? []).length > 0;
}

function litToNumber(lit: CstNode): number | null {
	const negative = ((lit.children.Minus as IToken[]) ?? []).length > 0;
	const intTok = ((lit.children.Integer as IToken[]) ?? [])[0];
	const floatTok = ((lit.children.Float as IToken[]) ?? [])[0];
	if (intTok) return (negative ? -1 : 1) * parseInt(intTok.image, 10);
	if (floatTok) return (negative ? -1 : 1) * parseFloat(floatTok.image);
	return null;
}

// ---------------------------------------------------------------------------
// Compiled element: a Runner plus the list-level modifiers already applied
// ---------------------------------------------------------------------------

type CompiledScalar = {
	kind: 'scalar';
	runner: RunnerState;
	/** Accidental semitone offset (0 = none). Applied before scale lookup. */
	accidentalOffset: number;
	/** Per-element weight for 'wran (default: 1). */
	weight: RunnerState;
	/**
	 * Absolute beat offset from cycle start, set by the `@` timing syntax.
	 * When present, overrides the natural uniform-slot position of this element.
	 */
	beatOverride?: number;
};

type CompiledSubsequence = {
	kind: 'sequence';
	elements: CompiledElement[];
	traversal: TraversalMode;
	/** Per-element weight for parent 'wran selection (default: 1). */
	weight: RunnerState;
};

type CompiledElement = CompiledScalar | CompiledSubsequence;

/**
 * Read the `!n` inline-repetition count from a sequenceElement CST node.
 * Returns 1 if no `!` suffix is present.
 */
function repeatCountFromElem(elem: CstNode): number {
	const bangToks = (elem.children.Bang as IToken[]) ?? [];
	if (bangToks.length === 0) return 1;
	const intToks = (elem.children.Integer as IToken[]) ?? [];
	const n = intToks.length > 0 ? parseInt(intToks[0].image, 10) : 1;
	return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Compile a sequenceElement CST node into a CompiledElement.
 *
 * @param elem      The sequenceElement CST node.
 * @param inherited The EagerMode propagated from the containing list.
 */
function compileElement(elem: CstNode, inherited: EagerMode): CompiledElement | null {
	let accidentalOffset = 0;

	// Check for degreeLiteral (integer with accidental suffix)
	const degreeLitNode = ((elem.children.degreeLiteral as CstNode[]) ?? [])[0];
	if (degreeLitNode) {
		const intTok = ((degreeLitNode.children.Integer as IToken[]) ?? [])[0];
		if (!intTok) return null;
		const degree = parseInt(intTok.image, 10);
		// Count sharps and flats
		const sharps = (degreeLitNode.children.Sharp as IToken[]) ?? [];
		const flats = (degreeLitNode.children.Flat as IToken[]) ?? [];
		accidentalOffset += sharps.length;
		for (const f of flats) accidentalOffset -= f.image.length; // 'b' = -1, 'bb' = -2
		// Degree literal has no modifiers — uses inherited mode
		const poll: PollFn = () => degree;
		const weight = makeRunner(() => 1, { kind: 'lock' });
		return { kind: 'scalar', runner: makeRunner(poll, inherited), accidentalOffset, weight };
	}

	// Element-level modifiers come from the generatorExpr's modifierSuffix children.
	const genExpr = ((elem.children.generatorExpr as CstNode[]) ?? [])[0];
	if (!genExpr) return null;

	const elemMods = (genExpr.children.modifierSuffix as CstNode[]) ?? [];
	const elemMode = extractEagerMode(elemMods);

	// Inner annotation (element-level) wins over outer (list-level inherited).
	const effectiveMode: EagerMode = elemMode ?? inherited;

	const atomic = ((genExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
	if (!atomic) return null;

	// Handle nested sequence generator: [1 2] inside [0 4 [1 2]]
	// The sub-list subdivides the parent slot — each sub-element gets slot/n time.
	const seqGen = ((atomic.children.sequenceGenerator as CstNode[]) ?? [])[0];
	if (seqGen) {
		const subListMods = (seqGen.children.modifierSuffix as CstNode[]) ?? [];
		const subListMode = extractEagerMode(subListMods) ?? inherited;
		let subTraversal: TraversalMode = 'seq';
		if (hasModifier(subListMods, 'shuf')) subTraversal = 'shuf';
		else if (hasModifier(subListMods, 'pick')) subTraversal = 'pick';
		else if (hasModifier(subListMods, 'wran')) subTraversal = 'wran';
		const subElemNodes = (seqGen.children.sequenceElement as CstNode[]) ?? [];
		const subElements: CompiledElement[] = [];
		for (const se of subElemNodes) {
			const ce = compileElement(se, subListMode);
			if (!ce) continue;
			const n = repeatCountFromElem(se);
			for (let k = 0; k < n; k++) subElements.push(ce);
		}
		if (subElements.length === 0) return null;
		return {
			kind: 'sequence',
			elements: subElements,
			traversal: subTraversal,
			weight: makeRunner(() => 1, { kind: 'lock' })
		};
	}

	const numGen = ((atomic.children.numericGenerator as CstNode[]) ?? [])[0];
	if (!numGen) return null;

	const poll = numGenToPollFn(numGen);
	if (!poll) return null;

	// Weight from ?expr syntax
	let weight = makeRunner(() => 1, { kind: 'lock' });
	const questionToks = (elem.children.Question as IToken[]) ?? [];
	if (questionToks.length > 0) {
		// Weight is either a numericLiteral child or a generatorExpr child (in parens)
		const weightLit = ((elem.children.numericLiteral as CstNode[]) ?? [])[0];
		const weightGenExpr = ((elem.children.generatorExpr as CstNode[]) ?? [])[1]; // second generatorExpr
		if (weightLit) {
			const w = litToNumber(weightLit) ?? 1;
			weight = makeRunner(() => w, { kind: 'lock' });
		} else if (weightGenExpr) {
			const wAtomic = ((weightGenExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
			const wNumGen = wAtomic ? ((wAtomic.children.numericGenerator as CstNode[]) ?? [])[0] : null;
			const wPoll = wNumGen ? numGenToPollFn(wNumGen) : null;
			const wMods = (weightGenExpr.children.modifierSuffix as CstNode[]) ?? [];
			const wMode = extractEagerMode(wMods) ?? { kind: 'lock' };
			if (wPoll) weight = makeRunner(wPoll, wMode);
		}
	}

	return { kind: 'scalar', runner: makeRunner(poll, effectiveMode), accidentalOffset, weight };
}

// ---------------------------------------------------------------------------
// Decorator argument extraction
// ---------------------------------------------------------------------------

/**
 * A CompiledDecoratorArg is a runner that, when sampled, yields the numeric
 * value for a decorator parameter (e.g. root semitone, octave integer).
 * For constant arguments this is a trivial runner; for stochastic ones it
 * respects 'lock / 'eager(n) semantics.
 */
type CompiledDecoratorArg = RunnerState;

/**
 * Compile a numericGenerator CST node into a decorator argument runner.
 * Decorator arguments use 'lock as their default (per spec: stochastic
 * decorator arguments are opt-in for variation; frozen is the sensible default).
 */
function compileDecoratorNumericArg(numGen: CstNode, mods: CstNode[]): CompiledDecoratorArg {
	const poll = numGenToPollFn(numGen) ?? (() => 0);
	// For decorators, 'lock is the default (not eager(1))
	const mode = extractEagerMode(mods) ?? { kind: 'lock' };
	return makeRunner(poll, mode);
}

// ---------------------------------------------------------------------------
// ScaleContext building from decorator CST nodes
// ---------------------------------------------------------------------------

/**
 * Merge decorator arguments into a ScaleContext, returning a modified copy.
 * Handles:
 *   @scale(name)         — scale name string or identifier
 *   @root(n)             — semitone integer
 *   @octave(n)           — octave integer
 *   @cent(n)             — cent offset
 *   @mtranspose(n)       — modal transposition steps
 *   @key(pitchClass scaleName [octave])  — compound
 */
function applyDecoratorToContext(
	decoratorNode: CstNode,
	ctx: ScaleContext,
	cycle: number
): ScaleContext {
	const nameTok = ((decoratorNode.children.Identifier as IToken[]) ?? [])[0];
	if (!nameTok) return ctx;
	const name = nameTok.image;

	const args = (decoratorNode.children.decoratorArg as CstNode[]) ?? [];

	if (name === 'key') {
		return applyKeyDecorator(args, ctx, cycle);
	}

	// Single-argument decorators: @scale, @root, @octave, @cent, @mtranspose
	const arg = args[0];
	if (!arg) return ctx;

	if (name === 'scale') {
		const scaleName = extractScaleNameFromArg(arg);
		if (scaleName && SCALES[scaleName]) {
			return { ...ctx, scale: SCALES[scaleName] };
		}
		return ctx;
	}

	// Numeric argument decorators
	const numGen = ((arg.children.numericGenerator as CstNode[]) ?? [])[0];
	if (!numGen) return ctx;

	// Collect modifier suffixes that may appear on the generatorExpr containing numGen
	const genExpr = ((arg.children.generatorExpr as CstNode[]) ?? [])[0];
	const mods = genExpr ? ((genExpr.children.modifierSuffix as CstNode[]) ?? []) : [];
	const runner = compileDecoratorNumericArg(numGen, mods);
	const value = Math.round(sampleRunner(runner, cycle));

	switch (name) {
		case 'root':
			return { ...ctx, rootSemitone: ((value % 12) + 12) % 12 };
		case 'octave':
			return { ...ctx, octave: value };
		case 'cent':
			// cent is not rounded — it's a float offset
			return { ...ctx, cent: sampleRunner(compileDecoratorNumericArg(numGen, mods), cycle) };
		case 'mtranspose':
			return { ...ctx, mtranspose: value };
		default:
			return ctx;
	}
}

/**
 * Extract a scale name from a decoratorArg node.
 * Scale names appear as Identifier tokens or StringLiteral tokens.
 */
function extractScaleNameFromArg(arg: CstNode): string | null {
	// Identifier (e.g. minor, lydian, major_pentatonic)
	const idTok = ((arg.children.Identifier as IToken[]) ?? [])[0];
	if (idTok) return idTok.image;

	// StringLiteral (e.g. "minor") — strip surrounding quotes
	const strTok = ((arg.children.StringLiteral as IToken[]) ?? [])[0];
	if (strTok) return strTok.image.slice(1, -1);

	return null;
}

/**
 * Apply @key(pitchClass scaleName [octave]) to a ScaleContext.
 * Args order: pitchClass first, then scaleName, then optional octave integer.
 */
function applyKeyDecorator(args: CstNode[], ctx: ScaleContext, cycle: number): ScaleContext {
	let result = { ...ctx };
	let argIdx = 0;

	// 1. pitchClass — may be a pitchClass CST node (single-char) or an Identifier
	//    (e.g. "bb", "eb") when the parser's isPitchClass() gate rejected it.
	if (argIdx < args.length) {
		const arg = args[argIdx];
		const pitchClassNode = ((arg.children.pitchClass as CstNode[]) ?? [])[0];
		if (pitchClassNode) {
			const semitone = extractPitchClassSemitone(pitchClassNode);
			if (semitone !== null) {
				result = { ...result, rootSemitone: semitone };
			}
			argIdx++;
		} else {
			// Try parsing the Identifier or StringLiteral as a raw pitch class string
			// (e.g. "bb" = Bb, "eb" = Eb). This handles multi-char pitch classes that
			// the parser's isPitchClass gate rejected because img.length > 1.
			const idTok = ((arg.children.Identifier as IToken[]) ?? [])[0];
			if (idTok && /^[a-gA-G][#b]*$/.test(idTok.image)) {
				const semitone = pitchClassToSemitone(idTok.image);
				if (semitone !== null) {
					result = { ...result, rootSemitone: semitone };
					argIdx++;
				}
			}
		}
	}

	// 2. scaleName
	if (argIdx < args.length) {
		const arg = args[argIdx];
		const scaleName = extractScaleNameFromArg(arg);
		if (scaleName && SCALES[scaleName]) {
			result = { ...result, scale: SCALES[scaleName] };
			argIdx++;
		}
	}

	// 3. optional octave integer
	if (argIdx < args.length) {
		const arg = args[argIdx];
		const numGen = ((arg.children.numericGenerator as CstNode[]) ?? [])[0];
		if (numGen) {
			const mods: CstNode[] = [];
			const runner = compileDecoratorNumericArg(numGen, mods);
			const value = Math.round(sampleRunner(runner, cycle));
			result = { ...result, octave: value };
		}
	}

	return result;
}

/**
 * Extract the semitone value from a pitchClass CST node.
 * pitchClass = Identifier (e.g. "g") + optional Sharp/Flat
 */
function extractPitchClassSemitone(pitchClassNode: CstNode): number | null {
	const idTok = ((pitchClassNode.children.Identifier as IToken[]) ?? [])[0];
	if (!idTok) return null;

	let image = idTok.image;

	// Accidentals may appear as Sharp or Flat tokens on the pitchClass node
	const sharps = (pitchClassNode.children.Sharp as IToken[]) ?? [];
	const flats = (pitchClassNode.children.Flat as IToken[]) ?? [];

	for (const s of sharps) image += s.image; // '#'
	for (const f of flats) image += f.image; // 'b' or 'bb'

	return pitchClassToSemitone(image);
}

// ---------------------------------------------------------------------------
// setStatement argument extraction
// ---------------------------------------------------------------------------

/**
 * Apply a setStatement CST node to a ScaleContext (the global context).
 * set statements use the same arg syntax as decorators.
 */
function applySetStatement(setNode: CstNode, ctx: ScaleContext, cycle: number): ScaleContext {
	const nameTok = ((setNode.children.Identifier as IToken[]) ?? [])[0];
	if (!nameTok) return ctx;

	// Build a synthetic decorator-like node structure by reusing applyDecoratorToContext.
	// The setStatement has the same children structure as a decorator (Identifier + decoratorArg[])
	return applyDecoratorToContext(setNode, ctx, cycle);
}

// ---------------------------------------------------------------------------
// Modifier extraction helpers for phase 6d
// ---------------------------------------------------------------------------

/** Get the effective modifier name from a modifierSuffix node.
 * Handles both direct (Tick + Identifier) and atModifier sub-node cases.
 */
function getModifierName(mod: CstNode): string | null {
	// Direct Identifier on mod
	const directId = ((mod.children.Identifier as IToken[]) ?? [])[0];
	if (directId) return directId.image;
	// atModifier sub-node
	const atMod = ((mod.children.atModifier as CstNode[]) ?? [])[0];
	if (atMod) {
		const atId = ((atMod.children.Identifier as IToken[]) ?? [])[0];
		if (atId) return atId.image;
	}
	return null;
}

/** Extract the first modifier with a given name from a list, returning its generatorExpr (or null). */
function findModifier(mods: CstNode[], name: string): CstNode | null {
	for (const mod of mods) {
		if (getModifierName(mod) === name) {
			return ((mod.children.generatorExpr as CstNode[]) ?? [])[0] ?? null;
		}
	}
	return null;
}

/** Check if a modifier with a given name exists. */
function hasModifier(mods: CstNode[], name: string): boolean {
	return mods.some((mod) => getModifierName(mod) === name);
}

/** Extract a scalar number from a modifierSuffix's generatorExpr, with a default. */
function extractModifierScalar(
	mods: CstNode[],
	name: string,
	defaultVal: number,
	cycle: number,
	defaultMode: EagerMode = DEFAULT_MODE
): RunnerState {
	const genExpr = findModifier(mods, name);
	if (!genExpr) return makeRunner(() => defaultVal, defaultMode);

	const modMods = (genExpr.children.modifierSuffix as CstNode[]) ?? [];
	const mode = extractEagerMode(modMods) ?? defaultMode;

	const atomic = ((genExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
	if (!atomic) return makeRunner(() => defaultVal, mode);

	const numGen = ((atomic.children.numericGenerator as CstNode[]) ?? [])[0];
	if (!numGen) return makeRunner(() => defaultVal, mode);

	const poll = numGenToPollFn(numGen) ?? (() => defaultVal);
	return makeRunner(poll, mode);
}

/**
 * Extract the 'at(timeExpr) offset as a fractional cycle value.
 * Returns 0 if no 'at modifier is present.
 *
 * Two cases:
 * 1. Inline modifier: modifierSuffix { atModifier { Tick, Identifier("at"), LParen, atTimeExpr, RParen } }
 * 2. Continuation modifier: continuationModifier { Tick, Identifier("at"), LParen, generatorExpr, RParen }
 *    (continuationModifier uses generatorExpr, which only supports integers, not fractions)
 */
function extractAtOffset(mods: CstNode[]): number {
	for (const mod of mods) {
		// Case 1: inline 'at via atModifier sub-rule
		const atModNode = ((mod.children.atModifier as CstNode[]) ?? [])[0];
		if (atModNode) {
			const nameTok = ((atModNode.children.Identifier as IToken[]) ?? [])[0];
			if (nameTok?.image !== 'at') continue;

			const atTimeExpr = ((atModNode.children.atTimeExpr as CstNode[]) ?? [])[0];
			if (!atTimeExpr) return 0;

			const negative = ((atTimeExpr.children.Minus as IToken[]) ?? []).length > 0;
			const intToks = (atTimeExpr.children.Integer as IToken[]) ?? [];
			if (intToks.length === 0) return 0;

			const num = parseInt(intToks[0].image, 10);
			const denom = intToks[1] ? parseInt(intToks[1].image, 10) : 1;
			const value = num / denom;
			return negative ? -value : value;
		}

		// Case 2: continuation 'at via generatorExpr (integers only)
		const nameTok = ((mod.children.Identifier as IToken[]) ?? [])[0];
		if (nameTok?.image !== 'at') continue;

		const genExpr = ((mod.children.generatorExpr as CstNode[]) ?? [])[0];
		if (!genExpr) return 0;
		const n = extractConstantNumber(genExpr);
		return n ?? 0;
	}
	return 0;
}

/**
 * Extract 'repeat(n) value. Returns:
 *   null   — no 'repeat modifier
 *   0      — bare 'repeat (indefinite)
 *   n      — explicit count
 */
function extractRepeat(mods: CstNode[]): number | null {
	for (const mod of mods) {
		const nameTok = ((mod.children.Identifier as IToken[]) ?? [])[0];
		if (nameTok?.image !== 'repeat') continue;
		const genExpr = ((mod.children.generatorExpr as CstNode[]) ?? [])[0];
		if (!genExpr) return 0; // bare 'repeat = indefinite
		const n = extractConstantNumber(genExpr);
		return n !== null ? Math.max(1, Math.round(n)) : 0;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Transposition extraction
// ---------------------------------------------------------------------------

type CompiledTransposition = {
	sign: 1 | -1;
	runner: RunnerState;
} | null;

function compileTransposition(loopOrLineNode: CstNode): CompiledTransposition {
	const transpNode = ((loopOrLineNode.children.transposition as CstNode[]) ?? [])[0];
	if (!transpNode) return null;

	const plusToks = (transpNode.children.Plus as IToken[]) ?? [];
	const sign: 1 | -1 = plusToks.length > 0 ? 1 : -1;

	const posScalar = ((transpNode.children.positiveScalar as CstNode[]) ?? [])[0];
	if (!posScalar) return null;

	// posScalar = (parenGenerator | positiveNumericGenerator) + modifierSuffix*
	const scalarMods = (posScalar.children.modifierSuffix as CstNode[]) ?? [];
	const mode = extractEagerMode(scalarMods) ?? DEFAULT_MODE;

	// Try positiveNumericGenerator
	const posNumGen = ((posScalar.children.positiveNumericGenerator as CstNode[]) ?? [])[0];
	if (posNumGen) {
		// positiveNumericGenerator has Float | Integer at top level (no Minus)
		const intTok = ((posNumGen.children.Integer as IToken[]) ?? [])[0];
		const floatTok = ((posNumGen.children.Float as IToken[]) ?? [])[0];
		let baseVal: number | null = null;
		if (intTok) baseVal = parseInt(intTok.image, 10);
		else if (floatTok) baseVal = parseFloat(floatTok.image);

		if (baseVal === null) return null;

		// Check for generator suffix (rand, gau, etc.) — reuse numericGenerator compilation
		// by constructing a synthetic numericGenerator-like node from the positiveNumericGenerator
		const syntheticNumGen: CstNode = {
			name: 'numericGenerator',
			children: {
				numericLiteral: [
					{
						name: 'numericLiteral',
						children: {
							Integer: intTok ? [intTok] : [],
							Float: floatTok ? [floatTok] : [],
							Minus: []
						}
					}
				],
				randGen: posNumGen.children.randGen ?? [],
				tildeGen: posNumGen.children.tildeGen ?? [],
				gauGen: posNumGen.children.gauGen ?? [],
				expGen: posNumGen.children.expGen ?? [],
				broGen: posNumGen.children.broGen ?? [],
				stepGen: posNumGen.children.stepGen ?? [],
				mulGen: posNumGen.children.mulGen ?? [],
				linGen: posNumGen.children.linGen ?? [],
				geoGen: posNumGen.children.geoGen ?? []
			}
		};
		const poll = numGenToPollFn(syntheticNumGen) ?? (() => baseVal!);
		return { sign, runner: makeRunner(poll, mode) };
	}

	return null;
}

// ---------------------------------------------------------------------------
// Loop compilation
// ---------------------------------------------------------------------------

/** List-level traversal modifier. */
type TraversalMode = 'seq' | 'shuf' | 'pick' | 'wran';

type CompiledLoop = {
	elements: CompiledElement[];
	listMode: EagerMode; // mode from list-level modifiers (inherited by elements)
	traversal: TraversalMode;
	stutRunner: RunnerState | null; // null = no stutter
	maybeRunner: RunnerState | null; // null = no maybe filter
	legatoRunner: RunnerState | null; // null = default legato (1.0)
	offsetRunner: RunnerState | null; // null = no offset
	mono: boolean;
	atOffset: number; // cycle offset from 'at modifier
	repeat: number | null; // null = no repeat, 0 = infinite, n = count
	transposition: CompiledTransposition;
	fx: CompiledFx | null; // compiled FX (stateful runners; null = no FX)
};

/** Collect all modifiers from the loop/line node itself plus continuation block.
 *
 * Parser structure: modifiers written after [...] are consumed by sequenceExpr's
 * MANY2, not by loopStatement's MANY. So we must look in sequenceExpr or
 * relTimedList as well as on the loop node itself.
 * Continuation modifiers are found as continuationModifier children on the loop node.
 */
function collectLoopModifiers(loopNode: CstNode): CstNode[] {
	// Modifiers on the sequenceExpr (written directly after [...])
	const seqNode =
		((loopNode.children.sequenceExpr as CstNode[]) ?? [])[0] ??
		((loopNode.children.relTimedList as CstNode[]) ?? [])[0];
	const seqMods = seqNode ? ((seqNode.children.modifierSuffix as CstNode[]) ?? []) : [];

	// Any modifier suffixes directly on the loop statement (rare — after transposition etc.)
	const directMods = (loopNode.children.modifierSuffix as CstNode[]) ?? [];

	// Continuation modifiers (from INDENT block)
	const contMods = (loopNode.children.continuationModifier as CstNode[]) ?? [];

	return [...seqMods, ...directMods, ...contMods];
}

function compileLoop(loopNode: CstNode): CompiledLoop | string {
	const seqNode = (
		(loopNode.children.sequenceExpr ?? loopNode.children.sequenceGenerator) as CstNode[] | undefined
	)?.[0];
	if (!seqNode) return 'loop has no sequence body';

	// List-level modifiers (on the [...] itself)
	const listMods = (seqNode.children.modifierSuffix as CstNode[]) ?? [];
	const listMode = extractEagerMode(listMods) ?? DEFAULT_MODE;

	// Traversal mode
	let traversal: TraversalMode = 'seq';
	if (hasModifier(listMods, 'shuf')) traversal = 'shuf';
	else if (hasModifier(listMods, 'pick')) traversal = 'pick';
	else if (hasModifier(listMods, 'wran')) traversal = 'wran';

	const elements = (seqNode.children.sequenceElement as CstNode[]) ?? [];
	const compiled: CompiledElement[] = [];
	for (const elem of elements) {
		const ce = compileElement(elem, listMode);
		if (!ce) continue;
		const n = repeatCountFromElem(elem);
		for (let k = 0; k < n; k++) compiled.push(ce);
	}

	if (compiled.length === 0) return 'loop sequence is empty';

	// Loop-level modifiers (direct + continuation)
	const allLoopMods = collectLoopModifiers(loopNode);

	// 'stut
	let stutRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'stut')) {
		stutRunner = extractModifierScalar(allLoopMods, 'stut', 2, 0);
	}

	// 'maybe
	let maybeRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'maybe')) {
		maybeRunner = extractModifierScalar(allLoopMods, 'maybe', 0.5, 0);
	}

	// 'legato
	let legatoRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'legato')) {
		legatoRunner = extractModifierScalar(allLoopMods, 'legato', 1.0, 0);
	}

	// 'offset
	let offsetRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'offset')) {
		offsetRunner = extractModifierScalar(allLoopMods, 'offset', 0, 0);
	}

	// 'mono
	const mono = hasModifier(allLoopMods, 'mono');

	// 'at
	const atOffset = extractAtOffset(allLoopMods);

	// 'repeat
	const repeat = extractRepeat(allLoopMods);

	// Transposition
	const transposition = compileTransposition(loopNode);

	// FX pipe
	const pipeNode = ((loopNode.children.pipeExpr as CstNode[]) ?? [])[0];
	const rawFxNode = pipeNode ? (((pipeNode.children.fxExpr as CstNode[]) ?? [])[0] ?? null) : null;
	const fx = rawFxNode ? compileFxNode(rawFxNode) : null;

	return {
		elements: compiled,
		listMode,
		traversal,
		stutRunner,
		maybeRunner,
		legatoRunner,
		offsetRunner,
		mono,
		atOffset,
		repeat,
		transposition,
		fx
	};
}

// ---------------------------------------------------------------------------
// Line compilation (mirrors loop but also handles relTimedList)
// ---------------------------------------------------------------------------

function compileLine(lineNode: CstNode): CompiledLoop | string {
	// lineStatement may use sequenceExpr or relTimedList (timedList with optional @ per element)
	const seqNode = ((lineNode.children.sequenceExpr as CstNode[]) ?? [])[0];
	const relNode = ((lineNode.children.relTimedList as CstNode[]) ?? [])[0];

	const bodyNode = seqNode ?? relNode;
	if (!bodyNode) return 'line has no body';

	// List-level modifiers
	const listMods = (bodyNode.children.modifierSuffix as CstNode[]) ?? [];
	const listMode = extractEagerMode(listMods) ?? DEFAULT_MODE;

	let traversal: TraversalMode = 'seq';
	if (hasModifier(listMods, 'shuf')) traversal = 'shuf';
	else if (hasModifier(listMods, 'pick')) traversal = 'pick';
	else if (hasModifier(listMods, 'wran')) traversal = 'wran';

	const compiled: CompiledElement[] = [];

	if (seqNode) {
		const elems = (seqNode.children.sequenceElement as CstNode[]) ?? [];
		for (const elem of elems) {
			const ce = compileElement(elem, listMode);
			if (!ce) continue;
			const n = repeatCountFromElem(elem);
			for (let k = 0; k < n; k++) compiled.push(ce);
		}
	} else if (relNode) {
		const elems = (relNode.children.timedElement as CstNode[]) ?? [];
		for (const elem of elems) {
			const ce = compileTimedElement(elem, listMode);
			if (ce) compiled.push(ce);
		}
	}

	if (compiled.length === 0) return 'line sequence is empty';

	const allLoopMods = collectLoopModifiers(lineNode);

	let stutRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'stut')) {
		stutRunner = extractModifierScalar(allLoopMods, 'stut', 2, 0);
	}
	let maybeRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'maybe')) {
		maybeRunner = extractModifierScalar(allLoopMods, 'maybe', 0.5, 0);
	}
	let legatoRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'legato')) {
		legatoRunner = extractModifierScalar(allLoopMods, 'legato', 1.0, 0);
	}
	let offsetRunner: RunnerState | null = null;
	if (hasModifier(allLoopMods, 'offset')) {
		offsetRunner = extractModifierScalar(allLoopMods, 'offset', 0, 0);
	}

	const mono = hasModifier(allLoopMods, 'mono');
	const atOffset = extractAtOffset(allLoopMods);
	const repeat = extractRepeat(allLoopMods);
	const transposition = compileTransposition(lineNode);

	const pipeNode = ((lineNode.children.pipeExpr as CstNode[]) ?? [])[0];
	const rawFxNode = pipeNode ? (((pipeNode.children.fxExpr as CstNode[]) ?? [])[0] ?? null) : null;
	const fx = rawFxNode ? compileFxNode(rawFxNode) : null;

	return {
		elements: compiled,
		listMode,
		traversal,
		stutRunner,
		maybeRunner,
		legatoRunner,
		offsetRunner,
		mono,
		atOffset,
		repeat,
		transposition,
		fx
	};
}

/** Parse a timeExpr CST node into a cycle-position value (>= 0). */
function extractTimeExpr(timeNode: CstNode): number {
	const floatToks = (timeNode.children.Float as IToken[]) ?? [];
	if (floatToks.length > 0) return parseFloat(floatToks[0].image);
	const intToks = (timeNode.children.Integer as IToken[]) ?? [];
	if (intToks.length === 0) return 0;
	const num = parseInt(intToks[0].image, 10);
	const denom = intToks[1] ? parseInt(intToks[1].image, 10) : 1;
	return num / denom;
}

function compileTimedElement(elem: CstNode, inherited: EagerMode): CompiledElement | null {
	const intTok = ((elem.children.Integer as IToken[]) ?? [])[0];
	if (!intTok) return null;
	const degree = parseInt(intTok.image, 10);
	const sharps = (elem.children.Sharp as IToken[]) ?? [];
	const flats = (elem.children.Flat as IToken[]) ?? [];
	let accidentalOffset = 0;
	accidentalOffset += sharps.length;
	for (const f of flats) accidentalOffset -= f.image.length;
	const weight = makeRunner(() => 1, { kind: 'lock' });
	const timeNode = ((elem.children.timeExpr as CstNode[]) ?? [])[0];
	const beatOverride = timeNode !== undefined ? extractTimeExpr(timeNode) : undefined;
	return {
		kind: 'scalar',
		runner: makeRunner(() => degree, inherited),
		accidentalOffset,
		weight,
		...(beatOverride !== undefined && { beatOverride })
	};
}

// ---------------------------------------------------------------------------
// FX compilation (compile once, evaluate per cycle)
// ---------------------------------------------------------------------------

type CompiledFx = {
	synthdef: string;
	paramRunners: Array<{ name: string; runner: RunnerState }>;
};

function compileFxNode(fxNode: CstNode): CompiledFx {
	const strTok = ((fxNode.children.StringLiteral as IToken[]) ?? [])[0];
	const synthdef = strTok ? strTok.image.slice(1, -1) : 'unknown';

	const mods = (fxNode.children.modifierSuffix as CstNode[]) ?? [];
	const paramRunners: Array<{ name: string; runner: RunnerState }> = [];

	for (const mod of mods) {
		const nameTok = ((mod.children.Identifier as IToken[]) ?? [])[0];
		if (!nameTok) continue;
		const paramName = nameTok.image;
		if (paramName === 'lock' || paramName === 'eager') continue;

		const genExpr = ((mod.children.generatorExpr as CstNode[]) ?? [])[0];
		if (!genExpr) continue;

		const genMods = (genExpr.children.modifierSuffix as CstNode[]) ?? [];
		const mode = extractEagerMode(genMods) ?? DEFAULT_MODE;
		const atomic = ((genExpr.children.atomicGenerator as CstNode[]) ?? [])[0];
		if (!atomic) continue;
		const numGen = ((atomic.children.numericGenerator as CstNode[]) ?? [])[0];
		if (!numGen) continue;
		const poll = numGenToPollFn(numGen);
		if (!poll) continue;
		paramRunners.push({ name: paramName, runner: makeRunner(poll, mode) });
	}

	return { synthdef, paramRunners };
}

function evaluateFxEvent(compiledFx: CompiledFx, cycle: number, atOffset: number): ScheduledEvent {
	const params: Record<string, number> = {};
	for (const { name, runner } of compiledFx.paramRunners) {
		params[name] = sampleRunner(runner, cycle);
	}
	return {
		note: 0,
		beatOffset: 0,
		duration: 0,
		type: 'fx',
		synthdef: compiledFx.synthdef,
		params,
		cycleOffset: atOffset // always present on FX events
	};
}

// ---------------------------------------------------------------------------
// Evaluate a compiled loop/line for one cycle
// ---------------------------------------------------------------------------

/** Apply traversal strategy to an element array, returning the ordered sequence. */
function orderedSubElements(
	elements: CompiledElement[],
	traversal: TraversalMode,
	cycle: number
): CompiledElement[] {
	if (traversal === 'pick') {
		return elements.map(() => elements[Math.floor(Math.random() * elements.length)]);
	} else if (traversal === 'shuf') {
		const arr = [...elements];
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	} else if (traversal === 'wran') {
		return elements.map(() => {
			const weights = elements.map((el) => Math.max(0, sampleRunner(el.weight, cycle)));
			const total = weights.reduce((a, b) => a + b, 0);
			if (total === 0) return elements[0];
			let r = Math.random() * total;
			for (let i = 0; i < elements.length; i++) {
				r -= weights[i];
				if (r <= 0) return elements[i];
			}
			return elements[elements.length - 1];
		});
	}
	return elements; // 'seq
}

type SlotParams = {
	legato: number;
	cycle: number;
	scaleCtx: ScaleContext;
	transposeDelta: number;
	mono: boolean;
	offsetMs: number | undefined;
	cycleOff: number;
};

/**
 * Expand a single CompiledElement slot into ScheduledEvent[].
 * Scalar elements produce one event; subsequences subdivide the slot recursively.
 */
function expandSlot(
	el: CompiledElement,
	slotStart: number,
	slotDuration: number,
	p: SlotParams
): ScheduledEvent[] {
	if (el.kind === 'sequence') {
		const ordered = orderedSubElements(el.elements, el.traversal, p.cycle);
		if (ordered.length === 0) return [];
		const subSlot = slotDuration / ordered.length;
		const out: ScheduledEvent[] = [];
		for (let j = 0; j < ordered.length; j++) {
			out.push(...expandSlot(ordered[j], slotStart + j * subSlot, subSlot, p));
		}
		return out;
	}
	// scalar
	const rawDegree = sampleRunner(el.runner, p.cycle);
	const note = degreeToMidiCtx(rawDegree + p.transposeDelta, p.scaleCtx) + el.accidentalOffset;
	const beatOffset = el.beatOverride !== undefined ? el.beatOverride : slotStart;
	const event: ScheduledEvent = {
		note,
		beatOffset,
		duration: slotDuration * p.legato
	};
	if (p.scaleCtx.cent !== 0) event.cent = p.scaleCtx.cent;
	if (p.offsetMs !== undefined && p.offsetMs !== 0) event.offsetMs = p.offsetMs;
	if (p.mono) event.mono = true;
	if (p.cycleOff !== 0) event.cycleOffset = p.cycleOff;
	return [event];
}

/**
 * Produce ScheduledEvent[] from a compiled loop for a given cycle.
 * Handles 'stut, 'maybe, traversal, 'legato, 'offset, 'mono, transposition, accidentals, FX.
 */
function evaluateCompiledLoop(
	compiled: CompiledLoop,
	scaleCtx: ScaleContext,
	cycle: number,
	isLine: boolean
): { events: ScheduledEvent[]; done: boolean } {
	const { elements, stutRunner, maybeRunner, legatoRunner, offsetRunner, mono, atOffset, repeat } =
		compiled;

	// Sample stutter count once per cycle
	const stutCount = stutRunner ? Math.max(1, Math.round(sampleRunner(stutRunner, cycle))) : 1;

	// Sample legato once per cycle
	const legato = legatoRunner ? sampleRunner(legatoRunner, cycle) : 1.0;

	// Sample offset once per cycle
	const offsetMs = offsetRunner ? sampleRunner(offsetRunner, cycle) : undefined;

	// Sample maybe probability once per cycle
	const maybeProb = maybeRunner ? sampleRunner(maybeRunner, cycle) : null;

	// Sample transposition once per cycle
	let transposeDelta = 0;
	if (compiled.transposition) {
		const { sign, runner } = compiled.transposition;
		transposeDelta = sign * sampleRunner(runner, cycle);
	}

	// Determine the ordered sequence of elements (traversal strategy)
	const orderedElements = orderedSubElements(elements, compiled.traversal, cycle);

	// Apply 'stut: expand each element into stutCount copies
	const expandedElements: CompiledElement[] = [];
	for (const el of orderedElements) {
		for (let s = 0; s < stutCount; s++) {
			expandedElements.push(el);
		}
	}

	const n = expandedElements.length;
	const slotDuration = 1 / n;
	const events: ScheduledEvent[] = [];

	// Determine repeat count for cycleOffset calculation
	const repeatCount = repeat === null ? 1 : repeat === 0 ? Infinity : repeat;

	// For a line, check if this cycle is past the last scheduled cycle.
	// A line occupies cycles [atOffset, atOffset + repeatCount). If cycle >= atOffset + repeatCount
	// the line is done and should produce no events.
	if (isLine && cycle >= atOffset + (repeatCount === Infinity ? Infinity : repeatCount)) {
		return { events: [], done: true };
	}

	for (let rep = 0; rep < (isLine ? Math.min(repeatCount, 999) : 1); rep++) {
		const cycleOff = atOffset + rep;
		for (let i = 0; i < n; i++) {
			// Apply 'maybe filter
			if (maybeProb !== null && Math.random() >= maybeProb) continue;

			const el = expandedElements[i];
			events.push(
				...expandSlot(el, i * slotDuration, slotDuration, {
					legato,
					cycle,
					scaleCtx,
					transposeDelta,
					mono,
					offsetMs,
					cycleOff
				})
			);
		}
	}

	// FX event
	if (compiled.fx) {
		events.push(evaluateFxEvent(compiled.fx, cycle, atOffset));
	}

	// Sort by beatOffset so the scheduler always sees non-decreasing times.
	// @ overrides can place events out of source order; negative gaps would
	// cause them to fire simultaneously or in the wrong order.
	events.sort((a, b) => a.beatOffset - b.beatOffset);

	return { events, done: false };
}

// ---------------------------------------------------------------------------
// Decorator block evaluation — recursively walk and evaluate
// ---------------------------------------------------------------------------

/**
 * Walk a decoratorBlock CST node once at compile time, returning pre-compiled
 * loops paired with the decorator CST nodes needed to build the ScaleContext
 * at evaluate time. Runner state is owned by the compiled loops and persists
 * across cycles; only the ScaleContext is rebuilt per cycle.
 */
type CompiledDecoratedLoop = {
	compiled: CompiledLoop;
	isLine: boolean;
	/** Ordered list of decorator node arrays, outer → inner, to apply at evaluate time. */
	decoratorLayers: CstNode[][];
};

function compileDecoratorBlock(
	blockNode: CstNode,
	outerLayers: CstNode[][]
): CompiledDecoratedLoop[] {
	const decorators = (blockNode.children.decorator as CstNode[]) ?? [];
	const layers = [...outerLayers, decorators];
	const results: CompiledDecoratedLoop[] = [];

	const loopNodes = (blockNode.children.loopStatement as CstNode[]) ?? [];
	for (const ln of loopNodes) {
		const compiled = compileLoop(ln);
		if (typeof compiled !== 'string') {
			results.push({ compiled, isLine: false, decoratorLayers: layers });
		}
	}

	const lineNodes = (blockNode.children.lineStatement as CstNode[]) ?? [];
	for (const ln of lineNodes) {
		const compiled = compileLine(ln);
		if (typeof compiled !== 'string') {
			results.push({ compiled, isLine: true, decoratorLayers: layers });
		}
	}

	const nestedBlocks = (blockNode.children.decoratorBlock as CstNode[]) ?? [];
	for (const nb of nestedBlocks) {
		results.push(...compileDecoratorBlock(nb, layers));
	}

	return results;
}

/**
 * Resolve decorator layers into a ScaleContext at evaluate time.
 * Each layer is a list of decorator nodes at one nesting level, applied in order.
 */
function resolveDecoratorContext(
	layers: CstNode[][],
	globalCtx: ScaleContext,
	cycleNumber: number
): ScaleContext {
	let ctx = globalCtx;
	for (const layer of layers) {
		for (const dec of layer) {
			ctx = applyDecoratorToContext(dec, ctx, cycleNumber);
		}
	}
	return ctx;
}

// ---------------------------------------------------------------------------
// createInstance — public entry point
// ---------------------------------------------------------------------------

export function createInstance(source: string): EvalInstance {
	const { tokens, errors: lexErrors } = FluxLexer.tokenize(source);
	if (lexErrors.length > 0) {
		return { ok: false, error: `Lex error: ${lexErrors[0].message}` };
	}

	parser.input = preprocessTokens(tokens, source);
	const cst = parser.program();
	if (parser.errors.length > 0) {
		return { ok: false, error: `Parse error: ${parser.errors[0].message}` };
	}

	// ---------------------------------------------------------------------------
	// Compile phase: find all statements, partition into sets and loops.
	// The scale context is built lazily at evaluate() time from set nodes and
	// decorator blocks so that stochastic decorator args respect cycle semantics.
	// ---------------------------------------------------------------------------

	const statements = (cst.children.statement ?? []) as CstNode[];

	type LoopEntry =
		| { kind: 'plain'; compiled: CompiledLoop; isLine: boolean }
		| { kind: 'decorated'; compiled: CompiledLoop; isLine: boolean; decoratorLayers: CstNode[][] };

	const setNodes: CstNode[] = [];
	const loopEntries: LoopEntry[] = [];

	for (const stmt of statements) {
		const loopNodes = stmt.children.loopStatement as CstNode[] | undefined;
		if (loopNodes?.length) {
			const compiled = compileLoop(loopNodes[0]);
			if (typeof compiled !== 'string') {
				loopEntries.push({ kind: 'plain', compiled, isLine: false });
			}
			continue;
		}

		const lineNodes = stmt.children.lineStatement as CstNode[] | undefined;
		if (lineNodes?.length) {
			const compiled = compileLine(lineNodes[0]);
			if (typeof compiled !== 'string') {
				loopEntries.push({ kind: 'plain', compiled, isLine: true });
			}
			continue;
		}

		const setNodes2 = stmt.children.setStatement as CstNode[] | undefined;
		if (setNodes2?.length) {
			setNodes.push(setNodes2[0]);
			continue;
		}

		const decBlockNodes = stmt.children.decoratorBlock as CstNode[] | undefined;
		if (decBlockNodes?.length) {
			// Compile loops eagerly (runners keep state across cycles).
			// Decorator context is resolved lazily per cycle.
			const compiled = compileDecoratorBlock(decBlockNodes[0], []);
			for (const { compiled: cl, isLine, decoratorLayers } of compiled) {
				loopEntries.push({ kind: 'decorated', compiled: cl, isLine, decoratorLayers });
			}
			continue;
		}
	}

	if (loopEntries.length === 0) {
		return { ok: false, error: 'No loop statement found' };
	}

	return {
		ok: true,
		evaluate(ctx: CycleContext): EvalCycleResult {
			const { cycleNumber } = ctx;

			// Build the global ScaleContext from set statements
			let globalCtx: ScaleContext = { ...DEFAULT_SCALE_CONTEXT };
			for (const setNode of setNodes) {
				globalCtx = applySetStatement(setNode, globalCtx, cycleNumber);
			}

			// Find the first loop to evaluate
			for (const entry of loopEntries) {
				let compiled: CompiledLoop;
				let scaleCtx: ScaleContext;
				let isLine: boolean;

				if (entry.kind === 'plain') {
					compiled = entry.compiled;
					scaleCtx = globalCtx;
					isLine = entry.isLine;
				} else {
					compiled = entry.compiled;
					scaleCtx = resolveDecoratorContext(entry.decoratorLayers, globalCtx, cycleNumber);
					isLine = entry.isLine;
				}

				const { elements } = compiled;
				if (elements.length === 0) continue;

				const { events, done } = evaluateCompiledLoop(compiled, scaleCtx, cycleNumber, isLine);
				return { ok: true, events, done };
			}

			return { ok: false, error: 'No loop found in evaluate' };
		}
	};
}
