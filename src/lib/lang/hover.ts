/**
 * Flux DSL — hover tooltip provider (framework-agnostic).
 *
 * Keep all hover logic here, not inside Monaco API callbacks.
 * This makes the logic independently testable and portable to LSP.
 */

import type { IToken } from 'chevrotain';

export interface HoverResult {
	/** Markdown string to display in the hover popup. */
	contents: string;
}

// ---------------------------------------------------------------------------
// Documentation tables
// ---------------------------------------------------------------------------

const TOKEN_TYPE_DOCS: Record<string, string> = {
	Note: [
		'**`note [...]`** — polyphonic pitched events.',
		'',
		'Loops indefinitely by default. Each cycle has the same duration as the tempo beat.',
		"Use `'n` to play once, or `'n(4)` to play 4 times.",
		'',
		'```flux',
		'note [0 2 4 7]',
		"note [0rand7 4rand6]'stut(2)",
		"note [0 2 4]'n(4)",
		'```'
	].join('\n'),

	Mono: [
		'**`mono [...]`** — monophonic pitched events.',
		'',
		'Single persistent synth node; events send `set` messages instead of spawning new instances.',
		'Loops indefinitely by default.',
		'',
		'```flux',
		'mono [0 1 2 3]',
		"mono [0 2 4]'n",
		'```'
	].join('\n'),

	Sample: [
		'**`sample [...]`** — buffer playback.',
		'',
		'(Full behaviour defined in issue #14.)',
		'```flux',
		'sample(\\oneshot) [bd sn bd sn]',
		'```'
	].join('\n'),

	Slice: [
		'**`slice [...]`** — beat-sliced buffer playback.',
		'',
		'(Full behaviour defined in issue #14.)'
	].join('\n'),

	Cloud: [
		'**`cloud [...]`** — granular synthesis.',
		'',
		'(Full behaviour defined in issue #14.)'
	].join('\n'),

	Rand: [
		'**`N rand M`** — uniform random in [N, M).',
		'',
		'Written adjacent to its arguments (no spaces): `0rand4`.',
		'When either bound is a float, produces a continuous float.',
		'',
		'```flux',
		'0rand4   // integer in {0, 1, 2, 3}',
		'0.rand4  // float in [0.0, 4.0)',
		'0~4      // shorthand — same as 0rand4',
		'```'
	].join('\n'),

	Gau: [
		'**`N gau M`** — gaussian (normal) distribution.',
		'',
		'Mean = N, standard deviation = M.',
		'',
		'```flux',
		'0gau4  // Pgauss(0, 4)',
		'```'
	].join('\n'),

	Exp: [
		'**`N exp M`** — exponential random in [N, M).',
		'',
		'Values cluster near the minimum. Useful for frequencies, tempos, and decay times.',
		'',
		'```flux',
		'1exp7  // Pexprand(1, 7)',
		'```'
	].join('\n'),

	Bro: [
		'**`N bro M m S`** — brownian motion (Perlin noise).',
		'',
		'Walks randomly within [N, M] with a maximum step of S per event.',
		'',
		'```flux',
		'0bro10m2  // Pbrown(0, 10, 2)',
		'```'
	].join('\n'),

	BroStep: [
		'**`m`** — max-step separator in brownian generators.',
		'',
		'`0bro10m2` → min=0, max=10, max\\_step=2'
	].join('\n'),

	Step: [
		'**`N step S x L`** — linear series.',
		'',
		'Generates L values starting at N, advancing by S each time (Pseries).',
		'',
		'```flux',
		'0step2x4  // 0, 2, 4, 6',
		'```'
	].join('\n'),

	Mul: [
		'**`N mul F x L`** — geometric series.',
		'',
		'Generates L values starting at N, multiplied by F each time (Pgeom).',
		'',
		'```flux',
		'5mul2x4  // 5, 10, 20, 40',
		'```'
	].join('\n'),

	Lin: [
		'**`N lin M x L`** — linear interpolation.',
		'',
		'Generates L evenly-spaced values from N to M.',
		'',
		'```flux',
		'2lin7x8',
		'```'
	].join('\n'),

	Geo: [
		'**`N geo M x L`** — geometric (exponential) interpolation.',
		'',
		'Generates L values from N to M with exponential spacing.',
		'',
		'```flux',
		'2geo7x8',
		'```'
	].join('\n'),

	LenSep: [
		'**`x`** — length separator in deterministic generators.',
		'',
		'`0step2x4` → start=0, step=2, **length=4**'
	].join('\n'),

	Tilde: ['**`~`** — shorthand for `rand`.', '', '`0~4` is equivalent to `0rand4`.'].join('\n'),

	Set: [
		'**`set key(value)`** — global session state.',
		'',
		'Sets an ambient parameter that applies to all patterns unless overridden by `@` decorators.',
		'',
		'```flux',
		'set scale("minor")',
		'set root(7)',
		'set tempo(120)',
		'set key(g# lydian)',
		'```',
		'',
		'Parameters: `scale`, `root`, `octave`, `tempo`, `cent`, `key`'
	].join('\n'),

	Fx: [
		'**`fx("name")`** — anonymous insert effect.',
		'',
		'Scoped to a source pattern via the `|` pipe operator.',
		'',
		'```flux',
		'note [0 2 4 7] | fx("lpf")\'cutoff(1200)',
		'```'
	].join('\n'),

	SendFx: [
		'**`send_fx("name")`** — named send effect.',
		'',
		'Long-lived effect node, independent of any source pattern.',
		'',
		'```flux',
		'reverb = send_fx("reverb")\'room(0.5)',
		'```'
	].join('\n'),

	MasterFx: [
		'**`master_fx("name")`** — master bus effect.',
		'',
		'All audio routes through master.',
		'',
		'```flux',
		'master_fx("limiter")',
		'```'
	].join('\n'),

	Tick: [
		"**`'modifier`** — modifier sigil.",
		'',
		'Attaches a modifier to the immediately preceding token.',
		'',
		'Common modifiers: `lock`, `eager(n)`, `stut`, `maybe`, `legato`, `offset`, `at`, `n`, `shuf`, `pick`, `wran`'
	].join('\n'),

	At: [
		'**`@decorator(args)`** — scoped context decorator.',
		'',
		'Overrides global `set` values within an indented block or for an inline expression.',
		'',
		'```flux',
		'@scale("minor") @root(7)',
		'  note [0 1 2]',
		'```'
	].join('\n'),

	Float: [
		'**Float literal** — e.g. `0.5`, `1.2`.',
		'',
		'When used as a generator bound, produces continuous float values.',
		"Most useful in non-degree contexts: `'legato(0.5rand1.2)`, `@cent(...)`, etc."
	].join('\n'),

	Integer: '**Integer literal** — scale degree or numeric argument.',

	StringLiteral:
		'**String literal** — synthdef name, FX name, or scale name. e.g. `"moog"`, `"reverb"`.',

	Identifier:
		'**Identifier** — modifier name, scale name, decorator parameter, or FX variable name.',

	Flat: [
		'**Flat accidental** — lower a degree by one semitone per `b`.',
		'',
		'```flux',
		'[2b]   // degree 2, flat  (−1 semitone)',
		'[3bb]  // degree 3, double flat  (−2 semitones)',
		'```',
		'',
		'Accidentals must be written adjacent to the degree integer, with no space.'
	].join('\n'),

	Sharp: [
		'**Sharp accidental** — raise a degree by one semitone per `#`.',
		'',
		'```flux',
		'[4#]   // degree 4, sharp  (+1 semitone)',
		'[4##]  // degree 4, double sharp  (+2 semitones)',
		'```',
		'',
		'Accidentals must be written adjacent to the degree integer, with no space.'
	].join('\n'),

	Pipe: [
		'**`|`** — pipe operator.',
		'',
		'Routes source pattern audio into an anonymous insert FX.',
		'',
		'```flux',
		'note [0 2 4 7] | fx("lpf")\'cutoff(1200)',
		'```'
	].join('\n'),

	Plus: [
		'**`+`** — modal transposition up.',
		'',
		'Shifts all degrees up by the given number of scale steps.',
		'',
		'```flux',
		'note [0 2 4] + 2      // shift up 2 scale steps',
		'note [0 2 4] + 0rand3 // stochastic shift',
		'```'
	].join('\n'),

	Minus: [
		'**`-`** — modal transposition down.',
		'',
		'```flux',
		'note [0 2 4] - 1  // shift down 1 scale step',
		'```'
	].join('\n'),

	LBracket: [
		'**`[...]`** — sequence generator.',
		'',
		'Yields elements in order, cycling back to the start indefinitely.',
		'',
		'```flux',
		'[1 2 3]         // 1, 2, 3, 1, 2, 3, ...',
		"[1 2 3]'shuf    // shuffle then traverse",
		"[1 2 3]'pick    // random element each time",
		"[1?3 2?1]'wran  // weighted random",
		'```'
	].join('\n'),

	Bang: [
		'**`!n`** — inline repetition.',
		'',
		'Expands the preceding element n times in-place inside a sequence list.',
		'',
		'```flux',
		'note [1!4]        // same as note [1 1 1 1]',
		'note [1!2 3!3]    // same as note [1 1 3 3 3]',
		'note [0rand7!4]   // one random degree, played four times per cycle',
		'```'
	].join('\n')
};

/** Modifier identifier image → documentation. */
const MODIFIER_DOCS: Record<string, string> = {
	lock: [
		"**`'lock`** — freeze value forever.",
		'',
		'The generator is evaluated once at the first cycle and never redrawn.',
		'',
		'```flux',
		"note [0rand7 4rand6]'lock     // both elements frozen after first cycle",
		"note [0rand7'lock 4rand6]     // first element frozen, second draws every cycle",
		'```'
	].join('\n'),

	eager: [
		"**`'eager(n)`** — redraw every n cycles.",
		'',
		"Default: `'eager(1)` (once per cycle). Bare `'eager` = `'eager(1)`.",
		'',
		'```flux',
		"note [0 4rand6]'eager(4)  // redraw every 4 cycles",
		'```'
	].join('\n'),

	stut: [
		"**`'stut(n)`** — stutter: repeat each event n times.",
		'',
		'Default n = 2. The count can be a generator.',
		'',
		'```flux',
		"note [0rand7 4rand6]'stut          // repeat each event twice",
		"note [0rand7 4rand6]'stut(4)       // repeat 4 times",
		"note [0rand7 4rand6]'stut(2rand4)  // random count per cycle",
		'```'
	].join('\n'),

	maybe: [
		"**`'maybe(p)`** — pass each event with probability p.",
		'',
		"p is in [0.0, 1.0]. Default p = 0.5. Bare `'maybe` = `'maybe(0.5)`.",
		'',
		'```flux',
		"note [0 2 4 7]'maybe       // 50% chance each event fires",
		"note [0 2 4 7]'maybe(0.3)  // 30% chance",
		'```'
	].join('\n'),

	legato: [
		"**`'legato(x)`** — gate duration factor.",
		'',
		'Controls note sustain relative to its time slot. `1.0` = no gap. `>1.0` = overlap (pad effect).',
		'',
		'```flux',
		"note [0 2 4]'legato(0.8)        // slightly detached",
		"note [0 2 4]'legato(1.5)        // overlapping",
		"note [0 2 4]'legato(0.5rand1.2) // stochastic legato",
		'```'
	].join('\n'),

	offset: [
		"**`'offset(ms)`** — timing offset in milliseconds.",
		'',
		'Positive = late, negative = early.',
		'',
		'```flux',
		"note [0 1 2]'offset(20)   // 20 ms late",
		"note [0 1 2]'offset(-10)  // 10 ms early",
		'```'
	].join('\n'),

	at: [
		"**`'at(n)`** — phase offset for any content type.",
		'',
		'Offset in cycles from the start of the next cycle. Fractions are allowed.',
		"Combined with `'n` to start a finite pattern at a specific point.",
		'',
		'```flux',
		"note [0 1 2 3]'at(0)    // next cycle start (default)",
		"note [0 1 2 3]'at(1/4)  // 1/4 cycle later",
		"note [0 1 2 3]'at(-1/8) // 1/8 cycle earlier",
		"note [0 2 4]'n'at(1/4)  // play once, start 1/4 cycle in",
		'```'
	].join('\n'),

	n: [
		"**`'n(count)`** — finite playback.",
		'',
		"Bare `'n` plays once. `'n(4)` plays 4 times. Without `'n`, patterns loop indefinitely.",
		'',
		'```flux',
		"note [0 1 2 3]'n      // play once",
		"note [0 1 2 3]'n(4)   // play 4 times",
		'```'
	].join('\n'),

	shuf: [
		"**`'shuf`** — shuffle list then traverse in order.",
		'',
		'Re-shuffles at each cycle boundary. Equivalent to Pshuf.',
		'',
		'```flux',
		"[1 2 3 4]'shuf",
		'```'
	].join('\n'),

	pick: [
		"**`'pick`** — pick a random element each time.",
		'',
		'Picks uniformly at random on every poll. Equivalent to Prand.',
		'',
		'```flux',
		"[1 2 3 4]'pick",
		'```'
	].join('\n'),

	wran: [
		"**`'wran`** — weighted random selection.",
		'',
		'Use `?weight` on elements to assign relative weights. Default weight = 1.',
		'',
		'```flux',
		"[1?3 2?1]'wran  // 1 appears 3× as often as 2",
		"[x?0 y?1]'wran  // zero weight removes entry",
		'```'
	].join('\n'),

	tail: [
		"**`'tail(seconds)`** — release anonymous FX after n seconds of silence.",
		'',
		'```flux',
		'note [0 2 4 7] | fx("lpf")\'cutoff(1200)\'tail(4)',
		'```'
	].join('\n')
};

/** Scale name identifier → documentation. */
const SCALE_DOCS: Record<string, string> = {
	major: '**`major`** — major scale (Ionian): 0 2 4 5 7 9 11',
	minor: '**`minor`** — natural minor (Aeolian): 0 2 3 5 7 8 10',
	dorian: '**`dorian`** — Dorian mode: 0 2 3 5 7 9 10',
	phrygian: '**`phrygian`** — Phrygian mode: 0 1 3 5 7 8 10',
	lydian: '**`lydian`** — Lydian mode: 0 2 4 6 7 9 11',
	mixolydian: '**`mixolydian`** — Mixolydian mode: 0 2 4 5 7 9 10',
	aeolian: '**`aeolian`** — Aeolian mode (natural minor): 0 2 3 5 7 8 10',
	locrian: '**`locrian`** — Locrian mode: 0 1 3 5 6 8 10',
	chromatic: '**`chromatic`** — all 12 semitones: 0 1 2 3 4 5 6 7 8 9 10 11',
	pentatonic: '**`pentatonic`** — major pentatonic: 0 2 4 7 9',
	minorPentatonic: '**`minorPentatonic`** — minor pentatonic: 0 3 5 7 10',
	blues: '**`blues`** — blues scale: 0 3 5 6 7 10',
	wholeTone: '**`wholeTone`** — whole tone scale: 0 2 4 6 8 10',
	diminished: '**`diminished`** — diminished (half-whole): 0 1 3 4 6 7 9 10'
};

/** Decorator / set parameter name → documentation. */
const DECORATOR_DOCS: Record<string, string> = {
	scale: '**`scale`** — scale preset. Default: `"major"`.',
	root: '**`root`** — root note, semitones from C (0–11). Default: 0 (C).',
	octave: '**`octave`** — octave number (piano convention). Default: 5.',
	cent: '**`cent`** — pitch deviation in cents (100 per semitone step). Default: 0.',
	key: '**`key(root scale [octave])`** — compound pitch context: sets root + scale + optional octave together.',
	tempo: '**`tempo`** — global tempo in BPM.'
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return hover documentation for the token at the cursor, or null if no
 * documentation is available.
 *
 * @param token - The token under the cursor, from FluxLexer.tokenize().
 * @param prevTokenName - The tokenType.name of the immediately preceding token
 *   (used to resolve context-sensitive identifier meanings, e.g. modifier vs
 *   decorator key vs scale name).
 */
export function getHover(token: IToken, prevTokenName?: string): HoverResult | null {
	const typeName = token.tokenType.name;

	// Non-identifier tokens: direct lookup by type name
	if (typeName !== 'Identifier') {
		const doc = TOKEN_TYPE_DOCS[typeName];
		return doc ? { contents: doc } : null;
	}

	// Identifier — resolve by context first, then fall back to image-based lookup
	const image = token.image;

	if (prevTokenName === 'Tick') {
		const doc = MODIFIER_DOCS[image];
		if (doc) return { contents: doc };
	}

	if (prevTokenName === 'At' || prevTokenName === 'Set') {
		const doc = DECORATOR_DOCS[image];
		if (doc) return { contents: doc };
	}

	// Image-based fallbacks (works when the preceding token is out of hover range)
	const modDoc = MODIFIER_DOCS[image];
	if (modDoc) return { contents: modDoc };

	const scaleDoc = SCALE_DOCS[image];
	if (scaleDoc) return { contents: scaleDoc };

	const decDoc = DECORATOR_DOCS[image];
	if (decDoc) return { contents: decDoc };

	return { contents: TOKEN_TYPE_DOCS['Identifier']! };
}
