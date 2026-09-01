/**
 * qa-play-regression.mjs — **화면==상태 불변식** 자동 회귀(플레이 경로 실측).
 *
 * 실제 브라우저에서 게임을 띄우고 PlayScene 의 시뮬(그리디 봇)을 돌려 여러 레벨을 자동 플레이한 뒤,
 *   ① 코어 errorLog 에 `invariant` 항목이 쌓였는지(= 화면과 상태가 어긋난 순간이 있었는지)
 *   ② 런타임 예외/미처리 rejection 이 있었는지
 *   ③ 각 레벨이 실제로 진행됐는지(클리어 또는 뽑기 소진)
 * 를 확인한다. 하나라도 걸리면 비정상 종료(exit 1).
 *
 * 사용: node scripts/qa-play-regression.mjs [--levels 1,2,3] [--speed 4] [--headed] [--timeout 150000]
 *       [--viewport 540x1200] — 브라우저 뷰포트(화면비 회귀용). 아래 VIEWPORTS 의 별칭도 받는다.
 *   전제: 같은 폴더에서 `npm run dev`(포트 6209)가 이미 떠 있어야 한다.
 *
 * ⚠️ **헤드리스는 5fps 수준으로 느리다**(GPU 소프트 렌더). Phaser 는 프레임당 delta 를 상한(≈50ms)으로
 *    자르므로 **게임 시간이 실시간보다 느리게 흐른다** — 배속(--speed)을 올리고 레벨 타임아웃을 넉넉히 준다.
 *    타임아웃은 대개 게임 교착이 아니라 하네스가 느린 것이므로, 교착 진단 덤프를 함께 보고 판단할 것.
 *
 * ⚠️ 헤드리스 브라우저는 Phaser 애니메이션 중 조작하면 잘 죽는다 —
 *    이 스크립트는 **DOM 조작 없이** 씬 메서드를 직접 호출하고 폴링만 한다.
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const LEVELS = argOf('levels', '1,2,3,5,8,13,21,34')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const HEADED = args.includes('--headed');
const LEVEL_TIMEOUT = Number(argOf('timeout', '150000'));
const SPEED = Number(argOf('speed', '4'));

/**
 * **화면비 회귀용 뷰포트 프리셋.**
 *
 * ⚠️ 기본값 540×1200 은 저작비(2400/1080 = 2.222)와 **정확히 일치**한다 — 즉 캔버스가 저작 크기
 *   그대로라 가변 경로(늘어난 폭/높이를 앵커가 흡수하는 코드)를 **한 번도 타지 않는다**. 화면비 대응
 *   작업 중에는 `--viewport iphone15` 처럼 저작비와 다른 비율을 함께 돌려야 회귀가 잡힌다.
 *   (실기기 대부분은 저작비보다 **덜 길쭉**해서 늘어나는 축은 세로가 아니라 **가로**다.)
 */
const VIEWPORTS = {
  design: { width: 540, height: 1200 }, // 2.222 — 저작비와 동일(여분 0, 종전 기본값).
  iphone15: { width: 590, height: 1278 }, // 2.166 — 폭이 늘어나는 대표 케이스.
  iphonese: { width: 375, height: 667 }, // 1.779 — 폭이 가장 많이 늘어난다.
  tall: { width: 540, height: 1260 }, // 2.333(21:9) — 높이가 늘어나는 케이스.
};

/** `--viewport` 파싱 — 별칭(design/iphone15/…) 또는 `540x1200` 형식. */
function parseViewport(raw) {
  if (VIEWPORTS[raw]) return VIEWPORTS[raw];
  const m = /^(\d+)x(\d+)$/.exec(raw);
  if (m) return { width: Number(m[1]), height: Number(m[2]) };
  console.error(`--viewport 값을 해석할 수 없다: ${raw} (별칭 ${Object.keys(VIEWPORTS).join('/')} 또는 540x1200 형식)`);
  process.exit(2);
}
const VIEWPORT = parseViewport(argOf('viewport', 'design'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 폴링 중 페이지가 리로드됐음을 나타내는 표식(HMR 등). */
const RELOADED = Symbol('reloaded');

/** 페이지 안에서 PlayScene 인스턴스를 찾는 헬퍼(브라우저 컨텍스트에서 평가됨). */
const SCENE_HELPER = `(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  if (!g) return null;
  return g.scene.getScene('play') || null;
})()`;

async function main() {
  // --mute-audio: 헤드리스에는 오디오 장치가 없어 WebAudio 가 에러를 뿜는다(환경 잡음).
  const browser = await chromium.launch({ headless: !HEADED, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: VIEWPORT });
  console.log(`뷰포트 ${VIEWPORT.width}×${VIEWPORT.height} (화면비 ${(VIEWPORT.height / VIEWPORT.width).toFixed(3)} · 저작비 2.222)`);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const warnings = [];
  // 이 게임에는 홈→플레이 전환에서 같은 텍스처 키를 다시 등록하는 기존 증상이 있다(이 회귀의 대상 아님).
  //   실패로 세지 않고 경고로만 보고해 신호를 흐리지 않는다.
  const KNOWN_NOISE = [/Texture key already in use/, /AudioContext encountered an error/];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = `console.error: ${m.text()}`;
    if (KNOWN_NOISE.some((re) => re.test(text))) warnings.push(text);
    else pageErrors.push(text);
  });

  // 이전 세션의 SW/캐시가 낡은 번들을 서빙하지 않게 정리 후 재진입.
  /*
   * ⚠️ **서비스워커를 배제하고 연다.** 이 게임의 sw.js 는 1회성 청소용이라 활성화되면서 페이지를
   *   `?swc=1` 로 **navigate 시킨다** — 그 순간 실행 컨텍스트가 날아가 하네스가
   *   "Execution context was destroyed" 로 죽는다(실측 2026-08-29, 게임 회귀가 아니라 하네스 취약점).
   *   회귀가 보려는 것은 게임 로직이지 SW 수명주기가 아니므로 아예 안 보이게 한다.
   */
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined }); } catch { /* 구형 브라우저 */ }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (navigator.serviceWorker) {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    try {
      localStorage.removeItem('casual:errlog:solitaire');
    } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 게임 인스턴스를 전역에 노출(코어가 노출하지 않으면 Phaser.GAMES 로 폴백).
  await page.waitForFunction(
    () => !!(window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES.length)),
    null,
    { timeout: 60000 },
  );
  // ⚠️ **부팅이 끝날 때까지 기다린다** — 홈 씬이 뜨기 전에 play 로 갈아타면, 뒤늦게 도착한 부팅 전환이
  //   play 씬을 셧다운시킨다(실측: 첫 레벨만 늘 실패했고, 하네스는 **죽은 씬의 낡은 뷰**를 읽어
  //   "낼 수 있는데 입력이 꺼진 카드"라는 오탐을 냈다). 홈이 활성화된 뒤에 시작해야 레이스가 없다.
  await page.waitForFunction(
    () => {
      const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
      const h = g && g.scene.getScene('home');
      return !!h && h.scene.isActive();
    },
    null,
    { timeout: 60000 },
  );

  const failures = [];
  const gateFailures = [];
  const results = [];

  for (const level of LEVELS) {
    // 플레이 씬을 해당 레벨로 직접 시작(홈 UI 를 거치지 않음 — 애니 중 클릭으로 크래시하는 걸 피한다).
    await page.evaluate((lv) => {
      const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
      g.scene.stop('home');
      g.scene.stop('play');
      g.scene.start('play', { level: lv, free: true });
    }, level);

    // 씬이 살아나면 즉시 배속 — 딜 연출도 배속으로 지나가게 한다.
    await page.waitForFunction(
      `(() => { const s = ${SCENE_HELPER}; return !!s && s.scene.isActive() && !!s.state; })()`,
      null,
      { timeout: 60000 },
    );
    await page.evaluate((sp) => {
      const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
      s.tweens.timeScale = sp;
      s.time.timeScale = sp;
    }, SPEED);

    // 딜 연출이 끝나 시뮬을 시작할 수 있을 때까지 대기.
    await page.waitForFunction(
      `(() => { const s = ${SCENE_HELPER}; return !!s && s.dealing === false; })()`,
      null,
      { timeout: 60000 },
    );

    // **튜토리얼 안내 자동 닫기** — 안내가 떠 있으면 입력이 잠기므로(coachHold) 봇이 한 수도 못 둔다.
    //   회귀는 게임 진행을 보는 것이지 안내를 보는 게 아니므로, 뜨는 즉시 닫아 준다.
    const dismissTips = async () => {
      await page.evaluate(`(() => {
        const s = ${SCENE_HELPER};
        if (!s) return;
        for (const nm of ['tipCard', 'coach']) {
          const l = s.children.list.find((o) => o.name === nm);
          if (l && l.list[0]) l.list[0].emit('pointerdown');
        }
      })()`);
    };
    await dismissTips();

    // 봇 구동(startSim 이 같은 배속을 다시 건다).
    await page.evaluate((sp) => {
      const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
      s.simSpeed = sp;
      s.startSim();
    }, SPEED);

    const t0 = Date.now();
    let outcome = 'timeout';
    while (Date.now() - t0 < LEVEL_TIMEOUT) {
      // dev 서버가 파일 변경으로 페이지를 리로드하면 실행 컨텍스트가 날아간다 — 그 레벨만 중단하고 넘어간다.
      const snap = await page.evaluate(`(() => {
        const s = ${SCENE_HELPER};
        if (!s || !s.state) return { gone: true };
        if (s.sys.settings.status === 8) return { dead: true };
        return {
          running: s.simRunning,
          cleared: s.state.cleared.size,
          total: s.state.layout.slots.length,
          stock: s.state.stock.length,
          drawFlights: s.drawFlights,
          // **낼 수 있는데 입력이 꺼진 카드** — 손가락으로는 안 눌리는 카드(런타임 불변식과 같은 조건).
          //   뒤집기 연출이 아직 얼굴을 안 보여준 카드는 제외한다(곧 콜백이 입력을 연다 — 정상 구간).
          notTappable: [...s.cards.keys()].filter((id) => {
            const want = s.view.slots.get(id);
            const v = s.cards.get(id);
            if (!want || want.kind !== 'face' || !want.tappable) return false;
            if (!v.isShowingCard(want.card)) return false;
            return !(v.input && v.input.enabled);
          }),
        };
      })()`).catch((e) => (/Execution context was destroyed|Target closed/.test(String(e)) ? RELOADED : Promise.reject(e)));
      if (snap === RELOADED) { outcome = 'page-reloaded'; break; }
      await dismissTips(); // 판 도중에도 안내가 뜬다(특수 카드 등) — 그때마다 닫아 진행을 막지 않는다.
      if (snap.gone) { outcome = 'scene-gone'; break; }
      // 씬이 셧다운된 뒤의 뷰는 **낡은 잔해**다 — 그걸 읽고 입력 불변식을 판정하면 오탐이 된다.
      if (snap.dead) { outcome = 'scene-dead'; break; }
      // ⚠️ **봇은 `input.enabled` 를 거치지 않는다**(핸들러를 직접 호출) — 실제 손가락만 겪는
      //   "낼 수 있는데 안 눌리는 카드"를 봇 진행만으로는 절대 못 잡는다. 매 폴링마다 직접 확인한다.
      if (snap.notTappable && snap.notTappable.length) {
        gateFailures.push(`L${level}: 낼 수 있는데 입력이 꺼진 카드 — ${snap.notTappable.join(', ')}`);
        break;
      }
      if (!snap.running) {
        outcome = snap.cleared === snap.total ? 'win' : `stop(잔여 ${snap.total - snap.cleared}·스톡 ${snap.stock})`;
        break;
      }
      // ⚠️ 헤드리스는 ~5fps 다. 자주 폴링하면 evaluate 가 프레임 예산을 뺏어 **게임이 느려지고 타임아웃난다**
      //   (250ms 폴링에서 실제로 재현). 교착은 지속 상태라 1초 간격으로도 충분히 잡힌다.
      await sleep(1000);
    }
    await page.evaluate(() => {
      const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
      g.scene.getScene('play')?.stopSim?.('qa');
    });

    // 이 레벨에서 쌓인 불변식 위반 회수.
    const errs = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('casual:errlog:solitaire') ?? '[]');
      } catch {
        return [];
      }
    });
    const inv = errs.filter((e) => e.type === 'invariant');
    results.push({ level, outcome, invariants: inv.length });
    if (outcome === 'page-reloaded') {
      failures.push(`L${level}: 측정 중 페이지가 리로드됨(dev 서버 HMR?) — 회귀 실행 중 소스를 수정하지 말 것`);
    } else if (outcome === 'scene-dead') {
      failures.push(`L${level}: 플레이 씬이 셧다운됨(부팅 전환·강제 이동 등) — 측정 불가`);
    } else if (outcome === 'timeout' || outcome === 'scene-gone') {
      // 교착 진단 — 무엇이 봇을 멈춰 세웠는지 그 순간의 상태를 그대로 덤프한다.
      const diag = await page.evaluate(`(() => {
        const s = ${SCENE_HELPER};
        if (!s || !s.state) return { gone: true };
        const moves = s.availableMovesForQa ? s.availableMovesForQa() : [];
        return {
          wasteTruthful: s.wasteTruthful(),
          wasteVisible: !!s.wasteView && s.wasteView.visible,
          wasteShown: s.wasteView ? s.wasteView.shownSignature() : null,
          top: (() => { const t = s.state.waste[s.state.waste.length - 1]; return t ? t.rank + t.suit + (t.wild ? 'W' : '') : null; })(),
          drawFlights: s.drawFlights, flyingCards: s.flyingCards, revealHold: s.revealHold,
          dealing: s.dealing, ended: s.ended, busy: s.busy,
          cards: [...s.cards.entries()].map(([id, v]) => ({
            id, shown: v.shownSignature(), input: !!(v.input && v.input.enabled), tappable: s.isTappable(id),
          })),
        };
      })()`);
      failures.push(`L${level}: 진행 실패 — ${outcome}\n      ${JSON.stringify(diag, null, 1).split('\n').join('\n      ')}`);
    }
    for (const e of inv) {
      const where = String(e.stack ?? '').split('\n').slice(1, 7).map((l) => `      ${l.trim()}`).join('\n');
      failures.push(`L${level}: ${e.msg} (${e.ctx}) ×${e.count}\n${where}`);
    }
    // 다음 레벨 측정을 오염시키지 않게 비운다.
    await page.evaluate(() => localStorage.removeItem('casual:errlog:solitaire'));
  }

  console.log('\n레벨별 결과');
  for (const r of results) console.log(`  L${String(r.level).padStart(3)} · ${r.outcome} · 불변식위반 ${r.invariants}`);

  failures.push(...gateFailures);
  if (pageErrors.length) failures.push(...pageErrors.map((e) => `런타임 오류: ${e}`));
  if (warnings.length) {
    console.log('\n경고(기존 증상 · 이 회귀 대상 아님)');
    for (const w of [...new Set(warnings)]) console.log(`  ! ${w}`);
  }

  await browser.close();

  if (failures.length) {
    console.error(`\n❌ 실패 ${failures.length}건`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\n✅ ${results.length}개 레벨 · 불변식 위반 0 · 런타임 오류 0`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
