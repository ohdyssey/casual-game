/**
 * topHeader.ts — 홈/플레이 **공통 상단 헤더**(코인 패널 UI_14_v2 + 통화 값 + 메뉴 버튼).
 *
 * 디자이너 home.json 헤더 디자인을 코드로 복제해 홈·플레이 두 씬에 **동일하게** 배치한다.
 * 정렬은 **에디터 저작값 그대로**(2026-07-19 수정) — home.json 을 보면 코인(layer_5)만 `align:"right"`이고
 *   레벨(layer_5_copy)·다이아(layer_5_copy2)는 `align:"center"`다. 예전엔 셋 다 우측정렬로 통일해 그렸는데
 *   (큰 코인 값이 아이콘과 안 겹치게 하려던 의도), 그 바람에 레벨·다이아까지 우측정렬로 밀려 어긋나 보였다 —
 *   코인만 우측정렬(긴 숫자 대비), 레벨·다이아는 중앙정렬로 각자 authored x 기준 그대로 그린다.
 */
import Phaser from 'phaser';
import { topUiShift } from '../ui/safeAreaUi.js';

// 2026-07-17 새 헤더(UI_14_v3): **좌측 LV 뱃지+레벨 · 중앙 코인 · 다이아 · 우측 종+메뉴** 레이아웃.
const PANEL_KEY = 'up_Solitare_UI_14_v3';
const CX = 540;
const BASE_CY = 90; // home.json layer_4 기준(세이프에어리어 반영 전).
const DISP_W = 1018;
const DISP_H = 104; // v3 종횡비(814×83 → 1018×104), home.json h=104 정합.
// 각 통화 값의 **에디터 authored x**(home.json layer_5*/copy*) — 정렬 방식은 각자 다름(아래 buildTopHeader 참고).
const LEVEL_X = 194; // LV 뱃지 옆 레벨 슬롯 — layer_5_copy(align:center).
const COIN_RIGHT_X = 612; // 중앙 코인 슬롯 — layer_5(align:right, 긴 숫자는 왼쪽으로 늘어남).
const GEM_X = 792; // 다이아 슬롯 — layer_5_copy2(align:center).
// 우측 아이콘 히트존(패널 이미지 안 아이콘 위에 투명 존). 종(알림) + 메뉴(☰).
const BELL_X = 918;
const MENU_X = 1005;
const ICON_W = 78;
const ICON_H = 82;

export interface TopHeader {
  setCoins(n: number): void;
  /** 다이아(젬) 값 갱신. */
  setDiamonds(n: number): void;
  /** 별(=레벨) 값 갱신. */
  setLevel(n: number): void;
  /** 다이아 아이콘 근처 좌표 — 수집 다이아가 회수될 목표점. */
  diamondAnchor: { x: number; y: number };
  /** 코인 아이콘 근처 좌표 — 수집 코인이 회수될 목표점. */
  coinAnchor: { x: number; y: number };
  /** 우측 종(알림) 히트존 — 선택. */
  bellZone?: Phaser.GameObjects.Zone;
  /** 생성된 헤더 오브젝트들 — 카메라 스크롤 시 화면 고정(scrollFactor 0) 등에 사용. */
  objects: Phaser.GameObjects.GameObject[];
}

function valText(scene: Phaser.Scene, x: number, cy: number, val: string, depth: number, align: 'right' | 'center'): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, cy, val, { fontFamily: '"Fredoka", "Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '36px', color: '#ffc800', fontStyle: '700' })
    .setOrigin(align === 'right' ? 1 : 0.5, 0.5)
    .setDepth(depth);
  t.setStroke('#5a3210', 10);
  t.setShadow(2, 2, '#000000', 2, false, true);
  return t;
}

/**
 * 상단 헤더(UI_14_v3 패널 + 레벨/코인/다이아 값 + 종·메뉴 버튼)를 그린다.
 *   onMenu = 우측 ☰ 메뉴 콜백. onBell = 종(알림) 콜백(선택 — 없으면 종 히트존 미생성).
 *   level 은 문자열도 받는다 — 보너스 라운드가 `10-1` 처럼 메인 레벨과 구분되는 라벨을 넘긴다(2026-07-27).
 */
export function buildTopHeader(scene: Phaser.Scene, coins: number, diamonds: number, level: number | string, onMenu: () => void, depth = 1600, onBell?: () => void, onProfile?: () => void): TopHeader {
  /**
   * **세이프에어리어 침범분**(노치·다이나믹 아일랜드)만큼 헤더 전체를 아래로. 표준 규칙대로
   * *침범한 만큼만* 밀고, 여유가 있으면 0이라 한 픽셀도 안 움직인다(`ui/safeAreaUi.ts`).
   * ⚠️ 생성 뒤에 y 를 옮기면 값 갱신(setCoins/setLevel)이 위치를 되돌린다 — 여기서 한 번에 반영한다.
   */
  const SA = topUiShift(scene);
  const CY = BASE_CY + SA;
  const objects: Phaser.GameObjects.GameObject[] = [];
  if (scene.textures.exists(PANEL_KEY)) {
    objects.push(scene.add.image(CX, CY, PANEL_KEY).setDisplaySize(DISP_W, DISP_H).setDepth(depth));
  }
  const starText = valText(scene, LEVEL_X, CY, `${level}`, depth + 1, 'center'); // 좌측 LV 뱃지 옆 = **현재 레벨**.
  objects.push(starText);
  const coinText = valText(scene, COIN_RIGHT_X, CY, coins.toLocaleString(), depth + 1, 'right'); // 긴 숫자 대비 우측정렬.
  objects.push(coinText);
  const gemText = valText(scene, GEM_X, CY, diamonds.toLocaleString(), depth + 1, 'center'); // 다이아(젬).
  objects.push(gemText);
  const menuZone = scene.add
    .zone(MENU_X, CY, ICON_W, ICON_H)
    .setInteractive({ useHandCursor: true })
    .setDepth(depth + 2)
    .on('pointerdown', onMenu);
  objects.push(menuZone);
  // **LV 뱃지 = 프로필 설정 입구**(PO 2026-08-23) — 리그·랭킹에 쓸 이름/얼굴을 여기서 정한다.
  //   레벨 숫자 슬롯(LEVEL_X)과 그 왼쪽 LV 뱃지를 함께 덮는 넓은 히트존.
  if (onProfile) {
    objects.push(
      scene.add
        .zone(LEVEL_X - 30, CY, 260, ICON_H)
        .setInteractive({ useHandCursor: true })
        .setDepth(depth + 2)
        .on('pointerdown', onProfile),
    );
  }
  let bellZone: Phaser.GameObjects.Zone | undefined;
  if (onBell) {
    bellZone = scene.add
      .zone(BELL_X, CY, ICON_W, ICON_H)
      .setInteractive({ useHandCursor: true })
      .setDepth(depth + 2)
      .on('pointerdown', onBell);
    objects.push(bellZone);
  }
  return {
    setCoins: (n: number) => coinText.setText(n.toLocaleString()),
    setDiamonds: (n: number) => gemText.setText(n.toLocaleString()),
    setLevel: (n: number) => starText.setText(`${n}`),
    diamondAnchor: { x: GEM_X, y: CY }, // 다이아 값 중앙정렬 위치(=아이콘 근처).
    coinAnchor: { x: COIN_RIGHT_X - 62, y: CY }, // 코인 아이콘 근처(우측정렬 값의 왼쪽).
    bellZone,
    objects,
  };
}
