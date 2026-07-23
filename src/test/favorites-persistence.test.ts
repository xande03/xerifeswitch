import { describe, it, expect, beforeEach } from "vitest";
import {
  saveFavoriteMetadata,
  getFavoritesMetadata,
  removeFavoriteMetadata,
} from "@/lib/localStorage";
import {
  addToWatchLater,
  removeFromWatchLater,
  isInWatchLater,
  getWatchLater,
} from "@/components/VideoHomeScreen";

// jsdom provides localStorage. Reset before every test to isolate.
beforeEach(() => {
  localStorage.clear();
});

const makeSong = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  title: `Song ${id}`,
  artist: "Artist",
  album: "Album",
  cover: "cover.jpg",
  duration: 180,
  votes: 0,
  type: "music" as const,
  ...extras,
});

const makeVideo = (videoId: string, extras: Record<string, unknown> = {}): any => ({
  videoId,
  title: `Video ${videoId}`,
  channel: "Channel",
  channelTitle: "Channel",
  channelThumbnail: "chan.jpg",
  thumbnail: "thumb.jpg",
  duration: "3:00",
  publishedAt: "2024-01-01",
  publishedTime: "1 day ago",
  viewCount: "100",
  views: "100",
  ...extras,
});

describe("Favoritos (coração/curtir) - persistência", () => {
  it("persiste no localStorage e sobrevive a 'reload' (releitura)", () => {
    saveFavoriteMetadata(makeSong("s1"));
    saveFavoriteMetadata(makeSong("s2"));

    // Simula reload: relê do storage
    const afterReload = getFavoritesMetadata();
    expect(afterReload).toHaveLength(2);
    expect(afterReload.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("não duplica ao curtir o mesmo item várias vezes", () => {
    saveFavoriteMetadata(makeSong("dup"));
    saveFavoriteMetadata(makeSong("dup"));
    saveFavoriteMetadata(makeSong("dup"));
    expect(getFavoritesMetadata()).toHaveLength(1);
  });

  it("remove corretamente sem afetar os demais", () => {
    saveFavoriteMetadata(makeSong("a"));
    saveFavoriteMetadata(makeSong("b"));
    saveFavoriteMetadata(makeSong("c"));
    removeFavoriteMetadata("b");
    expect(getFavoritesMetadata().map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("suporta favoritos de tipos distintos (music, video, podcast)", () => {
    saveFavoriteMetadata(makeSong("m1", { type: "music" }));
    saveFavoriteMetadata(makeSong("v1", { type: "video" }));
    saveFavoriteMetadata(makeSong("p1", { type: "podcast" }));

    const all = getFavoritesMetadata();
    expect(all.filter((s) => s.type === "music")).toHaveLength(1);
    expect(all.filter((s) => s.type === "video")).toHaveLength(1);
    expect(all.filter((s) => s.type === "podcast")).toHaveLength(1);
  });
});

describe("Salvar (joinha/Bookmark) - watch_later", () => {
  it("persiste e sobrevive a reload", () => {
    addToWatchLater(makeVideo("v1"));
    addToWatchLater(makeVideo("v2"));

    const afterReload = getWatchLater();
    expect(afterReload).toHaveLength(2);
    expect(isInWatchLater("v1")).toBe(true);
    expect(isInWatchLater("v2")).toBe(true);
  });

  it("não cria duplicatas ao salvar o mesmo vídeo várias vezes", () => {
    addToWatchLater(makeVideo("same"));
    addToWatchLater(makeVideo("same"));
    addToWatchLater(makeVideo("same"));
    expect(getWatchLater()).toHaveLength(1);
  });

  it("mantém ordem organizada (mais recente primeiro)", () => {
    addToWatchLater(makeVideo("first"));
    addToWatchLater(makeVideo("second"));
    addToWatchLater(makeVideo("third"));

    expect(getWatchLater().map((v) => v.videoId)).toEqual([
      "third",
      "second",
      "first",
    ]);
  });

  it("remove corretamente e preserva ordem dos restantes", () => {
    addToWatchLater(makeVideo("a"));
    addToWatchLater(makeVideo("b"));
    addToWatchLater(makeVideo("c"));
    removeFromWatchLater("b");
    expect(getWatchLater().map((v) => v.videoId)).toEqual(["c", "a"]);
  });

  it("limita a lista a 50 itens (proteção contra crescimento infinito)", () => {
    for (let i = 0; i < 60; i++) addToWatchLater(makeVideo(`v${i}`));
    const list = getWatchLater();
    expect(list.length).toBeLessThanOrEqual(50);
    // O mais recente deve estar no topo
    expect(list[0].videoId).toBe("v59");
  });
});

describe("Consistência entre Biblioteca e Favoritos após reload", () => {
  it("favoritar + salvar o mesmo conteúdo mantém ambos os stores independentes e sem duplicação", () => {
    const song = makeSong("shared", { type: "video" });
    const video = makeVideo("shared");

    saveFavoriteMetadata(song);
    saveFavoriteMetadata(song); // duplicata ignorada
    addToWatchLater(video);
    addToWatchLater(video); // duplicata ignorada

    // Simula reload
    expect(getFavoritesMetadata()).toHaveLength(1);
    expect(getWatchLater()).toHaveLength(1);
    expect(isInWatchLater("shared")).toBe(true);
  });
});
