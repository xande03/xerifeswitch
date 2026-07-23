import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock colorthief before importing ambientTheme
vi.mock("colorthief", () => {
  const state: { color: [number, number, number]; palette: [number, number, number][] } = {
    color: [30, 30, 30],
    palette: [[30, 30, 30], [40, 40, 40], [50, 50, 50]],
  };
  return {
    __state: state,
    getColor: vi.fn(async () => state.color),
    getPalette: vi.fn(async () => state.palette),
  };
});

import { extractThemeFromImage } from "@/lib/ambientTheme";
import * as colorthief from "colorthief";

const state = (colorthief as any).__state as {
  color: [number, number, number];
  palette: [number, number, number][];
};

// jsdom-friendly Image mock: onload fires immediately
class FakeImage {
  crossOrigin = "";
  private _src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(v: string) { this._src = v; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
}
(globalThis as any).Image = FakeImage as any;

function parseHslTuple(hsl: string): [number, number, number] {
  // "H S% L%"
  const m = hsl.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
  if (!m) throw new Error(`bad hsl tuple: ${hsl}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("ambient theme contrast", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
  });

  it("produces near-white foreground for a dark cover", async () => {
    state.color = [20, 40, 90];
    state.palette = [[20, 40, 90], [15, 30, 70], [10, 20, 50]];
    const theme = await extractThemeFromImage("http://x/dark.jpg");
    const [, , fgL] = parseHslTuple(theme.foregroundHsl);
    const [, , mfgL] = parseHslTuple(theme.mutedForegroundHsl);
    expect(fgL).toBeGreaterThanOrEqual(90);
    expect(mfgL).toBeGreaterThanOrEqual(70);
    expect(theme.foreground).toMatch(/^hsl\(/);
    expect(theme.mutedForeground).toMatch(/^hsl\(/);
  });

  it("keeps foreground legible even on a bright cover (matte stays dark)", async () => {
    state.color = [240, 220, 200];
    state.palette = [[240, 220, 200], [230, 210, 190], [220, 200, 180]];
    const theme = await extractThemeFromImage("http://x/light.jpg");
    const [, , fgL] = parseHslTuple(theme.foregroundHsl);
    // matte is forced dark (L≈22%), so fg should be light
    expect(fgL).toBeGreaterThanOrEqual(90);
    expect(theme.isLight).toBe(true);
  });

  it("muted/deep tones honor low saturation and dark lightness", async () => {
    state.color = [200, 50, 50]; // saturated red
    state.palette = [[200, 50, 50], [180, 40, 40], [160, 30, 30]];
    const theme = await extractThemeFromImage("http://x/red.jpg");
    // muted format: hsl(h, s%, l%)
    const parse = (c: string) => {
      const m = c.match(/hsl\(\s*(-?\d+),\s*(-?\d+)%,\s*(-?\d+)%/);
      if (!m) throw new Error(`bad hsl: ${c}`);
      return { s: Number(m[2]), l: Number(m[3]) };
    };
    const muted = parse(theme.muted);
    const deep = parse(theme.deep);
    expect(muted.s).toBeLessThanOrEqual(35);
    expect(muted.l).toBeLessThanOrEqual(25);
    expect(deep.l).toBeLessThanOrEqual(muted.l);
  });

  it("caches results per URL", async () => {
    state.color = [10, 20, 30];
    state.palette = [[10, 20, 30], [10, 20, 30], [10, 20, 30]];
    const a = await extractThemeFromImage("http://x/cache.jpg");
    // mutate underlying source; cache should return original
    state.color = [200, 200, 200];
    const b = await extractThemeFromImage("http://x/cache.jpg");
    expect(b).toEqual(a);
  });
});
