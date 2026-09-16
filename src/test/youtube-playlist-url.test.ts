import { describe, it, expect } from "vitest";
import { extractYouTubePlaylistId } from "@/lib/youtubePlaylist";

const PL = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSV";
const OL = "OLAK5uy_mB9oeT7E3pYQ9z8dCnoC3F6v8Q4bKxYJU";

describe("extractYouTubePlaylistId", () => {
  it("aceita URL de playlist do YouTube", () => {
    expect(extractYouTubePlaylistId(`https://www.youtube.com/playlist?list=${PL}`)).toBe(PL);
    expect(extractYouTubePlaylistId(`youtube.com/playlist?list=${PL}`)).toBe(PL);
  });

  it("aceita URL do YouTube Music", () => {
    expect(extractYouTubePlaylistId(`https://music.youtube.com/playlist?list=${OL}`)).toBe(OL);
    expect(extractYouTubePlaylistId(`https://music.youtube.com/playlist?list=${PL}`)).toBe(PL);
  });

  it("extrai list= de URL de watch (vídeo dentro de playlist)", () => {
    expect(
      extractYouTubePlaylistId(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${PL}&index=3`),
    ).toBe(PL);
    expect(extractYouTubePlaylistId(`https://youtu.be/dQw4w9WgXcQ?list=${PL}`)).toBe(PL);
  });

  it("aceita ID cru com prefixos conhecidos", () => {
    expect(extractYouTubePlaylistId(PL)).toBe(PL);
    expect(extractYouTubePlaylistId(OL)).toBe(OL);
    expect(extractYouTubePlaylistId(`VL${PL}`)).toBe(PL); // VL = prefixo de browse, removido
    expect(extractYouTubePlaylistId("UUswt9B2xu8MSvDzBAGDrIzQ")).toBe("UUswt9B2xu8MSvDzBAGDrIzQ");
  });

  it("tolera lixo em volta (aspas, espaços, colchetes)", () => {
    expect(extractYouTubePlaylistId(`  "https://www.youtube.com/playlist?list=${PL}" `)).toBe(PL);
  });

  it("rejeita entradas sem playlist", () => {
    expect(extractYouTubePlaylistId("")).toBeNull();
    expect(extractYouTubePlaylistId("   ")).toBeNull();
    expect(extractYouTubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(extractYouTubePlaylistId("https://google.com/playlist?list=PLabc123")).toBeNull();
    expect(extractYouTubePlaylistId("dQw4w9WgXcQ")).toBeNull(); // videoId, não playlist
    expect(extractYouTubePlaylistId("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});
