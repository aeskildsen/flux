~lag = 0.03;

// DX7 algorithm 5: three parallel 2-op stacks (M->C) summed
//
//   [M1]   [M3]   [M5]
//    |      |      |
//   [C2]   [C4]   [C6]  ->  sum -> out
//
x = SynthDef(\fm, {
	var freq = \freq.kr(440, ~lag);
	var gate = \gate.kr(1);
	var amp = \amp.kr(0.2, ~lag);
	var pan = \pan.kr(0, ~lag);
	var out = \out.kr(0);

	// Per-operator frequency ratios (relative to freq).
	var cRatios = \cRatios.kr([1, 1, 1], ~lag);     // carriers C2, C4, C6
	var mRatios = \mRatios.kr([3.01, 2.01, 4.77], ~lag); // modulators M1, M3, M5

	// Per-modulator FM indices (peak deviation in "index * modFreq" units).
	var indices = \indices.kr([2.4, 1.8, 5.1], ~lag);

	// Gaussian jitter on indices, re-rolled per note.
	var idxJitter = \idxJitter.kr(0.157);

	// Per-stack detune in cents, applied to carriers for chorus-y life.
	var detuneCents = \detuneCents.kr([-4, 0, 5], ~lag);

	// Slow LFO depth (fraction) modulating indices over time.
	var lfoDepth = \lfoDepth.kr(0.12 + 0.4, ~lag);
	var lfoRate = \lfoRate.kr(0.6, ~lag) * ({NRand(-0.1, 0.1, 3)} ! 3);

	// Per-operator ADSR envelopes. Carriers gate amplitude; modulators gate index.
	var cAtt = \cAtt.kr([0.005, 0.01, 0.02]);
	var cDec = \cDec.kr([0.15, 0.2, 0.25]);
	var cSus = \cSus.kr([0.6, 0.4, 0.35]);
	var cRel = \cRel.kr([0.5, 0.7, 0.9]);

	var mAtt = \mAtt.kr([0.002, 0.005, 0.01]);
	var mDec = \mDec.kr([0.08, 0.15, 0.03]);
	var mSus = \mSus.kr([0.2, 0.1, 0.0]);
	var mRel = \mRel.kr([0.4, 0.5, 0.8]);

	// Per-stack mix.
	var stackMix = \stackMix.kr([1, 0.2, 0.3], ~lag);

	var cEnvs, mEnvs, jitteredIdx, lfo, scaledIdx;
	var mods, cars, sig;

	cEnvs = Env.adsr(cAtt, cDec, cSus, cRel).kr(0, gate);
	mEnvs = Env.adsr(mAtt, mDec, mSus, mRel).kr(0, gate);

	// Per-note gaussian jitter around each index.
	jitteredIdx = indices + ({ NRand(idxJitter.neg, idxJitter, 3) } ! 3);

	// Slow per-stack LFO (phase-offset so stacks "breathe" independently).
	lfo = SinOsc.kr(lfoRate, [0, 2pi/3, 4pi/3]) * lfoDepth + 1;

	scaledIdx = jitteredIdx * mEnvs * lfo;

	mods = SinOsc.ar(freq * mRatios) * freq * mRatios * scaledIdx;
	cars = SinOsc.ar((freq * cRatios * (detuneCents * 0.01).midiratio) + mods) * cEnvs;

	/*sig = Mix(cars * stackMix);
	sig = Pan2.ar(sig, pan, amp);*/
	sig = cars * stackMix;
	sig = Splay.ar([sig[2], sig[0], sig[1]], Line.kr(0.3, 0.7, 2), amp, pan);
	Out.ar(out, sig);
	DetectSilence.ar(sig, doneAction: 2);
},
metadata: (
	credit: "Anders Eskildsen",
	type: \instrument,
	specs: Dictionary.newFrom([
		\freq, ControlSpec(20, 20000, \exp, 0, 440, "Hz"),
		\amp, ControlSpec(0, 1, \amp, 0, 0.2, "amp"),
		\pan, ControlSpec(-1, 1, \lin, 0, 0, ""),
	]),
	description: "DX7-inspired FM synthesizer using algorithm 5: three parallel 2-operator (modulator->carrier) stacks summed to a stereo output. Each stack has its own ADSR envelopes, frequency ratios, FM index, detuning, and LFO phase, giving a lively, chorus-like movement. Defaults produce a bell-flavoured pitched tone with a clear fundamental.",
	url: ""
)).add;

~synthdefs = [x];
