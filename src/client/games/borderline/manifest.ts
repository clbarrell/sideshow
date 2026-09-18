import type { GameManifest } from "../registry";

export const manifest: GameManifest = {
  id: "borderline",
  name: "Borderline",
  tagline: "Make a deal. Secretly invade or guard. Then watch every border move at once.",
  minPlayers: 3,
  maxPlayers: 10,
  controls: "Portrait: choose Invade or Guard, a numbered province, one Strength card, then Confirm order.",
};
