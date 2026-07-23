import type { VideoResult } from "@/lib/youtubeGeneralSearch";
import { hdThumbnail } from "@/lib/utils";

/**
 * Extract a YouTube videoId from a variety of URL shapes:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://www.youtube.com/shorts/ID
 * - https://www.youtube.com/embed/ID
 * - https://m.youtube.com/watch?v=ID
 * - https://music.youtube.com/watch?v=ID
 * - Or just the raw 11-char videoId.
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  let trimmed = input.trim();
  // Remove wrapping quotes/brackets that users sometimes paste
  trimmed = trimmed.replace(/^[<"'\[(]+|[>"'\])]+$/g, "").trim();
  if (!trimmed) return null;
  // Raw ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  // Must contain youtu to be considered a URL
  if (!/youtu\.?be/i.test(trimmed)) return null;

  const ID_RE = /^[A-Za-z0-9_-]{11}$/;

  const tryParse = (raw: string): string | null => {
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

      // Handle attribution_link?u=/watch?v=ID
      if (url.pathname === "/attribution_link") {
        const u = url.searchParams.get("u");
        if (u) {
          try {
            return extractYouTubeVideoId(`https://www.youtube.com${decodeURIComponent(u)}`);
          } catch { /* ignore */ }
        }
      }

      if (host === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0];
        if (ID_RE.test(id)) return id;
      }

      if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        // ?v=, ?vi=
        const v = url.searchParams.get("v") || url.searchParams.get("vi");
        if (v && ID_RE.test(v)) return v;

        // Path-based: /shorts/ID, /embed/ID, /v/ID, /live/ID, /e/ID, /clip/ID
        const parts = url.pathname.split("/").filter(Boolean);
        const idx = parts.findIndex((p) =>
          ["shorts", "embed", "v", "vi", "live", "e", "clip"].includes(p.toLowerCase())
        );
        if (idx >= 0 && parts[idx + 1] && ID_RE.test(parts[idx + 1])) {
          return parts[idx + 1];
        }

        // Hash-based fallbacks: #/watch?v=ID or #v=ID or #!v=ID
        const hash = url.hash.replace(/^#!?\/?/, "");
        if (hash) {
          const hashV = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : hash).get("v");
          if (hashV && ID_RE.test(hashV)) return hashV;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  // Last resort: regex sweep for an 11-char ID inside the string
  const match = trimmed.match(/(?:v=|vi=|\/(?:shorts|embed|v|vi|live|e|clip)\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (match && ID_RE.test(match[1])) return match[1];

  return null;
}

export function isYouTubeUrl(input: string): boolean {
  return extractYouTubeVideoId(input) !== null && /youtu\.?be/i.test(input);
}

/** Fetch title/author/thumbnail for a videoId via YouTube's public oEmbed endpoint. */
export async function fetchVideoByUrl(input: string): Promise<VideoResult | null> {
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) return null;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      return {
        videoId,
        title: data.title || "Vídeo do YouTube",
        channel: data.author_name || "Desconhecido",
        channelUrl: data.author_url,
        channelThumbnail: "",
        thumbnail: hdThumbnail(data.thumbnail_url) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: "",
        views: "",
        publishedTime: "",
        lengthSeconds: 0,
        description: "",
      };
    }
  } catch {
    // fallthrough to minimal result
  }
  return {
    videoId,
    title: "Vídeo do YouTube",
    channel: "Desconhecido",
    channelThumbnail: "",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: "",
    views: "",
    publishedTime: "",
    lengthSeconds: 0,
    description: "",
  };
}
