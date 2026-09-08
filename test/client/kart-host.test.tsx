import { describe, expect, it } from "vitest";
import { createHost } from "../../src/client/games/kart/host";

describe("kart host HUD", () => {
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
