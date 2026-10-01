import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); console.log("[c]", t.slice(0, 240)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("requestfailed", (r) => { if (/youtube|iframe_api|widgetapi/i.test(r.url())) console.log("[reqfail]", r.url().slice(0, 120), r.failure()?.errorText); });
page.on("response", (r) => { if (/iframe_api|widgetapi/i.test(r.url())) console.log("[resp]", r.status(), r.url().slice(0, 120)); });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(6000);
const s = await page.evaluate(() => ({
  YT: typeof window.YT, Player: typeof window.YT?.Player,
  ytReadyFn: typeof window.onYouTubeIframeAPIReady,
  scripts: [...document.querySelectorAll("script[src]")].map((s) => s.src).filter((s) => /youtube/i.test(s)),
  ifr: [...document.querySelectorAll("iframe")].map((f) => ({ id: f.id, src: f.src.slice(0, 80) })),
  slotTag: document.getElementById("yt-player-slot")?.tagName,
}));
console.log("STATE", JSON.stringify(s, null, 1));
await browser.close();
