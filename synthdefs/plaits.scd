// Mutable Instruments Plaits as a sustained oscillator, with the MiPlaits
// UGen of mi-UGens (https://github.com/v7b1/mi-UGens). Only the flux-engine
// engine has this UGen; the stock SuperSonic engine does not.
//
// The class is found by name, because sclang stops at an unknown class name
// in the code. Without the MiPlaits class on the class path (see
// FLUX_ENGINE_DIR in README.md), this file makes no SynthDef.
var plaits = \MiPlaits.asClass;
~lag = 0.03;

if (plaits.isNil) {
	"plaits.scd: no MiPlaits class on the class path; plaits is not compiled".warn;
	~synthdefs = [];
} {
	x = SynthDef(\plaits, {
		var freq = \freq.kr(440, ~lag);
		var gate = \gate.kr(1);
		var amp = \amp.kr(0.2, ~lag);
		var pan = \pan.kr(0, ~lag);
		var out = \out.kr(0);
		var engine = \engine.kr(0);
		var harm = \harm.kr(0.5, ~lag);
		var timbre = \timbre.kr(0.5, ~lag);
		var morph = \morph.kr(0.5, ~lag);
		var atk = \atk.kr(0.01);
		var dec = \dec.kr(0.3);
		var sus = \sus.kr(0.7);
		var rel = \rel.kr(0.5);
		var plaitsEngine, env, sig;

		// engine 0 to 17 selects Plaits engines 0 to 9 and 16 to 23. Engines
		// 10 to 15 (particle noise, string, modal and the three drums) need a
		// trigger to sound as their names say; this SynthDef has no trigger.
		plaitsEngine = engine.round.clip(0, 17);
		plaitsEngine = plaitsEngine + ((plaitsEngine >= 10) * 6);

		// MiPlaits takes a MIDI note, not Hz. cpsmidi keeps the fraction, so
		// microtonal pitch stays exact. Without a trigger and a level input,
		// Plaits bypasses its low-pass gate, so the ADSR envelope below is
		// the only envelope.
		sig = plaits.ar(freq.cpsmidi, plaitsEngine, harm, timbre, morph);

		// A sustaining envelope on gate, for note (a new synth for each
		// event) and mono (one synth, gate and freq set by the runtime).
		env = Env.adsr(atk, dec, sus, rel).kr(Done.freeSelf, gate);
		// The first output is the main output of Plaits; the second (aux) is
		// another variant of the sound and is not used here.
		sig = Pan2.ar(sig[0], pan, amp * env);
		Out.ar(out, sig);
	},
	metadata: (
		credit: "Anders Eskildsen; MiPlaits by Volker Böhm, Plaits by Emilie Gillet (Mutable Instruments)",
		type: \instrument,
		contentTypes: [\note, \mono],
		specs: Dictionary.newFrom([
			\freq, ControlSpec(20, 12000, \exp, 0, 440, "Hz"),
			\amp, ControlSpec(0, 1, \amp, 0, 0.2, "amp"),
			\pan, ControlSpec(-1, 1, \lin, 0, 0, ""),
			\engine, ControlSpec(0, 17, \lin, 1, 0, ""),
			\harm, ControlSpec(0, 1, \lin, 0, 0.5, ""),
			\timbre, ControlSpec(0, 1, \lin, 0, 0.5, ""),
			\morph, ControlSpec(0, 1, \lin, 0, 0.5, ""),
			\atk, ControlSpec(0.001, 4, \exp, 0, 0.01, "seconds"),
			\dec, ControlSpec(0.001, 4, \exp, 0, 0.3, "seconds"),
			\sus, ControlSpec(0, 1, \lin, 0, 0.7, ""),
			\rel, ControlSpec(0.001, 8, \exp, 0, 0.5, "seconds"),
		]),
		description: "Mutable Instruments Plaits as a sustained oscillator. engine selects the synthesis model: 0 virtual analog, 1 waveshaping, 2 two-operator FM, 3 granular formant, 4 additive, 5 wavetable, 6 chords, 7 speech, 8 swarm of sawtooth waves, 9 filtered noise, 10 virtual analog with filter, 11 phase distortion, 12 to 14 six-operator FM banks 1 to 3 (harm selects the patch), 15 wave terrain, 16 string machine, 17 chiptune. harm, timbre and morph are the three main controls of each model. An ADSR envelope on gate (atk, dec, sus, rel) shapes the sound. Needs the flux-engine engine.",
		url: "https://github.com/v7b1/mi-UGens"
	));

	~synthdefs = [x];
};
