// mono example — monophonic bass with gliding pitch
// A single persistent synth node that receives set messages each cycle.
// Ctrl+Enter to evaluate, Ctrl+. to stop.

set tempo(90)
set key(e minor)

@octave(3)
  mono bass [0 0 7 5]"amp(0.3)
@octave(5)
  note chord [0 3 7]'stut(2)'maybe(0.6)"amp(0.1)
