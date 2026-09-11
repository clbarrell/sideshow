import { describe, expect, it } from "vitest";
import {
  createHost,
  edgeMarkerPoint,
  proximityPartition,
  ratchetDimension,
  SPLIT_RULES,
  type SplitPhoneFrames,
  uniqueLargestPartition,
} from "../../src/client/games/split/host";

function player(id: string, seat: number) {
  return { id, name: id.toUpperCase(), seat, color: `hsl(${seat * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

function tickFor(game: ReturnType<typeof createHost>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) game.tick(Math.min(0.05, seconds - elapsed));
}

function recordingCanvas(labels: string[] = [], scales: number[] = []) {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => key === "fillText"
      ? (text: string) => labels.push(text)
      : key === "measureText"
        ? (text: string) => ({ width: text.length * 14 })
        : key === "scale"
          ? (x: number) => scales.push(x)
          : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

function host(count = 3) {
  const messages: { to?: string; data: unknown }[] = [];
  const game = createHost({
    players: Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index)),
    seed: 7,
    width: 1280,
    height: 720,
    send: (data, to) => {
      if (data && typeof data === "object" && (data as SplitPhoneFrames).t === "splitStates") {
        for (const [id, frame] of Object.entries((data as SplitPhoneFrames).frames)) messages.push({ to: id, data: frame });
      } else messages.push({ data, to });
    },
  });
  return { game, messages };
}

describe("Split proximity rules", () => {
  it("holds an existing tether through the exit band but does not acquire a new one there", () => {
    const points = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 190, y: 0 }];
    expect(proximityPartition(points).components).toHaveLength(2);
    const linked = proximityPartition([{ ...points[0] }, { ...points[1], x: 160 }]);
    expect(linked.components).toHaveLength(1);
    expect(proximityPartition(points, linked.links).components).toHaveLength(1);
  });

  it("scales tether hysteresis at the dimension floor to preserve its screen-space size", () => {
    const floorScale = SPLIT_RULES.dimensionFloor;
    const points = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }];
    expect(proximityPartition(points, new Set(), floorScale).components).toHaveLength(2);

    const initialLink = proximityPartition([{ ...points[0] }, { ...points[1], x: 160 }]);
    expect(proximityPartition(points, initialLink.links, floorScale).components).toHaveLength(1);
    expect(proximityPartition([{ ...points[0] }, { ...points[1], x: 110 }], initialLink.links, floorScale).components).toHaveLength(2);
  });

  it("never chooses among equal largest groups", () => {
    expect(uniqueLargestPartition([["a", "b"], ["c", "d"]])).toBeNull();
    expect(uniqueLargestPartition([["a", "b"], ["c"]])?.keep).toEqual(["a", "b"]);
  });

  it("ratchets area by 18% to a stable 28% floor", () => {
    let width = 1000;
    for (let cut = 0; cut < 20; cut++) width = ratchetDimension(width, 1000);
    expect(width).toBeCloseTo(1000 * Math.sqrt(0.28));
    expect(ratchetDimension(width, 1000)).toBe(width);
  });

  it("keeps ten duplicate edge owners distinct and on the visible perimeter", () => {
    for (const frame of [
      { x: 0, y: 0, w: 1000, h: 562 },
      { x: 40, y: -20, w: 1000 * Math.sqrt(0.28), h: 562 * Math.sqrt(0.28) },
    ]) {
      for (const segment of [0, 1]) {
        const points = Array.from({ length: 10 }, (_, index) => edgeMarkerPoint(frame, segment, index, 10));
        expect(new Set(points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)).size).toBe(10);
        for (const [x, y] of points) {
          expect(x).toBeGreaterThanOrEqual(frame.x - frame.w / 2);
          expect(x).toBeLessThanOrEqual(frame.x + frame.w / 2);
          expect(y).toBeGreaterThanOrEqual(frame.y - frame.h / 2);
          expect(y).toBeLessThanOrEqual(frame.y + frame.h / 2);
        }
      }
    }
  });
});

describe("Split host journey", () => {
  it("keeps ten-player feedback at 10Hz within the host message budget", () => {
    const sends: { data: unknown; at: number; to?: string }[] = [];
    let clock = 0;
    const game = createHost({
      players: Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index)),
      seed: 7, width: 1280, height: 720,
      send: (data, to) => sends.push({ data, to, at: clock }),
    });
    for (; clock < 12; clock += 0.05) game.tick(0.05);
    const batches = sends.filter(({ data }) => (data as { t?: string }).t === "splitStates");
    expect(batches.length).toBeGreaterThanOrEqual(115);
    expect(batches.every(({ data, to }) => !to && Object.keys((data as SplitPhoneFrames).frames).length === 10)).toBe(true);
    // Include startup/GO cue bursts, not only the steady status cadence.
    for (const { at } of sends) expect(sends.filter((send) => send.at >= at && send.at < at + 1).length).toBeLessThanOrEqual(22);
    game.destroy();
  });

  it("lets players move during grace but cannot resolve a cut before ten seconds", () => {
    const { game, messages } = host();
    game.onInput("p1", { x: 0, y: 1 });
    tickFor(game, 9.9);
    expect(messages.some(({ data }) => (data as { phase?: string }).phase === "cut")).toBe(false);
    expect(game.results().find((row) => row.id === "p1")?.detail).toContain("55s alive");

    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("1");
    expect(labels).toContain("55s HEAT · SURVIVE +1 / 8s · FINISH +3 · EDGE KO +2");
  });

  it("arms only a stable unique-largest split, cuts the minority, and zooms the tighter frame", () => {
    const { game, messages } = host();
    const before: number[] = [];
    game.render(recordingCanvas([], before), 1280, 720);

    game.onInput("p1", { x: 0, y: 1 });
    tickFor(game, 2.3);
    game.onInput("p1", { x: 0, y: 0 });
    tickFor(game, SPLIT_RULES.graceSeconds - 2.3 + SPLIT_RULES.acquireSeconds + SPLIT_RULES.cutSeconds + 0.3);

    const p1Frames = messages
      .filter(({ to, data }) => to === "p1" && (data as { t?: string }).t === "splitState")
      .map(({ data }) => data as { role: string; target: string | null });
    expect(p1Frames.at(-1)).toEqual(expect.objectContaining({ role: "edge" }));
    expect(p1Frames.at(-1)?.target).not.toBeNull();
    const after: number[] = [];
    game.render(recordingCanvas([], after), 1280, 720);
    expect(after[0]).toBeGreaterThan(before[0]);
  });

  it("shows a tie instead of starting an arbitrary cut", () => {
    const { game } = host(4);
    game.onInput("p1", { x: 1, y: 0 });
    game.onInput("p2", { x: 1, y: 0 });
    tickFor(game, 2.3);
    game.onInput("p1", { x: 0, y: 0 });
    game.onInput("p2", { x: 0, y: 0 });
    tickFor(game, 8.2);
    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("TIE — MOVE");
    expect(labels).toContain("NO GROUP WILL BE CHOSEN");
  });

  it("cancels an armed cut when movement changes the partition into a tie", () => {
    const { game, messages } = host(4);
    game.onInput("p1", { x: 1, y: 0 });
    tickFor(game, 2.3);
    game.onInput("p1", { x: 0, y: 0 });
    tickFor(game, 8.5);
    expect(messages.some(({ data }) => (data as { phase?: string }).phase === "cut")).toBe(true);

    game.onInput("p2", { x: 1, y: 0 });
    tickFor(game, 2.3);
    game.onInput("p2", { x: 0, y: 0 });
    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("TIE — MOVE");
    const latestP1 = messages.filter(({ to, data }) => to === "p1" && (data as { t?: string }).t === "splitState").at(-1)?.data;
    expect(latestP1).toEqual(expect.objectContaining({ role: "survivor", cut: null }));
  });

  it("keeps an armed countdown running while a crossing flips which group is safe", () => {
    const { game, messages } = host(6);
    // Establish 3 / 2 / 1. The third component means P3 can briefly bridge
    // the two crowds without ever producing one reunited graph.
    game.onInput("p1", { x: 1, y: 0 });
    game.onInput("p2", { x: 1, y: 0 });
    game.onInput("p3", { x: 1, y: 0 });
    game.onInput("p6", { x: 0, y: 1 });
    tickFor(game, 1.15);
    game.onInput("p1", { x: 0, y: 0 });
    game.onInput("p2", { x: 0, y: 0 });
    game.onInput("p3", { x: 0, y: 0 });
    tickFor(game, 1.15);
    game.onInput("p6", { x: 0, y: 0 });
    tickFor(game, SPLIT_RULES.graceSeconds - 2.3 + SPLIT_RULES.acquireSeconds + 0.2);

    const before = latestState(messages, "p1");
    expect(before).toEqual(expect.objectContaining({ role: "survivor", phase: "cut" }));
    expect(before!.cut).toBeGreaterThan(3.5);

    // P3 crosses from the three-player right group to the two-player left
    // group. It briefly bridges them, then flips SAFE to P3/P4/P5 without
    // buying a fresh countdown.
    game.onInput("p3", { x: -1, y: 0 });
    tickFor(game, 1.1);
    game.onInput("p3", { x: 0, y: 0 });
    const after = latestState(messages, "p1");
    expect(after?.cut).toBeLessThan(before!.cut! - 0.8);

    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("SAFE");
    expect(labels).toContain("CUT");
    expect(labels).toContain("SAFE 3 · CUT 3 · JOIN THE BIGGER GROUP");

    tickFor(game, 3);
    expect(latestState(messages, "p1")).toEqual(expect.objectContaining({ role: "edge" }));
    expect(latestState(messages, "p4")).toEqual(expect.objectContaining({ role: "survivor" }));
  });

  it("pauses a final-second cut for signal-loss grace and resumes after reconnect", () => {
    const { game, messages } = host();
    game.onInput("p1", { x: 0, y: 1 });
    tickFor(game, 2.3);
    game.onInput("p1", { x: 0, y: 0 });
    tickFor(game, SPLIT_RULES.graceSeconds - 2.3 + SPLIT_RULES.acquireSeconds + 3.65);
    const before = latestState(messages, "p1");
    expect(before?.cut).toBeGreaterThan(0);
    expect(before?.cut).toBeLessThan(0.6);

    game.onConnectionChange?.("p2", false);
    tickFor(game, 0.8);
    const paused = latestState(messages, "p1");
    expect(paused).toEqual(expect.objectContaining({ role: "survivor", phase: "cut" }));
    expect(paused!.cut).toBeCloseTo(before!.cut!, 4);
    const labels: string[] = [];
    game.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("SIGNAL LOST · CUT PAUSED");

    game.onConnectionChange?.("p2", true);
    tickFor(game, 0.7);
    expect(latestState(messages, "p1")).toEqual(expect.objectContaining({ role: "edge" }));
  });

  it("neutralizes a disconnect, shows its grace, then promotes the player to the edge without KO credit", () => {
    const { game, messages } = host();
    game.onConnectionChange?.("p1", false);
    tickFor(game, 0.2);
    expect(messages.some(({ to, data }) => to === "p1" && String((data as { status?: string }).status).includes("Signal lost"))).toBe(true);
    tickFor(game, SPLIT_RULES.disconnectSeconds);
    const last = messages.filter(({ to, data }) => to === "p1" && (data as { t?: string }).t === "splitState").at(-1)?.data;
    expect(last).toEqual(expect.objectContaining({ role: "edge" }));
    expect(game.results().find((row) => row.id === "p1")?.detail).toContain("0 edge KOs");
  });

  it("queues simultaneous edge pushes and starts them in a fair spaced order", () => {
    const { game, messages } = host();
    game.onJoin?.(player("late1", 8));
    game.onJoin?.(player("late2", 9));
    tickFor(game, 1.3);
    game.onInput("late1", { x: 1, y: 0 });
    game.onInput("late2", { x: 1, y: 0 });
    expect(messages.filter(({ data }) => (data as { cue?: string }).cue === "push")).toHaveLength(1);
    tickFor(game, 0.1);
    const queued = messages.filter(({ to, data }) => to === "late2" && (data as { t?: string }).t === "splitState").at(-1)?.data;
    expect(queued).toEqual(expect.objectContaining({ role: "edge", target: "E", queued: true }));
    tickFor(game, 0.8);
    expect(messages.filter(({ data }) => (data as { cue?: string }).cue === "push")).toHaveLength(2);
  });

  it("credits a telegraphed edge KO and enforces cooldown plus neutral re-arm", () => {
    const { game, messages } = host();
    game.onJoin?.(player("late", 8));
    game.onInput("p2", { x: 1, y: 0 });
    tickFor(game, 2.4);
    game.onInput("p2", { x: 0, y: 0 });
    game.onInput("late", { x: 1, y: 0 });
    tickFor(game, 0.8);
    expect(game.results().find((row) => row.id === "late")?.detail).toContain("1 edge KO");

    game.onInput("late", { x: 0, y: 0 });
    game.onInput("late", { x: 1, y: 0 });
    expect(messages.filter(({ to, data }) => to === "late" && (data as { cue?: string }).cue === "push")).toHaveLength(1);
    tickFor(game, SPLIT_RULES.edgeCooldown);
    game.onInput("late", { x: 0, y: 0 });
    game.onInput("late", { x: 1, y: 0 });
    expect(messages.filter(({ to, data }) => to === "late" && (data as { cue?: string }).cue === "push")).toHaveLength(2);
  });

  it("freezes an edge target through the complete warning and resolves the original edge", () => {
    const { game, messages } = host();
    game.onJoin?.(player("late", 8));
    game.onInput("p2", { x: 1, y: 0 });
    tickFor(game, 2.4);
    game.onInput("p2", { x: 0, y: 0 });
    game.onInput("late", { x: 1, y: 0 });
    tickFor(game, 0.6);
    game.onInput("late", { x: -1, y: 0 });
    tickFor(game, 0.1);
    expect(latestState(messages, "late")).toEqual(expect.objectContaining({ target: "E", status: "Strike locked at E · KOs +2" }));
    tickFor(game, 0.1);
    expect(game.results().find(({ id }) => id === "late")?.detail).toContain("1 edge KO");
    expect(latestState(messages, "p2")).toEqual(expect.objectContaining({ role: "edge" }));
  });

  it("forecasts a fixed rift for four seconds and lets a targeted player dodge it", () => {
    const { game, messages } = host();
    tickFor(game, SPLIT_RULES.firstRift + 0.1);
    expect(latestState(messages, "p1")).toEqual(expect.objectContaining({ role: "survivor", rift: expect.any(Number) }));
    tickFor(game, 3.6);
    expect(latestState(messages, "p1")).toEqual(expect.objectContaining({ role: "survivor" }));
    game.onInput("p1", { x: 1, y: 0 });
    tickFor(game, 0.3);
    expect(latestState(messages, "p1")).toEqual(expect.objectContaining({ role: "survivor" }));
    tickFor(game, 0.2);
    expect(latestState(messages, "p1")).toEqual(expect.objectContaining({ role: "edge" }));

    const dodging = host();
    tickFor(dodging.game, SPLIT_RULES.firstRift + 0.1);
    dodging.game.onInput("p1", { x: 1, y: 0 });
    tickFor(dodging.game, 0.7);
    dodging.game.onInput("p1", { x: 0, y: 0 });
    tickFor(dodging.game, 3.5);
    expect(latestState(dodging.messages, "p1")).toEqual(expect.objectContaining({ role: "survivor" }));
  });

  it("returns compact deterministic party scores after a 55-second heat", () => {
    const { game } = host();
    tickFor(game, SPLIT_RULES.roundSeconds + 2.1);
    expect(game.isOver()).toBe(true);
    const results = game.results();
    expect(results.every(({ score }) => Number.isInteger(score) && score <= 9)).toBe(true);
    expect(results.map(({ place }) => place)).toEqual([1, 2, 3]);
    expect(results.every(({ detail }) => !detail.includes("55s alive"))).toBe(true);
  });

  it("ignores malformed phone payloads", () => {
    const { game } = host();
    expect(() => game.onInput("p1", null)).not.toThrow();
    expect(() => game.onInput("p1", [])).not.toThrow();
    expect(() => game.onInput("p1", "north")).not.toThrow();
  });

  it("renders ten distinct identities and ends after all survivor signals expire", () => {
    const ten = host(10).game;
    const labels: string[] = [];
    expect(() => ten.render(recordingCanvas(labels), 1920, 1080)).not.toThrow();
    for (let seat = 1; seat <= 10; seat++) expect(labels).toContain(String(seat));

    const empty = host(3).game;
    empty.onConnectionChange?.("p1", false);
    empty.onConnectionChange?.("p2", false);
    empty.onConnectionChange?.("p3", false);
    tickFor(empty, SPLIT_RULES.disconnectSeconds + 2.1);
    expect(empty.isOver()).toBe(true);
  });
});

function latestState(messages: { to?: string; data: unknown }[], id: string) {
  return messages
    .filter(({ to, data }) => to === id && (data as { t?: string }).t === "splitState")
    .map(({ data }) => data as { role: string; phase: string; cut: number | null })
    .at(-1);
}
