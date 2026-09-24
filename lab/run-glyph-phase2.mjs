// FASE 2: esconde o botão do app e observa SÓ o que o YouTube pinta
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(__dirname, 'shots', n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(path.join(__dirname, 'glyph-repro.html')));
});
await new Promise((r) => server.listen(8123, '0.0.0.0', r));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://127.0.0.1:8123/');
await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 25000 });
await sleep(1500);

// esconde NOU botão — só o iframe fica
await page.evaluate(() => document.querySelector('.transport').classList.add('hide'));

// A) play → pausa via API (sem pointer events) → o YT pinta o que?
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(3000);
await page.screenshot({ path: out('A-playing-clean.png') });

await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(800);
await page.screenshot({ path: out('B-paused-800ms.png') });
await sleep(3700);
await page.screenshot({ path: out('C-paused-4500ms.png') });

// B) retoma — o glifo de pausa some no play?
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(700);
await page.screenshot({ path: out('D-resumed-700ms.png') });
await sleep(2300);
await page.screenshot({ path: out('E-resumed-3s.png') });
await sleep(7000);
await page.screenshot({ path: out('F-resumed-10s.png') });

// C) seek no meio da reprodução (sem pointer events)
await page.evaluate(() => document.getElementById('b-seek').click());
await sleep(700);
await page.screenshot({ path: out('G-seek-700ms.png') });
await sleep(3300);
await page.screenshot({ path: out('H-seek-4s.png') });

// D) pausa de novo e espera 10s — pause overlay some sozinho sem pointer?
await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(10000);
await page.screenshot({ path: out('I-paused-10s.png') });

// E) liga pointer-events, hover real → some?
await page.evaluate(() => document.getElementById('b-events').click());
const box = await page.locator('#box').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
await sleep(1500);
await page.screenshot({ path: out('J-paused-events-hover-15s.png') });

// F) retoma com pointer events ligados → limpo? Depois desliga events de novo
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(2500);
await page.screenshot({ path: out('K-resumed-events.png') });

await browser.close();
server.close();
console.log('FASE2 DONE');
