// 2026-03-15 — current: plain ascending series, starting point for experimentation
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
		(e, t) => sc.synthAt(t, 'sonic-pi-prophet', 'source', { note: e, release: 0.3 }),
		0.5
	);
}
