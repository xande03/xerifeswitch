import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
CACHE_KEY = "xerife_artist_avatars_v2"

VIEWPORTS = {
    "mobile":  {"width": 390,  "height": 800},
    "desktop": {"width": 1440, "height": 900},
}

async def run(pw, label, viewport):
    browser = await pw.chromium.launch(headless=True)
    ctx = await browser.new_context(viewport=viewport)
    page = await ctx.new_page()
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate("localStorage.setItem('demus-home-mode','music'); localStorage.setItem('demus-podcast-mode','0'); localStorage.removeItem('xerife_artist_avatars_v2')")
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)

    # abrir a tela Buscar
    await page.get_by_role("button", name="Buscar", exact=True).first.click()
    await page.wait_for_timeout(600)

    inp = page.locator("input[placeholder*='Buscar']").first
    await inp.wait_for(timeout=8000)
    await inp.fill("aline barros"); await inp.press("Enter")
    await page.wait_for_timeout(7000)  # debounce + fetch músicas + fetch artistas
    await page.screenshot(path=str(SHOTS / f"{label}_1_initial.png"))

    cache1raw = await page.evaluate(f"localStorage.getItem({json.dumps(CACHE_KEY)})")
    cache1 = json.loads(cache1raw) if cache1raw else {}
    urls1 = {k: v.get("url") for k, v in cache1.items()}
    ts1 = {k: v.get("ts") for k, v in cache1.items()}
    print(f"[{label}] cache after 1st search ({len(cache1)}):", list(urls1.keys())[:5])
    assert cache1, f"[{label}] avatar cache não foi populado"

    # Simular TTL expirado (>6h): antedatar timestamps
    old_marker = await page.evaluate(f"""
    (() => {{
      const k = {json.dumps(CACHE_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{{}}');
      const old = Date.now() - 7*60*60*1000;
      for (const key of Object.keys(s)) s[key].ts = old;
      localStorage.setItem(k, JSON.stringify(s));
      return old;
    }})()
    """)
    print(f"[{label}] TTL forçado para", old_marker)

    # Re-disparar busca (mudar query -> voltar) para forçar re-render do hook
    await inp.fill("")
    await page.wait_for_timeout(500)
    await inp.fill("aline barros"); await inp.press("Enter")
    await page.wait_for_timeout(7000)
    await page.screenshot(path=str(SHOTS / f"{label}_2_after_ttl.png"))

    cache2raw = await page.evaluate(f"localStorage.getItem({json.dumps(CACHE_KEY)})")
    cache2 = json.loads(cache2raw) if cache2raw else {}
    now = int(time.time() * 1000)
    refreshed = [k for k, v in cache2.items() if v.get("ts", 0) > now - 5*60*1000]
    print(f"[{label}] entradas renovadas ({len(refreshed)}):", refreshed[:5])
    assert refreshed, f"[{label}] nenhuma entrada renovada após TTL expirar"

    yt_imgs = await page.evaluate("""
      Array.from(document.querySelectorAll('img'))
        .map(i => i.currentSrc || i.src)
        .filter(s => s && /ytimg|googleusercontent|ggpht/.test(s)).length
    """)
    print(f"[{label}] imagens YouTube visíveis:", yt_imgs)
    assert yt_imgs > 0

    await browser.close()
    print(f"[{label}] PASS ✓")

async def main():
    async with async_playwright() as pw:
        for label, vp in VIEWPORTS.items():
            await run(pw, label, vp)

asyncio.run(main())
