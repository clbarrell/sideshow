import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  buffer?: unknown;
}

const expectedPaths = [
  "/audio/getaway/countdown.mp3",
  "/audio/getaway/go.mp3",
  "/audio/getaway/pickup.mp3",
  "/audio/getaway/shove.mp3",
  "/audio/getaway/spill.mp3",
  "/audio/getaway/deposit.mp3",
  "/audio/getaway/vault.mp3",
  "/audio/getaway/finish.mp3",
];

function installAudioMocks(options: { deferred?: boolean; decodeReject?: boolean; contextState?: AudioContextState } = {}) {
  const bufferSources: FakeSource[] = [];
  const oscillators: FakeSource[] = [];
  const outputs: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const fetchResolvers: Array<(response: unknown) => void> = [];
  class FakeAudioContext {
    state = options.contextState ?? "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    createGain() {
      const output = {
        gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
        connect() { return this; },
        disconnect: vi.fn(),
      };
      outputs.push(output);
      return output;
    }
    createBufferSource() {
      const source = { buffer: null, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn(), onended: null };
      bufferSources.push(source);
      return source;
    }
    createOscillator() {
      const source = { type: "sine" as OscillatorType, frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (node: unknown) => node, start: vi.fn(), stop: vi.fn(), onended: null };
      oscillators.push(source);
      return source;
    }
    decodeAudioData() { return options.decodeReject ? Promise.reject(new Error("decode failed")) : Promise.resolve({ duration: .7 }); }
  }
  const response = { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
  const fetchMock = vi.fn().mockImplementation(() => options.deferred ? new Promise((resolve) => fetchResolvers.push(resolve)) : Promise.resolve(response));
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("fetch", fetchMock);
  return { bufferSources, oscillators, outputs, resolveFetches: () => fetchResolvers.splice(0).forEach((resolve) => resolve(response)) };
}

describe("Getaway sound runtime", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("preloads every committed cue, caps action voices, prioritizes critical cues, and cleans up", async () => {
    const { bufferSources, outputs } = installAudioMocks();
    const { GETAWAY_CUE_PATHS, GetawaySound } = await import("../../src/client/games/getaway/sound");
    expect(Object.values(GETAWAY_CUE_PATHS)).toEqual(expectedPaths);
    const sound = new GetawaySound("host");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual(expectedPaths);
    await new Promise((resolve) => setTimeout(resolve, 0));

    sound.play("pickup"); sound.play("pickup"); sound.play("pickup"); sound.play("pickup");
    sound.play("shove"); sound.play("shove"); sound.play("shove");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(5));
    sound.play("vault");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(6));
    expect(bufferSources.slice(0, 5).some((source) => source.stop.mock.calls.length === 1)).toBe(true);
    sound.play("finish");
    await vi.waitFor(() => expect(bufferSources).toHaveLength(7));
    expect(bufferSources.slice(0, 6).every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    sound.destroy();
    expect(bufferSources[6].stop).toHaveBeenCalledOnce();
    expect(outputs.filter((output) => output.disconnect.mock.calls.length > 0).length).toBeGreaterThanOrEqual(9);
  });

  it("falls back procedurally on decode failure and stops fallback voices on teardown", async () => {
    const { bufferSources, oscillators } = installAudioMocks({ decodeReject: true });
    const { GetawaySound } = await import("../../src/client/games/getaway/sound");
    const sound = new GetawaySound("phone");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    sound.play("deposit");
    await vi.waitFor(() => expect(oscillators).toHaveLength(1));
    expect(bufferSources).toHaveLength(0);
    sound.destroy();
    expect(oscillators[0].stop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("plays an immediate fallback during slow preload and never emits that cue late", async () => {
    const { bufferSources, oscillators, resolveFetches } = installAudioMocks({ deferred: true });
    const { GetawaySound } = await import("../../src/client/games/getaway/sound");
    const sound = new GetawaySound("host");
    sound.play("pickup");
    expect(oscillators).toHaveLength(1);
    expect(bufferSources).toHaveLength(0);
    resolveFetches();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(bufferSources).toHaveLength(0);
    expect(oscillators).toHaveLength(1);
    sound.destroy();
    expect(oscillators[0].stop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("drops cues while audio is suspended so unlock cannot release a late burst", async () => {
    const { bufferSources, oscillators } = installAudioMocks({ contextState: "suspended" });
    const { GetawaySound } = await import("../../src/client/games/getaway/sound");
    const sound = new GetawaySound("phone");
    sound.play("pickup");
    sound.play("shove");
    await Promise.resolve();
    expect(bufferSources).toHaveLength(0);
    expect(oscillators).toHaveLength(0);
    sound.destroy();
  });
});
