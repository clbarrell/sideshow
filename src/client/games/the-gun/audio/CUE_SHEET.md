# The Gun cue sheet

The current build uses a complete offline procedural Web Audio mix. Generated samples are deferred because `ELEVENLABS_API_KEY` is unavailable in this worktree; no browser requests placeholder or venue-network assets.

| cue / reserved file | gameplay meaning | generation prompt | length | max voices | gain / priority | ducking |
| --- | --- | --- | --- | --- | --- | --- |
| `countdown.mp3` | final hands-ready beat | Tight metallic scaffold tap, dry, no reverb, no voice | 0.12s | 1 | 0.12 / high | none |
| `go.mp3` | shared start | Two-note rising industrial game-show hit, metal and rubber, upbeat, no voice | 0.35s | 1 | 0.18 / critical | lower action bus 3dB |
| `warning.mp3` | incoming gun landing zone appears | Short construction warning chirp followed by a low cable tension knock, calm and readable | 0.32s | 1 | 0.13 / high | none |
| `drop.mp3` | gun lands | Compact heavy metal case impact on concrete, no explosion, short tail | 0.48s | 1 | 0.2 / critical | lower action bus 3dB |
| `pickup.mp3` | villain role rotates | Fast electric latch followed by one ominous bass pulse, powerful then uneasy | 0.5s | 1 | 0.2 / critical | lower action bus 4dB |
| `shot.mp3` | one lethal shot | Stylised arcade nail-gun crack with a sharp mechanical tail, not realistic or harsh | 0.38s | 2 | 0.19 / critical | lower action bus 4dB |
| `reload.mp3` | reload completes | Chunky magazine latch and spring click, positive but restrained | 0.3s | 1 | 0.12 / high | none |
| `empty.mp3` | trigger pulled while reloading | Dry mechanical click with tiny hollow resonance | 0.12s | 1 | 0.08 / medium | none |
| `shove.mp3` | unarmed shove connects | Padded body bump with a short boot scrape, comic, no voice | 0.25s | 3 | 0.11 / medium | none |
| `death.mp3` | local player dies | Descending rubber-and-metal tumble ending in a soft impact | 0.45s | 2 | 0.16 / critical | none |
| `respawn.mp3` | local player returns | Brief upward electrical zip and safety latch | 0.28s | 2 | 0.1 / high | none |
| `finish.mp3` | final villain crowned | Three-hit industrial victory sting, metal clanks and one low synth pulse, no voice | 0.8s | 1 | 0.2 / critical | stop other voices |

No music is planned. Reload silence, shouted pursuit, and the contrast between warning chirp and shot crack are the desired room mix. One draft and one targeted regeneration per rejected cue remain the production limit when credentials become available.
