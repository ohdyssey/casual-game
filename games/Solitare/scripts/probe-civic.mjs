/** probe-civic.mjs — 홈 화면 **공공건물 타워**가 실제로 세워지는지 진단. */
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
await page.goto(process.env.QA_BASE ?? 'http://localhost:6209/', { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
});
await page.reload({ waitUntil: 'domcontentloaded' });
const G = "(window.__PHASER_GAME__||(window.Phaser&&Phaser.GAMES&&Phaser.GAMES[0]))";
await page.waitForFunction(`!!${G}`, null, { timeout: 60000 });
await page.waitForFunction(`(() => { const h=${G}.scene.getScene('home'); return !!h&&h.scene.isActive(); })()`, null, { timeout: 60000 });
await page.waitForTimeout(6000); // ensureAssetGroup('office') 완료 대기.
const snap = async (tag) => {
  const r = await page.evaluate(() => {
    const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
    const h = g.scene.getScene('home');
    const keys = [1,2,3,4,5].map((n) => `up_Slitare_Office_${String(n).padStart(2,'0')}`);
    return {
      home활성: h.scene.isActive(),
      officeFloors: h.officeFloors ? h.officeFloors.length : 'undefined',
      살아있는층: h.officeFloors ? h.officeFloors.filter((o) => o && o.active && o.texture && o.texture.key !== '__MISSING').length : 0,
      아트: keys.filter((k) => h.textures.exists(k)).length,
      창구: h.civicDeskBoxes ? h.civicDeskBoxes.length : 'undefined',
    };
  });
  console.log(tag, JSON.stringify(r));
};
await snap('① 최초 홈      ');
// 프리셀 진입 → 복귀
await page.evaluate(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  g.scene.stop('home');
  g.scene.start('playKlondike', { level: 10, free: true, desk: 'fire' });
});
await page.waitForTimeout(6000);
await page.evaluate(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  g.scene.stop('playKlondike');
  g.scene.start('home');
});
await page.waitForTimeout(8000);
await snap('② 프리셀 왕복 후');
const out = await page.evaluate(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const h = g.scene.getScene('home');
  const keys = [1, 2, 3, 4, 5].map((n) => `up_Slitare_Office_${String(n).padStart(2, '0')}`);
  return {
    officeFloors: h.officeFloors ? h.officeFloors.length : 'undefined',
    officeRoof: !!h.officeRoof,
    아트존재: Object.fromEntries(keys.map((k) => [k, h.textures.exists(k)])),
    지붕아트: h.textures.exists('up_Slitare_Office_roof'),
    창구버튼: h.civicDeskBoxes ? h.civicDeskBoxes.length : 'undefined',
  };
});
console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('\n[에러]\n' + errs.slice(0, 10).join('\n'));
await browser.close();
