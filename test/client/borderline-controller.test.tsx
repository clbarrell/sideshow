import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BorderlineController from "../../src/client/games/borderline/controller";
import type { BorderlineFrame } from "../../src/client/games/borderline/protocol";

const you = { id: "p1", name: "Alexandria", seat: 0, color: "#ff5a47", connected: true, ready: true, awayAt: null };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function frame(overrides: Partial<BorderlineFrame> = {}): BorderlineFrame {
  const players = Array.from({ length: 10 }, (_, index) => ({
    id: `p${index + 1}`,
    name: ["Alexandria", "Benjamin", "Charlotte", "Dominic", "Evangeline", "Fitzwilliam", "Guadalupe", "Hannelore", "Isabella", "Jacqueline"][index],
    seat: index,
    color: `hsl(${index * 36} 80% 60%)`,
    emblem: ["◆", "▲", "●", "✦", "■", "⬟", "✚", "✿", "⬢", "★"][index],
    score: index,
    territoryCount: 1,
    forces: [1, 2, 3] as [1, 2, 3],
    homeProvince: index * 2 + 1,
    homeEntries: [index * 2 + 1, index * 2 + 2] as [number, number],
    connected: true,
  }));
  const provinceOwners = Array<string | null>(24).fill(null);
  provinceOwners[0] = "p1";
  return {
    t: "borderlineState",
    session: "host-session-1",
    phase: "planning",
    turn: 1,
    turns: 9,
    seconds: 20,
    inputSeq: 0,
    provinceOwners,
    players,
    legal: { invade: [2, 7], guard: [1] },
    forces: [1, 2, 3],
    committed: null,
    fallback: { mode: "guard", target: 1, force: 1 },
    message: "Choose mode, province and force.",
    ...overrides,
  };
}

describe("Borderline phone", () => {
  it("keeps controller construction alive when WebAudio construction is blocked", () => {
    vi.stubGlobal("AudioContext", class {
      constructor() { throw new Error("audio blocked"); }
    });
    expect(() => render(<BorderlineController you={you} send={vi.fn()} last={frame()} connected />)).not.toThrow();
    expect(screen.getByRole("button", { name: "INVADE" })).toBeTruthy();
  });

  it("uses a stable 6x4 target pad and sends mode, target, force, turn and sequence", () => {
    const send = vi.fn();
    render(<BorderlineController you={you} send={send} last={frame()} connected />);
    expect(screen.getAllByRole("button", { name: /Province \d+/ })).toHaveLength(24);
    expect(screen.getByText("No order: GUARD 1 · FORCE 1 (lowest owned province)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "INVADE" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 2,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force 2 available" }));
    expect(screen.getByText("INVADE 2 · FORCE 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "COMMIT ORDER" }));
    expect(send).toHaveBeenLastCalledWith({ t: "order", turn: 1, seq: 1, mode: "invade", target: 2, force: 2 });
  });

  it("shows an owner-only acknowledgement and keeps the accepted order editable", async () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame()} connected />);
    fireEvent.click(screen.getByRole("button", { name: "INVADE" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 2,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force 2 available" }));
    fireEvent.click(screen.getByRole("button", { name: "COMMIT ORDER" }));

    view.rerender(<BorderlineController you={you} send={send} last={frame({
      inputSeq: 1,
      committed: { mode: "invade", target: 2, force: 2 },
      message: "Committed. You can still edit before lock.",
    })} connected />);
    expect(await screen.findByText("✓ COMMITTED")).toBeTruthy();
    expect(screen.getByText("INVADE 2 · FORCE 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
    fireEvent.click(screen.getByRole("button", { name: "GUARD" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 1,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force 3 available" }));
    fireEvent.click(screen.getByRole("button", { name: "COMMIT EDIT" }));
    expect(send).toHaveBeenLastCalledWith({ t: "order", turn: 1, seq: 2, mode: "guard", target: 1, force: 3 });
  });

  it("reconciles a newly mounted controller to the host sequence before replacing an acknowledged order", () => {
    const send = vi.fn();
    render(<BorderlineController you={you} send={send} last={frame({
      inputSeq: 41,
      committed: { mode: "invade", target: 2, force: 2 },
    })} connected />);
    fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
    fireEvent.click(screen.getByRole("button", { name: "GUARD" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 1,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force 3 available" }));
    fireEvent.click(screen.getByRole("button", { name: "COMMIT EDIT" }));
    expect(send).toHaveBeenLastCalledWith({ t: "order", turn: 1, seq: 42, mode: "guard", target: 1, force: 3 });
  });

  it("crosses out spent forces, disables illegal cells without removing them, and preserves all targets during teaching", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({ forces: [2, 3] })} connected />);
    expect(screen.getByRole("button", { name: "Force 1 used" }).className).toContain("is-used");
    expect(screen.getByRole("button", { name: /Province 24,/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("button", { name: /Province \d+/ })).toHaveLength(24);

    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "teach", turn: 0 })} connected />);
    expect(screen.getAllByRole("button", { name: /Province \d+/ })).toHaveLength(24);
    expect(screen.getByRole("button", { name: "INVADE" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows look-up, private recap outcome, and reconnect assurance in the right phases", async () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({ phase: "reveal", seconds: 3 })} connected />);
    expect(screen.getByText("LOOK UP")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "INVADE" })).toBeNull();

    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "recap", seconds: 2, outcome: "tied" })} connected />);
    expect(await screen.findByText("TOP FORCE TIED")).toBeTruthy();
    expect(screen.getByText("Your order: tied for strongest; the flag stayed")).toBeTruthy();

    view.rerender(<BorderlineController you={you} send={send} last={frame()} connected={false} />);
    expect(screen.getByText("Your last acknowledged order is still safe.")).toBeTruthy();
  });

  it("visibly clears the practice draft before the real countdown", async () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({
      phase: "practice",
      turn: 0,
      inputSeq: 1,
      committed: { mode: "invade", target: 2, force: 2 },
    })} connected />);
    expect(screen.getByText("✓ COMMITTED")).toBeTruthy();
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "practiceReveal", turn: 0, inputSeq: 1 })} connected />);
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "countdown", turn: 0, inputSeq: 1, committed: null })} connected />);
    expect(await screen.findByText("MODE · PROVINCE · FORCE")).toBeTruthy();
    expect(screen.queryByText("✓ COMMITTED")).toBeNull();
  });

  it("re-sends sync while a refreshed projector is waiting for controls", async () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({ phase: "loading", turn: 0 })} connected />);
    await waitFor(() => expect(send.mock.calls.filter(([value]) => value.t === "sync").length).toBeGreaterThanOrEqual(2));
    const synced = send.mock.calls.filter(([value]) => value.t === "sync").length;
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "loading", turn: 0, seconds: 0 })} connected />);
    expect(send.mock.calls.filter(([value]) => value.t === "sync")).toHaveLength(synced);
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "teach", turn: 0 })} connected />);
    expect(screen.getByText("LEARN THE BORDER")).toBeTruthy();
  });

  it("resets its sequence when a refreshed host restarts the seeded campaign", async () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({
      session: "old-host",
      inputSeq: 41,
      committed: { mode: "invade", target: 2, force: 2 },
    })} connected />);
    view.rerender(<BorderlineController you={you} send={send} last={frame({ session: "new-host", phase: "loading", turn: 0, inputSeq: 0 })} connected />);
    view.rerender(<BorderlineController you={you} send={send} last={frame({ session: "new-host", phase: "planning", turn: 1, inputSeq: 0 })} connected />);
    fireEvent.click(await screen.findByRole("button", { name: "INVADE" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 2,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Force 1 available" }));
    fireEvent.click(screen.getByRole("button", { name: "COMMIT ORDER" }));
    expect(send).toHaveBeenLastCalledWith({ t: "order", turn: 1, seq: 1, mode: "invade", target: 2, force: 1 });
  });
});
