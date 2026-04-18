// Stereo one-shot sample player.
// Plays a stereo buffer with optional drive/distortion, pan, pitch shift, and filters.
// The envelope duration is derived from the buffer length and playback rate.
SynthDef(\samplePlayer_stereo, {
	arg amp = 0.1, out = 0, pan = 0,
	buf, cent = 0, rate = 1,
	drive = 0, lpf = 20000, hpf = 20;
	var freqScale = (cent * 0.01).midiratio;
	var dur = BufDur.kr(buf) / rate.abs;
	var sig = PlayBuf.ar(
		numChannels: 2,
		bufnum: buf,
		rate: rate * BufRateScale.kr(buf) * freqScale,
		loop: 0
	);
	sig = (sig * drive.linexp(0, 1, 1, 25)).tanh; // drive/distortion
	sig = sig * (1 - (drive * 0.5)).pow(2.5);

	sig = sig * Env.linen(0.001, dur - 0.002, 0.001).kr(doneAction: 2);

	sig = LPF.ar(sig, lpf);
	sig = HPF.ar(sig, hpf);
	sig = Balance2.ar(sig[0], sig[1], pan, amp);
	Out.ar(out, sig);
},
metadata: (
	credit: "Anders Eskildsen",
	type: \instrument,
	contentTypes: [\sample],
	description: "Stereo one-shot sample player with drive/distortion, pan, pitch-shift (cent), and LP/HP filter. Envelope duration follows the buffer length scaled by playback rate. Selects this variant automatically when the active buffer is stereo.",
	specs: Dictionary.newFrom([
		\amp,   ControlSpec(0, 1, \amp, 0, 0.1, "amp"),
		\pan,   ControlSpec(-1, 1, \lin, 0, 0, ""),
		\cent,  ControlSpec(-1200, 1200, \lin, 0, 0, "cents"),
		\rate,  ControlSpec(0.125, 8, \exp, 0, 1, "x"),
		\drive, ControlSpec(0, 1, \lin, 0, 0, ""),
		\lpf,   ControlSpec(200, 20000, \exp, 0, 20000, "Hz"),
		\hpf,   ControlSpec(20, 8000, \exp, 0, 20, "Hz"),
	]),
	defaultBuffer: "kick",
	buffer_channels: 2,
	url: ""
)).add;

// Mono one-shot sample player.
// Plays a mono buffer with optional drive/distortion, pan, pitch shift, and filters.
SynthDef(\samplePlayer_mono, {
	arg amp = 0.1, out = 0, pan = 0,
	buf, cent = 0, rate = 1,
	drive = 0, lpf = 20000, hpf = 20;
	var freqScale = (cent * 0.01).midiratio;
	var dur = BufDur.kr(buf) / rate.abs;
	var sig = PlayBuf.ar(
		numChannels: 1,
		bufnum: buf,
		rate: rate * BufRateScale.kr(buf) * freqScale,
		loop: 0
	);
	sig = (sig * drive.linexp(0, 1, 1, 25)).tanh; // drive/distortion
	sig = sig * (1 - (drive * 0.5)).pow(2.5);

	sig = sig * Env.linen(0.001, dur - 0.002, 0.001).kr(doneAction: 2);

	sig = LPF.ar(sig, lpf);
	sig = HPF.ar(sig, hpf);
	sig = Pan2.ar(sig, pan, amp);
	Out.ar(out, sig);
},
metadata: (
	credit: "Anders Eskildsen",
	type: \instrument,
	contentTypes: [\sample],
	description: "Mono one-shot sample player with drive/distortion, pan, pitch-shift (cent), and LP/HP filter. Envelope duration follows the buffer length scaled by playback rate. Selects this variant automatically when the active buffer is mono.",
	specs: Dictionary.newFrom([
		\amp,   ControlSpec(0, 1, \amp, 0, 0.1, "amp"),
		\pan,   ControlSpec(-1, 1, \lin, 0, 0, ""),
		\cent,  ControlSpec(-1200, 1200, \lin, 0, 0, "cents"),
		\rate,  ControlSpec(0.125, 8, \exp, 0, 1, "x"),
		\drive, ControlSpec(0, 1, \lin, 0, 0, ""),
		\lpf,   ControlSpec(200, 20000, \exp, 0, 20000, "Hz"),
		\hpf,   ControlSpec(20, 8000, \exp, 0, 20, "Hz"),
	]),
	defaultBuffer: "kick",
	buffer_channels: 1,
	url: ""
)).add;

~synthdefs = [
	SynthDescLib.at(\samplePlayer_stereo),
	SynthDescLib.at(\samplePlayer_mono)
];
