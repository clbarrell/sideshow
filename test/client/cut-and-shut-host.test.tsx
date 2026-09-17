import { describe, expect, it, vi } from "vitest";

const countdowns = vi.hoisted(() => ({ instances: [] as Array<{ update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> }));

vi.mock("../../src/client/final-countdown", () => ({
  createFinalCountdown: () => {
    const countdown = { update: vi.fn(), destroy: vi.fn() };
    countdowns.instances.push(countdown);
    return countdown;
  },
}));
import {
  buildRoundBoard,
  createHost,
  CUT_AND_SHUT_RULES,
  layoutForRound,
  neighborInLayout,
  resolveCouriers,
  roadArms,
  roadDirection,
  type RoundBoard,
} from "../../src/client/games/cut-and-shut/host";
import type { CutAndShutFrame } from "../../src/client/games/cut-and-shut/protocol";

function player(id: string, seat: number) {
  return { id, name: `Player ${seat + 1}`, seat, color: `hsl(${seat * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

function game(count = 2, seed = 17) {
  const messages: { data: unknown; to?: string }[] = [];
  const roster = Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index));
  const host = createHost({
    players: roster,
    seed,
    width: 1280,
    height: 720,
    send: (data, to) => messages.push({ data, to }),
  });
  return { host, messages, roster, seed };
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
      ? (value: string) => labels.push(value)
      : key === "measureText"
        ? (value: string) => ({ width: value.length * 9 })
        : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

function safe(board: RoundBoard): RoundBoard {
  return {
    ...board,
    tiles: board.tiles.map((tile) => ({ ...tile, rotation: tile.safeRotation })),
  };
}

function solveRound(
  host: ReturnType<typeof createHost>,
  messages: { data: unknown; to?: string }[],
  roster: ReturnType<typeof player>[],
  seed: number,
  round: number,
) {
  const board = buildRoundBoard(seed, round, roster);
  for (const member of roster) {
    const tile = board.tiles.find((candidate) => candidate.ownerId === member.id)!;
    const frame = latest(messages, member.id)!;
    host.onInput(member.id, { t: "rotate", round: round + 1, seq: frame.inputSeq + 1, rotation: tile.safeRotation });
  }
}

describe("Cut & Shut road circuit", () => {
  it("keeps five valid physical fold layouts", () => {
    const signatures = new Set<string>();
    for (let round = 0; round <= 4; round += 1) {
      const layout = layoutForRound(round);
      expect([...layout].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, index) => index));
      signatures.add(layout.join(","));
    }
    expect(signatures.size).toBe(5);
  });

  it("derives travel only from visible road arms", () => {
    expect(roadDirection("straight", 0, 1)).toBe(1);
    expect(roadDirection("straight", 1, 1)).toBeNull();
    expect(roadDirection("bend", 0, 2)).toBe(1);
    expect(roadDirection("bend", 0, 1)).toBeNull();
    expect(roadDirection("junction", 3, 3)).toBe(3);
    expect(roadArms("straight", 0)).toEqual([1, 3]);
    expect(roadArms("bend", 2)).toEqual([2, 3]);
    expect(neighborInLayout(layoutForRound(0), 0, 3)).toBeNull();
  });

  it("builds a safe six-beat baseline for 2–10 players across seeds and folds", () => {
    for (const count of [2, 3, 6, 10]) {
      const roster = Array.from({ length: count }, (_, index) => player(`p${index}`, index));
      for (const seed of [1, 17, 77, 2026]) {
        for (let round = 0; round < 4; round += 1) {
          const board = buildRoundBoard(seed, round, roster);
          expect(board.tiles.filter((tile) => tile.ownerId)).toHaveLength(count);
          expect(new Set(board.tiles.filter((tile) => tile.ownerId).map((tile) => tile.id)).size).toBe(count);
          expect(board.tiles.filter((tile) => tile.ownerId).every((tile) => tile.rotation !== tile.safeRotation)).toBe(true);
          const resolved = resolveCouriers(board.couriers, board.layout, safe(board).tiles);
          expect(resolved.summary).toEqual(expect.objectContaining({ steps: 6, survivors: 6 }));
        }
      }
    }
  });

  it("makes owned rotation materially change the shared route", () => {
    const board = buildRoundBoard(17, 0, [player("p1", 0), player("p2", 1)]);
    expect(resolveCouriers(board.couriers, board.layout, board.tiles).summary.survivors).toBeLessThan(6);
    expect(resolveCouriers(board.couriers, board.layout, safe(board).tiles).summary.survivors).toBe(6);
  });
});

describe("Cut & Shut host journey", () => {
  it("wires only the planning clock into the shared final-ten countdown", () => {
    const { host } = game();
    const countdown = countdowns.instances.at(-1)!;
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    expect(countdown.update).toHaveBeenLastCalledWith(expect.closeTo(CUT_AND_SHUT_RULES.planningSeconds, 8));

    tickFor(host, 8.05);
    expect(countdown.update).toHaveBeenLastCalledWith(expect.closeTo(9.95, 2));

    tickFor(host, CUT_AND_SHUT_RULES.planningSeconds - 8.05);
    expect(countdown.update).toHaveBeenLastCalledWith(null);
    host.destroy?.();
    expect(countdown.destroy).toHaveBeenCalledOnce();
  });

  it.each([2, 10])("gives each of %i players one named road and only accepts their own rotation", (count) => {
    const { host, messages } = game(count);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    const before = Array.from({ length: count }, (_, index) => latest(messages, `p${index + 1}`)!);
    expect(before.every((frame) => frame.phase === "planning" && frame.road !== null)).toBe(true);
    host.onInput("p1", { t: "rotate", round: 1, seq: 1, rotation: (before[0].road!.rotation + 1) % 4 });
    tickFor(host, 0.5);
    expect(latest(messages, "p1")!.road!.rotation).not.toBe(before[0].road!.rotation);
    for (let index = 1; index < count; index += 1) {
      expect(latest(messages, `p${index + 1}`)!.road!.rotation).toBe(before[index].road!.rotation);
    }
  });

  it("rejects malformed, stale, replayed, future and wrong-round rotations", () => {
    const { host, messages } = game();
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    const start = latest(messages, "p1")!;
    const next = (start.road!.rotation + 1) % 4;
    expect(() => host.onInput("p1", null)).not.toThrow();
    host.onInput("p1", { t: "rotate", round: 1, seq: 1, rotation: next });
    host.onInput("p1", { t: "rotate", round: 1, seq: 1, rotation: (next + 1) % 4 });
    host.onInput("p1", { t: "rotate", round: 2, seq: 2, rotation: (next + 2) % 4 });
    host.onInput("p1", { t: "rotate", round: 1, seq: 999, rotation: (next + 3) % 4 });
    host.onInput("p1", { t: "rotate", round: 1, seq: 2, rotation: 8 });
    tickFor(host, 0.5);
    expect(latest(messages, "p1")).toEqual(expect.objectContaining({ inputSeq: 1, road: expect.objectContaining({ rotation: next }) }));
  });

  it("restores a disconnected road safely and preserves that ownership on reconnect", () => {
    const { host, messages, roster, seed } = game(2, 77);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    solveRound(host, messages, roster, seed, 0);
    tickFor(host, 0.5);
    expect(latest(messages, "p1")!.safeCouriers).toBe(6);
    const solvedRotation = latest(messages, "p2")!.road!.rotation;
    host.onInput("p2", { t: "rotate", round: 1, seq: 2, rotation: (solvedRotation + 1) % 4 });
    tickFor(host, 0.5);
    expect(latest(messages, "p1")!.safeCouriers).toBeLessThan(6);
    host.onConnectionChange?.("p2", false);
    expect(latest(messages, "p1")!.safeCouriers).toBe(6);
    host.onConnectionChange?.("p2", true);
    expect(latest(messages, "p2")!.road!.rotation).toBe(solvedRotation);
    expect(latest(messages, "p2")!.inputSeq).toBe(2);
  });

  it("uses current planning rotations, resolves exactly six beats, and awards one shared point per survivor", () => {
    const { host, messages, roster, seed } = game(2, 17);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    solveRound(host, messages, roster, seed, 0);
    tickFor(host, CUT_AND_SHUT_RULES.planningSeconds);
    expect(latest(messages, "p1")!.phase).toBe("march");
    tickFor(host, CUT_AND_SHUT_RULES.beatSeconds * 5.9);
    expect(latest(messages, "p1")!.phase).toBe("march");
    tickFor(host, CUT_AND_SHUT_RULES.beatSeconds * 0.1 + 0.05);
    expect(latest(messages, "p1")).toEqual(expect.objectContaining({ phase: "recap", survivors: 6, teamScore: 6 }));
    expect(host.results().every((result) => result.score === 6 && result.place === 1)).toBe(true);
  });

  it("folds before each later planning phase and completes four shared rounds", () => {
    const { host, messages } = game(10, 77);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds + CUT_AND_SHUT_RULES.planningSeconds + 6 + CUT_AND_SHUT_RULES.recapSeconds);
    expect(latest(messages, "p1")!.phase).toBe("fold");
    tickFor(host, CUT_AND_SHUT_RULES.foldSeconds);
    expect(latest(messages, "p1")!.phase).toBe("planning");
    tickFor(host, 140);
    expect(host.isOver()).toBe(true);
    const results = host.results();
    expect(results).toHaveLength(10);
    expect(new Set(results.map(({ score }) => score)).size).toBe(1);
    expect(results.every(({ place, score }) => place === 1 && score >= 0 && score <= 24)).toBe(true);
  });

  it("keeps all 24 courier runs alive when every road is repaired", () => {
    const { host, messages, roster, seed } = game(2, 31);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    for (let round = 0; round < 4; round += 1) {
      solveRound(host, messages, roster, seed, round);
      tickFor(host, CUT_AND_SHUT_RULES.planningSeconds + 6);
      expect(latest(messages, "p1")!.survivors).toBe(6);
      tickFor(host, CUT_AND_SHUT_RULES.recapSeconds);
      if (round < 3) tickFor(host, CUT_AND_SHUT_RULES.foldSeconds);
    }
    expect(host.results().map(({ place, score }) => ({ place, score }))).toEqual([
      { place: 1, score: 24 },
      { place: 1, score: 24 },
    ]);
  });

  it("makes late joiners spectators and removes departed players from results", () => {
    const { host, messages } = game(2);
    host.onJoin?.(player("late", 7));
    expect(latest(messages, "late")).toEqual(expect.objectContaining({ phase: "spectator", road: null }));
    host.onLeave?.("p2");
    expect(host.results().map(({ id }) => id)).toEqual(["p1"]);
  });

  it("coalesces turn bursts onto targeted 2 Hz snapshots", () => {
    const { host, messages } = game(10);
    tickFor(host, CUT_AND_SHUT_RULES.runwaySeconds);
    messages.length = 0;
    for (let index = 0; index < 10; index += 1) {
      const id = `p${index + 1}`;
      const rotation = latest(messages, id)?.road?.rotation ?? 0;
      for (let seq = 1; seq <= 10; seq += 1) host.onInput(id, { t: "rotate", round: 1, seq, rotation: (rotation + seq) % 4 });
    }
    expect(messages).toHaveLength(0);
    tickFor(host, 1);
    expect(messages).toHaveLength(20);
    expect(messages.every(({ to }) => typeof to === "string")).toBe(true);
  });

  it("renders names on owned roads, the shared goal, and no numbered courier labels", () => {
    const { host } = game(10);
    const labels: string[] = [];
    host.render(recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("KEEP ALL SIX ON THE ROAD");
    expect(labels).toContain("FIND YOUR NAME · YOUR PHONE TURNS THAT ROAD");
    expect(labels.filter((label) => /^Player \d+$/.test(label))).toHaveLength(10);
    expect(labels.some((label) => /^C\d/.test(label))).toBe(false);
  });
});
