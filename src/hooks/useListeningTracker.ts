import { useCallback, useEffect, useRef } from "react";
import { recordListenSeconds, type TrackRef } from "@/lib/listeningStats";

const FLUSH_THRESHOLD_SEC = 15;
/** Janela máxima considerada "reprodução contínua" entre dois ticks (o loop
 *  do player atualiza ~1s; folga para jitter). Deltas maiores = seek/pulo e
 *  não contam como tempo ouvido. */
const MAX_CONTINUOUS_DELTA_SEC = 2.5;

/**
 * Acumula tempo real de audição da faixa atual e grava em
 * `listeningStats` a cada 15s, na troca de faixa, ao esconder a página
 * e no unmount. Só conta quando o relógio anda para frente com o player
 * tocando — seeks e pausas não entram na conta.
 */
export function useListeningTracker(
  song: TrackRef | null,
  currentTime: number,
  isPlaying: boolean,
): void {
  const lastSongRef = useRef<TrackRef | null>(null);
  const prevRef = useRef<{ id: string | null; t: number; playing: boolean }>({
    id: null,
    t: 0,
    playing: false,
  });
  const accRef = useRef(0);

  const flush = useCallback(() => {
    const s = lastSongRef.current;
    const secs = accRef.current;
    accRef.current = 0;
    if (s && secs >= 1) recordListenSeconds(s, secs);
  }, []);

  useEffect(() => {
    const id = song?.id ?? null;
    const prev = prevRef.current;

    // Troca de faixa → grava o acumulado da anterior antes de seguir
    if (prev.id && prev.id !== id) flush();

    if (!id) {
      lastSongRef.current = null;
      prevRef.current = { id: null, t: 0, playing: false };
      return;
    }

    lastSongRef.current = song;

    if (isPlaying && prev.playing && prev.id === id) {
      const delta = currentTime - prev.t;
      if (delta > 0 && delta <= MAX_CONTINUOUS_DELTA_SEC) {
        accRef.current += delta;
      }
    }

    prevRef.current = { id, t: currentTime, playing: isPlaying };

    if (accRef.current >= FLUSH_THRESHOLD_SEC) flush();
  }, [song, currentTime, isPlaying, flush]);

  // Libera o pendente ao esconder/fechar a página ou desmontar
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
}
