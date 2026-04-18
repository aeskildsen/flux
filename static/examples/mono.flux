// mono example — monophonic bass with gliding pitch
// A single persistent synth node that receives set messages each cycle.
// Ctrl+Enter to evaluate, Ctrl+. to stop.

set(tempo(90) key(e minor))

mono bass @key(e minor) @octave(3) [0 0 7 5] "amp(0.3)
note chord @key(e minor) @octave(5) [0 3 7]'stut(2)'maybe(0.6) "amp(0.1)
