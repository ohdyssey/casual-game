/**
 * dashboard-sweep.mjs — **econ-lab 대시보드 레벨 스윕 실행기**(사용자 명령용).
 *
 *   npm run econ:sweep            # 레벨 1→500 ×3회(기본)
 *   npm run econ:sweep -- --from 1 --to 500 --runs 3
 *
 * 무엇을 하나(PO 2026-08-25 지시 반영):
 *   · **보이는 크롬 창**으로 대시보드를 열고 스윕을 시작한다 — 진행·원장·탭이 그대로 보인다.
 *   · **백그라운드에서도 멈추지 않는다** — 창이 가려지거나 다른 작업을 해도 게임이 계속 돈다
 *     (크롬 백그라운드 스로틀 해제 플래그). 단 **최소화는 피할 것**(렌더러가 잠들 수 있다).
 *   · **소리는 나지 않는다** — 게임이 ?lab=1 이면 효과음·BGM·매칭 멜로디를 원천 차단(audio.ts).
 *   · **영구 프로필**(scripts/reports/.sweep-profile) — 창을 닫아도 기록이 남고, 다시 실행하면
 *     레벨당 N회를 못 채운 레벨부터 이어달린다. 이전 헤드리스 실측(seed-*.json)도 첫 실행에 흡수.
 *
 * 전제: 같은 폴더에서 `npm run dev`(포트 6209)가 떠 있어야 한다.
 * 종료: 스윕이 끝나면 스스로 알리고 창은 열어 둔다(결과 열람). 창을 닫으면 실행기도 끝난다.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const FROM = arg('from', '1');
const TO = arg('to', '500');
const RUNS = arg('runs', '3');
const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[sweep]', ...a);

const ctx = await chromium.launchPersistentContext('scripts/reports/.sweep-profile', {
  headless: false,
  viewport: { width: 1520, height: 940 },
  args: [
    // 창이 가려지거나 백그라운드여도 게임 RAF·타이머가 죽지 않게(백그라운드 재생 조건).
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1560,1000',
    '--mute-audio', // 이중 안전장치 — 게임 쪽 차단(?lab=1)과 별개로 브라우저 자체도 무음.
  ],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('pageerror', (e) => log('[pageerror]', String(e.message).slice(0, 120)));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[sweep]')) log(t); });
await page.goto(BASE + 'econ-lab.html', { waitUntil: 'domcontentloaded' });
// 이전 세션 SW 캐시가 옛 번들을 물지 않게 정리 + (기록이 비어 있으면) 헤드리스 실측 시드 흡수.
await page.evaluate(async () => {
  if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
});
if (existsSync('scripts/reports/seed-runs.json')) {
  await page.evaluate(({ r, d }) => {
    if (!localStorage.getItem('econLab.runs.v2')) {
      localStorage.setItem('econLab.runs.v2', r);
      if (d) localStorage.setItem('econLab.days.v2', d);
    }
  }, {
    r: readFileSync('scripts/reports/seed-runs.json', 'utf8'),
    d: existsSync('scripts/reports/seed-days.json') ? readFileSync('scripts/reports/seed-days.json', 'utf8') : '',
  });
}
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('gate').textContent.includes('연결됨'), null, { timeout: 120000 });
await page.fill('#lv', FROM);
await page.fill('#coins', '20000');
await page.fill('#floors', '2');
await page.fill('#perDay', '10');
await page.selectOption('#buyMode', 'afford');
await page.fill('#maxBuys', '12');
await page.selectOption('#speed', '64');
await page.selectOption('#lvMode', 'sweep');
await page.fill('#sweepEnd', TO);
await page.fill('#sweepRuns', RUNS);
await page.click('#start');
log(`스윕 시작 (L${FROM}→L${TO} ×${RUNS}회) — 창에서 진행이 보입니다. 소리 없음 · 백그라운드 지속.`);

for (;;) {
  await new Promise((r) => setTimeout(r, 300000)); // 5분마다 로그.
  let st;
  try {
    st = await page.evaluate(() => ({
      status: document.getElementById('status').textContent,
      n: JSON.parse(localStorage.getItem('econLab.runs.v2') || '[]').length,
    }));
  } catch {
    log('창이 닫혔습니다 — 종료(기록은 프로필에 남아 다음 실행에서 이어집니다)');
    process.exit(0);
  }
  log(`${st.n}판 | ${st.status.split('\n')[0]}`);
  if (/^(✅|⛔)/.test(st.status.trim())) {
    log('스윕 종료 — 창은 열어 둡니다(원장·레벨 경제 탭에서 열람). 창을 닫으면 실행기가 끝납니다.');
    await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
    process.exit(0);
  }
}
