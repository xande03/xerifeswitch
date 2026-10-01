import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("response", async (r) => {
  const u = r.url();
  if (/youtube\.com|ytimg|yt\/|widgetapi|iframe_api/i.test(u)) {
    const ct = r.headers()["content-type"] || "";
    console.log("[resp]", r.status(), ct.slice(0, 40), u.slice(0, 140));
  }
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(6000);
const s = await page.evaluate(() => ({
  protoLoad: typeof window.YT?.Player?.prototype?.loadVideoById,
  protoKeys: window.YT?.Player ? Object.getOwnPropertyNames(window.YT.Player.prototype).slice(0, 20) : null,
}));
console.log("STATE", JSON.stringify(s));
await browser.close();
