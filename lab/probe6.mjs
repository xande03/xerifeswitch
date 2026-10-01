import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/YT onState|native|piped|fallback|source/i.test(t)) console.log("[c]", t.slice(0, 220)); });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2200);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 5000 });
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
await page.waitForTimeout(5000);
const s = await page.evaluate(() => {
  const v = document.querySelector("#yt-player video, video");
  const ifr = document.querySelector("#yt-player-slot iframe, #yt-player iframe");
  const t = document.querySelector("[data-central-transport]");
  const poster = [...document.querySelectorAll("div")].find((d) => (d.className||"").toString().includes("z-[209]") && d.className.toString().includes("absolute"));
  return {
    video: v ? { paused: v.paused, ct: v.currentTime, src: (v.currentSrc||"").slice(0, 80), w: v.clientWidth, h: v.clientHeight } : null,
    iframe: ifr ? { src: (ifr.src||"").slice(0, 90), w: ifr.clientWidth } : null,
    transport: !!t,
    posterish: poster ? (poster.className||"").toString().slice(0,60) : null,
    disc: !!document.querySelector("[data-center-glyph-cover]"),
    ls: { mode: localStorage.getItem("demus-player-mode") },
  };
});
console.log(JSON.stringify(s, null, 1));
await page.screenshot({ path: "lab/shots/repro/p6-state.png" });
await browser.close();
