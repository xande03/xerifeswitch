/**
 * Integracao do guard de alinhamento dentro do useYouTubePlayer.
 *
 * Diferente do teste puro da politica (clip-sync-guard.test.ts), este sobe o
 * hook REAL contra um mock do YouTube IFrame API e verifica os tres
 * comportamentos que importam no aparelho:
 *   1. loadVideoAt abre a janela de observacao e corrige o pouso em keyframe.
 *   2. Se o player ja pousou certo, NENHUM seek extra e emitido (sem stall).
 *   3. Um seek do usuario cancela a correcao automatica.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";

const STATES = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

type FakePlayerOpts = {
  /** O que getCurrentTime() devolve apos o load (o "pouso real" do YouTube). */
  landAt: number;
};

function installFakeYT({ landAt }: FakePlayerOpts) {
  const created: any[] = [];
  (window as any).YT = {
    PlayerState: STATES,
    Player: class FakePlayer {
      options: any;
      loaded: { videoId: string; startSeconds: number } | null = null;
      seeks: number[] = [];
      time = 0;
      playing = false;
      constructor(_el: unknown, options: any) {
        this.options = options;
        created.push(this);
      }
      // API usada pelo hook
      getIframe() { return document.getElementById("yt-player"); }
      addEventListener() {}
      loadModule() {}
      unloadModule() {}
      setOption() {}
      getAvailableQualityLevels() { return ["hd720", "large", "medium"]; }
      setPlaybackQuality() {}
      setPlaybackQualityRange() {}
      getPlaybackQuality() { return "hd720"; }
      playVideo() { this.playing = true; this.options?.events?.onStateChange?.({ data: STATES.PLAYING }); }
      pauseVideo() { this.playing = false; }
      setVolume() {}
      destroy() {}
      mute() {}
      unMute() {}
      getDuration() { return 200; }
      getPlayerState() { return this.playing ? STATES.PLAYING : STATES.PAUSED; }
      getCurrentTime() { return this.time; }
      getVideoData() { return { video_id: this.loaded?.videoId }; }
      loadVideoById(payload: any) {
        const id = typeof payload === "string" ? payload : payload.videoId;
        const start = typeof payload === "string" ? 0 : Number(payload.startSeconds ?? 0);
        this.loaded = { videoId: id, startSeconds: start };
        // E assim que o YouTube realmente se comporta: ancora no keyframe mais
        // proximo, nao no segundo pedido.
        this.time = landAt;
        this.playing = true;
      }
      seekTo(seconds: number) {
        this.seeks.push(seconds);
        this.time = seconds;
      }
    },
  };
  return created;
}

beforeEach(() => {
  vi.useFakeTimers();
  try { localStorage.clear(); } catch {}
  // jsdom nao implementa play() em elementos de media; o hook chama .play().catch()
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    value: () => Promise.resolve(),
    configurable: true,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    value: () => {},
    configurable: true,
  });
  // jsdom nao implementa as APIs de midia que o hook usa para manter a sessao
  // de audio viva em background. Stubs minimos e fiavel de ambiente.
  if (!(URL as any).createObjectURL) {
    (URL as any).createObjectURL = () => "blob:jsdom-silent";
    (URL as any).revokeObjectURL = () => {};
  }
  class FakeAudioContext {
    state = "running";
    destination = {};
    createGain() { return { connect: () => {}, gain: { value: 0 } }; }
    createMediaElementSource() { return { connect: () => {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  (window as any).AudioContext = (window as any).AudioContext || FakeAudioContext;
  (window as any).webkitAudioContext = (window as any).webkitAudioContext || FakeAudioContext;

  const host = document.createElement("div");
  host.id = "yt-player";
  document.body.appendChild(host);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete (window as any).YT;
});

async function mountHook() {
  const utils = renderHook(() => useYouTubePlayer("yt-player"));
  // O hook espera window.onYouTubeIframeAPIReady antes de criar o player.
  await act(async () => {
    (window as any).onYouTubeIframeAPIReady?.();
    await Promise.resolve();
  });
  return utils;
}

describe("useYouTubePlayer + clipSyncGuard", () => {
  it("corrige o pouso do clipe quando o YouTube ancora em keyframe", async () => {
    const created = installFakeYT({ landAt: 34 }); // pedimos 30, ele pousou em 34
    const { result } = await mountHook();
    const player = created[0];
    expect(player).toBeTruthy();

    act(() => {
      result.current.loadVideoAt("clipX", 30, { crossfade: false });
    });
    expect(player.loaded?.videoId).toBe("clipX");

    // Nenhum seek no tick imediatamente apos o load; o guard espera o polling.
    act(() => { vi.advanceTimersByTime(520); });

    expect(player.seeks).toEqual([30]);
    expect(player.time).toBe(30);
  });

  it("nao emite seek quando o pouso ja esta dentro da tolerancia", async () => {
    const created = installFakeYT({ landAt: 30.05 }); // 50ms de desvio
    const { result } = await mountHook();
    const player = created[0];

    act(() => {
      result.current.loadVideoAt("clipY", 30, { crossfade: false });
    });
    act(() => { vi.advanceTimersByTime(520); });
    act(() => { vi.advanceTimersByTime(520); });

    expect(player.seeks).toEqual([]);
  });

  it("um seek manual do usuario cancela a correcao automatica", async () => {
    const created = installFakeYT({ landAt: 40 });
    const { result } = await mountHook();
    const player = created[0];

    act(() => {
      result.current.loadVideoAt("clipZ", 30, { crossfade: false });
    });
    // O usuario assume o controle antes do proximo tick do guard.
    act(() => {
      result.current.seekTo(55);
    });
    act(() => { vi.advanceTimersByTime(1500); });

    // player.seeks registra TODO seek, incluido o do proprio usuario (55).
    // O que importa: o guard nao adicionou um segundo seek para o alvo antigo 30.
    expect(player.seeks).toEqual([55]);
    expect(player.seeks).not.toContain(30);
    expect(player.time).toBe(55); // o pedido do usuario permanece
  });
});
