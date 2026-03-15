/**
 * Generator primitives for the Flux pattern library.
 *
 * All primitives operate in the durational domain unless noted.
 * Stochastic parameters are expressed as Thunks — plain values or zero-argument
 * functions. When the parser exists, range literals (10~15) will compile to thunks.
 *
 * Re-evaluation contracts are documented per primitive: when does each parameter
 * redraw its stochastic value?
 *   - per instantiation: when the generator function is called
 *   - per event:         on each yield
 *   - per completion:    when the full sequence has been produced once
 */

export type ScalarThunk<T> = T | (() => T);
export type Thunk<T> = ScalarThunk<T> | Generator<T>;

/**
 * Resolve a Thunk: advance a generator one step, call a thunk, or return a plain value.
 * This is the universal value resolver — the stand-in for stochastic leaf syntax.
 *
 * next(60)                       → 60
 * next(() => 48 + rand() * 24)   → random each call
 * next(series(0, 1, 4))          → 0, 1, 2, 3, then undefined when exhausted
 */
export function next<T>(value: Generator<T>): T | undefined;
export function next<T>(value: T | (() => T)): T;
export function next<T>(value: Thunk<T>): T | undefined {
	if (value !== null && typeof value === 'object' && Symbol.iterator in value) {
		return (value as Generator<T>).next().value;
	}
	return typeof value === 'function' ? (value as () => T)() : value;
}

/**
 * Directed linear motion.
 *
 * Yields `len` values starting at `start`, advancing by `step` each event.
 *
 * Re-evaluation contract:
 *   start — per instantiation
 *   len   — per instantiation
 *   step  — per event (enables random walk behaviour)
 */
export function* series(
	start: Thunk<number>,
	step: Thunk<number>,
	len: Thunk<number>
): Generator<number> {
	const length = next(len);
	let value = next(start);
	for (let i = 0; i < length; i++) {
		yield value;
		value += next(step); // Note: step is resolved on every iteration, including the final one (no-op compute). Could skip on last iteration as an optimisation if step has cost.
	}
}

/**
 * Shuffle, extend, and truncate a pool of values to a target length, then repeat.
 * Matches alea's Pshunc exactly: double-scramble happens once per instantiation,
 * producing a fixed list that is then emitted `repeats` times.
 *
 * Re-evaluation contract:
 *   len     — per instantiation
 *   repeats — per instantiation
 *   pool    — evaluated once; individual elements may be thunks (resolved per use)
 */
export function* shunc(
	pool: ScalarThunk<number>[],
	len: ScalarThunk<number>,
	repeats: ScalarThunk<number> = 1
): Generator<number> {
	const length = next(len);
	const count = next(repeats);
	const resolved = pool.map((v) => next(v));

	// Double-scramble: shuffle → wrap-extend to target length → shuffle again.
	// Done once; the same list is repeated `count` times (matching Pshunc semantics).
	const pass1 = [...resolved].sort(() => Math.random() - 0.5);
	const extended: number[] = Array.from({ length }, (_, i) => pass1[i % pass1.length]);
	const list = extended.sort(() => Math.random() - 0.5);

	for (let i = 0; i < count; i++) {
		yield* list;
	}
}

/**
 * Repeat individual events N times before advancing to the next source value.
 *
 * Re-evaluation contract:
 *   times — per event (each source value gets its own stutter decision)
 */
export function* stutter<T>(source: Generator<T>, times: ScalarThunk<number>): Generator<T> {
	for (const value of source) {
		const count = next(times);
		for (let i = 0; i < count; i++) {
			yield value;
		}
	}
}

/**
 * Repeat an entire sequence n times.
 * Takes a factory function so each repetition gets a fresh generator instance,
 * enabling stochastic re-draws at the top of each repetition.
 *
 * Re-evaluation contract:
 *   n — per completion (drawn once; a committed loop count)
 */
export function* repeat<T>(factory: () => Generator<T>, n: ScalarThunk<number>): Generator<T> {
	const count = next(n);
	for (let i = 0; i < count; i++) {
		yield* factory();
	}
}

/**
 * Fit a pool of duration values into a target sum (in beats).
 * Greedy algorithm: shuffles candidates, accepts values that fit remaining space.
 * Closes out with the smallest available value when space runs low.
 * Natural bias toward busier rhythms (smaller values accepted more often).
 *
 * Re-evaluation contract:
 *   sum  — per instantiation
 *   pool — evaluated once; individual elements may be thunks (resolved per use)
 */
export function* xsum(pool: ScalarThunk<number>[], sum: ScalarThunk<number>): Generator<number> {
	const target = next(sum);
	const resolved = pool.map((v) => next(v)).sort((a, b) => a - b);
	const minval = 1e-6;

	const out: number[] = [];
	let runningTotal = 0;
	while (target - runningTotal > minval) {
		const space = target - runningTotal;

		// Try all candidates in shuffled order; accept the first that fits
		const shuffled = [...resolved].sort(() => Math.random() - 0.5);
		const accepted = shuffled.find((c) => c <= space);

		if (accepted !== undefined) {
			out.push(accepted);
			runningTotal += accepted;
		} else {
			// Nothing fits — close out to avoid infinite loop
			if (space < minval) {
				if (out.length > 0) out[out.length - 1] += space;
			} else {
				out.push(space);
			}
			break;
		}
	}

	// Float-precision correction: ensure output sums to exactly target
	if (out.length > 0) {
		const correction = target - out.reduce((a, b) => a + b, 0);
		if (Math.abs(correction) > 1e-10) out[out.length - 1] += correction;
	}

	yield* out;
}
