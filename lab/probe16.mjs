import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => {
  window.addEventListener("error", (e) => {
    console.log("ERR>", e.message, "| file:", e.filename || "(inline)", "| line:", e.lineno, "| col:", e.colno);
  }, true);
  window.addEventListener("unhandledrejection", (e) => {
    console.log("REJ>", String(e.reason).slice(0, 200));
  });
});
page.on("console", (m) => { const t = m.text(); if (/ERR>|REJ>/.test(t)) console.log("[c]", t.slice(0, 400)); });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(6000);
await browser.close();
