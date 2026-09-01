/**
 * level-sweep.mjs — **레벨 스윕 무인 실측**(게임 페이지 직접 구동).
 *
 * econ-lab.html 과 같은 브리지(__econLab)·봇 플래그·원장 스키마를 쓰되, 게임을 iframe 이 아니라
 * **페이지로 직접** 띄운다 — 헤드리스에서 iframe 게임은 스로틀돼 판당 240초+ 가 걸렸다(실측,
 * 직접 구동은 15~40초). 결과 JSON 은 대시보드의 「📥 JSON 가져오기」로 그대로 열람한다.
 *
 * 사용: node scripts/level-sweep.mjs --from 1 --to 125 --runs 3 [--out scripts/reports/sweep-1-125.json]
 *   수시로 덤프(크래시 대비). 크래시하면 N회를 못 채운 첫 레벨부터 자동 재개, 이전 덤프와 병합.
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const FROM = +arg('from', '1');
const TO = +arg('to', '500');
const RUNS = +arg('runs', '3');
const OUT = arg('out', `scripts/reports/sweep-${FROM}-${TO}.json`);
const PER_DAY = 10; // 대시보드 기본과 동일 — 하루 경계마다 리그 정산.
const COINS0 = 20000; // 2026-08-25 시작 자금 하향 반영.
const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), `[${FROM}-${TO}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let acc = { runs: [], days: [] };
if (existsSync(OUT)) { try { acc = JSON.parse(readFileSync(OUT, 'utf8')); log('기존 덤프 이어받음:', acc.runs.length, '판'); } catch {} }

function neededSeq() {
  const cnt = {};
  for (const r of acc.runs) cnt[r.level] = (cnt[r.level] || 0) + 1;
  const seq = [];
  for (let lv = FROM; lv <= TO; lv++) for (let i = cnt[lv] || 0; i < RUNS; i++) seq.push(lv);
  return seq;
}
function dump() {
  const tmp = OUT + '.tmp';
  writeFileSync(tmp, JSON.stringify({ ...acc, meta: { from: FROM, to: TO, runs: RUNS, updated: new Date().toISOString() } }));
  renameSync(tmp, OUT);
}

async function attempt(seq) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
    page.on('pageerror', (e) => log('[pageerror]', String(e.message).slice(0, 100)));
    await page.goto(BASE + '?lab=1', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const G = `(window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]))`;
    await page.waitForFunction(`(() => { const g=${G}; const h=g&&g.scene.getScene('home'); return !!h&&h.scene.isActive()&&!!window.__econLab; })()`, null, { timeout: 90000 });
    await page.evaluate((c) => {
      const g = (window.__PHASER_GAME__ || Phaser.GAMES[0]);
      if (g.sound) { g.sound.mute = true; g.sound.volume = 0; }
      window.__econLab.prepare({ coins: c, level: 1, builtFloors: 2, ownedFloors: 1 });
    }, COINS0);

    let sinceReboot = 0;
    for (let gi = 0; gi < seq.length; gi++) {
      const level = seq[gi];
      // 자동 충전(판 시작 전 — 원장 오염 없음) → 입장료.
      const fee = await page.evaluate((o) => {
        const L = window.__econLab;
        const need = L.feeOf(o.level, 1);
        if (L.snapshot().coins < need * 3) L.addCoins(Math.max(o.coins, need * 10));
        return L.payFee(o.level, 1);
      }, { level, coins: COINS0 });
      if (!fee.ok) throw new Error('fee-failed');

      const before = await page.evaluate(() => window.__econLab.snapshot());
      // 판 실행 — econ-lab runLevel 과 동일한 봇 플래그(＋5 실구매 포함).
      await page.evaluate((lv) => {
        const g = (window.__PHASER_GAME__ || Phaser.GAMES[0]);
        g.scene.stop('home'); g.scene.stop('play');
        g.scene.start('play', { level: lv });
      }, level);
      const okBoot = await page.waitForFunction(`(() => { const s=${G}.scene.getScene('play'); return !!s&&s.scene.isActive()&&!!s.state; })()`, null, { timeout: 30000 }).then(() => true).catch(() => false);
      if (!okBoot) throw new Error('boot-failed');
      await page.evaluate(() => {
        const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
        s.tweens.timeScale = 64; s.time.timeScale = 64; s.simSpeed = 4;
        s.simBuy = true; s.simBuys = 0; s.simMaxBuys = 12; s.simPayBuys = true;
        s.startSim();
      });
      let snap = null;
      const t0 = Date.now();
      let lastProg = -1;
      let still = 0;
      let lastSt = null;
      while (Date.now() - t0 < 180000) {
        await sleep(1000);
        const doNudge = still === 10; // 10초 정체 → 페이지 안에서 자가 복구 1회.
        const st = await page.evaluate((nudge) => {
          const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
          if (!s || !s.scene.isActive() || !s.state) return { dead: true };
          for (const nm of ['tipCard', 'coach']) { const l = s.children.list.find((o) => o.name === nm); if (l && l.list[0]) l.list[0].emit('pointerdown'); }
          const wasStopped = !s.simRunning && !s.ended; // 정지 판정은 재시동보다 먼저(멈춤 버그의 정체).
          const snap0 = s.labSnapshot();
          /*
           * **승리 정산 강제**(2026-08-24 실측) — checkEnd 는 시뮬 중이면 stopSim 만 하고 정산하지
           * 않는다. 정산은 후행 비행의 checkEnd 재호출(simRunning=false 시점) 운에 달려 있어
           * 간헐적으로 영영 안 끝났다. 보드 전멸이면 sim 을 멈추고 checkEnd 를 직접 불러 정산시킨다.
           */
          if (snap0.win && !s.ended) { if (s.simRunning) s.stopSim('클리어'); s.checkEnd(); }
          else if (wasStopped) s.startSim();
          if (nudge) { try { s.heldReveals && s.heldReveals.clear(); s.refresh(); if (!s.simRunning && !s.ended) s.startSim(); } catch {} }
          return { ...s.labSnapshot(), _stopped: wasStopped, _sim: s.simRunning, _deal: !!s.dealing, _end: s.ended, _coach: !!s.coachHold, _tip: !!s.tipOpen };
        }, doNudge);
        lastSt = st;
        if (st.dead) break;
        if (st.settled) { snap = st; break; }
        // **진행 워치독** — moves+cleared 가 안 늘면 정체(공개 콜백 유실 포함). 10초에 자가 복구,
        //   정지 6초 또는 총 30초면 패배 기록 후 다음 판(재시도·재부팅으로 수수료를 태우지 않는다).
        const prog = (st.cleared || 0) * 100000 + (st.moves || 0);
        if (prog === lastProg) {
          still += 1;
          if ((st._stopped && still >= 6) || still >= 30) {
            log('정체 → 패배 기록:', JSON.stringify({ level, boardLeft: st.boardLeft, stock: st.stock, sim: st._sim, moves: st.moves }));
            snap = { ...st, win: false, stalled: true };
            break;
          }
        } else { still = 0; lastProg = prog; }
      }
      if (!snap && lastSt && !lastSt.dead) { snap = { ...lastSt, win: false, stalled: true }; log(`L${level} 시간 상한 — 패배 기록`); }
      if (!snap) { log(`L${level} 판 실패 — 재시동 후 재시도`); throw new Error('run-failed'); }
      const after = await page.evaluate(() => window.__econLab.snapshot());
      const plus5 = await page.evaluate((o) => {
        const L = window.__econLab;
        let c = 0;
        for (let u = 0; u < o.buys; u++) c += L.plus5Price(o.level, u, 1);
        return c;
      }, { level, buys: snap.buys || 0 });
      const known = (snap.coins || 0) + (snap.dropCoins || 0) + (snap.tierCoins || 0) - plus5;
      // **건설 포함 경제**(PO 2026-08-25) — 판 정산 후, 실제 홈 규칙대로 지을 수 있는 만큼 짓는다.
      //   after 스냅샷 뒤에 실행하므로 판별 대사(unaccounted)는 오염되지 않고, 지출은 별도 행으로 적는다.
      const build = await page.evaluate(() => window.__econLab.autoBuild());
      acc.runs.push({
        day: Math.floor(acc.runs.length / PER_DAY) + 1, idx: (acc.runs.length % PER_DAY) + 1, level,
        win: !!snap.win, stars: snap.stars || 0, buys: snap.buys || 0, fee: fee.fee,
        starCoins: snap.coins || 0, plus5Cost: plus5,
        dropCoins: snap.dropCoins || 0, leagueCoins: snap.leagueCoins || 0, eventCoins: snap.eventCoins || 0,
        tierCoins: snap.tierCoins || 0, tierDiamonds: snap.tierDiamonds || 0,
        dropDiamonds: snap.dropDiamonds || 0, boardDiamonds: snap.diamonds || 0,
        drops: snap.drops || 0, leagueStars: snap.leagueStars || 0, eventItems: snap.eventItems || 0,
        missionTicks: snap.missionTicks || 0, missionKinds: snap.missionKinds || {}, missionAmounts: snap.missionAmounts || {},
        eventKinds: snap.eventKinds || {},
        leagueStages: snap.leagueStages || 0, eventStages: snap.eventStages || 0,
        leagueStageNow: after.leagueStage, eventStageNow: after.eventStage, leaguePoints: after.leaguePoints,
        coinsBefore: before.coins, coinsAfter: after.coins,
        net: after.coins - before.coins, unaccounted: (after.coins - before.coins) - known,
        pinch: snap.pinch || 0,
        buildCoins: build.coins, buildDiamonds: build.diamonds, builds: build.actions.length,
        floorsAfter: (build.actions[build.actions.length - 1] || {}).floor || after.builtFloors,
        stock: snap.stock || 0, startStock: snap.startStock || 0, ms: snap.ms || 0, ts: Date.now(),
      });
      // 하루 경계 — 리그 정산(순위 보상) + 7일마다 이벤트 주기 마감(대시보드와 동일 규칙).
      if (acc.runs.length % PER_DAY === 0) {
        const d = Math.floor(acc.runs.length / PER_DAY);
        const settle = await page.evaluate(() => window.__econLab.endDay());
        if (d % 7 === 0) await page.evaluate(() => window.__econLab.endEventPeriod());
        acc.days.push({ day: d, rank: settle.rank, rankCoins: settle.rankCoins, points: settle.points, eventRolled: d % 7 === 0 });
      }
      if (acc.runs.length % 5 === 0) dump();
      if (gi % 10 === 0 || gi === seq.length - 1) log(`${gi + 1}/${seq.length} · L${level} ${snap.win ? '승' : '패'} · 총 ${acc.runs.length}판`);
      // 장기 구동 성능 저하 방지 — 60판마다 브라우저 재시동.
      if (++sinceReboot >= 60) { dump(); throw new Error('scheduled-reboot'); }
    }
    dump();
    return true;
  } finally { await browser.close().catch(() => {}); }
}

for (;;) {
  const seq = neededSeq();
  if (!seq.length) { log('✅ 완료 —', acc.runs.length, '판 →', OUT); break; }
  log(`시작: 남은 ${seq.length}판 (L${seq[0]}~L${TO})`);
  try {
    await attempt(seq);
  } catch (e) {
    dump();
    const msg = String((e && e.message) || e);
    if (msg !== 'scheduled-reboot') { log('⚠', msg.slice(0, 120), '— 30초 후 재개'); await sleep(30000); }
  }
}
log('종료');
