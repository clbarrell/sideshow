import type { BorderlineOrder, EffectiveOrder, Force, OrderMode, PlayerOutcome } from "./rules";

export type BorderlinePhase =
  | "loading"
  | "teach"
  | "practice"
  | "practiceReveal"
  | "countdown"
  | "planning"
  | "reveal"
  | "recap"
  | "complete"
  | "spectator";

export interface BorderlinePublicPlayer {
  id: string;
  name: string;
  seat: number;
  color: string;
  emblem: string;
  score: number;
  territoryCount: number;
  forces: Force[];
  homeProvince: number;
  homeEntries: readonly [number, number];
  connected: boolean;
}

export interface BorderlineFrame {
  t: "borderlineState";
  /** Changes when a refreshed projector restarts this seeded campaign. */
  session: string;
  phase: BorderlinePhase;
  turn: number;
  turns: 9;
  seconds: number;
  inputSeq: number;
  provinceOwners: Array<string | null>;
  players: BorderlinePublicPlayer[];
  legal: { invade: number[]; guard: number[] };
  forces: Force[];
  committed: BorderlineOrder | null;
  fallback: EffectiveOrder;
  outcome?: PlayerOutcome;
  message: string;
}

export type BorderlineInput =
  | { t: "sync" }
  | { t: "order"; turn: number; seq: number; mode: OrderMode; target: number; force: Force };

const PHASES: BorderlinePhase[] = [
  "loading", "teach", "practice", "practiceReveal", "countdown", "planning", "reveal", "recap", "complete", "spectator",
];

export function isBorderlineInput(value: unknown): value is BorderlineInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Partial<BorderlineInput>;
  if (input.t === "sync") return true;
  return input.t === "order"
    && Number.isInteger(input.turn)
    && Number(input.turn) >= 0
    && Number(input.turn) <= 9
    && Number.isInteger(input.seq)
    && Number(input.seq) >= 1
    && Number(input.seq) <= Number.MAX_SAFE_INTEGER
    && (input.mode === "invade" || input.mode === "guard")
    && Number.isInteger(input.target)
    && Number(input.target) >= 1
    && Number(input.target) <= 24
    && (input.force === 1 || input.force === 2 || input.force === 3);
}

export function isBorderlineFrame(value: unknown): value is BorderlineFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<BorderlineFrame>;
  return frame.t === "borderlineState"
    && typeof frame.session === "string"
    && frame.session.length > 0
    && frame.session.length <= 80
    && PHASES.includes(frame.phase as BorderlinePhase)
    && Number.isInteger(frame.turn)
    && Number(frame.turn) >= 0
    && Number(frame.turn) <= 9
    && frame.turns === 9
    && Number.isFinite(frame.seconds)
    && Number(frame.seconds) >= 0
    && Number.isInteger(frame.inputSeq)
    && Array.isArray(frame.provinceOwners)
    && frame.provinceOwners.length === 24
    && Array.isArray(frame.players)
    && Boolean(frame.legal)
    && Array.isArray(frame.legal?.invade)
    && Array.isArray(frame.legal?.guard)
    && Array.isArray(frame.forces)
    && (frame.committed === null || isOrder(frame.committed))
    && isEffectiveOrder(frame.fallback)
    && typeof frame.message === "string";
}

function isOrder(value: unknown): value is BorderlineOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const order = value as Partial<BorderlineOrder>;
  return (order.mode === "invade" || order.mode === "guard")
    && Number.isInteger(order.target)
    && Number(order.target) >= 1
    && Number(order.target) <= 24
    && (order.force === 1 || order.force === 2 || order.force === 3);
}

function isEffectiveOrder(value: unknown): value is EffectiveOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const order = value as Partial<EffectiveOrder>;
  return order.mode === "pass"
    ? order.force === 1 || order.force === 2 || order.force === 3
    : isOrder(value);
}
