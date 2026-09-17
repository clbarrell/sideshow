import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostApp } from "../../src/client/HostApp";

const socketHarness = vi.hoisted(() => {
  class FakePartySocket extends EventTarget {
    sent: string[] = [];
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
      socketHarness.instances.push(this);
    }
    send(message: string) { this.sent.push(message); }
    close() { this.dispatchEvent(new CloseEvent("close")); }
    receive(message: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })); }
  }
  return { FakePartySocket, instances: [] as FakePartySocket[] };
});

vi.mock("partysocket", () => ({ default: socketHarness.FakePartySocket }));
vi.mock("qrcode", () => ({ default: { toCanvas: vi.fn() } }));

const stored = new Map<string, string>();
const storage = {
  get length() { return stored.size; },
  clear: () => stored.clear(),
  getItem: (key: string) => stored.get(key) ?? null,
  key: (index: number) => [...stored.keys()][index] ?? null,
  removeItem: (key: string) => stored.delete(key),
  setItem: (key: string, value: string) => stored.set(key, value),
} satisfies Storage;
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

afterEach(() => {
  cleanup();
  stored.clear();
  socketHarness.instances.length = 0;
});

function player(index: number) {
  return { id: `p${index + 1}`, name: `Player${index + 1}`, seat: index, color: `hsl(${index * 36} 80% 60%)`, connected: true, ready: true, awayAt: null };
}

function lobbyState(count: number) {
  return {
    code: "EVEN",
    partyName: "",
    phase: "lobby" as const,
    gameId: "getaway",
    activeRound: null,
    players: Array.from({ length: count }, (_, index) => player(index)),
    totals: {},
    history: [],
    round: 0,
    startedAt: 0,
  };
}

describe("Getaway lobby eligibility", () => {
  it("advertises and enables every roster from four through ten", async () => {
    storage.setItem("party.hostToken.EVEN", "host-secret");
    render(<HostApp code="EVEN" />);
    const socket = socketHarness.instances[0];
    await act(async () => {
      socket.receive({ t: "welcome", you: { ...player(0), id: "host", seat: -1 }, state: lobbyState(5) });
    });
    expect(screen.getAllByText("4–10 players").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Start round 1" }).hasAttribute("disabled")).toBe(false);

    for (const count of [4, 5, 6, 7, 8, 9, 10]) {
      await act(async () => { socket.receive({ t: "state", state: lobbyState(count) }); });
      expect(screen.getByRole("button", { name: "Start round 1" }).hasAttribute("disabled")).toBe(false);
    }
    for (const count of [1, 2, 3]) {
      await act(async () => { socket.receive({ t: "state", state: lobbyState(count) }); });
      expect(screen.getByRole("button", { name: "Need 4 players" }).hasAttribute("disabled")).toBe(true);
    }
  });
});
