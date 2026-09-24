/** Reproduz contra o DEPLOY de produção (netlify) — compara com localhost. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "lab/shots/netlify";
mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET || "https://xerifeswitch.netlify.app/";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/\[YT |onStateChange|flush pending|queued|clipSync|Restored/i.test(t)) console.log("[c]", t.slice(0, 220)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/00-home.png` });
// fecha toast se houver
await page.keyboard.press("Escape").catch(() => {});

// sessão Vídeos
const sess = page.locator('button[aria-label="Sessão Xerife Vídeos"]');
if (await sess.count()) await sess.click({ timeout: 6000 });
else {
  // pode estar com labels diferentes no build; tenta pelo texto
  await page.getByText("Xerife Videos", { exact: false }).first().click({ timeout: 4000 }).catch(() => {});
}
await page.waitForTimeout(800);
console.log("home-mode:", await page.evaluate(() => localStorage.getItem("demus-home-mode") || localStorage.getItem("demus-module-mode") || "?"));

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});

// espera PLAYING
let playing = false;
page.on("console", (m) => { if (/state: PLAYING/.test(m.text())) playing = true; });
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => ({
    transport: !!document.querySelector("[data-central-transport]"),
    disc: !!document.querySelector("[data-center-glyph-cover]"),
    rect: (() => { const c = document.getElementById("yt-fullscreen-container"); const r = c?.getBoundingClientRect(); return r && r.width > 50 ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; })(),
  }));
  console.log(`+${i + 1}s`, JSON.stringify(s));
  if (playing && s.transport && s.rect) { console.log("PLAYING ok em", i + 1, "s"); break; }
}
if (!playing) console.log("AVISO: PLAYING não observado (ver logs)");

const st = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
const clipCenter = { x: st.x + st.w / 2 - 170, y: st.y + st.h / 2 - 120, width: 340, height: 240 };
const clipFull = { x: st.x, y: st.y, width: st.w, height: st.h };

const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const qc = document.querySelector('[class*="z-\\[213\\]"]');
  const tap = document.querySelector('button[aria-label*="controles" i]');
  const back = [...document.querySelectorAll("button")].find((b) => b.querySelector("svg") && (b.className || "").toString().includes("z-[220]"));
  return {
    disc: disc ? 1 : 0,
    ovOp: overlay ? +(+getComputedStyle(overlay).opacity).toFixed(2) : null,
    qcOp: qc ? +(+getComputedStyle(qc).opacity).toFixed(2) : null,
    tap: tap?.getAttribute("aria-label") || null,
    backOp: back ? +(+getComputedStyle(back).opacity).toFixed(2) : null,
  };
});

console.log("=== TIMELINE NETLIFY 250ms x 128 (32s) ===");
const rows = [];
for (let i = 0; i <= 128; i++) {
  const s = await snap();
  const t = (i * 0.25).toFixed(2);
  rows.push(`t+${t} disc=${s.disc} ov=${s.ovOp} qc=${s.qcOp} back=${s.backOp} tap=${s.tap}`);
  if ([8, 24, 48, 80, 120].includes(i)) {
    await page.screenshot({ path: `${OUT}/N${t}s-center.png`, clip: clipCenter }).catch(() => {});
    if (i === 24 || i === 80) await page.screenshot({ path: `${OUT}/N${t}s-full.png`, clip: clipFull }).catch(() => {});
  }
  await page.waitForTimeout(250);
}
console.log(rows.join("\n"));
await browser.close();
console.log("NETLIFY REPRO DONE");
