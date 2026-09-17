export type GetawayPhase = "invalid" | "practice" | "runway" | "live" | "results" | "over" | "spectating";
export type GetawayCue = "countdown" | "pickup" | "shove" | "spill" | "deposit" | "protected" | "go" | "vault" | "finish";

export interface GetawayInput {
  x: number;
  y: number;
  shove?: boolean;
  sync?: boolean;
}

export interface GetawayPhoneFrame {
  t: "getawayState";
  phase: GetawayPhase;
  interactive: boolean;
  connected: boolean;
  crew: "Crimson" | "Cobalt" | null;
  crewShape: "triangle" | "circle" | null;
  bags: number;
  crewBanked: number;
  crewPoints: number;
  crewMultiplier: number;
  remaining: number;
  shoveReady: boolean;
  shoveCooldown: number;
  protected: boolean;
  withdrawn: boolean;
  status: string;
  cue?: GetawayCue;
  /** Changes whenever the projector recreates the host simulation. */
  syncToken?: string;
}

export interface GetawayPhoneFrames {
  t: "getawayStates";
  frames: Record<string, GetawayPhoneFrame>;
}

export function getawayFrameForPlayer(value: unknown, playerId: string): GetawayPhoneFrame | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const direct = value as Partial<GetawayPhoneFrame>;
  if (direct.t === "getawayState") return validFrame(direct) ? direct as GetawayPhoneFrame : null;
  const batch = value as Partial<GetawayPhoneFrames>;
  if (batch.t !== "getawayStates" || !batch.frames || typeof batch.frames !== "object") return null;
  const frame = batch.frames[playerId];
  return validFrame(frame) ? frame : null;
}

function validFrame(value: unknown): value is GetawayPhoneFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<GetawayPhoneFrame>;
  return frame.t === "getawayState"
    && typeof frame.status === "string"
    && typeof frame.interactive === "boolean"
    && typeof frame.bags === "number"
    && typeof frame.crewBanked === "number"
    && typeof frame.crewPoints === "number"
    && typeof frame.crewMultiplier === "number";
}
