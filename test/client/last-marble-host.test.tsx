import { describe, expect, it } from "vitest";
import {
  createHost,
  createImpactLimiter,
  createRemovalPath,
  equalMassNormalVelocities,
  hitCreditIsFresh,
  pointOnPlatform,
  platformStateAt,
  qualifiedAttacker,
  resolveEqualMassVelocities,
  sampleControlledMotion,
  spawnPointsFor,
} from "../../src/client/games/last-marble/host";

function player(id: string, seat: number) {
  return { id, name: id.toUpperCase(), seat, color: `hsl(${seat * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

function createGame(count = 2, seed = 41) {
  const messages: { data: unknown; to?: string }[] = [];
  const game = createHost({
    players: Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)),
    seed,
    width: 1280,
    height: 720,
    send: (data, to) => messages.push({ data, to }),
  });
  return { game, messages };
}

function advance(game: ReturnType<typeof createHost>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) game.tick(0.05);
}

function recordingCanvas(labels: string[]) {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) =>
      key === "fillText"
        ? (value: string) => labels.push(value)
        : key === "measureText"
          ? (text: string) => ({ width: text.length * 18 })
          : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

describe("Last Marble host", () => {
  it("uses equal-mass momentum response and refuses arbitrary head-on KO credit", () => {
    expect(equalMassNormalVelocities(240, 0)).toEqual({ a: 12, b: 228 });
    expect(qualifiedAttacker(180, 0)).toBe(0);
    expect(qualifiedAttacker(0, 180)).toBe(1);
    expect(qualifiedAttacker(100, 100)).toBeNull();
    expect(qualifiedAttacker(120, 0)).toBeNull();
    expect(qualifiedAttacker(40, 0)).toBeNull();
    expect(hitCreditIsFresh(2.25, 1)).toBe(true);
    expect(hitCreditIsFresh(2.251, 1)).toBe(false);

    const straight = resolveEqualMassVelocities({ x: 240, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    const glancing = resolveEqualMassVelocities({ x: 240, y: 90 }, { x: 0, y: -30 }, { x: 1, y: 0 });
    expect(straight).toEqual({ a: { x: 12, y: 0 }, b: { x: 228, y: 0 } });
    expect(glancing.a.y).toBe(90);
    expect(glancing.b.y).toBe(-30);
  });

  it("caps driven speed and stops within the strong-traction budget", () => {
    const driven = sampleControlledMotion({ x: 0, y: 0 }, { x: 1, y: 0 }, 2);
    expect(driven.speed).toBeGreaterThan(300);
    expect(driven.speed).toBeLessThanOrEqual(320);

    const released = sampleControlledMotion({ x: 320, y: 0 }, { x: 0, y: 0 }, 0.45);
    expect(released.speed).toBeLessThanOrEqual(32);
    expect(released.distance).toBeLessThanOrEqual(112);
  });

  it("uses seeded boundary erosion that keeps every remaining grid connected", () => {
    expect(createRemovalPath(9)).toEqual(createRemovalPath(9));
    expect(new Set(createRemovalPath(9))).toHaveLength(25);
    expect(createRemovalPath(9)).not.toEqual(createRemovalPath(10));

    for (let seed = 0; seed < 200; seed++) {
      const path = createRemovalPath(seed);
      for (let count = 1; count < path.length; count++) {
        const remaining = path.slice(count);
        const seen = new Set([remaining[0]]);
        const queue = [remaining[0]];
        while (queue.length) {
          const tile = queue.shift()!;
          for (const next of [tile - 1, tile + 1, tile - 5, tile + 5]) {
            if (!remaining.includes(next) || seen.has(next)) continue;
            if ((next === tile - 1 || next === tile + 1) && Math.floor(next / 5) !== Math.floor(tile / 5)) continue;
            seen.add(next);
            queue.push(next);
          }
        }
        expect(seen.size).toBe(remaining.length);
      }
      let removedCount = 0;
      for (const waveSize of [3, 3, 3, 3, 3, 3, 3, 4]) {
        const threatened = path.slice(removedCount, removedCount + waveSize);
        const safe = new Set(path.slice(removedCount + waveSize));
        const live = new Set(path.slice(removedCount));
        if (safe.size === 0) break; // the terminal drop intentionally removes all floor at 40s
        for (const start of threatened) {
          const seen = new Set([start]);
          const queue: [number, number][] = [[start, 0]];
          let escape = Infinity;
          while (queue.length) {
            const [tile, steps] = queue.shift()!;
            if (safe.has(tile)) { escape = steps; break; }
            if (steps === 3) continue;
            for (const next of [tile - 1, tile + 1, tile - 5, tile + 5]) {
              if (!live.has(next) || seen.has(next)) continue;
              if ((next === tile - 1 || next === tile + 1) && Math.floor(next / 5) !== Math.floor(tile / 5)) continue;
              seen.add(next);
              queue.push([next, steps + 1]);
            }
          }
          expect(escape).toBeLessThanOrEqual(3);
        }
        removedCount += waveSize;
      }
    }

    const path = createRemovalPath(9);
    expect(platformStateAt(1.999, path)).toMatchObject({ removed: [], warning: [] });
    for (let wave = 0; wave < 8; wave++) {
      const warningAt = wave * 5 + 2;
      const dropAt = (wave + 1) * 5;
      const before = platformStateAt(warningAt, path);
      expect(before.warning).toEqual(path.slice(before.removed.length, before.removed.length + (wave === 7 ? 4 : 3)));
      expect(platformStateAt(dropAt, path).warning).toEqual([]);
    }
    expect(platformStateAt(40, path)).toMatchObject({ removed: path, warning: [] });
  });

  it("uses exact grid support at tile interiors and seams", () => {
    const removed = [0, 12, 24];
    expect(pointOnPlatform(-200, -200, removed)).toBe(false);
    expect(pointOnPlatform(0, 0, removed)).toBe(false);
    expect(pointOnPlatform(200, 200, removed)).toBe(false);
    expect(pointOnPlatform(-50, -50, removed)).toBe(false); // deterministic lower-right seam ownership
    expect(pointOnPlatform(-50.01, -50.01, removed)).toBe(true);
    expect(pointOnPlatform(100, -200, removed)).toBe(true);
    expect(pointOnPlatform(250, 0, removed)).toBe(true);
    expect(pointOnPlatform(250.01, 0, removed)).toBe(false);
    expect(pointOnPlatform(0, -250.01, removed)).toBe(false);
  });

  it("reserves host-router headroom at maximum player count", () => {
    const { game, messages } = createGame(10);
    expect(messages).toHaveLength(10);
    for (let index = 1; index <= 10; index++) game.onInput(`p${index}`, { t: "sync" });
    expect(messages).toHaveLength(20);
    for (let index = 0; index < 35; index++) game.tick(0.25);
    expect(messages).toHaveLength(20);
    game.tick(0.25);
    expect(messages).toHaveLength(30);

    const limiter = createImpactLimiter();
    expect(limiter.allowPair(0, "p1", "p2")).toBe(true);
    expect(limiter.allowPair(0.05, "p2", "p1")).toBe(false);
    expect(limiter.allowPair(0.09, "p1", "p2")).toBe(true);
    limiter.clear();
    let targetedMessages = 0;
    for (let index = 0; index < 1000; index++) {
      const now = index / 1000;
      if (limiter.allowPair(now, `a${index}`, `b${index}`) && limiter.allowPhone(now)) targetedMessages += 2;
    }
    expect(targetedMessages).toBeLessThanOrEqual(20);
  });

  it("keeps the projector warning at exactly three seconds with coarse frame steps", () => {
    const labels: string[] = [];
    const { game } = createGame();
    for (let index = 0; index < 43; index++) game.tick(0.25); // 9s runway + 1.75s heat
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels.some((label) => /^\d TILES DROP IN/.test(label))).toBe(false);

    labels.length = 0;
    game.tick(0.25);
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels.some((label) => /^3 TILES DROP IN 3$/.test(label))).toBe(true);

    labels.length = 0;
    for (let index = 0; index < 11; index++) game.tick(0.25);
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels.some((label) => /^3 TILES DROP IN 1$/.test(label))).toBe(true);

    labels.length = 0;
    game.tick(0.25);
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels.some((label) => label.includes("TILES DROP IN"))).toBe(false);
  });

  it("shows a long shared runway with thumbstick-only instructions", () => {
    const labels: string[] = [];
    const { game } = createGame();
    game.render(recordingCanvas(labels), 1280, 720);

    expect(labels).toContain("LAST MARBLE");
    expect(labels).toContain("RAM WITH MOMENTUM · STAY ON TILES");
    expect(labels).toContain("5 HEATS · HIGHEST TOTAL WINS");
    expect(labels).toContain("SURVIVE +1/s · KO +2 · HEAT WIN +5");
    expect(labels).toContain("9");
  });

  it("keeps all ten seat identifiers without decorative glyphs at the projector text floor", () => {
    const labels: { text: string; font: string }[] = [];
    const g = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => key === "fillText"
        ? (text: string) => labels.push({ text, font: String(Reflect.get(target, "font")) })
        : key === "measureText"
          ? (text: string) => ({ width: text.length * 18 })
          : (Reflect.get(target, key) ?? (() => undefined)),
    });
    createGame(10).game.render(g, 1280, 720);

    Array.from({ length: 10 }, (_, index) => index).forEach((index) => {
      const identifier = String(index + 1);
      const rendered = labels.find((label) => label.text === identifier);
      expect(labels.some((label) => GLYPH_IDENTIFIERS.some((glyph) => label.text.includes(glyph)))).toBe(false);
      expect(labels.some((label) => label.text === `P${index + 1}`)).toBe(true);
      expect(rendered, identifier).toBeTruthy();
      expect(Number(/(\d+)px/.exec(rendered!.font)?.[1])).toBeGreaterThanOrEqual(20);
    });
  });

  it("renders attributable hit callouts from deliberate straight-line contact", () => {
    const labels: string[] = [];
    const seed = 41;
    const { game } = createGame(2, seed);
    const [from, to] = spawnPointsFor(seed, 0, 2);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    advance(game, 9.05);
    game.onInput("p1", { x: dx / distance, y: -dy / distance });

    for (let index = 0; index < 180 && !labels.includes("P1 → P2"); index++) {
      game.tick(0.01);
      game.render(recordingCanvas(labels), 1280, 720);
    }

    expect(labels).toContain("P1 → P2");
  });

  it("gates prepared input until heat two, retains it at GO, and reports match totals", () => {
    const { game, messages } = createGame(1);
    advance(game, 10.1);
    expect(messages).toContainEqual({ to: "p1", data: expect.objectContaining({ phase: "intermission", interactive: true, nextHeatIn: 8 }) });
    game.onInput("p1", { x: 1, y: 0 });
    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(game.results()[0].detail).toBe("6.0 pts · 5 heats");
    advance(game, 3.95);
    expect(messages.at(-1)?.data).toMatchObject({ phase: "intermission" });
    advance(game, 4);
    labels.length = 0;
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("GO!");
    // Observe the public render seam: prepared movement displaces the new spawn.
    const positions: number[][] = [];
    const g = recordingCanvas([]);
    Object.assign(g, { translate: (x: number, y: number) => positions.push([x, y]) });
    game.render(g, 1280, 720);
    const before = JSON.stringify(positions);
    positions.length = 0;
    advance(game, 0.2);
    game.render(g, 1280, 720);
    expect(JSON.stringify(positions)).not.toBe(before);
    expect(game.results()[0].detail).toBe("6.0 pts · 5 heats");
  });

  it("shows only the heat outcome and next start during the result pause", () => {
    const { game } = createGame(1);
    advance(game, 10.1);
    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toEqual(["P1 WINS", "Next heat in 8s"]);
  });

  it("sanitizes input and neutralizes a disconnected player's held stick", () => {
    const { game } = createGame();
    expect(() => game.onInput("p1", null)).not.toThrow();
    expect(() => game.onInput("p1", [])).not.toThrow();
    expect(() => game.onInput("p1", { x: Infinity, y: -20 })).not.toThrow();
    game.onInput("p1", { x: 1, y: 1 });
    expect(() => game.onConnectionChange?.("p1", false)).not.toThrow();
  });

  it("answers bounded mount syncs for roster members and late spectators", () => {
    const { game, messages } = createGame();
    messages.length = 0;
    game.onInput("p1", { t: "sync" });
    expect(messages).toEqual([{
      to: "p1",
      data: expect.objectContaining({ t: "lastMarbleStatus", phase: "runway", interactive: true }),
    }]);

    game.onJoin?.(player("late", 7));
    messages.length = 0;
    game.onInput("late", { t: "sync" });
    expect(messages).toEqual([{
      to: "late",
      data: expect.objectContaining({ t: "lastMarbleStatus", phase: "spectating", interactive: false }),
    }]);
  });

  it("keeps a mid-match joiner out of the five-heat set", () => {
    const { game, messages } = createGame();
    game.onJoin?.(player("late", 7));

    expect(messages).toContainEqual({
      to: "late",
      data: expect.objectContaining({ t: "lastMarbleStatus", phase: "spectating", interactive: false }),
    });
  });

  it("restores a late spectator screen after their socket reconnects", () => {
    const { game, messages } = createGame();
    game.onJoin?.(player("late", 7));
    messages.length = 0;
    game.onConnectionChange?.("late", true);

    expect(messages).toEqual([{
      to: "late",
      data: expect.objectContaining({ t: "lastMarbleStatus", phase: "spectating", interactive: false }),
    }]);
  });

  it("runs exactly five heats and returns bounded party points once", () => {
    const { game, messages } = createGame(2);
    advance(game, 9 + 5 * 40 + 4 * 8 + 5);

    expect(game.isOver()).toBe(true);
    const results = game.results();
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.score).sort((a, b) => b - a)).toEqual([10, 8]);
    expect(results.every((result) => result.detail?.includes("5 heats"))).toBe(true);
    expect(messages).toContainEqual({
      to: "p1",
      data: expect.objectContaining({ t: "lastMarbleStatus", phase: "complete", heat: 5 }),
    });
  });

  it("holds a final match banner before handing results to the shell", () => {
    const labels: string[] = [];
    const { game, messages } = createGame(1);
    for (let index = 0; index < 1200 && !messages.some(({ data }) => (data as { phase?: string }).phase === "complete"); index++) {
      game.tick(0.05);
    }

    expect(game.isOver()).toBe(false);
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("P1 WINS THE MATCH");
    expect(labels).toContain("FINAL STANDINGS");
    advance(game, 4.5);
    expect(game.isOver()).toBe(false);
    advance(game, 0.6);
    expect(game.isOver()).toBe(true);
  });

  it("assigns shared place and party points to exact match ties", () => {
    const { game } = createGame(2);
    expect(game.results()).toEqual([
      expect.objectContaining({ id: "p1", place: 1, score: 10 }),
      expect.objectContaining({ id: "p2", place: 1, score: 10 }),
    ]);
  });

  it("removes departed roster members so the shell receives only valid result ids", () => {
    const { game } = createGame(2);
    game.onLeave?.("p2");
    advance(game, 9 + 5 * 2 + 4 * 8 + 5);

    expect(game.isOver()).toBe(true);
    expect(game.results().map((result) => result.id)).toEqual(["p1"]);
  });
});

const GLYPH_IDENTIFIERS = ["◆", "▲", "●", "✦", "■", "⬟", "✚", "★", "⬢", "✿"];
