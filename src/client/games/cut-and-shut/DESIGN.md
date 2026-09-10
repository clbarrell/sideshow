# Cut & Shut — buildable concept sheet

**One line:** crooked property dealers trade road strips, stitch a folding city together, then watch six clockwork couriers test every promise at once.

- **The moment:** the route everybody called safe folds into a canal and all six couriers step off on the same beat.
- **Shape:** semi-cooperative public market; private legitimate destination contracts; no elimination.
- **Screen:** one fixed 4×3 isometric board, six labelled couriers, public deal/stitch rail, large fixed clocks. Private contracts never render on the projector.
- **Controls:** portrait tap-a-card, tap-a-player, accept/reject, then tap-a-card and one numbered seam. No drag or simultaneous chord.
- **Ergonomics:** two short phases keep targets at least 44px and avoid fitting bargaining, contracts and map placement onto one phone view. Seat numbers and names supplement colour.
- **Shared agency:** first valid host-received offer or seam claim wins; each player can participate in only one live offer. Recipients choose the return strip. Accepted swaps are public numbered stitches. Rejected, expired, conflicting and malformed actions are explicit no-ops.
- **Escalation:** trade and commit windows stay 24s and 8s. Later folds permute more awkward rows/columns and contracts cross the active courier flow; reading time never shrinks.
- **Eliminated players:** nobody is eliminated. Failed couriers ragdoll into the scenery and return at the next market.
- **Scoring:** each courier finishing on your private contract is worth 4 personal points; every survivor adds 1 shared point to every player. Equal totals share place. The public shared-pot loss makes selfish routing visibly costly.
- **Round length:** 8s launch runway, then four 24s markets, four 8s commits and four six-beat fold/march resolutions; approximately 2m45s plus results.
- **Build cost:** medium — one deterministic host simulation, one private-state controller, no shell protocol changes.
- **Risk:** negotiation may become silent card optimisation or one loud player may dictate seams.
- **Fun hypothesis:** players will make, break and loudly reinterpret public deals while private contracts create readable suspicion, without the interface becoming administrative.
- **Onboarding:** projector shows LOOK DOWN → TRADE ONE ROAD → STITCH A SEAM → LOOK UP; phones show the private contract and only the actions valid in the current phase.
- **Road law:** every labelled courier carries a visible heading arrow and follows the arms players can see. Straights and bends require a matching entrance; junctions continue straight. A missing entrance arm sends the courier into the canal, so the same slab never means different things to different couriers.
- **Readable baseline:** deal one begins as a visible safe perimeter circuit and every courier gets a valid first entry. Later folds rotate and reorder those numbered slabs, so escalation comes from a known route becoming crooked rather than from an unreadable random death field.
- **Launch runway:** eight seconds for cold loading and private hand inspection; final three beats point everyone back to the projector.
- **Art direction:** acid-yellow roads/stitches, oxblood contracts/failures, dusty-lilac slabs/void, ink outlines and hand-painted signboard type built from local system fonts.
- **Animation:** slabs hinge with eased offsets; stitches snap with overshoot; couriers move on six exact beats; failures break into bounded loose fragments. Reduced motion swaps travel/fall movement for stepped state changes.
- **Audio:** dry deal stamp, stitch clack, fold groan, six clockwork ticks, canal drop and result sting. Host carries shared cues; phones use haptics for accepted/rejected/commit feedback. No music so bargaining remains intelligible.
- **Recovery:** disconnect cancels that player's live offer and deterministic auto-play uses their first card plus first free seam. Reconnect receives fresh targeted private state. Late joiners spectate. A missing audio asset falls back to bounded procedural Web Audio.
- **Accessibility:** high contrast ink labels on light tiles, shape glyphs and numbers independent of colour, live regions, 44px targets, muted visual equivalents and reduced-motion rendering.

## Explicit edge decisions

- One live offer locks both sender and recipient. Simultaneous conflicts are settled by host arrival order and the losing action gets fresh state.
- A recipient accepts by choosing exactly one return strip. The swap is atomic; card indices are revalidated at acceptance.
- Offers expire at the market boundary. Commit claims are first-valid; unavailable seams disable immediately on every phone.
- Idle/disconnected players never block a phase. The host assigns their first card to the first free seam in seat order.
- Contracts are seeded and sent only through targeted game payloads. Public status contains destination counts, courier outcomes and stitch participants, never contract ownership.
- Phone snapshots are coalesced onto a 500ms pulse; taps mutate host state immediately, while at most ten targeted private frames are emitted per pulse. This stays below the room host's 30 msg/s sustained budget at ten players.
- All simulation, folds, inputs, scoring and results live in the host game module. The Durable Object only routes opaque `g.d` payloads.
