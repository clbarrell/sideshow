import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import { JoustSound, type JoustAudioFrame } from "./sound";

export const JOUST_RULES = {
  worldWidth: 1600,
  worldHeight: 900,
  radius: 32,
  runway: 9,
  round: 75,
  resultHold: 3.6,
  respawn: 1.5,
  shield: 0.9,
  ownerClaim: 0.8,
  rivalClaim: 2.1,
  levelGap: 22,
} as const;

export interface JoustInput {
  x: number;
  flap?: number;
}

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  upper: boolean;
}

export interface JoustBird {
  id: string;
  name: string;
  seat: number;
  color: string;
  connected: boolean;
  alive: boolean;
  perched: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  inputX: number;
  flapSequence: number;
  flapCooldown: number;
  respawn: number;
  shield: number;
  hitLock: number;
  score: number;
  reclaims: number;
  knockouts: number;
  deaths: number;
  flapPulse: number;
}

export interface JoustEgg {
  id: number;
  ownerId: string;
  ownerSeat: number;
  ownerName: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  landPulse: number;
}

export interface JoustEvent {
  kind: "flap" | "bump" | "crack" | "reclaim" | "steal" | "respawn" | "crumble";
  playerId?: string;
  otherId?: string;
  x?: number;
  y?: number;
  text?: string;
}

export interface JoustState {
  phase: "runway" | "live" | "results" | "over";
  runway: number;
  remaining: number;
  resultTime: number;
  liveElapsed: number;
  birds: JoustBird[];
  eggs: JoustEgg[];
  platforms: Platform[];
  nextEggId: number;
  crumbleOffset: number;
  events: JoustEvent[];
}

const PLATFORMS: Platform[] = [
  { x: 80, y: 790, w: 1440, h: 28, upper: false },
  { x: 110, y: 590, w: 360, h: 22, upper: true },
  { x: 620, y: 660, w: 360, h: 22, upper: true },
  { x: 1130, y: 570, w: 360, h: 22, upper: true },
  { x: 340, y: 370, w: 390, h: 22, upper: true },
  { x: 890, y: 330, w: 390, h: 22, upper: true },
];

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function hash(seed: number) {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function wrappedDx(from: number, to: number) {
  let dx = to - from;
  if (Math.abs(dx) > JOUST_RULES.worldWidth / 2) dx -= Math.sign(dx) * JOUST_RULES.worldWidth;
  return dx;
}

function spawnPosition(seat: number) {
  const left = seat % 2 === 0;
  return { x: left ? 118 : 1482, y: 700 - (seat % 3) * 70, vx: left ? 110 : -110 };
}

function makeBird(player: Player): JoustBird {
  const col = player.seat % 5;
  const row = Math.floor(player.seat / 5);
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    color: player.color,
    connected: player.connected,
    alive: player.connected,
    perched: !player.connected,
    x: 230 + col * 285 + row * 55,
    y: row === 0 ? 700 : 500,
    vx: 0,
    vy: 0,
    inputX: 0,
    flapSequence: -1,
    flapCooldown: 0,
    respawn: 0,
    shield: 1.1,
    hitLock: 0,
    score: 0,
    reclaims: 0,
    knockouts: 0,
    deaths: 0,
    flapPulse: 0,
  };
}

export function createJoustState(players: Player[], seed = 1): JoustState {
  return {
    phase: "runway",
    runway: JOUST_RULES.runway,
    remaining: JOUST_RULES.round,
    resultTime: 0,
    liveElapsed: 0,
    birds: [...players].sort((a, b) => a.seat - b.seat).map(makeBird),
    eggs: [],
    platforms: PLATFORMS.map((platform) => ({ ...platform })),
    nextEggId: 1,
    crumbleOffset: hash(seed) % 5,
    events: [],
  };
}

export function platformPhase(state: JoustState, index: number) {
  if (index === 0 || state.liveElapsed < 30) return "stable" as const;
  const upperIndex = index - 1;
  const cycle = 7.4;
  const elapsed = state.liveElapsed - 30;
  const turn = Math.floor(elapsed / cycle);
  const active = (turn + state.crumbleOffset) % 5;
  if (upperIndex !== active) return "stable" as const;
  const within = elapsed % cycle;
  if (within < 2) return "warning" as const;
  if (within < 6) return "down" as const;
  if (within < 7) return "rebuild" as const;
  return "stable" as const;
}

function activePlatform(state: JoustState, index: number) {
  return platformPhase(state, index) !== "down";
}

function respawnBird(bird: JoustBird, events: JoustEvent[]) {
  const spawn = spawnPosition(bird.seat);
  Object.assign(bird, {
    alive: true,
    perched: false,
    respawn: 0,
    shield: JOUST_RULES.shield,
    x: spawn.x,
    y: spawn.y,
    vx: spawn.vx,
    vy: -90,
    inputX: 0,
    hitLock: 0.18,
  });
  events.push({ kind: "respawn", playerId: bird.id, x: bird.x, y: bird.y });
}

function dropEgg(state: JoustState, loser: JoustBird) {
  if (state.eggs.some((egg) => egg.ownerId === loser.id)) return;
  const centre = Math.sign(JOUST_RULES.worldWidth / 2 - loser.x) || 1;
  state.eggs.push({
    id: state.nextEggId++,
    ownerId: loser.id,
    ownerSeat: loser.seat,
    ownerName: loser.name,
    color: loser.color,
    x: loser.x,
    y: loser.y,
    vx: centre * 260,
    vy: -150,
    age: 0,
    landPulse: 0,
  });
}

function knockOut(state: JoustState, loser: JoustBird, winner?: JoustBird) {
  if (!loser.alive || loser.shield > 0) return;
  dropEgg(state, loser);
  loser.alive = false;
  loser.perched = false;
  loser.respawn = JOUST_RULES.respawn;
  loser.deaths += 1;
  loser.vx = winner ? Math.sign(wrappedDx(winner.x, loser.x) || 1) * 430 : loser.vx;
  loser.vy = -180;
  loser.inputX = 0;
  if (winner) {
    winner.knockouts += 1;
    winner.vy = Math.min(winner.vy, -170);
    winner.hitLock = 0.32;
  }
  state.events.push({
    kind: "crack",
    playerId: winner?.id,
    otherId: loser.id,
    x: loser.x,
    y: loser.y,
    text: winner ? `${winner.name.toUpperCase()} CRACKS ${loser.name.toUpperCase()}!` : `${loser.name.toUpperCase()} DROPS AN EGG!`,
  });
}

function settle(body: { x: number; y: number; vy: number }, previousY: number, radius: number, state: JoustState) {
  if (body.vy < 0) return false;
  for (let i = 0; i < state.platforms.length; i += 1) {
    if (!activePlatform(state, i)) continue;
    const platform = state.platforms[i];
    if (body.x < platform.x - radius * 0.35 || body.x > platform.x + platform.w + radius * 0.35) continue;
    if (previousY + radius <= platform.y + 4 && body.y + radius >= platform.y) {
      body.y = platform.y - radius;
      body.vy = 0;
      return true;
    }
  }
  return false;
}

function pushEvent(state: JoustState, event: JoustEvent) {
  state.events.push(event);
}

export function applyJoustInput(state: JoustState, playerId: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const frame = input as Partial<JoustInput>;
  if (typeof frame.x !== "number" || !Number.isFinite(frame.x)) return;
  if (frame.flap !== undefined && (!Number.isSafeInteger(frame.flap) || frame.flap < 0)) return;
  const bird = state.birds.find((candidate) => candidate.id === playerId);
  if (!bird || !bird.connected) return;
  bird.inputX = clamp(frame.x, -1, 1);
  if (frame.flap === undefined || frame.flap === bird.flapSequence) return;
  bird.flapSequence = frame.flap;
  if (state.phase !== "live" || !bird.alive || bird.flapCooldown > 0) return;
  bird.vy = -350;
  bird.flapCooldown = 0.12;
  bird.flapPulse = 0.18;
  pushEvent(state, { kind: "flap", playerId: bird.id, x: bird.x, y: bird.y });
}

function stepBirds(state: JoustState, dt: number) {
  for (const bird of state.birds) {
    bird.flapCooldown = Math.max(0, bird.flapCooldown - dt);
    bird.flapPulse = Math.max(0, bird.flapPulse - dt);
    bird.hitLock = Math.max(0, bird.hitLock - dt);
    bird.shield = Math.max(0, bird.shield - dt);
    if (!bird.connected || bird.perched) continue;
    if (!bird.alive) {
      bird.respawn -= dt;
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
      bird.vy += 420 * dt;
      if (bird.respawn <= 0) respawnBird(bird, state.events);
      continue;
    }
    const previousY = bird.y;
    bird.vx += bird.inputX * 520 * dt;
    bird.vx *= Math.pow(0.08, dt);
    bird.vx = clamp(bird.vx, -255, 255);
    bird.vy += 690 * dt;
    bird.x += bird.vx * dt;
    bird.y += bird.vy * dt;
    if (bird.x < -JOUST_RULES.radius) bird.x += JOUST_RULES.worldWidth + JOUST_RULES.radius * 2;
    if (bird.x > JOUST_RULES.worldWidth + JOUST_RULES.radius) bird.x -= JOUST_RULES.worldWidth + JOUST_RULES.radius * 2;
    settle(bird, previousY, JOUST_RULES.radius, state);
    if (bird.y > JOUST_RULES.worldHeight + 70) knockOut(state, bird);
  }
}

function resolveCollisions(state: JoustState) {
  const birds = state.birds;
  for (let i = 0; i < birds.length; i += 1) {
    const a = birds[i];
    if (!a.connected || !a.alive || a.shield > 0 || a.hitLock > 0) continue;
    for (let j = i + 1; j < birds.length; j += 1) {
      const b = birds[j];
      if (!b.connected || !b.alive || b.shield > 0 || b.hitLock > 0) continue;
      const dx = wrappedDx(a.x, b.x);
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= JOUST_RULES.radius * 1.75) continue;
      if (Math.abs(dy) >= JOUST_RULES.levelGap) {
        knockOut(state, dy > 0 ? b : a, dy > 0 ? a : b);
        if (!a.alive) break;
      } else {
        const direction = Math.sign(dx || 1);
        a.vx = -direction * 190;
        b.vx = direction * 190;
        a.vy = Math.min(a.vy, -115);
        b.vy = Math.min(b.vy, -115);
        a.hitLock = 0.25;
        b.hitLock = 0.25;
        pushEvent(state, {
          kind: "bump",
          playerId: a.id,
          otherId: b.id,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          text: "LEVEL! SAFE BOUNCE",
        });
      }
    }
  }
}

function stepEggs(state: JoustState, dt: number) {
  for (const egg of state.eggs) {
    const previousY = egg.y;
    egg.age += dt;
    egg.landPulse = Math.max(0, egg.landPulse - dt);
    egg.vy += 580 * dt;
    egg.vx *= Math.pow(0.3, dt);
    egg.x += egg.vx * dt;
    egg.y += egg.vy * dt;
    if (egg.x < -24) egg.x += JOUST_RULES.worldWidth + 48;
    if (egg.x > JOUST_RULES.worldWidth + 24) egg.x -= JOUST_RULES.worldWidth + 48;
    if (settle(egg, previousY, 25, state)) egg.landPulse = Math.max(egg.landPulse, 0.12);
    if (egg.y > JOUST_RULES.worldHeight + 80) {
      egg.x = 230 + ((egg.ownerSeat * 173) % 1140);
      egg.y = 80;
      egg.vx = 0;
      egg.vy = 0;
    }
  }

  for (const bird of state.birds) {
    if (!bird.connected || !bird.alive) continue;
    const egg = state.eggs.find((candidate) => {
      const claimAt = candidate.ownerId === bird.id ? JOUST_RULES.ownerClaim : JOUST_RULES.rivalClaim;
      return candidate.age >= claimAt && Math.hypot(wrappedDx(bird.x, candidate.x), candidate.y - bird.y) < 62;
    });
    if (!egg) continue;
    if (egg.ownerId === bird.id) {
      bird.reclaims += 1;
      pushEvent(state, { kind: "reclaim", playerId: bird.id, x: egg.x, y: egg.y, text: `${bird.name.toUpperCase()} RECLAIMS — NO POINT` });
    } else {
      bird.score += 1;
      pushEvent(state, {
        kind: "steal",
        playerId: bird.id,
        otherId: egg.ownerId,
        x: egg.x,
        y: egg.y,
        text: `${bird.name.toUpperCase()} +1 · STOLE #${egg.ownerSeat + 1}!`,
      });
    }
    state.eggs = state.eggs.filter((candidate) => candidate !== egg);
  }
}

export function stepJoustState(state: JoustState, dt: number) {
  let remaining = clamp(dt, 0, 0.25);
  state.events = [];
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    remaining -= step;
    if (state.phase === "runway") {
      state.runway -= step;
      if (state.runway <= 0) {
        state.runway = 0;
        state.phase = "live";
      }
      continue;
    }
    if (state.phase === "live") {
      state.remaining = Math.max(0, state.remaining - step);
      state.liveElapsed += step;
      stepBirds(state, step);
      resolveCollisions(state);
      stepEggs(state, step);
      if (state.remaining <= 0 || state.birds.length === 0) state.phase = "results";
      continue;
    }
    if (state.phase === "results") {
      state.resultTime += step;
      if (state.resultTime >= JOUST_RULES.resultHold) state.phase = "over";
    }
  }
}

export function setJoustConnection(state: JoustState, id: string, connected: boolean) {
  const bird = state.birds.find((candidate) => candidate.id === id);
  if (!bird || bird.connected === connected) return;
  bird.connected = connected;
  bird.inputX = 0;
  if (!connected) {
    bird.alive = false;
    bird.perched = true;
    bird.respawn = Number.POSITIVE_INFINITY;
    bird.shield = 0;
    bird.vx = 0;
    bird.vy = 0;
    bird.x = bird.seat % 2 === 0 ? 58 : 1542;
    bird.y = 742 - (bird.seat % 3) * 68;
  } else {
    respawnBird(bird, state.events);
  }
}

export function joustResults(state: JoustState): RoundResult[] {
  const sorted = [...state.birds].sort((a, b) => b.score - a.score || a.seat - b.seat);
  let place = 0;
  let previous: number | null = null;
  return sorted.map((bird, index) => {
    if (bird.score !== previous) {
      place = index + 1;
      previous = bird.score;
    }
    return {
      id: bird.id,
      place,
      score: bird.score,
      detail: `${bird.score} stolen · ${bird.reclaims} denied`,
    };
  });
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface Callout { text: string; color: string; life: number; }

export function createHost(ctx: HostContext): GameHost {
  const state = createJoustState(ctx.players, ctx.seed);
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sound = typeof AudioContext === "undefined" ? null : new JoustSound("host");
  const particles: Particle[] = [];
  const callouts: Callout[] = [];
  let shake = 0;
  let destroyed = false;
  let priorCrumble = "";

  const notify = (event: JoustEvent) => {
    if (event.kind === "flap") sound?.flap();
    if (event.kind === "bump") {
      sound?.bump();
      const frame: JoustAudioFrame = { t: "joustAudio", bump: true };
      if (event.playerId) ctx.send(frame, event.playerId);
      if (event.otherId) ctx.send(frame, event.otherId);
    }
    if (event.kind === "crack") {
      sound?.crack();
      if (event.playerId) ctx.send({ t: "joustAudio", crack: true } satisfies JoustAudioFrame, event.playerId);
      if (event.otherId) ctx.send({ t: "joustAudio", crack: true } satisfies JoustAudioFrame, event.otherId);
      shake = reducedMotion ? 0 : Math.min(1, shake + 0.7);
    }
    if (event.kind === "reclaim" || event.kind === "steal") {
      sound?.egg(event.kind);
      if (event.playerId) ctx.send({ t: "joustAudio", egg: event.kind } satisfies JoustAudioFrame, event.playerId);
    }
    if (event.kind === "respawn") {
      sound?.flap();
      if (event.playerId) ctx.send({ t: "joustAudio", respawn: true } satisfies JoustAudioFrame, event.playerId);
    }
    if (event.text) callouts.unshift({ text: event.text, color: event.kind === "steal" ? "#FFC24A" : "#F6EFE2", life: 1.25 });
    if (event.x !== undefined && event.y !== undefined && event.kind !== "flap" && particles.length < 110) {
      const count = event.kind === "crack" ? 16 : 9;
      for (let i = 0; i < count && particles.length < 120; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = event.kind === "crack" ? 230 : 140;
        particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45, color: "#F6EFE2" });
      }
    }
  };

  return {
    onJoin(player) {
      if (state.birds.some((bird) => bird.id === player.id)) return;
      const bird = makeBird(player);
      if (state.phase !== "runway") respawnBird(bird, state.events);
      state.birds.push(bird);
      state.birds.sort((a, b) => a.seat - b.seat);
    },

    onLeave(id) {
      state.birds = state.birds.filter((bird) => bird.id !== id);
      state.eggs = state.eggs.filter((egg) => egg.ownerId !== id);
    },

    onConnectionChange(id, connected) {
      setJoustConnection(state, id, connected);
    },

    onInput(id, data) {
      applyJoustInput(state, id, data);
    },

    tick(dt) {
      if (destroyed) return;
      const maxStep = Math.min(Math.max(dt, 0), 0.25);
      let left = maxStep;
      while (left > 0) {
        const slice = Math.min(left, 1 / 30);
        left -= slice;
        const priorPhase = state.phase;
        stepJoustState(state, slice);
        for (const event of state.events) notify(event);
        if (priorPhase !== state.phase && (state.phase === "live" || state.phase === "results")) sound?.round();
      }
      const crumble = state.platforms.map((_platform, index) => platformPhase(state, index)).join(":");
      if (crumble !== priorCrumble && crumble.includes("warning")) sound?.bump();
      priorCrumble = crumble;
      shake = Math.max(0, shake - maxStep * 3);
      for (const callout of callouts) callout.life -= maxStep;
      while (callouts.length > 3) callouts.pop();
      for (let i = callouts.length - 1; i >= 0; i -= 1) if (callouts[i].life <= 0) callouts.splice(i, 1);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.life -= maxStep;
        if (particle.life <= 0) particles.splice(i, 1);
        else {
          particle.x += particle.vx * maxStep;
          particle.y += particle.vy * maxStep;
          particle.vy += 260 * maxStep;
        }
      }
    },

    resize() { /* fixed logical camera scales during render */ },

    render(g, width, height) {
      renderJoust(g, width, height, state, particles, callouts, shake, reducedMotion);
    },

    isOver() { return state.phase === "over"; },
    results() { return joustResults(state); },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      sound?.destroy();
      particles.length = 0;
      callouts.length = 0;
    },
  };
}

function renderJoust(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: JoustState,
  particles: Particle[],
  callouts: Callout[],
  shake: number,
  reducedMotion: boolean,
) {
  const scale = Math.min(width / JOUST_RULES.worldWidth, height / JOUST_RULES.worldHeight);
  const ox = (width - JOUST_RULES.worldWidth * scale) / 2;
  const oy = (height - JOUST_RULES.worldHeight * scale) / 2;
  g.save();
  g.fillStyle = "#0B2028";
  g.fillRect(0, 0, width, height);
  g.translate(ox, oy);
  g.scale(scale, scale);
  if (!reducedMotion && shake > 0) g.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 8 * shake);

  drawArena(g);
  state.platforms.forEach((platform, index) => drawPlatform(g, platform, platformPhase(state, index)));
  for (const egg of state.eggs) drawEgg(g, egg);
  for (let i = 0; i < state.birds.length; i += 1) {
    const runwayIndex = Math.floor((JOUST_RULES.runway - state.runway) * 2) % Math.max(1, state.birds.length);
    drawBird(g, state.birds[i], state.phase === "runway" && state.runway > 6 && i === runwayIndex);
  }
  for (const particle of particles) {
    g.globalAlpha = clamp(particle.life / 0.45, 0, 1);
    g.fillStyle = particle.color;
    g.beginPath();
    g.ellipse(particle.x, particle.y, 6, 13, Math.atan2(particle.vy, particle.vx), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  drawHud(g, state);
  drawOverlay(g, state, callouts);
  g.restore();
}

function drawArena(g: CanvasRenderingContext2D) {
  g.fillStyle = "#12323A";
  g.fillRect(0, 0, 1600, 900);
  g.fillStyle = "#173B42";
  g.beginPath();
  g.moveTo(0, 510);
  for (let x = 0; x <= 1600; x += 120) g.lineTo(x, 470 + ((x / 120) % 3) * 24);
  g.lineTo(1600, 900);
  g.lineTo(0, 900);
  g.fill();
  g.strokeStyle = "rgba(246,239,226,.18)";
  g.lineWidth = 5;
  g.setLineDash([16, 14]);
  g.beginPath();
  g.moveTo(18, 120);
  g.lineTo(18, 790);
  g.moveTo(1582, 120);
  g.lineTo(1582, 790);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "rgba(246,239,226,.56)";
  g.font = "800 22px Archivo, system-ui, sans-serif";
  g.fillText("WRAP", 28, 755);
  g.textAlign = "right";
  g.fillText("WRAP", 1572, 755);
  g.textAlign = "left";
}

function drawPlatform(g: CanvasRenderingContext2D, platform: Platform, phase: ReturnType<typeof platformPhase>) {
  if (phase === "down") return;
  g.save();
  if (phase === "rebuild") g.globalAlpha = 0.48;
  g.fillStyle = "#F6EFE2";
  g.fillRect(platform.x, platform.y, platform.w, platform.h);
  g.fillStyle = "#9B6848";
  g.fillRect(platform.x + 8, platform.y + platform.h, platform.w - 16, 9);
  if (phase === "warning") {
    g.strokeStyle = "#FF5A47";
    g.lineWidth = 8;
    g.setLineDash([18, 10]);
    g.strokeRect(platform.x - 5, platform.y - 5, platform.w + 10, platform.h + 10);
    g.setLineDash([]);
    g.fillStyle = "#FF5A47";
    g.font = "900 20px Archivo, system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("CRUMBLING!", platform.x + platform.w / 2, platform.y - 15);
  }
  g.restore();
}

function identityScale(seat: number) {
  return [1.1, 1.16, 1.14, 0.92, 0.9, 1.22, 0.84, 0.94, 1.02, 1.12][seat] ?? 1;
}

function drawBird(g: CanvasRenderingContext2D, bird: JoustBird, highlighted = false) {
  g.save();
  g.translate(bird.x, bird.y);
  if (highlighted) {
    g.strokeStyle = "#FFC24A";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(0, 0, 55, 0, Math.PI * 2);
    g.stroke();
    g.scale(1.08, 1.08);
  }
  if (!bird.connected) g.globalAlpha = 0.52;
  const scale = identityScale(bird.seat);
  const wing = bird.flapPulse > 0 ? -0.7 : Math.sin((bird.x + bird.y) * 0.03) * 0.12;
  g.rotate(clamp(bird.vx / 900, -0.18, 0.18));

  if (bird.shield > 0) {
    g.strokeStyle = "#F6EFE2";
    g.lineWidth = 5;
    g.setLineDash([12, 9]);
    g.beginPath();
    g.arc(0, 0, 48 * scale, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  g.fillStyle = bird.color;
  g.strokeStyle = "#0E2226";
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(0, 4, 35 * scale, 29 / scale + 8, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  g.save();
  g.clip();
  g.strokeStyle = "rgba(14,34,38,.72)";
  g.fillStyle = "rgba(246,239,226,.55)";
  g.lineWidth = 7;
  drawMotif(g, bird.seat, 0, 5, 33);
  g.restore();

  g.save();
  g.rotate(wing);
  g.fillStyle = "#F6EFE2";
  g.strokeStyle = "#0E2226";
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(-37 * scale, 2, 21, 10, -0.35, 0, Math.PI * 2);
  g.ellipse(37 * scale, 2, 21, 10, 0.35, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();

  drawHeadgear(g, bird.seat, bird.color, scale);
  g.fillStyle = "#FFC24A";
  g.strokeStyle = "#0E2226";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(30 * scale, -5);
  g.lineTo(49 * scale, 2);
  g.lineTo(30 * scale, 9);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = "#0E2226";
  g.beginPath();
  g.arc(19 * scale, -10, 4.5, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = "#F6EFE2";
  g.strokeStyle = "#0E2226";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(-4, -9, 14, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = "#0E2226";
  g.font = "900 18px Archivo, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(bird.seat + 1), -4, -8);
  g.restore();

  g.save();
  g.font = "850 20px Archivo, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "bottom";
  const label = `${bird.seat + 1} · ${bird.name}`;
  const labelWidth = Math.min(190, g.measureText(label).width + 22);
  g.fillStyle = "rgba(14,34,38,.88)";
  g.fillRect(bird.x - labelWidth / 2, bird.y - 73, labelWidth, 27);
  g.fillStyle = "#F6EFE2";
  g.fillText(label, bird.x, bird.y - 49);
  if (!bird.connected) {
    g.font = "900 14px Archivo, system-ui, sans-serif";
    g.fillStyle = "#FFC24A";
    g.fillText("AWAY", bird.x, bird.y - 78);
  }
  g.restore();
}

function drawHeadgear(g: CanvasRenderingContext2D, seat: number, color: string, scale: number) {
  g.fillStyle = seat === 8 ? "#F6EFE2" : color;
  g.strokeStyle = "#0E2226";
  g.lineWidth = 5;
  g.beginPath();
  if (seat === 0 || seat === 9) {
    g.arc(-4, -26, 26 * scale, Math.PI, 0);
    g.lineTo(23, -12);
    g.lineTo(-30, -12);
  } else if (seat === 1) {
    g.moveTo(-22, -28); g.lineTo(-14, -50); g.lineTo(-2, -33); g.lineTo(9, -54); g.lineTo(18, -28);
  } else if (seat === 2) {
    g.moveTo(-38, -25); g.lineTo(12, -42); g.lineTo(39, -24); g.closePath();
  } else if (seat === 3 || seat === 4 || seat === 7) {
    const spikes = seat === 7 ? 5 : 3;
    g.moveTo(-23, -20);
    for (let i = 0; i < spikes; i += 1) g.lineTo(-18 + i * 13, -43 - (i % 2) * 12);
    g.lineTo(27, -18); g.closePath();
  } else if (seat === 5) {
    g.arc(-18, -28, 13, Math.PI * 0.1, Math.PI * 1.8);
    g.arc(10, -30, 13, Math.PI * 1.2, Math.PI * 0.9);
  } else if (seat === 6) {
    g.moveTo(-28, -20); g.lineTo(-5, -67); g.lineTo(18, -20); g.closePath();
  } else {
    g.moveTo(-33, -20); g.lineTo(-5, -57); g.lineTo(33, -20); g.closePath();
  }
  g.fill();
  g.stroke();
}

function drawMotif(g: CanvasRenderingContext2D, seat: number, x: number, y: number, radius: number) {
  g.save();
  g.translate(x, y);
  if (seat === 0) {
    for (let i = 0; i < 8; i += 1) { g.rotate(Math.PI / 4); g.fillRect(radius * 0.3, -4, radius * 0.55, 8); }
  } else if (seat === 1) {
    g.beginPath();
    for (let row = -radius; row <= radius; row += 14) { g.moveTo(-radius, row); g.quadraticCurveTo(-radius / 2, row - 9, 0, row); g.quadraticCurveTo(radius / 2, row + 9, radius, row); }
    g.stroke();
  } else if (seat === 2 || seat === 6) {
    const points = seat === 2 ? 5 : 4;
    for (let star = -1; star <= 1; star += 1) {
      g.beginPath();
      for (let i = 0; i < points * 2; i += 1) {
        const angle = -Math.PI / 2 + (Math.PI * i) / points;
        const r = i % 2 === 0 ? 9 : 4;
        g.lineTo(star * 18 + Math.cos(angle) * r, Math.sin(angle) * r);
      }
      g.closePath(); g.fill();
    }
  } else if (seat === 3) {
    for (let i = -1; i <= 1; i += 1) { g.beginPath(); g.ellipse(i * 15, i % 2 ? 10 : -5, 7, 15, i * 0.8, 0, Math.PI * 2); g.fill(); }
  } else if (seat === 4) {
    g.beginPath();
    g.moveTo(0, 12); g.bezierCurveTo(-30, -8, -12, -28, 0, -12); g.bezierCurveTo(12, -28, 30, -8, 0, 12); g.fill();
  } else if (seat === 5) {
    g.beginPath();
    for (let row = -radius; row <= radius; row += 15) { g.moveTo(-radius, row); g.lineTo(-radius / 2, row + 10); g.lineTo(0, row); g.lineTo(radius / 2, row + 10); g.lineTo(radius, row); }
    g.stroke();
  } else if (seat === 7) {
    for (let i = -1; i <= 1; i += 1) { g.beginPath(); g.moveTo(i * 18 - 8, 14); g.quadraticCurveTo(i * 18 + 12, -3, i * 18, -22); g.quadraticCurveTo(i * 18 - 17, -1, i * 18 - 8, 14); g.fill(); }
  } else if (seat === 8) {
    g.beginPath();
    for (let i = -2; i <= 2; i += 1) { g.moveTo(i * 15 - 7, -radius); g.lineTo(i * 15 + 7, -7); g.lineTo(i * 15 - 7, 7); g.lineTo(i * 15 + 7, radius); }
    g.stroke();
  } else {
    for (let row = -1; row <= 1; row += 1) for (let col = -1; col <= 1; col += 1) { g.beginPath(); g.arc(col * 17, row * 17, 6 + ((row + col + 2) % 2) * 3, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

function drawEgg(g: CanvasRenderingContext2D, egg: JoustEgg) {
  g.save();
  g.translate(egg.x, egg.y);
  const squash = egg.landPulse > 0 ? 1.12 : 1;
  g.scale(squash, 1 / squash);
  g.fillStyle = "#F6EFE2";
  g.strokeStyle = "#0E2226";
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(0, -38);
  g.bezierCurveTo(31, -30, 34, 37, 0, 39);
  g.bezierCurveTo(-34, 37, -31, -30, 0, -38);
  g.fill();
  g.stroke();
  g.save();
  g.clip();
  g.fillStyle = egg.color;
  g.strokeStyle = egg.color;
  drawMotif(g, egg.ownerSeat, 0, 0, 35);
  g.restore();
  g.fillStyle = "#0E2226";
  g.beginPath();
  g.arc(0, 2, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#F6EFE2";
  g.font = "900 20px Archivo, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(egg.ownerSeat + 1), 0, 3);
  if (egg.age < JOUST_RULES.rivalClaim) {
    g.strokeStyle = egg.age < JOUST_RULES.ownerClaim ? "#FF5A47" : "#FFC24A";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(egg.age / JOUST_RULES.rivalClaim, 0, 1));
    g.stroke();
    g.fillStyle = "#F6EFE2";
    g.font = "900 20px Archivo, system-ui, sans-serif";
    const label = egg.age < JOUST_RULES.ownerClaim ? "WAIT" : `#${egg.ownerSeat + 1} ONLY`;
    g.strokeStyle = "#0E2226"; g.lineWidth = 6; g.strokeText(label, 0, 62);
    g.fillText(label, 0, 62);
  } else {
    g.font = "900 22px Archivo, system-ui, sans-serif";
    g.fillStyle = "#FFC24A"; g.strokeStyle = "#0E2226"; g.lineWidth = 6;
    const label = egg.age < JOUST_RULES.rivalClaim + 0.8 ? "STEAL! +1" : "RIVAL +1";
    g.strokeText(label, 0, 62); g.fillText(label, 0, 62);
  }
  g.restore();
}

function drawHud(g: CanvasRenderingContext2D, state: JoustState) {
  const birds = [...state.birds].sort((a, b) => a.seat - b.seat);
  // Reserve the upper-right 365 logical pixels for the shell's persistent
  // Sound and Exit controls. Ten compact cards fit in the remaining rail.
  const slot = birds.length > 8 ? 122 : 145;
  const total = birds.length * slot;
  const start = birds.length > 8 ? 14 : (1600 - total) / 2;
  for (let i = 0; i < birds.length; i += 1) {
    const bird = birds[i];
    const x = start + i * slot;
    g.fillStyle = "rgba(14,34,38,.9)";
    g.fillRect(x + 3, 18, slot - 6, 58);
    g.fillStyle = bird.color;
    g.fillRect(x + 3, 18, 12, 58);
    g.fillStyle = "#F6EFE2";
    g.font = "900 20px Archivo, system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText(String(bird.seat + 1), x + 23, 42);
    g.font = `750 ${birds.length > 8 ? 18 : 16}px Archivo, system-ui, sans-serif`;
    const nameLimit = birds.length > 8 ? 6 : 9;
    const name = bird.name.length > nameLimit ? `${bird.name.slice(0, nameLimit - 1)}…` : bird.name;
    g.fillText(name, x + 47, 41);
    g.font = "900 21px Archivo, system-ui, sans-serif";
    g.fillText(`🥚 ${bird.score}`, x + 23, 67);
  }
  g.textAlign = "center";
  g.fillStyle = "#F6EFE2";
  g.font = "900 35px Archivo, system-ui, sans-serif";
  const time = state.phase === "runway" ? Math.ceil(state.runway) : Math.ceil(state.remaining);
  g.fillText(formatClock(time), 800, 116);
  g.font = "800 22px Archivo, system-ui, sans-serif";
  g.fillStyle = "rgba(246,239,226,.72)";
  g.fillText("ONLY STOLEN EGGS SCORE", 800, 139);
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function drawOverlay(g: CanvasRenderingContext2D, state: JoustState, callouts: Callout[]) {
  g.textAlign = "center";
  if (state.phase === "runway") {
    g.fillStyle = "rgba(14,34,38,.78)";
    g.fillRect(250, 215, 1100, 380);
    g.fillStyle = "#FFC24A";
    g.font = "900 30px Archivo, system-ui, sans-serif";
    g.fillText("FEATHERWEIGHT CHAMPIONSHIP", 800, 285);
    g.fillStyle = "#F6EFE2";
    const text = state.runway > 6 ? "FIND YOUR BIRD" : state.runway > 3 ? "BUMP FROM ABOVE → DROP AN EGG" : String(Math.max(1, Math.ceil(state.runway)));
    g.font = state.runway > 6 ? "900 48px Archivo, system-ui, sans-serif" : state.runway > 3 ? "900 38px Archivo, system-ui, sans-serif" : "900 118px Archivo, system-ui, sans-serif";
    g.fillText(text, 800, state.runway > 3 ? 365 : 395);
    if (state.runway > 3) {
      g.font = "750 26px Archivo, system-ui, sans-serif";
      g.fillText(state.runway > 6 ? "Match the number and pattern on your phone" : "TOUCH A RIVAL EGG → +1", 800, 425);
      g.font = "800 24px Archivo, system-ui, sans-serif";
      g.fillText("YOUR EGG = DENY · RIVAL EGG = +1", 800, 485);
      g.fillText("WAIT → OWNER ONLY → STEAL!", 800, 530);
    }
  } else if (state.phase === "live" && state.liveElapsed < 0.8) {
    g.fillStyle = "rgba(14,34,38,.66)";
    g.fillRect(560, 260, 480, 190);
    g.fillStyle = "#FFC24A";
    g.font = "900 124px Archivo, system-ui, sans-serif";
    g.fillText("GO!", 800, 405);
  } else if (state.phase === "results" || state.phase === "over") {
    const leaders = joustResults(state).filter((result) => result.place === 1).map((result) => state.birds.find((bird) => bird.id === result.id)?.name).filter(Boolean);
    g.fillStyle = "rgba(14,34,38,.84)";
    g.fillRect(300, 260, 1000, 245);
    const top = Math.max(0, ...state.birds.map((bird) => bird.score));
    const tied = leaders.length > 1;
    g.fillStyle = "#FFC24A";
    g.font = "900 34px Archivo, system-ui, sans-serif";
    g.fillText(top === 0 ? "BELT UNCLAIMED" : tied ? "DEAD HEAT" : "THE BELT GOES TO", 800, 322);
    g.fillStyle = "#F6EFE2";
    const resultPop = 1 + Math.sin(clamp(state.resultTime / 0.55, 0, 1) * Math.PI) * 0.08;
    g.save();
    g.translate(800, 410);
    g.scale(resultPop, resultPop);
    g.font = "900 70px Archivo, system-ui, sans-serif";
    const winnerLine = leaders.length > 3 ? `${leaders.length} BIRDS TIE!` : leaders.join(" + ").toUpperCase();
    g.fillText(winnerLine || "THE FLOCK", 0, 0);
    g.restore();
    g.font = "800 28px Archivo, system-ui, sans-serif";
    g.fillText(`${top} STOLEN EGG${top === 1 ? "" : "S"}`, 800, 463);
  }
  if (callouts[0] && state.phase === "live") {
    g.fillStyle = callouts[0].color;
    g.font = "900 35px Archivo, system-ui, sans-serif";
    g.fillText(callouts[0].text, 800, 185);
  }
}
