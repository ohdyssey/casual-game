/**
 * shapeGeometry — 다각형 도형의 순수 기하 유틸(에디터/렌더 공유, Phaser 무관).
 *
 *   폴리곤 노드의 points 는 "노드 중심(0,0) 기준 디자인 단위 오프셋" 배열 [{x,y}, …].
 *   노드의 x,y 는 중심점이고, points 가 그 둘레의 꼭지점을 정의한다(rect 의 w/h 와 대등한 역할).
 *   비파괴(항상 새 배열/객체 반환) — coding-style 불변 원칙.
 */

/** 정다각형 프리셋 — 중심 기준 반지름 R 의 n각형 points(위쪽 꼭지점부터 시계방향). */
export function regularPolygon(n, R) {
  const sides = Math.max(3, Math.round(n || 3));
  const r = Math.max(1, R || 70);
  const out = [];
  // -90°(위)에서 시작해 시계방향. 짝수각형이 평평한 바닥을 갖도록 살짝 보정하지 않고 표준식 사용.
  for (let i = 0; i < sides; i++) {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI / sides);
    out.push({ x: round2(Math.cos(a) * r), y: round2(Math.sin(a) * r) });
  }
  return out;
}

/** 이름표 프리셋 → points. triangle/quad/pentagon/hexagon/diamond/star 등. */
export function polygonPreset(kind = 'triangle', size = 140) {
  const R = Math.max(8, size / 2);
  switch (kind) {
    case 'triangle': return regularPolygon(3, R);
    case 'quad':     return rectToPolygon(size, size * 0.7);
    case 'diamond':  return [{ x: 0, y: -R }, { x: R, y: 0 }, { x: 0, y: R }, { x: -R, y: 0 }];
    case 'pentagon': return regularPolygon(5, R);
    case 'hexagon':  return regularPolygon(6, R);
    case 'star':     return starPolygon(5, R, R * 0.46);
    default:         return regularPolygon(Math.max(3, parseInt(kind, 10) || 3), R);
  }
}

/** 별 모양 — n 꼭지점, 외/내 반지름 교차. */
export function starPolygon(points, outerR, innerR) {
  const n = Math.max(2, Math.round(points || 5));
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (-Math.PI / 2) + (i * Math.PI / n);
    const r = i % 2 === 0 ? outerR : innerR;
    out.push({ x: round2(Math.cos(a) * r), y: round2(Math.sin(a) * r) });
  }
  return out;
}

/** 축정렬 사각형(w×h) → 중심 기준 4꼭지점(TL,TR,BR,BL). rect→polygon 변환에 사용. */
export function rectToPolygon(w, h) {
  const hw = Math.max(1, w || 100) / 2, hh = Math.max(1, h || 100) / 2;
  return [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
}

/** points 의 로컬 경계상자(중심 기준). 빈/이상 입력은 0폭 박스. */
export function pointsBounds(points) {
  const pts = sanitizePoints(points);
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** 변 (i, i+1) 의 중점 — 더블클릭 점 추가 위치 계산용. */
export function edgeMidpoint(points, i) {
  const pts = sanitizePoints(points);
  if (pts.length < 2) return { x: 0, y: 0 };
  const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
  return { x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2) };
}

/** i 번째 변(i→i+1, 마지막은 last→0) 중점에 새 꼭지점 삽입한 새 points(비파괴). */
export function insertVertex(points, edgeIndex) {
  const pts = sanitizePoints(points);
  if (pts.length < 2) return pts;
  const i = ((edgeIndex % pts.length) + pts.length) % pts.length;
  const mid = edgeMidpoint(pts, i);
  const out = pts.slice();
  out.splice(i + 1, 0, mid);   // 마지막 변이면 i+1=length → 끝에 추가(0으로 감기는 변 위)
  return out;
}

/** index 꼭지점 제거한 새 points(최소 3개 유지 — 그 이하 요청은 원본 반환). */
export function removeVertex(points, index) {
  const pts = sanitizePoints(points);
  if (pts.length <= 3) return pts;
  return pts.filter((_, i) => i !== index);
}

/**
 * points 를 정규화: 중심(centroid)이 (0,0) 이 되도록 평행이동하고 그 이동량을 반환.
 *   꼭지점 편집으로 무게중심이 틀어지면 노드 x,y(중심) 와 어긋나므로, 저장 시 재중심화해
 *   x,y += offset 로 보정하면 박스/회전축이 항상 도형 중앙과 일치한다.
 */
export function recenterPoints(points) {
  const pts = sanitizePoints(points);
  if (!pts.length) return { points: [], dx: 0, dy: 0 };
  const b = pointsBounds(pts);                       // bbox 중심 기준(시각적 중앙)
  const dx = b.cx, dy = b.cy;
  return { points: pts.map((p) => ({ x: round2(p.x - dx), y: round2(p.y - dy) })), dx, dy };
}

/** 입력 방어 — 숫자 좌표를 가진 점만, 최소형태로. */
export function sanitizePoints(points) {
  if (!Array.isArray(points)) return [];
  const out = [];
  for (const p of points) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y)) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function round2(v) { return Math.round(v * 100) / 100; }
