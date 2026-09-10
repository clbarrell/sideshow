import { describe, expect, it, vi } from "vitest";
import {
  createHost,
  CUT_AND_SHUT_RULES,
  layoutForRound,
  neighborInLayout,
  roadArms,
  resolveCouriers,
  roadDirection,
  type CourierState,
} from "../../src/client/games/cut-and-shut/host";
import type { CutAndShutFrame } from "../../src/client/games/cut-and-shut/protocol";

function player(id: string, seat: number) {
  return { id, name: `Dealer${seat + 1}`, seat, color: `hsl(${seat * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

function game(count = 2, seed = 17) {
  const messages: { data: unknown; to?: string }[] = [];
  const host = createHost({
    players: Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)),
    seed,
    width: 1280,
    height: 720,
    send: (data, to) => messages.push({ data, to }),
  });
  return { host, messages };
}

function tickFor(host: ReturnType<typeof createHost>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) host.tick(Math.min(0.05, seconds - elapsed));
}

function latest(messages: { data: unknown; to?: string }[], id: string) {
  return messages.filter(({ to, data }) => to === id && (data as { t?: string }).t === "cutAndShutState").at(-1)?.data as CutAndShutFrame | undefined;
}

function recordingCanvas(labels: string[]) {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => key === "fillText"
      ? (text: string) => labels.push(text)
      : key === "measureText"
        ? (text: string) => ({ width: text.length * 12 })
        : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

describe("Cut & Shut deterministic city", () => {
  it("uses five valid fold layouts without losing or duplicating a numbered slab", () => {
    const signatures = new Set<string>();
    for (let round = 0; round <= 4; round += 1) {
      const layout = layoutForRound(round);
      expect([...layout].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, index) => index));
      signatures.add(layout.join(","));
    }
    expect(signatures.size).toBe(5);
  });

  it("resolves exactly six deterministic beats and canal failures", () => {
    const couriers: CourierState[] = Array.from({ length: 6 }, (_, id) => ({ id, tile: id, fromTile: id, direction: id % 4, alive: true, failedAt: null }));
    const roads = new Map(Array.from({ length: 12 }, (_, seam) => [seam, "straight"] as const));
    const first = resolveCouriers(couriers, layoutForRound(2), roads, 2);
    const second = resolveCouriers(couriers, layoutForRound(2), roads, 2);
    expect(first).toEqual(second);
    expect(first.summary.steps).toBe(6);
    expect(first.summary.survivors).toBeLessThan(6);
    expect(first.couriers.every((courier) => courier.alive || courier.failedAt! < 6)).toBe(true);
  });

  it("derives every route from the displayed arms and never from courier identity", () => {
    expect(roadDirection("straight", 0, 1)).toBe(1);
    expect(roadDirection("straight", 1, 1)).toBeNull();
    expect(roadDirection("bend", 0, 2)).toBe(1);
    expect(roadDirection("bend", 0, 1)).toBeNull();
    expect(roadDirection("junction", 0, 3)).toBe(3);
    expect(roadDirection("junction", 3, 3)).toBe(3);
    expect(roadArms("straight", 0)).toEqual([1, 3]);
    expect(roadArms("bend", 2)).toEqual([2, 3]);
    expect(neighborInLayout(layoutForRound(0), 0, 3)).toBeNull();
    expect(neighborInLayout(layoutForRound(0), 0, 0)).toBeNull();
  });
});

describe("Cut & Shut host journey", () => {
  it("sends hands and contracts only as targeted private snapshots", () => {
    const { host, messages } = game(3);
    host.onInput("p1", { t: "sync" });
    host.onInput("p2", { t: "sync" });
    const p1 = latest(messages, "p1")!;
    const p2 = latest(messages, "p2")!;
    expect(p1.hand).toHaveLength(3);
    expect(p1.contract.label).toMatch(/^LOT /);
    expect(messages.every(({ to }) => typeof to === "string")).toBe(true);
    expect(p1).not.toBe(p2);
    expect(p1.contract.seam).not.toBe(p2.contract.seam);

    const labels: string[] = [];
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels.join(" ")).not.toContain(p1.contract.label);
    expect(labels.join(" ")).not.toContain(p2.contract.label);
  });

  it("allows only one live offer per involved player and swaps atomically into a public stitch", () => {
    const { host, messages } = game(3);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    const p1 = latest(messages, "p1")!;
    const p2 = latest(messages, "p2")!;
    const offered = p1.hand[0];
    const returned = p2.hand[0];
    host.onInput("p1", { t: "offer", roadId: offered.id, targetId: "p2" });
    tickFor(host, 0.5);
    const offer = latest(messages, "p2")!.offers[0];
    expect(offer).toEqual(expect.objectContaining({ fromId: "p1", toId: "p2", offered: offered.shape }));

    host.onInput("p3", { t: "offer", roadId: latest(messages, "p3")!.hand[0].id, targetId: "p2" });
    expect(latest(messages, "p2")!.offers).toHaveLength(1);
    host.onInput("p2", { t: "respond", offerId: offer.id, accept: true, roadId: returned.id });
    tickFor(host, 0.5);
    expect(latest(messages, "p1")!.offers).toHaveLength(0);
    expect(latest(messages, "p1")!.hand.some((card) => card.id === returned.id)).toBe(true);
    expect(latest(messages, "p2")!.hand.some((card) => card.id === offered.id)).toBe(true);
    expect(latest(messages, "p1")!.stitches[0]).toEqual(expect.objectContaining({ number: 1, fromName: "Dealer1", toName: "Dealer2" }));
  });

  it("rejects malformed, replayed and wrong-recipient deal actions", () => {
    const { host, messages } = game(2);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    const road = latest(messages, "p1")!.hand[0];
    expect(() => host.onInput("p1", null)).not.toThrow();
    host.onInput("p1", { t: "offer", roadId: road.id, targetId: "p2" });
    tickFor(host, 0.5);
    const offer = latest(messages, "p2")!.offers[0];
    host.onInput("p1", { t: "respond", offerId: offer.id, accept: false });
    expect(latest(messages, "p2")!.offers).toHaveLength(1);
    host.onInput("p2", { t: "respond", offerId: offer.id, accept: false });
    tickFor(host, 0.5);
    expect(latest(messages, "p2")!.offers).toHaveLength(0);
    host.onInput("p2", { t: "respond", offerId: offer.id, accept: true, roadId: "missing" });
    expect(latest(messages, "p2")!.stitches).toHaveLength(0);
  });

  it("cancels offers on disconnect, restores private state, and auto-commits idle players", () => {
    const { host, messages } = game(2);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    host.onInput("p1", { t: "offer", roadId: latest(messages, "p1")!.hand[0].id, targetId: "p2" });
    host.onConnectionChange?.("p2", false);
    expect(latest(messages, "p1")!.offers).toHaveLength(0);
    host.onConnectionChange?.("p2", true);
    expect(latest(messages, "p2")!.hand).toHaveLength(3);
    tickFor(host, CUT_AND_SHUT_RULES.marketSeconds + CUT_AND_SHUT_RULES.commitSeconds + 0.05);
    expect(latest(messages, "p1")!.committed).not.toBeNull();
    expect(latest(messages, "p2")!.committed).not.toBeNull();
    expect(latest(messages, "p1")!.committed!.seam).not.toBe(latest(messages, "p2")!.committed!.seam);
  });

  it("runs four fixed markets to completion with two or ten entirely idle dealers", () => {
    for (const count of [2, 10]) {
      const { host } = game(count, 77);
      tickFor(host, 205);
      expect(host.isOver()).toBe(true);
      const results = host.results();
      expect(results).toHaveLength(count);
      expect(new Set(results.map(({ id }) => id)).size).toBe(count);
      expect(results.every(({ score }) => score >= 0 && score <= 40)).toBe(true);
    }
  });

  it("starts from a survivable public circuit before later folds escalate it", () => {
    const { host, messages } = game(2, 17);
    tickFor(host,
      CUT_AND_SHUT_RULES.runwaySeconds
      + CUT_AND_SHUT_RULES.marketSeconds
      + CUT_AND_SHUT_RULES.commitSeconds
      + CUT_AND_SHUT_RULES.foldSeconds
      + CUT_AND_SHUT_RULES.marchSteps * CUT_AND_SHUT_RULES.beatSeconds
      + 0.6);
    const recap = latest(messages, "p1")!;
    expect(recap.phase).toBe("recap");
    expect(recap.shared).toBeGreaterThan(0);
    expect(recap.shared).toBeLessThanOrEqual(6);
  });

  it("preserves tied places when final point totals are equal", () => {
    const { host } = game(3);
    expect(host.results().map(({ place, score }) => ({ place, score }))).toEqual([
      { place: 1, score: 0 },
      { place: 1, score: 0 },
      { place: 1, score: 0 },
    ]);
  });

  it("shows ten numbered dealer identities, phase instructions and no private lots on the projector", () => {
    const { host } = game(10);
    const labels: string[] = [];
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("CUT & SHUT");
    expect(labels).toContain("1  LOOK DOWN — READ YOUR CONTRACT");
    expect(labels.filter((label) => /^\d+·Deal/.test(label))).toHaveLength(10);
    expect(labels.some((label) => /^C1[↗↘↙↖]$/.test(label))).toBe(true);
    expect(labels.some((label) => /^LOT /.test(label))).toBe(false);
  });

  it("renders live offers and accepted stitches on independent public rails", () => {
    const { host, messages } = game(10);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    host.onInput("p1", { t: "offer", roadId: latest(messages, "p1")!.hand[0].id, targetId: "p2" });
    tickFor(host, 0.5);
    const accepted = latest(messages, "p2")!.offers[0];
    host.onInput("p2", { t: "respond", offerId: accepted.id, accept: true, roadId: latest(messages, "p2")!.hand[0].id });
    for (let index = 2; index < 10; index += 2) {
      const from = `p${index + 1}`;
      const to = `p${index + 2}`;
      host.onInput(from, { t: "offer", roadId: latest(messages, from)!.hand[0].id, targetId: to });
    }
    const labels: string[] = [];
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels.filter((label) => label.includes("→ #"))).toHaveLength(4);
    expect(labels).toContain("01  #1↔#2");
    expect(labels.some((label) => label.includes("⇄"))).toBe(true);
  });

  it("keeps eight accepted stitches above the shared-pot footer at 720p", () => {
    const { host, messages } = game(10);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 0; index < 10; index += 2) {
        const from = `p${index + 1}`;
        const to = `p${index + 2}`;
        host.onInput(from, { t: "offer", roadId: latest(messages, from)!.hand[0].id, targetId: to });
      }
      tickFor(host, 0.5);
      for (let index = 0; index < 10; index += 2) {
        const to = `p${index + 2}`;
        const offer = latest(messages, to)!.offers.find((item) => item.toId === to);
        if (offer) host.onInput(to, { t: "respond", offerId: offer.id, accept: true, roadId: latest(messages, to)!.hand[0].id });
      }
      tickFor(host, 0.5);
    }
    const labels: { text: string; y: number }[] = [];
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => key === "fillText"
        ? (text: string, _x: number, y: number) => labels.push({ text, y })
        : key === "measureText"
          ? (text: string) => ({ width: text.length * 12 })
          : (Reflect.get(target, key) ?? (() => undefined)),
    });
    host.render(canvas, 1280, 720);
    const stitchLabels = labels.filter(({ text }) => /^\d\d  #\d+↔#\d+$/.test(text));
    expect(stitchLabels).toHaveLength(8);
    expect(Math.max(...stitchLabels.map(({ y }) => y + 18))).toBeLessThan(600);
  });

  it("reserves the projector top-right shell controls instead of hiding the game clock", () => {
    const { host } = game(2);
    const clockPositions: number[] = [];
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => key === "fillText"
        ? (text: string, x: number, y: number) => { if (text === "08" && y === 46) clockPositions.push(x); }
        : key === "measureText"
          ? (text: string) => ({ width: text.length * 12 })
          : (Reflect.get(target, key) ?? (() => undefined)),
    });
    host.render(canvas, 1280, 720);
    expect(clockPositions).toEqual([925]);
  });

  it("makes late joiners honest spectators and removes departed players from final results", () => {
    const { host, messages } = game(2);
    host.onJoin?.(player("late", 7));
    expect(latest(messages, "late")).toEqual(expect.objectContaining({ phase: "spectator", hand: [] }));
    host.onLeave?.("p2");
    expect(host.results().map(({ id }) => id)).toEqual(["p1"]);
  });

  it("treats a malformed offer response as an explicit no-op", () => {
    const { host, messages } = game(2);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    const roadId = latest(messages, "p1")!.hand[0].id;
    host.onInput("p1", { t: "offer", roadId, targetId: "p2" });
    tickFor(host, 0.5);
    const offer = latest(messages, "p2")!.offers[0];
    host.onInput("p2", { t: "respond", offerId: offer.id, accept: "no" });
    tickFor(host, 0.5);
    expect(latest(messages, "p2")!.offers).toEqual([offer]);
  });

  it("coalesces a ten-controller commit burst below the room host-message budget", () => {
    const { host, messages } = game(10);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds + CUT_AND_SHUT_RULES.marketSeconds + 0.1);
    const commits = Array.from({ length: 10 }, (_, index) => {
      const id = `p${index + 1}`;
      return { id, roadId: latest(messages, id)!.hand[0].id, seam: index };
    });
    messages.length = 0;
    for (const commit of commits) host.onInput(commit.id, { t: "commit", roadId: commit.roadId, seam: commit.seam });
    expect(messages).toHaveLength(0);
    tickFor(host, 0.5);
    expect(messages).toHaveLength(10);
  });
});
