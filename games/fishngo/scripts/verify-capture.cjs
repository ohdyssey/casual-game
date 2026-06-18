/**
 * verify-capture.cjs — 캡처 검증: 실제 게임 씬 vs 에디터에 불러온 캡처 레이아웃을
 *   각각 720×1280 으로 스크린샷해 시각 비교용 이미지를 생성.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.UI_BASE || 'http://localhost:5175';
const OUT = path.resolve(process.cwd(), 'tmp', 'cap');
const TARGETS = [
  { sceneKey: 'UpgradeScene', docId: 'upgrade' },
  { sceneKey: 'ShopScene', docId: 'shop' },
  { sceneKey: 'AlbumScene', docId: 'album' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 }).then((c) => c.newPage());

  // ── 실제 게임 씬 ──
  await page.goto(BASE + '/#home', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.scene && window.__game.scene.isActive('HomeScene'), { timeout: 30000 });
  for (const { sceneKey, docId } of TARGETS) {
    await page.evaluate((k) => window.__game.scene.start(k), sceneKey);
    await page.waitForFunction((k) => window.__game.scene.isActive(k), sceneKey, { timeout: 15000 }).catch(() => {});
    await sleep(sceneKey === 'AlbumScene' ? 1000 : 500);
    await page.screenshot({ path: path.join(OUT, `${docId}_game.png`) });
    await page.evaluate((k) => window.__game.scene.stop(k), sceneKey);
    await sleep(150);
  }

  // ── 에디터에 불러온 캡처 레이아웃 ──
  await page.goto('about:blank');                 // 해시만 다른 URL 은 SPA 가 리로드 안 함 → 강제 새 문서 로드
  await page.goto(BASE + '/#uieditor', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.scene
    && window.__game.scene.isActive('UiEditorScene') && document.querySelector('#uie-panel'), { timeout: 30000 });
  await sleep(500);
  for (const { docId } of TARGETS) {
    await page.evaluate(async (docId) => {
      const sc = window.__game.scene.getScene('UiEditorScene');
      const idx = sc._docs.findIndex((d) => d.id === docId);
      sc._switchDoc(idx);
    }, docId);
    await sleep(900);                 // _fetchDocLayout(서버 파일 로드) 대기
    await page.evaluate(() => { const sc = window.__game.scene.getScene('UiEditorScene'); sc._resetView && sc._resetView(); });
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, `${docId}_editor.png`) });
  }

  await browser.close();
  console.log('스크린샷 생성 →', OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
