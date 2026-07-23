/**
 * Helpers de normalização de artista/título compartilhados entre
 * lyrics e chords. Extraídos para evitar divergência entre módulos.
 */

export function cleanArtist(a: string): string {
  return (a || "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*official$/i, "")
    .replace(/\s*channel$/i, "")
    .replace(/\s*records?$/i, "")
    .trim();
}

export function cleanTitle(t: string): string {
  return (t || "")
    .replace(/\((?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|mv|m\/v|live|ao vivo|acústic[oa]|karaoke)[^)]*\)/gi, "")
    .replace(/\[(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|mv|m\/v|live|ao vivo|acústic[oa]|karaoke)[^\]]*\]/gi, "")
    .replace(/(?:^|\s)(?:ft\.?|feat\.?|featuring|com)\s+[^-–—(\[]+/gi, "")
    .replace(/[-–—]\s*(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|live|ao vivo|acústic[oa]).*/gi, "")
    .replace(/\|.*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function primaryArtist(a: string): string {
  return (a || "").split(/[,&\/]|\bfeat\.?\b|\bft\.?\b|\bcom\b/i)[0].trim();
}

export function stripAllBrackets(s: string): string {
  return (s || "").replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();
}

export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\(.*\)/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Quando o "artista" vem de um canal genérico do YouTube (VEVO, Topic,
 * Records, nome do usuário), tentamos derivar o artista real do título
 * usando o padrão "Artista - Título".
 */
export function deriveArtistFromChannel(channel: string, title: string): { artist: string; title: string } {
  const ch = channel || "";
  const looksGeneric = /vevo|topic|records|music|official|channel|-\s*topic/i.test(ch);
  const hyphenIdx = title.indexOf(" - ");
  if (looksGeneric && hyphenIdx > 0 && hyphenIdx < title.length - 3) {
    return {
      artist: title.slice(0, hyphenIdx).trim(),
      title: title.slice(hyphenIdx + 3).trim(),
    };
  }
  return { artist: cleanArtist(ch), title: cleanTitle(title) };
}

/** Tokens de artista/título em comum (retorna quantidade). */
export function tokenOverlap(a: string, b: string): number {
  const aT = new Set(normalizeText(a).split(" ").filter((t) => t.length > 1));
  const bT = normalizeText(b).split(" ").filter((t) => t.length > 1);
  let n = 0;
  for (const t of bT) if (aT.has(t)) n++;
  return n;
}
