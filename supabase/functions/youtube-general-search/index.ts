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
    const rl = checkRateLimit(ip, { maxRequests: 20, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const query = url.searchParams.get("q");
    const sortByDate = url.searchParams.get("sort") === "date";
    const continuationToken = url.searchParams.get("continuation");
    const source = url.searchParams.get("source") === "channel" ? "channel" : "search";
    const channelId = normalizeChannelId(url.searchParams.get("channelId") || "");
    const channelName = url.searchParams.get("channelName") || query || "";
    const limitParam = parseInt(url.searchParams.get("limit") || "40", 10);
    const limit = Math.max(1, Math.min(100, isNaN(limitParam) ? 40 : limitParam));

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
    
    const cacheKey = `general:${sortByDate ? "date:" : ""}${limit}:${(query as string).toLowerCase().trim()}`;
    const ttlMs = isDailySearch ? 2 * 60 * 1000 : 5 * 60 * 1000; // 2 min for daily, 5 min for others
    const page = await cachedFetch(cacheKey, () => performYouTubeSearch(query as string, sortByDate, limit), { ttlMs });

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

async function performYouTubeSearch(query: string, sortByDate = false, limit = 40): Promise<PageResult> {
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
  if (sortByDate) body.params = "CAI%3D";

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
    return page;
  } catch (e) {
    console.error("Channel videos error:", e);
    return { results: [], continuation: null };
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
        const renderer = item?.videoRenderer;
        if (!renderer?.videoId) continue;

        const title = renderer.title?.runs?.map((r: any) => r.text).join("") || "";
        const ownerRun = renderer.ownerText?.runs?.[0] || renderer.shortBylineText?.runs?.[0];
        const channel = ownerRun?.text || "";
        const channelUrl = ownerRun?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
        const channelId = normalizeChannelId(channelUrl || ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || "");
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

      // Also parse continuation items shape (flat continuationItems array)
      const flatItem = section?.videoRenderer;
      if (flatItem?.videoId) {
        // Same extraction, but simplified — treat this section as a single videoRenderer
        const r = flatItem;
        const title = r.title?.runs?.map((x: any) => x.text).join("") || "";
        const ownerRun = r.ownerText?.runs?.[0] || r.shortBylineText?.runs?.[0];
        const channel = ownerRun?.text || "";
        const channelUrl = ownerRun?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "";
        const channelId = normalizeChannelId(channelUrl || ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || "");
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
