/** Roteiro 4: sessão Vídeos → autoplay → player rail → TIMELINE do relatório. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "lab/shots/repro";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/YT onStateChange/i.test(t)) console.log("[c]", t.slice(0, 160)); });

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2200);
await page.mouse.click(640, 780).catch(() => {}); // evita splash later
await page.waitForTimeout(400);

// sessão Xerife Vídeos (context='video' — fluxo real do usuário)
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 5000 });
await page.waitForTimeout(800);
console.log("home:", await page.evaluate(() => localStorage.getItem("demus-home-mode") || localStorage.getItem("demus-module-mode") || "?"));

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
await page.waitForTimeout(3000);

const st = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const t = document.querySelector("[data-central-transport]");
  const r = c?.getBoundingClientRect();
  return {
    rect: r && r.width > 50 ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    cls: (c?.className || "").slice(0, 80),
    transport: !!t,
    mode: localStorage.getItem("demus-player-mode"),
    iframe: !!document.querySelector("#yt-player-slot iframe"),
    ovOp: t ? getComputedStyle(t.closest(".z-\\[215\\]") || t).opacity : null,
    disc: !!document.querySelector("[data-center-glyph-cover]"),
    autohide: localStorage.getItem("demus-fs-autohide-ms"),
  };
});
console.log("ST", JSON.stringify(st));
await page.screenshot({ path: `${OUT}/r4-player.png` });
if (!st.transport || !st.rect) { console.log("FAIL: player nao abriu"); await browser.close(); process.exit(2); }

const { x, y, w, h } = st.rect;
const clipFull = { x, y, width: w, height: h };
const clipCenter = { x: x + w / 2 - 170, y: y + h / 2 - 120, width: 340, height: 240 };

const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const tap = document.querySelector('button[aria-label*="controles" i]');
  const qc = document.querySelector('[class*="z-\\[213\\]"]');
  const bb = document.querySelector('[class*="z-\\[220\\]"]');
  return {
    disc: disc ? 1 : 0,
    discOp: disc ? +getComputedStyle(disc).opacity : null,
    ovOp: overlay ? +getComputedStyle(overlay).opacity : null,
    tapAria: tap?.getAttribute("aria-label") || null,
    qcOp: qc ? +getComputedStyle(qc).opacity : null,
    bbOp: bb ? +getComputedStyle(bb).opacity : null,
  };
});

console.log("=== PLAY TIMELINE 250ms × 128 (32s) ===");
const rows = [];
for (let i = 0; i <= 128; i++) {
  const s = await snap();
  const t = (i * 0.25).toFixed(2);
  rows.push(`t+${t} disc=${s.disc}(${s.discOp}) ov=${s.ovOp} qc=${s.qcOp} tap=${s.tapAria}`);
  if ([4, 10, 16, 22, 30, 48, 80, 120].includes(i)) {
    await page.screenshot({ path: `${OUT}/P${t}s-full.png`, clip: clipFull }).catch(() => {});
    await page.screenshot({ path: `${OUT}/P${t}s-center.png`, clip: clipCenter }).catch(() => {});
  }
  await page.waitForTimeout(250);
}
console.log(rows.join("\n"));

// PAUSA no meio
await page.evaluate(() => document.querySelectorAll("[data-central-transport] button")[1]?.click());
await page.waitForTimeout(700);
console.log("pause+0.7:", JSON.stringify(await snap()));
await page.screenshot({ path: `${OUT}/P-paused-center.png`, clip: clipCenter }).catch(() => {});
await page.waitForTimeout(4500);
console.log("pause+5.2:", JSON.stringify(await snap()));
await page.screenshot({ path: `${OUT}/P-paused5-center.png`, clip: clipCenter }).catch(() => {});

// RESUME → ciclo repete?
await page.evaluate(() => document.querySelectorAll("[data-central-transport] button")[1]?.click());
for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(1000);
  console.log(`resume+${i}s:`, JSON.stringify(await snap()));
  if (i === 2 || i === 8) await page.screenshot({ path: `${OUT}/P-resume${i}-center.png`, clip: clipCenter }).catch(() => {});
}
await browser.close();
console.log("ROTEIRO4 DONE");
