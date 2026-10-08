/**
 * check-egress-guard.mjs — GARANTIA ESTÁTICA DE EGRESS (revisão25ª)
 *
 * Falha (exit 1) se qualquer regressão de egress voltar ao código:
 *   R1  tokens de pulso/heartbeat proibidos (app_heartbeat, __bg_heartbeat,
 *       HEARTBEAT_ACK, postMessage de HEARTBEAT);
 *   R2  setInterval com chamada de rede precisa declarar piso de 24h;
 *   R3  handlers de visibilitychange não podem disparar fetch/refresh/search
 *       (ping por foco);
 *   R4  TTLs de fundo precisam ser ≥ 24h (tabela explícita por arquivo);
 *   R5  edge youtube-trending: cache server = 24h, fanout de avatares ≤ 30,
 *       e NENHUM setInterval em nenhuma edge function;
 *   R6  tetos de fanout por ação (números máximos por padrão).
 *
 * Roda automaticamente no início de `npm run check` (antes de typecheck/test).
 * Chamada manual: npm run check:egress
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["src", "public", "supabase/functions"];
const EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const DAY = 24 * 60 * 60 * 1000;
const failures = [];
const passes = [];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (e === "node_modules" || e === "dist" || e === ".temp") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(e)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const rel = (p) => relative(ROOT, p);
const read = (p) => readFileSync(p, "utf8");
function fail(rule, msg) { failures.push(`[${rule}] ${msg}`); }
function ok(rule, msg) { passes.push(`[${rule}] ${msg}`); }

// ── R1: tokens de pulso/heartbeat proibidos ──
const FORBIDDEN = [
  "app_heartbeat",
  "__bg_heartbeat",
  "HEARTBEAT_ACK",
  /postMessage\(\s*\{\s*type:\s*['"]HEARTBEAT['"]/, // mensagem de pulso ao SW
];
{
  let hits = 0;
  for (const f of files) {
    const s = read(f);
    for (const pat of FORBIDDEN) {
      const found = typeof pat === "string" ? s.includes(pat) : pat.test(s);
      if (found) { fail("R1", `token de pulso em ${rel(f)}: ${typeof pat === "string" ? pat : pat}`); hits++; }
    }
  }
  if (!hits) ok("R1", "zero tokens de pulso/heartbeat em src/public/functions");
}

// ── R2: setInterval + rede ⇒ piso24h ──
const NET_TOKENS = ["fetch(", "refresh(", "createFunctionUrl", "functions.invoke", "searchYouTube", "reg.update", "checkForNewBuild"];
{
  let checked = 0;
  for (const f of files) {
    const s = read(f);
    let idx = 0;
    while ((idx = s.indexOf("setInterval(", idx)) !== -1) {
      const snippet = s.slice(idx, idx + 320);
      idx += 12;
      checked++;
      const hasNet = NET_TOKENS.some((t) => snippet.includes(t));
      if (!hasNet) continue; // intervalos locais (UI/memória) são permitidos
      if (!snippet.includes("24 * 60 * 60")) {
        const line = s.slice(0, idx).split("\n").length;
        fail("R2", `setInterval com rede SEM piso de24h em ${rel(f)}:${line}`);
      }
    }
  }
  if (!failures.some((f) => f.startsWith("[R2]"))) ok("R2", `${checked} setInterval verificados; rede = todos ≥24h (ou removidos)`);
}

// ── R3: visibilitychange não dispara rede ──
{
  let checked = 0;
  for (const f of files) {
    const s = read(f);
    let idx = 0;
    while ((idx = s.indexOf("visibilitychange", idx)) !== -1) {
      const snippet = s.slice(idx, idx + 400);
      idx += 16;
      checked++;
      const bad = ["fetch(", "refresh(", "searchYouTube", "createFunctionUrl", "checkForNewBuild", "forceRefresh("].find((t) => snippet.includes(t));
      if (bad) {
        const line = s.slice(0, idx).split("\n").length;
        fail("R3", `visibilitychange dispara rede ('${bad}') em ${rel(f)}:${line}`);
      }
    }
  }
  if (!failures.some((f) => f.startsWith("[R3]"))) ok("R3", `${checked} menções a visibilitychange; nenhuma dispara rede`);
}

// ── R4: TTLs de fundo ≥24h (tabela explícita) ──
const TTL_TABLE = [
  ["src/components/VideoHomeScreen.tsx", "RECOMMENDATION_TTL"],
  ["src/components/VideoHomeScreen.tsx", "TRENDING_TTL"],
  ["src/hooks/useTrendingVideos.ts", "MAX_AGE_MS"],
  ["src/hooks/useDiscoverRecommendations.ts", "CACHE_TTL_MS"],
  ["src/hooks/useArtistAvatars.ts", "TTL_MS"],
  ["src/components/PodcastScreen.tsx", "POPULAR_THUMBS_TTL"],
  ["src/components/ChannelProfile.tsx", "CHANNEL_PAG_TTL"],
  ["src/components/ChannelProfile.tsx", "CHANNEL_CACHE_TTL"],
  ["src/hooks/useTrendingMusic.ts", "TRENDING_TTL_MS"],
];
{
  let checked = 0;
  for (const [file, name] of TTL_TABLE) {
    const p = join(ROOT, file);
    let s;
    try { s = read(p); } catch { continue; } // arquivo não existe mais = n/a
    const m = s.match(new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([0-9* ]+)`));
    if (!m) continue; // removido junto com a feature = ok
    const expr = m[1].trim();
    const val = expr.split("*").map((x) => parseInt(x.trim(), 10)).reduce((a, b) => a * b, 1);
    checked++;
    if (!(val >= DAY)) fail("R4", `${file}::${name} = ${expr} (${val}ms) < 24h`);
  }
  if (!failures.some((f) => f.startsWith("[R4]"))) ok("R4", `${checked}/$ {TTL_TABLE.length} TTLs de fundo ≥ 24h`.replace("$ {", "${").replace("${TTL_TABLE.length}", String(TTL_TABLE.length)));
}

// ── R5: edge youtube-trending + nenhuma edge com setInterval ──
{
  const p = join(ROOT, "supabase/functions/youtube-trending/index.ts");
  try {
    const s = read(p);
    if (!s.includes("ttlMs: 24 * 60 * 60 * 1000")) fail("R5", "youtube-trending: cache server não é24h");
    const cap = s.match(/ids\.slice\(0,\s*(\d+)\)/);
    if (!cap) fail("R5", "youtube-trending: cap de fanout de avatares não encontrado");
    else if (parseInt(cap[1], 10) > 30) fail("R5", `youtube-trending: cap de avatares ${cap[1]} > 30`);
  } catch { fail("R5", "youtube-trending/index.ts não encontrado"); }
  for (const f of files.filter((f) => f.includes(`supabase/functions/`))) {
    if (read(f).includes("setInterval(")) fail("R5", `setInterval em edge function: ${rel(f)}`);
  }
  if (!failures.some((f) => f.startsWith("[R5]"))) ok("R5", "trending24h+cap≤30; nenhuma edge tem setInterval");
}

// ── R6: tetos de fanout por ação (padrão → máximo) ──
const CAP_TABLE = [
  ["src/hooks/useDiscoverRecommendations.ts", /pickSeeds\((\d+)\)/, 8, "seeds de descoberta"],
  ["src/hooks/useArtistAvatars.ts", /missing\.slice\(0,\s*(\d+)\)/, 12, "avatares de artistas"],
  ["src/components/VideoHomeScreen.tsx", /favChannels\.slice\(0,\s*(\d+)\)/, 8, "canais favoritos (vídeos)"],
  ["src/components/VideoHomeScreen.tsx", /for \(const c of favChannels\.slice\(0,\s*(\d+)\)\)/, 6, "queries de favoritos"],
  ["src/components/PodcastScreen.tsx", /picks = subs\.slice\(0,\s*(\d+)\)/, 6, "subs de podcast"],
  ["src/components/RadioScreen.tsx", /selectedArtists\.slice\(0,\s*(\d+)\)/, 6, "artistas de rádio"],
  ["supabase/functions/youtube-trending/index.ts", /ids\.slice\(0,\s*(\d+)\)/, 30, "avatares (edge)"],
];
{
  let checked = 0;
  for (const [file, re, max, label] of CAP_TABLE) {
    const p = join(ROOT, file);
    let s;
    try { s = read(p); } catch { continue; }
    const m = s.match(re);
    if (!m) { fail("R6", `teto não encontrado (${label}) em ${file}`); continue; }
    checked++;
    const n = parseInt(m[1], 10);
    if (n > max) fail("R6", `${label}: ${n} > teto ${max} em ${file}`);
  }
  if (!failures.some((f) => f.startsWith("[R6]"))) ok("R6", `${checked}/${CAP_TABLE.length} tetos de fanout respeitados`);
}

// ── R7: tetos anti-cascata (páginas automáticas, gate diário, noCache) ──
{
  const caps = [
    ["src/components/ExploreScreen.tsx", /MAX_EXTRA_PAGES\s*=\s*(\d+)/, 15, "teto de páginas do Explore"],
    ["src/components/VideoHomeScreen.tsx", /MAX_REC_PAGES\s*=\s*(\d+)/, 15, "teto de páginas de recomendações"],
  ];
  for (const [file, re, max, label] of caps) {
    const p = join(ROOT, file);
    let st;
    try { st = read(p); } catch { fail("R7", `arquivo ausente: ${file}`); continue; }
    const m = st.match(re);
    if (!m) { fail("R7", `${label} não encontrado em ${file}`); continue; }
    if (parseInt(m[1], 10) > max) fail("R7", `${label} = ${m[1]} > máximo ${max}`);
  }
  // gate diário do prefetch de podcasts
  try {
    if (!read(join(ROOT, "src/components/PodcastScreen.tsx")).includes("xerife:daily-prefetch"))
      fail("R7", "PodcastScreen: gate diário do prefetch ausente (volta a rodar a cada visita)");
  } catch { fail("R7", "PodcastScreen.tsx ausente"); }
  // teto de bypass de cache (noCache: true) em todo o src
  let bypass = 0;
  for (const f of files.filter((f) => f.includes("/src/"))) {
    bypass += (read(f).match(/noCache:\s*true/g) || []).length;
  }
  if (bypass > 12) fail("R7", `noCache: true = ${bypass} ocorrências > teto12 (bypass de cache proliferando)`);
  if (!failures.some((f) => f.startsWith("[R7]"))) ok("R7", `tetos de cascata ok (páginas, gate diário, noCache=${bypass}≤12)`);
}

// ── veredito ──
console.log("== EGRESS GUARD ==");
for (const p of passes) console.log("  PASS", p);
if (failures.length) {
  console.log("");
  for (const f of failures) console.log("  FAIL", f);
  console.log(`\nEGRESS GUARD: FAIL (${failures.length} violação(ões))`);
  process.exit(1);
}
console.log("EGRESS GUARD: PASS — nenhuma regressão de egress detectada");
