import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 45000 });
// cria um player de teste DIRETO na página, fora do app, e vê se métodos aparecem
await page.waitForTimeout(4000);
const r = await page.evaluate(async () => {
  const div = document.createElement("div");
  div.id = "probe-player";
  document.body.appendChild(div);
  const p = await new Promise((resolve) => {
    try {
      const inst = new YT.Player("probe-player", {
        height: "100%", width: "100%",
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (e) => resolve({ ok: true, hasLoad: typeof e.target.loadVideoById, hasPlay: typeof e.target.playVideo, protoLoad: typeof YT.Player.prototype.loadVideoById }),
          onError: (e) => resolve({ ok: false, err: e.data }),
        },
      });
      setTimeout(() => resolve({ ok: false, timeout: true, inst: !!inst, protoKeys: Object.getOwnPropertyNames(YT.Player.prototype) }), 8000);
    } catch (e) { resolve({ ok: false, threw: String(e) }); }
  });
  return p;
});
console.log("PROBE PLAYER:", JSON.stringify(r, null, 1));
await browser.close();
