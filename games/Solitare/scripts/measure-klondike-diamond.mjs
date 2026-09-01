/**
 * measure-klondike-diamond.mjs — 보너스 라운드 **보드 다이아** 실측.
 *   ① 모드별 배치 확률이 표대로인가 ② 젬이 화면에 보이는 자리에 놓이는가
 *   ③ 끼운 카드가 뒤집히면 회수되는가(pendingDiamonds).
 */
import { chromium } from 'playwright';
const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const N = Number(process.argv[2] ?? 60);
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
await page.evaluate(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  g.scene.stop('home'); g.scene.stop('play');
  g.scene.start('playKlondike', { level: 10, free: true });
});
await page.waitForFunction(`(() => { const s=${G}.scene.getScene('playKlondike'); return !!s && s.scene.isActive() && !!s.views && s.views.size>0; })()`, null, { timeout: 60000 });

const out = await page.evaluate((n) => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const s = g.scene.getScene('playKlondike');
  const res = {};
  for (const [mode, timed] of [['draw1', false], ['draw1', true], ['draw3', false], ['draw3', true]]) {
    s.mode = mode; s.timed = timed;
    let hit = 0, onFaceDown = 0, onScreen = 0;
    for (let i = 0; i < n; i++) {
      s.placeBoardDiamond();
      if (!s.diamondCardId) continue;
      hit++;
      // 끼운 카드가 정말 **컬럼의 맨 아래 카드**인가(하단으로만 삐져나오는 자리).
      const col = s.state.tableau[s.diamondCol] ?? [];
      if (col.length && col[col.length - 1].card.id === s.diamondCardId) onFaceDown++;
      s.syncBoardDiamond();
      const gem = s.diamondView;
      if (gem && gem.visible && gem.x > 0 && gem.x < 1080 && gem.y > 0 && gem.y < 2400) onScreen++;
    }
    res[`${mode}/${timed ? '타임' : '일반'}`] = { 배치율: +(hit / n).toFixed(3), 맨아래카드: onFaceDown, 화면안: onScreen, 시행: n };
  }
  // 회수 검증 — 확실히 배치한 뒤 그 카드를 앞면으로 만들고 sync.
  s.mode = 'draw3'; s.timed = true;
  s.placeBoardDiamond();
  const id = s.diamondCardId;
  // 회수 = 그 카드가 컬럼을 떠나는 것 — 실제로 빼서 sync 한다.
  const beforeGems = s.rewards.diamonds;
  s.state = { ...s.state, tableau: s.state.tableau.map((col, ci) => (ci === s.diamondCol ? col.slice(0, -1) : col)) };
  s.syncViews();
  return { ...res, 회수: { 배치id: id, 원장다이아: `${beforeGems} → ${s.rewards.diamonds}`, 젬제거: !s.diamondView, 배지: s.diamondHold ? s.diamondHold.text.text : null } };
}, N);
console.log(JSON.stringify(out, null, 2));
await browser.close();
