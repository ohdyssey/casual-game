/**
 * measure-mission-roll-live.mjs — 실제 PlayScene 안에서 rollMissionReward 를 대량 호출해
 *   ① 추첨 분포  ② 예고 슬롯 표시 일치(뽑은 종류의 아이콘이 실제로 그려지는가)를 동시에 검증한다.
 *   씬 재진입 대신 함수를 직접 돌려 표본을 크게 잡는다(부작용 없는 순수 추첨).
 */
import { chromium } from 'playwright';
const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LEVEL = Number(argOf('level', '2'));
const N = Number(argOf('n', '20000'));
const DISPLAY_N = Number(argOf('display', '2000'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES.length)), null, { timeout: 60000 });
await page.waitForFunction(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const h = g && g.scene.getScene('home');
  return !!h && h.scene.isActive();
}, null, { timeout: 60000 });
await page.evaluate((lv) => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  g.scene.stop('home'); g.scene.stop('play');
  g.scene.start('play', { level: lv, free: true });
}, LEVEL);
await page.waitForFunction(`(() => { const s=(window.__PHASER_GAME__||(window.Phaser&&Phaser.GAMES&&Phaser.GAMES[0])).scene.getScene('play'); return !!s && s.scene.isActive() && !!s.missionRewardImg && !!s.state; })()`, null, { timeout: 60000 });

const out = await page.evaluate(({ n, dn }) => {
  const s = (window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0])).scene.getScene('play');
  const roll = {};
  for (let i = 0; i < n; i++) { const k = s.rollMissionReward().kind; roll[k] = (roll[k] ?? 0) + 1; }
  // 표시 일치 — 뽑은 보상을 실제로 예고 슬롯에 그려 보고 텍스처가 그 종류의 아이콘인지 확인.
  const shownByKind = {}; let mismatch = 0; const mismatchEx = [];
  for (let i = 0; i < dn; i++) {
    const rw = s.rollMissionReward();
    s.missionReward = rw;
    s.showMissionPreview();
    const want = s.missionIconKey(rw);
    const got = s.missionRewardImg.texture.key;
    shownByKind[rw.kind] = shownByKind[rw.kind] ?? { ok: 0, bad: 0 };
    if (got === want) shownByKind[rw.kind].ok++;
    else { shownByKind[rw.kind].bad++; mismatch++; if (mismatchEx.length < 5) mismatchEx.push({ kind: rw.kind, want, got }); }
  }
  return { level: s.level, roll, shownByKind, mismatch, mismatchEx, weights: s.missionDebugWeights ? s.missionDebugWeights() : null };
}, { n: N, dn: DISPLAY_N });
await browser.close();

console.log(`레벨 ${out.level} · 추첨 ${N}회`);
const tot = Object.values(out.roll).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(out.roll).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${((v / tot) * 100).toFixed(2).padStart(6)}%  (${v})`);
}
console.log(`\n표시 일치 검사 ${DISPLAY_N}회 — 불일치 ${out.mismatch}건`);
for (const [k, v] of Object.entries(out.shownByKind)) console.log(`  ${k.padEnd(12)} 일치 ${v.ok} · 불일치 ${v.bad}`);
if (out.mismatchEx.length) console.log('  예:', JSON.stringify(out.mismatchEx));
