import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ muted: false, audioBus: vi.fn(), loadAudio: vi.fn() }));

vi.mock("../../src/client/audio", () => ({
  audioBus: audio.audioBus,
  isAudioMuted: () => audio.muted,
  loadAudio: audio.loadAudio,
}));

import { createFinalCountdown } from "../../src/client/final-countdown";

const flushAudio = () => Promise.resolve().then(() => Promise.resolve());

describe("final countdown", () => {
  let output: ReturnType<typeof fakeGain>;
  let bufferSources: ReturnType<typeof fakeSource>[];
  let oscillators: ReturnType<typeof fakeSource>[];

  beforeEach(() => {
    output = fakeGain();
    bufferSources = [];
    oscillators = [];
    audio.muted = false;
    audio.loadAudio.mockReset();
    audio.loadAudio.mockResolvedValue({} as AudioBuffer);
    audio.audioBus.mockReset();
    audio.audioBus.mockImplementation(() => ({
      context: {
        currentTime: 4,
        createGain: () => fakeGain(),
        createBufferSource: () => { const source = fakeSource(); bufferSources.push(source); return source; },
        createOscillator: () => { const source = fakeSource(); oscillators.push(source); return source; },
      },
      gain: output,
    }));
    vi.stubGlobal("AudioContext", class FakeAudioContext {});
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("ticks once per displayed final second without catching up skipped frames", async () => {
    const countdown = createFinalCountdown();
    await flushAudio();
    countdown.update(10);
    countdown.update(10);
    countdown.update(8.9);
    countdown.update(6.1);
    await flushAudio();

    expect(bufferSources).toHaveLength(3);
    expect(bufferSources.every((source) => source.start.mock.calls.length === 1)).toBe(true);
    expect(audio.loadAudio).toHaveBeenCalledTimes(1);
  });

  it("resets on a non-live clock and does not retroactively tick while muted", async () => {
    const countdown = createFinalCountdown();
    await flushAudio();
    countdown.update(10);
    countdown.update(null);
    countdown.update(10);
    await flushAudio();
    expect(bufferSources).toHaveLength(2);

    audio.muted = true;
    countdown.update(9);
    audio.muted = false;
    countdown.update(9);
    countdown.update(8);
    await flushAudio();
    expect(bufferSources).toHaveLength(3);
  });

  it("uses a quiet fallback when the local tick cannot load", async () => {
    audio.loadAudio.mockRejectedValueOnce(new Error("missing"));
    const countdown = createFinalCountdown();
    await flushAudio();
    countdown.update(10);

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].start).toHaveBeenCalledOnce();
  });

  it("stops and disconnects its output on destroy, then ignores later frames", async () => {
    const countdown = createFinalCountdown();
    await flushAudio();
    countdown.update(10);
    const source = bufferSources[0];

    countdown.destroy();
    countdown.update(9);
    await flushAudio();

    expect(source.stop).toHaveBeenCalledOnce();
    expect(output.disconnect).toHaveBeenCalledOnce();
    expect(bufferSources).toHaveLength(1);
  });

  it("is inert where Web Audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const countdown = createFinalCountdown();
    expect(() => countdown.update(10)).not.toThrow();
    expect(audio.audioBus).not.toHaveBeenCalled();
  });

  it("never replays delayed asset ticks after its timer ends", async () => {
    let resolveBuffer: ((buffer: AudioBuffer) => void) | undefined;
    audio.loadAudio.mockImplementationOnce(() => new Promise<AudioBuffer>((resolve) => { resolveBuffer = resolve; }));
    const countdown = createFinalCountdown();
    countdown.update(10);
    countdown.update(null);
    expect(oscillators).toHaveLength(1);

    resolveBuffer?.({} as AudioBuffer);
    await flushAudio();
    expect(bufferSources).toHaveLength(0);
    expect(oscillators).toHaveLength(1);
  });
});

function fakeGain() {
  return {
    gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(function connect() { return this; }),
    disconnect: vi.fn(),
  };
}

function fakeSource() {
  return {
    buffer: null as AudioBuffer | null,
    type: "triangle" as OscillatorType,
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn((target: ReturnType<typeof fakeGain>) => target),
    start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
  };
}
