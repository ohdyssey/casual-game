/**
 * 텍스트 슬롯 채우기 — **모바일 가독성 우선**(사용자 지시: 폰트 크기를 최대화).
 *
 * 저작 슬롯(rect)은 목업 문구 기준이라, 실제 값이 짧으면 글자가 작게 남아 여백만 커진다.
 * 그래서 "저작 크기"를 **하한**으로 두고, 슬롯 폭이 허락하는 만큼 키운다. 반대로 실제 값이
 * 길어 넘칠 때는 줄인다 — 어느 쪽이든 **슬롯 밖으로 나가지 않는 최대 크기**를 고른다.
 *
 * ⚠️ 저작 텍스트 rect 는 근사값(`rectApprox`)이다. 그래서 확대는 상한(MAX_GROW)으로 묶고
 *   좌우 여백(PAD_RATIO)을 남긴다 — 무한정 키우면 아트 밖으로 삐져나온다.
 *
 * 측정은 호출측이 주입한다(캔버스 의존 없음) → 순수 함수라 테스트로 고정된다.
 */

/** 슬롯 폭 대비 남겨 둘 좌우 여백 비율(양쪽 합). */
export const TEXT_FIT_PAD_RATIO = 0.12;
/** 저작 크기 대비 최대 확대율 — 근사 rect 를 믿을 수 있는 한도. */
export const TEXT_FIT_MAX_GROW = 1.3;
/**
 * 저작 크기 대비 최소 축소율 — 이보다 줄이면 **모바일에서 읽기 어렵다**(그 아래는 그냥 넘친다).
 * ⚠️ 저작 텍스트 rect 는 목업 문구 기준 근사값이라, 여기에 맞춰 과하게 줄이면
 *   실제 아트(알약·리본)에는 여유가 있는데도 글자만 쪼그라든다(실측: 이름표 34 → 25px).
 *   살짝 넘치는 편이 낫다는 판단으로 하한을 0.85 로 올린다.
 */
export const TEXT_FIT_MIN_SHRINK = 0.85;

/** 주어진 글자 크기에서의 텍스트 폭(px)을 재는 함수. */
export type MeasureWidth = (fontSizePx: number) => number;

/**
 * 슬롯에 맞는 글자 크기 — 저작 크기에서 시작해 **최대 TEXT_FIT_MAX_GROW 까지 키우고**,
 * 넘치면 TEXT_FIT_MIN_SHRINK 까지 줄인다. 정수 px 로 돌려준다.
 *
 * @param measure  글자 크기 → 폭(px)
 * @param baseSize 저작 글자 크기(px)
 * @param slotW    슬롯 폭(px)
 */
export function fitFontSize(measure: MeasureWidth, baseSize: number, slotW: number): number {
  const usable = Math.max(1, slotW * (1 - TEXT_FIT_PAD_RATIO));
  const lo = Math.max(1, Math.floor(baseSize * TEXT_FIT_MIN_SHRINK));
  const hi = Math.max(lo, Math.ceil(baseSize * TEXT_FIT_MAX_GROW));

  // 저작 크기에서 이미 넘치면 줄이는 쪽으로, 아니면 키우는 쪽으로 이진 탐색한다.
  let best = lo;
  let a = lo;
  let b = hi;
  while (a <= b) {
    const mid = Math.floor((a + b) / 2);
    if (measure(mid) <= usable) {
      best = mid;
      a = mid + 1;
    } else {
      b = mid - 1;
    }
  }
  return best;
}

/** 제목·버튼처럼 강조가 필요한 자리의 굵기(모바일에서 또렷하게). */
export const TITLE_WEIGHT = '800';
/** 본문·수치 기본 굵기 — 옛 Jua 의 두툼함과 맞춘 값. */
export const BODY_WEIGHT = '700';
