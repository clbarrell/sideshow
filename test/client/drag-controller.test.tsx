import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DragController from "../../src/client/games/drag/controller";
import { isDragPhoneFrame, type DragPhoneFrame } from "../../src/client/games/drag/host";

const you = { id: "alex", name: "Alex", seat: 2, color: "#52E0B0", connected: true, ready: true, awayAt: null };
const live: DragPhoneFrame = {
  t: "dragState", phase: "live", status: "Eat ink · swallow smaller blobs · stay inside", remaining: 72,
  interactive: true, lungeReady: true, cooldown: 0, size: 1.8, score: 4, protection: 0, warning: null, connected: true,
};

describe("Drag controller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("presents a landscape two-thumb grip with colour-independent identity and sound control", () => {
    render(<DragController you={you} send={() => undefined} connected last={live} />);
    expect(screen.getByRole("application", { name: "Move your blob" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Lunge ready/i })).toBeTruthy();
    expect(screen.getByText("Turn sideways to pull")).toBeTruthy();
    expect(screen.getByText("Grow on ink · larger blobs swallow smaller blobs")).toBeTruthy();
    expect(screen.getByText("Alex").closest("main")?.dataset.seat).toBe("3");
    expect(screen.getByRole("button", { name: "Turn sound off" })).toBeTruthy();
  });

  it("coalesces movement at 20Hz and releases it immediately on blur", () => {
    const send = vi.fn();
    render(<DragController you={you} send={send} connected last={live} />);
    send.mockClear();
    const stick = screen.getByRole("application", { name: "Move your blob" });
    Object.defineProperty(stick, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} }) });
    Object.defineProperty(stick, "setPointerCapture", { configurable: true, value: vi.fn() });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 178, clientY: 100 });
    act(() => vi.advanceTimersByTime(50));
    expect(send).toHaveBeenLastCalledWith({ x: 1, y: 0 });
    fireEvent.blur(window);
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });

  it("sends a lunge once per press and does not repeat while held or pending", () => {
    const send = vi.fn();
    render(<DragController you={you} send={send} connected last={live} />);
    send.mockClear();
    const button = screen.getByRole("button", { name: /Lunge ready/i });
    fireEvent.pointerDown(button, { pointerId: 4 });
    fireEvent.pointerDown(button, { pointerId: 4 });
    const lunges = send.mock.calls.filter(([value]) => typeof (value as { lunge?: unknown }).lunge === "number");
    expect(lunges).toHaveLength(1);
  });

  it("selects only its own public batch frame and exposes the danger countdown", () => {
    render(<DragController you={you} send={() => undefined} connected last={{
      t: "dragStates",
      frames: {
        alex: { ...live, phase: "live", warning: 2.2, status: "GET INSIDE · 3", lungeReady: false, cooldown: 1.8 },
        rival: { ...live, status: "Rival only" },
      },
    }} />);
    expect(screen.getByText("GET INSIDE · 3")).toBeTruthy();
    expect(screen.queryByText("Rival only")).toBeNull();
    expect(screen.getByRole("button", { name: "Lunge unavailable" })).toBeTruthy();
  });

  it("neutralizes an active stick when connection drops and shows recovery", () => {
    const send = vi.fn();
    const view = render(<DragController you={you} send={send} connected last={live} />);
    const stick = screen.getByRole("application", { name: "Move your blob" });
    Object.defineProperty(stick, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} }) });
    fireEvent.pointerDown(stick, { pointerId: 2, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: 118, clientY: 40 });
    act(() => vi.advanceTimersByTime(50));
    view.rerender(<DragController you={you} send={send} connected={false} last={live} />);
    expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
    expect(screen.getByRole("alert").textContent).toContain("RECONNECTING");
  });

  it("requests a fresh host snapshot on every remount and accepts no malformed cue arrays", () => {
    const send = vi.fn();
    const first = render(<DragController you={you} send={send} connected last={null} />);
    expect(send).toHaveBeenLastCalledWith({ t: "sync" });
    first.unmount();
    render(<DragController you={you} send={send} connected last={null} />);
    expect(send.mock.calls.filter(([value]) => (value as { t?: string }).t === "sync")).toHaveLength(2);
    expect(isDragPhoneFrame({ ...live, cues: ["eat", "warning"] })).toBe(true);
    expect(isDragPhoneFrame({ ...live, cues: ["remote-code"] })).toBe(false);
    expect(isDragPhoneFrame({ ...live, score: Infinity })).toBe(false);
    expect(isDragPhoneFrame({ ...live, protection: Infinity })).toBe(false);
  });

  it("keeps the same controls mounted through practice, reset, GO, and reform", () => {
    const view = render(<DragController you={you} send={() => undefined} connected last={{ ...live, phase: "practice", status: "Practice is harmless" }} />);
    const stick = screen.getByRole("application", { name: "Move your blob" });
    view.rerender(<DragController you={you} send={() => undefined} connected last={{ ...live, phase: "countdown", status: "Reset complete" }} />);
    expect(screen.getByRole("application", { name: "Move your blob" })).toBe(stick);
    view.rerender(<DragController you={you} send={() => undefined} connected last={{ ...live, phase: "reforming", status: "Reforming · 2", interactive: false, lungeReady: false }} />);
    expect(screen.getByRole("application", { name: "Move your blob" })).toBe(stick);
  });
});
