import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YT_MUSIC_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Rate limit: 15 requests per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 15, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const browseId = url.searchParams.get("browseId");
    if (!browseId) {
      return new Response(JSON.stringify({ error: "Missing browseId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = {
      context: {
        client: {
          clientName: "WEB_REMIX",
          clientVersion: "1.20231204.01.00",
          hl: "pt",
          gl: "BR",
        },
      },
      browseId,
    };

    const res = await fetch(
      `https://music.youtube.com/youtubei/v1/browse?alt=json&key=${YT_MUSIC_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Origin: "https://music.youtube.com",
          Referer: "https://music.youtube.com/",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) throw new Error(`Browse failed: ${res.status}`);
    const data = await res.json();

    const result = parseAlbumPage(data);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Album tracks error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch album tracks", tracks: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseAlbumPage(data: any) {
  // Handle multiple renderer types
  const browseRenderer =
    data?.contents?.twoColumnBrowseResultsRenderer ||
    data?.contents?.singleColumnBrowseResultsRenderer;
  const tabs = browseRenderer?.tabs || [];
  const tabContent = tabs[0]?.tabRenderer?.content;
  const sections = tabContent?.sectionListRenderer?.contents || [];

  let albumTitle = "";
  let albumSubtitle = "";
  let albumCover = "";
  const tracks: any[] = [];

  // Try to get header info from the response header
  const headerRenderer =
    data?.header?.musicImmersiveHeaderRenderer ||
    data?.header?.musicVisualHeaderRenderer ||
    data?.header?.musicHeaderRenderer ||
    null;

  if (headerRenderer) {
    albumTitle = headerRenderer?.title?.runs?.[0]?.text || "";
    albumSubtitle = headerRenderer?.subtitle?.runs?.map((r: any) => r.text).join("") || "";
    const thumbs = headerRenderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      headerRenderer?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    if (thumbs.length) {
      const sorted = [...thumbs].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
      albumCover = sorted[0]?.url || "";
      if (albumCover.startsWith("//")) albumCover = `https:${albumCover}`;
    }
  }

  // Parse sections for tracks and header info
  for (const section of sections) {
    // musicResponsiveHeaderRenderer (album page header)
    const respHeader = section?.musicResponsiveHeaderRenderer;
    if (respHeader) {
      if (!albumTitle) albumTitle = respHeader?.title?.runs?.[0]?.text || "";
      if (!albumSubtitle) albumSubtitle = respHeader?.subtitle?.runs?.map((r: any) => r.text).join("") || "";
      if (!albumCover) {
        const thumbSources = [
          respHeader?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
          respHeader?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails,
        ];
        for (const thumbs of thumbSources) {
          if (thumbs?.length) {
            const sorted = [...thumbs].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
            albumCover = sorted[0]?.url || "";
            if (albumCover.startsWith("//")) albumCover = `https:${albumCover}`;
            break;
          }
        }
      }
    }

    // musicShelfRenderer contains the track list
    const shelf = section?.musicShelfRenderer;
    if (shelf) {
      for (const item of (shelf.contents || [])) {
        const track = parseTrackItem(item, albumCover);
        if (track) tracks.push(track);
      }
    }

    // musicPlaylistShelfRenderer (used for playlists with VL prefix browseIds)
    const playlistShelf = section?.musicPlaylistShelfRenderer;
    if (playlistShelf) {
      for (const item of (playlistShelf.contents || [])) {
        const track = parseTrackItem(item, albumCover);
        if (track) tracks.push(track);
      }
    }
  }

  // Also check secondaryContents
  const secondaryContents = browseRenderer?.secondaryContents?.sectionListRenderer?.contents || [];
  for (const section of secondaryContents) {
    const shelf = section?.musicShelfRenderer || section?.musicPlaylistShelfRenderer;
    if (shelf) {
      for (const item of (shelf.contents || [])) {
        const track = parseTrackItem(item, albumCover);
        if (track) tracks.push(track);
      }
    }
  }

  // Direct shelf in tab content
  const directShelf = tabContent?.musicShelfRenderer || tabContent?.musicPlaylistShelfRenderer;
  if (directShelf) {
    for (const item of (directShelf.contents || [])) {
      const track = parseTrackItem(item, albumCover);
      if (track) tracks.push(track);
    }
  }

  // Deduplicate by videoId
  const seen = new Set<string>();
  const uniqueTracks = tracks.filter((t) => {
    if (seen.has(t.youtubeId)) return false;
    seen.add(t.youtubeId);
    return true;
  });

  return { albumTitle, albumSubtitle, albumCover, tracks: uniqueTracks };
}

function parseTrackItem(item: any, fallbackCover: string): any | null {
  const renderer = item?.musicResponsiveListItemRenderer;
  if (!renderer) return null;

  const flexColumns = renderer?.flexColumns || [];
  const title = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || "";

  const secondRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const artistParts = secondRuns
    .filter((r: any) => r.text && r.text.trim() !== "•" && r.text.trim() !== " • ")
    .map((r: any) => r.text.trim())
    .filter((t: string) => !/^\d{1,2}:\d{2}/.test(t) && !["Música", "Song", "Vídeo", "Video"].includes(t));
  const artist = artistParts.join(", ") || "";

  // Get video ID from multiple sources
  let videoId = "";
  const overlay = renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
  videoId = overlay?.playNavigationEndpoint?.watchEndpoint?.videoId || "";
  if (!videoId) {
    videoId = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId || "";
  }
  if (!videoId) {
    videoId = renderer?.playlistItemData?.videoId || "";
  }

  // Thumbnail
  const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const sorted = [...thumbnails].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
  let cover = sorted[0]?.url || fallbackCover;
  if (cover.startsWith("//")) cover = `https:${cover}`;

  // Parse duration from fixedColumns
  let duration = 0;
  const fixedColumns = renderer?.fixedColumns || [];
  for (const fc of fixedColumns) {
    const text = fc?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || "";
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
      const segs = text.split(":").map(Number);
      duration = segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1];
    }
  }
  // Fallback to flex column runs
  if (duration === 0) {
    for (const run of secondRuns) {
      const text = run?.text?.trim();
      if (text && /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
        const segs = text.split(":").map(Number);
        duration = segs.length === 3 ? segs[0] * 3600 + segs[1] * 60 + segs[2] : segs[0] * 60 + segs[1];
      }
    }
  }

  if (title && videoId) {
    return { id: `yt-${videoId}`, youtubeId: videoId, title, artist, cover, duration };
  }
  return null;
}
