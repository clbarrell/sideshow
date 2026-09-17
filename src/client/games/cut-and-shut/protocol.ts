export type RoadShape = "straight" | "bend" | "junction";
export type CutPhase = "runway" | "fold" | "planning" | "march" | "recap" | "complete" | "spectator";

export interface PlayerRoad {
  shape: Exclude<RoadShape, "junction">;
  rotation: number;
}

export interface CutAndShutFrame {
  t: "cutAndShutState";
  phase: CutPhase;
  round: number;
  rounds: 4;
  seconds: number;
  road: PlayerRoad | null;
  inputSeq: number;
  safeCouriers: number;
  survivors: number;
  teamScore: number;
  message: string;
}

export type CutAndShutInput =
  | { t: "sync" }
  | { t: "rotate"; round: number; seq: number; rotation: number };

const PHASES: CutPhase[] = ["runway", "fold", "planning", "march", "recap", "complete", "spectator"];
const SHAPES: PlayerRoad["shape"][] = ["straight", "bend"];

export function isCutAndShutFrame(value: unknown): value is CutAndShutFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<CutAndShutFrame>;
  return frame.t === "cutAndShutState"
    && PHASES.includes(frame.phase as CutPhase)
    && Number.isInteger(frame.round)
    && Number(frame.round) >= 1
    && Number(frame.round) <= 4
    && frame.rounds === 4
    && Number.isFinite(frame.seconds)
    && (frame.road === null || Boolean(
      frame.road
      && SHAPES.includes(frame.road.shape as PlayerRoad["shape"])
      && Number.isInteger(frame.road.rotation)
      && Number(frame.road.rotation) >= 0
      && Number(frame.road.rotation) < 4,
    ))
    && Number.isInteger(frame.inputSeq)
    && Number.isInteger(frame.safeCouriers)
    && Number(frame.safeCouriers) >= 0
    && Number(frame.safeCouriers) <= 6
    && Number.isInteger(frame.survivors)
    && Number(frame.survivors) >= 0
    && Number(frame.survivors) <= 6
    && Number.isFinite(frame.teamScore)
    && typeof frame.message === "string";
}
