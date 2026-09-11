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
  cues?: NonNullable<TheGunStatusFrame["cue"]>[];
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
    && (frame.cues === undefined || (Array.isArray(frame.cues) && frame.cues.length <= 10 && frame.cues.every((cue) => ["pickup", "shot", "reload", "empty", "shove", "death", "respawn", "warning", "drop"].includes(cue))))
    && (frame.cue === undefined || ["pickup", "shot", "reload", "empty", "shove", "death", "respawn", "warning", "drop"].includes(frame.cue));
}

/** All fighter state is public; one packet replaces ten per-seat packets. */
export interface TheGunStatusBatch {
  t: "theGunStatusBatch";
  players: Record<string, TheGunStatusFrame>;
}

export function theGunStatusForPlayer(value: unknown, id: string): TheGunStatusFrame | null {
  if (isTheGunStatusFrame(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const batch = value as Partial<TheGunStatusBatch>;
  if (batch.t !== "theGunStatusBatch" || !batch.players || typeof batch.players !== "object" || Array.isArray(batch.players)) return null;
  return Object.hasOwn(batch.players, id) && isTheGunStatusFrame(batch.players[id]) ? batch.players[id] : null;
}
