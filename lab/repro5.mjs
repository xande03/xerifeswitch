/** Roteiro 5 (pós-fix): player deve tocar; observa disco/controles/glifo. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "lab/shots/repro";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/\[YT\]|onStateChange|xerife\] yt|flush pending|clipSync/i.test(t)) console.log("[c]", t.slice(0, 240)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 5000 });
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
// espera tocar
let playing = false;
let seenState = [];
const onMsg = (m) => { const t = m.text(); if (/state: PLAYING/.test(t)) { playing = true; console.log("[PLAYING OK]"); } };
page.on("console", onMsg);
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const t = document.querySelector("[data-central-transport]");
    const c = document.getElementById("yt-fullscreen-container");
    const r = c?.getBoundingClientRect();
    return {
      transport: !!t,
      rect: r && r.width > 50 ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      disc: !!document.querySelector("[data-center-glyph-cover]"),
    };
  });
  console.log(`+${i + 1}s`, JSON.stringify(s));
  if (playing && s.transport && s.rect) { console.log("VIDEO TOCANDO em", i + 1, "s"); break; }
}
if (!playing) { console.log("FAIL: PLAYING nao chegou"); await browser.close; process.exit(2); }
// dá 1 repaint do disco em nova janela (avança load novo p/ medição limpa)? nao — continua direto na timeline

const st = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
const clipFull = { x: st.x, y: st.y, width: st.w, height: st.h };
const clipCenter = { x: st.x + st.w / 2 - 170, y: st.y + st.h / 2 - 120, width: 340, height: 240 };

const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const qc = document.querySelector('[class*="z-\\[213\\]"]');
  const tap = document.querySelector('button[aria-label*="controles" i]');
  return {
    disc: disc ? 1 : 0,
    ovOp: overlay ? +(+getComputedStyle(overlay).opacity).toFixed(2) : null,
    qcOp: qc ? +(+getComputedStyle(qc).opacity).toFixed(2) : null,
    tap: tap?.getAttribute("aria-label") || null,
  };
});

console.log("=== TIMELINE 250ms x 96 (24s) pós-load ===");
const rows = [];
for (let i = 0; i <= 96; i++) {
  const s = await snap();
  const t = (i * 0.25).toFixed(2);
  rows.push(`t+${t} disc=${s.disc} ov=${s.ovOp} qc=${s.qcOp} tap=${s.tap}`);
  if ([2, 8, 14, 20, 28, 40, 56, 72, 92].includes(i)) {
    await page.screenshot({ path: `${OUT}/F${t}s-center.png`, clip: clipCenter }).catch(() => {});
    if (i === 14 || i === 40) await page.screenshot({ path: `${OUT}/F${t}s-full.png`, clip: clipFull }).catch(() => {});
  }
  await page.waitForTimeout(250);
}
console.log(rows.join("\n"));

// Análise numérica dos crops: centro deve ficar escuro (disco) na janela e limpo depois
console.log("=== PAUSA ===");
await page.evaluate(() => document.querySelectorAll("[data-central-transport] button")[1]?.click());
await page.waitForTimeout(600);
console.log("pause+0.6", JSON.stringify(await snap()));
await page.screenshot({ path: `${OUT}/F-paused-center.png`, clip: clipCenter }).catch(() => {});
await page.waitForTimeout(5000);
console.log("pause+5.6", JSON.stringify(await snap()));
await page.screenshot({ path: `${OUT}/F-paused5-center.png`, clip: clipCenter }).catch(() => {});
await browser.close();
console.log("ROTEIRO5 DONE");
