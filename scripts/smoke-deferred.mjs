/**
 * Smoke test do code-splitting, contra o build de producao REAL.
 * Sobe `vite preview` sozinho: `npm run build && npm run smoke`.
 *
 * Cobre justamente o que typecheck e build NAO provam:
 *   1. o app monta com conteudo real (Suspense nao deixou ninguem em branco);
 *   2. deep-link frio em ?module=podcast resolve o chunk async e mostra a tela
 *      (PodcastScreen e o maior deles e so existe atras de um clique);
 *   3. clique em "Buscar" renderiza a tela adia;
 *   4. cada chunk e baixado no maximo uma vez por pagina (o loader compartilhado
 *      de src/lib/deferredScreens.ts memoiza a promise - duplicar aqui seria o
 *      bug classico de prefetch + lazy com specifiers diferentes);
 *   5. nenhum erro fatal de React (suspense aninhado, TDZ de ciclo de chunk,
 *      "Minified React error"). Erros ja conhecidos do ambiente headless
 *      (sondas do Chrome a /?format=json) ficam numa allowlist explicita.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FATAL = /Minified React error|suspended while|Unable to find a label|There was no root|cannot be nested|maximum update depth|Cannot access .* before initialization|Failed to fetch dynamically imported module|Unable to preload CSS/i;
// Ja presente no baseline (antes do code-splitting): sonda interna do Chrome
// headless que recebe HTML. Nao e ruido que este teste deva bloquear.
const ALLOWED = [/Unexpected token '<'/];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
});
let previewOut = "";
preview.stdout.on("data", (d) => { previewOut += d; });
preview.stderr.on("data", (d) => { previewOut += d; });

const cleanup = () => { try { preview.kill("SIGTERM"); } catch { /* ja morreu */ } };
process.on("exit", cleanup);

// Regra: cada chunk adiado pode aparecer mais de uma vez na pagina (o Vite injeta
// modulepreload e depois faz o import), mas no MAXIMO UM deles pode ser fetch real
// - o resto tem de vir de cache/SW. >1 por arquivo = download duplicado de verdade.
const dupesOf = (bucket, keep) => {
  const perFile = new Map();
  for (const e of bucket) {
    if (!keep(e.f)) continue;
    perFile.set(e.f, (perFile.get(e.f) || 0) + (e.real ? 1 : 0));
  }
  const offenders = [...perFile.entries()].filter(([, n]) => n > 1);
  return {
    files: [...perFile.keys()],
    totalRequests: bucket.filter((e) => keep(e.f)).length,
    offenders: offenders.map(([f, n]) => `${f}x${n}`),
    dupes: offenders.length,
  };
};

const out = { base };
try {
  if (!(await waitFor(`${base}/`))) {
    out.error = `preview nao subiu: ${previewOut.slice(0, 400)}`;
    throw new Error("preview nao subiu");
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const problems = [];

  const attach = (page, name, bucket) => {
    page.on("pageerror", (e) => {
      const msg = String(e.message);
      if (!ALLOWED.some((re) => re.test(msg))) problems.push(`[${name}] pageerror: ${msg.slice(0, 200)}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error" && FATAL.test(m.text())) problems.push(`[${name}] FATAL console: ${m.text().slice(0, 200)}`);
    });
    page.on("response", (r) => {
      const u = r.url();
      const ct = r.headers()["content-type"] || "";
      if (u.includes("/assets/") && u.endsWith(".js")) {
        // fromCache = respondido pelo service worker/memoria: o Vite injeta um
        // modulepreload antes do import(), entao o MESMO url pode aparecer 2x sem
        // custar um segundo download. O que importa e o tráfego real.
        bucket.push({ f: u.split("/").pop(), real: !r.fromServiceWorker() });
        if (ct.includes("text/html")) {
          problems.push(`[${name}] chunk servido como HTML (path errado): ${u.split("/").pop()}`);
        }
      }
    });

  };

  // ── pagina 1: carga inicial + clique em tela adia ─────────────────────────
  const homeChunks = [];
  const p1 = await ctx.newPage();
  attach(p1, "home", homeChunks);
  await p1.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p1.waitForTimeout(3000); // deixa o idle-prefetch rodar

  const mainText = async (page) => {
    const sel = await page.locator("main").innerText().catch(() => "");
    const body = await page.locator("body").innerText().catch(() => "");
    return (sel || body).replace(/\s+/g, " ").trim();
  };

  const text1 = await mainText(p1);
  out.mounts = { ok: text1.length > 40, chars: text1.length };
  out.homeChunks = [...new Set(homeChunks)];
  // Se o prefetch ocioso funcionou, os chunks async ja aparecem aqui.
  out.prefetchedOnIdle = out.homeChunks.filter((c) => !/^(index|vendor)-/.test(c));

  const buscar = p1.getByRole("button", { name: "Buscar", exact: false }).first();
  out.searchTabPresent = (await buscar.count()) > 0;
  if (out.searchTabPresent) {
    await buscar.click();
    await p1.waitForTimeout(2000);
    const t = await mainText(p1);
    // SearchScreen tem placeholder/busca; exige texto e nao-React-error
    out.searchScreenRenders = { ok: t.length > 40 && !/Something went wrong/i.test(t), sample: t.slice(0, 90) };
  }
  const deferred1 = dupesOf(homeChunks, (f) => !/^(index|vendor)-/.test(f));
  const dupes1 = deferred1.dupes;
  out.noDuplicateDeferredChunks = {
    ok: dupes1 === 0,
    note: "index/vendor aparecem 2x por modulepreload+fetch do entry (esperado)",
    deferredRequests: deferred1.totalRequests,
    dupes: dupes1,
  };
  await p1.close();

  // ── pagina 2: deep-link FRIO na tela mais pesada (chunk async) ─────────────
  const podcastChunks = [];
  // Contexto NOVO de proposito: o clique em "Buscar" acima persistiu activeTab no
  // localStorage, e dividir o context faria o deep-link cair em outra aba.
  const coldCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await coldCtx.newPage();
  attach(p2, "podcast", podcastChunks);
  await p2.goto(`${base}/?module=podcast`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p2.waitForFunction(
    () => /ON AIR|XERIFE Podcasts|Programas para come/i.test(
      document.querySelector("main")?.innerText || document.body?.innerText || ""
    ),
    { timeout: 25000 },
  ).catch(() => {});
  const t2 = await mainText(p2);
  out.deepLinkPodcastRenders = {
    ok: /ON AIR|XERIFE Podcasts|Programas para come/i.test(t2),
    sample: t2.slice(0, 160),
  };
  const deferred2 = dupesOf(podcastChunks, (f) => !/^(index|vendor)-/.test(f));
  out.podcastChunkRequested = deferred2.files.some((c) => /^PodcastScreen-/.test(c));
  out.noDuplicateChunksOnPodcast = {
    ok: deferred2.dupes === 0,
    dupes: deferred2.dupes,
    realFetches: deferred2.realFetches,
    chunks: deferred2.files,
  };
  await p2.close();
  await coldCtx.close();
  await browser.close();

  out.noFatalErrors = { ok: problems.length === 0, problems: problems.slice(0, 8) };
} finally {
  cleanup();
}

const failed = Object.entries(out)
  .filter(([, v]) => v && typeof v === "object" && "ok" in v && !v.ok)
  .map(([k]) => k);
console.log(JSON.stringify(out, null, 2));
console.log(failed.length ? `SMOKE FALHOU: ${failed.join(", ")}` : "SMOKE OK");
process.exit(failed.length ? 1 : 0);
