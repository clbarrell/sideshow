import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import BorderlineController from "../../src/client/games/borderline/controller";
import type { BorderlineFrame } from "../../src/client/games/borderline/protocol";

const you = { id: "p1", name: "Alex", seat: 0, color: "#ff5a47", connected: true, ready: true, awayAt: null };

vi.mock("../../src/client/audio", () => ({
  isAudioMuted: () => true,
  setAudioMuted: vi.fn(),
  subscribeAudioMuted: () => () => undefined,
  unlockAudio: vi.fn(),
  audioBus: vi.fn(),
  loadAudio: vi.fn(),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function frame(overrides: Partial<BorderlineFrame> = {}): BorderlineFrame {
  return {
    t: "borderlineState", phase: "planning", turn: 1, turns: 9, seconds: 20, tutorialStep: 0,
    factionName: "Redstar", emblem: "star",
    columns: 6, rows: 4,
    provinces: Array.from({ length: 24 }, (_, index) => ({ id: index + 1, ownerId: index === 0 ? "p1" : null, ownerName: index === 0 ? "Alex" : null, ownerColor: index === 0 ? "#ff5a47" : null, ownerEmblem: index === 0 ? "star" : null })),
    legalInvades: [2, 7], legalGuards: [1], availableForces: [1, 2, 3], committed: null, inputSeq: 0,
    fallback: { mode: "guard", target: 1, force: 1 }, score: 0, outcome: "", message: "Choose an order.", cue: null,
    ...overrides,
  };
}

describe("Borderline phone", () => {
  it("keeps all 24 province positions stable and exposes only legal mode targets", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame()} connected />);
    expect(send).toHaveBeenCalledWith({ t: "sync" });
    const provinces = screen.getAllByRole("button", { name: /Province \d+/ });
    expect(provinces).toHaveLength(24);
    expect(provinces.map((button) => button.textContent?.trim())).toEqual(Array.from({ length: 24 }, (_, index) => String(index + 1)));
    expect(provinces.every((button) => button.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Invade" }));
    expect(screen.getByRole("button", { name: /Province 2,/ }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /Province 1,/ }).hasAttribute("disabled")).toBe(true);
    view.rerender(<BorderlineController you={you} send={send} last={frame({ legalInvades: [3, 8] })} connected />);
    expect(screen.getAllByRole("button", { name: /Province \d+/ }).map((button) => button.textContent?.trim())).toEqual(Array.from({ length: 24 }, (_, index) => String(index + 1)));
  });

  it("renders only the active province grid on a small campaign", () => {
    const small = frame({
      columns: 4,
      rows: 3,
      provinces: frame().provinces.slice(0, 12),
      legalInvades: [2, 5],
    });
    render(<BorderlineController you={you} send={vi.fn()} last={small} connected />);
    const targets = screen.getAllByRole("button", { name: /Province \d+/ });
    expect(targets).toHaveLength(12);
    expect(targets.map((button) => button.textContent?.trim())).toEqual(Array.from({ length: 12 }, (_, index) => String(index + 1)));
    expect(screen.queryByRole("button", { name: /Province 13,/ })).toBeNull();
    expect(document.querySelector<HTMLElement>(".borderline-phone")?.style.getPropertyValue("--province-cols")).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Invade" }));
    expect(screen.getByRole("button", { name: /Province 5,/ }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the authoritative numbered tutorial step and its full muted-audio equivalent", () => {
    const view = render(<BorderlineController you={you} send={vi.fn()} last={frame({ phase: "runway", turn: 0, seconds: 66, tutorialStep: 1 })} connected />);
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
    expect(screen.getByText("THREE STRENGTH CARDS")).toBeTruthy();
    expect(screen.getByText(/Your three strength cards are one, two and three/)).toBeTruthy();
    expect(screen.getByText("Next · BUILD YOUR ORDER")).toBeTruthy();
    view.rerender(<BorderlineController you={you} send={vi.fn()} last={frame({ phase: "runway", turn: 0, seconds: 18, tutorialStep: 4 })} connected />);
    expect(screen.getByText("Step 5 of 5")).toBeTruthy();
    expect(screen.getByText("Next · Try a practice order")).toBeTruthy();
  });

  it("guides each draft step and only arms the non-flashing confirm affordance after a complete order", () => {
    const send = vi.fn();
    render(<BorderlineController you={you} send={send} last={frame()} connected />);
    expect(screen.getByText("1 · Choose Invade or Guard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Invade" }));
    expect(screen.getByText("2 · Tap a highlighted province")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Province 2,/ }));
    expect(screen.getByText("3 · Choose an available Strength card")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Strength card 2, available" }));
    expect(screen.getByText("4 · Review, then tap Confirm order")).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirm order" }).className).toContain("is-ready");

    const css = readFileSync(`${process.cwd()}/src/client/games/borderline/controller.css`, "utf8");
    expect(css).toMatch(/\.borderline-commit-button\.is-ready[^}]*animation:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
    expect(css).not.toMatch(/@keyframes borderline-confirm-ready[\s\S]*opacity/);
    expect(css.match(/@keyframes borderline-confirm-ready \{[\s\S]*?\n\}/)?.[0]).not.toContain("transform");
  });

  it("sends one complete monotonic order, waits for the private ack, then offers Edit", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame()} connected />);
    fireEvent.click(screen.getByRole("button", { name: "Invade" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 2,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Strength card 3, available" }));
    expect(screen.getByText("INVADE 2 · STRENGTH 3")).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirm order" }).className).toContain("is-ready");
    fireEvent.click(screen.getByRole("button", { name: "Confirm order" }));
    expect(send).toHaveBeenLastCalledWith({ t: "order", turn: 1, seq: 1, mode: "invade", target: 2, force: 3 });
    expect(screen.getByRole("button", { name: "Waiting for host…" }).hasAttribute("disabled")).toBe(true);
    view.rerender(<BorderlineController you={you} send={send} connected last={frame({ inputSeq: 1, committed: { mode: "invade", target: 2, force: 3, seq: 1 }, cue: { id: 1, name: "commit" } })} />);
    expect(screen.getByText("Confirmed ✓")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Confirm changes" })).toBeTruthy();
  });

  it("restores an acknowledged order as Committed on first sync without replaying its cue", () => {
    const send = vi.fn();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    render(<BorderlineController
      you={you}
      send={send}
      connected
      last={frame({ inputSeq: 4, committed: { mode: "guard", target: 1, force: 2, seq: 4 }, cue: { id: 4, name: "commit" } })}
    />);
    expect(screen.getByText("GUARD 1 · STRENGTH 2")).toBeTruthy();
    expect(screen.getByText("Confirmed ✓")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("restores the accepted order after reconnect but preserves intentional edits during live snapshots", () => {
    const send = vi.fn();
    const accepted = frame({ inputSeq: 2, committed: { mode: "guard", target: 1, force: 2, seq: 2 } });
    const view = render(<BorderlineController you={you} send={send} last={accepted} connected />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Invade" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 2,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Strength card 3, available" }));
    view.rerender(<BorderlineController you={you} send={send} last={{ ...accepted, seconds: 18 }} connected />);
    expect(screen.getByText("INVADE 2 · STRENGTH 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm changes" })).toBeTruthy();

    view.rerender(<BorderlineController you={you} send={send} last={{ ...accepted, seconds: 17 }} connected={false} />);
    view.rerender(<BorderlineController you={you} send={send} last={{ ...accepted, seconds: 16 }} connected />);
    expect(screen.getByText("GUARD 1 · STRENGTH 2")).toBeTruthy();
    expect(screen.getByText("Confirmed ✓")).toBeTruthy();
  });

  it("does not restore a stale phase and clears an unacknowledged draft on reconnect", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame()} connected />);
    fireEvent.click(screen.getByRole("button", { name: "Guard" }));
    fireEvent.click(screen.getByRole("button", { name: /Province 1,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Strength card 1, available" }));
    view.rerender(<BorderlineController you={you} send={send} last={frame()} connected={false} />);
    expect(screen.getByText(/Reconnecting/)).toBeTruthy();
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "runway", turn: 1 })} connected />);
    expect(screen.getByText(/Turn 1 \/ 9/)).toBeTruthy();
    expect(send).toHaveBeenLastCalledWith({ t: "sync" });
  });

  it("accepts a seeded projector restart at runway instead of waiting for the old turn", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({ turn: 5 })} connected />);
    expect(screen.getByText(/Turn 5 \/ 9/)).toBeTruthy();
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "runway", turn: 0 })} connected />);
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
  });

  it("accepts a projector restart while the old campaign was still in practice", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({ phase: "practice", turn: 0 })} connected />);
    expect(screen.getByText(/Practice · map resets/)).toBeTruthy();
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "runway", turn: 0 })} connected />);
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
  });

  it("crosses out spent forces and gives reveal, recap and spectator states no order controls", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame({ availableForces: [2, 3] })} connected />);
    expect(screen.getByRole("button", { name: "Strength card 1, spent" }).className).toContain("is-spent");
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "reveal", legalInvades: [], legalGuards: [] })} connected />);
    expect(screen.getByText("Look up")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm order" })).toBeNull();
    view.rerender(<BorderlineController you={you} send={send} last={frame({ phase: "spectator" })} connected />);
    expect(screen.getByText("Campaign in progress")).toBeTruthy();
  });

  it("labels turns seven to nine as the final Strength cycle without promising a refill", () => {
    render(<BorderlineController you={you} send={vi.fn()} last={frame({ turn: 7 })} connected />);
    expect(screen.getByText("Use each Strength card once in this final cycle.")).toBeTruthy();
    expect(screen.queryByText(/return after turn 9/i)).toBeNull();
  });

  it("ignores malformed nested host frames instead of crashing or replacing valid controls", () => {
    const send = vi.fn();
    const view = render(<BorderlineController you={you} send={send} last={frame()} connected />);
    expect(screen.getByText(/Turn 1 \/ 9/)).toBeTruthy();
    expect(() => view.rerender(<BorderlineController you={you} send={send} last={{ ...frame(), fallback: null }} connected />)).not.toThrow();
    expect(() => view.rerender(<BorderlineController you={you} send={send} last={{ ...frame(), provinces: Array(24).fill(null) }} connected />)).not.toThrow();
    expect(() => view.rerender(<BorderlineController you={you} send={send} last={{ ...frame(), columns: 4, rows: 3 }} connected />)).not.toThrow();
    expect(screen.getByText(/Turn 1 \/ 9/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Province \d+/ })).toHaveLength(24);
  });
});
