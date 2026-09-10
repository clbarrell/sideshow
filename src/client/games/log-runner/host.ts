import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import type { LogRunnerStatusFrame } from "./protocol";
import { LogRunnerSound, type LogRunnerAudioFrame, type LogRunnerCue } from "./sound";

export const LOG_RUNNER_RULES = {
  worldWidth: 1600,
  worldHeight: 900,
  runway: 9,
  round: 90,
  resultHold: 3.4,
  warning: 2.4,
  lateGrace: 0.15,
  openingMercy: 18,
  safeGap: 1.25,
  branchCooldown: 9,
  branchGlobalGap: 8,
} as const;

export type ObstacleKind = "low" | "high" | "fake";
export type RunnerRole = "runner" | "bank";

export interface PhraseStep {
  kind: ObstacleKind;
  offset: number;
  warning: number;
}

export interface LogRunnerPhrase {
  id: string;
  label: string;
  steps: PhraseStep[];
  rest: number;
}

export interface LogRunnerObstacle {
  id: number;
  kind: ObstacleKind;
  source: "course" | "bank";
  ownerId: string | null;
  spawnedAt: number;
  impactAt: number;
  resolved: boolean;
  phraseId: string;
  announced?: boolean;
}

export interface LogRunnerPlayer {
  id: string;
  name: string;
  seat: number;
  color: string;
  connected: boolean;
  role: RunnerRole;
  survival: number;
  eliminatedAt: number | null;
  answers: Map<number, "jump" | "duck">;
  pose: "run" | "jump" | "duck" | "stumble";
  poseTime: number;
  stumbleTime: number;
  jumpSequence: number;
  duckSequence: number;
  branchSequence: number;
  branchCooldown: number;
  splashPulse: number;
}

export type LogRunnerEvent =
  | { kind: "go" | "finish" }
  | { kind: "warning" | "fake"; obstacle: LogRunnerObstacle }
  | { kind: "jump" | "duck" | "throw" | "splash" | "rescue"; playerId: string }
  | { kind: "wipe"; count: number };

export interface LogRunnerState {
  phase: "runway" | "live" | "results" | "over";
  runway: number;
  remaining: number;
  elapsed: number;
  resultTime: number;
  goTime: number;
  rescueTime: number;
  rescuedPlayerId: string | null;
  runners: LogRunnerPlayer[];
  obstacles: LogRunnerObstacle[];
  events: LogRunnerEvent[];
  nextObstacleId: number;
  pendingBranches: string[];
  lastBankImpact: number;
  lastBankSeat: number;
  seed: number;
}

interface PhraseTemplate {
  id: string;
  label: string;
  steps: Array<[ObstacleKind, number]>;
  rest: number;
}

const PHRASES: PhraseTemplate[] = [
  { id: "root-call", label: "ROOT", steps: [["low", 0]], rest: 2.2 },
  { id: "bough-call", label: "BOUGH", steps: [["high", 0]], rest: 2.2 },
  { id: "root-root", label: "DOUBLE ROOT", steps: [["low", 0], ["low", 1.15]], rest: 2.1 },
  { id: "bough-bough", label: "DOUBLE BOUGH", steps: [["high", 0], ["high", 1.05]], rest: 2.1 },
  { id: "root-bough", label: "UP THEN DOWN", steps: [["low", 0], ["high", 1.25]], rest: 2.1 },
  { id: "bough-root", label: "DOWN THEN UP", steps: [["high", 0], ["low", 1.25]], rest: 2.1 },
  { id: "fake-root", label: "DON'T BITE", steps: [["fake", 0], ["low", 1.35]], rest: 2.0 },
  { id: "fake-bough", label: "HEAD FAKE", steps: [["fake", 0], ["high", 1.35]], rest: 2.0 },
  { id: "root-fake", label: "ONE REAL", steps: [["low", 0], ["fake", 1.2]], rest: 2.2 },
  { id: "bough-fake", label: "ONE REAL", steps: [["high", 0], ["fake", 1.2]], rest: 2.2 },
  { id: "root-breath-root", label: "HOLD YOUR NERVE", steps: [["low", 0], ["low", 1.75]], rest: 1.9 },
  { id: "bough-breath-bough", label: "STAY SMALL", steps: [["high", 0], ["high", 1.75]], rest: 1.9 },
  { id: "root-high-root", label: "RIVER THREE", steps: [["low", 0], ["high", 1.05], ["low", 2.2]], rest: 1.8 },
  { id: "high-root-high", label: "CANOPY THREE", steps: [["high", 0], ["low", 1.05], ["high", 2.2]], rest: 1.8 },
  { id: "fake-fake-root", label: "WAIT FOR IT", steps: [["fake", 0], ["fake", 0.9], ["low", 2.0]], rest: 1.9 },
  { id: "fake-fake-high", label: "WAIT FOR IT", steps: [["fake", 0], ["fake", 0.9], ["high", 2.0]], rest: 1.9 },
  { id: "root-high-high", label: "LOW HIGH HOLD", steps: [["low", 0], ["high", 1.15], ["high", 2.05]], rest: 1.9 },
  { id: "high-root-root", label: "HIGH LOW HOP", steps: [["high", 0], ["low", 1.15], ["low", 2.05]], rest: 1.9 },
  { id: "root-fake-high", label: "READ TWICE", steps: [["low", 0], ["fake", 0.95], ["high", 2.0]], rest: 1.9 },
  { id: "high-fake-root", label: "READ TWICE", steps: [["high", 0], ["fake", 0.95], ["low", 2.0]], rest: 1.9 },
];

const IDENTITY_GLYPHS = ["●", "▲", "■", "◆", "✦", "⬟", "✚", "★", "⬢", "✿"];

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPhraseDeck(seed: number): LogRunnerPhrase[] {
  const random = mulberry32(seed ^ 0x51de5eed);
  const deck = PHRASES.map((phrase) => ({
    ...phrase,
    steps: phrase.steps.map(([kind, offset]) => ({ kind, offset, warning: LOG_RUNNER_RULES.warning })),
  }));
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function makeRunner(player: Player, role: RunnerRole = "runner"): LogRunnerPlayer {
  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    color: player.color,
    connected: player.connected,
    role,
    survival: 0,
    eliminatedAt: role === "bank" ? 0 : null,
    answers: new Map(),
    pose: role === "bank" ? "stumble" : "run",
    poseTime: 0,
    stumbleTime: 0,
    jumpSequence: -1,
    duckSequence: -1,
    branchSequence: -1,
    branchCooldown: role === "bank" ? 2.5 : 0,
    splashPulse: 0,
  };
}

function courseObstacles(seed: number) {
  const deck = buildPhraseDeck(seed);
  const obstacles: LogRunnerObstacle[] = [];
  let phraseStart = 3.4;
  let nextId = 1;
  let phraseIndex = 0;
  while (phraseStart < LOG_RUNNER_RULES.round - 0.8) {
    const phrase = deck[phraseIndex % deck.length];
    for (const step of phrase.steps) {
      const impactAt = phraseStart + step.offset;
      if (impactAt >= LOG_RUNNER_RULES.round - 0.25) continue;
      obstacles.push({
        id: nextId++,
        kind: step.kind,
        source: "course",
        ownerId: null,
        spawnedAt: impactAt - step.warning,
        impactAt,
        resolved: false,
        phraseId: phrase.id,
      });
    }
    const lastOffset = Math.max(...phrase.steps.map((step) => step.offset));
    const density = phraseStart < 28 ? 0.65 : phraseStart < 58 ? 0.25 : 0;
    phraseStart += lastOffset + phrase.rest + density;
    phraseIndex += 1;
  }
  return obstacles;
}

export function createLogRunnerState(players: Player[], seed = 1): LogRunnerState {
  const obstacles = courseObstacles(seed);
  return {
    phase: players.length === 0 ? "over" : "runway",
    runway: LOG_RUNNER_RULES.runway,
    remaining: LOG_RUNNER_RULES.round,
    elapsed: 0,
    resultTime: 0,
    goTime: 0,
    rescueTime: 0,
    rescuedPlayerId: null,
    runners: [...players].sort((a, b) => a.seat - b.seat).map((player) => makeRunner(player)),
    obstacles,
    events: [],
    nextObstacleId: obstacles.length + 1,
    pendingBranches: [],
    lastBankImpact: -Infinity,
    lastBankSeat: -1,
    seed,
  };
}

function admitBankBranch(state: LogRunnerState) {
  if (state.obstacles.some((obstacle) => obstacle.source === "bank" && !obstacle.resolved)) return false;
  state.pendingBranches = state.pendingBranches.filter((id) => {
    const runner = state.runners.find((candidate) => candidate.id === id);
    return Boolean(runner && runner.role === "bank" && runner.connected && runner.branchCooldown <= 0);
  });
  const thrower = state.pendingBranches
    .map((id) => state.runners.find((runner) => runner.id === id)!)
    .sort((a, b) => {
      const aDistance = (a.seat - state.lastBankSeat + 10) % 10 || 10;
      const bDistance = (b.seat - state.lastBankSeat + 10) % 10 || 10;
      return aDistance - bDistance || a.seat - b.seat;
    })[0];
  if (!thrower) return false;
  let impactAt = Math.max(state.elapsed + LOG_RUNNER_RULES.warning, state.lastBankImpact + LOG_RUNNER_RULES.branchGlobalGap);
  const conflicts = () => state.obstacles.some((obstacle) => !obstacle.resolved
    && obstacle.kind !== "fake"
    && Math.abs(obstacle.impactAt - impactAt) < LOG_RUNNER_RULES.safeGap);
  for (let attempts = 0; attempts < 32 && conflicts(); attempts++) impactAt += 0.25;
  if (impactAt >= LOG_RUNNER_RULES.round - 0.2 || conflicts()) return false;
  const obstacle: LogRunnerObstacle = {
    id: state.nextObstacleId++,
    kind: "low",
    source: "bank",
    ownerId: thrower.id,
    spawnedAt: impactAt - LOG_RUNNER_RULES.warning,
    impactAt,
    resolved: false,
    phraseId: "bank-branch",
    announced: true,
  };
  state.obstacles.push(obstacle);
  state.obstacles.sort((a, b) => a.impactAt - b.impactAt || a.id - b.id);
  thrower.branchCooldown = LOG_RUNNER_RULES.branchCooldown;
  state.pendingBranches = state.pendingBranches.filter((id) => id !== thrower.id);
  state.lastBankImpact = impactAt;
  state.lastBankSeat = thrower.seat;
  state.events.push({ kind: "throw", playerId: thrower.id });
  return true;
}

export function scheduleBankBranch(state: LogRunnerState, playerId: string) {
  const thrower = state.runners.find((runner) => runner.id === playerId);
  if (!thrower || thrower.role !== "bank" || !thrower.connected || state.phase !== "live" || thrower.branchCooldown > 0) return false;
  if (state.pendingBranches.includes(playerId)
    || state.obstacles.some((obstacle) => obstacle.source === "bank" && obstacle.ownerId === playerId && !obstacle.resolved)) return false;
  state.pendingBranches.push(playerId);
  admitBankBranch(state);
  return true;
}

export function applyLogRunnerInput(state: LogRunnerState, playerId: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as { jump?: unknown; duck?: unknown; branch?: unknown };
  const runner = state.runners.find((candidate) => candidate.id === playerId);
  if (!runner || !runner.connected) return;

  const commit = (answer: "jump" | "duck") => {
    if (state.phase !== "live" || runner.role !== "runner") return;
    const target = state.obstacles.find((obstacle) => !obstacle.resolved
      && obstacle.kind !== "fake"
      && obstacle.spawnedAt <= state.elapsed
      && !runner.answers.has(obstacle.id));
    if (!target) return;
    runner.answers.set(target.id, answer);
    runner.pose = answer;
    runner.poseTime = 0.26;
    state.events.push({ kind: answer, playerId });
  };

  if (Number.isSafeInteger(input.jump) && Number(input.jump) >= 0 && runner.role === "runner") {
    const sequence = Number(input.jump);
    if (sequence <= runner.jumpSequence) return;
    runner.jumpSequence = sequence;
    commit("jump");
  }

  if (Number.isSafeInteger(input.duck) && Number(input.duck) >= 0 && runner.role === "runner") {
    const sequence = Number(input.duck);
    if (sequence <= runner.duckSequence) return;
    runner.duckSequence = sequence;
    commit("duck");
  }

  if (Number.isSafeInteger(input.branch) && Number(input.branch) >= 0 && runner.role === "bank") {
    const sequence = Number(input.branch);
    if (sequence <= runner.branchSequence) return;
    runner.branchSequence = sequence;
    scheduleBankBranch(state, playerId);
  }
}

function finishHeat(state: LogRunnerState) {
  if (state.phase !== "live") return;
  state.phase = "results";
  state.resultTime = LOG_RUNNER_RULES.resultHold;
  state.remaining = Math.max(0, state.remaining);
  state.events.push({ kind: "finish" });
}

export function stepLogRunnerState(state: LogRunnerState, rawDt: number) {
  const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, 0.05);
  if (dt <= 0 || state.phase === "over") return;
  if (state.phase === "runway") {
    state.runway = Math.max(0, state.runway - dt);
    if (state.runway <= 0) {
      state.phase = "live";
      state.goTime = 0.9;
      state.events.push({ kind: "go" });
    }
    return;
  }
  if (state.phase === "results") {
    state.resultTime = Math.max(0, state.resultTime - dt);
    if (state.resultTime <= 0) state.phase = "over";
    return;
  }

  const before = state.elapsed;
  state.elapsed = Math.min(LOG_RUNNER_RULES.round, state.elapsed + dt);
  state.remaining = Math.max(0, LOG_RUNNER_RULES.round - state.elapsed);
  state.goTime = Math.max(0, state.goTime - dt);
  state.rescueTime = Math.max(0, state.rescueTime - dt);
  for (const runner of state.runners) {
    runner.poseTime = Math.max(0, runner.poseTime - dt);
    runner.stumbleTime = Math.max(0, runner.stumbleTime - dt);
    if (runner.poseTime <= 0 && runner.stumbleTime <= 0 && runner.role === "runner") runner.pose = "run";
    runner.branchCooldown = Math.max(0, runner.branchCooldown - dt);
    runner.splashPulse = Math.max(0, runner.splashPulse - dt);
    if (runner.role === "runner") runner.survival = Math.min(LOG_RUNNER_RULES.round, runner.survival + dt);
  }

  for (const obstacle of state.obstacles) {
    if (!obstacle.announced && obstacle.spawnedAt > before && obstacle.spawnedAt <= state.elapsed) {
      obstacle.announced = true;
      state.events.push({ kind: "warning", obstacle });
    }
    const resolvesAt = obstacle.impactAt + LOG_RUNNER_RULES.lateGrace;
    if (obstacle.resolved || resolvesAt > state.elapsed || resolvesAt <= before) continue;
    obstacle.resolved = true;
    if (obstacle.kind === "fake") {
      state.events.push({ kind: "fake", obstacle });
      continue;
    }
    const activeRunners = state.runners.filter((runner) => runner.role === "runner");
    const requiredAnswer = obstacle.kind === "low" ? "jump" : "duck";
    const unsafeRunners = obstacle.source === "course"
      ? activeRunners.filter((runner) => runner.answers.get(obstacle.id) !== requiredAnswer)
      : [];
    const rescued = state.elapsed < LOG_RUNNER_RULES.openingMercy
      && unsafeRunners.length > 0
      && unsafeRunners.length === activeRunners.length
      ? [...unsafeRunners].sort((a, b) => a.seat - b.seat)[(state.seed + obstacle.id) % unsafeRunners.length]
      : null;
    let knocked = 0;
    for (const runner of activeRunners) {
      const answer = runner.answers.get(obstacle.id);
      runner.answers.delete(obstacle.id);
      const safe = answer === requiredAnswer;
      if (obstacle.source === "bank") {
        if (!safe) {
          runner.stumbleTime = 0.8;
          runner.pose = "stumble";
          runner.poseTime = 0.8;
        }
        continue;
      }
      if (safe) {
        runner.pose = answer!;
        runner.poseTime = 0.42;
        continue;
      }
      if (runner.id === rescued?.id) {
        runner.stumbleTime = 0.9;
        runner.pose = "stumble";
        runner.poseTime = 0.9;
        state.rescueTime = 1.25;
        state.rescuedPlayerId = runner.id;
        state.events.push({ kind: "rescue", playerId: runner.id });
        continue;
      }
      runner.role = "bank";
      runner.answers.clear();
      runner.pose = "stumble";
      runner.eliminatedAt = state.elapsed;
      runner.branchCooldown = 2.5;
      runner.splashPulse = 0.8;
      knocked += 1;
      state.events.push({ kind: "splash", playerId: runner.id });
    }
    if (knocked >= 2) state.events.push({ kind: "wipe", count: knocked });
  }

  admitBankBranch(state);

  if (state.remaining <= 0 || state.runners.every((runner) => runner.role === "bank")) finishHeat(state);
}

export function logRunnerResults(state: LogRunnerState): RoundResult[] {
  const ranked = [...state.runners].sort((a, b) => b.survival - a.survival || a.seat - b.seat);
  let previousSurvival: number | null = null;
  let place = 0;
  return ranked.map((runner, index) => {
    if (previousSurvival === null || Math.abs(runner.survival - previousSurvival) > 0.001) place = index + 1;
    previousSurvival = runner.survival;
    const bonus = place === 1 ? 15 : place === 2 ? 10 : place === 3 ? 5 : 0;
    const seconds = Math.floor(runner.survival);
    return {
      id: runner.id,
      place,
      score: seconds + bonus,
      detail: `${seconds}s on the log${bonus ? ` · +${bonus} last-three bonus` : ""}`,
    };
  });
}

function formatClock(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function roundedRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
}

function drawIdentityRail(c: CanvasRenderingContext2D, state: LogRunnerState) {
  const gap = 10;
  const columns = Math.min(5, Math.max(1, state.runners.length));
  const width = 210;
  const rowHeight = 68;
  const total = width * columns + gap * Math.max(0, columns - 1);
  const startX = columns === 5 ? 80 : (LOG_RUNNER_RULES.worldWidth - total) / 2;
  c.textAlign = "left";
  c.textBaseline = "middle";
  state.runners.forEach((runner, index) => {
    const x = startX + (index % columns) * (width + gap);
    const y = 16 + Math.floor(index / columns) * rowHeight;
    c.globalAlpha = runner.role === "bank" ? 0.55 : 1;
    c.fillStyle = "rgba(255,243,209,.94)";
    roundedRect(c, x, y, width, 58, 12);
    c.fill();
    c.fillStyle = runner.color;
    c.fillRect(x + 8, y + 8, 10, 42);
    c.fillStyle = "#082F3A";
    c.font = "950 25px Archivo, system-ui, sans-serif";
    c.fillText(IDENTITY_GLYPHS[runner.seat % IDENTITY_GLYPHS.length], x + 27, y + 26, 24);
    c.font = "900 25px Archivo, system-ui, sans-serif";
    c.fillText(`${runner.seat + 1} · ${runner.name}`, x + 56, y + 25, width - 64);
    c.font = "850 15px Archivo, system-ui, sans-serif";
    c.fillText(runner.role === "runner" ? "ON LOG" : "ON BANK", x + 27, y + 46, width - 36);
  });
  c.globalAlpha = 1;
}

function drawRunner(c: CanvasRenderingContext2D, runner: LogRunnerPlayer, index: number, count: number, elapsed: number, reducedMotion: boolean) {
  const spread = Math.min(86, 760 / Math.max(1, count - 1));
  const x = 800 + (index - (count - 1) / 2) * spread;
  const jumpProgress = runner.pose === "jump" ? 1 - clamp(runner.poseTime / 0.42, 0, 1) : 0;
  const jumpY = runner.pose === "jump" ? Math.sin(clamp(jumpProgress, 0.18, 0.82) * Math.PI) * 108 : 0;
  const duck = runner.pose === "duck" ? 0.58 : 1;
  const bob = reducedMotion ? 0 : Math.sin(elapsed * 7 + runner.seat) * 3;
  const stumble = reducedMotion ? 0 : runner.stumbleTime > 0 ? Math.sin(runner.stumbleTime * 28) * 12 : 0;
  const y = 574 - jumpY + bob;
  c.save();
  c.translate(x, y);
  c.rotate(stumble * 0.012);
  c.scale(1, duck);
  c.fillStyle = runner.color;
  c.strokeStyle = "#082F3A";
  c.lineWidth = 7;
  roundedRect(c, -28, -63, 56, 72, 19);
  c.fill();
  c.stroke();
  c.fillStyle = "#FFF3D1";
  c.beginPath();
  c.arc(0, -78, 22, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = "#082F3A";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "950 23px Archivo, system-ui, sans-serif";
  c.fillText(String(runner.seat + 1), 0, -77);
  c.fillStyle = "#FFF3D1";
  c.font = "950 25px Archivo, system-ui, sans-serif";
  c.fillText(IDENTITY_GLYPHS[runner.seat % IDENTITY_GLYPHS.length], 0, -26);
  c.restore();
  c.fillStyle = "rgba(8,47,58,.9)";
  roundedRect(c, x - 60, 602, 120, 38, 11);
  c.fill();
  c.fillStyle = "#FFF3D1";
  c.font = "900 23px Archivo, system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText(runner.name, x, 621, 106);
}

function drawSplash(c: CanvasRenderingContext2D, runner: LogRunnerPlayer, reducedMotion: boolean) {
  if (runner.splashPulse <= 0) return;
  const progress = 1 - runner.splashPulse / 0.8;
  const x = 800 + (runner.seat - 4.5) * 72;
  const y = 620 + progress * 150;
  c.save();
  c.translate(x, y);
  if (!reducedMotion) c.rotate(progress * Math.PI * 2.4 * (runner.seat % 2 ? -1 : 1));
  c.fillStyle = runner.color;
  roundedRect(c, -24, -34, 48, 66, 16);
  c.fill();
  c.fillStyle = "#FFF3D1";
  c.beginPath(); c.arc(0, -48, 19, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#082F3A";
  c.font = "950 20px Archivo, system-ui, sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(String(runner.seat + 1), 0, -47);
  c.restore();
  if (!reducedMotion) {
    c.strokeStyle = "#FFF3D1";
    c.lineWidth = 5;
    for (let drop = 0; drop < 4; drop++) {
      c.beginPath();
      c.arc(x + (drop - 1.5) * 24, y + 34, 9 + drop * 2, Math.PI, Math.PI * 2);
      c.stroke();
    }
  }
}

function drawObstacle(c: CanvasRenderingContext2D, obstacle: LogRunnerObstacle, elapsed: number, state: LogRunnerState) {
  if (elapsed < obstacle.spawnedAt || elapsed > obstacle.impactAt + 0.48) return;
  const progress = clamp((elapsed - obstacle.spawnedAt) / Math.max(0.001, obstacle.impactAt - obstacle.spawnedAt), 0, 1);
  const x = 1540 - progress * 460;
  const fakeLift = obstacle.kind === "fake" && progress > 0.78 ? (progress - 0.78) * 620 : 0;
  if (obstacle.source === "bank" && progress < 0.5) {
    const owner = state.runners.find((runner) => runner.id === obstacle.ownerId);
    const bankIndex = Math.max(0, state.runners.filter((runner) => runner.role === "bank").findIndex((runner) => runner.id === obstacle.ownerId));
    c.strokeStyle = owner?.color ?? "#FFF3D1";
    c.lineWidth = 7;
    c.setLineDash([12, 10]);
    c.beginPath();
    c.moveTo(58 + bankIndex * 150, 850);
    c.quadraticCurveTo(760, 390, x, obstacle.kind === "high" ? 452 : 610);
    c.stroke();
    c.setLineDash([]);
  }
  c.save();
  c.translate(x, -fakeLift);
  c.globalAlpha = obstacle.kind === "fake" ? 0.72 : 1;
  c.strokeStyle = obstacle.source === "bank" ? "#FFF3D1" : "#082F3A";
  c.lineWidth = obstacle.source === "bank" ? 8 : 7;
  c.setLineDash(obstacle.kind === "fake" ? [18, 13] : []);
  c.fillStyle = obstacle.source === "bank" ? "#6FA35B" : "#FF7A3D";
  if (obstacle.kind === "high") {
    roundedRect(c, -150, 430, 290, 46, 20);
    c.fill(); c.stroke();
    for (let twig = -110; twig <= 90; twig += 65) {
      c.beginPath(); c.moveTo(twig, 430); c.lineTo(twig + 28, 392); c.stroke();
    }
  } else {
    roundedRect(c, -95, 588, 190, 56, 24);
    c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-52, 588); c.lineTo(-76, 548); c.moveTo(42, 588); c.lineTo(68, 552); c.stroke();
  }
  c.setLineDash([]);
  c.fillStyle = "#FFF3D1";
  c.strokeStyle = "#082F3A";
  c.lineWidth = 8;
  c.font = "950 42px Archivo, system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.strokeText(obstacle.kind === "high" ? "DUCK" : obstacle.kind === "fake" ? "FAKE?" : "JUMP", 0, obstacle.kind === "high" ? 453 : 616);
  c.fillText(obstacle.kind === "high" ? "DUCK" : obstacle.kind === "fake" ? "FAKE?" : "JUMP", 0, obstacle.kind === "high" ? 453 : 616);
  if (obstacle.source === "bank") {
    const owner = state.runners.find((runner) => runner.id === obstacle.ownerId);
    c.fillStyle = "#FFF3D1";
    c.strokeStyle = "#082F3A";
    c.lineWidth = 6;
    c.font = "900 24px Archivo, system-ui, sans-serif";
    const label = `${owner?.name ?? "BANK"} THREW THIS`;
    c.strokeText(label, 0, 532);
    c.fillText(label, 0, 532);
  }
  c.restore();
}

function drawScene(c: CanvasRenderingContext2D, state: LogRunnerState, reducedMotion: boolean) {
  const world = LOG_RUNNER_RULES;
  c.fillStyle = "#FFF3D1";
  c.fillRect(0, 0, world.worldWidth, world.worldHeight);
  c.fillStyle = "#C9E5D3";
  c.fillRect(0, 92, world.worldWidth, 238);
  c.fillStyle = "#082F3A";
  c.fillRect(0, 330, world.worldWidth, 570);

  c.globalAlpha = 0.14;
  c.strokeStyle = "#FFF3D1";
  c.lineWidth = 3;
  for (let row = 0; row < 8; row++) {
    c.beginPath();
    for (let x = -60; x <= 1660; x += 70) {
      const y = 360 + row * 62 + Math.sin(x * 0.018 + (reducedMotion ? 0 : state.elapsed * 1.8) + row) * 9;
      if (x === -60) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.globalAlpha = 1;

  c.fillStyle = "#6B3E26";
  c.strokeStyle = "#321F18";
  c.lineWidth = 10;
  roundedRect(c, 300, 615, 980, 150, 74);
  c.fill(); c.stroke();
  c.strokeStyle = "rgba(255,243,209,.28)";
  c.lineWidth = 6;
  for (let x = 350; x < 1240; x += 105) {
    c.beginPath();
    c.arc(x - (((reducedMotion ? 0 : state.elapsed) * 70) % 105), 690, 32, 0, Math.PI * 2);
    c.stroke();
  }

  c.strokeStyle = "#FF7A3D";
  c.lineWidth = 6;
  c.setLineDash([14, 12]);
  c.beginPath(); c.moveTo(1080, 350); c.lineTo(1080, 780); c.stroke();
  c.setLineDash([]);
  c.fillStyle = "#FF7A3D";
  c.font = "900 15px Archivo, system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText("RESPONSE LINE", 1080, 810);

  const active = state.runners.filter((runner) => runner.role === "runner");
  active.forEach((runner, index) => drawRunner(c, runner, index, active.length, state.elapsed, reducedMotion));
  state.runners.forEach((runner) => drawSplash(c, runner, reducedMotion));
  for (const obstacle of state.obstacles) drawObstacle(c, obstacle, state.elapsed, state);

  const bank = state.runners.filter((runner) => runner.role === "bank");
  if (bank.length > 0) {
    c.fillStyle = "#6FA35B";
    c.fillRect(0, 820, world.worldWidth, 80);
    c.fillStyle = "#082F3A";
    c.textAlign = "left";
    c.font = "900 17px Archivo, system-ui, sans-serif";
    c.fillText("THE BANK · THROW INTO A FAIR GAP", 28, 846);
    bank.forEach((runner, index) => {
      const x = 40 + index * 150;
      c.fillStyle = runner.color;
      c.beginPath(); c.arc(x + 18, 876, 15, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#082F3A";
      c.font = "800 14px Archivo, system-ui, sans-serif";
      c.fillText(`${runner.seat + 1} ${runner.name}`, x + 40, 877, 104);
    });
  }
}

function nextVisibleObstacle(state: LogRunnerState) {
  return state.obstacles.find((obstacle) => !obstacle.resolved && obstacle.spawnedAt <= state.elapsed && obstacle.kind !== "fake");
}

function drawHud(c: CanvasRenderingContext2D, state: LogRunnerState) {
  drawIdentityRail(c, state);
  const railBottom = state.runners.length > 5 ? 142 : 74;
  c.fillStyle = "#082F3A";
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.font = "950 28px Archivo, system-ui, sans-serif";
  c.fillText("LOG RUNNER", 34, railBottom + 38);
  c.font = "850 20px Archivo, system-ui, sans-serif";
  c.fillText(`${state.runners.filter((runner) => runner.role === "runner").length} ON LOG`, 36, railBottom + 69);
  c.textAlign = "left";
  c.font = "950 48px Archivo, system-ui, sans-serif";
  c.fillText(formatClock(state.remaining), 34, railBottom + 116);
  const next = nextVisibleObstacle(state);
  if (next) {
    const seconds = Math.max(0, next.impactAt - state.elapsed);
    c.fillStyle = "#FF7A3D";
    c.textAlign = "center";
    c.font = "950 58px Archivo, system-ui, sans-serif";
    c.fillText(next.kind === "high" ? "DUCK" : "JUMP", 800, railBottom + 48);
    c.font = "850 21px Archivo, system-ui, sans-serif";
    c.fillText(`${seconds.toFixed(1)}s · ${next.source === "bank" ? "BANK BRANCH" : "READ THE RIVER"}`, 800, railBottom + 92);
  }
  if (state.rescueTime > 0) {
    const rescued = state.runners.find((runner) => runner.id === state.rescuedPlayerId);
    c.fillStyle = "#FFF3D1";
    c.strokeStyle = "#082F3A";
    c.lineWidth = 10;
    c.textAlign = "center";
    c.font = "950 62px Archivo, system-ui, sans-serif";
    const label = `LAST GRIP! ${rescued?.name ?? "RUNNER"} CLINGS ON`;
    c.strokeText(label, 800, 292, 1120);
    c.fillText(label, 800, 292, 1120);
  }
}

function drawRunway(c: CanvasRenderingContext2D, state: LogRunnerState) {
  c.fillStyle = "rgba(8,47,58,.88)";
  roundedRect(c, 350, 150, 900, 590, 42);
  c.fill();
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#FFF3D1";
  c.font = "950 78px Archivo, system-ui, sans-serif";
  c.fillText("LOG RUNNER", 800, 236);
  c.font = "900 42px Archivo, system-ui, sans-serif";
  c.fillStyle = "#FF7A3D";
  c.fillText("LOW = JUMP", 580, 354);
  c.fillText("HIGH = DUCK", 1020, 354);
  c.strokeStyle = "#FFF3D1";
  c.lineWidth = 7;
  c.fillStyle = "#FF7A3D";
  roundedRect(c, 495, 382, 170, 46, 18);
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(525, 382); c.lineTo(505, 346); c.moveTo(635, 382); c.lineTo(655, 348); c.stroke();
  roundedRect(c, 885, 382, 270, 38, 18);
  c.fill(); c.stroke();
  c.beginPath(); c.moveTo(920, 382); c.lineTo(945, 346); c.moveTo(1115, 382); c.lineTo(1140, 348); c.stroke();
  c.fillStyle = "#FFF3D1";
  c.font = "800 24px Archivo, system-ui, sans-serif";
  c.fillText("MISS TOGETHER · SPLASH TOGETHER", 800, 468);
  c.fillText("WASHED OFF? THROW BRANCHES FROM THE BANK", 800, 510);
  c.font = "950 108px Archivo, system-ui, sans-serif";
  c.fillText(String(Math.max(1, Math.ceil(state.runway))), 800, 605);
  c.font = "800 19px Archivo, system-ui, sans-serif";
  c.fillText("FIND YOUR NUMBER · HANDS ON BOTH BUTTONS", 800, 683);
}

function drawResults(c: CanvasRenderingContext2D, state: LogRunnerState) {
  const results = logRunnerResults(state).slice(0, 3);
  c.fillStyle = "rgba(8,47,58,.92)";
  c.fillRect(0, 0, LOG_RUNNER_RULES.worldWidth, LOG_RUNNER_RULES.worldHeight);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#FF7A3D";
  c.font = "950 92px Archivo, system-ui, sans-serif";
  c.fillText("HEAT COMPLETE", 800, 214);
  c.fillStyle = "#FFF3D1";
  c.font = "850 28px Archivo, system-ui, sans-serif";
  c.fillText("TOP SURVIVORS", 800, 294);
  results.forEach((result, index) => {
    const runner = state.runners.find((candidate) => candidate.id === result.id)!;
    const y = 400 + index * 126;
    c.fillStyle = runner.color;
    roundedRect(c, 440, y - 42, 720, 88, 22);
    c.fill();
    c.fillStyle = "#082F3A";
    c.textAlign = "left";
    c.font = "950 34px Archivo, system-ui, sans-serif";
    c.fillText(`${result.place} · ${runner.name}`, 475, y);
    c.textAlign = "right";
    c.fillText(`${Math.floor(runner.survival)}s`, 1122, y);
  });
  if (logRunnerResults(state).length > 3 && logRunnerResults(state)[3].place === results[2]?.place) {
    c.fillStyle = "#FFF3D1";
    c.textAlign = "center";
    c.font = "800 20px Archivo, system-ui, sans-serif";
    c.fillText("MORE RUNNERS SHARE THIS PLACE · FULL TIES ON STANDINGS", 800, 800);
  }
}

export function createHost(ctx: HostContext): GameHost {
  const state = createLogRunnerState(ctx.players, ctx.seed);
  const sound = typeof AudioContext === "undefined" ? null : new LogRunnerSound("host");
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let statusClock = 0;
  let eventCursor = 0;
  let destroyed = false;

  const statusFor = (runner: LogRunnerPlayer): LogRunnerStatusFrame => {
    const queued = state.pendingBranches.includes(runner.id)
      || state.obstacles.some((obstacle) => obstacle.source === "bank" && obstacle.ownerId === runner.id && !obstacle.resolved);
    const answerTarget = state.obstacles.find((obstacle) => !obstacle.resolved
      && obstacle.kind !== "fake"
      && obstacle.spawnedAt <= state.elapsed
      && !runner.answers.has(obstacle.id));
    const interactive = runner.connected && state.phase === "live" && (runner.role === "runner" || (runner.branchCooldown <= 0 && !queued));
    const status = state.phase === "runway"
      ? "LOW jumps · HIGH ducks"
      : state.phase === "results" || state.phase === "over"
        ? "Watch the final splash"
        : runner.role === "runner"
          ? answerTarget ? `${answerTarget.kind === "high" ? "DUCK" : "JUMP"} NOW · first answer locks` : "Read the river · first answer locks"
          : queued ? "Branch queued in a fair gap" : runner.branchCooldown > 0 ? "Branch cooling" : "Branch ready";
    return {
      t: "logRunnerStatus",
      role: runner.role,
      phase: state.phase,
      interactive,
      remaining: state.phase === "runway" ? state.runway : state.remaining,
      cooldown: runner.branchCooldown,
      queued,
      status,
    };
  };

  const sendStatus = (runner: LogRunnerPlayer) => ctx.send(statusFor(runner), runner.id);
  const broadcastStatus = () => state.runners.forEach(sendStatus);
  const sendCue = (cue: LogRunnerCue, to?: string) => {
    const frame: LogRunnerAudioFrame = { t: "logRunnerAudio", cue };
    ctx.send(frame, to);
  };

  const processEvents = () => {
    let needsStatus = false;
    while (eventCursor < state.events.length) {
      const event = state.events[eventCursor++];
      if (event.kind === "warning") {
        sound?.play("warning"); needsStatus = true;
      } else if (event.kind === "go") {
        sound?.play("go"); sendCue("go"); needsStatus = true;
      } else if (event.kind === "finish") {
        sound?.play("finish"); sendCue("finish"); needsStatus = true;
      } else if (event.kind === "fake") {
        sound?.play("fake");
      } else if (event.kind === "splash") {
        sound?.play("splash"); sendCue("splash", event.playerId); needsStatus = true;
      } else if (event.kind === "throw") {
        sound?.play("throw"); needsStatus = true;
      } else if (event.kind === "rescue") {
        sound?.play("warning"); needsStatus = true;
      }
    }
    if (needsStatus) broadcastStatus();
  };

  broadcastStatus();

  return {
    onInput(playerId, data) {
      if (destroyed) return;
      if (data && typeof data === "object" && !Array.isArray(data) && (data as { t?: unknown }).t === "sync") {
        const runner = state.runners.find((candidate) => candidate.id === playerId);
        if (runner) sendStatus(runner);
        return;
      }
      const eventsBefore = state.events.length;
      applyLogRunnerInput(state, playerId, data);
      processEvents();
      const runner = state.runners.find((candidate) => candidate.id === playerId);
      if (runner && state.events.length > eventsBefore) sendStatus(runner);
    },
    onJoin(player) {
      if (state.runners.some((runner) => runner.id === player.id)) return;
      const runner = makeRunner(player, "bank");
      state.runners.push(runner);
      state.runners.sort((a, b) => a.seat - b.seat);
      sendStatus(runner);
    },
    onLeave(id) {
      const index = state.runners.findIndex((runner) => runner.id === id);
      if (index < 0) return;
      state.runners.splice(index, 1);
      state.pendingBranches = state.pendingBranches.filter((playerId) => playerId !== id);
      for (let obstacle = state.obstacles.length - 1; obstacle >= 0; obstacle--) {
        if (state.obstacles[obstacle].ownerId === id && !state.obstacles[obstacle].resolved) state.obstacles.splice(obstacle, 1);
      }
      if (state.phase === "live" && state.runners.length > 0 && state.runners.every((runner) => runner.role === "bank")) finishHeat(state);
    },
    onConnectionChange(id, connected) {
      const runner = state.runners.find((candidate) => candidate.id === id);
      if (!runner) return;
      runner.connected = connected;
      if (connected) sendStatus(runner);
    },
    tick(dt) {
      if (destroyed) return;
      const beforeRunway = state.runway;
      let remainingDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.5);
      while (remainingDt > 0) {
        const slice = Math.min(0.05, remainingDt);
        stepLogRunnerState(state, slice);
        remainingDt -= slice;
      }
      if (state.phase === "runway") {
        const beforeBeat = Math.ceil(beforeRunway);
        const afterBeat = Math.ceil(state.runway);
        if (afterBeat !== beforeBeat && afterBeat <= 3) {
          sound?.play("countdown"); sendCue("countdown");
        }
      }
      processEvents();
      statusClock += Math.min(Math.max(dt, 0), 0.05);
      if (statusClock >= 1) {
        statusClock %= 1;
        broadcastStatus();
      }
    },
    render(c, width, height) {
      c.save();
      const scale = Math.min(width / LOG_RUNNER_RULES.worldWidth, height / LOG_RUNNER_RULES.worldHeight);
      const offsetX = (width - LOG_RUNNER_RULES.worldWidth * scale) / 2;
      const offsetY = (height - LOG_RUNNER_RULES.worldHeight * scale) / 2;
      c.fillStyle = "#082F3A";
      c.fillRect(0, 0, width, height);
      c.translate(offsetX, offsetY);
      c.scale(scale, scale);
      drawScene(c, state, Boolean(reducedMotion));
      if (state.phase === "runway") {
        drawIdentityRail(c, state);
        drawRunway(c, state);
      }
      else if (state.phase === "results" || state.phase === "over") drawResults(c, state);
      else {
        drawHud(c, state);
        if (state.goTime > 0) {
          c.globalAlpha = reducedMotion ? 1 : clamp(state.goTime / 0.35, 0, 1);
          c.fillStyle = "#FFF3D1";
          c.strokeStyle = "#082F3A";
          c.lineWidth = 16;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.font = "950 164px Archivo, system-ui, sans-serif";
          c.strokeText("GO!", 800, 430);
          c.fillText("GO!", 800, 430);
          c.globalAlpha = 1;
        }
      }
      c.restore();
    },
    isOver: () => state.phase === "over",
    results: () => logRunnerResults(state),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sound?.destroy();
    },
  };
}
