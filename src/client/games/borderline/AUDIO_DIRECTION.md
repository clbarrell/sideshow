# Borderline audio direction

The cloud environment had no `ELEVENLABS_API_KEY`, so this prototype uses a bounded, local WebAudio cue set with no downloaded assets. The game remains fully legible while muted or when audio construction fails.

| Cue | Gameplay meaning | Procedural timbre / future generation prompt | Duration | Type | Priority | Max simultaneous | Gain / ducking | Visual equivalent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `commit` | Host accepted this phone's order | Dry folded-paper click, tiny upward wooden pitch | 80ms | One-shot | Medium | 1 on the relevant phone only | Phone 0.035; no duck | `✓ COMMITTED` replaces the draft |
| `lock` | Deadline closed; every order is final | Firm paper folder snap, short downward pitch | 120ms | One-shot | High | 1 | 0.05; no duck | Phones switch to `LOOK UP`; reveal banner appears |
| `go` | Real planning turn opened | Warm two-tone campaign stamp, upward | 240ms | One-shot | High | 1 | 0.065; no duck | Planning timer and `SECRET ORDER` appear |
| `capture` | At least one flag changes in the simultaneous batch | Chunky cardboard token slide into a wooden stop | 180ms | One-shot batch cue | High | 1 per reveal | 0.06; no duck | All completed arrows land and flags change together |
| `hold` | Reveal batch changes no flags | Muted paper counter tap, downward | 160ms | One-shot batch cue | Medium | 1 per reveal | 0.05; no duck | Held/tied battle rings remain on their provinces |
| `score` | Territory scores bank | Small rubber stamp with a warm upward chime | 130ms | One-shot | High | 1 | 0.045; no duck | Score strip increments during `SCORE BANKED` |

Host voices are capped at three and simultaneous battles use one batch cue, preventing ten stacked effects. Phone commit audio is local and owner-specific. The shell's persistent mute remains authoritative.
