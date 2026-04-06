
k = SynthDef(\kick, {
    arg pan = 0, amp = 0.2, out = 0, rel = 0.2, cutoff = 8000,
    clickFreq = 500, clickRq = 0.4, clickAmp = 0.5, bodyDelay = 0.005,
    bodyStart = 350, bodyEnd = 50, bodyAmp = 1, bodyTime = 0.045;

    var clickEnv = Env.perc(0.001, 0.02, clickAmp).ar;
    var click = BPF.ar(WhiteNoise.ar, clickFreq, clickRq) * clickEnv;

    var bodyEnv = Env.perc(0.0001, rel, bodyAmp, \lin).delay(bodyDelay).ar(doneAction: 2);
    var body = SinOsc.ar(XLine.ar(bodyStart, bodyEnd, bodyTime)) * bodyEnv;

    var sig = (body + click).tanh;

    sig = LPF.ar(sig, cutoff);
    sig = Pan2.ar(sig, pan, amp);
    Out.ar(out, sig);
},
metadata: (
	credit: "Anders Eskildsen",
	category: \percussive,
	type: \instrument_synth,
	tags: [\kick, \percussive, \drum],
	specs: Dictionary.newFrom([
		\pan, ControlSpec(-1, 1, 2, 0.0, 0, ""),
		\amp, ControlSpec(0, 1, 4, 0, 0.1, "amp"),
		\rel, ControlSpec(0.001, 4, 4, 0, 0.2, "seconds"),
	]),
    description: "A simple kick drum synthesizer. It combines a clicky noise component with a pitched sine wave body, both shaped by their own envelopes. The parameters allow for tweaking the attack, decay, and tonal characteristics of the kick.",
	url: "https://sc.anderseskildsen.eu/05/a-kick/#sammenstning-til-synthdef"
)
);

~synthdefs = [k];