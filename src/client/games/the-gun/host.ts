import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import type { TheGunStatusFrame } from "./protocol";
import { TheGunSound } from "./sound";

export const THE_GUN_RULES = {
  worldWidth: 1600,
  worldHeight: 900,
  runway: 8,
  round: 120,
  resultHold: 3.5,
  radius: 32,
  dropInterval: 15,
  dropWarning: 3,
  reload: 4.25,
  respawn: 3,
  shield: 1.15,
  jumpSpeed: 650,
  shoveCooldown: 0.72,
  shoveRange: 116,
  shoveForce: 740,
  shotRange: 1120,
  hitCredit: 1.35,
} as const;

type Phase = "runway" | "live" | "results" | "over";
type GunState = "waiting" | "incoming" | "ground" | "held";

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SupplyTarget {
  x: number;
  y: number;
  danger: number;
  label: string;
}

export interface TheGunFighter {
  id: string;
  name: string;
  seat: number;
  color: string;
  connected: boolean;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  inputX: number;
  facing: -1 | 1;
  grounded: boolean;
  jumpSequence: number;
  actionSequence: number;
  actionCooldown: number;
  respawn: number;
  shield: number;
  holdTime: number;
  bounties: number;
  gunKills: number;
  deaths: number;
  lastHitBy: string | null;
  lastHitAge: number;
  shovePulse: number;
  recoil: number;
  hitPulse: number;
}

export interface TheGunWeapon {
  state: GunState;
  holderId: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  loaded: boolean;
  reload: number;
  warning: number;
  targetX: number;
  targetY: number;
}

export interface TheGunEvent {
  kind: "jump" | "shove" | "miss" | "pickup" | "shot" | "empty" | "reload" | "warning" | "drop" | "death" | "respawn" | "bounty";
  playerId?: string;
  otherId?: string;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
}

export interface TheGunState {
  seed: number;
  phase: Phase;
  runway: number;
  remaining: number;
  elapsed: number;
  resultTime: number;
  dropIndex: number;
  nextDropAt: number;
  fighters: TheGunFighter[];
  gun: TheGunWeapon;
  events: TheGunEvent[];
}

const PLATFORMS: Platform[] = [
  { x: 120, y: 770, w: 1360, h: 34 },
  { x: 235, y: 600, w: 330, h: 24 },
  { x: 650, y: 510, w: 300, h: 24 },
  { x: 1035, y: 600, w: 330, h: 24 },
];

const GLYPHS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "★", "⬢", "✿"];
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function hash(seed: number) {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function supplyTargetAt(index: number, seed: number): SupplyTarget {
  const side = (hash(seed ^ (index * 0x9e3779b9)) & 1) === 0 ? -1 : 1;
  if (index <= 0) return { x: 800, y: 738, danger: 0, label: "CENTRE FLOOR" };
  if (index === 1) return { x: 800, y: 478, danger: 1, label: "HIGH CENTRE" };
  if (index <= 3) return side < 0
    ? { x: 315, y: 568, danger: 2, label: "LEFT SCAFFOLD" }
    : { x: 1285, y: 568, danger: 2, label: "RIGHT SCAFFOLD" };
  return side < 0
    ? { x: 250, y: 568, danger: 3, label: "LEFT LEDGE" }
    : { x: 1350, y: 568, danger: 3, label: "RIGHT LEDGE" };
}

function spawnPosition(seat: number) {
  const mirrored = seat % 2 === 1;
  const rank = Math.floor(seat / 2);
  return {
    x: mirrored ? 1390 - rank * 118 : 210 + rank * 118,
    y: 738,
    facing: (mirrored ? -1 : 1) as -1 | 1,
  };
}

function makeFighter(player: Player): TheGunFighter {
  const spawn = spawnPosition(player.seat);
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    color: player.color,
    connected: player.connected,
    alive: player.connected,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    inputX: 0,
    facing: spawn.facing,
    grounded: true,
    jumpSequence: -1,
    actionSequence: -1,
    actionCooldown: 0,
    respawn: 0,
    shield: THE_GUN_RULES.shield,
    holdTime: 0,
    bounties: 0,
    gunKills: 0,
    deaths: 0,
    lastHitBy: null,
    lastHitAge: Number.POSITIVE_INFINITY,
    shovePulse: 0,
    recoil: 0,
    hitPulse: 0,
  };
}

export function createTheGunState(players: Player[], seed = 1): TheGunState {
  const fighters = [...players].sort((a, b) => a.seat - b.seat).map(makeFighter);
  return {
    seed,
    phase: fighters.length === 0 ? "over" : "runway",
    runway: THE_GUN_RULES.runway,
    remaining: THE_GUN_RULES.round,
    elapsed: 0,
    resultTime: 0,
    dropIndex: 0,
    // The first warning runs under the runway and the first gun lands on GO.
    nextDropAt: 0,
    fighters,
    gun: {
      state: "waiting",
      holderId: null,
      x: 800,
      y: -80,
      vx: 0,
      vy: 0,
      loaded: false,
      reload: 0,
      warning: 0,
      targetX: 800,
      targetY: 738,
    },
    events: [],
  };
}

function event(state: TheGunState, value: TheGunEvent) {
  state.events.push(value);
}

function holder(state: TheGunState) {
  return state.gun.holderId ? state.fighters.find((fighter) => fighter.id === state.gun.holderId) ?? null : null;
}

function dropHeldGun(state: TheGunState, fighter: TheGunFighter, safe = false) {
  if (state.gun.holderId !== fighter.id) return;
  const x = clamp(fighter.x, PLATFORMS[0].x + 55, PLATFORMS[0].x + PLATFORMS[0].w - 55);
  state.gun.holderId = null;
  state.gun.state = "ground";
  state.gun.x = x;
  state.gun.y = safe ? PLATFORMS[0].y - 28 : Math.min(fighter.y, PLATFORMS[0].y - 28);
  state.gun.vx = safe ? 0 : -fighter.facing * 170;
  state.gun.vy = safe ? 0 : -260;
  state.gun.loaded = state.gun.reload <= 0;
}

function killFighter(state: TheGunState, fighter: TheGunFighter, by: string | null, cause: "shot" | "fall") {
  if (!fighter.alive || fighter.shield > 0) return false;
  const carried = state.gun.holderId === fighter.id;
  if (carried) dropHeldGun(state, fighter, true);
  fighter.alive = false;
  fighter.grounded = false;
  fighter.respawn = THE_GUN_RULES.respawn;
  fighter.inputX = 0;
  fighter.deaths += 1;
  fighter.vx = 0;
  fighter.vy = 0;
  fighter.hitPulse = 0.5;
  if (carried && by && by !== fighter.id && cause === "fall") {
    const attacker = state.fighters.find((candidate) => candidate.id === by);
    if (attacker) {
      attacker.bounties += 1;
      event(state, { kind: "bounty", playerId: attacker.id, otherId: fighter.id, x: fighter.x, y: fighter.y, text: `${attacker.name.toUpperCase()} CLAIMS THE BOUNTY!` });
    }
  }
  event(state, {
    kind: "death",
    playerId: by ?? undefined,
    otherId: fighter.id,
    x: fighter.x,
    y: fighter.y,
    text: cause === "shot" ? `${fighter.name.toUpperCase()} IS DOWN!` : `${fighter.name.toUpperCase()} GOES OVER!`,
  });
  return true;
}

function respawnFighter(state: TheGunState, fighter: TheGunFighter) {
  const spawn = spawnPosition(fighter.seat);
  Object.assign(fighter, {
    alive: true,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    inputX: 0,
    facing: spawn.facing,
    grounded: true,
    respawn: 0,
    shield: THE_GUN_RULES.shield,
    actionCooldown: 0.2,
    lastHitBy: null,
    lastHitAge: Number.POSITIVE_INFINITY,
  });
  event(state, { kind: "respawn", playerId: fighter.id, x: fighter.x, y: fighter.y });
}

function settle(body: { x: number; y: number; vy: number }, previousY: number, radius: number) {
  if (body.vy < 0) return false;
  for (const platform of PLATFORMS) {
    if (body.x < platform.x - radius * 0.45 || body.x > platform.x + platform.w + radius * 0.45) continue;
    if (previousY + radius <= platform.y + 5 && body.y + radius >= platform.y) {
      body.y = platform.y - radius;
      body.vy = 0;
      return true;
    }
  }
  return false;
}

function fire(state: TheGunState, shooter: TheGunFighter) {
  if (!state.gun.loaded || state.gun.reload > 0) {
    event(state, { kind: "empty", playerId: shooter.id, x: shooter.x, y: shooter.y });
    return;
  }
  state.gun.loaded = false;
  state.gun.reload = THE_GUN_RULES.reload;
  shooter.recoil = 0.22;
  shooter.vx -= shooter.facing * 70;
  const originX = shooter.x + shooter.facing * 34;
  const originY = shooter.y - 5;
  const candidates = state.fighters
    .filter((target) => target.id !== shooter.id && target.alive && target.shield <= 0)
    .map((target) => ({ target, dx: (target.x - originX) * shooter.facing, dy: Math.abs(target.y - originY) }))
    .filter(({ dx, dy }) => dx > 0 && dx <= THE_GUN_RULES.shotRange && dy <= THE_GUN_RULES.radius * 1.55)
    .sort((a, b) => a.dx - b.dx || a.target.seat - b.target.seat);
  const victim = candidates[0]?.target;
  const endX = victim ? victim.x : originX + shooter.facing * THE_GUN_RULES.shotRange;
  const endY = victim ? victim.y : originY;
  if (victim && killFighter(state, victim, shooter.id, "shot")) shooter.gunKills += 1;
  event(state, { kind: "shot", playerId: shooter.id, otherId: victim?.id, x: originX, y: originY, x2: endX, y2: endY, text: victim ? `${shooter.name.toUpperCase()} FIRES!` : "THE SHOT MISSES!" });
}

function shove(state: TheGunState, attacker: TheGunFighter) {
  attacker.actionCooldown = THE_GUN_RULES.shoveCooldown;
  attacker.shovePulse = 0.2;
  const targets = state.fighters
    .filter((target) => target !== attacker && target.alive && target.shield <= 0)
    .map((target) => ({ target, dx: (target.x - attacker.x) * attacker.facing, dy: Math.abs(target.y - attacker.y) }))
    .filter(({ dx, dy }) => dx > -8 && dx <= THE_GUN_RULES.shoveRange && dy < 72)
    .sort((a, b) => a.dx - b.dx || a.target.seat - b.target.seat);
  const target = targets[0]?.target;
  if (!target) {
    event(state, { kind: "miss", playerId: attacker.id, x: attacker.x, y: attacker.y });
    return;
  }
  target.vx = attacker.facing * THE_GUN_RULES.shoveForce;
  target.vy = -225;
  target.grounded = false;
  target.lastHitBy = attacker.id;
  target.lastHitAge = 0;
  target.hitPulse = 0.22;
  attacker.vx -= attacker.facing * 55;
  event(state, { kind: "shove", playerId: attacker.id, otherId: target.id, x: target.x, y: target.y, text: state.gun.holderId === target.id ? `${target.name.toUpperCase()} HAS THE GUN — PUSH!` : undefined });
}

export function applyTheGunInput(state: TheGunState, playerId: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const frame = value as { x?: unknown; jump?: unknown; action?: unknown; sync?: unknown };
  if (typeof frame.x !== "number" || !Number.isFinite(frame.x)) return;
  if (frame.jump !== undefined && (!Number.isSafeInteger(frame.jump) || Number(frame.jump) < 0)) return;
  if (frame.action !== undefined && (!Number.isSafeInteger(frame.action) || Number(frame.action) < 0)) return;
  const fighter = state.fighters.find((candidate) => candidate.id === playerId);
  if (!fighter || !fighter.connected) return;
  fighter.inputX = clamp(frame.x, -1, 1);
  if (Math.abs(fighter.inputX) > 0.08) fighter.facing = fighter.inputX < 0 ? -1 : 1;
  if (frame.jump !== undefined && Number(frame.jump) > fighter.jumpSequence) {
    fighter.jumpSequence = Number(frame.jump);
    if (state.phase === "live" && fighter.alive && fighter.grounded) {
      fighter.vy = -THE_GUN_RULES.jumpSpeed;
      fighter.grounded = false;
      event(state, { kind: "jump", playerId: fighter.id, x: fighter.x, y: fighter.y });
    }
  }
  if (frame.action !== undefined && Number(frame.action) > fighter.actionSequence) {
    fighter.actionSequence = Number(frame.action);
    if (state.phase !== "live" || !fighter.alive || fighter.shield > 0 || fighter.actionCooldown > 0) return;
    if (state.gun.holderId === fighter.id) fire(state, fighter);
    else shove(state, fighter);
  }
}

function beginSupplyWarning(state: TheGunState) {
  const current = holder(state);
  if (current) {
    state.gun.holderId = null;
    event(state, { kind: "warning", playerId: current.id, x: current.x, y: current.y, text: "GUN RECALLED — NEW DROP IN 3!" });
  }
  const target = supplyTargetAt(state.dropIndex, state.seed);
  Object.assign(state.gun, {
    state: "incoming",
    holderId: null,
    x: target.x,
    y: -80,
    vx: 0,
    vy: 0,
    loaded: false,
    reload: 0,
    warning: THE_GUN_RULES.dropWarning,
    targetX: target.x,
    targetY: target.y,
  });
  if (!current) event(state, { kind: "warning", x: target.x, y: target.y, text: `GUN IN 3 · ${target.label}` });
}

function landSupply(state: TheGunState) {
  Object.assign(state.gun, {
    state: "ground",
    holderId: null,
    x: state.gun.targetX,
    y: state.gun.targetY - 16,
    vx: 0,
    vy: 0,
    loaded: true,
    reload: 0,
    warning: 0,
  });
  event(state, { kind: "drop", x: state.gun.x, y: state.gun.y, text: "THE GUN IS LIVE!" });
  state.dropIndex += 1;
  state.nextDropAt += THE_GUN_RULES.dropInterval;
}

function stepGun(state: TheGunState, dt: number) {
  if (state.gun.state === "incoming") {
    state.gun.warning = Math.max(0, state.gun.warning - dt);
    state.gun.x = state.gun.targetX;
    const progress = 1 - state.gun.warning / THE_GUN_RULES.dropWarning;
    state.gun.y = -70 + Math.pow(clamp(progress, 0, 1), 2.2) * (state.gun.targetY + 54);
    if (state.gun.warning <= 0) landSupply(state);
    return;
  }
  const carrier = holder(state);
  if (carrier) {
    state.gun.state = "held";
    state.gun.x = carrier.x + carrier.facing * 28;
    state.gun.y = carrier.y - 5;
    carrier.holdTime += dt;
    if (state.gun.reload > 0) {
      const before = state.gun.reload;
      state.gun.reload = Math.max(0, state.gun.reload - dt);
      if (before > 0 && state.gun.reload <= 0) {
        state.gun.loaded = true;
        event(state, { kind: "reload", playerId: carrier.id, x: carrier.x, y: carrier.y, text: "LOADED!" });
      }
    }
    return;
  }
  if (state.gun.state !== "ground") return;
  const previousY = state.gun.y;
  state.gun.vy += 1450 * dt;
  state.gun.vx *= Math.pow(0.15, dt);
  state.gun.x += state.gun.vx * dt;
  state.gun.y += state.gun.vy * dt;
  settle(state.gun, previousY, 18);
  if (state.gun.y > THE_GUN_RULES.worldHeight + 60) {
    state.gun.x = 800;
    state.gun.y = PLATFORMS[0].y - 18;
    state.gun.vx = 0;
    state.gun.vy = 0;
  }
  const picker = state.fighters
    .filter((fighter) => fighter.connected && fighter.alive && fighter.shield <= 0)
    .map((fighter) => ({ fighter, distance: Math.hypot(fighter.x - state.gun.x, fighter.y - state.gun.y) }))
    .filter(({ distance }) => distance <= 62)
    .sort((a, b) => a.distance - b.distance || a.fighter.seat - b.fighter.seat)[0]?.fighter;
  if (picker) {
    state.gun.state = "held";
    state.gun.holderId = picker.id;
    state.gun.loaded = state.gun.reload <= 0;
    for (const fighter of state.fighters) {
      if (fighter.id === picker.id || !fighter.alive) continue;
      fighter.facing = fighter.x < picker.x ? 1 : -1;
    }
    event(state, { kind: "pickup", playerId: picker.id, x: picker.x, y: picker.y, text: `${picker.name.toUpperCase()} HAS THE GUN!` });
  }
}

function stepFighters(state: TheGunState, dt: number) {
  for (const fighter of state.fighters) {
    fighter.actionCooldown = Math.max(0, fighter.actionCooldown - dt);
    fighter.shield = Math.max(0, fighter.shield - dt);
    fighter.shovePulse = Math.max(0, fighter.shovePulse - dt);
    fighter.recoil = Math.max(0, fighter.recoil - dt);
    fighter.hitPulse = Math.max(0, fighter.hitPulse - dt);
    fighter.lastHitAge += dt;
    if (!fighter.connected) continue;
    if (!fighter.alive) {
      fighter.respawn = Math.max(0, fighter.respawn - dt);
      if (fighter.respawn <= 0) respawnFighter(state, fighter);
      continue;
    }
    const previousY = fighter.y;
    const armed = state.gun.holderId === fighter.id;
    const maxSpeed = armed ? 282 : 320;
    fighter.vx += fighter.inputX * (armed ? 1320 : 1600) * dt;
    fighter.vx *= Math.pow(0.28, dt);
    fighter.vx = clamp(fighter.vx, -maxSpeed, maxSpeed);
    fighter.vy += 1550 * dt;
    fighter.x += fighter.vx * dt;
    fighter.y += fighter.vy * dt;
    fighter.grounded = settle(fighter, previousY, THE_GUN_RULES.radius);
    if (fighter.y > THE_GUN_RULES.worldHeight + 45 || fighter.x < -95 || fighter.x > THE_GUN_RULES.worldWidth + 95) {
      const credited = fighter.lastHitBy && fighter.lastHitAge <= THE_GUN_RULES.hitCredit ? fighter.lastHitBy : null;
      killFighter(state, fighter, credited, "fall");
    }
  }
}

function separateFighters(state: TheGunState) {
  for (let index = 0; index < state.fighters.length; index += 1) {
    const a = state.fighters[index];
    if (!a.alive || !a.connected) continue;
    for (let otherIndex = index + 1; otherIndex < state.fighters.length; otherIndex += 1) {
      const b = state.fighters[otherIndex];
      if (!b.alive || !b.connected) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const minimum = THE_GUN_RULES.radius * 1.7;
      if (distance <= 0 || distance >= minimum) continue;
      const nx = dx / distance;
      const overlap = (minimum - distance) / 2;
      a.x -= nx * overlap;
      b.x += nx * overlap;
      const relative = (b.vx - a.vx) * nx;
      if (relative < 0) {
        const impulse = -relative * 0.36;
        a.vx -= impulse * nx;
        b.vx += impulse * nx;
      }
    }
  }
}

export function stepTheGunState(state: TheGunState, dt: number) {
  let remaining = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  state.events = [];
  while (remaining > 1e-9) {
    const step = Math.min(remaining, 1 / 120);
    remaining -= step;
    if (state.phase === "runway") {
      state.runway = Math.max(0, state.runway - step);
      if (state.gun.state === "waiting" && state.runway <= THE_GUN_RULES.dropWarning) beginSupplyWarning(state);
      stepGun(state, step);
      if (state.runway <= 0) state.phase = "live";
      continue;
    }
    if (state.phase === "live") {
      state.elapsed += step;
      state.remaining = Math.max(0, state.remaining - step);
      const leavesAContestWindow = state.nextDropAt <= THE_GUN_RULES.round - THE_GUN_RULES.dropInterval;
      if (leavesAContestWindow && state.gun.state !== "incoming" && state.elapsed + 1e-9 >= state.nextDropAt - THE_GUN_RULES.dropWarning) beginSupplyWarning(state);
      stepFighters(state, step);
      separateFighters(state);
      stepGun(state, step);
      if (state.remaining <= 0) state.phase = "results";
      continue;
    }
    if (state.phase === "results") {
      state.resultTime += step;
      if (state.resultTime >= THE_GUN_RULES.resultHold) state.phase = "over";
    }
  }
}

export function setTheGunConnection(state: TheGunState, id: string, connected: boolean) {
  const fighter = state.fighters.find((candidate) => candidate.id === id);
  if (!fighter || fighter.connected === connected) return;
  fighter.connected = connected;
  fighter.inputX = 0;
  if (!connected) {
    if (state.gun.holderId === id) dropHeldGun(state, fighter, true);
    fighter.alive = false;
    fighter.respawn = Number.POSITIVE_INFINITY;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.shield = 0;
  } else {
    respawnFighter(state, fighter);
  }
}

function scoreFor(fighter: TheGunFighter) {
  return Math.max(0, Math.floor(fighter.holdTime) + fighter.bounties * 3);
}

export function theGunResults(state: TheGunState): RoundResult[] {
  const ranked = [...state.fighters].sort((a, b) => scoreFor(b) - scoreFor(a) || b.holdTime - a.holdTime || a.seat - b.seat);
  let place = 0;
  let previous: number | null = null;
  return ranked.map((fighter, index) => {
    const score = scoreFor(fighter);
    if (score !== previous) {
      place = index + 1;
      previous = score;
    }
    return {
      id: fighter.id,
      place,
      score,
      detail: `${Math.floor(fighter.holdTime)}s armed · ${fighter.bounties} holder ${fighter.bounties === 1 ? "bounty" : "bounties"} · ${fighter.gunKills} gun KOs (no points)`,
    };
  });
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface Tracer { x: number; y: number; x2: number; y2: number; life: number; }
interface Callout { text: string; color: string; life: number; }

export function createHost(ctx: HostContext): GameHost {
  const state = createTheGunState(ctx.players, ctx.seed);
  const spectators = new Map<string, Player>();
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sound = typeof AudioContext === "undefined" ? null : new TheGunSound("host");
  const particles: Particle[] = [];
  const tracers: Tracer[] = [];
  const callouts: Callout[] = [];
  let shake = 0;
  let destroyed = false;
  let phoneClock = 0;

  const statusFor = (fighter: TheGunFighter, cue?: TheGunStatusFrame["cue"]): TheGunStatusFrame => {
    const armed = state.gun.holderId === fighter.id;
    const phase = state.phase === "over" ? "over" : state.phase;
    const interactive = fighter.connected && fighter.alive && (state.phase === "runway" || state.phase === "live");
    let status = "Set both thumbs. Move after GO.";
    if (state.phase === "live") {
      if (!fighter.alive) status = `RESPAWNING IN ${Math.ceil(fighter.respawn)}`;
      else if (fighter.shield > 0) status = "PROTECTED — MOVE AND JUMP; ACTION WAITS";
      else if (fighter.actionCooldown > 0) status = "SHOVE RECOVERING — KEEP MOVING";
      else if (armed && state.gun.loaded) status = "HOLD TO SCORE +1/s — SHOOT TO SURVIVE";
      else if (armed) status = "RELOADING — KEEP MOVING";
      else if (state.gun.state === "incoming") status = `GUN IN ${Math.max(1, Math.ceil(state.gun.warning))} — GET THERE`;
      else if (state.gun.state === "ground") status = "SHOVE — THE GUN IS LOOSE";
      else status = "HUNT THE HOLDER — SHOVE";
    } else if (state.phase === "results" || state.phase === "over") status = "LOOK UP FOR THE RESULT";
    return {
      t: "theGunStatus",
      phase,
      interactive,
      actionState: state.phase !== "live" ? "get-ready" : !fighter.alive ? "down" : fighter.shield > 0 ? "protected" : fighter.actionCooldown > 0 ? "cooldown" : "ready",
      armed,
      loaded: armed && state.gun.loaded,
      reload: armed ? state.gun.reload : 0,
      respawn: fighter.alive ? 0 : Number.isFinite(fighter.respawn) ? fighter.respawn : 0,
      remaining: state.remaining,
      status,
      ...(cue ? { cue } : {}),
    };
  };

  const sendStatus = (id: string, cue?: TheGunStatusFrame["cue"]) => {
    const fighter = state.fighters.find((candidate) => candidate.id === id);
    if (fighter) ctx.send(statusFor(fighter, cue), id);
  };
  const broadcast = () => state.fighters.forEach((fighter) => sendStatus(fighter.id));
  const sendSpectator = (id: string) => ctx.send({
    t: "theGunStatus", phase: "spectating", interactive: false, armed: false, loaded: false,
    reload: 0, respawn: 0, remaining: state.remaining, status: "ROUND IN PROGRESS — YOU PLAY NEXT GAME",
  } satisfies TheGunStatusFrame, id);

  const notify = (entry: TheGunEvent) => {
    const cue = entry.kind === "miss" || entry.kind === "jump" || entry.kind === "bounty" ? undefined : entry.kind;
    if (cue) sound?.play(cue);
    // Confirm accepted actions, including a shove that reaches no rival.
    const actorCue = entry.kind === "miss" ? "shove" : cue;
    const actorStateChanged = entry.kind !== "jump";
    if (entry.playerId && actorStateChanged) sendStatus(entry.playerId, entry.kind === "death" ? undefined : actorCue);
    if (entry.otherId) sendStatus(entry.otherId, entry.kind === "death" ? "death" : entry.kind === "shove" ? "shove" : undefined);
    if (entry.kind === "warning" || entry.kind === "drop" || entry.kind === "pickup") broadcast();
    if (entry.text) callouts.unshift({ text: entry.text, color: entry.kind === "pickup" || entry.kind === "drop" ? "#5DE4E7" : entry.kind === "bounty" ? "#FFC247" : "#F4E9D4", life: 1.35 });
    if (entry.kind === "shot" && entry.x !== undefined && entry.y !== undefined && entry.x2 !== undefined && entry.y2 !== undefined) {
      tracers.push({ x: entry.x, y: entry.y, x2: entry.x2, y2: entry.y2, life: 0.24 });
      shake = reducedMotion ? 0 : 0.75;
    }
    if (entry.x !== undefined && entry.y !== undefined && ["shove", "drop", "pickup", "death", "respawn"].includes(entry.kind)) {
      const count = reducedMotion ? 0 : entry.kind === "drop" || entry.kind === "death" ? 15 : 8;
      for (let index = 0; index < count && particles.length < 120; index += 1) {
        const angle = (Math.PI * 2 * index) / Math.max(1, count);
        const speed = entry.kind === "death" ? 260 : 150;
        particles.push({ x: entry.x, y: entry.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0.52, color: entry.kind === "pickup" ? "#5DE4E7" : "#FFC247" });
      }
    }
  };

  broadcast();

  return {
    onJoin(player) {
      spectators.set(player.id, player);
      sendSpectator(player.id);
    },
    onLeave(id) {
      const fighter = state.fighters.find((candidate) => candidate.id === id);
      if (fighter && state.gun.holderId === id) dropHeldGun(state, fighter, true);
      state.fighters = state.fighters.filter((candidate) => candidate.id !== id);
      spectators.delete(id);
      if (state.fighters.length === 0) state.phase = "over";
    },
    onConnectionChange(id, connected) {
      if (spectators.has(id)) {
        if (connected) sendSpectator(id);
        return;
      }
      setTheGunConnection(state, id, connected);
      if (connected) sendStatus(id, "respawn");
    },
    onInput(id, data) {
      if (spectators.has(id)) {
        if (data && typeof data === "object" && (data as { sync?: unknown }).sync === true) sendSpectator(id);
        return;
      }
      if (data && typeof data === "object" && (data as { sync?: unknown }).sync === true) {
        sendStatus(id);
        return;
      }
      state.events = [];
      applyTheGunInput(state, id, data);
      state.events.forEach(notify);
      if (data && typeof data === "object" && "action" in data && state.events.length === 0) sendStatus(id);
    },
    tick(dt) {
      if (destroyed || state.phase === "over" || !Number.isFinite(dt) || dt <= 0) return;
      const elapsed = Math.min(dt, 0.25);
      const before = state.phase;
      stepTheGunState(state, elapsed);
      state.events.forEach(notify);
      if (before !== state.phase) {
        if (state.phase === "live") sound?.play("go");
        if (state.phase === "results") sound?.play("finish");
        broadcast();
      }
      if (state.phase === "runway") {
        for (const threshold of [3, 2, 1]) if (state.runway <= threshold && state.runway + elapsed > threshold) sound?.play("countdown");
      }
      phoneClock += elapsed;
      if (phoneClock >= 0.1) {
        phoneClock %= 0.1;
        broadcast();
      }
      shake = Math.max(0, shake - elapsed * 4);
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life -= elapsed;
        if (particle.life <= 0) particles.splice(index, 1);
        else { particle.x += particle.vx * elapsed; particle.y += particle.vy * elapsed; particle.vy += 420 * elapsed; }
      }
      for (let index = tracers.length - 1; index >= 0; index -= 1) {
        tracers[index].life -= elapsed;
        if (tracers[index].life <= 0) tracers.splice(index, 1);
      }
      for (let index = callouts.length - 1; index >= 0; index -= 1) {
        callouts[index].life -= elapsed;
        if (callouts[index].life <= 0) callouts.splice(index, 1);
      }
      if (callouts.length > 3) callouts.length = 3;
    },
    resize() { /* fixed logical world scales into the current canvas */ },
    render(g, width, height) { renderTheGun(g, width, height, state, particles, tracers, callouts, shake, reducedMotion); },
    isOver() { return state.phase === "over"; },
    results() { return theGunResults(state); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sound?.destroy();
      particles.length = 0;
      tracers.length = 0;
      callouts.length = 0;
    },
  };
}

function renderTheGun(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: TheGunState,
  particles: Particle[],
  tracers: Tracer[],
  callouts: Callout[],
  shake: number,
  reducedMotion: boolean,
) {
  const scale = Math.min(width / THE_GUN_RULES.worldWidth, height / THE_GUN_RULES.worldHeight);
  const ox = (width - THE_GUN_RULES.worldWidth * scale) / 2;
  const oy = (height - THE_GUN_RULES.worldHeight * scale) / 2;
  g.save();
  g.fillStyle = "#071820";
  g.fillRect(0, 0, width, height);
  g.translate(ox, oy);
  g.scale(scale, scale);
  if (!reducedMotion && shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 6 * shake);
  drawArena(g);
  PLATFORMS.forEach((platform, index) => drawPlatform(g, platform, index));
  if (state.gun.state === "incoming") drawDropWarning(g, state);
  if (state.gun.state === "ground" || state.gun.state === "held") drawGun(g, state.gun, holder(state));
  const labelLanes = assignLabelLanes(state.fighters);
  for (const fighter of state.fighters) drawFighter(g, fighter, state.gun.holderId === fighter.id, state, labelLanes.get(fighter.id) ?? 0);
  for (const particle of particles) {
    g.globalAlpha = clamp(particle.life / 0.52, 0, 1);
    g.fillStyle = particle.color;
    g.fillRect(particle.x - 4, particle.y - 4, 8, 8);
  }
  g.globalAlpha = 1;
  for (const tracer of tracers) {
    const alpha = clamp(tracer.life / 0.24, 0, 1);
    g.strokeStyle = `rgba(255,90,71,${alpha})`;
    g.lineWidth = 15;
    g.beginPath(); g.moveTo(tracer.x, tracer.y); g.lineTo(tracer.x2, tracer.y2); g.stroke();
    g.strokeStyle = `rgba(244,233,212,${alpha})`;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(tracer.x, tracer.y); g.lineTo(tracer.x2, tracer.y2); g.stroke();
  }
  drawHud(g, state);
  drawOverlay(g, state, callouts);
  g.restore();
}

function drawArena(g: CanvasRenderingContext2D) {
  const gradient = g.createLinearGradient(0, 0, 0, 900);
  if (gradient?.addColorStop) {
    gradient.addColorStop(0, "#071820");
    gradient.addColorStop(1, "#0D2A32");
    g.fillStyle = gradient;
  } else {
    g.fillStyle = "#0D2A32";
  }
  g.fillRect(0, 0, 1600, 900);
  g.fillStyle = "rgba(93,228,231,.08)";
  for (let x = 35; x < 1600; x += 105) g.fillRect(x, 220 + (x % 210), 44, 150);
  g.strokeStyle = "rgba(244,233,212,.13)";
  g.lineWidth = 8;
  for (let x = 0; x <= 1600; x += 200) {
    g.beginPath(); g.moveTo(x, 760); g.lineTo(x + 170, 360); g.stroke();
  }
  g.fillStyle = "rgba(244,233,212,.45)";
  g.font = "800 16px Archivo, system-ui, sans-serif";
  g.fillText("FALL ZONE", 28, 846);
  g.textAlign = "right"; g.fillText("FALL ZONE", 1572, 846); g.textAlign = "left";
}

function drawPlatform(g: CanvasRenderingContext2D, platform: Platform, index: number) {
  g.fillStyle = "#F4E9D4";
  g.fillRect(platform.x, platform.y, platform.w, platform.h);
  g.fillStyle = "#263A3E";
  g.fillRect(platform.x + 8, platform.y + platform.h, platform.w - 16, 12);
  g.fillStyle = "#FFC247";
  for (let x = platform.x; x < platform.x + platform.w; x += 42) {
    if ((Math.floor((x - platform.x) / 42) + index) % 2 === 0) g.fillRect(x, platform.y, Math.min(21, platform.x + platform.w - x), 7);
  }
}

function drawDropWarning(g: CanvasRenderingContext2D, state: TheGunState) {
  const gun = state.gun;
  const pulse = 1 + Math.sin(gun.warning * Math.PI * 4) * 0.08;
  g.save();
  g.translate(gun.targetX, gun.targetY);
  g.scale(pulse, pulse);
  g.strokeStyle = "#FFC247";
  g.lineWidth = 10;
  g.setLineDash([18, 12]);
  g.beginPath(); g.ellipse(0, 5, 78, 24, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = "#FFC247";
  g.textAlign = "center";
  g.font = "950 30px Archivo, system-ui, sans-serif";
  g.fillText(`GUN IN ${Math.max(1, Math.ceil(gun.warning))}`, 0, -45);
  g.restore();
  g.strokeStyle = "rgba(255,194,71,.55)";
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(gun.targetX, 95); g.lineTo(gun.targetX, gun.y); g.stroke();
  drawWeaponShape(g, gun.x, gun.y, 1, false);
}

function drawGun(g: CanvasRenderingContext2D, gun: TheGunWeapon, carrier: TheGunFighter | null) {
  const facing = carrier?.facing ?? 1;
  if (!carrier) {
    g.strokeStyle = "#5DE4E7";
    g.lineWidth = 7;
    g.setLineDash([13, 9]);
    g.beginPath(); g.arc(gun.x, gun.y, 42 + Math.sin(performance.now() * 0.008) * 4, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#F4E9D4"; g.font = "900 17px Archivo, system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("GRAB", gun.x, gun.y - 47);
  }
  drawWeaponShape(g, gun.x, gun.y, facing, gun.loaded);
}

function drawWeaponShape(g: CanvasRenderingContext2D, x: number, y: number, facing: number, loaded: boolean) {
  g.save(); g.translate(x, y); g.scale(facing, 1);
  g.fillStyle = loaded ? "#5DE4E7" : "#F4E9D4"; g.strokeStyle = "#071820"; g.lineWidth = 5;
  g.fillRect(-18, -11, 52, 20); g.strokeRect(-18, -11, 52, 20);
  g.beginPath(); g.moveTo(-2, 8); g.lineTo(17, 8); g.lineTo(10, 30); g.lineTo(-6, 30); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#FFC247"; g.fillRect(34, -6, 14, 10); g.restore();
}

function assignLabelLanes(fighters: TheGunFighter[]) {
  const lanes = Array.from({ length: 10 }, () => Number.NEGATIVE_INFINITY);
  const assigned = new Map<string, number>();
  for (const fighter of fighters.filter((candidate) => candidate.alive).sort((a, b) => a.x - b.x || a.seat - b.seat)) {
    let lane = lanes.findIndex((lastX) => fighter.x - lastX >= 180);
    if (lane < 0) lane = lanes.indexOf(Math.min(...lanes));
    lanes[lane] = fighter.x;
    assigned.set(fighter.id, lane);
  }
  return assigned;
}

function drawFighter(g: CanvasRenderingContext2D, fighter: TheGunFighter, armed: boolean, state: TheGunState, labelLane: number) {
  if (!fighter.alive) {
    const markerX = 80 + fighter.seat * 160;
    g.save(); g.globalAlpha = 0.75; g.fillStyle = fighter.color; g.textAlign = "center";
    g.font = "950 32px Archivo, system-ui, sans-serif"; g.fillText(GLYPHS[fighter.seat] ?? "●", markerX, 845);
    g.fillStyle = "#F4E9D4"; g.font = "900 18px Archivo, system-ui, sans-serif";
    g.fillText(fighter.connected ? `#${fighter.seat + 1} · ${Math.ceil(fighter.respawn)}` : `#${fighter.seat + 1} · AWAY`, markerX, 875); g.restore();
    return;
  }
  g.save();
  if (armed) {
    const glow = g.createRadialGradient(fighter.x, fighter.y, 0, fighter.x, fighter.y, 175);
    if (glow?.addColorStop) {
      glow.addColorStop(0, "rgba(93,228,231,.28)"); glow.addColorStop(1, "rgba(93,228,231,0)");
      g.fillStyle = glow;
    } else {
      g.fillStyle = "rgba(93,228,231,.12)";
    }
    g.fillRect(fighter.x - 180, fighter.y - 240, 360, 300);
    g.fillStyle = "#5DE4E7"; g.font = "950 18px Archivo, system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("THE GUN", fighter.x, fighter.y - 91);
  }
  g.translate(fighter.x, fighter.y);
  if (!fighter.connected) g.globalAlpha = 0.45;
  if (fighter.shield > 0) {
    g.strokeStyle = "#F4E9D4"; g.lineWidth = 5; g.setLineDash([10, 8]);
    g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  const squash = fighter.hitPulse > 0 ? 0.9 : fighter.recoil > 0 ? 0.94 : 1;
  g.scale(fighter.facing * (2 - squash), squash);
  g.fillStyle = fighter.color; g.strokeStyle = "#071820"; g.lineWidth = 6;
  g.beginPath(); g.roundRect(-27, -25, 54, 54, 14); g.fill(); g.stroke();
  g.save(); g.clip(); g.strokeStyle = "rgba(7,24,32,.68)"; g.lineWidth = 7;
  const motif = fighter.seat % 5;
  if (motif === 0) { g.beginPath(); g.moveTo(-28, -10); g.lineTo(28, 15); g.stroke(); }
  if (motif === 1) { g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.stroke(); }
  if (motif === 2) { g.strokeRect(-13, -13, 26, 26); }
  if (motif === 3) { g.beginPath(); g.moveTo(-25, 17); g.lineTo(25, -17); g.stroke(); }
  if (motif === 4) { g.beginPath(); g.moveTo(0, -27); g.lineTo(0, 27); g.stroke(); }
  g.restore();
  g.fillStyle = "#F4E9D4"; g.strokeStyle = "#071820"; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-31, -24); g.lineTo(24, -24); g.lineTo(31, -13); g.lineTo(-34, -13); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#071820"; g.fillRect(11, -9, 13, 7);
  if (!armed && fighter.shovePulse > 0) {
    g.strokeStyle = "#FFC247"; g.lineWidth = 10; g.beginPath(); g.arc(24, 0, 55, -0.8, 0.8); g.stroke();
  }
  g.restore();
  g.save(); g.textAlign = "center"; g.textBaseline = "bottom";
  g.font = "900 19px Archivo, system-ui, sans-serif"; g.fillStyle = "#071820";
  const label = `${GLYPHS[fighter.seat] ?? "●"} ${fighter.name}`;
  const labelWidth = Math.min(170, Math.max(92, g.measureText(label).width + 20));
  const above = fighter.y - 76 - labelLane * 30;
  const labelY = above >= 188 ? above : fighter.y + 70 + labelLane * 28;
  g.strokeStyle = armed ? "#5DE4E7" : "rgba(244,233,212,.55)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(fighter.x, fighter.y - 34); g.lineTo(fighter.x, labelY + 14); g.stroke();
  g.fillStyle = armed ? "#5DE4E7" : "#F4E9D4"; g.fillRect(fighter.x - labelWidth / 2, labelY, labelWidth, 28);
  g.fillStyle = "#071820"; g.fillText(label, fighter.x, labelY + 23, labelWidth - 10);
  if (armed) {
    const ratio = state.gun.loaded ? 1 : 1 - state.gun.reload / THE_GUN_RULES.reload;
    g.strokeStyle = "rgba(244,233,212,.35)"; g.lineWidth = 7; g.beginPath(); g.arc(fighter.x, fighter.y, 54, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = state.gun.loaded ? "#5DE4E7" : "#FFC247"; g.beginPath(); g.arc(fighter.x, fighter.y, 54, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio); g.stroke();
    g.fillStyle = "#F4E9D4"; g.font = "950 15px Archivo, system-ui, sans-serif";
    g.fillText(state.gun.loaded ? "LOADED" : `RELOAD ${state.gun.reload.toFixed(1)}`, fighter.x, fighter.y + 82);
  }
  g.restore();
}

function drawHud(g: CanvasRenderingContext2D, state: TheGunState) {
  g.fillStyle = "rgba(7,24,32,.9)"; g.fillRect(0, 0, 1600, 170);
  g.fillStyle = "#F4E9D4"; g.font = "950 34px Archivo, system-ui, sans-serif"; g.textAlign = "left"; g.fillText("THE GUN", 32, 48);
  g.fillStyle = "#A8BEC0"; g.font = "850 14px Archivo, system-ui, sans-serif"; g.fillText("HOLD +1/s · BOUNTY +3", 32, 76, 180);
  const sorted = [...state.fighters].sort((a, b) => a.seat - b.seat);
  const cardWidth = 142;
  const start = 230;
  for (let index = 0; index < sorted.length; index += 1) {
    const fighter = sorted[index];
    const x = start + (index % 5) * (cardWidth + 8);
    const y = 18 + Math.floor(index / 5) * 70;
    g.fillStyle = state.gun.holderId === fighter.id ? "#5DE4E7" : "rgba(244,233,212,.12)";
    g.fillRect(x, y, cardWidth, 62);
    g.textAlign = "left"; g.fillStyle = state.gun.holderId === fighter.id ? "#071820" : fighter.color;
    g.font = "950 16px Archivo, system-ui, sans-serif"; g.fillText(`${fighter.seat + 1} · ${fighter.name}`, x + 8, y + 25, cardWidth - 16);
    g.fillStyle = state.gun.holderId === fighter.id ? "#071820" : "#F4E9D4"; g.font = "850 14px Archivo, system-ui, sans-serif";
    g.fillText(`${scoreFor(fighter)} PT${scoreFor(fighter) === 1 ? "" : "S"}`, x + 8, y + 50);
  }
  g.textAlign = "right"; g.fillStyle = "#A8BEC0"; g.font = "850 15px Archivo, system-ui, sans-serif"; g.fillText("TIME", 1560, 272);
  g.fillStyle = "#F4E9D4"; g.font = "950 48px Archivo, system-ui, sans-serif";
  g.fillText(formatClock(state.phase === "runway" ? THE_GUN_RULES.round : state.remaining), 1560, 316);
  g.textAlign = "left";
}

function drawOverlay(g: CanvasRenderingContext2D, state: TheGunState, callouts: Callout[]) {
  if (callouts[0] && state.phase === "live") {
    const callout = callouts[0];
    g.globalAlpha = clamp(callout.life / 0.25, 0, 1);
    g.fillStyle = "rgba(7,24,32,.9)"; g.fillRect(390, 180, 820, 60);
    g.fillStyle = callout.color; g.textAlign = "center"; g.font = "950 30px Archivo, system-ui, sans-serif"; g.fillText(callout.text, 800, 220, 780); g.globalAlpha = 1;
  }
  if (state.phase === "runway") {
    g.fillStyle = "rgba(7,24,32,.78)"; g.fillRect(250, 205, 1100, 405);
    g.textAlign = "center"; g.fillStyle = "#F4E9D4"; g.font = "950 76px Archivo, system-ui, sans-serif"; g.fillText("THE GUN", 800, 300);
    g.fillStyle = "#FFC247"; g.font = "950 32px Archivo, system-ui, sans-serif"; g.fillText("MOVE · JUMP · FACE A PLAYER TO SHOVE", 800, 365);
    g.fillStyle = "#5DE4E7"; g.fillText("HOLD THE GUN = +1 EACH SECOND", 800, 425);
    g.fillStyle = "#F4E9D4"; g.font = "900 27px Archivo, system-ui, sans-serif"; g.fillText("PUSH ITS HOLDER OFF = +3", 800, 475);
    g.fillStyle = "#A8BEC0"; g.font = "800 22px Archivo, system-ui, sans-serif"; g.fillText("SHOOT TO SURVIVE · KILLS SCORE 0", 800, 520);
    if (state.runway <= 3.2) {
      g.fillStyle = "#FFC247"; g.font = "950 74px Archivo, system-ui, sans-serif";
      g.fillText(state.runway <= 0.3 ? "GO!" : String(Math.max(1, Math.ceil(state.runway))), 800, 590);
    } else {
      g.fillStyle = "#F4E9D4"; g.font = "850 22px Archivo, system-ui, sans-serif"; g.fillText("FIND YOUR NAME + MARK", 800, 575);
    }
  } else if (state.phase === "live" && state.elapsed < 0.8) {
    g.fillStyle = "rgba(7,24,32,.82)"; g.fillRect(545, 315, 510, 150);
    g.fillStyle = "#FFC247"; g.textAlign = "center"; g.font = "950 104px Archivo, system-ui, sans-serif"; g.fillText("GO!", 800, 425);
  } else if (state.phase === "results" || state.phase === "over") {
    const results = theGunResults(state);
    const leaders = results.filter((row) => row.place === 1);
    const winner = results[0] ? state.fighters.find((fighter) => fighter.id === results[0].id) : null;
    g.fillStyle = "rgba(7,24,32,.9)"; g.fillRect(235, 165, 1130, 565);
    g.textAlign = "center"; g.fillStyle = "#FFC247"; g.font = "950 33px Archivo, system-ui, sans-serif"; g.fillText(leaders.length > 1 ? "FINAL STANDOFF" : "FINAL VILLAIN", 800, 235);
    g.fillStyle = leaders.length > 1 ? "#F4E9D4" : winner?.color ?? "#F4E9D4"; g.font = "950 76px Archivo, system-ui, sans-serif";
    g.fillText(leaders.length > 1 ? `${leaders.length}-WAY TIE` : winner?.name.toUpperCase() ?? "NO ONE", 800, 330, 920);
    g.fillStyle = "#F4E9D4"; g.font = "900 25px Archivo, system-ui, sans-serif";
    results.slice(0, 5).forEach((row, index) => {
      const fighter = state.fighters.find((candidate) => candidate.id === row.id)!;
      g.fillText(`${row.place} · ${GLYPHS[fighter.seat] ?? "●"} ${fighter.name} · ${row.score} PTS · ${Math.floor(fighter.holdTime)}s ARMED`, 800, 400 + index * 54, 900);
    });
  }
  g.textAlign = "left";
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
