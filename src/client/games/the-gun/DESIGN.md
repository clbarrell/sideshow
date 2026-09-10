# The Gun concept sheet

**The Gun — one loaded weapon falls into a shove-only platform brawl, turning its holder into the room's hunted villain.**

- **The moment:** one player grabs the drop and every other silhouette visibly turns toward them.
- **Shape:** free-for-all with a single rotating villain; nobody is eliminated.
- **Screen:** fixed 16:9 side view. A broad floor and three small platforms keep all ten players in one readable frame. The next drop is marked in world space and repeated in the HUD.
- **Controls:** landscape joystick plus `JUMP` and one context action: `SHOVE` while unarmed, `FIRE` while holding the gun.
- **Ergonomics:** movement sits under the left thumb; jump and action are large independent right-thumb targets. The controller never requires a mid-fight glance to read ammo, reload, or danger.
- **Shared agency:** every player moves and acts independently. Inputs are host-authoritative, continuous movement is coalesced at 20Hz, and jump/action use reload-safe monotonic sequences.
- **Escalation:** a three-second warning precedes every fifteen-second supply drop. Early drops land centrally; later drops alternate exposed ledges and the high centre platform. Warning time never shrinks.
- **Eliminated players:** respawn after three seconds at a protected edge. Death costs position and gun time, never the rest of the round.
- **Scoring:** one party point per completed second holding the gun, plus a three-point bounty for causing the current holder to fall. Gun kills score nothing, preventing the weapon from compounding its own lead.
- **Round length:** 120 live seconds after an eight-second launch runway, followed by a 3.5-second result tableau.
- **Build cost:** medium. The rules are small; predictable platform movement, shove knockback, ray readability, and ten-player tuning are the work.
- **Risk:** a skilled holder may kite forever, or the room may avoid exposed drops. The holder therefore moves 12% slower, cannot shove, reloads for 4.25 seconds, loses the gun at each supply cycle, and is worth a visible bounty.
- **Fun hypothesis:** taking the gun feels powerful for one beat and immediately terrifying because one shot cannot stop a coordinated rush during the reload.
- **Onboarding:** the projector demonstrates `MOVE · JUMP · SHOVE`, then shows `GRAB THE GUN · ONE SHOT · SURVIVE THE RELOAD` before a shared `GO`. Phones expose controls immediately.
- **Launch runway:** eight seconds: identity scan, shove demonstration, gun rule, final three-beat count. Simulation begins only on `GO`.
- **Art direction:** a midnight construction-site arena printed like a fluorescent safety poster—ink navy, concrete cream, hazard amber, signal red, electric cyan—with thick silhouettes and numbered hard-hat crests.
- **Animation:** drop spotlight and cable, pickup shock ring, whole-pack facing snap, recoil, shot tracer, reload dial, shove arcs, bounded debris, respawn beam, short result crown. Reduced motion removes shake and debris while preserving state changes.
- **Audio:** compact industrial cues for countdown, drop warning/impact, pickup, shot, dry fire/reload, shove, death, respawn, and finish. No music; room shouting is the score.
- **Recovery:** disconnect neutralizes input and safely drops the gun; reconnect respawns protected. Late joiners spectate until the next game. Malformed and replayed inputs are ignored.
- **Accessibility:** every player combines colour, seat number, name, glyph, and silhouette variation. The holder has a crown/spotlight and weapon silhouette; reload is a labelled ring; shot line and drop marker do not rely on colour. Muted play is complete.

## Acceptance signals

1. Pickup, one-shot fire, 4.25-second reload vulnerability, shove, holder bounty, death, three-second respawn, and spawn protection are deterministic at public host seams.
2. A supply drop is visible for three seconds, occurs every fifteen seconds, replaces the only gun, and uses increasingly exposed but reachable locations.
3. Gun kills do not score; hold time dominates results; a holder-fall bounty is meaningful but cannot snowball from gun ownership.
4. Ten names, numbers, glyphs, holder state, reload, incoming drop, and shot line remain visible at 1920x1080 without depending on phones.
5. Controllers coalesce movement below router limits, consume discrete actions once, neutralize on blur/disconnect/unmount, and survive full remount sequence state.
6. Late join, disconnect/reconnect, unknown payloads, zero players, cleanup, and tied results have deliberate outcomes.
7. Sustained ten-player simulation/rendering stays below a 16.7ms p95 CPU frame budget in the repository harness.
