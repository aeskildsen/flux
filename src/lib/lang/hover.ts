/**
 * Flux DSL — hover tooltip provider (framework-agnostic).
 *
 * Keep all hover logic here, not inside Monaco API callbacks.
 * This makes the logic independently testable and portable to LSP.
 */

import type { IToken } from 'chevrotain';
import type { SynthDefMetadata } from './completions.js';
import { getDocMarkdown } from './docs-index.js';

export interface HoverResult {
	/** Markdown string to display in the hover popup. */
	contents: string;
}

// ---------------------------------------------------------------------------
// Runtime docs lookup helpers
//
// Any hover content we can source from docs/*.md at build time wins over the
// in-file tables below. The tables remain the authoritative fallback for
// token-types that have no matching heading (literals, punctuation, etc.).
// ---------------------------------------------------------------------------

/** Token type name → doc-index key. */
const TOKEN_TYPE_DOC_KEY: Record<string, string> = {
	Note: 'note',
	Mono: 'mono',
	Sample: 'sample',
	Slice: 'slice',
	Cloud: 'cloud',
	Utf8Kw: 'utf8',
	Rand: 'rand',
	Gauss: 'gauss',
	Exp: 'exp',
	Brown: 'brown',
	Step: 'step',
	Mul: 'mul',
	Lin: 'lin',
	Geom: 'geom',
	Tilde: '~',
	Set: 'set'
};

// ---------------------------------------------------------------------------
// Documentation tables
// ---------------------------------------------------------------------------

const TOKEN_TYPE_DOCS: Record<string, string> = {
	Utf8Kw: [
		'**`utf8{word}`** — UTF-8 byte sequence generator.',
		'',
		'Converts the characters of a bare identifier to their UTF-8 byte values and yields them',
		'cyclically. Inspired by `"coffee".ascii` in SuperCollider.',
		'',
		'```flux',
		'note lead utf8{coffee}          // bytes: 99 111 102 102 101 101',
		'note lead [utf8{hello} 0 2]     // utf8 as a cycling scalar element in a list',
		'```',
		'',
		'The identifier inside `{}` is treated as a literal string — it is not looked up as a',
		'variable. `utf8` must be written adjacent to `{` with no space.'
	].join('\n'),

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

	Gauss: [
		'**`N gauss M`** — gaussian (normal) distribution.',
		'',
		'Mean = N, standard deviation = M.',
		'',
		'```flux',
		'0gauss4  // Pgauss(0, 4)',
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

	Brown: [
		'**`N brown M m S`** — brownian motion (Perlin noise).',
		'',
		'Walks randomly within [N, M] with a maximum step of S per event.',
		'',
		'```flux',
		'0brown10m2  // Pbrown(0, 10, 2)',
		'```'
	].join('\n'),

	BroStep: [
		'**`m`** — max-step separator in brownian generators.',
		'',
		'`0brown10m2` → min=0, max=10, max\\_step=2'
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

	Geom: [
		'**`N geom M x L`** — geometric (exponential) interpolation.',
		'',
		'Generates L values from N to M with exponential spacing.',
		'',
		'```flux',
		'2geom7x8',
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
		'Common modifiers: `lock`, `eager(n)`, `stut`, `maybe`, `legato`, `offset`, `at`, `n`, `shuf`, `pick`, `arp`, `rev`, `mirror`, `bounce`'
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
		'[1 2 3]           // 1, 2, 3, 1, 2, 3, ...',
		"[1 2 3]'shuf      // shuffle then traverse",
		"[1 2 3]'pick      // uniform random element each time",
		"[1 2?2 3]'pick    // weighted random (probs 0.25/0.5/0.25)",
		"[0..10]'arp       // arpeggiate ascending (default \\up)",
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
		'Uniform random by default. Optional per-element `?n` weights make selection proportional; unweighted elements default to weight 1. `?0` means the element is never picked. Equivalent to Prand / Pwrand.',
		'',
		'```flux',
		"[1 2 3 4]'pick        // uniform",
		"[1 2?2 3]'pick        // probs 0.25 / 0.5 / 0.25",
		"[1?0.5 2?1 3?2]'pick  // probs 0.14 / 0.29 / 0.57",
		'```'
	].join('\n'),

	arp: [
		"**`'arp`** — arpeggiate: collect cycle output, deduplicate, and traverse.",
		'',
		'Default algorithm is `\\up`. Rests are filtered before arpeggiation.',
		'Duplicates are removed by numeric equality (first-occurrence order preserved).',
		"Cannot be combined with `'shuf` or `'pick` — choose one traversal strategy.",
		'',
		'**Algorithms:**',
		'- `\\up` — ascending (default)',
		'- `\\down` — descending',
		'- `\\inward` / `\\converge` — pincer from both ends toward the middle',
		'- `\\outward` / `\\diverge` — starts at middle, expands outward',
		'- `\\updown` — ascending then descending palindrome, no repeated endpoints (natural length = 2×(N−1))',
		'',
		"**Length override** `'arp(\\algorithm n)`: cycles the natural traversal to produce exactly n values.",
		'',
		'```flux',
		"[0..10]'arp              // \\up — 0 1 2 3 4 5 6 7 8 9 10",
		"[0..10]'arp(\\down)       // 10 9 8 7 6 5 4 3 2 1 0",
		"[0..10]'arp(\\updown)     // 0..10..1 (20 values)",
		"[0..10]'arp(\\down 16)    // 16 values, cycling \\down traversal",
		"[0 5 2 7]'arp(\\inward)   // inward from sorted [0 2 5 7]",
		'```'
	].join('\n'),

	tail: [
		"**`'tail(seconds)`** — release anonymous FX after n seconds of silence.",
		'',
		'```flux',
		'note [0 2 4 7] | fx("lpf")\'cutoff(1200)\'tail(4)',
		'```'
	].join('\n'),

	rev: [
		"**`'rev`** — reverse the event array each cycle.",
		'',
		"Operates on the evaluated event array _after_ traversal (`'shuf`, `'pick`, `'arp`). Single-element sequences are unchanged.",
		'',
		'```flux',
		"[1 2 3 4]'rev     // plays as [4 3 2 1]",
		"[1~4]'rev         // this cycle's random draws, reversed",
		'```'
	].join('\n'),

	mirror: [
		"**`'mirror`** — palindrome with repeated endpoints.",
		'',
		'Appends the reverse of the event array (excluding only the first element of the reverse, so both original endpoints appear twice). Natural length = 2N − 1. Single-element is a no-op.',
		'',
		'```flux',
		"[1 2 3]'mirror    // [1 2 3 2 1] — 5 events",
		"[0..3]'mirror     // [0 1 2 3 2 1 0] — 7 events",
		'```'
	].join('\n'),

	bounce: [
		"**`'bounce`** — ping-pong palindrome without repeated endpoints.",
		'',
		'Appends the reverse with both endpoints removed. Natural length = 2(N − 1). Single-element is a no-op.',
		'',
		'```flux',
		"[1 2 3]'bounce    // [1 2 3 2] — 4 events",
		"[0..3]'bounce     // [0 1 2 3 2 1] — 6 events",
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
	tempo: '**`tempo`** — global tempo in BPM.',
	buf: [
		'**`@buf(\\\\name)`** — buffer selection for `slice` and `cloud`.',
		'',
		'Specifies which buffer a `slice` or `cloud` pattern operates on. Accepts a `\\\\symbol` or any sequence generator for per-cycle buffer selection.',
		'',
		'```flux',
		'@buf(\\\\myloop) slice drums [0 2 4 8]',
		"@buf([\\\\loopA \\\\loopB]'pick) slice drums [0 4 8 12]",
		'```',
		'',
		'`@buf` on `sample` is a semantic error — buffer selection in `sample` is per-event inside the list.'
	].join('\n')
};

// ---------------------------------------------------------------------------
// SynthDef parameter hover
// ---------------------------------------------------------------------------

/**
 * Build hover content for a `"param` token (e.g. `"amp`).
 *
 * @param paramName - The parameter name (without the leading `"`).
 * @param activeSynthDef - The SynthDef name in scope, if known.
 * @param synthdefMetadata - Runtime SynthDef metadata.
 */
function getParamHover(
	paramName: string,
	activeSynthDef: string | undefined,
	synthdefMetadata: SynthDefMetadata
): HoverResult | null {
	type SpecEntry = {
		default?: number;
		min?: number;
		max?: number;
		unit?: string;
		curve?: number | string;
	};
	let spec: SpecEntry | undefined;
	let defName: string | undefined;

	if (activeSynthDef && activeSynthDef in synthdefMetadata) {
		spec = synthdefMetadata[activeSynthDef].specs[paramName] as SpecEntry | undefined;
		defName = activeSynthDef;
	} else {
		// Search all known SynthDefs for this param name
		for (const [name, def] of Object.entries(synthdefMetadata)) {
			if (paramName in def.specs) {
				spec = def.specs[paramName] as SpecEntry;
				defName = name;
				break;
			}
		}
	}

	if (!spec) return null;

	const lines = [
		`**\`"${paramName}\`** — direct SynthDef argument${defName ? ` (\`${defName}\`)` : ''}.`,
		'',
		`| Property | Value |`,
		`| -------- | ----- |`,
		spec.default !== undefined ? `| Default  | ${spec.default} |` : null,
		spec.min !== undefined ? `| Min      | ${spec.min} |` : null,
		spec.max !== undefined ? `| Max      | ${spec.max} |` : null,
		spec.unit ? `| Unit     | ${spec.unit} |` : null
	]
		.filter(Boolean)
		.join('\n');

	return { contents: lines };
}

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
 * @param activeSynthDef - The SynthDef name currently in scope, used for
 *   `"param` token hover.
 * @param synthdefMetadata - Runtime SynthDef metadata (loaded via fetch). If not
 *   provided, `"param` tokens return null.
 */
export function getHover(
	token: IToken,
	prevTokenName?: string,
	activeSynthDef?: string,
	synthdefMetadata: SynthDefMetadata = {}
): HoverResult | null {
	const typeName = token.tokenType.name;

	// ParamSigil tokens: `"amp`, `"pan`, etc. — show SynthDef parameter details.
	if (typeName === 'ParamSigil') {
		const paramName = token.image.slice(1); // strip leading `"`
		return getParamHover(paramName, activeSynthDef, synthdefMetadata);
	}

	// Non-identifier tokens: runtime docs → hardcoded tables fallback.
	if (typeName !== 'Identifier') {
		const docKey = TOKEN_TYPE_DOC_KEY[typeName];
		if (docKey) {
			const md = getDocMarkdown(docKey);
			if (md) return { contents: md };
		}
		const doc = TOKEN_TYPE_DOCS[typeName];
		return doc ? { contents: doc } : null;
	}

	// Identifier — resolve by context first, preferring runtime docs then
	// falling back to the image-based tables.
	const image = token.image;

	if (prevTokenName === 'Tick') {
		const md = getDocMarkdown(`'${image}`);
		if (md) return { contents: md };
		const doc = MODIFIER_DOCS[image];
		if (doc) return { contents: doc };
	}

	if (prevTokenName === 'At' || prevTokenName === 'Set') {
		const md = getDocMarkdown(`@${image}`);
		if (md) return { contents: md };
		const doc = DECORATOR_DOCS[image];
		if (doc) return { contents: doc };
	}

	// Image-based fallbacks (works when the preceding token is out of hover range).
	// Try runtime-docs for both modifier and decorator flavours of the bare
	// identifier before touching the hardcoded tables.
	const modMd = getDocMarkdown(`'${image}`);
	if (modMd) return { contents: modMd };

	const modDoc = MODIFIER_DOCS[image];
	if (modDoc) return { contents: modDoc };

	const scaleDoc = SCALE_DOCS[image];
	if (scaleDoc) return { contents: scaleDoc };

	const decMd = getDocMarkdown(`@${image}`);
	if (decMd) return { contents: decMd };

	const decDoc = DECORATOR_DOCS[image];
	if (decDoc) return { contents: decDoc };

	return { contents: TOKEN_TYPE_DOCS['Identifier']! };
}
