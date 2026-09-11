import type { GameManifest } from "../registry";

export const manifest: GameManifest = {
  id: "the-gun",
  name: "The Gun",
  tagline: "Hold the gun for +1 each second. Push its holder off for +3.",
  minPlayers: 2,
  maxPlayers: 10,
  controls: "Turn sideways. Move with your left thumb; JUMP and SHOVE—or FIRE—with your right.",
};
