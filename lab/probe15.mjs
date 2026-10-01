import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("response", (r) => {
  const ct = (r.headers()["content-type"] || "").toLowerCase();
  const u = r.url();
  if (ct.includes("text/html") && /widgetapi|iframe_api|player.*\.js|\.vflset|player_embed/i.test(u))
    console.log("[HTML-for-JS]", r.status(), u.slice(0, 150));
});
page.on("requestfinished", async (r) => {
  if (r.resourceType() !== "script") return;
  try {
    const h = await r.response()?.headers();
    const ct = (h?.["content-type"] || "").toLowerCase();
    if (ct.includes("text/html")) console.log("[script-ct-html]", r.url().slice(0, 150));
  } catch {}
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 150)));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => ({
    play: typeof window.YT?.Player?.prototype?.playVideo,
    load: typeof window.YT?.Player?.prototype?.loadVideoById,
    readyCb: typeof window.onYouTubeIframeAPIReady,
    keys: window.YT?.Player ? Object.getOwnPropertyNames(window.YT.Player.prototype).length : 0,
  }));
  if (i % 3 === 0 || s.play === "function") console.log(`+${i + 1}s`, JSON.stringify(s));
  if (s.play === "function") { console.log("METHODS APPEARED at", i + 1, "s"); break; }
}
await browser.close();
