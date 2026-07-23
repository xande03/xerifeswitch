/**
 * Helpers para montar filas de reprodução automáticas no modo vídeo
 * de faixas musicais:
 *  - Fila por álbum/artista (ordem sequencial) → usada quando shuffle está OFF.
 *  - Fila por histórico de escuta (relevância)  → usada quando shuffle está ON.
 *
 * Ambas retornam Song[] já filtradas para não incluir a faixa atual.
 */
import type { Song } from "@/data/mockSongs";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";
import { getHistory } from "@/lib/localStorage";
import { cleanArtist, cleanTitle } from "@/lib/mediaText";

const MAX_QUEUE = 30;

function dedupe(list: Song[], excludeYoutubeId?: string): Song[] {
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const s of list) {
    if (!s?.youtubeId) continue;
    if (excludeYoutubeId && s.youtubeId === excludeYoutubeId) continue;
    if (seen.has(s.youtubeId)) continue;
    seen.add(s.youtubeId);
    out.push(s);
  }
  return out.slice(0, MAX_QUEUE);
}

/**
 * Monta uma fila com as faixas do álbum do artista da música atual.
 * Tenta primeiro "artista - álbum"; se o álbum não existir/estiver vazio,
 * cai para "artista topic" (catálogo do canal oficial no YouTube Music).
 * A música atual é inserida no início se estiver presente no resultado,
 * caso contrário adicionada como primeira posição para permitir "próxima".
 */
export async function fetchArtistAlbumQueue(current: Song): Promise<Song[]> {
  const artist = cleanArtist(current.artist || "");
  const album = (current.album || "").trim();
  const title = cleanTitle(current.title || "");
  if (!artist) return [];

  const queries: string[] = [];
  if (album && album.toLowerCase() !== title.toLowerCase()) {
    queries.push(`${artist} ${album}`);
    queries.push(`${artist} ${album} álbum`);
  }
  queries.push(`${artist} topic`);
  queries.push(`${artist} melhores músicas`);

  for (const q of queries) {
    try {
      const results = await searchYouTubeMusic(q, "all");
      const cleaned = dedupe(results);
      if (cleaned.length === 0) continue;

      // Ordena com a música atual primeiro (se aparecer), preservando a ordem restante.
      const idx = cleaned.findIndex((s) => s.youtubeId === current.youtubeId);
      if (idx > 0) {
        const reordered = [cleaned[idx], ...cleaned.slice(0, idx), ...cleaned.slice(idx + 1)];
        return reordered;
      }
      return [current, ...cleaned.filter((s) => s.youtubeId !== current.youtubeId)];
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Sementes ponderadas por recência (meia-vida 14 dias) e frequência.
 * Retorna os N artistas mais relevantes do histórico do usuário,
 * excluindo o artista atual para maximizar variedade no modo aleatório.
 */
function weightedTopArtists(excludeArtist: string, limit = 3): string[] {
  const history = getHistory().filter((h) => (h.type ?? "music") === "music");
  if (history.length === 0) return [];
  const now = Date.now();
  const HALF_LIFE = 14 * 24 * 60 * 60 * 1000;
  const scores = new Map<string, number>();
  for (const h of history) {
    const artist = cleanArtist(h.artist || "");
    if (!artist) continue;
    if (excludeArtist && artist.toLowerCase() === excludeArtist.toLowerCase()) continue;
    const age = Math.max(0, now - (h.playedAt || now));
    const weight = Math.pow(0.5, age / HALF_LIFE);
    scores.set(artist, (scores.get(artist) || 0) + weight);
  }
  return [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([a]) => a);
}

/**
 * Fila baseada no histórico do usuário, usada quando shuffle está ativado.
 * Combina resultados de buscas "mix"/"melhores músicas" dos artistas mais
 * ouvidos recentemente e embaralha (Fisher-Yates) para variedade.
 */
export async function fetchHistoryBasedQueue(current: Song): Promise<Song[]> {
  const artists = weightedTopArtists(cleanArtist(current.artist || ""), 3);
  if (artists.length === 0) return [];

  const pool: Song[] = [];
  const queries = artists.flatMap((a) => [`${a} mix`, `${a} melhores músicas`]);

  for (const q of queries) {
    try {
      const results = await searchYouTubeMusic(q, "all");
      for (const s of results.slice(0, 8)) pool.push(s);
      if (pool.length >= MAX_QUEUE * 2) break;
    } catch {
      continue;
    }
  }

  const cleaned = dedupe(pool, current.youtubeId);
  // Fisher-Yates
  for (let i = cleaned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cleaned[i], cleaned[j]] = [cleaned[j], cleaned[i]];
  }
  return cleaned;
}
