import { describe, expect, it } from "vitest";
import { boostCooldownForPlace, createHost } from "../../src/client/games/kart/host";

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

function player(id = "baz", seat = 0) {
  return { id, name: id, seat, color: "#FF5A47", connected: true, ready: true, awayAt: null };
}

function hostWithPlayers(count = 1) {
  return createHost({
    players: Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)),
    seed: 1,
    width: 1280,
    height: 720,
    send: () => undefined,
  });
}

describe("kart host HUD", () => {
  it("gives trailing racers a bounded, stronger comeback turbo", () => {
    expect(boostCooldownForPlace(1, 10)).toBeCloseTo(6.2);
    expect(boostCooldownForPlace(10, 10)).toBeCloseTo(3);
    expect(boostCooldownForPlace(5, 10)).toBeGreaterThan(3);
    expect(boostCooldownForPlace(5, 10)).toBeLessThan(6.2);
  });

  it("consumes a turbo press once instead of retriggering it after cooldown", () => {
    const labels: string[] = [];
    const game = hostWithPlayers();
    const g = recordingCanvas(labels);

    game.tick(3.3);
    game.onInput("p1", { s: 0, t: 0, b: true });
    game.tick(0.1);
    game.render(g, 1280, 720);
    expect(labels).toContain("L1 · 5s");

    for (let i = 0; i < 70; i++) game.tick(0.1);
    labels.length = 0;
    game.render(g, 1280, 720);
    expect(labels).toContain("L1 · TURBO");
  });

  it("lands a visible GO cue after the countdown", () => {
    const labels: string[] = [];
    const game = hostWithPlayers();
    game.tick(3.3);
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("GO!");
  });

  it("shows the controls on the shared screen before the race starts", () => {
    const labels: string[] = [];
    hostWithPlayers().render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("DRAG TO DRIVE  ·  TAP BOOST");
  });

  it("ends an idle heat at the party-safe time limit", () => {
    const game = hostWithPlayers();
    game.tick(3.3);
    expect(game.isOver()).toBe(false);
    game.tick(90);
    expect(game.isOver()).toBe(true);
  });

  it("does not strand the host when every controller leaves", () => {
    const game = hostWithPlayers(2);
    game.onLeave?.("p1");
    game.onLeave?.("p2");
    game.tick(3.3);
    game.tick(0.1);
    expect(game.isOver()).toBe(true);
  });

  it("ignores malformed controller payloads without crashing the projector", () => {
    const game = hostWithPlayers();
    expect(() => game.onInput("p1", null)).not.toThrow();
    expect(() => game.onInput("p1", [])).not.toThrow();
    expect(() => game.onInput("p1", "boost")).not.toThrow();
  });

  it("renders scoreboard text at a room-legible size across device pixel ratios", () => {
    const fonts: string[] = [];
    const labels: { text: string; y: number }[] = [];
    const g = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) =>
        key === "fillText"
          ? (text: string, _x: number, y: number) => labels.push({ text, y })
          : key === "measureText"
            ? (text: string) => ({ width: text.length * 18 })
          : (Reflect.get(target, key) ?? (() => undefined)),
      set: (target, key, value) => {
        if (key === "font") fonts.push(String(value));
        return Reflect.set(target, key, value);
      },
    });
    const game = createHost({
      players: [
        { id: "baz", name: "Baz", seat: 0, color: "#FF5A47", connected: true, ready: true, awayAt: null },
      ],
      seed: 1,
      width: 1280,
      height: 720,
      send: () => undefined,
    });

    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
    game.render(g, 1280, 720);
    expect(fonts).toContain("700 32px Archivo, system-ui, sans-serif");

    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    game.render(g, 2560, 1440);
    expect(fonts).toContain("700 64px Archivo, system-ui, sans-serif");

    labels.length = 0;
    const maxPlayerGame = createHost({
      players: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: "WWWWWWWWWWWW",
        seat: i,
        color: "#FF5A47",
        connected: true,
        ready: true,
        awayAt: null,
      })),
      seed: 1,
      width: 1280,
      height: 720,
      send: () => undefined,
    });
    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
    maxPlayerGame.render(g, 1280, 720);
    const scoreboardLabels = labels.filter(({ text }) => /^\d+  /.test(text));
    expect(scoreboardLabels).toHaveLength(10);
    expect(scoreboardLabels.at(-1)?.y).toBe(560);

    labels.length = 0;
    maxPlayerGame.render(g, 502, 264);
    expect(labels.find(({ text }) => text.startsWith("10  "))?.text).toMatch(/…$/);
  });
});
