# Borderline cue sheet

Four locally generated ElevenLabs `eleven_text_to_sound_v2` assets, created on 12 September 2026 after the user authorized copying the root checkout's `.env` into this worktree. No music: spoken negotiation is the primary soundscape. Missing audio must never delay an order or phase transition.

| Cue | Meaning / surface | File and original provenance | Duration | Mix intent |
| --- | --- | --- | --- | --- |
| Commit | Host-acknowledged order, relevant phone only | `/audio/borderline/commit.mp3`: soft paper envelope seal and tiny wooden token click | 0.6s | Quiet confirmation, low priority, no repetition while waiting |
| Reveal | Orders lock / shared GO, host | `/audio/borderline/reveal.mp3`: coordinated thick-card flip and wooden tabletop tap | 1.0s | One cue per phase change, higher priority than captures |
| Capture | Territory changes, one batched host cue | `/audio/borderline/capture.mp3`: wooden flag peg planted in cardboard with paper flutter | 0.8s | One cue for the simultaneous battle, not ten overlapping impacts |
| Score | Points banked / final result, host | `/audio/borderline/score.mp3`: ink stamp on thick paper and bright wooden clink | 1.0s | Brief punctuation; no sustained music or repeated per-player chimes |

Exact prompts and generation parameters are recorded in `docs/concepts/borderline-audio-provenance.json`. One accepted draft per cue; no regenerations. These replace the temporary reused assets. No key values are copied into client code or provenance. The image mockup remains art direction only.

Runtime contract: preload during teaching, persistent shared master mute, gesture unlock, bounded simultaneous voices, short gain ramps, quiet procedural fallback, no deferred playback after destruction. Every cue has a visible order/phase/flag/score equivalent. Inspect actual runtime gain levels and room mix during verification; real group audio comfort remains a playtest question.


## Spoken tutorial — 18 September 2026

Five host-only narration clips accompany the numbered introduction. The stock **Daniel – Steady Broadcaster** voice supplies a mature, authoritative British delivery for a fictional commander; this is not an imitation of a real actor. Files are `tutorial-1.mp3` through `tutorial-5.mp3`, generated once with the ElevenLabs text-to-speech SDK. The sound-effects endpoint is not used for speech. Exact shared tutorial scripts and generation parameters are in `borderline-narration-provenance.json`.

Clip lengths are 12.15, 14.65, 13.32, 14.29 and 15.88 seconds. The tutorial schedule leaves a short reading pause after each. Speech is optional, preloaded, plays only once per authoritative lesson on the host, obeys the existing master mute, and stops on lesson change or teardown. Missing clips leave the text lesson and timing intact. No narration should emerge late over a subsequent lesson or practice. Existing four sound-effect cues are unchanged.

Generated with the [ElevenLabs speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert); retained as local build assets, with no runtime external generation or API key in the client.
