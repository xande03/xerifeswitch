// FASE 5: valida que o DISCO (26%) cobre o glifo do YT durante a janela e
// que tudo some junto — reproduz a arquitetura do app no lab.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(__dirname, 'shots', n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#111;display:flex;gap:24px;padding:16px;font-family:monospace;color:#fff}
  .box{position:relative;width:530px;height:298px;overflow:hidden;background:#000;border-radius:16px}
  .box>iframe{position:absolute!important;left:0!important;top:-120px!important;width:100%!important;
    height:calc(100% + 240px)!important;border:0!important;pointer-events:none!important}
  /* Disco CenterGlyphCover (26% da largura, centralizado) */
  .disc{position:absolute;left:50%;top:50%;width:26%;min-width:112px;max-width:240px;aspect-ratio:1;
    transform:translate(-50%,-50%);border-radius:50%;background:#161616;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 10px 36px rgba(0,0,0,.5);
    z-index:4;pointer-events:none;transition:opacity .3s}
  .disc.gone{opacity:0}
  /* Transporte do app (88px opaco) */
  .t{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:none;transition:opacity .3s}
  .t.gone{opacity:0}
  .btn{width:88px;height:88px;border-radius:50%;background:#161616;color:#fff;display:flex;align-items:center;
    justify-content:center;font-size:34px;box-shadow:0 10px 36px rgba(0,0,0,.5);box-shadow:inset0}
</style></head><body>
<div class="box" id="box"><div id="player"></div>
  <div class="disc" id="disc"></div>
  <div class="t" id="t"><div class="btn">&#10074;&#10074;</div></div>
</div>
<div class="log" id="log" style="width:420px;font-size:12px;white-space:pre-wrap"></div>
<script>
  const log=(m)=>{document.getElementById('log').textContent+=m+'\\n';};
  let player,ready=false;
  window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{width:'100%',height:'100%',
    videoId:'aqz-KE-bpKQ',
    playerVars:{autoplay:0,controls:0,modestbranding:1,rel:0,playsinline:1,iv_load_policy:3,disablekb:1,fs:0,enablejsapi:1},
    events:{onReady:()=>{ready=true;log('READY')},
      onStateChange:(e)=>log('STATE='+e.data)}});};
  const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.body.appendChild(s);
  // Simula o lease do app: paint events → disco+controles por 6500ms
  let leaseTimers=[];
  window.__markPaint=function(){
    leaseTimers.forEach(clearTimeout);leaseTimers=[];
    document.getElementById('disc').classList.remove('gone');
    document.getElementById('t').classList.remove('gone');
    // controles (lease = max(3500, 6500) = 6500ms) e disco (6500ms) somem JUNTOS
    leaseTimers.push(setTimeout(()=>{document.getElementById('t').classList.add('gone')},6500));
    leaseTimers.push(setTimeout(()=>{document.getElementById('disc').classList.add('gone')},6500));
  };
  window.__play=()=>{window.__markPaint();player.playVideo();};
  window.__pause=()=>{player.pauseVideo();};
  window.__seek=()=>{window.__markPaint();player.seekTo(player.getCurrentTime()+30,true);};
  window.__ready=()=>ready;
</script></body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(8123, '0.0.0.0', r));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
await page.goto('http://127.0.0.1:8123/');
await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 25000 });
await sleep(1200);
const clip = { x: 16, y: 16, width: 530, height: 298 };

// PLAY com lease (disco+controles ligados)
await page.evaluate(() => window.__play());
await sleep(1500);
await page.screenshot({ path: out('V1-play-15s-disk+btn.png'), clip }); // glifo ⏸ + disco + botão
await sleep(2500);
await page.screenshot({ path: out('V2-play-40s-disk+btn.png'), clip });

// esconde só os controles no meio da janela (pior caso) → disco sozinho cobre
await page.evaluate(() => document.getElementById('t').classList.add('gone'));
await sleep(500);
await page.screenshot({ path: out('V3-play-disc-only.png'), clip });

// espera o lease fechar (6500ms do paint) → tudo limpo
await sleep(4000); // ~6.5s desde paint
await page.screenshot({ path: out('V4-play-after-lease-clean.png'), clip });

// SEEK no meio → novo lease, disco volta com glifo de seek
await page.evaluate(() => window.__seek());
await sleep(1200);
await page.screenshot({ path: out('V5-seek-disk.png'), clip });

await browser.close();
server.close();
console.log('FASE5 DONE');
