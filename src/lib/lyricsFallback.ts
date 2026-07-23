import { LyricLine, LyricsResult } from "./lyrics";

/**
 * Enhanced fallback lyrics generator
 * In a real app, this could also scrape alternative sources
 */
export function getFallbackLyrics(artist: string, title: string): LyricsResult {
  return {
    lines: [
      { time: -1, text: `Letra indisponível para ${title}` },
      { time: -1, text: `Interpretado por ${artist}` },
      { time: -1, text: "Tente procurar outra versão ou faixa." }
    ],
    synced: false
  };
}
