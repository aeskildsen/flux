export interface LogEntry {
	message: string;
	kind: 'error' | 'info';
	count: number;
}

/**
 * Returns a new log array with the given message appended.
 * If the last entry has the same message and kind, its count is incremented
 * in place (well, replaced with a new object) rather than adding a new entry.
 * This collapses repeated consecutive identical messages — e.g. a perpetually-
 * broken pattern emitting one error per cycle — into a single growing counter.
 *
 * Does not mutate the input array or any entry objects.
 */
export function appendToLog(log: LogEntry[], message: string, kind: 'error' | 'info'): LogEntry[] {
	const last = log[log.length - 1];
	if (last !== undefined && last.message === message && last.kind === kind) {
		return [...log.slice(0, -1), { ...last, count: last.count + 1 }];
	}
	return [...log, { message, kind, count: 1 }];
}
