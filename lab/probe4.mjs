import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/YT onState|expanded|splash|Error/i.test(t)) console.log("[c]", t.slice(0, 200)); });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);

const pre = await page.evaluate(() => ({
  splashVisible: [...document.querySelectorAll("div")].some((d) => { const s = getComputedStyle(d); const r = d.getBoundingClientRect(); return s.position === "fixed" && r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.1; }),
  ls: { mode: localStorage.getItem("demus-player-mode"), home: localStorage.getItem("demus-home-mode") || localStorage.getItem("demus-module-mode"), prepip: sessionStorage.getItem("demus-prepip-expanded") },
  keys: Object.keys(localStorage).filter((k) => /home|mode|module|splash/i.test(k)),
}));
console.log("PRE", JSON.stringify(pre));

// fecha splash se houver clicando em qualquer lugar dele
await page.mouse.click(640, 400);
await page.waitForTimeout(800);
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", lengthSeconds: 596 } }));
});
await page.waitForTimeout(3000);

const post = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const t = document.querySelector("[data-central-transport]");
  // procura NowPlayingView / painel expandido
  const npv = document.querySelector('[class*="now-playing"], [id*="now-playing"]');
  const bigFixed = [...document.querySelectorAll("div")].filter((d) => { const s = getComputedStyle(d); const r = d.getBoundingClientRect(); return (s.position === "fixed" || s.position === "absolute") && r.width > 400 && r.height > 300 && r.left > -100; }).map((d) => ({ id: d.id, cls: (d.className || "").toString().slice(0, 70), z: getComputedStyle(d).zIndex, r: [Math.round(d.getBoundingClientRect().x), Math.round(d.getBoundingClientRect().y), Math.round(d.getBoundingClientRect().width), Math.round(d.getBoundingClientRect().height)] })).slice(0, 12);
  return {
    containerCls: (c?.className || "").slice(0, 90),
    transport: !!t,
    iframe: !!document.querySelector("#yt-player-slot iframe, #yt-player iframe"),
    expandedHints: [...document.querySelectorAll("[data-central-transport], [aria-label*=Sair]")].length,
    bigFixed,
    disc: !!document.querySelector("[data-center-glyph-cover]"),
  };
});
console.log("POST", JSON.stringify(post, null, 1));
await page.screenshot({ path: "lab/shots/repro/r4-after-dispatch.png" });
await browser.close();
