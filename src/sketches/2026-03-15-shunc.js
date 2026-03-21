// 2026-03-15 — shunc(pool, len, repeats)
// Double-scrambles pool into `len` slots, repeats that fixed result 2×,
// then reshuffles and repeats 2× again, then stops.
// 2 shuffles × 2 repeats × 8 notes = 32 notes total.
import { sc, run, clock } from '$lib/lab-context';
import { shunc, repeat } from '$lib/generators';

export default async function () {
	await sc.loadSynthDef('sonic-pi-prophet');
	clock.bpm = 120;

	return run(
		repeat(() => shunc([60, 62, 65, 67, 70], 8, 2), 2),
		(e, t) => sc.synthAt(t, 'sonic-pi-prophet', 'source', { note: e, release: 0.3 }),
		0.5
	);
}
