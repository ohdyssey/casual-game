/**
 * 필드 기하 — 에디터 main.json 의 `field` 충돌 노드(폴리곤)에서 플레이 경계를 추출.
 * 노드는 중심(x,y) + 상대 points 로 폴리곤을 정의한다(상·하단 중앙에 골 주머니 notch 포함).
 * 폴리곤 변 = Matter 정적 벽의 SSOT. 골 입구 라인 = 득점 판정 기준.
 *
 * 순수 모듈(Phaser 비의존) — vitest 로 검증.
 */
import type { Vec2, Team } from './types.js';

export const DESIGN_W = 720;
export const DESIGN_H = 1280;

export interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface FieldGeom {
  /** 전체 폴리곤 bbox(골 주머니 포함). */
  readonly bounds: Bounds;
  /** 골 입구 라인 기준 플레이 사각(말·공 배치용 — 골 주머니 제외). */
  readonly playBounds: Bounds;
  readonly center: Vec2;
  /** 절대 좌표 폴리곤 점들(Matter 벽 생성). */
  readonly polygon: ReadonlyArray<Vec2>;
  /** 상단 골 입구 라인 y(이 위로 공 중심이 넘으면 레드 득점). */
  readonly topMouthY: number;
  /** 하단 골 입구 라인 y(이 아래로 넘으면 블루 득점). */
  readonly bottomMouthY: number;
  /** 골 입구 반폭(득점 x 안전 판정). */
  readonly goalHalfWidth: number;
}

interface FieldNodeLike {
  readonly type?: string;
  readonly x: number;
  readonly y: number;
  readonly points?: ReadonlyArray<{ x: number; y: number }>;
}
interface DocLike {
  readonly nodes: ReadonlyArray<FieldNodeLike>;
}

/** 폴리곤 파싱 실패 시 폴백 — 에디터 값 근사(직사각 + 중앙 골 입구). */
export const FALLBACK_GEOM: FieldGeom = buildRectFallback();

/** main.json 문서에서 `field` 폴리곤을 찾아 FieldGeom 으로 변환. */
export function parseField(doc: DocLike): FieldGeom {
  const node = doc.nodes.find((n) => n.type === 'field' && Array.isArray(n.points));
  if (!node || !node.points || node.points.length < 4) return FALLBACK_GEOM;

  const polygon: Vec2[] = node.points.map((p) => ({ x: node.x + p.x, y: node.y + p.y }));
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys); // 상단 골 백
  const bottom = Math.max(...ys); // 하단 골 백
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };

  // 골 입구 라인 = 골 백에서 한 단계 안쪽의 가로 변 y(필드 가장자리 라인).
  const EPS = 8;
  const topInner = ys.filter((y) => y > top + EPS && y < center.y);
  const botInner = ys.filter((y) => y < bottom - EPS && y > center.y);
  const topMouthY = topInner.length ? Math.min(...topInner) : top;
  const bottomMouthY = botInner.length ? Math.max(...botInner) : bottom;

  // 골 입구 반폭 = 상단 골 백 코너(점들 중 y≈top)의 x 범위 절반 + 여유.
  const backXs = polygon.filter((p) => p.y < top + EPS).map((p) => p.x);
  const goalHalfWidth =
    backXs.length >= 2 ? (Math.max(...backXs) - Math.min(...backXs)) / 2 + 12 : 110;

  return {
    bounds: { left, right, top, bottom },
    playBounds: { left, right, top: topMouthY, bottom: bottomMouthY },
    center,
    polygon,
    topMouthY,
    bottomMouthY,
    goalHalfWidth,
  };
}

/** 팀이 노리는 골 중앙(AI 조준 타깃). 레드=상단, 블루=하단. */
export function targetGoalCenter(field: FieldGeom, team: Team): Vec2 {
  return team === 'red'
    ? { x: field.center.x, y: field.topMouthY - 24 }
    : { x: field.center.x, y: field.bottomMouthY + 24 };
}

/**
 * 공 중심이 골 입구 라인을 넘었고 입구 폭 안이면 득점 팀 반환.
 * 폴리곤 벽이 입구 밖 통과를 막으므로, 라인 통과 = 골 주머니 진입 = 득점.
 */
export function detectGoal(ball: Vec2, field: FieldGeom): Team | null {
  const withinMouth = Math.abs(ball.x - field.center.x) <= field.goalHalfWidth;
  if (!withinMouth) return null;
  if (ball.y < field.topMouthY) return 'red';
  if (ball.y > field.bottomMouthY) return 'blue';
  return null;
}

/** 폴백: 직사각 필드 + 상·하단 중앙 골 주머니(에디터 값 근사). */
function buildRectFallback(): FieldGeom {
  const left = 45;
  const right = 675;
  const fieldTop = 201; // 입구 라인
  const fieldBottom = 1197;
  const backTop = 153; // 골 백
  const backBottom = 1234;
  const mouthHalf = 118;
  const cx = (left + right) / 2;
  const mL = cx - mouthHalf;
  const mR = cx + mouthHalf;
  // 폴리곤(시계방향): 좌상→상단입구좌→골백좌→골백우→상단입구우→우상→우하→하단입구우→골백우→골백좌→하단입구좌→좌하→좌중
  const polygon: Vec2[] = [
    { x: left, y: fieldTop },
    { x: mL, y: fieldTop },
    { x: mL, y: backTop },
    { x: mR, y: backTop },
    { x: mR, y: fieldTop },
    { x: right, y: fieldTop },
    { x: right, y: fieldBottom },
    { x: mR, y: fieldBottom },
    { x: mR, y: backBottom },
    { x: mL, y: backBottom },
    { x: mL, y: fieldBottom },
    { x: left, y: fieldBottom },
  ];
  return {
    bounds: { left, right, top: backTop, bottom: backBottom },
    playBounds: { left, right, top: fieldTop, bottom: fieldBottom },
    center: { x: cx, y: (backTop + backBottom) / 2 },
    polygon,
    topMouthY: fieldTop,
    bottomMouthY: fieldBottom,
    goalHalfWidth: mouthHalf,
  };
}
