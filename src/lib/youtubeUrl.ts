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
  const trimmed = input.trim();
  // Raw ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  // Must contain youtu to be considered a URL
  if (!/youtu\.?be/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["shorts", "embed", "v", "live"].includes(p));
      if (idx >= 0 && parts[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch {
    return null;
  }
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
