import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 500), "\nSTACK:", (e.stack || "").slice(0, 500)));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
for (const t of [3, 6, 10, 15, 20]) {
  await page.waitForTimeout(t === 3 ? 3000 : (t - [3,6,10,15,20][[3,6,10,15,20].indexOf(t)-1]) * 1000);
  const s = await page.evaluate(() => ({
    protoLoad: typeof window.YT?.Player?.prototype?.loadVideoById,
    protoPlay: typeof window.YT?.Player?.prototype?.playVideo,
    nKeys: window.YT?.Player ? Object.getOwnPropertyNames(window.YT.Player.prototype).length : 0,
  }));
  console.log(`+${t}s`, JSON.stringify(s));
}
await browser.close();
