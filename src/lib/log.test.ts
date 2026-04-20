import { describe, expect, it } from 'vitest';
import { appendToLog, type LogEntry } from './log';

describe('appendToLog', () => {
	it('appends a new entry when the log is empty', () => {
		const log: LogEntry[] = [];
		const result = appendToLog(log, 'hello', 'info');
		expect(result).toEqual([{ message: 'hello', kind: 'info', count: 1 }]);
	});

	it('appends a new entry when the message differs from the last', () => {
		const log: LogEntry[] = [{ message: 'first', kind: 'info', count: 1 }];
		const result = appendToLog(log, 'second', 'info');
		expect(result).toEqual([
			{ message: 'first', kind: 'info', count: 1 },
			{ message: 'second', kind: 'info', count: 1 }
		]);
	});

	it('increments count when the same message is appended consecutively', () => {
		const log: LogEntry[] = [{ message: 'Pattern error: foo', kind: 'error', count: 1 }];
		const result = appendToLog(log, 'Pattern error: foo', 'error');
		expect(result).toEqual([{ message: 'Pattern error: foo', kind: 'error', count: 2 }]);
	});

	it('increments count on subsequent repeats', () => {
		const log: LogEntry[] = [{ message: 'Pattern error: foo', kind: 'error', count: 5 }];
		const result = appendToLog(log, 'Pattern error: foo', 'error');
		expect(result).toEqual([{ message: 'Pattern error: foo', kind: 'error', count: 6 }]);
	});

	it('does not collapse when the message matches but kind differs', () => {
		const log: LogEntry[] = [{ message: 'msg', kind: 'info', count: 1 }];
		const result = appendToLog(log, 'msg', 'error');
		expect(result).toEqual([
			{ message: 'msg', kind: 'info', count: 1 },
			{ message: 'msg', kind: 'error', count: 1 }
		]);
	});

	it('does not collapse when the new message matches an earlier (non-last) entry', () => {
		const log: LogEntry[] = [
			{ message: 'foo', kind: 'info', count: 1 },
			{ message: 'bar', kind: 'info', count: 1 }
		];
		const result = appendToLog(log, 'foo', 'info');
		expect(result).toEqual([
			{ message: 'foo', kind: 'info', count: 1 },
			{ message: 'bar', kind: 'info', count: 1 },
			{ message: 'foo', kind: 'info', count: 1 }
		]);
	});

	it('does not mutate the input array', () => {
		const log: LogEntry[] = [{ message: 'hello', kind: 'info', count: 1 }];
		const frozen = [...log];
		appendToLog(log, 'hello', 'info');
		expect(log).toEqual(frozen);
	});

	it('does not mutate the last entry object when incrementing', () => {
		const entry: LogEntry = { message: 'hello', kind: 'info', count: 1 };
		const log: LogEntry[] = [entry];
		appendToLog(log, 'hello', 'info');
		expect(entry.count).toBe(1);
	});
});
