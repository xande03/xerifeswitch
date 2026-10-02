/**
 * Validação visual do PORT do player Alse → Xerife (Task7).
 * Contrato "exato" Alse:
 *   1. SEM disco ([data-center-glyph-cover]) e SEM poster ([data-paused-poster]).
 *   2. Transporte CENTRAL (⏮ ⏸/▶ ⏭) visível quando os controles estão visíveis.
 *   3. Controles permanecem VISIBLES enquanto pausado (keepOpen) — >4.5s após pause.
 *   4. Auto-hide TOCANDO em ~4000ms (controles somem após ~4.8s tocando).
 *   5. Tap no vídeo alterna a visibilidade dos controles (tap-catcher).
 * Uso: node scripts/repro-port.mjs [baseURL]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = "/tmp/repro-port";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1117, height: 619 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(() => {
  localStorage.setItem("pwa-install-dismissed", "1");
  localStorage.setItem("xerife:music-video-reload-hint-seen", "1");
  localStorage.setItem("demus-player-expanded", "0");
  localStorage.setItem("demus-player-mode", "audio");
  localStorage.setItem("demus-home-mode", "video");
  localStorage.removeItem("demus-podcast-mode");
  localStorage.removeItem("demus-last-track");
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);

// Engata vídeo de teste
await page.evaluate(() => {
  window.dispatchEvent(
    new CustomEvent("xerife:auto-play-video", {
      detail: {
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley - Never Gonna Give You Up",
        channel: "Rick Astley",
        thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        duration: 213,
      },
    })
  );
});
await page.waitForTimeout(4000);

const playerBox = await page.locator("#yt-player").boundingBox().catch(() => null);
check("player montado (#yt-player)", !!playerBox, playerBox ? `${Math.round(playerBox.width)}x${Math.round(playerBox.height)}` : "sem bbox");

// --- Probes estáticos (glyph/poster somem por construção) ---
const glyphCount = await page.locator("[data-center-glyph-cover]").count();
const posterCount = await page.locator("[data-paused-poster]").count();
check("SEM disco do glifo", glyphCount === 0, `count=${glyphCount}`);
check("SEM poster pausado", posterCount === 0, `count=${posterCount}`);

// --- Tap para revelar controles (tap catcher alterna) ---
const tapAt = async () => {
  const b = (await page.locator("#yt-player").boundingBox()) || playerBox;
  await page.touchscreen.tap(b.x + b.width * 0.85, b.y + b.height * 0.25);
  await page.waitForTimeout(450);
};
const centralVisible = async () => {
  // Métrica correta: opacidade computada da camada de controles z-[215]
  // (o layer tem pointer-events-none no estado oculto; o botão nunca muda).
  return await page.evaluate(() => {
    const layer = [...document.querySelectorAll("div")].find((d) =>
      typeof d.className === "string" && d.className.includes("z-[215]")
    );
    if (!layer) return false;
    const cs = getComputedStyle(layer);
    return cs.opacity !== "0" && cs.display !== "none" && cs.visibility !== "hidden";
  });
};

let visible = await centralVisible();
if (!visible) { await tapAt(); visible = await centralVisible(); }
check("transporte CENTRAL visível", visible);

// --- Fluxo: tocar (se pausado) → auto-hide em ~4s ---
const playBtn = page.locator('button[title="Reproduzir"]').first();
if ((await playBtn.count()) > 0 && (await playBtn.isVisible())) {
  await playBtn.tap().catch(() => playBtn.click());
  await page.waitForTimeout(700);
}
// garante controles visíveis
if (!(await centralVisible())) { await tapAt(); }
check("após play: controles visíveis", await centralVisible());

await page.waitForTimeout(5200); // > 4000ms
const hiddenWhilePlaying = !(await centralVisible());
check("tocando: auto-hide ~4000ms", hiddenWhilePlaying);

// --- Revela de novo → pausa → keepOpen (>4.5s pausado ainda visível) ---
await tapAt();
check("tap revela controles de novo", await centralVisible());
const pauseBtn = page.locator('button[title="Pausar"]').first();
if ((await pauseBtn.count()) > 0) {
  await pauseBtn.tap().catch(() => pauseBtn.click());
}
await page.waitForTimeout(700);
const visibleAfterPause = await centralVisible();
check("pausado: controles visíveis no momento da pausa", visibleAfterPause);
await page.waitForTimeout(5200); // > 4000ms pausado
const stillVisiblePaused = await centralVisible();
check("pausado: controles continuam visíveis (keepOpen >4.5s)", stillVisiblePaused);

// --- Bottom bar SEM play (play exclusivo do transporte central) ---
const bottomPlay = await page.evaluate(() => {
  const bar = [...document.querySelectorAll("div")].find((d) =>
    (d.className || "").toString().includes("z-[215]") &&
    [...d.querySelectorAll("button")].some((b) => (b.getAttribute("title") || "").includes("Pausar"))
  );
  // procura botões de play DENTRO da barra inferior mas FORA do transporte central
  const all = [...document.querySelectorAll('button[title="Pausar"], button[title="Reproduzir"]')];
  return all.filter((b) => {
    const r = b.getBoundingClientRect();
    const layer = b.closest('[class*="z-[215]"]');
    if (!layer) return false;
    const lr = layer.getBoundingClientRect();
    return r.top > lr.top + lr.height * 0.72; // bottom ~28% = barra inferior
  }).length;
});
check("bottom bar SEM botão play/pause", bottomPlay === 0, `bottomPlay=${bottomPlay}`);

await page.screenshot({ path: `${OUT}-final.png` });
console.log("\nSCREENSHOT", `${OUT}-final.png`);
const failed = results.filter((r) => !r.ok);
console.log(`\nPORT CONTRACT: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
