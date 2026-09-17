export const HEAT_LIMIT = 40;
export const INTERMISSION = 8;

export interface LastMarbleInput {
  x: number;
  y: number;
}

export type LastMarblePhonePhase =
  | "runway"
  | "playing"
  | "out"
  | "intermission"
  | "complete"
  | "spectating";

/** Opaque game payload. The room only routes it between host and phone. */
export interface LastMarbleStatusFrame {
  t: "lastMarbleStatus";
  phase: LastMarblePhonePhase;
  heat: number;
  heats: 5;
  interactive: boolean;
  message?: string;
  nextHeatIn?: number;
  impact?: number;
}

export function isLastMarbleStatusFrame(value: unknown): value is LastMarbleStatusFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<LastMarbleStatusFrame>;
  const phases: LastMarblePhonePhase[] = ["runway", "playing", "out", "intermission", "complete", "spectating"];
  return frame.t === "lastMarbleStatus"
    && phases.includes(frame.phase as LastMarblePhonePhase)
    && Number.isInteger(frame.heat)
    && Number(frame.heat) >= 1
    && Number(frame.heat) <= 5
    && frame.heats === 5
    && typeof frame.interactive === "boolean"
    && (frame.message === undefined || typeof frame.message === "string")
    && (frame.nextHeatIn === undefined || (Number.isFinite(frame.nextHeatIn) && Number(frame.nextHeatIn) >= 0 && Number(frame.nextHeatIn) <= HEAT_LIMIT + INTERMISSION))
    && (frame.impact === undefined || (Number.isFinite(frame.impact) && Number(frame.impact) >= 0 && Number(frame.impact) <= 1));
}
