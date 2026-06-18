/**
 * Popup helpers — 캐주얼 게임 톤 (단순 + 둥근 모서리 + 따뜻한 색상).
 *
 * - 모든 popup 은 HomeScene 위에 overlay 로 launch (scene.launch).
 * - 닫을 때 scene.stop 으로 자기 자신만 제거.
 * - 모서리 둥근 패널/버튼 (Graphics.fillRoundedRect).
 */

import { FONT } from '../config/game.config.js';
import { record, hexColor } from '../dev/uiCapture.js';

const PALETTE = {
  backdrop:    0x000000,        // 화면 덮는 검정 (alpha 0.55)
  panelFill:   0xfff8e7,        // 크림 (따뜻한 패널)
  panelBorder: 0x8b5a3c,        // 따뜻한 갈색
  headerFill:  0xffe5a8,        // 옅은 노랑 (헤더)
  titleText:   '#5a3210',
  bodyText:    '#5a3210',
  hint:        '#a07050',
  closeFill:   0xe74c3c,
  closeStroke: 0xa83025,
  btnPrimary:  0x45c34c,        // 액션 — 녹색
  btnAccent:   0xff9a3c,        // 강조 — 주황
  btnNeutral:  0xfff1c5,        // 비활성/탭 — 옅은 크림
  btnDisabled: 0xd6cbb6,        // 비활성 (회색조)
  cardBg:      0xfff8e7,
  cardBorder:  0xd6a567,
};

const DEPTH = {
  backdrop:  2000,
  panel:     2010,
  body:      2015,
  header:    2020,
  text:      2025,
  button:    2030,
  topText:   2035,
};

const RADIUS = {
  panel:  28,
  card:   18,
  button: 22,
};

// ─── Backdrop ───
export function buildBackdrop(scene, onClose) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const bg = scene.add.rectangle(W / 2, H / 2, W, H, PALETTE.backdrop, 0.55)
    .setOrigin(0.5)
    .setDepth(DEPTH.backdrop)
    .setInteractive();
  bg.on('pointerdown', () => onClose?.());
  return bg;
}

// ─── Panel (둥근 모서리, 따뜻한 색감) ───
export function buildPanel(scene, opts = {}) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const pw = Math.round(W * (opts.wPct ?? 0.92));
  const ph = Math.round(H * (opts.hPct ?? 0.84));
  const cx = W / 2;
  const cy = H / 2;
  const x = cx - pw / 2;
  const y = cy - ph / 2;

  const g = scene.add.graphics().setDepth(DEPTH.panel);
  g.fillStyle(PALETTE.panelFill, 1);
  g.fillRoundedRect(x, y, pw, ph, RADIUS.panel);
  g.lineStyle(4, PALETTE.panelBorder, 1);
  g.strokeRoundedRect(x, y, pw, ph, RADIUS.panel);

  record({ k: 'rect', x: cx, y: cy, w: pw, h: ph, radius: RADIUS.panel,
    fill: hexColor(PALETTE.panelFill), stroke: hexColor(PALETTE.panelBorder), strokeW: 4, name: '패널' });

  return { x, y, w: pw, h: ph, cx, cy };
}

// ─── Header — 타이틀 + 닫기 ───
export function buildHeader(scene, panel, title, onClose, opts = {}) {
  const headerH = opts.height ?? 64;
  const { x, y, w } = panel;

  // 헤더 배경 — 패널 상단 둥근 모서리에 맞춰 클립.
  const g = scene.add.graphics().setDepth(DEPTH.header);
  g.fillStyle(PALETTE.headerFill, 1);
  // 둥근 상단 + 평평한 하단.
  const headerRadius = { tl: RADIUS.panel - 4, tr: RADIUS.panel - 4, bl: 0, br: 0 };
  g.fillRoundedRect(x + 3, y + 3, w - 6, headerH, headerRadius);
  record({ k: 'rect', x: x + w / 2, y: y + 3 + headerH / 2, w: w - 6, h: headerH,
    radius: headerRadius, fill: hexColor(PALETTE.headerFill), stroke: null, strokeW: 0, name: '헤더 배경' });

  // 타이틀
  scene.add.text(x + 28, y + headerH / 2, title, {
    fontFamily: FONT.family,
    fontSize: '28px',
    color: PALETTE.titleText,
    fontStyle: 'bold',
  }).setOrigin(0, 0.5).setDepth(DEPTH.text);
  record({ k: 'text', x: x + 28, y: y + headerH / 2, text: title, fontSize: 28,
    color: PALETTE.titleText, bold: true, fontFamily: FONT.family, ox: 0, oy: 0.5, name: title });

  // X 버튼 — 둥근 원형
  const closeR = 22;
  const closeCx = x + w - closeR - 18;
  const closeCy = y + headerH / 2;
  const closeBg = scene.add.circle(closeCx, closeCy, closeR, PALETTE.closeFill)
    .setStrokeStyle(3, PALETTE.closeStroke)
    .setInteractive({ useHandCursor: true })
    .setDepth(DEPTH.button);
  closeBg.on('pointerdown', () => onClose?.());
  record({ k: 'circle', x: closeCx, y: closeCy, r: closeR, fill: hexColor(PALETTE.closeFill),
    stroke: hexColor(PALETTE.closeStroke), strokeW: 3, name: '닫기' });
  scene.add.text(closeCx, closeCy, '✕', {
    fontFamily: FONT.family,
    fontSize: '20px',
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(DEPTH.topText);
  record({ k: 'text', x: closeCx, y: closeCy, text: '✕', fontSize: 20,
    color: '#ffffff', bold: true, fontFamily: FONT.family, ox: 0.5, oy: 0.5, name: '✕' });

  // 헤더 하단 구분선
  scene.add.rectangle(x + w / 2, y + headerH, w - 16, 2, PALETTE.panelBorder, 1)
    .setDepth(DEPTH.header + 1);
  record({ k: 'rect', x: x + w / 2, y: y + headerH, w: w - 16, h: 2, radius: 0,
    fill: hexColor(PALETTE.panelBorder), stroke: null, strokeW: 0, name: '구분선' });

  return { headerH, bottomY: y + headerH };
}

// ─── Card — 둥근 박스 (간단한 영역 표시용) ───
export function buildCard(scene, x, y, w, h, opts = {}) {
  const fill = opts.fill ?? PALETTE.cardBg;
  const border = opts.border ?? PALETTE.cardBorder;
  const radius = opts.radius ?? RADIUS.card;
  const depth = opts.depth ?? DEPTH.body;

  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(opts.lineWidth ?? 2, border, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  record({ k: 'rect', x: x + w / 2, y: y + h / 2, w, h, radius,
    fill: hexColor(fill), stroke: hexColor(border), strokeW: opts.lineWidth ?? 2,
    name: opts.label ? `박스 ${opts.label}` : '박스' });

  if (opts.label) {
    scene.add.text(x + w / 2, y + h / 2, opts.label, {
      fontFamily: FONT.family,
      fontSize: opts.fontSize ?? '18px',
      color: opts.color ?? PALETTE.bodyText,
      align: 'center',
    }).setOrigin(0.5).setDepth(depth + 1);
    record({ k: 'text', x: x + w / 2, y: y + h / 2, text: opts.label,
      fontSize: parseInt(opts.fontSize ?? '18px', 10) || 18, color: opts.color ?? PALETTE.bodyText,
      bold: false, fontFamily: FONT.family, ox: 0.5, oy: 0.5, name: opts.label });
  }
  return g;
}

// ─── Button — 둥근 모서리 + 그림자처럼 보이는 두꺼운 stroke ───
export function buildButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const fill = opts.fill ?? PALETTE.btnPrimary;
  const stroke = opts.stroke ?? darken(fill, 60);
  const textColor = opts.color ?? '#ffffff';
  const fontSize = opts.fontSize ?? '20px';
  const radius = opts.radius ?? RADIUS.button;
  const depth = opts.depth ?? DEPTH.button;

  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(3, stroke, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  record({ k: 'rect', x: x + w / 2, y: y + h / 2, w, h, radius,
    fill: hexColor(fill), stroke: hexColor(stroke), strokeW: 3, name: `버튼 ${label}` });

  // 클릭 hit-area (사각형 vs 외형이 둥글어도 충분).
  const hit = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0)
    .setDepth(depth + 1)
    .setInteractive({ useHandCursor: true });
  if (onClick) {
    hit.on('pointerdown', () => {
      scene.tweens.add({ targets: hit, scale: 0.95, yoyo: true, duration: 80 });
      onClick();
    });
  }

  scene.add.text(x + w / 2, y + h / 2, label, {
    fontFamily: FONT.family,
    fontSize,
    color: textColor,
    fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(depth + 2);
  record({ k: 'text', x: x + w / 2, y: y + h / 2, text: label,
    fontSize: parseInt(fontSize, 10) || 20, color: textColor, bold: true,
    fontFamily: FONT.family, ox: 0.5, oy: 0.5, name: label });

  return { graphics: g, hit };
}

// ─── Tab Bar — 가로 카테고리 ───
export function buildTabBar(scene, x, y, w, h, tabs, activeIndex = 0, onSelect = null) {
  const count = tabs.length;
  const tabW = (w - (count - 1) * 6) / count;
  const result = [];
  tabs.forEach((label, i) => {
    const tx = x + (tabW + 6) * i;
    const isActive = i === activeIndex;
    const b = buildButton(scene, tx, y, tabW, h, label,
      onSelect ? () => onSelect(i) : null,
      {
        fill:  isActive ? PALETTE.btnAccent : PALETTE.btnNeutral,
        color: isActive ? '#ffffff' : PALETTE.titleText,
        fontSize: '17px',
        radius: 16,
      });
    result.push(b);
  });
  return result;
}

// ─── 텍스트 helper (간단한 라벨/본문) ───
export function buildText(scene, x, y, text, opts = {}) {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT.family,
    fontSize: opts.fontSize ?? '18px',
    color: opts.color ?? PALETTE.bodyText,
    fontStyle: opts.fontStyle ?? 'normal',
    align: opts.align ?? 'left',
  }).setDepth(opts.depth ?? DEPTH.text);
  if (opts.origin) t.setOrigin(opts.origin.x, opts.origin.y);
  record({ k: 'text', x, y, text, fontSize: parseInt(opts.fontSize ?? '18px', 10) || 18,
    color: opts.color ?? PALETTE.bodyText, bold: opts.fontStyle === 'bold', fontFamily: FONT.family,
    ox: opts.origin ? opts.origin.x : 0, oy: opts.origin ? opts.origin.y : 0, name: String(text).slice(0, 14) });
  return t;
}

// 어두운 stroke 색 계산.
function darken(color, amount) {
  const r = Math.max(0, ((color >> 16) & 0xff) - amount);
  const g = Math.max(0, ((color >>  8) & 0xff) - amount);
  const b = Math.max(0, ( color        & 0xff) - amount);
  return (r << 16) | (g << 8) | b;
}

// ─── 다른 active scene 의 input 차단 (팝업 동안) ───
export function blockUnderlyingInput(popupScene) {
  const manager = popupScene.scene.manager;
  const allScenes = manager?.scenes ?? [];
  const disabled = [];
  for (const s of allScenes) {
    if (s === popupScene) continue;
    if (!s?.scene?.isActive?.()) continue;
    if (s.input && s.input.enabled) {
      s.input.enabled = false;
      disabled.push(s);
    }
  }
  popupScene.events.once('shutdown', () => {
    for (const s of disabled) {
      if (s.input) s.input.enabled = true;
    }
  });
}

export { PALETTE, DEPTH, RADIUS };
