/**
 * itemShop.ts — **아이템샵 공용 모듈**(코인 팩·다이아 팩 상점 오버레이).
 *
 * PO 2026-07-29: "게임플레이시 숍메뉴에 접근할 수 있어야 함" — 예전엔 HomeScene 의 private 메서드라
 *   타워 화면에서만 열 수 있었다. 플레이 중에 부스터를 살 코인이 모자라도 홈으로 나갔다 돌아와야 했다.
 *   entryPopup.ts(진입 팝업 공용화)와 같은 방식으로 씬 밖으로 빼서 **어느 씬에서든** 같은 화면을 연다.
 *
 * 아트(`up_Solitare_UI_ItemShop`)에 팩·버튼이 그림으로 박혀 있어, 각 팩 위에 **투명 히트존**을 얹어 처리한다.
 *   열림/닫힘은 유기체(젤리) 연출(popupFx) — 이미지+히트존을 중심 기준 frame 컨테이너에 담아 통째로
 *   스케일하므로 애니 중에도 히트존이 그림과 함께 움직인다.
 */
import Phaser from 'phaser';
import { loadSave, writeSave } from '../save.js';
import { sfx } from '../audio.js';
import { popupOrganicIn, popupOrganicOut } from './popupFx.js';

const W = 1080;
const H = 2400;
const SHOP_KEY = 'up_Solitare_UI_ItemShop';

/** 팩 구성(데모) — 아트에 그려진 2×2 그리드 순서 그대로. */
const COIN_PACKS = [1000, 5000, 11000, 65000] as const;
const DIAMOND_PACKS = [30, 100, 300, 500] as const;

export interface ItemShopOpts {
  /** 재화 지급 후 호출 — 씬의 헤더/잔액 캐시를 갱신하라는 신호(코인 총액을 넘긴다). */
  readonly onCoins?: (total: number) => void;
  /** 다이아 지급 후 호출(다이아 총액). */
  readonly onDiamonds?: (total: number) => void;
  /** 토스트 출력 — 씬마다 구현이 달라 주입받는다. */
  readonly toast?: (msg: string) => void;
  /** 오버레이가 UI(고정) 카메라에만 보이도록 씬이 처리(홈은 월드/UI 듀얼 카메라). */
  readonly pin?: (layer: Phaser.GameObjects.Container) => void;
  readonly depth?: number;
}

/** 아이템샵을 연다. 아트가 없으면 "준비중" 폴백(탭하면 닫힘). */
export function openItemShop(scene: Phaser.Scene, opts: ItemShopOpts = {}): void {
  const layer = scene.add.container(0, 0).setDepth(opts.depth ?? 4500);
  opts.pin?.(layer);
  const dim = scene.add.rectangle(0, 0, W, H, 0x140a1e, 0.88).setOrigin(0, 0).setInteractive();
  layer.add(dim);

  if (!scene.textures.exists(SHOP_KEY)) {
    const t = scene.add
      .text(W / 2, H / 2, '아이템샵 준비중\n(탭하여 닫기)', { fontFamily: '"Jua", sans-serif', fontSize: '50px', color: '#fff', align: 'center' })
      .setOrigin(0.5)
      .setInteractive();
    t.on('pointerdown', () => layer.destroy());
    layer.add(t);
    return;
  }

  const frame = scene.add.container(W / 2, H / 2);
  layer.add(frame);
  const img = scene.add.image(0, 0, SHOP_KEY);
  const src = img.texture.getSourceImage() as { width: number; height: number };
  const dw = 880; // 가로폭 축소(화면보다 작게).
  const dh = dw * (src.height / src.width);
  img.setDisplaySize(dw, dh);
  frame.add(img);

  /** 정규화 좌표(이미지 대비)에 투명 히트존 — frame 중심 기준 상대 좌표. */
  const zone = (nx: number, ny: number, nw: number, nh: number, on: () => void): void => {
    const z = scene.add.zone((nx - 0.5) * dw, (ny - 0.5) * dh, nw * dw, nh * dh).setOrigin(0.5).setInteractive({ useHandCursor: true });
    z.on('pointerdown', on);
    frame.add(z);
  };

  let closing = false; // 닫힘 애니 중 재클릭 가드.
  const close = (): void => {
    if (closing) return;
    closing = true;
    sfx('level_close');
    popupOrganicOut(scene, dim, frame, () => layer.destroy());
  };

  const grantCoin = (amt: number): void => {
    const s = loadSave();
    s.coins += amt;
    writeSave(s);
    opts.onCoins?.(s.coins);
    sfx('coin_burst', { volume: 0.3 });
    opts.toast?.(`🪙 +${amt.toLocaleString()} (데모)`);
  };
  const grantDiamond = (amt: number): void => {
    const s = loadSave();
    s.diamonds = (s.diamonds ?? 0) + amt;
    writeSave(s);
    opts.onDiamonds?.(s.diamonds ?? 0);
    sfx('button');
    opts.toast?.(`💎 +${amt} (데모)`);
  };

  zone(0.86, 0.072, 0.12, 0.055, close); // 닫기(X) 우상단.
  // 코인 팩(2×2) — 그리드 좌상→우하 순서.
  const COIN_YS = [0.262, 0.456] as const;
  COIN_PACKS.forEach((amt, i) => zone(i % 2 === 0 ? 0.28 : 0.7, COIN_YS[Math.floor(i / 2)], 0.38, 0.15, () => grantCoin(amt)));
  // 다이아 팩(2×2).
  const GEM_YS = [0.7, 0.858] as const;
  DIAMOND_PACKS.forEach((amt, i) => zone(i % 2 === 0 ? 0.28 : 0.7, GEM_YS[Math.floor(i / 2)], 0.38, 0.14, () => grantDiamond(amt)));

  popupOrganicIn(scene, dim, frame); // 유기체(젤리) 열림 연출.
}
