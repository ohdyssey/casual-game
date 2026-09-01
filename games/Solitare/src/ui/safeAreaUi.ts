/**
 * safeAreaUi — **가장자리 고정 UI 를 세이프에어리어 밖으로 밀어내는** 양을 계산한다.
 *
 * 표준 규칙(코어 `safeZone.ts` 상단 주석): 세이프에어리어는 크기가 아니라 여백이다.
 *   · 콘텐츠 배율은 **1:1 불변** — 축소하지 않는다.
 *   · 가장자리 UI 만 **침범한 만큼만** 안쪽으로 민다. 여유가 있으면 0(안 움직인다).
 *
 * ## 왜 "그룹 단위"로 미는가
 * 상단 고정 UI 는 헤더(코드) → 미션 배너(코드) → 저작 리워드 배너가 세로로 맞물려 있다.
 * 각자 침범량만큼 따로 밀면 **서로 겹친다**(헤더가 배너를 덮는다). 그래서 그룹에서 가장 위에
 * 있는 요소의 침범량 하나를 구해 **전원 같은 양**만큼 민다 — 상대 배치가 보존된다.
 *
 * 하단도 같다. 다만 하단 UI 는 프레임 바닥까지 여유(118px)가 있어, 홈 인디케이터(96px) 정도는
 * **밀 필요가 없다** — 실측상 아이폰에서 하단은 0 이 나온다.
 */
import Phaser from 'phaser';
import { domTopBarBottom, edgeShift, safeAreaInsets, safeSize } from '@casual/core';
import { SAFE_H } from '../logic/responsiveFrame.js';

/**
 * 상단 고정 UI 중 **가장 위 요소의 상단 모서리**(저작 y, 게임 px).
 * = 코드 헤더(topHeader: 중심 y 90 · 높이 104 → 상단 38). 헤더 배치를 바꾸면 이 값도 같이 고쳐야 한다.
 */
export const TOP_UI_EDGE = 38;

/**
 * 하단 고정 UI 중 **가장 아래 요소에서 프레임 바닥까지의 여유**(게임 px).
 * = main.json 하단 아이콘 줄의 최하단(≈2282) 기준 → 2400 − 2282 = 118.
 */
export const BOTTOM_UI_GAP = SAFE_H - 2282;

/**
 * 허브 메뉴 버튼(⋯/✕) 아래로 둘 최소 간격(게임 px). 버튼 바로 밑에 딱 붙지 않게 여유를 준다.
 *   24 → 12(사용자 요청 2026-08-24: "헤더 윗부분 여백을 약간 줄여 달라") — CSS 기준 12px→6px 간격.
 *   버튼(bottom 46 CSS = 92 게임px)과의 시각적 분리는 유지된다.
 */
const TOP_BAR_CLEARANCE = 12;

/**
 * **세이프존(저작 프레임)이 캔버스 위·아래에 남기는 여백**(게임 px).
 *
 * 캔버스는 양축 가변이라 화면비에 따라 저작(2400)보다 길어진다. 그 남는 세로는 세이프존을
 * **세로 중앙정렬**하는 데 쓰이므로(`centerSafeZone`), 저작 y=0 은 이미 캔버스 상단에서
 * 이만큼 내려온 자리에 그려진다.
 *
 * ⚠️ 이 값을 빼먹으면 **중복 반영**된다 — 실측(갤럭시 플립5 2655px 캔버스): 세이프존 여백이
 * 이미 127px 이라 헤더가 허브 버튼(⋯/✕) 아래로 충분히 내려와 있는데도, 저작 상단(38)만 보고
 * "겹친다"고 판단해 107px 을 더 밀어 **간격이 두 배**가 됐다.
 */
function frameInset(scene: Phaser.Scene): number {
  const gap = (scene.scale.height - safeSize(scene).height) / 2;
  return gap > 0 ? gap : 0;
}

/**
 * 상단 고정 UI 를 아래로 밀어야 할 양(게임 px). **둘 중 큰 값**을 쓴다.
 *   ① 세이프에어리어(노치·아일랜드) 침범분
 *   ② **허브 메뉴 버튼(⋯/✕) 아래로 비키는 데 필요한 양** — 이 버튼은 캔버스 밖 DOM 이라
 *      저작 좌표만 보면 겹친다(실측: 헤더 우측 종·메뉴 아이콘이 ✕ 와 포개짐).
 * 둘 다 여유가 있으면 0 — 한 픽셀도 움직이지 않는다(표준 규칙 ③).
 *
 * 기준 거리는 **캔버스 상단부터** 잰다(저작 상단이 아니라). 인셋·DOM 버튼은 모두 화면 기준이라,
 * 세이프존 중앙정렬 여백(`frameInset`)을 더해야 같은 자로 잰 값이 된다.
 */
export function topUiShift(scene: Phaser.Scene): number {
  const edge = frameInset(scene) + TOP_UI_EDGE;
  const safe = edgeShift(edge, safeAreaInsets(scene).top);
  const bar = edgeShift(edge, domTopBarBottom(scene) + TOP_BAR_CLEARANCE);
  return Math.max(safe, bar);
}

/** 하단 고정 UI 를 위로 밀어야 할 양(게임 px). 인셋이 없거나 여유가 충분하면 0. */
export function bottomUiShift(scene: Phaser.Scene): number {
  return edgeShift(frameInset(scene) + BOTTOM_UI_GAP, safeAreaInsets(scene).bottom);
}

/**
 * 코드로 그린 HUD 묶음을 통째로 세로 이동. 컨테이너로 감싸지 않는 이유는 **Container 자식이
 * depth 로 자동 정렬되지 않기** 때문이다(전 게임 공통 함정) — 오브젝트 y 만 옮긴다.
 */
export function shiftObjectsY(objects: readonly Phaser.GameObjects.GameObject[], dy: number): void {
  if (dy === 0) return;
  for (const o of objects) {
    const t = o as unknown as { y?: number };
    if (typeof t.y === 'number') t.y += dy;
  }
}
