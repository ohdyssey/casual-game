/**
 * qa-bonus.mjs — **보너스 게임 회귀**(홈 좌측 아이콘 → 하루 2판 → 승리 5천코인).
 *
 * 보는 것: ① 홈에 아이콘이 생겼는가 ② 눌러서 보너스 씬으로 가는가 ③ 판수가 시작마다 줄고
 *          다 쓰면 막히는가 ④ 승리 시 정확히 BONUS_WIN_COINS 만 오르는가(레벨·미션은 그대로).
 *
 * ⚠️ 헤드리스는 5fps 다 — 시간 값을 실기기 속도로 읽지 말 것.
 * 전제: 같은 폴더에서 `npm run dev`(6209).
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// 세이브를 깨끗한 상태로 심는다(보너스 기록 없음 = 오늘 2판).
await page.addInitScript(() => {
  try {
    localStorage.setItem('solitaire_save_v3', JSON.stringify({ coins: 10_000, diamonds: 50, level: 5, builtFloors: 2, ownedFloors: 1 }));
  } catch { /* 프라이빗 모드 */ }
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const homeReady = () => page.waitForFunction(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const h = g && g.scene.getScene('home');
  return !!(h && h.scene.isActive() && h.sys.isVisible());
}, null, { timeout: 90000 });
await homeReady();
await page.waitForTimeout(2500);

let failed = 0;
const say = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };

/*
 * ① 진입점 — 레일 아이콘('민원')과 **공공건물 민원 창구**(2026-08-30 재배치).
 * 프리셀은 이제 '보너스' 팝업이 아니라 공공건물 층의 창구로 들어간다. 레일 아이콘은 남되
 * 역할이 '이동'으로 바뀌었다(하루 2판짜리를 스크롤 뒤에 숨기지 않기 위해).
 */
const entry = await page.evaluate(() => {
  const h = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('home');
  const walk = (list, hit) => list.some((o) => (o.type === 'Text' && o.text === hit) || (Array.isArray(o.list) && walk(o.list, hit)));
  const desks = (h.civicDeskBoxes ?? []).map((e) => ({ floor: e.desk.floor, role: e.desk.role, soon: !!e.desk.comingSoon }));
  return { rail: walk(h.children.list, '민원'), desks };
});
say(entry.rail, "홈 좌측 레일에 '민원' 아이콘 생성");
say(entry.desks.length === 5, `공공건물 민원 창구 ${entry.desks.length}개 (기대 5)`);

/*
 * ①-2 **게임 방식은 층이 아니라 진행도가 정한다**(PO 2026-08-30) — 모든 창구가 같은 4단 순환을 돌고
 * 진행도만 창구별로 따로 쌓인다. 오래 다닌 창구일수록 보상 배수가 붙는다.
 */
const cycle = await page.evaluate(async () => {
  const rt = await import('/src/logic/civicRuntime.ts');
  const sv = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  delete sv.civicProgress;
  localStorage.setItem('solitaire_save_v3', JSON.stringify(sv));
  const seq = [];
  for (let i = 0; i < 5; i++) {
    const st = rt.civicDeskStateOf('fire');
    seq.push(`${st.mode}${st.timed ? '+t' : ''}`);
    if (i === 4) var last = st;
    rt.advanceCivicProgress('fire');
  }
  const police = rt.civicDeskStateOf('police');
  return { seq, mult5: last.mult, policeStep: police.step, saved: JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}').civicProgress };
});
say(
  JSON.stringify(cycle.seq) === JSON.stringify(['draw1', 'draw1+t', 'draw3', 'draw3+t', 'draw1']),
  `4단 순환 후 처음으로 (${cycle.seq.join(' → ')})`,
);
say(cycle.mult5 > 1, `한 바퀴 돌면 보상 배수 ×${cycle.mult5?.toFixed(1)} (기대 >1.0)`);
say(cycle.policeStep === 1, `창구별로 진행도가 따로 쌓인다 (경찰서 ${cycle.policeStep}/4)`);
// ⚠️ 화이트리스트에서 빠지면 저장할 때마다 조용히 지워진다(bonusGame·bonusTimeWins 에서 겪은 함정).
say(cycle.saved?.fire === 5, `진행도가 세이브에 남는다 (${JSON.stringify(cycle.saved)})`);

// ② 진입 + 판수 차감
// ⚠️ **차감은 씬이 아니라 `startBonusPlay()` 가 한다**(단일 지점). 하네스도 실제 경로와 같게 부른다 —
//   씬만 띄우고 차감을 기대하면 "안 줄어든다" 는 오탐이 난다(실제로 그 함정을 겪었다).
const run = async () => page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  const rt = await import('/src/logic/bonusRuntime.ts');
  rt.startBonusPlay();
  g.scene.stop('home');
  g.scene.start('playKlondike');
  const t0 = performance.now();
  while (performance.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 200));
    const s = g.scene.getScene('playKlondike');
    if (s && s.scene.isActive() && s.state) break;
  }
  const save = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  return { used: save.bonusGame?.used ?? 0, coins: save.coins, level: save.level };
});
const a = await run();
say(a.used === 1, `1판 시작 → 사용 ${a.used}/2 (무료)`);

// ③ 승리 처리 — 씬의 onWin 을 직접 태워 보상만 검증(판을 다 푸는 것은 이 하네스의 몫이 아니다).
const winOf = async (mode, timed = false) => page.evaluate(async ({ mode, timed }) => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  g.scene.stop('playKlondike');
  g.scene.start('playKlondike', { mode, timed });
  const t0 = performance.now();
  while (performance.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 200));
    const s = g.scene.getScene('playKlondike');
    if (s && s.scene.isActive() && s.state) break;
  }
  const s = g.scene.getScene('playKlondike');
  const draw = s.state?.drawCount ?? 0; // 이 판이 실제로 몇 장씩 뒤집는가
  const before = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  s.onWin();
  await new Promise((r) => setTimeout(r, 400));
  const after = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  return { draw, gain: (after.coins ?? 0) - (before.coins ?? 0), levelBefore: before.level, levelAfter: after.level };
}, { mode, timed });

const w1 = await winOf('draw1');
say(w1.draw === 1, `1장 모드 — 실제 뽑기 ${w1.draw}장`);
say(w1.gain === 3000, `1장 일반 보상 +${w1.gain.toLocaleString()} (기대 3,000)`);
say(w1.levelBefore === w1.levelAfter, `메인 레벨 불변 ${w1.levelBefore} → ${w1.levelAfter} (보너스가 진행도를 건드리지 않는다)`);

const w3 = await winOf('draw3');
say(w3.draw === 3, `3장 모드 — 실제 뽑기 ${w3.draw}장`);
say(w3.gain === 5000, `3장 일반 보상 +${w3.gain.toLocaleString()} (기대 5,000)`);

/*
 * ③-2 **타임어택**(2026-08-30) — 같은 규칙에 제한시간만 얹은 변형. 보는 것 세 가지:
 *   ⓐ 보상이 정확히 3배인가 ⓑ 시계가 실제로 줄어드는가 ⓒ 0 이 되면 지는가.
 * ⚠️ 제한시간은 `?bonusTime=` 으로 덮어쓸 수 있게 해 뒀지만, 하네스는 페이지를 다시 열지 않고
 *   **남은 시간을 직접 깎아** 만료를 만든다 — 실제 4분을 기다릴 수는 없다.
 */
const t1 = await winOf('draw1', true);
say(t1.gain === 5000, `⏱1장 타임어택 보상 +${t1.gain.toLocaleString()} (기대 5,000)`);
const t3 = await winOf('draw3', true);
say(t3.gain === 7000, `⏱3장 타임어택 보상 +${t3.gain.toLocaleString()} (기대 7,000)`);

const timer = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  g.scene.stop('playKlondike');
  g.scene.start('playKlondike', { mode: 'draw1', timed: true });
  let s; const t0 = performance.now();
  while (performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 200)); s = g.scene.getScene('playKlondike'); if (s && s.scene.isActive() && s.state) break; }
  const limit = s.timeLimitSec;
  // 카운트다운(3·2·1)이 끝나야 시계가 돈다.
  const t1 = performance.now();
  while (performance.now() - t1 < 15000 && !s.timerRunning) await new Promise((r) => setTimeout(r, 100));
  const running = s.timerRunning;
  const a = s.timeLeftMs;
  await new Promise((r) => setTimeout(r, 1200));
  const b = s.timeLeftMs;
  // 만료 — 남은 시간을 직접 깎아 다음 프레임에 시간 초과를 만든다.
  s.timeLeftMs = 20;
  const t2 = performance.now();
  while (performance.now() - t2 < 15000 && !s.ended) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 800));
  const popup = s.children.list.some((o) => o.depth === 3000);
  const save = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  return { limit, running, drained: a - b, ended: s.ended, popup, coins: save.coins };
});
say(timer.limit === 210, `⏱1장 제한시간 ${timer.limit}초 (기대 210 = 3:30)`);
say(timer.running === true, '카운트다운 뒤 시계 시작');
say(timer.drained > 0, `시계가 줄어든다 (1.2초에 ${Math.round(timer.drained)}ms)`);
say(timer.ended === true && timer.popup, `시간 초과 → 패배 처리 + 결과 팝업 (${timer.ended}/${timer.popup})`);

/*
 * ③-2b **제한시간 사다리**(PO 2026-08-30) — 타임어택 승리만 단계를 민다.
 * ⚠️ 세이브 화이트리스트(`loadSave`)에 `bonusTimeWins` 를 빠뜨리면 매 저장마다 조용히 지워진다 —
 *   같은 함정을 `bonusGame` 에서 이미 한 번 겪었다. 그래서 **다시 읽어서** 확인한다.
 */
const ladder = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  const sv = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  // 1장만 4승 — 다음 승리에서 첫 단축이 걸리는 자리. **3장은 0승으로 두고 안 밀리는지 본다.**
  sv.coins = 99_999; sv.bonusTimeWins = { draw1: 4, draw3: 0 };
  localStorage.setItem('solitaire_save_v3', JSON.stringify(sv));
  const rt = await import('/src/logic/bonusRuntime.ts');
  const before = { wins: rt.bonusTimeWins('draw1'), limit: rt.bonusTimeLimitSec('draw1'), other: rt.bonusTimeLimitSec('draw3') };
  g.scene.stop('playKlondike');
  g.scene.start('playKlondike', { mode: 'draw1', timed: true });
  let s; const t0 = performance.now();
  while (performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 200)); s = g.scene.getScene('playKlondike'); if (s && s.scene.isActive() && s.state) break; }
  s.onWin();
  await new Promise((r) => setTimeout(r, 600));
  const afterWin = { wins: rt.bonusTimeWins('draw1'), limit: rt.bonusTimeLimitSec('draw1'), other: rt.bonusTimeLimitSec('draw3'), otherWins: rt.bonusTimeWins('draw3') };
  // 일반 모드 승리는 사다리를 밀면 안 된다.
  g.scene.stop('playKlondike');
  g.scene.start('playKlondike', { mode: 'draw1', timed: false });
  const t1 = performance.now();
  while (performance.now() - t1 < 30000) { await new Promise((r) => setTimeout(r, 200)); s = g.scene.getScene('playKlondike'); if (s && s.scene.isActive() && s.state) break; }
  s.onWin();
  await new Promise((r) => setTimeout(r, 600));
  const afterNormal = rt.bonusTimeWins('draw1');
  // 최상 난이도까지.
  const sv2 = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  sv2.bonusTimeWins = { draw1: 500, draw3: 500 }; localStorage.setItem('solitaire_save_v3', JSON.stringify(sv2));
  const capped = rt.bonusTimeLimitSec('draw1');
  const persisted = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}').bonusTimeWins;
  return { before, afterWin, afterNormal, capped, persisted };
});
say(ladder.before.limit === 210 && ladder.before.other === 240, `시작값 1장 ${ladder.before.limit}초 / 3장 ${ladder.before.other}초 (기대 210 / 240)`);
say(ladder.afterWin.wins === 5 && ladder.afterWin.limit === 205, `⏱1장 승리 → 5승 · ${ladder.afterWin.limit}초 (기대 205 = −5초)`);
say(ladder.afterWin.otherWins === 0 && ladder.afterWin.other === 240, `3장 사다리는 그대로 (${ladder.afterWin.otherWins}승 · ${ladder.afterWin.other}초)`);
say(ladder.afterNormal === 5, `일반 모드 승리는 사다리를 밀지 않는다 (${ladder.afterNormal}승)`);
say(ladder.capped === 150, `최상 난이도 ${ladder.capped}초 (기대 150 = 2:30)`);
say(ladder.persisted?.draw1 === 500, `누적 승수가 모드별로 세이브에 남는다 (${JSON.stringify(ladder.persisted)})`);

/*
 * ③-3 **다시하기 / 다른 판도 새 판으로 계산**(PO 2026-08-30) — 예전엔 공짜였다. 공짜면 하루 2회가
 * "이길 때까지 무제한"이 되어 이론상 보상이 무한이었다.
 * ⚠️ 차감 지점은 `resetBoard` 하나다(두 버튼 공통) — 여기를 안 지나는 새 경로를 만들면 그 문으로는 공짜다.
 */
const reset = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  // 무료 판을 다 쓴 상태로 맞춰 **코인이 실제로 빠지는지**를 본다.
  const s0 = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  s0.coins = 50_000; s0.bonusGame = undefined;
  localStorage.setItem('solitaire_save_v3', JSON.stringify(s0));
  const rt = await import('/src/logic/bonusRuntime.ts');
  rt.startBonusPlay(); rt.startBonusPlay(); // 무료 2판 소진 → 이후는 유료
  g.scene.stop('playKlondike');
  g.scene.start('playKlondike', { mode: 'draw1' });
  let s; const t0 = performance.now();
  while (performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 200)); s = g.scene.getScene('playKlondike'); if (s && s.scene.isActive() && s.state) break; }
  const fp = () => JSON.stringify(s.state.tableau.map((c) => c.map((x) => x.card.id + (x.faceUp ? 'u' : 'd'))));
  const coins = () => JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}').coins ?? 0;
  const start = fp();
  const c0 = coins();
  const okSame = s.restartGame();
  await new Promise((r) => setTimeout(r, 500));
  const c1 = coins(); const same = fp();
  const okNew = s.newDealGame();
  await new Promise((r) => setTimeout(r, 500));
  const c2 = coins(); const other = fp();
  // 코인을 게임비 아래로 낮추면 막혀야 한다(보드도 그대로).
  const sv = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  sv.coins = 1999; localStorage.setItem('solitaire_save_v3', JSON.stringify(sv));
  const blocked = s.newDealGame();
  await new Promise((r) => setTimeout(r, 400));
  // ⚠️ **다음 검사를 위해 상태를 되돌려 둔다** — 코인 1999 / 판수 소진을 그대로 남기면 ④가
  //   "유료 진입 성공"을 재려다 실패한다(실측 오탐).
  const back = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  // ④는 "무료 1판 남은" 상태를 전제로 한다(②가 만들던 상태) — 그 상태로 정확히 되돌린다.
  const bg = await import('/src/logic/bonusGame.ts');
  back.coins = 50_000; back.bonusGame = bg.consumeBonusPlay(undefined, new Date());
  localStorage.setItem('solitaire_save_v3', JSON.stringify(back));
  return { feeSame: c0 - c1, feeNew: c1 - c2, sameDeal: same === start, newDeal: other !== same, okSame, okNew, blocked, kept: fp() === other };
});
say(reset.okSame && reset.feeSame === 2000, `다시하기 → 게임비 🪙${reset.feeSame?.toLocaleString()} 차감 (기대 2,000)`);
say(reset.sameDeal, '다시하기는 같은 배치 그대로');
say(reset.okNew && reset.feeNew === 2000, `다른 판 → 게임비 🪙${reset.feeNew?.toLocaleString()} 차감 (기대 2,000)`);
say(reset.newDeal, '다른 판은 배치가 바뀜');
say(reset.blocked === false && reset.kept, `코인 부족이면 거부하고 보드 유지 (${reset.blocked}/${reset.kept})`);

/*
 * ③-3b **타임어택에서 다시하기/다른 판은 시계도 리셋**(PO 2026-08-30). 게임비를 냈으니 새 판과
 * 같은 조건이어야 한다 — 남은 시간을 이어받으면 판만 새로 깔아 주고 사실상 못 푸는 판이 된다.
 * ⚠️ 시계 표시(`timerText`)가 **겹쳐 쌓이지 않는지**도 본다 — 재시작마다 새로 만들면 숫자가 포개진다.
 */
const timedReset = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  const sv = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  sv.coins = 99_999; delete sv.bonusGame; sv.bonusTimeWins = 0;
  localStorage.setItem('solitaire_save_v3', JSON.stringify(sv));
  g.scene.stop('playKlondike');
  g.scene.start('playKlondike', { mode: 'draw1', timed: true });
  let s; const t0 = performance.now();
  while (performance.now() - t0 < 20000) { await new Promise((r) => setTimeout(r, 200)); s = g.scene.getScene('playKlondike'); if (s && s.scene.isActive() && s.state) break; }
  // ⚠️ 헤더 태그도 '⏱' 로 시작한다(`⏱1장 2/2`) — 시계 모양(`⏱ M:SS`)만 센다. 느슨하게 세면 2개로 읽힌다.
  const countTimers = () => s.children.list.filter((o) => o.type === 'Text' && /^⏱ \d+:\d{2}$/.test(o.text ?? '')).length;
  s.timeLeftMs = 30_000; // 시간을 많이 쓴 상태로 만든다.
  const drained = s.timeLeftMs;
  const okSame = s.restartGame();
  await new Promise((r) => setTimeout(r, 500));
  const afterSame = { left: Math.round(s.timeLeftMs / 1000), timers: countTimers() };
  s.timeLeftMs = 30_000;
  const okNew = s.newDealGame();
  await new Promise((r) => setTimeout(r, 500));
  const afterNew = { left: Math.round(s.timeLeftMs / 1000), timers: countTimers() };
  return { drained, okSame, okNew, afterSame, afterNew, limit: s.timeLimitSec };
});
say(timedReset.okSame && timedReset.afterSame.left === timedReset.limit, `⏱다시하기 → 시계 리셋 ${timedReset.afterSame.left}초 (기대 ${timedReset.limit})`);
say(timedReset.okNew && timedReset.afterNew.left === timedReset.limit, `⏱다른 판 → 시계 리셋 ${timedReset.afterNew.left}초 (기대 ${timedReset.limit})`);
say(timedReset.afterNew.timers === 1, `시계 표시가 겹쳐 쌓이지 않는다 (${timedReset.afterNew.timers}개)`);

/*
 * ③-4 **안내는 한 번만**(PO 2026-08-30 "한번 출력된 후 계속 반복 출력되지 않도록").
 * 예전엔 씬에 들어올 때마다 진입 토스트를 무조건 띄웠고, '다시하기'·'다른 판'·'한 번 더'가 전부
 * 재진입이라 같은 문장이 계속 떴다(실측: 3회 진입 = 3회 표시).
 * ⚠️ 토스트는 금방 사라지므로 **폴링으로** 잡는다 — 한 번만 들여다보면 못 본다(오탐 경험).
 */
const notices = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  try { localStorage.removeItem('solitaire_tips_v1'); } catch { /* 프라이빗 모드 */ }
  const hits = [];
  for (let i = 0; i < 3; i++) {
    g.scene.stop('playKlondike');
    g.scene.start('playKlondike', { mode: 'draw1' });
    let s; const t0 = performance.now();
    while (performance.now() - t0 < 20000) { await new Promise((r) => setTimeout(r, 150)); s = g.scene.getScene('playKlondike'); if (s && s.scene.isActive() && s.state) break; }
    let seen = false;
    for (let k = 0; k < 14 && !seen; k++) {
      const texts = [];
      const walk = (l) => l.forEach((o) => { if (o.type === 'Text' && o.text) texts.push(o.text); if (Array.isArray(o.list)) walk(o.list); });
      walk(s.children.list);
      if (texts.some((t) => t.includes('🎁 보너스'))) seen = true;
      await new Promise((r) => setTimeout(r, 120));
    }
    hits.push(seen);
  }
  return hits;
});
say(notices[0] === true, `진입 안내가 처음엔 뜬다 (${notices[0]})`);
say(notices.slice(1).every((v) => v === false), `두 번째부터는 안 뜬다 (${notices.slice(1).join(',')})`);

// ④ 2판째 시작 후 소진 → 더는 못 들어간다
const b = await page.evaluate(async () => {
  const rt = await import('/src/logic/bonusRuntime.ts');
  const bg = await import('/src/logic/bonusGame.ts');
  rt.startBonusPlay(); // 2판째 — 여기까지 무료
  const before = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}').coins;
  const feeShown = rt.bonusFee(); // 3판째 게임비(화면이 보여 주는 값)
  const third = rt.startBonusPlay(); // 3판째 — 유료로 들어간다
  const after = JSON.parse(localStorage.getItem('solitaire_save_v3') || '{}');
  // ⚠️ **차감액을 먼저 재고** 나서 코인을 손댄다 — 순서를 바꾸면 내가 넣은 값과 비교하게 된다
  //   (실측 오탐: 차감 2,000 인데 13,001 로 보고했다).
  const spent = before - after.coins;
  after.coins = bg.BONUS_PAID_FEE - 1; // 게임비 아래로 낮춰 4판째가 막히는지
  localStorage.setItem('solitaire_save_v3', JSON.stringify(after));
  const fourth = rt.startBonusPlay();
  return { freeLeft: rt.bonusLeft(), feeShown, fee: bg.BONUS_PAID_FEE, paid: third?.paid ?? null, spent, fourth };
});
say(b.freeLeft === 0, `무료 2판 소진 → 남은 무료 ${b.freeLeft}`);
say(b.feeShown === b.fee, `3판째 게임비 표시 🪙${b.feeShown?.toLocaleString()} (기대 ${b.fee.toLocaleString()})`);
say(b.paid === b.fee && b.spent === b.fee, `유료 진입 성공 · 실제 차감 🪙${b.spent?.toLocaleString()}`);
say(b.fourth === null, `코인 부족이면 막힌다 (${b.fourth === null ? '거부' : '들어가짐'})`);

await browser.close();
if (errors.length) { console.log('\n런타임 오류:'); for (const e of errors.slice(0, 5)) console.log('  ! ' + e); }
console.log(failed || errors.length ? `\n❌ 실패 ${failed}건 · 오류 ${errors.length}건` : '\n✅ 보너스 게임 정상');
process.exit(failed || errors.length ? 1 : 0);
