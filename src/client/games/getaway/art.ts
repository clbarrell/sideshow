export type GetawayArtKey =
  | "courtyard"
  | "vault"
  | "hedge"
  | "vanCrimson"
  | "vanCobalt"
  | "bag"
  | "crookCrimson"
  | "crookCobalt";

const SOURCES: Record<GetawayArtKey, string> = {
  courtyard: "/images/getaway/courtyard-base.webp",
  vault: "/images/getaway/vault.webp",
  hedge: "/images/getaway/hedge-block.webp",
  vanCrimson: "/images/getaway/van-crimson.webp",
  vanCobalt: "/images/getaway/van-cobalt.webp",
  bag: "/images/getaway/bag.webp",
  crookCrimson: "/images/getaway/crook-crimson.webp",
  crookCobalt: "/images/getaway/crook-cobalt.webp",
};

interface ArtEntry {
  image: HTMLImageElement | null;
  ready: boolean;
  failed: boolean;
}

const entries = Object.fromEntries(
  Object.keys(SOURCES).map((key) => [key, { image: null, ready: false, failed: false }]),
) as Record<GetawayArtKey, ArtEntry>;
let preloadStarted = false;

/** Decode each local image once. Rendering falls back to Canvas while it loads or fails. */
export function preloadGetawayArt() {
  if (preloadStarted || typeof Image === "undefined") return;
  preloadStarted = true;
  for (const key of Object.keys(SOURCES) as GetawayArtKey[]) {
    const entry = entries[key];
    const image = new Image();
    entry.image = image;
    image.decoding = "async";
    const supportsDecode = typeof image.decode === "function";
    image.onload = () => {
      if (!supportsDecode) entry.ready = true;
    };
    image.onerror = () => { entry.failed = true; };
    image.src = SOURCES[key];
    if (supportsDecode) {
      void image.decode().then(() => {
        if (!entry.failed) entry.ready = true;
      }).catch(() => {
        entry.failed = true;
      });
    }
  }
}

export function getawayArt(key: GetawayArtKey) {
  preloadGetawayArt();
  const entry = entries[key];
  return entry.ready && !entry.failed ? entry.image : null;
}

export const GETAWAY_ART_SOURCES = SOURCES;
