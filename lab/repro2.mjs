/** Roteiro 2: Home → card Xerife Videos → VideoCard → player expandido → timeline. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "lab/shots/repro";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  const t = m.text();
  if (/onStateChange|GlyphCover|glyphPaint/i.test(t)) console.log("[c]", t.slice(0, 200));
});

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/s0-home.png` });

// fecha toast
await page.locator("button:has-text('×'), [aria-label*=close] button, .fixed button svg").first().click({ timeout: 1000 }).catch(() => {});
await page.keyboard.press("Escape").catch(() => {});

// card Xerife Videos (área central, não header)
const card = page.getByText("Xerife Videos", { exact: false }).locator("xpath=ancestor-or-self::button[1]").first();
const cardAlt = page.locator("button", { hasText: "Xerife Videos" }).last();
if (await card.count()) await card.click({ timeout: 4000 });
else await cardAlt.click({ timeout: 4000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/s1-videos.png` });

// Procurar cards de vídeo clicáveis
const info = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("img")].map((i) => ({ src: (i.src || "").slice(-60), w: i.clientWidth, h: i.clientHeight, alt: i.alt }));
  const heads = [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => h.textContent.trim().slice(0, 50)).filter(Boolean);
  return { imgs: imgs.filter((i) => i.w > 100), heads };
});
console.log(JSON.stringify(info, null, 1).slice(0, 3500));

// Clicar no primeiro thumbnail de vídeo razoável (grid)
const thumb = page.locator("main img, [class*=grid] img").filter({ has: page.locator("xpath=.") });
const thumbs = page.locator("img");
let started = false;
const n = await thumbs.count();
for (let i = 0; i < n; i++) {
  const im = thumbs.nth(i);
  const box = await im.boundingBox().catch(() => null);
  if (!box || box.width < 160 || box.height < 90) continue;
  const src = await im.getAttribute("src").catch(() => "");
  console.log("thumb", i, box.width + "x" + box.height, (src || "").slice(-50));
  // clica no card pai
  await im.click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(3500);
  const state = await page.evaluate(() => {
    const c = document.getElementById("yt-fullscreen-container");
    const slot = document.getElementById("yt-player-slot");
    const iframe = slot?.querySelector("iframe") || document.querySelector("#yt-player iframe");
    const t = document.querySelector("[data-central-transport]");
    const r = c?.getBoundingClientRect();
    return {
      container: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
      iframeInSlot: !!iframe,
      transport: !!t,
      transportOpacity: t ? getComputedStyle(t.closest(".z-\\[215\\]") || t).opacity : null,
      disc: !!document.querySelector("[data-center-glyph-cover]"),
      cls: (c?.className || "").slice(0, 60),
    };
  });
  console.log("after thumb", i, JSON.stringify(state));
  await page.screenshot({ path: `${OUT}/s2-after-thumb-${i}.png` });
  if (state.transport && state.container && state.container.w > 300) { started = true; console.log("PLAYING PATH OK at thumb", i); break; }
}
if (!started) { console.log("FAILED to start player"); await browser.close(); process.exit(2); }

// ── TIMELINE 30s: snap 250ms + centro crop periódico ──
const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? t.closest(".z-\\[215\\]") : null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const c = document.getElementById("yt-fullscreen-container");
  const r = c?.getBoundingClientRect();
  return {
    disc: !!disc,
    discOpacity: disc ? getComputedStyle(disc).opacity : null,
    overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
    qc: (() => { const q = document.querySelector('[class*="z-\\[213\\]"]'); return q ? getComputedStyle(q).opacity : null; })(),
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
  };
});

console.log("=== TIMELINE ===");
for (let i = 0; i <= 60; i++) {
  const s = await snap();
  const t = (i * 0.25).toFixed(2);
  console.log(`t+${t} disc=${s.disc}(${s.discOpacity}) overlay=${s.overlayOpacity} qc=${s.qc}`);
  if ([2, 6, 12, 24, 40, 56].includes(i) && s.rect) {
    const { x, y, w, h } = s.rect;
    await page.screenshot({ path: `${OUT}/T${t}s-full.png`, clip: { x, y, width: w, height: h } }).catch(() => {});
    await page.screenshot({ path: `${OUT}/T${t}s-center.png`, clip: { x: x + w / 2 - 160, y: y + h / 2 - 110, width: 320, height: 220 } }).catch(() => {});
  }
  await page.waitForTimeout(250);
}

// Pausa → observa 5s (relatório: pausado esconde tudo)
const pb = page.locator("[data-central-transport] button").nth(1);
await pb.click({ timeout: 3000 }).catch(async () => { await page.mouse.click(...Object.values(await page.evaluate(() => { const c = document.getElementById('yt-fullscreen-container').getBoundingClientRect(); return { 0: c.x + c.width / 2, 1: c.y + c.height / 2 }; })).slice(0, 2)); });
for (let i = 0; i < 10; i++) {
  const s = await snap();
  console.log(`pause+${(i * 0.5).toFixed(1)} disc=${s.disc} overlay=${s.overlayOpacity}`);
  if (i === 2 && s.rect) {
    const { x, y, w, h } = s.rect;
    await page.screenshot({ path: `${OUT}/PAUSED-center.png`, clip: { x: x + w / 2 - 160, y: y + h / 2 - 110, width: 320, height: 220 } }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

await browser.close();
console.log("ROTEIRO2 DONE");
