/** B: rede lenta → oscila BUFFERING↔PLAYING → cadeia de stamps segura controles? */
import { chromium } from "playwright";
const URL = process.env.TARGET || "https://xerifeswitch.netlify.app/";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const states = [];
page.on("console", (m) => { const t = m.text(); if (/state: (PLAYING|BUFFERING)/.test(t)) { const s = t.match(/state: (\w+)/)[1]; states.push([Date.now(), s]); console.log("[s]", s); } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);
// ~400kbps — aplicado DEPOIS do load p/ não estourar o goto do dev-server
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false, latency: 400,
  downloadThroughput: 400 * 1024 / 8, uploadThroughput: 200 * 1024 / 8,
});
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "BBB", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
// espera PLAYING e janela inicial fechar
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  const playing = states.some(([, s]) => s === "PLAYING");
  if (playing && i > 10) break;
}
console.log("estados ate agora:", states.length, "bufferings:", states.filter(([, s]) => s === "BUFFERING").length);

const ov = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  return { ovOp: overlay ? +(+getComputedStyle(overlay).opacity).toFixed(2) : null, disc: !!document.querySelector("[data-center-glyph-cover]") };
});
const before = states.length;
console.log("t0:", JSON.stringify(await ov()));
// observa 40s sob rebuffering
let stuck = 0;
for (let i = 1; i <= 20; i++) {
  await page.waitForTimeout(2000);
  const s = await ov();
  const buf = states.slice(before).filter(([, x]) => x === "BUFFERING").length;
  console.log(`+${i * 2}s ov=${s.ovOp} disc=${s.disc ? 1 : 0} bufferings_novos=${buf}`);
  if (s.ovOp && s.ovOp > 0.5) stuck++;
}
console.log("bufferings totais:", states.filter(([, s]) => s === "BUFFERING").length, "| amostras com ov>0.5:", stuck);
await browser.close();
console.log("B DONE");
