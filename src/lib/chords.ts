import { supabase } from "@/integrations/supabase/client";
import { cleanArtist, cleanTitle, slugify } from "@/lib/mediaText";
import { getStoredChords, setStoredChords, removeStoredChords } from "@/lib/chordsStorage";

export interface ChordsResult {
  source: "vagalume" | "cifraclub" | "ug" | string;
  title: string;
  artist: string;
  key?: string | null;
  capo?: number | null;
  /** Texto pronto para render em <pre>, com acordes intercalados na letra. */
  chords: string;
  url?: string | null;
}

const memCache = new Map<string, ChordsResult | null>();

function cacheKey(artist: string, title: string): string {
  return `${cleanArtist(artist)}::${cleanTitle(title)}`;
}

export async function fetchChords(
  artist: string,
  title: string,
  opts: { skipCache?: boolean } = {},
): Promise<ChordsResult | null> {
  const key = cacheKey(artist, title);

  if (!opts.skipCache) {
    if (memCache.has(key)) return memCache.get(key)!;
    const persisted = getStoredChords(key);
    if (persisted !== undefined) {
      memCache.set(key, persisted);
      return persisted;
    }
  }

  let result: ChordsResult | null = null;
  try {
    const { data, error } = await supabase.functions.invoke("fetch-chords", {
      body: { artist: cleanArtist(artist), title: cleanTitle(title) },
    });
    if (!error && data && data.chords) {
      result = {
        source: data.source || "unknown",
        title: data.title || title,
        artist: data.artist || artist,
        key: data.key ?? null,
        capo: data.capo ?? null,
        chords: String(data.chords),
        url: data.url ?? null,
      };
    }
  } catch {
    /* ignore */
  }

  memCache.set(key, result);
  if (result) setStoredChords(key, result);
  return result;
}

export function invalidateChordsCache(artist: string, title: string) {
  const key = cacheKey(artist, title);
  memCache.delete(key);
  removeStoredChords(key);
}

/** URL de fallback para o Cifra Club (usada quando a busca automática falhar). */
export function cifraClubFallbackUrl(artist: string, title: string): string {
  const mainArtist = (artist || "").split(/[,&\/]|feat\.|ft\./i)[0].trim();
  const a = slugify(mainArtist);
  const t = slugify(title);
  if (a && t) return `https://www.cifraclub.com.br/${a}/${t}/`;
  return `https://www.cifraclub.com.br/?q=${encodeURIComponent(`${artist} ${title}`)}`;
}

/* ============================ Transposição ============================ */

const CHROMATIC_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
};

const CHORD_REGEX = /\b([A-G])(#|b)?((?:m(?:aj)?|sus|dim|aug|add)?\d{0,2}(?:sus\d?|add\d)?)(\/[A-G](#|b)?)?\b/g;

function shiftRoot(root: string, semitones: number): string {
  const normalized = FLAT_TO_SHARP[root] ?? root;
  const idx = CHROMATIC_SHARP.indexOf(normalized);
  if (idx < 0) return root;
  const next = (idx + semitones + 120) % 12;
  return CHROMATIC_SHARP[next];
}

/**
 * Transpõe um bloco de cifra em N semitons. Preserva formatação/espaçamento
 * do texto original — só substitui os tokens que são acordes válidos.
 */
export function transposeChords(text: string, semitones: number): string {
  if (!semitones) return text;
  const s = ((semitones % 12) + 12) % 12;
  return text.replace(CHORD_REGEX, (match, root: string, acc: string | undefined, suffix: string, bass: string | undefined) => {
    const fullRoot = `${root}${acc ?? ""}`;
    const newRoot = shiftRoot(fullRoot, s);
    let out = `${newRoot}${suffix ?? ""}`;
    if (bass) {
      const bRoot = bass.slice(1);
      out += `/${shiftRoot(bRoot, s)}`;
    }
    return out;
  });
}
