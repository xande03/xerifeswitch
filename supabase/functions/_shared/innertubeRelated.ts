/**
 * Parser de "vídeos relacionados" da resposta do Innertube (`/youtubei/v1/next`).
 *
 * Vive em `supabase/functions/_shared/` porque é código de produção compartilhado:
 * a Edge Function `youtube-video-info` o usa no deploy, e `src/test/innertube-related.test.ts`
 * o exercita contra um payload REAL capturado do endpoint. Manter a lógica aqui é o que
 * permite testar o código que roda, e não uma cópia.
 *
 * Por que existe: em 2026 o YouTube mudou o renderer da coluna de recomendações de
 * `compactVideoRenderer` para `lockupViewModel`. Quem só conhece a chave antiga recebe
 * `relatedVideos: []` para qualquer vídeo -- que era o sintoma observado em produção
 * (comments vinham cheios, relacionadas sempre vazias, e o autoplay "próxima
 * relacionada" do NowPlayingView nunca disparava).
 */

export interface RelatedVideoLite {
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

/** "1:02:03" -> 3723, "4:05" -> 245, qualquer outra coisa -> 0. */
export function parseDuration(text: string | undefined | null): number {
  if (!text) return 0;
  const parts = String(text).split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** Texto de um node `{ content }` | `{ simpleText }` | `{ runs: [{ text }] }`. */
function textOf(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.content) return String(node.content);
  if (node.simpleText) return String(node.simpleText);
  if (Array.isArray(node.runs) && node.runs[0]?.text) return String(node.runs[0].text);
  return "";
}

/** Maior thumbnail de um `{ sources: [...] }` ou `{ thumbnails: [...] }`. */
function bestThumb(holder: any, preferLarge = true): string {
  const list = holder?.sources || holder?.thumbnails || [];
  if (!Array.isArray(list) || list.length === 0) return "";
  const withSize = list.map((s: any) => ({
    url: s.url || "",
    area: (s.width || 0) * (s.height || 0),
  })).filter((s: any) => s.url);
  if (withSize.length === 0) return "";
  withSize.sort((a: any, b: any) => a.area - b.area);
  return (preferLarge ? withSize[withSize.length - 1] : withSize[0]).url;
}

/** Caminhos onde o YouTube já publicou (e publica hoje) a lista de recomendações. */
export function collectRecommendationItems(payload: any): any[] {
  const buckets: any[] = [];
  const secondary = payload?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results;
  if (Array.isArray(secondary)) buckets.push(...secondary);
  const reel = payload?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems;
  if (Array.isArray(reel)) buckets.push(...reel);
  const fallback = payload?.contents?.singleColumnWatchNextResults?.results?.results?.contents;
  if (Array.isArray(fallback)) {
    for (const c of fallback) {
      const r = c?.itemSectionRenderer?.contents;
      if (Array.isArray(r)) buckets.push(...r);
    }
  }
  return buckets;
}

function fromLockup(lockup: any): RelatedVideoLite | null {
  const videoId = lockup?.contentId;
  if (!videoId) return null;
  const meta = lockup?.metadata?.lockupMetadataViewModel || {};
  const image = lockup?.contentImage?.thumbnailViewModel || {};
  // duracao vem como badge sobreposta a thumbnail ("44:54")
  const badges = (image.overlays || [])
    .flatMap((o: any) => o?.thumbnailBottomOverlayViewModel?.badges || [])
    .map((b: any) => b?.thumbnailBadgeViewModel?.text)
    .filter(Boolean);
  const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  const parts = rows.flatMap((r: any) => r?.metadataParts || []);
  const texts = parts.map((p: any) => textOf(p?.text)).filter(Boolean);
  // linhas tipicas: [canal] depois [views, publicado]
  const channel = texts[0] || "";
  const views = texts[1] || "";
  const publishedTime = texts[2] || "";
  const duration = badges[0] || "";
  return {
    videoId: String(videoId),
    title: textOf(meta?.title),
    channel,
    channelThumbnail: bestThumb(
      meta?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image,
      false,
    ),
    // Some lockups (live/upcoming/ads) chegam sem thumbnail. O URL canonicos do
    // ytimg funciona para qualquer videoId, entao a card nao fica quebrada.
    thumbnail: bestThumb(image?.image) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration,
    views,
    publishedTime,
    lengthSeconds: parseDuration(duration),
    description: "",
  };
}

function fromCompactOrLegacy(r: any): RelatedVideoLite | null {
  const videoId = r?.videoId;
  if (!videoId) return null;
  const thumbs = r?.thumbnail?.thumbnails || [];
  const duration = r?.lengthText?.simpleText || r?.lengthText?.runs?.[0]?.text || "";
  return {
    videoId: String(videoId),
    title: textOf(r?.title),
    channel: textOf(r?.longBylineText) || textOf(r?.shortBylineText) || textOf(r?.ownerText),
    channelThumbnail: "",
    thumbnail: thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "",
    duration,
    views: textOf(r?.viewCountText),
    publishedTime: textOf(r?.publishedTimeText),
    lengthSeconds: parseDuration(duration),
    description: "",
  };
}

/**
 * Extrai as recomendações de um payload do `/next`. Aceita `lockupViewModel` (formato
 * atual), `compactVideoRenderer`/`videoRenderer` (formatos antigos, mantidos porque o
 * YouTube ainda os emite para alguns clients/A-B tests) e o invólucro `richItemRenderer`.
 */
export function parseRelatedFromNext(payload: any, max = 15): RelatedVideoLite[] {
  const out: RelatedVideoLite[] = [];
  const seen = new Set<string>();
  const push = (v: RelatedVideoLite | null) => {
    if (!v || !v.videoId || seen.has(v.videoId)) return;
    // Titulo e obrigatorio: sem ele o card fica inutil (e e o que distingue um
    // lockup real de placeholder tipo "assistir mais tarde"/anuncio).
    if (!v.title) return;
    seen.add(v.videoId);
    out.push(v);
  };

  for (const item of collectRecommendationItems(payload)) {
    if (out.length >= max) break;
    if (!item || typeof item !== "object") continue;
    if (item.lockupViewModel) push(fromLockup(item.lockupViewModel));
    else if (item.richItemRenderer?.content?.lockupViewModel) push(fromLockup(item.richItemRenderer.content.lockupViewModel));
    else if (item.compactVideoRenderer) push(fromCompactOrLegacy(item.compactVideoRenderer));
    else if (item.videoRenderer) push(fromCompactOrLegacy(item.videoRenderer));
    else if (item.gridVideoRenderer) push(fromCompactOrLegacy(item.gridVideoRenderer));
    else if (item.playlistVideoRenderer) push(fromCompactOrLegacy(item.playlistVideoRenderer));
  }
  return out.slice(0, max);
}
