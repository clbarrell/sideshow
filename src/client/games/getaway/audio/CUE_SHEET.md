# Getaway cue sheet

Getaway uses a small, dry toy-heist effects set with no speech and no music. The room should stay open for teammates shouting plans. All samples are repository-local MP3 files; a bounded Web Audio fallback preserves timing when a sample cannot load. Every cue has a Canvas or phone-state equivalent.

| cue / file | gameplay meaning | ElevenLabs v2 generation prompt | length | surface | max voices | gain / priority | ducking |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `countdown.mp3` | each final runway beat | Tight wooden toy-block knock with a tiny clockwork click, dry, playful heist game, no voice, no reverb | 0.5s | host | 1 | 0.11 / high | none |
| `go.mp3` | live heist begins | Very short rising toy getaway ignition and bright brass-like game hit, playful, decisive, no melody tail, no voice | 0.7s | host + phone | 1 | 0.16 / critical | action bus -3dB |
| `pickup.mp3` | local robber gains one bag | Quick canvas money-bag rustle with one light coin clink, warm and tactile, no cash-register sound | 0.5s | host + carrier phone | 3 | 0.09 / medium | none |
| `shove.mp3` | shove launches or connects with an empty opponent | Short cloth arm whoosh ending in a padded toy-body bump, comic and soft, no voice | 0.5s | attacker phone + host on empty contact | 2 | 0.08 / medium | none |
| `spill.mp3` | hit knocks one bag loose | Padded body thump followed by one canvas sack and two coins bouncing on stone, playful, readable, not violent | 0.65s | host + victim phone | 3 | 0.14 / high | action bus -2dB |
| `deposit.mp3` | crew banks a haul | Van rear door clunk, several money bags tossed inside, then one compact bright success chime, playful toy heist | 0.8s | host + carrier phone | 2 | 0.16 / critical | action bus -3dB |
| `vault.mp3` | supply closes for final 30 seconds | Heavy bank vault shutter rolling closed and locking with one deep mechanical clunk, stylised, short tail, no alarm | 0.9s | host + phone | 1 | 0.17 / critical | action bus -4dB |
| `finish.mp3` | final crew result lands | Three compact toy-heist victory hits: van door slam, engine chirp, bright coin flourish, under one second, no voice | 1.0s | host | 1 | 0.18 / critical | stop other voices |

The approved first generation batch was created with ElevenLabs v2 as `mp3_44100_128`. One targeted regeneration remains reserved for any cue rejected in mix review. No music is planned: spoken coordination is the main soundtrack and the round already has a clear rise from collection to the closed-vault finish.
