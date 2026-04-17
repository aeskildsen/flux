import { describe, it, expect, beforeEach } from 'vitest';
import {
	bufferRegistry,
	registerBuffer,
	renameBuffer,
	unregisterBuffer,
	isValidIdentifier,
	deriveNameFromFilename,
	_resetRegistry
} from './bufferRegistry.svelte.js';

beforeEach(() => {
	_resetRegistry();
});

// ---------------------------------------------------------------------------
// isValidIdentifier
// ---------------------------------------------------------------------------

describe('isValidIdentifier', () => {
	it('accepts a simple lowercase name', () => {
		expect(isValidIdentifier('kick')).toBe(true);
	});

	it('accepts names starting with underscore', () => {
		expect(isValidIdentifier('_kick')).toBe(true);
	});

	it('accepts names with digits after first char', () => {
		expect(isValidIdentifier('kick2')).toBe(true);
	});

	it('accepts mixed-case names', () => {
		expect(isValidIdentifier('KickDrum')).toBe(true);
	});

	it('rejects empty string', () => {
		expect(isValidIdentifier('')).toBe(false);
	});

	it('rejects names starting with a digit', () => {
		expect(isValidIdentifier('2kick')).toBe(false);
	});

	it('rejects names with hyphens', () => {
		expect(isValidIdentifier('kick-drum')).toBe(false);
	});

	it('rejects names with spaces', () => {
		expect(isValidIdentifier('kick drum')).toBe(false);
	});

	it('rejects names longer than 64 chars', () => {
		expect(isValidIdentifier('a'.repeat(65))).toBe(false);
	});

	it('accepts exactly 64-char name', () => {
		expect(isValidIdentifier('a'.repeat(64))).toBe(true);
	});

	it('rejects names with backslash (the leading \\ is the DSL syntax, not part of identifier)', () => {
		expect(isValidIdentifier('\\kick')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// deriveNameFromFilename
// ---------------------------------------------------------------------------

describe('deriveNameFromFilename', () => {
	it('lowercases the filename base', () => {
		expect(deriveNameFromFilename('KickDrum.wav')).toBe('kickdrum');
	});

	it('strips the file extension', () => {
		expect(deriveNameFromFilename('amen.flac')).toBe('amen');
	});

	it('replaces spaces with underscores', () => {
		expect(deriveNameFromFilename('my sample.wav')).toBe('my_sample');
	});

	it('replaces hyphens with underscores', () => {
		expect(deriveNameFromFilename('hi-hat.wav')).toBe('hi_hat');
	});

	it('deduplicates consecutive underscores', () => {
		expect(deriveNameFromFilename('a  b.wav')).toBe('a_b');
	});

	it('prefixes with buf_ when name starts with a digit', () => {
		expect(deriveNameFromFilename('808kick.wav')).toBe('buf_808kick');
	});

	it('clamps to 64 characters', () => {
		const long = 'a'.repeat(80) + '.wav';
		expect(deriveNameFromFilename(long).length).toBeLessThanOrEqual(64);
	});

	it('handles files with no extension', () => {
		expect(deriveNameFromFilename('kick')).toBe('kick');
	});

	it('falls back to "buf" for degenerate input', () => {
		expect(deriveNameFromFilename('.wav')).toBe('buf');
	});
});

// ---------------------------------------------------------------------------
// registerBuffer
// ---------------------------------------------------------------------------

describe('registerBuffer', () => {
	it('allocates buffer IDs starting at 1', () => {
		const id = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		expect(id).toBe(1);
	});

	it('allocates sequential IDs', () => {
		const id1 = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		const id2 = registerBuffer({ name: 'snare', origin: 'snare.wav', channels: 1, duration: 0.4 });
		expect(id1).toBe(1);
		expect(id2).toBe(2);
	});

	it('adds entry to the registry', () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		expect(bufferRegistry.entries).toHaveLength(1);
		expect(bufferRegistry.entries[0].name).toBe('kick');
	});

	it('rounds duration to 2 decimal places', () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.12345 });
		expect(bufferRegistry.entries[0].duration).toBe(0.12);
	});

	it('sets isBuiltIn to false by default', () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		expect(bufferRegistry.entries[0].isBuiltIn).toBe(false);
	});

	it('sets isBuiltIn when specified', () => {
		registerBuffer({
			name: 'kick',
			origin: 'kick.wav',
			channels: 1,
			duration: 0.5,
			isBuiltIn: true
		});
		expect(bufferRegistry.entries[0].isBuiltIn).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// bufferRegistry.getByName / getById / hasName
// ---------------------------------------------------------------------------

describe('bufferRegistry lookups', () => {
	it('getByName returns entry for known name', () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		const entry = bufferRegistry.getByName('kick');
		expect(entry).toBeDefined();
		expect(entry!.name).toBe('kick');
	});

	it('getByName returns undefined for unknown name', () => {
		expect(bufferRegistry.getByName('snare')).toBeUndefined();
	});

	it('getById returns entry for known ID', () => {
		const id = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		expect(bufferRegistry.getById(id)?.name).toBe('kick');
	});

	it('getById returns undefined for unknown ID', () => {
		expect(bufferRegistry.getById(999)).toBeUndefined();
	});

	it('hasName returns true for registered name', () => {
		registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		expect(bufferRegistry.hasName('kick')).toBe(true);
	});

	it('hasName returns false for unregistered name', () => {
		expect(bufferRegistry.hasName('kick')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// renameBuffer
// ---------------------------------------------------------------------------

describe('renameBuffer', () => {
	it('renames successfully and returns null', () => {
		const id = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		const err = renameBuffer(id, 'kick2');
		expect(err).toBeNull();
		expect(bufferRegistry.getById(id)!.name).toBe('kick2');
	});

	it('returns error for invalid identifier', () => {
		const id = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		const err = renameBuffer(id, 'kick-drum');
		expect(err).not.toBeNull();
		expect(err).toContain('valid identifier');
	});

	it('returns error on name collision with another entry', () => {
		const id1 = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		registerBuffer({ name: 'snare', origin: 'snare.wav', channels: 1, duration: 0.4 });
		const err = renameBuffer(id1, 'snare');
		expect(err).not.toBeNull();
		expect(err).toContain('already in use');
	});

	it('allows renaming to the same name (no-op collision)', () => {
		const id = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		const err = renameBuffer(id, 'kick');
		expect(err).toBeNull();
	});

	it('returns error for unknown buffer ID', () => {
		const err = renameBuffer(999, 'kick');
		expect(err).not.toBeNull();
		expect(err).toContain('not found');
	});
});

// ---------------------------------------------------------------------------
// unregisterBuffer
// ---------------------------------------------------------------------------

describe('unregisterBuffer', () => {
	it('removes a registered buffer and returns true', () => {
		const id = registerBuffer({ name: 'kick', origin: 'kick.wav', channels: 1, duration: 0.5 });
		expect(unregisterBuffer(id)).toBe(true);
		expect(bufferRegistry.entries).toHaveLength(0);
	});

	it('returns false for unknown buffer ID', () => {
		expect(unregisterBuffer(999)).toBe(false);
	});

	it('returns false and does not remove a built-in buffer', () => {
		const id = registerBuffer({
			name: 'kick',
			origin: 'kick.wav',
			channels: 1,
			duration: 0.5,
			isBuiltIn: true
		});
		expect(unregisterBuffer(id)).toBe(false);
		expect(bufferRegistry.entries).toHaveLength(1);
	});
});
