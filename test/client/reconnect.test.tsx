import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControllerApp } from "../../src/client/ControllerApp";
import { HostApp } from "../../src/client/HostApp";
import { deviceKey, lastHostedParty } from "../../src/client/identity";
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
  GAME_LIST: [{
    id: "kart",
    name: "Backyard Circuit",
    tagline: "Three laps of turbo gates, bumper hits, and last-place comebacks.",
    minPlayers: 1,
    maxPlayers: 10,
    controls: "Turn your phone sideways. Steer left, drive right, and tap BOOST.",
  }],
  GAMES: {
    kart: {
      manifest: {
        id: "kart",
        name: "Backyard Circuit",
        tagline: "Three laps of turbo gates, bumper hits, and last-place comebacks.",
        minPlayers: 1,
        maxPlayers: 10,
        controls: "Turn your phone sideways. Steer left, drive right, and tap BOOST.",
      },
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
    partyName: "",
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
    vi.unstubAllGlobals();
  });

  it("waits for a first-time player name before opening the socket and sends it in hello", async () => {
    localStorage.clear();
    render(<ControllerApp code="NAME" />);

    expect(socketHarness.sockets).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Alex" } });
    fireEvent.submit(screen.getByRole("button", { name: "Join party NAME" }).closest("form")!);

    await waitFor(() => expect(socketHarness.sockets).toHaveLength(1));
    await waitFor(() =>
      expect(socketHarness.sockets[0].sent.map((message) => JSON.parse(message))).toContainEqual(
        expect.objectContaining({ t: "hello", role: "controller", name: "Alex" }),
      ),
    );
  });

  it("keeps blank names disabled and trims a submitted nickname", async () => {
    localStorage.clear();
    render(<ControllerApp code="TRIM" />);

    const input = screen.getByLabelText("Your name");
    const submit = screen.getByRole("button", { name: "Join party TRIM" });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "   " } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "  Roo  " } });
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect(socketHarness.sockets).toHaveLength(1));
    await waitFor(() =>
      expect(socketHarness.sockets[0].sent.map((message) => JSON.parse(message))).toContainEqual(
        expect.objectContaining({ t: "hello", role: "controller", name: "Roo" }),
      ),
    );
    expect(localStorage.getItem("party.name")).toBe("Roo");
  });

  it("connects on LAN browsers where randomUUID is unavailable", async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.forEach((_, index) => {
        bytes[index] = index;
      });
      return bytes;
    });
    vi.stubGlobal("crypto", {
      getRandomValues,
    });
    localStorage.clear();
    render(<ControllerApp code="LAN1" />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Alex" } });
    fireEvent.submit(screen.getByRole("button", { name: "Join party LAN1" }).closest("form")!);

    await waitFor(() => expect(socketHarness.sockets).toHaveLength(1));
    await waitFor(() =>
      expect(socketHarness.sockets[0].sent.map((message) => JSON.parse(message))).toContainEqual(
        expect.objectContaining({
          t: "hello",
          role: "controller",
          key: "00010203-0405-4607-8809-0a0b0c0d0e0f",
        }),
      ),
    );
    expect(localStorage.getItem("party.deviceKey")).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(deviceKey()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("loads its controls again when a reconnect welcome says the round is already playing", async () => {
    render(<ControllerApp code="SEED" />);
    const socket = socketHarness.sockets[0];
    await act(async () => {
      socket.receive(playingWelcome);
    });

    expect(await screen.findByText("Recovered kart controls")).toBeTruthy();
  });

  it("makes confirmed readiness and its undo action explicit on the phone", async () => {
    render(<ControllerApp code="READY" />);
    const socket = socketHarness.sockets[0];
    const me = { ...playingWelcome.you, ready: false };
    await act(async () => {
      socket.receive({
        ...playingWelcome,
        state: { ...playingWelcome.state, code: "READY", partyName: "Brendan's birthday", phase: "lobby", players: [me] },
      });
    });

    expect(screen.getByText("Brendan's birthday")).toBeTruthy();
    expect(screen.getByText("Code READY")).toBeTruthy();
    const ready = screen.getByRole("button", { name: /Ready up/ });
    expect(ready.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ready);
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({ t: "ready", ready: true });

    await act(async () => {
      socket.receive({ t: "state", state: { ...playingWelcome.state, code: "READY", phase: "lobby", players: [{ ...me, ready: true }] } });
    });
    const confirmed = screen.getByRole("button", { name: /You're ready.*change your mind/ });
    expect(confirmed.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(confirmed);
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({ t: "ready", ready: false });
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

  it("destroys the projector game when a round finishes naturally", async () => {
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);

    render(<HostApp code="DONE" />);
    const socket = socketHarness.sockets[0];
    await act(async () => {
      socket.receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
        state: { ...playingWelcome.state, code: "DONE" },
      });
    });
    await waitFor(() => expect(gameHarness.current).not.toBeNull());
    const game = gameHarness.current!;
    game.isOver = () => true;

    act(() => frame?.(performance.now()));

    expect(game.destroy).toHaveBeenCalledOnce();
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      t: "roundOver",
      results: [],
      gameName: "Backyard Circuit",
    });
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

  it("shows ready, waiting, and away players and updates the lobby summary", async () => {
    localStorage.setItem("party.hostToken.READ", "host-secret");
    const alex = { ...playingWelcome.you, ready: false };
    const bea = { ...playingWelcome.you, id: "player-2", name: "Bea", seat: 1, color: "#FFC24A", ready: true };
    const cam = { ...playingWelcome.you, id: "player-3", name: "Cam", seat: 2, color: "#72D6C9", connected: false, ready: true };
    render(<HostApp code="READ" />);
    const socket = socketHarness.sockets[0];

    await act(async () => {
      socket.receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
        state: {
          ...playingWelcome.state,
          code: "READ",
          phase: "lobby",
          gameId: null,
          activeRound: null,
          players: [alex, bea, cam],
        },
      });
    });

    expect(screen.getByText("1/2 here ready · 1 away")).toBeTruthy();
    expect(screen.getByText("Alex").closest("li")?.textContent).toBe("Alex");
    expect(screen.getByLabelText("Ready").closest("li")?.textContent).toContain("Bea");
    expect(screen.getByText("Away").closest("li")?.textContent).toContain("Cam");
    expect(screen.getByText("Away").closest("li")?.textContent).not.toContain("Ready");
    expect(screen.queryByText("Waiting")).toBeNull();

    await act(async () => {
      socket.receive({
        t: "state",
        state: {
          ...playingWelcome.state,
          code: "READ",
          phase: "lobby",
          gameId: null,
          activeRound: null,
          players: [{ ...alex, ready: true }, bea, cam],
        },
      });
    });
    expect(screen.getByText("2/2 here ready · 1 away")).toBeTruthy();
    expect(screen.getAllByLabelText("Ready")).toHaveLength(2);
  });

  it("keeps a status indicator for every seat at the ten-player limit", async () => {
    localStorage.setItem("party.hostToken.FULL", "host-secret");
    const players = Array.from({ length: 10 }, (_, index) => ({
      ...playingWelcome.you,
      id: `player-${index}`,
      name: `PlayerName${index + 1}`,
      seat: index,
      ready: index % 2 === 0,
    }));
    render(<HostApp code="FULL" />);

    await act(async () => {
      socketHarness.sockets[0].receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
        state: {
          ...playingWelcome.state,
          code: "FULL",
          phase: "lobby",
          gameId: null,
          activeRound: null,
          players,
        },
      });
    });

    expect(screen.getByText("5/10 here ready")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Players" }).querySelectorAll("li")).toHaveLength(10);
    expect(screen.getAllByLabelText("Ready")).toHaveLength(5);
    expect(screen.queryByText("Waiting")).toBeNull();
  });

  it("lets the host name the party without writing on every keystroke", async () => {
    localStorage.setItem("party.hostToken.NAME", "host-secret");
    render(<HostApp code="NAME" />);
    const socket = socketHarness.sockets[0];
    await act(async () => {
      socket.receive({
        ...playingWelcome,
        you: { ...playingWelcome.you, id: "host", name: "Big screen", seat: -1 },
        state: { ...playingWelcome.state, code: "NAME", phase: "lobby", gameId: null, activeRound: null },
      });
    });

    const input = screen.getByLabelText("Party name");
    const before = socket.sent.length;
    fireEvent.change(input, { target: { value: "Brendan's birthday" } });
    expect(socket.sent).toHaveLength(before);
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      t: "setPartyName",
      name: "Brendan's birthday",
    });

    await act(async () => {
      socket.receive({
        t: "state",
        state: {
          ...playingWelcome.state,
          code: "NAME",
          partyName: "Brendan's birthday",
          phase: "lobby",
          gameId: null,
          activeRound: null,
        },
      });
    });

    expect(screen.getByRole("heading", { name: "Brendan's birthday", level: 1 })).toBeTruthy();
    expect(screen.queryByLabelText("Party name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Party name") as HTMLInputElement).value).toBe("Brendan's birthday");

    fireEvent.change(screen.getByLabelText("Party name"), { target: { value: "Bman's   birthday" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Bman's birthday", level: 1 })).toBeNull();
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      t: "setPartyName",
      name: "Bman's birthday",
    });

    await act(async () => {
      socket.receive({
        t: "state",
        state: {
          ...playingWelcome.state,
          code: "NAME",
          partyName: "Bman's birthday",
          phase: "lobby",
          gameId: null,
          activeRound: null,
        },
      });
    });
    expect(screen.getByRole("heading", { name: "Bman's birthday", level: 1 })).toBeTruthy();
    expect(screen.queryByLabelText("Party name")).toBeNull();
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
