// 2026-03-15 — series(start, step, len)
// A directed linear sequence. start and len draw once per instantiation;
// step draws per event (here fixed at 1, giving a plain ascending run).
// Restart: new start and len drawn each loop.
import { sc, run, clock } from '$lib/lab-context';
import { series } from '$lib/generators';

export default async function () {
	await sc.loadSynthDef('sonic-pi-prophet');
	clock.bpm = 120;

	function* loop() {
		while (true) yield* series(60, 1, 5);
	}

	return run(
		loop(),
		(e) => sc.synth('sonic-pi-prophet', 'source', { note: e, release: 0.3 }),
		clock.beatsToSeconds(0.5)
	);
}
