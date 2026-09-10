import { beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  context: null as unknown as {
    currentTime: number;
    createBufferSource: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>;
  },
  output: { gain: { value: 0 }, disconnect: vi.fn() },
  loadAudio: vi.fn(),
}));

vi.mock("../../src/client/audio", () => ({
  audioBus: () => ({ context: audio.context, gain: audio.output }),
  loadAudio: audio.loadAudio,
}));

import { isLogRunnerAudioFrame, LogRunnerSound } from "../../src/client/games/log-runner/sound";

function oscillator() {
  return {
    type: "sine" as OscillatorType,
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn((node: unknown) => node),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}

describe("Log Runner audio", () => {
  beforeEach(() => {
    audio.context = {
      currentTime: 0,
      createBufferSource: vi.fn(),
      createGain: vi.fn(() => ({
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
      })),
      createOscillator: vi.fn(() => oscillator()),
    };
    audio.output.gain.value = 0;
    audio.output.disconnect.mockClear();
    audio.loadAudio.mockReset().mockRejectedValue(new Error("missing optional sample"));
  });

  it("accepts only known Log Runner cue frames", () => {
    const cues = ["countdown", "go", "warning", "jump", "duck", "splash", "throw", "fake", "finish"];

    for (const cue of cues) {
      expect(isLogRunnerAudioFrame({ t: "logRunnerAudio", cue })).toBe(true);
    }
    expect(isLogRunnerAudioFrame({ t: "logRunnerAudio", cue: "music" })).toBe(false);
    expect(isLogRunnerAudioFrame({ t: "logRunnerAudio", cue: "toString" })).toBe(false);
    expect(isLogRunnerAudioFrame({ t: "splitAudio", cue: "jump" })).toBe(false);
    expect(isLogRunnerAudioFrame(null)).toBe(false);
  });

  it("uses the procedural mix without requesting placeholder samples", async () => {
    const sound = new LogRunnerSound("phone");

    sound.play("jump");

    await vi.waitFor(() => expect(audio.context.createOscillator).toHaveBeenCalledOnce());
    expect(audio.loadAudio).not.toHaveBeenCalled();
    const node = audio.context.createOscillator.mock.results[0].value as ReturnType<typeof oscillator>;
    expect(node.start).toHaveBeenCalledWith(0);
    expect(node.stop).toHaveBeenCalledWith(0.15);
    expect(node.frequency.setValueAtTime).toHaveBeenCalledWith(360, 0);
  });

  it("caps polyphony at three voices until a voice ends", async () => {
    const sound = new LogRunnerSound("host");

    sound.play("countdown");
    sound.play("go");
    sound.play("jump");
    sound.play("duck");

    await vi.waitFor(() => expect(audio.context.createOscillator).toHaveBeenCalledTimes(3));
    const nodes = audio.context.createOscillator.mock.results.map(
      (result) => result.value as ReturnType<typeof oscillator>,
    );
    nodes[0].onended?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    sound.play("duck");
    await vi.waitFor(() => expect(audio.context.createOscillator).toHaveBeenCalledTimes(4));
  });

  it("lets the critical finish cue preempt a saturated mix", async () => {
    const sound = new LogRunnerSound("host");
    sound.play("splash");
    sound.play("splash");
    sound.play("splash");
    await vi.waitFor(() => expect(audio.context.createOscillator).toHaveBeenCalledTimes(3));
    const saturated = audio.context.createOscillator.mock.results.map((result) => result.value as ReturnType<typeof oscillator>);

    sound.play("finish");
    await vi.waitFor(() => expect(audio.context.createOscillator).toHaveBeenCalledTimes(4));
    expect(saturated.every((node) => node.stop.mock.calls.length >= 2)).toBe(true);
  });

  it("stops active sources, disconnects output, and ignores later playback on destroy", async () => {
    const sound = new LogRunnerSound("host");
    sound.play("warning");
    await vi.waitFor(() => expect(audio.context.createOscillator).toHaveBeenCalledOnce());
    const node = audio.context.createOscillator.mock.results[0].value as ReturnType<typeof oscillator>;

    sound.destroy();

    expect(node.stop).toHaveBeenCalledTimes(2);
    expect(audio.output.disconnect).toHaveBeenCalledOnce();
    sound.play("go");
    await Promise.resolve();
    expect(audio.context.createOscillator).toHaveBeenCalledOnce();
  });
});
