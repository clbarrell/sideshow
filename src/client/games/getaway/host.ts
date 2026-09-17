import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import { getawayArt, preloadGetawayArt } from "./art";
import type { GetawayCue, GetawayInput, GetawayPhoneFrame, GetawayPhoneFrames } from "./protocol";
import { GetawaySound } from "./sound";

export const GETAWAY_RULES = {
  practice: 20,
  runway: 8,
  round: 150,
  vaultCloseAt: 120,
  vaultWarningAt: 110,
  capacity: 5,
  collectSeconds: 0.6,
  supplyRadius: 45,
  supplyRefill: 1.5,
  shoveCooldown: 1,
  shoveWindup: 0.15,
  shoveRange: 118,
  protection: 1.2,
  stumble: 0.25,
  ownerPickupBlock: 0.8,
  disconnectWithdraw: 3,
  shortagePause: 10,
  staleInput: 0.6,
  resultHold: 4.5,
} as const;

const WORLD_W = 1600;
const WORLD_H = 900;
const STAGE_Y_OFFSET = 130;
const STAGE_Y_SCALE = 0.84;
const PLAYER_RADIUS = 28;
const BASE_SPEED = 218;
const SPEED_BY_BAGS = [1, 0.92, 0.82, 0.7, 0.58, 0.48] as const;
const TEAM_NAMES = ["Crimson", "Cobalt"] as const;
const TEAM_COLORS = ["#cf3f4d", "#2877bd"] as const;
const TEAM_DARK = ["#841f2d", "#174a79"] as const;
const SEAT_MARKS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "★", "⬢", "✿"] as const;
const SUPPLY_POSITIONS = [
  { x: 705, y: 500 },
  { x: 800, y: 520 },
  { x: 895, y: 500 },
] as const;
const WALLS = [
  { x: 500, y: 235, w: 180, h: 92 },
  { x: 500, y: 573, w: 180, h: 92 },
  { x: 920, y: 235, w: 180, h: 92 },
  { x: 920, y: 573, w: 180, h: 92 },
] as const;

type Team = 0 | 1;

export interface GetawayActor {
  id: string;
  name: string;
  seat: number;
  color: string;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  input: { x: number; y: number };
  inputAge: number;
  wantsShove: boolean;
  connected: boolean;
  disconnectedFor: number;
  withdrawn: boolean;
  bags: number;
  collectFor: number;
  shoveCooldown: number;
  windup: number;
  protection: number;
  stumble: number;
  hitPulse: number;
  depositPulse: number;
  shovePulse: number;
  pickupPulse: number;
  cue?: GetawayCue;
}

export interface GetawayLooseBag {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  landIn: number;
  flightFor: number;
  ownerBlockId: string;
  ownerBlock: number;
  ownerExitedRange: boolean;
}

interface GetawaySupply {
  x: number;
  y: number;
  stock: number;
  refillFor: number;
  pulse: number;
}

interface GetawayParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface GetawayDelivery {
  x: number;
  y: number;
  toX: number;
  toY: number;
  life: number;
  max: number;
  delay: number;
}

export interface GetawayState {
  phase: "invalid" | "practice" | "runway" | "live" | "results" | "over";
  invalidReason: string | null;
  phaseTime: number;
  remaining: number;
  practiceStage: number;
  actors: GetawayActor[];
  actorDrawOrder: number[];
  spectators: Player[];
  supplies: GetawaySupply[];
  loose: GetawayLooseBag[];
  /** Fixed at launch so disconnects and withdrawals never change scoring. */
  crewSizes: [number, number];
  /** Raw banked bags. Adjusted points are derived from these integers. */
  scores: [number, number];
  shortageFor: number;
  paused: boolean;
  waitingForControllers: number;
  vaultClosed: boolean;
  vaultPulse: number;
  callout: string;
  calloutFor: number;
  particles: GetawayParticle[];
  deliveries: GetawayDelivery[];
  randomState: number;
  reducedMotion: boolean;
  syncToken: string;
  hostCues: GetawayCue[];
  lastCountdown: number;
}

function spawnFor(actor: Pick<GetawayActor, "team" | "seat">, mode: "round" | "practice") {
  const lane = Math.floor(actor.seat / 2);
  if (mode === "practice") {
    return { x: practiceLaneX(actor.team, lane), y: 275 + lane * 96 };
  }
  return actor.team === 0
    ? { x: 135 + (lane % 2) * 45, y: 255 + lane * 102 }
    : { x: 1465 - (lane % 2) * 45, y: 255 + lane * 102 };
}

function practiceLaneX(team: Team, lane: number) {
  const stagger = lane % 2 === 0 ? -100 : 100;
  return team === 0 ? 350 + stagger : 1250 - stagger;
}

function practicePosition(actor: Pick<GetawayActor, "team" | "seat">) {
  const lane = Math.floor(actor.seat / 2);
  return {
    x: practiceLaneX(actor.team, lane) + (actor.team === 0 ? 60 : -60),
    y: 275 + lane * 96,
  };
}

function makeActor(player: Player, index: number): GetawayActor {
  const team = (index % 2) as Team;
  const position = spawnFor({ team, seat: player.seat }, "practice");
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    color: player.color,
    team,
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    facingX: team === 0 ? 1 : -1,
    facingY: 0,
    input: { x: 0, y: 0 },
    inputAge: 0,
    wantsShove: false,
    connected: player.connected,
    disconnectedFor: 0,
    withdrawn: false,
    bags: 0,
    collectFor: 0,
    shoveCooldown: 0,
    windup: 0,
    protection: 0,
    stumble: 0,
    hitPulse: 0,
    depositPulse: 0,
    shovePulse: 0,
    pickupPulse: 0,
  };
}

export function createGetawayState(players: Player[], seed = 1): GetawayState {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const eligible = ordered.length >= 4 && ordered.length <= 10;
  const actors = eligible ? ordered.map(makeActor) : [];
  return {
    phase: eligible ? "practice" : "invalid",
    invalidReason: eligible ? null : `GETAWAY NEEDS 4–10 PLAYERS · ${ordered.length} JOINED`,
    phaseTime: 0,
    remaining: GETAWAY_RULES.round,
    practiceStage: 0,
    actors,
    actorDrawOrder: actors.map((_, index) => index),
    spectators: [],
    supplies: SUPPLY_POSITIONS.map(({ x, y }) => ({ x, y, stock: 5, refillFor: 0, pulse: 0 })),
    loose: [],
    crewSizes: [actors.filter(({ team }) => team === 0).length, actors.filter(({ team }) => team === 1).length],
    scores: [0, 0],
    shortageFor: 0,
    paused: false,
    waitingForControllers: 0,
    vaultClosed: false,
    vaultPulse: 0,
    callout: eligible ? "PRACTICE · COLLECT A BAG" : "RETURN TO THE LOBBY",
    calloutFor: eligible ? 3 : Number.POSITIVE_INFINITY,
    particles: [],
    deliveries: [],
    randomState: seed >>> 0,
    reducedMotion: false,
    syncToken: "",
    hostCues: [],
    lastCountdown: 4,
  };
}

function rand(state: GetawayState) {
  state.randomState = (state.randomState + 0x6d2b79f5) >>> 0;
  let value = state.randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function hostCue(state: GetawayState, cue: GetawayCue) {
  if (state.hostCues.length < 16) state.hostCues.push(cue);
}

function pointRatio(state: GetawayState, team: Team) {
  const crewSize = state.crewSizes[team];
  const largerSize = Math.max(...state.crewSizes);
  const getsBonus = crewSize > 0 && crewSize < largerSize;
  return {
    numerator: getsBonus ? largerSize : 1,
    denominator: getsBonus ? crewSize : 1,
  };
}

function roundPartyPoints(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function teamPoints(state: GetawayState, team: Team) {
  const ratio = pointRatio(state, team);
  return roundPartyPoints(state.scores[team] * ratio.numerator / ratio.denominator);
}

function compareTeamPoints(state: GetawayState) {
  const crimson = pointRatio(state, 0);
  const cobalt = pointRatio(state, 1);
  const crimsonCross = state.scores[0] * crimson.numerator * cobalt.denominator;
  const cobaltCross = state.scores[1] * cobalt.numerator * crimson.denominator;
  return Math.sign(crimsonCross - cobaltCross);
}

function winningTeam(state: GetawayState): Team | null {
  const comparison = compareTeamPoints(state);
  return comparison === 0 ? null : comparison > 0 ? 0 : 1;
}

function formatPartyNumber(value: number) {
  return roundPartyPoints(value).toLocaleString("en", { maximumFractionDigits: 2 });
}

function teamMultiplier(state: GetawayState, team: Team) {
  const ratio = pointRatio(state, team);
  return ratio.numerator / ratio.denominator;
}

function smallerCrewBonus(state: GetawayState) {
  if (state.crewSizes[0] === state.crewSizes[1]) return null;
  const team = (state.crewSizes[0] < state.crewSizes[1] ? 0 : 1) as Team;
  return { team, multiplier: teamMultiplier(state, team) };
}

function resetActors(state: GetawayState, mode: "round" | "practice") {
  for (const actor of state.actors) {
    const position = spawnFor(actor, mode);
    Object.assign(actor, {
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      facingX: actor.team === 0 ? 1 : -1,
      facingY: 0,
      input: { x: 0, y: 0 },
      inputAge: 0,
      wantsShove: false,
      withdrawn: !actor.connected,
      bags: 0,
      collectFor: 0,
      shoveCooldown: 0,
      windup: 0,
      protection: 0,
      stumble: 0,
      hitPulse: 0,
      depositPulse: 0,
      shovePulse: 0,
      pickupPulse: 0,
      cue: undefined,
    });
  }
  state.loose.length = 0;
  state.deliveries.length = 0;
  state.scores = [0, 0];
  state.supplies.forEach((supply) => Object.assign(supply, { stock: 5, refillFor: 0, pulse: 0 }));
}

function arrangePractice(state: GetawayState, stage: number) {
  for (const actor of state.actors) {
    const lane = Math.floor(actor.seat / 2);
    if (stage === 1) {
      actor.x = actor.team === 0 ? 685 : 915;
      actor.y = 275 + lane * 92;
      actor.facingX = actor.team === 0 ? 1 : -1;
      actor.facingY = 0;
      actor.bags = Math.max(1, actor.bags);
      actor.protection = 0;
    } else if (stage === 2) {
      actor.x = practiceLaneX(actor.team, lane);
      actor.y = 275 + lane * 92;
      actor.facingX = actor.team === 0 ? -1 : 1;
      actor.facingY = 0;
      actor.bags = Math.max(2, actor.bags);
      actor.protection = 0.5;
    }
    actor.vx = 0;
    actor.vy = 0;
    actor.input = { x: 0, y: 0 };
    actor.wantsShove = false;
    actor.collectFor = 0;
    actor.stumble = 0;
  }
  state.loose.length = 0;
}

export function applyGetawayInput(state: GetawayState, playerId: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const frame = value as Partial<GetawayInput>;
  if (typeof frame.x !== "number" || !Number.isFinite(frame.x)) return;
  if (typeof frame.y !== "number" || !Number.isFinite(frame.y)) return;
  if (frame.shove !== undefined && typeof frame.shove !== "boolean") return;
  const actor = state.actors.find((candidate) => candidate.id === playerId);
  if (!actor || !actor.connected || actor.withdrawn) return;
  const x = clamp(frame.x, -1, 1);
  const y = clamp(frame.y, -1, 1);
  const magnitude = Math.hypot(x, y);
  actor.input = magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
  actor.inputAge = 0;
  actor.wantsShove = frame.shove === true;
  if (magnitude > 0.12) {
    actor.facingX = actor.input.x;
    actor.facingY = -actor.input.y;
  }
}

export function setGetawayConnection(state: GetawayState, playerId: string, connected: boolean) {
  const actor = state.actors.find((candidate) => candidate.id === playerId);
  if (!actor) return;
  actor.connected = connected;
  actor.input = { x: 0, y: 0 };
  actor.wantsShove = false;
  actor.inputAge = 0;
  if (connected) {
    actor.disconnectedFor = 0;
    if (actor.withdrawn) {
      const spawn = spawnFor(actor, "round");
      actor.x = spawn.x;
      actor.y = spawn.y;
      actor.vx = 0;
      actor.vy = 0;
      actor.bags = 0;
      actor.withdrawn = false;
      actor.protection = GETAWAY_RULES.protection;
      actor.cue = "protected";
    }
  }
}

function withdraw(state: GetawayState, actor: GetawayActor) {
  if (actor.withdrawn) return;
  while (actor.bags > 0) dropBag(state, actor, actor.facingX, actor.facingY);
  actor.withdrawn = true;
  actor.input = { x: 0, y: 0 };
  actor.wantsShove = false;
  actor.vx = 0;
  actor.vy = 0;
  actor.collectFor = 0;
}

function inEitherApron(actor: Pick<GetawayActor, "x">) {
  return actor.x <= 230 || actor.x >= WORLD_W - 230;
}

function inOwnApron(actor: GetawayActor) {
  return actor.team === 0 ? actor.x <= 230 : actor.x >= WORLD_W - 230;
}

function burst(state: GetawayState, x: number, y: number, color: string, count: number) {
  if (state.reducedMotion) return;
  for (let index = 0; index < count && state.particles.length < 100; index++) {
    const angle = rand(state) * Math.PI * 2;
    const speed = 45 + rand(state) * 130;
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.3 + rand(state) * 0.5, color });
  }
}

function dropBag(state: GetawayState, actor: GetawayActor, directionX: number, directionY: number) {
  if (actor.bags <= 0) return;
  actor.bags -= 1;
  const magnitude = Math.hypot(directionX, directionY);
  const dx = magnitude > .001 ? directionX / magnitude : actor.team === 0 ? 1 : -1;
  const dy = magnitude > .001 ? directionY / magnitude : 0;
  const preferredSide = (actor.seat + actor.bags) % 2 === 0 ? -1 : 1;
  const target = accessibleSpillTarget(actor.x, actor.y, dx, dy, preferredSide);
  const flightFor = .28;
  state.loose.push({
    x: actor.x,
    y: actor.y,
    fromX: actor.x,
    fromY: actor.y,
    targetX: target.x,
    targetY: target.y,
    vx: (target.x - actor.x) / flightFor,
    vy: (target.y - actor.y) / flightFor,
    landIn: flightFor,
    flightFor,
    ownerBlockId: actor.id,
    ownerBlock: GETAWAY_RULES.ownerPickupBlock,
    ownerExitedRange: false,
  });
}

function accessibleSpillTarget(x: number, y: number, dx: number, dy: number, preferredSide: number) {
  const sideX = -dy;
  const sideY = dx;
  const distance = 112;
  for (const side of [preferredSide, -preferredSide]) {
    const candidate = { x: x + sideX * side * distance, y: y + sideY * side * distance };
    if (navigablePoint(candidate.x, candidate.y)) return candidate;
  }
  for (const direction of [1, -1]) {
    const candidate = { x: x + dx * direction * distance, y: y + dy * direction * distance };
    if (navigablePoint(candidate.x, candidate.y)) return candidate;
  }
  // Extremely tight corners retain a stable, reachable endpoint near the owner.
  const candidate = {
    x: clamp(x + sideX * preferredSide * 68, PLAYER_RADIUS + 18, WORLD_W - PLAYER_RADIUS - 18),
    y: clamp(y + sideY * preferredSide * 68, 155 + PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS - 24),
  };
  return navigablePoint(candidate.x, candidate.y) ? candidate : { x, y };
}

function navigablePoint(x: number, y: number) {
  if (x < PLAYER_RADIUS + 18 || x > WORLD_W - PLAYER_RADIUS - 18 || y < 155 + PLAYER_RADIUS || y > WORLD_H - PLAYER_RADIUS - 24) return false;
  for (const wall of WALLS) {
    const nearestX = clamp(x, wall.x, wall.x + wall.w);
    const nearestY = clamp(y, wall.y, wall.y + wall.h);
    if (Math.hypot(x - nearestX, y - nearestY) < PLAYER_RADIUS) return false;
  }
  return true;
}

function resolveWall(actor: GetawayActor, wall: { x: number; y: number; w: number; h: number }) {
  const nearestX = clamp(actor.x, wall.x, wall.x + wall.w);
  const nearestY = clamp(actor.y, wall.y, wall.y + wall.h);
  let dx = actor.x - nearestX;
  let dy = actor.y - nearestY;
  let distance = Math.hypot(dx, dy);
  if (distance >= PLAYER_RADIUS) return;
  if (distance < 0.001) {
    const gaps = [
      { value: Math.abs(actor.x - wall.x), x: -1, y: 0 },
      { value: Math.abs(actor.x - (wall.x + wall.w)), x: 1, y: 0 },
      { value: Math.abs(actor.y - wall.y), x: 0, y: -1 },
      { value: Math.abs(actor.y - (wall.y + wall.h)), x: 0, y: 1 },
    ].sort((a, b) => a.value - b.value);
    dx = gaps[0].x;
    dy = gaps[0].y;
    distance = 1;
  }
  const push = PLAYER_RADIUS - distance;
  actor.x += dx / distance * push;
  actor.y += dy / distance * push;
}

function moveActors(state: GetawayState, dt: number) {
  for (const actor of state.actors) {
    if (actor.withdrawn) continue;
    actor.inputAge += dt;
    if (actor.inputAge > GETAWAY_RULES.staleInput) {
      actor.input = { x: 0, y: 0 };
      actor.wantsShove = false;
    }
    if (actor.stumble > 0) {
      actor.x += actor.vx * dt;
      actor.y += actor.vy * dt;
      actor.vx *= Math.pow(0.04, dt);
      actor.vy *= Math.pow(0.04, dt);
    } else {
      const speed = BASE_SPEED * SPEED_BY_BAGS[actor.bags];
      actor.x += actor.input.x * speed * dt;
      actor.y -= actor.input.y * speed * dt;
      actor.vx = 0;
      actor.vy = 0;
    }
    actor.x = clamp(actor.x, PLAYER_RADIUS + 18, WORLD_W - PLAYER_RADIUS - 18);
    actor.y = clamp(actor.y, 155 + PLAYER_RADIUS, WORLD_H - PLAYER_RADIUS - 24);
    for (const wall of WALLS) resolveWall(actor, wall);
  }

  // Opponents separate softly enough to avoid full overlap. Teammates pass
  // through each other, so defenders cannot build a solid human wall.
  for (let aIndex = 0; aIndex < state.actors.length; aIndex++) {
    const a = state.actors[aIndex];
    if (a.withdrawn) continue;
    for (let bIndex = aIndex + 1; bIndex < state.actors.length; bIndex++) {
      const b = state.actors[bIndex];
      if (b.withdrawn || a.team === b.team) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.01 || distance >= PLAYER_RADIUS * 1.7) continue;
      const push = (PLAYER_RADIUS * 1.7 - distance) * 0.12;
      a.x -= dx / distance * push;
      a.y -= dy / distance * push;
      b.x += dx / distance * push;
      b.y += dy / distance * push;
    }
  }
}

function bankActors(state: GetawayState) {
  for (const actor of state.actors) {
    if (actor.withdrawn || actor.bags <= 0 || !inOwnApron(actor)) continue;
    const deposited = actor.bags;
    state.scores[actor.team] += deposited;
    actor.bags = 0;
    actor.depositPulse = 0.65;
    actor.cue = "deposit";
    hostCue(state, "deposit");
    const multiplier = teamMultiplier(state, actor.team);
    state.callout = multiplier > 1
      ? `${actor.name.toUpperCase()} BANKS ${deposited} · ${formatPartyNumber(deposited * multiplier)} POINTS`
      : `${actor.name.toUpperCase()} BANKS ${deposited}`;
    state.calloutFor = 1.35;
    burst(state, actor.x, actor.y, "#f6bf2e", 6 + deposited * 2);
    for (let index = 0; index < deposited && state.deliveries.length < 40; index++) {
      state.deliveries.push({
        x: actor.x,
        y: actor.y,
        toX: actor.team === 0 ? 122 : 1478,
        toY: 685,
        life: .64,
        max: .64,
        delay: index * .045,
      });
    }
  }
}

function supplyForActor(state: GetawayState, actor: GetawayActor) {
  if (state.phase === "practice" && state.practiceStage === 0) {
    const practice = practicePosition(actor);
    return Math.hypot(actor.x - practice.x, actor.y - practice.y) <= 68 ? { practice, supply: null } : null;
  }
  if (state.phase !== "live" || state.vaultClosed) return null;
  const supply = state.supplies.find((candidate) => candidate.stock > 0 && Math.hypot(actor.x - candidate.x, actor.y - candidate.y) <= GETAWAY_RULES.supplyRadius);
  return supply ? { practice: null, supply } : null;
}

function collectAndPickup(state: GetawayState, dt: number) {
  for (const supply of state.supplies) {
    supply.pulse = Math.max(0, supply.pulse - dt);
    if (state.phase !== "live" || state.vaultClosed || supply.stock >= 5) continue;
    supply.refillFor += dt;
    while (supply.refillFor >= GETAWAY_RULES.supplyRefill - 1e-6 && supply.stock < 5) {
      supply.refillFor -= GETAWAY_RULES.supplyRefill;
      supply.stock += 1;
      supply.pulse = 0.25;
    }
  }

  for (const actor of state.actors) {
    if (actor.withdrawn || actor.stumble > 0 || actor.bags >= GETAWAY_RULES.capacity) {
      actor.collectFor = 0;
      continue;
    }
    const nearby = supplyForActor(state, actor);
    if (!nearby) actor.collectFor = 0;
    else {
      actor.collectFor += dt;
      if (actor.collectFor >= GETAWAY_RULES.collectSeconds - 1e-6) {
        actor.collectFor -= GETAWAY_RULES.collectSeconds;
        actor.bags += 1;
        if (nearby.supply) {
          nearby.supply.stock -= 1;
          nearby.supply.pulse = 0.3;
          nearby.supply.refillFor = 0;
        }
        actor.cue = "pickup";
        actor.pickupPulse = .32;
        hostCue(state, "pickup");
        burst(state, actor.x, actor.y - 20, "#f6bf2e", 4);
      }
    }
  }

  for (const bag of state.loose) {
    bag.landIn = Math.max(0, bag.landIn - dt);
    bag.ownerBlock = Math.max(0, bag.ownerBlock - dt);
    const progress = 1 - bag.landIn / bag.flightFor;
    const eased = 1 - (1 - progress) ** 2;
    bag.x = bag.fromX + (bag.targetX - bag.fromX) * eased;
    bag.y = bag.fromY + (bag.targetY - bag.fromY) * eased;
    if (bag.landIn === 0) {
      bag.x = bag.targetX;
      bag.y = bag.targetY;
      bag.vx = 0;
      bag.vy = 0;
    }
    if (!bag.ownerExitedRange) {
      const owner = state.actors.find((actor) => actor.id === bag.ownerBlockId);
      bag.ownerExitedRange = !owner || owner.withdrawn || Math.hypot(owner.x - bag.x, owner.y - bag.y) > PLAYER_RADIUS + 24;
    }
  }
  for (let index = state.loose.length - 1; index >= 0; index--) {
    const bag = state.loose[index];
    if (bag.landIn > 0) continue;
    const picker = state.actors
      .filter((actor) => !actor.withdrawn && actor.stumble <= 0 && actor.bags < GETAWAY_RULES.capacity)
      .filter((actor) => actor.id !== bag.ownerBlockId || (bag.ownerBlock <= 0 && bag.ownerExitedRange))
      .map((actor) => ({ actor, distance: Math.hypot(actor.x - bag.x, actor.y - bag.y) }))
      .filter(({ distance }) => distance <= PLAYER_RADIUS + 17)
      .sort((a, b) => a.distance - b.distance || a.actor.seat - b.actor.seat)[0]?.actor;
    if (!picker) continue;
    picker.bags += 1;
    picker.cue = "pickup";
    picker.pickupPulse = .32;
    hostCue(state, "pickup");
    burst(state, bag.x, bag.y, "#f6bf2e", 5);
    state.loose.splice(index, 1);
  }
}

function resolveShoves(state: GetawayState, dt: number) {
  const striking: GetawayActor[] = [];
  for (const actor of state.actors) {
    if (actor.withdrawn) continue;
    const before = actor.windup;
    actor.shoveCooldown = Math.max(0, actor.shoveCooldown - dt);
    actor.windup = Math.max(0, actor.windup - dt);
    if (before > 0 && actor.windup === 0) striking.push(actor);
    if (actor.wantsShove && actor.shoveCooldown <= 0 && actor.stumble <= 0 && !inEitherApron(actor)) {
      actor.shoveCooldown = GETAWAY_RULES.shoveCooldown;
      actor.windup = GETAWAY_RULES.shoveWindup;
      actor.cue = "shove";
    }
  }

  // Choose all targets before applying protection so simultaneous valid hits
  // both land instead of depending on actor iteration order.
  const hits = striking.filter((attacker) => !inEitherApron(attacker)).map((attacker) => {
    const candidates = state.actors
      .filter((target) => target.team !== attacker.team && !target.withdrawn && target.protection <= 0 && !inOwnApron(target))
      .map((target) => {
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distance = Math.hypot(dx, dy);
        const dot = distance > 0 ? (dx / distance) * attacker.facingX + (dy / distance) * attacker.facingY : 1;
        return { target, distance, dot };
      })
      .filter(({ distance, dot }) => distance <= GETAWAY_RULES.shoveRange && dot >= 0.36)
      .sort((a, b) => a.distance - b.distance || a.target.seat - b.target.seat);
    return { attacker, target: candidates[0]?.target };
  });

  for (const { attacker, target } of hits) {
    attacker.shovePulse = .24;
    if (!target) continue;
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const spilled = target.bags > 0;
    target.vx += nx * 265;
    target.vy += ny * 265;
    target.stumble = GETAWAY_RULES.stumble;
    target.protection = GETAWAY_RULES.protection;
    target.hitPulse = 0.42;
    target.cue = spilled ? "spill" : "protected";
    if (spilled) {
      dropBag(state, target, nx, ny);
      hostCue(state, "spill");
    } else hostCue(state, "shove");
    state.callout = target.bags >= 3 ? `${target.name.toUpperCase()} STILL HAS ${target.bags} — ESCORT!`
      : spilled ? `${attacker.name.toUpperCase()} SPILLS THE HAUL`
      : `${attacker.name.toUpperCase()} MAKES AN OPENING`;
    state.calloutFor = 1.1;
    burst(state, target.x, target.y, "#fff5c9", 10);
  }
}

function updateTimers(state: GetawayState, dt: number) {
  state.calloutFor = Math.max(0, state.calloutFor - dt);
  state.vaultPulse = Math.max(0, state.vaultPulse - dt);
  for (const actor of state.actors) {
    actor.protection = Math.max(0, actor.protection - dt);
    actor.stumble = Math.max(0, actor.stumble - dt);
    actor.hitPulse = Math.max(0, actor.hitPulse - dt);
    actor.depositPulse = Math.max(0, actor.depositPulse - dt);
    actor.shovePulse = Math.max(0, actor.shovePulse - dt);
    actor.pickupPulse = Math.max(0, actor.pickupPulse - dt);
    if (!actor.connected) {
      actor.disconnectedFor += dt;
      if (actor.disconnectedFor >= GETAWAY_RULES.disconnectWithdraw) withdraw(state, actor);
    }
  }
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.08, dt);
    particle.vy *= Math.pow(0.08, dt);
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const delivery of state.deliveries) {
    if (delivery.delay > 0) delivery.delay -= dt;
    else delivery.life -= dt;
  }
  state.deliveries = state.deliveries.filter((delivery) => delivery.life > 0);
}

function updateShortage(state: GetawayState, dt: number) {
  if (state.phase !== "live") return;
  const connected: [number, number] = [0, 0];
  for (const actor of state.actors) if (actor.connected && !actor.withdrawn) connected[actor.team] += 1;
  if (connected[0] < state.crewSizes[0] || connected[1] < state.crewSizes[1]) {
    state.shortageFor += dt;
    if (state.shortageFor >= GETAWAY_RULES.shortagePause) state.paused = true;
  } else {
    state.shortageFor = 0;
    if (state.paused) {
      state.paused = false;
      state.callout = "CREWS RESTORED · GO!";
      state.calloutFor = 1.5;
    }
  }
}

export function stepGetawayState(state: GetawayState, rawDt: number) {
  const dt = clamp(rawDt, 0, 0.05);
  if (dt <= 0 || state.phase === "invalid" || state.phase === "over") return;
  updateTimers(state, dt);
  if (state.waitingForControllers > 0) return;
  updateShortage(state, dt);
  if (state.paused) return;

  if (state.phase === "results") {
    state.phaseTime += dt;
    if (state.phaseTime >= GETAWAY_RULES.resultHold) state.phase = "over";
    return;
  }

  state.phaseTime += dt;
  if (state.phase === "practice") {
    const nextStage = state.phaseTime >= 13 ? 2 : state.phaseTime >= 7 ? 1 : 0;
    if (nextStage !== state.practiceStage) {
      state.practiceStage = nextStage;
      arrangePractice(state, nextStage);
      state.callout = nextStage === 1 ? "PRACTICE · FACE THEM AND HOLD SHOVE" : "PRACTICE · CARRY THE BAGS HOME";
      state.calloutFor = 3;
    }
    moveActors(state, dt);
    bankActors(state);
    collectAndPickup(state, dt);
    resolveShoves(state, dt);
    if (state.phaseTime >= GETAWAY_RULES.practice) {
      state.phase = "runway";
      state.phaseTime = 0;
      resetActors(state, "round");
      state.callout = "GRAB · SHOVE · BANK";
      state.calloutFor = 4;
      state.lastCountdown = 4;
    }
    return;
  }

  if (state.phase === "runway") {
    const beat = Math.ceil(GETAWAY_RULES.runway - state.phaseTime);
    if (beat > 0 && beat <= 3 && beat < state.lastCountdown) {
      state.lastCountdown = beat;
      hostCue(state, "countdown");
    }
    if (state.phaseTime >= GETAWAY_RULES.runway) {
      state.phase = "live";
      state.phaseTime = 0;
      state.remaining = GETAWAY_RULES.round;
      resetActors(state, "round");
      state.callout = "GO!";
      state.calloutFor = 1.2;
      hostCue(state, "go");
      for (const actor of state.actors) actor.cue = "go";
    }
    return;
  }

  state.remaining = Math.max(0, GETAWAY_RULES.round - state.phaseTime);
  if (!state.vaultClosed && state.phaseTime >= GETAWAY_RULES.vaultCloseAt - 1e-6) {
    state.vaultClosed = true;
    state.vaultPulse = 2;
    state.callout = "VAULT CLOSED · BANK WHAT'S LEFT";
    state.calloutFor = 3;
    hostCue(state, "vault");
    for (const actor of state.actors) actor.cue = "vault";
  }
  moveActors(state, dt);
  // Deposits resolve before shove contacts in the same simulation step.
  bankActors(state);
  collectAndPickup(state, dt);
  resolveShoves(state, dt);
  if (state.remaining <= 1e-6) {
    state.phase = "results";
    state.phaseTime = 0;
    for (const actor of state.actors) {
      actor.input = { x: 0, y: 0 };
      actor.wantsShove = false;
    }
    const winner = winningTeam(state);
    state.callout = winner === null ? "DEAD EVEN" : `${TEAM_NAMES[winner].toUpperCase()} GETS AWAY`;
    state.calloutFor = GETAWAY_RULES.resultHold;
    hostCue(state, "finish");
    const winning = winner;
    for (let index = 0; index < 54; index++) {
      const team = winning ?? (index % 2) as Team;
      burst(state, index % 2 ? 1345 : 255, 270 + rand(state) * 420, TEAM_COLORS[team], 1);
    }
  }
}

export function getawayResults(state: GetawayState): RoundResult[] {
  const winner = winningTeam(state);
  return state.actors.map((actor) => ({
    id: actor.id,
    place: winner === null || actor.team === winner ? 1 : 2,
    score: teamPoints(state, actor.team),
    detail: `${TEAM_NAMES[actor.team]} · ${state.scores[actor.team]} raw bags${teamMultiplier(state, actor.team) > 1 ? ` ×${formatPartyNumber(teamMultiplier(state, actor.team))} smaller-crew bonus` : ""} · ${formatPartyNumber(teamPoints(state, actor.team))} points`,
  })).sort((a, b) => a.place - b.place || a.id.localeCompare(b.id));
}

function phoneFrame(state: GetawayState, actor: GetawayActor): GetawayPhoneFrame {
  const active = state.phase === "practice" || state.phase === "live";
  const bonus = smallerCrewBonus(state);
  const status = state.waitingForControllers > 0 ? `READY · waiting for ${state.waitingForControllers} controller${state.waitingForControllers === 1 ? "" : "s"}`
    : state.paused ? "TEAM SHORT · host can exit or wait for reconnect"
    : actor.withdrawn ? "WITHDRAWN · reconnect to return at your van"
    : !actor.connected ? `SIGNAL LOST · withdrawing in ${Math.max(0, GETAWAY_RULES.disconnectWithdraw - actor.disconnectedFor).toFixed(1)}s`
    : state.phase === "practice" ? state.practiceStage === 0 ? "Stay on the bag pile · pickup is automatic"
      : state.practiceStage === 1 ? "Face an opponent · hold SHOVE"
      : "Reach your own van · banking is automatic"
    : state.phase === "runway" ? bonus
      ? `Find your number · ${TEAM_NAMES[bonus.team]} smaller crew ×${formatPartyNumber(bonus.multiplier)}`
      : "Find your number · get both thumbs ready"
    : state.phase === "live" ? state.vaultClosed ? "Vault closed · bank loose and carried bags" : actor.bags >= 4 ? "Heavy load · call for an escort" : "Collect, escort, intercept"
    : "Look up for the crew result";
  return {
    t: "getawayState",
    phase: state.phase,
    interactive: active && state.waitingForControllers === 0 && !state.paused && actor.connected && !actor.withdrawn,
    connected: actor.connected,
    crew: TEAM_NAMES[actor.team],
    crewShape: actor.team === 0 ? "triangle" : "circle",
    bags: actor.bags,
    crewBanked: state.scores[actor.team],
    crewPoints: teamPoints(state, actor.team),
    crewMultiplier: teamMultiplier(state, actor.team),
    remaining: state.phase === "practice" ? Math.max(0, GETAWAY_RULES.practice - state.phaseTime) : state.phase === "runway" ? Math.max(0, GETAWAY_RULES.runway - state.phaseTime) : state.remaining,
    shoveReady: active && state.waitingForControllers === 0 && !state.paused && actor.shoveCooldown <= 0 && !inEitherApron(actor),
    shoveCooldown: actor.shoveCooldown,
    protected: actor.protection > 0 || inOwnApron(actor),
    withdrawn: actor.withdrawn,
    status,
    cue: actor.cue,
    syncToken: state.syncToken,
  };
}

function spectatorFrame(state: GetawayState): GetawayPhoneFrame {
  return {
    t: "getawayState",
    phase: "spectating",
    interactive: false,
    connected: true,
    crew: null,
    crewShape: null,
    bags: 0,
    crewBanked: 0,
    crewPoints: 0,
    crewMultiplier: 1,
    remaining: state.remaining,
    shoveReady: false,
    shoveCooldown: 0,
    protected: false,
    withdrawn: false,
    status: "ROUND IN PROGRESS · you are in for the next game",
  };
}

function invalidFrame(state: GetawayState): GetawayPhoneFrame {
  return {
    t: "getawayState",
    phase: "invalid",
    interactive: false,
    connected: true,
    crew: null,
    crewShape: null,
    bags: 0,
    crewBanked: 0,
    crewPoints: 0,
    crewMultiplier: 1,
    remaining: 0,
    shoveReady: false,
    shoveCooldown: 0,
    protected: false,
    withdrawn: false,
    status: state.invalidReason ?? "RETURN TO THE LOBBY",
  };
}

export function createHost(ctx: HostContext): GameHost {
  preloadGetawayArt();
  const state = createGetawayState(ctx.players, ctx.seed);
  state.syncToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  state.reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const initialIds = new Set(ctx.players.map((player) => player.id));
  const syncedIds = new Set<string>();
  if (state.phase !== "invalid") state.waitingForControllers = state.actors.length;
  const sound = typeof AudioContext === "undefined" ? null : new GetawaySound("host");
  let phoneClock = 0;

  const sendFrames = (to?: string) => {
    if (to) {
      const actor = state.actors.find((candidate) => candidate.id === to);
      const spectator = state.spectators.find((candidate) => candidate.id === to);
      ctx.send(state.phase === "invalid" ? invalidFrame(state) : actor ? phoneFrame(state, actor) : spectator ? spectatorFrame(state) : spectatorFrame(state), to);
      if (actor) actor.cue = undefined;
      return;
    }
    const frames: Record<string, GetawayPhoneFrame> = {};
    if (state.phase === "invalid") {
      for (const player of ctx.players) frames[player.id] = invalidFrame(state);
    } else {
      for (const actor of state.actors) frames[actor.id] = phoneFrame(state, actor);
      for (const spectator of state.spectators) frames[spectator.id] = spectatorFrame(state);
    }
    ctx.send({ t: "getawayStates", frames } satisfies GetawayPhoneFrames);
    for (const actor of state.actors) actor.cue = undefined;
  };

  return {
    onJoin(player) {
      if (initialIds.has(player.id) || state.spectators.some((candidate) => candidate.id === player.id)) return;
      state.spectators.push(player);
      sendFrames(player.id);
    },
    onLeave(id) {
      setGetawayConnection(state, id, false);
      const spectator = state.spectators.find((candidate) => candidate.id === id);
      if (spectator) spectator.connected = false;
    },
    onConnectionChange(id, connected) {
      setGetawayConnection(state, id, connected);
      const spectator = state.spectators.find((candidate) => candidate.id === id);
      if (spectator) spectator.connected = connected;
    },
    onInput(id, value) {
      const sync = !!value && typeof value === "object" && !Array.isArray(value) && (value as { sync?: unknown }).sync === true;
      applyGetawayInput(state, id, value);
      if (sync && initialIds.has(id)) {
        const wasWaiting = state.waitingForControllers;
        syncedIds.add(id);
        state.waitingForControllers = Math.max(0, state.actors.length - syncedIds.size);
        sendFrames(id);
        if (wasWaiting > 0 && state.waitingForControllers === 0) sendFrames();
      }
    },
    tick(dt) {
      stepGetawayState(state, dt);
      for (const cue of state.hostCues.splice(0)) sound?.play(cue);
      phoneClock += Math.min(Math.max(dt, 0), 0.05);
      if (phoneClock >= 0.1) {
        phoneClock %= 0.1;
        sendFrames();
      }
    },
    render(c, w, h) {
      renderGetaway(state, c, w, h);
    },
    isOver: () => state.phase === "over",
    results: () => getawayResults(state),
    destroy() {
      state.hostCues.length = 0;
      sound?.destroy();
    },
  };
}

export function renderGetaway(state: GetawayState, c: CanvasRenderingContext2D, width: number, height: number) {
  c.save();
  c.fillStyle = "#efe4cc";
  c.fillRect(0, 0, width, height);
  const scale = Math.min(width / WORLD_W, height / WORLD_H);
  c.translate((width - WORLD_W * scale) / 2, (height - WORLD_H * scale) / 2);
  c.scale(scale, scale);

  const courtyard = getawayArt("courtyard");
  if (courtyard) {
    // Compress the modeled bank façade into the simulation's 172px top bound;
    // the remaining paving stretches slightly to retain the fixed 1600×900 world.
    c.drawImage(courtyard, 0, 0, 1600, 210, 0, 0, WORLD_W, 172);
    c.drawImage(courtyard, 0, 210, 1600, 690, 0, 172, WORLD_W, WORLD_H - 172);
  }
  else {
    c.fillStyle = "#f7eedc";
    c.fillRect(0, 0, WORLD_W, WORLD_H);
  drawStone(c);
  }
  c.save();
  projectStage(c);
  drawVans(c);
  if (state.phase === "practice" && state.practiceStage === 0) drawPracticePiles(c, state.actors);
  for (const delivery of state.deliveries) {
    if (delivery.delay > 0) continue;
    const progress = 1 - delivery.life / delivery.max;
    const eased = 1 - (1 - progress) ** 3;
    const x = delivery.x + (delivery.toX - delivery.x) * eased;
    const y = delivery.y + (delivery.toY - delivery.y) * eased - (state.reducedMotion ? 0 : Math.sin(progress * Math.PI) * 92);
    drawBag(c, x, y, .82 + Math.sin(progress * Math.PI) * .18);
  }
  state.actorDrawOrder.sort((a, b) => state.actors[a].y - state.actors[b].y || state.actors[a].seat - state.actors[b].seat);
  let actorCursor = 0;
  actorCursor = drawActorsThrough(state, c, actorCursor, 327);
  drawWall(c, WALLS[0]); drawWall(c, WALLS[2]);
  actorCursor = drawActorsThrough(state, c, actorCursor, 455);
  drawVault(state, c);
  actorCursor = drawActorsThrough(state, c, actorCursor, 665);
  drawWall(c, WALLS[1]); drawWall(c, WALLS[3]);
  drawActorsThrough(state, c, actorCursor, Number.POSITIVE_INFINITY);
  for (const bag of state.loose) drawLooseBag(state, c, bag);
  if (state.phase !== "results" && state.phase !== "over") drawParticles(c, state.particles);
  for (const index of state.actorDrawOrder) {
    const actor = state.actors[index];
    if (!actor.withdrawn) drawActorLabel(c, actor);
  }
  c.restore();
  drawHud(state, c);
  drawOverlay(state, c);
  if (state.phase === "results" || state.phase === "over") {
    c.save();
    projectStage(c);
    drawParticles(c, state.particles);
    c.restore();
  }
  c.restore();
}

function projectStage(c: CanvasRenderingContext2D) {
  c.translate(0, STAGE_Y_OFFSET);
  c.scale(1, STAGE_Y_SCALE);
}

function drawLooseBag(state: GetawayState, c: CanvasRenderingContext2D, bag: GetawayLooseBag) {
  if (bag.landIn > 0) {
    c.save();
    c.strokeStyle = "rgba(180,123,13,.72)";
    c.lineWidth = 4;
    c.setLineDash([8, 11]);
    c.beginPath(); c.moveTo(bag.fromX, bag.fromY); c.lineTo(bag.targetX, bag.targetY); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(246,191,46,.16)";
    c.strokeStyle = "#f6bf2e";
    c.lineWidth = 5;
    c.beginPath(); c.ellipse(bag.targetX, bag.targetY, 31, 16, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }
  const progress = 1 - bag.landIn / bag.flightFor;
  const x = state.reducedMotion && bag.landIn > 0 ? bag.targetX : bag.x;
  const y = state.reducedMotion && bag.landIn > 0 ? bag.targetY : bag.y - Math.sin(progress * Math.PI) * 72;
  drawBag(c, x, y, 1);
}

function drawActorsThrough(state: GetawayState, c: CanvasRenderingContext2D, from: number, depth: number) {
  let cursor = from;
  while (cursor < state.actorDrawOrder.length) {
    const actor = state.actors[state.actorDrawOrder[cursor]];
    if (actor.y > depth) break;
    cursor += 1;
    if (!actor.withdrawn) drawActor(c, actor, state.reducedMotion);
  }
  return cursor;
}

function drawParticles(c: CanvasRenderingContext2D, particles: GetawayParticle[]) {
  for (const particle of particles) {
    c.globalAlpha = Math.min(1, particle.life * 2.5);
    c.fillStyle = particle.color;
    c.beginPath();
    c.arc(particle.x, particle.y, 5 + particle.life * 4, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

function drawStone(c: CanvasRenderingContext2D) {
  c.strokeStyle = "rgba(99,75,46,.09)";
  c.lineWidth = 2;
  for (let y = 170; y < WORLD_H; y += 72) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(WORLD_W, y);
    c.stroke();
    for (let x = (Math.floor(y / 72) % 2) * 70; x < WORLD_W; x += 140) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 72);
      c.stroke();
    }
  }
}

function drawHud(state: GetawayState, c: CanvasRenderingContext2D) {
  c.fillStyle = "rgba(16,35,42,.24)";
  roundRect(c, 508, 23, 600, 116, 24); c.fill();
  c.fillStyle = "#15272d";
  c.strokeStyle = "#0a171b";
  c.lineWidth = 7;
  roundRect(c, 500, 14, 600, 116, 24); c.fill(); c.stroke();
  c.fillStyle = TEAM_COLORS[0];
  roundRect(c, 513, 27, 152, 90, 16); c.fill();
  c.fillStyle = TEAM_COLORS[1];
  roundRect(c, 935, 27, 152, 90, 16); c.fill();
  crewScore(c, state, 0, 589);
  crewScore(c, state, 1, 1011);
  c.textAlign = "center";
  c.fillStyle = "#fffaf0";
  c.font = "950 21px Archivo, system-ui, sans-serif";
  c.fillText(state.phase === "practice" ? "PRACTICE CAPER" : state.phase === "runway" ? "GETAWAY" : state.phase === "results" || state.phase === "over" ? "FINAL HAUL" : "GETAWAY", WORLD_W / 2, 45);
  c.font = "950 49px Archivo, system-ui, sans-serif";
  const seconds = state.phase === "practice" ? Math.ceil(GETAWAY_RULES.practice - state.phaseTime)
    : state.phase === "runway" ? Math.ceil(GETAWAY_RULES.runway - state.phaseTime)
    : Math.ceil(state.remaining);
  c.fillText(`${Math.max(0, seconds)}`, WORLD_W / 2, 101);
}

function crewScore(c: CanvasRenderingContext2D, state: GetawayState, team: Team, x: number) {
  const points = teamPoints(state, team);
  const multiplier = teamMultiplier(state, team);
  c.textAlign = "center";
  c.fillStyle = "#fffaf0";
  c.font = "950 14px Archivo, system-ui, sans-serif";
  c.fillText(`${team === 0 ? "▲" : "●"} ${TEAM_NAMES[team].toUpperCase()} CREW`, x, 45);
  c.font = "950 31px Archivo, system-ui, sans-serif";
  c.fillText(`${formatPartyNumber(points)}`, x, 79);
  c.font = "900 14px Archivo, system-ui, sans-serif";
  c.fillText(`POINTS · ${state.scores[team]} BAGS`, x, multiplier > 1 ? 99 : 108);
  if (multiplier > 1) c.fillText(`×${formatPartyNumber(multiplier)} CREW BONUS`, x, 116);
}

function drawVans(c: CanvasRenderingContext2D) {
  for (const team of [0, 1] as const) {
    const x = team === 0 ? 24 : WORLD_W - 224;
    const goalX = team === 0 ? -22 : WORLD_W - 226;
    c.fillStyle = `${TEAM_COLORS[team]}05`;
    c.fillRect(team === 0 ? 0 : WORLD_W - 230, 145, 230, WORLD_H - 145);
    c.strokeStyle = `${TEAM_COLORS[team]}55`;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(team === 0 ? 230 : WORLD_W - 230, 145);
    c.lineTo(team === 0 ? 230 : WORLD_W - 230, WORLD_H);
    c.stroke();
    c.fillStyle = `${TEAM_COLORS[team]}0d`;
    c.strokeStyle = `${TEAM_COLORS[team]}88`;
    c.lineWidth = 4;
    roundRect(c, goalX, 548, 248, 330, 34); c.fill(); c.stroke();
    const van = getawayArt(team === 0 ? "vanCrimson" : "vanCobalt");
    if (van) {
      c.drawImage(van, x - 50, 590, 300, 225);
      c.fillStyle = "#fffaf0";
      c.strokeStyle = TEAM_DARK[team];
      c.lineWidth = 4;
      c.textAlign = "center";
      c.font = "950 27px Archivo, system-ui, sans-serif";
      c.strokeText(team === 0 ? "▲" : "●", x + 100, 704);
      c.fillText(team === 0 ? "▲" : "●", x + 100, 704);
      c.fillStyle = "#10232a";
      c.font = "950 18px Archivo, system-ui, sans-serif";
      c.fillText("YOUR VAN", x + 100, 575);
      continue;
    }
    c.fillStyle = "rgba(16,35,42,.18)";
    c.beginPath(); c.ellipse(x + 100, 772, 102, 25, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = TEAM_DARK[team];
    c.strokeStyle = "#10232a";
    c.lineWidth = 7;
    roundRect(c, x, 610, 200, 154, 22);
    c.fill(); c.stroke();
    c.fillStyle = TEAM_COLORS[team];
    roundRect(c, x + 20, 626, 160, 80, 15); c.fill();
    c.fillStyle = "#bfe8ed";
    c.strokeStyle = "#10232a";
    c.lineWidth = 5;
    roundRect(c, x + 42, 638, 116, 42, 9); c.fill(); c.stroke();
    c.strokeStyle = TEAM_DARK[team];
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(x + 100, 640); c.lineTo(x + 100, 678); c.stroke();
    c.fillStyle = "#f6bf2e";
    c.fillRect(x + 29, 715, 20, 13);
    c.fillRect(x + 151, 715, 20, 13);
    c.fillStyle = "#fffaf0";
    c.font = "900 14px Archivo, system-ui, sans-serif";
    c.textAlign = "center";
    c.fillText("GETAWAY", x + 100, 746);
    c.fillStyle = "#fffaf0";
    c.textAlign = "center";
    c.font = "950 34px Archivo, system-ui, sans-serif";
    c.fillText(team === 0 ? "▲" : "●", x + 100, 706);
    c.font = "900 20px Archivo, system-ui, sans-serif";
    c.fillText("YOUR VAN", x + 100, 598);
    c.fillStyle = "#10232a";
    c.beginPath();
    c.arc(x + 45, 778, 22, 0, Math.PI * 2);
    c.arc(x + 155, 778, 22, 0, Math.PI * 2);
    c.fill();
  }
}

function drawWall(c: CanvasRenderingContext2D, wall: typeof WALLS[number]) {
  const hedge = getawayArt("hedge");
  if (hedge) {
    c.drawImage(hedge, wall.x - 20, wall.y - 18, wall.w + 40, wall.h + 36);
    return;
  }
  c.fillStyle = "#baa982";
  c.strokeStyle = "#463d31";
  c.lineWidth = 7;
  roundRect(c, wall.x, wall.y, wall.w, wall.h, 16);
  c.fill();
  c.stroke();
  c.fillStyle = "rgba(255,255,255,.28)";
  c.fillRect(wall.x + 12, wall.y + 12, wall.w - 24, 13);
}

function drawVault(state: GetawayState, c: CanvasRenderingContext2D) {
  c.save();
  c.translate(800, 430);
  const vault = getawayArt("vault");
  if (vault) c.drawImage(vault, -150, -133, 300, 300);
  else {
    c.fillStyle = "#d7c9aa";
    c.strokeStyle = "#10232a";
    c.lineWidth = 8;
    c.beginPath();
    c.arc(0, 0, 122, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  const shutter = state.vaultClosed ? 1 : state.phase === "live" && state.phaseTime >= GETAWAY_RULES.vaultWarningAt
    ? clamp((state.phaseTime - GETAWAY_RULES.vaultWarningAt) / (GETAWAY_RULES.vaultCloseAt - GETAWAY_RULES.vaultWarningAt), 0, 1)
    : 0;
  if (!vault) {
    c.fillStyle = state.vaultClosed ? "#5e6a6e" : "rgba(38,62,71,.92)";
    c.strokeStyle = "#10232a";
    c.lineWidth = 8;
    c.beginPath();
    c.arc(0, 0, 78, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = state.vaultClosed ? "#aeb8b8" : "#f6bf2e";
    c.lineWidth = 12;
    c.beginPath();
    c.arc(0, 0, 43, 0, Math.PI * 2);
    c.moveTo(-43, 0); c.lineTo(43, 0);
    c.moveTo(0, -43); c.lineTo(0, 43);
    c.stroke();
    if (shutter > 0) drawVaultShutter(c, shutter);
  }
  c.fillStyle = "#10232a";
  c.textAlign = "center";
  c.font = "950 20px Archivo, system-ui, sans-serif";
  const warning = state.phase === "live" && state.phaseTime >= GETAWAY_RULES.vaultWarningAt && !state.vaultClosed;
  c.fillText(state.vaultClosed ? "VAULT CLOSED" : warning ? `CLOSING IN ${Math.ceil(GETAWAY_RULES.vaultCloseAt - state.phaseTime)}` : "BANK VAULT", 0, vault ? -146 : 142);
  c.restore();
  for (const supply of state.supplies) {
    c.save();
    c.translate(supply.x, supply.y);
    c.fillStyle = vault ? "rgba(246,191,46,.09)" : "rgba(246,191,46,.16)";
    c.strokeStyle = supply.stock ? "#b47b0d" : "rgba(16,35,42,.25)";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, (vault ? 40 : 60) + (state.reducedMotion ? 0 : supply.pulse * (vault ? 6 : 16)), 0, Math.PI * 2);
    c.fill(); c.stroke();
    if (state.vaultClosed) {
      if (vault) drawSupplyShutter(c, 1);
      else {
        c.strokeStyle = "#10232a";
        c.lineWidth = 9;
        c.beginPath();
        c.moveTo(-34, -34); c.lineTo(34, 34);
        c.moveTo(34, -34); c.lineTo(-34, 34);
        c.stroke();
      }
      c.fillStyle = "#10232a";
      c.font = "950 15px Archivo, system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText("SEALED", 0, 84);
    } else {
      if (vault && supply.stock > 0) {
        drawBag(c, 0, -3, .82);
        c.fillStyle = "#15272d";
        c.strokeStyle = "#fffaf0";
        c.lineWidth = 3;
        roundRect(c, 18, -35, 38, 25, 10); c.fill(); c.stroke();
        c.fillStyle = "#fffaf0";
        c.font = "950 16px Archivo, system-ui, sans-serif";
        c.textAlign = "center";
        c.fillText(`×${supply.stock}`, 37, -17);
      } else if (!vault) {
        for (let index = 0; index < supply.stock; index++) drawBag(c, (index - 2) * 18, (index % 2) * 13 - 5, 0.7);
      }
      if (vault && shutter > 0) drawSupplyShutter(c, shutter);
    }
    c.restore();
  }
}

function drawSupplyShutter(c: CanvasRenderingContext2D, progress: number) {
  c.save();
  roundRect(c, -45, -37, 90, 74, 9); c.clip();
  c.fillStyle = "#69767b";
  c.strokeStyle = "#24363c";
  c.lineWidth = 4;
  const door = 45 * progress;
  c.fillRect(-45, -37, door, 74); c.strokeRect(-45, -37, door, 74);
  c.fillRect(45 - door, -37, door, 74); c.strokeRect(45 - door, -37, door, 74);
  c.strokeStyle = "rgba(255,255,255,.35)";
  c.lineWidth = 2;
  for (let y = -24; y <= 24; y += 16) {
    c.beginPath(); c.moveTo(-45, y); c.lineTo(-45 + door, y); c.moveTo(45 - door, y); c.lineTo(45, y); c.stroke();
  }
  c.restore();
}

function drawVaultShutter(c: CanvasRenderingContext2D, progress: number) {
  c.save();
  c.beginPath(); c.arc(0, 0, 77, 0, Math.PI * 2); c.clip();
  c.fillStyle = "#788489";
  c.strokeStyle = "#10232a";
  c.lineWidth = 5;
  const door = 80 * progress;
  c.fillRect(-79, -79, door, 158);
  c.strokeRect(-79, -79, door, 158);
  c.fillRect(79 - door, -79, door, 158);
  c.strokeRect(79 - door, -79, door, 158);
  c.strokeStyle = "rgba(255,255,255,.34)";
  c.lineWidth = 3;
  for (let y = -58; y <= 58; y += 23) {
    c.beginPath(); c.moveTo(-79, y); c.lineTo(-79 + door, y); c.moveTo(79 - door, y); c.lineTo(79, y); c.stroke();
  }
  c.restore();
}

function drawPracticePiles(c: CanvasRenderingContext2D, actors: GetawayActor[]) {
  actors.forEach((actor) => {
    const position = practicePosition(actor);
    c.strokeStyle = TEAM_COLORS[actor.team];
    c.fillStyle = "rgba(246,191,46,.2)";
    c.lineWidth = 5;
    c.beginPath(); c.arc(position.x, position.y, 72, 0, Math.PI * 2); c.fill(); c.stroke();
    for (let index = 0; index < 5; index++) drawBag(c, position.x + (index - 2) * 20, position.y + (index % 2) * 15, .8);
  });
}

function drawActor(c: CanvasRenderingContext2D, actor: GetawayActor, reducedMotion: boolean) {
  c.save();
  c.translate(actor.x, actor.y);
  c.scale(1, 1 / STAGE_Y_SCALE);
  const heavyBob = !reducedMotion && actor.bags >= 4 ? Math.sin(actor.x * .05 + actor.y * .03) * 3 : 0;
  c.translate(0, heavyBob);
  if (!reducedMotion && actor.pickupPulse > 0) {
    const pop = Math.sin((actor.pickupPulse / .32) * Math.PI) * .12;
    c.scale(1 + pop, 1 + pop);
  }
  if (actor.depositPulse > 0) {
    c.globalAlpha = Math.min(1, actor.depositPulse * 2);
    c.strokeStyle = "#f6bf2e";
    c.lineWidth = 8;
    c.beginPath(); c.arc(0, 0, reducedMotion ? 48 : 45 + (0.65 - actor.depositPulse) * 90, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  c.save();
  c.globalAlpha = .22;
  c.fillStyle = actor.color;
  c.beginPath(); c.ellipse(0, 6, 30, 13, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  c.strokeStyle = TEAM_COLORS[actor.team];
  c.lineWidth = 3;
  c.beginPath(); c.ellipse(0, 6, 31, 14, 0, 0, Math.PI * 2); c.stroke();
  if (actor.protection > 0) {
    c.strokeStyle = "#fffdf5";
    c.lineWidth = 9;
    c.beginPath(); c.arc(0, -28, 48, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = TEAM_COLORS[actor.team];
    c.lineWidth = 4;
    c.beginPath(); c.arc(0, -28, 54, 0, Math.PI * 2); c.stroke();
  }
  if (actor.shoveCooldown <= 0 && !inEitherApron(actor)) {
    const angle = Math.atan2(actor.facingY, actor.facingX);
    c.strokeStyle = "#39d3af";
    c.lineWidth = 7;
    c.beginPath();
    c.arc(0, 0, 38, angle - .62, angle + .62);
    c.stroke();
  }
  if (actor.windup > 0 || actor.shovePulse > 0) {
    const angle = Math.atan2(actor.facingY, actor.facingX);
    c.fillStyle = actor.shovePulse > 0 ? "rgba(246,191,46,.5)" : "rgba(16,35,42,.16)";
    c.beginPath(); c.moveTo(Math.cos(angle - .5) * 38, Math.sin(angle - .5) * 38); c.arc(0, 0, actor.shovePulse > 0 ? 88 : 68, angle - .5, angle + .5); c.closePath(); c.fill();
    c.strokeStyle = actor.shovePulse > 0 ? "#f6bf2e" : "#10232a";
    c.lineWidth = actor.shovePulse > 0 ? 9 : 7;
    c.beginPath(); c.arc(0, 0, actor.shovePulse > 0 ? 82 : 66, angle - .48, angle + .48); c.stroke();
  }

  if (!drawRasterActor(c, actor)) {
    c.save();
    c.rotate(Math.atan2(actor.facingY, actor.facingX));
  c.fillStyle = "rgba(16,35,42,.2)";
  c.beginPath(); c.ellipse(-4, 7, 37, 25, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2c3437";
  c.strokeStyle = "#10232a";
  c.lineWidth = 5;
  c.beginPath(); c.ellipse(-25, -15, 13, 9, -.25, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(-25, 15, 13, 9, .25, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = actor.hitPulse > 0 ? "#fffdf5" : actor.color;
  c.beginPath(); c.ellipse(-3, 0, 31, 27 + actor.bags * 1.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = TEAM_COLORS[actor.team];
  c.lineWidth = 7;
  if (actor.team === 0) {
    c.beginPath(); c.moveTo(-16, 0); c.lineTo(6, -15); c.lineTo(6, 15); c.closePath(); c.stroke();
  } else {
    c.beginPath(); c.arc(-4, 0, 14, 0, Math.PI * 2); c.stroke();
  }
  c.strokeStyle = "#10232a";
  c.lineWidth = 9;
  c.lineCap = "round";
  if (actor.shovePulse > 0) {
    c.beginPath(); c.moveTo(4, -18); c.lineTo(47, -12); c.stroke();
    c.fillStyle = "#f2bf91"; c.beginPath(); c.arc(51, -11, 9, 0, Math.PI * 2); c.fill(); c.stroke();
  } else {
    const reach = actor.windup > 0 ? 34 : 21;
    c.beginPath(); c.moveTo(0, -19); c.lineTo(reach, -24); c.moveTo(0, 19); c.lineTo(18, 23); c.stroke();
  }
  c.fillStyle = "#f2bf91";
  c.beginPath(); c.arc(22, 0, 18, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = "#17272d";
  c.lineWidth = 10;
  c.beginPath(); c.moveTo(18, -14); c.lineTo(24, 14); c.stroke();
  c.fillStyle = "#fffaf0";
  c.beginPath(); c.arc(26, -7, 3, 0, Math.PI * 2); c.arc(27, 7, 3, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  const hasRasterActor = getawayArt(actor.team === 0 ? "crookCrimson" : "crookCobalt") !== null;
  for (let index = 0; index < actor.bags; index++) {
    if (hasRasterActor) {
      const wobble = reducedMotion ? 0 : Math.sin(actor.x * .04 + actor.y * .03 + index * 1.7) * (2 + index * .5);
      const side = Math.abs(actor.facingX) >= Math.abs(actor.facingY) && actor.facingX < 0 ? 31 : -31;
      drawBag(c, side + (index % 2) * 9 + wobble, -18 - index * 14, .72);
    } else drawBag(c, -25 + index * 12, 31 - index * 10, .72);
  }
  c.restore();
}

function drawActorLabel(c: CanvasRenderingContext2D, actor: GetawayActor) {
  const hasRasterActor = getawayArt(actor.team === 0 ? "crookCrimson" : "crookCobalt") !== null;
  drawIdentityPill(c, actor, actor.x, actor.y, hasRasterActor ? -143 : -72);
  c.save();
  c.translate(actor.x, actor.y);
  c.scale(1, 1 / STAGE_Y_SCALE);
  c.fillStyle = "#10232a";
  c.font = "900 17px Archivo, system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText(`${actor.bags}/5`, 0, hasRasterActor ? 31 : 64);
  c.restore();
}

function drawIdentityPill(c: CanvasRenderingContext2D, actor: GetawayActor, x: number, y: number, labelY: number) {
  c.save();
  const label = `${actor.seat + 1} ${SEAT_MARKS[actor.seat % SEAT_MARKS.length]} ${actor.name}`;
  c.font = "900 18px Archivo, system-ui, sans-serif";
  const labelWidth = Math.min(205, c.measureText(label).width + 20);
  const visibleX = clamp(x, labelWidth / 2 + 8, WORLD_W - labelWidth / 2 - 8);
  c.translate(visibleX, y);
  c.scale(1, 1 / STAGE_Y_SCALE);
  c.fillStyle = "rgba(255,253,246,.95)";
  c.strokeStyle = "#10232a";
  c.lineWidth = 3;
  roundRect(c, -labelWidth / 2, labelY, labelWidth, 27, 8); c.fill(); c.stroke();
  c.fillStyle = "#10232a";
  c.textAlign = "center";
  c.fillText(label, 0, labelY + 20);
  c.restore();
}

function drawRasterActor(c: CanvasRenderingContext2D, actor: GetawayActor) {
  const atlas = getawayArt(actor.team === 0 ? "crookCrimson" : "crookCobalt");
  if (!atlas) return false;
  const horizontal = Math.abs(actor.facingX) >= Math.abs(actor.facingY);
  const cell = horizontal ? actor.facingX < 0 ? 2 : 3 : actor.facingY < 0 ? 1 : 0;
  const sourceX = cell % 2 * 256;
  const sourceY = Math.floor(cell / 2) * 320;
  const impactScale = actor.hitPulse > 0 ? 1 + Math.sin(Math.min(1, actor.hitPulse / .42) * Math.PI) * .12 : 1;
  const reach = actor.shovePulse > 0 ? 13 : actor.windup > 0 ? -7 : 0;
  c.save();
  c.translate(actor.facingX * reach, actor.facingY * reach * .45);
  c.scale(impactScale, 2 - impactScale);
  c.globalAlpha = actor.connected ? 1 : .58;
  c.drawImage(atlas, sourceX, sourceY, 256, 320, -70, -160, 140, 175);
  c.globalAlpha = 1;
  c.fillStyle = "#fffaf0";
  c.strokeStyle = "#10232a";
  c.lineWidth = 3;
  c.beginPath(); c.arc(0, -62, 13, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = TEAM_COLORS[actor.team];
  c.textAlign = "center";
  c.font = `${actor.seat >= 9 ? "950 13px" : "950 16px"} Archivo, system-ui, sans-serif`;
  c.fillText(`${actor.seat + 1}`, 0, -56);
  if (actor.shovePulse > 0) {
    const angle = Math.atan2(actor.facingY, actor.facingX);
    const handX = Math.cos(angle) * 49;
    const handY = Math.sin(angle) * 32 - 52;
    c.strokeStyle = "#10232a";
    c.lineWidth = 10;
    c.lineCap = "round";
    c.beginPath(); c.moveTo(Math.cos(angle) * 12, -52 + Math.sin(angle) * 8); c.lineTo(handX, handY); c.stroke();
    c.fillStyle = "#2c3437";
    c.beginPath(); c.arc(handX, handY, 10, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.restore();
  return true;
}

function drawBag(c: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  const bag = getawayArt("bag");
  if (bag) {
    c.drawImage(bag, -22, -39, 44, 44);
    c.restore();
    return;
  }
  c.fillStyle = "#f6bf2e"; c.strokeStyle = "#5c4309"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(-8, -12); c.lineTo(8, -12); c.lineTo(5, -4); c.quadraticCurveTo(18, 5, 12, 20); c.quadraticCurveTo(0, 27, -12, 20); c.quadraticCurveTo(-18, 5, -5, -4); c.closePath(); c.fill(); c.stroke();
  c.restore();
}

function drawOverlay(state: GetawayState, c: CanvasRenderingContext2D) {
  if (state.phase === "invalid") {
    overlayCard(c, "4–10 PLAYERS NEEDED", state.invalidReason ?? "GETAWAY NEEDS 4–10 PLAYERS", "Use EXIT GAME, adjust the roster, then launch again.");
    return;
  }
  if (state.waitingForControllers > 0) {
    overlayCard(c, `WAITING FOR ${state.waitingForControllers}`, "OPEN GETAWAY ON EVERY PHONE", "The practice starts when all launch players have controls.");
    return;
  }
  if (state.paused) {
    overlayCard(c, "TEAM SHORT — PAUSED", "A controller has been away for 10 seconds.", "Wait for reconnect, or use EXIT GAME to restart with an eligible roster.");
    return;
  }
  if (state.phase === "practice") {
    const title = state.practiceStage === 0 ? "1 · GRAB BAGS" : state.practiceStage === 1 ? "2 · SHOVE TO SPILL ONE" : "3 · REACH YOUR VAN";
    const detail = state.practiceStage === 0 ? "Stay on a yellow pile · more bags make you slower" : state.practiceStage === 1 ? "Face an opponent · hold SHOVE · the bright ring protects after a hit" : "Cross your crew line · banking is automatic";
    instructionRibbon(c, title, detail);
  } else if (state.phase === "runway") {
    const remaining = GETAWAY_RULES.runway - state.phaseTime;
    const countdown = remaining <= 3.1 ? `${Math.max(1, Math.ceil(remaining))}` : "FIND YOUR NUMBER";
    const bonus = smallerCrewBonus(state);
    overlayCard(
      c,
      countdown,
      bonus ? "GRAB BAGS · SHOVE TO SPILL ONE" : "GRAB BAGS · MORE BAGS = SLOWER",
      bonus
        ? `BANK AT YOUR VAN · ${TEAM_NAMES[bonus.team].toUpperCase()} SMALLER-CREW BONUS ×${formatPartyNumber(bonus.multiplier)}`
        : "SHOVE TO SPILL ONE · REACH YOUR VAN TO SCORE",
    );
  } else if (state.phase === "results" || state.phase === "over") {
    const winner = winningTeam(state);
    const bonus = smallerCrewBonus(state);
    overlayCard(
      c,
      winner === null ? "DEAD EVEN" : `${TEAM_NAMES[winner].toUpperCase()} GETS AWAY`,
      `▲ ${formatPartyNumber(teamPoints(state, 0))} POINTS   —   ${formatPartyNumber(teamPoints(state, 1))} POINTS ●`,
      bonus
        ? `RAW BAGS ${state.scores[0]} ▲ — ${state.scores[1]} ● · ${TEAM_NAMES[bonus.team].toUpperCase()} SMALLER-CREW BONUS ×${formatPartyNumber(bonus.multiplier)}`
        : `${state.scores[0]} ▲ — ${state.scores[1]} ● BAGS BANKED · unbanked bags are left behind`,
    );
  }
  if (state.calloutFor > 0 && state.phase === "live") instructionRibbon(c, state.callout, state.vaultClosed ? "VAULT CLOSED" : "BANKED BAGS ARE SAFE");
}

function instructionRibbon(c: CanvasRenderingContext2D, title: string, detail: string) {
  c.fillStyle = "rgba(16,35,42,.94)";
  roundRect(c, 365, 752, 870, 112, 20); c.fill();
  c.textAlign = "center"; c.fillStyle = "#fffaf0";
  c.font = "950 31px Archivo, system-ui, sans-serif"; c.fillText(title, 800, 797);
  c.font = "800 18px Archivo, system-ui, sans-serif"; c.fillText(detail, 800, 831);
}

function overlayCard(c: CanvasRenderingContext2D, title: string, line: string, detail: string) {
  c.fillStyle = "rgba(16,35,42,.72)"; c.fillRect(0, 145, WORLD_W, WORLD_H - 145);
  c.fillStyle = "#fffaf0"; c.strokeStyle = "#10232a"; c.lineWidth = 8;
  roundRect(c, 300, 285, 1000, 330, 32); c.fill(); c.stroke();
  c.textAlign = "center"; c.fillStyle = "#10232a";
  c.font = "950 65px Archivo, system-ui, sans-serif"; c.fillText(title, 800, 385);
  c.font = "950 31px Archivo, system-ui, sans-serif"; c.fillText(line, 800, 466);
  c.font = "800 23px Archivo, system-ui, sans-serif"; c.fillText(detail, 800, 530);
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
