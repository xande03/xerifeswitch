// FASE 4: temporização exata dos glifos — 1 fps por transição, sem seek
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'shots', 'timeline');
mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(path.join(__dirname, 'glyph-repro.html')));
});
await new Promise((r) => server.listen(8123, '0.0.0.0', r));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
await page.goto('http://127.0.0.1:8123/');
await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 25000 });
await page.evaluate(() => { document.querySelector('.transport').style.display = 'none'; });
const clip = { x: 16, y: 16, width: 530, height: 298 };

const manifest = [];
async function snap(tag) {
  const f = `${tag}.png`;
  await page.screenshot({ path: path.join(dir, f), clip });
  const st = await page.evaluate(() => window.__state());
  manifest.push(`${f} state=${st}`);
}

// PLAY inicial — 12 snapshots @1s
await page.evaluate(() => document.getElementById('b-play').click());
for (let i = 0; i <= 12; i++) { await snap(`t${String(i).padStart(2,'0')}-playing`); if (i < 12) await sleep(1000); }

// PAUSE — 16 snapshots @1s
await page.evaluate(() => document.getElementById('b-pause').click());
for (let i = 0; i <= 15; i++) { await snap(`p${String(i).padStart(2,'0')}-paused`); if (i < 15) await sleep(1000); }

// PLAY de novo — 12 snapshots @1s (stale ▶?)
await page.evaluate(() => document.getElementById('b-play').click());
for (let i = 0; i <= 12; i++) { await snap(`r${String(i).padStart(2,'0')}-resume`); if (i < 12) await sleep(1000); }

writeFileSync(path.join(dir, 'manifest.txt'), manifest.join('\n'));
await browser.close();
server.close();
console.log('FASE4 DONE\n' + manifest.slice(0, 5).join('\n'));
