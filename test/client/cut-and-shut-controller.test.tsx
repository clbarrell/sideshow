import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CutAndShutController from "../../src/client/games/cut-and-shut/controller";
import type { CutAndShutFrame } from "../../src/client/games/cut-and-shut/protocol";

const you = { id: "p1", name: "Alice", seat: 0, color: "#FF5A47", connected: true, ready: true, awayAt: null };

afterEach(cleanup);

function frame(overrides: Partial<CutAndShutFrame> = {}): CutAndShutFrame {
  return {
    t: "cutAndShutState",
    phase: "market",
    round: 1,
    rounds: 4,
    seconds: 24,
    hand: [
      { id: "a", shape: "straight" },
      { id: "b", shape: "bend" },
      { id: "c", shape: "junction" },
    ],
    contract: { seam: 0, label: "LOT 01 · SILT QUAY" },
    dealers: [
      { id: "p1", name: "Alice", seat: 0, color: "#FF5A47", locked: false, connected: true },
      { id: "p2", name: "Bea", seat: 1, color: "#4AA8FF", locked: false, connected: true },
    ],
    offers: [],
    stitches: [],
    availableSeams: Array.from({ length: 12 }, (_, index) => index),
    committed: null,
    shared: 0,
    personal: 0,
    roundPersonal: 0,
    message: "Tap one road, then one free dealer.",
    ...overrides,
  };
}

describe("Cut & Shut phone", () => {
  it("requests targeted state on mount and shows the one-based private contract", () => {
    const send = vi.fn();
    render(<CutAndShutController you={you} send={send} last={frame()} connected />);
    expect(send).toHaveBeenCalledWith({ t: "sync" });
    expect(screen.getByText("LOT 01 · SILT QUAY")).toBeTruthy();
    expect(screen.getByText("Deliver to seam 01 · 4 points each")).toBeTruthy();
  });

  it("makes an offer by selecting one road then one available dealer", () => {
    const send = vi.fn();
    render(<CutAndShutController you={you} send={send} last={frame()} connected />);
    const hand = screen.getByLabelText("Your road strips");
    fireEvent.click(within(hand).getByRole("button", { name: "Straight" }));
    fireEvent.click(within(screen.getByLabelText("Choose a dealer")).getByRole("button", { name: /Bea.*OFFER/ }));
    expect(send).toHaveBeenLastCalledWith({ t: "offer", roadId: "a", targetId: "p2" });
  });

  it("requires a return road before atomically accepting an incoming offer", () => {
    const send = vi.fn();
    render(<CutAndShutController
      you={you}
      send={send}
      connected
      last={frame({ offers: [{ id: 9, fromId: "p2", fromName: "Bea", fromSeat: 1, toId: "p1", toName: "Alice", toSeat: 0, offered: "bend" }] })}
    />);
    const offer = screen.getByLabelText("Offer from Bea");
    expect(within(offer).getByRole("button", { name: "ACCEPT SWAP" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(offer).getByRole("button", { name: "Junction" }));
    fireEvent.click(within(offer).getByRole("button", { name: "ACCEPT SWAP" }));
    expect(send).toHaveBeenLastCalledWith({ t: "respond", offerId: 9, accept: true, roadId: "c" });
  });

  it("commits a selected strip to a numbered open seam and disables claimed seams", () => {
    const send = vi.fn();
    render(<CutAndShutController you={you} send={send} connected last={frame({ phase: "commit", seconds: 8, availableSeams: [1, 4] })} />);
    fireEvent.click(within(screen.getByLabelText("Your road strips")).getByRole("button", { name: "Bend" }));
    expect(screen.getByRole("button", { name: "Commit Bend to seam 01" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Commit Bend to seam 02" }));
    expect(send).toHaveBeenLastCalledWith({ t: "commit", roadId: "b", seam: 1 });
  });

  it("shows one-based locked stitch numbers", () => {
    render(<CutAndShutController
      you={you}
      send={() => undefined}
      connected
      last={frame({ phase: "commit", committed: { seam: 0, shape: "bend" } })}
    />);
    expect(screen.getByText("STITCH 01 LOCKED")).toBeTruthy();
  });

  it("shows late joiners an explicit spectator pass instead of a scoring contract", () => {
    render(<CutAndShutController
      you={you}
      send={() => undefined}
      connected
      last={frame({ phase: "spectator", hand: [], contract: { seam: 0, label: "SPECTATOR" } })}
    />);
    expect(screen.getByLabelText("Spectator status")).toBeTruthy();
    expect(screen.getByText("NO CONTRACT THIS GAME")).toBeTruthy();
    expect(screen.queryByLabelText("Private destination contract")).toBeNull();
    expect(screen.queryByText(/4 points each/)).toBeNull();
  });

  it("requires a fresh road choice when the phase or incoming offer changes", () => {
    const send = vi.fn();
    const view = render(<CutAndShutController you={you} send={send} connected last={frame()} />);
    fireEvent.click(within(screen.getByLabelText("Your road strips")).getByRole("button", { name: "Straight" }));
    view.rerender(<CutAndShutController
      you={you}
      send={send}
      connected
      last={frame({ offers: [{ id: 4, fromId: "p2", fromName: "Bea", fromSeat: 1, toId: "p1", toName: "Alice", toSeat: 0, offered: "bend" }] })}
    />);
    expect(screen.getByRole("button", { name: "ACCEPT SWAP" }).hasAttribute("disabled")).toBe(true);
  });

  it("replaces controls with a deliberate reconnect state", () => {
    render(<CutAndShutController you={you} send={() => undefined} last={frame()} connected={false} />);
    expect(screen.getByText("SIGNAL LOST")).toBeTruthy();
    expect(screen.getByText(/council will make a legal stitch/)).toBeTruthy();
    expect(screen.queryByLabelText("Your road strips")).toBeNull();
  });
});
