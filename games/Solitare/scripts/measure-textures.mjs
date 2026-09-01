/**
 * measure-textures — **표시 크기 계측 수집기**.
 *
 * 게임을 `?measureTextures=1` 로 띄우고 화면·팝업을 한 바퀴 돌려, 각 업로드 텍스처가 **실제로 그려진
 * 최대 크기**를 모은다. 결과는 `texture-usage.json`(원본 계측). 힌트 변환은 gen-diet-hints.mjs.
 *
 * 왜 필요한가: 배포 다이어트의 리사이즈 상한은 저작 레이아웃 노드에서만 나온다. 코드가 그리는 아트는
 *   노드가 없어 **원본 해상도 그대로** 배포됐다(2026-08-27 아이폰 크래시 원인의 절반). 손으로 적는
 *   힌트 표는 사람이 유지해야 하고 표시 크기를 바꾸는 수정과 어긋난다 — 그래서 게임에서 직접 잰다.
 *
 * ⚠️ **못 본 키에는 힌트를 만들지 않는다.** 화면 한 곳을 빠뜨리면 그 아트가 흐려지므로, 이 수집기는
 *   커버리지(본 키 / 전체 키)를 함께 찍는다. 여러 번 돌려도 결과는 **누적**되며 작아지지 않는다.
 *
 * 사용: 같은 폴더에서 `npm run dev`(6209)를 띄운 뒤 `npm run measure:textures`.
 *       `--levels 1,10,21` 로 플레이할 레벨 지정(10 은 클론다이크 보너스 라운드).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
/**
 * 플레이 화면 주행은 **옵트인**(`--play`)이다.
 *   ⚠️ 헤드리스에서 PlayScene 을 띄우면 잘 매달린다(이 레포 공통 함정 — gstack 메모 참조). 홈·팝업 구간은
 *   안정적이고, 코드가 크게 그리는 아트(패널·버튼·카드·이벤트/리그)는 대부분 거기 있다.
 *   플레이 아트를 채우려면 `--play --headed` 로 눈으로 보며 돌리는 편이 확실하다.
 */
const WITH_PLAY = argv.includes('--play');
const LEVELS = WITH_PLAY ? argOf('levels', '1,10').split(',').map((n) => Number(n.trim())).filter(Boolean) : [];
const OUT = 'texture-usage.json';
const SPEED = Number(argOf('speed', '8'));
/** 레벨당 봇을 돌리는 시간(ms) — 완주가 아니라 '그려지게 하는' 것이 목적. */
const SIM_MS = Number(argOf('sim', '25000'));

/** 홈에서 돌아볼 팝업 — [메서드, 라벨]. 인자가 필요한 것은 래퍼로 감싼다. */
const HOME_POPUPS = [
  ['openThiefEvent', '이벤트'],
  ['openLeaderboard', '리더보드'],
  ['openLeague', '리그'],
  ['showCollectionCards', '콜렉션'],
  ['openItemShop', '아이템샵'],
];

const browser = await chromium.launch({ headless: !argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
page.on('pageerror', (e) => console.warn('  ⚠ 페이지 오류:', String(e).slice(0, 120)));

const url = new URL(BASE);
url.searchParams.set('measureTextures', '1');

/*
 * **진행된 세이브를 심고 시작한다.**
 *   초기 세이브(1층·부지1만)로 돌면 위층 건물·2번 부지·상점 아트가 **한 장도 안 그려진다** — 그 키들은
 *   계측되지 않고, 힌트가 없으니 원본 해상도 그대로 배포된다. 실측: 초기 세이브 커버리지 33%.
 *   ⚠️ 여기 필드가 save.ts 와 어긋나면 조용히 초기 상태로 시작한다(로더가 방어적) — 커버리지가
 *      갑자기 떨어지면 이 시드부터 의심할 것.
 */
await page.addInitScript(() => {
  try {
    localStorage.setItem('solitaire_save_v3', JSON.stringify({
      coins: 9_000_000, diamonds: 90_000, level: 40,
      builtFloors: 10, ownedFloors: 10,          // 1번 부지 10층 전부 건설·소유.
      lot1Built: true, lot1Floors: 10,
      lot2Built: true, lot2Floors: 10, lot2Owned: 10, // 2번 부지도 전부.
      playedLevels: Array.from({ length: 40 }, (_, i) => i + 1),
    }));
  } catch { /* 프라이빗 모드 등 — 초기 상태로 진행된다 */ }
});

await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });

const homeReady = () => page.waitForFunction(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const h = g && g.scene.getScene('home');
  return !!(h && h.scene.isActive() && h.sys.isVisible());
}, null, { timeout: 90000 });

await homeReady();
await page.waitForTimeout(3000); // 진입 팝업·연출이 한 번 그려지도록.
console.log('▸ 홈');

// 홈 타워를 위아래로 훑는다 — 층 건물 아트(up_Slitare_Office_*, up_Bank_* 등)를 그리게 한다.
await page.evaluate(async () => {
  const h = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('home');
  const cam = h.cameras.main;
  const y0 = cam.scrollY;
  for (let i = 0; i <= 20; i++) {
    cam.setScroll(cam.scrollX, y0 - i * 300);
    await new Promise((r) => setTimeout(r, 90));
  }
  cam.setScroll(cam.scrollX, y0);
});

for (const [method, label] of HOME_POPUPS) {
  const ok = await page.evaluate(async ({ method }) => {
    const h = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('home');
    if (typeof h[method] !== 'function') return 'no-method';
    const before = h.children.list.length;
    try { h[method](); } catch (e) { return 'error: ' + e; }
    await new Promise((r) => setTimeout(r, 2500)); // 열림 연출(젤리 스케일 피크 포함)을 지나 보낸다.
    for (const o of h.children.list.slice(before)) { try { o.destroy(); } catch {} }
    await new Promise((r) => setTimeout(r, 400));
    return 'ok';
  }, { method });
  console.log(`  ${ok === 'ok' ? '✓' : '·'} ${label}${ok === 'ok' ? '' : ' (' + ok + ')'}`);
}

// 플레이 화면 — 판을 깔고 팝업을 한 번씩 열어 아트를 그리게 한다.
//   ⚠️ **끝까지 플레이하지 않는다.** 헤드리스에서 봇을 완주시키면 잘 멈춘다(이 레포 공통 함정).
//   계측에 필요한 건 "그려졌는가"지 "이겼는가"가 아니다. 모든 단계에 상한을 걸어 절대 매달리지 않게 한다.
/** 어떤 이유로도 매달리지 않게 — 상한을 넘기면 그 단계만 포기한다. */
const cap = async (label, ms, fn) => {
  try {
    return await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error('시간 초과')), ms))]);
  } catch (e) {
    console.log(`  · ${label} 건너뜀 (${String(e.message ?? e).slice(0, 60)})`);
    return null;
  }
};

for (const lv of LEVELS) {
  console.log(`▸ 플레이 L${lv}`);
  const ok = await cap('진입', 60000, async () => {
    await page.evaluate((v) => {
      const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
      g.scene.stop('home');
      g.scene.stop('play');
      g.scene.start('play', { level: v, free: true });
    }, lv);
    await page.waitForFunction(() => {
      const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
      return !!(s && s.scene.isActive() && s.state && s.dealing === false);
    }, null, { timeout: 45000 });
    return true;
  });
  if (!ok) continue;

  // 안내 닫고 배속 — 딜 연출·HUD 가 다 그려지도록 잠깐 둔다.
  await cap('배속', 15000, () => page.evaluate((sp) => {
    const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
    s.tweens.timeScale = sp; s.time.timeScale = sp;
    for (const nm of ['tipCard', 'coach']) {
      const l = s.children.list.find((o) => o.name === nm);
      if (l && l.list[0]) l.list[0].emit('pointerdown');
    }
  }, SPEED));
  await page.waitForTimeout(2500);

  // 플레이 중 팝업 — 한 번씩 열었다 닫는다.
  for (const m of ['openShop', 'openPlayMenu', 'openWeeklyFromPlay', 'openLeagueFromPlay']) {
    await cap(m, 20000, () => page.evaluate(async ({ m }) => {
      const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
      if (!s || !s.scene.isActive() || typeof s[m] !== 'function') return;
      const before = s.children.list.length;
      try { s[m](); } catch {}
      await new Promise((r) => setTimeout(r, 2200)); // 열림 연출(확대 피크) 통과.
      for (const o of s.children.list.slice(before)) { try { o.destroy(); } catch {} }
      await new Promise((r) => setTimeout(r, 300));
    }, { m }));
  }

  // 봇을 잠깐만 돌린다 — 카드 제거·콤보·보상 연출이 그려질 만큼만(완주는 노리지 않는다).
  await cap('시뮬', 15000, () => page.evaluate((sp) => {
    const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
    s.simSpeed = sp; s.startSim();
  }, SPEED));
  await page.waitForTimeout(SIM_MS);
  await cap('시뮬정지', 15000, () => page.evaluate(() => {
    const s = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('play');
    if (s && s.stopSim) s.stopSim(); else if (s) s.simRunning = false;
  }));
}

const res = await page.evaluate(() => (window.__textureUsage ? window.__textureUsage() : null));
await browser.close();

if (!res) {
  console.error('✗ 계측이 설치되지 않았다 — ?measureTextures=1 과 dev 빌드인지 확인할 것');
  process.exit(1);
}

// 이전 계측과 **병합**(최대치 유지) — 한 번에 모든 화면을 못 돌아도 쌓인다.
let prev = { keys: {}, scenes: [] };
if (fs.existsSync(OUT)) { try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {} }
const keys = { ...(prev.keys ?? {}) };
for (const [k, v] of Object.entries(res.keys)) {
  const c = keys[k];
  keys[k] = c ? { w: Math.max(c.w, v.w), h: Math.max(c.h, v.h) } : v;
}
const scenes = [...new Set([...(prev.scenes ?? []), ...res.scenes])].sort();

const manifest = JSON.parse(fs.readFileSync('public/ui-assets.json', 'utf8'));
const unused = new Set(fs.existsSync('unused-assets.json') ? JSON.parse(fs.readFileSync('unused-assets.json', 'utf8')).keys : []);
const wanted = Object.keys(manifest).filter((k) => !unused.has(k));
const seen = wanted.filter((k) => keys[k]);
const missing = wanted.filter((k) => !keys[k]);

fs.writeFileSync(OUT, JSON.stringify({
  _: [
    'texture-usage.json — **생성물**(`npm run measure:textures`). 게임을 돌며 잰 텍스처별 최대 표시 크기(월드 px).',
    '여러 번 돌리면 최대치로 누적된다. 힌트 변환은 `npm run gen:diet-hints`.',
    '⚠️ 여기 없는 키는 이번 주행에서 한 번도 안 그려진 것 — 힌트를 만들면 안 된다(그 화면에서 흐려진다).',
  ],
  scenes, keys,
}, null, 2) + '\n', 'utf8');

console.log(`\n✓ ${OUT} — 관측 ${seen.length}/${wanted.length}장 (${Math.round((seen.length / wanted.length) * 100)}%) · 씬 ${scenes.join(', ')}`);
if (missing.length) console.log(`  미관측 ${missing.length}장 — 상한 없이 남는다(예: ${missing.slice(0, 6).join(', ')})`);
