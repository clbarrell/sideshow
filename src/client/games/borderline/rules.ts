import type { Player } from "../../../shared/protocol";
import type { BorderlineOrder, Force } from "./protocol";
import { FACTIONS, PROVINCES, seededFactionOrder, worldForPlayerCount, type BorderlineWorld, type ProvinceDefinition } from "./world";

export interface CampaignPlayer {
  player: Player;
  factionIndex: number;
  portIndex: number;
  connected: boolean;
  active: boolean;
  available: Force[];
  score: number;
  inputSeq: number;
  order: (BorderlineOrder & { seq: number }) | null;
  outcome: string;
}

export interface BorderlineCampaign {
  seed: number;
  players: Map<string, CampaignPlayer>;
  owners: Map<number, string>;
  turn: number;
  world: BorderlineWorld;
}

export type ResolvedOrder = (
  | BorderlineOrder
  | { mode: "pass"; force: Force }
) & { playerId: string; fallback?: boolean };

export interface TurnResolution {
  owners: Map<number, string>;
  captures: Array<{ province: number; from: string | null; to: string }>;
  outcomes: Map<string, string>;
}

export function createBorderlineCampaign(players: readonly Player[], seed: number): BorderlineCampaign {
  const ordered = [...players]
    .sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id))
    .slice(0, 10);
  const factions = seededFactionOrder(seed);
  const world = worldForPlayerCount(ordered.length);
  const campaignPlayers = new Map<string, CampaignPlayer>();
  const owners = new Map<number, string>();
  ordered.forEach((player, seatIndex) => {
    const factionIndex = factions[seatIndex];
    campaignPlayers.set(player.id, {
      player,
      factionIndex,
      portIndex: seatIndex,
      connected: player.connected,
      active: true,
      available: [1, 2, 3],
      score: 0,
      inputSeq: 0,
      order: null,
      outcome: "Your first border is waiting.",
    });
    owners.set(world.ports[seatIndex].home, player.id);
  });
  return { seed, players: campaignPlayers, owners, turn: 0, world };
}

export function ownedProvinces(campaign: Pick<BorderlineCampaign, "owners">, playerId: string) {
  return [...campaign.owners]
    .filter(([, owner]) => owner === playerId)
    .map(([id]) => id)
    .sort((a, b) => a - b);
}

export function legalTargets(campaign: BorderlineCampaign, playerId: string) {
  const state = campaign.players.get(playerId);
  if (!state) return { invade: [] as number[], guard: [] as number[] };
  const guard = ownedProvinces(campaign, playerId);
  const invade = new Set<number>();
  for (const id of guard) {
    for (const neighbor of campaign.world.provinces[id - 1].neighbors) {
      if (campaign.owners.get(neighbor) !== playerId) invade.add(neighbor);
    }
  }
  for (const entry of campaign.world.ports[state.portIndex].entries) {
    if (campaign.owners.get(entry) !== playerId) invade.add(entry);
  }
  return { invade: [...invade].sort((a, b) => a - b), guard };
}

export function fallbackOrder(campaign: BorderlineCampaign, playerId: string): BorderlineOrder | { mode: "pass"; force: Force } {
  const state = campaign.players.get(playerId);
  const force = state?.available.slice().sort((a, b) => a - b)[0] ?? 1;
  const target = ownedProvinces(campaign, playerId)[0];
  return target === undefined ? { mode: "pass", force } : { mode: "guard", target, force };
}

export function isLegalOrder(
  campaign: BorderlineCampaign,
  playerId: string,
  order: BorderlineOrder,
  frozen: ReadonlyMap<string, { invade: readonly number[]; guard: readonly number[] }>,
) {
  const state = campaign.players.get(playerId);
  if (!state?.active || !state.available.includes(order.force)) return false;
  const targets = frozen.get(playerId);
  if (!targets || !Number.isInteger(order.target) || order.target < 1 || order.target > campaign.world.provinces.length) return false;
  return order.mode === "invade" ? targets.invade.includes(order.target) : targets.guard.includes(order.target);
}

/** Pure simultaneous combat resolution. The input array's insertion order is irrelevant. */
export function resolveTurn(previousOwners: ReadonlyMap<number, string>, orders: readonly ResolvedOrder[], provinces: readonly ProvinceDefinition[] = PROVINCES): TurnResolution {
  const owners = new Map(previousOwners);
  const captures: TurnResolution["captures"] = [];
  const outcomes = new Map<string, string>();
  const guards = new Map<number, ResolvedOrder>();
  const invasions = new Map<number, ResolvedOrder[]>();

  for (const order of orders) {
    if (order.mode === "pass") continue;
    if (order.mode === "guard") guards.set(order.target, order);
    else invasions.set(order.target, [...(invasions.get(order.target) ?? []), order]);
  }

  for (const definition of provinces) {
    const invaders = invasions.get(definition.id) ?? [];
    if (!invaders.length) continue;
    const highest = Math.max(...invaders.map((order) => order.force));
    const strongest = invaders.filter((order) => order.force === highest);
    const defender = guards.get(definition.id);
    const guard = defender?.force ?? 0;
    if (strongest.length !== 1) {
      for (const order of invaders) outcomes.set(order.playerId, `Province ${definition.id}: strongest Strength cards tied. The flag stayed.`);
      if (defender) outcomes.set(defender.playerId, `Province ${definition.id} held while attackers tied.`);
      continue;
    }
    const winner = strongest[0];
    if (winner.force <= guard) {
      outcomes.set(winner.playerId, `Province ${definition.id} held against your Strength ${winner.force}.`);
      if (defender) outcomes.set(defender.playerId, `Your Strength ${guard} held province ${definition.id}.`);
      for (const order of invaders) {
        if (order !== winner) outcomes.set(order.playerId, `Province ${definition.id} held. A stronger invasion led the clash.`);
      }
      continue;
    }
    const prior = previousOwners.get(definition.id) ?? null;
    owners.set(definition.id, winner.playerId);
    if (prior !== winner.playerId) captures.push({ province: definition.id, from: prior, to: winner.playerId });
    outcomes.set(winner.playerId, `You captured province ${definition.id} with Strength ${winner.force}.`);
    if (defender) outcomes.set(defender.playerId, `Province ${definition.id} fell to Strength ${winner.force}.`);
    for (const order of invaders) {
      if (order !== winner) outcomes.set(order.playerId, `Province ${definition.id} went to the stronger Strength ${winner.force}.`);
    }
  }

  for (const order of orders) {
    if (order.mode === "pass") {
      outcomes.set(order.playerId, "No land to guard. Your lowest Strength card was spent; your port stays open.");
      continue;
    }
    if (outcomes.has(order.playerId)) continue;
    if (order.mode === "guard") outcomes.set(order.playerId, `Province ${order.target} stayed under your flag.`);
    else outcomes.set(order.playerId, `Your order on province ${order.target} changed no border.`);
  }
  return { owners, captures, outcomes };
}

export function factionFor(state: CampaignPlayer) {
  return FACTIONS[state.factionIndex];
}

export function publicForces(state: CampaignPlayer) {
  return state.available.slice().sort((a, b) => a - b);
}
