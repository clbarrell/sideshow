import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import { DragSound, isDragCue, type DragCue } from "./sound";

export const DRAG_RULES = {
  runway: 9,
  practice: 5.5,
  round: 90,
  finish: 2.4,
  viewWidth: 1600,
  viewHeight: 900,
  dangerInset: 180,
  dangerClearance: 28,
  warningSeconds: 4,
  cameraMaxSpeed: 70,
  cameraMaxAcceleration: 105,
  minimumSize: 1,
  maximumSize: 3.25,
  lungeCooldown: 2.5,
  lungeSeconds: .3,
  respawnSeconds: 2,
  patchPreview: 2.2,
  patchLifetime: 12,
} as const;

const WORLD_HALF_W = 2100;
const WORLD_HALF_H = 1320;
const MIN_SPEED = 154;
const MAX_SPEED = 226;
const LUNGE_SPEED = 440;
const FOOD_GROWTH = .18;
const MAX_PARTICLES = 110;
const HUD_HEIGHT = 120;

export interface DragInput {
  x: number;
  y: number;
  lunge?: number;
}

export interface DragPhoneFrame {
  t: "dragState";
  phase: "practice" | "countdown" | "live" | "reforming" | "spectating" | "finish";
  status: string;
  remaining: number;
  interactive: boolean;
  lungeReady: boolean;
  cooldown: number;
  size: number;
  score: number;
  warning: number | null;
  connected: boolean;
  cues?: DragCue[];
}

export interface DragPhoneFrames {
  t: "dragStates";
  frames: Record<string, DragPhoneFrame>;
}

export interface DragActor {
  id: string;
  name: string;
  seat: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  input: { x: number; y: number };
  lastDirection: { x: number; y: number };
  lastLunge: number | null;
  size: number;
  cooldown: number;
  lungeTime: number;
  warning: number;
  warningActive: boolean;
  reform: number;
  connected: boolean;
  spectator: boolean;
  score: number;
  food: number;
  bursts: number;
  pop: number;
}

export interface FoodDrop {
  x: number;
  y: number;
  radius: number;
  eaten: boolean;
}

export interface FoodPatch {
  x: number;
  y: number;
  drops: FoodDrop[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

export interface DragState {
  seed: number;
  randomState: number;
  actors: DragActor[];
  participantIds: Set<string>;
  phase: "practice" | "countdown" | "live" | "finish";
  phaseTime: number;
  liveTime: number;
  camera: { x: number; y: number; vx: number; vy: number };
  patches: FoodPatch[];
  pendingPatches: FoodPatch[] | null;
  pendingFor: number;
  patchAge: number;
  particles: Particle[];
  phoneClock: number;
  goFlash: number;
  finished: boolean;
  reducedMotion: boolean;
  events: Array<{ cue: DragCue; to?: string }>;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function approach(value: number, target: number, amount: number) {
  return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
}

function rand(state: DragState) {
  state.randomState = (state.randomState + 0x6d2b79f5) >>> 0;
  let t = state.randomState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function cameraInfluence(size: number) {
  const grown = Math.max(0, size - DRAG_RULES.minimumSize);
  return 1 + Math.sqrt(grown) * .72;
}

export function blobRadius(size: number) {
  return 22 + Math.sqrt(clamp(size, DRAG_RULES.minimumSize, DRAG_RULES.maximumSize) - 1) * 16;
}

/** Numeric proof used by QA: a largest blob can turn inward before the warning expires. */
function spawnPosition(index: number, count: number) {
  if (count >= 4) {
    const columns = Math.ceil(count / 2);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = (column - (columns - 1) / 2) * 225;
    return { x, y: row === 0 ? -118 : 118 };
  }
  const angle = -Math.PI / 2 + index / Math.max(1, count) * Math.PI * 2;
  const radius = count === 1 ? 0 : 92 + count * 7;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function actorFromPlayer(player: Player, index: number, count: number, spectator = false): DragActor {
  const position = spawnPosition(index, count);
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    color: player.color,
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    input: { x: 0, y: 0 },
    lastDirection: { x: 0, y: 1 },
    lastLunge: null,
    size: DRAG_RULES.minimumSize,
    cooldown: 0,
    lungeTime: 0,
    warning: 0,
    warningActive: false,
    reform: 0,
    connected: player.connected,
    spectator,
    score: 0,
    food: 0,
    bursts: 0,
    pop: 0,
  };
}

function makePatches(state: DragState): FoodPatch[] {
  const baseAngle = rand(state) * Math.PI * 2;
  const separation = Math.PI * (.7 + rand(state) * .55);
  return [baseAngle, baseAngle + separation].map((angle, patchIndex) => {
    // Elliptical placement respects the 16:9 frame: the whole preview and
    // every droplet begin inside the safe line rather than spawning offscreen.
    const distanceX = 430 + rand(state) * 82;
    const distanceY = 140 + rand(state) * 30;
    const x = clamp(state.camera.x + Math.cos(angle) * distanceX, -WORLD_HALF_W + 230, WORLD_HALF_W - 230);
    const y = clamp(state.camera.y + Math.sin(angle) * distanceY, -WORLD_HALF_H + 190, WORLD_HALF_H - 190);
    const drops: FoodDrop[] = [];
    for (let index = 0; index < 8; index++) {
      const theta = rand(state) * Math.PI * 2;
      const radius = 28 + rand(state) * 92;
      drops.push({
        x: x + Math.cos(theta) * radius,
        y: y + Math.sin(theta) * radius * .72,
        radius: 7 + rand(state) * 4,
        eaten: false,
      });
    }
    // A central mark keeps both patch choices obvious from across the room.
    drops.push({ x: x + (patchIndex ? 7 : -7), y, radius: 12, eaten: false });
    return { x, y, drops };
  });
}

export function createDragState(players: Player[], seed: number, reducedMotion = false): DragState {
  const state: DragState = {
    seed: seed >>> 0,
    randomState: seed >>> 0,
    actors: players.map((player, index) => actorFromPlayer(player, index, players.length)),
    participantIds: new Set(players.map(({ id }) => id)),
    phase: "practice",
    phaseTime: 0,
    liveTime: 0,
    camera: { x: 0, y: 0, vx: 0, vy: 0 },
    patches: [],
    pendingPatches: null,
    pendingFor: 0,
    patchAge: 0,
    particles: [],
    phoneClock: 0,
    goFlash: 0,
    finished: false,
    reducedMotion,
    events: [],
  };
  state.patches = makePatches(state);
  return state;
}

function emit(state: DragState, cue: DragCue, to?: string) {
  state.events.push({ cue, to });
}

function burstParticles(state: DragState, actor: DragActor, count: number) {
  if (state.reducedMotion) return;
  for (let index = 0; index < count && state.particles.length < MAX_PARTICLES; index++) {
    const angle = rand(state) * Math.PI * 2;
    const speed = 45 + rand(state) * 155;
    const life = .25 + rand(state) * .45;
    state.particles.push({ x: actor.x, y: actor.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life, color: actor.color });
  }
}

function resetForContest(state: DragState) {
  state.randomState = state.seed;
  state.camera = { x: 0, y: 0, vx: 0, vy: 0 };
  state.liveTime = 0;
  state.patchAge = 0;
  state.pendingPatches = null;
  state.pendingFor = 0;
  state.particles.length = 0;
  const participants = state.actors.filter((actor) => !actor.spectator);
  participants.forEach((actor, index) => {
    const position = spawnPosition(index, participants.length);
    actor.x = position.x;
    actor.y = position.y;
    actor.vx = 0;
    actor.vy = 0;
    actor.size = DRAG_RULES.minimumSize;
    actor.cooldown = 0;
    actor.lungeTime = 0;
    actor.warning = 0;
    actor.warningActive = false;
    actor.reform = 0;
    actor.score = 0;
    actor.food = 0;
    actor.bursts = 0;
    actor.pop = 0;
  });
  state.patches = makePatches(state);
}

function startLunge(state: DragState, actor: DragActor) {
  if (actor.spectator || actor.reform > 0 || actor.cooldown > 0 || state.phase === "countdown" || state.phase === "finish") return;
  const magnitude = Math.hypot(actor.input.x, actor.input.y);
  const direction = magnitude > .08
    ? { x: actor.input.x / magnitude, y: -actor.input.y / magnitude }
    : actor.lastDirection;
  actor.lastDirection = direction;
  actor.lungeTime = DRAG_RULES.lungeSeconds;
  actor.cooldown = DRAG_RULES.lungeCooldown;
  const grown = Math.max(0, actor.size - DRAG_RULES.minimumSize);
  actor.size = Math.max(DRAG_RULES.minimumSize, actor.size - grown * .3);
  actor.vx = direction.x * LUNGE_SPEED;
  actor.vy = direction.y * LUNGE_SPEED;
  emit(state, "lunge");
  burstParticles(state, actor, 7);
}

export function applyDragInput(state: DragState, playerId: string, value: unknown) {
  const actor = state.actors.find(({ id }) => id === playerId);
  if (!actor || actor.spectator || !value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Partial<DragInput> & { t?: unknown };
  if (input.t === "sync") return;
  if (typeof input.x !== "number" || typeof input.y !== "number" || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return;
  actor.input.x = clamp(input.x, -1, 1);
  actor.input.y = clamp(input.y, -1, 1);
  const magnitude = Math.hypot(actor.input.x, actor.input.y);
  if (magnitude > 1) {
    actor.input.x /= magnitude;
    actor.input.y /= magnitude;
  }
  if (magnitude > .08) actor.lastDirection = { x: actor.input.x / magnitude, y: -actor.input.y / magnitude };
  if (typeof input.lunge !== "number" || !Number.isSafeInteger(input.lunge) || input.lunge < 0 || input.lunge === actor.lastLunge) return;
  actor.lastLunge = input.lunge;
  startLunge(state, actor);
}

function cameraTarget(state: DragState) {
  const pulling = state.actors.filter((actor) => !actor.spectator && actor.reform <= 0);
  if (!pulling.length) return { x: state.camera.x, y: state.camera.y };
  let total = 0;
  let x = 0;
  let y = 0;
  for (const actor of pulling) {
    const influence = cameraInfluence(actor.size);
    total += influence;
    x += actor.x * influence;
    y += actor.y * influence;
  }
  const halfW = DRAG_RULES.viewWidth / 2;
  const halfH = DRAG_RULES.viewHeight / 2;
  return {
    x: clamp(x / total, -WORLD_HALF_W + halfW, WORLD_HALF_W - halfW),
    y: clamp(y / total, -WORLD_HALF_H + halfH, WORLD_HALF_H - halfH),
  };
}

function updateCamera(state: DragState, dt: number) {
  const target = cameraTarget(state);
  const dx = target.x - state.camera.x;
  const dy = target.y - state.camera.y;
  const distance = Math.hypot(dx, dy);
  const desiredSpeed = Math.min(DRAG_RULES.cameraMaxSpeed, distance * .85);
  const desiredX = distance > .001 ? dx / distance * desiredSpeed : 0;
  const desiredY = distance > .001 ? dy / distance * desiredSpeed : 0;
  state.camera.vx = approach(state.camera.vx, desiredX, DRAG_RULES.cameraMaxAcceleration * dt);
  state.camera.vy = approach(state.camera.vy, desiredY, DRAG_RULES.cameraMaxAcceleration * dt);
  const speed = Math.hypot(state.camera.vx, state.camera.vy);
  if (speed > DRAG_RULES.cameraMaxSpeed) {
    state.camera.vx = state.camera.vx / speed * DRAG_RULES.cameraMaxSpeed;
    state.camera.vy = state.camera.vy / speed * DRAG_RULES.cameraMaxSpeed;
  }
  state.camera.x += state.camera.vx * dt;
  state.camera.y += state.camera.vy * dt;
}

/**
 * The outer edge is a retention rim, not another lethal line. It guarantees
 * the full warned blob and its countdown remain visible even if the player
 * continues steering outward while the camera is pulled against them.
 */
export function retainActorInVisibleFrame(state: DragState, actor: DragActor) {
  if (actor.spectator || actor.reform > 0) return;
  const radius = blobRadius(actor.size) + 20;
  actor.x = clamp(actor.x, state.camera.x - DRAG_RULES.viewWidth / 2 + radius, state.camera.x + DRAG_RULES.viewWidth / 2 - radius);
  actor.y = clamp(actor.y, state.camera.y - DRAG_RULES.viewHeight / 2 + radius, state.camera.y + DRAG_RULES.viewHeight / 2 - radius);
}

/** Release every movement source on socket loss without refreshing lunge. */
export function neutralizeDragActor(actor: DragActor) {
  actor.input = { x: 0, y: 0 };
  actor.vx = 0;
  actor.vy = 0;
  actor.lungeTime = 0;
}

function respawn(state: DragState, actor: DragActor) {
  const angle = (actor.seat / 10) * Math.PI * 2 - Math.PI / 2;
  actor.x = clamp(state.camera.x + Math.cos(angle) * 72, -WORLD_HALF_W + 80, WORLD_HALF_W - 80);
  actor.y = clamp(state.camera.y + Math.sin(angle) * 72, -WORLD_HALF_H + 80, WORLD_HALF_H - 80);
  actor.vx = 0;
  actor.vy = 0;
  actor.input = { x: 0, y: 0 };
  actor.size = DRAG_RULES.minimumSize;
  actor.warning = 0;
  actor.warningActive = false;
  actor.reform = 0;
  actor.pop = .55;
  emit(state, "respawn");
  emit(state, "respawn", actor.id);
}

function popActor(state: DragState, actor: DragActor) {
  actor.reform = DRAG_RULES.respawnSeconds;
  actor.bursts += 1;
  actor.size = DRAG_RULES.minimumSize;
  actor.warning = 0;
  actor.warningActive = false;
  actor.vx = 0;
  actor.vy = 0;
  actor.input = { x: 0, y: 0 };
  burstParticles(state, actor, 18);
  emit(state, "burst");
  emit(state, "burst", actor.id);
}

function updateActor(state: DragState, actor: DragActor, dt: number) {
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.pop = Math.max(0, actor.pop - dt);
  if (actor.spectator) return;
  if (actor.reform > 0) {
    actor.reform = Math.max(0, actor.reform - dt);
    if (actor.reform === 0) respawn(state, actor);
    return;
  }
  if (state.phase === "countdown" || state.phase === "finish") {
    actor.vx *= Math.pow(.02, dt);
    actor.vy *= Math.pow(.02, dt);
    return;
  }

  const grown = (actor.size - DRAG_RULES.minimumSize) / (DRAG_RULES.maximumSize - DRAG_RULES.minimumSize);
  const moveSpeed = MAX_SPEED + (MIN_SPEED - MAX_SPEED) * clamp(grown, 0, 1);
  if (actor.lungeTime > 0) {
    actor.lungeTime = Math.max(0, actor.lungeTime - dt);
    actor.vx *= Math.pow(.32, dt);
    actor.vy *= Math.pow(.32, dt);
  } else {
    const targetX = actor.input.x * moveSpeed;
    const targetY = -actor.input.y * moveSpeed;
    actor.vx = approach(actor.vx, targetX, 680 * dt);
    actor.vy = approach(actor.vy, targetY, 680 * dt);
  }
  actor.x = clamp(actor.x + actor.vx * dt, -WORLD_HALF_W + 45, WORLD_HALF_W - 45);
  actor.y = clamp(actor.y + actor.vy * dt, -WORLD_HALF_H + 45, WORLD_HALF_H - 45);

  if (state.phase === "live") {
    const excess = Math.max(0, actor.size - DRAG_RULES.minimumSize);
    actor.size = Math.max(DRAG_RULES.minimumSize, actor.size - (.007 + excess * .012) * dt);
    actor.score += (.08 + .12 * Math.sqrt(excess / (DRAG_RULES.maximumSize - 1))) * dt;
  }
}

function eatFood(state: DragState) {
  if (state.phase === "countdown" || state.phase === "finish") return;
  for (const actor of state.actors) {
    if (actor.spectator || actor.reform > 0) continue;
    let ate = false;
    for (const patch of state.patches) {
      for (const drop of patch.drops) {
        if (drop.eaten || Math.hypot(actor.x - drop.x, actor.y - drop.y) > 36) continue;
        drop.eaten = true;
        actor.size = Math.min(DRAG_RULES.maximumSize, actor.size + FOOD_GROWTH);
        actor.food += state.phase === "live" ? 1 : 0;
        actor.pop = .18;
        ate = true;
      }
    }
    if (ate) {
      emit(state, "eat");
      emit(state, "eat", actor.id);
      burstParticles(state, actor, 4);
    }
  }
}

function updateDanger(state: DragState, actor: DragActor, dt: number) {
  if (actor.spectator || actor.reform > 0 || state.phase === "countdown" || state.phase === "finish") return;
  const dx = Math.abs(actor.x - state.camera.x);
  const dy = Math.abs(actor.y - state.camera.y);
  const safeX = DRAG_RULES.viewWidth / 2 - DRAG_RULES.dangerInset;
  const safeY = DRAG_RULES.viewHeight / 2 - DRAG_RULES.dangerInset;
  const outside = dx > safeX || dy > safeY;
  const cleared = dx < safeX - DRAG_RULES.dangerClearance && dy < safeY - DRAG_RULES.dangerClearance;
  if (outside) {
    if (!actor.warningActive) {
      actor.warningActive = true;
      emit(state, "warning");
      emit(state, "warning", actor.id);
    }
    actor.warning += dt;
  } else if (cleared) {
    actor.warning = 0;
    actor.warningActive = false;
  }
  if (state.phase === "live" && actor.warning >= DRAG_RULES.warningSeconds) popActor(state, actor);
}

function updatePatches(state: DragState, dt: number) {
  if (state.phase !== "live") return;
  state.patchAge += dt;
  const remaining = state.patches.reduce((sum, patch) => sum + patch.drops.filter((drop) => !drop.eaten).length, 0);
  if (!state.pendingPatches && (state.patchAge >= DRAG_RULES.patchLifetime || remaining <= 5)) {
    state.pendingPatches = makePatches(state);
    state.pendingFor = DRAG_RULES.patchPreview;
  }
  if (!state.pendingPatches) return;
  state.pendingFor = Math.max(0, state.pendingFor - dt);
  if (state.pendingFor > 0) return;
  state.patches = state.pendingPatches;
  state.pendingPatches = null;
  state.patchAge = 0;
}

function updateParticles(state: DragState, dt: number) {
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(.08, dt);
    particle.vy *= Math.pow(.08, dt);
  }
  state.particles = state.particles.filter(({ life }) => life > 0);
}

export function stepDragState(state: DragState, rawDt: number) {
  const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, .05);
  if (dt <= 0 || state.finished) return;
  state.phaseTime += dt;
  state.phoneClock += dt;
  state.goFlash = Math.max(0, state.goFlash - dt);

  if (state.phase === "practice" && state.phaseTime >= DRAG_RULES.practice) {
    resetForContest(state);
    state.phase = "countdown";
    state.phaseTime = 0;
  } else if (state.phase === "countdown" && state.phaseTime >= DRAG_RULES.runway - DRAG_RULES.practice) {
    state.phase = "live";
    state.phaseTime = 0;
    state.goFlash = .9;
    emit(state, "go");
    for (const actor of state.actors.filter((candidate) => !candidate.spectator)) emit(state, "go", actor.id);
  }

  for (const actor of state.actors) updateActor(state, actor, dt);
  eatFood(state);
  updateCamera(state, dt);
  for (const actor of state.actors) retainActorInVisibleFrame(state, actor);
  for (const actor of state.actors) updateDanger(state, actor, dt);
  updatePatches(state, dt);
  updateParticles(state, dt);

  if (state.phase === "live") {
    state.liveTime += dt;
    if (state.liveTime >= DRAG_RULES.round) {
      state.liveTime = DRAG_RULES.round;
      state.phase = "finish";
      state.phaseTime = 0;
      emit(state, "finish");
    }
  } else if (state.phase === "finish" && state.phaseTime >= DRAG_RULES.finish) {
    state.finished = true;
  }
}

export function dragResults(state: DragState): RoundResult[] {
  const ranked = state.actors
    .filter((actor) => state.participantIds.has(actor.id))
    .map((actor) => ({ actor, score: Math.max(0, Math.round(actor.score)) }))
    .sort((a, b) => b.score - a.score || b.actor.food - a.actor.food || a.actor.seat - b.actor.seat);
  let place = 0;
  let previous: number | null = null;
  return ranked.map(({ actor, score }, index) => {
    if (score !== previous) {
      place = index + 1;
      previous = score;
    }
    return { id: actor.id, place, score, detail: `${actor.food} drops · ${actor.bursts} ${actor.bursts === 1 ? "pop" : "pops"}` };
  });
}

function phoneFrame(state: DragState, actor: DragActor, cues?: DragCue[]): DragPhoneFrame {
  const reforming = actor.reform > 0;
  const phase = actor.spectator ? "spectating" : reforming ? "reforming" : state.phase;
  const warning = actor.warningActive ? Math.max(0, DRAG_RULES.warningSeconds - actor.warning) : null;
  const status = actor.spectator
    ? "Heat in progress · you join next game"
    : reforming
      ? `Reforming · ${Math.ceil(actor.reform)}`
      : warning !== null
        ? `GET INSIDE · ${Math.max(1, Math.ceil(warning))}`
        : state.phase === "practice"
          ? "Practice is harmless · find your blob"
          : state.phase === "countdown"
            ? `Reset complete · GO in ${Math.max(1, Math.ceil(DRAG_RULES.runway - DRAG_RULES.practice - state.phaseTime))}`
            : state.phase === "finish"
              ? "Ink down · heat complete"
              : "Eat · pull · stay inside";
  return {
    t: "dragState",
    phase,
    status,
    remaining: state.phase === "live" ? Math.max(0, DRAG_RULES.round - state.liveTime) : DRAG_RULES.round,
    interactive: !actor.spectator && !reforming && state.phase !== "countdown" && state.phase !== "finish",
    lungeReady: !actor.spectator && !reforming && actor.cooldown <= 0 && state.phase !== "countdown" && state.phase !== "finish",
    cooldown: actor.cooldown,
    size: actor.size,
    score: Math.round(actor.score),
    warning,
    connected: actor.connected,
    cues: cues?.length ? cues : undefined,
  };
}

export function isDragPhoneFrame(value: unknown): value is DragPhoneFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Partial<DragPhoneFrame>;
  return frame.t === "dragState"
    && typeof frame.status === "string"
    && typeof frame.remaining === "number" && Number.isFinite(frame.remaining)
    && typeof frame.cooldown === "number" && Number.isFinite(frame.cooldown)
    && typeof frame.size === "number" && Number.isFinite(frame.size)
    && typeof frame.score === "number" && Number.isFinite(frame.score)
    && typeof frame.interactive === "boolean" && typeof frame.lungeReady === "boolean"
    && (frame.cues === undefined || (Array.isArray(frame.cues) && frame.cues.length <= 4 && frame.cues.every(isDragCue)));
}

function roundedRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
}

function drawBlob(c: CanvasRenderingContext2D, actor: DragActor, time: number, reducedMotion: boolean) {
  const radius = blobRadius(actor.size);
  const speed = Math.hypot(actor.vx, actor.vy);
  const direction = speed > 8 ? Math.atan2(actor.vy, actor.vx) : Math.atan2(actor.lastDirection.y, actor.lastDirection.x);
  const stretch = actor.lungeTime > 0 ? 1.32 : 1 + Math.min(.13, speed / 1800);
  const pulse = reducedMotion ? 0 : Math.sin(time * 5 + actor.seat) * 1.2;
  c.save();
  c.translate(actor.x, actor.y);
  c.rotate(direction);
  c.scale(stretch + actor.pop * .18, 1 / Math.sqrt(stretch) + actor.pop * .12);
  c.beginPath();
  const points = 8 + actor.seat;
  for (let index = 0; index <= points; index++) {
    const angle = index / points * Math.PI * 2;
    const wobble = index % 2 === 0 ? 1 : .82 + (actor.seat % 4) * .035;
    const r = radius * wobble + pulse * (index % 3 - 1);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (index === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  c.fillStyle = actor.color;
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = "#16242b";
  c.stroke();
  c.rotate(-direction);
  const marks = ["●", "▲", "■", "◆", "✚", "✦", "☰", "⌁", "∩", "×"];
  c.fillStyle = "rgba(255,255,255,.92)";
  c.font = "1000 22px system-ui";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(marks[actor.seat % marks.length], 0, 0);
  c.restore();
}

function drawWorld(c: CanvasRenderingContext2D, state: DragState) {
  c.fillStyle = "#f3ead5";
  c.fillRect(-WORLD_HALF_W, -WORLD_HALF_H, WORLD_HALF_W * 2, WORLD_HALF_H * 2);
  c.strokeStyle = "rgba(24,50,57,.12)";
  c.lineWidth = 2;
  c.beginPath();
  for (let x = -WORLD_HALF_W; x <= WORLD_HALF_W; x += 100) { c.moveTo(x, -WORLD_HALF_H); c.lineTo(x, WORLD_HALF_H); }
  for (let y = -WORLD_HALF_H; y <= WORLD_HALF_H; y += 100) { c.moveTo(-WORLD_HALF_W, y); c.lineTo(WORLD_HALF_W, y); }
  c.stroke();

  const preview = state.pendingPatches ? state.pendingFor / DRAG_RULES.patchPreview : 0;
  for (const patch of state.pendingPatches ?? []) {
    c.beginPath();
    c.arc(patch.x, patch.y, 80 + (state.reducedMotion ? 0 : Math.sin(state.phaseTime * 6) * 5), 0, Math.PI * 2);
    c.strokeStyle = `rgba(26,153,133,${.35 + (1 - preview) * .4})`;
    c.lineWidth = 8;
    c.stroke();
    c.fillStyle = "#12373a";
    c.font = "900 19px system-ui";
    c.textAlign = "center";
    c.fillText("INK COMING", patch.x, patch.y + 6);
  }
  for (const patch of state.patches) {
    c.beginPath();
    c.arc(patch.x, patch.y, 112, 0, Math.PI * 2);
    c.strokeStyle = "rgba(26,153,133,.22)";
    c.lineWidth = 10;
    c.stroke();
    for (const drop of patch.drops) {
      if (drop.eaten) continue;
      c.beginPath();
      c.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      c.fillStyle = "#16242b";
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = "#52c7ab";
      c.stroke();
    }
  }

  for (const particle of state.particles) {
    c.globalAlpha = clamp(particle.life / particle.max, 0, 1);
    c.beginPath(); c.arc(particle.x, particle.y, 4, 0, Math.PI * 2); c.fillStyle = particle.color; c.fill();
  }
  c.globalAlpha = 1;
}

function drawDangerFrame(c: CanvasRenderingContext2D, state: DragState) {
  const halfW = DRAG_RULES.viewWidth / 2;
  const halfH = DRAG_RULES.viewHeight / 2;
  const safeX = halfW - DRAG_RULES.dangerInset;
  const safeY = halfH - DRAG_RULES.dangerInset;
  c.fillStyle = "rgba(227,74,57,.11)";
  c.fillRect(state.camera.x - halfW, state.camera.y - halfH, DRAG_RULES.viewWidth, DRAG_RULES.dangerInset);
  c.fillRect(state.camera.x - halfW, state.camera.y + safeY, DRAG_RULES.viewWidth, DRAG_RULES.dangerInset);
  c.fillRect(state.camera.x - halfW, state.camera.y - safeY, DRAG_RULES.dangerInset, safeY * 2);
  c.fillRect(state.camera.x + safeX, state.camera.y - safeY, DRAG_RULES.dangerInset, safeY * 2);
  c.strokeStyle = "#d44335";
  c.lineWidth = 9;
  c.setLineDash([22, 12]);
  c.strokeRect(state.camera.x - safeX, state.camera.y - safeY, safeX * 2, safeY * 2);
  c.setLineDash([]);
}

interface CalloutPlacement { x: number; y: number; width: number; height: number }

function overlaps(a: CalloutPlacement, b: CalloutPlacement) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 6
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 6;
}

function placeCallout(
  actor: DragActor,
  width: number,
  height: number,
  preferredY: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  occupied: CalloutPlacement[],
) {
  const xOrder = [0, -1, 1, -2, 2, -3, 3];
  const yOrder = [0, -1, 1, -2, 2, -3, 3];
  for (const yStep of yOrder) {
    for (const xStep of xOrder) {
      const candidate = {
        x: clamp(actor.x + xStep * (width + 12), bounds.left + width / 2 + 10, bounds.right - width / 2 - 10),
        y: clamp(preferredY + yStep * (height + 10), bounds.top + height / 2 + 8, bounds.bottom - height / 2 - 8),
        width,
        height,
      };
      if (occupied.every((placed) => !overlaps(candidate, placed))) {
        occupied.push(candidate);
        return candidate;
      }
    }
  }
  // Near a corner, clamping can collapse several local candidates onto one
  // point. Fall back to a bounded viewport scan rather than ever accepting an
  // overlap; 100 checks covers twenty mixed warning/name callouts at 1600×900.
  let scanned = 0;
  for (let y = bounds.top + height / 2 + 8; y <= bounds.bottom - height / 2 - 8 && scanned < 100; y += height + 10) {
    for (let x = bounds.left + width / 2 + 10; x <= bounds.right - width / 2 - 10 && scanned < 100; x += width + 12) {
      scanned += 1;
      const candidate = { x, y, width, height };
      if (occupied.every((placed) => !overlaps(candidate, placed))) {
        occupied.push(candidate);
        return candidate;
      }
    }
  }
  const fallback = {
    x: clamp(actor.x, bounds.left + width / 2 + 10, bounds.right - width / 2 - 10),
    y: clamp(preferredY, bounds.top + height / 2 + 8, bounds.bottom - height / 2 - 8),
    width,
    height,
  };
  occupied.push(fallback);
  return fallback;
}

function drawActorLabels(c: CanvasRenderingContext2D, state: DragState) {
  const left = state.camera.x - DRAG_RULES.viewWidth / 2;
  const right = state.camera.x + DRAG_RULES.viewWidth / 2;
  const top = state.camera.y - DRAG_RULES.viewHeight / 2;
  const bottom = state.camera.y + DRAG_RULES.viewHeight / 2;
  const visible = state.actors.filter((actor) => !actor.spectator && actor.reform <= 0).sort((a, b) => a.seat - b.seat);
  const bounds = { left, right, top, bottom };
  const occupied: CalloutPlacement[] = [];
  const warnings = new Map<string, { label: string; placement: CalloutPlacement }>();
  const names = new Map<string, { label: string; placement: CalloutPlacement }>();

  // Bodies remain the stable world marks. Callouts are resolved afterwards so
  // co-located players never paint later blobs over earlier identities.
  for (const actor of visible) {
    drawBlob(c, actor, state.liveTime + state.phaseTime, state.reducedMotion);
    const radius = blobRadius(actor.size);
    if (actor.warningActive) {
      const remaining = Math.max(0, DRAG_RULES.warningSeconds - actor.warning);
      c.beginPath();
      c.arc(actor.x, actor.y, radius + 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remaining / DRAG_RULES.warningSeconds));
      c.strokeStyle = "#e33e32";
      c.lineWidth = 11;
      c.stroke();
    } else if (actor.cooldown <= 0) {
      c.beginPath(); c.arc(actor.x + radius * .72, actor.y + radius * .64, 7, 0, Math.PI * 2); c.fillStyle = "#fff9ed"; c.fill();
    }
  }

  // Warning text claims space first; names route around it, preserving the
  // life-critical countdown at a ten-player pile-up.
  c.font = "1000 30px system-ui";
  for (const actor of visible.filter((candidate) => candidate.warningActive)) {
    const remaining = Math.max(0, DRAG_RULES.warningSeconds - actor.warning);
    const label = `INSIDE ${Math.max(1, Math.ceil(remaining))}`;
    const width = c.measureText(label).width + 14;
    const placement = placeCallout(actor, width, 38, actor.y + blobRadius(actor.size) + 34, bounds, occupied);
    warnings.set(actor.id, { label, placement });
  }

  c.font = "900 30px system-ui";
  for (const actor of visible) {
    const radius = blobRadius(actor.size);
    const label = `${actor.seat + 1} · ${actor.name}`;
    const width = Math.min(220, Math.max(88, c.measureText(label).width + 24));
    names.set(actor.id, { label, placement: placeCallout(actor, width, 38, actor.y - radius - 23, bounds, occupied) });
  }

  for (const actor of visible) {
    const { placement } = names.get(actor.id)!;
    if (Math.hypot(placement.x - actor.x, placement.y - actor.y) > blobRadius(actor.size) + 42) {
      c.beginPath(); c.moveTo(actor.x, actor.y); c.lineTo(placement.x, placement.y);
      c.strokeStyle = actor.color; c.lineWidth = 5; c.stroke();
    }
    const warning = warnings.get(actor.id);
    if (warning) {
      c.beginPath(); c.moveTo(actor.x, actor.y); c.lineTo(warning.placement.x, warning.placement.y);
      c.strokeStyle = "#e33e32"; c.lineWidth = 5; c.stroke();
    }
  }

  // Every connector stays behind every opaque callout, including other seats.
  for (const actor of visible) {
    const callout = names.get(actor.id)!;
    const { placement } = callout;
    roundedRect(c, placement.x - placement.width / 2, placement.y - placement.height / 2, placement.width, placement.height, 8);
    c.fillStyle = "#16242b";
    c.fill();
    c.fillStyle = "#fff9ed";
    c.font = "900 30px system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(callout.label, placement.x, placement.y, placement.width - 12);
  }

  // Draw warnings last so a countdown wins any unavoidable visual conflict.
  for (const actor of visible) {
    const warning = warnings.get(actor.id);
    if (!warning) continue;
    const { placement } = warning;
    roundedRect(c, placement.x - placement.width / 2, placement.y - placement.height / 2, placement.width, placement.height, 8);
    c.fillStyle = "#fff0df"; c.fill();
    c.strokeStyle = "#e33e32"; c.lineWidth = 4; c.stroke();
    c.fillStyle = "#9f241d"; c.font = "1000 30px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(warning.label, placement.x, placement.y, placement.width - 12);
  }
}

function drawHud(c: CanvasRenderingContext2D, state: DragState) {
  c.fillStyle = "#f3ead5";
  c.fillRect(0, 0, DRAG_RULES.viewWidth, HUD_HEIGHT);
  c.strokeStyle = "rgba(22,36,43,.24)";
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, HUD_HEIGHT - 2); c.lineTo(DRAG_RULES.viewWidth, HUD_HEIGHT - 2); c.stroke();
  c.fillStyle = "rgba(22,36,43,.94)";
  roundedRect(c, 28, 21, 198, 76, 12); c.fill();
  c.fillStyle = "#fff9ed";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = "1000 34px system-ui";
  const remaining = state.phase === "live" ? DRAG_RULES.round - state.liveTime : DRAG_RULES.round;
  c.fillText(`${Math.ceil(remaining)}s`, 48, 54);
  c.font = "850 13px system-ui";
  c.fillStyle = "#83dec5";
  c.fillText("EAT · PULL · STAY IN", 48, 79);

  const cameraSpeed = Math.hypot(state.camera.vx, state.camera.vy);
  c.save();
  c.translate(1090, 48);
  c.rotate(cameraSpeed > 2 ? Math.atan2(state.camera.vy, state.camera.vx) : 0);
  c.fillStyle = "#16242b";
  c.beginPath(); c.moveTo(-34, -9); c.lineTo(14, -9); c.lineTo(14, -20); c.lineTo(42, 0); c.lineTo(14, 20); c.lineTo(14, 9); c.lineTo(-34, 9); c.closePath(); c.fill();
  c.restore();
  c.font = "900 12px system-ui";
  c.fillStyle = "#16242b";
  c.textAlign = "center";
  c.fillText(cameraSpeed > 2 ? "SCREEN PULL" : "PULL BALANCED", 1090, 87);

  const leaders = [...state.actors].filter((actor) => !actor.spectator).sort((a, b) => b.score - a.score || a.seat - b.seat).slice(0, 3);
  leaders.forEach((actor, index) => {
    const x = 270 + index * 240;
    const y = 21;
    c.fillStyle = "rgba(22,36,43,.92)";
    roundedRect(c, x, y, 220, 38, 8); c.fill();
    c.fillStyle = actor.color; c.fillRect(x + 8, y + 8, 22, 22);
    c.fillStyle = "#fff9ed"; c.font = "850 29px system-ui"; c.textAlign = "left";
    c.fillText(`${index + 1} ${actor.name}`, x + 37, y + 19, 135);
    c.textAlign = "right"; c.fillText(`${Math.round(actor.score)}`, x + 208, y + 19);
  });
}

function drawOverlay(c: CanvasRenderingContext2D, state: DragState) {
  const cx = state.camera.x;
  const cy = state.camera.y;
  let title = "";
  let subtitle = "";
  if (state.phase === "practice") {
    title = "PRACTICE — HARMLESS";
    subtitle = state.phaseTime < 2.4 ? "FIND YOUR NAME · STEER + LUNGE" : "BIG BLOBS PULL THE SCREEN";
  } else if (state.phase === "countdown") {
    title = String(Math.max(1, Math.ceil(DRAG_RULES.runway - DRAG_RULES.practice - state.phaseTime)));
    subtitle = "RESET COMPLETE · HANDS READY";
  } else if (state.goFlash > 0) {
    title = "GO!";
    subtitle = "EAT · PULL · STAY INSIDE";
  } else if (state.phase === "finish") {
    const winner = dragResults(state)[0];
    const actor = state.actors.find(({ id }) => id === winner?.id);
    title = "INK DOWN!";
    subtitle = actor ? `${actor.name.toUpperCase()} PULLED AHEAD` : "HEAT COMPLETE";
  }
  if (!title) return;
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (state.phase === "practice") {
    const y = cy + DRAG_RULES.viewHeight / 2 - 62;
    roundedRect(c, cx - 430, y - 31, 860, 62, 14);
    c.fillStyle = "rgba(22,36,43,.88)"; c.fill();
    c.fillStyle = "#fff9ed"; c.font = "1000 34px system-ui"; c.fillText(title, cx, y - 8);
    c.font = "900 18px system-ui"; c.fillStyle = "#72d5ba"; c.fillText(subtitle, cx, y + 20);
    return;
  }
  c.font = state.phase === "countdown" ? "1000 126px system-ui" : "1000 56px system-ui";
  const titleWidth = Math.min(840, c.measureText(title).width + 80);
  roundedRect(c, cx - titleWidth / 2, cy - 80, titleWidth, state.phase === "countdown" ? 148 : 112, 18);
  c.fillStyle = "rgba(22,36,43,.94)"; c.fill();
  c.fillStyle = "#fff9ed"; c.fillText(title, cx, cy - 29);
  c.font = "900 19px system-ui"; c.fillStyle = "#72d5ba"; c.fillText(subtitle, cx, cy + 44);
}

export function renderDrag(c: CanvasRenderingContext2D, state: DragState, width: number, height: number) {
  c.save();
  c.fillStyle = "#16242b";
  c.fillRect(0, 0, width, height);
  const totalHeight = DRAG_RULES.viewHeight + HUD_HEIGHT;
  const scale = Math.min(width / DRAG_RULES.viewWidth, height / totalHeight);
  c.translate((width - DRAG_RULES.viewWidth * scale) / 2, (height - totalHeight * scale) / 2);
  c.scale(scale, scale);
  drawHud(c, state);
  c.save();
  c.beginPath();
  c.rect(0, HUD_HEIGHT, DRAG_RULES.viewWidth, DRAG_RULES.viewHeight);
  c.clip();
  c.translate(DRAG_RULES.viewWidth / 2 - state.camera.x, HUD_HEIGHT + DRAG_RULES.viewHeight / 2 - state.camera.y);
  drawWorld(c, state);
  drawDangerFrame(c, state);
  drawActorLabels(c, state);
  drawOverlay(c, state);
  c.restore();
  c.restore();
}

export function createHost(ctx: HostContext): GameHost {
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const state = createDragState(ctx.players, ctx.seed, reducedMotion);
  const sound = typeof AudioContext === "undefined" ? null : new DragSound("host");
  const phoneCues = new Map<string, DragCue[]>();
  let destroyed = false;
  sound?.play("launch");

  const flushEvents = () => {
    for (const event of state.events.splice(0)) {
      if (!event.to) sound?.play(event.cue);
      if (event.to) {
        const queue = phoneCues.get(event.to) ?? [];
        if (queue.length < 4) queue.push(event.cue);
        phoneCues.set(event.to, queue);
      }
    }
  };

  const sendStatus = (actor: DragActor) => ctx.send(phoneFrame(state, actor), actor.id);
  const broadcastStatus = () => ctx.send({
    t: "dragStates",
    frames: Object.fromEntries(state.actors.map((actor) => [actor.id, phoneFrame(state, actor, phoneCues.get(actor.id))])),
  } satisfies DragPhoneFrames);

  return {
    onJoin(player) {
      if (state.actors.some(({ id }) => id === player.id)) return;
      const actor = actorFromPlayer(player, state.actors.length, state.actors.length + 1, !state.participantIds.has(player.id));
      state.actors.push(actor);
      sendStatus(actor);
    },
    onLeave(id) {
      const actor = state.actors.find((candidate) => candidate.id === id);
      if (!actor) return;
      actor.connected = false;
      neutralizeDragActor(actor);
    },
    onConnectionChange(id, connected) {
      const actor = state.actors.find((candidate) => candidate.id === id);
      if (!actor) return;
      actor.connected = connected;
      if (!connected) neutralizeDragActor(actor);
      sendStatus(actor);
    },
    onInput(playerId, data) {
      applyDragInput(state, playerId, data);
      // Sync is deliberately passive: the regular public batch arrives within
      // 200ms. Letting controller traffic accelerate host replies would turn a
      // valid full-room sync stream into rate amplification.
      flushEvents();
    },
    tick(dt) {
      if (destroyed) return;
      stepDragState(state, dt);
      flushEvents();
      if (state.phoneClock >= .2) {
        state.phoneClock %= .2;
        broadcastStatus();
        phoneCues.clear();
      }
    },
    render(c, width, height) {
      renderDrag(c, state, width, height);
    },
    isOver() { return state.finished; },
    results() { return dragResults(state); },
    destroy() {
      destroyed = true;
      state.events.length = 0;
      state.particles.length = 0;
      sound?.destroy();
    },
  };
}
