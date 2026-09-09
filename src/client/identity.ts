/**
 * Identity lives on the device, not in the room.
 *
 * A phone mints one key the first time it's ever used and keeps it. The party
 * maps that key to a seat, so the same handset gets the same name, colour and
 * running score back after a lock screen, a reload, a dead battery, or a party
 * that resumes the next evening. Nobody re-types their name at a party.
 */

const KEY = "party.deviceKey";
const NAME = "party.name";
const LAST_PARTY = "party.lastHosted";
const HOST_TOKEN = "party.hostToken.";

export function deviceKey(): string {
  let k = localStorage.getItem(KEY);
  if (!k) {
    k = secureUuid();
    localStorage.setItem(KEY, k);
  }
  return k;
}

/**
 * `crypto.randomUUID()` disappears on some phones when the party is opened
 * over a LAN HTTP address. `getRandomValues()` remains available there, so use
 * it to produce the same RFC 4122 v4 shape without weakening device identity.
 */
function secureUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new Error("Secure device identity is unavailable in this browser.");
  }

  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function savedName(): string {
  return localStorage.getItem(NAME) ?? "";
}

export function saveName(name: string) {
  localStorage.setItem(NAME, name.trim().slice(0, 12));
}

/** The projector remembers the code it last ran, so `/` can offer to resume. */
export function lastHostedParty(): string | null {
  return localStorage.getItem(LAST_PARTY);
}

export function rememberHostedParty(code: string) {
  localStorage.setItem(LAST_PARTY, code);
}

export function hostToken(code: string): string | null {
  return localStorage.getItem(HOST_TOKEN + code);
}

export function rememberHostToken(code: string, token: string) {
  localStorage.setItem(HOST_TOKEN + code, token);
  rememberHostedParty(code);
}
