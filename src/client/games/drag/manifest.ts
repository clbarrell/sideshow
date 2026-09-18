import type { GameManifest } from "../registry";

export const manifest: GameManifest = {
  id: "drag",
  name: "Drag",
  tagline: "Eat ink to grow, then swallow smaller players. Lunge to chase or escape. Stay inside the border.",
  minPlayers: 4,
  maxPlayers: 10,
  controls: "Landscape: left thumb steers, right thumb lunges. A clearly larger blob can swallow a smaller player; fresh respawns are briefly protected.",
};
