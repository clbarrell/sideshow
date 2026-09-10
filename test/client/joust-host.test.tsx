import { describe, expect, it, vi } from "vitest";
import {
  applyJoustInput,
  createHost,
  createJoustState,
  formatClock,
  JOUST_RULES,
  joustResults,
  platformPhase,
  setJoustConnection,
  stepJoustState,
  type JoustState,
} from "../../src/client/games/joust/host";

function player(id: string, seat: number) {
  return { id, name: `Player${seat + 1}`, seat, color: ["#FF5A47", "#4AA8FF"][seat % 2], connected: true, ready: true, awayAt: null };
}

function liveState(count = 2) {
  const state = createJoustState(Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)), 7);
  state.phase = "live";
  state.runway = 0;
  for (const bird of state.birds) {
    bird.shield = 0;
    bird.hitLock = 0;
    bird.vx = 0;
    bird.vy = 0;
    bird.inputX = 0;
  }
  return state;
}

function placeCollision(state: JoustState, verticalGap: number) {
  Object.assign(state.birds[0], { x: 780, y: 420, vx: 0, vy: 0, shield: 0, hitLock: 0, alive: true });
  Object.assign(state.birds[1], { x: 805, y: 420 + verticalGap, vx: 0, vy: 0, shield: 0, hitLock: 0, alive: true });
}

describe("Featherweight Championship rules", () => {
  it("bounces an ambiguous level collision without scoring or dropping an egg", () => {
    const state = liveState();
    placeCollision(state, JOUST_RULES.levelGap - 1);
    stepJoustState(state, 1 / 120);

    expect(state.birds.every((bird) => bird.alive)).toBe(true);
    expect(state.birds[0].vx).toBeLessThan(0);
    expect(state.birds[1].vx).toBeGreaterThan(0);
    expect(state.eggs).toHaveLength(0);
    expect(state.birds.map((bird) => bird.score)).toEqual([0, 0]);
    expect(state.events.some((event) => event.kind === "bump")).toBe(true);
  });

  it("makes the visibly higher bird win regardless of pair order, while kills score nothing", () => {
    for (const reverse of [false, true]) {
      const state = liveState();
      if (reverse) state.birds.reverse();
      const high = state.birds.find((bird) => bird.id === "p1")!;
      const low = state.birds.find((bird) => bird.id === "p2")!;
      Object.assign(high, { x: 780, y: 390, shield: 0, hitLock: 0 });
      Object.assign(low, { x: 805, y: 430, shield: 0, hitLock: 0 });

      stepJoustState(state, 1 / 120);
      expect(high.alive).toBe(true);
      expect(low.alive).toBe(false);
      expect(high.knockouts).toBe(1);
      expect(high.score).toBe(0);
      expect(state.eggs).toHaveLength(1);
      expect(state.eggs[0].ownerId).toBe(low.id);
    }
  });

  it("keeps one loose egg per owner across repeated knockouts", () => {
    const state = liveState();
    placeCollision(state, 40);
    stepJoustState(state, 1 / 120);
    const loser = state.birds[1];
    loser.alive = true;
    loser.respawn = 0;
    loser.shield = 0;
    loser.hitLock = 0;
    state.birds[0].hitLock = 0;
    placeCollision(state, 40);
    stepJoustState(state, 1 / 120);
    expect(state.eggs.filter((egg) => egg.ownerId === loser.id)).toHaveLength(1);
  });

  it("gives the owner a denial head start and awards exactly one point only to a rival steal", () => {
    const ownerState = liveState();
    placeCollision(ownerState, -40);
    stepJoustState(ownerState, 1 / 120);
    const owner = ownerState.birds[0];
    owner.alive = true;
    owner.shield = 0;
    owner.respawn = 0;
    const ownerEgg = ownerState.eggs[0];
    Object.assign(ownerEgg, { age: JOUST_RULES.ownerClaim, vx: 0, vy: 0 });
    Object.assign(owner, { x: ownerEgg.x, y: ownerEgg.y, vx: 0, vy: 0 });
    stepJoustState(ownerState, 1 / 120);
    expect(owner.reclaims).toBe(1);
    expect(owner.score).toBe(0);
    expect(ownerState.eggs).toHaveLength(0);

    const stealState = liveState();
    placeCollision(stealState, 40);
    stepJoustState(stealState, 1 / 120);
    const rival = stealState.birds[0];
    const egg = stealState.eggs[0];
    Object.assign(egg, { age: JOUST_RULES.rivalClaim - 0.02, vx: 0, vy: 0 });
    Object.assign(rival, { x: egg.x, y: egg.y, vx: 0, vy: 0, hitLock: 0 });
    stepJoustState(stealState, 1 / 120);
    expect(rival.score).toBe(0);
    expect(stealState.eggs).toHaveLength(1);
    egg.age = JOUST_RULES.rivalClaim;
    stepJoustState(stealState, 1 / 120);
    expect(rival.score).toBe(1);
    expect(stealState.eggs).toHaveLength(0);
  });

  it("respawns quickly with a shield that can neither deal nor receive a knockout", () => {
    const state = liveState();
    placeCollision(state, 40);
    stepJoustState(state, 1 / 120);
    const loser = state.birds[1];
    for (let i = 0; i < 7; i += 1) stepJoustState(state, JOUST_RULES.respawn / 6);
    expect(loser.alive).toBe(true);
    expect(loser.shield).toBeGreaterThan(0);
    const other = state.birds[0];
    Object.assign(other, { x: loser.x + 30, y: loser.y + 40, shield: 0, hitLock: 0, alive: true });
    stepJoustState(state, 1 / 120);
    expect(loser.alive).toBe(true);
    expect(other.alive).toBe(true);
  });

  it("preserves a loose egg across a normal disconnect and returns at a protected edge", () => {
    const state = liveState();
    placeCollision(state, -40);
    stepJoustState(state, 1 / 120);
    const looseOwner = state.birds[0];
    expect(state.eggs[0].ownerId).toBe(looseOwner.id);
    setJoustConnection(state, looseOwner.id, false);
    expect(looseOwner.perched).toBe(true);
    expect(state.eggs).toHaveLength(1);
    setJoustConnection(state, looseOwner.id, true);
    expect(looseOwner.alive).toBe(true);
    expect(looseOwner.shield).toBe(JOUST_RULES.shield);
    expect(looseOwner.x).toBeLessThan(200);
  });

  it("consumes a flap sequence once and rejects malformed traffic", () => {
    const state = liveState(1);
    state.birds[0].shield = JOUST_RULES.shield;
    expect(() => applyJoustInput(state, "p1", null)).not.toThrow();
    expect(() => applyJoustInput(state, "p1", { x: "left", flap: 1 })).not.toThrow();
    applyJoustInput(state, "p1", { x: 1, flap: 1 });
    expect(state.birds[0].vy).toBe(-350);
    state.birds[0].vy = 12;
    state.birds[0].flapCooldown = 0;
    applyJoustInput(state, "p1", { x: 1, flap: 1 });
    expect(state.birds[0].vy).toBe(12);
  });

  it("warns for a fixed two seconds and never drops the floor", () => {
    const state = liveState();
    state.liveElapsed = 30;
    expect(platformPhase(state, 0)).toBe("stable");
    expect(state.platforms.map((_platform, index) => platformPhase(state, index)).filter((phase) => phase === "warning")).toHaveLength(1);
    state.liveElapsed = 31.99;
    expect(state.platforms.map((_platform, index) => platformPhase(state, index)).filter((phase) => phase === "warning")).toHaveLength(1);
    state.liveElapsed = 32.01;
    expect(state.platforms.map((_platform, index) => platformPhase(state, index)).filter((phase) => phase === "down")).toHaveLength(1);
  });

  it("preserves tied places and returns only stolen eggs as party points", () => {
    const state = liveState(3);
    state.birds[0].score = 2;
    state.birds[1].score = 2;
    state.birds[2].score = 0;
    state.birds[2].knockouts = 12;
    expect(joustResults(state).map(({ place, score }) => ({ place, score }))).toEqual([
      { place: 1, score: 2 }, { place: 1, score: 2 }, { place: 3, score: 0 },
    ]);
  });

  it("formats the 75-second heat as a conventional room-readable clock", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(62)).toBe("1:02");
    expect(formatClock(9.1)).toBe("0:10");
  });
});

describe("Featherweight Championship host surface", () => {
  it("renders the nine-second no-spoken onboarding and ten-player identity rail", () => {
    const labels: string[] = [];
    const hudCards: Array<{ x: number; width: number }> = [];
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => {
        if (key === "fillText") return (text: string) => labels.push(text);
        if (key === "measureText") return (text: string) => ({ width: text.length * 12 });
        if (key === "fillRect") {
          return (x: number, y: number, width: number, height: number) => {
            if (y === 18 && height === 58 && width > 100) hudCards.push({ x, width });
          };
        }
        return Reflect.get(target, key) ?? (() => undefined);
      },
    });
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 2,
      width: 1920,
      height: 1080,
      send: vi.fn(),
    });
    host.render(canvas, 1920, 1080);
    expect(labels).toContain("FEATHERWEIGHT CHAMPIONSHIP");
    expect(labels).toContain("FIND YOUR BIRD");
    expect(labels.filter((label) => /^\d+ · Player/.test(label))).toHaveLength(10);
    expect(labels).toContain("ONLY STOLEN EGGS SCORE");
    expect(hudCards).toHaveLength(10);
    expect(Math.max(...hudCards.map(({ x, width }) => x + width))).toBeLessThanOrEqual(1235);
  });

  it("lands an unmistakable shared GO after the runway", () => {
    const labels: string[] = [];
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => key === "fillText"
        ? (text: string) => labels.push(text)
        : key === "measureText"
          ? (text: string) => ({ width: text.length * 12 })
          : (Reflect.get(target, key) ?? (() => undefined)),
    });
    const host = createHost({ players: [player("p1", 0), player("p2", 1)], seed: 2, width: 1280, height: 720, send: vi.fn() });
    for (let i = 0; i < 37; i += 1) host.tick(0.25);
    host.render(canvas, 1280, 720);
    expect(labels).toContain("GO!");
  });

  it("keeps sustained ten-player 1080p CPU frames inside a 16.7ms p95 budget", () => {
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => key === "measureText"
        ? (text: string) => ({ width: text.length * 12 })
        : (Reflect.get(target, key) ?? (() => undefined)),
    });
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 22,
      width: 1920,
      height: 1080,
      send: vi.fn(),
    });
    const samples: number[] = [];
    for (let frame = 0; frame < 900; frame += 1) {
      if (frame % 12 === 0) {
        for (let playerIndex = 0; playerIndex < 10; playerIndex += 1) {
          host.onInput(`p${playerIndex + 1}`, { x: playerIndex % 2 === 0 ? 1 : -1, flap: frame / 12 + 1 });
        }
      }
      const started = performance.now();
      host.tick(1 / 60);
      host.render(canvas, 1920, 1080);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(16.7);
    host.destroy?.();
  });
});
