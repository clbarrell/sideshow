import { describe, expect, it, vi } from "vitest";
import {
  BORDERLINE_RULES,
  createBorderlineCampaign,
  createHost,
  fallbackOrder,
  freezeLegalTargets,
  isLegalOrder,
  legalTargets,
  resolveTurn,
  type ResolvedOrder,
} from "../../src/client/games/borderline/host";
import type { BorderlineFrame, Force } from "../../src/client/games/borderline/protocol";
import { BORDERLINE_TUTORIAL_SECONDS, BORDERLINE_TUTORIAL_STEPS } from "../../src/client/games/borderline/tutorial";
import { PORTS, PROVINCES, worldForPlayerCount } from "../../src/client/games/borderline/world";

vi.mock("../../src/client/final-countdown", () => ({ createFinalCountdown: () => ({ update: vi.fn(), destroy: vi.fn() }) }));

function player(id: string, seat: number) {
  return { id, name: ["Alex", "Sam", "Jo", "Chris", "Max", "Lee", "Pat", "Kim", "Ash", "Rob"][seat] ?? id, seat, color: `hsl(${seat * 36} 75% 55%)`, connected: true, ready: true, awayAt: null };
}

function game(seed = 17, playerCount = 10) {
  const messages: Array<{ data: unknown; to?: string }> = [];
  const roster = Array.from({ length: playerCount }, (_, index) => player(`p${index + 1}`, index));
  const host = createHost({ players: roster, seed, width: 1920, height: 1080, send: (data, to) => messages.push({ data, to }) });
  return { host, messages, roster };
}

function tickFor(host: ReturnType<typeof createHost>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) host.tick(Math.min(0.05, seconds - elapsed));
}

function latest(messages: Array<{ data: unknown; to?: string }>, id: string) {
  return messages.filter(({ data, to }) => to === id && (data as { t?: string }).t === "borderlineState").at(-1)?.data as BorderlineFrame | undefined;
}

function toFirstPlanning(host: ReturnType<typeof createHost>) {
  tickFor(host, BORDERLINE_RULES.runwaySeconds + BORDERLINE_RULES.practiceSeconds + BORDERLINE_RULES.practiceRevealSeconds + BORDERLINE_RULES.countdownSeconds);
}

function commitGuard(host: ReturnType<typeof createHost>, messages: Array<{ data: unknown; to?: string }>, id: string, force?: Force) {
  const frame = latest(messages, id)!;
  const selectedForce = force ?? frame.availableForces[0];
  host.onInput(id, { t: "order", turn: frame.turn, seq: frame.inputSeq + 1, mode: "guard", target: frame.legalGuards[0], force: selectedForce });
}

function recordingCanvas(labels: string[]) {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, key) => key === "fillText"
      ? (value: string) => labels.push(value)
      : key === "measureText" ? (value: string) => ({ width: value.length * 9 })
        : key === "createLinearGradient" ? () => ({ addColorStop: () => undefined })
          : (Reflect.get(target, key) ?? (() => undefined)),
  });
}

function shortestDistanceToAnotherHome(world: ReturnType<typeof worldForPlayerCount>, home: number) {
  const otherHomes = new Set(world.ports.map((port) => port.home).filter((id) => id !== home));
  const seen = new Set([home]);
  let frontier = [home];
  for (let distance = 1; frontier.length > 0; distance += 1) {
    const next = frontier.flatMap((id) => world.provinces[id - 1].neighbors).filter((id) => !seen.has(id));
    if (next.some((id) => otherHomes.has(id))) return distance;
    next.forEach((id) => seen.add(id));
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

describe("Borderline combat law", () => {
  it.each([
    { name: "Force 1 takes unguarded neutral land", owner: undefined, orders: [{ playerId: "a", mode: "invade", target: 8, force: 1 }], expected: "a" },
    { name: "Force 1 takes unguarded occupied land", owner: "d", orders: [{ playerId: "a", mode: "invade", target: 8, force: 1 }], expected: "a" },
    { name: "Guard 1 holds against Force 1", owner: "d", orders: [{ playerId: "d", mode: "guard", target: 8, force: 1 }, { playerId: "a", mode: "invade", target: 8, force: 1 }], expected: "d" },
    { name: "Force 2 beats Guard 1", owner: "d", orders: [{ playerId: "d", mode: "guard", target: 8, force: 1 }, { playerId: "a", mode: "invade", target: 8, force: 2 }], expected: "a" },
    { name: "Force 3 beats Guard 2", owner: "d", orders: [{ playerId: "d", mode: "guard", target: 8, force: 2 }, { playerId: "a", mode: "invade", target: 8, force: 3 }], expected: "a" },
    { name: "Guard 3 holds against Force 3", owner: "d", orders: [{ playerId: "d", mode: "guard", target: 8, force: 3 }, { playerId: "a", mode: "invade", target: 8, force: 3 }], expected: "d" },
    { name: "tied strongest leaves the flag", owner: "d", orders: [{ playerId: "a", mode: "invade", target: 8, force: 3 }, { playerId: "b", mode: "invade", target: 8, force: 3 }, { playerId: "c", mode: "invade", target: 8, force: 2 }], expected: "d" },
    { name: "unique strongest captures", owner: "d", orders: [{ playerId: "a", mode: "invade", target: 8, force: 3 }, { playerId: "b", mode: "invade", target: 8, force: 2 }], expected: "a" },
  ])("$name", ({ owner, orders, expected }) => {
    const owners = new Map<number, string>();
    if (owner) owners.set(8, owner);
    expect(resolveTurn(owners, orders as ResolvedOrder[]).owners.get(8)).toBe(expected);
  });

  it("resolves swaps simultaneously and independently of input order", () => {
    const owners = new Map([[1, "a"], [2, "b"]]);
    const orders: ResolvedOrder[] = [
      { playerId: "a", mode: "invade", target: 2, force: 1 },
      { playerId: "b", mode: "invade", target: 1, force: 2 },
    ];
    expect([...resolveTurn(owners, orders).owners]).toEqual([...resolveTurn(owners, [...orders].reverse()).owners]);
    expect(resolveTurn(owners, orders).owners).toEqual(new Map([[1, "b"], [2, "a"]]));
  });
});

describe("Borderline campaign host", () => {
  it("holds five numbered narrated lessons for their authored reading windows, then gives 25 seconds to practice", () => {
    expect(BORDERLINE_TUTORIAL_STEPS.map(({ seconds }) => seconds)).toEqual([14, 17, 15, 16, 18]);
    expect(BORDERLINE_RULES.runwaySeconds).toBe(BORDERLINE_TUTORIAL_SECONDS);
    expect(BORDERLINE_RULES.practiceSeconds).toBe(25);
    const { host, messages } = game();
    let elapsed = 0;
    BORDERLINE_TUTORIAL_STEPS.forEach((lesson, index) => {
      const labels: string[] = [];
      host.render(recordingCanvas(labels), 1920, 1080);
      expect(labels).toContain(`STEP ${index + 1} OF 5`);
      expect(labels).toContain(lesson.title);
      expect(labels.join(" ")).toContain(lesson.narration.split(" ").slice(0, 4).join(" "));
      tickFor(host, lesson.seconds + 0.001);
      elapsed += lesson.seconds;
    });
    expect(elapsed).toBe(80);
    expect(latest(messages, "p1")?.phase).toBe("practice");
  });

  it.each([
    [3, 4, 3, 12], [4, 4, 3, 12], [5, 5, 3, 15], [6, 5, 3, 15],
    [7, 6, 3, 18], [8, 6, 3, 18], [9, 6, 4, 24], [10, 6, 4, 24],
  ])("builds a balanced reciprocal atlas for %i players", (playerCount, columns, rows, provinceCount) => {
    const world = worldForPlayerCount(playerCount);
    expect([world.cols, world.rows, world.provinces.length]).toEqual([columns, rows, provinceCount]);
    expect(world.provinces.map(({ id }) => id)).toEqual(Array.from({ length: provinceCount }, (_, index) => index + 1));
    for (const item of world.provinces) for (const neighbor of item.neighbors) expect(world.provinces[neighbor - 1].neighbors).toContain(item.id);
    expect(world.ports).toHaveLength(playerCount);
    expect(new Set(world.ports.map((port) => port.home)).size).toBe(playerCount);
    const nearestHomeDistances = world.ports.map((port) => shortestDistanceToAnotherHome(world, port.home));
    expect(Math.max(...nearestHomeDistances)).toBeLessThanOrEqual(playerCount === 3 ? 3 : 2);
    for (const port of world.ports) {
      const row = Math.floor((port.home - 1) / columns);
      const col = (port.home - 1) % columns;
      expect(row === 0 || row === rows - 1 || col === 0 || col === columns - 1).toBe(true);
      expect(port.entries).toHaveLength(2);
      expect(port.entries.every((id) => id >= 1 && id <= provinceCount)).toBe(true);
      expect(world.provinces[port.entries[0] - 1].neighbors).toContain(port.entries[1]);
    }
    const roster = Array.from({ length: playerCount }, (_, index) => player(`p${index + 1}`, index));
    const campaign = createBorderlineCampaign(roster, 81);
    const restart = createBorderlineCampaign([...roster].reverse(), 81);
    expect([...campaign.owners]).toEqual([...restart.owners]);
    expect(new Set(campaign.owners.values()).size).toBe(playerCount);
    const neutralChoices = [...campaign.players].map(([id]) => legalTargets(campaign, id).invade.filter((target) => !campaign.owners.has(target)).length);
    expect(Math.min(...neutralChoices)).toBeGreaterThanOrEqual(1);
    const neutralSpread = Math.max(...neutralChoices) - Math.min(...neutralChoices);
    expect(neutralSpread).toBeLessThanOrEqual(playerCount === 10 ? 2 : 1);
    expect([...campaign.players.values()].some(({ factionIndex, portIndex }) => factionIndex !== portIndex)).toBe(true);
    const first = campaign.players.values().next().value!;
    for (const [provinceId, owner] of [...campaign.owners]) if (owner === first.player.id) campaign.owners.delete(provinceId);
    expect(legalTargets(campaign, first.player.id).invade).toEqual(expect.arrayContaining([...campaign.world.ports[first.portIndex].entries]));
    expect(fallbackOrder(campaign, first.player.id)).toEqual({ mode: "pass", force: 1 });
  });

  it.each([[3, 4, 3, 12], [7, 6, 3, 18], [10, 6, 4, 24]])("publishes only the active atlas to a %i-player room", (playerCount, columns, rows, provinceCount) => {
    const { host, messages } = game(17, playerCount);
    tickFor(host, BORDERLINE_RULES.runwaySeconds);
    const frame = latest(messages, "p1")!;
    expect([frame.columns, frame.rows, frame.provinces.length]).toEqual([columns, rows, provinceCount]);
    expect([...frame.legalInvades, ...frame.legalGuards].every((target) => target <= provinceCount)).toBe(true);
    const before = messages.length;
    host.onInput("p1", { t: "order", turn: 0, seq: 1, mode: "invade", target: provinceCount + 1, force: 1 });
    expect(messages).toHaveLength(before);
    expect(() => host.render(recordingCanvas([]), 1920, 1080)).not.toThrow();
  });

  it("seeds faction identity and opening ownership deterministically", () => {
    const roster = Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index));
    const first = createBorderlineCampaign(roster, 81);
    const restart = createBorderlineCampaign([...roster].reverse(), 81);
    expect([...first.players].map(([id, state]) => [id, state.factionIndex])).toEqual([...restart.players].map(([id, state]) => [id, state.factionIndex]));
    expect([...first.owners]).toEqual([...restart.owners]);
    expect(new Set(first.owners.values()).size).toBe(10);
    const openingChoices = [...first.players].map(([id]) => legalTargets(first, id).invade.length);
    const neutralOpeningChoices = [...first.players].map(([id]) => legalTargets(first, id).invade.filter((target) => !first.owners.has(target)).length);
    expect(Math.min(...openingChoices)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...neutralOpeningChoices)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...openingChoices) - Math.min(...openingChoices)).toBeLessThanOrEqual(2);
  });

  it("keeps start-of-turn legality frozen when ownership later changes", () => {
    const roster = Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index));
    const campaign = createBorderlineCampaign(roster, 81);
    const playerId = "p1";
    const frozen = freezeLegalTargets(campaign);
    const originallyLegal = new Set(frozen.get(playerId)!.invade);
    const distant = PROVINCES.find((item) => !originallyLegal.has(item.id) && campaign.owners.get(item.id) !== playerId)!;
    const neighbor = distant.neighbors[0];
    campaign.owners.set(neighbor, playerId);
    expect(legalTargets(campaign, playerId).invade).toContain(distant.id);
    expect(isLegalOrder(campaign, playerId, { mode: "invade", target: distant.id, force: 1 }, frozen)).toBe(false);
  });

  it("acknowledges a complete order only to its owner and rejects malformed, stale and duplicate replacements", () => {
    const { host, messages } = game();
    tickFor(host, BORDERLINE_RULES.runwaySeconds);
    const before = latest(messages, "p1")!;
    messages.length = 0;
    const order = { t: "order", turn: 0, seq: 1, mode: "guard", target: before.legalGuards[0], force: 1 };
    host.onInput("p1", order);
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe("p1");
    expect(latest(messages, "p1")?.committed).toEqual(expect.objectContaining({ seq: 1, mode: "guard", force: 1 }));
    host.onInput("p1", { ...order, mode: "invade" });
    host.onInput("p1", { ...order, seq: 999 });
    host.onInput("p1", { ...order, seq: 2, turn: 1 });
    host.onInput("p1", { ...order, seq: 2, target: 99 });
    host.onInput("p1", null);
    expect(messages).toHaveLength(1);
  });

  it("keeps an acknowledged order through disconnect and restores the private frame on reconnect", () => {
    const { host, messages } = game();
    tickFor(host, BORDERLINE_RULES.runwaySeconds);
    commitGuard(host, messages, "p1", 1);
    host.onConnectionChange?.("p1", false);
    expect(latest(messages, "p1")?.committed?.force).toBe(1);
    host.onConnectionChange?.("p1", true);
    expect(latest(messages, "p1")).toEqual(expect.objectContaining({ committed: expect.objectContaining({ force: 1 }) }));
  });

  it("resets practice ownership, score and force inventory before the real campaign", () => {
    const { host, messages } = game();
    tickFor(host, BORDERLINE_RULES.runwaySeconds);
    const practice = latest(messages, "p1")!;
    const initialOwners = practice.provinces.map(({ ownerId }) => ownerId);
    host.onInput("p1", { t: "order", turn: 0, seq: 1, mode: "invade", target: practice.legalInvades[0], force: 3 });
    tickFor(host, BORDERLINE_RULES.practiceSeconds + BORDERLINE_RULES.practiceRevealSeconds + BORDERLINE_RULES.countdownSeconds);
    const real = latest(messages, "p1")!;
    expect(real.phase).toBe("planning");
    expect(real.turn).toBe(1);
    expect(real.provinces.map(({ ownerId }) => ownerId)).toEqual(initialOwners);
    expect(real.availableForces).toEqual([1, 2, 3]);
    expect(real.score).toBe(0);
  });

  it("shows a temporary practice capture on the projector before resetting it", () => {
    const { host, messages } = game();
    tickFor(host, BORDERLINE_RULES.runwaySeconds);
    const practice = latest(messages, "p1")!;
    const neutral = practice.legalInvades.find((target) => !practice.provinces[target - 1].ownerId)!;
    const beforeLabels: string[] = [];
    host.render(recordingCanvas(beforeLabels), 1920, 1080);
    host.onInput("p1", { t: "order", turn: 0, seq: 1, mode: "invade", target: neutral, force: 1 });
    tickFor(host, BORDERLINE_RULES.practiceSeconds + 1.6);
    const revealLabels: string[] = [];
    host.render(recordingCanvas(revealLabels), 1920, 1080);
    expect(revealLabels.filter((label) => label === "ALEX").length).toBeGreaterThan(beforeLabels.filter((label) => label === "ALEX").length);
    tickFor(host, BORDERLINE_RULES.practiceRevealSeconds - 1.6 + BORDERLINE_RULES.countdownSeconds);
    const real = latest(messages, "p1")!;
    expect(real.provinces[neutral - 1].ownerId).toBeNull();
    expect(real.score).toBe(0);
  });

  it("spends forces, banks territory every turn and refills after turns three and six", () => {
    const { host, messages } = game();
    toFirstPlanning(host);
    for (let turn = 1; turn <= 3; turn += 1) {
      for (let index = 1; index <= 10; index += 1) commitGuard(host, messages, `p${index}`);
      tickFor(host, BORDERLINE_RULES.planningSeconds + BORDERLINE_RULES.revealSeconds + BORDERLINE_RULES.recapSeconds);
      const frame = latest(messages, "p1")!;
      expect(frame.score).toBe(turn);
      expect(frame.availableForces).toEqual(turn === 1 ? [2, 3] : turn === 2 ? [3] : [1, 2, 3]);
    }
  });

  it("rejects reuse of a spent force without replacing the acknowledged order", () => {
    const { host, messages } = game();
    toFirstPlanning(host);
    commitGuard(host, messages, "p1", 1);
    tickFor(host, BORDERLINE_RULES.planningSeconds + BORDERLINE_RULES.revealSeconds + BORDERLINE_RULES.recapSeconds);
    const turnTwo = latest(messages, "p1")!;
    const before = messages.length;
    host.onInput("p1", { t: "order", turn: 2, seq: turnTwo.inputSeq + 1, mode: "guard", target: turnTwo.legalGuards[0], force: 1 });
    expect(messages).toHaveLength(before);
    expect(latest(messages, "p1")?.inputSeq).toBe(1);
  });

  it("rejects a well-shaped replacement after the planning deadline", () => {
    const { host, messages } = game();
    toFirstPlanning(host);
    commitGuard(host, messages, "p1", 1);
    const accepted = latest(messages, "p1")!.committed;
    tickFor(host, BORDERLINE_RULES.planningSeconds);
    const before = messages.length;
    host.onInput("p1", { t: "order", turn: 1, seq: 2, mode: "guard", target: accepted!.target, force: 2 });
    expect(messages).toHaveLength(before);
    expect(latest(messages, "p1")?.committed).toEqual(accepted);
  });

  it("renders an observable GO beat after 3–2–1 and before real planning", () => {
    const { host } = game();
    tickFor(host, BORDERLINE_RULES.runwaySeconds + BORDERLINE_RULES.practiceSeconds + BORDERLINE_RULES.practiceRevealSeconds + 3.1);
    const labels: string[] = [];
    host.render(recordingCanvas(labels), 1920, 1080);
    expect(labels).toContain("GO");
  });

  it("uses the lowest force fallback and lets a landless player pass safely before port recovery", () => {
    const { host, messages } = game(3, 10);
    toFirstPlanning(host);
    const p1 = latest(messages, "p1")!;
    const attackerId = p1.provinces.find((item) => item.id !== p1.legalGuards[0] && item.ownerId)?.ownerId!;
    const attacker = latest(messages, attackerId)!;
    const home = p1.legalGuards[0];
    if (!attacker.legalInvades.includes(home)) {
      // Pick the owner of a legal neighbouring province that can attack p1's home.
      const neighboring = p1.provinces.find((item) => item.ownerId && latest(messages, item.ownerId!)?.legalInvades.includes(home));
      expect(neighboring).toBeTruthy();
      host.onInput(neighboring!.ownerId!, { t: "order", turn: 1, seq: 1, mode: "invade", target: home, force: 2 });
    } else {
      host.onInput(attackerId, { t: "order", turn: 1, seq: 1, mode: "invade", target: home, force: 2 });
    }
    tickFor(host, BORDERLINE_RULES.planningSeconds + BORDERLINE_RULES.revealSeconds + BORDERLINE_RULES.recapSeconds);
    const turnTwo = latest(messages, "p1")!;
    expect(turnTwo.legalGuards).toEqual([]);
    expect(turnTwo.legalInvades.length).toBeGreaterThan(0);
    expect(turnTwo.fallback).toEqual({ mode: "pass", force: 2 });
    tickFor(host, BORDERLINE_RULES.planningSeconds);
    expect(() => host.render(recordingCanvas([]), 1920, 1080)).not.toThrow();
    tickFor(host, BORDERLINE_RULES.revealSeconds + BORDERLINE_RULES.recapSeconds);
    expect(latest(messages, "p1")?.availableForces).toEqual([3]);
    expect(latest(messages, "p1")?.outcome).toMatch(/port stays open/i);
    const turnThree = latest(messages, "p1")!;
    const entry = turnThree.legalInvades.find((target) => !turnThree.provinces[target - 1].ownerId) ?? turnThree.legalInvades[0];
    host.onInput("p1", { t: "order", turn: 3, seq: turnThree.inputSeq + 1, mode: "invade", target: entry, force: 3 });
    tickFor(host, BORDERLINE_RULES.planningSeconds + BORDERLINE_RULES.revealSeconds + BORDERLINE_RULES.recapSeconds);
    expect(latest(messages, "p1")?.legalGuards).toContain(entry);
    expect(latest(messages, "p1")?.outcome).toMatch(/captured province/i);
  });

  it("finishes nine guarded turns with tied scores and retains launch players when a seat leaves", () => {
    const { host, messages } = game();
    toFirstPlanning(host);
    host.onLeave?.("p10");
    for (let turn = 1; turn <= 9; turn += 1) {
      for (let index = 1; index <= 9; index += 1) commitGuard(host, messages, `p${index}`);
      tickFor(host, BORDERLINE_RULES.planningSeconds + BORDERLINE_RULES.revealSeconds + BORDERLINE_RULES.recapSeconds);
    }
    tickFor(host, BORDERLINE_RULES.completeSeconds);
    expect(host.isOver()).toBe(true);
    const results = host.results();
    expect(results).toHaveLength(10);
    expect(results.every(({ score, place }) => score === 9 && place === 1)).toBe(true);
  });

  it("makes late joiners spectators and stops input, sends, rendering and clocks after teardown", () => {
    const { host, messages } = game();
    host.onJoin?.(player("late", 11));
    expect(latest(messages, "late")?.phase).toBe("spectator");
    const labels: string[] = [];
    host.render(recordingCanvas(labels), 1920, 1080);
    expect(labels).toContain("BORDERLINE");
    expect(labels).toContain("ALEX");
    const sent = messages.length;
    host.destroy?.();
    host.tick(10);
    host.onInput("p1", { t: "sync" });
    host.render(recordingCanvas(labels), 1920, 1080);
    expect(messages).toHaveLength(sent);
  });
});
