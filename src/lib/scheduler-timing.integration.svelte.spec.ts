/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Timing test: boots the real engine in Chromium, plays events through the scheduler and
 * records the engine output. The test compares the time of each onset with the time tag of
 * its event.
 *
 * The time tags are on the engine clock, and the recorder counts AudioContext frames. The
 * engine clock counts samples, but it follows the wall clock at a bounded rate (2 µs a block),
 * so the two clocks can move apart by that rate. Thus the test does not compare the clocks.
 * It examines the offset between each onset and its time tag: the offset must be the same for
 * all events. The engine starts an event at the start of the next audio block (128 samples),
 * and the recorder finds the onset one sample late, because the sine of the test SynthDef
 * starts at 0. Thus the offsets can differ by one block, one sample and the slew of the engine
 * clock. A larger difference shows that the time tags are not on the engine clock.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { userEvent } from 'vitest/browser';
import { boot, getServer, getInstance } from './supersonic/supersonic.svelte.js';
import { localConfig } from './supersonic/test-utils.js';
import { run, sc } from './scheduler.js';
import { clock } from './clock.js';

const BLOCK_SIZE = 128;
// The largest rate at which the engine clock follows the wall clock: 2 µs a block.
const SLEW_PER_BLOCK = 2e-6;
const EVENT_COUNT = 16;
const EVENT_SPACING_BEATS = 0.5;

// The recorder sends the frame of each onset: the first sample above the threshold after
// a silence of at least SILENCE_FRAMES.
const RECORDER_SOURCE = `
const THRESHOLD = 1e-6;
const SILENCE_FRAMES = 2048;
class OnsetRecorder extends AudioWorkletProcessor {
	silent = SILENCE_FRAMES;
	process(inputs) {
		const channel = inputs[0]?.[0];
		if (!channel) return true;
		for (let i = 0; i < channel.length; i++) {
			if (Math.abs(channel[i]) > THRESHOLD) {
				if (this.silent >= SILENCE_FRAMES) this.port.postMessage(currentFrame + i);
				this.silent = 0;
			} else {
				this.silent++;
			}
		}
		return true;
	}
}
registerProcessor('onset-recorder', OnsetRecorder);
`;

let ctx: AudioContext;
let recorder: AudioWorkletNode;
let onsetFrames: number[] = [];

function wait(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
	await userEvent.click(document.body);
	await boot(localConfig);
	await getServer()!.loadSynthDef('test');

	const sonic = getInstance() as any;
	ctx = sonic.audioContext;
	const url = URL.createObjectURL(new Blob([RECORDER_SOURCE], { type: 'text/javascript' }));
	await ctx.audioWorklet.addModule(url);
	recorder = new AudioWorkletNode(ctx, 'onset-recorder', { numberOfOutputs: 0 });
	recorder.port.onmessage = (e) => onsetFrames.push(e.data as number);
	sonic.node.connect(recorder);

	clock.setTimeSource(sonic.clock);
	clock.bpm = 120;
	clock.start();
}, 20_000);

afterAll(() => {
	getServer()?.freeGroup('source');
	clock.stop();
});

/**
 * The offset of each onset (AudioContext seconds) from the time tag of its event (engine clock
 * seconds). The onsets are in the order of the events.
 */
function onsetOffsets(timeTags: number[]): number[] {
	return onsetFrames.map((f, i) => f / ctx.sampleRate - timeTags[i]);
}

/** The largest correct difference between two offsets, in seconds, for events `span` seconds apart. */
function maxSpread(span: number): number {
	const block = BLOCK_SIZE / ctx.sampleRate;
	return block + 1 / ctx.sampleRate + (span / block) * SLEW_PER_BLOCK;
}

function spreadOf(offsets: number[]): number {
	return Math.max(...offsets) - Math.min(...offsets);
}

function summary(label: string, offsets: number[]) {
	const ms = offsets.map((o) => +((o - offsets[0]) * 1000).toFixed(2));
	console.log(`${label}: onset offsets against the first, ms`, ms);
}

describe('scheduler timing', () => {
	it('plays each event at the same offset from its time tag, within one audio block', async () => {
		onsetFrames = [];
		const firstBeat = Math.ceil(clock.currentBeat) + 2;
		const timeTags: number[] = [];

		function* events() {
			for (let i = 0; i < EVENT_COUNT; i++) yield { duration: EVENT_SPACING_BEATS };
		}
		const handle = run(
			events(),
			(_value, ntpTime) => {
				timeTags.push(ntpTime);
				const id = sc.synthAt(ntpTime, 'test', 'source', { amp: 0.5 });
				sc.setAt(ntpTime + 0.05, id, { gate: 0 });
			},
			EVENT_SPACING_BEATS,
			firstBeat
		);

		const last = clock.beatToNtp(firstBeat + (EVENT_COUNT - 1) * EVENT_SPACING_BEATS);
		await wait((last - clock.now() + 0.5) * 1000);
		handle.stop();

		expect(timeTags.length).toBe(EVENT_COUNT);
		expect(onsetFrames.length).toBe(EVENT_COUNT);
		// The scheduler puts each event on its beat.
		timeTags.forEach((t, i) =>
			expect(t).toBeCloseTo(clock.beatToNtp(firstBeat + i * EVENT_SPACING_BEATS), 9)
		);
		const offsets = onsetOffsets(timeTags);
		summary('scheduler', offsets);
		expect(spreadOf(offsets)).toBeLessThanOrEqual(maxSpread(timeTags.at(-1)! - timeTags[0]));
	}, 30_000);

	it('detects a time tag that is 10 ms off', async () => {
		// A check of the measurement: every second time tag is 10 ms late. The spread of the
		// offsets then is larger than the largest correct spread.
		onsetFrames = [];
		const start = clock.now() + 0.3;
		const timeTags = Array.from({ length: EVENT_COUNT }, (_, i) => start + i * 0.25);
		timeTags.forEach((t, i) => {
			const sent = t + (i % 2 ? 0.01 : 0);
			const id = sc.synthAt(sent, 'test', 'source', { amp: 0.5 });
			sc.setAt(sent + 0.05, id, { gate: 0 });
		});
		await wait((timeTags.at(-1)! - clock.now() + 0.5) * 1000);

		expect(onsetFrames.length).toBe(EVENT_COUNT);
		const offsets = onsetOffsets(timeTags);
		summary('every second time tag 10 ms late', offsets);
		expect(spreadOf(offsets)).toBeGreaterThan(maxSpread(timeTags.at(-1)! - timeTags[0]));
	}, 30_000);
});
