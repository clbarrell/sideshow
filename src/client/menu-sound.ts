import { audioBus, isAudioMuted, loadAudio } from "./audio";

export type MenuCue = "browse" | "select" | "launch";
const levels: Record<MenuCue, number> = { browse: 0.15, select: 0.22, launch: 0.25 };

/** Host-only, preloaded feedback. Never queue a late cue after an interaction. */
export class MenuSound {
  private bus: ReturnType<typeof audioBus> | null = null;
  private buffers = new Map<MenuCue, AudioBuffer>();
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private lastCue = -Infinity;
  private destroyed = false;

  constructor() {
    if (typeof AudioContext === "undefined") return;
    try {
      this.bus = audioBus();
      for (const cue of Object.keys(levels) as MenuCue[]) {
        void loadAudio(`/audio/menu/${cue}.mp3`).then((buffer) => {
          if (!this.destroyed) this.buffers.set(cue, buffer);
        }).catch(() => { /* Visual feedback remains sufficient. */ });
      }
    } catch { /* Audio is optional on unsupported devices. */ }
  }

  play(cue: MenuCue) {
    const buffer = this.buffers.get(cue);
    if (this.destroyed || !this.bus || !buffer || isAudioMuted()) return;
    const { context, gain } = this.bus;
    if (context.state !== "running") return;
    const now = context.currentTime;
    // Hover and focus can arrive together; fast browsing must stay comfortable.
    if (cue === "browse" && now - this.lastCue < 0.09) return;
    this.lastCue = now;
    if (cue !== "browse") this.stopVoices();
    if (this.voices.size >= 3) return;
    const source = context.createBufferSource();
    const voice = context.createGain();
    source.buffer = buffer;
    source.connect(voice);
    voice.connect(gain);
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(levels[cue], now + 0.008);
    voice.gain.setValueAtTime(levels[cue], now + Math.max(0.008, buffer.duration - 0.04));
    voice.gain.linearRampToValueAtTime(0, now + buffer.duration);
    this.voices.set(source, voice);
    source.onended = () => {
      source.disconnect();
      voice.disconnect();
      this.voices.delete(source);
    };
    source.start();
  }

  private stopVoices() {
    for (const [source, voice] of this.voices) {
      source.stop();
      source.disconnect();
      voice.disconnect();
    }
    this.voices.clear();
  }

  destroy() {
    this.destroyed = true;
    this.stopVoices();
    this.buffers.clear();
    this.bus?.gain.disconnect();
  }
}
