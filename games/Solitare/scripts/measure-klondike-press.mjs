/**
 * measure-klondike-press.mjs — 클론다이크 보너스 라운드의 **카드 탭 피드백** 실측(회귀 진단).
 *   카드에 pointerdown → pointerup 을 넣고 배율(scale)이 실제로 ① 줄었다가 ② 정상보다 커졌다가
 *   ③ 정상으로 되돌아오는지 샘플링한다. 헤드리스는 느리므로 배속을 걸어 관측한다.
 */
import { chromium } from 'playwright';
const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
});
await page.reload({ waitUntil: 'domcontentloaded' });
const G = "(window.__PHASER_GAME__||(window.Phaser&&Phaser.GAMES&&Phaser.GAMES[0]))";
await page.waitForFunction(`!!${G}`, null, { timeout: 60000 });
await page.waitForFunction(`(() => { const g=${G}; const h=g&&g.scene.getScene('home'); return !!h&&h.scene.isActive(); })()`, null, { timeout: 60000 });
await page.evaluate((g0) => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  g.scene.stop('home'); g.scene.stop('play');
  g.scene.start('playKlondike', { level: 10, free: true });
}, null);
await page.waitForFunction(`(() => { const s=${G}.scene.getScene('playKlondike'); return !!s && s.scene.isActive() && !!s.views && s.views.size > 0; })()`, null, { timeout: 60000 });

// 딜 연출(뒤집기)이 끝날 때까지 기다린다 — flipping 중엔 배율 연출을 일부러 건너뛴다.
await page.waitForFunction(`(() => { const s=${G}.scene.getScene('playKlondike');
  return [...s.views.values()].some((v) => v.input && v.input.enabled && !v.flipping); })()`, null, { timeout: 90000 });

const out = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const s = g.scene.getScene('playKlondike');
  // 입력이 걸린(=조작 가능한) 카드 하나를 고른다.
  const v = [...s.views.values()].find((x) => x.input && x.input.enabled && !x.flipping);
  if (!v) return { error: '조작 가능한 카드를 찾지 못함' };
  const base = v.baseScale;
  const samples = [];
  const snap = (tag) => samples.push({ tag, r: +(v.scaleX / base).toFixed(3) });
  const flags = { ended: s.ended, autoPlaying: s.autoPlaying, hasPressIn: typeof v.pressIn === 'function', downListeners: v.listenerCount('pointerdown'), upListeners: v.listenerCount('pointerup'), flipping: v.flipping, cardsWired: [...s.views.values()].filter((x)=>x.listenerCount('pointerdown')>0).length };
  snap('누르기 전');
  v.emit('pointerdown');
  let minDuringPress = 1;
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 30)); minDuringPress = Math.min(minDuringPress, v.scaleX / base); }
  snap('누른 뒤 최소');
  const tweensOnCard = s.tweens.getTweensOf(v).length;
  v.emit('pointerup');
  let peak = 0;
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 20)); peak = Math.max(peak, v.scaleX / base); }
  samples.push({ tag: '뗀 뒤 최대', r: +peak.toFixed(3) });
  await new Promise((r) => setTimeout(r, 800));
  snap('정착');
  // 스톡 더미(뒷면)도 같은 피드백이 붙었는지 확인.
  const sv = s.stockBackView;
  const sBase = sv ? sv.baseScale : 0;
  let sMin = 1, sMax = 0;
  if (sv) {
    sv.pressIn();
    for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 30)); sMin = Math.min(sMin, sv.scaleX / sBase); }
    sv.pressOut();
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 20)); sMax = Math.max(sMax, sv.scaleX / sBase); }
  }
  samples.push({ tag: '스톡 최소', r: +sMin.toFixed(3) }, { tag: '스톡 최대', r: +sMax.toFixed(3) });
  return { base: +base.toFixed(4), flags, tweensOnCard, minDuringPress: +minDuringPress.toFixed(3), samples };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
