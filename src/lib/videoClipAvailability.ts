// Xerife Music — disponibilidade do videoclipe oficial por faixa (LOCAL ONLY).
// Cada dispositivo mantém seu próprio cache em localStorage; sem sincronização
// remota. Garante que o botão "Vídeo" apareça sempre que houver um clipe
// confiável, e nunca esconde por falha de rede (aplica retry com backoff).
//
// Camadas:
//   1. memorização local (videoClipMemory)    — clipe escolhido pela busca ranqueada
//   2. cache local (localStorage)              — status com TTL
//   3. sonda ao vivo (youtubeGeneralSearch)    — quando nada está fresco

import type { Song } from "@/data/mockSongs";
import { getMemorizedClip, setMemorizedClip } from "@/lib/videoClipMemory";

const KEY = "xerife:music-video-availability:v2";
const MAX_ENTRIES = 400;
const UNAVAILABLE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const AVAILABLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 dias

type Status = "available" | "unavailable";
type Entry = { status: Status; videoId?: string; ts: number };
type Store = Record<string, Entry>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function write(store: Store) {
  try {
    const entries = Object.entries(store).sort(([, a], [, b]) => b.ts - a.ts).slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

export type Availability = { status: Status | "unknown"; videoId?: string };

function isFresh(entry: Entry): boolean {
  const ttl = entry.status === "available" ? AVAILABLE_TTL_MS : UNAVAILABLE_TTL_MS;
  return Date.now() - entry.ts <= ttl;
}

export function getAvailability(songId: string): Availability {
  if (!songId) return { status: "unknown" };
  const memorized = getMemorizedClip(songId);
  if (memorized) return { status: "available", videoId: memorized };
  const entry = read()[songId];
  if (!entry) return { status: "unknown" };
  if (!isFresh(entry)) return { status: "unknown" };
  return { status: entry.status, videoId: entry.videoId };
}

export function markAvailable(songId: string, videoId: string) {
  if (!songId || !videoId) return;
  setMemorizedClip(songId, videoId);
  const store = read();
  store[songId] = { status: "available", videoId, ts: Date.now() };
  write(store);
}

export function markUnavailable(songId: string) {
  if (!songId) return;
  const store = read();
  store[songId] = { status: "unavailable", ts: Date.now() };
  write(store);
}

/* ============================ Sonda com retry + backoff ============================ */

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inflight = new Map<string, Promise<Availability>>();
const retryState = new Map<string, { attempts: number; nextAt: number }>();

const RETRY_BASE_MS = 4_000;
const RETRY_MAX_MS = 5 * 60_000;
const RETRY_MAX_ATTEMPTS = 5;

function shouldSkipDueToBackoff(songId: string): boolean {
  const s = retryState.get(songId);
  if (!s) return false;
  return Date.now() < s.nextAt;
}
function scheduleBackoff(songId: string) {
  const s = retryState.get(songId) || { attempts: 0, nextAt: 0 };
  s.attempts = Math.min(s.attempts + 1, RETRY_MAX_ATTEMPTS);
  const delay = Math.min(RETRY_BASE_MS * 2 ** (s.attempts - 1), RETRY_MAX_MS);
  s.nextAt = Date.now() + delay;
  retryState.set(songId, s);
}
function clearBackoff(songId: string) { retryState.delete(songId); }

/**
 * Detecta "capa/tema" (áudio com imagem estática): canais Topic auto-gerados,
 * uploads "Provided to YouTube by...", faixas marcadas como "Official Audio",
 * "Áudio Oficial", "Lyric Video", "Visualizer". Esses NÃO são videoclipes
 * reais e devem ser filtrados — caso contrário o modo Vídeo mostra apenas a
 * arte da capa, o que confunde a experiência.
 */
function isCoverOnly(v: { title?: string; channel?: string; description?: string }): boolean {
  const t = (v.title || "").toLowerCase();
  const ch = (v.channel || "").toLowerCase();
  const d = (v.description || "").toLowerCase();
  if (/-\s*topic$/.test(ch.trim())) return true;
  if (/provided to youtube/.test(d)) return true;
  if (/\b(official audio|audio oficial|áudio oficial|lyric video|lyrics video|visualizer|visualizador|audio only|only audio)\b/.test(t)) return true;
  if (/\((official )?audio\)/.test(t) || /\[audio\]/.test(t)) return true;
  return false;
}

/**
 * Sonda o clipe REAL da faixa (não capa/tema). Aplica ranqueamento,
 * filtragem de "cover-only" e um limiar mais rigoroso. Falhas de rede
 * aplicam backoff e NUNCA marcam indisponível.
 *
 * IMPORTANTE: não usamos mais `song.youtubeId` como fallback automático de
 * "disponível" — esse ID muitas vezes aponta para áudio-com-capa (Topic).
 * O botão de Vídeo só aparece quando há um clipe real confirmado.
 */
export async function probeVideoClip(song: Pick<Song, "id" | "title" | "artist" | "youtubeId">): Promise<Availability> {
  const cached = getAvailability(song.id);
  if (cached.status === "available") return cached;
  const existing = inflight.get(song.id);
  if (existing) return existing;
  if (shouldSkipDueToBackoff(song.id)) return { status: "unknown" };

  const run = (async (): Promise<Availability> => {
    try {
      const { searchYouTubeGeneral } = await import("@/lib/youtubeGeneralSearch");
      let results = await searchYouTubeGeneral(`${song.artist} ${song.title} clipe oficial`);
      if (!results || results.length === 0) {
        results = await searchYouTubeGeneral(`${song.artist} ${song.title} official music video`);
      }
      if (!results || results.length === 0) {
        clearBackoff(song.id);
        markUnavailable(song.id);
        return { status: "unavailable" };
      }

      const artistN = norm(song.artist);
      const titleN = norm(song.title);
      const titleTokens = titleN.split(" ").filter((t) => t.length > 1);

      const scoreResult = (v: any) => {
        const t = norm(v.title || "");
        const ch = norm(v.channel || "");
        const matchedTokens = titleTokens.filter((tok) => t.includes(tok)).length;
        const titleScore = titleTokens.length > 0 ? matchedTokens / titleTokens.length : 0;
        const artistMatch = artistN
          ? (t.includes(artistN) || ch.includes(artistN) ? 1 : 0)
          : 0.5;
        const clipBonus = /vevo|official.*(video|music)|music\s*video|videoclip|clipe|ao vivo|live|acustico|acústico/.test(ch + " " + t) ? 0.5 : 0;
        const audioPenalty = /(karaoke|slowed|sped up|nightcore|8d|cover version)/.test(t) ? -0.6 : 0;
        return titleScore * 1.2 + artistMatch * 0.8 + clipBonus + audioPenalty;
      };

      const ranked = results
        .filter((v: any) => v.videoId && !isCoverOnly(v))
        .map((v: any) => ({ v, score: scoreResult(v) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      clearBackoff(song.id);
      // Limiar rigoroso: 1.1 (recuperado). Abaixo → não há clipe real
      // confiável, então marca indisponível para esconder o botão.
      if (best && best.score >= 1.1) {
        markAvailable(song.id, best.v.videoId);
        return { status: "available", videoId: best.v.videoId };
      }
      markUnavailable(song.id);
      return { status: "unavailable" };
    } catch {
      // Erro de rede: backoff, NUNCA marca indisponível permanentemente.
      scheduleBackoff(song.id);
      return { status: "unknown" };
    } finally {
      inflight.delete(song.id);
    }
  })();

  inflight.set(song.id, run);
  return run;
}

/* ============================ Recarga manual do clipe ============================ */
// Cache em memória da lista ranqueada por songId. Usado pelo botão "recarregar"
// no modo Vídeo do Xerife Music para trocar o clipe atual pelo próximo
// candidato instantaneamente (<200ms) sem nova chamada de rede.
type Candidate = { videoId: string; title: string; channel: string; thumbnail: string; score: number };
const rankedCache = new Map<string, Candidate[]>();

function buildRanked(results: any[], song: Pick<Song, "title" | "artist">): Candidate[] {
  const artistN = norm(song.artist);
  const titleN = norm(song.title);
  const titleTokens = titleN.split(" ").filter((t) => t.length > 1);
  const score = (v: any) => {
    const t = norm(v.title || "");
    const ch = norm(v.channel || "");
    const matched = titleTokens.filter((tok) => t.includes(tok)).length;
    const titleScore = titleTokens.length > 0 ? matched / titleTokens.length : 0;
    const artistMatch = artistN ? (t.includes(artistN) || ch.includes(artistN) ? 1 : 0) : 0.5;
    const clipBonus = /vevo|official.*(video|music)|music\s*video|videoclip|clipe|ao vivo|live|acustico|acústico/.test(ch + " " + t) ? 0.5 : 0;
    const audioPenalty = /(karaoke|slowed|sped up|nightcore|8d|cover version)/.test(t) ? -0.6 : 0;
    return titleScore * 1.2 + artistMatch * 0.8 + clipBonus + audioPenalty;
  };
  return (results || [])
    .filter((v: any) => v.videoId && !isCoverOnly(v))
    .map((v: any) => ({
      videoId: v.videoId,
      title: v.title || "",
      channel: v.channel || "",
      thumbnail: v.thumbnail || "",
      score: score(v),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Encontra um clipe ALTERNATIVO, sem reiniciar a UX:
 *   - `fresh: false` → próximo candidato do ranking em cache (instantâneo).
 *     Se o cache está vazio, faz 1 busca e usa-a.
 *   - `fresh: true`  → refaz a busca ignorando cache e devolve o melhor
 *     candidato que não esteja em `excludeIds`.
 */
export async function findAlternativeClip(
  song: Pick<Song, "id" | "title" | "artist">,
  excludeIds: string[] = [],
  opts: { fresh?: boolean } = {}
): Promise<Availability> {
  const exclude = new Set(excludeIds.filter(Boolean));
  const { searchYouTubeGeneral } = await import("@/lib/youtubeGeneralSearch");

  let ranked = rankedCache.get(song.id);
  if (opts.fresh || !ranked || ranked.length === 0) {
    try {
      let results = await searchYouTubeGeneral(
        `${song.artist} ${song.title} clipe oficial`,
        opts.fresh ? { noCache: true, fresh: true } : undefined
      );
      if (!results || results.length === 0) {
        results = await searchYouTubeGeneral(
          `${song.artist} ${song.title} official music video`,
          opts.fresh ? { noCache: true, fresh: true } : undefined
        );
      }
      ranked = buildRanked(results || [], song);
      rankedCache.set(song.id, ranked);
    } catch {
      return { status: "unknown" };
    }
  }

  const next = ranked.find((c) => !exclude.has(c.videoId) && c.score >= 0.6);
  if (!next) return { status: "unavailable" };
  markAvailable(song.id, next.videoId);
  return { status: "available", videoId: next.videoId };
}
