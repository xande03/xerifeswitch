/**
 * E2E-style tests (jsdom) — simulate a full page reload cycle by clearing
 * the module cache and re-importing the storage APIs, guaranteeing the data
 * survives independently of any in-memory state. Also validates cross-module
 * navigation (Music → Videos → Podcasts) preserves order and deduplication.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Snapshot of localStorage between "reloads"
function snapshotStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    out[k] = localStorage.getItem(k)!;
  }
  return out;
}

function restoreStorage(snap: Record<string, string>) {
  localStorage.clear();
  for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
}

// Simulates a full page reload: preserves localStorage, wipes module cache
// so any in-memory caches in modules are rebuilt from disk.
async function reload() {
  const snap = snapshotStorage();
  // @ts-ignore - vitest exposes this
  const { resetModules } = await import("vitest");
  // vi.resetModules is the canonical API
  const { vi } = await import("vitest");
  vi.resetModules();
  restoreStorage(snap);
  const storage = await import("@/lib/localStorage");
  const video = await import("@/components/VideoHomeScreen");
  return { storage, video };
}

beforeEach(() => {
  localStorage.clear();
});

const song = (id: string, type: "music" | "video" | "podcast" = "music") => ({
  id, title: `T-${id}`, artist: "A", album: "B", cover: "c.jpg",
  duration: 120, votes: 0, type,
});

const video = (id: string): any => ({
  videoId: id, title: `V-${id}`, channel: "C", channelTitle: "C",
  channelThumbnail: "ct.jpg", thumbnail: "t.jpg", duration: "2:00",
  publishedAt: "2024-01-01", publishedTime: "1d", viewCount: "10", views: "10",
});

describe("E2E: coração/Salvar sobrevivem a reload completo", () => {
  it("favoritos (coração) permanecem após reload do módulo", async () => {
    const s1 = await import("@/lib/localStorage");
    s1.saveFavoriteMetadata(song("m1"));
    s1.saveFavoriteMetadata(song("m2"));

    const { storage } = await reload();
    const favs = storage.getFavoritesMetadata();
    expect(favs).toHaveLength(2);
    expect(favs.map((f: any) => f.id).sort()).toEqual(["m1", "m2"]);
  });

  it("watch_later (Salvar) permanece após reload do módulo", async () => {
    const v1 = await import("@/components/VideoHomeScreen");
    v1.addToWatchLater(video("v1"));
    v1.addToWatchLater(video("v2"));

    const { video: v2 } = await reload();
    expect(v2.getWatchLater()).toHaveLength(2);
    expect(v2.isInWatchLater("v1")).toBe(true);
    expect(v2.isInWatchLater("v2")).toBe(true);
  });

  it("não gera duplicatas ao curtir/salvar antes e depois do reload", async () => {
    const s1 = await import("@/lib/localStorage");
    const v1 = await import("@/components/VideoHomeScreen");
    s1.saveFavoriteMetadata(song("dup"));
    v1.addToWatchLater(video("dup"));

    const { storage, video: v2 } = await reload();
    // repetir a ação após "reload" não deve criar duplicatas
    storage.saveFavoriteMetadata(song("dup"));
    v2.addToWatchLater(video("dup"));
    v2.addToWatchLater(video("dup"));

    expect(storage.getFavoritesMetadata()).toHaveLength(1);
    expect(v2.getWatchLater()).toHaveLength(1);
  });
});

describe("E2E: navegação entre Music / Videos / Podcasts", () => {
  it("adicionar em módulos diferentes preserva ordem (mais recente primeiro)", async () => {
    const v = await import("@/components/VideoHomeScreen");
    v.addToWatchLater(video("music-track"));
    v.addToWatchLater(video("video-clip"));
    v.addToWatchLater(video("podcast-ep"));

    const { video: v2 } = await reload();
    expect(v2.getWatchLater().map((x: any) => x.videoId)).toEqual([
      "podcast-ep",
      "video-clip",
      "music-track",
    ]);
  });

  it("favoritar mesmo item nos 3 módulos não duplica (id único)", async () => {
    const s = await import("@/lib/localStorage");
    s.saveFavoriteMetadata(song("shared", "music"));
    s.saveFavoriteMetadata(song("shared", "video"));
    s.saveFavoriteMetadata(song("shared", "podcast"));

    const { storage } = await reload();
    expect(storage.getFavoritesMetadata()).toHaveLength(1);
  });

  it("remover em um módulo não afeta os demais e mantém ordem", async () => {
    const v = await import("@/components/VideoHomeScreen");
    v.addToWatchLater(video("a"));
    v.addToWatchLater(video("b"));
    v.addToWatchLater(video("c"));
    v.addToWatchLater(video("d"));

    v.removeFromWatchLater("b");

    const { video: v2 } = await reload();
    expect(v2.getWatchLater().map((x: any) => x.videoId)).toEqual(["d", "c", "a"]);
  });

  it("stores de coração e Salvar são independentes e coexistem após reload", async () => {
    const s = await import("@/lib/localStorage");
    const v = await import("@/components/VideoHomeScreen");

    s.saveFavoriteMetadata(song("x", "video"));
    v.addToWatchLater(video("x"));

    const { storage, video: v2 } = await reload();

    // Remover só do coração não afeta o Salvar
    storage.removeFavoriteMetadata("x");
    expect(storage.getFavoritesMetadata()).toHaveLength(0);
    expect(v2.isInWatchLater("x")).toBe(true);

    // Remover só do Salvar não afeta futuras curtidas
    v2.removeFromWatchLater("x");
    storage.saveFavoriteMetadata(song("x", "video"));
    expect(storage.getFavoritesMetadata()).toHaveLength(1);
    expect(v2.isInWatchLater("x")).toBe(false);
  });
});

describe("E2E: garantia de UI - dados disponíveis imediatamente após reload", () => {
  it("getFavoritesMetadata retorna array vazio quando storage vazio (sem crash)", async () => {
    const { storage, video: v } = await reload();
    expect(storage.getFavoritesMetadata()).toEqual([]);
    expect(v.getWatchLater()).toEqual([]);
    expect(v.isInWatchLater("any")).toBe(false);
  });

  it("dados corrompidos no localStorage não quebram a leitura (fallback [])", async () => {
    localStorage.setItem("demus_favorites_metadata", "{not json");
    localStorage.setItem("demus_watch_later", "[[[");
    const { storage, video: v } = await reload();
    expect(storage.getFavoritesMetadata()).toEqual([]);
    expect(v.getWatchLater()).toEqual([]);
  });
});
