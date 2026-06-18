/**
 * capture-ui.cjs — "현재 게임에 적용된 UI" 캡처 → UI 저작도구 레이아웃으로 저장.
 *
 * 두 가지 캡처 모드:
 *   sink  — 강화/상점/도감: ui/popup.js 빌더에 심은 캡처 싱크(src/dev/uiCapture.js)로
 *           도형/텍스트를 기록 + display-list 에서 이미지 수집. scene.start 로 전환.
 *   walk  — 아이템 팝업(미끼/낚시줄/릴/낚시대 = ItemPopupScene): 컨테이너를 재귀 순회하며
 *           Image/Text + _roundRect 가 태깅한 Graphics(__capRect) 를 "그리는 순서대로" 수집.
 *           scene.launch({slot}) 오버레이로 띄움.
 *
 * 사전조건: dev 서버 실행 중(http://localhost:5175). 저장은 기존 /__ui_layout 엔드포인트 재사용.
 * 실행: node scripts/capture-ui.cjs   (다른 포트: UI_BASE=http://localhost:5176 node scripts/capture-ui.cjs)
 */
const { chromium } = require('playwright');

const BASE = process.env.UI_BASE || 'http://localhost:5175';
const TARGETS = [
  { sceneKey: 'UpgradeScene', docId: 'upgrade', name: '강화', mode: 'sink' },
  { sceneKey: 'ShopScene',    docId: 'shop',    name: '상점', mode: 'sink' },
  { sceneKey: 'AlbumScene',   docId: 'album',   name: '도감', mode: 'sink' },
  { sceneKey: 'ItemPopupScene', docId: 'bait', name: '미끼 팝업', mode: 'walk', slot: 'bait' },
  { sceneKey: 'ItemPopupScene', docId: 'line', name: '낚시줄 팝업', mode: 'walk', slot: 'line' },
  { sceneKey: 'ItemPopupScene', docId: 'reel', name: '릴 팝업', mode: 'walk', slot: 'reel' },
  { sceneKey: 'ItemPopupScene', docId: 'rod',  name: '낚시대 팝업', mode: 'walk', slot: 'rod' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 }).then((c) => c.newPage());
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  console.log('▶ 부팅 대기…');
  await page.goto(BASE + '/#home', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__uiCapture && window.__game.scene
    && window.__game.scene.isActive('HomeScene'), { timeout: 30000 });
  console.log('  부팅 완료 (HomeScene active)');

  const results = [];
  for (const { sceneKey, docId, name, mode, slot } of TARGETS) {
    // 캡처 시작 + 씬 띄우기 (sink=start / walk=launch overlay).
    await page.evaluate(({ sceneKey, mode, slot }) => {
      window.__uiCapture.beginCapture();
      if (mode === 'walk') window.__game.scene.run(sceneKey, { slot, parentSceneKey: 'NoParent' });   // overlay-style start
      else window.__game.scene.start(sceneKey);
    }, { sceneKey, mode, slot });
    await page.waitForFunction((k) => window.__game.scene.isActive(k), sceneKey, { timeout: 15000 }).catch(() => {});
    await sleep(sceneKey === 'AlbumScene' ? 900 : 500);

    const layout = await page.evaluate(({ sceneKey, docId, mode }) => {
      const rnd = (v) => Math.round(v * 100) / 100;
      const famNorm = (f) => (f || 'Jua').split(',')[0].replace(/["']/g, '').trim() || 'Jua';
      const scene = window.__game.scene.getScene(sceneKey);
      const nodes = [];
      let i = 0;

      if (mode === 'walk') {
        // 컨테이너 재귀 — 그리는 순서대로 Image/Text/태깅Graphics 수집(중심좌표, 720×1280 절대).
        const descs = [];
        const walk = (list) => {
          for (const o of (list || [])) {
            if (o.type === 'Container') { walk(o.list); continue; }
            if (o.__capRect) {
              const c = o.__capRect;
              descs.push({ k: 'rect', x: c.x, y: c.y, w: c.w, h: c.h, radius: c.radius, fill: c.fill || null, fillAlpha: c.fillAlpha ?? 1, stroke: c.stroke || null, strokeW: c.strokeW ?? 0, name: '도형' });
            } else if ((o.type === 'Image' || o.type === 'Sprite') && o.texture && o.texture.key && o.texture.key.indexOf('__') !== 0) {
              if (o.displayWidth <= 2 && o.displayHeight <= 2) continue;        // 투명 히트영역 등 제외
              descs.push({ k: 'image', x: o.x, y: o.y, w: o.displayWidth, h: o.displayHeight, key: o.texture.key, name: o.texture.key });
            } else if (o.type === 'Text' && String(o.text || '').trim()) {
              const s = o.style || {};
              descs.push({ k: 'text', x: o.x, y: o.y, text: o.text, fontSize: parseInt(s.fontSize, 10) || 18,
                color: s.color || '#ffffff', stroke: s.stroke || '#000000', strokeW: s.strokeThickness || 0,
                fontFamily: famNorm(s.fontFamily), bold: String(s.fontStyle || '').includes('bold'),
                ox: o.originX, oy: o.originY, name: String(o.text).slice(0, 14) });
            }
          }
        };
        const top = ((scene.children && scene.children.list) || []).slice().sort((a, b) => (a.depth || 0) - (b.depth || 0));
        walk(top);
        for (const d of descs) {
          const depth = 10 + i, id = `${docId}_${i}`; i++;
          if (d.k === 'rect') nodes.push({ id, type: 'rect', name: d.name, x: rnd(d.x), y: rnd(d.y), w: rnd(d.w), h: rnd(d.h), radius: d.radius ?? 0, fill: d.fill, fillAlpha: d.fillAlpha, stroke: d.stroke, strokeW: d.strokeW, depth, visible: true });
          else if (d.k === 'image') nodes.push({ id, type: 'image', name: d.name, x: rnd(d.x), y: rnd(d.y), w: rnd(d.w), h: rnd(d.h), key: d.key, depth, visible: true, tintable: true });
          else if (d.k === 'text') {
            const align = d.ox === 0 ? 'left' : d.ox === 1 ? 'right' : 'center';
            const valign = d.oy === 0 ? 'top' : d.oy === 1 ? 'bottom' : 'middle';
            nodes.push({ id, type: 'text', name: d.name, x: rnd(d.x), y: rnd(d.y), text: d.text, fontSize: d.fontSize, color: d.color, stroke: d.stroke, strokeW: d.strokeW, fontFamily: d.fontFamily, fontStyle: d.bold ? 'bold' : 'normal', align, valign, depth, visible: true });
          }
        }
        return { frame: { designW: 720, designH: 1280 }, nodes, _images: nodes.filter((n) => n.type === 'image').length };
      }

      // sink 모드 — 빌더 싱크(rect/text) + display-list 이미지.
      const desc = window.__uiCapture.endCapture();
      const images = [];
      for (const o of ((scene.children && scene.children.list) || [])) {
        const tk = o.texture && o.texture.key;
        if ((o.type === 'Image' || o.type === 'Sprite') && tk && tk.indexOf('__') !== 0) images.push({ x: o.x, y: o.y, w: o.displayWidth, h: o.displayHeight, key: tk });
      }
      for (const d of desc) {
        const depth = 10 + i, id = `${docId}_${i}`; i++;
        if (d.k === 'rect') nodes.push({ id, type: 'rect', name: d.name || '박스', x: rnd(d.x), y: rnd(d.y), w: rnd(d.w), h: rnd(d.h), radius: d.radius ?? 0, fill: d.fill || null, stroke: d.stroke || null, strokeW: d.strokeW ?? 0, depth, visible: true });
        else if (d.k === 'circle') nodes.push({ id, type: 'circle', name: d.name || '원', x: rnd(d.x), y: rnd(d.y), r: rnd(d.r), fill: d.fill || null, stroke: d.stroke || null, strokeW: d.strokeW ?? 0, depth, visible: true });
        else if (d.k === 'text') {
          const align = d.ox === 0 ? 'left' : d.ox === 1 ? 'right' : 'center';
          const valign = d.oy === 0 ? 'top' : d.oy === 1 ? 'bottom' : 'middle';
          const fam = (d.fontFamily || 'Jua').split(',')[0].replace(/["']/g, '').trim() || 'Jua';
          nodes.push({ id, type: 'text', name: d.name || d.text || '텍스트', x: rnd(d.x), y: rnd(d.y), text: d.text, fontSize: d.fontSize, color: d.color, stroke: '#000000', strokeW: 0, fontFamily: fam, fontStyle: d.bold ? 'bold' : 'normal', align, valign, depth, visible: true });
        }
      }
      images.forEach((im, j) => nodes.push({ id: `${docId}_img_${j}`, type: 'image', name: im.key, x: rnd(im.x), y: rnd(im.y), w: rnd(im.w), h: rnd(im.h), key: im.key, depth: 1000 + j, visible: true, tintable: true }));
      return { frame: { designW: 720, designH: 1280 }, nodes, _images: images.length };
    }, { sceneKey, docId, mode });

    const file = `ui/layouts/${docId}.json`;
    const saveRes = await page.evaluate(async ({ file, layout }) => {
      const r = await fetch('/__ui_layout?file=' + encodeURIComponent(file), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout),
      });
      return r.json();
    }, { file, layout: { frame: layout.frame, nodes: layout.nodes } });

    await page.evaluate((k) => window.__game.scene.stop(k), sceneKey);
    await sleep(120);
    const counts = layout.nodes.reduce((a, n) => { a[n.type] = (a[n.type] || 0) + 1; return a; }, {});
    results.push({ name, docId, total: layout.nodes.length, counts, images: layout._images, save: saveRes });
    console.log(`  ✓ ${name}(${docId}) [${mode}]: ${layout.nodes.length}노드`, JSON.stringify(counts),
      `이미지 ${layout._images} → ${saveRes.ok ? 'saved ' + saveRes.file : 'SAVE FAIL ' + (saveRes.error || '')}`);
  }

  console.log('\n=== 캡처 요약 ===');
  for (const r of results) console.log(`${r.name}: ${r.total}노드 ${JSON.stringify(r.counts)} (저장 ${r.save.ok ? 'OK' : 'FAIL'})`);
  console.log('콘솔 에러:', errors.length ? errors.slice(0, 10) : '없음');

  await browser.close();
  process.exit(results.every((r) => r.save.ok) && !errors.some((e) => /glTexture|Cannot read/.test(e)) ? 0 : 1);
}

main().catch((e) => { console.error('하니스 실패:', e); process.exit(1); });
