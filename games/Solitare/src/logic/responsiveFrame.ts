/**
 * responsiveFrame — 저작 프레임(세이프존) ↔ 실제 캔버스 크기의 **좌표 계약**. Phaser 비의존 순수 모듈.
 *
 * 공통 표준: `packages/core/docs/RESPONSIVE_STANDARD.md` (3층 프레임 + 양축 가변).
 * 형제 게임 펌프러시(`games/BobbleRunner/src/logic/responsiveFrame.ts`)의 계약을 솔리테어에 맞춰 이식.
 *
 * ## 현재 상태 — **양축 가변 적용됨**(game.ts 의 designWidthRange/designHeightRange)
 * 씬들이 각자 박아 두던 `const W = 1080; const H = 2400;` 는 전부 여기서 가져다 쓴다 —
 * 이 값은 **캔버스 크기가 아니라 저작(세이프존) 크기**다. 화면 전체를 덮어야 하는 것
 * (딤·배경)은 `scene.scale.width/height` 나 `ui/overlay.ts` 헬퍼를 쓸 것.
 *
 * ## 3층 프레임 — 솔리테어
 * | 층 | 값 | 규칙 |
 * |---|---|---|
 * | 저작 = 세이프존 | 1080×2400 | 에디터 SSOT. **항상 100% 보인다** |
 * | 가로 블리드 | 좌우 각 135 (→1350) | 배경 전용. 16:9(가장 넓은 폰)까지 여백 0 |
 * | 세로 블리드 | 아래로 +200 (→2600) | 21:9 기기 대응 |
 *
 * ⚠️ 세이프존을 **잘라내지 않는다**(hMin = 저작 높이 2400). main.json 은 상단 헤더(y=744)와
 * 하단 아이콘(y=2213~2222)이 이미 프레임 끝에 붙어 있어, 표준 권장대로 min 을 낮추면 UI 가 잘린다.
 * 대신 **늘리는 쪽으로만** 가변이라 `dW ≥ 0, dH ≥ 0` 이 항상 성립한다.
 */

/** 저작 폭 = 세이프존 폭(px). 에디터 저작 프레임과 동일. */
export const SAFE_W = 1080;
/** 저작 높이 = 세이프존 높이(px). 잘라내지 않는다. */
export const SAFE_H = 2400;
/**
 * 캔버스 폭 상한 — **1350**. 저작비(2.222)보다 덜 길쭉한 기기에서 가로가 늘어난다.
 *
 * 근거: 필요 폭은 화면비에 반비례한다 — 19.5:9 → 1107 · 18:9 → 1200 · **16:9 → 1350 · 브라우저 툴바 노출(1.714) → 1400**.
 * 즉 1350 이면 **현존 폰은 전부** 검은 여백 0 이다(4:3 태블릿만 레터박스로 남는다).
 *
 * ⚠️ 상한을 더 올리지 않는 이유는 **배경 크롭** 때문이다. 배경은 축소하지 않고 cover 하므로
 *   폭을 늘린 만큼 세로가 잘린다(1350 에서 상하 각 300px). 플레이 배경(main.json layer_1)은
 *   저작 폭과 같은 1080 이라 늘린 폭만큼 확대되는데, 1350 까지가 화질이 버티는 선이다.
 *   태블릿까지 여백을 없애려면 **더 넓게 저작된 플레이 배경**이 먼저 필요하다.
 */
export const MAX_W = 1420;
/** 캔버스 높이 상한(목표) — 2600. 화면비 2.407(21:9=2.333 포함)까지 여백 0. */
export const MAX_H = 2700;

/** 720×1600 저작 팝업(blank*.json)을 세이프존에 얹을 때의 균일 배율. 1080/720 = 1.5. */
export const POPUP_DESIGN_W = 720;

/**
 * 저작 프레임이 다른 문서(팝업 720×1600 등)를 세이프존에 얹을 배율.
 *
 * ⚠️ 예전엔 `캔버스폭 / doc.frame.designW` 였다 — 캔버스 폭이 고정 1080 이던 시절엔 같은 값이지만,
 *   폭이 가변이 되는 순간 팝업이 통째로 확대돼(1520 이면 ×2.111) 세로가 넘친다. 배율은 **세이프존
 *   기준으로 고정**하고, 넓어진 폭은 배치(중앙정렬)가 흡수한다.
 */
export function popupScale(designW: number): number {
  return SAFE_W / Math.max(1, designW);
}

export type PinY = 'top' | 'bottom' | 'center';
export type PinX = 'left' | 'center' | 'right';

/** 저작 노드 사각형(중심 기준 x/y + 표시 크기) — layoutLoader 의 LayoutNode 부분집합. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
}

/** 캔버스와 세이프존의 차이(px). 이 프로젝트에선 둘 다 항상 0 이상. */
export interface FrameDelta {
  readonly dW: number;
  readonly dH: number;
}

/** 캔버스 크기 → 흡수해야 할 여분(px). */
export function frameDelta(canvasW: number, canvasH: number): FrameDelta {
  return { dW: Math.max(0, canvasW - SAFE_W), dH: Math.max(0, canvasH - SAFE_H) };
}

/**
 * 화면 단위 기본 앵커 정책.
 * · `unit` — 화면 전체를 **한 덩어리**로 보고 전부 center. 팝업/결과창처럼 프레임 안에서
 *   구성이 서로 맞물린 화면. (섞어 쓰면 패널 위아래가 dH 만큼 벌어져 찢어진다.)
 * · `edges` — 상단 ⅓ = top · 하단 ⅓ = bottom · 그 사이 = center. 상단 헤더와 하단 아이콘이
 *   각각 화면 가장자리에 붙어야 하는 화면(플레이 HUD).
 */
export type PinPolicy = 'unit' | 'edges';

/** 노드 세로 앵커 결정 — 우선순위: 코드 override > 정책. 노드 좌표는 **중심 기준**. */
export function resolvePinY(
  key: string,
  r: Rect,
  policy: PinPolicy,
  overrides?: Readonly<Record<string, PinY>>,
): PinY {
  const o = overrides?.[key];
  if (o) return o;
  if (policy === 'unit') return 'center';
  if (r.y < SAFE_H / 3) return 'top';
  if (r.y > (SAFE_H * 2) / 3) return 'bottom';
  return 'center';
}

/** 노드 가로 앵커 결정 — 우선순위: 코드 override > 항상 center(세이프존 중앙정렬). */
export function resolvePinX(key: string, overrides?: Readonly<Record<string, PinX>>): PinX {
  return overrides?.[key] ?? 'center';
}

/**
 * 앵커에 따른 이동량(px) — **세이프존 중앙 기준 상대값**이다.
 *
 * 세이프존을 캔버스 가운데 놓는 일은 노드마다 하지 않고 **카메라가 한 번에** 한다
 * (`ui/safeZone.ts` 의 `centerSafeZone`). 그래야 저작 노드뿐 아니라 코드로 그리는 HUD·팝업까지
 * 전부 같은 좌표계에 놓인다. 따라서 여기서는 "중앙에서 얼마나 벗어나야 하는가"만 계산한다.
 *   · center = 0 (기본) · top = -dH/2(화면 위로) · bottom = +dH/2(화면 아래로)
 */
export function pinShift(pinY: PinY, pinX: PinX, d: FrameDelta): { dx: number; dy: number } {
  const dy = pinY === 'top' ? -d.dH / 2 : pinY === 'bottom' ? d.dH / 2 : 0;
  const dx = pinX === 'left' ? -d.dW / 2 : pinX === 'right' ? d.dW / 2 : 0;
  return { dx, dy };
}

export interface AnchorOpts {
  readonly policy: PinPolicy;
  readonly pinY?: Readonly<Record<string, PinY>>;
  readonly pinX?: Readonly<Record<string, PinX>>;
}

/**
 * 저작 노드 배열을 캔버스 크기에 맞춰 **앵커 변환한 새 배열**로 돌려준다(원본 불변).
 *
 * · 노드 id 를 키로 override 를 찾는다(에디터 depth 가 밀려도 id 는 안정적).
 * · 여분이 0이면 **원본 배열을 그대로** 돌려준다 — 현재(고정 1080×2400)와 100% 동일(회귀 없음).
 * · 저작 프레임이 세이프존과 다른 문서(팝업 720×1600)는 소비처가 popupScale 로 따로 매핑하므로
 *   여기서 다루지 않는다 — 호출부가 세이프존 프레임 문서에만 쓸 것.
 */
export function anchorNodes<T extends Rect & { readonly id: string }>(
  nodes: readonly T[],
  d: FrameDelta,
  opts: AnchorOpts,
  /**
   * 세이프에어리어 침범분(월드 px) — 가장자리 그룹을 안쪽으로 밀 양.
   * ⚠️ 그룹 전원 **같은 값**을 쓴다(각자 계산하면 서로 겹친다). 코드로 그리는 HUD 도 같은 값.
   */
  safeShift: { top: number; bottom: number } = { top: 0, bottom: 0 },
): readonly T[] {
  if (d.dW === 0 && d.dH === 0 && safeShift.top === 0 && safeShift.bottom === 0) return nodes;
  return nodes.map((n) => {
    const pinY = resolvePinY(n.id, n, opts.policy, opts.pinY);
    const { dx, dy } = pinShift(pinY, resolvePinX(n.id, opts.pinX), d);
    // 가장자리 고정 UI 만 세이프에어리어를 피한다 — 중앙(아트 스택)은 건드리지 않는다.
    const safe = pinY === 'top' ? safeShift.top : pinY === 'bottom' ? -safeShift.bottom : 0;
    const ny = n.y + dy + safe;
    return dx === 0 && ny === n.y ? n : { ...n, x: n.x + dx, y: ny };
  });
}

/**
 * 배경 커버 배율 — 배경은 **축소(fit)하지 않고 크롭/확장(cover)** 한다(표준 4절).
 * 저작 표시 크기(bgW×bgH)가 캔버스를 못 덮으면 덮을 때까지만 키운다.
 */
export function coverScale(bgW: number, bgH: number, canvasW: number, canvasH: number): number {
  return Math.max(1, canvasW / bgW, canvasH / bgH);
}

/**
 * 기기 화면비(h/w)에서 캔버스 크기를 산출 — 코어 `designSize.ts` 와 같은 규칙을 테스트용으로 재현.
 * 저작비보다 **덜 길쭉하면 폭이**, 더 길쭉하면 **높이가** 늘어난다.
 */
export function canvasSizeFor(ratio: number): { w: number; h: number } {
  const designRatio = SAFE_H / SAFE_W;
  if (ratio >= designRatio) return { w: SAFE_W, h: Math.min(MAX_H, Math.round(SAFE_W * ratio)) };
  return { w: Math.min(MAX_W, Math.round(SAFE_H / ratio)), h: SAFE_H };
}
