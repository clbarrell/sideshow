import type { ComponentType } from "react";
import type { Player, RoundResult } from "../../shared/protocol";
import { manifest as kart } from "./kart/manifest";
import { manifest as lastMarble } from "./last-marble/manifest";
import { manifest as joust } from "./joust/manifest";

export interface GameManifest {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  /** Shown on the lobby card so people know what their thumbs are in for. */
  controls: string;
}

export interface HostContext {
  players: Player[];
  seed: number;
  width: number;
  height: number;
  /** Send opaque data to one phone, or all of them if `to` is omitted. */
  send: (d: unknown, to?: string) => void;
}

/**
 * Everything a game must implement to run on the big screen.
 * The host owns the simulation; the DO only routes input to it.
 */
export interface GameHost {
  onJoin?(p: Player): void;
  onLeave?(id: string): void;
  /** Connectivity may flicker without removing the player's durable seat. */
  onConnectionChange?(id: string, connected: boolean): void;
  /** An input frame from a phone. Shape is entirely the game's business. */
  onInput(playerId: string, d: unknown): void;
  tick(dt: number): void;
  render(c: CanvasRenderingContext2D, w: number, h: number): void;
  resize?(w: number, h: number): void;
  isOver(): boolean;
  results(): RoundResult[];
  destroy?(): void;
}

export interface ControllerProps {
  you: Player;
  send: (d: unknown) => void;
  connected: boolean;
  /** Messages from the host, if the game sends any. */
  last: unknown;
}

interface GameEntry {
  manifest: GameManifest;
  loadHost: () => Promise<{ createHost: (ctx: HostContext) => GameHost }>;
  loadController: () => Promise<{ default: ComponentType<ControllerProps> }>;
}

// Manifests load eagerly (the lobby needs them). Host + controller code is
// split out so adding a game doesn't grow the shell bundle.
export const GAMES: Record<string, GameEntry> = {
  kart: {
    manifest: kart,
    loadHost: () => import("./kart/host"),
    loadController: () => import("./kart/controller"),
  },
  "last-marble": {
    manifest: lastMarble,
    loadHost: () => import("./last-marble/host"),
    loadController: () => import("./last-marble/controller"),
  },
  joust: {
    manifest: joust,
    loadHost: () => import("./joust/host"),
    loadController: () => import("./joust/controller"),
  },
};

export const GAME_LIST = Object.values(GAMES).map((g) => g.manifest);
