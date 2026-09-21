import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";
import CenterChromeShield from "@/components/CenterChromeShield";

/**
 * ESCUDO DO CHROME CENTRAL DO YT — v9 (2026-09-21, "dois botões de pause
 * sobrepostos"): com controls=0 o embed do YouTube AINDA pinta um indicador
 * central ⏸/▶ dentro do iframe a cada transição de estado; sem eventos de
 * pointer (tap-catcher), o auto-hide interno do YT nunca dispara e o
 * indicador congela visível — sangrando através do transporte central
 * translúcido do app como um "segundo botão de pause".
 *
 * Contrato do escudo (lente fosca, cross-origin não pode ser apagado por
 * DOM/CSS e nenhuma API esconde o indicador sem cortar áudio):
 *  1. Existe SOMENTE durante reprodução/buffering REAL da superfície YT.
 *  2. Pausado/travado: PausedVideoPoster cobre tudo — escudo ausente
 *     (mutuamente exclusivos).
 *  3. INERTE: pointer-events-none + aria-hidden + nenhum botão/glifo dentro
 *     (o centro continua limpo — Regra de Ouro).
 *  4. Em fullscreen, o Index decide (prop chromeShield) — o overlay só
 *     renderiza o que recebe.
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
    isPlaying: false,
    currentTime: 0,
    duration: 180,
    progress: 0,
    onTogglePlay: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSeek: vi.fn(),
    onExit: vi.fn(),
    videoMode: true,
    ...overrides,
  };
}

function queryShield() {
  return document.querySelector("[data-center-chrome-shield]");
}

function queryPausedPoster() {
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

describe("CenterChromeShield — contrato da lente", () => {
  it("renderiza lente INERTE: sem botão/glifo, aria-hidden, pointer-events-none", () => {
    const { container } = render(<CenterChromeShield />);
    const shield = queryShield();
    expect(shield).not.toBeNull();
    expect(shield!.getAttribute("aria-hidden")).toBe("true");
    expect(shield!.className).toContain("pointer-events-none");
    expect(shield!.className).toContain("backdrop-blur-2xl");
    expect(shield!.className).toContain("rounded-full");
    // z-index padrão do overlay do Index (abaixo do poster 209 / catcher 210)
    expect(shield!.className).toContain("z-[208]");
    // Nenhum elemento interativo ou glifo dentro da lente
    expect(container.querySelector("button, svg")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("aceita zIndexClass customizado (fullscreen usa z-[204])", () => {
    render(<CenterChromeShield zIndexClass="z-[204]" />);
    expect(queryShield()!.className).toContain("z-[204]");
    expect(queryShield()!.className).not.toContain("z-[208]");
  });
});

describe("FullscreenOverlay — integração do escudo", () => {
  it("tocando (YT real): escudo presente, poster ausente, sem transporte central", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false, chromeShield: true })}
        />,
      );
    });
    const shield = queryShield();
    expect(shield).not.toBeNull();
    expect(shield!.className).toContain("pointer-events-none");
    expect(queryPausedPoster()).toBeNull(); // estados mutuamente exclusivos
    expect(document.querySelector("[data-central-transport]")).toBeNull();
  });

  it("buffering: escudo presente (chrome do YT pode estar congelado sob o spinner)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true, chromeShield: true })}
        />,
      );
    });
    expect(queryShield()).not.toBeNull();
    expect(queryPausedPoster()).toBeNull();
  });

  it("sem a prop (default false): escudo ausente — o Index decide quando ligar", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    expect(queryShield()).toBeNull();
  });

  it("pausado/travado: POSTER cobre (escudo ausente) — o bezel ⏸ nunca aparece", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: false, videoSurfaceIdle: true, chromeShield: false })}
        />,
      );
    });
    expect(queryPausedPoster()).not.toBeNull();
    expect(queryShield()).toBeNull();
  });

  it("finalizado: nem escudo nem poster (capa opaca de fim assume)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: false, isEnded: true, chromeShield: false })}
        />,
      );
    });
    expect(queryShield()).toBeNull();
    expect(queryPausedPoster()).toBeNull();
    expect(document.querySelector(".z-\\[205\\]")).not.toBeNull();
  });
});
