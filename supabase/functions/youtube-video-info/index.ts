import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";

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

    // Server-side cache: same videoId shares results across users for 15 min
    const result = await cachedFetch(`video:${videoId}`, () => fetchVideoInfo(videoId), { ttlMs: 15 * 60 * 1000 });

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

async function fetchVideoInfo(videoId: string) {
  // Try Invidious instances for related videos + comments
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const [videoRes, commentsRes] = await Promise.all([
        fetch(`${base}/api/v1/videos/${videoId}?fields=recommendedVideos`, {
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

      // If we got both, return immediately
      if (relatedVideos.length > 0 && comments.length > 0) {
        console.log(`[youtube-video-info] Full success from ${base}: ${relatedVideos.length} related, ${comments.length} comments`);
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
          description: description || innertube.description,
        };
      }
      console.warn(`[youtube-video-info] ${base} returned empty data`);
    } catch (err) {
      console.warn(`[youtube-video-info] Instance ${base} failed:`, err);
      continue;
    }
  }

  // Fallback: full innertube
  const innertube = await fetchFromInnertube(videoId);
  return innertube;
}

async function fetchFromInnertube(videoId: string): Promise<{ relatedVideos: any[]; comments: any[]; description: string }> {

  console.log("[youtube-video-info] Trying innertube");
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

    if (res.ok) {
      const data = await res.json();

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

      const items = data?.contents?.twoColumnWatchNextResults?.secondaryResults
        ?.secondaryResults?.results || [];


      const relatedVideos = items
        .filter((i: any) => i.compactVideoRenderer?.videoId)
        .slice(0, 15)
        .map((i: any) => {
          const r = i.compactVideoRenderer;
          const thumbs = r.thumbnail?.thumbnails || [];
          return {
            videoId: r.videoId,
            title: r.title?.simpleText || r.title?.runs?.[0]?.text || "",
            channel: r.longBylineText?.runs?.[0]?.text || r.shortBylineText?.runs?.[0]?.text || "",
            channelThumbnail: "",
            thumbnail: thumbs[thumbs.length - 1]?.url || "",
            duration: r.lengthText?.simpleText || "",
            views: r.viewCountText?.simpleText || "",
            publishedTime: r.publishedTimeText?.simpleText || "",
            lengthSeconds: parseDuration(r.lengthText?.simpleText || ""),
            description: "",
          };
        });

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

      console.log(`[youtube-video-info] Innertube: ${relatedVideos.length} related, ${comments.length} comments`);
      return { relatedVideos, comments };
    }
  } catch (err) {
    console.warn("[youtube-video-info] Innertube failed:", err);
  }

  return { relatedVideos: [], comments: [] };
}

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
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
