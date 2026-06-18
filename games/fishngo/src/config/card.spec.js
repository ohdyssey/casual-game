/**
 * card.spec.js — 낚시터 카드(LocationCard) 선언적 레이아웃 = 2번 템플릿 풀 재구성.
 *
 * 사용자 제공 2번 템플릿(펭귄)을 분해한 조각 popup_01~09 를 "동일 비율"로 조립한다.
 *   조각 ↔ Phaser 키 (assets.config.js):
 *     popup_01 card_header  · popup_02 card_frame  · popup_03 card_panel_a(좌, 넓음)
 *     popup_04 card_panel_b(우, 별)  · popup_05-1/2 card_star_on/off
 *     popup_06 card_panel_c(4슬롯 패널)  · popup_07 card_slot  · popup_08 card_bar  · popup_09 card_btn
 *
 * 좌표계: 기준 프레임 popup_02 = 408×645 (aspect 0.633). 모든 frame.* 분수의 분모.
 *   프레임 내부(골드 보더 안 베이지) 실측: x[18,390] y[2,622] → inset L0.044 T0.003 R0.044 B0.036.
 *   헤더 등 보더 위에 걸치는 조각은 frame 분수(0..1)로, 패널 내부 요소는 panel 분수(중첩)로 둔다.
 *
 * 수치 출처: scripts/ui-introspect.cjs 실측 + #uilab 그리드/오버레이 시각 보정.
 */

export const LOCATION_CARD_SPEC = {
  frame: {
    key: 'card_frame',
    designW: 408,
    designH: 645,
    // 골드 보더 안 내부 영역 (실측) — 참고용.
    interior: { l: 0.044, t: 0.003, r: 0.044, b: 0.036 },
  },

  // ── ① 헤더 배너 (popup_01 414×131, aspect 3.16) — 프레임 상단 걸침, 조개/별 하단 매달림 ──
  header: {
    key: 'card_header',
    cx: 0.500, cy: 0.082, wFrac: 0.955,
    title: { fy: 0.50, size: 31, color: '#ffffff', stroke: '#7a3d10', strokeW: 6 },
  },

  // ── ② 아트 창 (스테이지 일러스트) — 상단 각짐 + 하단 라운드, 좌우 여백 최소 ──
  art: {
    box: { l: 0.066, t: 0.178, w: 0.868, h: 0.350 },
    topRadiusFrac: 0.052,        // ≈21px — 상단도 하단과 동일 라운드 (사용자 요청)
    bottomRadiusFrac: 0.052,     // ≈21px (라운드)
    border: { color: 0xE3B36A, width: 2.5 },
  },

  // ── ③ 패널 행: 좌(popup_03 넓음) + 우(popup_04 별) — 동일 cy 중앙정렬, 각자 네이티브 비율 ──
  rowLeft: {
    key: 'card_panel_a',          // popup_03 224×92 (aspect 2.43)
    cx: 0.300, cy: 0.620, wFrac: 0.476,
    label: { text: '추천 어종', fy: 0.255, size: 15, color: '#2f8276', stroke: '#ffffff', strokeW: 3 },
    icons: { fy: 0.660, sizeFh: 0.60, gapFw: 0.040, max: 3 },
  },
  rowRight: {
    key: 'card_panel_b',          // popup_04 139×92 (aspect 1.51)
    cx: 0.748, cy: 0.620, wFrac: 0.346,
    label: { text: '난이도', fy: 0.255, size: 15, color: '#2f8276', stroke: '#ffffff', strokeW: 3 },
    stars: { fy: 0.660, sizeFh: 0.34, gapFw: 0.050, count: 3,
      onKey: 'card_star_on', offKey: 'card_star_off' },
  },

  // ── ④ 4슬롯 패널 (popup_06 365×125 aspect 2.92) + 슬롯(popup_07 65×64) ×4 ──
  slotPanel: {
    key: 'card_panel_c',
    cx: 0.500, cy: 0.762, wFrac: 0.872,
    slots: { count: 4, key: 'card_slot', fy: 0.600, sizeFh: 0.52, gapFw: 0.045 },
  },

  // ── ⑤ 획득 보상 바 (popup_08 364×50 aspect 7.28) ──
  reward: {
    key: 'card_bar',
    cx: 0.500, cy: 0.888, wFrac: 0.872,
    label: { text: '획득 보상', fy: 0.235, size: 14, color: '#2f8276', stroke: '#ffffff', strokeW: 3 },
    coin: { fx: 0.345, fy: 0.60, rFh: 0.42 },
    value: { fx: 0.455, fy: 0.60, size: 20, color: '#5a3210', stroke: '#ffffff', strokeW: 3 },
  },

  // ── ⑥ 액션 버튼 (popup_09 148×48 aspect 3.08) ──
  button: {
    key: 'card_btn',
    cx: 0.500, cy: 0.950, wFrac: 0.405,
    label: { text: '입장하기', size: 19, color: '#ffffff', stroke: '#9a4a06', strokeW: 4 },
  },

  // ── 상태 틴트 (HomeScene 캐러셀 dim/lock) ──
  tint: {
    selected: 0xffffff,
    dimmed:   0x9aa0a6,
    locked:   0x5a6e90,
  },
};

export const DIFFICULTY = { EASY: 1, NORMAL: 2, HARD: 3 };
