/**
 * autoplay-sim.mjs — **보상구조 재설계용 오토플레이 시뮬 러너**(2026-07-07).
 *
 * 목적: 초기 300스핀 → AUTO 플레이 전량 소진까지 실게임을 헤드리스로 돌리며, 게임의 텔레메트리 v2
 *   (`window.__scEconDump()` — econ/telemetry.ts 이벤트 원장+누적 집계)를 주기적으로 수거해 JSONL 로 남긴다.
 *   수거 데이터 = 슬롯결과 빈도(매치율·어택율)·소스별 스핀/코인 유입·순소모/라운드·최저잔고(아슬아슬 지표) 등
 *   → 지급구조·확률 재설계의 실측 입력.
 *
 * 사용: node scripts/autoplay-sim.mjs [--port 6207] [--minutes 60] [--interval 10] [--reset] [--out sim-run.jsonl]
 *   --reset  : 시작 전 socialcasino_* 저장 전체 삭제(스핀 300·시설 Lv1·텔레메트리 0 베이스라인).
 *   종료 조건: 스핀 소진으로 오토가 자동 해제되고 잔여 스핀 < 베팅 (또는 --minutes 상한 도달).
 *   산출물: <out>.jsonl (주기 스냅샷) + <out>.final.json (최종 totals/summary/이벤트 원장 전체).
 *
 * ⚠️ 전제: 해당 포트에 SocialCasino dev 서버가 떠 있어야 한다(vite --port 6207).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
};
const has = (name) => process.argv.includes(`--${name}`);

const PORT = Number(arg('port', '6207'));
const MINUTES = Number(arg('minutes', '60'));
const INTERVAL_S = Number(arg('interval', '10'));
const RESET = has('reset');
const OUT = arg('out', path.join('scripts', `sim-run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.jsonl`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
  page.on('pageerror', (e) => log('PAGE ERROR:', String(e).slice(0, 200)));

  log(`open http://localhost:${PORT}`);
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load', timeout: 60_000 });
  // 이전 세션 SW 스테일 번들 방지(메모리: localhost SW stale bundle).
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    for (const r of rs) await r.unregister();
    const ks = await caches.keys().catch(() => []);
    for (const k of ks) await caches.delete(k);
  });
  if (RESET) {
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('socialcasino_'))
        .forEach((k) => localStorage.removeItem(k));
    });
    log('reset: socialcasino_* 저장 삭제(스핀 300 베이스라인)');
  }
  await page.reload({ waitUntil: 'load' });

  // 게임 부팅 대기 → play 씬 진입 → 덤프 헬퍼 대기.
  await page.waitForFunction(() => typeof globalThis.__game !== 'undefined', null, { timeout: 60_000 });
  await sleep(4000);
  await page.evaluate(() => globalThis.__game.scene.start('play'));
  await page.waitForFunction(() => typeof globalThis.__scEconDump === 'function', null, { timeout: 60_000 });
  await sleep(4000);

  const state0 = await page.evaluate(() => JSON.parse(globalThis.__scEconDump(0)));
  log(`play 진입 — spins=${state0.spins} coins=${state0.coins} L${state0.cityLevel}`);

  // AUTO ON(스핀 소진 시 게임이 스스로 해제).
  await page.evaluate(() => globalThis.__game.scene.getScene('play').toggleAuto());
  log('AUTO ON — 소진까지 주행');

  const t0 = Date.now();
  const deadline = t0 + MINUTES * 60_000;
  let lastRounds = -1;
  let stall = 0;
  for (;;) {
    await sleep(INTERVAL_S * 1000);
    const d = await page.evaluate(() => {
      const s = globalThis.__game.scene.getScene('play');
      return { dump: JSON.parse(globalThis.__scEconDump(0)), auto: !!s.autoLock, busy: !!s.busyRound, stage: !!s.stageActive };
    });
    const t = d.dump.totals;
    const row = {
      t: Date.now(),
      el: Math.round((Date.now() - t0) / 1000),
      spins: d.dump.spins,
      coins: d.dump.coins,
      rounds: t.rounds,
      auto: d.auto,
      stage: d.stage,
      spinIn: t.spinIn,
      kinds: t.slotKind,
      minSpins: t.minSpins,
      blocks: t.noSpinBlocks,
    };
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
    log(`spins=${row.spins} rounds=${row.rounds} auto=${row.auto} stage=${row.stage} net/r=${t.rounds ? (((Object.values(t.spinIn).reduce((a, b) => a + b, 0) - t.spinBetSum)) / t.rounds).toFixed(2) : '-'}`);

    // 종료: 오토 해제 + 스핀 부족(소진) — 스테이지 연출 중이면 대기.
    if (!d.auto && !d.stage && d.dump.spins < 10) break;
    if (Date.now() > deadline) { log('시간 상한 도달 — 종료'); break; }
    // 정지 감시: 라운드가 3틱 연속 안 늘고 오토도 꺼져 있으면(팝업 등) 종료 처리.
    if (t.rounds === lastRounds && !d.auto && !d.busy) { if (++stall >= 3) { log('진행 정지 감지 — 종료'); break; } }
    else stall = 0;
    lastRounds = t.rounds;
  }

  const fin = await page.evaluate(() => JSON.parse(globalThis.__scEconDump(4000)));
  fs.writeFileSync(OUT.replace(/\.jsonl$/, '') + '.final.json', JSON.stringify(fin, null, 2));
  log(`완료 — 최종 spins=${fin.spins} rounds=${fin.totals.rounds}. 원장 → ${OUT.replace(/\.jsonl$/, '')}.final.json`);
  await browser.close();
}

main().catch((e) => {
  console.error('SIM FAILED:', e);
  process.exit(1);
});
