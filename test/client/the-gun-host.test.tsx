import { describe, expect, it, vi } from "vitest";
import {
  applyTheGunInput,
  createHost,
  createTheGunState,
  setTheGunConnection,
  stepTheGunState,
  supplyTargetAt,
  THE_GUN_RULES,
  theGunResults,
  type TheGunState,
} from "../../src/client/games/the-gun/host";

function player(id: string, seat: number) {
  return { id, name: `Player${seat + 1}`, seat, color: `hsl(${seat * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

function liveState(count = 3, seed = 17) {
  const state = createTheGunState(Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)), seed);
  state.phase = "live";
  state.runway = 0;
  state.nextDropAt = THE_GUN_RULES.dropInterval;
  for (const fighter of state.fighters) {
    fighter.shield = 0;
    fighter.vx = 0;
    fighter.vy = 0;
  }
  return state;
}

function advance(state: TheGunState, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.025) stepTheGunState(state, Math.min(0.025, seconds - elapsed));
}

function recordingCanvas(labels: string[]) {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => key === "fillText"
      ? (text: string) => labels.push(text)
      : key === "measureText"
        ? (text: string) => ({ width: text.length * 13 })
        : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

function landGunOn(state: TheGunState, fighterIndex = 0) {
  const fighter = state.fighters[fighterIndex];
  Object.assign(fighter, { x: 800, y: 706, vx: 0, vy: 0, alive: true, shield: 0 });
  Object.assign(state.gun, { state: "ground", holderId: null, x: 800, y: 706, vx: 0, vy: 0, reload: 0 });
  stepTheGunState(state, 1 / 120);
}

describe("The Gun rules", () => {
  it("telegraphs the first supply during the runway, lands it on GO, and suppresses an unusable zero-second drop", () => {
    const state = createTheGunState([player("p1", 0), player("p2", 1)], 4);
    advance(state, THE_GUN_RULES.runway - THE_GUN_RULES.dropWarning + 0.01);
    expect(state.phase).toBe("runway");
    expect(state.gun.state).toBe("incoming");
    advance(state, THE_GUN_RULES.dropWarning);
    expect(state.phase).toBe("live");
    expect(state.dropIndex).toBe(1);

    state.gun.state = "waiting";
    state.nextDropAt = THE_GUN_RULES.round;
    state.elapsed = THE_GUN_RULES.round - THE_GUN_RULES.dropWarning;
    state.remaining = THE_GUN_RULES.dropWarning;
    advance(state, THE_GUN_RULES.dropWarning + 0.01);
    expect(state.phase).toBe("results");
    expect(state.dropIndex).toBe(1);
  });

  it("telegraphs every fifteen-second drop for three seconds and moves later drops to exposed locations", () => {
    const state = liveState(2, 4);
    expect(state.gun.state).toBe("waiting");
    advance(state, THE_GUN_RULES.dropInterval - THE_GUN_RULES.dropWarning - 0.01);
    expect(state.gun.state).toBe("waiting");
    advance(state, 0.02);
    expect(state.gun.state).toBe("incoming");
    expect(state.gun.warning).toBeGreaterThan(2.9);
    const early = supplyTargetAt(0, state.seed);
    const later = supplyTargetAt(4, state.seed);
    expect(early.danger).toBeLessThan(later.danger);
    expect(later.y).toBeLessThan(700);
    advance(state, THE_GUN_RULES.dropWarning + 0.02);
    expect(state.gun.state).toBe("ground");
    expect(state.dropIndex).toBe(1);
  });

  it("picks up one loaded gun, disables shove, fires one lethal readable shot, and reloads slowly", () => {
    const state = liveState(3);
    state.fighters[1].facing = 1;
    state.fighters[2].facing = -1;
    landGunOn(state);
    expect(state.gun.holderId).toBe("p1");
    expect(state.gun.loaded).toBe(true);
    expect(state.fighters[1].facing).toBe(-1);
    expect(state.fighters[2].facing).toBe(1);
    const holder = state.fighters[0];
    const victim = state.fighters[1];
    Object.assign(holder, { x: 600, y: 706, facing: 1, shield: 0 });
    Object.assign(victim, { x: 850, y: 706, shield: 0, alive: true });
    applyTheGunInput(state, "p1", { x: 0, action: 1 });
    expect(victim.alive).toBe(false);
    expect(state.gun.loaded).toBe(false);
    expect(state.gun.reload).toBe(THE_GUN_RULES.reload);
    expect(holder.gunKills).toBe(1);
    expect(holder.bounties).toBe(0);
    expect(state.events).toContainEqual(expect.objectContaining({ kind: "shot", playerId: "p1", otherId: "p2" }));

    const before = state.fighters[2].vx;
    Object.assign(state.fighters[2], { x: holder.x + 50, y: holder.y, shield: 0 });
    applyTheGunInput(state, "p1", { x: 0, action: 2 });
    expect(state.fighters[2].vx).toBe(before);
    advance(state, THE_GUN_RULES.reload - 0.01);
    expect(state.gun.loaded).toBe(false);
    advance(state, 0.02);
    expect(state.gun.loaded).toBe(true);
  });

  it("lets an unarmed shove eject the holder and awards only the holder bounty", () => {
    const state = liveState(2);
    landGunOn(state, 1);
    const attacker = state.fighters[0];
    const holder = state.fighters[1];
    Object.assign(attacker, { x: 1320, y: 706, facing: 1, vx: 0, actionCooldown: 0, shield: 0 });
    Object.assign(holder, { x: 1385, y: 706, vx: 0, shield: 0 });
    applyTheGunInput(state, attacker.id, { x: 0, action: 1 });
    expect(holder.vx).toBeGreaterThan(400);
    advance(state, 1.2);
    expect(holder.alive).toBe(false);
    expect(attacker.bounties).toBe(1);
    expect(attacker.holdTime).toBe(0);
    expect(state.gun.holderId).toBeNull();
  });

  it("respawns after three seconds with protection and cannot die or shove during the shield", () => {
    const state = liveState(2);
    const fighter = state.fighters[0];
    Object.assign(fighter, { x: 800, y: 980, shield: 0, lastHitBy: "p2", lastHitAge: 0 });
    stepTheGunState(state, 1 / 120);
    expect(fighter.alive).toBe(false);
    advance(state, THE_GUN_RULES.respawn - 0.02);
    expect(fighter.alive).toBe(false);
    advance(state, 0.04);
    expect(fighter.alive).toBe(true);
    expect(fighter.shield).toBeGreaterThan(0);
    const other = state.fighters[1];
    Object.assign(other, { x: fighter.x + 45, y: fighter.y, vx: 0 });
    applyTheGunInput(state, fighter.id, { x: 0, action: 1 });
    expect(other.vx).toBe(0);
  });

  it("consumes action and jump sequences once while rejecting malformed traffic", () => {
    const state = liveState(1);
    const fighter = state.fighters[0];
    expect(() => applyTheGunInput(state, "p1", null)).not.toThrow();
    expect(() => applyTheGunInput(state, "p1", { x: "left", jump: Infinity })).not.toThrow();
    applyTheGunInput(state, "p1", { x: 1, jump: 1, action: 1 });
    expect(fighter.vy).toBeLessThan(0);
    const actionCooldown = fighter.actionCooldown;
    fighter.vy = 0;
    applyTheGunInput(state, "p1", { x: 1, jump: 1, action: 1 });
    expect(fighter.vy).toBe(0);
    expect(fighter.actionCooldown).toBe(actionCooldown);
  });

  it("drops safely on disconnect, restores a protected reconnect, and ranks hold time over ordinary kills", () => {
    const state = liveState(3);
    landGunOn(state);
    state.fighters[0].holdTime = 12.8;
    state.fighters[0].gunKills = 8;
    state.fighters[1].holdTime = 9.2;
    state.fighters[1].bounties = 1;
    setTheGunConnection(state, "p1", false);
    expect(state.gun.holderId).toBeNull();
    expect(state.fighters[0].connected).toBe(false);
    setTheGunConnection(state, "p1", true);
    expect(state.fighters[0].shield).toBeGreaterThan(0);
    expect(theGunResults(state).map(({ id, place, score }) => ({ id, place, score }))).toEqual([
      { id: "p1", place: 1, score: 12 },
      { id: "p2", place: 1, score: 12 },
      { id: "p3", place: 3, score: 0 },
    ]);
  });
});

describe("The Gun host surface", () => {
  it("renders no-spoken onboarding and all ten colour-independent identities", () => {
    const labels: string[] = [];
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 8,
      width: 1920,
      height: 1080,
      send: vi.fn(),
    });
    host.render(recordingCanvas(labels), 1920, 1080);
    expect(labels).toContain("THE GUN");
    expect(labels).toContain("MOVE · JUMP · FACE A PLAYER TO SHOVE");
    expect(labels).toContain("HOLD THE GUN = +1 EACH SECOND");
    expect(labels.filter((label) => /^\d+ · Player/.test(label))).toHaveLength(10);
  });

  it("lands an unmistakable shared GO, syncs phones, and makes late joiners spectators", () => {
    const labels: string[] = [];
    const messages: Array<{ data: unknown; to?: string }> = [];
    const host = createHost({ players: [player("p1", 0), player("p2", 1)], seed: 8, width: 1280, height: 720, send: (data, to) => collectStatus(messages, data, to) });
    for (let index = 0; index < 33; index++) host.tick(0.25);
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("GO!");
    host.onJoin?.(player("late", 7));
    host.onInput("late", { sync: true, x: 0 });
    host.tick(0.05);
    expect(messages).toContainEqual({ to: "late", data: expect.objectContaining({ t: "theGunStatus", phase: "spectating", interactive: false }) });
  });

  it("confirms accepted trigger actions with the authoritative shot cue", () => {
    const messages: Array<{ data: TheGunStatusFrame; to?: string }> = [];
    const host = createHost({
      players: [player("p1", 0), player("p2", 1)], seed: 8, width: 1280, height: 720,
      send: (data, to) => collectStatus(messages, data, to),
    });
    host.onInput("p1", { x: 1 });
    for (let index = 0; index < 48; index += 1) host.tick(0.25);
    expect(messages.some(({ data, to }) => to === "p1" && data.armed)).toBe(true);
    messages.length = 0;
    host.onInput("p1", { x: 0, action: 1 });
    host.tick(0.05);
    expect(messages).toContainEqual({ to: "p1", data: expect.objectContaining({ armed: true, loaded: false }) });
    expect(messages.some(({ data, to }) => to === "p1" && data.cue === "shot")).toBe(true);
    host.destroy?.();
  });

  it("reports runway suppression and confirms an accepted empty-reach shove with cooldown", () => {
    const messages: Array<{ data: TheGunStatusFrame; to?: string }> = [];
    const host = createHost({ players: [player("p1", 0), player("p2", 1)], seed: 8, width: 1280, height: 720,
      send: (data, to) => collectStatus(messages, data, to) });
    messages.length = 0;
    host.onInput("p1", { x: 0, action: 1 });
    host.tick(0.05);
    expect(messages).toContainEqual({ to: "p1", data: expect.objectContaining({ actionState: "get-ready" }) });
    expect(messages.some(({ data }) => data.cue === "shove")).toBe(false);
    for (let index = 0; index < 40; index++) host.tick(0.25);
    messages.length = 0;
    host.onInput("p1", { x: 0, action: 2 });
    host.tick(0.05);
    expect(messages).toContainEqual({ to: "p1", data: expect.objectContaining({ actionState: "cooldown", cue: "shove" }) });
    messages.length = 0;
    host.onInput("p1", { x: 0, action: 3 });
    host.tick(0.05);
    expect(messages).toContainEqual({ to: "p1", data: expect.objectContaining({ actionState: "cooldown" }) });
    expect(messages.some(({ data }) => data.cue === "shove")).toBe(false);
    host.destroy?.();
  });

  it("reveals tied leaders as a standoff instead of crowning an arbitrary seat", () => {
    const labels: string[] = [];
    const host = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 8, width: 1280, height: 720, send: vi.fn(),
    });
    for (let index = 0; index < 513; index += 1) host.tick(0.25);
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("FINAL STANDOFF");
    expect(labels).toContain("10-WAY TIE");
    host.destroy?.();
  });

  it("keeps ten-player status, sync and accepted-action bursts inside the real host router budget", () => {
    let now = 0, last = 0, tokens = 60;
    let sent = 0, bytes = 0;
    const actions: string[] = [];
    const host = createHost({ players: Array.from({ length: 10 }, (_, i) => player(`p${i + 1}`, i)), seed: 88, width: 1280, height: 720,
      send: (data, to) => {
        expect(to).toBeUndefined();
        tokens = Math.min(60, tokens + (now - last) * 30) - 1;
        expect(tokens).toBeGreaterThanOrEqual(0);
        last = now;
        sent++;
        bytes = Math.max(bytes, new TextEncoder().encode(JSON.stringify({ t: "g", d: data })).length);
        const batch = data as { players: Record<string, TheGunStatusFrame> };
        for (const status of Object.values(batch.players)) actions.push(...(status.cues ?? []));
      } });
    for (let frame = 0; frame < 60 * 40; frame++) {
      now += 1 / 60;
      // Ten phones moving/tapping at their 20 Hz input budget, plus remount sync bursts.
      if (frame % 3 === 0) for (let i = 0; i < 10; i++) host.onInput(`p${i + 1}`, { x: (i % 3) - 1, action: frame + 1, jump: frame + 1 });
      if (frame % 60 === 0) for (let i = 0; i < 10; i++) host.onInput(`p${i + 1}`, { sync: true, x: 0 });
      host.tick(1 / 60);
    }
    expect(sent).toBeLessThanOrEqual(801); // ≤20/s including events, with 10/s router headroom.
    expect(bytes).toBeLessThanOrEqual(8 * 1024);
    expect(actions).toContain("shove");
    host.destroy?.();
  });

  it("holds a result spectacle and stays inside the ten-player 1080p frame budget", () => {
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
      if (frame % 5 === 0) for (let index = 0; index < 10; index++) host.onInput(`p${index + 1}`, { x: (index % 3) - 1, action: frame + index + 1 });
      const started = performance.now();
      host.tick(1 / 60);
      host.render(canvas, 1920, 1080);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(16.7);
    host.destroy?.();
  });
});

function collectStatus(messages: Array<{ data: TheGunStatusFrame | unknown; to?: string }>, value: unknown, to?: string) {
  const batch = value as { t?: string; players?: Record<string, TheGunStatusFrame> };
  if (batch.t !== "theGunStatusBatch" || !batch.players) { messages.push({ data: value, to }); return; }
  for (const [id, status] of Object.entries(batch.players)) {
    if (status.cues?.length) for (const cue of status.cues) messages.push({ data: { ...status, cue }, to: id });
    else messages.push({ data: status, to: id });
  }
}
