# Cut & Shut and Split audit implementation

Implemented 11 September 2026 against the retained clarity audits. Changes are confined to each game, its controllers and focused tests; host simulation, opaque shell routing and durable party scoring remain intact.

## Design decisions

Cut & Shut is competitive. Six shared couriers take exactly six moves; any courier finishing on a player’s private destination adds four points. Survival remains a common bonus that does not change relative ranking. The first deal keeps its initial layout. Later deals fold before trading starts, then retain that layout through placement and movement. This preserves the city spectacle while removing the hidden post-decision rearrangement.

Placement is now road → tile → private forecast → confirmation. The phone’s tile order matches the current board, marks the private destination, and draws the actual oriented road. Forecasts use the host’s six-step resolver and current placements, show each courier’s endpoint or failure tile/step, and explicitly warn that other players’ placements may change them. Forecasts consume no card and are sent only to the requesting player; a claimed tile invalidates the preview. A change-tile action preserves correction without stacking a full keypad above the confirmation. Placement lasts 18 seconds, march beats one second, and recaps six seconds. Recaps retain the map, mark failure sites, list finish tiles, and privately identify scoring couriers.

Split retains its stay-linked identity and equal-largest safety. A striped vertical rift first appears at 16 seconds, then every ten seconds. Its position and width freeze at announcement, with a full four-second warning. It targets a survivor nearest the crowd’s horizontal centroid, so stationary separated groups cannot place the warning harmlessly in the gap. Players may dodge together; movement is required, deliberate separation is not. A rift hit promotes the player to the edge with no KO credit. The hypothesis is that a shared dodge disrupts comfortable formations and creates recovery/cooperation moments without imposing an arbitrary cut.

An edge push locks its segment while queued and throughout its existing 0.72-second warning and hit resolution. New aim input cannot redirect an active warning. Scoring is taught as survival +1 per eight seconds, finishing +3 and edge KOs +2. The phone shows current points and the new role’s scoring purpose; the final projector names the score winner or tied winners. The incorrect five-round promise is removed: this is one 55-second heat.

## Focused evidence

- `npm run check`: passed.
- `npm run test:client -- test/client/split-host.test.tsx test/client/split-controller.test.tsx test/client/cut-and-shut-host.test.tsx test/client/cut-and-shut-controller.test.tsx test/client/split-sound.test.tsx test/client/cut-and-shut-sound.test.tsx`: 55 tests passed after final display refinements.
- Added public input/journey tests for committed warning targets, full rift warning and dodge, idle-formation elimination, stable planning layouts, fold-before-market sequencing, private orientation/outcome previews, claimed-tile invalidation and preview-before-confirmation.

## Acceptance still owned by integrated verification

Inspect deliberate placement and trading at 390×844, first and later deal resolution, ten-player projector identities, actual Split rift and edge warnings, audio/reduced motion, and lobby/results return. These focused tests do not prove room comprehension or fun. Human playtest questions: can a newcomer explain a six-step delivery and its failed route, and do rift dodges create enjoyable crowd decisions while keeping the edge role competitive? No human-comprehension or PLAY-READY claim is made here.

## Follow-up: maximum-room routing

Independent review identified Split’s pre-existing 10Hz per-player status fanout as exceeding the shell’s 30 host messages/second limit at four or more players. Split now sends one opaque public batch at the same 10Hz and each phone selects its own frame. No private information is added: roles, scores and targets are already public on the projector. This preserves warning/target/cooldown responsiveness while reducing ten-player steady traffic from 100 to 10 messages/second. A raw-send public host test includes the GO cue burst and checks a maximum of 22 messages in every sliding one-second interval; a controller test verifies correct player selection. TypeScript and all 27 Split host/controller/audio tests pass.

Cut & Shut preview changes are coalesced into its existing targeted 2Hz snapshots, preserving private hands/destinations and leaving steady ten-player traffic at 20 messages/second. The phone acknowledges pending forecast updates. A public host regression sends five preview changes per second from all ten players for ten seconds and verifies no more than 210 targeted snapshots, with the latest choice retained.
