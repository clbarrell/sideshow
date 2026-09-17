/** A compact, shared sprite seam for projector (and eventually phone) couriers. */

export const COURIER_ATLAS_URL = "/images/cut-and-shut/courier-atlas.png";

export type CourierDirection = 0 | 1 | 2 | 3;

export interface CourierSpriteOptions {
  /** World-space point at the courier's feet. */
  x: number;
  y: number;
  /** 0 = NE, 1 = SE, 2 = SW, 3 = NW. */
  direction: CourierDirection | number;
  /** Drawn height in canvas pixels. Defaults to a projector-legible 68px. */
  height?: number;
}

export interface CourierSpriteSource {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ATLAS_SIZE = 1254;
const SOURCE_PADDING = 8;

// Bounds were measured from alpha > 64 in the generated atlas. Their order
// deliberately follows Cut-and-Shut's travel direction (0=N through 3=W).
export const COURIER_SPRITE_SOURCES: readonly CourierSpriteSource[] = [
  crop(223, 53, 500, 580), // NE
  crop(750, 59, 1077, 584), // SE
  crop(189, 652, 507, 1173), // SW
  crop(759, 651, 1035, 1169), // NW
];

let atlas: HTMLImageElement | null = null;
let atlasLoad: Promise<boolean> | null = null;

function crop(left: number, top: number, right: number, bottom: number): CourierSpriteSource {
  const x = Math.max(0, left - SOURCE_PADDING);
  const y = Math.max(0, top - SOURCE_PADDING);
  return {
    x,
    y,
    width: Math.min(ATLAS_SIZE, right + SOURCE_PADDING) - x,
    height: Math.min(ATLAS_SIZE, bottom + SOURCE_PADDING) - y,
  };
}

/** Starts the local atlas request once. Safe to call during SSR or tests. */
export function preloadCourierSprite(): Promise<boolean> {
  if (atlasLoad) return atlasLoad;
  if (typeof Image === "undefined") return Promise.resolve(false);

  atlasLoad = new Promise((resolve) => {
    const image = new Image();
    const settle = (loaded: boolean) => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      atlas = loaded ? image : null;
      resolve(loaded);
    };
    const onLoad = () => settle(true);
    const onError = () => settle(false);
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.src = COURIER_ATLAS_URL;
  });
  return atlasLoad;
}

/**
 * Draws a courier with its feet at x/y. Returns true when the atlas was used;
 * until it is ready (or when it failed), a clear clockwork courier fallback is
 * drawn instead.
 */
export function drawCourierSprite(context: CanvasRenderingContext2D, options: CourierSpriteOptions): boolean {
  const direction = ((Math.round(options.direction) % 4) + 4) % 4;
  const source = COURIER_SPRITE_SOURCES[direction];
  const height = options.height ?? 68;
  const width = height * (source.width / source.height);

  if (atlas?.complete && atlas.naturalWidth > 0) {
    context.drawImage(atlas, source.x, source.y, source.width, source.height, options.x - width / 2, options.y - height, width, height);
    return true;
  }

  void preloadCourierSprite();
  drawFallbackCourier(context, options.x, options.y, height, direction);
  return false;
}

function drawFallbackCourier(context: CanvasRenderingContext2D, x: number, feetY: number, height: number, direction: number) {
  const scale = height / 68;
  const facing = direction === 1 || direction === 2 ? 1 : -1;
  context.save();
  context.translate(x, feetY);
  context.scale(scale, scale);

  context.fillStyle = "#181B35";
  context.fillRect(-15, -61, 30, 11);
  context.beginPath();
  context.arc(0, -49, 14, 0, Math.PI * 2);
  context.fillStyle = "#FFF3D1";
  context.fill();
  context.fillStyle = "#8D2933";
  context.fillRect(-13, -39, 26, 25);
  context.fillStyle = "#24243A";
  context.fillRect(-11, -14, 8, 14);
  context.fillRect(3, -14, 8, 14);
  context.fillStyle = "#D99B2B";
  context.fillRect(facing * 8 - 10, -33, 20, 15);
  context.strokeStyle = "#FFF3D1";
  context.lineWidth = 2;
  context.strokeRect(facing * 8 - 10, -33, 20, 15);
  context.restore();
}
