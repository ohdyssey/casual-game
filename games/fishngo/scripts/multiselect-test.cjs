/** multiselect-test.cjs — 다중선택(Shift)·그룹이동·정렬 검증. node scripts/multiselect-test.cjs */
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.resolve('tmp/ms');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:5175/#uieditor', { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  const selLen = () => page.evaluate(() => window.__game.scene.getScene('UiEditorScene')._selection.length);
  const designLefts = (ids) => page.evaluate((ids) => {
    const sc = window.__game.scene.getScene('UiEditorScene');
    return ids.map((id) => { const b = sc._nodeDesignBounds(id); return b ? Math.round(b.left * 10) / 10 : null; });
  }, ids);

  // 1) 단일 → Shift 다중 선택 (3개 라벨).
  await page.click('text=추천어종 라벨');
  await page.click('text=난이도 라벨', { modifiers: ['Shift'] });
  await page.click('text=보상 라벨', { modifiers: ['Shift'] });
  await page.waitForTimeout(300);
  const n1 = await selLen();
  await page.screenshot({ path: path.join(OUT, '1_multiselect.png') });

  // 2) 좌측 정렬 → 세 노드 left 동일해야.
  const before = await designLefts(['panel_a.label', 'panel_b.label', 'bar.label']);
  await page.click('button[data-align="left"]');
  await page.waitForTimeout(300);
  const after = await designLefts(['panel_a.label', 'panel_b.label', 'bar.label']);
  await page.screenshot({ path: path.join(OUT, '2_aligned_left.png') });

  // 3) 그룹 이동: 캔버스에서 한 노드 드래그 → 셋 다 같은 delta 이동.
  const move = await page.evaluate(() => {
    const g = window.__game, sc = g.scene.getScene('UiEditorScene');
    const ids = sc._selection.slice();
    const before = ids.map((id) => ({ id, x: sc._node(id).x, y: sc._node(id).y }));
    const b = sc._nodeScreenBounds(ids[0]);
    const rect = g.canvas.getBoundingClientRect();
    const rs = rect.width / g.scale.width;
    return { before, cx: rect.left + (b.x + b.width / 2) * rs, cy: rect.top + (b.y + b.height / 2) * rs };
  });
  await page.mouse.move(move.cx, move.cy); await page.mouse.down();
  await page.mouse.move(move.cx + 40, move.cy + 25, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const movedAll = await page.evaluate((before) => {
    const sc = window.__game.scene.getScene('UiEditorScene');
    return before.map((b) => { const n = sc._node(b.id); return { id: b.id, dx: Math.round((n.x - b.x) * 10) / 10, dy: Math.round((n.y - b.y) * 10) / 10 }; });
  }, move.before);

  await browser.close();

  console.log('1) Shift 다중선택 개수:', n1, n1 === 3 ? '✅' : '❌');
  console.log('2) 좌측정렬 before lefts:', before, '→ after:', after);
  const aligned = after.every((v) => Math.abs(v - after[0]) < 1.0);
  console.log('   세 노드 left 동일:', aligned ? '✅' : '❌');
  console.log('3) 그룹이동 각 노드 delta:', JSON.stringify(movedAll));
  const sameDelta = movedAll.every((m) => Math.abs(m.dx - movedAll[0].dx) < 0.5 && Math.abs(m.dy - movedAll[0].dy) < 0.5) && Math.abs(movedAll[0].dx) > 5;
  console.log('   셋 다 같은 delta 이동:', sameDelta ? '✅' : '❌');
  if (errors.length) errors.slice(0, 8).forEach((e) => console.log('  ⚠ ' + e));
  else console.log('콘솔 에러 없음 ✓');
}
main().catch((e) => { console.error(e); process.exit(1); });
