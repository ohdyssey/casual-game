/**
 * 킥오프 포메이션 — 5v5. 코드가 생성하는 말 배치(에디터 목업은 무시).
 * 레드(플레이어)는 하단 절반, 블루(AI)는 상단 절반. 각 팀 골키퍼 1 + 필드 4.
 *
 * 순수 모듈 — 경계(Bounds)로부터 비율로 산출해 vitest 로 검증 가능.
 */
import type { Vec2, Team } from './types.js';
import type { FieldGeom } from './field.js';

export interface Disc {
  readonly team: Team;
  readonly pos: Vec2;
  readonly isKeeper: boolean;
}

/** 자기 골라인 기준 진출 비율(0=자기 골, 1=상대 골). 키퍼·백2·포워드2. */
const ROW_FRAC = [0.07, 0.21, 0.21, 0.35, 0.35] as const;
/** 가로 비율(0=좌, 1=우). */
const COL_FRAC = [0.5, 0.27, 0.73, 0.36, 0.64] as const;
const IS_KEEPER = [true, false, false, false, false] as const;

function teamFormation(field: FieldGeom, team: Team): Disc[] {
  const { left, right, top, bottom } = field.playBounds;
  const w = right - left;
  const h = bottom - top;
  return ROW_FRAC.map((rf, i) => {
    const x = left + COL_FRAC[i] * w;
    // 블루는 상단 골(top)이 자기 골 → top 에서 아래로; 레드는 하단 골(bottom)에서 위로.
    const y = team === 'blue' ? top + rf * h : bottom - rf * h;
    return { team, pos: { x: Math.round(x), y: Math.round(y) }, isKeeper: IS_KEEPER[i] };
  });
}

/** 양 팀 5v5 킥오프 배치(레드 5 + 블루 5). */
export function kickoffFormation(field: FieldGeom): Disc[] {
  return [...teamFormation(field, 'blue'), ...teamFormation(field, 'red')];
}

/** 공 킥오프 위치 = 플레이 영역 중앙(골 주머니 제외). */
export function ballKickoff(field: FieldGeom): Vec2 {
  const { left, right, top, bottom } = field.playBounds;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
