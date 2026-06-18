/**
 * shot.cjs — UI 정밀 검증: 자동 스크린샷 도구 (Playwright).
 *
 * dev 서버의 특정 해시 화면을 캡처한다. #uilab(검증 하니스) 등 정적 UI 화면을
 *   레퍼런스와 픽셀 단위로 비교할 때 사용. (정밀제작 기법 verify 루프)
 *
 * 사용법:
 *   node scripts/shot.cjs <url> <out.png> [waitMs] [W H]
 *   node scripts/shot.cjs http://localhost:5175/#uilab tmp/uilab.png 6000 760 1400
 *
 * 비고: LoadingScene 최소 표시 3초 → waitMs 기본 6500.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

async function main() {
  const url = process.argv[2] || 'http://localhost:5175/#uilab';
  const out = path.resolve(process.argv[3] || 'tmp/shot.png');
  const waitMs = parseInt(process.argv[4] || '6500', 10);
  const vw = parseInt(process.argv[5] || '760', 10);
  const vh = parseInt(process.argv[6] || '1400', 10);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: out });
  await browser.close();

  console.log('스크린샷 저장:', out);
  if (errors.length) {
    console.log('\n⚠ 콘솔 에러 ' + errors.length + '건:');
    for (const e of errors.slice(0, 15)) console.log('  - ' + e);
  } else {
    console.log('콘솔 에러 없음 ✓');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
