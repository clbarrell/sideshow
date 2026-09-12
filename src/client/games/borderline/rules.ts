import type { Player, RoundResult } from "../../../shared/protocol";

export type Force = 1 | 2 | 3;
export type OrderMode = "invade" | "guard";

export interface BorderlineOrder {
  mode: OrderMode;
  target: number;
  force: Force;
}

export interface PassOrder {
  mode: "pass";
  force: Force;
}

export type EffectiveOrder = BorderlineOrder | PassOrder;

export interface CampaignPlayer {
  id: string;
  name: string;
  seat: number;
  color: string;
  emblem: string;
  homeProvince: number;
  homeEntries: readonly [number, number];
}

export interface CampaignWorld {
  players: CampaignPlayer[];
  ownership: Array<string | null>;
}

export type BattleResult = "captured" | "held" | "top-tie" | "defended";

export interface ProvinceBattle {
  target: number;
  previousOwner: string | null;
  nextOwner: string | null;
  guard: Force | 0;
  attackers: Array<{ id: string; force: Force }>;
  result: BattleResult;
}

export type PlayerOutcome = "captured" | "held" | "lost" | "quiet" | "tied" | "defended" | "outmatched" | "passed";

export interface TurnResolution {
  ownership: Array<string | null>;
  battles: ProvinceBattle[];
  outcomes: Record<string, PlayerOutcome>;
}

export const FORCE_SET = [1, 2, 3] as const;

export const PROVINCES = [
  "Northwatch", "Bracken", "Sunmere", "Fox Hollow", "High Cairn", "Eastcliff",
  "Westgate", "Greenfold", "Kingsplain", "Amberfield", "Redwater", "Storm Cape",
  "Saltmarsh", "Oakheart", "Glass Vale", "Old Crossing", "Blue Reach", "Iron Bay",
  "Southbar", "Mossland", "Long Meadow", "Ash Coast", "Goldfen", "Last Light",
] as const;

/** Explicit four-neighbour campaign graph; province ids are one-based. */
export const ADJACENCY: Readonly<Record<number, readonly number[]>> = {
  1: [2, 7], 2: [1, 3, 8], 3: [2, 4, 9], 4: [3, 5, 10], 5: [4, 6, 11], 6: [5, 12],
  7: [1, 8, 13], 8: [2, 7, 9, 14], 9: [3, 8, 10, 15], 10: [4, 9, 11, 16], 11: [5, 10, 12, 17], 12: [6, 11, 18],
  13: [7, 14, 19], 14: [8, 13, 15, 20], 15: [9, 14, 16, 21], 16: [10, 15, 17, 22], 17: [11, 16, 18, 23], 18: [12, 17, 24],
  19: [13, 20], 20: [14, 19, 21], 21: [15, 20, 22], 22: [16, 21, 23], 23: [17, 22, 24], 24: [18, 23],
};

export const EMBLEMS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "✿", "⬢", "★"] as const;

interface HomeSlot {
  homeProvince: number;
  entries: readonly [number, number];
  side: "north" | "east" | "south" | "west";
  sideIndex: number;
}

/** Ten deliberately spaced starts. Every start has 2–4 opening invasions. */
export const HOME_SLOTS: readonly HomeSlot[] = [
  { homeProvince: 1, entries: [1, 2], side: "north", sideIndex: 0 },
  { homeProvince: 3, entries: [3, 4], side: "north", sideIndex: 1 },
  { homeProvince: 5, entries: [5, 6], side: "north", sideIndex: 2 },
  { homeProvince: 8, entries: [7, 8], side: "west", sideIndex: 0 },
  { homeProvince: 10, entries: [10, 11], side: "north", sideIndex: 3 },
  { homeProvince: 12, entries: [6, 12], side: "east", sideIndex: 0 },
  { homeProvince: 13, entries: [13, 19], side: "west", sideIndex: 1 },
  { homeProvince: 17, entries: [17, 18], side: "east", sideIndex: 1 },
  { homeProvince: 20, entries: [19, 20], side: "south", sideIndex: 0 },
  { homeProvince: 24, entries: [23, 24], side: "south", sideIndex: 1 },
] as const;

export function homeSlotFor(player: Pick<CampaignPlayer, "homeProvince">) {
  return HOME_SLOTS.find((slot) => slot.homeProvince === player.homeProvince) ?? HOME_SLOTS[0];
}

/** Seeded assignment is independent of incoming player insertion order. */
export function createCampaignWorld(seed: number, roster: readonly Player[]): CampaignWorld {
  const ordered = [...roster].sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id));
  const slots = seededShuffle(HOME_SLOTS, hash(seed));
  const players = ordered.map((player, index): CampaignPlayer => {
    const slot = slots[index % slots.length];
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      color: player.color,
      emblem: EMBLEMS[player.seat % EMBLEMS.length],
      homeProvince: slot.homeProvince,
      homeEntries: slot.entries,
    };
  });
  const ownership = Array<string | null>(PROVINCES.length).fill(null);
  for (const player of players) ownership[player.homeProvince - 1] = player.id;
  return { players, ownership };
}

export function legalTargets(
  frozenOwnership: readonly (string | null)[],
  player: Pick<CampaignPlayer, "id" | "homeEntries">,
) {
  const guard: number[] = [];
  const invade = new Set<number>();
  for (let index = 0; index < frozenOwnership.length; index += 1) {
    if (frozenOwnership[index] !== player.id) continue;
    const province = index + 1;
    guard.push(province);
    for (const neighbor of ADJACENCY[province] ?? []) {
      if (frozenOwnership[neighbor - 1] !== player.id) invade.add(neighbor);
    }
  }
  for (const entry of player.homeEntries) {
    if (frozenOwnership[entry - 1] !== player.id) invade.add(entry);
  }
  return { invade: [...invade].sort(numeric), guard: guard.sort(numeric) };
}

export function orderIsLegal(
  order: BorderlineOrder,
  frozenOwnership: readonly (string | null)[],
  player: CampaignPlayer,
  remaining: readonly Force[],
) {
  if (!remaining.includes(order.force)) return false;
  const legal = legalTargets(frozenOwnership, player);
  return legal[order.mode].includes(order.target);
}

export function fallbackOrder(
  frozenOwnership: readonly (string | null)[],
  player: CampaignPlayer,
  remaining: readonly Force[],
): EffectiveOrder {
  const force = [...remaining].sort(numeric)[0];
  if (!force) throw new Error("Borderline invariant: every turn has an available force");
  const owned = frozenOwnership.flatMap((owner, index) => owner === player.id ? [index + 1] : []);
  return owned.length > 0 ? { mode: "guard", target: owned[0], force } : { mode: "pass", force };
}

/** Resolve every target from one frozen order set, then return one simultaneous ownership snapshot. */
export function resolveTurn(
  frozenOwnership: readonly (string | null)[],
  orders: ReadonlyMap<string, EffectiveOrder> | Readonly<Record<string, EffectiveOrder>>,
): TurnResolution {
  const entries = orders instanceof Map ? [...orders.entries()] : Object.entries(orders);
  entries.sort(([a], [b]) => a.localeCompare(b));
  const orderMap = new Map(entries);
  const guards = new Map<number, { id: string; force: Force }>();
  const invasions = new Map<number, Array<{ id: string; force: Force }>>();
  const outcomes: Record<string, PlayerOutcome> = {};

  for (const [id, order] of entries) {
    if (order.mode === "pass") {
      outcomes[id] = "passed";
    } else if (order.mode === "guard") {
      guards.set(order.target, { id, force: order.force });
      outcomes[id] = "quiet";
    } else {
      const target = invasions.get(order.target) ?? [];
      target.push({ id, force: order.force });
      invasions.set(order.target, target);
      outcomes[id] = "defended";
    }
  }

  const ownership = [...frozenOwnership];
  const battles: ProvinceBattle[] = [];
  for (const [target, rawAttackers] of [...invasions].sort(([a], [b]) => a - b)) {
    const attackers = [...rawAttackers].sort((a, b) => b.force - a.force || a.id.localeCompare(b.id));
    const previousOwner = frozenOwnership[target - 1] ?? null;
    const guardOrder = guards.get(target);
    const guard = guardOrder?.id === previousOwner ? guardOrder.force : 0;
    const strongest = attackers[0]?.force ?? 0;
    const leaders = attackers.filter((attacker) => attacker.force === strongest);
    let nextOwner = previousOwner;
    let result: BattleResult;

    if (leaders.length > 1) {
      result = "top-tie";
      for (const attacker of leaders) outcomes[attacker.id] = "tied";
      for (const attacker of attackers.slice(leaders.length)) outcomes[attacker.id] = "outmatched";
    } else if (leaders[0] && leaders[0].force > guard) {
      result = "captured";
      nextOwner = leaders[0].id;
      outcomes[leaders[0].id] = "captured";
      for (const attacker of attackers.slice(1)) outcomes[attacker.id] = "outmatched";
      if (previousOwner && previousOwner !== nextOwner && guardOrder?.id === previousOwner) outcomes[previousOwner] = "lost";
    } else {
      result = guard > 0 ? "held" : "defended";
      for (const attacker of attackers) outcomes[attacker.id] = "defended";
    }

    if (guardOrder?.id === previousOwner && nextOwner === previousOwner) outcomes[guardOrder.id] = "held";
    ownership[target - 1] = nextOwner;
    battles.push({ target, previousOwner, nextOwner, guard, attackers, result });
  }

  // A player can guard one province while another owned province falls.
  for (const [id, order] of orderMap) {
    if (order.mode !== "guard") continue;
    if (outcomes[id] === "quiet" && guards.get(order.target)?.id === id && invasions.has(order.target)) outcomes[id] = "held";
  }
  return { ownership, battles, outcomes };
}

export function advanceForces(
  remaining: ReadonlyMap<string, readonly Force[]>,
  orders: ReadonlyMap<string, EffectiveOrder>,
  completedTurn: number,
) {
  const next = new Map<string, Force[]>();
  for (const [id, forces] of remaining) {
    const spent = orders.get(id)?.force;
    const afterSpend = forces.filter((force) => force !== spent);
    next.set(id, completedTurn % 3 === 0 ? [...FORCE_SET] : afterSpend);
  }
  return next;
}

export function bankTerritoryScores(
  previous: ReadonlyMap<string, number>,
  ownership: readonly (string | null)[],
) {
  const next = new Map(previous);
  for (const id of ownership) if (id && next.has(id)) next.set(id, (next.get(id) ?? 0) + 1);
  return next;
}

export function rankedResults(players: readonly CampaignPlayer[], scores: ReadonlyMap<string, number>): RoundResult[] {
  const ranked = [...players]
    .map((player) => ({ id: player.id, seat: player.seat, score: scores.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat || a.id.localeCompare(b.id));
  let place = 0;
  let previousScore: number | null = null;
  return ranked.map((row, index) => {
    if (row.score !== previousScore) {
      place = index + 1;
      previousScore = row.score;
    }
    return { id: row.id, place, score: row.score, detail: `${row.score} provinces banked` };
  });
}

function numeric(a: number, b: number) {
  return a - b;
}

function hash(seed: number) {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function seededShuffle<T>(source: readonly T[], seed: number) {
  const values = [...source];
  const random = mulberry32(seed);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
