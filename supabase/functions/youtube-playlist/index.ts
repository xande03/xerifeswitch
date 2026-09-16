import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { parseVideoItemsList, type RelatedVideoLite } from "../_shared/innertubeRelated.ts";

/**
 * youtube-playlist — título, capa e faixas de playlists públicas do YouTube.
 *
 * Estratégia (validada contra o YouTube real em 2026-09):
 * 1. Cliente WEB com browseId="VL<id>" → páginas de playlist do YouTube.
 *    Os itens chegam como `lockupViewModel` dentro de `itemSectionRenderer`
 *    (formato atual) — `playlistVideoListRenderer`/`playlistVideoRenderer`
 *    são mantidos como legado. Paginação via `continuationItemRenderer`.
 * 2. Cliente WEB_REMIX (YouTube Music) → álbuns/playlists só de música
 *    (browseIds MPREb…/OLAK5uy_…), com shelf `musicPlaylistShelfRenderer`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YT_MUSIC_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_TRACKS = 500;
const DEFAULT_MAX_PAGES = 5;

interface ParsedTrack {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
}

interface CollectResult {
  title: string;
  cover: string;
  tracks: ParsedTrack[];
  truncated: boolean;
  source: "web" | "music";
}

async function innertubeBrowse(client: "WEB" | "WEB_REMIX", payload: Record<string, unknown>) {
  const clientName = client === "WEB" ? "WEB" : "WEB_REMIX";
  const clientVersion = client === "WEB" ? "2.20231204.01.00" : "1.20231204.01.00";
  const base = client === "WEB" ? "https://www.youtube.com" : "https://music.youtube.com";

  const res = await fetch(`${base}/youtubei/v1/browse?alt=json&key=${YT_MUSIC_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: base,
      Referer: `${base}/`,
    },
    body: JSON.stringify({
      context: { client: { clientName, clientVersion, hl: "pt", gl: "BR" } },
      ...payload,
    }),
  });
  if (!res.ok) throw new Error(`browse ${client} falhou: ${res.status}`);
  return await res.json();
}

function thumbUrl(thumbnails: any[]): string {
  const sorted = [...(thumbnails || [])].sort(
    (a: any, b: any) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
  );
  let url = sorted[0]?.url || "";
  if (url.startsWith("//")) url = `https:${url}`;
  return url;
}

function toTrack(v: RelatedVideoLite): ParsedTrack {
  return {
    id: `yt-${v.videoId}`,
    youtubeId: v.videoId,
    title: v.title,
    artist: v.channel || "Desconhecido",
    cover: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    duration: v.lengthSeconds || 0,
  };
}

function continuationToken(item: any): string | null {
  return (
    item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
    item?.continuationItemRenderer?.button?.buttonRenderer?.command?.continuationCommand?.token ||
    null
  );
}

/* ------------------------- WEB (página de playlist) ------------------------ */

/** Itens de vídeo + token de continuação de uma página de playlist WEB. */
function collectWebPage(data: any): { items: any[]; continuation: string | null } {
  const sections =
    data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents || [];
  const items: any[] = [];
  let continuation: string | null = null;

  for (const section of sections) {
    const isl = section?.itemSectionRenderer?.contents;
    if (Array.isArray(isl)) {
      for (const c of isl) {
        const legacy = c?.playlistVideoListRenderer?.contents;
        if (Array.isArray(legacy)) {
          items.push(...legacy);
          for (const l of legacy) {
            const tok = continuationToken(l);
            if (tok) continuation = continuation || tok;
          }
        } else {
          items.push(c);
        }
        const tokInner = continuationToken(c);
        if (tokInner) continuation = continuation || tokInner;
      }
    }
    const tok = continuationToken(section);
    if (tok) continuation = continuation || tok;
  }
  return { items, continuation };
}

function collectWebContinuationPage(data: any): { items: any[]; continuation: string | null } {
  const actions = data?.onResponseReceivedActions || data?.onResponseReceivedEndpoints || [];
  const items: any[] = [];
  let continuation: string | null = null;
  for (const a of actions) {
    const arr = a?.appendContinuationItemsAction?.continuationItems;
    if (Array.isArray(arr)) items.push(...arr);
  }
  for (const c of items) {
    const tok = continuationToken(c);
    if (tok) continuation = continuation || tok;
  }
  return { items, continuation };
}

function webPageMeta(data: any): { title: string; cover: string } {
  const title =
    data?.header?.playlistHeaderRenderer?.title?.simpleText ||
    data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.title?.dynamicTextViewModel
      ?.text?.content ||
    data?.microformat?.microformatDataRenderer?.title ||
    "";
  const cover =
    thumbUrl(data?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails) ||
    thumbUrl(
      data?.header?.playlistHeaderRenderer?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer
        ?.thumbnail?.thumbnails,
    );
  return { title, cover };
}

/* ---------------------- WEB_REMIX (YouTube Music/álbuns) ------------------- */

function parseMusicItem(item: any, fallbackCover: string): ParsedTrack | null {
  const r = item?.musicResponsiveListItemRenderer;
  if (!r) return null;
  const flex = r.flexColumns || [];
  const title = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "";
  const secondRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const artist =
    secondRuns
      .filter((x: any) => x?.text && !["•", " • "].includes(x.text.trim()))
      .map((x: any) => x.text.trim())
      .filter(
        (t: string) =>
          !/^\d{1,2}:\d{2}/.test(t) &&
          !["Música", "Song", "Vídeo", "Video", "Álbum", "Album"].includes(t),
      )
      .join(", ") || "Desconhecido";

  let videoId =
    r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId || "";
  if (!videoId) {
    videoId =
      flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint
        ?.watchEndpoint?.videoId ||
      r?.playlistItemData?.videoId ||
      "";
  }
  if (!title || !videoId) return null;

  let cover = thumbUrl(r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails);
  if (!cover) cover = fallbackCover || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  let duration = 0;
  for (const fc of r.fixedColumns || []) {
    const text = fc?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || "";
    if (/^\d{1,2}(:\d{2}){1,2}$/.test(text.trim())) {
      const segs = text.trim().split(":").map(Number);
      duration = segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1];
      break;
    }
  }
  if (!duration) {
    for (const run of secondRuns) {
      const text = run?.text?.trim();
      if (text && /^\d{1,2}(:\d{2}){1,2}$/.test(text)) {
        const segs = text.split(":").map(Number);
        duration = segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1];
        break;
      }
    }
  }
  return { id: `yt-${videoId}`, youtubeId: videoId, title, artist, cover, duration };
}

function musicPageMeta(data: any): { title: string; cover: string } {
  const title =
    data?.header?.musicDetailHeaderRenderer?.title?.runs?.[0]?.text ||
    data?.header?.musicImmersiveHeaderRenderer?.title?.runs?.[0]?.text ||
    data?.header?.musicHeaderRenderer?.title?.runs?.[0]?.text ||
    "";
  const cover =
    thumbUrl(
      data?.header?.musicDetailHeaderRenderer?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail
        ?.thumbnails,
    ) ||
    thumbUrl(
      data?.header?.musicImmersiveHeaderRenderer?.thumbnail?.musicThumbnailRenderer?.thumbnail
        ?.thumbnails,
    );
  return { title, cover };
}

function collectMusicPage(data: any): { items: any[]; shelfContinuation: string | null } {
  const browse =
    data?.contents?.twoColumnBrowseResultsRenderer || data?.contents?.singleColumnBrowseResultsRenderer;
  const tabContent = browse?.tabs?.[0]?.tabRenderer?.content;
  const sections = tabContent?.sectionListRenderer?.contents || [];

  let shelf = tabContent?.musicPlaylistShelfRenderer || tabContent?.musicShelfRenderer || null;
  if (!shelf) {
    for (const s of sections) {
      shelf = s?.musicPlaylistShelfRenderer || s?.musicShelfRenderer || null;
      if (shelf) break;
    }
  }

  const contents: any[] = shelf?.contents || [];
  const items: any[] = [];
  let continuation: string | null =
    shelf?.continuations?.[0]?.nextContinuationData?.continuation || null;
  for (const c of contents) {
    items.push(c);
    const tok = continuationToken(c);
    if (tok) continuation = continuation || tok;
  }
  return { items, shelfContinuation: continuation };
}

function collectMusicContinuationPage(data: any): { items: any[]; continuation: string | null } {
  const cont =
    data?.continuationContents?.musicPlaylistShelfContinuation ||
    data?.continuationContents?.musicShelfContinuation;
  const items: any[] = cont?.contents || [];
  let continuation = cont?.continuations?.[0]?.nextContinuationData?.continuation || null;
  for (const c of items) {
    const tok = continuationToken(c);
    if (tok) continuation = continuation || tok;
  }
  return { items, continuation };
}

/* -------------------------------- Coletores ------------------------------- */

async function collectWeb(playlistId: string, maxPages: number): Promise<CollectResult> {
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  const first = await innertubeBrowse("WEB", { browseId });

  const meta = webPageMeta(first);
  let { items, continuation } = collectWebPage(first);

  const seen = new Set<string>();
  const tracks: ParsedTrack[] = [];
  const push = (t: ParsedTrack) => {
    if (tracks.length >= MAX_TRACKS || seen.has(t.youtubeId)) return;
    seen.add(t.youtubeId);
    tracks.push(t);
  };
  for (const v of parseVideoItemsList(items, MAX_TRACKS)) push(toTrack(v));

  let pages = 1;
  let truncated = false;
  while (continuation && pages < maxPages && tracks.length < MAX_TRACKS) {
    const data = await innertubeBrowse("WEB", { continuation });
    const next = collectWebContinuationPage(data);
    const before = tracks.length;
    for (const v of parseVideoItemsList(next.items, MAX_TRACKS)) push(toTrack(v));
    continuation = next.continuation;
    pages++;
    if (tracks.length === before && next.items.length === 0) break;
  }
  if (continuation && (pages >= maxPages || tracks.length >= MAX_TRACKS)) truncated = true;

  const cover = meta.cover || tracks[0]?.cover || "";
  return { title: meta.title, cover, tracks, truncated, source: "web" };
}

async function collectMusic(playlistId: string, maxPages: number): Promise<CollectResult> {
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  const first = await innertubeBrowse("WEB_REMIX", { browseId });

  const meta = musicPageMeta(first);
  const { items, shelfContinuation } = collectMusicPage(first);

  const seen = new Set<string>();
  const tracks: ParsedTrack[] = [];
  const push = (t: ParsedTrack | null) => {
    if (!t || tracks.length >= MAX_TRACKS || seen.has(t.youtubeId)) return;
    seen.add(t.youtubeId);
    tracks.push(t);
  };
  for (const item of items) {
    push(parseMusicItem(item, meta.cover));
  }
  // Defesa: se a shelf já vier como lockups (migração em curso do YouTube),
  // o parser genérico também cobre.
  if (tracks.length === 0) {
    for (const v of parseVideoItemsList(items, MAX_TRACKS)) push(toTrack(v));
  }

  let pages = 1;
  let truncated = false;
  let continuation = shelfContinuation;
  while (continuation && pages < maxPages && tracks.length < MAX_TRACKS) {
    const data = await innertubeBrowse("WEB_REMIX", { continuation });
    const next = collectMusicContinuationPage(data);
    const before = tracks.length;
    for (const item of next.items) push(parseMusicItem(item, meta.cover));
    if (tracks.length === before) {
      for (const v of parseVideoItemsList(next.items, MAX_TRACKS)) push(toTrack(v));
    }
    continuation = next.continuation;
    pages++;
    if (tracks.length === before && next.items.length === 0) break;
  }
  if (continuation && (pages >= maxPages || tracks.length >= MAX_TRACKS)) truncated = true;

  const cover = meta.cover || tracks[0]?.cover || "";
  return { title: meta.title, cover, tracks, truncated, source: "music" };
}

/* --------------------------------- Handler -------------------------------- */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 15, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const url = new URL(req.url);
    let playlistId = url.searchParams.get("playlistId") || url.searchParams.get("id") || "";
    let maxPages = Number(url.searchParams.get("maxPages"));
    if (req.method === "POST") {
      try {
        const body = await req.json();
        playlistId = playlistId || String(body?.playlistId || body?.id || "");
        if (!maxPages && body?.maxPages) maxPages = Number(body.maxPages);
      } catch { /* body vazio → ok */ }
    }
    if (!Number.isFinite(maxPages) || maxPages <= 0) maxPages = DEFAULT_MAX_PAGES;
    maxPages = Math.min(maxPages, 10);

    if (!/^[A-Za-z0-9_-]{6,}$/.test(playlistId)) {
      return new Response(JSON.stringify({ error: "Missing or invalid playlistId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) WEB: cobre playlists públicas do YouTube (PL/UU/LL/RD/OL…)
    let result: CollectResult | null = null;
    try {
      result = await collectWeb(playlistId, maxPages);
      if (!result.tracks.length) result = null;
    } catch (e) {
      console.warn("youtube-playlist WEB falhou:", e);
      result = null;
    }

    // 2) WEB_REMIX: álbuns/playlists exclusivas do YouTube Music
    if (!result) {
      try {
        result = await collectMusic(playlistId, maxPages);
        if (!result.tracks.length) result = null;
      } catch (e) {
        console.warn("youtube-playlist WEB_REMIX falhou:", e);
        result = null;
      }
    }

    if (!result) {
      return new Response(JSON.stringify({ error: "Playlist not found or empty", tracks: [] }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        title: result.title || "Playlist do YouTube",
        listId: playlistId,
        cover: result.cover || "",
        count: result.tracks.length,
        truncated: result.truncated,
        source: result.source,
        tracks: result.tracks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("youtube-playlist error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch playlist", tracks: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
