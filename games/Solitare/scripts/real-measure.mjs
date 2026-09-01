/**
 * real-measure.mjs — **실게임 배치 실측 러너**(PO 2026-08-23 "플레이어가 실제 테스트하는 동일한 환경으로
 * 레벨 500을 자동테스트하고, 데이터를 기록해서 나중에 숫자를 조절하기 쉽게").
 *
 * 시뮬레이터 예측이 아니라 **진짜 게임**(PlayScene + 실제 탭 핸들러 + 실제 미션/보너스/와일드 배선)을
 * 헤드리스 브라우저로 구동한다. 봇은 씬에 내장된 시뮬(startSim)이고, `simBuy=true` 로 두면 실제
 * 플레이어처럼 막혔을 때 ＋5 를 사서 이어간다(코인은 무시 — 계측 도구).
 *
 * 결과는 scripts/reports/real-run.jsonl 에 한 레벨 = 한 줄로 **누적 기록**된다(같은 레벨을 다시 재면
 * 새 줄이 추가되고, 소비자는 마지막 줄을 읽는다). 각 줄:
 *   { level, stock(시작 뽑기), win, buys(＋5 구매), leftover(승리 시 잔여), boardLeft(패배 시 남은 보드), ms }
 *
 * 사용:
 *   node scripts/real-measure.mjs --from 1 --to 25 [--speed 8] [--stock N(오버라이드)]
 *   (500레벨 전체는 --from/--to 를 나눠 여러 번 — 셸 타임아웃 안에서 25~30레벨씩)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const FROM = Number(argOf('from', '1'));
const TO = Number(argOf('to', '10'));
const SPEED = Number(argOf('speed', '8'));
const STOCK = argOf('stock', '') === '' ? undefined : Number(argOf('stock', ''));
const OUT = argOf('out', 'scripts/reports/real-run.jsonl');
const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const LEVEL_TIMEOUT = Number(argOf('timeout', '180000'));

const SCENE = `(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  return g ? g.scene.getScene('play') : null;
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // 이전 세션 SW/캐시 제거(낡은 번들 방지) 후 재진입.
  await page.evaluate(async () => {
    if (navigator.serviceWorker) {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // 에디터 사본이 번들 팩을 가리면 실측이 옛 레벨을 잰다 — 반드시 걷어낸다.
    try { localStorage.removeItem('cardLevels.v1'); } catch {}
    try { localStorage.setItem('solitaire_tips_v1', JSON.stringify(['match','draw','combo','bonusCard','wildCard','wildUse','diamond','emptyStock','undo','customerStar','mission','collection','star'])) } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
    const h = g && g.scene.getScene('home');
    return !!h && h.scene.isActive();
  }, null, { timeout: 60000 });

  for (let level = FROM; level <= TO; level++) {
    const t0 = Date.now();
    await page.evaluate(({ lv, stock }) => {
      const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
      g.scene.stop('home');
      g.scene.stop('play');
      g.scene.start('play', { level: lv, free: true, ...(stock != null ? { stockOverride: stock } : {}) });
    }, { lv: level, stock: STOCK });
    await page.waitForFunction(`(() => { const s = ${SCENE}; return !!s && s.scene.isActive() && !!s.state; })()`, null, { timeout: 60000 });
    // 배속 + 안내 팝업 자동 닫기 + 구매하는 봇으로 시작.
    await page.evaluate((sp) => {
      const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
      s.tweens.timeScale = sp;
      s.time.timeScale = sp;
      for (const nm of ['tipCard', 'coach']) {
        const l = s.children.list.find((o) => o.name === nm);
        if (l && l.list[0]) l.list[0].emit('pointerdown');
      }
      s.simBuy = true;
      s.simBuys = 0;
      s.simSpeed = sp >= 4 ? 4 : sp;
      s.startSim();
    }, SPEED);
    const startStock = await page.evaluate(`(() => { const s = ${SCENE}; return s.state.stock.length; })()`);

    // 끝날 때까지 폴링 — 안내 팝업이 새로 뜨면 닫고, 시뮬이 서 있으면 재시동한다.
    //   딜 연출 중에는 startSim 이 조용히 무시되므로(dealing 가드) **매 폴마다** 재시동을 시도하고,
    //   진행(cleared)이 여러 폴 연속 멈춰 있을 때만 끝난 것으로 판정한다.
    let done = null;
    let lastCleared = -1;
    let stall = 0;
    while (Date.now() - t0 < LEVEL_TIMEOUT) {
      await sleep(700);
      const snap = await page.evaluate(`(() => {
        const s = ${SCENE};
        if (!s || !s.scene.isActive() || !s.state) return { dead: true };
        for (const nm of ['tipCard', 'coach']) {
          const l = s.children.list.find((o) => o.name === nm);
          if (l && l.list[0]) l.list[0].emit('pointerdown');
        }
        if (!s.simRunning && !s.ended) s.startSim(); // 딜 중이면 무시된다 — 다음 폴에서 다시.
        const total = s.state.layout.slots.length;
        const cleared = s.state.cleared.size;
        return {
          win: cleared === total,
          running: s.simRunning,
          cleared,
          stock: s.state.stock.length,
          buys: s.simBuys,
          boardLeft: total - cleared,
        };
      })()`);
      if (snap.dead) { done = { dead: true }; break; }
      if (snap.win) { done = snap; break; }
      if (snap.cleared === lastCleared && !snap.running) {
        stall += 1;
        if (stall >= 4) { done = snap; break; } // ~3초간 재시동해도 정지 = 진짜 끝(막힘·구매불가).
      } else stall = 0;
      lastCleared = snap.cleared;
    }
    const ms = Date.now() - t0;
    const row = done && !done.dead
      ? { level, stock: startStock, win: !!done.win, buys: done.buys ?? 0, leftover: done.win ? done.stock : 0, boardLeft: done.win ? 0 : done.boardLeft, ms }
      : { level, stock: startStock, error: done?.dead ? 'scene-dead' : 'timeout', ms };
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n', 'utf8');
    console.log(`lv${level} ${row.error ?? (row.win ? `승 · 구매 ${row.buys} · 잔여 ${row.leftover}` : `패 · 구매 ${row.buys} · 보드잔여 ${row.boardLeft}`)} (${(ms / 1000).toFixed(0)}s)`);
  }
  if (pageErrors.length) console.log(`⚠ 페이지 오류 ${pageErrors.length}건: ${pageErrors[0]}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
