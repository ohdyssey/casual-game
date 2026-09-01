import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 540, height: 1200 } });
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
// ① 일반 모드(?lab 없음) — 지표가 기록돼야 한다.
await p.goto('http://localhost:6209/', { waitUntil: 'domcontentloaded' });
await p.evaluate(async () => { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); localStorage.removeItem('solitaire_metrics_v1'); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => { const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]); const h = g && g.scene.getScene('home'); return !!h && h.scene.isActive() && !!window.__dailyMetrics; }, null, { timeout: 90000 });
const r1 = await p.evaluate(() => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  // 플레이 정산 지표를 빠르게 검증 — 판을 직접 이겨본다(레벨1, 시뮬로).
  g.scene.stop('home'); g.scene.start('play', { level: 1 });
  return 'started';
});
await p.waitForFunction(`(() => { const s=(window.__PHASER_GAME__||Phaser.GAMES[0]).scene.getScene('play'); return !!s && s.scene.isActive() && !!s.state; })()`, null, { timeout: 60000 });
await p.evaluate(() => { const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play'); s.tweens.timeScale = 64; s.time.timeScale = 64; s.simSpeed = 4; s.simBuy = false; s.startSim(); });
await p.waitForFunction(`(() => { const s=(window.__PHASER_GAME__||Phaser.GAMES[0]).scene.getScene('play'); if (!s||!s.state) return false; const snap=s.labSnapshot(); if (snap.win && !s.ended) { if (s.simRunning) s.stopSim(); s.checkEnd(); } else if (!s.simRunning && !s.ended) s.startSim(); return snap.settled; })()`, null, { timeout: 180000 });
const m1 = await p.evaluate(() => window.__dailyMetrics());
console.log('일반 모드 지표:', JSON.stringify(m1.map((d) => ({ day: d.day, games: d.games, wins: d.wins, starCoins: d.starCoins, plus5: d.plus5, levelMax: d.levelMax }))));
// ② 계측 모드(?lab=1) — 기록되면 안 된다.
await p.goto('http://localhost:6209/?lab=1', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => { const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]); const h = g && g.scene.getScene('home'); return !!h && h.scene.isActive(); }, null, { timeout: 90000 });
const before = await p.evaluate(() => JSON.stringify(window.__dailyMetrics()));
await p.evaluate(() => { const g = window.__PHASER_GAME__ || Phaser.GAMES[0]; g.scene.stop('home'); g.scene.start('play', { level: 1 }); });
await p.waitForFunction(`(() => { const s=(window.__PHASER_GAME__||Phaser.GAMES[0]).scene.getScene('play'); return !!s && s.scene.isActive() && !!s.state; })()`, null, { timeout: 60000 });
await p.evaluate(() => { const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play'); s.tweens.timeScale = 64; s.time.timeScale = 64; s.simSpeed = 4; s.startSim(); });
await p.waitForFunction(`(() => { const s=(window.__PHASER_GAME__||Phaser.GAMES[0]).scene.getScene('play'); if (!s||!s.state) return false; const snap=s.labSnapshot(); if (snap.win && !s.ended) { if (s.simRunning) s.stopSim(); s.checkEnd(); } else if (!s.simRunning && !s.ended) s.startSim(); return snap.settled; })()`, null, { timeout: 180000 });
const after = await p.evaluate(() => JSON.stringify(window.__dailyMetrics()));
console.log('lab 모드에서 지표 불변:', before === after);
await b.close();
