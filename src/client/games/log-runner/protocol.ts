export type LogRunnerPhoneRole = "runner" | "bank";
export type LogRunnerPhonePhase = "runway" | "live" | "results" | "over";

export interface LogRunnerStatusFrame {
  t: "logRunnerStatus";
  role: LogRunnerPhoneRole;
  phase: LogRunnerPhonePhase;
  interactive: boolean;
  remaining: number;
  cooldown: number;
  queued: boolean;
  status: string;
}

export function isLogRunnerStatusFrame(value: unknown): value is LogRunnerStatusFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<LogRunnerStatusFrame>;
  return frame.t === "logRunnerStatus"
    && (frame.role === "runner" || frame.role === "bank")
    && (frame.phase === "runway" || frame.phase === "live" || frame.phase === "results" || frame.phase === "over")
    && typeof frame.interactive === "boolean"
    && Number.isFinite(frame.remaining)
    && Number(frame.remaining) >= 0
    && Number.isFinite(frame.cooldown)
    && Number(frame.cooldown) >= 0
    && typeof frame.queued === "boolean"
    && typeof frame.status === "string"
    && frame.status.length <= 80;
}
