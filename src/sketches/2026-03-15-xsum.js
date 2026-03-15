// 2026-03-15 — xsum(pool, sum)
// Fits duration values from pool into a target sum (in beats).
// NOT useful yet — requires a variable-interval scheduler (Phase 4).
// Included as a documentation record; outputs duration sequences to the console.
import { xsum } from '$lib/generators';

export default async function () {
	// Log a few example outputs to the console so the algorithm is visible
	for (let i = 0; i < 4; i++) {
		console.log('xsum([0.25, 0.5, 1], 4):', [...xsum([0.25, 0.5, 1], 4)]);
	}
	console.log('xsum is not audible until the Phase 4 scheduler is in place.');
	return { stop: () => {} };
}
