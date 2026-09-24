import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";
import CenterGlyphCover from "@/components/CenterGlyphCover";

/**
 * DISCO DO GLIFO CENTRAL — v11 (2026-09-24, "dois botões de pause sobrepostos"):
 * o embed controls=0 pinta um indicador central (⏸/▶, ~16% da largura) a cada
 * play/resume/seek que some sozinho em ~5s (medido em lab). Durante essa janela:
 *  - no fullscreen (sem transporte central) o glifo ficaria SOZINHO no centro;
 *  - no overlay inline ele sangrava ao redor do nosso botão 88/96px = DOIS
 *    botões sobrepostos.
 *
 * Contrato travado aqui:
 *  1. glyphCover + superfície jogando → [data-center-glyph-cover] presente,
 *     opaco, INERTE (aria-hidden, pointer-events-none), SEM backdrop-blur.
 *  2. Janela expirada (glyphCover=false) → ausente — centro 100% limpo.
 *  3. Pausado/idle/finalizado → ausente (poster/capa assumem; jamais dois
 *     elementos centrais juntos). BUFFERING → PRESENTE (v12, reporte
 *     "símbolos ainda presentes"): o spinner/bezel do cross-origin iframe
 *     ficava SOZNO com disco e poster ambos barrados por !surfaceBuffering;
 *     o ramo de buffering é estado (dura TODO o buffering, ignora o
 *     watchdog idle) e continua mutuamente exclusivo com o poster.
 *  4. O disco é TRANSITÓRIO por construção: não é a antiga CenterChromeShield
 *     permanente (componente deletado em ccdad4b) — só renderiza com a prop.
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

describe("CenterGlyphCover — disco transitório do glifo do YT", () => {
  it("janela aberta + tocando: disco presente, inerte, opaco, sem blur", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ glyphCover: true })} />);
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

  it("janela expirada (glyphCover=false): disco ausente — centro limpo", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ glyphCover: false })} />);
    });
    expect(queryCover()).toBeNull();
  });

  it("pausado: poster assume e o disco NÃO renderiza (mesmo com glyphCover)", () => {
    act(() => {
      render(
        <FullscreenOverlay {...makeProps({ glyphCover: true, isPlaying: false, videoSurfaceIdle: true })} />,
      );
    });
    expect(queryCover()).toBeNull();
    expect(queryPoster()).not.toBeNull();
  });

  it("buffering: disco rende (estado > janela; watchdog idle não derruba)", () => {
    // v12 (reporte "símbolos ainda presentes"): durante surfaceBuffering o
    // spinner/bezel do cross-origin iframe jamais pode ficar descoberto —
    // nem quando a janela (glyphCover) já expirou, nem quando o watchdog de
    // stall marca videoSurfaceIdle (o poster segue bloqueado por
    // !surfaceBuffering; sem o disco não haveria NENHUMA cobertura).
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({
            glyphCover: false,
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
      render(<FullscreenOverlay {...makeProps({ glyphCover: true, isEnded: true, isPlaying: false })} />);
    });
    expect(queryCover()).toBeNull();
  });

  it("modo música (videoMode=false): nunca renderiza", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ videoMode: false, glyphCover: true })} />);
    });
    expect(queryCover()).toBeNull();
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
