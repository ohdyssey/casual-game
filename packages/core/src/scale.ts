/**
 * Scale helpers — 피싱 `ui/scale.js` 의 TS 포팅.
 *
 * 모든 UI 이미지는 원본 가로:세로 비율을 유지하며 목표 박스에 contain.
 * 한쪽 축에만 fit 하면 일그러지므로 짧은 축 기준 축소. 기본 maxScale=1(픽셀 흐림 방지).
 */

import type Phaser from 'phaser';

type ImageLike = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

interface ScaleOpts {
  maxScale?: number;
}

function sourceSize(go: ImageLike): { w: number; h: number } {
  const tex = go.texture?.getSourceImage?.() as { width?: number; height?: number } | undefined;
  return {
    w: tex?.width || go.width || 1,
    h: tex?.height || go.height || 1,
  };
}

/** (targetW × targetH) 박스에 contain. 원본 비율 보존. 동일 객체 반환(chain). */
export function fitContain<T extends ImageLike>(go: T, targetW: number, targetH: number, opts: ScaleOpts = {}): T {
  const { maxScale = 1 } = opts;
  const { w, h } = sourceSize(go);
  go.setScale(Math.min(targetW / w, targetH / h, maxScale));
  return go;
}

/** 가로 폭만 기준 (세로는 비율 자동). 좌우로 긴 HUD 막대용. */
export function fitWidth<T extends ImageLike>(go: T, targetW: number, opts: ScaleOpts = {}): T {
  const { maxScale = 1 } = opts;
  const { w } = sourceSize(go);
  go.setScale(Math.min(targetW / w, maxScale));
  return go;
}

/** 세로 높이만 기준 (가로는 비율 자동). */
export function fitHeight<T extends ImageLike>(go: T, targetH: number, opts: ScaleOpts = {}): T {
  const { maxScale = 1 } = opts;
  const { h } = sourceSize(go);
  go.setScale(Math.min(targetH / h, maxScale));
  return go;
}

/** (cx, cy) 중심에 contain 배치 — 가장 자주 쓰는 단축형. */
export function placeContained(
  scene: Phaser.Scene,
  key: string,
  cx: number,
  cy: number,
  targetW: number,
  targetH: number,
  opts: ScaleOpts = {},
): Phaser.GameObjects.Image {
  const img = scene.add.image(cx, cy, key).setOrigin(0.5, 0.5);
  return fitContain(img, targetW, targetH, opts);
}

/** 배경 등 박스를 가득 채우는 cover 배치 (긴 축 넘침 허용). */
export function placeCover(
  scene: Phaser.Scene,
  key: string,
  cx: number,
  cy: number,
  targetW: number,
  targetH: number,
): Phaser.GameObjects.Image {
  const img = scene.add.image(cx, cy, key).setOrigin(0.5, 0.5);
  const { w, h } = sourceSize(img);
  img.setScale(Math.max(targetW / w, targetH / h));
  return img;
}

export interface DisplayBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  w: number;
  h: number;
}

/** 스케일 적용 후 화면상 박스. 다른 요소 정렬용. */
export function getDisplayBounds(go: ImageLike): DisplayBounds {
  const w = go.displayWidth;
  const h = go.displayHeight;
  const left = go.x - w * (go.originX ?? 0.5);
  const top = go.y - h * (go.originY ?? 0.5);
  return { left, right: left + w, top, bottom: top + h, w, h };
}
