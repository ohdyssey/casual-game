/**
 * mainPins — 플레이 화면(main.json, 1080×2400 저작) 노드별 **앵커 표**.
 *
 * 캔버스가 저작 프레임보다 커졌을 때 늘어난 여분(dW/dH)을 어느 노드가 얼마나 흡수할지 정한다.
 * 계산 자체는 `logic/responsiveFrame.ts` 가 하고, 여기는 **이 화면의 정책과 예외**만 담는다.
 *
 * ## 왜 위치 휴리스틱(edges)만으로는 안 되는가
 * main.json 은 배경 → 스토어 → 매장 → 상단 바 → 별 게이지가 **서로 맞물린 하나의 아트 스택**이다
 * (스토어 y 314~854 와 상단 바 y 638~850 이 겹치고, 매장은 y 784 부터 프레임 밖까지 이어진다).
 * y 위치로 top/bottom 을 자동 판정하면 이 스택이 dH/2 만큼 **찢어져 이음새가 벌어진다.**
 * 그래서 아트 스택은 전부 `center` 로 묶고, 그 위에 **떠 있는** UI(하단 아이콘 줄·상단 리워드
 * 배너)만 화면 가장자리에 붙인다.
 *
 * ⚠️ 이 표는 양축 가변이 **아직 켜지지 않은 상태**에서 작성됐다(game.ts 는 고정 1080×2400).
 *    현재 캔버스에서는 여분이 0이라 표가 적용돼도 결과가 완전히 동일하다 — 실제로 켜는 시점에
 *    육안 확인이 필요하다. 켜기 전제조건은 `logic/responsiveFrame.ts` 상단 주석 참조.
 */
import type { AnchorOpts, PinY } from '../logic/responsiveFrame.js';

/**
 * **아트 스택** — 배경·스토어·매장·투명막·상단 바·별 게이지·동선. 서로 맞물려 있어 반드시
 * 같은 양만큼 움직여야 한다(전부 center). 하나라도 빠지면 그 노드만 dH/2 어긋나 이음새가 벌어진다.
 */
export const MAIN_ART_STACK: readonly string[] = [
  'layer_1', // 배경(1080×2400 — 가로 블리드 없음. 폭 확장 시 cover 필요)
  'layer_2', // 스토어
  'layer_3', // 매장
  'layer_6',
  'layer_4', // 투명막
  'layer_9', // 상단 바(스토어 아트에 얹혀 있음)
  'layer_7',
  'layer_5',
  'layer_15_copy3',
  'layer_8',
  'layer_8_copy',
  'layer_8_copy2',
  'layer_8_copy3',
  'layer_8_copy3__shadow',
  'layer_14', // 별 게이지 패널
  'layer_15',
  'layer_15_copy',
  'layer_15_copy2',
  'layer_16',
  'layer_18', // 동선(path — 보행자 웨이포인트)
];

/** **하단 아이콘 줄** — 아트 위에 떠 있는 UI. 화면 아래에 붙는다. */
export const MAIN_BOTTOM_BAR: readonly string[] = ['layer_10', 'layer_10_copy', 'layer_11', 'layer_12'];

/** **상단 미션 리워드 배너** — 아트 위에 떠 있는 UI. 화면 위에 붙는다. */
export const MAIN_TOP_BANNER: readonly string[] = [
  'layer_13',
  'layer_13_copy',
  'layer_13_copy2',
  'layer_13_copy3',
  'layer_13_copy4',
  'layer_13_copy5',
  'layer_13_copy6',
  'layer_17',
  'layer_19',
  'layer_8_copy4',
  'layer_8_copy5',
  'layer_20', // 닫기 버튼
];

function pinAll(ids: readonly string[], pin: PinY): Record<string, PinY> {
  return Object.fromEntries(ids.map((id) => [id, pin]));
}

/**
 * 플레이 화면 앵커 옵션.
 *
 * 기본 정책을 `unit`(전부 center)으로 두는 이유: 이 화면은 아트 스택이 대다수라 **기본값이
 * 안전한 쪽**이어야 한다. 에디터에서 노드를 새로 추가해도 표에 없으면 아트와 함께 움직인다
 * (가장자리에 붙어야 하는 UI 는 표에 명시적으로 등록할 것).
 * 가로는 전부 center = 세이프존 중앙정렬(표준 3절) — 별도 override 없음.
 */
export const MAIN_ANCHOR: AnchorOpts = {
  policy: 'unit',
  pinY: {
    ...pinAll(MAIN_ART_STACK, 'center'),
    ...pinAll(MAIN_BOTTOM_BAR, 'bottom'),
    ...pinAll(MAIN_TOP_BANNER, 'top'),
  },
};
