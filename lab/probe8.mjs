import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/\[YT\]|WRAP|onStateChange|history|pageerror|player-created|onReadyFired/i.test(t)) console.log("[c]", t.slice(0, 280)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Sessão Xerife Vídeos"]').click({ timeout: 5000 });
await page.waitForTimeout(400);

await page.evaluate(() => {
  window.__wraps = { load: 0, ctor: 0, ready: 0, cue: 0 };
  const YT = window.YT;
  if (YT?.Player) {
    const proto = YT.Player.prototype;
    for (const m of ["loadVideoById", "cueVideoById", "playVideo", "pauseVideo", "getPlayerState"]) {
      const orig = proto[m];
      if (typeof orig === "function" && !orig.__w) {
        proto[m] = function (...a) {
          if (m === "loadVideoById") { window.__wraps.load++; console.log("WRAP loadVideoById", JSON.stringify(a).slice(0, 120)); }
          if (m === "cueVideoById") { window.__wraps.cue++; console.log("WRAP cueVideoById", JSON.stringify(a).slice(0, 120)); }
          if (m === "playVideo") console.log("WRAP playVideo");
          if (m === "pauseVideo") console.log("WRAP pauseVideo");
          return orig.apply(this, a);
        };
        proto[m].__w = true;
      }
    }
    const origCtor = YT.Player;
    // já criado? rastreia PlayerState p/ onReady indireto
    console.log("WRAP installed, Player exists:", !!origCtor);
  } else console.log("WRAP failed, YT:", typeof YT, YT && typeof YT.Player);
  window.addEventListener("demus:history-updated", () => console.log("WRAP history-updated"));
  window.addEventListener("storage", (e) => { if (e.key === "demus-player-mode") console.log("WRAP player-mode ->", e.newValue); });
});
// player já pode existir — instale nos prototypes e force re-check
console.log("state:", await page.evaluate(() => window.__wraps));

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "BBB", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const ifr = document.querySelector("#yt-player iframe");
    return { wraps: window.__wraps, src: (ifr?.src || "").slice(9, 60) };
  });
  console.log(`+${i}s`, JSON.stringify(s));
}
await browser.close();
