/**
 * hudHeader.ts — **공용 상단 헤더(코인/스핀/라이프 + 메뉴)** — 디자이너 새 헤더(로비 blank_2.json) SSOT 와 동일 텍스처·좌표.
 *
 *   2026-06-30 재디자인(v7) = **단일 바** `up_SC_UI_42-1_v7` @540,78(1043×101) — 코인 / 스핀(배터리) / 라이프 아이콘·'+' 버튼·메뉴(햄버거)가
 *   바 아트에 베이크됨. 위에 값 텍스트만 얹는다(Russo One 38): 코인 @364(우측고정) · **스핀 @641(우측고정)** · 라이프 @848(중앙).
 *   메뉴는 별도 노드가 없어졌으므로 바 우측에 **투명 히트존**(onMenu 제공 시)으로 홈 기능을 유지.
 *
 *   ⭐**전체 게임화면 공통 헤더**(요청): 게임(PlayScene)·호텔(HotelScene)이 이 헬퍼로 로비와 동일한 헤더를 그린다.
 *   코인=공유 지갑(wallet)·**스핀=플레이어 상태(playerState)** 기준(전 화면 동일). 라이프는 미구현 placeholder.
 */
import Phaser from 'phaser';
import { loadCoins } from '../logic/wallet.js';
import { loadSpins } from '../logic/playerState.js';

const FONT = '"Russo One", "Jua", sans-serif';
const SIZE = 38; // blank_2 헤더 텍스트와 동일

// 디자이너 blank_2.json 헤더 노드와 1:1 좌표/텍스처(단일 바). ⭐2026-06-30 에디터 재변경(v8): 바 아트 교체(2번째 아이콘 젬→**배터리/스핀**) + 좌표 보정.
const PANEL = { key: 'up_SC_UI_42-1_v8', x: 540, y: 78, w: 1043, h: 103 };
const COIN_TXT = { x: 396, y: 77, originX: 1 }; // align=right (blank_2.json layer_4 SSOT)
const SPIN_TXT = { x: 666, y: 77, originX: 1 }; // ⭐스핀(배터리 아이콘, 바 아트에 베이크). align=right
const LIVES_TXT = { x: 871, y: 77, originX: 0.5 }; // align=center
// 메뉴(햄버거)는 바 아트에 베이크 — 별도 이미지 없이 바 우측에 투명 히트존만.
const MENU_HIT = { x: 987, y: 78, w: 104, h: 103 };

export interface HudHeaderOpts {
  /** 표시할 코인(생략 시 지갑에서 로드). */
  coins?: number;
  /** 스핀 표시(생략 시 플레이어 상태에서 로드). */
  spins?: number | string;
  /** 라이프 표시(생략 시 placeholder '5/5'). */
  lives?: number | string;
  /** 우상단 메뉴 탭 콜백(없으면 메뉴 히트존 미생성). */
  onMenu?: () => void;
  /** 헤더 깊이(기본 500). */
  depth?: number;
}

export interface HudHeader {
  coinText: Phaser.GameObjects.Text;
  setCoins(n: number): void;
  setSpins(v: number | string): void;
  setLives(v: number | string): void;
}

const fmtVal = (v: number | string): string => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v));

function headerText(scene: Phaser.Scene, x: number, y: number, txt: string, originX: number, depth: number): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, txt, { fontFamily: FONT, fontSize: `${SIZE}px`, color: '#ffffff', stroke: '#000000', strokeThickness: 1 })
    .setOrigin(originX, 0.5)
    .setLetterSpacing(-3)
    .setDepth(depth);
}

/** 공용 헤더를 그리고 핸들 반환. 코인=지갑(또는 opts.coins)·스핀=플레이어 상태(또는 opts.spins)·라이프=placeholder. */
export function buildHudHeader(scene: Phaser.Scene, opts: HudHeaderOpts = {}): HudHeader {
  const depth = opts.depth ?? 500;
  const coins = opts.coins ?? loadCoins();
  // 헤더 바(아이콘·'+'·메뉴 베이크).
  if (scene.textures.exists(PANEL.key)) {
    scene.add.image(PANEL.x, PANEL.y, PANEL.key).setDisplaySize(PANEL.w, PANEL.h).setDepth(depth);
  } else {
    scene.add.rectangle(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x6b4a2a, 0.92).setStrokeStyle(2, 0xffd34d).setDepth(depth);
  }
  // 값 텍스트(바 위).
  const coinText = headerText(scene, COIN_TXT.x, COIN_TXT.y, fmtVal(coins), COIN_TXT.originX, depth + 1);
  const spinText = headerText(scene, SPIN_TXT.x, SPIN_TXT.y, fmtVal(opts.spins ?? loadSpins()), SPIN_TXT.originX, depth + 1); // ⭐스핀=플레이어 상태(플레이 소모/적립 반영)
  const livesText = headerText(scene, LIVES_TXT.x, LIVES_TXT.y, fmtVal(opts.lives ?? '5/5'), LIVES_TXT.originX, depth + 1);
  // 메뉴(바 우측 베이크 햄버거) — 투명 히트존으로 홈 기능 유지.
  if (opts.onMenu) {
    scene.add
      .rectangle(MENU_HIT.x, MENU_HIT.y, MENU_HIT.w, MENU_HIT.h, 0xffffff, 0)
      .setDepth(depth + 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', opts.onMenu);
  }
  return {
    coinText,
    setCoins: (n: number) => coinText.setText(fmtVal(n)),
    setSpins: (v: number | string) => spinText.setText(fmtVal(v)),
    setLives: (v: number | string) => livesText.setText(fmtVal(v)),
  };
}
