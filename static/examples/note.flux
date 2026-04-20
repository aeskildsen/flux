// note example — polyphonic melody with layered voices
// Ctrl+Enter to evaluate, Ctrl+. to stop.

set tempo(108)
set key(d minor)

note lead [0 2 3 5 7 5 3 2]'bounce"amp(0.18)
@octave(4)
  note bass [0 _ 0 _ 7 _ 5 _]"amp(0.22)
@octave(6)
  note atmo [0 3 7]'pick'stut(2)"amp(0.08)
