import { describe, expect, it, vi } from "vitest";
import {
  applyGetawayInput,
  createGetawayState,
  createHost,
  GETAWAY_RULES,
  getawayResults,
  renderGetaway,
  setGetawayConnection,
  stepGetawayState,
  type GetawayState,
} from "../../src/client/games/getaway/host";
import type { GetawayPhoneFrames } from "../../src/client/games/getaway/protocol";

function player(id: string, seat: number, connected = true) {
  return { id, name: `Player${seat + 1}`, seat, color: `hsl(${seat * 36} 80% 60%)`, connected, ready: true, awayAt: null };
}

function players(count: number) {
  return Array.from({ length: count }, (_, index) => player(`p${index + 1}`, index));
}

function liveState(count = 4) {
  const state = createGetawayState(players(count), 19);
  state.phase = "live";
  state.phaseTime = 0;
  state.remaining = GETAWAY_RULES.round;
  return state;
}

function advance(state: GetawayState, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) stepGetawayState(state, Math.min(0.05, seconds - elapsed));
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

describe("Getaway rules", () => {
  it("accepts every roster from four through ten and assigns deterministic alternating teams", () => {
    for (const count of [4, 5, 6, 7, 8, 9, 10]) {
      const state = createGetawayState(players(count), 5);
      expect(state.phase).toBe("practice");
      expect(state.crewSizes).toEqual([Math.ceil(count / 2), Math.floor(count / 2)]);
      expect(state.actors.filter(({ team }) => team === 0)).toHaveLength(Math.ceil(count / 2));
      expect(state.actors.filter(({ team }) => team === 1)).toHaveLength(Math.floor(count / 2));
      expect(state.actors.map(({ id, team }) => ({ id, team }))).toEqual(createGetawayState(players(count), 999).actors.map(({ id, team }) => ({ id, team })));
    }
    expect(createGetawayState(players(2)).invalidReason).toContain("4–10 PLAYERS");
    expect(createGetawayState(players(11)).invalidReason).toContain("4–10 PLAYERS");
  });

  it("staggers every max-roster practice lane so adjacent identities do not stack vertically", () => {
    const state = createGetawayState(players(10));
    for (const team of [0, 1] as const) {
      const crew = state.actors.filter((actor) => actor.team === team);
      for (let index = 1; index < crew.length; index++) {
        expect(Math.abs(crew[index].x - crew[index - 1].x)).toBe(200);
        expect(crew[index].y - crew[index - 1].y).toBe(96);
      }
    }
    advance(state, 13.05);
    expect(state.practiceStage).toBe(2);
    expect(Math.abs(state.actors[2].x - state.actors[0].x)).toBe(200);
    expect(Math.abs(state.actors[3].x - state.actors[1].x)).toBe(200);
  });

  it("keeps max-roster and edge identity pills attached to their actors", () => {
    const state = liveState(10);
    for (const actor of state.actors) Object.assign(actor, { x: 800, y: 500 });
    const anchors = new Map<string, number[]>();
    let lastTranslate: number[] = [];
    const canvas = new Proxy(recordingCanvas([]), {
      get: (base, key) => key === "translate"
        ? (...args: number[]) => { lastTranslate = args; }
        : key === "fillText"
          ? (text: string) => { if (text.includes("Player")) anchors.set(text, lastTranslate); }
          : Reflect.get(base, key),
    });
    renderGetaway(state, canvas, 1600, 900);
    expect(anchors.size).toBe(10);
    expect([...anchors.values()].every(([x, y]) => x === 800 && y === 500)).toBe(true);

    Object.assign(state.actors[0], { x: 40, y: 183 });
    Object.assign(state.actors[1], { x: 1560, y: 860 });
    for (const actor of state.actors.slice(2)) actor.withdrawn = true;
    anchors.clear();
    renderGetaway(state, canvas, 1600, 900);
    const left = anchors.get("1 ◆ Player1")!;
    const right = anchors.get("2 ▲ Player2")!;
    expect(left[1]).toBe(183);
    expect(right[1]).toBe(860);
    expect(left[0]).toBeGreaterThanOrEqual(40);
    expect(right[0]).toBeLessThanOrEqual(1560);
    expect(left[0] - 40).toBeLessThanOrEqual(110.5);
    expect(1560 - right[0]).toBeLessThanOrEqual(110.5);
  });

  it("runs practice, resets its haul, completes the eight-second runway, closes the vault for the last 30 seconds, then ends", () => {
    const state = createGetawayState(players(4));
    state.actors[0].bags = 4;
    advance(state, GETAWAY_RULES.practice);
    expect(state.phase).toBe("runway");
    expect(state.actors.every(({ bags }) => bags === 0)).toBe(true);
    advance(state, GETAWAY_RULES.runway);
    expect(state.phase).toBe("live");
    advance(state, GETAWAY_RULES.vaultWarningAt);
    expect(state.vaultClosed).toBe(false);
    advance(state, GETAWAY_RULES.vaultCloseAt - GETAWAY_RULES.vaultWarningAt);
    expect(state.vaultClosed).toBe(true);
    expect(state.remaining).toBeCloseTo(30, 1);
    advance(state, 30);
    expect(state.phase).toBe("results");
    advance(state, GETAWAY_RULES.resultHold);
    expect(state.phase).toBe("over");
  });

  it("collects one fresh bag per dwell, caps carrying at five, and visibly slows a full carrier", () => {
    const collecting = liveState();
    const actor = collecting.actors[0];
    Object.assign(actor, { x: collecting.supplies[0].x, y: collecting.supplies[0].y, bags: 0 });
    advance(collecting, GETAWAY_RULES.collectSeconds - 0.05);
    expect(actor.bags).toBe(0);
    advance(collecting, 0.05);
    expect(actor.bags).toBe(1);
    advance(collecting, GETAWAY_RULES.collectSeconds * 6);
    expect(actor.bags).toBe(GETAWAY_RULES.capacity);

    const empty = liveState();
    const full = liveState();
    Object.assign(empty.actors[0], { x: 800, y: 700, bags: 0 });
    Object.assign(full.actors[0], { x: 800, y: 700, bags: 5 });
    applyGetawayInput(empty, "p1", { x: 1, y: 0 });
    applyGetawayInput(full, "p1", { x: 1, y: 0 });
    advance(empty, 0.5);
    advance(full, 0.5);
    expect(empty.actors[0].x - 800).toBeGreaterThan((full.actors[0].x - 800) * 1.9);
  });

  it("resets partial dwell after leaving a collection position and refills supply predictably", () => {
    const state = liveState();
    const actor = state.actors[0];
    Object.assign(actor, { x: state.supplies[0].x, y: state.supplies[0].y });
    advance(state, 0.4);
    actor.y = 430;
    stepGetawayState(state, 0.05);
    actor.y = state.supplies[0].y;
    advance(state, 0.25);
    expect(actor.bags).toBe(0);
    advance(state, 0.35);
    expect(actor.bags).toBe(1);
    expect(state.supplies[0].stock).toBe(4);
    actor.y = 430;
    advance(state, GETAWAY_RULES.supplyRefill - 0.05);
    expect(state.supplies[0].stock).toBe(4);
    advance(state, 0.05);
    expect(state.supplies[0].stock).toBe(5);
  });

  it("keeps adjacent modeled supply bays discrete and resets dwell through their midpoint", () => {
    const state = liveState();
    const actor = state.actors[0];
    const left = state.supplies[0];
    const center = state.supplies[1];
    const midpoint = { x: (left.x + center.x) / 2, y: (left.y + center.y) / 2 };
    Object.assign(actor, midpoint, { bags: 0 });
    advance(state, GETAWAY_RULES.collectSeconds + .1);
    expect(actor.bags).toBe(0);

    Object.assign(actor, { x: left.x, y: left.y });
    advance(state, .4);
    Object.assign(actor, midpoint);
    stepGetawayState(state, .05);
    Object.assign(actor, { x: left.x, y: left.y });
    advance(state, .25);
    expect(actor.bags).toBe(0);
    advance(state, .35);
    expect(actor.bags).toBe(1);
  });

  it("spills one bag sideways, gives protection, and requires separation before owner recovery", () => {
    const state = liveState();
    const attacker = state.actors[0];
    const target = state.actors[1];
    Object.assign(attacker, { x: 650, y: 700, facingX: 1, facingY: 0 });
    Object.assign(target, { x: 740, y: 700, bags: 3 });
    applyGetawayInput(state, attacker.id, { x: 0, y: 0, shove: true });
    advance(state, GETAWAY_RULES.shoveWindup + 0.06);
    expect(target.bags).toBe(2);
    expect(target.protection).toBeGreaterThan(0);
    expect(state.loose).toHaveLength(1);
    const bag = state.loose[0];
    state.vaultClosed = true;
    expect(Math.abs(bag.vy)).toBeGreaterThan(Math.abs(bag.vx) * 4);
    advance(state, .3);
    expect(Math.hypot(target.x - bag.x, target.y - bag.y)).toBeGreaterThan(90);
    expect(bag.ownerExitedRange).toBe(true);
    Object.assign(target, { x: bag.x, y: bag.y, stumble: 0 });
    advance(state, 0.3);
    expect(target.bags).toBe(2);
    target.y += 80;
    stepGetawayState(state, .05);
    Object.assign(target, { x: bag.x, y: bag.y, vx: 0, vy: 0 });
    advance(state, GETAWAY_RULES.ownerPickupBlock);
    expect(target.bags).toBe(3);
  });

  it("chooses the accessible perpendicular spill side beside cover and leaves the bag recoverable", () => {
    const state = liveState();
    state.vaultClosed = true;
    const attacker = state.actors[0];
    const target = state.actors[1];
    Object.assign(attacker, { x: 472, y: 190, facingX: 0, facingY: 1 });
    Object.assign(target, { x: 472, y: 280, bags: 2, vx: 0, vy: 0 });
    applyGetawayInput(state, attacker.id, { x: 0, y: 0, shove: true });
    advance(state, GETAWAY_RULES.shoveWindup + .06);
    const bag = state.loose[0];
    expect(bag.targetX).toBeLessThan(472);
    expect(Math.hypot(bag.targetX - 472, bag.targetY - 280)).toBeCloseTo(112, 0);

    Object.assign(target, { x: 472, y: 280, vx: 0, vy: 0, stumble: 0 });
    advance(state, GETAWAY_RULES.ownerPickupBlock + .35);
    expect(target.bags).toBe(1);
    expect(state.loose).toHaveLength(1);
    Object.assign(target, { x: bag.x, y: bag.y, vx: 0, vy: 0 });
    stepGetawayState(state, .05);
    expect(target.bags).toBe(2);
    expect(state.loose).toHaveLength(0);
  });

  it("hits only the nearest opponent, ignores teammates, and blocks repeat juggling during protection", () => {
    const state = liveState();
    const [attacker, nearest, teammate, farther] = state.actors;
    Object.assign(attacker, { x: 600, y: 700, facingX: 1, facingY: 0 });
    Object.assign(teammate, { x: 640, y: 700, bags: 2 });
    Object.assign(nearest, { x: 675, y: 700, bags: 2 });
    Object.assign(farther, { x: 705, y: 700, bags: 2 });
    applyGetawayInput(state, attacker.id, { x: 0, y: 0, shove: true });
    advance(state, GETAWAY_RULES.shoveWindup + 0.05);
    expect(nearest.bags).toBe(1);
    expect(teammate.bags).toBe(2);
    expect(farther.bags).toBe(2);
    Object.assign(attacker, { shoveCooldown: 0, windup: 0 });
    advance(state, GETAWAY_RULES.shoveWindup + 0.05);
    expect(nearest.bags).toBe(1);
  });

  it("resolves simultaneous reciprocal shoves without iteration-order advantage", () => {
    const state = liveState();
    const a = state.actors[0];
    const b = state.actors[1];
    Object.assign(a, { x: 700, y: 700, facingX: 1, facingY: 0, bags: 2 });
    Object.assign(b, { x: 790, y: 700, facingX: -1, facingY: 0, bags: 2 });
    applyGetawayInput(state, a.id, { x: 0, y: 0, shove: true });
    applyGetawayInput(state, b.id, { x: 0, y: 0, shove: true });
    advance(state, GETAWAY_RULES.shoveWindup + 0.05);
    expect(a.bags).toBe(1);
    expect(b.bags).toBe(1);
    expect(state.loose).toHaveLength(2);
  });

  it("queues one shared contact cue for an empty-target hit and does not retrigger while protected", () => {
    const state = liveState();
    const attacker = state.actors[0];
    const target = state.actors[1];
    Object.assign(attacker, { x: 700, y: 700, facingX: 1, facingY: 0 });
    Object.assign(target, { x: 790, y: 700, bags: 0 });
    applyGetawayInput(state, attacker.id, { x: 0, y: 0, shove: true });
    advance(state, GETAWAY_RULES.shoveWindup + .05);
    expect(state.hostCues.filter((cue) => cue === "shove")).toHaveLength(1);
    expect(state.callout).toContain("MAKES AN OPENING");
    state.hostCues.length = 0;
    Object.assign(attacker, { shoveCooldown: 0, windup: 0 });
    advance(state, GETAWAY_RULES.shoveWindup + .05);
    expect(state.hostCues).not.toContain("shove");
  });

  it("queues shared countdown, GO, vault and finish cues once per transition", () => {
    const state = createGetawayState(players(4));
    advance(state, GETAWAY_RULES.practice);
    state.hostCues.length = 0;
    advance(state, GETAWAY_RULES.runway);
    expect(state.hostCues.filter((cue) => cue === "countdown")).toHaveLength(3);
    expect(state.hostCues.filter((cue) => cue === "go")).toHaveLength(1);
    state.hostCues.length = 0;
    advance(state, GETAWAY_RULES.vaultCloseAt);
    expect(state.hostCues.filter((cue) => cue === "vault")).toHaveLength(1);
    state.hostCues.length = 0;
    advance(state, GETAWAY_RULES.round - GETAWAY_RULES.vaultCloseAt);
    expect(state.hostCues.filter((cue) => cue === "finish")).toHaveLength(1);
  });

  it("banks before a same-step shove and never lets an opponent steal banked bags", () => {
    const state = liveState();
    const carrier = state.actors[0];
    const opponent = state.actors[1];
    Object.assign(carrier, { x: 228, y: 500, bags: 4, protection: 0 });
    Object.assign(opponent, { x: 285, y: 500, facingX: -1, facingY: 0, windup: 0.01 });
    stepGetawayState(state, 0.02);
    expect(state.scores[0]).toBe(4);
    expect(carrier.bags).toBe(0);
    expect(state.loose).toHaveLength(0);
  });

  it("never deposits at the enemy van and forbids shoves from either apron or into a crew's own protection", () => {
    const state = liveState();
    const crimson = state.actors[0];
    const cobalt = state.actors[1];
    Object.assign(crimson, { x: 1450, y: 500, bags: 3, facingX: -1, facingY: 0 });
    stepGetawayState(state, 0.05);
    expect(state.scores[0]).toBe(0);
    expect(crimson.bags).toBe(3);
    Object.assign(crimson, { x: 220, y: 500, bags: 0, shoveCooldown: 0, windup: 0, wantsShove: false, facingX: 1 });
    Object.assign(cobalt, { x: 285, y: 500, bags: 2, protection: 0 });
    applyGetawayInput(state, crimson.id, { x: 0, y: 0, shove: true });
    advance(state, 0.3);
    expect(crimson.shoveCooldown).toBe(0);
    expect(cobalt.bags).toBe(2);
    Object.assign(crimson, { x: 1300, y: 500, shoveCooldown: 0, windup: 0, facingX: 1 });
    Object.assign(cobalt, { x: 1375, y: 500, bags: 0, protection: 0, stumble: 0 });
    advance(state, 0.25);
    expect(cobalt.stumble).toBe(0);
  });

  it("neutralizes stale and disconnected input, withdraws after three seconds, then respawns empty on reconnect", () => {
    const state = liveState();
    const actor = state.actors[0];
    actor.bags = 2;
    applyGetawayInput(state, actor.id, { x: 1, y: 0, shove: true });
    advance(state, GETAWAY_RULES.staleInput + 0.05);
    expect(actor.input).toEqual({ x: 0, y: 0 });
    expect(actor.wantsShove).toBe(false);
    setGetawayConnection(state, actor.id, false);
    expect(actor.input).toEqual({ x: 0, y: 0 });
    advance(state, GETAWAY_RULES.disconnectWithdraw);
    expect(actor.withdrawn).toBe(true);
    expect(actor.bags).toBe(0);
    expect(state.loose.length).toBeGreaterThanOrEqual(1);
    setGetawayConnection(state, actor.id, true);
    expect(actor.withdrawn).toBe(false);
    expect(actor.bags).toBe(0);
    expect(actor.protection).toBeGreaterThan(0);
  });

  it("drops the disconnected carrier's exact full haul and starts disconnected launch players neutral", () => {
    const state = liveState();
    const actor = state.actors[0];
    actor.bags = 5;
    setGetawayConnection(state, actor.id, false);
    advance(state, GETAWAY_RULES.disconnectWithdraw);
    expect(state.loose).toHaveLength(5);
    const cold = createGetawayState([player("p1", 0, false), player("p2", 1), player("p3", 2), player("p4", 3)]);
    expect(cold.actors[0]).toEqual(expect.objectContaining({ connected: false, input: { x: 0, y: 0 }, wantsShove: false }));
    advance(cold, GETAWAY_RULES.disconnectWithdraw);
    expect(cold.actors[0].withdrawn).toBe(true);
  });

  it("ignores malformed and unknown controller traffic without moving or crashing", () => {
    const state = liveState();
    const before = { x: state.actors[0].x, y: state.actors[0].y };
    for (const value of [null, [], "go", { x: Infinity, y: 0 }, { x: 1, y: "up" }, { x: 0, y: 0, shove: "yes" }]) {
      expect(() => applyGetawayInput(state, "p1", value)).not.toThrow();
    }
    expect(() => applyGetawayInput(state, "unknown", { x: 1, y: 0 })).not.toThrow();
    stepGetawayState(state, 0.05);
    expect({ x: state.actors[0].x, y: state.actors[0].y }).toEqual(before);
  });

  it("pauses a short-handed match after ten seconds and resumes only when the crew is restored", () => {
    const state = liveState();
    setGetawayConnection(state, "p1", false);
    advance(state, GETAWAY_RULES.shortagePause + 0.05);
    expect(state.paused).toBe(true);
    const elapsed = state.phaseTime;
    advance(state, 1);
    expect(state.phaseTime).toBe(elapsed);
    setGetawayConnection(state, "p1", true);
    stepGetawayState(state, 0.05);
    expect(state.paused).toBe(false);
  });

  it("keeps complete odd crews live and pauses then resumes for a loss from either crew", () => {
    for (const count of [5, 7, 9]) {
      const state = liveState(count);
      advance(state, GETAWAY_RULES.shortagePause + .1);
      expect(state.paused).toBe(false);

      for (const id of ["p1", "p2"]) {
        setGetawayConnection(state, id, false);
        advance(state, GETAWAY_RULES.shortagePause + .05);
        expect(state.paused).toBe(true);
        setGetawayConnection(state, id, true);
        stepGetawayState(state, .05);
        expect(state.paused).toBe(false);
      }
    }
  });

  it("keeps even-roster bag scoring unchanged for every crew member, including ties", () => {
    for (const count of [4, 10]) {
      const state = liveState(count);
      state.scores = [9, 4];
      const results = getawayResults(state);
      expect(results).toHaveLength(count);
      expect(results.filter(({ id }) => Number(id.slice(1)) % 2 === 1).every(({ place, score }) => place === 1 && score === 9)).toBe(true);
      expect(results.filter(({ id }) => Number(id.slice(1)) % 2 === 0).every(({ place, score }) => place === 2 && score === 4)).toBe(true);
      state.scores = [7, 7];
      expect(getawayResults(state).every(({ place, score }) => place === 1 && score === 7)).toBe(true);
    }
  });

  it("awards the fixed smaller-crew bonus at five, seven, and nine players", () => {
    const cases = [
      { count: 5, raw: [7, 5] as [number, number], cobaltPoints: 7.5 },
      { count: 7, raw: [9, 7] as [number, number], cobaltPoints: 9.33 },
      { count: 9, raw: [6, 5] as [number, number], cobaltPoints: 6.25 },
    ];
    for (const { count, raw, cobaltPoints } of cases) {
      const state = liveState(count);
      state.scores = raw;
      const results = getawayResults(state);
      const crimson = results.find(({ id }) => id === "p1")!;
      const cobalt = results.find(({ id }) => id === "p2")!;
      expect(crimson).toMatchObject({ place: 2, score: raw[0] });
      expect(cobalt).toMatchObject({ place: 1, score: cobaltPoints });
      expect(cobalt.detail).toContain("smaller-crew bonus");
    }
  });

  it("uses exact crew-size cross multiplication for normalized ties", () => {
    for (const [count, raw] of [[5, [6, 4]], [7, [8, 6]], [9, [5, 4]]] as const) {
      const state = liveState(count);
      state.scores = [...raw];
      expect(getawayResults(state).every(({ place, score }) => place === 1 && score === raw[0])).toBe(true);
    }
  });

  it("does not reweight the bonus when a launch player disconnects or withdraws", () => {
    const state = liveState(5);
    state.scores = [6, 4];
    expect(state.crewSizes).toEqual([3, 2]);
    setGetawayConnection(state, "p1", false);
    advance(state, GETAWAY_RULES.disconnectWithdraw);
    expect(state.actors[0].withdrawn).toBe(true);
    expect(state.crewSizes).toEqual([3, 2]);
    expect(getawayResults(state).every(({ place, score }) => place === 1 && score === 6)).toBe(true);
  });

  it("uses normalized points for the finish winner and callout", () => {
    const state = liveState(5);
    state.scores = [7, 5];
    state.phaseTime = GETAWAY_RULES.round - .01;
    state.remaining = .01;
    stepGetawayState(state, .02);
    expect(state.phase).toBe("results");
    expect(state.callout).toBe("COBALT GETS AWAY");
  });
});

describe("Getaway host surface", () => {
  it("renders both crew identities, the rules, and all ten named seats at room scale", () => {
    const labels: string[] = [];
    const game = createHost({ players: players(10), seed: 1, width: 1920, height: 1080, send: vi.fn() });
    for (let index = 0; index < 10; index++) game.onInput(`p${index + 1}`, { x: 0, y: 0, sync: true });
    game.render(recordingCanvas(labels), 1920, 1080);
    expect(labels).toContain("▲ CRIMSON CREW");
    expect(labels).toContain("● COBALT CREW");
    expect(labels).toContain("1 · GRAB BAGS");
    expect(labels.filter((label) => /^\d+ . Player/.test(label))).toHaveLength(10);
  });

  it("shutters all three supply positions when the vault closes and renders shove readiness on the actor", () => {
    const state = liveState();
    state.vaultClosed = true;
    const labels: string[] = [];
    const styles: string[] = [];
    const canvas = new Proxy(recordingCanvas(labels), {
      set: (target, key, value) => {
        if (key === "strokeStyle") styles.push(String(value));
        return Reflect.set(target, key, value);
      },
    });
    renderGetaway(state, canvas, 1280, 720);
    expect(labels.filter((label) => label === "SEALED")).toHaveLength(3);
    expect(labels).toContain("VAULT CLOSED");
    expect(styles).toContain("#39d3af");
  });

  it("draws the vault doors halfway across the face during the ten-second warning", () => {
    const state = liveState();
    state.phaseTime = GETAWAY_RULES.vaultWarningAt + 5;
    const shutterWidths: number[] = [];
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) => key === "strokeRect"
        ? (_x: number, _y: number, width: number) => shutterWidths.push(width)
        : key === "measureText" ? (text: string) => ({ width: text.length * 12 })
        : (Reflect.get(target, key) ?? (() => undefined)),
    });
    renderGetaway(state, canvas, 1280, 720);
    expect(shutterWidths.filter((width) => Math.abs(width - 40) < .01)).toHaveLength(2);
  });

  it("renders a visible sideways spill trail and landing ring", () => {
    const state = liveState();
    state.vaultClosed = true;
    const attacker = state.actors[0];
    const target = state.actors[1];
    Object.assign(attacker, { x: 650, y: 700, facingX: 1, facingY: 0 });
    Object.assign(target, { x: 740, y: 700, bags: 1 });
    applyGetawayInput(state, attacker.id, { x: 0, y: 0, shove: true });
    advance(state, GETAWAY_RULES.shoveWindup + .06);
    const dashes: number[][] = [];
    const landingRings: number[][] = [];
    const canvas = new Proxy(recordingCanvas([]), {
      get: (base, key) => key === "setLineDash"
        ? (dash: number[]) => dashes.push(dash)
        : key === "ellipse"
          ? (...args: number[]) => landingRings.push(args)
          : Reflect.get(base, key),
    });
    renderGetaway(state, canvas, 1280, 720);
    expect(dashes).toContainEqual([8, 11]);
    expect(landingRings.some(([, , radiusX, radiusY]) => radiusX === 31 && radiusY === 16)).toBe(true);
  });

  it("projects the playable stage below the HUD while counter-scaling actors and labels", () => {
    const translations: number[][] = [];
    const scales: number[][] = [];
    const canvas = new Proxy(recordingCanvas([]), {
      get: (base, key) => key === "translate"
        ? (...args: number[]) => translations.push(args)
        : key === "scale"
          ? (...args: number[]) => scales.push(args)
          : Reflect.get(base, key),
    });
    renderGetaway(liveState(), canvas, 1600, 900);

    expect(translations).toContainEqual([0, 130]);
    expect(scales).toContainEqual([1, .84]);
    expect(scales).toContainEqual([1, 1 / .84]);
  });

  it("syncs a cold controller immediately, batches public state, and keeps late joiners out of the simulation", () => {
    const messages: Array<{ data: unknown; to?: string }> = [];
    const game = createHost({ players: players(4), seed: 1, width: 1280, height: 720, send: (data, to) => messages.push({ data, to }) });
    game.onInput("p1", { x: 0, y: 0, shove: false, sync: true });
    expect(messages).toContainEqual({ to: "p1", data: expect.objectContaining({ t: "getawayState", phase: "practice", interactive: false, status: expect.stringContaining("waiting for 3") }) });
    for (let index = 1; index < 4; index++) game.onInput(`p${index + 1}`, { x: 0, y: 0, shove: false, sync: true });
    game.tick(0.05);
    game.tick(0.05);
    const batch = messages.find(({ data }) => (data as { t?: string }).t === "getawayStates")?.data as GetawayPhoneFrames;
    expect(Object.keys(batch.frames)).toHaveLength(4);
    game.onJoin?.(player("late", 8));
    expect(messages).toContainEqual({ to: "late", data: expect.objectContaining({ phase: "spectating", interactive: false }) });
    expect(game.results().some(({ id }) => id === "late")).toBe(false);
  });

  it("shows adjusted points, raw bags, and the smaller-crew runway bonus", () => {
    const labels: string[] = [];
    const state = createGetawayState(players(5));
    state.phase = "runway";
    state.scores = [6, 5];
    renderGetaway(state, recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("6");
    expect(labels).toContain("7.5");
    expect(labels).toContain("POINTS · 6 BAGS");
    expect(labels).toContain("POINTS · 5 BAGS");
    expect(labels).toContain("×1.5 CREW BONUS");
    expect(labels).toContain("BANK AT YOUR VAN · COBALT SMALLER-CREW BONUS ×1.5");
  });

  it("shows an actionable four-to-ten refusal for an out-of-range launch", () => {
    const labels: string[] = [];
    renderGetaway(createGetawayState(players(3)), recordingCanvas(labels), 1280, 720);
    expect(labels).toContain("4–10 PLAYERS NEEDED");
    expect(labels).toContain("GETAWAY NEEDS 4–10 PLAYERS · 3 JOINED");
    expect(labels).toContain("Use EXIT GAME, adjust the roster, then launch again.");
  });
});
