import type { GameManifest } from "../registry";

export const manifest: GameManifest = {
  id: "split",
  name: "Split",
  tagline: "Stay linked, dodge rifts, then strike back from the edge.",
  minPlayers: 3,
  maxPlayers: 10,
  controls: "Portrait. One thumbstick: move, or aim and push the frame after you are cut. Alive +1 / 8s, finish +3, edge KOs +2.",
};
