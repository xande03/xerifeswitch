"""E2E: verifica persistência do módulo (mobile + desktop) contra o dev server."""
import asyncio, os
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
# Aceita hues por módulo (H de HSL). Lightness varia por tema dark/light —
# o essencial é que o hue não "vaze" entre módulos após reload.
EXPECTED_HUES = {"hub": {217}, "music": {142}, "video": {0}, "podcast": {265, 270}}
MOBILE = {"width": 390, "height": 844}
DESKTOP = {"width": 1280, "height": 900}

CASES = [
    dict(label="mobile · default hub",  viewport=MOBILE,  url=f"{BASE}/", ls={}, act=None, expected="hub", query="none"),
    dict(label="desktop · default hub", viewport=DESKTOP, url=f"{BASE}/", ls={}, act=None, expected="hub", query="none"),
    dict(label="mobile · ?module=podcast",  viewport=MOBILE,  url=f"{BASE}/?module=podcast", ls={}, act=None, expected="podcast", query="podcast"),
    dict(label="desktop · ?module=podcast", viewport=DESKTOP, url=f"{BASE}/?module=podcast", ls={}, act=None, expected="podcast", query="podcast"),
    dict(label="mobile · localStorage music", viewport=MOBILE,
         url=f"{BASE}/", ls={"demus-home-mode":"music","demus-podcast-mode":"0"}, act=None, expected="music", query="none"),
    dict(label="desktop · localStorage video", viewport=DESKTOP,
         url=f"{BASE}/", ls={"demus-home-mode":"video","demus-podcast-mode":"0"}, act=None, expected="video", query="none"),
    dict(label="mobile · podcast → music sem resíduo", viewport=MOBILE,
         url=f"{BASE}/?module=podcast", ls={},
         act="""() => { localStorage.setItem('demus-home-mode','music'); localStorage.setItem('demus-podcast-mode','0'); history.replaceState(null,'','/'); }""",
         expected="music", query="none"),
    dict(label="desktop · music → podcast overlay lilás", viewport=DESKTOP,
         url=f"{BASE}/", ls={"demus-home-mode":"music"},
         act="""() => { localStorage.setItem('demus-podcast-mode','1'); history.replaceState(null,'','/?module=podcast'); }""",
         expected="podcast", query="podcast"),
]

async def run_case(browser, c):
    ctx = await browser.new_context(viewport=c["viewport"])
    page = await ctx.new_page()
    await page.goto(c["url"], wait_until="domcontentloaded")
    if c["ls"]:
        await page.evaluate("(kv) => { for (const [k,v] of Object.entries(kv)) localStorage.setItem(k,v); }", c["ls"])
    if c["act"]:
        await page.evaluate(c["act"])
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_function("() => !!document.documentElement.getAttribute('data-module')")
    state = await page.evaluate("""() => ({
        dataModule: document.documentElement.getAttribute('data-module'),
        primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
        url: location.href,
    })""")
    exp = c["expected"]
    hue = int(state["primary"].split()[0]) if state["primary"] else -1
    ok = state["dataModule"] == exp and hue in EXPECTED_HUES[exp]
    if c["query"] == "podcast":
        ok = ok and "module=podcast" in state["url"]
    elif c["query"] == "none":
        ok = ok and "module=" not in state["url"]
    print(("✅" if ok else "❌"), c["label"], "→", state)
    await ctx.close()
    assert ok, c["label"]

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        try:
            for c in CASES:
                await run_case(b, c)
            print("\n✅ All module-persistence e2e cases passed")
        finally:
            await b.close()

asyncio.run(main())
