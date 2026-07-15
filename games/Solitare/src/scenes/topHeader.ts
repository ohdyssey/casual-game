/**
 * topHeader.ts — 홈/플레이 **공통 상단 헤더**(코인 패널 UI_14_v2 + 통화 값 + 메뉴 버튼).
 *
 * 디자이너 home.json 헤더 디자인을 코드로 복제해 홈·플레이 두 씬에 **동일하게** 배치한다.
 * 통화 값은 디자인 의도(align:right)대로 **우측 정렬**(우측 기준 x 고정 → 큰 숫자는 왼쪽으로 늘어남)로 그린다.
 *   (buildLayout 이 텍스트를 항상 중앙정렬로 렌더해 큰 코인 값이 별 아이콘과 겹치던 문제를 여기서 해결.)
 */
import Phaser from 'phaser';

const PANEL_KEY = 'up_Solitare_UI_14_v2';
const CX = 540;
const CY = 90; // home.json layer_4 기준.
const DISP_W = 1018;
const DISP_H = 98;
// 각 통화 값의 **우측 기준 x**(home.json layer_5/copy/copy2).
const COIN_RIGHT_X = 448;
const STAR_RIGHT_X = 630;
const GEM_RIGHT_X = 825;
// 우측 메뉴(☰/⚙) 히트존 — 패널 이미지 안에 아이콘이 있어 투명 존을 얹는다.
const MENU_X = 993;
const MENU_W = 86;
const MENU_H = 86;

export interface TopHeader {
  setCoins(n: number): void;
  /** 다이아(젬) 값 갱신. */
  setDiamonds(n: number): void;
  /** 별(=레벨) 값 갱신. */
  setLevel(n: number): void;
  /** 다이아 아이콘 근처 좌표 — 수집 다이아가 회수될 목표점. */
  diamondAnchor: { x: number; y: number };
  /** 생성된 헤더 오브젝트들 — 카메라 스크롤 시 화면 고정(scrollFactor 0) 등에 사용. */
  objects: Phaser.GameObjects.GameObject[];
}

function valText(scene: Phaser.Scene, rightX: number, val: string, depth: number): Phaser.GameObjects.Text {
  const t = scene.add
    .text(rightX, CY, val, { fontFamily: '"Fredoka", "Jua", sans-serif', fontSize: '36px', color: '#ffc800', fontStyle: '700' })
    .setOrigin(1, 0.5) // 우측 정렬.
    .setDepth(depth);
  t.setStroke('#5a3210', 10);
  t.setShadow(2, 2, '#000000', 2, false, true);
  return t;
}

/** 상단 헤더(코인 패널 + 코인/별/다이아 값 + 메뉴 버튼)를 그린다. onMenu = 우측 메뉴 버튼 콜백. */
export function buildTopHeader(scene: Phaser.Scene, coins: number, diamonds: number, level: number, onMenu: () => void, depth = 1600): TopHeader {
  const objects: Phaser.GameObjects.GameObject[] = [];
  if (scene.textures.exists(PANEL_KEY)) {
    objects.push(scene.add.image(CX, CY, PANEL_KEY).setDisplaySize(DISP_W, DISP_H).setDepth(depth));
  }
  const coinText = valText(scene, COIN_RIGHT_X, coins.toLocaleString(), depth + 1);
  objects.push(coinText);
  const starText = valText(scene, STAR_RIGHT_X, `${level}`, depth + 1); // 별 = **현재 레벨**.
  objects.push(starText);
  const gemText = valText(scene, GEM_RIGHT_X, diamonds.toLocaleString(), depth + 1); // 다이아(젬).
  objects.push(gemText);
  objects.push(
    scene.add
      .zone(MENU_X, CY, MENU_W, MENU_H)
      .setInteractive({ useHandCursor: true })
      .setDepth(depth + 2)
      .on('pointerdown', onMenu),
  );
  return {
    setCoins: (n: number) => coinText.setText(n.toLocaleString()),
    setDiamonds: (n: number) => gemText.setText(n.toLocaleString()),
    setLevel: (n: number) => starText.setText(`${n}`),
    diamondAnchor: { x: GEM_RIGHT_X - 62, y: CY }, // 젬 아이콘 근처(값 왼쪽).
    objects,
  };
}
