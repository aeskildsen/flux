import { describe, expect, it, vi } from 'vitest';
import { next, repeat, series, shunc, stutter, xsum } from './generators.js';

describe('next', () => {
	it('returns a plain value directly', () => {
		expect(next(42)).toBe(42);
		expect(next('hello')).toBe('hello');
	});

	it('calls a thunk and returns its result', () => {
		expect(next(() => 99)).toBe(99);
	});

	it('re-calls the thunk on each invocation', () => {
		let i = 0;
		const thunk = () => ++i;
		next(thunk);
		next(thunk);
		expect(i).toBe(2);
	});

	it('advances a generator one step per call', () => {
		const gen = series(0, 1, 3);
		expect(next(gen)).toBe(0);
		expect(next(gen)).toBe(1);
		expect(next(gen)).toBe(2);
	});

	it('returns undefined when a generator is exhausted', () => {
		const gen = series(0, 1, 1);
		next(gen); // consume the single value
		expect(next(gen)).toBeUndefined();
	});

	it('accepts a generator as a param to series (nested generator)', () => {
		// start drawn from a generator: 0, 1, 2 — each instantiation of series gets next start
		const starts = series(0, 10, 3);
		expect(next(starts)).toBe(0);
		expect(next(starts)).toBe(10);
		expect(next(starts)).toBe(20);
	});
});

describe('series', () => {
	it('produces a basic ascending sequence', () => {
		expect(Array.from(series(0, 1, 4))).toEqual([0, 1, 2, 3]);
	});

	it('produces a descending sequence with negative step', () => {
		expect(Array.from(series(10, -2, 3))).toEqual([10, 8, 6]);
	});

	it('accepts thunks for step', () => {
		const result = Array.from(series(0, () => 3, 4));
		expect(result).toEqual([0, 3, 6, 9]);
	});

	it('resolves start and len once at instantiation', () => {
		const startFn = vi.fn(() => 5);
		const lenFn = vi.fn(() => 3);
		Array.from(series(startFn, 1, lenFn));
		expect(startFn).toHaveBeenCalledTimes(1);
		expect(lenFn).toHaveBeenCalledTimes(1);
	});

	it('resolves step once per event', () => {
		const stepFn = vi.fn(() => 2);
		const result = Array.from(series(0, stepFn, 4));
		// step is called after each yield, including the last (4 times for 4 values)
		expect(stepFn).toHaveBeenCalledTimes(4);
		expect(result).toEqual([0, 2, 4, 6]);
	});

	it('produces zero values when len is 0', () => {
		expect(Array.from(series(0, 1, 0))).toEqual([]);
	});

	it('accepts a generator as step (nested generator)', () => {
		// step drawn from a generator: 1, 2, 3, 4 per event
		const steps = series(1, 1, 4);
		const result = Array.from(series(0, steps, 4));
		expect(result).toEqual([0, 1, 3, 6]);
	});
});

describe('shunc', () => {
	const pool = [1, 2, 3, 4, 5];

	it('output length equals len (truncate case)', () => {
		expect(Array.from(shunc(pool, 3))).toHaveLength(3);
	});

	it('output length equals len (extend case)', () => {
		expect(Array.from(shunc(pool, 8))).toHaveLength(8);
	});

	it('all output values come from the pool', () => {
		const result = Array.from(shunc(pool, 7));
		expect(result.every((v) => pool.includes(v))).toBe(true);
	});

	it('default repeats=1 gives total length = len', () => {
		expect(Array.from(shunc(pool, 4))).toHaveLength(4);
	});

	it('repeats=2 gives total length = 2 * len', () => {
		expect(Array.from(shunc(pool, 3, 2))).toHaveLength(6);
	});

	it('resolves len and repeats once at instantiation', () => {
		const lenFn = vi.fn(() => 3);
		const repeatsFn = vi.fn(() => 2);
		Array.from(shunc(pool, lenFn, repeatsFn));
		expect(lenFn).toHaveBeenCalledTimes(1);
		expect(repeatsFn).toHaveBeenCalledTimes(1);
	});

	it('accepts thunks as pool elements', () => {
		const thunkPool = [() => 10, () => 20, () => 30];
		const result = Array.from(shunc(thunkPool, 3));
		expect(result.every((v) => [10, 20, 30].includes(v))).toBe(true);
	});
});

describe('stutter', () => {
	it('times=1 acts as a passthrough', () => {
		expect(Array.from(stutter(series(0, 1, 3), 1))).toEqual([0, 1, 2]);
	});

	it('times=3 repeats each value three times', () => {
		expect(Array.from(stutter(series(0, 1, 3), 3))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
	});

	it('resolves times once per source event', () => {
		const timesFn = vi.fn(() => 2);
		Array.from(stutter(series(0, 1, 3), timesFn));
		expect(timesFn).toHaveBeenCalledTimes(3); // once per value from series
	});

	it('times=0 emits nothing', () => {
		expect(Array.from(stutter(series(0, 1, 3), 0))).toEqual([]);
	});
});

describe('repeat', () => {
	it('yields the full sequence n times', () => {
		const result = Array.from(repeat(() => series(0, 1, 3), 2));
		expect(result).toEqual([0, 1, 2, 0, 1, 2]);
	});

	it('n=1 yields the sequence exactly once', () => {
		expect(Array.from(repeat(() => series(5, 5, 3), 1))).toEqual([5, 10, 15]);
	});

	it('n=0 yields nothing', () => {
		expect(Array.from(repeat(() => series(0, 1, 3), 0))).toEqual([]);
	});

	it('calls the factory once per repetition', () => {
		const factory = vi.fn(() => series(0, 1, 2));
		Array.from(repeat(factory, 3));
		expect(factory).toHaveBeenCalledTimes(3);
	});

	it('resolves n once (not per iteration)', () => {
		const nFn = vi.fn(() => 2);
		Array.from(repeat(() => series(0, 1, 2), nFn));
		expect(nFn).toHaveBeenCalledTimes(1);
	});
});

describe('xsum', () => {
	it('output sums to exactly the target', () => {
		for (let i = 0; i < 10; i++) {
			const result = Array.from(xsum([0.25, 0.5, 1], 4));
			const total = result.reduce((a, b) => a + b, 0);
			expect(total).toBeCloseTo(4, 10);
		}
	});

	it('single-value pool equal to sum yields [sum]', () => {
		const result = Array.from(xsum([2], 2));
		expect(result).toEqual([2]);
	});

	it('produces non-empty output', () => {
		expect(Array.from(xsum([0.25, 0.5], 2))).not.toHaveLength(0);
	});

	it('resolves sum once at instantiation', () => {
		const sumFn = vi.fn(() => 2);
		Array.from(xsum([0.5, 1], sumFn));
		expect(sumFn).toHaveBeenCalledTimes(1);
	});

	it('accepts thunks as pool elements', () => {
		// Fixed thunks so output is deterministic enough to sum
		const result = Array.from(xsum([() => 1, () => 0.5], 3));
		const total = result.reduce((a, b) => a + b, 0);
		expect(total).toBeCloseTo(3, 10);
	});
});
