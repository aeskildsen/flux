export function* notes(pitches: number[], params: Record<string, number> = {}) {
	let i = 0;
	while (true) {
		yield { note: pitches[i % pitches.length], ...params };
		i++;
	}
}
