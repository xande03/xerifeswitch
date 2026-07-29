import type { VideoResult } from "@/lib/youtubeGeneralSearch";

/** Normaliza nome de canal para comparação (acentos, caixa, sufixos e símbolos). */
export function normalizeChannelKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2713\u2714✓✔]/g, "")
    .replace(/\b(oficial|official|podcast|cast|tv|channel|canal)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Normaliza título de episódio para detectar reuploads/duplicatas. */
export function normalizeEpisodeKey(title: string, channel?: string): string {
  const t = (title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((completo|full|hd|4k|ao vivo|live)\)/g, "")
    .replace(/\[(completo|full|hd|4k|ao vivo|live)\]/g, "")
    .replace(/\b(podcast|episodio|ep|cortes|completo|full|hd|4k)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return `${normalizeChannelKey(channel || "")}::${t}`;
}

/**
 * Remove duplicatas de resultados de vídeo: mesmo videoId ou mesmo
 * título+canal (reuploads). Mantém a primeira ocorrência (maior relevância)
 * e prefere a versão mais longa quando houver empate de título.
 */
export function dedupeVideos<T extends Pick<VideoResult, "videoId" | "title" | "channel" | "lengthSeconds">>(
  list: T[],
): T[] {
  const byId = new Map<string, T>();
  const byTitle = new Map<string, string>(); // titleKey -> videoId escolhido

  for (const v of list) {
    if (!v || !v.videoId) continue;
    if (byId.has(v.videoId)) continue;

    const tKey = normalizeEpisodeKey(v.title, v.channel);
    if (tKey.replace("::", "").length > 6) {
      const existingId = byTitle.get(tKey);
      if (existingId) {
        const existing = byId.get(existingId);
        // Mantém a versão mais longa (evita cortes substituindo o episódio completo)
        if (existing && (v.lengthSeconds || 0) > (existing.lengthSeconds || 0) * 1.2) {
          byId.delete(existingId);
          byId.set(v.videoId, v);
          byTitle.set(tKey, v.videoId);
        }
        continue;
      }
      byTitle.set(tKey, v.videoId);
    }
    byId.set(v.videoId, v);
  }

  return Array.from(byId.values());
}
