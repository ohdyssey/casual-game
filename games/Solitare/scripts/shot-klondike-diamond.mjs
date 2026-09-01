import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
// 안내 팝업을 "이미 봤다"로 미리 표시 — 헤드리스에서 딤이 보드를 가려 스크린샷이 안 나온다.
await page.addInitScript(() => {
  try { localStorage.setItem('solitaire_tips_v1', JSON.stringify(['bonusIntro', 'klondikeRules'])); } catch {}
});
await page.goto(process.env.QA_BASE ?? 'http://localhost:6209/', { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
});
await page.reload({ waitUntil: 'domcontentloaded' });
const G = "(window.__PHASER_GAME__||(window.Phaser&&Phaser.GAMES&&Phaser.GAMES[0]))";
await page.waitForFunction(`!!${G}`, null, { timeout: 60000 });
await page.waitForFunction(`(() => { const h=${G}.scene.getScene('home'); return !!h&&h.scene.isActive(); })()`, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  g.scene.stop('home'); g.scene.stop('play');
  g.scene.start('playKlondike', { level: 10, free: true, mode: 'draw3', timed: false });
});
await page.waitForFunction(`(() => { const s=${G}.scene.getScene('playKlondike'); return !!s && s.scene.isActive() && s.views && s.views.size>0 && s.dealing!==true; })()`, null, { timeout: 60000 });
await page.evaluate(() => {
  const s = (window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0])).scene.getScene('playKlondike');
  s.mode = 'draw3'; s.timed = true; // 확률 1.0 — 반드시 배치
  s.placeBoardDiamond(); s.syncBoardDiamond();
});
// 진입 안내/코치 팝업을 닫는다 — DOM 클릭이 아니라 씬 오브젝트에 직접 이벤트(헤드리스 안전).
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    const s = (window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0])).scene.getScene('playKlondike');
    for (const o of [...s.children.list]) {
      if (o.name && ['tipCard', 'coach', 'intro', 'entry'].includes(o.name)) { (o.list?.[0] ?? o).emit('pointerdown'); }
      if (o.depth >= 3000 && o.type === 'Container') { (o.list?.[0] ?? o).emit('pointerdown'); }
    }
    s.input.emit('pointerdown', s.input.activePointer);
  });
  await page.waitForTimeout(600);
}
await page.evaluate(() => {
  const s = (window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0])).scene.getScene('playKlondike');
  if (!s.diamondCardId) { s.mode = 'draw3'; s.timed = true; s.placeBoardDiamond(); }
  s.syncBoardDiamond();
  for (let i = 0; i < 3; i++) s.onComboMatch(); // 게이지·손님 주문이 채워진 상태를 찍는다.
});
await page.waitForTimeout(2000);
await page.screenshot({ path: 'klondike-diamond.png' });
await browser.close();
console.log('shot saved');
