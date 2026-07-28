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
  if (cache[videoId] && Date.now() - cache[videoId].ts < CACHE_TTL) {
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
      description: data.description || "",
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
    return cache[videoId]?.data || { relatedVideos: [], comments: [], description: "" };
  }
}

