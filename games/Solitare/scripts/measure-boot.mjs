/**
 * measure-boot.mjs — **첫 화면 도달 시간** 실측(토스 "10초 이내" 요건 점검).
 *   배포본을 정적 서버로 띄운 뒤 ① 첫 픽셀(로딩 화면) ② 홈 씬 활성 ③ 초기 네트워크 바이트를 잰다.
 */
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:8791/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 540, height: 1200 } });
// 라이브 배포본의 비밀번호 게이트를 우회(토스 번들엔 들어가면 안 되는 스크립트 — 계측만 통과시킨다).
await ctx.addInitScript(() => {
  try { localStorage.setItem('rl_site_gate_v1', '5f395d07369071a505ef926527de2ac53e8c29e103dc63398315bc276224b81a'); } catch {}
});
const page = await ctx.newPage();
let bytes = 0, reqs = 0, ext = new Map(); const dirs = new Map(), dirn = new Map();
page.on('response', async (r) => {
  reqs++;
  try { const b = (await r.body()).length; bytes += b; } catch {}
  const u = new URL_(r.url());
  if (!u.host.includes('localhost')) ext.set(u.host, (ext.get(u.host) ?? 0) + 1);
  else { const seg = u.pathname.split('/').filter(Boolean).slice(0, 2).join('/') || '(root)';
    let b = 0; try { b = (await r.body()).length; } catch {}
    dirs.set(seg, (dirs.get(seg) ?? 0) + b); dirn.set(seg, (dirn.get(seg) ?? 0) + 1); }
});
function URL_(u) { return new globalThis.URL(u); }
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'commit' });
// ① 캔버스가 생겨 첫 화면이 그려진 시점
await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 60000 });
const tCanvas = Date.now() - t0;
// ② 부팅 네트워크가 잠잠해질 때까지(= 첫 화면에 필요한 에셋 수신 완료)
let lastAt = Date.now();
page.on('response', () => { lastAt = Date.now(); });
while (Date.now() - lastAt < 2000 && Date.now() - t0 < 120000) await page.waitForTimeout(200);
const tIdle = Date.now() - t0;
await page.screenshot({ path: 'boot-shot.png' });
const tHome = null, which = ['(측정불가: 배포본은 Phaser 전역 미노출)'];
const tScene = tIdle;
console.log(`첫 캔버스      ${(tCanvas / 1000).toFixed(2)}s`);
console.log(`부팅 로드 완료 ${(tIdle / 1000).toFixed(2)}s  (네트워크 유휴)`);

console.log(`초기 네트워크  ${(bytes / 1048576).toFixed(1)}MB · 요청 ${reqs}건`);
if (ext.size) console.log(`외부 도메인    ${[...ext].map(([h, n]) => `${h}(${n})`).join(' · ')}`);
console.log('');
console.log('[부팅에 받은 것 — 경로별]');
for (const [k, v] of [...dirs].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${k.padEnd(18)} ${(v / 1048576).toFixed(1)}MB · ${dirn.get(k)}건`);
await browser.close();
