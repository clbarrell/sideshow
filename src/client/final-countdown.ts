import { audioBus, isAudioMuted, loadAudio } from "./audio";

const TICK_PATH = "/audio/last-marble/countdown-tick.mp3";

export interface FinalCountdown {
  update(seconds: number | null): void;
  destroy(): void;
}

/**
 * One quiet tick for each displayed second in a round's final ten seconds.
 * Hosts pass null whenever that round timer is not the active clock.
 */
export function createFinalCountdown(): FinalCountdown {
  let lastSecond: number | null = null;
  let context: AudioContext | null = null;
  let output: GainNode | null = null;
  let tickBuffer: AudioBuffer | null = null;
  let loading = false;
  let destroyed = false;
  const sources = new Map<AudioScheduledSourceNode, GainNode>();

  const stopSources = () => {
    for (const [source, gain] of sources) {
      try { source.stop(); } catch { /* A finished source cannot be stopped again. */ }
      gain.disconnect();
    }
    sources.clear();
  };

  const ensureOutput = () => {
    if (context && output) return { context, output };
    if (typeof AudioContext === "undefined") return null;
    try {
      const bus = audioBus();
      context = bus.context;
      output = bus.gain;
      output.gain.value = 0.42;
      return { context, output };
    } catch {
      return null;
    }
  };

  const register = (source: AudioScheduledSourceNode, gain: GainNode) => {
    sources.set(source, gain);
    source.onended = () => {
      sources.delete(source);
      gain.disconnect();
    };
  };

  const preload = () => {
    if (loading || tickBuffer || destroyed || typeof AudioContext === "undefined") return;
    if (!ensureOutput()) return;
    loading = true;
    void loadAudio(TICK_PATH).then((buffer) => {
      if (!destroyed) tickBuffer = buffer;
    }).catch(() => {
      // The short oscillator tick below is the durable local fallback.
    }).finally(() => {
      loading = false;
    });
  };

  const fallback = () => {
    const audio = ensureOutput();
    if (!audio || destroyed || isAudioMuted()) return;
    try {
      stopSources();
      const oscillator = audio.context.createOscillator();
      const gain = audio.context.createGain();
      const now = audio.context.currentTime;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(430, now + 0.07);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      oscillator.connect(gain).connect(audio.output);
      register(oscillator, gain);
      oscillator.start(now);
      oscillator.stop(now + 0.11);
    } catch {
      // Sound is optional; the host timer remains authoritative.
    }
  };

  const tick = () => {
    if (destroyed || isAudioMuted()) return;
    const audio = ensureOutput();
    if (!audio) return;
    if (!tickBuffer) {
      preload();
      fallback();
      return;
    }
    try {
      stopSources();
      const source = audio.context.createBufferSource();
      const gain = audio.context.createGain();
      source.buffer = tickBuffer;
      gain.gain.value = 0.28;
      source.connect(gain).connect(audio.output);
      register(source, gain);
      source.start();
    } catch {
      fallback();
    }
  };

  preload();

  return {
    update(seconds) {
      if (destroyed || seconds === null || !Number.isFinite(seconds)) {
        lastSecond = null;
        stopSources();
        return;
      }
      const displayed = Math.ceil(seconds);
      if (displayed < 1 || displayed > 10) {
        lastSecond = null;
        if (displayed < 1) stopSources();
        return;
      }
      if (lastSecond === null || displayed < lastSecond) tick();
      lastSecond = displayed;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lastSecond = null;
      stopSources();
      output?.disconnect();
      output = null;
      context = null;
    },
  };
}
