/**
 * shopPopup — 상점 오버레이(코인 팩). Solitare 의 itemShop.ts 를 본뜬 구조(사용자 요청: "쇼핑창은
 * Solitaire Height를 참고") — dim + 중앙 카드 프레임 + 팩 행 + 우상단 X, 열림은 팝인 연출.
 *
 * 차이점: Solitare 는 상점 전체가 한 장의 아트(팩·버튼이 그림에 박힘)라 투명 히트존을 얹지만,
 * 홈런팝엔 상점 전용 아트가 없다 — 결과화면용 카드 프레임(up_Homerun_UI_14)을 배경으로 쓰고
 * 팩 행은 코드로 그린다(공통에셋 코인 아이콘 + 파란 바). 인앱결제가 아직 없어 지급은 데모(무료)
 * — Solitare 와 같은 정책("(데모)" 표기).
 */
import Phaser from 'phaser';
import { FONT } from '@casual/core';
import { ICON_CLOSE_KEY, ICON_COIN_KEY } from '../assets.js';
import { addCoins } from '../logic/economy.js';
import { formatLeagueNumber } from '../logic/league.js';
import { showToast } from '../toast.js';

const W = 1080;
const H = 2400;
/** 카드 프레임 아트(결과화면용 재활용, 569×759). */
const FRAME_KEY = 'up_Homerun_UI_14';
/** 카드 표시 폭 — Solitare(880)와 비슷한 체감. 높이는 원본 비율. */
const FRAME_W = 860;
/** 코인 팩 구성(데모) — Solitare COIN_PACKS 와 같은 급간. */
const COIN_PACKS = [1000, 5000, 11000, 65000] as const;
const IN_MS = 240;
const OUT_MS = 180;

export interface ShopPopupOpts {
  /** 지급 후 호출 — 로비 잔액 표시 갱신 신호(새 총액). */
  readonly onCoins?: (total: number) => void;
  readonly depth?: number;
}

/** 상점을 연다. 열려 있는 동안 뒤쪽 입력은 dim 이 막는다. */
export function openShopPopup(scene: Phaser.Scene, opts: ShopPopupOpts = {}): void {
  const layer = scene.add.container(0, 0).setDepth(opts.depth ?? 4500).setScrollFactor(0);
  const dim = scene.add.rectangle(0, 0, W, H, 0x081226, 0.82).setOrigin(0, 0).setInteractive();
  layer.add(dim);

  const frame = scene.add.container(W / 2, H / 2);
  layer.add(frame);

  // 카드 프레임(없으면 코드 패널 폴백 — 진행을 막지 않는다).
  let fw = FRAME_W;
  let fh = Math.round((FRAME_W * 759) / 569);
  if (scene.textures.exists(FRAME_KEY)) {
    const img = scene.add.image(0, 0, FRAME_KEY);
    const src = img.texture.getSourceImage() as { width: number; height: number };
    fh = Math.round((fw * src.height) / src.width);
    img.setDisplaySize(fw, fh);
    frame.add(img);
  } else {
    frame.add(scene.add.rectangle(0, 0, fw, fh, 0xf4e6c8).setStrokeStyle(6, 0xc8912f));
  }

  // 제목 — 프레임 상단 파란 밴드 위.
  frame.add(
    scene.add
      .text(0, -fh * 0.335, '상점', { fontFamily: FONT.family, fontSize: '56px', color: '#ffffff' })
      .setStroke('#0a2540', 8)
      .setOrigin(0.5),
  );

  // 코인 팩 행 — 카드 본문(베이지 영역)에 세로로.
  const rowTop = -fh * 0.17;
  const rowGap = fh * 0.135;
  COIN_PACKS.forEach((amt, i) => {
    frame.add(buildPackRow(scene, fw, rowTop + rowGap * i, amt, () => {
      const total = addCoins(amt);
      opts.onCoins?.(total);
      showToast(`🪙 +${formatLeagueNumber(amt)} (데모)`);
    }));
  });

  // 닫기(X) — 우상단.
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    scene.tweens.add({ targets: [frame, dim], alpha: 0, scale: 0.92, duration: OUT_MS, ease: 'Cubic.easeIn', onComplete: () => layer.destroy() });
  };
  const closeBtn = scene.textures.exists(ICON_CLOSE_KEY)
    ? scene.add.image(fw / 2 - 24, -fh / 2 + 24, ICON_CLOSE_KEY).setDisplaySize(84, 84)
    : scene.add.text(fw / 2 - 24, -fh / 2 + 24, '✕', { fontFamily: FONT.family, fontSize: '52px', color: '#ffffff' }).setOrigin(0.5);
  closeBtn.setInteractive({ useHandCursor: true });
  closeBtn.on('pointerup', close);
  frame.add(closeBtn);
  dim.on('pointerup', close); // 바깥 탭으로도 닫힘.

  // 팝인 — Solitare 의 유기체 연출 대신 가벼운 Back 팝(홈런팝 기존 팝업들과 같은 톤).
  frame.setScale(0.85).setAlpha(0);
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: IN_MS });
  scene.tweens.add({ targets: frame, alpha: 1, scale: 1, duration: IN_MS, ease: 'Back.easeOut' });
}

/** 코인 팩 한 행 — [코인아이콘  +N,NNN]  [받기] 모양의 파란 바 버튼. */
function buildPackRow(scene: Phaser.Scene, frameW: number, y: number, amount: number, onBuy: () => void): Phaser.GameObjects.Container {
  const row = scene.add.container(0, y);
  const barW = frameW * 0.72;
  const barH = 96;
  const bar = scene.add.rectangle(0, 0, barW, barH, 0x1e88e5).setStrokeStyle(4, 0xffffff, 0.85);
  bar.setInteractive({ useHandCursor: true });
  bar.on('pointerdown', () => row.setScale(0.97));
  bar.on('pointerout', () => row.setScale(1));
  bar.on('pointerup', () => {
    row.setScale(1);
    onBuy();
  });
  row.add(bar);
  if (scene.textures.exists(ICON_COIN_KEY)) {
    row.add(scene.add.image(-barW / 2 + 58, 0, ICON_COIN_KEY).setDisplaySize(64, 64));
  }
  row.add(
    scene.add
      .text(-barW / 2 + 104, 0, `+${formatLeagueNumber(amount)}`, { fontFamily: FONT.family, fontSize: '40px', color: '#ffffff' })
      .setOrigin(0, 0.5),
  );
  row.add(
    scene.add
      .text(barW / 2 - 36, 0, '무료(데모)', { fontFamily: FONT.family, fontSize: '28px', color: '#ffe14d' })
      .setOrigin(1, 0.5),
  );
  return row;
}
