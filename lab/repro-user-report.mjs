/** Reprodução do reporte: "minimização completa só uma vez; depois sobra o
 * botão de pause no centro enquanto toca; pausado esconde tudo".
 * Roteiro: Home → Xerife Vídeos → tocar vídeo → amostrar centro/DOM ~25s. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "lab/shots/repro";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  const t = m.text();
  if (/onStateChange|glyph|GlyphCover|reveal|auto.?hide/i.test(t)) console.log("[c]", t.slice(0, 260));
});

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);

// fecha toast de instalação, se houver
await page.getByRole("button", { name: /fechar|close/i }).first().click({ timeout: 1500 }).catch(() => {});
await page.screenshot({ path: `${OUT}/00-home.png` });

// Home → Xerife Vídeos
await page.getByText("Xerife Videos", { exact: false }).first().click({ timeout: 5000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/01-videos-tab.png` });

// lista: clica no primeiro item clicável da área de conteúdo (card/título)
const candidates = page.locator("main button, main [role=button], main a, [class*=grid] button, [class*=grid] [role=button]");
const n = await candidates.count();
console.log("candidate items:", n);
let clicked = false;
for (let i = 0; i < Math.min(n, 12); i++) {
  const el = candidates.nth(i);
  const box = await el.boundingBox().catch(() => null);
  if (!box || box.width < 80 || box.height < 40) continue;
  const label = (await el.textContent().catch(() => "")) || "";
  console.log("try item", i, label.slice(0, 50).replace(/\n/g, " "), box.width + "x" + box.height);
  await el.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const expanded = await page.evaluate(() => {
    const c = document.getElementById("yt-fullscreen-container");
    if (!c) return null;
    const s = getComputedStyle(c);
    return { display: s.display, w: c.clientWidth, h: c.clientHeight, cls: c.className.slice(0, 80) };
  });
  await page.screenshot({ path: `${OUT}/02-after-click-${i}.png` });
  if (expanded && expanded.display !== "none" && expanded.w > 200) {
    console.log("player container active after item", i, expanded);
    clicked = true;
    break;
  }
}
if (!clicked) console.log("NENHUM vídeo abriu o player — revisar 02-*.png");

// Estado inicial do overlay
const snap = async (tag) => page.evaluate((t) => {
  const disc = document.querySelector("[data-center-glyph-cover]");
  const transport = document.querySelector("[data-central-transport]");
  const overlayWrap = transport ? transport.closest(".z-\\[215\\]") || transport.parentElement?.parentElement : null;
  const poster = document.querySelector("[data-paused-video-poster], .z-\\[209\\].fixed, [class*=PausedVideoPoster]");
  const qc = document.querySelector("[class*=QualityBadge], [data-quality]");
  const iframe = document.querySelector("#yt-player-slot iframe, #yt-player iframe");
  const tap = document.querySelector('button[aria-label*="controles" i]');
  return {
    t,
    disc: !!disc,
    discBox: disc ? { w: disc.clientWidth, h: disc.clientHeight, z: getComputedStyle(disc).zIndex, bg: getComputedStyle(disc).backgroundColor } : null,
    transportOpacity: transport ? getComputedStyle(transport.closest(".z-\\[215\\]") || overlayWrap || transport).opacity : null,
    transportBtn: transport ? transport.querySelector("button:nth-child(2)")?.getAttribute("aria-label") : null,
    tapLabel: tap?.getAttribute("aria-label"),
    iframe: !!iframe,
    iframeBox: iframe ? iframe.getBoundingClientRect().toJSON() : null,
    posterVisible: !!poster,
    autohide: localStorage.getItem("demus-fs-autohide-ms"),
  };
}, tag);

console.log("SNAP t0", JSON.stringify(await snap("t0")));

// ── Timeline: 25s amostrando a cada 500ms ──
const samples = [];
for (let i = 0; i < 50; i++) {
  const s = await snap(`t+${(i * 0.5).toFixed(1)}s`);
  samples.push(s);
  if (i % 4 === 0) await page.screenshot({ path: `${OUT}/tl-${String(i * 0.5).padStart(4, "0")}s.png` });
  // crop do centro do player no meio da janela
  if (i === 6 || i === 14 || i === 30 || i === 46) {
    const fb = s.iframeBox;
    if (fb && fb.width > 50) {
      await page.screenshot({
        path: `${OUT}/center-${(i * 0.5).toFixed(1)}s.png`,
        clip: { x: fb.x + fb.width / 2 - 150, y: fb.y + fb.height / 2 - 100, width: 300, height: 200 },
      }).catch(() => {});
    }
  }
  await page.waitForTimeout(500);
}
console.log("SAMPLES:");
for (const s of samples) console.log(JSON.stringify(s));

// Pausar e observar
await page.evaluate(() => {
  const t = document.querySelector("[data-central-transport] button:nth-child(2)");
  t?.click();
});
await page.waitForTimeout(600);
console.log("SNAP pause+0.6", JSON.stringify(await snap("pause")));
const fb = await page.evaluate(() => {
  const i = document.querySelector("#yt-player-slot iframe, #yt-player iframe");
  return i ? i.getBoundingClientRect().toJSON() : null;
});
if (fb) await page.screenshot({ path: `${OUT}/paused.png`, clip: { x: fb.x, y: fb.y, width: fb.width, height: fb.height } }).catch(() => {});
await page.waitForTimeout(4500);
console.log("SNAP pause+5s", JSON.stringify(await snap("pause5")));

await browser.close();
console.log("REPRO DONE");
