/**
 * shapeMask — 도형(rect/circle/polygon)을 GeometryMask 로 만들어 대상(스프라이트/이미지/클립)을 "도형 모양으로
 *   정확히 클립"한다. Phaser 3.x(3.90 포함) · 4 공용. (전광판 = 도형 안 애니가 도형 밖으로 새지 않게)
 *
 *   ⚠ 핵심: Phaser 3 GeometryMask 는 **마스크 그래픽스의 자기(월드) 변환**으로 클립한다(대상의 부모/컨테이너
 *     변환을 상속하지 않음). 따라서 마스크 도형을 **대상과 같은 월드좌표**에 그려야 정확히 클립된다. 로컬(0,0)
 *     에 그리거나 컨테이너 스케일을 빼먹으면 마스크가 엉뚱한 곳에 생겨 콘텐츠가 도형 밖으로 새 보인다.
 *
 *   - 컨테이너 없이 월드좌표로 배치하는 게임(예: Homerun layoutLoader)은 worldShape 만 넘기면 됨(단순·정확).
 *   - 컨테이너(팬/줌·스케일) 안에 배치하는 경우는 baseTransform(컨테이너 worldTransformMatrix)을 함께 넘겨
 *     도형좌표를 월드로 베이크한다.
 *
 *   설계: docs/SERVER_TOOL_PLAN.md 무관 — 렌더 공유 유틸. 에디터 addShapeMedia(renderLayoutInto)의 정수를 게임용으로 분리.
 */

const D2R = Math.PI / 180;

/** points(중심 기준 오프셋) → 월드 절대좌표 배열. cx,cy=도형 중심(월드), angleDeg=회전. (순수) */
export function polygonWorldPoints(cx, cy, points, angleDeg = 0) {
  const a = (angleDeg || 0) * D2R, cos = Math.cos(a), sin = Math.sin(a);
  const out = [];
  for (const p of (points || [])) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    out.push(a ? { x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }
      : { x: cx + p.x, y: cy + p.y });
  }
  return out;
}

/** 사각형 4꼭지점(중심 기준) → 월드좌표. (순수) */
export function rectWorldPoints(cx, cy, w, h, angleDeg = 0) {
  const hw = (w || 0) / 2, hh = (h || 0) / 2;
  return polygonWorldPoints(cx, cy, [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }], angleDeg);
}

/**
 * 도형 모양의 마스크 Graphics(월드좌표, 디스플레이리스트에 추가 안 함)를 만든다.
 * @param {Phaser.Scene} scene
 * @param {{type:'rect'|'circle'|'polygon', cx:number, cy:number, w?:number, h?:number, r?:number, radius?:number, points?:Array<{x,y}>, angle?:number}} shape
 *   cx,cy = 도형 중심(월드). points = 중심 기준 오프셋(폴리곤). angle = deg.
 * @returns {Phaser.GameObjects.Graphics}
 */
export function shapeMaskGraphics(scene, shape) {
  const g = scene.make.graphics({ add: false });   // 화면에 직접 안 그림 — 마스크 전용
  g.fillStyle(0xffffff, 1);
  const { type, cx, cy, angle = 0 } = shape;
  if (type === 'circle') {
    g.fillCircle(cx, cy, shape.r || Math.min(shape.w || 0, shape.h || 0) / 2 || 1);
  } else if (type === 'polygon' && Array.isArray(shape.points) && shape.points.length >= 3) {
    fillPoly(g, polygonWorldPoints(cx, cy, shape.points, angle));
  } else {   // rect (모서리 radius 지원, 회전 시 폴리곤화)
    const w = shape.w || 10, h = shape.h || 10, rad = shape.radius || 0;
    if (angle) fillPoly(g, rectWorldPoints(cx, cy, w, h, angle));
    else g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, rad);
  }
  return g;
}

function fillPoly(g, pts) {
  if (!pts.length) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();
}

/**
 * 대상 게임오브젝트(스프라이트/이미지/컨테이너)를 도형 모양으로 클립한다.
 *   Phaser 3: GeometryMask(WebGL/Canvas 공통). Phaser 4 WebGL 은 setMask 가 무시되므로 Filters 마스크 권장
 *   (renderLayoutInto.addShapeMedia 참고) — 여기선 3.x 게임용 기본 경로.
 * @returns {Phaser.GameObjects.Graphics|null} 마스크 그래픽스(대상 destroy 시 함께 destroy 권장)
 */
export function clipToShape(scene, target, shape) {
  if (!target || typeof target.setMask !== 'function') return null;
  const g = shapeMaskGraphics(scene, shape);
  if (typeof g.createGeometryMask !== 'function') return g;
  try { target.setMask(g.createGeometryMask()); } catch { /* 마스크 미지원 환경 — 클립 없이 표시 */ }
  // 대상이 사라질 때 마스크 그래픽스도 정리(누수 방지).
  if (typeof target.once === 'function') target.once('destroy', () => { try { g.destroy(); } catch { /* */ } });
  return g;
}
