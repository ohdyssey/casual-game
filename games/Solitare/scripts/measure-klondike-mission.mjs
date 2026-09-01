/**
 * measure-klondike-mission.mjs — 보너스 라운드의 **미션·손님·별 수집·리워드 원장** 실측.
 */
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
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
  g.scene.start('playKlondike', { level: 10, free: true });
});
await page.waitForFunction(`(() => { const s=${G}.scene.getScene('playKlondike'); return !!s && s.scene.isActive() && s.views && s.views.size>0; })()`, null, { timeout: 60000 });

const out = await page.evaluate(() => {
  const s = (window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0])).scene.getScene('playKlondike');
  const r = {};
  r.HUD = {
    별칸: s.comboStars.length,
    콤보텍스트: !!s.comboCountText,
    다이아배지: !!s.diamondHold,
    예고아이콘: !!s.missionRewardImg,
    손님큐: !!s.orderQueue,
    예고종류: s.missionNext,
  };
  // 연속 5매칭을 여러 번 내고 승리 → 리그 별이 상한 5를 넘지 않는가.
  const trial = (runs, len) => {
    s.ended = false; // ⚠️ 이전 시행의 onWin 이 ended=true 로 남겨 둔다 — 안 풀면 콤보가 통째로 무시된다.
    s.resetRoundRewards();
    for (let k = 0; k < runs; k++) {
      for (let i = 0; i < len; i++) s.onComboMatch();
      s.breakCombo();
    }
    const before = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}').leaguePoints ?? 0;
    s.ended = false;
    s.onWin();
    const after = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}').leaguePoints ?? 0;
    return { 연속맞춤: `${runs}회 × ${len}매칭`, 완성주문: runs * Math.floor(len / 5), 리그별: after - before };
  };
  r.별등급 = [trial(1, 5), trial(2, 5), trial(4, 5), trial(1, 30), trial(6, 10)];
  // 판 도중에는 별이 원장에 쌓이지 않는가.
  s.ended = false;
  s.resetRoundRewards();
  for (let i = 0; i < 30; i++) s.onComboMatch();
  s.breakCombo();
  r.판도중원장별 = s.rewards.stars;
  r.게이지칸 = s.comboStars.filter((x) => x.scaleX > 0).length;
  return r;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
