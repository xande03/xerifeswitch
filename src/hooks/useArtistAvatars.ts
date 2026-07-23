import { useEffect, useState } from "react";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";
import { searchYouTubeGeneral } from "@/lib/youtubeGeneralSearch";

const CACHE_KEY = "xerife_artist_avatars_v2";
const TTL_MS = 6 * 60 * 60 * 1000; // 6h – mantém avatares atualizados

interface Entry { url: string; ts: number }
type Store = Record<string, Entry>;

function read(): Store {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
function write(s: Store) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch {}
}

async function fetchOne(name: string): Promise<string | null> {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const target = norm(name);

  // 1) Preferência: canal oficial via general-search (retorna channelThumbnail =
  //    o avatar real do canal do artista/banda, o mais próximo do "perfil").
  try {
    const vids = await searchYouTubeGeneral(name);
    const withAvatar = vids.find(v => v.channelThumbnail?.startsWith("http") && norm(v.channel).includes(target))
      || vids.find(v => v.channelThumbnail?.startsWith("http"));
    if (withAvatar?.channelThumbnail) return withAvatar.channelThumbnail;
  } catch {}

  // 2) Fallback: card de artista no YouTube Music (`filter=artists`).
  try {
    const res = await searchYouTubeMusic(name, "artists");
    const match = res.find(r => norm(r.artist) === target || norm(r.title) === target)
      || res.find(r => norm(r.artist).includes(target) || norm(r.title).includes(target))
      || res[0];
    if (match?.cover) return match.cover;
  } catch {}

  return null;
}


/**
 * Resolve o avatar oficial de cada artista via YouTube Music (filtro `artists`),
 * cacheando em localStorage com TTL curto para manter as imagens atualizadas.
 */
export function useArtistAvatars(names: string[]): Record<string, string> {
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (names.length === 0) { setAvatars({}); return; }
    let alive = true;
    const store = read();
    const now = Date.now();
    const initial: Record<string, string> = {};
    const missing: string[] = [];
    for (const n of names) {
      const e = store[n.toLowerCase()];
      if (e && now - e.ts < TTL_MS && e.url) initial[n] = e.url;
      else missing.push(n);
    }
    if (Object.keys(initial).length) setAvatars(initial);
    if (missing.length === 0) return;

    (async () => {
      const updates: Record<string, string> = { ...initial };
      await Promise.all(missing.map(async (n) => {
        const url = await fetchOne(n);
        if (url) {
          updates[n] = url;
          store[n.toLowerCase()] = { url, ts: Date.now() };
        }
      }));
      if (!alive) return;
      write(store);
      setAvatars(updates);
    })();
    return () => { alive = false; };
  }, [names.join("|")]);

  return avatars;
}
