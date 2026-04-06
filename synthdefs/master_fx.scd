a = SynthDef(\master_eq, {
	arg out = 0,
	lo_freq = 80, lo_db = 0,
	mid_freq = 1000, mid_rq = 1, mid_db = 0,
	hi_freq = 8000, hi_db = 0;
	var sig = In.ar(out, 2);
	sig = BLowShelf.ar(sig, lo_freq, 1, lo_db);
	sig = BPeakEQ.ar(sig, mid_freq, mid_rq, mid_db);
	sig = BHiShelf.ar(sig, hi_freq, 1, hi_db);
	ReplaceOut.ar(out, sig);
},
metadata: (
	credit: "Anders Eskildsen",
	type: \fx,
	fx_role: \master,
	specs: Dictionary.newFrom([
		\lo_freq,  ControlSpec(20, 500, 4, 0, 80, "Hz"),
		\lo_db,    ControlSpec(-12, 12, 0, 0, 0, "dB"),
		\mid_freq, ControlSpec(200, 8000, 4, 0, 1000, "Hz"),
		\mid_rq,   ControlSpec(0.1, 4, 4, 0, 1, ""),
		\mid_db,   ControlSpec(-12, 12, 0, 0, 0, "dB"),
		\hi_freq,  ControlSpec(2000, 20000, 4, 0, 8000, "Hz"),
		\hi_db,    ControlSpec(-12, 12, 0, 0, 0, "dB"),
	]),
	description: "A three-band stereo equalizer. Low and high bands use shelf filters (BLowShelf / BHiShelf); the mid band is a peaking EQ (BPeakEQ) with adjustable frequency, bandwidth (rq), and gain.",
	url: ""
));

b = SynthDef(\master_reverb, {
	arg out = 0, mix = 0.2, room = 0.2, damp = 0.5;
	var sig = In.ar(out, 2);
	sig = FreeVerb2.ar(sig[0], sig[1], mix, room, damp, 1);
	ReplaceOut.ar(out, sig);
},
metadata: (
	credit: "Anders Eskildsen",
	type: \fx,
	fx_role: \master,
	specs: Dictionary.newFrom([
		\mix, ControlSpec(0, 1, 0, 0, 0.2, ""),
		\room, ControlSpec(0, 1, 0, 0, 0.2, ""),
		\damp, ControlSpec(0, 1, 0, 0, 0.5, ""),
	]),
	description: "A stereo reverb effect using FreeVerb2. Applies room simulation to a stereo input bus with controls for wet/dry mix, room size, and high-frequency damping.",
	url: ""
)
);

c = SynthDef(\master_dynamics, {
	arg out = 0, comp_thresh = 0.75, limit_thresh = 0.95, amp = 1;
	var sig = In.ar(out, 2);
	// Light compression
	sig = Compander.ar(sig, sig,
        thresh: comp_thresh,
        slopeBelow: 1,
        slopeAbove: 1/2.5,
        clampTime:  0.010,
        relaxTime:  0.200
    );
	// Limiting
	sig = Compander.ar(sig, sig,
        thresh: limit_thresh,
        slopeBelow: 1,
        slopeAbove: 0.01,
        clampTime:  0.005,
        relaxTime:  0.010
    );
	sig = sig * amp;
	ReplaceOut.ar(out, sig);
},
metadata: (
	credit: "Anders Eskildsen",
	type: \fx,
	fx_role: \master,
	specs: Dictionary.newFrom([
		\comp_thresh, ControlSpec(0, 1, 0, 0, 0.75, "amp"),
		\limit_thresh, ControlSpec(0, 1, 0, 0, 0.95, "amp"),
		\amp, ControlSpec(0, 2, 0, 0, 1, "amp"),
	]),
	description: "A stereo dynamics processor combining light compression and a hard limiter. Compression uses a 2.5:1 ratio above threshold; limiting clamps near-peak signals to prevent clipping.",
	url: ""
)
);


~synthdefs = [a, b, c];
