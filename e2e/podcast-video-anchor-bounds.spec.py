"""Regressão de layout: #music-video-anchor não pode ultrapassar limites laterais
em 390 (mobile), 1024 (tablet) e 1440 (desktop), mantendo 16:9. Também revalida
após rotação portrait↔landscape.

Executar: python3 e2e/podcast-video-anchor-bounds.spec.py
"""
import asyncio, http.server, socketserver, threading
from playwright.async_api import async_playwright

import socket as _s
_tmp = _s.socket(); _tmp.bind(("", 0)); PORT = _tmp.getsockname()[1]; _tmp.close()
HTML = """<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<style>html,body{margin:0;background:#000;color:#fff;overflow:hidden}</style>
</head><body>
<div class="w-full lg:w-1/2 flex flex-col justify-center items-center gap-4 relative">
  <div class="w-full group relative aspect-video max-w-[380px] sm:max-w-[440px] lg:max-w-[520px] mx-auto px-3 sm:px-4 mt-2 sm:mt-4">
    <div id="music-video-anchor" class="w-full aspect-video rounded-3xl bg-black/40 shadow-2xl" aria-hidden></div>
  </div>
</div>
</body></html>"""

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("content-type","text/html"); self.end_headers()
        self.wfile.write(HTML.encode())
    def log_message(self, *_): pass

class ReusableTCP(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

def serve():
    with ReusableTCP(("127.0.0.1", PORT), H) as s:
        s.serve_forever()

CASES = [
    ("mobile 390",    390, 844,  380 - 24),   # <sm: max-w 380, px-3
    ("tablet 1024",  1024, 800,  520 - 32),   # lg: max-w 520, sm:px-4
    ("desktop 1440", 1440, 900,  520 - 32),
]

async def main():
    t = threading.Thread(target=serve, daemon=True); t.start()
    await asyncio.sleep(0.3)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        try:
            for label, w, h, maxA in CASES:
                ctx = await b.new_context(viewport={"width": w, "height": h})
                page = await ctx.new_page()
                await page.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle")
                await page.wait_for_timeout(200)
                r = await page.evaluate("""() => {
                    const el = document.getElementById('music-video-anchor');
                    const r = el.getBoundingClientRect();
                    return {left:r.left,right:r.right,width:r.width,height:r.height,vw:window.innerWidth};
                }""")
                assert r["left"] >= 0, f"[{label}] overflow esquerdo: left={r['left']}"
                assert r["right"] <= r["vw"], f"[{label}] overflow direito: right={r['right']} vw={r['vw']}"
                assert r["width"] <= maxA + 1, f"[{label}] largura {r['width']} > max {maxA}"
                ratio = r["width"] / r["height"]
                assert abs(ratio - 16/9) < 0.02, f"[{label}] aspect {ratio:.3f} != 16:9"

                # Rotação
                await page.set_viewport_size({"width": h, "height": w})
                await page.wait_for_timeout(150)
                r2 = await page.evaluate("""() => {
                    const el = document.getElementById('music-video-anchor');
                    const r = el.getBoundingClientRect();
                    return {left:r.left,right:r.right,width:r.width,vw:window.innerWidth};
                }""")
                assert r2["left"] >= 0 and r2["right"] <= r2["vw"], \
                    f"[{label}] após rotação: left={r2['left']} right={r2['right']} vw={r2['vw']}"
                print(f"✅ {label}: w={r['width']:.1f} h={r['height']:.1f} ratio={ratio:.3f} | rotado w={r2['width']:.1f}")
                await ctx.close()
            print("\n✅ music-video-anchor bounds ok em todos os breakpoints")
        finally:
            await b.close()

asyncio.run(main())
