# Featherweight Championship audio cue sheet

The mix is a playful backyard title fight: soft wing texture under the thumbs,
wood-and-feather impacts for contact, and a compact brass-and-percussion bed on
the projector. Every rule remains visible, so blocked or missing audio never
changes timing, control, or scoring.

| Cue | Surface | Gameplay meaning and generation prompt | Duration / behavior | Priority and mix contract |
| --- | --- | --- | --- | --- |
| Flap | Phone + host | Close-up cartoon bird wing flap: a clear, full, soft feather whoosh pushing a small pocket of air, rounded and lively with a gentle airy tail; no wooden click, snap, dry percussion, voice, or music. | 0.63s one-shot. Rate-limit each bird; maximum three host voices and one phone voice. | Low. Phone gain 0.22, host gain 0.07. Never ducks other cues. |
| Bump | Phone + host | Classic hand-drawn cartoon collision: a soft padded thump followed immediately by an exaggerated rubbery spring boing with a quick pitch dip and rebound, plus a tiny feather poof; warm and acoustic, with no synth, science-fiction sound, voice, or music. | 0.84s one-shot. Maximum two phone voices and three host voices. | Medium. Phone gain 0.36, host gain 0.18. |
| Crack | Phone + host | Arcade championship knockout: crisp wooden clack, eggshell tick and quick feather burst, punchy but friendly, no explosion, no voice, no music. | 0.9s one-shot. Maximum one phone voice and three host voices. | High. Phone gain 0.48, host gain 0.30; briefly ducks music. |
| Egg result | Phone + host | Classic cartoon reward ding: one clean bright acoustic bell ding with a tiny cheerful second ping and soft wooden pop; simple and warm, with no synth, electronic sweep, science-fiction sparkle, voice, or music bed. | 0.89s one-shot. Pitch down slightly for owner denial; normal pitch for a rival steal. Maximum two voices. | Highest gameplay priority. Phone gain 0.52, host gain 0.38; ducks music for 350ms. |
| Championship bed | Host only | Loopable instrumental backyard sports-broadcast groove, 118 BPM, cheeky muted brass, marching snare, pizzicato bass and handclaps, playful competition, sparse arrangement, no vocals, no solos, leave space for game cues. | 24s seamless loop from the launch runway through results. | Background. Gain 0.16; duck about 4dB under crack and egg-result cues; fade in over 250ms and stop immediately on cleanup. |

The visual countdown and `GO!` remain authoritative. Until a distinct horn is
group-mix tested, `GO!`, respawn, crumble warning, and result reuse the restrained
egg/bump/flap palette rather than adding four more competing files: egg chime at
normal pitch for `GO!`/result, quiet flap for respawn, and bump at reduced gain
for the fixed two-second crumble warning. Missing derived cues never remove the
corresponding text, shield, outline, or countdown state.

The host preloads all cues during the nine-second runway. A phone starts its
personal mix only after a direct controller interaction unlocks audio. The
master mute is persistent per device. The runtime caps polyphony, uses short
gain ramps, and releases every source and gain node on game cleanup.

Generation status: first draft batch generated on 2026-09-09 with ElevenLabs
`eleven_text_to_sound_v2` and `music_v2`. Following player review, flap, bump,
and egg-result received their one targeted regeneration on 2026-09-10; crack
and championship-bed were retained unchanged. The committed MP3 files decode
successfully, match the requested durations, and are served locally as
`audio/mpeg`. The key was read locally from `.env` and is absent from source,
client environment variables, logs, and generated artifacts.
