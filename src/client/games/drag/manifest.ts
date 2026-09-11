import type { GameManifest } from "../registry";

export const manifest: GameManifest = {
  id: "drag",
  name: "Drag",
  tagline: "Eat to grow. Big blobs pull the screen. Lunge to escape. Stay inside the border.",
  minPlayers: 4,
  maxPlayers: 10,
  controls: "Landscape: left thumb steers, right thumb lunges. Growth earns points and pulls the shared frame.",
};
