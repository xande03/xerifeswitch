import type { VideoResult } from "./youtubeGeneralSearch";
import { createFunctionHeadersWithIp, createFunctionUrl } from "@/lib/backendConfig";

export interface Comment {
  author: string;
  authorThumbnail: string;
  content: string;
  likes: number;
  publishedTime: string;
  isHearted: boolean;
}

export interface VideoInfo {
  relatedVideos: VideoResult[];
  comments: Comment[];
  description?: string;
}


const CACHE_KEY = "demus_video_info_cache";
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export function isLikelyTruncatedDescription(description?: string): boolean {
  const text = (description || "").trim();
  if (!text) return false;
  return /(\.\.\.|…|\u2026)\s*$/.test(text);
}

function normalizeDescription(description?: string): string {
  return (description || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getCache(): Record<string, { data: VideoInfo; ts: number }> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}

function setCache(cache: Record<string, { data: VideoInfo; ts: number }>): void {
  try {
    const entries = Object.entries(cache).sort(([, a], [, b]) => b.ts - a.ts).slice(0, 50);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  if (!videoId) return { relatedVideos: [], comments: [], description: "" };

  const cache = getCache();
  const cachedDescription = normalizeDescription(cache[videoId]?.data?.description);
  if (
    cache[videoId]
    && Date.now() - cache[videoId].ts < CACHE_TTL
    && !isLikelyTruncatedDescription(cachedDescription)
  ) {
    return cache[videoId].data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = await createFunctionHeadersWithIp();
    const res = await fetch(
      createFunctionUrl("youtube-video-info", { videoId }),
      {
        signal: controller.signal,
        headers,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const result: VideoInfo = {
      relatedVideos: data.relatedVideos || [],
      comments: data.comments || [],
      description: normalizeDescription(data.description),
    };

    // Only cache if we got actual data
    if (result.relatedVideos.length > 0 || result.comments.length > 0 || (result.description || "").length > 0) {
      const updated = getCache();
      updated[videoId] = { data: result, ts: Date.now() };
      setCache(updated);
    }

    return result;
  } catch (err) {
    console.warn("Video info fetch failed:", err);
    const fallback = cache[videoId]?.data;
    if (fallback && !isLikelyTruncatedDescription(fallback.description)) return fallback;
    return { relatedVideos: fallback?.relatedVideos || [], comments: fallback?.comments || [], description: "" };
  }
}

