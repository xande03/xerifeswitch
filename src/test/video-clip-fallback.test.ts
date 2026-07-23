// Xerife Music — sonda distingue clipe REAL vs. capa/tema (áudio-com-imagem).
// - Falha de rede NUNCA marca indisponível (retorna 'unknown' → retry).
// - Resultados "cover-only" (canais Topic, "Official Audio", lyric video)
//   são filtrados; a sonda não os usa como clipe.
// - Só marca 'available' quando há um clipe real com score suficiente.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/youtubeGeneralSearch", () => ({
  searchYouTubeGeneral: vi.fn(),
}));

import { searchYouTubeGeneral } from "@/lib/youtubeGeneralSearch";
import { probeVideoClip } from "@/lib/videoClipAvailability";

let songCounter = 0;
const makeSong = () => ({
  id: `song-live-${++songCounter}`,
  title: "Musica Ao Vivo",
  artist: "Artista X",
  youtubeId: "YT_FALLBACK_1",
});

beforeEach(() => {
  try { localStorage.clear(); } catch {}
  vi.clearAllMocks();
});

describe("videoClipAvailability — clipe real vs capa/tema", () => {
  it("falha de rede: retorna 'unknown' (nunca marca indisponível)", async () => {
    const song = makeSong();
    (searchYouTubeGeneral as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("net"));
    const r = await probeVideoClip(song);
    expect(r.status).toBe("unknown");
  });

  it("busca vazia: marca indisponível (esconde o botão de Vídeo)", async () => {
    const song = makeSong();
    (searchYouTubeGeneral as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const r = await probeVideoClip(song);
    expect(r.status).toBe("unavailable");
  });

  it("clipe real de alta relevância: seleciona o clipe oficial", async () => {
    const song = makeSong();
    (searchYouTubeGeneral as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { videoId: "OFFICIAL_CLIP", title: `${song.artist} ${song.title} clipe oficial`, channel: `${song.artist} VEVO` },
    ]);
    const r = await probeVideoClip(song);
    expect(r.status).toBe("available");
    expect(r.videoId).toBe("OFFICIAL_CLIP");
  });

  it("filtra Topic (capa/tema): não seleciona canais '- Topic'", async () => {
    const song = makeSong();
    (searchYouTubeGeneral as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { videoId: "TOPIC_ID", title: `${song.title}`, channel: `${song.artist} - Topic` },
    ]);
    const r = await probeVideoClip(song);
    expect(r.status).toBe("unavailable");
  });

  it("filtra 'Official Audio' (capa/tema): não seleciona áudio-com-imagem", async () => {
    const song = makeSong();
    (searchYouTubeGeneral as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { videoId: "AUDIO_ONLY", title: `${song.artist} - ${song.title} (Official Audio)`, channel: song.artist },
    ]);
    const r = await probeVideoClip(song);
    expect(r.status).toBe("unavailable");
  });
});
