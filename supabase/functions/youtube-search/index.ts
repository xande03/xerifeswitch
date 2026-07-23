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

async function searchYouTube(query: string, filter: string): Promise<SearchResult[]> {
  const params = getSearchParams(filter);

  const body = {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20231204.01.00",
        hl: "pt",
        gl: "BR",
      },
    },
    query,
    ...(params ? { params } : {}),
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

  if (!response.ok) {
    console.error("YouTube API error:", response.status);
    return [];
  }

  const data = await response.json();
  return parseSearchResults(data);
}

function getSearchParams(filter: string): string | null {
  switch (filter) {
    case "songs":
      return "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";
    case "artists":
      return "EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D";
    case "albums":
      return "EgWKAQIYAWoKEAkQBRAKEAMQBA%3D%3D";
    default:
      return null;
  }
}

function parseSearchResults(data: any): SearchResult[] {
  const results: SearchResult[] = [];

  try {
    const contents =
      data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const shelfItems = section?.musicShelfRenderer?.contents || [];

      for (const item of shelfItems) {
        const parsed = parseMusicItem(item);
        if (parsed) results.push(parsed);
      }

      // Top result card
      if (section?.musicCardShelfRenderer) {
        const card = parseCardShelf(section.musicCardShelfRenderer);
        if (card) results.push(card);
        
        // Also parse items inside the card shelf
        const cardContents = section.musicCardShelfRenderer?.contents || [];
        for (const item of cardContents) {
          const parsed = parseMusicItem(item);
          if (parsed) results.push(parsed);
        }
      }
    }
  } catch (e) {
    console.error("Parse error:", e);
  }

  // Deduplicate by youtubeId
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.youtubeId)) return false;
    seen.add(r.youtubeId);
    return true;
  }).slice(0, 20);
}

function parseMusicItem(item: any): SearchResult | null {
  try {
    const renderer = item?.musicResponsiveListItemRenderer;
    if (!renderer) return null;

    const flexColumns = renderer?.flexColumns || [];
    const title =
      flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "";

    const secondColumnRuns =
      flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

    // Collect all meaningful text parts
    const textParts = secondColumnRuns
      .filter((r: any) => r.text && r.text.trim() !== "•" && r.text.trim() !== "&" && r.text.trim() !== " • " && r.text.trim() !== " & " && r.text.trim() !== "")
      .map((r: any) => ({ text: r.text.trim(), hasNav: !!r.navigationEndpoint }));

    // Identify type indicators
    const typeIndicators = ["Música", "Vídeo", "Song", "Video", "Episódio", "Episode", "Podcast", "Artista", "Artist", "Álbum", "Album", "Playlist", "Single"];
    
    let artist = "";
    let album = "";
    let duration = 0;
    let itemType = "";

    // Parse the runs more intelligently
    const meaningfulParts: string[] = [];
    for (const part of textParts) {
      if (typeIndicators.includes(part.text)) {
        itemType = part.text;
        continue;
      }
      // Check if this looks like a duration (e.g., "3:45")
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(part.text)) {
        const segments = part.text.split(":").map(Number);
        if (segments.length === 3) {
          duration = segments[0] * 3600 + segments[1] * 60 + segments[2];
        } else {
          duration = segments[0] * 60 + segments[1];
        }
        continue;
      }
      // Skip view counts and dates
      if (/visualizações|views|reproduções|plays/i.test(part.text)) continue;
      if (/^\d+\s*(de\s+\w+|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(part.text)) continue;
      
      meaningfulParts.push(part.text);
    }

    // First meaningful part = artist, second = album
    artist = meaningfulParts[0] || "";
    album = meaningfulParts[1] || "";

    // Get video ID
    let videoId = "";
    const overlay = renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
    videoId = overlay?.playNavigationEndpoint?.watchEndpoint?.videoId || "";

    if (!videoId) {
      const navEp = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint;
      videoId = navEp?.watchEndpoint?.videoId || "";
    }

    if (!title || !videoId) return null;

    // Get thumbnail - prefer higher quality
    const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    let cover = "";
    if (thumbnails.length > 0) {
      // Pick a medium-sized thumbnail
      const sorted = [...thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
      cover = sorted[0]?.url || "";
    }

    return {
      id: `yt-${videoId}`,
      youtubeId: videoId,
      title: cleanTitle(title),
      artist: artist || "Desconhecido",
      album: album || title,
      cover: cover.startsWith("//") ? `https:${cover}` : cover,
      duration,
    };
  } catch {
    return null;
  }
}

function parseCardShelf(renderer: any): SearchResult | null {
  try {
    const title = renderer?.title?.runs?.[0]?.text || "";
    const subtitleRuns = renderer?.subtitle?.runs || [];
    const subtitleParts = subtitleRuns
      .filter((r: any) => r.text && r.text.trim() !== "•" && r.text.trim() !== " • ")
      .map((r: any) => r.text.trim());

    const videoId = renderer?.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    if (!title || !videoId) return null;

    const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const sorted = [...thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    const cover = sorted[0]?.url || "";

    // Type indicators
    const typeIndicators = ["Música", "Vídeo", "Song", "Video", "Artista", "Artist", "Álbum", "Album"];
    const meaningful = subtitleParts.filter((p: string) => !typeIndicators.includes(p));

    return {
      id: `yt-${videoId}`,
      youtubeId: videoId,
      title: cleanTitle(title),
      artist: meaningful[0] || "Desconhecido",
      album: meaningful[1] || title,
      cover: cover.startsWith("//") ? `https:${cover}` : cover,
      duration: 0,
    };
  } catch {
    return null;
  }
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
