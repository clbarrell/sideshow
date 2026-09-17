import type { Player, RoundResult } from "../../../shared/protocol";
import { createFinalCountdown } from "../../final-countdown";
import type { GameHost, HostContext } from "../registry";
import type { LogRunnerStatusFrame } from "./protocol";
import { drawRiverScene, drawRiverHud, drawRiverRunway, drawRiverResults } from "./scene";
import { LogRunnerSound, type LogRunnerAudioFrame, type LogRunnerCue } from "./sound";

export const LOG_RUNNER_RULES = {
  worldWidth: 1600,
  worldHeight: 900,
  runway: 9,
  round: 90,
  resultHold: 3.4,
  warning: 2.4,
  lateGrace: 0.15,
  practice: 10,
  safeGap: 2.8,
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
  | { kind: "go" | "finish" | "practice" }
  | { kind: "warning" | "fake"; obstacle: LogRunnerObstacle }
  | { kind: "jump" | "duck" | "throw" | "splash"; playerId: string }
  | { kind: "wipe"; count: number };

export interface LogRunnerState {
  phase: "runway" | "live" | "results" | "over";
  runway: number;
  remaining: number;
  elapsed: number;
  resultTime: number;
  goTime: number;
  rescueTime: number;
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
    steps: phrase.steps.map(([kind], index) => ({ kind, offset: index * LOG_RUNNER_RULES.safeGap, warning: LOG_RUNNER_RULES.warning })),
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
  const obstacles: LogRunnerObstacle[] = ["low", "high"].map((kind, index) => ({
    id: index + 1, kind: kind as ObstacleKind, source: "course", ownerId: null,
    spawnedAt: 1 + index * 3.6, impactAt: 3.4 + index * 3.6,
    resolved: false, phraseId: "practice",
  }));
  let phraseStart = LOG_RUNNER_RULES.practice + 3.4;
  let nextId = 3;
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
    // Deliberate rests leave a full isolated warning slot for a bank throw.
    phraseStart += lastOffset + 6.1 + density;
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
    && Math.abs(obstacle.impactAt - impactAt) < LOG_RUNNER_RULES.safeGap);
  for (let attempts = 0; attempts < 360 && conflicts(); attempts++) impactAt += 0.25;
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
    announced: false,
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
    const target = currentObstacle(state);
    if (!target || target.kind === "fake" || runner.answers.has(target.id)) return;
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
    if (runner.role === "runner") runner.survival += Math.max(0, state.elapsed - Math.max(before, LOG_RUNNER_RULES.practice));
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
    const practicing = obstacle.impactAt < LOG_RUNNER_RULES.practice;
    let practiceMiss = false;
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
      if (practicing) {
        runner.stumbleTime = 0.9;
        runner.pose = "stumble";
        runner.poseTime = 0.9;
        state.rescueTime = 1.25;
        practiceMiss = true;
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
    if (practiceMiss) state.events.push({ kind: "practice" });
    if (knocked >= 2) state.events.push({ kind: "wipe", count: knocked });
  }

  if (before < LOG_RUNNER_RULES.practice && state.elapsed >= LOG_RUNNER_RULES.practice) {
    state.goTime = 1.1;
    state.events.push({ kind: "go" });
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
      detail: `${seconds}s on the log${bonus ? ` · +${bonus} place bonus` : ""}`,
    };
  });
}

/** One shared target, including fakes: no per-player advance queue. */
export function currentObstacle(state: LogRunnerState) {
  return state.obstacles.find((obstacle) => !obstacle.resolved && obstacle.spawnedAt <= state.elapsed);
}

export function createHost(ctx: HostContext): GameHost {
  const state = createLogRunnerState(ctx.players, ctx.seed);
  const sound = typeof AudioContext === "undefined" ? null : new LogRunnerSound("host");
  const finalCountdown = createFinalCountdown();
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let statusClock = 0;
  let eventCursor = 0;
  let destroyed = false;

  const statusFor = (runner: LogRunnerPlayer): LogRunnerStatusFrame => {
    const queued = state.pendingBranches.includes(runner.id)
      || state.obstacles.some((obstacle) => obstacle.source === "bank" && obstacle.ownerId === runner.id && !obstacle.resolved);
    const answerTarget = currentObstacle(state);
    const answer = answerTarget && runner.answers.get(answerTarget.id);
    const interactive = runner.connected && state.phase === "live" && (runner.role === "runner"
      ? Boolean(answerTarget && answerTarget.kind !== "fake" && !answer)
      : runner.branchCooldown <= 0 && !queued);
    const status = state.phase === "runway"
      ? "Stay on longest · 10s free practice first"
      : state.phase === "results" || state.phase === "over"
        ? "Survival points + place bonus"
        : runner.role === "runner"
          ? answer ? `${answer.toUpperCase()} LOCKED · obstacle ${answerTarget!.id}`
            : answerTarget ? answerTarget.kind === "fake" ? "SPRAY · no tap needed"
              : `${answerTarget.kind === "high" ? "DUCK" : "JUMP"} NOW · obstacle ${answerTarget.id}`
              : state.elapsed < LOG_RUNNER_RULES.practice ? "PRACTICE · no points or knockouts" : "Watch upstream · next warning soon"
          : queued ? "Heckle queued · no points or knockouts" : runner.branchCooldown > 0 ? "Heckle cooling · no knockouts" : "Heckle ready · stumble only";
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
      } else if (event.kind === "practice") {
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
      if (destroyed) {
        finalCountdown.update(null);
        return;
      }
      const beforeRunway = state.runway;
      let remainingDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.5);
      while (remainingDt > 0) {
        const slice = Math.min(0.05, remainingDt);
        stepLogRunnerState(state, slice);
        remainingDt -= slice;
      }
      finalCountdown.update(state.phase === "live" ? state.remaining : null);
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
      drawRiverScene(c, state, Boolean(reducedMotion));
      if (state.phase === "runway") {
        drawRiverRunway(c, state);
      }
      else if (state.phase === "results" || state.phase === "over") drawRiverResults(c, state);
      else {
        drawRiverHud(c, state);
        if (state.goTime > 0) {
          c.globalAlpha = reducedMotion ? 1 : clamp(state.goTime / 0.35, 0, 1);
          c.fillStyle = "#FFF3D1";
          c.strokeStyle = "#082F3A";
          c.lineWidth = 16;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.font = "950 164px Archivo, system-ui, sans-serif";
          c.strokeText(state.elapsed < LOG_RUNNER_RULES.practice ? "PRACTICE!" : "GO!", 800, 430);
          c.fillText(state.elapsed < LOG_RUNNER_RULES.practice ? "PRACTICE!" : "GO!", 800, 430);
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
      finalCountdown.destroy();
      sound?.destroy();
    },
  };
}
