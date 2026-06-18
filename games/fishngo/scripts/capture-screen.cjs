/**
 * capture-screen.cjs — 매니페스트(src/config/ui-screens.js) 기반 범용 UI 캡처.
 *
 * 지정한 화면(id)의 captureScene 을 실제로 띄워 현재 렌더된 오브젝트의 지오메트리를 읽고,
 *   public/ui/layouts/<file> 시드 JSON 을 생성한다. 화면마다 별도 스크립트를 쓸 필요 없음.
 *
 * 사용법:  node scripts/capture-screen.cjs <screenId> [baseUrl]
 *   예:    node scripts/capture-screen.cjs home_tabs http://127.0.0.1:5173
 *
 * 좌표 변환(앵커별):
 *   top    : frame 좌표 = 월드 좌표(컨테이너가 (designW/2, designH/2) 고정).
 *   bottom : y_frame = y_world - sh + anchorOffset + designH/2  (컨테이너 (designW/2, sh-anchorOffset)).
 *   center : y_frame = y_world - sh/2 + designH/2.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const r1 = (n) => Math.round(n * 10) / 10;

async function main() {
  const id = process.argv[2];
  const base = process.argv[3] || 'http://127.0.0.1:5173';
  if (!id) { console.error('usage: node scripts/capture-screen.cjs <screenId> [baseUrl]'); process.exit(1); }

  const mod = await import(pathToFileURL(path.resolve(__dirname, '../src/config/ui-screens.js')).href);
  const screen = mod.getScreen(id);
  if (!screen) { console.error(`알 수 없는 화면 id: ${id}. 매니페스트(ui-screens.js)에 먼저 추가하세요.`); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 1440 }, deviceScaleFactor: 2 });
  await page.goto(base + '/?cb=' + Math.floor(Math.random() * 1e6), { waitUntil: 'load' });
  await page.waitForTimeout(8500);

  // 캡처 대상 씬으로 이동(필요 시) — reach.sceneStart.
  if (screen.reach && screen.reach.sceneStart) {
    const { key, data } = screen.reach.sceneStart;
    await page.evaluate(({ key, data }) => window.__game.scene.start(key, data || {}), { key, data: screen.reach.sceneStart.data });
    await page.waitForTimeout(3500);
  }

  // 씬의 모든 렌더 오브젝트를 월드좌표 평탄화(컨테이너 재귀).
  const snap = await page.evaluate((sceneKey) => {
    const scene = window.__game.scene.getScene(sceneKey);
    if (!scene) return { err: 'no scene ' + sceneKey };
    const sh = scene.scale.height, sw = scene.scale.width;
    const all = [];
    (function walk(list) {
      for (const o of list) {
        if (o.list && Array.isArray(o.list)) { walk(o.list); continue; }
        const isText = o.type === 'Text';
        if (!o.texture && !isText) continue;
        const b = o.getBounds ? o.getBounds() : null;
        all.push({
          texKey: o.texture ? o.texture.key : null,
          isText,
          text: isText ? o.text : null,
          cx: b ? b.centerX : o.x, cy: b ? b.centerY : o.y,
          dw: o.displayWidth, dh: o.displayHeight,
          style: isText ? { fontSize: parseInt(o.style.fontSize, 10) || 18, color: o.style.color || '#ffffff', stroke: o.style.stroke || '#000000', strokeThickness: o.style.strokeThickness || 0 } : null,
        });
      }
    })(scene.children.list);
    return { sh, sw, all };
  }, screen.captureScene);
  await browser.close();

  if (snap.err) { console.error('캡처 실패:', snap.err); process.exit(1); }

  const { frame, anchor, capture } = screen;
  const fw = frame.designW, fh = frame.designH;
  const off = screen.anchorOffset ?? 95;
  const toFrameY = (yw) =>
    anchor === 'bottom' ? r1(yw - snap.sh + off + fh / 2)
    : anchor === 'center' ? r1(yw - snap.sh / 2 + fh / 2)
    : r1(yw);                                              // top
  const toFrameX = (xw) => r1(xw);

  const imgs = snap.all.filter((o) => o.texKey);
  const texts = snap.all.filter((o) => o.isText);
  const nodes = [];
  const pickOne = (cands, pick) => {
    if (!cands.length) return null;
    if (pick === 'topmost') return cands.slice().sort((a, b) => a.cy - b.cy)[0];
    if (pick === 'bottommost') return cands.slice().sort((a, b) => b.cy - a.cy)[0];
    if (pick === 'leftmost') return cands.slice().sort((a, b) => a.cx - b.cx)[0];
    if (pick === 'rightmost') return cands.slice().sort((a, b) => b.cx - a.cx)[0];
    return cands[0];
  };
  const imgNode = (o, spec, depth) => ({
    id: spec.id, type: 'image', name: spec.name || spec.id, key: spec.key || o.texKey,
    ...(spec.role ? { role: spec.role } : {}),
    x: toFrameX(o.cx), y: toFrameY(o.cy), w: r1(o.dw), h: r1(o.dh),
    depth, visible: true, tintable: true,
  });
  const txtNode = (o, spec, depth) => ({
    id: spec.id, type: 'text', name: spec.name || spec.id,
    ...(spec.binding ? { binding: spec.binding } : { text: o.text }),
    ...(spec.role ? { role: spec.role } : {}),
    x: toFrameX(o.cx), y: toFrameY(o.cy),
    fontSize: o.style.fontSize, color: o.style.color, stroke: o.style.stroke, strokeW: o.style.strokeThickness,
    align: 'center', depth, visible: true,
  });

  const miss = [];
  // ── 개별 이미지 ──
  for (const spec of (capture.images || [])) {
    const cands = imgs.filter((o) => o.texKey === spec.key);
    const o = pickOne(cands, spec.pick);
    if (o) nodes.push(imgNode(o, spec, 1)); else miss.push('image:' + spec.id);
  }
  // ── 개별 텍스트(contains / near) ──
  for (const spec of (capture.texts || [])) {
    let o = null;
    if (spec.contains) o = texts.find((t) => (t.text || '').toLowerCase().includes(String(spec.contains).toLowerCase()));
    else if (spec.near) o = texts.slice().sort((a, b) => Math.hypot(a.cx - spec.near.x, a.cy - spec.near.y) - Math.hypot(b.cx - spec.near.x, b.cy - spec.near.y))[0];
    if (o) nodes.push(txtNode(o, spec, 2)); else miss.push('text:' + spec.id);
  }
  // ── 반복 행(탭 등) ──
  if (capture.repeat) {
    const R = capture.repeat;
    const tiles = imgs.filter((o) => o.texKey === R.tileKey).slice().sort((a, b) => a.cx - b.cx);
    const n = R.labels ? R.labels.length : tiles.length;
    for (let i = 0; i < n && i < tiles.length; i++) {
      const t = tiles[i];
      nodes.push(imgNode(t, { id: `tab${i}_frame`, key: R.tileKey, role: R.roles && R.roles[i], name: `${R.labels[i]} 타일` }, 1));
      const iconKey = R.iconKeys && R.iconKeys[i];
      if (iconKey) {
        const ic = imgs.filter((o) => o.texKey === iconKey).sort((a, b) => Math.abs(a.cx - t.cx) - Math.abs(b.cx - t.cx))[0];
        if (ic) nodes.push(imgNode(ic, { id: `tab${i}_icon`, key: iconKey, name: `${R.labels[i]} 아이콘` }, 2));
      }
      const lbl = texts.filter((o) => o.text === R.labels[i]).sort((a, b) => Math.abs(a.cx - t.cx) - Math.abs(b.cx - t.cx))[0];
      if (lbl) nodes.push(txtNode(lbl, { id: `tab${i}_label`, name: `${R.labels[i]} 라벨` }, 3));
    }
  }

  const layout = { frame: { designW: fw, designH: fh }, nodes };
  if (anchor === 'bottom') { layout._anchor = 'bottom'; layout._anchorOffset = off; }
  const outPath = path.resolve(__dirname, '..', 'public', screen.file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(layout, null, 2));

  console.log(`[capture] ${id} (${screen.captureScene}, anchor=${anchor}, sh=${snap.sh})`);
  console.log(`  노드 ${nodes.length}개 → public/${screen.file}`);
  if (miss.length) console.log('  ⚠ 미발견:', miss.join(', '), '(스펙의 key/contains/near 확인)');
  else console.log('  누락 없음 ✓');
}
main().catch((e) => { console.error(e); process.exit(1); });
