import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import { DragSound, isDragCue, type DragCue } from "./sound";

export const DRAG_RULES = {
  runway: 9,
  practice: 5.5,
  round: 90,
  finish: 2.4,
  viewWidth: 1600,
  viewHeight: 828,
  dangerInset: 34,
  dangerClearance: 18,
  warningSeconds: 4,
  cameraMaxSpeed: 70,
  cameraMaxAcceleration: 105,
  minimumSize: 1,
  maximumSize: 3.25,
  lungeCooldown: 1.8,
  lungeSeconds: .3,
  lungeStretch: 1.2,
  retentionPadding: 20,
  contourMaxWobble: 1.07,
  maximumPop: .55,
  popLongitudinalScale: .18,
  respawnSeconds: 2,
  respawnProtection: 2.25,
  predationSizeAdvantage: .25,
  predationRadiusRatio: 1.12,
  predationScore: 2.5,
  foodTarget: 128,
  foodReplenishAt: 88,
  patchPreview: .15,
  patchLifetime: 14,
} as const;

const WORLD_HALF_W = 2100;
const WORLD_HALF_H = 1320;
const MIN_SPEED = 180;
const MAX_SPEED = 286;
const LUNGE_SPEED = 540;
const FOOD_GROWTH = .011;
const MAX_PARTICLES = 110;
const HUD_HEIGHT = 72;
const FOOD_COLORS = ["#ffb800", "#ff3f7f", "#38b64a", "#168ff0", "#ff681f", "#9b55df", "#23bfd0"] as const;

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
  protection: number;
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
  protection: number;
  connected: boolean;
  spectator: boolean;
  score: number;
  food: number;
  bursts: number;
  predations: number;
  swallowFlash: number;
  pop: number;
}

export interface FoodDrop {
  x: number;
  y: number;
  radius: number;
  color: string;
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
  return 45 + Math.sqrt(clamp(size, DRAG_RULES.minimumSize, DRAG_RULES.maximumSize) - 1) * 30;
}

export function visualBlobScaleX(radius: number, requestedStretch: number, pop: number) {
  const retainedScale = (radius + DRAG_RULES.retentionPadding) / (radius * DRAG_RULES.contourMaxWobble);
  return Math.min(requestedStretch + pop * DRAG_RULES.popLongitudinalScale, retainedScale);
}

export function movementSpeed(size: number) {
  const grown = (size - DRAG_RULES.minimumSize) / (DRAG_RULES.maximumSize - DRAG_RULES.minimumSize);
  return MAX_SPEED + (MIN_SPEED - MAX_SPEED) * clamp(grown, 0, 1);
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
    protection: 0,
    connected: player.connected,
    spectator,
    score: 0,
    food: 0,
    bursts: 0,
    predations: 0,
    swallowFlash: 0,
    pop: 0,
  };
}

function makePatches(state: DragState): FoodPatch[] {
  // A jittered grid gives every part of the shared frame something to chase
  // from the first frame while still reading as scattered agar-style food.
  const columns = 16;
  const rows = DRAG_RULES.foodTarget / columns;
  const inset = DRAG_RULES.dangerInset + 26;
  const width = DRAG_RULES.viewWidth - inset * 2;
  const height = DRAG_RULES.viewHeight - inset * 2;
  const drops: FoodDrop[] = [];
  for (let index = 0; index < DRAG_RULES.foodTarget; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drops.push({
      x: clamp(state.camera.x - width / 2 + (column + .18 + rand(state) * .64) * width / columns, -WORLD_HALF_W + inset, WORLD_HALF_W - inset),
      y: clamp(state.camera.y - height / 2 + (row + .18 + rand(state) * .64) * height / rows, -WORLD_HALF_H + inset, WORLD_HALF_H - inset),
      radius: 5.5 + rand(state) * 3.5,
      color: FOOD_COLORS[Math.floor(rand(state) * FOOD_COLORS.length)],
      eaten: false,
    });
  }
  return [{ x: state.camera.x, y: state.camera.y, drops }];
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
    actor.protection = 0;
    actor.score = 0;
    actor.food = 0;
    actor.bursts = 0;
    actor.predations = 0;
    actor.swallowFlash = 0;
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
  const radius = blobRadius(actor.size) + DRAG_RULES.retentionPadding;
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

function safestRespawnPosition(state: DragState, actor: DragActor) {
  const threats = state.actors.filter((candidate) => candidate.id !== actor.id && !candidate.spectator && candidate.reform <= 0);
  const safeX = DRAG_RULES.viewWidth / 2 - DRAG_RULES.dangerInset - blobRadius(DRAG_RULES.minimumSize) - 14;
  const safeY = DRAG_RULES.viewHeight / 2 - DRAG_RULES.dangerInset - blobRadius(DRAG_RULES.minimumSize) - 14;
  const candidates = Array.from({ length: 12 }, (_, index) => {
    const angle = (actor.seat / 10 + index / 12) * Math.PI * 2 - Math.PI / 2;
    const radius = index % 3 === 0 ? 165 : index % 3 === 1 ? 245 : 325;
    return {
      x: clamp(state.camera.x + Math.cos(angle) * radius, state.camera.x - safeX, state.camera.x + safeX),
      y: clamp(state.camera.y + Math.sin(angle) * radius, state.camera.y - safeY, state.camera.y + safeY),
    };
  });
  return candidates.reduce<{ x: number; y: number; clearance: number }>((best, candidate) => {
    const clearance = threats.length ? Math.min(...threats.map((threat) => Math.hypot(candidate.x - threat.x, candidate.y - threat.y) - blobRadius(threat.size))) : Infinity;
    return clearance > best.clearance ? { ...candidate, clearance } : best;
  }, { ...candidates[0], clearance: -Infinity });
}

function respawn(state: DragState, actor: DragActor) {
  const position = safestRespawnPosition(state, actor);
  actor.x = position.x;
  actor.y = position.y;
  actor.vx = 0;
  actor.vy = 0;
  actor.input = { x: 0, y: 0 };
  actor.size = DRAG_RULES.minimumSize;
  actor.warning = 0;
  actor.warningActive = false;
  actor.reform = 0;
  actor.protection = DRAG_RULES.respawnProtection;
  actor.pop = DRAG_RULES.maximumPop;
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
  actor.lungeTime = 0;
  actor.input = { x: 0, y: 0 };
  burstParticles(state, actor, 18);
  emit(state, "burst");
  emit(state, "burst", actor.id);
}

function updateActor(state: DragState, actor: DragActor, dt: number) {
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.protection = Math.max(0, actor.protection - dt);
  actor.swallowFlash = Math.max(0, actor.swallowFlash - dt);
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

  const moveSpeed = movementSpeed(actor.size);
  if (actor.lungeTime > 0) {
    actor.lungeTime = Math.max(0, actor.lungeTime - dt);
    actor.vx *= Math.pow(.32, dt);
    actor.vy *= Math.pow(.32, dt);
  } else {
    const targetX = actor.input.x * moveSpeed;
    const targetY = -actor.input.y * moveSpeed;
    actor.vx = approach(actor.vx, targetX, 1050 * dt);
    actor.vy = approach(actor.vy, targetY, 1050 * dt);
  }
  actor.x = clamp(actor.x + actor.vx * dt, -WORLD_HALF_W + 45, WORLD_HALF_W - 45);
  actor.y = clamp(actor.y + actor.vy * dt, -WORLD_HALF_H + 45, WORLD_HALF_H - 45);

  if (state.phase === "live") {
    const excess = Math.max(0, actor.size - DRAG_RULES.minimumSize);
    actor.size = Math.max(DRAG_RULES.minimumSize, actor.size - (.014 + excess * .035 + excess * excess * .01) * dt);
    actor.score += (.08 + .12 * Math.sqrt(excess / (DRAG_RULES.maximumSize - 1))) * dt;
  }
}

export function canEatPlayer(predator: DragActor, prey: DragActor) {
  if (predator.id === prey.id || predator.spectator || prey.spectator || predator.reform > 0 || prey.reform > 0) return false;
  if (predator.protection > 0 || prey.protection > 0) return false;
  if (predator.size - prey.size < DRAG_RULES.predationSizeAdvantage) return false;
  const predatorRadius = blobRadius(predator.size);
  const preyRadius = blobRadius(prey.size);
  if (predatorRadius / preyRadius < DRAG_RULES.predationRadiusRatio) return false;
  const captureDepth = predatorRadius - preyRadius * .45;
  return Math.hypot(predator.x - prey.x, predator.y - prey.y) <= Math.max(8, captureDepth);
}

function eatPlayers(state: DragState) {
  if (state.phase !== "live") return;
  const consumed = new Set<string>();
  const hunters = [...state.actors].sort((a, b) => b.size - a.size || a.seat - b.seat);
  for (const predator of hunters) {
    if (consumed.has(predator.id) || predator.reform > 0 || predator.protection > 0) continue;
    const prey = state.actors
      .filter((candidate) => !consumed.has(candidate.id) && canEatPlayer(predator, candidate))
      .sort((a, b) => a.size - b.size || a.seat - b.seat)[0];
    if (!prey) continue;
    const capturedSize = prey.size;
    consumed.add(prey.id);
    predator.size = Math.min(DRAG_RULES.maximumSize, predator.size + Math.min(.55, .25 + (capturedSize - 1) * .2));
    predator.score += DRAG_RULES.predationScore;
    predator.predations += 1;
    predator.swallowFlash = .9;
    predator.pop = .42;
    popActor(state, prey);
    emit(state, "eat");
    emit(state, "eat", predator.id);
    burstParticles(state, predator, 9);
  }
}

function eatFood(state: DragState) {
  if (state.phase === "countdown" || state.phase === "finish") return;
  for (const actor of state.actors) {
    if (actor.spectator || actor.reform > 0) continue;
    let ate = false;
    for (const patch of state.patches) {
      for (const drop of patch.drops) {
        if (drop.eaten || Math.hypot(actor.x - drop.x, actor.y - drop.y) > blobRadius(actor.size) + drop.radius * .2) continue;
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
  const radius = blobRadius(actor.size);
  const outside = dx + radius > safeX || dy + radius > safeY;
  const cleared = dx + radius < safeX - DRAG_RULES.dangerClearance && dy + radius < safeY - DRAG_RULES.dangerClearance;
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
  if (!state.pendingPatches && (state.patchAge >= DRAG_RULES.patchLifetime || remaining <= DRAG_RULES.foodReplenishAt)) {
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
  eatPlayers(state);
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
    return { id: actor.id, place, score, detail: `${actor.food} drops · ${actor.predations} swallowed · ${actor.bursts} ${actor.bursts === 1 ? "pop" : "pops"}` };
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
        : actor.swallowFlash > 0
          ? `PLAYER SWALLOWED · +${DRAG_RULES.predationScore}`
        : actor.protection > 0
          ? `SAFE · move free for ${Math.ceil(actor.protection)}s`
        : state.phase === "practice"
          ? "Practice · eat ink and chase smaller blobs"
          : state.phase === "countdown"
            ? `Reset complete · GO in ${Math.max(1, Math.ceil(DRAG_RULES.runway - DRAG_RULES.practice - state.phaseTime))}`
            : state.phase === "finish"
              ? "Ink down · heat complete"
              : "Eat ink · swallow smaller blobs · stay inside";
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
    protection: actor.protection,
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
    && typeof frame.protection === "number" && Number.isFinite(frame.protection)
    && typeof frame.interactive === "boolean" && typeof frame.lungeReady === "boolean"
    && (frame.cues === undefined || (Array.isArray(frame.cues) && frame.cues.length <= 4 && frame.cues.every(isDragCue)));
}

function roundedRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
}

function blendHex(color: string, target: string, amount: number) {
  const parse = (value: string) => {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
    return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null;
  };
  const from = parse(color);
  const to = parse(target);
  if (!from || !to) return color;
  return `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)).join(",")})`;
}

function drawBlob(c: CanvasRenderingContext2D, actor: DragActor, time: number, reducedMotion: boolean, worried: boolean) {
  const radius = blobRadius(actor.size);
  const speed = Math.hypot(actor.vx, actor.vy);
  const direction = speed > 8 ? Math.atan2(actor.vy, actor.vx) : Math.atan2(actor.lastDirection.y, actor.lastDirection.x);
  const stretch = actor.lungeTime > 0 ? DRAG_RULES.lungeStretch : 1 + Math.min(.13, speed / 1800);
  const pulse = reducedMotion ? 0 : time * 2.4;
  c.save();
  c.translate(actor.x, actor.y);
  c.beginPath();
  c.ellipse(3, radius * .72, radius * .78, radius * .25, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(105,72,38,.14)";
  c.fill();
  const body = c.createRadialGradient(-radius * .35, -radius * .42, radius * .08, 0, 0, radius * 1.12);
  body.addColorStop(0, blendHex(actor.color, "#ffffff", .4));
  body.addColorStop(.36, actor.color);
  body.addColorStop(1, blendHex(actor.color, "#071d3c", .24));
  c.save();
  c.rotate(direction);
  c.scale(visualBlobScaleX(radius, stretch, actor.pop), 1 / Math.sqrt(stretch) + actor.pop * .12);
  c.beginPath();
  const points = Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    const wobble = 1
      + Math.sin(angle * 3 + actor.seat * .83 + pulse) * .045
      + Math.sin(angle * 5 - actor.seat * .47 - pulse * .7) * .025;
    return { x: Math.cos(angle) * radius * wobble, y: Math.sin(angle) * radius * wobble };
  });
  c.moveTo(points[0].x, points[0].y);
  const tension = .17;
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    c.bezierCurveTo(
      current.x + (next.x - previous.x) * tension,
      current.y + (next.y - previous.y) * tension,
      next.x - (after.x - current.x) * tension,
      next.y - (after.y - current.y) * tension,
      next.x,
      next.y,
    );
  }
  c.closePath();
  c.fillStyle = body;
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = blendHex(actor.color, "#071d3c", .7);
  c.stroke();

  c.restore();

  c.beginPath();
  c.ellipse(-radius * .3, -radius * .33, radius * .24, radius * .09, -.38, 0, Math.PI * 2);
  c.fillStyle = "rgba(255,255,255,.34)";
  c.fill();

  const forward = { x: Math.cos(direction), y: Math.sin(direction) };
  const faceX = forward.x * radius * .13;
  const faceY = forward.y * radius * .08 - radius * .13;
  for (const side of [-1, 1]) {
    const eyeX = faceX + radius * .17 * side;
    const eyeY = faceY;
    c.beginPath();
    c.ellipse(eyeX, eyeY, radius * .16, radius * .21, 0, 0, Math.PI * 2);
    c.fillStyle = "#fffdf7";
    c.fill();
    c.beginPath();
    c.ellipse(eyeX + forward.x * radius * .065, eyeY + forward.y * radius * .065, radius * .065, radius * .105, 0, 0, Math.PI * 2);
    c.fillStyle = "#071d3c";
    c.fill();
  }

  c.beginPath();
  const mouthX = faceX;
  const mouthY = faceY + radius * .27;
  if (worried) c.ellipse(mouthX, mouthY, radius * .075, radius * .11, 0, 0, Math.PI * 2);
  else {
    c.moveTo(mouthX - radius * .09, mouthY);
    c.quadraticCurveTo(mouthX, mouthY + radius * .09, mouthX + radius * .09, mouthY);
  }
  c.strokeStyle = blendHex(actor.color, "#071d3c", .78);
  c.lineWidth = Math.max(2.5, radius * .06);
  c.lineCap = "round";
  c.stroke();

  const marks = ["●", "▲", "■", "◆", "✚", "✦", "☰", "⌁", "∩", "×"];
  c.fillStyle = "rgba(255,255,255,.92)";
  c.font = `1000 ${Math.round(radius * .46)}px system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const markX = -radius * .24;
  const markY = radius * .28;
  c.fillText(marks[actor.seat % marks.length], markX, markY);
  c.restore();
}

function drawWorld(c: CanvasRenderingContext2D, state: DragState) {
  c.fillStyle = "#fffaf0";
  c.fillRect(-WORLD_HALF_W, -WORLD_HALF_H, WORLD_HALF_W * 2, WORLD_HALF_H * 2);
  c.strokeStyle = "rgba(83,72,52,.07)";
  c.lineWidth = 1.2;
  c.beginPath();
  for (let x = -WORLD_HALF_W; x <= WORLD_HALF_W; x += 100) { c.moveTo(x, -WORLD_HALF_H); c.lineTo(x, WORLD_HALF_H); }
  for (let y = -WORLD_HALF_H; y <= WORLD_HALF_H; y += 100) { c.moveTo(-WORLD_HALF_W, y); c.lineTo(WORLD_HALF_W, y); }
  c.stroke();

  for (const patch of state.patches) {
    for (const drop of patch.drops) {
      if (drop.eaten) continue;
      c.beginPath();
      c.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      c.fillStyle = drop.color;
      c.fill();
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
  c.fillStyle = "rgba(255,129,102,.075)";
  c.fillRect(state.camera.x - halfW, state.camera.y - halfH, DRAG_RULES.viewWidth, DRAG_RULES.dangerInset);
  c.fillRect(state.camera.x - halfW, state.camera.y + safeY, DRAG_RULES.viewWidth, DRAG_RULES.dangerInset);
  c.fillRect(state.camera.x - halfW, state.camera.y - safeY, DRAG_RULES.dangerInset, safeY * 2);
  c.fillRect(state.camera.x + safeX, state.camera.y - safeY, DRAG_RULES.dangerInset, safeY * 2);
  roundedRect(c, state.camera.x - halfW + 6, state.camera.y - halfH + 6, DRAG_RULES.viewWidth - 12, DRAG_RULES.viewHeight - 12, 26);
  c.strokeStyle = "rgba(57,74,78,.38)";
  c.lineWidth = 3;
  c.stroke();
  roundedRect(c, state.camera.x - safeX, state.camera.y - safeY, safeX * 2, safeY * 2, 18);
  c.strokeStyle = "rgba(255,105,91,.62)";
  c.lineWidth = 2.5;
  c.setLineDash([11, 9]);
  c.stroke();
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
  const xOrder = [0, -.55, .55];
  const yOrder = [0, -1, 1];
  for (const yStep of yOrder) {
    for (const xStep of xOrder) {
      const candidate = {
        x: clamp(actor.x + xStep * width, bounds.left + width / 2 + 10, bounds.right - width / 2 - 10),
        y: clamp(preferredY + yStep * (height + 6), bounds.top + height / 2 + 8, bounds.bottom - height / 2 - 8),
        width,
        height,
      };
      if (occupied.every((placed) => !overlaps(candidate, placed))) {
        occupied.push(candidate);
        return candidate;
      }
    }
  }
  // Identity must remain attached to its body. Exact ten-player pileups may
  // overlap labels rather than routing a name to an unrelated part of screen.
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
    const worried = actor.warningActive || visible.some((other) => other.id !== actor.id
      && blobRadius(other.size) / blobRadius(actor.size) >= DRAG_RULES.predationRadiusRatio
      && other.size - actor.size >= DRAG_RULES.predationSizeAdvantage
      && Math.hypot(other.x - actor.x, other.y - actor.y) < 220);
    drawBlob(c, actor, state.liveTime + state.phaseTime, state.reducedMotion, worried);
    const radius = blobRadius(actor.size);
    if (actor.protection > 0) {
      c.save();
      c.beginPath();
      c.arc(actor.x, actor.y, radius + 12, 0, Math.PI * 2);
      c.setLineDash([9, 7]);
      c.lineCap = "round";
      c.strokeStyle = blendHex(actor.color, "#16313b", .64);
      c.globalAlpha = .78;
      c.lineWidth = 8;
      c.stroke();
      c.strokeStyle = "#fff6df";
      c.globalAlpha = .96;
      c.lineWidth = 3;
      c.stroke();
      c.restore();
    }
    if (actor.warningActive) {
      const remaining = Math.max(0, DRAG_RULES.warningSeconds - actor.warning);
      c.beginPath();
      c.arc(actor.x, actor.y, radius + 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remaining / DRAG_RULES.warningSeconds));
      c.strokeStyle = "#ff5b50";
      c.lineWidth = 7;
      c.stroke();
    }
  }

  // Warning text claims space first; names route around it, preserving the
  // life-critical countdown at a ten-player pile-up.
  c.font = "1000 28px system-ui";
  for (const actor of visible.filter((candidate) => candidate.warningActive)) {
    const remaining = Math.max(0, DRAG_RULES.warningSeconds - actor.warning);
    const label = `INSIDE ${Math.max(1, Math.ceil(remaining))}`;
    const width = c.measureText(label).width + 14;
    const placement = placeCallout(actor, width, 36, actor.y + blobRadius(actor.size) + 28, bounds, occupied);
    warnings.set(actor.id, { label, placement });
  }

  c.font = "900 22px system-ui";
  for (const actor of visible) {
    const radius = blobRadius(actor.size);
    const label = actor.name.toUpperCase();
    const width = Math.min(180, Math.max(64, c.measureText(label).width + 18));
    const preferredY = actor.warningActive ? actor.y - radius - 24 : actor.y + radius + 24;
    names.set(actor.id, { label, placement: placeCallout(actor, width, 34, preferredY, bounds, occupied) });
  }

  for (const actor of visible) {
    const callout = names.get(actor.id)!;
    const { placement } = callout;
    roundedRect(c, placement.x - placement.width / 2, placement.y - placement.height / 2, placement.width, placement.height, 9);
    c.fillStyle = "rgba(255,250,240,.82)";
    c.fill();
    c.fillStyle = "#0a2545";
    c.font = "900 22px system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(callout.label, placement.x, placement.y, placement.width - 12);
  }

  // Draw warnings last so a countdown wins any unavoidable visual conflict.
  for (const actor of visible) {
    const warning = warnings.get(actor.id);
    if (!warning) continue;
    const { placement } = warning;
    roundedRect(c, placement.x - placement.width / 2, placement.y - placement.height / 2, placement.width, placement.height, 9);
    c.fillStyle = "rgba(255,246,229,.94)"; c.fill();
    c.strokeStyle = "#ff5b50"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#9f241d"; c.font = "1000 28px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(warning.label, placement.x, placement.y, placement.width - 12);
  }
}

function drawHud(c: CanvasRenderingContext2D, state: DragState) {
  c.fillStyle = "#fffaf0";
  c.fillRect(0, 0, DRAG_RULES.viewWidth, HUD_HEIGHT);
  c.strokeStyle = "rgba(68,78,76,.2)";
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, HUD_HEIGHT - 1); c.lineTo(DRAG_RULES.viewWidth, HUD_HEIGHT - 1); c.stroke();
  c.fillStyle = "#09284b";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = "1000 43px 'Arial Rounded MT Bold', system-ui";
  c.fillText("DRAG", 32, 37);
  const titleTicks = [
    { color: "#ffb800", x1: 17, y1: 19, x2: 24, y2: 24 },
    { color: "#ff3f7f", x1: 13, y1: 36, x2: 23, y2: 36 },
    { color: "#168ff0", x1: 17, y1: 53, x2: 24, y2: 48 },
    { color: "#38b64a", x1: 161, y1: 22, x2: 169, y2: 16 },
    { color: "#ff681f", x1: 164, y1: 37, x2: 174, y2: 37 },
    { color: "#9b55df", x1: 161, y1: 51, x2: 169, y2: 57 },
  ];
  c.lineWidth = 5;
  c.lineCap = "round";
  for (const tick of titleTicks) {
    c.beginPath();
    c.moveTo(tick.x1, tick.y1);
    c.lineTo(tick.x2, tick.y2);
    c.strokeStyle = tick.color;
    c.stroke();
  }
  const remaining = state.phase === "live" ? DRAG_RULES.round - state.liveTime : DRAG_RULES.round;
  c.font = "900 36px 'Arial Rounded MT Bold', system-ui";
  c.fillText(`${Math.ceil(remaining)}s`, 250, 38);

  const leaders = [...state.actors].filter((actor) => !actor.spectator).sort((a, b) => b.score - a.score || a.seat - b.seat).slice(0, 3);
  leaders.forEach((actor, index) => {
    const x = 760 + index * 192;
    const y = 14;
    c.save();
    c.shadowColor = "rgba(83,62,37,.1)";
    c.shadowBlur = 10;
    c.shadowOffsetY = 3;
    c.fillStyle = "#f3ecdf";
    roundedRect(c, x, y, 180, 44, 16); c.fill();
    c.restore();
    c.beginPath();
    c.arc(x + 23, y + 22, 16, 0, Math.PI * 2);
    c.fillStyle = actor.color;
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = blendHex(actor.color, "#071d3c", .62);
    c.stroke();
    c.fillStyle = "#fffdf7";
    c.font = "1000 16px system-ui";
    c.textAlign = "center";
    c.fillText(String(index + 1), x + 23, y + 22);
    c.fillStyle = "#0a2545";
    c.font = "900 19px 'Arial Rounded MT Bold', system-ui";
    c.textAlign = "left";
    c.fillText(actor.name.toUpperCase(), x + 47, y + 22, 78);
    c.textAlign = "right";
    c.fillText(String(Math.round(actor.score)), x + 168, y + 22);
  });
}

function drawOverlay(c: CanvasRenderingContext2D, state: DragState) {
  const cx = state.camera.x;
  const cy = state.camera.y;
  let title = "";
  let subtitle = "";
  if (state.phase === "practice") {
    title = "PRACTICE — HARMLESS";
    subtitle = state.phaseTime < 2.4 ? "FIND YOUR NAME · STEER + LUNGE" : "BIG BLOBS PULL THE SCREEN · EAT SMALLER BLOBS";
  } else if (state.phase === "countdown") {
    title = String(Math.max(1, Math.ceil(DRAG_RULES.runway - DRAG_RULES.practice - state.phaseTime)));
    subtitle = "RESET COMPLETE · HANDS READY";
  } else if (state.goFlash > 0) {
    title = "GO!";
    subtitle = "EAT INK · HUNT SMALLER · STAY INSIDE";
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
    const y = cy + DRAG_RULES.viewHeight / 2 - 48;
    roundedRect(c, cx - 300, y - 31, 600, 62, 16);
    c.fillStyle = "rgba(255,250,240,.91)"; c.fill();
    c.fillStyle = "#0a2545"; c.font = "1000 23px 'Arial Rounded MT Bold', system-ui"; c.fillText(title, cx, y - 11);
    c.font = "850 15px system-ui"; c.fillStyle = "#24515b"; c.fillText(subtitle, cx, y + 15, 560);
    return;
  }
  c.font = state.phase === "countdown" ? "1000 126px 'Arial Rounded MT Bold', system-ui" : "1000 56px 'Arial Rounded MT Bold', system-ui";
  const titleWidth = Math.min(840, c.measureText(title).width + 80);
  roundedRect(c, cx - titleWidth / 2, cy - 80, titleWidth, state.phase === "countdown" ? 148 : 112, 18);
  c.fillStyle = "rgba(255,250,240,.94)"; c.fill();
  c.fillStyle = state.phase === "countdown" ? "#ff5b50" : "#0a2545"; c.fillText(title, cx, cy - 29);
  c.font = "900 19px system-ui"; c.fillStyle = "#24515b"; c.fillText(subtitle, cx, cy + 44);
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
