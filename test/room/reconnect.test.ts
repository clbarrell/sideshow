import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { GRACE_MS } from "../../src/shared/protocol";

type Message = Record<string, unknown>;

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

async function joinHost(socket: WebSocket) {
  const welcome = nextMessage(socket);
  socket.send(JSON.stringify({ t: "hello", role: "host" }));
  const message = await welcome;
  await nextMessage(socket);
  return message;
}

function stateOf(message: Message) {
  return message.state as {
    activeRound?: { gameId: string; seed: number } | null;
    phase?: string;
    round?: number;
    totals?: Record<string, number>;
    history?: unknown[];
    players: Array<{ id: string; connected: boolean }>;
  };
}

describe("room reconnect protocol", () => {
  it("keeps an archived identity through zero-live party grace before TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const code = "TTL";
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
    const code = "RACE";
    const first = await connect(code);
    const firstWelcome = await joinController(first, "device-race");
    const playerId = (firstWelcome.you as { id: string }).id;

    const replacement = await connect(code);
    const replacementWelcome = await joinController(replacement, "device-race");
    expect((replacementWelcome.you as { id: string }).id).toBe(playerId);

    first.close(1000, "network replaced");
    const observer = await connect(code);
    const state = stateOf(await joinHost(observer));
    expect(state.players.find((player) => player.id === playerId)?.connected).toBe(true);
  });

  it("ignores a repeated hello from a controller that already claimed a player", async () => {
    const code = "HELLO";
    const controller = await connect(code);
    const welcome = await joinController(controller, "device-first", "Alex");
    const playerId = (welcome.you as { id: string }).id;

    controller.send(JSON.stringify({ t: "hello", role: "controller", key: "device-second", name: "Bea" }));

    const observer = await connect(code);
    const state = stateOf(await joinHost(observer));
    expect(state.players).toEqual([expect.objectContaining({ id: playerId, name: "Alex", connected: true })]);
  });

  it("persists the original launch seed for a host reconnecting during a round", async () => {
    const code = "SEED";
    const host = await connect(code);
    await joinHost(host);

    const picked = nextMessage(host);
    host.send(JSON.stringify({ t: "pick", gameId: "kart" }));
    await picked;
    const launch = nextMessage(host);
    host.send(JSON.stringify({ t: "launch" }));
    const launchMessage = await launch;
    const seed = launchMessage.seed as number;

    const reloadedHost = await connect(code);
    const welcome = await joinHost(reloadedHost);
    expect(stateOf(welcome).activeRound).toEqual({ gameId: "kart", seed });
  });

  it("lets only the host cancel an in-progress round without recording it", async () => {
    const code = "EXIT";
    const host = await connect(code);
    await joinHost(host);
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
    expect(stateOf(await joinHost(observer)).phase).toBe("playing");

    state = nextMessageMatching(observer, (message) => message.t === "state" && stateOf(message).phase === "lobby");
    observer.send(JSON.stringify({ t: "backToLobby" }));
    expect(stateOf(await state)).toMatchObject({ phase: "lobby", activeRound: null, round: 0, totals: {}, history: [] });

    observer.send(JSON.stringify({
      t: "roundOver",
      gameName: "Backyard Circuit",
      results: [{ id: "nobody", place: 1, score: 10 }],
    }));
    const reloaded = await connect(code);
    expect(stateOf(await joinHost(reloaded))).toMatchObject({
      phase: "lobby",
      activeRound: null,
      round: 0,
      totals: {},
      history: [],
    });
  });

  it("closes a superseded host and routes controller input only to the current host", async () => {
    const code = "HOST";
    const oldHost = await connect(code);
    await joinHost(oldHost);
    const controller = await connect(code);
    const controllerWelcome = await joinController(controller, "device-host");
    const playerId = (controllerWelcome.you as { id: string }).id;

    const oldHostClosed = nextClose(oldHost);
    const currentHost = await connect(code);
    await joinHost(currentHost);
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

  it("keeps hibernated controllers present and routes their next input", async () => {
    const code = "SLEEP";
    const host = await connect(code);
    await joinHost(host);
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
    const resumedWelcome = await joinHost(resumedHost);
    expect(stateOf(resumedWelcome).players.find((player) => player.id === playerId)?.connected).toBe(true);

    const routed = nextMessage(resumedHost);
    controller.send(JSON.stringify({ t: "g", d: { steer: 1 } }));
    await expect(routed).resolves.toMatchObject({ t: "g", from: playerId, d: { steer: 1 } });
  });

  it("promotes a queued reconnect when its reclaim alarm wakes a cold room", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const code = "COLD";
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
    const code = "CLOSE";
    const host = await connect(code);
    await joinHost(host);
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
    const observed = await joinHost(observer);
    expect(stateOf(observed).players.find((player) => player.id === playerId)?.connected).toBe(false);
  });

  it("queues an archived identity and promotes it with its original id when a seat expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      const code = "QUEUE";
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
