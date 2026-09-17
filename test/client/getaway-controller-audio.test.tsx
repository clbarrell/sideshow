import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GetawayController from "../../src/client/games/getaway/controller";
import type { GetawayPhoneFrame } from "../../src/client/games/getaway/protocol";

const audio = vi.hoisted(() => ({ play: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/client/games/getaway/sound", () => ({
  GetawaySound: class { play = audio.play; destroy = audio.destroy; },
}));

const you = { id: "p1", name: "Alice", seat: 0, color: "#FF5A47", connected: true, ready: true, awayAt: null };
const base: GetawayPhoneFrame = {
  t: "getawayState", phase: "live", interactive: true, connected: true, crew: "Crimson", crewShape: "triangle",
  bags: 1, crewBanked: 2, crewPoints: 2, crewMultiplier: 1, remaining: 80, shoveReady: true, shoveCooldown: 0, protected: false, withdrawn: false, status: "Move",
};

afterEach(() => { cleanup(); audio.play.mockReset(); audio.destroy.mockReset(); vi.unstubAllGlobals(); });

describe("Getaway player-local audio routing", () => {
  it("plays each authoritative local cue once, ignores repeated frames, and tears down", () => {
    vi.stubGlobal("AudioContext", class {});
    const view = render(<GetawayController you={you} send={() => undefined} last={{ ...base, cue: "pickup" }} connected />);
    expect(audio.play).toHaveBeenCalledWith("pickup");
    view.rerender(<GetawayController you={you} send={() => undefined} last={{ ...base, cue: "pickup", remaining: 79 }} connected />);
    expect(audio.play).toHaveBeenCalledTimes(1);
    view.rerender(<GetawayController you={you} send={() => undefined} last={{ ...base }} connected />);
    view.rerender(<GetawayController you={you} send={() => undefined} last={{ ...base, cue: "spill" }} connected />);
    expect(audio.play).toHaveBeenLastCalledWith("spill");
    view.unmount();
    expect(audio.destroy).toHaveBeenCalledOnce();
  });
});
