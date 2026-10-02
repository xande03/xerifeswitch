import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";
import { cachedFetch } from "../_shared/serverCache.ts";
import { parseRelatedFromNext, parseVideoItemsList } from "../_shared/innertubeRelated.ts";
import { formatRelativePtBR, translateTextsPtBR } from "../_shared/ptbrRelative.ts";

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
      : await cachedFetch(`video:v3:${videoId}`, () => fetchVideoInfo(videoId), { ttlMs: 15 * 60 * 1000 });

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

type VideoInfoBundle = {
  relatedVideos: any[];
  comments: any[];
  description: string;
  /** Instância Invidious que forneceu os comentários (para buscar a página2). */
  commentsSrc?: string;
  commentsContinuation?: string | null;
};

function decodeEntities(t: string): string {
  return (t || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function mapInvidiousComments(rawComments: any[]): any[] {
  return rawComments
    .slice(0, 40)
    .map((c: any) => ({
      author: c.author || "Anônimo",
      authorThumbnail: c.authorThumbnails?.[0]?.url || "",
      content: decodeEntities(
        (c.contentHtml?.replace(/<[^>]*>/g, "") || c.content || ""),
      ),
      likes: c.likeCount || 0,
      // `publishedText` vem NO LOCALE DA INSTÂNCIA (obs.: árabe no nadeko).
      // O epoch `published` é determinístico → data relativa pt-BR aqui.
      publishedTime: Number.isFinite(Number(c.published)) && Number(c.published) > 0
        ? formatRelativePtBR(Number(c.published) * 1000)
        : (c.publishedText || ""),
      isHearted: c.creatorHeart?.creatorThumbnail ? true : false,
    }));
}

/**
 * Fonte Invidious: APENAS a primeira leitura (vídeo + comentários, teto de
 * 6s). Sem descrição extra e sem página2 aqui — ambos rodam DEPOIS, em
 * paralelo, no pós-processamento (revisão21ª: o desenho serial anterior
 * somava até ~17s POR instância e era descartado pelos caps).
 */
async function tryInvidiousInstance(base: string, videoId: string): Promise<VideoInfoBundle> {
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
  let commentsContinuation: string | null = null;

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
    const rawComments = commentsData.comments || [];
    commentsContinuation = commentsData.continuation || null;
    comments = mapInvidiousComments(rawComments);
  }

  return {
    relatedVideos,
    comments,
    description,
    commentsSrc: comments.length ? base : undefined,
    commentsContinuation,
  };
}

/** Página2 de comentários Invidious (objetivo:40 no total). */
async function fetchInvidiousPage2(base: string, videoId: string, continuation: string): Promise<any[]> {
  const res = await fetch(
    `${base}/api/v1/comments/${videoId}?continuation=${encodeURIComponent(continuation)}`,
    { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.comments) ? mapInvidiousComments(data.comments) : [];
}

/**
 * PARALELO + merge INCREMENTAL (revisão21ª).
 * Motivo: o desenho anterior era SEQUENCIAL (6 instâncias × 6s = ~29s medidos;
 * client aborta em 15s → comentários/descrição nunca chegavam ao app). Depois,
 * a primeira versão paralela esperava TODAS as fontes (~19s) e os caps
 * descartavam fontes boas. Agora: todas as fontes correm juntas (caps7s/9s) e
 * a resposta sai ASSIM QUE related+comments estiverem prontos em QUALQUER
 * combinação — sem esperar instâncias mortas. Página2, descrição e tradução
 * rodam em paralelo no pós-processamento.
 */
async function fetchVideoInfo(videoId: string, debug = false) {
  const withCap = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([
      p.catch((err) => { console.warn("[youtube-video-info] source error:", err); return null as T | null; }),
      new Promise<T | null>((r) => setTimeout(() => r(null), ms)),
    ]);

  const instanceSources = INVIDIOUS_INSTANCES.map((base) =>
    withCap(tryInvidiousInstance(base, videoId), 7000).then((bundle) => ({ src: base, bundle })),
  );
  const innertubeSource = withCap(fetchFromInnertube(videoId, debug), 9000)
    .then((bundle) => ({ src: "innertube" as const, bundle }));
  const sources = [...instanceSources, innertubeSource];

  // Aproximação de relacionadas desde o t0: hoje NENHUMA fonte devolve
  // related direto (vídeo403 nas instâncias + /next barrado no datacenter),
  // e esperar as instâncias mortas (caps de7s) antes de tentar o approx era o
  // gate que mantinha a resposta em ~16s. Com o approx em paralelo, a saída
  // acontece assim que HOUVER comentários + approx pronto.
  const approxEarly: Promise<any[]> = approxRelatedFromSearch(videoId, debug ? {} : undefined)
    .then((r) => r || [])
    .catch(() => []);
  let approxEarlyVal: any[] = [];
  let approxEarlyDone = false;
  approxEarly.then((r) => { approxEarlyVal = r; approxEarlyDone = true; });

  const collected: { src: string; bundle: VideoInfoBundle | null }[] = [];
  const assemble = () => {
    let relatedVideos: any[] = [];
    let comments: any[] = [];
    let description = "";
    let commentsSrc: string | undefined;
    let commentsContinuation: string | null = null;
    for (const { src, bundle } of collected) {
      if (!bundle) continue;
      if (!relatedVideos.length && bundle.relatedVideos?.length) relatedVideos = bundle.relatedVideos;
      if (!comments.length && bundle.comments?.length) {
        comments = bundle.comments;
        commentsSrc = bundle.commentsSrc || (src !== "innertube" ? src : undefined);
        commentsContinuation = bundle.commentsContinuation ?? null;
      }
      description = chooseBestDescription(description, bundle.description);
    }
    return {
      ready: relatedVideos.length > 0 && comments.length > 0,
      relatedVideos, comments, description, commentsSrc, commentsContinuation,
    };
  };

  await new Promise<void>((resolve) => {
    let pending = sources.length;
    let settled = false;
    const finishIfReady = () => {
      if (settled) return;
      const cur = assemble();
      if (cur.comments.length > 0 && (cur.relatedVideos.length > 0 || approxEarlyDone)) {
        settled = true;
        resolve();
      }
    };
    approxEarly.then(() => finishIfReady());
    for (const p of sources) {
      p.then((r) => { collected.push(r); finishIfReady(); })
        .finally(() => {
          pending -= 1;
          if (pending === 0 && !settled) { settled = true; resolve(); }
        });
    }
  });

  const a = assemble();
  let { relatedVideos, comments, description, commentsSrc, commentsContinuation } = a;
  const sourcesUsed = collected.filter((r) => r.bundle).map((r) => r.src);

  // Pós-processamento em PARALELO: página2, descrição e relacionadas (approx).
  const page2Job: Promise<any[]> =
    commentsSrc && commentsContinuation && comments.length > 0 && comments.length < 40
      ? withCap(fetchInvidiousPage2(commentsSrc, videoId, commentsContinuation), 5000).then((x) => x || [])
      : Promise.resolve([]);
  const descJob = (async () => {
    if (description && description.trim().length >= 40 && !isLikelyTruncatedDescription(description)) return description;
    const player = await withCap(fetchPlayerDescription(videoId), 4000).then((x) => x || "");
    return chooseBestDescription(description, player);
  })();
  const [extra, finalDesc] = await Promise.all([page2Job, descJob]);
  if (extra.length) comments = [...comments, ...extra].slice(0, 40);
  if (!relatedVideos.length && approxEarlyVal.length) relatedVideos = approxEarlyVal;
  if (!relatedVideos.length) {
    // última tentativa: approx ainda em voo quando o gate fechou por all-settled
    relatedVideos = await approxEarly;
  }

  console.log(`[youtube-video-info] result: ${relatedVideos.length} related, ${comments.length} comments, desc=${finalDesc.length} from [${sourcesUsed.join(", ")}]`);

  const out: any = await withTranslatedComments({ relatedVideos, comments, description: finalDesc }, debug);
  if (debug) {
    out.__debug = {
      ...(out.__debug || {}),
      servedBy: sourcesUsed,
      perSource: collected.filter((r) => r.bundle).map((r) => ({
        src: r.src,
        r: r.bundle!.relatedVideos?.length || 0,
        c: r.bundle!.comments?.length || 0,
      })),
    };
  }
  return out;
}

/**
 * Tradução pt-BR dos comentários finais (qualquer que seja a fonte):
 * preserva o original em `originalContent` quando o texto muda, e anota
 * `lang` (idioma detectado). Em caso de falha da API de tradução, o texto
 * original permanece — nunca deixa o painel sem comentários.
 */
async function withTranslatedComments(result: any, debug = false) {
  if (!result || !Array.isArray(result.comments) || !result.comments.length) return result;
  const comments = result.comments.slice(0, 60);
  const t0 = Date.now();
  const translated = await translateTextsPtBR(
    comments.map((c: any) => String(c?.content || "")),
    { concurrency: 6, timeoutMs: 2500 },
  );
  const merged = comments.map((c: any, i: number) => {
    const t = translated[i];
    if (!t) return c;
    const changed = t.text && t.text !== t.original;
    if (changed) return { ...c, originalContent: t.original, content: t.text, lang: t.lang };
    return t.lang ? { ...c, lang: t.lang } : c;
  });
  const out: any = { ...result, comments: merged };
  if (debug) {
    out.__debug = {
      ...(out.__debug || {}),
      commentCount: merged.length,
      translatedCount: merged.filter((c: any) => c.originalContent).length,
      translateMs: Date.now() - t0,
    };
  }
  return out;
}

/** Itens de vídeo de uma página de busca (`twoColumnSearchResultsRenderer`). */
function collectSearchItems(data: any): any[] {
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const items: any[] = [];
  for (const s of sections) {
    const isl = s?.itemSectionRenderer?.contents;
    if (Array.isArray(isl)) items.push(...isl);
  }
  return items;
}

/**
 * Mediação de último recurso para `relatedVideos` quando o `/next` é barrado
 * (YouTube devolve 403 "Sorry" para IPs de datacenter, enquanto `/search` e
 * `/browse` passam): descobre artista+título via oEmbed público e busca
 * "${channel} ${title}" — as primeiras ocorrências aproximam bem as
 * "recomendadas". Exclui o próprio vídeo da lista.
 */
async function approxRelatedFromSearch(videoId: string, diag?: Record<string, any>) {
  const oRes = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!oRes.ok) return [];
  const o = await oRes.json();
  const channel = String(o?.author_name || "");
  const title = String(o?.title || "")
    .replace(/\((?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video)[^)]*\)/gi, "")
    .replace(/\[(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video)[^\]]*\]/gi, "")
    .replace(/[-–—]\s*(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video).*/gi, "")
    .trim();
  const q = `${channel} ${title}`.trim();
  if (!q) return [];
  if (diag) diag.approxQuery = q;

  const sRes = await fetch(
    "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "pt", gl: "BR" } },
        query: q,
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!sRes.ok) {
    if (diag) diag.approxSearchStatus = sRes.status;
    return [];
  }
  const data = await sRes.json();
  const related = parseVideoItemsList(collectSearchItems(data), 16)
    .filter((v) => v.videoId !== videoId)
    .slice(0, 15);
  if (diag) diag.servedBy = related.length ? "approx-search" : "none";
  return related;
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
        signal: AbortSignal.timeout(8000),
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
        const parseThreads = (items: any[]): any[] =>
          (items || [])
            .filter((c: any) => c?.commentThreadRenderer)
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
        const findCommentItems = (cData: any): any[] => {
          const eps = cData?.onResponseReceivedEndpoints || [];
          for (const ep of eps) {
            const items =
              ep?.appendContinuationItemsCommand?.continuationItems ||
              ep?.reloadContinuationItemsCommand?.continuationItems;
            if (Array.isArray(items) && items.length) return items;
          }
          return [];
        };
        const nextToken = (items: any[]): string | null => {
          for (const it of items || []) {
            const tok =
              it?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
            if (tok) return tok;
          }
          return null;
        };
        const callNext = async (continuation: string) => {
          const cRes = await fetch(
            "https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
              body: JSON.stringify({ context: body.context, continuation }),
              signal: AbortSignal.timeout(6000),
            }
          );
          return cRes.ok ? await cRes.json() : null;
        };

        const engagementPanels = data?.engagementPanels || [];
        for (const panel of engagementPanels) {
          const section = panel?.engagementPanelSectionListRenderer;
          if (section?.targetId === "comments-section") {
            const continuation = section?.content?.sectionListRenderer?.contents?.[0]
              ?.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer
              ?.continuationEndpoint?.continuationCommand?.token;

            if (continuation) {
              const page1 = await callNext(continuation);
              if (page1) {
                const items1 = findCommentItems(page1);
                comments = parseThreads(items1);
                // 2ª página: mais comentários visíveis no painel (objetivo: 40)
                const token2 = nextToken(items1);
                if (token2 && comments.length) {
                  const page2 = await callNext(token2).catch(() => null);
                  if (page2) {
                    const items2 = findCommentItems(page2);
                    comments = comments.concat(parseThreads(items2));
                  }
                }
                comments = comments.slice(0, 40);
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
      signal: AbortSignal.timeout(6000),
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
