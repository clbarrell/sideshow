export type RoadShape = "straight" | "bend" | "junction";
export type CutPhase = "runway" | "market" | "commit" | "fold" | "march" | "recap" | "complete" | "spectator";

export interface RoadCard {
  id: string;
  shape: RoadShape;
}

export interface Contract {
  seam: number;
  label: string;
}

export interface DealerSummary {
  id: string;
  name: string;
  seat: number;
  color: string;
  locked: boolean;
  connected: boolean;
}

export interface PublicOffer {
  id: number;
  fromId: string;
  fromName: string;
  fromSeat: number;
  toId: string;
  toName: string;
  toSeat: number;
  offered: RoadShape;
}

export interface PublicStitch {
  number: number;
  fromName: string;
  fromSeat: number;
  toName: string;
  toSeat: number;
  offered: RoadShape;
  returned: RoadShape;
}

export interface CutAndShutFrame {
  t: "cutAndShutState";
  phase: CutPhase;
  round: number;
  rounds: 4;
  seconds: number;
  hand: RoadCard[];
  contract: Contract;
  dealers: DealerSummary[];
  offers: PublicOffer[];
  stitches: PublicStitch[];
  availableSeams: number[];
  committed: { seam: number; shape: RoadShape } | null;
  shared: number;
  personal: number;
  roundPersonal: number;
  message: string;
}

export type CutAndShutInput =
  | { t: "sync" }
  | { t: "offer"; roadId: string; targetId: string }
  | { t: "respond"; offerId: number; accept: boolean; roadId?: string }
  | { t: "commit"; roadId: string; seam: number };

const PHASES: CutPhase[] = ["runway", "market", "commit", "fold", "march", "recap", "complete", "spectator"];
const SHAPES: RoadShape[] = ["straight", "bend", "junction"];

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
    && Array.isArray(frame.hand)
    && frame.hand.every((card) => card && typeof card.id === "string" && SHAPES.includes(card.shape))
    && Boolean(frame.contract && Number.isInteger(frame.contract.seam) && typeof frame.contract.label === "string")
    && Array.isArray(frame.dealers)
    && Array.isArray(frame.offers)
    && Array.isArray(frame.stitches)
    && Array.isArray(frame.availableSeams)
    && typeof frame.shared === "number"
    && typeof frame.personal === "number"
    && typeof frame.roundPersonal === "number"
    && typeof frame.message === "string";
}

export function roadGlyph(shape: RoadShape) {
  if (shape === "straight") return "━";
  if (shape === "bend") return "┗";
  return "╋";
}
