# Last Marble audio cue sheet

The mix is dry, tactile, and brief: hard marble-on-marble contact against a
quiet room. There is no music in the grey-box because the movement, warning,
and attribution cues need clean space while the fun hypothesis is tested.

| Cue | Gameplay meaning | Generation prompt | Duration / behavior | Mix contract |
| --- | --- | --- | --- | --- |
| Countdown tick | Shared 3–2–1 and final plate countdown | `Single short dry wooden block tick, playful tabletop game, no reverb, no music, isolated transient` | 0.5 s one-shot; host; priority high; max 1 | Gain 0.23. Never overlaps itself. A visual numeral accompanies it. |
| GO snap | Control becomes live | `Short bright arcade start snap made from a crisp hand clap and glass ping, celebratory but not loud, no voice, no music` | 0.5 s one-shot; host; priority high; max 1 | Gain 0.28. Local haptic mirrors it. |
| Plate crack | Warned plate is about to fall | `Short concrete slab stress crack with one brittle stone snap, clean isolated game sound, no rubble tail, no impact boom` | 0.7 s one-shot at warning start and each visible countdown beat; host; priority critical; max 1 | Gain 0.30. No ducking needed; warning hatch, outline, and numeral are authoritative. |
| Marble clack | Qualified, attributable ram | `Dense glass marble collision, one hard satisfying clack with a tiny ceramic knock, close and dry, no shatter, no ambience` | 0.5 s one-shot; host and both involved phones; priority high; max 3 host / 1 phone | Host gain 0.26, phone 0.34. Playback rate 0.9–1.12 and gain scale with closing speed. 90 ms per-pair cooldown. |
| Fall pop | A marble is eliminated | `Tiny falling whistle ending in a soft cork pop, playful game elimination, under half a second, no voice, no music` | 0.7 s one-shot; host and victim phone; priority high; max 2 host / 1 phone | Host gain 0.27, phone 0.34. Victim haptic mirrors it. |
| Win sting | Heat or five-heat match resolves | `Very short fairground prize sting, three bright toy percussion notes, triumphant and clean, no voice, no sustained music` | 1.2 s one-shot; host; heat uses first 0.8 s, match uses full cue; priority critical; max 1 | Gain 0.30. Other new effects pause for 180 ms. Result banner remains the muted fallback. |

All files are build-time, local assets. They preload during the launch runway;
load or decode failure is swallowed and cannot delay input, timing, physics, or
results. The existing persistent master mute controls the host mix. Phone cues
are host-confirmed so clients never invent a hit or elimination.
