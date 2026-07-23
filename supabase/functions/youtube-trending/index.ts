import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit: 5 requests per minute per IP (trending is heavy)
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 5, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    // Server-side cache: trending is the same for ALL users, cache 30 min
    const results = await cachedFetch("trending_BR", () => fetchTrendingFromYouTubeMusic(), { ttlMs: 30 * 60 * 1000 });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Trending error:", error);
    return new Response(
      JSON.stringify({ error: "Trending fetch failed", results: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchTrendingFromYouTubeMusic() {
  // Use YouTube Music internal API to get trending/charts
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20231204.01.00",
        hl: "pt",
        gl: "BR",
      },
    },
    browseId: "FEmusic_charts",
    formData: {
      selectedValues: ["BR"],
    },
  };

  const response = await fetch(
    "https://music.youtube.com/youtubei/v1/browse?alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    console.error("YouTube Music API error:", response.status);
    // Fallback: search for trending music
    return await searchTrendingFallback();
  }

  const data = await response.json();
  const songs = parseCharts(data);

  if (songs.length === 0) {
    return await searchTrendingFallback();
  }

  return songs;
}

function parseCharts(data: any): any[] {
  const results: any[] = [];

  try {
    // Navigate the browse response structure
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];

    for (const tab of tabs) {
      const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of sections) {
        const shelf = section?.musicCarouselShelfRenderer || section?.musicShelfRenderer;
        if (!shelf) continue;

        const items = shelf?.contents || [];

        for (const item of items) {
          const parsed = parseMusicItem(item);
          if (parsed) results.push(parsed);
          if (results.length >= 30) break;
        }
        if (results.length >= 30) break;
      }
      if (results.length >= 30) break;
    }
  } catch (e) {
    console.error("Parse charts error:", e);
  }

  return results;
}

function parseMusicItem(item: any): any | null {
  try {
    const renderer =
      item?.musicResponsiveListItemRenderer ||
      item?.musicTwoRowItemRenderer;

    if (!renderer) return null;

    let title = "";
    let artist = "";
    let videoId = "";
    let cover = "";
    let duration = 0;

    if (renderer.flexColumns) {
      // musicResponsiveListItemRenderer
      const flexColumns = renderer.flexColumns;
      title = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "";

      const secondRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const parts = secondRuns
        .filter((r: any) => r.text && !["•", " • ", "&", " & "].includes(r.text.trim()))
        .map((r: any) => r.text.trim())
        .filter((t: string) => !/^\d{1,2}:\d{2}/.test(t) && !/visualizações|views|reproduções/i.test(t));

      const typeIndicators = ["Música", "Vídeo", "Song", "Video"];
      artist = parts.filter((p: string) => !typeIndicators.includes(p))[0] || "";

      // Duration
      for (const run of secondRuns) {
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(run.text?.trim())) {
          const segs = run.text.trim().split(":").map(Number);
          duration = segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1];
          break;
        }
      }

      // Video ID
      const overlay = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
      videoId = overlay?.playNavigationEndpoint?.watchEndpoint?.videoId || "";
      if (!videoId) {
        videoId = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId || "";
      }

      // Thumbnail
      const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      if (thumbnails.length > 0) {
        const sorted = [...thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
        cover = sorted[0]?.url || "";
      }
    } else if (renderer.title) {
      // musicTwoRowItemRenderer
      title = renderer.title?.runs?.[0]?.text || "";
      artist = renderer.subtitle?.runs?.map((r: any) => r.text).join("").replace(/\s*•\s*/g, " ") || "";
      videoId = renderer.navigationEndpoint?.watchEndpoint?.videoId || "";

      const thumbnails = renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      if (thumbnails.length > 0) {
        const sorted = [...thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
        cover = sorted[0]?.url || "";
      }
    }

    if (!title || !videoId) return null;

    return {
      id: `trending-${videoId}`,
      youtubeId: videoId,
      title: cleanTitle(title),
      artist: artist || "Desconhecido",
      album: title,
      cover: cover.startsWith("//") ? `https:${cover}` : (cover || "/placeholder.svg"),
      duration,
      votes: 0,
    };
  } catch {
    return null;
  }
}

async function searchTrendingFallback(): Promise<any[]> {
  // Fallback: search for popular Brazilian music
  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20231204.01.00",
        hl: "pt",
        gl: "BR",
      },
    },
    query: "músicas mais tocadas 2026",
    params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D", // songs filter
  };

  const response = await fetch(
    "https://music.youtube.com/youtubei/v1/search?alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return [];

  const data = await response.json();
  const results: any[] = [];

  try {
    const contents = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of contents) {
      const items = section?.musicShelfRenderer?.contents || [];
      for (const item of items) {
        const parsed = parseMusicItem(item);
        if (parsed) results.push(parsed);
        if (results.length >= 30) break;
      }
      if (results.length >= 30) break;
    }
  } catch (e) {
    console.error("Fallback parse error:", e);
  }

  return results;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, "")
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, "")
    .replace(/\s*\(Lyrics?\)/gi, "")
    .replace(/\s*\[Lyrics?\]/gi, "")
    .replace(/\s*\(Audio\)/gi, "")
    .replace(/\s*\[Audio\]/gi, "")
    .replace(/\s*\(Clipe Oficial\)/gi, "")
    .replace(/\s*[-|]\s*Topic$/gi, "")
    .trim();
}
