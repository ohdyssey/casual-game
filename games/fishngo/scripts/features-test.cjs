/** features-test.cjs — 표준 에디터 기능 검증(복제/삭제/undo/마키선택). */
const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:5175/#uieditor', { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  const count = () => page.evaluate(() => window.__game.scene.getScene('UiEditorScene')._layout.nodes.length);
  const selLen = () => page.evaluate(() => window.__game.scene.getScene('UiEditorScene')._selection.length);

  const n0 = await count();
  // 복제: 노드 선택 후 복제 버튼.
  await page.click('text=코인');
  await page.click('button[data-act="dup"]');
  const nDup = await count();
  // undo
  await page.click('button[data-act="undo"]');
  const nUndo = await count();
  // 삭제: 코인 다시 선택 후 삭제.
  await page.click('text=코인');
  await page.click('button[data-act="del"]');
  const nDel = await count();
  // undo 삭제 복원
  await page.click('button[data-act="undo"]');
  const nDelUndo = await count();

  // 마키 선택: 빈 영역 드래그.
  const region = await page.evaluate(() => {
    const g = window.__game, sc = g.scene.getScene('UiEditorScene');
    const rect = g.canvas.getBoundingClientRect(); const rs = rect.width / g.scale.width;
    // 배경 빈 곳(좌측 마진 위쪽)에서 시작해 카드 전체를 덮는 박스로 드래그.
    const a = sc._designToScreen(8, 200), b = sc._designToScreen(400, 630);
    return { x0: rect.left + a.sx * rs, y0: rect.top + a.sy * rs, x1: rect.left + b.sx * rs, y1: rect.top + b.sy * rs };
  });
  await page.mouse.move(region.x0, region.y0); await page.mouse.down();
  await page.mouse.move(region.x1, region.y1, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const marqueeSel = await selLen();

  await browser.close();
  console.log('노드수 기본:', n0);
  console.log('복제 후:', nDup, nDup === n0 + 1 ? '✅' : '❌');
  console.log('복제 undo 후:', nUndo, nUndo === n0 ? '✅' : '❌');
  console.log('삭제 후:', nDel, nDel === n0 - 1 ? '✅' : '❌');
  console.log('삭제 undo 후:', nDelUndo, nDelUndo === n0 ? '✅' : '❌');
  console.log('마키 선택 개수:', marqueeSel, marqueeSel > 3 ? '✅ (다중 박스선택)' : '❌');
  console.log(errors.length ? '⚠ 에러:\n' + errors.slice(0, 8).join('\n') : '콘솔 에러 없음 ✓');
}
main().catch((e) => { console.error(e); process.exit(1); });
