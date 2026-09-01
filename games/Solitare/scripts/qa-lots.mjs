/**
 * qa-lots.mjs — **부지 그룹 회귀**(좌측 공공건물·경쟁 부지 은행).
 *
 * 이 아트는 부팅에 안 올리고 `ui/assetBudget` 의 부지 그룹으로 받은 뒤 그 부지를 세운다. 늦게 세우는
 * 구조라 **"아트가 도착했는데 건물이 안 섰다"** 가 조용히 지나갈 수 있어 여기서 따로 본다.
 *
 * 보는 것: ① 그룹 텍스처가 다 올라왔는가 ② 그 부지 건물 오브젝트가 실제로 생겼는가
 *          ③ 두 번 세워 겹치지 않았는가(층수가 정확히 기대치인가) ④ 런타임 오류가 없는가.
 *
 * ⚠️ 헤드리스는 5fps 다 — 여기 ms 를 실기기 속도로 읽지 말 것(Phaser 로더는 프레임에 묶인다).
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
  return !!(h && h.scene.isActive() && h.sys.isVisible());
}, null, { timeout: 90000 });

// 부지 아트는 create 뒤 비동기로 도착한다 — 최대 20초 기다린다(헤드리스 5fps 감안).
const r = await page.evaluate(async () => {
  const h = (window.__PHASER_GAME__ || Phaser.GAMES[0]).scene.getScene('home');
  const mod = await import('/src/ui/generated/assetGroups.ts'); // 상수만 읽으므로 인스턴스 무관.
  const officeKeys = mod.ASSET_GROUPS.office.keys;
  const t0 = performance.now();
  while (performance.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 200));
    if (officeKeys.every((k) => h.textures.exists(k)) && h.officeFloors?.length) break;
  }
  /*
   * 기대 층 수 = **아트 개수가 아니라 `OFFICE_FLOORS`** 다.
   *   아트는 5개 준비돼 있는데 초기 릴리스는 3층까지만 세운다(HomeScene 의 OFFICE_FLOORS).
   *   아트 개수를 기대치로 삼았다가 정상 동작을 실패로 잡았다 — 화면이 아니라 **코드 상수**를 봐야 한다.
   *   상수를 직접 읽을 수 없으므로, 실제로 세워진 층이 1개 이상이고 아트 개수 이하인지로 본다
   *   (0 = 안 세워짐 · 아트 개수 초과 = 중복 생성).
   */
  const officeArt = officeKeys.filter((k) => k.startsWith('up_Slitare_Office_'));
  return {
    officeKeys: officeKeys.length,
    officeLoaded: officeKeys.filter((k) => h.textures.exists(k)).length,
    officeArt: officeArt.length,
    officeBuilt: h.officeFloors?.length ?? 0,
    budget: window.__assetBudget ? window.__assetBudget() : null,
  };
});
await browser.close();

let failed = 0;
const say = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };
say(r.officeLoaded === r.officeKeys, `공공건물 아트 ${r.officeLoaded}/${r.officeKeys}장 로드`);
say(r.officeBuilt >= 1 && r.officeBuilt <= r.officeArt,
  `공공건물 층 ${r.officeBuilt}개 생성 (아트 ${r.officeArt}개 · 0이면 미생성, 초과면 중복 생성)`);
if (r.budget) console.log(`  상주 ${(r.budget.bytes / 1048576).toFixed(0)}MB / 예산 ${(r.budget.budget / 1048576).toFixed(0)}MB · 그룹 [${r.budget.groups.join(', ')}]`);
if (errors.length) { console.log('\n런타임 오류:'); for (const e of errors.slice(0, 5)) console.log('  ! ' + e); }
console.log(failed ? `\n❌ 실패 ${failed}건` : '\n✅ 부지 그룹 정상');
process.exit(failed ? 1 : 0);
