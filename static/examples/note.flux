// note example — polyphonic FM melody with stochastic spice
// Uses the built-in FM synth (DX7 algorithm 5).
// Ctrl+Enter to evaluate, Ctrl+. to stop.

set(tempo(108) key(d minor))

note lead @key(d minor) [0 2 3 5 7 5 3 2]'bounce "amp(0.18)
note bass @key(d minor) @octave(4) [0 _ 0 _ 7 _ 5 _] "amp(0.22)
note atmo @key(d minor) @octave(6) [0 3 7]'pick'stut(2) "amp(0.08)
