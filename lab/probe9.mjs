import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/DEBUG-REPRO|\[YT\]|onStateChange|Piped/i.test(t)) console.log("[c]", t.slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 5000 });
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "BBB", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
for (let i = 1; i <= 12; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const ifr = document.querySelector("#yt-player iframe");
    return (ifr?.src || "").slice(9, 70);
  });
  console.log(`+${i}s src=${s}`);
}
await browser.close();
