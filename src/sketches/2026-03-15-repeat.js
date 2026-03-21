// 2026-03-15 — repeat(factory, n)
// Plays the sequence from factory n times before moving on.
// Here n=3: the 0 1 2 3 4 phrase plays 3 times, then repeats.
// factory() is called fresh each repetition — enabling stochastic redraws later.
import { sc, run, clock } from '$lib/lab-context';
import { series, repeat } from '$lib/generators';

export default async function () {
	await sc.loadSynthDef('sonic-pi-prophet');
	clock.bpm = 120;

	function* loop() {
		while (true) yield* repeat(() => series(60, 1, 5), 3);
	}

	return run(
		loop(),
		(e, t) => sc.synthAt(t, 'sonic-pi-prophet', 'source', { note: e, release: 0.3 }),
		0.5
	);
}
