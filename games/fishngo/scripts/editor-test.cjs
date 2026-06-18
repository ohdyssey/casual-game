/**
 * editor-test.cjs — UI 저작도구 통합 검증 (선택→편집→저장→파일반영).
 * node scripts/editor-test.cjs
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.resolve('tmp/ed');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));

  await page.goto('http://localhost:5175/#uieditor', { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  // 1) 레이어 "헤더 배너" 선택 (DOM).
  await page.click('text=헤더 배너');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 't1_selected.png') });

  // 선택 후 속성 X 값 읽기.
  const xBefore = await page.inputValue('input[data-k="x"]').catch(() => null);

  // 2) Y 속성을 +40 변경.
  const yInput = page.locator('input[data-k="y"]');
  const yBefore = parseFloat(await yInput.inputValue());
  await yInput.fill(String(yBefore - 40));
  await yInput.dispatchEvent('input');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 't2_moved.png') });

  // 3) 저장.
  await page.click('button[data-act="save"]');
  await page.waitForTimeout(800);
  const status = await page.textContent('#uie-status').catch(() => '');

  // 4) 서버 파일 확인.
  const fileRaw = await page.evaluate(async () => {
    const r = await fetch('/__ui_layout', { cache: 'no-store' }); return r.text();
  });

  await browser.close();

  const layout = JSON.parse(fileRaw);
  const header = layout.nodes.find((n) => n.id === 'header');
  console.log('선택 전 X:', xBefore, '/ Y before:', yBefore);
  console.log('저장 상태:', status);
  console.log('저장된 header.y:', header?.y, '(기대: ' + (yBefore - 40) + ')');
  console.log(Math.abs(header.y - (yBefore - 40)) < 1 ? '✅ 저장 반영 확인' : '❌ 저장 반영 안됨');
  if (errors.length) { console.log('\n⚠ 콘솔 에러:'); errors.slice(0, 10).forEach((e) => console.log('  - ' + e)); }
  else console.log('콘솔 에러 없음 ✓');
}
main().catch((e) => { console.error(e); process.exit(1); });
