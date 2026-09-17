# Cut & Shut — cooperative circuit

**One line:** each player turns one named road tile while the room tries to keep six couriers on a folding city circuit.

- **The moment:** the last road turns into place, the projector reads `6 / 6 SAFE`, and six couriers sweep around the city together.
- **Shape:** fully cooperative, simultaneous route repair with no elimination and one shared score.
- **Screen:** one fixed 4 × 3 isometric city. Ten perimeter worksites form a closed circuit; two interior junctions stay neutral. Owned roads carry the player's name and seat colour.
- **Controls:** portrait phone with one large **Turn road** button. Each tap rotates the player's straight or bend road clockwise by a quarter turn.
- **Shared agency:** every active player owns a different perimeter worksite. Players read connected roads on the projector and talk through repairs. The only correctness signal is the public `X / 6 SAFE` forecast; phones never reveal an individual answer.
- **Scoring:** every surviving courier adds one point to every active player each round. Everyone receives the same final score and shares first place.
- **Round shape:** 8s launch runway; 18s planning; six 1s movement beats; 5s recap. A 1.4s fold happens between rounds and always finishes before the next planning window. Four rounds end on a 5s team result.
- **Solvability:** each round is built from a safe perimeter circuit. Only player-owned roads begin rotated incorrectly. Unowned perimeter roads and the two junctions remain safe, so 2–10 players always receive a solvable board.
- **Road law:** directions are derived only from the arms visible on each tile. Straights pass through, bends turn, and junctions continue straight. A missing entrance arm sends a courier off the road.
- **Onboarding:** the projector says the goal, points players to the road bearing their name, and shows the courier count. The phone shows that same road orientation and one action.
- **Escalation:** folds reassign physical tiles and ownership between rounds while keeping the same readable circuit law. The shared planning time stays constant.
- **Recovery:** a disconnected or departed player's road immediately returns to its safe orientation. Reconnecting restores the same ownership and current orientation. Late joiners spectate until the next game.
- **Input fairness:** phones send explicit desired rotations with round and monotonic sequence numbers. The host ignores malformed, stale, replayed, and wrong-round actions, and snapshots are coalesced to 2Hz.
- **Accessibility:** names and road geometry carry identity beyond colour. The phone has one large labelled target, visible focus, disabled/offline states, safe-area padding, and reduced-motion behavior.

## Removed complexity

The road market, card hands, offers, private contracts, personal destinations, numbered tile decoding, placement previews, confirmation step, ready state, trade count, and personal scoring were removed. None helped the core folding-road spectacle; together they made players administer a market on their phones instead of reading and repairing the shared city.
