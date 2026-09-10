import type { GameManifest } from "../registry";

export const manifest: GameManifest = {
  id: "log-runner",
  name: "Log Runner",
  tagline: "Read the river, jump or duck together, then heckle from the bank.",
  minPlayers: 1,
  maxPlayers: 10,
  controls: "Turn sideways. JUMP low roots, DUCK high branches. Washed off? Throw branches.",
};
