/** asset-test.cjs — 에셋 교체(드롭다운 스왑 + 업로드) 검증. */
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:5175/#uieditor', { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  const nodeKey = (id, f = 'key') => page.evaluate(([id, f]) => { const n = window.__game.scene.getScene('UiEditorScene')._node(id); return n ? n[f] : null; }, [id, f]);

  // 1) 드롭다운 스왑: 추천어종 패널(card_panel_a) → card_panel_c.
  await page.click('text=추천어종 패널');
  await page.waitForTimeout(200);
  const before = await nodeKey('panel_a');
  const hasSelect = await page.locator('select[data-asset="key"]').count();
  await page.selectOption('select[data-asset="key"]', 'card_panel_c');
  await page.waitForTimeout(300);
  const afterSwap = await nodeKey('panel_a');

  // 2) 업로드: 기존 webp 파일을 업로드로 교체.
  page.on('filechooser', async (fc) => { await fc.setFiles(path.resolve('public/ui/card/popup_06.webp')); });
  await page.click('button[data-upload="key"]');
  await page.waitForTimeout(2000);
  const afterUpload = await nodeKey('panel_a');

  await browser.close();

  console.log('1) 에셋 드롭다운 존재:', hasSelect > 0 ? '✅' : '❌');
  console.log('   스왑 before:', before, '→ after:', afterSwap, afterSwap === 'card_panel_c' ? '✅' : '❌');
  console.log('2) 업로드 후 node.key:', afterUpload, /^card_up_/.test(afterUpload || '') ? '✅' : '❌');
  // 파일/매니페스트 확인.
  const manifest = JSON.parse(fs.readFileSync('public/card.assets.json', 'utf8'));
  const keys = Object.keys(manifest);
  console.log('   매니페스트 키:', keys);
  const fileOk = keys.length && fs.existsSync(path.resolve('public', manifest[keys[0]]));
  console.log('   업로드 파일 저장됨:', fileOk ? '✅' : '❌');
  console.log(errors.length ? '⚠ 에러:\n' + errors.slice(0, 8).join('\n') : '콘솔 에러 없음 ✓');
}
main().catch((e) => { console.error(e); process.exit(1); });
