// The wire format. The shell owns everything except `t: "g"`, whose `d`
// payload is opaque and belongs entirely to the running game module.

export type Role = "host" | "controller";

/**
 * A party moves lobby -> playing -> standings -> lobby all night on one room
 * code. Games are swapped inside this cycle; the URL never changes.
 */
export type Phase = "lobby" | "playing" | "standings";

export interface Player {
  id: string;
  name: string;
  seat: number; // 0-9, stable while held; a returning archived player may move
  color: string; // identity across shell + game + phone background
  connected: boolean;
  ready: boolean;
  awayAt: number | null; // when they dropped, for seat reclaiming
}

export interface RoundResult {
  id: string;
  place: number;
  score: number;
  detail?: string; // e.g. "1:24.6"
}

export interface RoundRecord {
  round: number;
  gameId: string;
  gameName: string;
  at: number;
  results: RoundResult[];
}

export interface RoomState {
  code: string;
  phase: Phase;
  gameId: string | null;
  /** The immutable configuration for the round currently in progress. */
  activeRound: { gameId: string; seed: number } | null;
  players: Player[];
  /** Cumulative party score. The leaderboard is derived from this. */
  totals: Record<string, number>;
  /** Every round played tonight, newest last. */
  history: RoundRecord[];
  round: number;
  startedAt: number;
}

export type ClientMsg =
  | { t: "hello"; role: Role; key?: string; name?: string }
  | { t: "rename"; name: string }
  | { t: "ready"; ready: boolean }
  | { t: "pick"; gameId: string } // host only
  | { t: "launch" } // host only
  | { t: "roundOver"; results: RoundResult[]; gameName: string } // host only
  | { t: "backToLobby" } // host only
  | { t: "resetParty" } // host only
  | { t: "g"; to?: string; d: unknown };

export type ServerMsg =
  | { t: "welcome"; you: Player; state: RoomState }
  | { t: "state"; state: RoomState }
  | { t: "launch"; gameId: string; seed: number }
  | { t: "g"; from: string; d: unknown }
  | { t: "waiting"; message: string }
  | { t: "error"; message: string };

export const MAX_PLAYERS = 10;

/** How long a dropped phone keeps its seat before the seat can be reclaimed. */
export const GRACE_MS = 5 * 60 * 1000;

/** Idle parties are cleared out so room codes get recycled. */
export const PARTY_TTL_MS = 12 * 60 * 60 * 1000;

// Seat colors. Ten hues that stay distinguishable on a washed-out projector
// and are legible as a flat phone background behind dark text.
export const SEAT_COLORS = [
  "#FF5A47", // coral
  "#FFC24A", // mustard
  "#52E0B0", // mint
  "#4AA8FF", // sky
  "#A97BFF", // violet
  "#FF8AC4", // rose
  "#9CE04A", // lime
  "#FF9A3D", // amber
  "#3DE0E0", // cyan
  "#D46BFF", // orchid
];

// No vowels, no 0/O/1/I — room codes get read aloud across a room.
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

export function makeRoomCode(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Party leaderboard, highest first, with ties sharing a place. */
export function leaderboard(state: RoomState) {
  const rows = state.players
    .map((p) => ({ player: p, points: state.totals[p.id] ?? 0 }))
    .sort((a, b) => b.points - a.points);

  let place = 0;
  let lastPoints: number | null = null;
  return rows.map((r, i) => {
    if (r.points !== lastPoints) {
      place = i + 1;
      lastPoints = r.points;
    }
    return { ...r, place };
  });
}
