/** coin-test.cjs — 코인 노드 선택/드래그 검증. node scripts/coin-test.cjs */
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.resolve('tmp/coin');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:5175/#uieditor', { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  // 코인 레이어 선택.
  await page.click('text=코인');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'coin_selected.png') });

  // 선택 후 X/Y 입력이 보이는지 + 값.
  const x0 = await page.inputValue('input[data-k="x"]').catch(() => null);
  const y0 = await page.inputValue('input[data-k="y"]').catch(() => null);

  // 캔버스에서 코인을 드래그(scene 내부 좌표 직접 호출) — 씬의 코인 화면좌표 계산 후 마우스 드래그.
  const cinfo = await page.evaluate(() => {
    const g = window.__game; const sc = g.scene.getScene('UiEditorScene');
    if (!sc || !sc._nodeScreenBounds) return null;
    const b = sc._nodeScreenBounds('bar.coin');
    const rect = g.canvas.getBoundingClientRect();
    const rs = rect.width / g.scale.width;   // design→css px
    return { cx: rect.left + (b.x + b.width / 2) * rs, cy: rect.top + (b.y + b.height / 2) * rs,
      nodeX: sc._node('bar.coin').x, nodeY: sc._node('bar.coin').y };
  });

  if (cinfo) {
    await page.mouse.move(cinfo.cx, cinfo.cy);
    await page.mouse.down();
    await page.mouse.move(cinfo.cx - 60, cinfo.cy - 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: path.join(OUT, 'coin_dragged.png') });

  const after = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('UiEditorScene');
    const n = sc._node('bar.coin'); return { x: n.x, y: n.y };
  });

  await browser.close();
  console.log('코인 선택 후 속성 X/Y:', x0, '/', y0);
  console.log('드래그 전:', cinfo ? `(${Math.round(cinfo.nodeX)},${Math.round(cinfo.nodeY)})` : 'N/A');
  console.log('드래그 후:', `(${Math.round(after.x)},${Math.round(after.y)})`);
  const moved = cinfo && (Math.abs(after.x - cinfo.nodeX) > 5 || Math.abs(after.y - cinfo.nodeY) > 5);
  console.log(moved ? '✅ 코인 드래그 이동 작동' : '❌ 코인 이동 안됨');
  if (errors.length) errors.slice(0, 8).forEach((e) => console.log('  ⚠ ' + e));
}
main().catch((e) => { console.error(e); process.exit(1); });
