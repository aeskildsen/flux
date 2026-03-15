// 2026-03-15 — xsum(pool, sum)
// Fits duration values from pool into a target sum (in beats).
// Now audible with the Phase 4 lookahead scheduler.
// Yields { note, duration } objects; scheduler reads .duration for variable spacing.
import { sc, run, clock } from '$lib/lab-context';
import { series, xsum } from '$lib/generators';

export default async function () {
	await sc.loadSynthDef('sonic-pi-prophet');
	clock.bpm = 120;

	// Wrap xsum durations together with note values from a series
	function* loop() {
		while (true) {
			const notes = series(60, 2, 4);
			for (const duration of xsum([0.25, 0.5, 1], 4)) {
				const { value: note, done } = notes.next();
				if (done) break;
				yield { note, duration };
			}
		}
	}

	return run(loop(), (e, ntpTime) =>
		sc.synthAt(ntpTime, 'sonic-pi-prophet', 'source', {
			note: e.note,
			release: e.duration * clock.beatsToSeconds(1) * 0.9
		})
	);
}
