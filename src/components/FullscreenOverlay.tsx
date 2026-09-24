import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Play, Pause, SkipBack, SkipForward, ArrowLeft, Settings2, Check, Loader2 } from "lucide-react";
import { track as trackMetric } from "@/lib/playbackMetrics";
import { Song, formatDuration } from "@/data/mockSongs";
import SeekBar from "@/components/SeekBar";
import PausedVideoPoster from "@/components/PausedVideoPoster";
import CenterGlyphCover from "@/components/CenterGlyphCover";

/** Auto-ocultar dos controles do fullscreen — FONTE ÚNICA em
 *  src/lib/autoHideControls.ts (compartilhada com o overlay inline do Index):
 *  mesmos "segundos determinados" em TODOS os players (Xerife Vídeos, Music
 *  modo Vídeo, Podcasts modo Vídeo), TODOS JUNTOS. ALSE-STYLE: o timer arma
 *  em qualquer estado (pausado inclusive). */
import { AUTOHIDE_OPTS, readAutoHideMs } from "@/lib/autoHideControls";


interface FullscreenOverlayProps {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (fraction: number) => void;
  onExit: () => void;
  /** TRUE em fullscreen de VÍDEO: ativa keepOpen-pausado e as máscaras de branding
   *  do embed do YouTube (título/canal/logo/sugestões). No fullscreen de MÚSICA
   *  permanece false — lá nada do iframe aparece. */
  videoMode?: boolean;
  /** TRUE quando o vídeo TERMINOU: cobre o iframe com preto opaco até o
   *  autoplay do app carregar o próximo — a endscreen do YouTube (grade de
   *  sugestões + replay) nunca aparece no centro da tela cheia. */
  isEnded?: boolean;
  /** ESTADO REAL da superfície do embed (fail-closed): TRUE quando o YouTube
   *  NÃO está confirmadamente PLAYING/BUFFERING (cue, pausado, finalizado,
   *  travado, pós-erro). Mantém os controles inferiores visíveis para que
   *  Play/Pause continue disponível mesmo durante dessincronia ou travamento. */
  videoSurfaceIdle?: boolean;
  /** ESTADO REAL de buffering do embed: TRUE enquanto o YouTube carrega a
   *  stream. Durante o buffering os controles inferiores permanecem visíveis
   *  até a reprodução confirmar; todos minimizam juntos quando roda de verdade. */
  surfaceBuffering?: boolean;
  /** JANELA DO GLIFO (v11): TRUE durante a pintura do indicador central do YT
   *  (play/seek/load, ~5s medidos em lab) — renderiza o CenterGlyphCover opaco
   *  transitório que esconde o glifo (nunca "botão de pause" fantasma no centro
   *  da tela cheia). O Index calcula a janela e passa pronta. */
  glyphCover?: boolean;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

const FullscreenOverlay = ({
  song, isPlaying, currentTime, duration, progress,
  onTogglePlay, onNext, onPrev, onSeek, onExit,
  videoMode = false,
  isEnded = false,
  videoSurfaceIdle = false,
  surfaceBuffering = false,
  glyphCover = false,
}: FullscreenOverlayProps) => {
  const [showControls, setShowControls] = useState(true);
  const [zoom, setZoom] = useState<{ scale: number; x: number; y: number }>({ scale: 1, x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTapRef = useRef<number>(0);

  // ALSE-STYLE: o centro do vídeo é intencionalmente livre (nenhum disco,
  // flash ou botão do app). Play/Pause existe somente na barra inferior — e os
  // controles seguem UM único mecanismo: auto-hide configurável + toque na
  // superfície SEMPRE alterna (inclusive pausado: o usuário decide quando
  // minimizar).
  const QUALITY_OPTIONS: { value: string; label: string }[] = [
    { value: "auto", label: "Automática" },
    { value: "hd1080", label: "1080p60 (HD)" },
    { value: "hd720", label: "720p (HD)" },
    { value: "large", label: "480p" },
    { value: "medium", label: "360p" },
    { value: "small", label: "240p" },
    { value: "tiny", label: "144p" },
  ];
  const [currentQuality, setCurrentQuality] = useState<string>(() => {
    try { return localStorage.getItem("demus_video_quality") || "auto"; } catch { return "auto"; }
  });
  const [activeQuality, setActiveQuality] = useState<string>("auto");
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  useEffect(() => {
    const onPref = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (q) setCurrentQuality(q);
    };
    const onActive = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (q) setActiveQuality(q);
    };
    const onLoading = (e: Event) => setQualityLoading(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("demus:quality-changed", onPref as EventListener);
    window.addEventListener("demus:quality-active", onActive as EventListener);
    window.addEventListener("demus:quality-loading", onLoading as EventListener);
    return () => {
      window.removeEventListener("demus:quality-changed", onPref as EventListener);
      window.removeEventListener("demus:quality-active", onActive as EventListener);
      window.removeEventListener("demus:quality-loading", onLoading as EventListener);
    };
  }, []);
  const applyQuality = (v: string) => {
    if (qualityLoading) return;
    setCurrentQuality(v);
    setQualityOpen(false);
    try { window.dispatchEvent(new CustomEvent("demus:set-quality", { detail: v })); } catch {}
  };
  const activeLabel = QUALITY_OPTIONS.find((q) => q.value === activeQuality)?.label
    ?? (activeQuality && activeQuality !== "auto" ? activeQuality : "");
  const prefLabel = QUALITY_OPTIONS.find((q) => q.value === currentQuality)?.label ?? "Automática";
  const currentQualityLabel = qualityLoading
    ? "Carregando…"
    : currentQuality === "auto"
      ? (activeLabel ? `Auto · ${activeLabel}` : "Automática")
      : prefLabel;

  // ── Pinch-to-zoom state ──
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; origin: { x: number; y: number } } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const gestureActiveRef = useRef<boolean>(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Apply transform directly to the underlying YouTube player container.
  const applyTransform = useCallback((s: number, x: number, y: number) => {
    const el = document.getElementById("yt-player");
    if (!el) return;
    // Em scale neutro (sem pinch), remove totalmente o transform para não
    // introduzir uma camada GPU que possa causar desvio subpixel/desalinhamento
    // no centro do letterbox — especialmente em mobile landscape.
    if (Math.abs(s - 1) < 0.001 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5) {
      el.style.transform = "";
      el.style.transformOrigin = "";
      el.style.willChange = "";
      el.style.transition = gestureActiveRef.current ? "none" : "";
      return;
    }
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    el.style.transformOrigin = "center center";
    el.style.transition = gestureActiveRef.current ? "none" : "transform 180ms ease-out";
    el.style.willChange = "transform";
  }, []);

  useEffect(() => { applyTransform(zoom.scale, zoom.x, zoom.y); }, [zoom, applyTransform]);

  // Clamp pan so the scaled video always covers the visible viewport,
  // preventing black bars/irregular cuts at the edges when zoomed.
  const clampPan = useCallback((scale: number, x: number, y: number) => {
    const el = document.getElementById("yt-player");
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    // rect reflects current transform → recover base (unscaled) dimensions.
    const safeScale = Math.max(scale, 0.0001);
    const baseW = rect.width / safeScale;
    const baseH = rect.height / safeScale;
    const maxX = Math.max(0, (baseW * scale - baseW) / 2);
    const maxY = Math.max(0, (baseH * scale - baseH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const autoHideMsRef = useRef<number>(readAutoHideMs());

  // ALSE-STYLE: o timer SEMPRE arma — pausado inclusive. Minimizar é decisão
  // do usuário (toque) ou do tempo, nunca do estado da reprodução.
  const resetTimer = useCallback(() => {
    setShowControls(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowControls(false), autoHideMsRef.current);
  }, []);

  const handleSurfaceClick = useCallback(() => {
    // Ignore taps that were part of a pinch/pan gesture.
    if (gestureActiveRef.current) return;
    // ALSE-STYLE: nenhum estado bloqueia o toque — pausado/buffering/idle
    // inclusive, o usuário SEMPRE consegue minimizar os controles.
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap: if zoomed, reset zoom instead of hiding controls.
      if (zoomRef.current.scale > 1.01) {
        setZoom({ scale: 1, x: 0, y: 0 });
        lastTapRef.current = 0;
        resetTimer();
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowControls(false);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    setShowControls((prev) => {
      if (prev) {
        if (timerRef.current) clearTimeout(timerRef.current);
        return false;
      }
      resetTimer();
      return true;
    });
  }, [resetTimer, videoMode, isPlaying, videoSurfaceIdle, surfaceBuffering, showControls]);

  // ── Pointer handlers for pinch + pan ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      pinchStartRef.current = {
        dist,
        scale: zoomRef.current.scale,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        origin: { x: zoomRef.current.x, y: zoomRef.current.y },
      };
      panStartRef.current = null;
      gestureActiveRef.current = true;
    } else if (pointersRef.current.size === 1 && zoomRef.current.scale > 1.01) {
      panStartRef.current = {
        x: e.clientX, y: e.clientY,
        ox: zoomRef.current.x, oy: zoomRef.current.y,
      };
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const ratio = dist / pinchStartRef.current.dist;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartRef.current.scale * ratio));
      // Simple pan follows midpoint delta so pinch feels anchored.
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = mid.x - pinchStartRef.current.mid.x;
      const dy = mid.y - pinchStartRef.current.mid.y;
      const clamped = clampPan(nextScale, pinchStartRef.current.origin.x + dx, pinchStartRef.current.origin.y + dy);
      setZoom({ scale: nextScale, x: clamped.x, y: clamped.y });
    } else if (pointersRef.current.size === 1 && panStartRef.current && zoomRef.current.scale > 1.01) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const clamped = clampPan(zoomRef.current.scale, panStartRef.current.ox + dx, panStartRef.current.oy + dy);
      setZoom((z) => ({ scale: z.scale, x: clamped.x, y: clamped.y }));
      gestureActiveRef.current = true;
    }
  }, [clampPan]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) {
      panStartRef.current = null;
      // If scale dropped to ~1, snap back to neutral (recentraliza).
      if (zoomRef.current.scale <= 1.02) {
        setZoom({ scale: 1, x: 0, y: 0 });
      }
      // Release gesture flag on next tick so the trailing click is ignored.
      setTimeout(() => { gestureActiveRef.current = false; }, 50);
    }
  }, []);

  useEffect(() => {
    // Singleton guard: in StrictMode or rapid remounts (e.g. when entering/exiting
    // PiP while backgrounded), prevent two overlay instances from competing for
    // listeners and orientation locks.
    const w = window as any;
    if (w.__xerifeFsOverlayMounted) {
      trackMetric('fullscreen', 'overlay-duplicate-mount-blocked');
      return;
    }
    w.__xerifeFsOverlayMounted = true;
    trackMetric('fullscreen', 'overlay-mount');
    resetTimer();

    // Sync timer state with environment changes
    const onPipEnter = () => resetTimer();
    const onPipLeave = () => resetTimer();
    // ALSE-STYLE: auto-hide alterado em outra aba/instância aplica na hora
    const onStorage = (e: StorageEvent) => {
      if (e.key === "demus-fs-autohide-ms") {
        const n = Number(e.newValue);
        if (AUTOHIDE_OPTS.includes(n as any)) autoHideMsRef.current = n;
        resetTimer();
      }
    };
    const clearTransform = () => {
      const el = document.getElementById("yt-player");
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = "none";
      el.style.transformOrigin = "";
      el.style.willChange = "";
      // Force reflow so the browser re-applies CSS sizing (vw/vh/dvh).
      void el.offsetHeight;
      el.style.transition = "";
    };
    const scheduledRef = { current: false } as { current: boolean };
    const onOrientation = () => {
      resetTimer();
      // On rotation/resize, reset zoom + inline transform so the CSS letterbox
      // (aspect-ratio 16:9, centered via min()+margin:auto) recalculates cleanly
      // for the new viewport. Any residual transform from a prior pinch could
      // otherwise offset/crop the player after rotating portrait↔landscape.
      setZoom({ scale: 1, x: 0, y: 0 });
      clearTransform();
      if (scheduledRef.current) return;
      scheduledRef.current = true;
      // iOS/Safari reports new viewport dimensions asynchronously after rotation;
      // re-clear across several frames to catch late layout passes (URL bar
      // collapse, dynamic-island reflow, keyboard dismissal, etc.).
      requestAnimationFrame(clearTransform);
      setTimeout(clearTransform, 60);
      setTimeout(clearTransform, 180);
      setTimeout(clearTransform, 400);
      setTimeout(() => { clearTransform(); scheduledRef.current = false; }, 700);
    };
    const onVisibility = () => { if (!document.hidden) { resetTimer(); onOrientation(); } };
    const orientationMql = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(orientation: landscape)")
      : null;
    document.addEventListener("enterpictureinpicture", onPipEnter, true);
    document.addEventListener("leavepictureinpicture", onPipLeave, true);
    document.addEventListener("webkitpresentationmodechanged", onPipEnter, true);
    window.addEventListener("orientationchange", onOrientation);
    window.addEventListener("resize", onOrientation);
    try { (screen as any)?.orientation?.addEventListener?.("change", onOrientation); } catch {}
    try { (window as any).visualViewport?.addEventListener?.("resize", onOrientation); } catch {}
    try { orientationMql?.addEventListener?.("change", onOrientation); } catch {}
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);


    
    // Sem lock de orientação: o fullscreen respeita a rotação do dispositivo.


    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("enterpictureinpicture", onPipEnter, true);
      document.removeEventListener("leavepictureinpicture", onPipLeave, true);
      document.removeEventListener("webkitpresentationmodechanged", onPipEnter, true);
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("resize", onOrientation);
      try { (screen as any)?.orientation?.removeEventListener?.("change", onOrientation); } catch {}
      try { (window as any).visualViewport?.removeEventListener?.("resize", onOrientation); } catch {}
      try { orientationMql?.removeEventListener?.("change", onOrientation); } catch {}
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);



      (window as any).__xerifeFsOverlayMounted = false;
      // Fully abort any in-flight pinch/pan gesture so exiting fullscreen mid-gesture
      // leaves the player un-transformed and never distorted.
      pointersRef.current.clear();
      pinchStartRef.current = null;
      panStartRef.current = null;
      gestureActiveRef.current = false;
      // Reset transform on the underlying player. Disable transition first so the
      // reset is instantaneous (no residual animated distortion after unmount).
      const el = document.getElementById("yt-player");
      if (el) {
        el.style.transition = "none";
        el.style.transform = "none";
        el.style.transformOrigin = "";
        el.style.willChange = "";
        // Force a reflow so the "none" transform sticks before any later style writes.
        void el.offsetHeight;
        el.style.transition = "";
      }

      trackMetric('fullscreen', 'overlay-unmount');
    };
  }, [resetTimer]);

  return (
    <div
      className="absolute inset-0 z-[200] flex flex-col justify-between pointer-events-auto touch-none select-none"
      onClick={handleSurfaceClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* (as máscaras de branding do YouTube agora são renderizadas como camada PERMANENTE
          dentro de #yt-fullscreen-container pelo `Index` — e não por este overlay) */}

      {/* POSTER DO ESTADO PAUSADO (v8): cobre o iframe enquanto pausado/
          travado — bezel ⏸ do YouTube (cross-origin) jamais visível. some
          ao dar play. z-[204]: acima do vídeo, abaixo da capa de fim (205)
          e das barras de controle. pointer-events-none. */}
      {videoMode && !isEnded && !surfaceBuffering && (!isPlaying || videoSurfaceIdle) && (
        <PausedVideoPoster cover={song?.cover} zIndexClass="z-[204]" />
      )}

      {/* DISCO DO GLIFO (v11): no fullscreen não existe transporte central —
          sem este disco o indicador do YT (pintado em play/seek/load) ficaria
          SOZINHO no centro por ~5s. Opaco, transitório (janela GLYPH_COVER_MS),
          sem blur — some junto com o glifo. Mútuo exclusivo com o poster. */}
      {videoMode &&
        glyphCover &&
        isPlaying &&
        !videoSurfaceIdle &&
        !surfaceBuffering &&
        !isEnded && (
          <CenterGlyphCover zIndexClass="z-[204]" />
        )}

      {/* VÍDEO 100% VISÍVEL (v10): durante a reprodução real NENHUMA lente/
          sombra fosca fica no centro — o vídeo aparece integralmente. A antiga
          CenterChromeShield (backdrop-blur) foi removida a pedido do usuário:
          o glifo transitório do embed some sozinho e, se o frame congelar, o
          watchdog (videoSurfaceIdle) troca este estado pelo poster acima. */}

      {/* CAPA OPACA de fim de vídeo: com o vídeo TERMINADO o YouTube desenha a
          endscreen (grade de sugestões + replay) no CENTRO do iframe — região
          que o overflow masking não cobre. Cobre tudo de preto até o autoplay
          do app assumir — só o nosso UI permanece visível. */}
      {videoMode && isEnded && (
        /* Primeiro filho do overlay: fica por cima do vídeo (e sob todos os
           controles seguintes — voltar, seek, transporte — que renderizam depois) */
        <div className="absolute inset-0 z-[205] bg-black pointer-events-none" aria-hidden />
      )}



      {/* Top bar — respeita safe-area (notch / Dynamic Island) sem afetar o vídeo,
          que continua ocupando 100vw/100vh via letterbox central. */}
      <div
        className={`flex items-center justify-between px-5 pt-5 pb-10 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <div className="w-11" /> {/* spacer for the always-visible button */}
        <div className="flex-1 text-center px-4 min-w-0">
          <p className="text-white text-sm font-medium truncate">{song.title}</p>
          <p className="text-white/60 text-xs truncate">
            {song.artist} <span className="mx-1 opacity-60">·</span>
            <span className="uppercase tracking-wide">{currentQualityLabel}</span>
          </p>
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); setQualityOpen((v) => !v); }}
            className="w-11 h-11 flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
            aria-label="Qualidade do vídeo"
            title={`Qualidade: ${currentQualityLabel}`}
          >
            {qualityLoading ? <Loader2 size={22} className="animate-spin" /> : <Settings2 size={22} />}
          </button>
          {qualityOpen && (
            <div
              role="menu"
              aria-busy={qualityLoading}
              className="absolute right-0 top-full mt-2 z-[210] min-w-[210px] rounded-2xl bg-black/85 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/60 border-b border-white/10 flex items-center justify-between gap-2">
                <span>Qualidade</span>
                {qualityLoading && <Loader2 size={12} className="animate-spin text-white/80" />}
              </div>
              {QUALITY_OPTIONS.map((opt) => {
                const isPref = currentQuality === opt.value;
                const isActive = activeQuality === opt.value;
                return (
                  <button
                    key={opt.value}
                    disabled={qualityLoading}
                    onClick={(e) => { e.stopPropagation(); applyQuality(opt.value); }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] transition-colors ${
                      isPref
                        ? "bg-white/15 text-white font-semibold"
                        : "text-white/85 hover:bg-white/10"
                    } ${qualityLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      {opt.label}
                      {!isPref && isActive && (
                        <span className="text-[10px] uppercase tracking-wider text-white/50">agora</span>
                      )}
                    </span>
                    {isPref && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls — transport + slider colado ao rodapé, respeitando
          safe-area-inset-bottom (home indicator) e lateral (notch em landscape). */}
      <div
        className={`px-4 pb-2 pt-6 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-6 mb-3">
          <button
            onClick={(e) => { e.stopPropagation(); onExit(); }}
            className="p-2 text-white/90 hover:text-white active:scale-90 transition-all"
            aria-label="Voltar"
          >
            <ArrowLeft size={26} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="p-2 text-white/90 hover:text-white active:scale-90 transition-all"
            aria-label="Anterior"
          >
            <SkipBack size={26} fill="currentColor" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
            className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="p-2 text-white/90 hover:text-white active:scale-90 transition-all"
            aria-label="Próxima"
          >
            <SkipForward size={26} fill="currentColor" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/70 font-mono w-10 text-right">{formatDuration(currentTime)}</span>
          <SeekBar
            progress={progress}
            onSeek={onSeek}
            trackHeight="thin"
            showThumb={true}
            className="flex-1"
          />
          <span className="text-[10px] text-white/70 font-mono w-10">{formatDuration(duration)}</span>
        </div>
      </div>

    </div>
  );
};

export default FullscreenOverlay;
