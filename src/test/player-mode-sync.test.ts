// Verifica o canal de sincronização de modo do player entre abas do mesmo
// dispositivo. Em ambientes sem BroadcastChannel real, o módulo também emite
// um CustomEvent local — o teste valida esse caminho.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { broadcastPlayerMode, subscribePlayerMode } from "@/lib/playerModeSync";

beforeEach(() => {
  try { localStorage.clear(); } catch {}
});

describe("playerModeSync", () => {
  it("emite o modo e songId para inscritos locais", async () => {
    const cb = vi.fn();
    const unsub = subscribePlayerMode(cb);
    broadcastPlayerMode("video", "song-1");
    expect(cb).toHaveBeenCalledWith("video", "song-1");
    unsub();
  });

  it("após unsubscribe não recebe mais eventos", () => {
    const cb = vi.fn();
    const unsub = subscribePlayerMode(cb);
    unsub();
    broadcastPlayerMode("lyrics", "song-2");
    expect(cb).not.toHaveBeenCalled();
  });

  it("propaga sucessivas mudanças de modo em ordem", () => {
    const seen: string[] = [];
    const unsub = subscribePlayerMode((m) => seen.push(m));
    broadcastPlayerMode("audio", "s");
    broadcastPlayerMode("video", "s");
    broadcastPlayerMode("lyrics", "s");
    expect(seen).toEqual(["audio", "video", "lyrics"]);
    unsub();
  });
});
