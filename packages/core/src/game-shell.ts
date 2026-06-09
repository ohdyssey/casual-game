/**
 * Game shell — 모든 캐쥬얼게임의 Phaser 부트스트랩. 피싱 `main.js` 의 반응형 로직을
 * 일반화한 공용 진입점. 게임은 GameModule 하나만 넘기면 셸이 캔버스·스케일·폰트·PWA 를 처리.
 *
 * P0~P1: 게임이 자체 scene 배열을 넘긴다(M4 — 라우팅 계약은 P2에 동결).
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, MAX_DESIGN_HEIGHT, COLORS } from './tokens.js';

export interface GameModule {
  /** 게임 식별자 (세이브 네임스페이스 <id>_v1 등에 사용). */
  id: string;
  title: string;
  /** 게임이 등록하는 씬 클래스 배열 (M4: P2 동결 전까지 게임-로컬). */
  scenes: Phaser.Types.Scenes.SceneType[];
  /** 캔버스 배경 (letterbox 톤). 기본 편의점 바닥 핑크. */
  backgroundColor?: string;
  /** 게임별 brand 색 override. */
  theme?: { brand?: string };
  // ── P2 에서 코어가 소비할 메타(P1 엔 게임-로컬 구현) ──
  hud?: Partial<Record<'coins' | 'gems' | 'timer' | 'combo' | 'lives', boolean>>;
  liveops?: { shop?: boolean; spin?: boolean; daily?: boolean };
  powerups?: string[];
}

/** 화면 비율에 맞춰 design height 동적 산출 — FIT 모드 letterbox 제거(피싱 계승). */
function computeDesignHeight(): number {
  const w = (typeof window !== 'undefined' && window.innerWidth) || GAME_WIDTH;
  const h = (typeof window !== 'undefined' && window.innerHeight) || GAME_HEIGHT;
  const adaptive = Math.round(GAME_WIDTH * (h / w));
  return Math.max(GAME_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, adaptive));
}

/** 캔버스 렌더 전 Jua 폰트 선로딩 (캔버스는 미로드 폰트를 폴백으로 굳혀버림). */
async function preloadFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Jua"', 'ABCabc0123'),
      fonts.load('400 24px "Jua"', '가나다라마바사'),
    ]);
    await fonts.ready;
  } catch {
    /* 실패 시 시스템 폴백 */
  }
}

/** GameModule 로 Phaser 게임 생성. 폰트 선로딩 후 부팅. */
export async function createCasualGame(mod: GameModule): Promise<Phaser.Game> {
  await preloadFonts();

  const designHeight = computeDesignHeight();
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: mod.backgroundColor ?? COLORS.surfaceFloor,
    width: GAME_WIDTH,
    height: designHeight,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      parent: 'game-container',
      width: GAME_WIDTH,
      height: designHeight,
    },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: mod.scenes,
  };

  const game = new Phaser.Game(config);
  // 풀스크린 자동 진입은 하지 않는다(사용자 요청). PWA 설치 시에만 manifest display 적용.

  // DEV: 콘솔/자동화에서 게임 핸들 접근 (피싱 window.__game 계승).
  if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__game = game;

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => game.scale.refresh());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => game.scale.refresh(), 100);
    });
  }

  if (typeof document !== 'undefined') {
    document.querySelector('.loading')?.remove();
  }
  return game;
}
