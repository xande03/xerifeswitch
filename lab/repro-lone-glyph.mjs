/** Caça ao "glifo solto": fluxo REAL (clique no card), sessão longa,
 * detector de pixel + correlação com disc/ov/poster/buffering. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
const OUT = "lab/shots/lone";
mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET || "http://localhost:5173/";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const states = [];
page.on("console", (m) => {
  const t = m.text();
  if (/state: (PLAYING|BUFFERING|PAUSED|ENDED)/.test(t)) {
    const s = t.match(/state: (\w+)/)[1];
    states.push([Date.now(), s]);
  }
});
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 8000 });
await page.waitForTimeout(2500);

// Clique REAL no primeiro card de vídeo grande (fluxo do usuário)
const thumbs = page.locator("img");
let started = false;
for (let i = 0; i < 30 && !started; i++) {
  const im = thumbs.nth(i);
  const box = await im.boundingBox().catch(() => null);
  if (!box) continue;
  console.log("img", i, Math.round(box.width) + "x" + Math.round(box.height));
  if (box.width < 300 || box.height < 160) continue;
  await im.click({ timeout: 4000 }).catch((e) => console.log("click fail", i, String(e).slice(0, 80)));
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => ({
    transport: !!document.querySelector("[data-central-transport]"),
    rect: (() => { const c = document.getElementById("yt-fullscreen-container"); const r = c?.getBoundingClientRect(); return r && r.width > 100 ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; })(),
    title: document.title,
  }));
  if (s.transport && s.rect) { started = true; console.log("player iniciado via card, rect=", JSON.stringify(s.rect)); break; }
}
if (!started) {
  console.log("cards não abriram — fallback: evento oficial xerife:auto-play-video (fluxo interno do app)");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "vWv5z6EteTs", title: "A GRAVE SITUAÇÃO DO BRASIL", channel: "SACANI", thumbnail: "https://i.ytimg.com/vi/vWv5z6EteTs/maxresdefault.jpg", duration: 3000, lengthSeconds: 3000 } }));
  });
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => ({
    transport: !!document.querySelector("[data-central-transport]"),
    rect: (() => { const c = document.getElementById("yt-fullscreen-container"); const r = c?.getBoundingClientRect(); return r && r.width > 100 ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; })(),
  }));
  if (!(s.transport && s.rect)) { console.log("FAIL: player não abriu", JSON.stringify(s)); await browser.close(); process.exit(2); }
  started = true;
}

const st = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
const clip = { x: st.x, y: st.y, width: st.w, height: st.h };

const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const z209 = [...document.querySelectorAll("div")].filter((d) => (d.className || "").toString().includes("z-[209]"));
  const poster = z209.some((d) => (d.className || "").toString().includes("absolute"));
  const tap = document.querySelector('button[aria-label*="controles" i]');
  return {
    disc: !!disc,
    ovOp: overlay ? +(+getComputedStyle(overlay).opacity).toFixed(2) : null,
    poster,
    tap: tap?.getAttribute("aria-label") || null,
  };
});

console.log("=== FASE 1: steady 70s (espera controls esconder) ===");
const suspects = [];
let bufferWindows = 0, lastBuf = false;
for (let i = 0; i <= 140; i++) {
  const s = await snap();
  const t = (i * 0.5).toFixed(1);
  // detecta oscilação de buffering nos logs
  const recent = states.filter(([ts]) => Date.now() - ts < 500);
  const isBuf = states.length && states[states.length - 1][1] === "BUFFERING" && Date.now() - states[states.length - 1][0] < 8000;
  if (isBuf && !lastBuf) bufferWindows++;
  lastBuf = isBuf;
  // screenshot quando oculto (candidato a glifo solto)
  const hidden = s.ovOp === 0 && !s.disc && !s.poster;
  if (hidden && i % 4 === 0) {
    const f = `${OUT}/s1_${t}s.png`;
    await page.screenshot({ path: f, clip }).catch(() => {});
    suspects.push({ t, f, s, buffering: isBuf });
  }
  if (i % 20 === 0) console.log(`t+${t} disc=${s.disc ? 1 : 0} ov=${s.ovOp} poster=${s.poster ? 1 : 0} buf=${isBuf ? 1 : 0}`);
  await page.waitForTimeout(500);
}
console.log("FASE1 suspeitos (oculto+sem disco+sem poster):", suspects.length, "janelas de buffering:", bufferWindows);

console.log("=== FASE 2: throttle 40s — disco deve cobrir durante buffer */");
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 350, downloadThroughput: 350 * 1024 / 8, uploadThroughput: 150 * 1024 / 8 });
const suspects2 = [];
for (let i = 1; i <= 40; i++) {
  await page.waitForTimeout(1000);
  const s = await snap();
  const isBuf = states.length && ["BUFFERING"].includes(states[states.length - 1][1]) && Date.now() - states[states.length - 1][0] < 6000;
  const hidden = s.ovOp === 0 && !s.disc && !s.poster;
  if (hidden && i % 3 === 0) {
    const f = `${OUT}/s2_${i}s.png`;
    await page.screenshot({ path: f, clip }).catch(() => {});
    suspects2.push({ t: i, f, s, buffering: isBuf });
  }
  if (i % 5 === 0) console.log(`f2+${i}s disc=${s.disc ? 1 : 0} ov=${s.ovOp} poster=${s.poster ? 1 : 0} buf=${isBuf ? 1 : 0}`);
}
console.log("FASE2 suspeitos:", suspects2.length);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ suspects, suspects2, states: states.slice(-60) }, null, 1));
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await browser.close();
console.log("LONE DONE — suspeitos:", suspects.length + suspects2.length);
