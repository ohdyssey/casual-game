/**
 * newHeader.ts — 신 공용 헤더(up_NewUI_04-*, main_copy grp_4 와 동일 아트·좌표) — 로비/게임 **전 화면 통일**용.
 *
 * 구성: 금액패널 + 코인 아이콘 + 코인 텍스트(우측정렬) + 스타 + 방패 + 금액+ + 햄버거 메뉴.
 *   좌표는 1080×2400 기준(main_copy grp_4 실측). 텍스처는 매니페스트로 이미 적재됨(LoadScene).
 *   게임화면은 main_copy 레이아웃 노드로 직접 렌더하고, **로비는 이 코드 헤더로 동일 룩을 재현**한다.
 */
import Phaser from 'phaser';
import { loadCoins } from '../logic/wallet.js';

export interface NewHeader {
  readonly coinText: Phaser.GameObjects.Text;
  setCoins(n: number): void;
}

/** 신 헤더가 쓰는 텍스처 키 — 매니페스트를 거치지 않는 화면(로비 직접진입 등)에서 누락 방지용 직접 적재 목록. */
export const NEW_HEADER_KEYS: ReadonlyArray<string> = [
  'up_NewUI_04-1',
  'up_NewUI_04-2',
  'up_NewUI_04-3_v2',
  'up_NewUI_04-4',
  'up_NewUI_04-5',
  'up_NewUI_04-6',
];

const DEPTH = 600; // 게임/로비 요소 위

const fmt = (n: number): string => Math.max(0, Math.round(n)).toLocaleString('en-US');

/** 좌/우 세로 메뉴(main_copy grp_5 우메뉴 · grp_6 좌메뉴)의 아이콘 키·좌표(1080×2400 실측). */
interface SideMenuItem {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
const SIDE_MENU_LAYOUT: ReadonlyArray<SideMenuItem> = [
  { key: 'up_NewUI_07-1', x: 982, y: 257, w: 155, h: 152 }, // 우: 일일리그 순위
  { key: 'up_NewUI_07-2', x: 982, y: 455, w: 155, h: 171 },
  { key: 'up_NewUI_07-3', x: 982, y: 654, w: 155, h: 158 },
  { key: 'up_NewUI_07-4', x: 985, y: 856, w: 162, h: 137 },
  { key: 'up_NewUI_07-5', x: 88, y: 248, w: 131, h: 134 }, // 좌: 아이템샵
  { key: 'up_NewUI_07-6', x: 88, y: 436, w: 131, h: 126 },
  { key: 'up_NewUI_07-7', x: 88, y: 624, w: 131, h: 129 },
  { key: 'up_NewUI_07-8', x: 88, y: 812, w: 131, h: 126 },
];

/** 세로 메뉴 텍스처 키(누락 방지 직접 적재용). */
export const SIDE_MENU_KEYS: ReadonlyArray<string> = SIDE_MENU_LAYOUT.map((i) => i.key);

/** ⭐좌/우 세로 메뉴를 배치(요청: 게임 로비화면에 좌우 세로 메뉴). 생성된 아이콘 이미지를 key→Image 로 반환(호출부가 배선). */
export function buildSideMenus(scene: Phaser.Scene, depth = 590): Record<string, Phaser.GameObjects.Image> {
  const out: Record<string, Phaser.GameObjects.Image> = {};
  for (const it of SIDE_MENU_LAYOUT) {
    if (!scene.textures.exists(it.key)) continue;
    out[it.key] = scene.add.image(it.x, it.y, it.key).setDisplaySize(it.w, it.h).setDepth(depth);
  }
  return out;
}

/** 신 헤더를 그린다(코인=공유 지갑 기본). onMenu 지정 시 햄버거 탭 배선. */
export function buildNewHeader(
  scene: Phaser.Scene,
  opts: { coins?: number; star?: string; onMenu?: () => void } = {},
): NewHeader {
  const img = (key: string, x: number, y: number, w: number, h: number, depth = DEPTH): Phaser.GameObjects.Image | undefined =>
    scene.textures.exists(key) ? scene.add.image(x, y, key).setDisplaySize(w, h).setDepth(depth) : undefined;

  img('up_NewUI_04-2', 319, 74, 512, 93); // 금액패널(바)
  img('up_NewUI_04-1', 76, 71, 107, 118, DEPTH + 2); // 금액라벨(코인 아이콘)
  img('up_NewUI_04-5', 819, 74, 205, 86); // 방패
  img('up_NewUI_04-4', 647, 64, 97, 90, DEPTH + 1); // 스타
  img('up_NewUI_04-3_v2', 529, 74, 63, 63, DEPTH + 2); // 금액+
  const menu = img('up_NewUI_04-6', 1006, 74, 96, 98, DEPTH + 2); // 햄버거 메뉴

  const coinText = scene.add
    .text(493, 70, fmt(opts.coins ?? loadCoins()), {
      fontFamily: '"Luckiest Guy", "Do Hyeon", sans-serif',
      fontSize: '40px',
      color: '#ffffff',
      stroke: '#2a1640',
      strokeThickness: 6,
    })
    .setOrigin(1, 0.5)
    .setDepth(DEPTH + 3);
  scene.add
    .text(645, 100, opts.star ?? '256', {
      fontFamily: '"Luckiest Guy", sans-serif',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#2a1640',
      strokeThickness: 5,
    })
    .setOrigin(0.5)
    .setDepth(DEPTH + 3);

  if (opts.onMenu && menu) menu.setInteractive({ useHandCursor: true }).on('pointerdown', opts.onMenu);

  return {
    coinText,
    setCoins: (n: number): void => {
      coinText.setText(fmt(n));
    },
  };
}
