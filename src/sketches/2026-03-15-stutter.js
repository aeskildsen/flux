// 2026-03-15 — stutter(source, times)
// Each value from the source repeats `times` before advancing.
// Here times=3: 60 60 60, 61 61 61, 62 62 62, 63 63 63, 64 64 64.
import { sc, run, clock } from '$lib/lab-context';
import { series, stutter } from '$lib/generators';

export default async function () {
	await sc.loadSynthDef('sonic-pi-prophet');
	clock.bpm = 120;

	function* loop() {
		while (true) yield* stutter(series(60, 1, 5), 3);
	}

	return run(
		loop(),
		(e, t) => sc.synthAt(t, 'sonic-pi-prophet', 'source', { note: e, release: 0.2 }),
		0.25
	);
}
