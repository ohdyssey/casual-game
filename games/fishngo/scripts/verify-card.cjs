/**
 * verify-card.cjs — LocationCard 정밀 검증 (#uilab 다중 모드 캡처).
 *
 * #uilab 을 열어 ① 카드만 ② 카드+레퍼런스50% ③ 레퍼런스만 ④ 카드+분수그리드 를
 *   순서대로 캡처한다. 키 입력은 window 로 dispatch (캔버스 클릭=모드순환 회피).
 *
 * 사용법: node scripts/verify-card.cjs [baseUrl] [outDir] [waitMs]
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

async function main() {
  const base = process.argv[2] || 'http://localhost:5175';
  const outDir = path.resolve(process.argv[3] || 'tmp/card');
  const waitMs = parseInt(process.argv[4] || '6500', 10);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 1440 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(base + '/#uilab', { waitUntil: 'load' });
  await page.waitForTimeout(waitMs);

  // 실제 키 입력 — CDP 로 trusted KeyboardEvent (keyCode 포함) 전송 → Phaser 수신.
  const press = async (key) => { await page.keyboard.press(key); await page.waitForTimeout(450); };

  // 기본 = OVERLAY(카드+레퍼런스50%)
  await page.screenshot({ path: path.join(outDir, '1_overlay.png') });
  // O → REF(레퍼런스만)
  await press('o');
  await page.screenshot({ path: path.join(outDir, '2_reference.png') });
  // O → CARD(카드만)
  await press('o');
  await page.screenshot({ path: path.join(outDir, '3_card.png') });
  // G → 그리드
  await press('g');
  await page.screenshot({ path: path.join(outDir, '4_card_grid.png') });

  await browser.close();
  console.log('캡처 완료 →', outDir);
  if (errors.length) {
    console.log('\n⚠ 콘솔 에러 ' + errors.length + '건:');
    for (const e of errors.slice(0, 20)) console.log('  - ' + e);
  } else { console.log('콘솔 에러 없음 ✓'); }
}

main().catch((e) => { console.error(e); process.exit(1); });
