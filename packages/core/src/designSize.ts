/**
 * designSize — 캔버스 디자인 크기 산출(**양축 가변 표준**). Phaser 비의존 순수 모듈.
 *
 * ## 표준 3층 프레임
 * | 층 | 예(홈런팝) | 규칙 |
 * |---|---|---|
 * | 저작 프레임 | 1080×2400 | 에디터 SSOT. 디자이너가 그리는 캔버스 |
 * | 세이프존 | 1080×1920 | **항상 100% 보임.** UI·버튼·판정요소는 전부 이 안에 |
 * | 블리드 | 세로 ±240 / 가로 ±180 | 배경 전용. 잘리거나 더 드러나도 무방 |
 *
 * ## 산출 규칙
 * 컨테이너 박스 비율 `r = vh/vw` 로 두 구간을 나눈다(경계 = 세이프존 비율 hMin/wMin):
 *   · `r ≥ hMin/wMin` → **세로 확장**: 폭은 저작 폭 고정, 높이만 [hMin,hMax] 클램프
 *   · `r < hMin/wMin` → **가로 확장**: 높이를 hMin 고정, 폭을 [wMin,wMax] 로 확대
 * 두 구간 모두 캔버스 비율이 박스 비율과 (범위 안에서) 일치 → Phaser FIT 여백이 0 이 된다.
 *
 * ⚠️ 가로 확장 구간은 태블릿/데스크톱만이 아니다. 하단 광고 배너 슬롯을 뺀 컨테이너 비율이
 * 16:9 보다 넓어지는 폰(예: iPhone SE 375×667 → 컨테이너 375×571, r=1.52)이 여기 해당하며,
 * 폭 고정이면 좌우에 검은 필러박스가 남는다.
 *
 * ⚠️ 폭이 저작 폭보다 커지면 에디터 좌표와 캔버스 폭이 달라진다. 레이아웃 소비 측에서
 * **세이프존 중앙정렬**(x += (canvasW − designW)/2)을 적용해야 하고, 가장자리에 붙어야 하는
 * 노드만 pinX(left/right)로 예외 처리한다. 배경 에셋에는 wMax 폭까지 덮는 좌우 블리드가 필요하다.
 */

/** 가변 범위(px). min 은 세이프존 치수, max 는 블리드까지 포함한 상한. */
export interface DesignRange {
  readonly min: number;
  readonly max: number;
}

/** 캔버스가 실제로 들어갈 박스 크기(px) — 뷰포트가 아니라 컨테이너 실측값. */
export interface DesignBox {
  readonly vw: number;
  readonly vh: number;
}

/** resolveDesignSize 가 보는 GameModule 부분집합. */
export interface DesignSizeInput {
  /** 저작 폭(px). 미설정 시 호출자가 넘긴 fallbackWidth. */
  readonly designWidth?: number;
  /** 완전 고정 높이(px). 설정하면 가변 범위보다 우선한다. */
  readonly designHeight?: number;
  /** 가변 높이 범위(px). */
  readonly designHeightRange?: DesignRange;
  /** 가변 폭 범위(px). 미설정이면 가로 확장을 하지 않는다(기존 동작 = 폭 고정). */
  readonly designWidthRange?: DesignRange;
}

export interface DesignSize {
  readonly width: number;
  readonly height: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 캔버스 디자인 크기 산출 — 양축 가변 표준의 단일 구현(순수 함수).
 *
 * 우선순위: 고정(designHeight) > 가변 범위(designHeightRange[+designWidthRange]) > 폴백 고정.
 * `designWidthRange` 를 주지 않으면 모든 비율에서 폭이 고정돼 기존 동작과 100% 동일하다.
 *
 * @param fallback 범위가 아예 없을 때 쓸 기본 크기(게임별 공용 기준 해상도).
 */
export function resolveDesignSize(mod: DesignSizeInput, box: DesignBox, fallback: DesignSize): DesignSize {
  const wMin = mod.designWidthRange?.min ?? mod.designWidth ?? fallback.width;
  if (mod.designHeight) return { width: wMin, height: mod.designHeight };
  if (!mod.designHeightRange) return { width: wMin, height: fallback.height };

  const { min: hMin, max: hMax } = mod.designHeightRange;
  const ratio = box.vw > 0 && box.vh > 0 ? box.vh / box.vw : 0;
  // 박스 측정 실패(0·NaN·음수) — 가장 여유 있는 세로 상한으로 안전하게 떨어진다.
  if (!Number.isFinite(ratio) || ratio <= 0) return { width: wMin, height: hMax };

  // 세로 확장 구간(일반 세로 폰) — 또는 가로 확장을 옵트인하지 않은 게임.
  if (!mod.designWidthRange || ratio >= hMin / wMin) {
    return { width: wMin, height: clamp(Math.round(wMin * ratio), hMin, hMax) };
  }
  // 가로 확장 구간 — 세로를 더 깎는 대신 폭을 늘려 좌우 필러박스를 없앤다.
  const wMax = Math.max(wMin, mod.designWidthRange.max);
  return { width: clamp(Math.round(hMin / ratio), wMin, wMax), height: hMin };
}
