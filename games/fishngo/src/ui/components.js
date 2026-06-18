/**
 * 공통 UI 컴포넌트 — 모든 씬에서 import 해 일관된 시각 유지.
 *
 * - strokeText: 흰 글자 + 컬러 외곽선 (어떤 배경에서도 또렷)
 * - getTextResolution: DPR × 캔버스 확대비를 고려한 동적 해상도 (선명도 보장)
 * - capsule: 둥근 캡슐 (그림자 + 본체 + 흰 외곽)
 * - centerInBox: 박스 내 텍스트 수직 중앙 보정 (폰트 baseline 보정)
 */

import { COLORS, FONT, GAME_WIDTH, GAME_HEIGHT } from '../config/game.config.js';

// ─── 텍스트 해상도 ───
// Phaser 의 일부 환경/버전에서 setResolution 큰 값이 텍스트 displaySize 까지
// 확대시키는 문제 발견 → 고정 값 2 로 변경 (선명도와 안정성의 절충).
export function getTextResolution() {
  return 2;
}

// ─── strokeText ───
// 주의: setResolution 호출이 일부 환경에서 텍스트의 displaySize 까지 확대시키는
// 문제가 확인됨 → 호출 자체 제거. 모바일에서 약간 흐릴 수 있지만 사이즈는 정확.
export function strokeText(scene, x, y, text, size = FONT.size.md, opts = {}) {
  const {
    color       = COLORS.textWhite,
    strokeColor = COLORS.textStroke,
    strokeWidth = 4,
  } = opts;
  const txt = scene.add.text(x, y, text, {
    fontFamily: FONT.family,
    fontSize: `${size}px`,
    color,
    fontStyle: 'bold',
    stroke: strokeColor,
    strokeThickness: strokeWidth,
  });
  return txt;
}

// ─── 박스 내 텍스트 수직 중앙 보정 ───
// Phaser Text BB 는 폰트 baseline 메트릭상 descender 영역이 잡혀
// setOrigin(X, 0.5) 만으로 글리프 중심이 박스 중심에 약간 어긋남.
// 0.06 의 미세 보정만 적용해 거의 정확한 시각 중앙을 얻음.
// (이전 0.12 는 너무 강해서 텍스트가 위로 치우쳐 보이는 문제 → 절반으로 완화)
export function centerInBox(textObj, originX = 0.5) {
  textObj.setOrigin(originX, 0.5);
  const fontSize = parseInt(textObj.style.fontSize, 10) || 16;
  textObj.y -= Math.round(fontSize * 0.06);
}

// ─── 둥근 캡슐 ───
const hex = (s) => {
  if (typeof s === 'number') return s;
  return parseInt(String(s).replace('#', ''), 16);
};

export function capsule(scene, x, y, w, h, fillColor, opts = {}) {
  const {
    radius        = Math.min(w, h) / 2,
    outline       = 3,
    outlineColor  = COLORS.textWhite,
    shadowOffset  = 4,
    shadowAlpha   = 0.32,
  } = opts;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, shadowAlpha);
  g.fillRoundedRect(x + 2, y + shadowOffset, w, h, radius);
  g.fillStyle(hex(fillColor), 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(outline, hex(outlineColor), 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  return g;
}

// ─── 그라데이션 배경 (단순 2색) ───
export function gradientFill(scene, x, y, w, h, topColor, bottomColor) {
  const g = scene.add.graphics();
  g.fillGradientStyle(
    hex(topColor), hex(topColor),
    hex(bottomColor), hex(bottomColor),
    1, 1, 1, 1,
  );
  g.fillRect(x, y, w, h);
  return g;
}
