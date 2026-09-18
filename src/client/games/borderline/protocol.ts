export type BorderlinePhase = "runway" | "practice" | "practiceReveal" | "countdown" | "planning" | "reveal" | "recap" | "complete" | "spectator";
export type OrderMode = "invade" | "guard";
export type Force = 1 | 2 | 3;

export interface BorderlineOrder {
  mode: OrderMode;
  target: number;
  force: Force;
}

export interface ProvinceFrame {
  id: number;
  ownerId: string | null;
  ownerName: string | null;
  ownerColor: string | null;
  ownerEmblem: string | null;
}

export interface BorderlineFrame {
  t: "borderlineState";
  phase: BorderlinePhase;
  turn: number;
  turns: 9;
  seconds: number;
  tutorialStep: number;
  factionName: string;
  emblem: string;
  columns: number;
  rows: number;
  provinces: ProvinceFrame[];
  legalInvades: number[];
  legalGuards: number[];
  availableForces: Force[];
  committed: (BorderlineOrder & { seq: number }) | null;
  inputSeq: number;
  fallback: BorderlineOrder | { mode: "pass"; force: Force };
  score: number;
  outcome: string;
  message: string;
  cue: { id: number; name: "commit" } | null;
}

export type BorderlineInput =
  | { t: "sync" }
  | { t: "order"; turn: number; seq: number; mode: OrderMode; target: number; force: Force };

const PHASES: BorderlinePhase[] = ["runway", "practice", "practiceReveal", "countdown", "planning", "reveal", "recap", "complete", "spectator"];

export function isForce(value: unknown): value is Force {
  return value === 1 || value === 2 || value === 3;
}

export function isBorderlineFrame(value: unknown): value is BorderlineFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<BorderlineFrame>;
  const shapeValid = Number.isInteger(frame.columns) && Number.isInteger(frame.rows)
    && ((frame.rows === 3 && (frame.columns === 4 || frame.columns === 5 || frame.columns === 6))
      || (frame.rows === 4 && frame.columns === 6));
  const provinceCount = shapeValid ? Number(frame.columns) * Number(frame.rows) : 0;
  const provincesValid = Array.isArray(frame.provinces)
    && frame.provinces.length === provinceCount
    && frame.provinces.every((item) => Boolean(
      item
      && typeof item === "object"
      && Number.isInteger(item.id)
      && item.id >= 1
      && item.id <= provinceCount
      && (item.ownerId === null || typeof item.ownerId === "string")
      && (item.ownerName === null || typeof item.ownerName === "string")
      && (item.ownerColor === null || typeof item.ownerColor === "string")
      && (item.ownerEmblem === null || typeof item.ownerEmblem === "string"),
    ))
    && new Set(frame.provinces.map((item) => item.id)).size === provinceCount;
  const integerTargets = (targets: unknown): targets is number[] => Array.isArray(targets)
    && targets.every((target) => Number.isInteger(target) && target >= 1 && target <= provinceCount)
    && new Set(targets).size === targets.length;
  const fallback = frame.fallback;
  const fallbackValid = Boolean(fallback && typeof fallback === "object" && isForce(fallback.force)
    && (fallback.mode === "pass" || (fallback.mode === "guard" && Number.isInteger(fallback.target) && fallback.target >= 1 && fallback.target <= provinceCount)));
  const committed = frame.committed;
  const committedValid = committed === null || Boolean(
    committed
    && (committed.mode === "invade" || committed.mode === "guard")
    && Number.isInteger(committed.target)
    && committed.target >= 1
    && committed.target <= provinceCount
    && isForce(committed.force)
    && Number.isInteger(committed.seq)
    && committed.seq >= 1,
  );
  return frame.t === "borderlineState"
    && PHASES.includes(frame.phase as BorderlinePhase)
    && Number.isInteger(frame.turn)
    && Number(frame.turn) >= 0
    && Number(frame.turn) <= 9
    && frame.turns === 9
    && Number.isFinite(frame.seconds)
    && Number.isInteger(frame.tutorialStep)
    && Number(frame.tutorialStep) >= 0
    && Number(frame.tutorialStep) <= 4
    && typeof frame.factionName === "string"
    && typeof frame.emblem === "string"
    && shapeValid
    && provincesValid
    && integerTargets(frame.legalInvades)
    && integerTargets(frame.legalGuards)
    && Array.isArray(frame.availableForces)
    && frame.availableForces.every(isForce)
    && new Set(frame.availableForces).size === frame.availableForces.length
    && committedValid
    && Number.isInteger(frame.inputSeq)
    && Number(frame.inputSeq) >= 0
    && fallbackValid
    && Number.isFinite(frame.score)
    && Number(frame.score) >= 0
    && typeof frame.outcome === "string"
    && typeof frame.message === "string"
    && (frame.cue === null || Boolean(frame.cue && Number.isInteger(frame.cue.id) && frame.cue.id >= 1 && frame.cue.name === "commit"));
}
