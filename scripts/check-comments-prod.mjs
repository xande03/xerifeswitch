/** Valida ao vivo que os comentários chegam na UI de produção (mobile). */
import { chromium } from "playwright";
const BASE = process.argv[2] || "https://xerifeswitch.netlify.app/";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
});
await ctx.addInitScript(() => {
  localStorage.setItem("pwa-install-dismissed", "1");
  localStorage.setItem("xerife:music-video-reload-hint-seen", "1");
  localStorage.setItem("demus-player-expanded", "0");
  localStorage.setItem("demus-player-mode", "audio");
  localStorage.setItem("demus-home-mode", "video");
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: {
  videoId: "dQw4w9WgXcQ", title: "Rick Astley - Never Gonna Give You Up",
  channel: "Rick Astley", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: 213,
}})));
await page.waitForTimeout(4500);
const tab = page.locator('button:has-text("Discussão")').first();
if ((await tab.count()) === 0) { console.log("FAIL botão Discussão não encontrado (layout?"); process.exit(1); }
await tab.tap().catch(() => tab.click());
const t0 = Date.now();
let count = 0, unavailable = false;
while (Date.now() - t0 < 15000) {
  await page.waitForTimeout(1000);
  unavailable = (await page.locator('text=Comentários não disponíveis').count()) > 0;
  count = await page.evaluate(() =>
    [...document.querySelectorAll("p")].filter((p) =>
      (p.className || "").includes("whitespace-pre-line") && (p.textContent || "").trim().length > 12
    ).length);
  if (count >= 5) break;
}
console.log(`comentários renderizados: ${count} em ${((Date.now()-t0)/1000).toFixed(1)}s | unavailable=${unavailable}`);
await page.screenshot({ path: "/tmp/comments-prod.png" });
const ok = count >= 5;
console.log(`PROD COMMENTS: ${ok ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(ok ? 0 : 1);
