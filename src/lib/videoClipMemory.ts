// Persistência do videoclipe escolhido para cada música (Xerife Music → modo Vídeo).
// 100% localStorage — funciona idêntico em mobile e desktop. Sincroniza entre
// abas do mesmo device via `storage` event + BroadcastChannel, e emite um
// CustomEvent para componentes reagirem imediatamente sem recarregar.
const KEY = "xerife:music-video-clip:v1";
const MAX_ENTRIES = 300;
const CHANGE_EVENT = "xerife:video-clip-memory:changed";

type Entry = { videoId: string; offsetMs?: number; ts: number };
type Store = Record<string, Entry>;

const bc: BroadcastChannel | null = (() => {
  try { return typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(KEY) : null; } catch { return null; }
})();

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store, changedSongId?: string) {
  try {
    const entries = Object.entries(store).sort(([, a], [, b]) => b.ts - a.ts).slice(0, MAX_ENTRIES);
    const next = Object.fromEntries(entries);
    localStorage.setItem(KEY, JSON.stringify(next));
    // Notificações in-app
    try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { songId: changedSongId } })); } catch {}
    try { bc?.postMessage({ type: "changed", songId: changedSongId }); } catch {}
  } catch {}
}

// Repassa mudanças recebidas de outras abas para listeners locais.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { songId: undefined } })); } catch {}
    }
  });
  bc?.addEventListener("message", (e: MessageEvent) => {
    if (e?.data?.type === "changed") {
      try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { songId: e.data.songId } })); } catch {}
    }
  });
}

export function subscribeMemorizedClip(cb: (songId?: string) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail?.songId);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function getMemorizedClip(songId: string): string | null {
  if (!songId) return null;
  const store = read();
  const entry = store[songId];
  return entry?.videoId || null;
}

export function setMemorizedClip(songId: string, videoId: string) {
  if (!songId || !videoId) return;
  const store = read();
  const prev = store[songId];
  if (prev && prev.videoId === videoId) {
    // apenas atualiza ts para LRU sem disparar eventos redundantes
    store[songId] = { ...prev, ts: Date.now() };
    write(store);
    return;
  }
  store[songId] = { videoId, offsetMs: prev?.offsetMs ?? 0, ts: Date.now() };
  write(store, songId);
}

export function getClipOffset(songId: string): number {
  if (!songId) return 0;
  const store = read();
  return store[songId]?.offsetMs ?? 0;
}

export function setClipOffset(songId: string, offsetMs: number) {
  if (!songId) return;
  const store = read();
  const prev = store[songId];
  if (!prev) return;
  store[songId] = { ...prev, offsetMs: Math.round(offsetMs), ts: Date.now() };
  write(store, songId);
}

export function clearMemorizedClip(songId: string) {
  if (!songId) return;
  const store = read();
  if (store[songId]) {
    delete store[songId];
    write(store, songId);
  }
}
