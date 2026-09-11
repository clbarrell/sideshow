# Drag cue sheet

Seven accepted build-time samples live under `public/audio/drag/`, with their exact source prompts and generation record in [provenance.json](provenance.json). Every cue also has a procedural fallback. Audio is optional. There is no music: the room's negotiation is the soundtrack. Host cues describe shared state; phones receive only their player's lunge, food, warning and respawn/burst feedback.

| Cue / file | Meaning and prompt | Duration | Priority | Max voices | Host / phone gain | Duck |
| --- | --- | ---: | --- | ---: | --- | --- |
| `launch.mp3` | Opening ink swell; see provenance manifest for exact generation prompt | 0.60s | medium | 1 | .22 / .14 | none |
| `go.mp3` | Shared GO release | 0.48s | critical | 1 | .34 / .24 | all lower cues |
| `lunge.mp3` | Local elastic wet snap | 0.48s | medium | 3 | .20 / .28 | none |
| `eat.mp3` | Local satisfying ink plop | 0.48s | low | 4 | .12 / .18 | none |
| `warning.mp3` | Prioritized perimeter alarm | 0.48s | high | 2 | .25 / .25 | lunge/eat |
| `respawn.mp3` | Friendly reform pop; same file at .72 pitch for burst | 0.60s | high | 2 | .27 / .24 | lunge/eat |
| `finish.mp3` | Shared ink-stamp result | 0.80s | critical | 1 | .36 / — | all lower cues |

The accepted seven-file draft is normalized with fixed per-file multipliers derived from the decode report: `go ×7`, `eat ×8`, and every other sample `×.8` before the listed cue gain. Low-priority calls stop accepting at six pending or active voices; each cue also has the cap above. Critical GO, warning, burst/reform and finish cues invalidate pending lower cues and stop lower-priority active samples. Missing files, blocked autoplay, mute and unavailable speakers never block play.
