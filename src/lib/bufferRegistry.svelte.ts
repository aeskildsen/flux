/**
 * Buffer Registry — reactive store for loaded audio buffers.
 *
 * Holds all buffers available to sample, slice, and cloud patterns via
 * \symbol references and @buf decorators. Each entry carries the metadata
 * needed for DSL dispatch (bufferId, channels) plus UI display (name, origin,
 * duration, isBuiltIn).
 *
 * The registry is a Svelte 5 $state object so any component or adapter can
 * subscribe reactively. Buffer IDs are assigned sequentially, starting at 1.
 * ID 0 is reserved for "no buffer" / unset.
 *
 * Name validation: valid \symbol identifiers — ASCII alphanumeric + underscore,
 * must start with a letter or underscore, length 1–64.
 */

export type BufferEntry = {
	/** Unique numeric buffer ID used by scsynth (b_alloc / b_setn / s_new bufnum param). */
	bufferId: number;
	/** \symbol name used in DSL — e.g. \kick, \amen. Must be a valid identifier. */
	name: string;
	/** Original filename or URL. Read-only display field. */
	origin: string;
	/** Number of audio channels (1 = mono, 2 = stereo). */
	channels: 1 | 2;
	/** Duration in seconds, rounded to 2 decimal places. */
	duration: number;
	/** If true, the entry is a built-in Flux default — cannot be removed. */
	isBuiltIn: boolean;
};

// ---------------------------------------------------------------------------
// Identifier validation
// ---------------------------------------------------------------------------

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

/** Returns true if the string is a valid \symbol identifier. */
export function isValidIdentifier(name: string): boolean {
	return IDENTIFIER_RE.test(name);
}

/** Derives a default buffer name from a filename (lowercased, non-identifier chars → underscores). */
export function deriveNameFromFilename(filename: string): string {
	// Strip extension
	const base = filename.replace(/\.[^.]+$/, '');
	// Replace invalid chars with underscores, lowercase, deduplicate underscores
	const sanitised = base
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');
	// Ensure starts with letter/underscore
	const prefixed = /^[a-z_]/.test(sanitised) ? sanitised : `buf_${sanitised}`;
	// Clamp to 64 chars, then strip trailing underscores that may appear after clamping
	const clamped = prefixed.slice(0, 64).replace(/_+$/, '');
	return clamped || 'buf';
}

// ---------------------------------------------------------------------------
// Registry state
// ---------------------------------------------------------------------------

/** The full list of registered buffers in insertion order. */
const _entries = $state<BufferEntry[]>([]);

/** Next buffer ID to allocate. */
let _nextId = $state(1);

// ---------------------------------------------------------------------------
// Public read-only view
// ---------------------------------------------------------------------------

export const bufferRegistry = {
	/** Reactive array of all buffer entries (do not mutate directly). */
	get entries(): readonly BufferEntry[] {
		return _entries;
	},

	/** Returns the entry for a given \symbol name, or undefined. */
	getByName(name: string): BufferEntry | undefined {
		return _entries.find((e) => e.name === name);
	},

	/** Returns the entry for a given bufferId, or undefined. */
	getById(id: number): BufferEntry | undefined {
		return _entries.find((e) => e.bufferId === id);
	},

	/** True if the given name is already taken. */
	hasName(name: string): boolean {
		return _entries.some((e) => e.name === name);
	}
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Register a new buffer entry. Allocates the next available buffer ID.
 * Returns the allocated bufferId.
 */
export function registerBuffer(opts: {
	name: string;
	origin: string;
	channels: 1 | 2;
	duration: number;
	isBuiltIn?: boolean;
}): number {
	const id = _nextId;
	_nextId += 1;
	_entries.push({
		bufferId: id,
		name: opts.name,
		origin: opts.origin,
		channels: opts.channels,
		duration: Math.round(opts.duration * 100) / 100,
		isBuiltIn: opts.isBuiltIn ?? false
	});
	return id;
}

/**
 * Rename an existing buffer entry.
 * Validates the new name and uniqueness.
 * Returns null on success, or an error string on failure.
 */
export function renameBuffer(bufferId: number, newName: string): string | null {
	if (!isValidIdentifier(newName)) {
		return `"${newName}" is not a valid identifier (letters, digits, underscore; must start with a letter or underscore)`;
	}
	const existing = _entries.find((e) => e.name === newName && e.bufferId !== bufferId);
	if (existing) {
		return `Name "${newName}" is already in use`;
	}
	const entry = _entries.find((e) => e.bufferId === bufferId);
	if (!entry) {
		return `Buffer ${bufferId} not found`;
	}
	entry.name = newName;
	return null;
}

/**
 * Remove a buffer entry by ID.
 * Returns true if removed, false if not found or isBuiltIn.
 */
export function unregisterBuffer(bufferId: number): boolean {
	const idx = _entries.findIndex((e) => e.bufferId === bufferId && !e.isBuiltIn);
	if (idx === -1) return false;
	_entries.splice(idx, 1);
	return true;
}

/**
 * Reset the registry (for testing only).
 * @internal
 */
export function _resetRegistry(): void {
	_entries.splice(0, _entries.length);
	_nextId = 1;
}
