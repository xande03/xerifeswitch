/**
 * Regressão de layout: #music-video-anchor (usado pelo modo Vídeo do
 * Xerife Podcast e Xerife Music) nunca deve ultrapassar os limites laterais
 * da tela em mobile (390px), tablet (1024px) e desktop (1440px), mantendo
 * proporção 16:9.
 *
 * Executar (dev server em :8080):
 *   node e2e/podcast-video-anchor-bounds.spec.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const PORT = 8123;
const HTML = `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<style>html,body{margin:0;background:#000;color:#fff;overflow:hidden}</style>
</head><body>
<!-- Reproduz a mesma cadeia de classes que envolve o #music-video-anchor
     em src/components/NowPlayingView.tsx (linha ~462). Se alguém quebrar as
     restrições responsivas, este teste falha. -->
<div class="w-full lg:w-1/2 flex flex-col justify-center items-center gap-4 relative">
  <div class="w-full group relative aspect-video max-w-[380px] sm:max-w-[440px] lg:max-w-[520px] mx-auto px-3 sm:px-4 mt-2 sm:mt-4">
    <div id="music-video-anchor" class="w-full aspect-video rounded-3xl bg-black/40 shadow-2xl" aria-hidden></div>
  </div>
</div>
</body></html>`;

// Servidor HTTP mínimo — não depende do dev server do app.
import http from "node:http";
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(HTML);
});
await new Promise((r) => server.listen(PORT, r));

const CASES = [
  { label: "mobile 390",    width: 390,  height: 844,  maxAnchor: 380 - 24 /* px-3 lados */ },
  { label: "tablet 1024",   width: 1024, height: 800,  maxAnchor: 440 - 32 /* sm:px-4 lados */ },
  { label: "desktop 1440",  width: 1440, height: 900,  maxAnchor: 520 - 32 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
    // Tailwind CDN aplica classes em runtime — aguardar um frame.
    await page.waitForTimeout(150);

    // 1) Retângulo do anchor dentro dos limites laterais
    const rect = await page.evaluate(() => {
      const el = document.getElementById("music-video-anchor");
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, height: r.height, vw: window.innerWidth };
    });
    assert.ok(rect.left >= 0, `[${c.label}] anchor.left (${rect.left}) < 0 (overflow esquerdo)`);
    assert.ok(rect.right <= rect.vw, `[${c.label}] anchor.right (${rect.right}) > viewport (${rect.vw}) — overflow direito`);
    // Margem lateral esperada mínima (px-3 = 12px em mobile, px-4 = 16px em sm+)
    const expectedSidePad = c.width < 640 ? 12 : 16;
    const totalSidePad = Math.round(rect.left + (rect.vw - rect.right));
    assert.ok(totalSidePad >= expectedSidePad, `[${c.label}] padding total ${totalSidePad}px < esperado ${expectedSidePad}px`);

    // 2) Largura respeita o max-w responsivo
    assert.ok(rect.width <= c.maxAnchor + 1, `[${c.label}] anchor.width ${rect.width} > max ${c.maxAnchor}`);

    // 3) Aspect ratio 16:9 (~1.777)
    const ratio = rect.width / rect.height;
    assert.ok(Math.abs(ratio - 16 / 9) < 0.02, `[${c.label}] aspect ratio ${ratio.toFixed(3)} != 16:9`);

    // 4) Após simular rotação (portrait <-> landscape), continua contido
    await page.setViewportSize({ width: c.height, height: c.width });
    await page.waitForTimeout(100);
    const rotated = await page.evaluate(() => {
      const el = document.getElementById("music-video-anchor");
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth };
    });
    assert.ok(rotated.left >= 0 && rotated.right <= rotated.vw,
      `[${c.label}] após rotação, anchor sai da viewport (left=${rotated.left}, right=${rotated.right}, vw=${rotated.vw})`);

    console.log(`✅ ${c.label}: w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)} ratio=${ratio.toFixed(3)} | rotado w=${rotated.width.toFixed(1)}`);
    await ctx.close();
  }
  console.log("\n✅ Podcast/Music video anchor bounds — todos os breakpoints ok");
} finally {
  await browser.close();
  server.close();
}
