import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (/YT onState|Auto-play|handlePlay|Index/i.test(t)) console.log("[c]", t.slice(0, 240)); });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.mouse.click(640, 400); // fecha splash se houver
await page.waitForTimeout(600);

await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("xerife:auto-play-video", { detail: { videoId: "aqz-KE-bpKQ", title: "BBB", channel: "Blender", thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg", duration: 596, lengthSeconds: 596 } }));
});
await page.waitForTimeout(2500);

const post = await page.evaluate(() => {
  const c = document.getElementById("yt-fullscreen-container");
  const shell = document.getElementById("now-playing-shell");
  return {
    playerMode: localStorage.getItem("demus-player-mode"),
    lastTrack: JSON.parse(localStorage.getItem("demus-last-track") || "null")?.song?.type,
    containerCls: (c?.className || "").slice(0, 100),
    transport: !!document.querySelector("[data-central-transport]"),
    tapAria: document.querySelector('button[aria-label*="controles" i]')?.getAttribute("aria-label") || null,
    shell: shell ? { cls: shell.className.slice(0, 90), h: shell.clientHeight, kids: shell.children.length } : null,
    iframeInSlot: !!document.querySelector("#yt-player-slot iframe"),
    overlayExists: !!document.querySelector("#yt-player"),
  };
});
console.log("POST", JSON.stringify(post, null, 1));
await page.screenshot({ path: "lab/shots/repro/r5-after.png" });
await browser.close();
