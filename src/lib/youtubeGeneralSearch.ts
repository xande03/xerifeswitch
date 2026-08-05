import { createFunctionHeadersWithIp, createFunctionUrl, getBackendConfig } from "@/lib/backendConfig";

export interface VideoResult {
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

const CACHE_KEY = "demus_explore_cache";
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
  results: VideoResult[];
  ts: number;
  continuation?: string | null;
}


function getCache(): Record<string, CacheEntry> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}

function setCache(cache: Record<string, CacheEntry>): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

export interface GeneralSearchPage {
  results: VideoResult[];
  continuation: string | null;
}

async function callGeneralSearch(params: Record<string, string>): Promise<GeneralSearchPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = createFunctionUrl("youtube-general-search", params);
    const headers = await createFunctionHeadersWithIp();
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { results: data.results || [], continuation: data.continuation ?? null };
  } finally {
    clearTimeout(timeout);
  }
}

interface GeneralSearchOptions {
  fresh?: boolean;
  noCache?: boolean;
  sortByDate?: boolean;
  limit?: number;
  channelId?: string;
  channelName?: string;
}

export async function searchYouTubeGeneral(query: string, opts?: GeneralSearchOptions): Promise<VideoResult[]> {
  const page = await searchYouTubeGeneralPage(query, opts);
  return page.results;
}

/**
 * Same as searchYouTubeGeneral, but exposes the continuation token so callers
 * can paginate the full catalog. Cache still applies to the first page.
 */
export async function searchYouTubeGeneralPage(
  query: string,
  opts?: GeneralSearchOptions
): Promise<GeneralSearchPage> {
  if ((!query || query.length < 2) && !opts?.channelId) return { results: [], continuation: null };

  const limit = opts?.limit ?? 40;
  const exactChannel = opts?.channelId ? `channel:${opts.channelId}:` : "";
  const key = exactChannel + (opts?.sortByDate ? "date:" : "") + `${limit}:` + query.toLowerCase().trim();
  const cache = getCache();
  const ttl = opts?.sortByDate ? 5 * 60 * 1000 : opts?.fresh ? 15 * 60 * 1000 : CACHE_TTL;
  if (!opts?.noCache && cache[key] && Date.now() - cache[key].ts < ttl) {
    return { results: cache[key].results, continuation: (cache[key] as any).continuation ?? null };
  }

  try {
    const params: Record<string, string> = { q: query, limit: String(limit), type: "video,playlist,channel" };
    if (opts?.sortByDate) params.sort = "date";
    if (opts?.channelId) {
      params.channelId = opts.channelId;
      params.source = "channel";
      params.channelName = opts.channelName || query;
    }
    const page = await callGeneralSearch(params);

    if (page.results.length > 0) {
      const updated = getCache();
      updated[key] = { results: page.results, ts: Date.now(), continuation: page.continuation } as any;
      const entries = Object.entries(updated).sort(([, a], [, b]) => b.ts - a.ts);
      const trimmed = Object.fromEntries(entries.slice(0, 30));
      setCache(trimmed);
    }

    return page;
  } catch (err) {
    console.error("[GeneralSearch] Failed:", err);
    return { results: cache[key]?.results || [], continuation: null };
  }
}

/**
 * Load the next page of a general search using a continuation token
 * returned by searchYouTubeGeneralPage. Never cached (paginating).
 */
export async function loadMoreYouTubeGeneral(
  continuation: string,
  limit = 40,
  opts?: { source?: "search" | "channel"; channelId?: string; channelName?: string }
): Promise<GeneralSearchPage> {
  if (!continuation) return { results: [], continuation: null };
  try {
    const params: Record<string, string> = { continuation, limit: String(limit), type: "video,playlist,channel" };
    if (opts?.source) params.source = opts.source;
    if (opts?.channelId) params.channelId = opts.channelId;
    if (opts?.channelName) params.channelName = opts.channelName;
    return await callGeneralSearch(params);
  } catch (err) {
    console.error("[GeneralSearch] loadMore failed:", err);
    return { results: [], continuation: null };
  }
}

