import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";
import { parseRelatedFromNext } from "../_shared/innertubeRelated.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INVIDIOUS_INSTANCES = [
  "https://vid.puffyan.us",
  "https://invidious.fdn.fr",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.jing.rocks",
  "https://iv.nboez.com",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Rate limit: 30 requests per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const videoId = url.searchParams.get("videoId");

    if (!videoId) {
      return new Response(JSON.stringify({ error: "videoId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ?debug=1 → bypassa o cache e anexa __debug com o que a função VÊ da rede
    // de saída (diagnóstico de diferenças sandbox × edge runtime).
    const debug = url.searchParams.get("debug") === "1";

    // Server-side cache: same videoId shares results across users for 15 min
    const result = debug
      ? await fetchVideoInfo(videoId, true)
      : await cachedFetch(`video:v2:${videoId}`, () => fetchVideoInfo(videoId), { ttlMs: 15 * 60 * 1000 });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Video info error:", error);
    return new Response(
      JSON.stringify({ relatedVideos: [], comments: [], error: "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchVideoInfo(videoId: string, debug = false) {
  // Try Invidious instances for related videos + comments
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const [videoRes, commentsRes] = await Promise.all([
        // Peça também "description" para receber a descrição completa do episódio/vídeo.
        fetch(`${base}/api/v1/videos/${videoId}?fields=recommendedVideos,description`, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" },
        }),
        fetch(`${base}/api/v1/comments/${videoId}?sort_by=top`, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" },
        }).catch(() => null),
      ]);
      clearTimeout(timeout);

      let relatedVideos: any[] = [];
      let comments: any[] = [];
      let description = "";

      if (videoRes.ok) {
        const videoData = await videoRes.json();
        description = (videoData.description || "").toString();
        relatedVideos = (videoData.recommendedVideos || [])
          .filter((v: any) => v.videoId)
          .slice(0, 15)
          .map((v: any) => ({
            videoId: v.videoId,
            title: v.title || "",
            channel: v.author || "",
            channelThumbnail: "",
            thumbnail: v.videoThumbnails?.[v.videoThumbnails.length > 1 ? 1 : 0]?.url || "",
            duration: formatSeconds(v.lengthSeconds || 0),
            views: formatViews(v.viewCount || v.viewCountText || 0),
            publishedTime: "",
            lengthSeconds: v.lengthSeconds || 0,
            description: "",
          }));
      }

      if (!description || isLikelyTruncatedDescription(description)) {
        const full = await fetchPlayerDescription(videoId).catch(() => "");
        description = chooseBestDescription(description, full);
      }

      if (commentsRes?.ok) {
        const commentsData = await commentsRes.json();
        comments = (commentsData.comments || [])
          .slice(0, 20)
          .map((c: any) => ({
            author: c.author || "Anônimo",
            authorThumbnail: c.authorThumbnails?.[0]?.url || "",
            content: c.contentHtml?.replace(/<[^>]*>/g, "") || c.content || "",
            likes: c.likeCount || 0,
            publishedTime: c.publishedText || "",
            isHearted: c.creatorHeart?.creatorThumbnail ? true : false,
          }));
      }

      // If we got both, return immediately — buscando description via innertube se faltar
      if (relatedVideos.length > 0 && comments.length > 0) {
        console.log(`[youtube-video-info] Full success from ${base}: ${relatedVideos.length} related, ${comments.length} comments`);
        if (!description || description.trim().length < 40 || isLikelyTruncatedDescription(description)) {
          try {
            const innertube = await fetchFromInnertube(videoId);
            description = chooseBestDescription(description, innertube.description);
          } catch {}
        }
        return { relatedVideos, comments, description };
      }
      // If we got partial data, save it and try to fill the rest
      if (relatedVideos.length > 0 || comments.length > 0) {
        console.log(`[youtube-video-info] Partial from ${base}: ${relatedVideos.length} related, ${comments.length} comments — will try innertube for missing`);
        // Try innertube to fill in missing data
        const innertube = await fetchFromInnertube(videoId);
        return {
          relatedVideos: relatedVideos.length > 0 ? relatedVideos : innertube.relatedVideos,
          comments: comments.length > 0 ? comments : innertube.comments,
          description: chooseBestDescription(description, innertube.description),
        };
      }
      console.warn(`[youtube-video-info] ${base} returned empty data`);
    } catch (err) {
      console.warn(`[youtube-video-info] Instance ${base} failed:`, err);
      continue;
    }
  }

  // Fallback: full innertube
  const innertube = await fetchFromInnertube(videoId, debug);
  return innertube;
}

async function fetchFromInnertube(videoId: string, debug = false): Promise<any> {

  console.log("[youtube-video-info] Trying innertube");
  const diag: Record<string, any> = {};
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
      videoId,
    };

    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        body: JSON.stringify(body),
      }
    );

    if (debug) diag.status = res.status;
    if (!res.ok && debug) {
      const bodyText = await res.text().catch(() => "");
      diag.notOkBody = bodyText.slice(0, 400);
      return { relatedVideos: [], comments: [], description: "", __debug: diag };
    }
    if (res.ok) {
      const data = await res.json();
      if (debug) {
        diag.topKeys = Object.keys(data || {});
        diag.secondaryCount = (data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || []).length;
        diag.secondaryTypes = (data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || []).slice(0, 5).map((r: any) => Object.keys(r || {})[0]);
        diag.singleColCount = (data?.contents?.singleColumnWatchNextResults?.results?.results?.contents || []).length;
      }

      // Extract full video description from videoSecondaryInfoRenderer
      let description = "";
      try {
        const resultsList = data?.contents?.twoColumnWatchNextResults?.results
          ?.results?.contents || [];
        for (const c of resultsList) {
          const sec = c?.videoSecondaryInfoRenderer;
          if (sec) {
            const runs = sec?.attributedDescription?.content
              || sec?.description?.runs?.map((r: any) => r.text).join("")
              || "";
            if (typeof runs === "string" && runs.trim()) {
              description = runs;
              break;
            }
          }
        }
      } catch (de) {
        console.warn("[youtube-video-info] Description extraction failed:", de);
      }

      if (!description || isLikelyTruncatedDescription(description)) {
        const playerDescription = await fetchPlayerDescription(videoId).catch(() => "");
        description = chooseBestDescription(description, playerDescription);
      }

      // IMPORTANTE: o YouTube trocou o renderer da coluna de recomendacoes de
      // compactVideoRenderer para lockupViewModel. Filtrar so pela chave antiga fazia
      // relatedVideos voltar [] para qualquer video -- e o autoplay "proxima
      // relacionada" do NowPlayingView nunca disparava. A leitura mora em
      // _shared/innertubeRelated.ts (mesmo modulo coberto por
      // src/test/innertube-related.test.ts com payload real capturado).
      const relatedVideos = parseRelatedFromNext(data, 15);

      let comments: any[] = [];
      try {
        const engagementPanels = data?.engagementPanels || [];
        for (const panel of engagementPanels) {
          const section = panel?.engagementPanelSectionListRenderer;
          if (section?.targetId === "comments-section") {
            const continuation = section?.content?.sectionListRenderer?.contents?.[0]
              ?.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer
              ?.continuationEndpoint?.continuationCommand?.token;
            
            if (continuation) {
              const cRes = await fetch(
                "https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                  body: JSON.stringify({ context: body.context, continuation }),
                }
              );
              if (cRes.ok) {
                const cData = await cRes.json();
                const commentItems = cData?.onResponseReceivedEndpoints?.[1]
                  ?.reloadContinuationItemsCommand?.continuationItems || [];
                comments = commentItems
                  .filter((c: any) => c.commentThreadRenderer)
                  .slice(0, 20)
                  .map((c: any) => {
                    const cr = c.commentThreadRenderer.comment.commentRenderer;
                    return {
                      author: cr.authorText?.simpleText || "Anônimo",
                      authorThumbnail: cr.authorThumbnail?.thumbnails?.[0]?.url || "",
                      content: cr.contentText?.runs?.map((r: any) => r.text).join("") || "",
                      likes: parseInt(cr.voteCount?.simpleText?.replace(/\D/g, "") || "0") || 0,
                      publishedTime: cr.publishedTimeText?.runs?.[0]?.text || "",
                      isHearted: !!cr.actionButtons?.commentActionButtonsRenderer?.creatorHeart,
                    };
                  });
              }
            }
          }
        }
      } catch (ce) {
        console.warn("[youtube-video-info] Comments extraction failed:", ce);
      }

      console.log(`[youtube-video-info] Innertube: ${relatedVideos.length} related, ${comments.length} comments, desc=${description.length}`);
      if (debug) {
        diag.parsedRelated = relatedVideos.length;
        return { relatedVideos, comments, description, __debug: diag };
      }
      return { relatedVideos, comments, description };
    }
  } catch (err) {
    console.warn("[youtube-video-info] Innertube failed:", err);
    if (debug) diag.exception = String(err);
  }

  return debug
    ? { relatedVideos: [], comments: [], description: "", __debug: diag }
    : { relatedVideos: [], comments: [], description: "" };
}

function normalizeDescription(description?: string): string {
  return (description || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyTruncatedDescription(description?: string): boolean {
  const text = normalizeDescription(description);
  return !!text && /(\.\.\.|…|\u2026)\s*$/.test(text);
}

function chooseBestDescription(...candidates: Array<string | undefined>): string {
  const normalized = candidates.map(normalizeDescription).filter(Boolean);
  const complete = normalized.filter((d) => !isLikelyTruncatedDescription(d));
  const pool = complete.length > 0 ? complete : normalized;
  return pool.sort((a, b) => b.length - a.length)[0] || "";
}

async function fetchPlayerDescription(videoId: string): Promise<string> {
  const context = {
    client: {
      clientName: "WEB",
      clientVersion: "2.20240101.00.00",
      hl: "pt",
      gl: "BR",
    },
  };

  const res = await fetch(
    "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ context, videoId }),
    }
  );
  if (!res.ok) return "";
  const data = await res.json();
  return normalizeDescription(data?.videoDetails?.shortDescription || "");
}


function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatViews(n: number | string): string {
  if (typeof n === "string") return n;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}
