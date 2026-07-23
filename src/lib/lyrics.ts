import { supabase } from "@/integrations/supabase/client";
import { getStoredLyrics, setStoredLyrics, removeStoredLyrics } from "@/lib/lyricsStorage";



export interface LyricLine {
  time: number; // seconds, -1 if unsynced
  text: string;
}

export interface LyricsResult {
  lines: LyricLine[];
  synced: boolean;
}

const lyricsCache = new Map<string, LyricsResult | null>();

/** Parse LRC format: [mm:ss.xx] text (também aceita minutos com 3+ dígitos) */
function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    // Suporta múltiplas timestamps na mesma linha ([00:12.34][00:14.56] texto)
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) continue;
    for (const m of stamps) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const msStr = (m[3] || "0").padEnd(3, "0").slice(0, 3);
      const ms = parseInt(msStr, 10);
      lines.push({ time: mins * 60 + secs + ms / 1000, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function parsePlain(text: string): LyricLine[] {
  return text.split("\n").filter((l) => l.trim()).map((l) => ({ time: -1, text: l.trim() }));
}

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove sufixos comuns de vídeos: "(Official Video)", "[Lyrics]", "feat. X", "- Remaster" etc. */
function cleanTitle(title: string): string {
  return title
    .replace(/\((?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video)[^)]*\)/gi, "")
    .replace(/\[(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video)[^\]]*\]/gi, "")
    .replace(/(?:^|\s)(?:ft\.?|feat\.?|featuring)\s+[^-–—(\[]+/gi, "")
    .replace(/[-–—]\s*(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video).*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanArtist(artist: string): string {
  return artist
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*official$/i, "")
    .replace(/\s*channel$/i, "")
    .trim();
}

interface LrclibParams {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
}

async function lrclibGet({ artist, title, album, duration }: LrclibParams): Promise<LyricsResult | null> {
  const params: Record<string, string> = {
    artist_name: artist,
    track_name: title,
  };
  if (album) params.album_name = album;
  if (duration && duration > 0) params.duration = String(Math.round(duration));

  try {
    const res = await fetch(`https://lrclib.net/api/get?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.syncedLyrics) {
      const lines = parseLRC(data.syncedLyrics);
      if (lines.length > 0) return { lines, synced: true };
    }
    if (data?.plainLyrics) {
      const lines = parsePlain(data.plainLyrics);
      if (lines.length > 0) return { lines, synced: false };
    }
    return null;
  } catch {
    return null;
  }
}

async function lrclibSearch(query: string, artistHint: string, titleHint: string): Promise<LyricsResult | null> {
  try {
    const res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: query })}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const normArtist = normalizeSearch(artistHint);
    const normTitle = normalizeSearch(titleHint);
    const artistTokens = normArtist.split(" ").filter(Boolean);
    const titleTokens = normTitle.split(" ").filter(Boolean);

    // Score cada resultado por match de tokens (e prioriza synced)
    const scored = results
      .map((r: any) => {
        const rArtist = normalizeSearch(r.artistName || "");
        const rTitle = normalizeSearch(r.trackName || "");
        let score = 0;
        for (const t of artistTokens) if (t.length > 1 && rArtist.includes(t)) score += 2;
        for (const t of titleTokens) if (t.length > 1 && rTitle.includes(t)) score += 3;
        if (r.syncedLyrics) score += 10;
        if (r.plainLyrics) score += 3;
        return { r, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.r;
    if (!best) return null;
    if (best.syncedLyrics) {
      const lines = parseLRC(best.syncedLyrics);
      if (lines.length > 0) return { lines, synced: true };
    }
    if (best.plainLyrics) {
      const lines = parsePlain(best.plainLyrics);
      if (lines.length > 0) return { lines, synced: false };
    }
    return null;
  } catch {
    return null;
  }
}

/** Fallbacks públicos client-side (plain) — usados só se LRCLIB não voltar nada */
async function fetchFromLyrist(artist: string, title: string): Promise<LyricsResult | null> {
  if (!title) return null;
  try {
    const url = artist
      ? `https://lyrist.vercel.app/api/${encodeURIComponent(title)}/${encodeURIComponent(artist)}`
      : `https://lyrist.vercel.app/api/${encodeURIComponent(title)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.lyrics) return { lines: parsePlain(String(data.lyrics)), synced: false };
  } catch {}
  return null;
}

async function fetchFromSomeRandomApi(artist: string, title: string): Promise<LyricsResult | null> {
  if (!title) return null;
  try {
    const q = [artist, title].filter(Boolean).join(" ").trim();
    const res = await fetch(`https://some-random-api.com/others/lyrics?title=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.lyrics) return { lines: parsePlain(String(data.lyrics)), synced: false };
  } catch {}
  return null;
}

async function fetchFromLyricsOvh(artist: string, title: string): Promise<LyricsResult | null> {
  if (!artist || !title) return null;
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.lyrics) return { lines: parsePlain(String(data.lyrics)), synced: false };
  } catch {}
  return null;
}

async function fetchFromLRCLIB(artist: string, title: string, album?: string, duration?: number): Promise<LyricsResult | null> {
  if (!title) return null;

  // Se temos artista, priorizamos /get (match exato)
  if (artist) {
    const exact = await lrclibGet({ artist, title, album, duration });
    if (exact?.synced) return exact;
    if (album || duration) {
      const relaxed = await lrclibGet({ artist, title });
      if (relaxed?.synced) return relaxed;
      if (relaxed && !exact) return relaxed;
    }
    if (exact) return exact;

    const searched = await lrclibSearch(`${artist} ${title}`, artist, title);
    if (searched) return searched;
  }

  // /search só com título — útil quando o "artista" veio de um canal do YouTube
  const titleOnly = await lrclibSearch(title, artist, title);
  if (titleOnly) return titleOnly;

  return null;
}


export async function fetchLyrics(
  artist: string,
  title: string,
  opts: { album?: string; duration?: number; skipCache?: boolean } = {}
): Promise<LyricsResult | null> {
  const cleanedArtist = cleanArtist(artist || "");
  const cleanedTitle = cleanTitle(title || "");
  const cacheKey = `${cleanedArtist}::${cleanedTitle}::${opts.album || ""}`;

  if (!opts.skipCache) {
    if (lyricsCache.has(cacheKey)) return lyricsCache.get(cacheKey)!;
    // Persistent (localStorage) cache — sobrevive entre sessões e evita re-chamar a API
    const persisted = getStoredLyrics(cacheKey);
    if (persisted !== undefined) {
      lyricsCache.set(cacheKey, persisted);
      return persisted;
    }
  }


  // Estratégia: acumular o MELHOR resultado (prefere sempre synced) através
  // de múltiplas fontes e variações antes de desistir.
  let best: LyricsResult | null = null;
  const consider = (r: LyricsResult | null) => {
    if (!r || r.lines.length === 0) return;
    if (!best) { best = r; return; }
    // synced supera não sincronizada; entre iguais, mantém a com mais linhas
    if (r.synced && !best.synced) { best = r; return; }
    if (r.synced === best.synced && r.lines.length > best.lines.length) best = r;
  };

  // 1) Edge Function (agenda várias estratégias no backend)
  try {
    const { data, error } = await supabase.functions.invoke("fetch-lyrics", {
      body: { artist: cleanedArtist, title: cleanedTitle, album: opts.album, duration: opts.duration },
    });
    if (!error && data?.lyrics) {
      consider(data.synced
        ? { lines: parseLRC(data.lyrics), synced: true }
        : { lines: parsePlain(data.lyrics), synced: false });
    }
  } catch { /* fall through */ }

  // 2) LRCLIB direto (client-side) — só se ainda não temos synced
  if (!best || !best.synced) {
    consider(await fetchFromLRCLIB(cleanedArtist, cleanedTitle, opts.album, opts.duration));
  }

  // 3) Artista principal (remove feat./ft./com)
  const mainArtist = cleanedArtist.split(/[,&\/]|feat\.?|ft\.?|com\s+/i)[0].trim();
  if ((!best || !best.synced) && mainArtist && mainArtist !== cleanedArtist) {
    consider(await fetchFromLRCLIB(mainArtist, cleanedTitle, undefined, opts.duration));
  }

  // 4) Título sem parênteses/colchetes
  const strippedTitle = cleanedTitle.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim();
  if ((!best || !best.synced) && strippedTitle && strippedTitle !== cleanedTitle) {
    consider(await fetchFromLRCLIB(mainArtist || cleanedArtist, strippedTitle, undefined, opts.duration));
  }

  // 5) Última tentativa LRCLIB: apenas o título (útil quando o canal não bate com o artista real)
  if (!best || !best.synced) {
    consider(await fetchFromLRCLIB("", strippedTitle || cleanedTitle));
  }

  // 6) Fallbacks públicos plain (nunca synced) quando ainda estamos sem nada
  if (!best) {
    consider(await fetchFromLyrist(mainArtist || cleanedArtist, strippedTitle || cleanedTitle));
  }
  if (!best) {
    consider(await fetchFromSomeRandomApi(mainArtist || cleanedArtist, strippedTitle || cleanedTitle));
  }
  if (!best && (mainArtist || cleanedArtist)) {
    consider(await fetchFromLyricsOvh(mainArtist || cleanedArtist, strippedTitle || cleanedTitle));
  }

  lyricsCache.set(cacheKey, best);
  // Persiste em localStorage apenas quando encontrou algo — evita "poluir"
  // o cache com misses (permite retentar automaticamente na próxima sessão).
  if (best) setStoredLyrics(cacheKey, best);
  return best;
}


/** Limpa o cache de uma faixa para permitir retry manual */
export function invalidateLyricsCache(artist: string, title: string, album?: string) {
  const cleanedArtist = cleanArtist(artist || "");
  const cleanedTitle = cleanTitle(title || "");
  const cacheKey = `${cleanedArtist}::${cleanedTitle}::${album || ""}`;
  lyricsCache.delete(cacheKey);
  removeStoredLyrics(cacheKey);
}

