import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getClientIp, checkRateLimit, rateLimitResponse } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-ip",
};

const UA =
  "Mozilla/5.0 (compatible; XerifeMusicBot/1.0; +https://xerifemusic.lovable.app)";

/* ============================ helpers ============================ */

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(s: string): string {
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

function cleanArtist(a: string): string {
  return (a || "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*official$/i, "")
    .replace(/\s*channel$/i, "")
    .replace(/\s*records?$/i, "")
    .trim();
}

function cleanTitle(t: string): string {
  return (t || "")
    .replace(/\((?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|mv|m\/v|live|ao vivo|acústic[oa]|karaoke)[^)]*\)/gi, "")
    .replace(/\[(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|mv|m\/v|live|ao vivo|acústic[oa]|karaoke)[^\]]*\]/gi, "")
    .replace(/(?:^|\s)(?:ft\.?|feat\.?|featuring|com)\s+[^-–—(\[]+/gi, "")
    .replace(/[-–—]\s*(?:official|oficial|lyric[s]?|audio|áudio|hd|4k|remaster(?:ed)?|clip|clipe|video|live|ao vivo|acústic[oa]).*/gi, "")
    .replace(/\|.*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function primaryArtist(a: string): string {
  return (a || "").split(/[,&\/]|\bfeat\.?\b|\bft\.?\b|\bcom\b/i)[0].trim();
}

async function safeFetch(url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

async function safeJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const r = await safeFetch(url, {}, timeoutMs);
  if (!r) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function safeText(url: string, timeoutMs = 8000): Promise<string | null> {
  const r = await safeFetch(url, {}, timeoutMs);
  if (!r) return null;
  try {
    return await r.text();
  } catch {
    return null;
  }
}

/* =========================== Vagalume =========================== */

interface ChordsPayload {
  source: string;
  artist: string;
  title: string;
  key?: string | null;
  capo?: number | null;
  chords: string;
  url?: string | null;
}

async function vagalume(artist: string, title: string): Promise<ChordsPayload | null> {
  const q = `${artist} ${title}`.trim();
  const search = await safeJson(
    `https://api.vagalume.com.br/search.php?q=${encodeURIComponent(q)}&limit=6`,
  );
  const docs: any[] = search?.response?.docs || [];
  if (!docs.length) return null;

  const nA = norm(artist);
  const nT = norm(title);
  const best = docs
    .map((d) => {
      const s = (norm(d.band || "").split(" ").some((t: string) => t && nA.includes(t)) ? 3 : 0)
        + (norm(d.title || "").split(" ").some((t: string) => t && nT.includes(t)) ? 4 : 0);
      return { d, s };
    })
    .sort((a, b) => b.s - a.s)[0]?.d;
  if (!best?.id) return null;

  const detail = await safeJson(`https://api.vagalume.com.br/api/${best.id}.js`);
  const mus = detail?.mus?.[0];
  if (!mus?.cifra || String(mus.cifra).trim().length < 40) return null;

  return {
    source: "vagalume",
    artist: detail?.art?.name || best.band || artist,
    title: mus.name || best.title || title,
    key: mus.tom || null,
    capo: null,
    chords: String(mus.cifra).trim(),
    url: detail?.art?.url && mus.url ? `https://www.vagalume.com.br${mus.url}` : null,
  };
}

/* =========================== Cifra Club =========================== */

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>(\s|\n)?/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function cifraClubTryUrl(url: string, artist: string, title: string): Promise<ChordsPayload | null> {
  const html = await safeText(url, 8000);
  if (!html) return null;
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preMatch) return null;
  const chords = stripHtml(preMatch[1]).trim();
  if (chords.length < 40) return null;

  const keyMatch = html.match(/Tom:\s*<[^>]*>\s*<[^>]*>\s*([A-G][#b]?m?)/i)
    || html.match(/id=["']cifra_tom["'][^>]*>\s*<[^>]*>\s*([A-G][#b]?m?)/i)
    || html.match(/"tom"\s*:\s*"([A-G][#b]?m?)"/i);
  const capoMatch = html.match(/Capotraste[^0-9]*(\d{1,2})/i);

  return {
    source: "cifraclub",
    artist,
    title,
    key: keyMatch?.[1] || null,
    capo: capoMatch ? Number(capoMatch[1]) : null,
    chords,
    url,
  };
}

async function cifraClub(artist: string, title: string): Promise<ChordsPayload | null> {
  const mainArtist = primaryArtist(artist);

  // 1) Slug direto — variantes com e sem "the" e removendo diacríticos
  const artistVariants = Array.from(new Set([
    slug(mainArtist),
    slug(mainArtist.replace(/^the\s+/i, "")),
    slug(artist),
  ])).filter(Boolean);
  const titleVariants = Array.from(new Set([
    slug(title),
    slug(title.replace(/['’]/g, "")),
  ])).filter(Boolean);

  for (const a of artistVariants) {
    for (const t of titleVariants) {
      const url = `https://www.cifraclub.com.br/${a}/${t}/`;
      const hit = await cifraClubTryUrl(url, mainArtist || artist, title);
      if (hit) return hit;
    }
  }

  // 2) Fallback: busca pelo motor do próprio Cifra Club e usa o 1º resultado plausível
  const searchHtml = await safeText(
    `https://www.cifraclub.com.br/?q=${encodeURIComponent(`${mainArtist} ${title}`)}`,
    7000,
  );
  if (searchHtml) {
    const nA = norm(mainArtist);
    const nT = norm(title);
    const linkRegex = /<a[^>]+href=["'](\/[a-z0-9-]+\/[a-z0-9-]+\/)["'][^>]*>([^<]+)<\/a>/gi;
    const candidates: { url: string; label: string; score: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(searchHtml)) !== null) {
      const href = m[1];
      const label = norm(m[2]);
      let score = 0;
      if (nT && label.includes(nT.split(" ")[0])) score += 2;
      if (nA && href.includes(slug(mainArtist))) score += 3;
      if (label.includes(nT)) score += 2;
      if (score > 0) candidates.push({ url: `https://www.cifraclub.com.br${href}`, label: m[2], score });
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const c of candidates.slice(0, 4)) {
      const hit = await cifraClubTryUrl(c.url, mainArtist || artist, title);
      if (hit) return hit;
    }
  }

  return null;
}

/* =========================== Ultimate Guitar =========================== */

/** Decodifica entidades HTML comuns (acentos) — a UG embute &aacute; etc. nos valores. */
function decodeEntities(s: string): string {
  if (!s) return s;
  const map: Record<string, string> = {
    "&aacute;": "á", "&Aacute;": "Á", "&eacute;": "é", "&Eacute;": "É",
    "&iacute;": "í", "&Iacute;": "Í", "&oacute;": "ó", "&Oacute;": "Ó",
    "&uacute;": "ú", "&Uacute;": "Ú", "&ccedil;": "ç", "&Ccedil;": "Ç",
    "&ntilde;": "ñ", "&Ntilde;": "Ñ", "&agrave;": "à", "&Agrave;": "À",
    "&uuml;": "ü", "&Uuml;": "Ü", "&ocirc;": "ô", "&Ocirc;": "Ô",
    "&atilde;": "ã", "&Atilde;": "Ã", "&quot;": '"', "&lt;": "<", "&gt;": ">",
  };
  let out = s;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  out = out.split("&amp;").join("&");
  return out;
}

/** Extrai o JSON do estado inicial (data-content) da UG, em qualquer ordem de atributos. */
function parseUgStore(html: string): any | null {
  const patterns = [
    /class=["']js-store["'][^>]*data-content=["']([^"']+)["']/,
    /data-content=["']([^"']+)["'][^>]*class=["']js-store["']/,
    /data-content=["']([^"']+)["']\s*id=["']js-store["']/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    try {
      return JSON.parse(decodeEntities(m[1]));
    } catch {
      /* tenta próximo padrão */
    }
  }
  return null;
}

/**
 * Varre o store recursivamente: a UG muda o aninhamento entre variantes
 * (page.data.results vs store.page.data.results).
 */
function deepFindUg(
  node: any,
  depth = 0,
): { results?: any[]; content?: string; meta?: any } {
  const out: { results?: any[]; content?: string; meta?: any } = {};
  if (!node || typeof node !== "object" || depth > 7) return out;
  if (Array.isArray(node)) return out;

  if (Array.isArray(node.results) && node.results.length) {
    const ok = node.results.some((r: any) => r?.type && r?.tab_url);
    if (ok) out.results = node.results;
  }
  const wt = node.wiki_tab;
  if (!out.content && wt && typeof wt.content === "string" && wt.content.length > 40) {
    out.content = wt.content;
  }
  if (!out.meta && node.tab && typeof node.tab.artist_name === "string" && typeof node.tab.song_name === "string") {
    out.meta = node.tab;
  }
  if (out.results && out.content && out.meta) return out;
  for (const k of Object.keys(node)) {
    const found = deepFindUg(node[k], depth + 1);
    if (!out.results && found.results) out.results = found.results;
    if (!out.content && found.content) out.content = found.content;
    if (!out.meta && found.meta) out.meta = found.meta;
    if (out.results && out.content && out.meta) break;
  }
  return out;
}

/** Converte o wiki markup da UG ([tab]/[ch]) em texto pronto para <pre>. */
function convertUgWiki(content: string): string {
  return content
    .replace(/\[\/?tab\]/g, "")
    .replace(/\[ch\]([^[\]]+)\[\/ch\]/g, "$1")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ultimateGuitar(artist: string, title: string): Promise<ChordsPayload | null> {
  const q = `${artist} ${title}`.trim();
  const html = await safeText(
    `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`,
    7000,
  );
  if (!html) return null;
  const searchStore = parseUgStore(html);
  if (!searchStore) return null;
  const results: any[] = deepFindUg(searchStore).results || [];
  const chord = results.find((r) => r?.type === "Chords" && r?.tab_url);
  if (!chord) return null;

  // Tenta obter a cifra real na página da tab (SSR com wiki_tab.content).
  const tabHtml = await safeText(chord.tab_url, 8000);
  if (tabHtml) {
    const tabStore = parseUgStore(tabHtml);
    const found = tabStore ? deepFindUg(tabStore) : {};
    if (found.content) {
      const meta = found.meta || {};
      return {
        source: "ug",
        artist: decodeEntities(meta.artist_name || chord.artist_name || artist),
        title: decodeEntities(meta.song_name || chord.song_name || title),
        key: meta.tonality_name || null,
        capo: null,
        chords: decodeEntities(convertUgWiki(found.content)),
        url: meta.tab_url || chord.tab_url,
      };
    }
  }

  // Fallback: link para a cifra no site original.
  return {
    source: "ug",
    artist: decodeEntities(chord.artist_name || artist),
    title: decodeEntities(chord.song_name || title),
    key: chord.tonality_name || null,
    capo: null,
    chords: `Cifra disponível em Ultimate Guitar. Toque em "Abrir no site original" para visualizar a versão completa.`,
    url: chord.tab_url,
  };
}

/* =========================== handler =========================== */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const rawArtist = String(body.artist || "").slice(0, 200);
    const rawTitle = String(body.title || "").slice(0, 200);
    if (!rawArtist || !rawTitle) {
      return new Response(JSON.stringify({ error: "artist and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cA = cleanArtist(rawArtist);
    const cT = cleanTitle(rawTitle);

    // Ordem: UG primeiro (única fonte viva); vagalume/cifraclub como fallback.
    let result: ChordsPayload | null = null;
    try { result = await ultimateGuitar(cA, cT); } catch { /* noop */ }
    if (!result) { try { result = await vagalume(cA, cT); } catch { /* noop */ } }
    if (!result) { try { result = await cifraClub(cA, cT); } catch { /* noop */ } }

    if (!result) {
      return new Response(JSON.stringify({ chords: null, error: "not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-chords error", err);
    return new Response(JSON.stringify({ chords: null, error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
