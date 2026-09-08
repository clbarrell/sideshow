# Production quality bar

Apply this bar to the complete projector-and-phones journey. A game may deliberately omit an item only when the omission strengthens the design and the verification verdict records why.

## Party legibility

- A first-time player can join, identify themself, understand the goal and controls, and act without a spoken tutorial.
- State, threats, scores, timers, and outcomes read from across a room on a washed-out 16:9 projector.
- Ten players remain distinguishable by silhouette, label, and seat identity rather than colour alone.
- Phones are glance-light controllers with large targets, safe-area support, and clear pressed/disconnected/ready feedback.

## Game feel

- Every meaningful action has immediate visual response; important actions also receive an audio or haptic cue.
- Arrival, countdown, action, impact, scoring, round end, and return-to-lobby transitions are intentionally animated.
- Motion uses anticipation, easing, overshoot, squash/pop, trails, particles, camera response, fades, or other effects appropriate to the style. Effects reinforce state and timing rather than obscure play.
- Reduced-motion behavior preserves clarity without relying on large movement, flashes, or continuous camera shake.
- The first ten seconds contain no dead air. The final result lands as a short spectacle before controls move on.

## Visual production

- Establish a coherent art direction before implementation: palette, shapes, typography, texture, lighting, and motion language.
- Use `$imagegen` for raster concept exploration and production assets when it improves the result; use native canvas/CSS/SVG for shapes that need perfect scaling, tinting, or animation.
- Generated assets share perspective, lighting, outline weight, palette, and resolution. Crop, compress, and preload them; do not depend on network-fetched fonts or images at the venue.
- Every asset has a clear in-game job. Decorative density yields to player and hazard readability.

## Audio production

- Design a cue sheet before generating audio: cue name, gameplay meaning, prompt, duration, loop/one-shot, priority, maximum simultaneity, gain, and ducking.
- Use `$sound-effects` for UI and gameplay cues and `$music` only when music improves the game. Generate locally at build time, commit browser-ready files, cache acceptable outputs, and avoid repeat generations that spend credits without changing the brief.
- Audio plays on the host only. Unlock audio from an explicit host gesture, preload it before the countdown, provide persistent master mute/volume, cap polyphony, and use short gain ramps or crossfades.
- The game remains fully playable when muted, autoplay is blocked, an asset is missing, or speakers are unavailable.
- Mix cues by importance: instructions and round-state cues beat ambience; repeated actions do not become harsh or exhausting.

## Resilience and performance

- Minimum and maximum player counts are enforced. Join, late join, disconnect, reconnect, phone lock, host refresh, socket loss, and asset-load failure have deliberate outcomes.
- Input remains fair under expected network jitter; escalation never shrinks reaction windows beneath usable latency.
- The projector sustains smooth animation at its target resolution without unbounded particles, allocations, audio voices, or layout work in the frame loop.
- Game cleanup removes animation frames, timers, listeners, and audio nodes before the next game.

## Accessibility and comfort

- Contrast, text size, touch targets, keyboard/focus behavior where relevant, colour independence, reduced motion, and muted-audio alternatives are checked on the affected surfaces.
- Rapid flashes, sustained shake, surprise volume spikes, and unreadably fast instructions are absent.
