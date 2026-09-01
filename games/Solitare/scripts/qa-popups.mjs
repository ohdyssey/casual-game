/**
 * qa-popups.mjs — **화면 그룹 팝업 회귀**(이벤트·리그·리더보드).
 *
 * 이 셋은 아트를 부팅에 안 올리고 그룹으로 받는다(ui/assetBudget.ts). 플레이 경로 회귀
 * (qa-play-regression)로는 한 번도 안 타는 코드라 여기서 따로 본다.
 *
 * ⚠️ **헤드리스는 5fps 다.** 여기서 나온 ms 를 실기기 값으로 읽지 말 것 — Phaser 로더는 파일 수와
 *   무관하게 4~6프레임을 쓰므로, 5fps 에서는 1초대로 보이고 60fps 에서는 ~85ms 다. 이 하네스가
 *   보는 것은 **열리는가 · 텍스처가 다 올라오는가**지 속도가 아니다.
 *   (실제로 이 값을 속도로 오해해 설계를 한 번 철회했었다 — 2026-08-27.)
 *
 * 전제: 같은 폴더에서 `npm run dev`(6209).
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:6209/';
const CASES = [
  { group: 'event', method: 'openThiefEvent', label: '이벤트' },
  { group: 'league', method: 'openLeague', label: '리그' },
  { group: 'leaderboard', method: 'openLeaderboard', label: '리더보드' },
];

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 540, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const homeReady = () => page.waitForFunction(() => {
  const g = window.__PHASER_GAME__ || (window.Phaser && Phaser.GAMES && Phaser.GAMES[0]);
  const h = g && g.scene.getScene('home');
  return !!(h && h.scene.isActive() && h.sys.isVisible());
}, null, { timeout: 90000 });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await homeReady();
await page.waitForTimeout(4000); // 진입 연출 + 미리받기가 돌 시간.

let failed = 0;
for (const c of CASES) {
  const r = await page.evaluate(async ({ group, method }) => {
    const g = window.__PHASER_GAME__ || Phaser.GAMES[0];
    const h = g.scene.getScene('home');
    const mod = await import('/src/ui/generated/assetGroups.ts'); // 상수만 읽으므로 인스턴스 무관.
    const keys = mod.ASSET_GROUPS[group].keys;
    const prefetched = keys.every((k) => h.textures.exists(k)); // 미리받기가 됐나
    const before = h.children.list.length;
    try { h[method](); } catch (e) { return { error: String(e) }; }
    /*
     * ⚠️ **로딩 표시를 팝업으로 착각하지 말 것.** 미리받기를 못 맞추면 openWithGroup 이 딤+스피너를
     *   먼저 붙인다(헤드리스는 5fps 라 거의 항상 뜬다). "자식이 늘었다"만 보고 끊으면 아직 로딩 중인
     *   상태에서 판정해 "미로드 N장" 오탐이 난다 — 실제로 그 오탐을 겪었다.
     *   그래서 **텍스처가 다 올라오고 + 그 뒤에도 오브젝트가 남아 있을 때**까지 기다린다.
     */
    /*
     * ⚠️ **딤(로딩 표시)과 팝업을 반드시 구분해서 센다.** 둘 다 "자식이 하나 늘어난 것"이라
     *   개수만 보면 **딤만 뜬 상태를 성공으로 읽는다** — 실제로 그 함정 때문에 "로딩만 걸리고 화면이
     *   안 뜬다"는 신고를 회귀가 못 잡았다(2026-08-29). depth 로 가른다: 팝업 4300 · 로딩딤 4900.
     */
    const countAt = (d) => h.children.list.filter((o) => o.depth === d).length;
    const popupBefore = countAt(4300);
    const t0 = performance.now();
    let veilSeen = false;
    while (performance.now() - t0 < 25000) {
      await new Promise((r) => setTimeout(r, 150));
      if (countAt(4900) > 0) veilSeen = true;
      if (countAt(4300) > popupBefore) break;
    }
    await new Promise((r) => setTimeout(r, 600)); // 딤이 걷히고 팝업이 자리잡을 시간.
    const added = countAt(4300) - popupBefore; // **팝업만** 센다.
    const veilLeft = countAt(4900); // 남아 있으면 딤이 안 걷힌 것.
    const missing = keys.filter((k) => !h.textures.exists(k));
    void veilSeen;
    // 정리: 이번에 붙은 것만 지운다.
    for (const o of h.children.list.filter((o) => o.depth === 4300 || o.depth === 4900)) { try { o.destroy(); } catch {} }
    return { n: keys.length, prefetched, added, missing, veilLeft };
  }, c);

  if (r.error || !r.added || r.missing?.length || r.veilLeft) {
    failed++;
    console.log(`  ✗ ${c.label}: ${r.error ?? `팝업 ${r.added}개 · 미로드 ${r.missing?.length}장 · 안 걷힌 딤 ${r.veilLeft}`}`);
  } else {
    console.log(`  ✓ ${c.label}: ${r.n}장 · 미리받기 ${r.prefetched ? '적중(대기 0)' : '미적중(열 때 로드)'} · 팝업 생성 확인`);
  }
  await page.waitForTimeout(800);
}

// ⚠️ **앱의 전역 손잡이로 읽는다.** 여기서 `import('/src/ui/assetBudget.ts')` 를 하면 다른 모듈
//   인스턴스를 잡아 늘 "상주 0MB" 로 보인다(실측 오탐).
const snap = await page.evaluate(() => (window.__assetBudget ? window.__assetBudget() : null));
await browser.close();
if (snap) console.log(`  상주 ${(snap.bytes / 1048576).toFixed(0)}MB / 예산 ${(snap.budget / 1048576).toFixed(0)}MB · 그룹 [${snap.groups.join(', ')}]`);
else console.log('  ⚠ 예산 스냅샷을 못 읽었다(window.__assetBudget 없음 — dev 빌드인지 확인).');
if (errors.length) { console.log('\n런타임 오류:'); for (const e of errors.slice(0, 5)) console.log('  ! ' + e); }
console.log(failed ? `\n❌ 실패 ${failed}건` : '\n✅ 화면 그룹 팝업 3종 정상');
process.exit(failed ? 1 : 0);
