import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";
import CenterGlyphCover from "@/components/CenterGlyphCover";

/**
 * DISCO DO GLIFO CENTRAL — v11→v14 (2026-10-02):
 * o embed controls=0 pinta um indicador central (⏸/▶, ~16% da largura) a cada
 * play/resume/seek; em ALGUNS devices o ⏸ CONGELA e não sai mais (dois
 * reportes com screenshot). O glifo vive no iframe cross-origin — indetectável,
 * indesativável — então o disco opaco #161616 é a única cobertura possível.
 *
 * Contrato travado aqui (v14 — pedido "o símbolo de pause ainda está no
 * centro… corrija para sempre sumir"):
 *  1. Superfície YT tocando → [data-center-glyph-cover] SEMPRE presente
 *     (não depende mais da janela glyphPaintAt nem da visibilidade dos
 *     controles), opaco, INERTE (aria-hidden, pointer-events-none), SEM
 *     backdrop-blur (a lente fosca v10 segue banida).
 *  2. Controles ocultos (auto-hide) + tocando → disco AINDA presente: é
 *     exatamente o estado em que o ⏸ congelado reaparecia.
 *  3. Pausado/idle → ausente (poster assume; jamais dois elementos centrais).
 *  4. BUFFERING → presente (estado, dura TODO o buffering, ignora o watchdog
 *     idle; poster segue bloqueado por !surfaceBuffering — v12).
 *  5. Finalizado → ausente (capa opaca de fim). videoMode=false → ausente.
 *  6. Superfície NATIVA (nativeVideoActive, vídeo offline) → ausente: não há
 *     glifo do embed a cobrir.
 *  7. O disco continua TRANSITÓRIO no sentido de ser inerte e trocar de estado
 *     com poster/capa — não é a antiga CenterChromeShield de blur.
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
    videoMode: true,
    videoSurfaceIdle: false,
    surfaceBuffering: false,
    isEnded: false,
    ...overrides,
  };
}

function queryCover() {
  return document.querySelector("[data-center-glyph-cover]");
}

function queryPoster() {
  return document.querySelector("[data-paused-poster]");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
  document.getElementById("yt-player")?.remove();
});

describe("CenterGlyphCover — disco fixo do glifo do YT (v14)", () => {
  it("tocando na superfície YT: disco SEMPRE presente, inerte, opaco, sem blur", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps()} />);
    });
    const disc = queryCover();
    expect(disc).not.toBeNull();
    expect(disc!.getAttribute("aria-hidden")).toBe("true");
    expect(disc!.className).toContain("pointer-events-none");
    expect(disc!.className).toContain("bg-[#161616]");
    // A lente fosca permanente (backdrop-blur-2xl) segue banida (v10)
    expect(document.querySelector(".backdrop-blur-2xl")).toBeNull();
    expect(queryPoster()).toBeNull(); // mutuamente exclusivo com o poster
  });

  it("controles ocultos (auto-hide) + tocando: disco AINDA presente (v14)", () => {
    // Estado exato do reporte: barra minimizada, vídeo tocando, ⏸ congelado
    // do embed não pode aparecer — o disco não observa mais showControls.
    act(() => {
      render(<FullscreenOverlay {...makeProps()} />);
    });
    act(() => {
      vi.advanceTimersByTime(3600); // auto-hide padrão 3500ms esconde a barra
    });
    expect(queryCover()).not.toBeNull();
  });

  it("pausado: poster assume e o disco NÃO renderiza", () => {
    act(() => {
      render(
        <FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />,
      );
    });
    expect(queryCover()).toBeNull();
    expect(queryPoster()).not.toBeNull();
  });

  it("buffering: disco rende (estado > watchdog idle; poster bloqueado)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({
            surfaceBuffering: true,
            videoSurfaceIdle: true,
          })}
        />,
      );
    });
    const disc = queryCover();
    expect(disc).not.toBeNull();
    expect(queryPoster()).toBeNull(); // mutuamente exclusivo: poster exige !surfaceBuffering
  });

  it("finalizado: capa opaca de fim — sem disco", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isEnded: true, isPlaying: false })} />);
    });
    expect(queryCover()).toBeNull();
  });

  it("modo música (videoMode=false): nunca renderiza", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ videoMode: false })} />);
    });
    expect(queryCover()).toBeNull();
  });

  it("superfície nativa (nativeVideoActive): sem disco — não há glifo do embed", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ nativeVideoActive: true })} />);
    });
    expect(queryCover()).toBeNull();
    expect(queryPoster()).toBeNull(); // tocando nativo: centro livre
  });

  it("componente isolado: contrato inerte + geometria de disco", () => {
    act(() => {
      render(<CenterGlyphCover zIndexClass="z-[204]" />);
    });
    const disc = queryCover() as HTMLElement;
    expect(disc).not.toBeNull();
    expect(disc.className).toContain("rounded-full");
    expect(disc.className).toContain("z-[204]");
    expect(disc.className).toContain("aspect-square");
    expect(disc.textContent).toBe(""); // SEM glifo/botão dentro
  });
});
