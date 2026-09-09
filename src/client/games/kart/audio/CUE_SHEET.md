# Backyard Circuit audio cue sheet

The kart mix should feel bright, toy-like, and arcade-fast without fighting the
room. Phones provide the personal, tactile layer; the host provides the shared
party soundtrack.

| Cue | Surface | Trigger and behavior | Mix contract |
| --- | --- | --- | --- |
| Engine loop | Phone + host | Starts after the first interaction. Phone pitch and level follow that kart's host-authoritative speed. Host follows the fastest active kart as a restrained race bed. | One voice per surface. Playback rate 0.72–1.45. Phone max gain 0.20; host max gain 0.10. Smooth changes over 80–120 ms. |
| Turbo | Phone + host | Host confirms a boost activation. | High priority one-shot. Phone gain 0.55; host gain 0.32. Maximum two overlapping voices. Briefly ducks music on host. |
| Crash | Phone + host | A meaningful car-to-car impact, rate-limited by the simulation. | High priority one-shot. Intensity scales 0.65–1.0. Phone gain 0.55; host gain 0.36. Maximum three overlapping host voices. Briefly ducks music. |
| Race music | Host only | Begins during the pre-race countdown and loops through the round. | Upbeat instrumental arcade groove, no vocals. Gain 0.22. Duck roughly 3 dB under turbo/crash. Stop and release on round exit. |

All audio is optional enhancement: missing or blocked files must leave controls,
timing, and scoring fully functional. Mute is persisted per device.
