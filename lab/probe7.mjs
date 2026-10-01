import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/\[YT\]|onStateChange|onReady|onError|iframe_api|apiReady|Unhandled|TypeError/i.test(t)) console.log("[c]", t.slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 5000 });
await page.waitForTimeout(500);
console.log("API flags before:", await page.evaluate(() => ({ yt: typeof window.YT, ready: typeof window.onYouTubeIframeAPIReady })));
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "BBB", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
for (let i = 1; i <= 14; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const ifr = document.querySelector("#yt-player iframe, #yt-player-slot iframe");
    const v = document.querySelector("#yt-player video");
    return {
      src: (ifr?.src || "").slice(0, 110),
      vPaused: v ? v.paused : null,
      vW: v ? v.clientWidth : null,
      mode: localStorage.getItem("demus-player-mode"),
    };
  });
  console.log(`+${i}s`, JSON.stringify(s));
}
await browser.close();
