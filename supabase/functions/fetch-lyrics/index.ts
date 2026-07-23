import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UA = 'XerifeMusic/1.1 (https://xerifemusic.lovable.app)';

interface Candidate {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
}

interface Best {
  synced?: string;
  plain?: string;
  score: number;
}

function cleanArtist(a: string): string {
  return (a || '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .replace(/\s*official$/i, '')
    .replace(/\s*channel$/i, '')
    .replace(/\s*ft\.?\s*.*/i, '')
    .replace(/\s*feat\.?\s*.*/i, '')
    .trim();
}
function cleanTitle(t: string): string {
  return (t || '')
    .replace(/\((?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|mv|m\/v|live|ao vivo|acústic[oa]|karaoke)[^)]*\)/gi, '')
    .replace(/\[(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|mv|m\/v|live|ao vivo|acústic[oa]|karaoke)[^\]]*\]/gi, '')
    .replace(/(?:^|\s)(?:ft\.?|feat\.?|featuring|com)\s+[^-–—(\[]+/gi, '')
    .replace(/[-–—]\s*(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|live|ao vivo|acústic[oa]).*/gi, '')
    .replace(/\|.*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function stripAllBrackets(s: string): string {
  return s.replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}
function primaryArtist(a: string): string {
  return a.split(/[,&\/]|\bfeat\.?\b|\bft\.?\b|\bcom\b/i)[0].trim();
}
function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function tryFetch(url: string, timeoutMs = 5000): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function scoreResult(r: any, artist: string, title: string, duration?: number): number {
  const rA = norm(r.artistName || '');
  const rT = norm(r.trackName || '');
  const aTok = norm(artist).split(' ').filter(Boolean);
  const tTok = norm(title).split(' ').filter(Boolean);
  let s = 0;
  for (const t of aTok) if (t.length > 1 && rA.includes(t)) s += 2;
  for (const t of tTok) if (t.length > 1 && rT.includes(t)) s += 3;
  if (r.syncedLyrics) s += 15;
  if (r.plainLyrics) s += 4;
  if (duration && r.duration) {
    const diff = Math.abs(duration - r.duration);
    if (diff <= 2) s += 6;
    else if (diff <= 5) s += 3;
    else if (diff > 15) s -= 3;
  }
  return s;
}

async function lrclibGet(c: Candidate, best: Best): Promise<void> {
  const params = new URLSearchParams({ artist_name: c.artist, track_name: c.title });
  if (c.album) params.set('album_name', c.album);
  if (c.duration) params.set('duration', String(Math.round(c.duration)));
  const data = await tryFetch(`https://lrclib.net/api/get?${params}`);
  if (!data) return;
  const s = scoreResult(data, c.artist, c.title, c.duration);
  if (data.syncedLyrics && (!best.synced || s > best.score)) { best.synced = data.syncedLyrics; best.score = Math.max(best.score, s); }
  if (data.plainLyrics && !best.plain) best.plain = data.plainLyrics.trim();
}

async function lrclibSearch(query: string, artist: string, title: string, duration: number | undefined, best: Best): Promise<void> {
  const data = await tryFetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: query })}`, 6000);
  if (!Array.isArray(data)) return;
  const nA = norm(artist);
  const nT = norm(title);
  const scored = data
    .map((r: any) => ({ r, s: scoreResult(r, artist, title, duration) }))
    // Bloqueia mismatches óbvios: se nem o artista nem o título têm 1 token em comum, descarta.
    .filter(({ r }) => {
      const rA = norm(r.artistName || '');
      const rT = norm(r.trackName || '');
      const artistHit = nA.split(' ').some((t) => t.length > 1 && rA.includes(t));
      const titleHit = nT.split(' ').some((t) => t.length > 1 && rT.includes(t));
      return artistHit || titleHit;
    })
    .sort((a, b) => b.s - a.s);
  for (const { r, s } of scored.slice(0, 5)) {
    if (r.syncedLyrics && (!best.synced || s > best.score)) { best.synced = r.syncedLyrics; best.score = s; }
    if (r.plainLyrics && !best.plain) best.plain = r.plainLyrics.trim();
    if (best.synced && best.score >= 20) return;
  }
}

async function lyricsOvh(artist: string, title: string, best: Best): Promise<void> {
  if (best.plain) return;
  const data = await tryFetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, 5000);
  if (data?.lyrics) best.plain = String(data.lyrics).trim();
}

/** Lyrist – community proxy sobre o Genius (https://github.com/asrvd/lyrist) */
async function lyristFetch(artist: string, title: string, best: Best): Promise<void> {
  if (best.plain) return;
  const url = artist
    ? `https://lyrist.vercel.app/api/${encodeURIComponent(title)}/${encodeURIComponent(artist)}`
    : `https://lyrist.vercel.app/api/${encodeURIComponent(title)}`;
  const data = await tryFetch(url, 6000);
  if (data?.lyrics) best.plain = String(data.lyrics).trim();
}

/** Some Random API – fallback público (Musixmatch-like) */
async function someRandomApi(artist: string, title: string, best: Best): Promise<void> {
  if (best.plain) return;
  const q = [artist, title].filter(Boolean).join(" ").trim();
  if (!q) return;
  const data = await tryFetch(`https://some-random-api.com/others/lyrics?title=${encodeURIComponent(q)}`, 6000);
  if (data?.lyrics) best.plain = String(data.lyrics).trim();
}

/** ChartLyrics – SOAP-like REST público que devolve XML com letra */
async function chartLyrics(artist: string, title: string, best: Best): Promise<void> {
  if (best.plain) return;
  try {
    const res = await fetch(
      `https://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(title)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return;
    const xml = await res.text();
    const m = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/);
    if (m && m[1] && m[1].trim().length > 20) best.plain = m[1].trim();
  } catch { /* ignore */ }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const { artist, title, album, duration } = await req.json();
    if (!artist || !title) {
      return new Response(JSON.stringify({ error: 'artist and title required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cA = cleanArtist(artist);
    const cT = cleanTitle(title);
    const mainA = primaryArtist(cA);
    const strippedT = stripAllBrackets(cT);

    // Build a rich list of candidates, from most-specific to most-generic
    const candidates: Candidate[] = [
      { artist: cA, title: cT, album, duration },
      { artist: cA, title: cT, duration },
      { artist: cA, title: cT },
      { artist: mainA, title: cT },
      { artist: mainA, title: strippedT },
      { artist: cA, title: strippedT },
      { artist: artist, title: title },
    ];

    const best: Best = { score: 0 };

    // 1) /get for each candidate — stops early only if we've got a strong synced match
    for (const c of candidates) {
      if (!c.artist || !c.title) continue;
      await lrclibGet(c, best);
      if (best.synced && best.score >= 25) break;
    }

    // 2) /search variants if no strong synced yet
    if (!best.synced || best.score < 20) {
      const searches = [
        `${mainA} ${cT}`,
        `${cA} ${cT}`,
        `${mainA} ${strippedT}`,
        cT,
        strippedT,
      ];
      const seen = new Set<string>();
      for (const q of searches) {
        const key = q.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        await lrclibSearch(q, cA, cT, duration, best);
        if (best.synced && best.score >= 25) break;
      }
    }

    // 3) Fallbacks plain via múltiplas APIs públicas (paralelo, primeiro válido ganha)
    if (!best.synced && !best.plain) {
      await Promise.race([
        lyricsOvh(mainA || cA, strippedT || cT, best),
        lyristFetch(mainA || cA, strippedT || cT, best),
        someRandomApi(mainA || cA, strippedT || cT, best),
        chartLyrics(mainA || cA, strippedT || cT, best),
      ]);
      // Segunda passada sequencial garantindo cobertura caso a corrida
      // tenha resolvido com um resultado vazio.
      if (!best.plain) await lyristFetch(mainA || cA, strippedT || cT, best);
      if (!best.plain) await someRandomApi(mainA || cA, strippedT || cT, best);
      if (!best.plain) await chartLyrics(mainA || cA, strippedT || cT, best);
      if (!best.plain) await lyricsOvh(mainA || cA, strippedT || cT, best);
    }

    if (best.synced) {
      return new Response(JSON.stringify({ lyrics: best.synced, synced: true, source: 'lrclib' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (best.plain) {
      return new Response(JSON.stringify({ lyrics: best.plain, synced: false, source: 'multi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ lyrics: null, synced: false, error: 'Lyrics not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Lyrics fetch error:', error);
    return new Response(JSON.stringify({ lyrics: null, synced: false, error: 'Failed to fetch lyrics' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
