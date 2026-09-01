/**
 * qa-league.mjs — **투데이 리그 기간 정산 회귀**.
 *
 * 보는 것: 자정을 넘겨 홈에 들어왔을 때 ① 지난 기간 순위 보상이 **실제로 저장에 남는가**
 *   ② 안내가 **한 번만** 뜨는가 ③ 다시 들어가도 **중복 지급되지 않는가**.
 *
 * 왜 있나(2026-08-30 PO 신고 "어제 리그 5위 했다는게 계속 뜬다"): `HomeScene.create()` 가 앞머리에서
 * 뜬 세이브 스냅샷을 한참 뒤 `writeSave(save)` 로 되쓰는데, 그 사이에 `settleLeagueIfNeeded()` 가
 * 세이브를 바꿨다. 결과가 통째로 되돌아가 **매 진입마다 같은 정산이 다시 일어났고** 보상도 안 남았다.
 * 정산을 `loadSave()` 앞으로 옮겨 고쳤다 — 이 회귀는 그 순서가 되돌아가면 깨진다.
 *
 * ⚠️ 세이브를 심는 시점은 **부팅 뒤**다. 부팅 전에 심으면 1회성 `resetEventsOnce` 가 리그 점수를
 *   먼저 비워 정산 자체가 일어나지 않는다(실측 오탐 — 보상 0으로 읽혔다).
 * ⚠️ 토스트는 금방 사라지므로 **폴링으로** 잡고, **오래 기다린다**. 안내는 `delayedCall(900)` 로
 *   뜨는데 Phaser 씬 시계는 `delta` 고정(16.67ms)이라 헤드리스 5fps 에서는 900ms 가 실제 **~11초**다
 *   (이 레포 공통 함정). 3초만 기다렸다가 "안 뜬다" 로 잘못 읽었다 — 실측 오탐.
 * 전제: 같은 폴더에서 `npm run dev`(6209).
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const h = g && g.scene.getScene('home');
  return !!(h && h.scene.isActive());
}, null, { timeout: 90000 });
await page.waitForTimeout(2500);

let failed = 0;
const say = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };

const r = await page.evaluate(async () => {
  const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
  const rd = () => JSON.parse(localStorage.getItem('solitaire_save_v4') || '{}');
  const enterHome = async () => {
    g.scene.stop('home');
    g.scene.start('home');
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      await new Promise((r) => setTimeout(r, 150));
      const h = g.scene.getScene('home');
      if (h && h.scene.isActive()) return h;
    }
    return g.scene.getScene('home');
  };
  const sawToast = async (h) => {
    // 25초 — 헤드리스 5fps 에서 delayedCall(900) 이 실제로 도는 데 ~11초가 걸린다(위 주석).
    for (let k = 0; k < 170; k++) {
      const texts = [];
      const walk = (l) => l.forEach((o) => { if (o.type === 'Text' && o.text) texts.push(o.text); if (Array.isArray(o.list)) walk(o.list); });
      walk(h.children.list);
      if (texts.some((t) => t.includes('어제 리그'))) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };

  // "어제 40점" 상태를 심는다 — eventResetTag 는 부팅이 이미 채워 놨다(그대로 둔다).
  const s = rd();
  s.coins = 10_000;
  s.leaguePeriodId = (s.leaguePeriodId ?? 0) - 1;
  s.leaguePoints = 40;
  localStorage.setItem('solitaire_save_v4', JSON.stringify(s));
  const before = rd().coins;

  const h1 = await enterHome();
  const toast1 = await sawToast(h1);
  const after1 = { coins: rd().coins, pid: rd().leaguePeriodId, pts: rd().leaguePoints };

  const h2 = await enterHome();
  const toast2 = await sawToast(h2);
  const after2 = rd().coins;

  const h3 = await enterHome();
  const toast3 = await sawToast(h3);
  const after3 = rd().coins;

  return { before, toast1, after1, toast2, after2, toast3, after3 };
});

say(r.toast1 === true, `정산된 진입에서 "어제 리그" 안내가 뜬다 (${r.toast1})`);
say(r.after1.coins > r.before, `순위 보상이 저장에 남는다 (${r.before.toLocaleString()} → ${r.after1.coins.toLocaleString()})`);
say(r.after1.pts === 0, `리그 점수가 0 으로 리셋 (${r.after1.pts})`);
say(r.toast2 === false && r.toast3 === false, `재진입에서는 안내가 다시 안 뜬다 (${r.toast2}/${r.toast3})`);
say(r.after2 === r.after1.coins && r.after3 === r.after1.coins, `재진입해도 보상이 중복 지급되지 않는다 (${r.after3.toLocaleString()})`);

await browser.close();
if (errors.length) { console.log('\n런타임 오류:'); for (const e of errors.slice(0, 5)) console.log('  ! ' + e); }
console.log(failed || errors.length ? `\n❌ 실패 ${failed}건 · 오류 ${errors.length}건` : '\n✅ 리그 정산 정상');
process.exit(failed || errors.length ? 1 : 0);
