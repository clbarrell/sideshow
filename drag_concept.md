# Drag — eat, chase, escape

**Agar.io-inspired revision; human group playtest pending.**

The earlier prototype made players compete indirectly through scarce food and camera pull. Players could not eat each other. This revision makes the immediate objective visible: collect ink, grow, swallow smaller players and lunge out of trouble. The shared moving frame remains Drag's distinctive pressure.

| | Build contract |
| --- | --- |
| The moment | A large blob closes in; its target lunges away, grows on a fresh food route, and turns the chase around. |
| Shape | Simultaneous free-for-all for 4–10 players. |
| Screen | One fixed-zoom shared camera, bounded size-weighted pull, named blobs and seat marks. The grid shows movement; the warned border keeps the pack together. |
| Controls | Existing landscape joystick under the left thumb; lunge under the right. No new buttons. |
| Shared agency | Everyone contributes to camera pull with diminishing size influence. Movement also creates direct pursuit, interception and escape decisions. |
| Escalation | Constantly available scattered food creates growth and encounters. Size advantage enables eating; smaller players move faster. Warning windows remain generous. |
| Eliminated players | Reform in about two seconds, then return with brief visible protection. Banked points remain. Protection cannot be used to eat other players. |
| Scoring | Preserve banked survival/growth income; eating earns capped growth and a small score bonus. Protection and safe respawns resist farming. |
| Round length | Nine-second practice/countdown followed by a 90-second heat. |
| Build cost | Local host simulation/rendering and onboarding revision; existing controller and audio assets. |
| Risk | Abundant food could make everyone maximum size, while large-player predation could repeatedly punish newcomers. |
| Fun hypothesis | Food routes and size changes create frequent, understandable chases with real escape and comeback opportunities. |
| Onboarding | Explain eating smaller blobs, lunge escape and staying inside the border on the shared screen and phone. Equal-size contact must be harmless. |
| Launch runway | Existing harmless practice, reset, shared countdown and GO; cold-loaded controls appear before play. |
| Art direction | Smooth round, softly deforming ink bodies on the pale grid. Dense scattered ink droplets are their own visual targets; no patch circles or food outlines. Retain colour-independent seat marks and readable names. |
| Animation | Continuous curved silhouettes, growth pops, lunge stretch, eating/burst particles, visible reform/protection and edge countdowns. Reduced motion preserves state cues. |
| Audio | Reuse local eat, burst, respawn, lunge, warning and round cues, with existing capped voices, mute and fallback behavior. No new generation needed. |
| Recovery | Neutralize disconnected input. Rejoin the same seat without gaining protection. Late joiners watch until the next heat. Host remains simulation authority. |
| Accessibility | Seat symbol plus number/name; landscape thumb zones; no rapid flashes or camera shake; muted play remains understandable. |

## Eating and counterplay

Require a clear size advantage and substantial overlap, rather than killing on first contact. Equal-size players can cross safely. Resolve encounters deterministically and do not let a reforming or protected actor eat or be eaten. Growth stays capped, a victim keeps their banked score, and reform is short enough that nobody sits out the heat.

A small blob should outrun a large one in a straight chase. Large players must intercept or use the existing lunge, which spends grown size. The camera speed and four-second border warning retain escape time even with increased player speed. Replenish food throughout the visible safe area so a newly reformed player has an immediate useful action.

## Playtest acceptance

1. Without coaching, players understand that larger blobs eat smaller ones and can explain an eating event.
2. Food remains abundant and readable; players grow quickly without all remaining maximum size throughout the heat.
3. Smaller players escape a pursuer using speed or lunge and return to meaningful play after being eaten.
4. Chasing/interception happens regularly and is more engaging than camping or farming respawns.
5. At ten players, names, bodies, protection and edge warnings remain legible; the shared camera never teleports after eating.
6. Two heats with mixed experience produce reversals and changes of plan. Only a real group can establish whether this is fast-paced and fun.

Exact current constants live in `src/client/games/drag/host.ts`; technical evidence and remaining questions are recorded in [verification](docs/drag-verification.md).
