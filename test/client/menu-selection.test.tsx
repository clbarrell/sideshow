import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoomState } from "../../src/shared/protocol";
import { HostApp } from "../../src/client/HostApp";

const harness = vi.hoisted(() => ({
  state: null as RoomState | null,
  send: vi.fn(),
  play: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../../src/client/useRoom", () => ({
  useRoom: () => ({ state: harness.state, connected: true, send: harness.send }),
}));
vi.mock("../../src/client/menu-sound", () => ({
  MenuSound: class {
    play = harness.play;
    destroy = harness.destroy;
  },
}));
vi.mock("qrcode", () => ({ default: { toCanvas: vi.fn() } }));
vi.mock("../../src/client/games/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/games/registry")>();
  const game = { id: "test", name: "Party Test", minPlayers: 1, maxPlayers: 10, tagline: "Play together", controls: "Tap" };
  return { ...actual, GAME_LIST: [game], GAMES: { test: { manifest: game } } };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  harness.state = {
    code: "TEST", partyName: "", phase: "lobby", gameId: null,
    activeRound: null, players: [], totals: {}, history: [], round: 0, startedAt: 0,
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("plays browsing and selection feedback, while an unavailable start stays silent", () => {
  const { rerender, unmount } = render(<HostApp code="TEST" />);
  const game = screen.getByRole("button", { name: /Party Test/ });
  fireEvent.pointerEnter(game);
  fireEvent.focus(game);
  expect(harness.play.mock.calls).toEqual([["browse"], ["browse"]]);
  harness.play.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Pick a game" }));
  expect(harness.play).not.toHaveBeenCalled();
  expect(harness.send).not.toHaveBeenCalled();
  fireEvent.click(game);
  expect(harness.play).toHaveBeenCalledExactlyOnceWith("select");
  expect(harness.send).toHaveBeenCalledExactlyOnceWith({ t: "pick", gameId: "test" });

  harness.state = { ...harness.state!, gameId: "test" };
  rerender(<HostApp code="TEST" />);
  harness.play.mockClear();
  harness.send.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Need 1 player" }));
  expect(harness.play).not.toHaveBeenCalled();
  expect(harness.send).not.toHaveBeenCalled();
  fireEvent.click(game);
  expect(harness.play).not.toHaveBeenCalled();

  harness.state = {
    ...harness.state,
    players: [{ id: "one", name: "Alex", seat: 0, color: "#ffffff", connected: true, ready: true, awayAt: null }],
  };
  rerender(<HostApp code="TEST" />);
  harness.send.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Start round 1" }));
  expect(harness.play).toHaveBeenCalledExactlyOnceWith("launch");
  expect(harness.send).toHaveBeenCalledExactlyOnceWith({ t: "launch" });
  unmount();
  expect(harness.destroy).toHaveBeenCalledOnce();
});
