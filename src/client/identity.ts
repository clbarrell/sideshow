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
    k = crypto.randomUUID();
    localStorage.setItem(KEY, k);
  }
  return k;
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
