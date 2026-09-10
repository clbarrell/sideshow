import { describe, expect, it, vi } from "vitest";
import {
  applyLogRunnerInput,
  buildPhraseDeck,
  createHost,
  createLogRunnerState,
  LOG_RUNNER_RULES,
  logRunnerResults,
  scheduleBankBranch,
  stepLogRunnerState,
  type LogRunnerState,
} from "../../src/client/games/log-runner/host";

function player(id: string, seat: number) {
  return {
    id,
    name: `Player${seat + 1}`,
    seat,
    color: `hsl(${seat * 36} 80% 60%)`,
    connected: true,
    ready: true,
    awayAt: null,
  };
}

function liveState(count = 3, seed = 17) {
  const state = createLogRunnerState(Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)), seed);
  state.phase = "live";
  state.runway = 0;
  return state;
}

function advance(state: LogRunnerState, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.025) stepLogRunnerState(state, Math.min(0.025, seconds - elapsed));
}

function recordingCanvas(labels: string[], draws: Array<{ text: string; x: number; maxWidth?: number }> = []) {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => key === "fillText"
      ? (text: string, x: number, _y: number, maxWidth?: number) => {
          labels.push(text);
          draws.push({ text, x, maxWidth });
        }
      : key === "measureText"
        ? (text: string) => ({ width: text.length * 14 })
        : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

describe("Log Runner rules", () => {
  it("builds twenty deterministic hand-authored phrases without shrinking the warning window", () => {
    const first = buildPhraseDeck(41);
    const same = buildPhraseDeck(41);
    const other = buildPhraseDeck(42);
    expect(first).toEqual(same);
    expect(first).not.toEqual(other);
    expect(first).toHaveLength(20);
    expect(new Set(first.map((phrase) => phrase.id))).toHaveLength(20);
    expect(first.flatMap((phrase) => phrase.steps).some((step) => step.kind === "fake")).toBe(true);
    expect(first.flatMap((phrase) => phrase.steps).every((step) => step.warning === LOG_RUNNER_RULES.warning)).toBe(true);
  });

  it("consumes discrete jump and duck sequences once and ignores malformed input", () => {
    const state = liveState(1);
    const runner = state.runners[0];
    const before = { role: runner.role, events: state.events.length, jumpSequence: runner.jumpSequence, duckSequence: runner.duckSequence };
    expect(() => applyLogRunnerInput(state, "p1", null)).not.toThrow();
    expect(() => applyLogRunnerInput(state, "p1", { jump: Infinity, duck: "yes" })).not.toThrow();
    expect({ role: runner.role, events: state.events.length, jumpSequence: runner.jumpSequence, duckSequence: runner.duckSequence }).toEqual(before);

    state.obstacles = [{ id: 1, kind: "low", source: "course", ownerId: null, spawnedAt: 0, impactAt: 1, resolved: false, phraseId: "test" }];

    applyLogRunnerInput(state, "p1", { jump: 1 });
    const firstJump = runner.answers.get(1);
    applyLogRunnerInput(state, "p1", { jump: 1 });
    expect(runner.answers.get(1)).toBe(firstJump);

    applyLogRunnerInput(state, "p1", { duck: 1 });
    expect(runner.answers.get(1)).toBe("jump");
  });

  it("knocks a whole mistimed cluster off at one shared response line", () => {
    const state = liveState(4);
    state.elapsed = LOG_RUNNER_RULES.openingMercy;
    state.remaining = LOG_RUNNER_RULES.round - state.elapsed;
    state.obstacles = [{
      id: 999,
      kind: "low",
      source: "course",
      ownerId: null,
      spawnedAt: LOG_RUNNER_RULES.openingMercy,
      impactAt: LOG_RUNNER_RULES.openingMercy + 0.1,
      resolved: false,
      phraseId: "test",
    }];
    advance(state, 0.3);
    expect(state.runners.every((runner) => runner.role === "bank")).toBe(true);
    expect(state.events.some((event) => event.kind === "wipe" && event.count === 4)).toBe(true);
  });

  it("keeps one deterministic last grip through the opening so a group wipe promotes bank play", () => {
    const state = liveState(4, 17);
    state.obstacles = [{
      id: 999,
      kind: "low",
      source: "course",
      ownerId: null,
      spawnedAt: 0,
      impactAt: 0.1,
      resolved: false,
      phraseId: "test",
    }];
    advance(state, 0.3);
    expect(state.phase).toBe("live");
    expect(state.runners.filter((runner) => runner.role === "runner")).toHaveLength(1);
    expect(state.runners.filter((runner) => runner.role === "bank")).toHaveLength(3);
    expect(state.events).toContainEqual({ kind: "rescue", playerId: expect.any(String) });
    expect(state.rescueTime).toBeGreaterThan(0);

    const survivor = state.runners.find((runner) => runner.role === "runner")!;
    expect(scheduleBankBranch(state, state.runners.find((runner) => runner.role === "bank")!.id)).toBe(false);
    advance(state, 2.6);
    const readyBanker = state.runners.find((runner) => runner.role === "bank" && runner.branchCooldown <= 0)!;
    expect(scheduleBankBranch(state, readyBanker.id)).toBe(true);
    expect(state.obstacles.some((obstacle) => obstacle.source === "bank" && obstacle.ownerId === readyBanker.id)).toBe(true);
    expect(survivor.role).toBe("runner");
  });

  it("lets the matching jump or duck response survive and treats fakes as harmless", () => {
    for (const kind of ["low", "high", "fake"] as const) {
      const state = liveState(1);
      state.obstacles = [{ id: 1, kind, source: "course", ownerId: null, spawnedAt: 0, impactAt: 0.1, resolved: false, phraseId: "test" }];
      if (kind === "low") applyLogRunnerInput(state, "p1", { jump: 1 });
      if (kind === "high") applyLogRunnerInput(state, "p1", { duck: 1 });
      advance(state, 0.3);
      expect(state.runners[0].role, kind).toBe("runner");
    }
  });

  it("makes bank branches funny but non-lethal and result-neutral", () => {
    const state = liveState(2);
    state.runners[1].role = "bank";
    const control = liveState(2);
    control.runners[1].role = "bank";
    control.obstacles = [];
    state.obstacles = [{ id: 33, kind: "low", source: "bank", ownerId: "p2", spawnedAt: 0, impactAt: 0.1, resolved: false, phraseId: "bank-branch" }];
    advance(state, 0.3);
    advance(control, 0.3);
    expect(state.runners[0].role).toBe("runner");
    expect(state.runners[0].stumbleTime).toBeGreaterThan(0);
    expect(logRunnerResults(state).map(({ id, place, score }) => ({ id, place, score })))
      .toEqual(logRunnerResults(control).map(({ id, place, score }) => ({ id, place, score })));
  });

  it("allows an authored answer during a branch stumble so bank play cannot alter elimination order", () => {
    const state = liveState(2);
    state.runners[1].role = "bank";
    state.obstacles = [
      { id: 40, kind: "low", source: "bank", ownerId: "p2", spawnedAt: 0, impactAt: 0.1, resolved: false, phraseId: "bank-branch" },
      { id: 41, kind: "high", source: "course", ownerId: null, spawnedAt: 0, impactAt: 0.5, resolved: false, phraseId: "test" },
    ];
    advance(state, 0.27);
    expect(state.runners[0].stumbleTime).toBeGreaterThan(0);
    applyLogRunnerInput(state, "p1", { duck: 1 });
    advance(state, 0.4);
    expect(state.runners[0].role).toBe("runner");
  });

  it("accepts expected network jitter through a fixed host-side late grace", () => {
    const inside = liveState(1);
    inside.elapsed = LOG_RUNNER_RULES.openingMercy;
    inside.remaining = LOG_RUNNER_RULES.round - inside.elapsed;
    inside.obstacles = [{ id: 70, kind: "low", source: "course", ownerId: null, spawnedAt: inside.elapsed, impactAt: inside.elapsed + 0.2, resolved: false, phraseId: "test" }];
    advance(inside, 0.3);
    applyLogRunnerInput(inside, "p1", { jump: 1 });
    advance(inside, 0.06);
    expect(inside.runners[0].role).toBe("runner");

    const outside = liveState(1);
    outside.elapsed = LOG_RUNNER_RULES.openingMercy;
    outside.remaining = LOG_RUNNER_RULES.round - outside.elapsed;
    outside.obstacles = [{ id: 71, kind: "low", source: "course", ownerId: null, spawnedAt: outside.elapsed, impactAt: outside.elapsed + 0.2, resolved: false, phraseId: "test" }];
    advance(outside, 0.36);
    expect(outside.runners[0].role).toBe("bank");
  });

  it("queues untargeted bank branches into a fair gap and enforces personal cooldown", () => {
    const state = liveState(3);
    state.runners[1].role = "bank";
    state.runners[1].eliminatedAt = 0;
    state.runners[2].role = "bank";
    state.runners[2].eliminatedAt = 0;
    state.obstacles = [{ id: 1, kind: "high", source: "course", ownerId: null, spawnedAt: 0, impactAt: 2.6, resolved: false, phraseId: "test" }];

    expect(scheduleBankBranch(state, "p2")).toBe(true);
    expect(scheduleBankBranch(state, "p2")).toBe(false);
    expect(scheduleBankBranch(state, "p3")).toBe(true);
    expect(state.pendingBranches).toEqual(["p3"]);
    const branch = state.obstacles.find((obstacle) => obstacle.source === "bank")!;
    expect(branch.ownerId).toBe("p2");
    expect(branch.kind).toBe("low");
    expect(branch.impactAt - branch.spawnedAt).toBe(LOG_RUNNER_RULES.warning);
    expect(Math.abs(branch.impactAt - 2.6)).toBeGreaterThanOrEqual(LOG_RUNNER_RULES.safeGap);
    expect(state.runners[1].branchCooldown).toBe(LOG_RUNNER_RULES.branchCooldown);
    branch.resolved = true;
    stepLogRunnerState(state, 0.01);
    const nextBranch = state.obstacles.find((obstacle) => obstacle.source === "bank" && obstacle.ownerId === "p3")!;
    expect(nextBranch.impactAt - branch.impactAt).toBeGreaterThanOrEqual(LOG_RUNNER_RULES.branchGlobalGap);
  });

  it("scores survival seconds and applies last-three bonuses with shared places", () => {
    const state = liveState(4);
    state.runners[0].survival = 90;
    state.runners[1].survival = 72.8;
    state.runners[2].survival = 72.8;
    state.runners[3].survival = 12.2;
    expect(logRunnerResults(state).map(({ id, place, score }) => ({ id, place, score }))).toEqual([
      { id: "p1", place: 1, score: 105 },
      { id: "p2", place: 2, score: 82 },
      { id: "p3", place: 2, score: 82 },
      { id: "p4", place: 4, score: 12 },
    ]);
  });
});

describe("Log Runner host surface", () => {
  it("renders no-spoken onboarding, threat verbs, and all ten colour-independent identities", () => {
    const labels: string[] = [];
    const draws: Array<{ text: string; x: number; maxWidth?: number }> = [];
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 8,
      width: 1920,
      height: 1080,
      send: vi.fn(),
    });
    host.render(recordingCanvas(labels, draws), 1920, 1080);
    expect(labels).toContain("LOG RUNNER");
    expect(labels).toContain("LOW = JUMP");
    expect(labels).toContain("HIGH = DUCK");
    expect(labels.filter((label) => /^\d+ · Player/.test(label))).toHaveLength(10);
    const identityLabels = draws.filter(({ text }) => /^\d+ · Player/.test(text));
    expect(Math.max(...identityLabels.map(({ x, maxWidth = 0 }) => x + maxWidth))).toBeLessThanOrEqual(1170);
  });

  it("lands an unmistakable GO after the nine-second runway", () => {
    const labels: string[] = [];
    const host = createHost({ players: [player("p1", 0)], seed: 8, width: 1280, height: 720, send: vi.fn() });
    for (let index = 0; index < 37; index++) host.tick(0.25);
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("GO!");
  });

  it("mirrors the current warning verb to phones without making the phone required", () => {
    const messages: { data: unknown; to?: string }[] = [];
    const host = createHost({ players: [player("p1", 0)], seed: 8, width: 1280, height: 720, send: (data, to) => messages.push({ data, to }) });
    for (let index = 0; index < 300 && !messages.some(({ data }) => /(?:JUMP|DUCK) NOW/.test(String((data as { status?: string }).status))); index++) {
      host.tick(0.05);
    }
    expect(messages).toContainEqual({
      to: "p1",
      data: expect.objectContaining({ t: "logRunnerStatus", status: expect.stringMatching(/(?:JUMP|DUCK) NOW/) }),
    });
  });

  it("admits a late joiner only onto the bank and preserves their reconnectable role", () => {
    const messages: { data: unknown; to?: string }[] = [];
    const host = createHost({ players: [player("p1", 0)], seed: 8, width: 1280, height: 720, send: (data, to) => messages.push({ data, to }) });
    for (let index = 0; index < 37; index++) host.tick(0.25);
    host.onInput("p1", { duck: 1 });
    host.onConnectionChange?.("p1", false);
    host.onJoin?.(player("late", 7));
    host.onConnectionChange?.("late", false);
    host.onInput("late", { t: "sync" });
    expect(messages).toContainEqual({
      to: "late",
      data: expect.objectContaining({ t: "logRunnerStatus", role: "bank", interactive: false }),
    });
    for (let index = 0; index < 12; index++) host.tick(0.25);
    messages.length = 0;
    host.onConnectionChange?.("late", true);
    expect(messages).toEqual([{
      to: "late",
      data: expect.objectContaining({ t: "logRunnerStatus", role: "bank", interactive: true }),
    }]);
  });

  it("holds the finish tableau before returning results once", () => {
    const state = liveState(1);
    state.obstacles = [];
    advance(state, 89.95);
    expect(state.phase).toBe("live");
    advance(state, 0.06);
    expect(state.phase).toBe("results");
    expect(state.resultTime).toBeGreaterThan(3.3);
    advance(state, 3.25);
    expect(state.phase).toBe("results");
    advance(state, 0.2);
    expect(state.phase).toBe("over");
    expect(logRunnerResults(state)).toHaveLength(1);
  });

  it("keeps sustained ten-player 1080p CPU frames inside a 16.7ms p95 budget", () => {
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 88,
      width: 1920,
      height: 1080,
      send: vi.fn(),
    });
    const canvas = recordingCanvas([]);
    const samples: number[] = [];
    for (let frame = 0; frame < 900; frame++) {
      if (frame % 30 === 0) {
        for (let index = 0; index < 10; index++) host.onInput(`p${index + 1}`, { jump: frame / 30 + 1 });
      }
      const started = performance.now();
      host.tick(1 / 60);
      host.render(canvas, 1920, 1080);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(16.7);
    host.destroy?.();
  });

  it("keeps warning plus ten simultaneous answers within the host router budget", () => {
    const messages: unknown[] = [];
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 88,
      width: 1280,
      height: 720,
      send: (data) => messages.push(data),
    });
    for (let index = 0; index < 37; index++) host.tick(0.25);
    messages.length = 0;
    host.tick(0.5);
    host.tick(0.5);
    host.tick(0.1);
    for (let index = 0; index < 10; index++) {
      host.onInput(`p${index + 1}`, { jump: 1 });
      for (let replay = 0; replay < 20; replay++) host.onInput(`p${index + 1}`, { jump: 1 });
    }
    expect(messages.length).toBeLessThanOrEqual(30);
  });
});
