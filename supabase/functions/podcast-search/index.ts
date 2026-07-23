import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-runtime",
};

interface PodcastResult {
  videoId: string;
  title: string;
  channel: string;
  channelThumbnail: string;
  thumbnail: string;
  duration: string;
  views: string;
  publishedTime: string;
  lengthSeconds: number;
  description: string;
}

interface CacheConfig {
  ttlMs: number;
  maxEntries: number;
}

// Cache TTL mais agressivo para podcasts
const CACHE_CONFIG = {
  daily: { ttlMs: 3 * 60 * 1000, maxEntries: 50 }, // 3 min para podcasts diários
  fresh: { ttlMs: 5 * 60 * 1000, maxEntries: 100 }, // 5 min para busca fresca
  general: { ttlMs: 60 * 60 * 1000, maxEntries: 200 }, // 1h para cache geral
  trending: { ttlMs: 30 * 60 * 1000, maxEntries: 50 }, // 30 min para trending
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Rate limit: 30 requests por minuto (podcasts precisam buscar frequentemente)
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const query = url.searchParams.get("q");
    const channelName = url.searchParams.get("channel") || query || "";
    const continuationToken = url.searchParams.get("continuation");
    const fresh = url.searchParams.get("fresh") === "true";
    const daily = url.searchParams.get("daily") === "true";
    const limitParam = parseInt(url.searchParams.get("limit") || "40", 10);
    const limit = Math.max(1, Math.min(100, isNaN(limitParam) ? 40 : limitParam));

    if (!continuationToken && (!query || query.length < 2)) {
      return new Response(JSON.stringify({ results: [], continuation: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Continuation: sem cache (user paginating)
    if (continuationToken) {
      const results = await fetchPodcastPage(channelName, continuationToken, limit);
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Selecionar TTL baseado na requisição
    let cacheConfig = CACHE_CONFIG.general;
    if (daily) {
      cacheConfig = CACHE_CONFIG.daily;
    } else if (fresh) {
      cacheConfig = CACHE_CONFIG.fresh;
    } else if (query && query.toLowerCase().includes("em alta") || query.toLowerCase().includes("trending")) {
      cacheConfig = CACHE_CONFIG.trending;
    }

    // Cache chave
    const cacheKey = `podcast:${daily ? "daily:" : fresh ? "fresh:" : ""}${limit}:${(channelName as string).toLowerCase().trim()}`;

    // Buscar com cache otimizado
    const results = await cachedFetch(
      cacheKey,
      () => searchPodcasts(channelName as string, limit),
      { ttlMs: cacheConfig.ttlMs }
    );

    // Adicionar headers de cache para cliente também
    return new Response(JSON.stringify(results), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": fresh ? "no-cache" : `max-age=${Math.floor(cacheConfig.ttlMs / 1000)}`,
        "X-Cache-TTL": `${cacheConfig.ttlMs}`,
      },
    });
  } catch (error) {
    console.error("Podcast search error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to search podcasts", results: [], continuation: null }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

/**
 * Buscar podcasts com otimizações de cache
 */
async function searchPodcasts(query: string, limit: number) {
  try {
    // Multi-query strategy para cobertura máxima
    const queries = [
      `${query} podcast completo`,
      `${query} episódio novo`,
      `${query} podcast 2024 2025`,
      `${query} áudio completo`,
    ];

    const allResults = new Map<string, PodcastResult>();
    const seen = new Set<string>();

    // Buscar em paralelo com timeout
    const results = await Promise.allSettled(
      queries.map(q => fetchWithTimeout(() => fetchPodcastResults(q), 5000))
    );

    // Processar resultados
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        for (const pod of result.value) {
          if (!seen.has(pod.videoId)) {
            seen.add(pod.videoId);
            allResults.set(pod.videoId, pod);
          }
        }
      }
    }

    // Converter para array e aplicar limite
    const final = Array.from(allResults.values()).slice(0, limit);

    // Extrair continuation token
    const continuation = final.length >= limit ? generateContinuationToken(query) : null;

    return {
      results: final,
      continuation,
    };
  } catch (error) {
    console.error("Error searching podcasts:", error);
    return { results: [], continuation: null };
  }
}

/**
 * Buscar resultados de podcast (Invidious com fallback)
 */
async function fetchPodcastResults(query: string): Promise<PodcastResult[]> {
  const instances = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.jing.rocks",
  ];

  for (const instance of instances) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });

      if (!response.ok) continue;

      const data: any[] = await response.json();

      return data.slice(0, 40).map(v => ({
        videoId: v.videoId || v.id || "",
        title: v.title || "",
        channel: v.author || "",
        channelThumbnail: "",
        thumbnail: v.videoThumbnails?.[0]?.url || "",
        duration: formatDuration(v.lengthSeconds || 0),
        views: formatViews(v.viewCount || 0),
        publishedTime: formatPublishedTime(v.uploadedAt || 0),
        lengthSeconds: v.lengthSeconds || 0,
        description: v.description || "",
      }));
    } catch (error) {
      console.log(`Failed to fetch from ${instance}: ${error}`);
      continue;
    }
  }

  return [];
}

/**
 * Buscar página de continuação
 */
async function fetchPodcastPage(query: string, continuation: string, limit: number) {
  try {
    // Rotated search para variar resultados
    const variants = [
      `${query} novo episódio`,
      `${query} episódio recente`,
      `${query} última edição`,
    ];

    const hash = hashContinuation(continuation);
    const variantQuery = variants[hash % variants.length];

    const results = await fetchPodcastResults(variantQuery);
    const shuffled = results.sort(() => Math.random() - 0.5).slice(0, limit);

    return {
      results: shuffled,
      continuation: shuffled.length >= limit ? generateContinuationToken(query) : null,
    };
  } catch (error) {
    console.error("Error fetching podcast page:", error);
    return { results: [], continuation: null };
  }
}

/**
 * Helpers
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function formatViews(views: number): string {
  if (views < 1000) return `${views}`;
  if (views < 1_000_000) return `${(views / 1000).toFixed(1)}K`;
  return `${(views / 1_000_000).toFixed(1)}M`;
}

function formatPublishedTime(timestamp: number): string {
  if (!timestamp) return "";
  const now = Date.now() / 1000;
  const seconds = now - timestamp;

  if (seconds < 60) return "agora";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} minuto(s)`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} hora(s)`;
  if (seconds < 604800) return `há ${Math.floor(seconds / 86400)} dia(s)`;
  if (seconds < 2592000) return `há ${Math.floor(seconds / 604800)} semana(s)`;
  return `há ${Math.floor(seconds / 2592000)} mês/meses`;
}

function generateContinuationToken(query: string): string {
  return Buffer.from(`${query}:${Date.now()}`).toString("base64");
}

function hashContinuation(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function fetchWithTimeout(fn: () => Promise<any>, ms: number) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}
