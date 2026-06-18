/**
 * Scale helpers — 모든 UI 이미지는 원본 가로:세로 비율을 유지하면서
 * 목표 박스에 맞게 축소합니다 (확대는 가능하지만 픽셀 흐림 방지 차원에서
 * 기본적으로 maxScale=1 로 제한).
 *
 * 핵심 원칙
 *   - 한쪽 축에만 fit 하면 일그러지므로, "contain" 방식으로 짧은 축에 맞춰
 *     축소 → 원본 비율 그대로.
 *   - 위치는 (x, y) 가 중심 좌표가 되도록 setOrigin(0.5).
 *   - 반환 객체는 Phaser GameObject (Image / Sprite) 그대로 — 추가 조작 자유.
 */

/**
 * 이미지/스프라이트를 (targetW × targetH) 박스에 contain 방식으로 맞춥니다.
 * 원본 비율은 보존하고 가로/세로 중 더 큰 쪽이 박스에 닿도록 축소.
 *
 * @param {Phaser.GameObjects.Image} go         - 이미 add 된 이미지/스프라이트
 * @param {number}                   targetW    - 목표 박스 너비
 * @param {number}                   targetH    - 목표 박스 높이
 * @param {{ maxScale?: number }}    [opts]
 * @returns {Phaser.GameObjects.Image}          - 동일 객체 반환 (chain 용)
 */
export function fitContain(go, targetW, targetH, opts = {}) {
  const { maxScale = 1 } = opts;
  const tex = go.texture?.getSourceImage?.() || { width: go.width, height: go.height };
  const sw = tex.width  || go.width  || 1;
  const sh = tex.height || go.height || 1;
  const s = Math.min(targetW / sw, targetH / sh, maxScale);
  go.setScale(s);
  return go;
}

/**
 * 가로 폭만 기준으로 맞춥니다 (세로는 비율에 따라 자동).
 * 좌우로 길게 늘어선 HUD 막대처럼 "가로폭은 고정, 세로는 비율대로"가 필요할 때.
 */
export function fitWidth(go, targetW, opts = {}) {
  const { maxScale = 1 } = opts;
  const tex = go.texture?.getSourceImage?.() || { width: go.width, height: go.height };
  const sw = tex.width || go.width || 1;
  const s = Math.min(targetW / sw, maxScale);
  go.setScale(s);
  return go;
}

/**
 * 세로 높이만 기준으로 맞춥니다 (가로는 비율에 따라 자동).
 */
export function fitHeight(go, targetH, opts = {}) {
  const { maxScale = 1 } = opts;
  const tex = go.texture?.getSourceImage?.() || { width: go.width, height: go.height };
  const sh = tex.height || go.height || 1;
  const s = Math.min(targetH / sh, maxScale);
  go.setScale(s);
  return go;
}

/**
 * 이미지를 중심점 (cx, cy) 에 배치하고 contain 으로 크기 조정.
 * 가장 자주 쓰는 형태 — addCentered → fitContain 의 단축형.
 *
 * @returns {Phaser.GameObjects.Image}
 */
export function placeContained(scene, key, cx, cy, targetW, targetH, opts = {}) {
  const img = scene.add.image(cx, cy, key);
  img.setOrigin(0.5, 0.5);
  return fitContain(img, targetW, targetH, opts);
}

/**
 * 가로폭만 맞춰 (cx, cy) 에 배치. 좌우로 긴 HUD/패널에 사용.
 */
export function placeByWidth(scene, key, cx, cy, targetW, opts = {}) {
  const img = scene.add.image(cx, cy, key);
  img.setOrigin(0.5, 0.5);
  return fitWidth(img, targetW, opts);
}

/**
 * 세로 높이만 맞춰 (cx, cy) 에 배치.
 */
export function placeByHeight(scene, key, cx, cy, targetH, opts = {}) {
  const img = scene.add.image(cx, cy, key);
  img.setOrigin(0.5, 0.5);
  return fitHeight(img, targetH, opts);
}

/**
 * 이미지의 화면상 (스케일 적용 후) 박스를 반환.
 * 다른 요소를 이 이미지의 가장자리에 맞춰 정렬할 때 유용.
 *
 * @returns {{ left:number, right:number, top:number, bottom:number, w:number, h:number }}
 */
export function getDisplayBounds(go) {
  const w = go.displayWidth;
  const h = go.displayHeight;
  const ox = go.originX ?? 0.5;
  const oy = go.originY ?? 0.5;
  const left = go.x - w * ox;
  const top  = go.y - h * oy;
  return { left, right: left + w, top, bottom: top + h, w, h };
}
