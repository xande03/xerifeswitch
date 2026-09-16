/**
 * Testa o parser de recomendacoes do Innertube contra um payload REAL do
 * `POST /youtubei/v1/next` (fixture em src/test/fixtures/innertube-next-live.json,
 * capturado em 2026-09-16) -- e nao contra uma forma inventada.
 *
 * Este e o codigo que a Edge Function `youtube-video-info` roda em producao:
 * o import vem de supabase/functions/_shared, entao um teste verde significa que
 * o deploy vai se comportar assim.
 *
 * Regressao que originou o arquivo: `relatedVideos` sempre `[]` em producao porque o
 * parser so conhecia `compactVideoRenderer`; o YouTube hoje entrega `lockupViewModel`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseRelatedFromNext,
  collectRecommendationItems,
  parseDuration,
} from "../../supabase/functions/_shared/innertubeRelated.ts";

// Lido por fs (e nao import JSON) para nao exigir resolveJsonModule no tsconfig do app.
// import.meta.url nao serve aqui: no ambiente jsdom do vitest ele vira URL http.
const FIXTURE = path.resolve(process.cwd(), "src/test/fixtures/innertube-next-live.json");
const live = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("innertubeRelated (parser compartilhado da edge function)", () => {
  it("extrai do caminho twoColumnWatchNextResults que a funcao usa", () => {
    const items = collectRecommendationItems(live);
    expect(items.length).toBe(4); // 3 lockups + 1 embrulhado em richItemRenderer
  });

  it("resolve lockupViewModel (formato atual do YouTube)", () => {
    const rel = parseRelatedFromNext(live);
    expect(rel.map((r) => r.videoId)).toEqual(["yPYZpwSpKmA", "Khow-kh-af4", "UZ7a7ufLllo"]);
    expect(rel[0].title).toContain("Together Forever");
    expect(rel[0].channel).toBe("Rick Astley");
    // duracao vem como badge sobreposta a thumbnail, nao como lengthText
    expect(rel[0].duration).toBe("3:24");
    expect(rel[0].lengthSeconds).toBe(204);
    expect(rel[1].duration).toBe("1:29:42");
    expect(rel[1].lengthSeconds).toBe(5382);
  });

  it("preenche thumbnail e canal com URLs reais", () => {
    const rel = parseRelatedFromNext(live);
    expect(rel[0].thumbnail).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/yPYZpwSpKmA\//);
    expect(rel[0].channelThumbnail).toMatch(/^https:\/\/yt3\./);
  });

  it("deduplica o mesmo videoId vindo dentro de richItemRenderer", () => {
    const rel = parseRelatedFromNext(live);
    expect(rel.filter((r) => r.videoId === "yPYZpwSpKmA")).toHaveLength(1);
  });

  it("continua lendo o formato antigo compactVideoRenderer", () => {
    const legacy = {
      contents: {
        twoColumnWatchNextResults: {
          secondaryResults: {
            secondaryResults: {
              results: [
                {
                  compactVideoRenderer: {
                    videoId: "abc123",
                    title: { runs: [{ text: "Video antigo" }] },
                    longBylineText: { runs: [{ text: "Canal Antigo" }] },
                    lengthText: { simpleText: "10:00" },
                    viewCountText: { simpleText: "1 mi de visualizações" },
                    publishedTimeText: { simpleText: "há 3 anos" },
                    thumbnail: { thumbnails: [{ url: "http://t/1.jpg", width: 120 }, { url: "http://t/2.jpg", width: 480 }] },
                  },
                },
              ],
            },
          },
        },
      },
    };
    const rel = parseRelatedFromNext(legacy);
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({
      videoId: "abc123",
      title: "Video antigo",
      channel: "Canal Antigo",
      duration: "10:00",
      lengthSeconds: 600,
      views: "1 mi de visualizações",
      publishedTime: "há 3 anos",
      thumbnail: "http://t/2.jpg", // pega a maior, nao a primeira
    });
  });

  it("limita por max e ignora continuation/itens vazios", () => {
    expect(parseRelatedFromNext(live, 2)).toHaveLength(2);
    expect(parseRelatedFromNext({})).toEqual([]);
    expect(parseRelatedFromNext(undefined)).toEqual([]);
    expect(parseRelatedFromNext({ contents: { twoColumnWatchNextResults: { secondaryResults: { secondaryResults: { results: [{ continuationItemRenderer: {} }, { lockupViewModel: { contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" } }] } } } } }))
      .toEqual([]);
  });

  it("descarta item sem titulo e sintetiza thumbnail ausente", () => {
    const weird = {
      contents: { twoColumnWatchNextResults: { secondaryResults: { secondaryResults: { results: [
        // lockup sem thumbnail nem titulo (placeholder/anuncio) -> fora
        { lockupViewModel: { contentId: "AAA", metadata: { lockupMetadataViewModel: {} } } },
        // lockup com titulo mas sem thumbnail -> entra com URL canonica do ytimg
        { lockupViewModel: { contentId: "BBB", metadata: { lockupMetadataViewModel: { title: { content: "Sem thumb" } } } } },
      ] } } } },
    };
    const rel = parseRelatedFromNext(weird);
    expect(rel.map((r) => r.videoId)).toEqual(["BBB"]);
    expect(rel[0].thumbnail).toBe("https://i.ytimg.com/vi/BBB/hqdefault.jpg");
  });

  it("parseDuration cobre hh:mm:ss, mm:ss e lixo", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("4:05")).toBe(245);
    expect(parseDuration("")).toBe(0);
    expect(parseDuration(undefined)).toBe(0);
    expect(parseDuration("30")).toBe(0);
  });
});
