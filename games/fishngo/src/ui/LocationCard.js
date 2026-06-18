/**
 * LocationCard.js — 낚시터 카드 = 레이아웃(card-layout.js) 기반 동적 조립.
 *
 * 렌더 코어(renderLayoutInto)와 애니메이션은 @ohdyssey/phaser-ui-editor 패키지로 분리.
 *   이 파일은 게임-특정 노드 렌더러(text override·art·coin·iconRow·starRow·slotRow)를
 *   패키지 레지스트리에 등록하고, buildLocationCard(카드 조립)를 제공한다.
 *
 * 좌표계: 컨테이너 로컬 = 디자인 공간(408×645)의 중심정렬. 노드 (x,y) → 로컬 (x-W/2, y-H/2).
 */

import { strokeText, centerInBox } from './components.js';
import { DEFAULT_LAYOUT } from '../config/card-layout.js';
import { renderLayoutInto, registerNodeRenderers, setDefaultTextBuilder } from '@ohdyssey/phaser-ui-editor';

/**
 * @typedef {Object} LocationCardData
 * @property {string}   title
 * @property {string}   artKey
 * @property {string[]} [fishIcons]
 * @property {number}   [difficulty]
 * @property {number}   [rewardMin]
 * @property {number}   [rewardMax]
 */

// ── 게임 노드 렌더러를 패키지 레지스트리에 등록(모듈 로드 시 1회) ──
//   제네릭(image/spriteAnim/rect/circle/repeater)은 패키지 내장. text 는 게임 바인딩(_bindText)+
//   strokeText 외형을 위해 오버라이드. 나머지는 카드 보상 시각(낚시 게임 전용).
setDefaultTextBuilder(strokeText);   // 패키지 제네릭 text 기본도 게임 strokeText 사용
registerNodeRenderers({
  text: renderText, art: renderArt, coin: renderCoin,
  iconRow: renderIconRow, starRow: renderStarRow, slotRow: renderSlotRow,
});

/** 캐시의 저작 레이아웃 우선, 없으면 기본 레이아웃. */
export function resolveLayout(scene) {
  const authored = scene.cache?.json?.get?.('card_layout');
  return (authored && authored.nodes) ? authored : DEFAULT_LAYOUT;
}

/**
 * 카드 빌드 → Container 반환 (setCardTint 부착). HomeScene 캐러셀이 setScale 로 크기 맞춤.
 * @param {Phaser.Scene} scene @param {number} cx @param {number} cy @param {LocationCardData} data
 */
export function buildLocationCard(scene, cx, cy, data) {
  const layout = resolveLayout(scene);
  const container = scene.add.container(cx, cy);
  container.setSize(layout.frame.designW, layout.frame.designH);
  const { nodeMap, tintTargets, alphaTargets } = renderLayoutInto(scene, container, layout, data);
  container.__nodeMap = nodeMap;   // 게임 애니메이션 재생용(HomeScene이 playLayoutAnims에 전달)
  container.__layout = layout;

  // 비선택/잠금 카드 dim — 이미지/스프라이트/텍스트 = setTint, 코인(Graphics) = alpha.
  container.setCardTint = (tint) => {
    const off = (tint == null || tint === 0xffffff);
    for (const t of tintTargets) { if (off) t.clearTint(); else t.setTint(tint); }
    const red = off ? 255 : (tint >> 16) & 0xff;
    const blue = off ? 255 : tint & 0xff;
    const locked = !off && blue > red + 16;
    for (const g of alphaTargets) g.setAlpha(off ? 1 : (locked ? 0.4 : 0.5));
  };

  // 슬롯 아이템 아이콘 인터랙티브 토글 — HomeScene._applyCardLayout 가 중앙 카드만 on.
  //   사이드 카드 아이콘은 off → 탭이 카드 선택으로 폴스루(topOnly), 사이드 hover 툴팁도 방지.
  container.setSlotsInteractive = (on) => {
    for (const ico of container.__slotIcons || []) {
      if (ico.input) ico.input.enabled = on;
      if (!on && ico.__hideTooltip) ico.__hideTooltip();
    }
  };
  return container;
}

// ── 게임-특정 노드 렌더러 (ctx, node) => GameObject[] ──

function renderText(ctx, node) {
  const { scene, lx, ly, container, tintTargets, data } = ctx;
  const str = _bindText(node, data);
  const ox = node.align === 'left' ? 0 : node.align === 'right' ? 1 : 0.5;
  // 래핑 본문(wrapW)은 "작성 박스"를 node.x 중심으로 둔다 — 줄 정렬(align)은 유지하되 박스만 중앙에.
  //   ⚠ 기존 버그: align:left 면 originX=0 이라 박스 좌측이 node.x(카드 중앙)에 붙어 텍스트가
  //     오른쪽으로 wrapW/2 만큼 넘쳤다(모든 화면). box-left = node.x - wrapW/2 로 보정(좌/우 대칭).
  const boxShift = node.wrapW ? (ox - 0.5) * node.wrapW : 0;
  const t = strokeText(scene, lx(node.x) + boxShift, ly(node.y), str, node.fontSize,
    { color: node.color, strokeColor: node.stroke, strokeWidth: node.strokeW });
  if (node.fontFamily && t.setFontFamily) t.setFontFamily(node.fontFamily);
  if (node.fontStyle && t.setFontStyle) t.setFontStyle(node.fontStyle);
  if (t.setResolution) t.setResolution(3);   // 확대 시 외곽선 선명
  if (node.wrapW && t.setWordWrapWidth) {     // 설명 등 다중행 — 작성 박스 폭에서 줄바꿈
    t.setWordWrapWidth(Math.round(node.wrapW), true);
    if (t.setLineSpacing) t.setLineSpacing(1);
    // 작성 박스 높이(wrapH)가 있으면, 길이가 다른 본문(스테이지별 keyEvent)이 넘치지 않도록 폰트 자동 축소.
    if (node.wrapH && t.setFontSize) {
      let fs = node.fontSize;
      while (fs > 10 && t.height > node.wrapH) { fs -= 1; t.setFontSize(fs); }
    }
  }
  if (node.valign === 'top' || node.valign === 'bottom') {
    t.setOrigin(ox, node.valign === 'top' ? 0 : 1);
  } else {
    centerInBox(t, ox);     // 세로 중앙 + baseline 미세보정
  }
  container.add(t); tintTargets.push(t);
  return [t];
}

function renderArt(ctx, node) {
  const { scene, lx, ly, container, tintTargets, alphaTargets, data } = ctx;
  const out = [];
  const artKey = (node.binding && data?.[node.binding]) || node.key;
  const w = Math.round(node.w), h = Math.round(node.h);
  const rTop = node.topRadius ?? 8, rBot = node.botRadius ?? 22;
  if (artKey && scene.textures.exists(artKey)) {
    const tex = _roundedCoverTexture(scene, artKey, w, h, rTop, rBot);
    const placed = scene.add.image(lx(node.x), ly(node.y), tex).setOrigin(0.5).setDisplaySize(w, h);
    container.add(placed); out.push(placed); tintTargets.push(placed);
  } else {
    const g = scene.add.graphics();   // 빈 이미지 placeholder = 아이보리
    g.fillStyle(0xfff5dc, 1);
    g.fillRoundedRect(lx(node.x) - w / 2, ly(node.y) - h / 2, w, h, { tl: rTop, tr: rTop, br: rBot, bl: rBot });
    container.add(g); out.push(g); alphaTargets.push(g);
  }
  if (node.borderWidth) {
    const bd = scene.add.graphics();
    const borderColor = node.borderColor ?? 0xb8924a;
    bd.lineStyle(node.borderWidth, borderColor, 0.65);
    bd.strokeRoundedRect(lx(node.x) - w / 2, ly(node.y) - h / 2, w, h, { tl: rTop, tr: rTop, br: rBot, bl: rBot });
    container.add(bd); out.push(bd); alphaTargets.push(bd);
  }
  return out;
}

function renderCoin(ctx, node) {
  const { scene, lx, ly, container, tintTargets, alphaTargets } = ctx;
  const key = _coinTexture(scene, node.r);
  if (key) {
    const c = scene.add.image(lx(node.x), ly(node.y), key).setOrigin(0.5);
    container.add(c); tintTargets.push(c); return [c];
  }
  const c = _drawCoin(scene, lx(node.x), ly(node.y), node.r);
  container.add(c); alphaTargets.push(c); return [c];
}

function renderIconRow(ctx, node) {
  const { scene, lx, ly, container, tintTargets, data } = ctx;
  const out = [];
  const keys = (data?.[node.binding] || []).filter((k) => scene.textures.exists(k)).slice(0, node.max ?? 3);
  const items = _rowLayout(keys.length, node.iconH, node.gap, lx(node.x));
  keys.forEach((k, i) => {
    const ico = _iconImage(scene, k, items[i], ly(node.y), node.iconH);
    if (ico) { container.add(ico); out.push(ico); tintTargets.push(ico); }
  });
  return out;
}

function renderStarRow(ctx, node) {
  const { scene, lx, ly, container, tintTargets, data } = ctx;
  const out = [];
  const count = node.count ?? 3;
  const filled = Math.max(0, Math.min(count, data?.[node.binding] ?? count));
  const items = _rowLayout(count, node.starH, node.gap, lx(node.x));
  for (let i = 0; i < count; i++) {
    const k = i < filled ? node.onKey : node.offKey;
    const st = _iconImage(scene, k, items[i], ly(node.y), node.starH);
    if (st) { container.add(st); out.push(st); tintTargets.push(st); }
  }
  return out;
}

function renderSlotRow(ctx, node) {
  const { scene, lx, ly, container, tintTargets, data } = ctx;
  const out = [];
  const count = node.count ?? 4;
  const items = _rowLayout(count, node.slotH, node.gap, lx(node.x));
  const slotItems = data?.slotItems || [];      // 추천 장비 아이콘 키 [낚시줄, 미끼, 릴, 낚시대]
  const slotNames = data?.slotItemNames || [];  // 동일 순서 한글 명칭(마우스오버 툴팁)
  for (let i = 0; i < count; i++) {
    const sl = _iconImage(scene, node.key, items[i], ly(node.y), node.slotH);
    if (sl) { container.add(sl); out.push(sl); tintTargets.push(sl); }
    // 슬롯 프레임 위에 추천 아이템 아이콘 오버레이 — 프레임보다 약간 작게(0.82×) 중앙 배치.
    const itemKey = slotItems[i];
    if (!itemKey || !scene.textures.exists(itemKey)) continue;
    const ico = _iconImage(scene, itemKey, items[i], ly(node.y), node.slotH * 0.82);
    if (!ico) continue;
    container.add(ico); out.push(ico); tintTargets.push(ico);
    // 마우스오버/탭 시 명칭 툴팁 — 아이콘 위쪽에 표시(기본 숨김). 라벨은 container 직접추가(nodeMap 미노출).
    const nm = slotNames[i];
    if (nm) _attachSlotTooltip(ctx, ico, items[i], ly(node.y) - node.slotH * 0.62, nm);
  }
  return out;
}

// 슬롯 아이템 명칭 툴팁 — 아이콘 위 작은 라벨(기본 숨김). 데스크톱=마우스오버, 모바일=탭.
//   라벨은 container 에 직접 추가(애니메이션 nodeMap 에 노출되지 않게 out 미반환).
//   인터랙티브 on/off 는 container.setSlotsInteractive 가 제어(중앙 카드만).
function _attachSlotTooltip(ctx, ico, tx, ty, name) {
  const { scene, container } = ctx;
  const label = strokeText(scene, tx, ty, name, 13,
    { color: '#fff8ec', strokeColor: '#3a1a00', strokeWidth: 4 });
  label.setOrigin(0.5, 1);
  if (label.setResolution) label.setResolution(3);
  if (label.setPadding) label.setPadding(6, 3, 6, 3);
  if (label.setBackgroundColor) label.setBackgroundColor('rgba(28,14,2,0.86)');
  // 긴 명칭이 카드 경계를 넘지 않도록 x 클램프(로컬 좌표, 카드 폭 ±절반).
  const bound = (container.width ? container.width / 2 : 204) - 4;
  const halfW = (label.width || 0) / 2;
  label.setX(Math.max(-bound + halfW, Math.min(bound - halfW, tx)));
  label.setVisible(false);
  container.add(label);

  let tapTimer = null;
  const clearTimer = () => { if (tapTimer) { tapTimer.remove(false); tapTimer = null; } };
  const show = () => { container.bringToTop(label); label.setVisible(true); };
  const hide = () => { if (label.scene) label.setVisible(false); };

  ico.setInteractive({ useHandCursor: true });
  // 데스크톱: 마우스오버/아웃 (모바일 탭 유지 중에는 out 무시).
  ico.on('pointerover', () => { if (!tapTimer) show(); });
  ico.on('pointerout',  () => { if (!tapTimer) hide(); });
  // 모바일: 탭 → 카드 선택으로 전파되지 않게 차단 + 표시 후 1.8초 유지 후 자동 숨김.
  ico.on('pointerdown', (_p, _x, _y, event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    show();
    clearTimer();
    tapTimer = scene.time.delayedCall(1800, () => { tapTimer = null; hide(); });
  });
  // setSlotsInteractive(off) / 카드 파괴 시 즉시 숨김 + 타이머 정리(댕글링 방지).
  ico.__hideTooltip = () => { clearTimer(); hide(); };
  ico.once('destroy', clearTimer);
  (container.__slotIcons || (container.__slotIcons = [])).push(ico);
}

// ── 렌더러/애니메이션 재노출 (기존 import 경로 유지: UiEditorScene·팝업이 여기서 가져감) ──
export { renderLayoutInto } from '@ohdyssey/phaser-ui-editor';
export { playLayoutAnims, stopLayoutAnims, pauseLayoutAnims, resumeLayoutAnims, playAnimForTargets, AnimHandle, ANIM_TYPES } from '@ohdyssey/phaser-ui-editor';

// ─── 헬퍼 ───

function _bindText(node, data) {
  if (node.binding === 'title') return data?.title ?? '낚시터';
  if (node.binding === 'reward') {
    const lo = data?.rewardMin ?? 0, hi = data?.rewardMax ?? lo;
    return hi > lo ? `x ${lo} ~ ${hi}` : `x ${lo}`;
  }
  // 그 외 바인딩(description 등)은 data 에서 일반 조회 — 없으면 노드 작성 텍스트(placeholder).
  if (node.binding && data?.[node.binding] != null) return String(data[node.binding]);
  return node.text ?? '';
}

/** 중앙정렬 행의 각 아이템 중심 x 배열. */
function _rowLayout(n, itemH, gap, cx) {
  const total = n * itemH + (n - 1) * gap;
  const xs = [];
  let x = cx - total / 2 + itemH / 2;
  for (let i = 0; i < n; i++) { xs.push(x); x += itemH + gap; }
  return xs;
}

function _iconImage(scene, key, x, y, targetH) {
  if (!key || !scene.textures.exists(key)) return null;
  const tex = scene.textures.get(key);
  const frameNames = tex.getFrameNames();
  let go;
  if (frameNames.length > 0) go = scene.add.sprite(x, y, key, frameNames[0]).setOrigin(0.5);
  else go = scene.add.image(x, y, key).setOrigin(0.5);
  const src = go.frame ? { width: go.frame.width, height: go.frame.height } : tex.getSourceImage();
  go.setScale(Math.min(targetH / (src.width || 1), targetH / (src.height || 1)));
  return go;
}

function _drawCoin(scene, x, y, r) {
  const g = scene.add.graphics();
  g.fillStyle(0xe8920c, 1); g.fillCircle(x, y, r);
  g.fillStyle(0xf6c945, 1); g.fillCircle(x, y, r * 0.80);
  g.fillStyle(0xfde08a, 1); g.fillCircle(x - r * 0.22, y - r * 0.22, r * 0.30);
  g.lineStyle(Math.max(1, r * 0.12), 0xc06f06, 1); g.strokeCircle(x, y, r * 0.80);
  return g;
}

/** 코인을 캔버스 텍스처로 그려 키 반환(캐시). 이미지라 setTint(dim) 가능. */
function _coinTexture(scene, r) {
  const rr = Math.max(4, Math.round(r));
  const key = `__coin_${rr}`;
  if (scene.textures.exists(key)) return key;
  const size = rr * 2 + 2;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return null;
  const ctx = tex.getContext();
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const fill = (col, radius) => { ctx.beginPath(); ctx.arc(c, c, radius, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); };
  fill('#e8920c', rr);
  fill('#f6c945', rr * 0.80);
  ctx.beginPath(); ctx.arc(c - rr * 0.22, c - rr * 0.22, rr * 0.30, 0, Math.PI * 2); ctx.fillStyle = '#fde08a'; ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, rr * 0.80, 0, Math.PI * 2); ctx.lineWidth = Math.max(1, rr * 0.12); ctx.strokeStyle = '#c06f06'; ctx.stroke();
  tex.refresh();
  return key;
}

// ─── per-corner 둥근 cover-fit 캔버스 텍스처 (상단 각짐/하단 라운드) ───
function _roundedCoverTexture(scene, artKey, w, hh, rTop, rBot) {
  // 슈퍼샘플(SS): 디자인 px(예 ~354) 캔버스에 그대로 구우면 캐러셀 확대 + 캔버스 CSS upscale 로
  //   2배 이상 늘어나 뭉개진다. SS 배(여기 3x)로 구운 뒤 setDisplaySize 로 줄여 표시 → 확대 시 선명.
  const SS = 3;
  const cw = Math.max(1, Math.round(w * SS));
  const ch = Math.max(1, Math.round(hh * SS));
  const key = `__art_${artKey}_${w}x${hh}_t${rTop}_b${rBot}_ss${SS}`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(artKey).getSourceImage();
  const sw = src.width, sh = src.height;
  const canvasTex = scene.textures.createCanvas(key, cw, ch);
  if (!canvasTex) return artKey;
  const ctx = canvasTex.getContext();
  if ('imageSmoothingQuality' in ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
  ctx.clearRect(0, 0, cw, ch);
  _roundRectPathCorners(ctx, 0, 0, cw, ch, { tl: rTop * SS, tr: rTop * SS, br: rBot * SS, bl: rBot * SS });
  ctx.clip();
  const s = Math.max(cw / sw, ch / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  canvasTex.refresh();
  return key;
}

function _roundRectPathCorners(ctx, x, y, w, h, r) {
  const max = Math.min(w, h) / 2;
  const tl = Math.min(r.tl, max), tr = Math.min(r.tr, max);
  const br = Math.min(r.br, max), bl = Math.min(r.bl, max);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}
