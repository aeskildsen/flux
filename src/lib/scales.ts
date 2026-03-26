/**
 * Musical scales and pitch utilities for the Flux DSL.
 *
 * Scales are represented as arrays of semitone step sizes (intervals between
 * consecutive degrees). The catalog follows Sonic Pi's naming conventions.
 *
 * Frequency conversion uses standard 12-TET: A4 = MIDI 69 = 440 Hz.
 */

export type Scale = {
	name: string;
	/** Semitone intervals between consecutive degrees, e.g. [2,2,1,2,2,2,1] for major. */
	intervals: number[];
};

export const SCALES: Record<string, Scale> = {
	major: { name: 'major', intervals: [2, 2, 1, 2, 2, 2, 1] },
	minor: { name: 'minor', intervals: [2, 1, 2, 2, 1, 2, 2] },
	dorian: { name: 'dorian', intervals: [2, 1, 2, 2, 2, 1, 2] },
	phrygian: { name: 'phrygian', intervals: [1, 2, 2, 2, 1, 2, 2] },
	lydian: { name: 'lydian', intervals: [2, 2, 2, 1, 2, 2, 1] },
	mixolydian: { name: 'mixolydian', intervals: [2, 2, 1, 2, 2, 1, 2] },
	locrian: { name: 'locrian', intervals: [1, 2, 2, 1, 2, 2, 2] },
	major_pentatonic: { name: 'major_pentatonic', intervals: [2, 2, 3, 2, 3] },
	minor_pentatonic: { name: 'minor_pentatonic', intervals: [3, 2, 2, 3, 2] },
	harmonic_minor: { name: 'harmonic_minor', intervals: [2, 1, 2, 2, 1, 3, 1] },
	melodic_minor: { name: 'melodic_minor', intervals: [2, 1, 2, 2, 2, 2, 1] },
	harmonic_major: { name: 'harmonic_major', intervals: [2, 2, 1, 2, 1, 3, 1] },
	blues: { name: 'blues', intervals: [3, 2, 1, 1, 3, 2] },
	whole_tone: { name: 'whole_tone', intervals: [2, 2, 2, 2, 2, 2] },
	diminished: { name: 'diminished', intervals: [2, 1, 2, 1, 2, 1, 2, 1] },
	augmented: { name: 'augmented', intervals: [3, 1, 3, 1, 3, 1] }
};

export const DEFAULT_SCALE = SCALES.major;

/**
 * Convert a scale degree to a MIDI note number.
 *
 * Degrees are 0-indexed from the root. Degree 0 = root, degree 1 = 2nd
 * scale degree, etc. Negative degrees and degrees beyond the scale length
 * wrap correctly across octave boundaries.
 *
 * @param degree    Scale degree (integer; floats are rounded)
 * @param rootMidi  MIDI note number of the root (degree 0)
 * @param scale     Scale to use (defaults to major)
 */
export function degreeToMidi(
	degree: number,
	rootMidi: number,
	scale: Scale = DEFAULT_SCALE
): number {
	const d = Math.round(degree);
	const n = scale.intervals.length;
	// Cumulative semitone offsets for each degree within one octave
	const semitones = cumulativeOffsets(scale);
	const octaveOffset = Math.floor(d / n) * 12;
	const semitone = semitones[((d % n) + n) % n];
	return rootMidi + semitone + octaveOffset;
}

/**
 * Convert a MIDI note number to frequency in Hz.
 * Uses standard 12-TET: A4 (MIDI 69) = 440 Hz.
 */
export function midiToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Precompute cumulative semitone offsets from root for one octave of a scale. */
function cumulativeOffsets(scale: Scale): number[] {
	const offsets: number[] = [0];
	for (let i = 0; i < scale.intervals.length - 1; i++) {
		offsets.push(offsets[i] + scale.intervals[i]);
	}
	return offsets;
}
