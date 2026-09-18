import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null; buffer?: unknown }

function installAudio(deferred = false) {
  const sources: FakeSource[] = [];
  const pending: Array<(response: unknown) => void> = [];
  class FakeAudioContext {
    state = "running"; currentTime = 0; destination = {}; resume = vi.fn();
    createGain() { return { gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect() { return this; }, disconnect: vi.fn() }; }
    createBufferSource() { const source = { buffer: null, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn(), onended: null, playbackRate: { value: 1 } }; sources.push(source); return source; }
    createOscillator() { const source = { type: "sine", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(source); return source; }
    decodeAudioData() { return Promise.resolve({ duration: .5 }); }
  }
  const response = { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", vi.fn(() => deferred ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve(response)));
  return { sources, resolve: () => pending.splice(0).forEach((done) => done(response)) };
}

describe("Borderline sound", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("preloads the four cues and five host tutorial clips while capping effects at four voices", async () => {
    const { sources } = installAudio();
    const { BORDERLINE_CUE_PATHS, BORDERLINE_TUTORIAL_PATHS, BorderlineSound } = await import("../../src/client/games/borderline/sound");
    const sound = new BorderlineSound("host");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(9));
    for (let index = 0; index < 10; index += 1) sound.play("capture");
    await vi.waitFor(() => expect(sources.length).toBeGreaterThan(0));
    expect(sources.length).toBeLessThanOrEqual(4);
    sound.destroy();
    expect(sources.every((source) => source.stop.mock.calls.length > 0)).toBe(true);
    expect(new Set(vi.mocked(fetch).mock.calls.map(([path]) => path))).toEqual(new Set([...Object.values(BORDERLINE_CUE_PATHS), ...BORDERLINE_TUTORIAL_PATHS]));
  });

  it("keeps one current host narration and drops late clips after the lesson changes", async () => {
    const { sources, resolve } = installAudio(true);
    const { BorderlineSound } = await import("../../src/client/games/borderline/sound");
    const sound = new BorderlineSound("host");
    sound.playTutorial(0);
    sound.playTutorial(1);
    resolve();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0].start).toHaveBeenCalledTimes(1);
    sound.playTutorial(2);
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    sound.stopTutorial();
    expect(sources[1].stop).toHaveBeenCalledTimes(1);
    sound.destroy();
  });

  it("skips a narration that loaded too late to finish inside its lesson", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { sources, resolve } = installAudio(true);
    const { BorderlineSound } = await import("../../src/client/games/borderline/sound");
    const sound = new BorderlineSound("host");
    sound.playTutorial(0);
    now = 14_000;
    resolve();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(sources).toHaveLength(0);
    sound.destroy();
  });

  it("never starts async sample playback after destroy", async () => {
    const { sources, resolve } = installAudio(true);
    const { BorderlineSound } = await import("../../src/client/games/borderline/sound");
    const sound = new BorderlineSound("phone");
    sound.play("commit");
    sound.destroy();
    resolve();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(sources).toHaveLength(0);
  });
});
