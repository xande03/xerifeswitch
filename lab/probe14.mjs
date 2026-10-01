import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("response", (r) => {
  const ct = r.headers()["content-type"] || "";
  const u = r.url();
  if (r.status() >= 400 || (ct.includes("text/html") && /localhost:5173.*\.(ts|tsx|js|mjs)/.test(u)))
    console.log("[bad]", r.status(), ct.slice(0, 30), u.slice(0, 160));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
await page.waitForTimeout(3000);
await browser.close();
