/**
 * reflect — 발사체의 한 서브스텝 전진 + 좌/우 수직 벽 '거울 반사' 순수 로직.
 *
 * 설계 원칙 (정확한 반사):
 *  - 위치 클램프(벽에 붙임)가 아니라, 벽을 넘어간 초과분을 벽면 기준으로 되접는다.
 *    => 이동 거리(경로 길이) 보존, 입사각 = 반사각 이 수학적으로 성립.
 *  - 첫 접촉 지점(contactX/Y)을 선형 보간으로 정확히 계산 → 스파크/사운드 위치.
 *  - step 이 필드 폭보다 커도 while 루프로 다중 반사를 안전하게 처리.
 *
 * 좌표계: x 는 공의 '중심'. bounds.left/right 는 공 중심이 닿는 벽면
 *         (예: 화면 양끝에서 반지름만큼 안쪽).
 */

export interface ReflectBounds {
  /** 공 중심이 반사되는 좌측 벽면 좌표 */
  readonly left: number;
  /** 공 중심이 반사되는 우측 벽면 좌표 */
  readonly right: number;
}

export interface StepResult {
  /** 반사 반영 후 새 중심 x */
  readonly x: number;
  /** 새 중심 y (수직 이동만, 벽 반사 영향 없음) */
  readonly y: number;
  /** 반사 반영된 단위 속도 x (부호만 뒤집힘, 크기 보존) */
  readonly ux: number;
  /** 단위 속도 y (불변) */
  readonly uy: number;
  /** 이번 스텝에서 벽에 닿았는지 */
  readonly bounced: boolean;
  /** 첫 벽 접촉점 x (bounced=false 면 NaN) */
  readonly contactX: number;
  /** 첫 벽 접촉점 y (bounced=false 면 NaN) */
  readonly contactY: number;
}

/**
 * 단위속도 (ux, uy) 로 step(px) 만큼 전진시키고 좌/우 벽 거울 반사를 적용한다.
 * 실시간 비행(update)과 조준 가이드(drawAimLine)가 동일한 이 함수·스텝을
 * 사용하므로, 가이드가 보여주는 화면 끝 반사 = 실제 발사 반사가 정확히 일치한다.
 */
export function advanceWithReflection(
  x: number,
  y: number,
  ux: number,
  uy: number,
  step: number,
  bounds: ReflectBounds,
): StepResult {
  const ny = y + uy * step;
  let nx = x + ux * step;
  let nux = ux;

  // 첫 접촉점(보간) — 반사로 nx 를 되접기 전, 진행 방향으로 가장 먼저 만나는 벽.
  const dx = nx - x; // 이번 스텝의 수평 이동량(부호 포함)
  let contactX = NaN;
  let contactY = NaN;
  if (dx !== 0) {
    if (nx < bounds.left) {
      const t = (bounds.left - x) / dx; // 0..1
      contactX = bounds.left;
      contactY = y + (ny - y) * t;
    } else if (nx > bounds.right) {
      const t = (bounds.right - x) / dx;
      contactX = bounds.right;
      contactY = y + (ny - y) * t;
    }
  }

  // 거울 반사 — 한 스텝에 여러 번 튕길 수 있는 경우까지 안전하게 되접음.
  let bounced = false;
  let guard = 0;
  while ((nx < bounds.left || nx > bounds.right) && guard++ < 16) {
    if (nx < bounds.left) {
      nx = 2 * bounds.left - nx;
      nux = Math.abs(nux);
      bounced = true;
    } else if (nx > bounds.right) {
      nx = 2 * bounds.right - nx;
      nux = -Math.abs(nux);
      bounced = true;
    }
  }

  return { x: nx, y: ny, ux: nux, uy, bounced, contactX, contactY };
}
