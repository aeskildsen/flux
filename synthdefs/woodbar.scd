// A struck wooden bar, with the PhysWoodbar UGen of isospin
// (https://github.com/aeskildsen/isospin). Only the flux-engine engine has
// this UGen; the stock SuperSonic engine does not.
//
// The class is found by name, because sclang stops at an unknown class name
// in the code. Without the PhysWoodbar class on the class path (see
// FLUX_ENGINE_DIR in README.md), this file makes no SynthDef.
var woodbar = \PhysWoodbar.asClass;

if (woodbar.isNil) {
	"woodbar.scd: no PhysWoodbar class on the class path; woodbar is not compiled".warn;
	~synthdefs = [];
} {
	x = SynthDef(\woodbar, {
		arg out = 0, amp = 0.5, pan = 0, freq = 440, velocity = 0.7,
		decay = 1.1, tilt = 0.42, undercut = 1, hardness = 0.5, position = 0.25,
		grain = 0.2, tube = 0, spread = 0.3;

		// The strike starts when the UGen gate changes from 0 to 1, thus a
		// gate of 1 strikes once at the start of the synth.
		var sig = woodbar.ar(
			freq: freq, gain: velocity, gate: 1,
			decay: decay, tilt: tilt, undercut: undercut, hardness: hardness,
			position: position, grain: grain, tube: tube, spread: spread
		);

		// The two outputs are the pickups at the two ends of the bar.
		sig = Balance2.ar(sig[0], sig[1], pan, amp);
		// Impulse starts the count, so a silent note (amp 0) also frees itself.
		DetectSilence.ar(Mix(sig.abs) + Impulse.ar(0), doneAction: 2);
		Out.ar(out, sig);
	},
	metadata: (
		credit: "Anders Eskildsen",
		type: \instrument,
		contentTypes: [\note],
		specs: Dictionary.newFrom([
			\freq, ControlSpec(20, 5000, \exp, 0, 440, "Hz"),
			\amp, ControlSpec(0, 1, \amp, 0, 0.5, "amp"),
			\pan, ControlSpec(-1, 1, \lin, 0, 0, ""),
			\velocity, ControlSpec(0, 1, \lin, 0, 0.7, ""),
			\decay, ControlSpec(0.02, 6, \exp, 0, 1.1, "seconds"),
			\tilt, ControlSpec(0, 1, \lin, 0, 0.42, ""),
			\undercut, ControlSpec(0, 1, \lin, 0, 1, ""),
			\hardness, ControlSpec(0, 1, \lin, 0, 0.5, ""),
			\position, ControlSpec(0, 0.5, \lin, 0, 0.25, ""),
			\grain, ControlSpec(0, 1, \lin, 0, 0.2, ""),
			\tube, ControlSpec(0, 1, \lin, 0, 0, ""),
			\spread, ControlSpec(0, 1, \lin, 0, 0.3, ""),
		]),
		description: "A physical model of a struck wooden bar: claves, a wooden stick, a xylophone bar or a marimba bar. A mallet strike excites eight modes of the bar, which decay as in real wood: decay sets the decay time of the low modes, tilt how much faster the high modes decay. velocity is the strike velocity (louder and brighter), hardness the mallet, position the strike point, undercut the tuning (0 a uniform bar, 1 a marimba bar), tube a resonator tube. Needs the flux-engine engine.",
		url: "https://github.com/aeskildsen/isospin"
	));

	~synthdefs = [x];
};
