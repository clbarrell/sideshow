export interface TheGunInput {
  x: number;
  jump?: number;
  action?: number;
  sync?: true;
}

export type TheGunPhonePhase = "runway" | "live" | "results" | "over" | "spectating";

export interface TheGunStatusFrame {
  t: "theGunStatus";
  phase: TheGunPhonePhase;
  interactive: boolean;
  actionState?: "ready" | "get-ready" | "protected" | "cooldown" | "down";
  armed: boolean;
  loaded: boolean;
  reload: number;
  respawn: number;
  remaining: number;
  status: string;
  cue?: "pickup" | "shot" | "reload" | "empty" | "shove" | "death" | "respawn" | "warning" | "drop";
}

export function isTheGunStatusFrame(value: unknown): value is TheGunStatusFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<TheGunStatusFrame>;
  return frame.t === "theGunStatus"
    && ["runway", "live", "results", "over", "spectating"].includes(String(frame.phase))
    && typeof frame.interactive === "boolean"
    && (frame.actionState === undefined || ["ready", "get-ready", "protected", "cooldown", "down"].includes(frame.actionState))
    && typeof frame.armed === "boolean"
    && typeof frame.loaded === "boolean"
    && Number.isFinite(frame.reload) && Number(frame.reload) >= 0
    && Number.isFinite(frame.respawn) && Number(frame.respawn) >= 0
    && Number.isFinite(frame.remaining) && Number(frame.remaining) >= 0
    && typeof frame.status === "string" && frame.status.length <= 100
    && (frame.cue === undefined || ["pickup", "shot", "reload", "empty", "shove", "death", "respawn", "warning", "drop"].includes(frame.cue));
}
