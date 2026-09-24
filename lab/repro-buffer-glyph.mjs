/** Gap B: glifo/spinner do YT a céu aberto durante BUFFERING.
 * Força rebuffering cedo (throttle com buffer fino) e registra
 * disc/ov/poster + screenshots durante a janela de buffering. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = "lab/shots/bufglyph";
mkdirSync(OUT, { recursive: true });
const URL = process.env.TARGET || "http://localhost:5173/";
const TAG = process.env.TAG || "run";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const states = [];
page.on("console", (m) => {
  const t = m.text();
  const hit = t.match(/state: (PLAYING|BUFFERING|PAUSED|ENDED)/);
  if (hit) states.push([Date.now(), hit[1]]);
});
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 8000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "vWv5z6EteTs", title: "A GRAVE SITUAÇÃO DO BRASIL", channel: "SACANI", thumbnail: "https://i.ytimg.com/vi/vWv5z6EteTs/maxresdefault.jpg", duration: 3000, lengthSeconds: 3000 } }));
});
// Espera PLAYING + janela do glifo de load passar
await page.waitForTimeout(7500);

const rect = await page.evaluate(() => {
  const r = document.getElementById("yt-fullscreen-container")?.getBoundingClientRect();
  return r && r.width > 100 ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
});
if (!rect) { console.log("FAIL: sem player"); await browser.close(); process.exit(2); }

const snap = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  const disc = document.querySelector("[data-center-glyph-cover]");
  const poster = [...document.querySelectorAll("div")].some((d) => {
    const c = (d.className || "").toString();
    return c.includes("z-[209]") && c.includes("absolute");
  });
  return {
    disc: !!disc,
    ovOp: overlay ? +(+getComputedStyle(overlay).opacity).toFixed(2) : null,
    poster,
  };
});

// Throttle AGORA (buffer fino do início) para forçar rebuffering
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false, latency: 400,
  downloadThroughput: (Number(process.env.KBPS) || 250) * 1024 / 8, uploadThroughput: 100 * 1024 / 8,
});
console.log(`=== throttle ${(Number(process.env.SECS) || 70)}s @ ${(Number(process.env.KBPS) || 250)}kbps — caça buffering descoberto ===`);
const rows = [];
let bufSecs = 0, bareBuf = 0, shots = 0;
const N = Number(process.env.SECS) || 70;
for (let i = 1; i <= N * 2; i++) {
  await page.waitForTimeout(500);
  const s = await snap();
  const last = states[states.length - 1];
  const isBuf = last && last[1] === "BUFFERING" && Date.now() - last[0] < 7000;
  const row = { t: i * 0.5, buf: isBuf ? 1 : 0, ...s };
  rows.push(row);
  if (isBuf) {
    bufSecs += 0.5;
    if (shots < 8 && s.disc && !rows.some((r) => r.buf && r.disc && r.shot)) {
      const f = `${OUT}/${TAG}_covered_${row.t}s.png`;
      await page.screenshot({ path: f, clip: rect }).catch(() => {});
      row.shot = true; shots++;
    }
    const bare = !s.disc && s.ovOp === 0 && !s.poster;
    if (bare) {
      bareBuf += 0.5;
      if (shots < 8 && i % 4 === 0) {
        const f = `${OUT}/${TAG}_bare_${row.t}s.png`;
        await page.screenshot({ path: f, clip: rect }).catch(() => {});
        shots++;
      }
    }
  }
  if (i % 10 === 0) console.log(`t+${row.t} buf=${row.buf} disc=${s.disc ? 1 : 0} ov=${s.ovOp} poster=${s.poster ? 1 : 0}`);
}
console.log(`RESUMO[${TAG}]: buffering total ${bufSecs}s, DESCOBERTO (sem disco/ov/poster) ${bareBuf}s, shots ${shots}`);
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ rows, states: states.slice(-40) }, null, 1));
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await browser.close();
