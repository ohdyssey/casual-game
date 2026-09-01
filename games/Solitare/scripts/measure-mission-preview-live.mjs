/**
 * measure-mission-preview-live.mjs — **실제 실행 화면**에서 미션 예고 아이콘 분포를 측정한다(진단용).
 *
 * 모델(measure-mission-drops.mts)이 아니라 진짜 PlayScene 을 띄워, 레벨 진입을 N회 반복하며
 *   ① rollMissionReward 가 **뽑은 종류**  ② 예고 슬롯에 **실제로 보이는 텍스처**
 * 를 각각 센다. 둘이 다르면 표시 경로에 문제가 있는 것이다(showMissionPreview 는 텍스처가 없으면
 * 조용히 return 해서 **직전 아이콘이 그대로 남는다**).
 *
 * 사용: node scripts/measure-mission-preview-live.mjs [--level 2] [--n 200]
 *   전제: 같은 폴더에서 `npm run dev`(포트 6209)가 떠 있어야 한다.
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LEVEL = Number(argOf('level', '2'));
const N = Number(argOf('n', '200'));

const browser = await chromium.launch({ headless: !args.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
// 이전 세션의 SW 캐시 번들이 서빙되지 않게 정리 후 재적재.
await page.evaluate(async () => {
  if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES.length)), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  const h = g && g.scene.getScene('home');
  return !!h && h.scene.isActive();
}, null, { timeout: 60000 });

const rolled = {}, shown = {};
const bump = (m, k) => { m[k] = (m[k] ?? 0) + 1; };

for (let i = 0; i < N; i++) {
  await page.evaluate((lv) => {
    const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
    g.scene.stop('home');
    g.scene.stop('play');
    g.scene.start('play', { level: lv, free: true });
  }, LEVEL);
  await page.waitForFunction(`(() => { const s = (window.__PHASER_GAME__||Phaser.GAMES[0]).scene.getScene('play'); return !!s && s.scene.isActive() && !!s.missionReward && !!s.missionRewardImg; })()`, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
    return { kind: s.missionReward.kind, tex: s.missionRewardImg.texture.key, level: s.level };
  });
  bump(rolled, r.kind);
  bump(shown, r.tex);
  if (i === 0) console.log(`(레벨 ${r.level} 확인)`);
}
await browser.close();

const pct = (n) => ((n / N) * 100).toFixed(1).padStart(5) + '%';
console.log(`\n레벨 ${LEVEL} · 진입 ${N}회`);
console.log('\n[rollMissionReward 가 뽑은 종류]');
for (const [k, v] of Object.entries(rolled).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${pct(v)} (${v})`);
console.log('\n[예고 슬롯에 실제로 보인 텍스처]');
for (const [k, v] of Object.entries(shown).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(34)} ${pct(v)} (${v})`);
