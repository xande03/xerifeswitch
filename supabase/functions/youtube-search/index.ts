// YouTube Search Edge Function - redeploy 2026-04-16
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchResult {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  type?: "music" | "video";
  source?: "ytmusic" | "web";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Rate limit: 20 requests per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 40, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const query = url.searchParams.get("q");
    const filter = url.searchParams.get("filter") || "all";

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side cache: same query+filter shares results across users for 5 min
    const cacheKey = `search:${query.toLowerCase().trim()}:${filter}`;
    const searchResults = await cachedFetch(cacheKey, () => searchYouTube(query, filter), { ttlMs: 5 * 60 * 1000 });

    return new Response(JSON.stringify({ results: searchResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Search error:", error);
    return new Response(
      JSON.stringify({ error: "Search failed", results: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── YouTube Music (WEB_REMIX): o catálogo de MÚSICA de verdade ──────────────
// Verificado da própria borda em 2026-09-23: com clientVersion recente e o
// param de "songs", o WEB_REMIX devolve musicResponsiveListItemRenderer COM
// videoId, capa quadrada, artista e álbum — faixa de estúdio primeiro, sem
// DVD/drum-cam/ensaio/vlog. (O comentário antigo dizendo que o WEB_REMIX
// "parou de devolver videoId" estava desatualizado.)
const WEB_REMIX_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const WEB_REMIX_SONGS_PARAMS = "EgWKAQIIAWgKEAkQBRAJEAoQBg%3D%3D";

function remixRawRuns(col: any): string[] {
  return ((col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []) as any[])
    .map((r) => String(r?.text || ""));
}

/** Divide os runs em campos pelo separador " • " (com espaços); dentro de um
 * campo os fragmentos são concatenados crus — preserva " e " / ", " entre
 * artistas (ex.: ['Isaias Saad',' e ','Débora Buzas'] → "Isaias Saad e Débora Buzas"). */
function remixFields(col: any): string[] {
  const fields: string[] = [];
  let cur = "";
  for (const t of remixRawRuns(col)) {
    if (t.trim() === "•") {
      if (cur.trim()) fields.push(cur.trim());
      cur = "";
    } else if (t.trim() !== "") {
      cur += t;
    }
  }
  if (cur.trim()) fields.push(cur.trim());
  return fields;
}

function parseClock(t: string): number {
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t || "")) return 0;
  const p = t.split(":").map((x) => parseInt(x, 10));
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

function parseRemixSongs(data: any): SearchResult[] {
  const items = collectByKey(data, "musicResponsiveListItemRenderer");
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const videoId =
      it?.playlistItemData?.videoId ||
      collectByKey(it, "watchEndpoint")[0]?.videoId;
    if (!videoId || seen.has(videoId)) continue;
    const cols = it?.flexColumns || [];
    const title = remixFields(cols[0]).join(" • ");
    if (!title) continue;
    const byline = remixFields(cols[1]);
    let durTxt = "";
    if (byline.length && /^\d{1,2}(:\d{2}){1,2}$/.test(byline[byline.length - 1])) {
      durTxt = byline.pop() as string;
    }
    const artist =
      (byline.shift() || "Desconhecido").replace(/\s*-\s*Topic$/i, "").trim() ||
      "Desconhecido";
    const album = byline.join(" • ").trim() || title;
    const thumbs =
      it?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const cover = (thumbs[thumbs.length - 1]?.url || "").replace(/^\/\//, "https://");
    seen.add(videoId);
    out.push({
      id: `yt-${videoId}`,
      youtubeId: videoId,
      title,
      artist,
      album,
      cover: cover || "/placeholder.svg",
      duration: parseClock(durTxt),
      type: "music",
      source: "ytmusic",
    });
    if (out.length >= 20) break;
  }
  return out;
}

async function searchYouTubeMusicRemix(query: string): Promise<SearchResult[]> {
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20250901.01.00",
        hl: "pt",
        gl: "BR",
      },
    },
    query,
    params: WEB_REMIX_SONGS_PARAMS,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://music.youtube.com/youtubei/v1/search?key=${WEB_REMIX_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          Origin: "https://music.youtube.com",
          Referer: "https://music.youtube.com/",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      console.error("WEB_REMIX search HTTP", response.status);
      return [];
    }
    const data = await response.json();
    return parseRemixSongs(data);
  } catch (e) {
    console.error("WEB_REMIX search error:", e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchYouTube(query: string, filter: string): Promise<SearchResult[]> {
  // Alse Music (songs/all): tenta PRIMEIRO o catálogo do YouTube Music
  // (faixas reais, com álbum). Se o WEB_REMIX falhar/esvaziar, cai no
  // Innertube WEB + heurística "parece música" abaixo.
  const wantsSongs = filter === "songs" || filter === "all";
  if (wantsSongs) {
    const remix = await searchYouTubeMusicRemix(query);
    if (remix.length > 0) return remix;
  }

  const body: any = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240101.00.00",
        hl: "pt",
        gl: "BR",
      },
    },
    query,
  };
  // Filtro de vídeos (protobuf {field 1: 1}) — melhora precisão p/ "songs"
  if (wantsSongs) body.params = "EgIQAQ%3D%3D";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      console.error("YouTube (WEB innertube) API error:", response.status);
      return [];
    }

    const data = await response.json();
    return parseWebSearchResults(data, wantsSongs);
  } catch (e) {
    console.error("YouTube search fetch error:", e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Extrai recursivamente todos os objetos com uma chave específica. */
function collectByKey(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const item of obj) collectByKey(item, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) out.push(v);
    else collectByKey(v, key, out);
  }
  return out;
}

function parseDurationToSeconds(text: string): number {
  if (!text) return 0;
  const parts = String(text).split(":").map((x) => parseInt(x, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Converte videoRenderer do Innertube WEB em SearchResult (formato Song do
 * frontend). `album` recebe o título (mesmo comportamento do fallback
 * Invidious antigo — o app trata album como "detalhe" exibido ao usuário).
 */
// ── Filtro "parece música" (mesma heurística do client, aplicada na borda) ──
// O Innertube WEB pesquisa o YouTube GERAL; para filter=songs (Alse Music)
// removemos/priorizamos por padrões de título, canal "- Topic" e duração.
const MUSIC_NEG_RE = /(gameplay|\bvlogs?\b|filme completo|document[áa]rio|epis[óo]dio|cap[íi]tulo|rea[çc][ãa]o|reaction|\breact\b|tutorial|\baula[s]?\b|curso completo|trailer|unboxing|podcast|entrevista|transmiss[ãa]o|campeonato|futebol|not[íi]cias|coletiva|live stream|\basmr\b|speedrun|walkthrough|parte \d+|compilado de|melhores momentos|\bao vivo\b|\bdvd\b|drum cam|playthrough|ensaio|ministra[çc][ãa]o|show completo|making of|backstage)/i;
const MUSIC_POS_RE = /(official|oficial|\baudio\b|\báudio\b|lyric|letra|clipe|\bclip\b|\bmv\b|music video|v[íi]deo oficial|remix|\bcover\b|acoustic|ac[úu]stico|visualizer|live session|\bsingle\b|\bep\b|faixa|bastidores do clipe)/i;

function musicScore(title: string, owner: string, durSec: number): number {
  const hay = `${title} ${owner}`;
  let s = 0;
  if (MUSIC_NEG_RE.test(hay)) s -= 3;
  if (MUSIC_POS_RE.test(hay)) s += 2;
  if (/-\s*Topic$/i.test(owner)) s += 3;
  if (durSec > 1500) s -= 2;
  else if (durSec > 0 && durSec <= 600) s += 1;
  return s;
}

function parseWebSearchResults(data: any, wantsSongs = false): SearchResult[] {
  const renderers = collectByKey(data, "videoRenderer");
  const results: SearchResult[] = [];
  const scores: number[] = [];
  const seen = new Set<string>();

  for (const r of renderers) {
    const videoId = r?.videoId;
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

    const title =
      r.title?.runs?.map((x: any) => x.text).join("") ||
      r.title?.simpleText || "";
    if (!title) continue;

    const ownerRun =
      r.ownerText?.runs?.[0] || r.shortBylineText?.runs?.[0] || r.longBylineText?.runs?.[0];
    const ownerRaw = ownerRun?.text || "";
    const artist = ownerRaw || "Desconhecido";

    const thumbs = r.thumbnail?.thumbnails || [];
    const cover = (thumbs[thumbs.length - 1]?.url || "").replace(/^\/\//, "https://");

    const durationText = r.lengthText?.simpleText || "";

    const durSec = parseDurationToSeconds(durationText);
    results.push({
      id: `yt-${videoId}`,
      youtubeId: videoId,
      title: cleanTitle(title),
      artist: artist.replace(/\s*-\s*Topic$/i, "").trim() || "Desconhecido",
      album: cleanTitle(title),
      cover: cover.startsWith("//") ? `https:${cover}` : cover,
      duration: durSec,
    });
    scores.push(musicScore(title, ownerRaw, durSec));
    if (results.length >= 20) break;
  }
  if (!wantsSongs) return results;
  // Alse Music: corta claramente não-musicais (com folga p/ nunca esvaziar)
  // e prioriza faixas prováveis (Topic/oficial/curtas).
  const idx = results.map((_, i) => i);
  const kept = idx.filter((i) => scores[i] > -3);
  const base = kept.length >= 4 ? kept : idx;
  return [...base].sort((a, b) => scores[b] - scores[a]).map((i) => results[i]);
}

function cleanTitle(title: string): string {
  // Remove common suffixes like (Official Music Video), [Lyrics], etc.
  return title
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, "")
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, "")
    .replace(/\s*\(Lyrics?\)/gi, "")
    .replace(/\s*\[Lyrics?\]/gi, "")
    .replace(/\s*\(Audio\)/gi, "")
    .replace(/\s*\[Audio\]/gi, "")
    .replace(/\s*\(Clipe Oficial\)/gi, "")
    .trim();
}
