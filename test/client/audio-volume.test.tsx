import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => { stored.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared audio volume", () => {
  it("preserves the existing full-volume default when no preference exists", async () => {
    vi.resetModules();
    localStorage.clear();
    const audio = await import("../../src/client/audio");
    expect(audio.audioVolume()).toBe(1);
  });

  it("persists a bounded master level and restores it after mute", async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem("sideshow:volume", "0.55");
    const target = vi.fn();
    class FakeAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn();
      createGain() { return { gain: { value: 0, setTargetAtTime: target }, connect() { return this; } }; }
      decodeAudioData() { return Promise.resolve({}); }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const audio = await import("../../src/client/audio");
    expect(audio.audioVolume()).toBe(.55);
    audio.audioBus();
    audio.setAudioVolume(.35);
    expect(localStorage.getItem("sideshow:volume")).toBe("0.35");
    expect(target).toHaveBeenLastCalledWith(.35, 0, .025);
    audio.setAudioMuted(true);
    audio.setAudioVolume(9);
    expect(audio.audioVolume()).toBe(1);
    audio.setAudioMuted(false);
    expect(target).toHaveBeenLastCalledWith(1, 0, .025);
    audio.unlockAudio();
  });
});
