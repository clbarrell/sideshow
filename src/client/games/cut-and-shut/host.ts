import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import {
  roadGlyph,
  type Contract,
  type CutAndShutFrame,
  type CutAndShutInput,
  type CutPhase,
  type PublicOffer,
  type PublicStitch,
  type RoadCard,
  type RoadShape,
} from "./protocol";
import { CutAndShutSound } from "./sound";

export const CUT_AND_SHUT_RULES = {
  rounds: 4,
  runwaySeconds: 8,
  marketSeconds: 24,
  commitSeconds: 8,
  foldSeconds: 1.4,
  beatSeconds: 0.65,
  marchSteps: 6,
  recapSeconds: 2.2,
  finalSeconds: 2.8,
  personalPoints: 4,
  sharedPoints: 1,
} as const;

const COLS = 4;
const ROWS = 3;
const SEAMS = COLS * ROWS;
const COURIERS = 6;
const ROAD_SHAPES: RoadShape[] = ["straight", "bend", "junction"];
const COURIER_MARKS = ["●", "▲", "■", "◆", "⬟", "✦"];
const BASE_ROADS: RoadShape[] = [
  "bend", "straight", "straight", "bend",
  "straight", "junction", "junction", "straight",
  "bend", "straight", "straight", "bend",
];
const BASE_ROTATIONS = [1, 0, 0, 2, 1, 0, 0, 1, 0, 0, 0, 3];

interface Dealer {
  player: Player;
  connected: boolean;
  active: boolean;
  hand: RoadCard[];
  contracts: Contract[];
  committed: { seam: number; shape: RoadShape } | null;
  personal: number;
  roundPersonal: number;
  deliveries: number;
  deals: number;
}

interface Offer extends PublicOffer {
  roadId: string;
}

interface Placement {
  ownerId: string | null;
  shape: RoadShape;
}

export interface CourierState {
  id: number;
  tile: number;
  fromTile: number;
  direction: number;
  alive: boolean;
  failedAt: number | null;
  failureClock?: number | null;
}

export interface ResolutionSummary {
  steps: number;
  survivors: number;
  destinations: number[];
}

/** Deterministic fold schedule. Tile ids move; their roads and contracts travel with them. */
export function layoutForRound(round: number): number[] {
  const layouts = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11],
    [8, 9, 2, 3, 4, 5, 6, 7, 0, 1, 10, 11],
    [11, 10, 2, 3, 7, 6, 5, 4, 8, 9, 1, 0],
    [3, 2, 10, 11, 4, 5, 6, 7, 0, 1, 9, 8],
  ];
  return [...layouts[Math.max(0, Math.min(layouts.length - 1, round))]];
}

/**
 * Follow the arms players can see. Direction is 0=N,1=E,2=S,3=W and describes
 * the courier's travel into this slab. Junctions always continue straight.
 * A missing entrance arm is a canal failure, represented by null.
 */
export function roadDirection(shape: RoadShape, rotation: number, travelDirection: number): number | null {
  const direction = mod(travelDirection, 4);
  if (shape === "junction") return direction;
  const incomingEdge = mod(direction + 2, 4);
  const arms = roadArms(shape, rotation);
  if (!arms.includes(incomingEdge)) return null;
  return arms[0] === incomingEdge ? arms[1] : arms[0];
}

/** Physical edge arms in logical board directions, used by both simulation and renderer. */
export function roadArms(shape: RoadShape, rotation: number): number[] {
  const turn = mod(rotation, 4);
  if (shape === "junction") return [0, 1, 2, 3];
  if (shape === "straight") return turn % 2 === 0 ? [1, 3] : [0, 2];
  return [turn, mod(turn + 1, 4)];
}

export function neighborInLayout(layout: readonly number[], tile: number, direction: number) {
  const position = layout.indexOf(tile);
  if (position < 0) return null;
  const row = Math.floor(position / COLS);
  const col = position % COLS;
  const nextRow = row + (direction === 0 ? -1 : direction === 2 ? 1 : 0);
  const nextCol = col + (direction === 1 ? 1 : direction === 3 ? -1 : 0);
  if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) return null;
  return layout[nextRow * COLS + nextCol];
}

/** Public pure seam for deterministic six-beat resolution tests and tuning. */
export function resolveCouriers(
  initial: readonly CourierState[],
  layout: readonly number[],
  roads: ReadonlyMap<number, RoadShape>,
  round: number,
): { couriers: CourierState[]; summary: ResolutionSummary } {
  const couriers = initial.map((courier) => ({ ...courier }));
  for (let step = 0; step < CUT_AND_SHUT_RULES.marchSteps; step += 1) {
    for (const courier of couriers) {
      if (!courier.alive) continue;
      const shape = roads.get(courier.tile) ?? baselineRoad(courier.tile, round);
      const direction = roadDirection(shape, roadRotation(courier.tile, round), courier.direction);
      const next = direction === null ? null : neighborInLayout(layout, courier.tile, direction);
      courier.fromTile = courier.tile;
      if (next === null) {
        courier.alive = false;
        courier.failedAt = step;
        courier.failureClock = null;
      } else {
        courier.direction = direction!;
        courier.tile = next;
      }
    }
  }
  return {
    couriers,
    summary: {
      steps: CUT_AND_SHUT_RULES.marchSteps,
      survivors: couriers.filter((courier) => courier.alive).length,
      destinations: couriers.filter((courier) => courier.alive).map((courier) => courier.tile),
    },
  };
}

export function createHost(ctx: HostContext): GameHost {
  const initialPlayers = [...ctx.players].sort((a, b) => a.seat - b.seat || a.id.localeCompare(b.id));
  const dealers = new Map<string, Dealer>();
  for (const player of initialPlayers) {
    dealers.set(player.id, {
      player,
      connected: player.connected,
      active: true,
      hand: initialHand(ctx.seed, player.seat),
      contracts: Array.from({ length: CUT_AND_SHUT_RULES.rounds }, (_, round) => contractFor(ctx.seed, player.seat, round)),
      committed: null,
      personal: 0,
      roundPersonal: 0,
      deliveries: 0,
      deals: 0,
    });
  }

  const spectators = new Map<string, Player>();
  const offers = new Map<number, Offer>();
  const stitches: PublicStitch[] = [];
  const placements = new Map<number, Placement>();
  let phase: CutPhase = dealers.size ? "runway" : "complete";
  let round = 0;
  let phaseClock = 0;
  let phoneClock = 0;
  let offerSequence = 1;
  let stitchSequence = 1;
  let marchStep = 0;
  let layout = layoutForRound(0);
  let foldFromLayout = [...layout];
  let foldToLayout = [...layout];
  let shared = 0;
  let lastSurvivors = COURIERS;
  let over = dealers.size === 0;
  let couriers = createCouriers(ctx.seed, 0, layout);
  let sound: CutAndShutSound | null = null;
  if (typeof AudioContext !== "undefined") sound = new CutAndShutSound();
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const activeDealers = () => [...dealers.values()]
    .filter((dealer) => dealer.active)
    .sort((a, b) => a.player.seat - b.player.seat || a.player.id.localeCompare(b.player.id));

  const locked = (id: string) => [...offers.values()].some((offer) =>
    offer.fromId === id || offer.toId === id);

  const publicOffers = () => [...offers.values()].map(({ roadId: _roadId, ...offer }) => offer);

  const secondsRemaining = () => {
    if (phase === "runway") return Math.max(0, CUT_AND_SHUT_RULES.runwaySeconds - phaseClock);
    if (phase === "market") return Math.max(0, CUT_AND_SHUT_RULES.marketSeconds - phaseClock);
    if (phase === "commit") return Math.max(0, CUT_AND_SHUT_RULES.commitSeconds - phaseClock);
    if (phase === "fold") return Math.max(0, CUT_AND_SHUT_RULES.foldSeconds - phaseClock);
    if (phase === "march") return Math.max(0, CUT_AND_SHUT_RULES.marchSteps - marchStep + 1);
    if (phase === "recap") return Math.max(0, CUT_AND_SHUT_RULES.recapSeconds - phaseClock);
    if (phase === "complete") return Math.max(0, CUT_AND_SHUT_RULES.finalSeconds - phaseClock);
    return 0;
  };

  const messageFor = (dealer: Dealer) => {
    if (!dealer.connected) return "Signal lost · your live offer is cancelled and the council will auto-stitch.";
    if (phase === "runway") return "Read your contract and roads. The market opens after the shared count.";
    if (phase === "market") {
      const offer = [...offers.values()].find((item) => item.fromId === dealer.player.id || item.toId === dealer.player.id);
      if (!offer) return "Tap one road, then one free dealer. One live offer each.";
      return offer.toId === dealer.player.id ? "Choose one road to return, then accept — or reject." : "Offer live on the projector. Wait for their answer.";
    }
    if (phase === "commit") return dealer.committed ? "Stitch locked. Look up." : "Tap one road, then one open numbered seam.";
    if (phase === "fold") return "Hands off. The city is folding around every promise.";
    if (phase === "march") return `Clockwork march · beat ${Math.max(1, Math.min(6, marchStep))} of 6.`;
    if (phase === "recap") return `Your contract +${dealer.roundPersonal} · shared pot +${lastSurvivors}.`;
    return "Final accounts are on the projector.";
  };

  const frameFor = (dealer: Dealer): CutAndShutFrame => ({
    t: "cutAndShutState",
    phase,
    round: Math.min(4, round + 1),
    rounds: 4,
    seconds: secondsRemaining(),
    hand: dealer.hand.map((road) => ({ ...road })),
    contract: { ...dealer.contracts[Math.min(round, 3)] },
    dealers: activeDealers().map((item) => ({
      id: item.player.id,
      name: item.player.name,
      seat: item.player.seat,
      color: item.player.color,
      locked: locked(item.player.id),
      connected: item.connected,
    })),
    offers: publicOffers(),
    stitches: stitches.slice(-8).map((stitch) => ({ ...stitch })),
    availableSeams: Array.from({ length: SEAMS }, (_, seam) => seam).filter((seam) => !placements.has(seam)),
    committed: dealer.committed ? { ...dealer.committed } : null,
    shared,
    personal: dealer.personal,
    roundPersonal: dealer.roundPersonal,
    message: messageFor(dealer),
  });

  const sendState = (id: string) => {
    const dealer = dealers.get(id);
    if (dealer?.active) ctx.send(frameFor(dealer), id);
  };

  const sendSpectator = (player: Player) => {
    ctx.send({
      t: "cutAndShutState",
      phase: "spectator",
      round: Math.min(4, round + 1),
      rounds: 4,
      seconds: secondsRemaining(),
      hand: [],
      contract: { seam: 0, label: "NEXT ROUND" },
      dealers: activeDealers().map((dealer) => ({
        id: dealer.player.id,
        name: dealer.player.name,
        seat: dealer.player.seat,
        color: dealer.player.color,
        locked: locked(dealer.player.id),
        connected: dealer.connected,
      })),
      offers: publicOffers(),
      stitches: stitches.slice(-8),
      availableSeams: [],
      committed: null,
      shared,
      personal: 0,
      roundPersonal: 0,
      message: "Deal in progress · you join after the next game.",
    } satisfies CutAndShutFrame, player.id);
  };

  const sendAll = () => {
    for (const dealer of activeDealers()) sendState(dealer.player.id);
    for (const spectator of spectators.values()) sendSpectator(spectator);
  };

  const cancelOffersFor = (id: string) => {
    for (const [offerId, offer] of offers) {
      if (offer.fromId === id || offer.toId === id) offers.delete(offerId);
    }
  };

  const beginMarket = () => {
    phase = "market";
    phaseClock = 0;
    phoneClock = 0;
    placements.clear();
    offers.clear();
    for (const dealer of activeDealers()) {
      dealer.committed = null;
      dealer.roundPersonal = 0;
      while (dealer.hand.length < 3) {
        const index = dealer.hand.length;
        dealer.hand.push(cardFor(ctx.seed, dealer.player.seat, round, index));
      }
    }
    couriers = couriers.map((courier) => courier.alive
      ? { ...courier, fromTile: courier.tile, failedAt: null, failureClock: null }
      : respawnCourier(ctx.seed, courier.id, round, layout));
    marchStep = 0;
    sendAll();
  };

  const beginCommit = () => {
    offers.clear();
    phase = "commit";
    phaseClock = 0;
    phoneClock = 0;
    sendAll();
  };

  const commitFor = (dealer: Dealer, road: RoadCard, seam: number, audible = true) => {
    if (dealer.committed || placements.has(seam)) return false;
    const index = dealer.hand.findIndex((card) => card.id === road.id);
    if (index < 0) return false;
    dealer.hand.splice(index, 1);
    dealer.committed = { seam, shape: road.shape };
    placements.set(seam, { ownerId: dealer.player.id, shape: road.shape });
    if (audible) sound?.play("stitch");
    return true;
  };

  const autoCommit = () => {
    for (const dealer of activeDealers()) {
      if (dealer.committed || !dealer.hand.length) continue;
      let seam = mod(dealer.player.seat + round * 3, SEAMS);
      for (let offset = 0; offset < SEAMS && placements.has(seam); offset += 1) seam = mod(seam + 1, SEAMS);
      if (!placements.has(seam)) commitFor(dealer, dealer.hand[0], seam, false);
    }
  };

  const beginFold = () => {
    autoCommit();
    phase = "fold";
    phaseClock = 0;
    phoneClock = 0;
    foldFromLayout = [...layout];
    foldToLayout = layoutForRound(round + 1);
    sound?.play("fold");
    sendAll();
  };

  const beginMarch = () => {
    phase = "march";
    phaseClock = 0;
    phoneClock = 0;
    marchStep = 0;
    layout = [...foldToLayout];
    stepMarch();
    sendAll();
  };

  const stepMarch = () => {
    let failed = false;
    for (const courier of couriers) {
      if (!courier.alive) continue;
      const shape = placements.get(courier.tile)?.shape ?? baselineRoad(courier.tile, round);
      const direction = roadDirection(shape, roadRotation(courier.tile, round), courier.direction);
      const next = direction === null ? null : neighborInLayout(layout, courier.tile, direction);
      courier.fromTile = courier.tile;
      if (next === null) {
        courier.alive = false;
        courier.failedAt = marchStep;
        courier.failureClock = phaseClock;
        failed = true;
      } else {
        courier.direction = direction!;
        courier.tile = next;
      }
    }
    marchStep += 1;
    sound?.play("step");
    if (failed) sound?.play("fail");

    if (marchStep === CUT_AND_SHUT_RULES.marchSteps) {
      const survivors = couriers.filter((courier) => courier.alive);
      lastSurvivors = survivors.length;
      shared += survivors.length * CUT_AND_SHUT_RULES.sharedPoints;
      for (const dealer of activeDealers()) {
        const destination = dealer.contracts[round].seam;
        const deliveries = survivors.filter((courier) => courier.tile === destination).length;
        dealer.deliveries += deliveries;
        dealer.roundPersonal = deliveries * CUT_AND_SHUT_RULES.personalPoints;
        dealer.personal += dealer.roundPersonal;
      }
    }
  };

  const beginRecap = () => {
    phase = "recap";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("result");
    sendAll();
  };

  const beginComplete = () => {
    phase = "complete";
    phaseClock = 0;
    phoneClock = 0;
    sound?.play("result");
    sendAll();
  };

  const finish = () => {
    over = true;
    sendAll();
  };

  const onInput = (playerId: string, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const input = value as Partial<CutAndShutInput> & Record<string, unknown>;
    const dealer = dealers.get(playerId);
    if (input.t === "sync") {
      if (dealer?.active) sendState(playerId);
      else if (spectators.has(playerId)) sendSpectator(spectators.get(playerId)!);
      return;
    }
    if (!dealer?.active || !dealer.connected) return;

    if (input.t === "offer" && phase === "market") {
      if (typeof input.roadId !== "string" || typeof input.targetId !== "string") return;
      const target = dealers.get(input.targetId);
      const road = dealer.hand.find((card) => card.id === input.roadId);
      if (!road || !target?.active || !target.connected || target.player.id === playerId) return;
      if (locked(playerId) || locked(target.player.id)) return;
      const offer: Offer = {
        id: offerSequence++,
        fromId: playerId,
        fromName: dealer.player.name,
        fromSeat: dealer.player.seat,
        toId: target.player.id,
        toName: target.player.name,
        toSeat: target.player.seat,
        offered: road.shape,
        roadId: road.id,
      };
      offers.set(offer.id, offer);
      sound?.play("offer");
      return;
    }

    if (input.t === "respond" && phase === "market" && Number.isInteger(input.offerId)) {
      const offer = offers.get(Number(input.offerId));
      if (!offer || offer.toId !== playerId) return;
      if (typeof input.accept !== "boolean") return;
      if (input.accept !== true) {
        offers.delete(offer.id);
        return;
      }
      if (typeof input.roadId !== "string") return;
      const sender = dealers.get(offer.fromId);
      const offeredIndex = sender?.hand.findIndex((card) => card.id === offer.roadId) ?? -1;
      const returnedIndex = dealer.hand.findIndex((card) => card.id === input.roadId);
      if (!sender?.active || offeredIndex < 0 || returnedIndex < 0) {
        offers.delete(offer.id);
        return;
      }
      const offered = sender.hand[offeredIndex];
      const returned = dealer.hand[returnedIndex];
      sender.hand[offeredIndex] = returned;
      dealer.hand[returnedIndex] = offered;
      sender.deals += 1;
      dealer.deals += 1;
      stitches.push({
        number: stitchSequence++,
        fromName: sender.player.name,
        fromSeat: sender.player.seat,
        toName: dealer.player.name,
        toSeat: dealer.player.seat,
        offered: offered.shape,
        returned: returned.shape,
      });
      offers.delete(offer.id);
      sound?.play("stitch");
      return;
    }

    if (input.t === "commit" && phase === "commit") {
      if (typeof input.roadId !== "string" || !Number.isInteger(input.seam)) return;
      const seam = Number(input.seam);
      if (seam < 0 || seam >= SEAMS) return;
      const road = dealer.hand.find((card) => card.id === input.roadId);
      if (road) commitFor(dealer, road, seam);
    }
  };

  return {
    onInput,
    onJoin(player) {
      spectators.set(player.id, player);
      sendSpectator(player);
    },
    onLeave(id) {
      spectators.delete(id);
      const dealer = dealers.get(id);
      if (!dealer) return;
      dealer.active = false;
      dealer.connected = false;
      cancelOffersFor(id);
      if (!activeDealers().length) {
        phase = "complete";
        over = true;
      }
    },
    onConnectionChange(id, connected) {
      const dealer = dealers.get(id);
      if (!dealer?.active) return;
      dealer.connected = connected;
      if (!connected) cancelOffersFor(id);
      if (connected) sendState(id);
    },
    tick(dt) {
      if (over) return;
      const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
      phaseClock += step;
      phoneClock += step;

      if (phoneClock >= 0.5) {
        phoneClock %= 0.5;
        sendAll();
      }

      if (phase === "runway" && phaseClock >= CUT_AND_SHUT_RULES.runwaySeconds) beginMarket();
      else if (phase === "market" && phaseClock >= CUT_AND_SHUT_RULES.marketSeconds) beginCommit();
      else if (phase === "commit" && phaseClock >= CUT_AND_SHUT_RULES.commitSeconds) beginFold();
      else if (phase === "fold" && phaseClock >= CUT_AND_SHUT_RULES.foldSeconds) beginMarch();
      else if (phase === "march") {
        while (marchStep < CUT_AND_SHUT_RULES.marchSteps && phaseClock >= marchStep * CUT_AND_SHUT_RULES.beatSeconds) {
          stepMarch();
        }
        if (marchStep >= CUT_AND_SHUT_RULES.marchSteps && phaseClock >= CUT_AND_SHUT_RULES.marchSteps * CUT_AND_SHUT_RULES.beatSeconds + 0.5) {
          beginRecap();
        }
      } else if (phase === "recap" && phaseClock >= CUT_AND_SHUT_RULES.recapSeconds) {
        if (round >= CUT_AND_SHUT_RULES.rounds - 1) beginComplete();
        else {
          round += 1;
          beginMarket();
        }
      } else if (phase === "complete" && phaseClock >= CUT_AND_SHUT_RULES.finalSeconds) finish();
    },
    render(c, w, h) {
      renderHost(c, w, h, {
        phase,
        round,
        seconds: secondsRemaining(),
        layout,
        foldFromLayout,
        foldToLayout,
        dealers: activeDealers(),
        offers: publicOffers(),
        stitches,
        placements,
        couriers,
        marchStep,
        phaseClock,
        shared,
        lastSurvivors,
        reducedMotion,
      });
    },
    isOver: () => over,
    results: () => resultsFor(activeDealers(), shared),
    destroy() {
      sound?.destroy();
      sound = null;
      offers.clear();
      placements.clear();
    },
  };
}

function resultsFor(dealers: Dealer[], shared: number): RoundResult[] {
  const ranked = [...dealers].sort((a, b) =>
    (b.personal + shared) - (a.personal + shared)
    || a.player.seat - b.player.seat);
  let place = 0;
  let previous: string | null = null;
  return ranked.map((dealer, index) => {
    const score = dealer.personal + shared;
    const tieKey = String(score);
    if (tieKey !== previous) place = index + 1;
    previous = tieKey;
    return {
      id: dealer.player.id,
      place,
      score,
      detail: `${dealer.deliveries} deliveries · ${shared} shared · ${dealer.deals} deals`,
    };
  });
}

function initialHand(seed: number, seat: number) {
  return Array.from({ length: 3 }, (_, index) => cardFor(seed, seat, 0, index));
}

function cardFor(seed: number, seat: number, round: number, index: number): RoadCard {
  const value = hash(seed ^ Math.imul(seat + 1, 0x9e3779b1) ^ Math.imul(round + 1, 0x85ebca6b) ^ index);
  return { id: `${seat}-${round}-${index}-${value.toString(36)}`, shape: ROAD_SHAPES[value % ROAD_SHAPES.length] };
}

function contractFor(seed: number, seat: number, round: number): Contract {
  // Five is coprime with twelve, so the ten seats always receive distinct
  // same-market destinations while the seeded start keeps rounds unfamiliar.
  const start = mod(hash(seed ^ Math.imul(round + 11, 0x165667b1)), SEAMS);
  const seam = mod(start + seat * 5 + round * 3, SEAMS);
  return { seam, label: `LOT ${String(seam + 1).padStart(2, "0")} · ${["SILT QUAY", "CROOKED ARCADE", "OXBLOOD YARD", "LILAC ROW"][round]}` };
}

function createCouriers(seed: number, round: number, layout: readonly number[]): CourierState[] {
  return Array.from({ length: COURIERS }, (_, id) => respawnCourier(seed, id, round, layout));
}

function respawnCourier(seed: number, id: number, round: number, layout: readonly number[]): CourierState {
  const value = hash(seed ^ Math.imul(id + 1, 0x45d9f3b) ^ Math.imul(round + 1, 0x119de1f3));
  const preferred = [0, 2, 3, 7, 10, 8][id];
  for (let tileOffset = 0; tileOffset < SEAMS; tileOffset += 1) {
    const tile = layout[mod(preferred + tileOffset, SEAMS)];
    for (let directionOffset = 0; directionOffset < 4; directionOffset += 1) {
      const direction = mod((value >>> 8) + directionOffset, 4);
      const exit = roadDirection(baselineRoad(tile, round), roadRotation(tile, round), direction);
      if (exit !== null && neighborInLayout(layout, tile, exit) !== null) {
        return { id, tile, fromTile: tile, direction, alive: true, failedAt: null, failureClock: null };
      }
    }
  }
  const tile = layout[preferred];
  return { id, tile, fromTile: tile, direction: 1, alive: true, failedAt: null, failureClock: null };
}

function baselineRoad(tile: number, _round: number): RoadShape {
  return BASE_ROADS[mod(tile, SEAMS)];
}

function roadRotation(tile: number, round: number) {
  return mod(BASE_ROTATIONS[mod(tile, SEAMS)] + round, 4);
}

function renderHost(c: CanvasRenderingContext2D, w: number, h: number, state: {
  phase: CutPhase;
  round: number;
  seconds: number;
  layout: number[];
  foldFromLayout: number[];
  foldToLayout: number[];
  dealers: Dealer[];
  offers: PublicOffer[];
  stitches: PublicStitch[];
  placements: Map<number, Placement>;
  couriers: CourierState[];
  marchStep: number;
  phaseClock: number;
  shared: number;
  lastSurvivors: number;
  reducedMotion: boolean;
}) {
  c.save();
  c.fillStyle = "#6F607D";
  c.fillRect(0, 0, w, h);
  const scale = Math.min(w / 1280, h / 720);
  c.scale(scale, scale);
  const vw = w / scale;
  const vh = h / scale;
  c.font = "900 24px system-ui, sans-serif";
  c.textBaseline = "middle";
  c.lineJoin = "round";

  drawHeader(c, state, vw);
  drawDealerRail(c, state.dealers, vw);
  drawBoard(c, state, vw, vh);
  drawPublicRail(c, state, vw, vh);
  drawRunwayOrOutcome(c, state, vw, vh);
  c.restore();
}

function drawDealerRail(c: CanvasRenderingContext2D, dealers: Dealer[], vw: number) {
  const available = Math.max(420, vw - 360);
  const gap = 5;
  const width = Math.min(92, (available - 28 - gap * Math.max(0, dealers.length - 1)) / Math.max(1, dealers.length));
  dealers.forEach((dealer, index) => {
    const x = 22 + index * (width + gap);
    c.fillStyle = dealer.connected ? dealer.player.color : "#726A76";
    c.fillRect(x, 103, width, 38);
    c.fillStyle = "#17131C";
    c.font = "950 18px system-ui, sans-serif";
    c.textAlign = "center";
    const label = `${dealer.player.seat + 1}·${dealer.player.name}`;
    c.fillText(label.length > 8 ? `${label.slice(0, 7)}…` : label, x + width / 2, 122);
  });
  c.textAlign = "left";
}

function drawHeader(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number) {
  c.fillStyle = "#17131C";
  c.fillRect(0, 0, vw, 92);
  c.fillStyle = "#F2F53D";
  c.font = "1000 37px system-ui, sans-serif";
  c.fillText("CUT & SHUT", 30, 40);
  c.fillStyle = "#FFF3D1";
  c.font = "800 17px system-ui, sans-serif";
  c.fillText(`DEAL ${Math.min(4, state.round + 1)} / 4`, 34, 72);
  c.textAlign = "center";
  c.font = "950 28px system-ui, sans-serif";
  c.fillText(phaseTitle(state.phase, state.marchStep), Math.min(vw * 0.52, vw - 560), 46);
  c.textAlign = "right";
  c.fillStyle = state.seconds <= 5 ? "#F2F53D" : "#FFF3D1";
  c.font = "1000 44px ui-monospace, monospace";
  c.fillText(state.phase === "march" ? `${Math.max(1, Math.min(6, state.marchStep))}/6` : String(Math.ceil(state.seconds)).padStart(2, "0"), vw - 355, 46);
  c.textAlign = "left";
}

function drawBoard(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number, vh: number) {
  const centerX = Math.min(385, vw * 0.31);
  const originY = 205;
  const tileW = Math.min(230, (vw - 350) / 3.9);
  const tileH = tileW * 0.6;
  const lift = state.phase === "fold" && !state.reducedMotion
    ? Math.sin(Math.min(1, state.phaseClock / CUT_AND_SHUT_RULES.foldSeconds) * Math.PI) * 28
    : 0;

  const foldProgress = state.phase === "fold"
    ? state.reducedMotion ? 1 : smoothStep(Math.min(1, state.phaseClock / CUT_AND_SHUT_RULES.foldSeconds))
    : 1;
  const centerFor = (tile: number) => {
    if (state.phase !== "fold") return tileCenter(state.layout, tile, centerX, originY, tileW, tileH);
    const from = tileCenter(state.foldFromLayout, tile, centerX, originY, tileW, tileH);
    const to = tileCenter(state.foldToLayout, tile, centerX, originY, tileW, tileH);
    return {
      x: from.x + (to.x - from.x) * foldProgress,
      y: from.y + (to.y - from.y) * foldProgress,
    };
  };

  const tiles = Array.from({ length: SEAMS }, (_, tile) => tile)
    .sort((a, b) => centerFor(a).y - centerFor(b).y || centerFor(a).x - centerFor(b).x);
  for (const tile of tiles) {
    const point = centerFor(tile);
    const y = point.y - (((tile + state.round) & 1) ? lift : 0);
    const owner = state.dealers.find((dealer) => dealer.player.id === state.placements.get(tile)?.ownerId);
    drawIsoTile(c, point.x, y, tileW, tileH, tile, state.placements.get(tile), state.round, owner?.player);
  }

  for (const courier of state.couriers) {
    const point = centerFor(courier.tile);
    const previous = state.phase === "fold" ? point : tileCenter(state.layout, courier.fromTile, centerX, originY, tileW, tileH);
    const beatProgress = state.phase === "march" && !state.reducedMotion
      ? Math.min(1, mod(state.phaseClock, CUT_AND_SHUT_RULES.beatSeconds) / CUT_AND_SHUT_RULES.beatSeconds)
      : 1;
    const eased = 1 - Math.pow(1 - beatProgress, 3);
    const cluster = state.couriers.filter((item) => item.tile === courier.tile);
    const clusterIndex = cluster.findIndex((item) => item.id === courier.id);
    const clusterRadius = cluster.length > 1 ? Math.min(43, 17 + cluster.length * 4) : 0;
    const clusterAngle = (clusterIndex / Math.max(1, cluster.length)) * Math.PI * 2 - Math.PI / 2;
    let x = previous.x + (point.x - previous.x) * eased + Math.cos(clusterAngle) * clusterRadius;
    let y = previous.y + (point.y - previous.y) * eased - 17 + Math.sin(clusterAngle) * clusterRadius * 0.65;
    if (!courier.alive) {
      const age = state.phase === "march" ? Math.max(0, state.phaseClock - (courier.failureClock ?? state.phaseClock)) : 1;
      const distance = state.reducedMotion ? 48 : Math.min(105, age * 180);
      x += [0, 1, 0, -1][courier.direction] * distance;
      y += [-0.45, 0.2, 0.55, 0.2][courier.direction] * distance;
      drawFailedCourier(c, x, y, courier.id, age, state.reducedMotion);
      continue;
    }
    c.fillStyle = "#17131C";
    c.beginPath();
    c.arc(x, y, 24, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#F2F53D";
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = "#FFF3D1";
    c.textAlign = "center";
    c.font = "900 15px system-ui, sans-serif";
    c.fillText(`C${courier.id + 1}${["↗", "↘", "↙", "↖"][courier.direction]}`, x, y + 1);
    c.textAlign = "left";
  }

  c.fillStyle = "rgba(23,19,28,.82)";
  c.fillRect(22, vh - 72, Math.min(850, vw - 360), 48);
  c.fillStyle = "#FFF3D1";
  c.font = "800 20px system-ui, sans-serif";
  c.fillText(boardCaption(state), 40, vh - 48);
}

function drawIsoTile(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tile: number, placement: Placement | undefined, round: number, owner?: Player) {
  const polygon = () => {
    c.beginPath();
    c.moveTo(x, y - h / 2);
    c.lineTo(x + w / 2, y);
    c.lineTo(x, y + h / 2);
    c.lineTo(x - w / 2, y);
    c.closePath();
  };
  c.fillStyle = "#33293A";
  polygon();
  c.save();
  c.translate(0, 10);
  polygon();
  c.fill();
  c.restore();
  c.fillStyle = "#B8A7C8";
  polygon();
  c.fill();
  c.strokeStyle = "#17131C";
  c.lineWidth = 4;
  c.stroke();

  const shape = placement?.shape ?? baselineRoad(tile, round);
  c.save();
  c.translate(x, y);
  const vectors = [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const line of [
    { color: "#17131C", width: placement ? 22 : 18 },
    { color: placement ? "#F2F53D" : "rgba(255,243,209,.8)", width: placement ? 14 : 11 },
  ]) {
    c.strokeStyle = line.color;
    c.lineWidth = line.width;
    c.beginPath();
    for (const direction of roadArms(shape, roadRotation(tile, round))) {
      const [dx, dy] = vectors[direction];
      c.moveTo(0, 0);
      c.lineTo(dx * w * 0.245, dy * h * 0.255);
    }
    c.stroke();
  }
  c.fillStyle = placement ? "#F2F53D" : "rgba(255,243,209,.8)";
  c.beginPath();
  c.arc(0, 0, placement ? 9 : 7, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.fillStyle = placement ? "#F2F53D" : "#FFF3D1";
  c.fillRect(x - 23, y + h * 0.22, 46, 30);
  c.strokeStyle = "#17131C";
  c.lineWidth = 3;
  c.strokeRect(x - 23, y + h * 0.22, 46, 30);
  c.fillStyle = "#17131C";
  c.font = "1000 21px ui-monospace, monospace";
  c.textAlign = "center";
  c.fillText(String(tile + 1).padStart(2, "0"), x, y + h * 0.22 + 15);
  if (owner) {
    c.fillStyle = owner.color;
    c.beginPath();
    c.arc(x + w * 0.3, y - h * 0.1, 18, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#17131C";
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = "#17131C";
    c.font = "1000 17px system-ui, sans-serif";
    c.fillText(String(owner.seat + 1), x + w * 0.3, y - h * 0.1 + 1);
  }
  c.textAlign = "left";
}

function drawFailedCourier(c: CanvasRenderingContext2D, x: number, y: number, id: number, age: number, reducedMotion: boolean) {
  const spread = reducedMotion ? 16 : Math.min(30, age * 54);
  c.save();
  c.translate(x, y);
  c.rotate(reducedMotion ? -0.18 : Math.min(1.2, age * 2.4) * (id % 2 ? -1 : 1));
  c.fillStyle = "#651C2A";
  c.fillRect(-18, -9, 36, 18);
  for (let piece = 0; piece < 4; piece += 1) {
    const angle = id * 0.73 + piece * Math.PI / 2.15;
    const px = Math.cos(angle) * spread;
    const py = Math.sin(angle) * spread * 0.65 + Math.min(13, age * age * 10);
    c.save();
    c.translate(px, py);
    c.rotate(angle + age * (piece % 2 ? -2.2 : 2.2));
    c.fillRect(-7, -4, 14, 8);
    c.restore();
  }
  c.fillStyle = "#FFF3D1";
  c.font = "900 13px system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText(`C${id + 1}`, 0, 0);
  c.restore();
  c.textAlign = "left";
}

function drawPublicRail(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number, vh: number) {
  const x = vw - 326;
  c.fillStyle = "rgba(23,19,28,.92)";
  c.fillRect(x, 108, 306, vh - 132);
  c.fillStyle = "#F2F53D";
  c.font = "950 21px system-ui, sans-serif";
  c.fillText("PUBLIC DEAL BOARD", x + 18, 136);

  c.fillStyle = "#B8A7C8";
  c.font = "900 16px system-ui, sans-serif";
  c.fillText("LIVE OFFERS", x + 18, 172);
  let y = 201;
  if (!state.offers.length) {
    c.fillStyle = "rgba(255,243,209,.55)";
    c.font = "750 20px system-ui, sans-serif";
    c.fillText("No live offer", x + 18, y);
  }
  for (const offer of state.offers.slice(0, 5)) {
    c.fillStyle = "#FFF3D1";
    c.font = "900 19px system-ui, sans-serif";
    c.fillText(`#${offer.fromSeat + 1} ${shortName(offer.fromName)} → #${offer.toSeat + 1} ${shortName(offer.toName)}`, x + 18, y);
    c.fillStyle = "#F2F53D";
    c.fillText(`${roadGlyph(offer.offered)} PENDING`, x + 190, y);
    y += 35;
  }

  c.fillStyle = "#B8A7C8";
  c.font = "900 16px system-ui, sans-serif";
  c.fillText("RECENT ACCEPTED STITCHES", x + 18, 390);
  y = 421;
  const accepted = state.stitches.slice(-8).reverse();
  if (!accepted.length) {
    c.fillStyle = "rgba(255,243,209,.55)";
    c.font = "750 20px system-ui, sans-serif";
    c.fillText("No stitch yet", x + 18, y);
  }
  accepted.forEach((stitch, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const stitchX = x + 18 + column * 139;
    const stitchY = y + row * 40;
    c.fillStyle = "#F2F53D";
    c.font = "950 16px system-ui, sans-serif";
    c.fillText(`${String(stitch.number).padStart(2, "0")}  #${stitch.fromSeat + 1}↔#${stitch.toSeat + 1}`, stitchX, stitchY);
    c.fillStyle = "#FFF3D1";
    c.font = "900 19px system-ui, sans-serif";
    c.fillText(`${roadGlyph(stitch.offered)}⇄${roadGlyph(stitch.returned)}`, stitchX, stitchY + 18);
  });

  c.fillStyle = "#B8A7C8";
  c.fillRect(x + 18, vh - 120, 270, 2);
  c.fillStyle = "#FFF3D1";
  c.font = "950 24px system-ui, sans-serif";
  c.fillText(`SHARED POT  ${state.shared}`, x + 18, vh - 92);
  c.fillStyle = state.lastSurvivors === 0 ? "#F2F53D" : "#B8A7C8";
  c.font = "850 20px system-ui, sans-serif";
  const firstDeparture = state.round === 0 && state.shared === 0 && !["recap", "complete"].includes(state.phase);
  c.fillText(firstDeparture ? "6/6 COURIERS LOADED" : `${state.lastSurvivors}/6 COURIERS LAST RUN`, x + 18, vh - 62);
}

function drawRunwayOrOutcome(c: CanvasRenderingContext2D, state: Parameters<typeof renderHost>[3], vw: number, vh: number) {
  if (state.phase === "recap") {
    c.fillStyle = "rgba(23,19,28,.94)";
    c.fillRect(120, 225, vw - 500, 230);
    c.textAlign = "center";
    c.fillStyle = "#F2F53D";
    c.font = "1000 66px system-ui, sans-serif";
    c.fillText(`${state.lastSurvivors}/6 SAFE`, (vw - 260) / 2, 290);
    c.fillStyle = "#FFF3D1";
    c.font = "950 31px system-ui, sans-serif";
    c.fillText(`+${state.lastSurvivors} EACH · ${6 - state.lastSurvivors} LOST`, (vw - 260) / 2, 360);
    c.fillStyle = "#B8A7C8";
    c.font = "800 21px system-ui, sans-serif";
    c.fillText("FAILED COURIERS RETURN FOR THE NEXT DEAL", (vw - 260) / 2, 413);
    c.textAlign = "left";
    return;
  }
  if (state.phase !== "runway" && state.phase !== "complete") return;
  c.fillStyle = "rgba(23,19,28,.91)";
  c.fillRect(55, 130, vw - 420, vh - 225);
  c.textAlign = "center";
  c.fillStyle = "#F2F53D";
  c.font = "1000 46px system-ui, sans-serif";
  c.fillText(state.phase === "runway" ? "CROOKED ROADS. LEGITIMATE CONTRACTS." : "THE FINAL ACCOUNTS", (vw - 310) / 2, 195);
  c.fillStyle = "#FFF3D1";
  c.font = "900 27px system-ui, sans-serif";
  if (state.phase === "runway") {
    ["1  LOOK DOWN — READ YOUR CONTRACT", "2  TRADE ONE ROAD", "3  STITCH ONE NUMBERED SEAM", "4  LOOK UP — SIX STEPS EXACTLY"].forEach((line, index) => {
      c.fillText(line, (vw - 310) / 2, 265 + index * 58);
    });
    c.fillStyle = "#B8A7C8";
    c.font = "800 19px system-ui, sans-serif";
    c.fillText("FOLLOW DRAWN ARMS · JUNCTIONS GO STRAIGHT · A MISSING ARM MEANS CANAL", (vw - 310) / 2, 502);
    c.fillText("PRIVATE DELIVERIES SCORE 4 · EVERY SURVIVOR SCORES 1 FOR EVERYONE", (vw - 310) / 2, 532);
  } else {
    const rows = resultsFor(state.dealers, state.shared).slice(0, 10);
    rows.forEach((result, index) => {
      const dealer = state.dealers.find((item) => item.player.id === result.id)!;
      c.fillStyle = dealer.player.color;
      c.fillRect(150, 245 + index * 34, 28, 24);
      c.fillStyle = "#FFF3D1";
      c.font = "850 20px system-ui, sans-serif";
      c.textAlign = "left";
      c.fillText(`${result.place}. ${dealer.player.name}`, 194, 258 + index * 34);
      c.textAlign = "right";
      c.fillText(`${result.score} PTS · ${result.detail}`, vw - 390, 258 + index * 34);
    });
  }
  c.textAlign = "left";
}

function phaseTitle(phase: CutPhase, marchStep: number) {
  if (phase === "runway") return "READ YOUR PRIVATE CONTRACT";
  if (phase === "market") return "PUBLIC MARKET";
  if (phase === "commit") return "STITCH THE CITY";
  if (phase === "fold") return "CITY FOLD";
  if (phase === "march") return `COURIERS MOVE · ${Math.max(1, Math.min(6, marchStep))}`;
  if (phase === "recap") return "DELIVERIES COUNTED";
  return "FINAL ACCOUNTS";
}

function boardCaption(state: Parameters<typeof renderHost>[3]) {
  if (state.phase === "market") return "MAKE IT PUBLIC: OFFER A ROAD TO ONE FREE DEALER";
  if (state.phase === "commit") return `${state.placements.size}/${state.dealers.length} STITCHES LOCKED · UNCLAIMED SEAMS AUTO-FILL`;
  if (state.phase === "fold") return "ADJACENCY IS CHANGING · CONTRACTS STAY ON THEIR NUMBERED SLABS";
  if (state.phase === "march") return `ALL SIX COURIERS MOVE TOGETHER · ${state.marchStep}/6 STEPS RESOLVED`;
  if (state.phase === "recap") return `${state.lastSurvivors} SURVIVED · EVERY DEALER EARNS THE SHARED BONUS`;
  return "FOLLOW DRAWN ARMS · JUNCTIONS GO STRAIGHT · NO ONE IS ELIMINATED";
}

function tileCenter(layout: readonly number[], tile: number, centerX: number, originY: number, tileW: number, tileH: number) {
  const position = Math.max(0, layout.indexOf(tile));
  const row = Math.floor(position / COLS);
  const col = position % COLS;
  return { x: centerX + (col - row) * tileW * 0.5, y: originY + (col + row) * tileH * 0.52 };
}

function hash(value: number) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

function shortName(value: string) {
  return value.length > 7 ? `${value.slice(0, 6)}…` : value;
}
