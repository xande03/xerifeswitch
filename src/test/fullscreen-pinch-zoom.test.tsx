import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * "E2E-style" tests for the fullscreen video player pinch-to-zoom, pan and
 * double-tap-reset gestures. Runs in jsdom against the real component and
 * verifies the transform applied to the #yt-player element as the user would
 * see it on screen.
 */

const song = {
  id: "v1",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test",
  duration: 180,
  albumArt: "",
  videoId: "abc",
} as any;

function makeProps(overrides: Partial<React.ComponentProps<typeof FullscreenOverlay>> = {}) {
  return {
    song,
    isPlaying: true,
    currentTime: 0,
    duration: 180,
    progress: 0,
    onTogglePlay: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSeek: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

function setPlayerRect(width: number, height: number) {
  const el = document.getElementById("yt-player")!;
  // jsdom doesn't lay out — stub getBoundingClientRect so clampPan has real dims.
  // We also account for the currently-applied CSS transform scale so the
  // component's "recover base dims via rect / scale" logic keeps working.
  el.getBoundingClientRect = () => {
    const t = el.style.transform || "";
    const m = /scale\(([-\d.]+)\)/.exec(t);
    const s = m ? parseFloat(m[1]) : 1;
    return {
      x: 0, y: 0, top: 0, left: 0, right: width * s, bottom: height * s,
      width: width * s, height: height * s, toJSON: () => ({}),
    } as DOMRect;
  };
}

function pointer(type: string, id: number, x: number, y: number, target: Element) {
  act(() => {
    const ev = new Event(type, { bubbles: true, cancelable: true }) as any;
    ev.pointerId = id;
    ev.pointerType = "touch";
    ev.clientX = x;
    ev.clientY = y;
    target.dispatchEvent(ev);
  });
}

function parseTransform() {
  const el = document.getElementById("yt-player")!;
  const t = el.style.transform || "";
  const s = parseFloat(/scale\(([-\d.]+)\)/.exec(t)?.[1] ?? "1");
  const tx = parseFloat(/translate3d\(([-\d.]+)px/.exec(t)?.[1] ?? "0");
  const ty = parseFloat(/translate3d\([-\d.]+px,\s*([-\d.]+)px/.exec(t)?.[1] ?? "0");
  return { s, tx, ty };
}

describe("FullscreenOverlay — pinch/pan/double-tap gestures", () => {
  let ytPlayer: HTMLDivElement;

  beforeEach(() => {
    // The overlay applies transforms to a sibling #yt-player element in the DOM.
    ytPlayer = document.createElement("div");
    ytPlayer.id = "yt-player";
    document.body.appendChild(ytPlayer);
    setPlayerRect(1280, 720);
    // requestAnimationFrame stub for the orientation handler.
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0 as any;
    };
  });

  afterEach(() => {
    cleanup();
    ytPlayer.remove();
    (window as any).__xerifeFsOverlayMounted = false;
  });

  it("pinch outward zooms the player in (scale > 1)", () => {
    const { container } = render(<FullscreenOverlay {...makeProps()} />);
    const surface = container.firstChild as Element;

    // Two fingers close together, then spread apart → scale increases.
    pointer("pointerdown", 1, 600, 400, surface);
    pointer("pointerdown", 2, 700, 400, surface); // initial dist=100
    pointer("pointermove", 1, 500, 400, surface);
    pointer("pointermove", 2, 800, 400, surface); // new dist=300 → 3× zoom

    const { s } = parseTransform();
    expect(s).toBeGreaterThan(2.5);
    expect(s).toBeLessThanOrEqual(4);
  });

  it("clamps pan so no black bars appear beyond scaled bounds", () => {
    const { container } = render(<FullscreenOverlay {...makeProps()} />);
    const surface = container.firstChild as Element;

    // Zoom to 2× first.
    pointer("pointerdown", 1, 640, 360, surface);
    pointer("pointerdown", 2, 740, 360, surface); // dist=100
    pointer("pointermove", 1, 540, 360, surface);
    pointer("pointermove", 2, 740, 360, surface); // dist=200 → 2×
    pointer("pointerup", 1, 540, 360, surface);
    pointer("pointerup", 2, 740, 360, surface);

    const zoomed = parseTransform();
    expect(zoomed.s).toBeGreaterThan(1.5);

    // Now single-finger pan far outside the allowed range.
    pointer("pointerdown", 3, 640, 360, surface);
    pointer("pointermove", 3, 10000, 10000, surface);

    const after = parseTransform();
    // At scale 2 on a 1280x720 base, max offsets are 640 and 360.
    expect(Math.abs(after.tx)).toBeLessThanOrEqual(641);
    expect(Math.abs(after.ty)).toBeLessThanOrEqual(361);
  });

  it("double-tap resets zoom back to 1×", async () => {
    vi.useFakeTimers();
    const { container } = render(<FullscreenOverlay {...makeProps()} />);
    const surface = container.firstChild as Element;

    // Zoom in via pinch.
    pointer("pointerdown", 1, 640, 360, surface);
    pointer("pointerdown", 2, 740, 360, surface);
    pointer("pointermove", 1, 440, 360, surface);
    pointer("pointermove", 2, 940, 360, surface); // dist 100→500, capped at 4
    pointer("pointerup", 1, 440, 360, surface);
    pointer("pointerup", 2, 940, 360, surface);

    // Wait for the 50ms gesture-active release timer.
    act(() => { vi.advanceTimersByTime(80); });

    expect(parseTransform().s).toBeGreaterThan(1.5);

    // Two rapid clicks = double-tap → reset.
    act(() => { surface.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    act(() => { surface.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    const reset = parseTransform();
    expect(reset.s).toBeCloseTo(1, 2);
    expect(reset.tx).toBeCloseTo(0, 2);
    expect(reset.ty).toBeCloseTo(0, 2);
    vi.useRealTimers();
  });

  it("re-clamps pan on orientation change to keep player within bounds", () => {
    const { container } = render(<FullscreenOverlay {...makeProps()} />);
    const surface = container.firstChild as Element;

    // Zoom + pan to an extreme in landscape (1280x720).
    pointer("pointerdown", 1, 640, 360, surface);
    pointer("pointerdown", 2, 740, 360, surface);
    pointer("pointermove", 1, 440, 360, surface);
    pointer("pointermove", 2, 940, 360, surface);
    pointer("pointerup", 1, 440, 360, surface);
    pointer("pointerup", 2, 940, 360, surface);
    pointer("pointerdown", 3, 640, 360, surface);
    pointer("pointermove", 3, 0, 0, surface);
    pointer("pointerup", 3, 0, 0, surface);

    const before = parseTransform();
    expect(before.s).toBeGreaterThan(1.5);

    // Rotate to portrait — swap dims. Handler re-clamps via rAF.
    act(() => {
      setPlayerRect(720, 1280);
      window.dispatchEvent(new Event("orientationchange"));
    });

    const after = parseTransform();
    // After rotation, bounds tighten on x and loosen on y; pan must be within them.
    const maxX = (720 * after.s - 720) / 2;
    const maxY = (1280 * after.s - 1280) / 2;
    expect(Math.abs(after.tx)).toBeLessThanOrEqual(maxX + 1);
    expect(Math.abs(after.ty)).toBeLessThanOrEqual(maxY + 1);
    // Scale is preserved (not distorted).
    expect(after.s).toBeCloseTo(before.s, 2);
  });

  it("fully resets transform when unmounted mid-gesture (exit fullscreen)", () => {
    const { container, unmount } = render(<FullscreenOverlay {...makeProps()} />);
    const surface = container.firstChild as Element;

    // Start a pinch and leave it unfinished (no pointerup) — simulates the user
    // hitting exit-fullscreen while two fingers are still on the screen.
    pointer("pointerdown", 1, 640, 360, surface);
    pointer("pointerdown", 2, 740, 360, surface);
    pointer("pointermove", 1, 440, 360, surface);
    pointer("pointermove", 2, 940, 360, surface);
    expect(parseTransform().s).toBeGreaterThan(1.5);

    act(() => { unmount(); });

    // Post-unmount: transform must be neutralized so the player isn't distorted.
    const el = document.getElementById("yt-player")!;
    expect(el.style.transform === "" || el.style.transform === "none").toBe(true);
    expect(el.style.transformOrigin).toBe("");
    expect(el.style.willChange).toBe("");
  });
});
