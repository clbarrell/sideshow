import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BORDERLINE_TEACHING,
  BORDERLINE_TIMING,
  compactOutcomeLedger,
  createHost,
  finaleProgressAt,
  scoreBankProgressAt,
  teachingFrameAt,
} from "../../src/client/games/borderline/host";
import type { BorderlineFrame } from "../../src/client/games/borderline/protocol";
import { createBorderlineSound } from "../../src/client/games/borderline/sound";
import {
  ADJACENCY,
  createCampaignWorld,
  fallbackOrder,
  FORCE_SET,
  legalTargets,
  resolveTurn,
  type CampaignPlayer,
  type EffectiveOrder,
} from "../../src/client/games/borderline/rules";

const REAL_NAMES = ["Ana", "Beau", "Charlotte", "D'Angelo", "Evangeline", "Farouk", "Guadalupe", "Hiroshi", "Isabella", "Jacqueline"] as const;

function player(id: string, seat: number) {
  return { id, name: REAL_NAMES[seat], seat, color: `hsl(${seat * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

const roster = Array.from({ length: 10 }, (_, index) => player(`p${index + 1}`, index));

afterEach(() => {
  vi.unstubAllGlobals();
});

function game(seed = 20260912) {
  const messages: Array<{ data: unknown; to?: string }> = [];
  const host = createHost({
    players: roster,
    seed,
    width: 1280,
    height: 720,
    send: (data, to) => messages.push({ data, to }),
  });
  return { host, messages };
}

function latest(messages: Array<{ data: unknown; to?: string }>, id: string) {
  return messages.filter(({ to, data }) => to === id && (data as { t?: string }).t === "borderlineState").at(-1)?.data as BorderlineFrame;
}

function tickFor(host: ReturnType<typeof createHost>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) host.tick(Math.min(0.05, seconds - elapsed));
}

function syncAll(host: ReturnType<typeof createHost>) {
  for (const member of roster) host.onInput(member.id, { t: "sync" });
}

function reachPractice(host: ReturnType<typeof createHost>) {
  syncAll(host);
  tickFor(host, BORDERLINE_TIMING.teach);
}

function reachTurnOne(host: ReturnType<typeof createHost>) {
  reachPractice(host);
  tickFor(host, BORDERLINE_TIMING.practice + BORDERLINE_TIMING.practiceReveal + BORDERLINE_TIMING.countdown);
}

function distance(from: number, to: number) {
  const queue: Array<[number, number]> = [[from, 0]];
  const seen = new Set([from]);
  while (queue.length) {
    const [current, steps] = queue.shift()!;
    if (current === to) return steps;
    for (const next of ADJACENCY[current] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([next, steps + 1]);
    }
  }
  return Infinity;
}

function recordingCanvas(draws: Array<{ text: string; font: string }> = []) {
  const target = {} as CanvasRenderingContext2D;
  return new Proxy(target, {
    get: (canvas, key) => key === "fillText"
      ? (value: string) => draws.push({ text: value, font: String(canvas.font ?? "") })
      : key === "measureText"
        ? (value: string) => ({ width: value.length * 9 })
        : (Reflect.get(canvas, key) ?? (() => undefined)),
  });
}

describe("Borderline campaign map", () => {
  it("keeps all ten seeded starts fair, connected and recoverable across insertion orders", () => {
    for (const seed of [1, 17, 77, 20260912, 0x7fffffff]) {
      for (const input of [roster, [...roster].reverse(), [...roster.slice(3), ...roster.slice(0, 3)]]) {
        const world = createCampaignWorld(seed, input);
        const homes = world.players.map((member) => member.homeProvince);
        expect(new Set(homes).size).toBe(10);
        expect(world.ownership.filter(Boolean)).toHaveLength(10);
        expect(world.ownership.filter((owner) => owner === null)).toHaveLength(14);

        for (const member of world.players) {
          expect(new Set(member.homeEntries).size).toBe(2);
          const opening = legalTargets(world.ownership, member);
          expect(opening.invade.length).toBeGreaterThanOrEqual(2);
          expect(opening.invade.length).toBeLessThanOrEqual(4);
          expect(opening.guard).toContain(member.homeProvince);
          expect(opening.invade).not.toContain(member.homeProvince);

          const zeroLand = world.ownership.map((owner) => owner === member.id ? null : owner);
          const recovery = legalTargets(zeroLand, member);
          expect(recovery.guard).toEqual([]);
          expect(recovery.invade).toEqual([...member.homeEntries].sort((a, b) => a - b));
          expect(fallbackOrder(zeroLand, member, FORCE_SET)).toEqual({ mode: "pass", force: 1 });

          const nearestHome = Math.min(...homes.filter((home) => home !== member.homeProvince).map((home) => distance(member.homeProvince, home)));
          expect(nearestHome).toBe(2);
        }
      }
    }
  });

  it("recreates the same assignments from a persisted seed regardless of roster insertion order", () => {
    const first = createCampaignWorld(8181, roster);
    const restarted = createCampaignWorld(8181, [...roster].reverse());
    expect(restarted).toEqual(first);
  });
});

describe("Borderline deterministic combat", () => {
  const campaignPlayers: CampaignPlayer[] = ["a", "b", "c"].map((id, seat) => ({
    id,
    name: id.toUpperCase(),
    seat,
    color: "#fff",
    emblem: "◆",
    homeProvince: seat + 1,
    homeEntries: [seat + 1, seat + 2] as [number, number],
  }));
  const target = 12;

  function ownerAfter(initialOwner: string | null, entries: Array<[string, EffectiveOrder]>) {
    const ownership = Array<string | null>(24).fill(null);
    ownership[target - 1] = initialOwner;
    return resolveTurn(ownership, new Map(entries)).ownership[target - 1];
  }

  it.each([
    ["invade 1 takes neutral", null, [["b", { mode: "invade", target, force: 1 }]], "b"],
    ["invade 1 takes occupied unguarded land", "a", [["b", { mode: "invade", target, force: 1 }]], "b"],
    ["guard 1 ties invade 1", "a", [["a", { mode: "guard", target, force: 1 }], ["b", { mode: "invade", target, force: 1 }]], "a"],
    ["invade 2 beats guard 1", "a", [["a", { mode: "guard", target, force: 1 }], ["b", { mode: "invade", target, force: 2 }]], "b"],
    ["invade 3 beats guard 2", "a", [["a", { mode: "guard", target, force: 2 }], ["b", { mode: "invade", target, force: 3 }]], "b"],
    ["guard 3 ties invade 3", "a", [["a", { mode: "guard", target, force: 3 }], ["b", { mode: "invade", target, force: 3 }]], "a"],
    ["tied strongest attackers block weaker", "a", [["a", { mode: "invade", target, force: 3 }], ["b", { mode: "invade", target, force: 3 }], ["c", { mode: "invade", target, force: 2 }]], "a"],
    ["unique strongest attacker captures", "a", [["b", { mode: "invade", target, force: 3 }], ["c", { mode: "invade", target, force: 2 }]], "b"],
  ] as Array<[string, string | null, Array<[string, EffectiveOrder]>, string | null]>) ("%s", (_name, owner, orders, expected) => {
    expect(ownerAfter(owner, orders)).toBe(expected);
  });

  it("allows simultaneous swaps from the frozen starting ownership", () => {
    const ownership = Array<string | null>(24).fill(null);
    ownership[0] = "a";
    ownership[1] = "b";
    const result = resolveTurn(ownership, new Map([
      ["a", { mode: "invade", target: 2, force: 1 }],
      ["b", { mode: "invade", target: 1, force: 1 }],
    ]));
    expect(result.ownership.slice(0, 2)).toEqual(["b", "a"]);
    expect(result.outcomes).toEqual({ a: "captured", b: "captured" });
  });

  it("does not unlock destinations beyond a same-turn capture", () => {
    const world = createCampaignWorld(17, roster);
    const member = world.players[0];
    const opening = legalTargets(world.ownership, member);
    const captured = opening.invade[0];
    const result = resolveTurn(world.ownership, new Map([[member.id, { mode: "invade", target: captured, force: 1 }]]));
    const newlyAdjacent = (ADJACENCY[captured] ?? []).filter((province) => result.ownership[province - 1] !== member.id && !opening.invade.includes(province));
    expect(newlyAdjacent.length).toBeGreaterThan(0);
    expect(opening.invade).not.toContain(newlyAdjacent[0]);
    expect(legalTargets(result.ownership, member).invade).toContain(newlyAdjacent[0]);
  });

  it("is independent of order insertion order", () => {
    const ownership = Array<string | null>(24).fill(null);
    ownership[target - 1] = "a";
    const orders: Array<[string, EffectiveOrder]> = [
      ["a", { mode: "guard", target, force: 1 }],
      ["b", { mode: "invade", target, force: 3 }],
      ["c", { mode: "invade", target, force: 2 }],
    ];
    expect(resolveTurn(ownership, new Map([...orders].reverse()))).toEqual(resolveTurn(ownership, new Map(orders)));
    expect(campaignPlayers).toHaveLength(3);
  });
});

describe("Borderline host lifecycle", () => {
  it("animates six explicit teaching examples and keeps reduced-motion outcomes static", () => {
    expect(BORDERLINE_TEACHING.map(({ title, subtitle }) => `${title} — ${subtitle}`)).toEqual([
      "UNGUARDED LAND — INVADE 1 TAKES IT",
      "GUARD 2 · INVADE 1 — THE STRONGER GUARD STOPS IT",
      "GUARD 1 · INVADE 1 — DEFENDER EQUALITY · FLAG STAYS",
      "INVADE 3 · INVADE 3 · INVADE 2 — TOP ATTACKERS TIE · FLAG STAYS",
      "USE FORCE 1 · 2 · 3 ONCE — ALL THREE RETURN AFTER TURN 3",
      "LOSE EVERY PROVINCE? — BOTH PERMANENT PORT ENTRIES STAY OPEN",
    ]);
    expect(teachingFrameAt(0.2).progress).toBeLessThan(teachingFrameAt(1.1).progress);
    expect(teachingFrameAt(0.2, true).progress).toBe(1);

    const { host } = game();
    syncAll(host);
    for (let index = 0; index < BORDERLINE_TEACHING.length; index += 1) {
      if (index > 0) tickFor(host, BORDERLINE_TIMING.teach / BORDERLINE_TEACHING.length + 0.01);
      const draws: Array<{ text: string; font: string }> = [];
      host.render(recordingCanvas(draws), 1920, 1080);
      expect(draws.map(({ text }) => text)).toContain(BORDERLINE_TEACHING[index].title);
      expect(draws.map(({ text }) => text)).toContain(BORDERLINE_TEACHING[index].subtitle);
    }
  });

  it("uses bounded animated score/finale staging with static reduced-motion equivalents", () => {
    expect(scoreBankProgressAt(0)).toBe(0);
    expect(scoreBankProgressAt(0.55)).toBeGreaterThan(0);
    expect(scoreBankProgressAt(1.15)).toBe(1);
    expect(scoreBankProgressAt(0, true)).toBe(1);
    expect(finaleProgressAt(0)).toBe(0);
    expect(finaleProgressAt(0.36)).toBeGreaterThan(0);
    expect(finaleProgressAt(0.72)).toBe(1);
    expect(finaleProgressAt(0, true)).toBe(1);

    const { host } = game();
    reachTurnOne(host);
    tickFor(host, BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal);
    const recapDraws: Array<{ text: string; font: string }> = [];
    host.render(recordingCanvas(recapDraws), 1920, 1080);
    expect(recapDraws.map(({ text }) => text)).toContain("TURN 1 · SCORES BANKED");
    expect(recapDraws.filter(({ text }) => text === "+1")).toHaveLength(10);
  });

  it("keeps every recap ledger label compact enough for the ten-seat strip", () => {
    const order = { mode: "invade", target: 24, force: 3 } as const;
    const labels = ["captured", "held", "lost", "quiet", "tied", "defended", "outmatched"] as const;
    for (const outcome of labels) expect(compactOutcomeLedger(order, outcome).length).toBeLessThanOrEqual(16);
    expect(compactOutcomeLedger({ mode: "pass", force: 2 }, "passed")).toBe("PASSED · F2");
  });

  it("keeps host construction alive when WebAudio construction is blocked", () => {
    vi.stubGlobal("AudioContext", class {
      constructor() { throw new Error("audio blocked"); }
    });
    expect(createBorderlineSound("host")).toBeNull();
    expect(() => game()).not.toThrow();
  });

  it("waits for connected controllers, enters practice, and acknowledges only the order owner", () => {
    const { host, messages } = game();
    tickFor(host, 30);
    expect(latest(messages, "p1").phase).toBe("loading");
    reachPractice(host);
    expect(latest(messages, "p1").phase).toBe("practice");

    const frame = latest(messages, "p1");
    messages.length = 0;
    host.onInput("p1", { t: "order", turn: 0, seq: 1, mode: "guard", target: frame.legal.guard[0], force: 1 });
    expect(messages.map(({ to }) => to)).toEqual(["p1"]);
    expect(latest(messages, "p1").committed).toEqual({ mode: "guard", target: frame.legal.guard[0], force: 1 });

    host.onInput("p1", { t: "order", turn: 0, seq: 1, mode: "guard", target: frame.legal.guard[0], force: 2 });
    host.onInput("p1", { t: "order", turn: 0, seq: 3, mode: "guard", target: frame.legal.guard[0], force: 3 });
    host.onInput("p1", { t: "order", turn: 1, seq: 2, mode: "guard", target: frame.legal.guard[0], force: 2 });
    expect(latest(messages, "p1").inputSeq).toBe(1);
    expect(latest(messages, "p1").committed?.force).toBe(1);
    tickFor(host, BORDERLINE_TIMING.practice);
    host.onInput("p1", { t: "order", turn: 0, seq: 2, mode: "guard", target: frame.legal.guard[0], force: 2 });
    expect(latest(messages, "p1")).toEqual(expect.objectContaining({ phase: "practiceReveal", inputSeq: 1 }));
  });

  it("reveals practice, then resets territory, scores, forces and orders before turn one", () => {
    const { host, messages } = game(17);
    reachPractice(host);
    const before = latest(messages, "p1");
    host.onInput("p1", { t: "order", turn: 0, seq: 1, mode: "invade", target: before.legal.invade[0], force: 3 });
    tickFor(host, BORDERLINE_TIMING.practice);
    expect(latest(messages, "p1").phase).toBe("practiceReveal");
    tickFor(host, BORDERLINE_TIMING.practiceReveal + BORDERLINE_TIMING.countdown);
    const real = latest(messages, "p1");
    expect(real).toEqual(expect.objectContaining({ phase: "planning", turn: 1, committed: null, forces: [1, 2, 3] }));
    expect(real.players.every((member) => member.score === 0 && member.territoryCount === 1)).toBe(true);
    expect(real.provinceOwners).toEqual(before.provinceOwners);
  });

  it("rejects force reuse, accepts a reconnect edit sequence, and refills all tokens after turn three", () => {
    const { host, messages } = game(31);
    reachTurnOne(host);
    let frame = latest(messages, "p1");
    host.onInput("p1", { t: "order", turn: 1, seq: 1, mode: "guard", target: frame.legal.guard[0], force: 1 });
    host.onConnectionChange?.("p1", false);
    host.onConnectionChange?.("p1", true);
    host.onInput("p1", { t: "sync" });
    host.onInput("p1", { t: "order", turn: 1, seq: 2, mode: "guard", target: frame.legal.guard[0], force: 1 });
    expect(latest(messages, "p1").inputSeq).toBe(2);
    tickFor(host, BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal + BORDERLINE_TIMING.recap);

    frame = latest(messages, "p1");
    expect(frame.turn).toBe(2);
    expect(frame.forces).toEqual([2, 3]);
    host.onInput("p1", { t: "order", turn: 2, seq: 3, mode: "guard", target: frame.legal.guard[0], force: 1 });
    expect(latest(messages, "p1").inputSeq).toBe(2);
    host.onInput("p1", { t: "order", turn: 2, seq: 3, mode: "guard", target: frame.legal.guard[0], force: 2 });
    tickFor(host, BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal + BORDERLINE_TIMING.recap);

    frame = latest(messages, "p1");
    host.onInput("p1", { t: "order", turn: 3, seq: 4, mode: "guard", target: frame.legal.guard[0], force: 3 });
    tickFor(host, BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal);
    expect(latest(messages, "p1")).toEqual(expect.objectContaining({ phase: "recap", forces: [1, 2, 3] }));
  });

  it("uses the disclosed deadline fallback and returns tied raw scores and places after nine turns", () => {
    const { host, messages } = game(41);
    reachTurnOne(host);
    const first = latest(messages, "p1");
    expect(first.fallback).toEqual({ mode: "guard", target: first.legal.guard[0], force: 1 });
    tickFor(host, 9 * (BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal + BORDERLINE_TIMING.recap));
    const finaleDraws: Array<{ text: string; font: string }> = [];
    host.render(recordingCanvas(finaleDraws), 1920, 1080);
    expect(finaleDraws.map(({ text }) => text)).toEqual(expect.arrayContaining(["CAMPAIGN COMPLETE", "10-WAY TIE", "9 PROVINCES BANKED"]));
    tickFor(host, BORDERLINE_TIMING.finale + 0.1);
    expect(host.isOver()).toBe(true);
    expect(host.results()).toEqual(roster.map((member) => ({ id: member.id, place: 1, score: 9, detail: "9 provinces banked" })));
  });

  it("lets a player who loses their last province invade through either permanent port entry next turn", () => {
    const { host, messages } = game(73);
    reachTurnOne(host);
    const defender = latest(messages, "p1").players.find((member) => member.id === "p1")!;
    const homes = new Map(latest(messages, "p1").players.map((member) => [member.id, member.homeProvince]));
    const attackerEntry = [...homes].find(([id, home]) => id !== "p1" && distance(home, defender.homeProvince) === 2)!;
    const attackerId = attackerEntry[0];
    const middle = (ADJACENCY[attackerEntry[1]] ?? []).find((province) => distance(province, defender.homeProvince) === 1)!;
    let attackerFrame = latest(messages, attackerId);
    expect(attackerFrame.legal.invade).toContain(middle);
    host.onInput(attackerId, { t: "order", turn: 1, seq: 1, mode: "invade", target: middle, force: 1 });
    tickFor(host, BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal + BORDERLINE_TIMING.recap);

    attackerFrame = latest(messages, attackerId);
    expect(attackerFrame.legal.invade).toContain(defender.homeProvince);
    host.onInput(attackerId, { t: "order", turn: 2, seq: 2, mode: "invade", target: defender.homeProvince, force: 3 });
    const defenderFrame = latest(messages, "p1");
    host.onInput("p1", { t: "order", turn: 2, seq: 1, mode: "guard", target: defender.homeProvince, force: 2 });
    tickFor(host, BORDERLINE_TIMING.planning + BORDERLINE_TIMING.reveal + BORDERLINE_TIMING.recap);

    const recovery = latest(messages, "p1");
    expect(recovery.turn).toBe(3);
    expect(recovery.players.find((member) => member.id === "p1")?.territoryCount).toBe(0);
    expect(recovery.legal.guard).toEqual([]);
    expect(recovery.legal.invade).toEqual([...defender.homeEntries].sort((a, b) => a - b));
    expect(recovery.fallback).toEqual({ mode: "pass", force: 3 });
  });

  it("renders the rule shorthand, all realistic player labels and port entry notation", () => {
    const { host } = game();
    const draws: Array<{ text: string; font: string }> = [];
    host.render(recordingCanvas(draws), 1920, 1080);
    const labels = draws.map(({ text }) => text);
    expect(labels).toContain("BORDERLINE");
    expect(labels.some((label) => label.includes("STRONGEST FORCE WINS"))).toBe(true);
    for (const name of REAL_NAMES) {
      const nameDraws = draws.filter(({ text }) => text === name || text.endsWith(` ${name}`));
      expect(nameDraws).toHaveLength(2);
      expect(nameDraws.every(({ font }) => Number(font.match(/([\d.]+)px/)?.[1] ?? 0) >= 18)).toBe(true);
    }
    for (let province = 1; province <= 24; province += 1) expect(labels).toContain(String(province));
    expect(labels.filter((label) => /^PORT \d+\/\d+$/.test(label))).toHaveLength(10);
    expect(labels.filter((label) => /^\d+\/\d+$/.test(label))).toHaveLength(10);
  });
});
