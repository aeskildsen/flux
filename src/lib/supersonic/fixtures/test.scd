// Source for test.scsyndef, the SynthDef that the integration tests load.
// This SynthDef is a test fixture only. It is not part of the Flux build.
//
// To compile it again, run this from the repository root:
//   sclang src/lib/supersonic/fixtures/test.scd
// The script writes test.scsyndef into this folder.

SynthDef(\test, { |freq = 440, pan = 0, gate = 1, amp = 0.1, out = 0|
	var sig = SinOsc.ar(freq) * EnvGen.kr(Env.asr(0.01, 1, 0.01), gate, doneAction: 2);
	Out.ar(out, Pan2.ar(sig, pan, amp));
}).writeDefFile(thisProcess.nowExecutingPath.dirname);

0.exit;
