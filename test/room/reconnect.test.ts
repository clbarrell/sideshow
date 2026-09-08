import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { GRACE_MS } from "../../src/shared/protocol";

type Message = Record<string, unknown>;

interface PartyCredentials {
  code: string;
  hostToken: string;
}

async function createParty(): Promise<PartyCredentials> {
  const response = await SELF.fetch("https://party.test/api/rooms", { method: "POST" });
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  return response.json() as Promise<PartyCredentials>;
}

async function connect(code: string) {
  const response = await SELF.fetch(`https://party.test/parties/room/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected a WebSocket upgrade response");
  socket.accept();
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Message> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "message",
      (event) => resolve(JSON.parse(String(event.data)) as Message),
      { once: true },
    );
  });
}

function nextMessageMatching(socket: WebSocket, matches: (message: Message) => boolean): Promise<Message> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as Message;
      if (!matches(message)) return;
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

function messagesMatching(
  socket: WebSocket,
  matches: (message: Message) => boolean,
  count: number,
): Promise<Message[]> {
  return new Promise((resolve) => {
    const messages: Message[] = [];
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as Message;
      if (!matches(message)) return;
      messages.push(message);
      if (messages.length !== count) return;
      socket.removeEventListener("message", onMessage);
      resolve(messages);
    };
    socket.addEventListener("message", onMessage);
  });
}

function nextClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
}

async function joinController(socket: WebSocket, key: string, name = "Alex") {
  const welcome = nextMessage(socket);
  socket.send(JSON.stringify({ t: "hello", role: "controller", key, name }));
  const message = await welcome;
  await nextMessage(socket);
  return message;
}

async function joinHost(socket: WebSocket, hostToken: string) {
  const welcome = nextMessage(socket);
  socket.send(JSON.stringify({ t: "hello", role: "host", token: hostToken }));
  const message = await welcome;
  await nextMessage(socket);
  return message;
}

function stateOf(message: Message) {
  return message.state as {
    activeRound?: { gameId: string; seed: number } | null;
    gameId?: string | null;
    phase?: string;
    round?: number;
    totals?: Record<string, number>;
    history?: unknown[];
    players: Array<{ id: string; connected: boolean; ready?: boolean }>;
  };
}

describe("room reconnect protocol", () => {
  it("atomically provisions each room once", async () => {
    const room = env.Room.getByName("ATOMIC");
    const attempts = await Promise.all([
      room.provision(new Uint8Array([1]).buffer),
      room.provision(new Uint8Array([2]).buffer),
    ]);

    expect(attempts.filter(Boolean)).toHaveLength(1);
  });

  it("rejects cross-origin room creation and unprovisioned joins", async () => {
    const creation = await SELF.fetch("https://party.test/api/rooms", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });
    expect(creation.status).toBe(403);

    const socket = await connect("NONE");
    const closed = nextClose(socket);
    socket.send(JSON.stringify({ t: "hello", role: "controller", key: "device-none" }));
    await expect(closed).resolves.toMatchObject({ code: 4004 });
  });

  it("provisions an uncacheable room code and host capability", async () => {
    const response = await SELF.fetch("https://party.test/api/rooms", { method: "POST" });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: expect.stringMatching(/^[BCDFGHJKLMNPQRSTVWXYZ23456789]{4}$/),
      hostToken: expect.stringMatching(/^[A-Za-z0-9_-]{32,}$/),
    });
  });

  it("rejects missing and incorrect host capabilities without replacing the host", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);

    for (const token of [undefined, "not-the-host-token"]) {
      const intruder = await connect(code);
      const closed = nextClose(intruder);
      intruder.send(JSON.stringify({ t: "hello", role: "host", ...(token ? { token } : {}) }));
      await expect(closed).resolves.toMatchObject({ code: 4003 });
    }

    const state = nextMessageMatching(
      host,
      (message) => message.t === "state" && stateOf(message).gameId === "kart",
    );
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await expect(state).resolves.toMatchObject({ t: "state", state: { gameId: "kart" } });
  });

  it("does not charge failed host authentication against the host write allowance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code, hostToken } = await createParty();
      for (let attempt = 0; attempt < 10; attempt++) {
        const intruder = await connect(code);
        const closed = nextClose(intruder);
        intruder.send(JSON.stringify({ t: "hello", role: "host", token: `wrong-token-${attempt}` }));
        await expect(closed).resolves.toMatchObject({ code: 4003 });
      }

      const host = await connect(code);
      await joinHost(host, hostToken);
      for (let write = 0; write < 9; write++) {
        const gameId = `allowed-after-auth-failures-${write}`;
        const state = nextMessageMatching(
          host,
          (message) => message.t === "state" && stateOf(message).gameId === gameId,
        );
        host.send(JSON.stringify({ t: "pick", gameId }));
        await state;
      }

      const closed = nextClose(host);
      host.send(JSON.stringify({ t: "pick", gameId: "over-host-limit" }));
      await expect(closed).resolves.toMatchObject({ code: 1008 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes malformed, binary, and oversized messages without revoking the host", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);

    const malformed = await connect(code);
    const malformedClosed = nextClose(malformed);
    malformed.send("{not-json");
    await expect(malformedClosed).resolves.toMatchObject({ code: 1008 });

    const binary = await connect(code);
    const binaryClosed = nextClose(binary);
    binary.send(new Uint8Array([1, 2, 3]));
    await expect(binaryClosed).resolves.toMatchObject({ code: 1003 });

    const oversized = await connect(code);
    const oversizedClosed = nextClose(oversized);
    oversized.send(JSON.stringify({ t: "hello", role: "controller", key: "x".repeat(8 * 1024) }));
    await expect(oversizedClosed).resolves.toMatchObject({ code: 1009 });

    const state = nextMessageMatching(
      host,
      (message) => message.t === "state" && stateOf(message).gameId === "kart",
    );
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await state;
  });

  it("requires hello first and evicts stale pending sockets before applying the room cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code } = await createParty();
      const pending = await Promise.all(Array.from({ length: 32 }, () => connect(code)));
      const staleCloses = pending.map(nextClose);

      vi.setSystemTime(new Date(Date.now() + 10_001));
      const valid = await connect(code);
      await expect(Promise.all(staleCloses)).resolves.toEqual(
        Array.from({ length: 32 }, () => expect.objectContaining({ code: 1008 })),
      );
      await expect(joinController(valid, "device-after-stale")).resolves.toMatchObject({ t: "welcome" });

      const outOfOrder = await connect(code);
      const closed = nextClose(outOfOrder);
      outOfOrder.send(JSON.stringify({ t: "ready", ready: true }));
      await expect(closed).resolves.toMatchObject({ code: 1008 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not replenish the room write budget when the host reconnects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code, hostToken } = await createParty();
      const host = await connect(code);
      await joinHost(host, hostToken);
      for (let write = 0; write < 8; write++) {
        const gameId = `before-reconnect-${write}`;
        const state = nextMessageMatching(
          host,
          (message) => message.t === "state" && stateOf(message).gameId === gameId,
        );
        host.send(JSON.stringify({ t: "pick", gameId }));
        await state;
      }

      const reconnected = await connect(code);
      await joinHost(reconnected, hostToken);
      const closed = nextClose(reconnected);
      reconnected.send(JSON.stringify({ t: "pick", gameId: "one-too-many" }));
      await expect(closed).resolves.toMatchObject({ code: 1008 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects controller role abuse without consuming the host write budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code, hostToken } = await createParty();
      const host = await connect(code);
      await joinHost(host, hostToken);

      for (let attacker = 0; attacker < 10; attacker++) {
        const controller = await connect(code);
        await joinController(controller, `device-role-abuse-${attacker}`);
        const closed = nextClose(controller);
        controller.send(JSON.stringify(attacker % 2 === 0
          ? { t: "pick", gameId: "kart" }
          : { t: "hello", role: "controller", key: `repeat-${attacker}` }));
        await expect(closed).resolves.toMatchObject({ code: 1008 });
      }

      const state = nextMessageMatching(
        host,
        (message) => message.t === "state" && stateOf(message).gameId === "kart",
      );
      host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
      await expect(state).resolves.toMatchObject({ t: "state", state: { gameId: "kart" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not replenish the room message budget when a controller reconnects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code } = await createParty();
      for (let session = 0; session < 12; session++) {
        const controller = await connect(code);
        const welcome = await joinController(controller, "device-room-rate");
        const playerId = (welcome.you as { id: string }).id;
        const gameMessages = session < 11 ? 42 : 33;
        for (let message = 0; message < gameMessages; message++) {
          controller.send(JSON.stringify({ t: "g", d: message }));
        }
        const state = nextMessageMatching(
          controller,
          (message) => message.t === "state" && stateOf(message).players
            .find((player) => player.id === playerId)?.ready === (session % 2 === 0),
        );
        controller.send(JSON.stringify({ t: "ready", ready: session % 2 === 0 }));
        await state;
      }

      const reconnected = await connect(code);
      await joinController(reconnected, "device-room-rate");
      const closed = nextClose(reconnected);
      reconnected.send(JSON.stringify({ t: "g", d: "one-too-many" }));
      await expect(closed).resolves.toMatchObject({ code: 1008 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts one second of 20 Hz game input from ten controllers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code, hostToken } = await createParty();
      const host = await connect(code);
      await joinHost(host, hostToken);

      const picked = nextMessageMatching(host, (message) => message.t === "state" && stateOf(message).gameId === "kart");
      host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
      await picked;
      const launched = nextMessageMatching(host, (message) => message.t === "launch");
      host.send(JSON.stringify({ t: "launch" }));
      await launched;

      const controllers: WebSocket[] = [];
      const unexpectedCloses: CloseEvent[] = [];
      for (let player = 0; player < 10; player++) {
        const controller = await connect(code);
        await joinController(controller, `device-legitimate-${player}`);
        controller.addEventListener("close", (event) => unexpectedCloses.push(event));
        controllers.push(controller);
      }

      const routed = messagesMatching(host, (message) => message.t === "g", 200);
      for (let frame = 0; frame < 20; frame++) {
        for (let player = 0; player < controllers.length; player++) {
          controllers[player].send(JSON.stringify({ t: "g", d: { frame, player } }));
        }
      }
      await expect(routed).resolves.toHaveLength(200);
      expect(unexpectedCloses).toEqual([]);

      const lobby = nextMessageMatching(host, (message) => message.t === "state" && stateOf(message).phase === "lobby");
      host.send(JSON.stringify({ t: "backToLobby" }));
      await expect(lobby).resolves.toMatchObject({ t: "state", state: { phase: "lobby" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rate limits room creation by connecting IP", async () => {
    const responses = await Promise.all(
      Array.from({ length: 11 }, () => SELF.fetch("https://party.test/api/rooms", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.77" },
      })),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(10);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
  });

  it("keeps an archived identity through zero-live party grace before TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code } = await createParty();
      const original = await connect(code);
      const originalWelcome = await joinController(original, "device-ttl");
      const playerId = (originalWelcome.you as { id: string }).id;
      const occupied = [] as Array<{ socket: WebSocket; id: string }>;
      for (let i = 0; i < 9; i++) {
        const socket = await connect(code);
        const welcome = await joinController(socket, `device-ttl-${i}`);
        occupied.push({ socket, id: (welcome.you as { id: string }).id });
      }

      const originalLeft = nextMessageMatching(
        occupied[0].socket,
        (message) =>
          message.t === "state" &&
          stateOf(message).players.find((player) => player.id === playerId)?.connected === false,
      );
      original.close(1000, "battery flat");
      await originalLeft;
      vi.setSystemTime(new Date(Date.now() + GRACE_MS + 1));

      const replacement = await connect(code);
      await joinController(replacement, "device-ttl-replacement");

      const waiter = await connect(code);
      const waiting = nextMessageMatching(waiter, (message) => message.t === "waiting");
      waiter.send(JSON.stringify({ t: "hello", role: "controller", key: "device-ttl", name: "Alex" }));
      await expect(waiting).resolves.toMatchObject({ t: "waiting" });

      const seatLeft = nextMessageMatching(
        waiter,
        (message) =>
          message.t === "state" &&
          stateOf(message).players.find((player) => player.id === occupied[0].id)?.connected === false,
      );
      occupied[0].socket.close(1000, "left party");
      await seatLeft;

      await evictDurableObject(env.Room.get(env.Room.idFromName(code)), { webSockets: "close" });
      vi.setSystemTime(new Date(Date.now() + GRACE_MS + 1));

      const returning = await connect(code);
      const returned = await joinController(returning, "device-ttl");
      expect((returned.you as { id: string }).id).toBe(playerId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the replacement socket's player present when the old socket closes", async () => {
    const { code, hostToken } = await createParty();
    const first = await connect(code);
    const firstWelcome = await joinController(first, "device-race");
    const playerId = (firstWelcome.you as { id: string }).id;

    const replacement = await connect(code);
    const replacementWelcome = await joinController(replacement, "device-race");
    expect((replacementWelcome.you as { id: string }).id).toBe(playerId);

    first.close(1000, "network replaced");
    const observer = await connect(code);
    const state = stateOf(await joinHost(observer, hostToken));
    expect(state.players.find((player) => player.id === playerId)?.connected).toBe(true);
  });

  it("ignores a repeated hello from a controller that already claimed a player", async () => {
    const { code, hostToken } = await createParty();
    const controller = await connect(code);
    const welcome = await joinController(controller, "device-first", "Alex");
    const playerId = (welcome.you as { id: string }).id;

    controller.send(JSON.stringify({ t: "hello", role: "controller", key: "device-second", name: "Bea" }));

    const observer = await connect(code);
    const state = stateOf(await joinHost(observer, hostToken));
    expect(state.players).toEqual([expect.objectContaining({ id: playerId, name: "Alex", connected: true })]);
  });

  it("persists the original launch seed for a host reconnecting during a round", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);

    const picked = nextMessage(host);
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await picked;
    const launch = nextMessage(host);
    host.send(JSON.stringify({ t: "launch" }));
    const launchMessage = await launch;
    const seed = launchMessage.seed as number;

    const reloadedHost = await connect(code);
    const welcome = await joinHost(reloadedHost, hostToken);
    expect(stateOf(welcome).activeRound).toEqual({ gameId: "kart", seed });
  });

  it("lets only the host cancel an in-progress round without recording it", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);
    const controller = await connect(code);
    await joinController(controller, "device-exit");

    let state = nextMessageMatching(host, (message) => message.t === "state");
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await state;
    const launched = nextMessageMatching(host, (message) => message.t === "launch");
    host.send(JSON.stringify({ t: "launch" }));
    await launched;

    controller.send(JSON.stringify({ t: "backToLobby" }));
    const observer = await connect(code);
    expect(stateOf(await joinHost(observer, hostToken)).phase).toBe("playing");

    state = nextMessageMatching(observer, (message) => message.t === "state" && stateOf(message).phase === "lobby");
    observer.send(JSON.stringify({ t: "backToLobby" }));
    expect(stateOf(await state)).toMatchObject({ phase: "lobby", activeRound: null, round: 0, totals: {}, history: [] });

    observer.send(JSON.stringify({
      t: "roundOver",
      gameName: "Backyard Circuit",
      results: [{ id: "nobody", place: 1, score: 10 }],
    }));
    const reloaded = await connect(code);
    expect(stateOf(await joinHost(reloaded, hostToken))).toMatchObject({
      phase: "lobby",
      activeRound: null,
      round: 0,
      totals: {},
      history: [],
    });
  });

  it("lets a correct capability reconnect replace the host and receive controller input", async () => {
    const { code, hostToken } = await createParty();
    const oldHost = await connect(code);
    await joinHost(oldHost, hostToken);
    const controller = await connect(code);
    const controllerWelcome = await joinController(controller, "device-host");
    const playerId = (controllerWelcome.you as { id: string }).id;

    const oldHostClosed = nextClose(oldHost);
    const currentHost = await connect(code);
    await joinHost(currentHost, hostToken);
    await expect(oldHostClosed).resolves.toMatchObject({ code: 4001 });

    const picked = nextMessageMatching(currentHost, (message) => message.t === "state");
    currentHost.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await picked;
    const launched = nextMessageMatching(currentHost, (message) => message.t === "launch");
    currentHost.send(JSON.stringify({ t: "launch" }));
    await launched;

    const input = nextMessageMatching(currentHost, (message) => message.t === "g");
    controller.send(JSON.stringify({ t: "g", d: { steer: 1 } }));
    await expect(input).resolves.toMatchObject({ t: "g", from: playerId, d: { steer: 1 } });
  });

  it("rejects duplicate round results without changing the active round", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);
    const controller = await connect(code);
    const controllerWelcome = await joinController(controller, "device-results");
    const playerId = (controllerWelcome.you as { id: string }).id;

    const picked = nextMessageMatching(host, (message) => message.t === "state" && stateOf(message).gameId === "kart");
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await picked;
    const launched = nextMessageMatching(host, (message) => message.t === "launch");
    host.send(JSON.stringify({ t: "launch" }));
    await launched;

    const invalidClosed = nextClose(host);
    host.send(JSON.stringify({
      t: "roundOver",
      gameName: "Backyard Circuit",
      results: [
        { id: playerId, place: 1, score: 10 },
        { id: playerId, place: 2, score: 5 },
      ],
    }));
    await expect(invalidClosed).resolves.toMatchObject({ code: 1008 });

    const reconnected = await connect(code);
    expect(stateOf(await joinHost(reconnected, hostToken))).toMatchObject({
      phase: "playing",
      activeRound: { gameId: "kart" },
      round: 1,
      totals: {},
      history: [],
    });
  });

  it("routes ordinary controller input but disconnects a burst flood", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);
    const controller = await connect(code);
    await joinController(controller, "device-rate");

    const picked = nextMessageMatching(host, (message) => message.t === "state" && stateOf(message).gameId === "kart");
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await picked;
    const launched = nextMessageMatching(host, (message) => message.t === "launch");
    host.send(JSON.stringify({ t: "launch" }));
    await launched;

    for (let i = 0; i < 20; i++) {
      const routed = nextMessageMatching(host, (message) => message.t === "g" && (message.d as { n?: number }).n === i);
      controller.send(JSON.stringify({ t: "g", d: { n: i } }));
      await routed;
    }

    const flooded = nextClose(controller);
    for (let i = 0; i < 100; i++) controller.send(JSON.stringify({ t: "g", d: { n: i + 20 } }));
    await expect(flooded).resolves.toMatchObject({ code: 1008 });
  });

  it("keeps hibernated controllers present and routes their next input", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);
    const controller = await connect(code);
    const controllerWelcome = await joinController(controller, "device-sleep");
    const playerId = (controllerWelcome.you as { id: string }).id;

    const picked = nextMessage(host);
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await picked;
    const launch = nextMessage(host);
    host.send(JSON.stringify({ t: "launch" }));
    await launch;

    await evictDurableObject(env.Room.get(env.Room.idFromName(code)));

    const resumedHost = await connect(code);
    const resumedWelcome = await joinHost(resumedHost, hostToken);
    expect(stateOf(resumedWelcome).players.find((player) => player.id === playerId)?.connected).toBe(true);

    const routed = nextMessage(resumedHost);
    controller.send(JSON.stringify({ t: "g", d: { steer: 1 } }));
    await expect(routed).resolves.toMatchObject({ t: "g", from: playerId, d: { steer: 1 } });
  });

  it("promotes a queued reconnect when its reclaim alarm wakes a cold room", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code } = await createParty();
      const original = await connect(code);
      const originalWelcome = await joinController(original, "device-cold");
      const playerId = (originalWelcome.you as { id: string }).id;
      const occupied = [] as Array<{ socket: WebSocket; id: string }>;
      for (let i = 0; i < 9; i++) {
        const socket = await connect(code);
        const welcome = await joinController(socket, `device-cold-${i}`);
        occupied.push({ socket, id: (welcome.you as { id: string }).id });
      }

      const originalLeft = nextMessageMatching(
        occupied[0].socket,
        (message) =>
          message.t === "state" &&
          stateOf(message).players.find((player) => player.id === playerId)?.connected === false,
      );
      original.close(1000, "battery flat");
      await originalLeft;
      vi.setSystemTime(new Date(Date.now() + GRACE_MS + 1));

      const replacement = await connect(code);
      await joinController(replacement, "device-cold-replacement");
      const waiter = await connect(code);
      const waiting = nextMessageMatching(waiter, (message) => message.t === "waiting");
      waiter.send(JSON.stringify({ t: "hello", role: "controller", key: "device-cold", name: "Alex" }));
      await waiting;

      const seatLeft = nextMessageMatching(
        waiter,
        (message) =>
          message.t === "state" &&
          stateOf(message).players.find((player) => player.id === occupied[0].id)?.connected === false,
      );
      occupied[0].socket.close(1000, "left party");
      await seatLeft;

      await evictDurableObject(env.Room.get(env.Room.idFromName(code)));
      const promoted = nextMessageMatching(waiter, (message) => message.t === "welcome");
      vi.setSystemTime(new Date(Date.now() + GRACE_MS + 1));
      await runDurableObjectAlarm(env.Room.get(env.Room.idFromName(code)));
      await expect(promoted).resolves.toMatchObject({ t: "welcome", you: { id: playerId } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists a disconnect before eviction", async () => {
    const { code, hostToken } = await createParty();
    const host = await connect(code);
    await joinHost(host, hostToken);
    const controller = await connect(code);
    const welcome = await joinController(controller, "device-close");
    const playerId = (welcome.you as { id: string }).id;

    const disconnected = nextMessageMatching(
      host,
      (message) =>
        message.t === "state" &&
        stateOf(message).players.find((player) => player.id === playerId)?.connected === false,
    );
    controller.close(1000, "offline");
    await disconnected;

    await evictDurableObject(env.Room.get(env.Room.idFromName(code)));
    const observer = await connect(code);
    const observed = await joinHost(observer, hostToken);
    expect(stateOf(observed).players.find((player) => player.id === playerId)?.connected).toBe(false);
  });

  it("queues an archived identity and promotes it with its original id when a seat expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const { code } = await createParty();
      const archived = await connect(code);
      const archivedWelcome = await joinController(archived, "device-archived");
      const archivedId = (archivedWelcome.you as { id: string }).id;

      const occupied = [] as Array<{ socket: WebSocket; id: string }>;
      for (let i = 0; i < 9; i++) {
        const socket = await connect(code);
        const welcome = await joinController(socket, `device-live-${i}`);
        occupied.push({ socket, id: (welcome.you as { id: string }).id });
      }

      const left = nextMessageMatching(
        occupied[0].socket,
        (message) =>
          message.t === "state" &&
          stateOf(message).players.find((player) => player.id === archivedId)?.connected === false,
      );
      archived.close(1000, "battery flat");
      await left;
      vi.setSystemTime(new Date(Date.now() + GRACE_MS + 1));

      const replacement = await connect(code);
      await joinController(replacement, "device-replacement");

      const returning = await connect(code);
      const waiting = nextMessageMatching(returning, (message) => message.t === "waiting");
      returning.send(JSON.stringify({ t: "hello", role: "controller", key: "device-archived", name: "Alex" }));
      await expect(waiting).resolves.toMatchObject({ t: "waiting" });

      const closing = nextMessageMatching(
        returning,
        (message) =>
          message.t === "state" &&
          stateOf(message).players.find((player) => player.id === occupied[0].id)?.connected === false,
      );
      occupied[0].socket.close(1000, "left party");
      await closing;
      vi.setSystemTime(new Date(Date.now() + GRACE_MS + 1));

      const promoted = nextMessageMatching(returning, (message) => message.t === "welcome");
      await expect(runDurableObjectAlarm(env.Room.get(env.Room.idFromName(code)))).resolves.toBe(true);
      await expect(promoted).resolves.toMatchObject({ t: "welcome", you: { id: archivedId } });
    } finally {
      vi.useRealTimers();
    }
  });
});
