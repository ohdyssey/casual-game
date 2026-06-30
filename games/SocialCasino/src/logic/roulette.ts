/**
 * roulette.ts — JESTER RAID ROULETTE 휠의 순수 로직(단일 출처 = SSOT).
 *
 * ⚠️⚠️ **세그먼트 배열 순서 = 실제 휠 이미지의 조각 순서(상단 0°부터 시계방향)와 1:1 로 일치해야 한다.**
 *   landingAngle(i) 가 인덱스 i 조각을 상단 포인터에 정렬하므로, 이 배열을 바꾸면 **휠 이미지도 같은 순서/값**이어야
 *   포인터가 가리키는 조각과 당첨금이 일치한다.
 *
 * ⭐**구조는 앞으로 바뀔 수 있다(요청 2026-06-26)** — 조각 수·값·가중치를 바꾸려면 **이 `ROULETTE_SEGMENTS` 배열만**
 *   고치면 된다. 조각 수(SEGMENT_COUNT)·조각각(SEGMENT_DEG)·가중랜덤·착지각·당첨금이 전부 배열에서 파생된다.
 *   (8조각이 아니어도 됨 — length 로 일반화돼 있음.) 바꿀 때 **휠 이미지와 roulette.test.ts 의 순서 단언도 함께** 갱신할 것.
 *
 * 현재 휠(디자이너 디자인 2026-06-26, **상단부터 시계방향**):
 *   x100 · x5 · x20 · x3+2M · x10 · SUPER BONUS · x1 · x2
 * 당첨금 = round(stake × mult).  ⭐**플랫 보너스(bonus) 폐지**(2026-06-30): 하드코딩 절대 코인값(구 +2M·SUPER +1억)은
 *   베팅·레벨 무관이라 인플레이션을 일으켜 전부 제거 → **전 조각이 순수 배수**(상대값). stake 는 레이드/공격의 **레벨 스케일
 *   코인 베팅** = betCoin × M(L)(incomeMultiplier, PlayScene 가 적용) → 인플레이 코인과 동일하게 진행도에 비례.
 */

/** 조각 종류 — 연출/사운드/문구 분기에 사용. */
export type RouletteKind = 'mult' | 'mult_coins' | 'super';

export interface RouletteSegment {
  readonly label: string; // 표시/디버그 — 휠 조각 텍스트와 동일하게 유지
  readonly mult: number; // 베팅에 곱하는 배수
  readonly bonus: number; // 더하는 플랫 코인
  readonly weight: number; // 가중 랜덤 선택 가중치(클수록 자주)
  readonly kind: RouletteKind; // 종류(배수만 / 배수+코인 / 슈퍼)
  readonly isSuper?: boolean; // SUPER BONUS(대박 연출)
}

/**
 * 휠 조각 — **상단(인덱스0)부터 시계방향**. 디자이너 휠 이미지(up_SC_Roulette_02…)의 색/배치와 1:1.
 *   index 0 = 상단(0°) … index k = (k×SEGMENT_DEG)° 시계방향.
 */
export const ROULETTE_SEGMENTS: ReadonlyArray<RouletteSegment> = [
  { label: 'x100', mult: 100, bonus: 0, weight: 1, kind: 'mult' }, //              0°  상단 (노랑)
  { label: 'x5', mult: 5, bonus: 0, weight: 5, kind: 'mult' }, //                  45° (핑크)
  { label: 'x20', mult: 20, bonus: 0, weight: 2, kind: 'mult' }, //                90° (파랑)
  { label: 'x3+2M', mult: 3, bonus: 0, weight: 3, kind: 'mult_coins' }, // 135° (초록·코인). ⭐2026-06-30: 하드코딩 플랫 **+2M 제거**(베팅·레벨 무관 절대값 = 저베팅서 ~×200으로 SUPER 초과 = 인플레이션 주범). 배수 3 유지(라벨 "x3" 는 맞음·스테이크 비례·레벨 스케일). ⚠️디자이너 라벨의 "+2M" 표기 제거 필요(이제 순수 x3).
  { label: 'x10', mult: 10, bonus: 0, weight: 3, kind: 'mult' }, //                180° 하단 (빨강)
  { label: 'SUPER', mult: 150, bonus: 0, weight: 1, kind: 'super', isSuper: true }, // 225° (하늘·광대). ⭐2026-06-30: 플랫 +1억 제거(베팅무관 1억=수십 도시치 = 경제 붕괴). 베팅비례 ×150(최상위)으로 = 베팅10 시 150만≈도시1, 비용과 비례. "SUPER" 라벨은 숫자 없어 디자이너 SSOT 무영향.
  { label: 'x1', mult: 1, bonus: 0, weight: 6, kind: 'mult' }, //                  270° (주황)
  { label: 'x2', mult: 2, bonus: 0, weight: 6, kind: 'mult' }, //                  315° (보라)
];

export const SEGMENT_COUNT = ROULETTE_SEGMENTS.length; // 8 (배열에서 파생)
export const SEGMENT_DEG = 360 / SEGMENT_COUNT; // 45° (배열에서 파생)

/** 가중 랜덤으로 착지 조각 인덱스 선택. rng: [0,1). */
export function pickSegment(rng: () => number): number {
  const total = ROULETTE_SEGMENTS.reduce((s, g) => s + g.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < ROULETTE_SEGMENTS.length; i++) {
    r -= ROULETTE_SEGMENTS[i].weight;
    if (r < 0) return i;
  }
  return ROULETTE_SEGMENTS.length - 1;
}

/**
 * 조각 i 를 상단 포인터에 맞추는 휠 **최종 각도(°, 시계방향)**.
 *   Phaser image.angle=A 는 시계방향 A° 회전 → 이미지각 β 의 점이 화면각 β+A. 조각 i 중심(β=i×SEGMENT_DEG)이
 *   상단(0/360)에 오려면 A ≡ -i×SEGMENT_DEG (mod 360). 여러 바퀴(spins) + 경계 긴장용 오프셋(offsetDeg)을 더한다.
 */
export function landingAngle(i: number, spins: number, offsetDeg = 0): number {
  const base = (((360 - i * SEGMENT_DEG) % 360) + 360) % 360;
  return spins * 360 + base + offsetDeg;
}

/** 휠 각도(°)에서 상단 포인터가 가리키는 조각 인덱스(역산 — 검증/디버그용). */
export function segmentAtTop(angleDeg: number): number {
  const a = ((angleDeg % 360) + 360) % 360; // 0..360
  const idx = Math.round(((360 - a) % 360) / SEGMENT_DEG) % SEGMENT_COUNT;
  return (idx + SEGMENT_COUNT) % SEGMENT_COUNT;
}

/** 당첨금 = round(stake × 배수 + 보너스). ⭐bonus 는 전 조각 0(플랫 절대값 폐지 — 인플레이션 방지). stake = 레이드/공격의
 *  **레벨 스케일 코인 베팅**(betCoin × M(L), PlayScene 적용) → 진행도 비례. seg.bonus 필드는 향후 레벨 스케일 보너스 여지로 유지. */
export function rouletteWin(power: number, seg: RouletteSegment): number {
  return Math.round(Math.max(0, power) * seg.mult + seg.bonus);
}
