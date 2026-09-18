import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Getaway local art cache", () => {
  it("requests every repository-local image once and exposes only decoded images", async () => {
    const loaded: string[] = [];
    let decoded = 0;
    class FakeImage {
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode() {
        decoded += 1;
        return Promise.resolve();
      }
      set src(value: string) {
        loaded.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const { GETAWAY_ART_SOURCES, getawayArt, preloadGetawayArt } = await import("../../src/client/games/getaway/art");

    preloadGetawayArt();
    preloadGetawayArt();
    expect(getawayArt("courtyard")).toBeNull();
    await Promise.resolve();
    await Promise.resolve();

    expect(loaded).toEqual(Object.values(GETAWAY_ART_SOURCES));
    expect(new Set(loaded).size).toBe(8);
    expect(decoded).toBe(8);
    expect(getawayArt("courtyard")).toBeInstanceOf(FakeImage);
    expect(getawayArt("crookCobalt")).toBeInstanceOf(FakeImage);
  });

  it("keeps failed art unavailable so the renderer can use its native fallback", async () => {
    class PartialImage {
      path = "";
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode() {
        return this.path.endsWith("/bag.webp") ? Promise.reject(new Error("decode failed")) : Promise.resolve();
      }
      set src(value: string) {
        this.path = value;
        queueMicrotask(() => value.endsWith("/bag.webp") ? this.onerror?.() : this.onload?.());
      }
    }
    vi.stubGlobal("Image", PartialImage);
    const { getawayArt, preloadGetawayArt } = await import("../../src/client/games/getaway/art");
    preloadGetawayArt();
    await Promise.resolve();
    await Promise.resolve();

    expect(getawayArt("bag")).toBeNull();
    expect(getawayArt("courtyard")).toBeInstanceOf(PartialImage);
  });

  it("does not expose a loaded image until its explicit decode completes", async () => {
    const releases: Array<() => void> = [];
    class SlowDecodeImage {
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode() {
        return new Promise<void>((resolve) => releases.push(resolve));
      }
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", SlowDecodeImage);
    const { getawayArt, preloadGetawayArt } = await import("../../src/client/games/getaway/art");
    preloadGetawayArt();
    await Promise.resolve();

    expect(getawayArt("courtyard")).toBeNull();
    releases.forEach((release) => release());
    await Promise.resolve();
    await Promise.resolve();
    expect(getawayArt("courtyard")).toBeInstanceOf(SlowDecodeImage);
  });
});
