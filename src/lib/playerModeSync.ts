// Cross-tab sync do modo do player ("audio" | "video" | "lyrics") por device.
// Usa BroadcastChannel + fallback via CustomEvent. Complementa
// `videoClipMemory` (que já sincroniza a escolha do clipe) para que o painel
// de "Tocando agora" reflita mudanças de exibição de vídeo em todas as abas
// abertas no mesmo dispositivo instantaneamente.

export type BroadcastPlayerMode = "audio" | "video" | "lyrics";

const CHANNEL = "xerife:player-mode:v1";
const EVENT = "xerife:player-mode:changed";

const bc: BroadcastChannel | null = (() => {
  try {
    return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    return null;
  }
})();

if (typeof window !== "undefined") {
  bc?.addEventListener("message", (e: MessageEvent) => {
    if (e?.data?.type === "mode") {
      try {
        window.dispatchEvent(
          new CustomEvent(EVENT, {
            detail: { mode: e.data.mode as BroadcastPlayerMode, songId: e.data.songId as string | undefined },
          }),
        );
      } catch {}
    }
  });
}

export function broadcastPlayerMode(mode: BroadcastPlayerMode, songId?: string) {
  try { bc?.postMessage({ type: "mode", mode, songId }); } catch {}
  // Emite localmente também para que ouvintes na mesma aba reajam sem depender
  // do BroadcastChannel (útil em ambientes de teste / navegadores antigos).
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode, songId } }));
  } catch {}
}

export function subscribePlayerMode(
  cb: (mode: BroadcastPlayerMode, songId?: string) => void,
): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.mode) cb(d.mode as BroadcastPlayerMode, d.songId as string | undefined);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
