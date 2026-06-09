/**
 * 공통 UI 컴포넌트 — 피싱 `ui/components.js` 의 TS 포팅.
 * strokeText(외곽선 텍스트), capsule(둥근 캡슐), centerInBox(baseline 보정).
 */

import type Phaser from 'phaser';
import { COLORS, FONT } from './tokens.js';

interface StrokeTextOpts {
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  bold?: boolean;
}

/** 흰 글자 + 컬러 외곽선 — 어떤 배경에서도 또렷. */
export function strokeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number = FONT.size.md,
  opts: StrokeTextOpts = {},
): Phaser.GameObjects.Text {
  const { color = COLORS.textWhite, strokeColor = COLORS.textStroke, strokeWidth = 4, bold = true } = opts;
  return scene.add.text(x, y, text, {
    fontFamily: FONT.family,
    fontSize: `${size}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
    stroke: strokeColor,
    strokeThickness: strokeWidth,
  });
}

/** 박스 내 텍스트 수직 중앙 보정 (폰트 baseline descender 보정). */
export function centerInBox(textObj: Phaser.GameObjects.Text, originX = 0.5): void {
  textObj.setOrigin(originX, 0.5);
  const fontSize = parseInt(String(textObj.style.fontSize), 10) || 16;
  textObj.y -= Math.round(fontSize * 0.06);
}

function hex(s: string | number): number {
  if (typeof s === 'number') return s;
  return parseInt(String(s).replace('#', ''), 16);
}

interface CapsuleOpts {
  radius?: number;
  outline?: number;
  outlineColor?: string;
  shadowOffset?: number;
  shadowAlpha?: number;
}

/** 둥근 캡슐 (그림자 + 본체 + 흰 외곽) — HUD 뱃지 베이스. */
export function capsule(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor: string | number,
  opts: CapsuleOpts = {},
): Phaser.GameObjects.Graphics {
  const {
    radius = Math.min(w, h) / 2,
    outline = 3,
    outlineColor = COLORS.textWhite,
    shadowOffset = 4,
    shadowAlpha = 0.32,
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
