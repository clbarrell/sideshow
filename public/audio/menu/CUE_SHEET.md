# Game selection audio

Created before generation on 2026-09-18. A small, cheerful tactile palette accompanies navigation, choosing a game, and starting play. No music or ambience; silence between actions keeps conversations comfortable.

All cues are one-shots, use the persistent master volume/mute, and have a global maximum of three simultaneous voices. Higher-priority cues replace lower-priority cues at the cap. No ducking is needed because this menu has no music bed. Navigation should be throttled during rapid browsing. Audio is supplementary to existing visual feedback.

| File | Meaning | Generation prompt | Duration | Gain | Priority | Maximum simultaneity | Ducking |
| --- | --- | --- | --- | --- | --- | --- | --- |
| browse.mp3 | Move to another game | Single soft tactile bubble pop with a tiny warm wooden pluck, playful party game menu navigation, rounded attack, dry clean close sound, very short gentle tail, no voice, no music, no harsh high frequencies, one isolated sound. | 0.5 s | 0.15 | 1 | 1 | None |
| select.mp3 | Confirm a game selection | Two quick ascending warm mallet plucks with a soft rubbery pop, cheerful friendly party game selection confirmation, polished compact UI sound, rounded attack and clean short decay, no voice, no music bed, no harsh high frequencies. | 0.7 s | 0.22 | 2 | 1 | None |
| launch.mp3 | Start the selected game | A playful quick ascending three-note marimba flourish ending in a soft sparkling pop, joyful party game start cue, energetic but gentle, rounded attacks, dry polished compact UI sound, no voice, no music bed, no harsh high frequencies. | 1.0 s | 0.25 | 3 | 1 | None |

Generator: ElevenLabs Sound Effects, `eleven_text_to_sound_v2`, prompt influence 0.8, loop false, MP3 44.1 kHz/128 kbps. Approved outputs are cached as the committed files; do not regenerate unchanged briefs. API credentials remain local and are never shipped with the application.
