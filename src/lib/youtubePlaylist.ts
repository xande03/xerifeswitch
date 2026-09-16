import { supabase } from "@/integrations/supabase/client";
import { createFunctionHeaders, createFunctionUrl } from "@/lib/backendConfig";

/** Faixa importada no formato usado nas playlists locais. */
export interface ImportedTrack {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
}

export interface ImportedPlaylist {
  listId: string;
  title: string;
  cover: string;
  tracks: ImportedTrack[];
  /** Origem dos dados (diagnóstico): função dedicada ou fallback deployado. */
  source: "youtube-playlist" | "youtube-album-tracks";
}

/**
 * Extrai o ID de uma playlist do YouTube de várias formas:
 * - https://www.youtube.com/playlist?list=PLxxxx
 * - https://music.youtube.com/playlist?list=OLAK5uy_xxxx
 * - https://www.youtube.com/watch?v=VIDEO&list=PLxxxx
 * - https://youtu.be/VIDEO?list=PLxxxx
 * - ID cru: PL…, UU…, OLAK5uy_…, VL…, RD…, LL…, FL…
 */
export function extractYouTubePlaylistId(input: string): string | null {
  if (!input) return null;
  let trimmed = input.trim().replace(/^[<"'\[(]+|[>"'\])]+$/g, "").trim();
  if (!trimmed) return null;

  // IDs de playlist têm prefixos conhecidos
  const ID_RE = /^(PL|UU|LL|FL|RD|VL|OL|MC)[A-Za-z0-9_-]{6,}$/;
  if (ID_RE.test(trimmed)) return trimmed.startsWith("VL") ? trimmed.slice(2) : trimmed;

  if (!/youtu\.?be/i.test(trimmed)) return null;

  const tryParse = (raw: string): string | null => {
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
      if (host !== "youtu.be" && !host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) {
        return null;
      }
      const list = url.searchParams.get("list");
      if (list && ID_RE.test(list)) {
        return list.startsWith("VL") ? list.slice(2) : list;
      }
      // /playlist/<id> não existe oficialmente, mas usuários colam variações;
      // aceite o último segmento se já temos domínio do YouTube
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "playlist" && parts[1] && ID_RE.test(parts[1])) {
        return parts[1].startsWith("VL") ? parts[1].slice(2) : parts[1];
      }
    } catch { /* ignore */ }
    return null;
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  // Varredura final: "list=ID" em qualquer lugar da string
  const match = trimmed.match(/[?&]list=([A-Za-z0-9_-]{6,})/);
  if (match && ID_RE.test(match[1])) {
    return match[1].startsWith("VL") ? match[1].slice(2) : match[1];
  }
  return null;
}

function normalizeTracks(raw: any[]): ImportedTrack[] {
  const out: ImportedTrack[] = [];
  const seen = new Set<string>();
  for (const t of raw || []) {
    const youtubeId = typeof t?.youtubeId === "string" ? t.youtubeId : "";
    if (!youtubeId || seen.has(youtubeId)) continue;
    seen.add(youtubeId);
    out.push({
      id: typeof t?.id === "string" && t.id ? t.id : `yt-${youtubeId}`,
      youtubeId,
      title: String(t?.title || "Sem título"),
      artist: String(t?.artist || "Desconhecido"),
      cover: String(t?.cover || ""),
      duration: Number.isFinite(t?.duration) ? Math.round(t.duration) : 0,
    });
  }
  return out;
}

/**
 * Busca título, capa e faixas de uma playlist pública do YouTube.
 *
 * Estratégia:
 * 1. Edge Function dedicada `youtube-playlist` (parser WEB + WEB_REMIX com
 *    continuação) — ideal, mas depende de deploy.
 * 2. Fallback: `youtube-album-tracks` (JÁ deployada) via browseId="VL<id>" —
 *    funciona para playlists acessíveis no YouTube Music (~primeira página).
 */
export async function fetchYouTubePlaylist(input: string): Promise<ImportedPlaylist> {
  const listId = extractYouTubePlaylistId(input);
  if (!listId) throw new Error("invalid-url");

  // 1) Função dedicada (quando deployada)
  try {
    const { data, error } = await supabase.functions.invoke("youtube-playlist", {
      body: { playlistId: listId },
    });
    if (!error && data?.tracks?.length) {
      return {
        listId,
        title: String(data.title || "Playlist do YouTube"),
        cover: String(data.cover || ""),
        tracks: normalizeTracks(data.tracks),
        source: "youtube-playlist",
      };
    }
  } catch { /* cai no fallback */ }

  // 2) Fallback deployado hoje: youtube-album-tracks
  const res = await fetch(
    createFunctionUrl("youtube-album-tracks", { browseId: `VL${listId}` }),
    { headers: createFunctionHeaders(), signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "fetch-failed");
  const data = await res.json();
  const tracks = normalizeTracks(data?.tracks || []);
  if (!tracks.length) throw new Error("empty");

  return {
    listId,
    title: String(data?.albumTitle || "Playlist do YouTube"),
    cover: String(data?.albumCover || tracks[0]?.cover || ""),
    tracks,
    source: "youtube-album-tracks",
  };
}
