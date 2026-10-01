/** Roteiro 3: splash → dispatch xerife:auto-play-video → player expandido → timeline 30s. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "lab/shots/repro";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  const t = m.text();
  if (/onStateChange|error/i.test(t)) console.log("[c]", t.slice(0, 220));
});

await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);

// espera splash sumir (ou pula)
for (let i = 0; i < 20; i++) {
  const splash = await page.evaluate(() => !!document.querySelector(".fixed.inset-0.z-\\[9999\\], [class*=splash]"));
  if (!splash) break;
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/r3-0-ready.png` });

// dispara o autoplay oficial do app (Big Buck Bunny / aqz-KE-bpKQ)
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", {
    detail: {
      videoId: "aqz-KE-bpKQ",
      title: "Big Buck Bunny",
      channel: "Blender Foundation",
      thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg",
      lengthSeconds: 596,
    },
  }));
});
await page.waitForTimeout(2500);
const st0 = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const t = document.querySelector("[data-central-transport]");
  const r = c?.getBoundingClientRect();
  return {
    rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    cls: (c?.className || "").slice(0, 90),
    transport: !!t,
    iframe: !!document.querySelector("#yt-player-slot iframe"),
    overlay: !!t?.closest(".z-\\[215\\]"),
    overlayOp: t ? getComputedStyle(t.closest(".z-\\[215\\]")).opacity : null,
    disc: !!document.querySelector("[data-center-glyph-cover]"),
  };
});
console.log("after dispatch:", JSON.stringify(st0));
await page.screenshot({ path: `${OUT}/r3-1-player.png` });

if (!st0.transport || !st0.rect) { console.log("player nao abriu"); await browser.close(); process.exit(2); }

const { x, y, w, h } = st0.rect;
const clipFull = { x, y, width: w, height: h };
const clipCenter = { x: x + w / 2 - 170, y: y + h / 2 - 120, width: 340, height: 240 };

const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t?.closest(".z-\\[215\\]") || null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const tap = document.querySelector('button[aria-label*="controles" i]');
  const qc = document.querySelector('[class*="z-\\[213\\]"]');
  const posterish = [...document.querySelectorAll("div")].find((d) => (d.className || "").toString().includes("z-[209]"));
  return {
    disc: !!disc,
    discOp: disc ? getComputedStyle(disc).opacity : null,
    ovOp: overlay ? getComputedStyle(overlay).opacity : null,
    tapAria: tap?.getAttribute("aria-label")?.slice(0, 30) || null,
    qcOp: qc ? getComputedStyle(qc).opacity : null,
    z209: posterish ? (posterish.className || "").toString().slice(0, 40) : null,
  };
});

console.log("=== TIMELINE (250ms steps, 32s) ===");
const rows = [];
for (let i = 0; i <= 128; i++) {
  const s = await snap();
  const t = (i * 0.25).toFixed(2);
  rows.push(`t+${t} disc=${s.disc ? 1 : 0}(${s.discOp}) ov=${s.ovOp} qc=${s.qcOp} tap=${s.tapAria} z209=${s.z209 ? 1 : 0}`);
  // screenshots-chave: durante janela (1s, 3s), perto do hide (4-7s), depois (10, 16, 24, 30)
  if ([4, 12, 20, 28, 40, 64, 96, 120].includes(i)) {
    await page.screenshot({ path: `${OUT}/R${t}s-full.png`, clip: clipFull }).catch(() => {});
    await page.screenshot({ path: `${OUT}/R${t}s-center.png`, clip: clipCenter }).catch(() => {});
  }
  await page.waitForTimeout(250);
}
console.log(rows.join("\n"));

// PAUSA no meio da timeline
await page.evaluate(() => {
  const btns = document.querySelectorAll("[data-central-transport] button");
  btns[1]?.click();
});
await page.waitForTimeout(800);
console.log("pause+0.8:", JSON.stringify(await snap()));
await page.screenshot({ path: `${OUT}/R-paused-center.png`, clip: clipCenter }).catch(() => {});
await page.waitForTimeout(5000);
console.log("pause+5.8:", JSON.stringify(await snap()));
await page.screenshot({ path: `${OUT}/R-paused-5s-center.png`, clip: clipCenter }).catch(() => {});

// resume e observa se ciclo repete
await page.evaluate(() => {
  const btns = document.querySelectorAll("[data-central-transport] button");
  btns[1]?.click();
});
await page.waitForTimeout(500);
console.log("resume+0.5:", JSON.stringify(await snap()));
for (let i = 1; i <= 8; i++) {
  await page.waitForTimeout(1000);
  console.log(`resume+${i + 0.5}s:`, JSON.stringify(await snap()));
}
await page.screenshot({ path: `${OUT}/R-resume-center.png`, clip: clipCenter }).catch(() => {});

await browser.close();
console.log("ROTEIRO3 DONE");
