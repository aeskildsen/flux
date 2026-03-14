export interface SchedulerHandle {
	stop(): void;
}

export function run(
	gen: Generator<Record<string, number>>,
	callback: (value: Record<string, number>, time: number) => void,
	interval = 0.5
): SchedulerHandle {
	let active = true;

	function tick() {
		if (!active) return;
		const { value, done } = gen.next();
		if (done) return;
		callback(value, 0);
		setTimeout(tick, interval * 1000);
	}

	tick();
	return { stop: () => { active = false; } };
}
