/**
 * Posição de retomada POR VÍDEO (parte 38).
 * O "continuar de onde parou" é vinculado ao `videoId` — NUNCA à playlist,
 * fila ou módulo. Trocar de playlist, fechar o app, alternar sessões: a
 * posição segue o episódio/filme e a reprodução retoma do ponto salvo.
 * Storage: localStorage (mapa videoId → posição), teto de 120 entradas
 * (evict por antiguidade) e evento global para a UI reagir.
 */
const KEY = "alse_resume_positions";
export const RESUME_EVENT = "alse:resume-updated";

export interface ResumeEntry {
  currentTime: number;
  duration: number;
  updatedAt: number;
  title?: string;
  artist?: string;
  cover?: string;
}

function read(): Record<string, ResumeEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, ResumeEntry>;
  } catch {
    return {};
  }
}

function write(map: Record<string, ResumeEntry>): void {
  try {
    const entries = Object.entries(map);
    if (entries.length > 120) {
      entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
      entries.length = 120;
    }
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
    window.dispatchEvent(new CustomEvent(RESUME_EVENT));
  } catch {}
}

/** Salva a posição atual do vídeo. >95% assistido = concluído (limpa a entrada). */
export function saveResumePosition(
  id: string,
  currentTime: number,
  duration: number,
  meta?: { title?: string; artist?: string; cover?: string }
): void {
  if (!id || !duration || !(currentTime > 0)) return;
  if (currentTime / duration > 0.95) {
    clearResumePosition(id);
    return;
  }
  const map = read();
  const prev = map[id];
  map[id] = {
    currentTime,
    duration,
    updatedAt: Date.now(),
    title: meta?.title ?? prev?.title,
    artist: meta?.artist ?? prev?.artist,
    cover: meta?.cover ?? prev?.cover,
  };
  write(map);
}

/** Posição salva do vídeo (null se não há ou se inválida). */
export function getResumePosition(id: string): ResumeEntry | null {
  if (!id) return null;
  const e = read()[id];
  return e && e.duration > 0 ? e : null;
}

/** Remove a posição (ex.: após concluir ou remover da lista). */
export function clearResumePosition(id: string): void {
  const map = read();
  if (!(id in map)) return;
  delete map[id];
  write(map);
}

/** Entradas mais recentes primeiro (para "Continuar assistindo"). */
export function getRecentResumes(n = 12): (ResumeEntry & { id: string })[] {
  return Object.entries(read())
    .map(([id, e]) => ({ ...e, id }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, n);
}
