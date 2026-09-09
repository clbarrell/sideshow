const MUTE_KEY = "sideshow:muted";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<(value: boolean) => void>();
const buffers = new Map<string, Promise<AudioBuffer>>();

function readMuted() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

function ensureAudio() {
  if (context && master) return { context, master };
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(context.destination);
  return { context, master };
}

/** Call directly from a pointer/click handler to satisfy mobile autoplay rules. */
export function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  const { context } = ensureAudio();
  if (context.state === "suspended") void context.resume();
}

export function audioBus() {
  const { context, master } = ensureAudio();
  const gain = context.createGain();
  gain.connect(master);
  return { context, gain };
}

export function loadAudio(path: string) {
  const existing = buffers.get(path);
  if (existing) return existing;
  const { context } = ensureAudio();
  const pending = fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data));
  buffers.set(path, pending);
  return pending;
}

export function isAudioMuted() {
  return muted;
}

export function setAudioMuted(value: boolean) {
  muted = value;
  if (master && context) {
    master.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.025);
  }
  try {
    window.localStorage.setItem(MUTE_KEY, String(value));
  } catch {
    // Storage can be disabled; sound still toggles for this page.
  }
  for (const listener of listeners) listener(value);
}

export function subscribeAudioMuted(listener: (value: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
