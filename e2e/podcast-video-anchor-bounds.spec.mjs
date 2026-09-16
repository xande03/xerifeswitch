/**
 * Regressão de layout do #music-video-anchor (modo Vídeo do Xerife Music e do
 * Xerife Podcast): o anchor nunca pode estourar os limites laterais da tela,
 * precisa manter a proporção declarada e continuar contido depois de girar.
 *
 * Por que este arquivo foi reescrito: a versão anterior COPIAVA à mão a cadeia de
 * classes do container em NowPlayingView.tsx. When the real classes mudaram
 * (max-w-[420px] sm:max-w-[440px] lg:max-w-[520px] -> quatro ramagens
 * responsivas por modo), a cópia ficou dessincronizada e o teste passou a falhar
 * contra si mesmo - `anchor.width 480 > max 408` - sem que houvesse regressão
 * nenhuma no app. Um teste que duplica o código sob teste vira ruído.
 *
 * Agora as classes são LIDAS do fonte em runtime e as expectativas (max-w,
 * padding, aspect-ratio) são DERIVADAS delas. Se o design mudar, o teste acompanha;
 * se o layout quebrar de verdade (overflow, proporção errada), ele falha.
 *
 * Uso:
 *   npm run build        # opcional, mas recomendado: usa o CSS real do app
 *   node e2e/podcast-video-anchor-bounds.spec.mjs
 *
 * Sem `dist/` construído, cai para o Tailwind CDN (exige rede) apenas para
 * aplicar as classes; as asserções são as mesmas.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = path.join(ROOT, "src/components/NowPlayingView.tsx");
const PORT = 8123;

// ── 1. extrair as ramagens reais do container do anchor ─────────────────────
const src = readFileSync(SRC, "utf8");
const block = src.slice(
  src.indexOf("Video/Artwork Container"),
  src.indexOf("Video/Artwork Container") + 4000,
);
assert.ok(block.length > 100, "bloco 'Video/Artwork Container' nao encontrado em NowPlayingView.tsx — o layout mudou de forma estrutural, atualize a extracao deste teste");

// Cada ramagem do ternario e uma string literal com classes utilitarias.
const branches = [...block.matchAll(/"((?:relative|w-full)[^"]*?(?:aspect-(?:video|square)|max-w-\[[^\]]+\])[^"]*)"/g)]
  .map((m) => m[1])
  .filter((c, i, all) => all.indexOf(c) === i && !/^w-full\s/.test(c));
assert.ok(branches.length >= 2, `esperava >= 2 ramagens de classe no container do anchor, achei ${branches.length}`);

// O anchor em si: e ele quem carrega o aspect-ratio no app real, e por isso a
// proporcao verificada vem daqui (o container so trata de largura/padding).
const anchorMatch = src.match(/<div\s+id="music-video-anchor"\s+className="([^"]+)"/);
assert.ok(anchorMatch, 'elemento id="music-video-anchor" com className literal nao encontrado — atualize a extracao');
const ANCHOR_CLASSES = anchorMatch[1];
branches.splice(0, branches.length, ...branches.filter((c) => c !== ANCHOR_CLASSES));

// ── 2. parse das expectativas a partir das proprias classes ─────────────────
const clampPx = (v) => Number(v);
function parseBranch(classes) {
  const maxW = {}; // breakpoint -> px
  for (const m of classes.matchAll(/(?:(sm|md|lg|xl):)?max-w-\[(\d+)px\]/g)) {
    maxW[m[1] || "base"] = clampPx(m[2]);
  }
  const pad = {};
  for (const m of classes.matchAll(/(?:(sm|md|lg|xl):)?px-(\d+)/g)) {
    pad[m[1] || "base"] = Number(m[2]) * 4; // escala do tailwind: 1 = 0.25rem
  }
  return { classes, maxW, pad };
}

/** Valor vigente num breakpoint dado o mapa base/sm/md/lg/xl. */
function active(map, width) {
  const order = width >= 1280 ? ["xl", "lg", "md", "sm", "base"]
    : width >= 1024 ? ["lg", "md", "sm", "base"]
    : width >= 768 ? ["md", "sm", "base"]
    : width >= 640 ? ["sm", "base"] : ["base"];
  for (const k of order) if (map[k] != null) return map[k];
  return Infinity;
}

// ── 3. CSS: o do build real quando existir, senao o CDN ─────────────────────
const assetDir = path.join(ROOT, "dist/assets");
const appCss = existsSync(assetDir)
  ? readdirSync(assetDir).find((f) => /^index-.*\.css$/.test(f))
  : undefined;

function pageFor(branchClasses) {
  // Reproduz a cadeia real: wrapper de coluna + container com as classes extraidas
  // + o proprio anchor. So o que esta no fonte entra aqui - nada copiado a mao.
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${appCss ? `<link rel="stylesheet" href="/app.css">` : `<script src="https://cdn.tailwindcss.com"></script>`}
<style>html,body{margin:0;background:#000;color:#fff}</style>
</head><body>
<div class="w-full relative">
  <div class="${branchClasses}" id="anchor-container">
    <div id="music-video-anchor" class="${ANCHOR_CLASSES}"></div>
  </div>
</div>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/app.css" && appCss) {
    res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    res.end(readFileSync(path.join(assetDir, appCss)));
    return;
  }
  const idx = Number(new URL(req.url, "http://x").searchParams.get("b") ?? "0");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(pageFor(branches[idx] ?? branches[0]));
});
await new Promise((r) => server.listen(PORT, r));

const VIEWPORTS = [
  { label: "mobile 390", width: 390, height: 844 },
  { label: "tablet 768", width: 768, height: 1024 },
  { label: "tablet 1024", width: 1024, height: 800 },
  { label: "desktop 1440", width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });
console.log(`CSS: ${appCss ? "build real (" + appCss + ")" : "Tailwind CDN"} | ramagens: ${branches.length}`);
process.env.SMOKE_DEBUG && console.log("HTML[0]:\n" + pageFor(branches[0]).slice(0, 600));
let checked = 0;
try {
  for (let bi = 0; bi < branches.length; bi++) {
    const spec = parseBranch(branches[bi]);
    const aspect = /aspect-square/.test(ANCHOR_CLASSES) ? 1 : 16 / 9;
    for (const c of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height } });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?b=${bi}`, { waitUntil: "load", timeout: 30000 });
      if (!appCss) await page.waitForTimeout(250); // CDN aplica em runtime

      const rect = await page.evaluate(() => {
        const r = document.getElementById("music-video-anchor").getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height, vw: window.innerWidth };
      });

      // (a) contido horizontalmente
      assert.ok(rect.left >= -0.5, `[ramagem ${bi} | ${c.label}] anchor.left (${rect.left}) < 0`);
      assert.ok(rect.right <= rect.vw + 0.5, `[ramagem ${bi} | ${c.label}] anchor.right (${rect.right}) > viewport (${rect.vw})`);

      // (b) padding lateral declarado esta de pe
      const sidePad = Math.round(rect.left + (rect.vw - rect.right));
      const minPad = active(spec.pad, c.width);
      assert.ok(sidePad >= minPad - 1, `[ramagem ${bi} | ${c.label}] padding total ${sidePad}px < ${minPad}px declarado nas classes`);

      // (c) largura <= max-w vigente naquele breakpoint
      const maxW = active(spec.maxW, c.width);
      assert.ok(rect.width <= maxW + 1, `[ramagem ${bi} | ${c.label}] anchor.width ${rect.width} > max-w ${maxW} das classes`);

      // (d) proporcao = a declarada (aspect-video 16:9 / aspect-square 1:1)
      assert.ok(rect.height > 0, `[ramagem ${bi} | ${c.label}] anchor com altura 0 (aspect-ratio nao aplicado?)`);
      const ratio = rect.width / rect.height;
      assert.ok(Math.abs(ratio - aspect) < 0.06, `[ramagem ${bi} | ${c.label}] ratio ${ratio.toFixed(3)} != ${aspect.toFixed(3)} declarado em "${ANCHOR_CLASSES.slice(0, 40)}..."`);

      // (e) rotacao: continua contido e na proporcao
      await page.setViewportSize({ width: c.height, height: c.width });
      await page.waitForTimeout(150);
      const rot = await page.evaluate(() => {
        const r = document.getElementById("music-video-anchor").getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height, vw: window.innerWidth };
      });
      assert.ok(rot.left >= -0.5 && rot.right <= rot.vw + 0.5,
        `[ramagem ${bi} | ${c.label} rotacionado] anchor fora da viewport (left=${rot.left}, right=${rot.right}, vw=${rot.vw})`);
      assert.ok(rot.width <= active(spec.maxW, Math.max(c.width, c.height)) + 1,
        `[ramagem ${bi} | ${c.label} rotacionado] largura ${rot.width} estourou o max-w`);

      console.log(`✅ [ramagem ${bi}] ${c.label}: w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)} ratio=${ratio.toFixed(3)} (max-w=${maxW}, pad=${minPad}) rot=${rot.width.toFixed(1)}`);
      checked++;
      await ctx.close();
    }
  }
  console.log(`\n✅ Video anchor bounds — ${checked} combinacoes (ramagens x breakpoints x rotacao) ok, CSS: ${appCss ? "build real do app" : "Tailwind CDN"}\n   ramagens extraidas de NowPlayingView.tsx:`);
  branches.forEach((b, i) => console.log(`   [${i}] ${b.slice(0, 110)}`));
} finally {
  await browser.close();
  server.close();
}
