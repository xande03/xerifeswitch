import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VideoResult {
  videoId: string;
  title: string;
  channel: string;
  channelId?: string;
  channelUrl?: string;
  channelThumbnail: string;
  thumbnail: string;
  duration: string;
  views: string;
  publishedTime: string;
  lengthSeconds: number;
  description: string;
  isLive?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Rate limit: 20 requests per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 100, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const query = url.searchParams.get("q");
    const sortByDate = url.searchParams.get("sort") === "date";
    // Variedade rotativa (parte 40): seed 0-3 alterna ordenação/filtro InnerTube
    // para a MESMA query retornar conjuntos diferentes por janela de rotação.
    const varietyRaw = parseInt(url.searchParams.get("variety") || "0", 10);
    const variety = isNaN(varietyRaw) ? 0 : ((varietyRaw % 4) + 4) % 4;
    const continuationToken = url.searchParams.get("continuation");
    const source = url.searchParams.get("source") === "channel" ? "channel" : "search";
    const channelId = normalizeChannelId(url.searchParams.get("channelId") || "");
    const channelName = url.searchParams.get("channelName") || query || "";
    const limitParam = parseInt(url.searchParams.get("limit") || "40", 10);
    const channelTab = url.searchParams.get("channelTab") || ""; // shorts | playlists | about
    const limit = Math.max(1, Math.min(100, isNaN(limitParam) ? 40 : limitParam));

    // Itens de uma playlist (Innertube WEB: browseId VL<id> → playlistVideoRenderer)
    // NÃO usar normalizeChannelId aqui: ids de playlist (PL..., ap..., RD...) não são UC ids
    const playlistId = (url.searchParams.get("playlistId") || "").trim();
    if (playlistId) {
      const items = await cachedFetch(
        `playlist-items-v3:${playlistId}`,
        () => fetchPlaylistVideos(playlistId),
        { ttlMs: 10 * 60 * 1000 }
      );
      return new Response(JSON.stringify(items), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Avatares de canais em lote (até 20 ids) — para logos nos feeds
    const avatarsParam = url.searchParams.get("channelAvatars") || "";
    if (avatarsParam) {
      const ids = avatarsParam.split(",").map((x) => normalizeChannelId(x.trim())).filter(Boolean).slice(0, 20);
      const entries = await Promise.all(
        ids.map(async (id) => {
          const url2 = await cachedFetch(
            `channel-avatar:${id}`,
            async () => {
              try {
                const body = {
                  context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "pt", gl: "BR" } },
                  browseId: id,
                };
                const res2 = await fetch(
                  "https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                  { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" }, body: JSON.stringify(body) }
                );
                if (!res2.ok) return "";
                const data2 = await res2.json();
                // 1º: avatar oficial do canal (metadata) → 2º: microformat → 3º: primeira URL yt3 do header
                const meta = data2?.metadata?.channelMetadataRenderer?.avatar?.thumbnails;
                if (Array.isArray(meta) && meta.length > 0 && typeof meta[meta.length - 1]?.url === "string") {
                  return meta[meta.length - 1].url;
                }
                const mf = data2?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails;
                if (Array.isArray(mf) && mf.length > 0 && typeof mf[mf.length - 1]?.url === "string") {
                  return mf[mf.length - 1].url;
                }
                const headerRaw = JSON.stringify(data2?.header || {});
                const found = (headerRaw.match(/yt3[^"]+/) || [""])[0].replace(/\\/g, "");
                return found ? `https://${found}` : "";
              } catch {
                return "";
              }
            },
            { ttlMs: 24 * 60 * 60 * 1000 }
          );
          return [id, typeof url2 === "string" ? url2 : ""];
        })
      );
      const avatars: Record<string, string> = {};
      for (const [id, u] of entries) if (u) avatars[id] = u;
      return new Response(JSON.stringify({ avatars }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Abas completas do canal (Shorts / Playlists / Sobre) via Innertube browse
    if (channelId && channelTab) {
      const tab = ["shorts", "playlists", "about"].includes(channelTab) ? channelTab : "";
      if (tab) {
        const data = await cachedFetch(
          `channel-tab:${tab}:${channelId}`,
          () => fetchChannelTab(channelId, tab as "shorts" | "playlists" | "about"),
          { ttlMs: 10 * 60 * 1000 }
        );
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!continuationToken && !channelId && (!query || query.length < 2)) {
      return new Response(JSON.stringify({ results: [], continuation: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Continuation requests bypass cache (usuário está paginando)
    if (continuationToken) {
      const page = await fetchContinuation(continuationToken, limit, source, channelId || undefined, channelName);
      return new Response(JSON.stringify(page), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (channelId) {
      const cacheKey = `channel:${channelId}:${limit}`;
      const page = await cachedFetch(cacheKey, () => fetchChannelVideos(channelId, limit, channelName), { ttlMs: 2 * 60 * 1000 });
      return new Response(JSON.stringify(page), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side cache: same query shares results across users
    // Optimized TTL: more aggressive for daily/recency searches
    const isDailySearch = query.toLowerCase().includes("podcast") || 
                         query.toLowerCase().includes("episódio") ||
                         query.toLowerCase().includes("novela") ||
                         query.toLowerCase().includes("jornal") ||
                         query.toLowerCase().includes("novo") ||
                         query.toLowerCase().includes("hoje") ||
                         sortByDate;
    
    const cacheKey = `general:v${variety}:${sortByDate ? "date:" : ""}${limit}:${(query as string).toLowerCase().trim()}`;
    const ttlMs = isDailySearch ? 2 * 60 * 1000 : 5 * 60 * 1000; // 2 min for daily, 5 min for others
    const page = await cachedFetch(cacheKey, () => performYouTubeSearch(query as string, sortByDate, limit, variety), { ttlMs });

    return new Response(JSON.stringify(page), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("General search error:", error);
    return new Response(
      JSON.stringify({ error: "Search failed", results: [], continuation: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface PageResult {
  results: VideoResult[];
  continuation: string | null;
}

async function searchYouTubeGeneral(query: string, sortByDate = false, limit = 40): Promise<PageResult> {
  // Cache strategy: ajustar TTL baseado no tipo de query
  const isDailyQuery = query.toLowerCase().includes("podcast") || 
                       query.toLowerCase().includes("episódio") ||
                       query.toLowerCase().includes("novela") ||
                       query.toLowerCase().includes("jornal") ||
                       sortByDate;
  
  // Daily/recency queries: TTL mais curto para captar uploads recentes
  const cacheKey = `search:${sortByDate ? "date:" : ""}${limit}:${query.toLowerCase().trim()}`;
  const ttlMs = isDailyQuery ? 2 * 60 * 1000 : (sortByDate ? 2 * 60 * 1000 : 5 * 60 * 1000);
  
  // Usar cache otimizado
  const cached = await cachedFetch(
    cacheKey,
    () => performYouTubeSearch(query, sortByDate, limit),
    { ttlMs }
  );
  
  return cached;
}

async function performYouTubeSearch(query: string, sortByDate = false, limit = 40, variety = 0): Promise<PageResult> {
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
  // Sort by upload date (newest first): protobuf {field 1: 2} → base64 "CAI="
  // Parte 40: variety rotaciona os parâmetros protobuf de ordenação/filtro —
  // a mesma pesquisa devolve resultados genuinamente diferentes por seed.
  if (sortByDate) {
    body.params = "CAI%3D"; // mais recentes
  } else if (variety === 1) {
    body.params = "CAM%3D"; // por visualizações
  } else if (variety === 2) {
    body.params = "CAE%3D"; // por avaliação
  } else if (variety === 3) {
    body.params = "EgQIBRAB"; // filtro: enviados neste mês
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
  
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
      console.error("YouTube general API error:", response.status);
      // Fallback to Invidious
      return searchViaInvidious(query, sortByDate);
    }

    const data = await response.json();
    return parseResults(data, limit);
  } catch (e) {
    console.error("YouTube search fetch error:", e);
    // Fallback to Invidious
    return searchViaInvidious(query, sortByDate);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchContinuation(continuation: string, limit = 40, source: "search" | "channel" = "search", channelId?: string, channelName = ""): Promise<PageResult> {
  try {
    const body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "pt",
          gl: "BR",
        },
      },
      continuation,
    };

    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/${source === "channel" ? "browse" : "search"}?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) return { results: [], continuation: null };
    const data = await response.json();
    const page = source === "channel" ? parseChannelVideos(data, limit, channelId, channelName) : parseResults(data, limit);
    if (source === "channel" && channelId) {
      page.results = page.results.filter((v) => normalizeChannelId(v.channelId || v.channelUrl || "") === channelId);
      try {
        const raw = JSON.stringify(data?.header || data?.metadata || {});
        const mAv = raw.match(/yt3[^"]+/);
        if (mAv) {
          const avatarUrl = `https://${mAv[0].replace(/\\/g, "")}`;
          for (const v of page.results) {
            if (!v.channelThumbnail) v.channelThumbnail = avatarUrl;
          }
        }
      } catch {}
    }
    return page;
  } catch (e) {
    console.error("Continuation error:", e);
    return { results: [], continuation: null };
  }
}

async function fetchChannelVideos(channelId: string, limit = 40, channelName = ""): Promise<PageResult> {
  try {
    const body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "pt",
          gl: "BR",
        },
      },
      browseId: channelId,
      params: "EgZ2aWRlb3PyBgQKAjoA",
    };

    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) return { results: [], continuation: null };
    const data = await response.json();
    const page = parseChannelVideos(data, limit, channelId, channelName);
    page.results = page.results.filter((v) => normalizeChannelId(v.channelId || v.channelUrl || "") === channelId);
    // Avatar do canal (header do browse) em todos os itens — logos nos cards
    try {
      const raw = JSON.stringify(data?.header || data?.metadata || {});
      const mAv = raw.match(/yt3[^"]+/);
      if (mAv) {
        const avatarUrl = `https://${mAv[0].replace(/\\/g, "")}`;
        for (const v of page.results) {
          if (!v.channelThumbnail) v.channelThumbnail = avatarUrl;
        }
      }
    } catch {}
    return page;
  } catch (e) {
    console.error("Channel videos error:", e);
    return { results: [], continuation: null };
  }
}


async function fetchPlaylistVideos(rawId: string): Promise<PageResult> {
  try {
    const browseId = rawId.startsWith("VL") ? rawId : `VL${rawId}`;
    const body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "pt",
          gl: "BR",
        },
      },
      browseId,
    };
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) throw new Error(`playlist browse failed: ${response.status}`);
    const data = await response.json();
    const seen = new Set<string>();
    const results: VideoResult[] = [];
    for (const node of collectByKey(data, "playlistVideoRenderer")) {
      const videoId = node?.videoId;
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      const dur = node?.lengthText?.simpleText || node?.lengthSeconds || "";
      let lengthSeconds = 0;
      if (typeof dur === "number") lengthSeconds = dur;
      else if (typeof dur === "string" && dur.includes(":")) {
        const parts = dur.split(":").map((x: string) => parseInt(x, 10) || 0);
        lengthSeconds = parts.reduce((acc: number, p: number) => acc * 60 + p, 0);
      }
      results.push({
        videoId,
        title: node?.title?.runs?.[0]?.text || "Vídeo",
        channel: node?.shortBylineText?.runs?.[0]?.text || "",
        channelId: node?.ownerText?.runs?.[0]?.browseId || node?.shortBylineText?.runs?.[0]?.browseId || "",
        channelUrl: "",
        channelThumbnail: "",
        thumbnail: node?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url?.replace(/^\/\//, "https://") || "",
        duration: typeof dur === "string" ? dur : "",
        views: node?.viewCountText?.simpleText || "",
        publishedTime: "",
        lengthSeconds,
        description: "",
      });
    }

    // Shape novo: itens como lockupViewModel
    if (results.length === 0) {
      const ownerNode = collectByKey(data, "videoOwnerRenderer")[0];
      const ownerName = ownerNode?.title?.runs?.[0]?.text || "";
      const ownerId = normalizeChannelId(ownerNode?.navigationEndpoint?.browseEndpoint?.browseId || "");
      for (const lk of collectByKey(data, "lockupViewModel")) {
        const parsed = parseLockupVideo(lk, ownerId, ownerName);
        if (parsed && !seen.has(parsed.videoId)) {
          seen.add(parsed.videoId);
          results.push(parsed);
        }
      }
    }

    // Fallback: playlists "station"/mix (ex.: ap...) rejeitam browse VL — usar `next`
    if (results.length === 0) {
      try {
        const nextRes = await fetch(
          "https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
            body: JSON.stringify({
              context: {
                client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "pt", gl: "BR" },
              },
              playlistId: rawId,
            }),
          }
        );
        if (nextRes.ok) {
          let nd = await nextRes.json();
          let lks = collectByKey(nd, "lockupViewModel");
          // Stations/mixes exigem um videoId de contexto — o próprio id costuma ser o vídeo atual
          if (lks.length === 0) {
            const nextRes2 = await fetch(
              "https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
              {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
                body: JSON.stringify({
                  context: {
                    client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "pt", gl: "BR" },
                  },
                  playlistId: rawId,
                  videoId: rawId,
                }),
              }
            );
            if (nextRes2.ok) nd = await nextRes2.json();
            lks = collectByKey(nd, "lockupViewModel");
          }
          const ownerNode = collectByKey(nd, "videoOwnerRenderer")[0];
          const ownerName = ownerNode?.title?.runs?.[0]?.text || "";
          const ownerId = normalizeChannelId(ownerNode?.navigationEndpoint?.browseEndpoint?.browseId || "");
          for (const lk of lks) {
            const parsed = parseLockupVideo(lk, ownerId, ownerName);
            if (parsed && !seen.has(parsed.videoId)) {
              seen.add(parsed.videoId);
              results.push(parsed);
            }
          }
          for (const node of collectByKey(nd, "playlistPanelVideoRenderer")) {
            const videoId = node?.videoId;
            if (!videoId || seen.has(videoId)) continue;
            seen.add(videoId);
            const dur = node?.lengthText?.simpleText || "";
            results.push({
              videoId,
              title: node?.title?.runs?.[0]?.text || "Vídeo",
              channel: node?.shortBylineText?.runs?.[0]?.text || ownerName,
              channelId: ownerId || undefined,
              channelUrl: "",
              channelThumbnail: "",
              thumbnail: node?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url?.replace(/^\/\//, "https://") || "",
              duration: dur,
              views: "",
              publishedTime: "",
              lengthSeconds: parseDuration(dur),
              description: "",
            });
          }
        }
      } catch {
        /* fallback next falhou — segue vazio */
      }
    }

    return { results, continuation: null };
  } catch (e) {
    console.error("Playlist items error:", e);
    return { results: [], continuation: null };
  }
}

// ---------------------------------------------------------------------------
// Abas completas do canal: Shorts / Playlists / Sobre
// ---------------------------------------------------------------------------

const CHANNEL_TAB_PARAMS: Record<string, string | undefined> = {
  shorts: "EgZzaG9ydHPyBgUKA5oBAA%3D%3D",
  playlists: "EglwbGF5bGlzdHPyBgoKCEIGCgIQaCIA",
  // "Sobre" vem do browse principal do canal (sem params):
  // metadata.channelMetadataRenderer + header (inscritos/vídeos/visualizações/desde)
  about: undefined,
};

async function fetchChannelTab(
  channelId: string,
  tab: "shorts" | "playlists" | "about"
): Promise<any> {
  try {
    const body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "pt",
          gl: "BR",
        },
      },
      browseId: channelId,
      ...(CHANNEL_TAB_PARAMS[tab] ? { params: decodeURIComponent(CHANNEL_TAB_PARAMS[tab] as string) } : {}),
    };

    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) throw new Error(`browse ${tab} failed: ${response.status}`);
    const data = await response.json();

    if (tab === "shorts") {
      return { shorts: parseChannelShorts(data), continuation: null };
    }
    if (tab === "playlists") {
      return { playlists: parseChannelPlaylists(data) };
    }
    return { about: parseChannelAbout(data) };
  } catch (e) {
    console.error(`Channel tab ${tab} error:`, e);
    if (tab === "shorts") return { shorts: [], continuation: null };
    if (tab === "playlists") return { playlists: [] };
    return { about: null };
  }
}

/** Acha recursivamente TODOS os objetos com uma chave específica. */
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

function parseChannelShorts(data: any): any[] {
  const nodes = [
    ...collectByKey(data, "shortsLockupViewModel"),
  ];
  const seen = new Set<string>();
  const shorts: any[] = [];
  for (const node of nodes) {
    try {
      const raw = JSON.stringify(node);
      const idMatch = raw.match(/"videoId":"([A-Za-z0-9_-]{11})"/)
        || raw.match(/shorts\/(?:shorts\/)?([A-Za-z0-9_-]{11})/);
      const videoId = idMatch?.[1];
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      const reel = node?.onTap?.innertubeCommand?.reelWatchEndpoint;
      const views = node?.overlayMetadata?.secondaryText?.content || "";
      let title = node?.overlayMetadata?.primaryText?.content || "";
      if (!title && node?.accessibilityText) {
        // "Título, 18 mil visualizações - ver o Shorts" -> "Título"
        title = String(node.accessibilityText).split(",")[0].replace(/\s*-\s*ver o Shorts$/i, "").trim();
      }
      const thumb =
        reel?.thumbnail?.thumbnails?.[0]?.url ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/frame0.jpg` : "");
      shorts.push({
        videoId,
        title,
        channel: "",
        thumbnail: thumb?.startsWith("//") ? `https:${thumb}` : thumb,
        duration: "",
        views,
        publishedTime: "",
        lengthSeconds: 0,
        description: "",
        isShort: true,
      });
    } catch {
      /* item malformado — ignora */
    }
  }
  return shorts;
}

function parseChannelPlaylists(data: any): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  // Formato novo: lockupViewModel
  for (const node of collectByKey(data, "lockupViewModel")) {
    try {
      const playlistId = node?.contentId;
      if (!playlistId || seen.has(playlistId)) continue;
      const title =
        node?.metadata?.lockupMetadataViewModel?.title?.content || "Playlist";
      const thumb =
        node?.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.slice(-1)?.[0]?.url ||
        node?.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)?.[0]?.url ||
        "";
      let itemCount = 0;
      try {
        // 1) Badge da thumbnail do lockup novo: "N vídeos"
        const badges = node?.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays
          ?.flatMap((o: any) => o?.thumbnailOverlayBadgeViewModel?.thumbnailBadges || []) || [];
        for (const b of badges) {
          const m = String(b?.thumbnailBadgeViewModel?.text || "").match(/(\d+)\s*v[ií]deo/i);
          if (m) itemCount = Math.max(itemCount, parseInt(m[1], 10));
        }
        // 2) Fallback: linhas de metadados ("N vídeos" em texto)
        if (!itemCount) {
          const rows = node?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
          for (const row of rows) {
            for (const part of row?.metadataParts || []) {
              const m = String(part?.text?.content || "").match(/(\d+)\s*v[ií]deo/i);
              if (m) itemCount = Math.max(itemCount, parseInt(m[1], 10));
            }
          }
        }
      } catch {}
      seen.add(playlistId);
      out.push({
        playlistId,
        title,
        itemCount,
        thumbnail: thumb?.startsWith("//") ? `https:${thumb}` : thumb,
      });
    } catch {
      /* ignora */
    }
  }
  // Formato legado: gridPlaylistRenderer
  for (const node of collectByKey(data, "gridPlaylistRenderer")) {
    try {
      const playlistId = node?.playlistId;
      if (!playlistId || seen.has(playlistId)) continue;
      seen.add(playlistId);
      out.push({
        playlistId,
        title: node?.title?.runs?.[0]?.text || "Playlist",
        itemCount: parseInt(node?.videoCountText?.runs?.[0]?.text || "0", 10) || 0,
        thumbnail:
          node?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url?.replace(/^\/\//, "https://") || "",
      });
    } catch {
      /* ignora */
    }
  }
  return out;
}

function parseChannelAbout(data: any): any {
  try {
    const s = JSON.stringify(data);
    const first = (re: RegExp): string => {
      const m = s.match(re);
      return m?.[1]?.replace(/\\u00a0/g, " ") || "";
    };
    const meta = data?.metadata?.channelMetadataRenderer || {};
    // junta todos os textos do header (metadataParts) p/ "desde"
    const headerTexts: string[] = [];
    const collect = (o: any): void => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(collect); return; }
      for (const [k, v] of Object.entries(o)) {
        if (k === "content" && typeof v === "string") headerTexts.push(v);
        else collect(v);
      }
    };
    collect(data?.header);
    const joinedDate = headerTexts.find((t) => /^há\s\d+\s(ano|meses|mes|dia)s?/i.test(t)) || "";
    return {
      description: meta?.description || "",
      subscriberCount: first(/"content":"([0-9][^"]{0,30}inscritos)"/),
      videoCount: first(/"content":"([0-9][^"]{0,30}vídeos)"/),
      viewCount: first(/"content":"([0-9][^"]{0,30}de visualizações)"/),
      joinedDate,
      country: "",
      links: meta?.vanityChannelUrl ? [{ title: "YouTube", url: meta.vanityChannelUrl }] : [],
    };
  } catch {
    return null;
  }
}

async function searchViaInvidious(query: string, sortByDate = false): Promise<PageResult> {
  const instances = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.jing.rocks",
  ];

  for (const base of instances) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=${sortByDate ? "upload_date" : "relevance"}&region=BR`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) continue;
      const items = await res.json();

      const results = items
        .filter((v: any) => v.videoId)
        .slice(0, 40)
        .map((v: any) => {
          const isLive = !!v.liveNow || v.lengthSeconds === 0;
          return {
            videoId: v.videoId,
            title: v.title || "",
            channel: v.author || "",
              channelId: normalizeChannelId(v.authorId || v.authorUrl || "") || undefined,
              channelUrl: v.authorUrl || "",
            channelThumbnail: v.authorThumbnails?.[v.authorThumbnails.length - 1]?.url || v.authorThumbnails?.[0]?.url || "",
            thumbnail: v.videoThumbnails?.find((t: any) => t.quality === "maxres")?.url ||
              v.videoThumbnails?.find((t: any) => t.quality === "high")?.url ||
              v.videoThumbnails?.find((t: any) => t.quality === "medium")?.url ||
              v.videoThumbnails?.[v.videoThumbnails.length - 1]?.url || "",
            duration: isLive ? "AO VIVO" : formatSeconds(v.lengthSeconds || 0),
            views: formatViews(v.viewCount || 0),
            publishedTime: v.publishedText || "",
            lengthSeconds: v.lengthSeconds || 0,
            description: v.description || "",
            isLive,
          };
        });
      return { results, continuation: null };
    } catch {
      continue;
    }
  }
  return { results: [], continuation: null };
}


function parseResults(data: any, limit = 40): PageResult {
  const results: VideoResult[] = [];
  let continuation: string | null = null;

  // Collect item sections from both initial search and continuation shapes
  const sections: any[] = [];
  const initial = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
    ?.sectionListRenderer?.contents;
  if (Array.isArray(initial)) sections.push(...initial);

  const contActions = data?.onResponseReceivedCommands || [];
  for (const action of contActions) {
    const items = action?.appendContinuationItemsAction?.continuationItems;
    if (Array.isArray(items)) sections.push(...items);
  }
  const contActions2 = data?.continuationContents?.sectionListContinuation?.contents;
  if (Array.isArray(contActions2)) sections.push(...contActions2);

  try {
    for (const section of sections) {
      // Extract continuation token if present
      const contItem = section?.continuationItemRenderer;
      if (contItem) {
        const token = contItem?.continuationEndpoint?.continuationCommand?.token;
        if (token) continuation = token;
        continue;
      }

      const items = section?.itemSectionRenderer?.contents || [];

      for (const item of items) {
        // Shape novo (2025+): resultados como lockupViewModel
        const searchLockup = item?.lockupViewModel || item?.richItemRenderer?.content?.lockupViewModel;
        if (searchLockup?.contentId) {
          const parsedLk = parseLockupVideo(searchLockup, "", "", "");
          if (parsedLk) {
            results.push(parsedLk);
          }
          continue;
        }

        const renderer = item?.videoRenderer;
        if (!renderer?.videoId) continue;

        const title = renderer.title?.runs?.map((r: any) => r.text).join("") || "";
        const ownerRun = renderer.ownerText?.runs?.[0] || renderer.shortBylineText?.runs?.[0];
        const channel = ownerRun?.text || "";
        const channelUrl = ownerRun?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
        const channelId = normalizeChannelId(ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || channelUrl || "");
        const channelThumbs = renderer.channelThumbnailSupportedRenderers
          ?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails || [];
        const channelThumb = channelThumbs[0]?.url || "";
        const thumbs = renderer.thumbnail?.thumbnails || [];
        const thumb = thumbs[thumbs.length - 1]?.url || "";
        const durationText = renderer.lengthText?.simpleText || "";
        const viewText = renderer.viewCountText?.simpleText || renderer.viewCountText?.runs?.map((r: any) => r.text).join("") || "";
        const published = renderer.publishedTimeText?.simpleText || "";

        const badges: any[] = renderer.badges || [];
        const overlays: any[] = renderer.thumbnailOverlays || [];
        const badgeLive = badges.some((b: any) =>
          b?.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
          b?.metadataBadgeRenderer?.label === "AO VIVO" ||
          b?.metadataBadgeRenderer?.label === "LIVE"
        );
        const overlayLive = overlays.some((o: any) =>
          o?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE"
        );
        const watchingLive = /assistindo agora|watching now/i.test(viewText);
        const isLive = badgeLive || overlayLive || watchingLive;

        results.push({
          videoId: renderer.videoId,
          title,
          channel,
          channelId: channelId || undefined,
          channelUrl,
          channelThumbnail: channelThumb.startsWith("//") ? `https:${channelThumb}` : channelThumb,
          thumbnail: thumb.startsWith("//") ? `https:${thumb}` : thumb,
          duration: isLive ? "AO VIVO" : durationText,
          views: viewText,
          publishedTime: isLive ? "Transmitindo agora" : published,
          lengthSeconds: parseDuration(durationText),
          description: renderer.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join("") || "",
          isLive,
        });
      }

      // Shape novo: lockupViewModel direto na seção (ou dentro de richItemRenderer)
      const flatLockup = section?.lockupViewModel || section?.richItemRenderer?.content?.lockupViewModel;
      if (flatLockup?.contentId) {
        const parsedLk = parseLockupVideo(flatLockup);
        if (parsedLk) results.push(parsedLk);
      }

      // Also parse continuation items shape (flat continuationItems array)
      const flatItem = section?.videoRenderer;
      if (flatItem?.videoId) {
        // Same extraction, but simplified — treat this section as a single videoRenderer
        const r = flatItem;
        const title = r.title?.runs?.map((x: any) => x.text).join("") || "";
        const ownerRun = r.ownerText?.runs?.[0] || r.shortBylineText?.runs?.[0];
        const channel = ownerRun?.text || "";
        const channelUrl = ownerRun?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
        const channelId = normalizeChannelId(ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || channelUrl || "");
        const thumbs = r.thumbnail?.thumbnails || [];
        const thumb = thumbs[thumbs.length - 1]?.url || "";
        const durationText = r.lengthText?.simpleText || "";
        results.push({
          videoId: r.videoId,
          title,
          channel,
          channelId: channelId || undefined,
          channelUrl,
          channelThumbnail: "",
          thumbnail: thumb.startsWith("//") ? `https:${thumb}` : thumb,
          duration: durationText,
          views: r.viewCountText?.simpleText || "",
          publishedTime: r.publishedTimeText?.simpleText || "",
          lengthSeconds: parseDuration(durationText),
          description: "",
          isLive: false,
        });
      }
    }
  } catch (e) {
    console.error("Parse error:", e);
  }

  return { results: results.slice(0, limit), continuation };
}

function parseChannelVideos(data: any, limit = 40, expectedChannelId?: string, fallbackChannelName = ""): PageResult {
  const results: VideoResult[] = [];
  let continuation: string | null = null;
  const ownerChannelId = normalizeChannelId(expectedChannelId || data?.metadata?.channelMetadataRenderer?.externalId || "");
  const ownerName = fallbackChannelName || data?.metadata?.channelMetadataRenderer?.title || "";
  const avatar = getBestThumb(data?.metadata?.channelMetadataRenderer?.avatar?.thumbnails || []);

  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;

    const cont = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (cont) continuation = cont;

    const r = node.richItemRenderer?.content?.videoRenderer || node.videoRenderer || node.gridVideoRenderer;
    if (r?.videoId) {
      const parsed = parseVideoRenderer(r, ownerChannelId, ownerName, avatar);
      if (parsed && (!ownerChannelId || normalizeChannelId(parsed.channelId || parsed.channelUrl || "") === ownerChannelId)) {
        results.push(parsed);
      }
    }

    // Shape novo: lockupViewModel (aba de vídeos do canal)
    const lk = node.lockupViewModel || node.richItemRenderer?.content?.lockupViewModel;
    if (lk?.contentId) {
      const parsedLk = parseLockupVideo(lk, ownerChannelId, ownerName, avatar);
      if (parsedLk) results.push(parsedLk);
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };

  visit(data);
  const seen = new Set<string>();
  return { results: results.filter((v) => !seen.has(v.videoId) && seen.add(v.videoId)).slice(0, limit), continuation };
}

function parseVideoRenderer(r: any, fallbackChannelId = "", fallbackChannelName = "", fallbackChannelThumb = ""): VideoResult | null {
  if (!r?.videoId) return null;
  const title = r.title?.runs?.map((x: any) => x.text).join("") || r.title?.simpleText || "";
  const ownerRun = r.ownerText?.runs?.[0] || r.shortBylineText?.runs?.[0] || r.longBylineText?.runs?.[0];
  const channel = ownerRun?.text || fallbackChannelName || "";
  const channelUrl = ownerRun?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
  const channelId = normalizeChannelId(ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || channelUrl || fallbackChannelId);
  const channelThumb = getBestThumb(r.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails || []) || fallbackChannelThumb;
  const thumb = getBestThumb(r.thumbnail?.thumbnails || []);
  const durationText = r.lengthText?.simpleText || r.thumbnailOverlays?.find((o: any) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText || "";
  const viewText = r.viewCountText?.simpleText || r.viewCountText?.runs?.map((x: any) => x.text).join("") || "";
  const published = r.publishedTimeText?.simpleText || "";
  const isLive = r.thumbnailOverlays?.some((o: any) => o?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE") || /assistindo agora|watching now/i.test(viewText);

  return {
    videoId: r.videoId,
    title,
    channel,
    channelId: channelId || undefined,
    channelUrl,
    channelThumbnail: channelThumb,
    thumbnail: thumb,
    duration: isLive ? "AO VIVO" : durationText,
    views: viewText,
    publishedTime: isLive ? "Transmitindo agora" : published,
    lengthSeconds: parseDuration(durationText),
    description: r.descriptionSnippet?.runs?.map((x: any) => x.text).join("") || r.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((x: any) => x.text).join("") || "",
    isLive,
  };
}

function parseLockupVideo(
  lk: any,
  fallbackChannelId = "",
  fallbackChannelName = "",
  fallbackChannelThumb = ""
): VideoResult | null {
  const videoId = lk?.contentId;
  if (!videoId || typeof videoId !== "string" || videoId.length < 8) return null;
  // Playlists/coleções têm collectionThumbnailViewModel — não são vídeos
  if (lk?.contentImage?.collectionThumbnailViewModel) return null;
  const contentType = String(lk?.contentType || "LOCKUP_CONTENT_TYPE_VIDEO");
  const isShorts = contentType.includes("SHORTS");
  if (!isShorts && !contentType.includes("VIDEO")) return null;

  const meta = lk?.metadata?.lockupMetadataViewModel || {};
  const title = meta?.title?.content || "Vídeo";
  const sources = lk?.contentImage?.thumbnailViewModel?.image?.sources || [];
  const thumbRaw = sources[sources.length - 1]?.url || "";
  const thumb = thumbRaw.startsWith("//") ? `https:${thumbRaw}` : thumbRaw;

  // Duração fica no badge do overlay da thumbnail
  let durationText = "";
  try {
    const overlays = lk?.contentImage?.thumbnailViewModel?.overlays || [];
    for (const ov of overlays) {
      const badges = ov?.thumbnailBottomOverlayViewModel?.badges || [];
      for (const b of badges) {
        const t = String(b?.thumbnailBadgeViewModel?.text || "");
        if (/\d+:\d{2}/.test(t)) durationText = t;
      }
    }
  } catch {}

  // Linhas de metadados: canal / visualizações / data de publicação
  let views = "", published = "";
  let channelName = fallbackChannelName, channelId = fallbackChannelId;
  try {
    const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
    for (const row of rows) {
      for (const part of row?.metadataParts || []) {
        const txt = String(part?.text?.content || "");
        if (/visualizaç|views|assistindo agora|watching/i.test(txt)) views = txt;
        else if (/^há\s|ago/i.test(txt)) published = txt;
        // Canal: parte com commandRun → browseEndpoint UC… (busca nova)
        if (!channelId) {
          const runs = part?.text?.commandRuns || [];
          for (const cr of runs) {
            const be = cr?.onTap?.innertubeCommand?.browseEndpoint;
            const id = normalizeChannelId(String(be?.browseId || be?.canonicalBaseUrl || ""));
            if (id) {
              channelId = id;
              if (!channelName && txt) channelName = txt;
            }
          }
        } else if (!channelName && txt && !/visualizaç|views|há\s|ago/i.test(txt)) {
          channelName = txt;
        }
      }
    }
  } catch {}

  return {
    videoId,
    title,
    channel: channelName,
    channelId: channelId || undefined,
    channelUrl: "",
    channelThumbnail: fallbackChannelThumb,
    thumbnail: thumb,
    duration: durationText,
    views,
    publishedTime: published,
    lengthSeconds: parseDuration(durationText),
    description: "",
    isLive: /assistindo agora|watching now/i.test(views),
  };
}

function getBestThumb(thumbnails: any[]): string {
  const url = thumbnails?.[thumbnails.length - 1]?.url || thumbnails?.[0]?.url || "";
  return url.startsWith("//") ? `https:${url}` : url;
}

function normalizeChannelId(value: string): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const direct = raw.match(/UC[\w-]{20,}/)?.[0];
  if (direct) return direct;
  const channelPath = raw.match(/\/channel\/(UC[\w-]{20,})/)?.[1];
  if (channelPath) return channelPath;
  return raw.startsWith("UC") ? raw : "";
}


function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M visualizações`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K visualizações`;
  return `${n} visualizações`;
}
