import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControllerApp } from "../../src/client/ControllerApp";
import { HostApp } from "../../src/client/HostApp";
import { lastHostedParty } from "../../src/client/identity";
import { useRoom } from "../../src/client/useRoom";

const socketHarness = vi.hoisted(() => {
  const sockets: FakePartySocket[] = [];

  class FakePartySocket extends EventTarget {
    sent: string[] = [];

    constructor(_options: unknown) {
      super();
      sockets.push(this);
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }

    send(message: string) {
      this.sent.push(message);
    }

    close() {
      this.dispatchEvent(new CloseEvent("close"));
    }

    receive(message: unknown) {
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
    }
  }

  return { sockets, FakePartySocket };
});

type FakePartySocket = InstanceType<typeof socketHarness.FakePartySocket>;

const gameHarness = vi.hoisted(() => ({
  current: null as {
    destroy: ReturnType<typeof vi.fn>;
    isOver: () => boolean;
    onInput: ReturnType<typeof vi.fn>;
    onJoin: ReturnType<typeof vi.fn>;
    onLeave: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    results: () => [];
    tick: ReturnType<typeof vi.fn>;
  } | null,
  createHost: vi.fn(),
}));
gameHarness.createHost.mockImplementation(() => {
  const game = {
    destroy: vi.fn(),
    isOver: () => false,
    onInput: vi.fn(),
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    render: vi.fn(),
    results: () => [],
    tick: vi.fn(),
  };
  gameHarness.current = game;
  return game;
});

vi.mock("partysocket", () => ({ default: socketHarness.FakePartySocket }));
vi.mock("qrcode", () => ({ default: { toCanvas: vi.fn() } }));
vi.mock("../../src/client/games/registry", () => ({
  GAME_LIST: [],
  GAMES: {
    kart: {
      loadController: async () => ({ default: () => <p>Recovered kart controls</p> }),
      loadHost: async () => ({ createHost: gameHarness.createHost }),
    },
  },
}));

const stored = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return stored.size;
  },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => stored.delete(key),
  setItem: (key, value) => stored.set(key, value),
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });

const playingWelcome = {
  t: "welcome",
  you: {
    id: "player-1",
    name: "Alex",
    seat: 0,
    color: "#FF5A47",
    connected: true,
    ready: false,
    awayAt: null,
  },
  state: {
    code: "SEED",
    phase: "playing",
    gameId: "kart",
    activeRound: { gameId: "kart", seed: 12345 },
    players: [],
    totals: {},
    history: [],
    round: 1,
    startedAt: 0,
  },
};

describe("controller reconnect", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("party.name", "Alex");
    socketHarness.sockets.length = 0;
    gameHarness.createHost.mockClear();
    gameHarness.current = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("waits for a first-time player name before opening the socket and sends it in hello", async () => {
    localStorage.clear();
    render(<ControllerApp code="NAME" />);

    expect(socketHarness.sockets).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Join party NAME" }));

    await waitFor(() => expect(socketHarness.sockets).toHaveLength(1));
    await waitFor(() =>
      expect(socketHarness.sockets[0].sent.map((message) => JSON.parse(message))).toContainEqual(
        expect.objectContaining({ t: "hello", role: "controller", name: "Alex" }),
      ),
    );
  });

  it("loads its controls again when a reconnect welcome says the round is already playing", async () => {
    render(<ControllerApp code="SEED" />);
    const socket = socketHarness.sockets[0];
    await act(async () => {
      socket.receive(playingWelcome);
    });

    expect(await screen.findByText("Recovered kart controls")).toBeTruthy();
  });

  it("ignores stale socket events and clears an error after the current socket welcomes it", async () => {
    const Probe = ({ code }: { code: string }) => {
      const room = useRoom({ code, role: "controller" });
      return <p>{room.error ?? (room.connected ? `connected:${code}` : `disconnected:${code}`)}</p>;
    };

    const view = render(<Probe code="OLD" />);
    expect(await screen.findByText("connected:OLD")).toBeTruthy();
    const oldSocket = socketHarness.sockets[0];

    view.rerender(<Probe code="NEW" />);
    expect(await screen.findByText("connected:NEW")).toBeTruthy();
    const currentSocket = socketHarness.sockets[1];

    await act(async () => {
      oldSocket.receive({ t: "error", message: "This party is full." });
      oldSocket.dispatchEvent(new CloseEvent("close"));
    });
    expect(screen.getByText("connected:NEW")).toBeTruthy();

    await act(async () => currentSocket.receive({ t: "error", message: "This party is full." }));
    expect(screen.getByText("This party is full.")).toBeTruthy();

    await act(async () => currentSocket.receive({ ...playingWelcome, state: { ...playingWelcome.state, code: "NEW" } }));
    expect(await screen.findByText("connected:NEW")).toBeTruthy();
  });

  it("starts the projector game once from the persisted seed in a playing welcome", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);

    localStorage.setItem("party.hostToken.SEED", "host-secret");
    render(<HostApp code="SEED" />);
    const socket = socketHarness.sockets[0];
    await waitFor(() =>
      expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
        t: "hello",
        role: "host",
        token: "host-secret",
      }),
    );
    await act(async () => {
      socket.receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
      });
    });

    await waitFor(() => expect(gameHarness.createHost).toHaveBeenCalledTimes(1));
    expect(gameHarness.createHost).toHaveBeenCalledWith(
      expect.objectContaining({ seed: playingWelcome.state.activeRound.seed }),
    );
  });

  it("does not replace the last hosted party when a guessed host URL is unauthorized", async () => {
    localStorage.setItem("party.lastHosted", "SAFE");
    localStorage.setItem("party.hostToken.SAFE", "safe-secret");
    render(<HostApp code="GUESS" />);
    const socket = socketHarness.sockets[0];
    await waitFor(() => expect(socket.sent).toHaveLength(1));

    await act(async () => {
      socket.dispatchEvent(new CloseEvent("close", { code: 4003 }));
    });

    expect(await screen.findByText("This screen doesn't have the host key for this party.")).toBeTruthy();
    expect(lastHostedParty()).toBe("SAFE");
  });

  it("records a hosted party only after its authenticated welcome", async () => {
    localStorage.setItem("party.lastHosted", "SAFE");
    localStorage.setItem("party.hostToken.NEWW", "new-secret");
    render(<HostApp code="NEWW" />);
    expect(lastHostedParty()).toBe("SAFE");

    await act(async () => {
      socketHarness.sockets[0].receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
        state: {
          ...playingWelcome.state,
          code: "NEWW",
          phase: "lobby",
          gameId: null,
          activeRound: null,
        },
      });
    });

    await waitFor(() => expect(lastHostedParty()).toBe("NEWW"));
  });

  it("notifies the running game when the durable roster gains or loses a player", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const alex = playingWelcome.you;
    const bea = { ...alex, id: "player-2", name: "Bea", seat: 1, color: "#FFC24A" };

    render(<HostApp code="ROSTER" />);
    const socket = socketHarness.sockets[0];
    await act(async () => {
      socket.receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
        state: { ...playingWelcome.state, code: "ROSTER", players: [alex] },
      });
    });
    await waitFor(() => expect(gameHarness.current).not.toBeNull());

    await act(async () => socket.receive({ t: "state", state: { ...playingWelcome.state, code: "ROSTER", players: [alex, bea] } }));
    expect(gameHarness.current?.onJoin).toHaveBeenCalledWith(bea);

    await act(async () => socket.receive({ t: "state", state: { ...playingWelcome.state, code: "ROSTER", players: [bea] } }));
    expect(gameHarness.current?.onLeave).toHaveBeenCalledWith(alex.id);
  });

  it("asks the projector operator before cancelling the current round", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    render(<HostApp code="EXIT" />);
    const socket = socketHarness.sockets[0];
    await act(async () => {
      socket.receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Exit game" }));
    expect(screen.getByRole("dialog", { name: "Exit this game?" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep playing" }));
    expect(socket.sent.map((message) => JSON.parse(message))).not.toContainEqual({ t: "backToLobby" });

    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.queryByRole("dialog", { name: "Exit this game?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Exit game" }));
    await act(async () => {
      socket.receive({
        t: "state",
        state: { ...playingWelcome.state, phase: "lobby", gameId: null, activeRound: null, round: 0 },
      });
    });
    expect(screen.queryByRole("dialog", { name: "Exit this game?" })).toBeNull();

    await act(async () => {
      socket.receive({
        t: "state",
        state: { ...playingWelcome.state, activeRound: { gameId: "kart", seed: 67890 } },
      });
    });
    expect(await screen.findByRole("button", { name: "Exit game" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Exit this game?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Exit game" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit game" }));
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({ t: "backToLobby" });
  });

});
