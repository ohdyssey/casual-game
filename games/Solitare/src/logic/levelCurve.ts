/**
 * levelCurve.ts — **레벨 난이도 곡선 SSOT**(500레벨 확장, 2026-07-18).
 *
 * `scripts/design-levels.mts`(Node 생성기)와 `design/econ-board.html`(브라우저 경제 시뮬 도구)가
 *   **같은 곡선 값**을 봐야 해서(레벨설계↔경제탭 데이터 통합) 순수 로직만 여기 뽑아뒀다 — Phaser-free,
 *   fs/process 등 Node 전용 API 없음(양쪽 다 import 가능).
 */

export type Grade = 1 | 2 | 3;

/** 전체 레벨 팩 길이(**콘텐츠** — 실제로 저작된 고유 카드 보드 수) — 난이도 곡선·리포트가 이 값을 기준으로 스케일된다. */
export const MAX_LEVEL = 500;

/**
 * **진행도 상한**(2026-07-19, PO 지시 — "레벨1부터 3천레벨까지 성장하는 구조") — MAX_LEVEL(콘텐츠 수)과는
 *   **다른 개념**이다. 저작된 카드 보드는 500장뿐이지만, 플레이어의 성장 카운터(층 해금·게임비 티어 등을
 *   구동하는 누적 승리판수)는 이보다 훨씬 더 올라갈 수 있다 — 501판째부터는 500장 풀을 **순환 재사용**
 *   하면서 진행도만 계속 오른다(cycleLevel() 참고). "카드 레벨 번호"와 "진행도"를 같은 숫자로 취급하지
 *   않는 게 이 분리의 핵심.
 */
export const MAX_PROGRESS_LEVEL = 3000;

/**
 * 진행도(1..MAX_PROGRESS_LEVEL) → **콘텐츠 조회용 레벨 번호**(1..contentCount 순환).
 *   예: contentCount=500 이면 진행도 501 → 콘텐츠 1번(2회차), 1000 → 500번, 1001 → 1번(3회차).
 *   contentCount<=0(저작 레벨 없음) 이면 진행도를 그대로 반환(호출부가 null 레이아웃으로 방어).
 */
export function cycleLevel(progressLevel: number, contentCount: number): number {
  if (contentCount <= 0) return progressLevel;
  return ((Math.max(1, progressLevel) - 1) % contentCount) + 1;
}

/** 등급 구간(레벨 범위) — 낮은 레벨→쉬움, 중간→보통, 높은 레벨→어려움 순으로 배치. */
export const GRADE_BANDS: ReadonlyArray<{ from: number; to: number; grade: Grade }> = [
  { from: 1, to: 100, grade: 1 },
  { from: 101, to: 350, grade: 2 },
  { from: 351, to: MAX_LEVEL, grade: 3 },
];

/** 등급별 승률 하한(구간 시작점 기준 — 구간 안에서는 wrFloorFor 가 더 타이트하게 좁힌다). */
export const WR_FLOOR: Record<Grade, number> = { 1: 0.8, 2: 0.55, 3: 0.35 };

export function gradeFor(level: number): Grade {
  return GRADE_BANDS.find((b) => level >= b.from && level <= b.to)?.grade ?? 3;
}

/** 등급 구간 내에서도 뒤로 갈수록 승률 하한을 조금씩 더 타이트하게(등급만으론 계단식이라 연속 난이도감이 약함). */
export function wrFloorFor(level: number): number {
  const band = GRADE_BANDS.find((b) => level >= b.from && level <= b.to) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
  const t = band.to === band.from ? 0 : (level - band.from) / (band.to - band.from); // 0..1
  return Math.max(0.3, WR_FLOOR[band.grade] - t * 0.1); // 구간 끝에서 최대 10%p 더 빡빡하게.
}

/**
 * 레벨 → 카드 예산·난이도 목표. 보드 예산은 24 → 54 를 레벨 1~220 구간에 걸쳐 완만히 점증(3장 단위) 후
 *   상한 유지 — 그 이후의 난이도 상승은 등급(grade)·승률 하한(wrFloorFor)이 담당한다.
 */
export function curve(level: number): { budget: number; grade: Grade } {
  const RAMP_LEVELS = 220; // 이 레벨까지 24→54 점증, 이후 54 유지.
  const t = Math.min(1, (level - 1) / (RAMP_LEVELS - 1));
  const raw = 24 + t * 30;
  const budget = Math.min(54, Math.max(24, Math.round(raw / 3) * 3));
  return { budget, grade: gradeFor(level) };
}
