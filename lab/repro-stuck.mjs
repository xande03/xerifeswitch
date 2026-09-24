/** A: pointerdown na barra sem pointerup → interacting preso? auto-hide morre? */
import { chromium } from "playwright";
const URL = process.env.TARGET || "https://xerifeswitch.netlify.app/";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (/state: PLAYING/.test(m.text())) console.log("[PLAYING]"); });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 6000 }).catch(() => {});
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "BBB", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
await page.waitForTimeout(9000); // deixa a janela do load fechar e esconder sozinho

const ov = () => page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const overlay = t ? (t.closest(".z-\\[215\\]") || null) : null;
  return { ovOp: overlay ? +(+getComputedStyle(overlay).opacity).toFixed(2) : null, disc: !!document.querySelector("[data-center-glyph-cover]") };
});
console.log("baseline (deveria estar oculto):", JSON.stringify(await ov()));

// Simula interação na seekbar que NUNCA termina (pointerdown sem up —
// equivalente a pointerup perdido: janela/system gesture/etc.)
await page.evaluate(() => {
  const t = document.querySelector("[data-central-transport]");
  const row = t?.closest(".z-\\[215\\]")?.querySelector(".flex.items-center.gap-2");
  const target = row || t;
  target?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
});
console.log("apos pointerdown (sticky):", JSON.stringify(await ov()));
await page.waitForTimeout(12000);
console.log("12s depois (timer deveria ter escondido):", JSON.stringify(await ov()));

// Mesmo assim um TOQUE no tap-catcher ainda esconde? (toggle manual)
await page.evaluate(() => {
  const tap = document.querySelector('button[aria-label*="controles" i]');
  tap?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(600);
console.log("apos toque manual no tap-catcher:", JSON.stringify(await ov()));
await browser.close();
console.log("A DONE");
