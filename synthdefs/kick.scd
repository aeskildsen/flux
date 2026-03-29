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
});

~synthdefs = [k];