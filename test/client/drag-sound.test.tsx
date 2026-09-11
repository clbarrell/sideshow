import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDragAudioFrame, isDragCue } from "../../src/client/games/drag/sound";

interface FakeSource {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  buffer?: unknown;
}

function installAudioMocks(deferred = false) {
  const bufferSources: FakeSource[] = [];
  const oscillators: FakeSource[] = [];
  const outputs: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const fetchResolvers: Array<(response: unknown) => void> = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    createGain() {
      const node = {
        gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect() { return this; },
        disconnect: vi.fn(),
      };
      outputs.push(node);
      return node;
    }
    createBufferSource() {
      const source: FakeSource & { connect: (node: unknown) => unknown; playbackRate: { value: number } } = {
        buffer: null, playbackRate: { value: 1 }, connect: (node) => node,
        start: vi.fn(), stop: vi.fn(), onended: null,
      };
      bufferSources.push(source);
      return source;
    }
    createOscillator() {
      const source: FakeSource & { connect: (node: unknown) => unknown; type: OscillatorType; frequency: object } = {
        type: "sine", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (node) => node,
        start: vi.fn(), stop: vi.fn(), onended: null,
      };
      oscillators.push(source);
      return source;
    }
    decodeAudioData() { return Promise.resolve({ duration: .6 }); }
  }
  const response = { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", vi.fn(() => deferred ? new Promise((resolve) => fetchResolvers.push(resolve)) : Promise.resolve(response)));
  return {
    bufferSources, oscillators, outputs,
    resolveFetches() { fetchResolvers.splice(0).forEach((resolve) => resolve(response)); },
  };
}

describe("Drag audio protocol", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("accepts only the finite local cue vocabulary, including the pitched burst variant", () => {
    expect(["launch", "go", "lunge", "eat", "warning", "burst", "respawn", "finish"].every(isDragCue)).toBe(true);
    expect(isDragAudioFrame({ t: "dragAudio", cue: "burst" })).toBe(true);
    expect(isDragAudioFrame({ t: "dragAudio", cue: "https://remote.invalid/file.mp3" })).toBe(false);
    expect(isDragAudioFrame({ t: "other", cue: "go" })).toBe(false);
  });

  it("preloads local cues, bounds low voices, gives critical cues priority, and destroys every source", async () => {
    const { bufferSources, oscillators, outputs } = installAudioMocks();
    const { DRAG_CUE_PATHS, DragSound } = await import("../../src/client/games/drag/sound");
    const sound = new DragSound("host");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
    expect(new Set(vi.mocked(fetch).mock.calls.map(([path]) => path))).toEqual(new Set(Object.values(DRAG_CUE_PATHS)));

    for (let index = 0; index < 5; index++) sound.play("eat");
    for (let index = 0; index < 3; index++) sound.play("lunge");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(6));
    sound.play("warning");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(7));
    expect(bufferSources.slice(0, 6).every((source) => source.stop.mock.calls.length >= 1)).toBe(true);
    sound.play("finish");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(8));
    expect(bufferSources[6].stop).toHaveBeenCalled();
    expect(oscillators).toHaveLength(0);

    sound.destroy();
    expect(bufferSources[7].stop).toHaveBeenCalled();
    expect(outputs.some((output) => output.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it("never starts a sample that resolves after teardown", async () => {
    const { bufferSources, oscillators, resolveFetches } = installAudioMocks(true);
    const { DragSound } = await import("../../src/client/games/drag/sound");
    const sound = new DragSound("phone");
    sound.play("go");
    sound.destroy();
    resolveFetches();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(bufferSources).toHaveLength(0);
    expect(oscillators).toHaveLength(0);
  });
});
