/**
 * storeOverlays — 승/패 결과 + 데드락 오버레이 UI(StoreScene 에서 분리).
 * 씬과 콜백을 받아 패널/버튼을 그린다. 게임 로직 없음 — 표시 + 콜백 위임뿐(동작 보존).
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, strokeText } from '@casual/core';
import { sfx } from '../audio.js';

/** 오버레이 컨테이너 + 반투명 배경 + 흰 패널 공통 셋업. */
function overlayBase(scene: Phaser.Scene, panelW: number, panelH: number, panelTop: number, backdropAlpha = 0.55): Phaser.GameObjects.Container {
  sfx(scene, 'sfx_popup_open');
  const cy = GAME_HEIGHT / 2;
  const layer = scene.add.container(0, 0).setDepth(100);
  layer.add(scene.add.rectangle(GAME_WIDTH / 2, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, backdropAlpha).setInteractive());
  const panelBg = scene.add.graphics();
  panelBg.fillStyle(0xffffff, 1);
  panelBg.fillRoundedRect(GAME_WIDTH / 2 - panelW / 2, panelTop, panelW, panelH, 28);
  layer.add(panelBg);
  return layer;
}

export interface ResultOverlayOpts {
  title: string;
  /** 제목 외곽선 색(승=stateWin / 패=stateWarn). */
  color: string;
  subtitle: string;
  score: number;
  isWin: boolean;
  onRetry: () => void;
  onHome: () => void;
  onNext: () => void;
}

/** 승/패 결과 오버레이. 승=다시/홈/다음 3버튼, 패=다시/홈 2버튼. */
export function showResultOverlay(scene: Phaser.Scene, opts: ResultOverlayOpts): void {
  const cy = GAME_HEIGHT / 2;
  const panelW = opts.isWin ? 540 : 440;
  // 승리=배경 매칭 리플레이가 보이도록 덜 어둡게(0.4), 패배=표준(0.55).
  const layer = overlayBase(scene, panelW, 300, cy - 150, opts.isWin ? 0.4 : 0.55);

  layer.add(strokeText(scene, GAME_WIDTH / 2, cy - 80, opts.title, 42, { strokeColor: opts.color, strokeWidth: 7 }).setOrigin(0.5));
  layer.add(strokeText(scene, GAME_WIDTH / 2, cy - 16, `점수 ${opts.score}`, 28, { color: COLORS.hudText, strokeWidth: 0 }).setOrigin(0.5));
  if (opts.subtitle) {
    layer.add(strokeText(scene, GAME_WIDTH / 2, cy + 26, opts.subtitle, 26, { color: COLORS.brandGreen, strokeWidth: 0 }).setOrigin(0.5));
  }

  const button = (x: number, w: number, label: string, size: number, texKey: string, onClick: () => void): void => {
    const btn = scene.add.image(x, cy + 100, texKey).setOrigin(0.5);
    btn.setDisplaySize(w, 60);
    layer.add(btn);
    layer.add(strokeText(scene, x, cy + 96, label, size, { strokeWidth: 0 }).setOrigin(0.5));
    layer.add(
      scene.add
        .zone(x, cy + 100, w, 60)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sfx(scene, 'sfx_button_tap');
          onClick();
        }),
    );
  };

  if (opts.isWin) {
    button(GAME_WIDTH / 2 - 170, 150, '🔄 다시', 20, 'ui_btn_yellow', opts.onRetry);
    button(GAME_WIDTH / 2, 150, '🏠 홈', 22, 'ui_btn_blue', opts.onHome);
    button(GAME_WIDTH / 2 + 170, 150, '➡️ 다음', 20, 'ui_btn_yellow', opts.onNext);
  } else {
    button(GAME_WIDTH / 2 - 100, 170, '🔄 다시', 22, 'ui_btn_yellow', opts.onRetry);
    button(GAME_WIDTH / 2 + 100, 170, '🏠 홈', 24, 'ui_btn_blue', opts.onHome);
  }
}

export interface DeadlockOverlayOpts {
  onShuffle: () => void;
  onRetry: () => void;
}

/** 데드락(셔플 유도) 오버레이. 셔플/다시 2버튼 — 클릭 시 패널 닫고 콜백. */
export function showDeadlockOverlay(scene: Phaser.Scene, opts: DeadlockOverlayOpts): void {
  const cy = GAME_HEIGHT / 2;
  const layer = overlayBase(scene, 480, 340, cy - 170);

  layer.add(strokeText(scene, GAME_WIDTH / 2, cy - 90, '풀 수 없는 상태입니다!', 32, { strokeColor: COLORS.stateWarn, strokeWidth: 7 }).setOrigin(0.5));
  layer.add(strokeText(scene, GAME_WIDTH / 2, cy - 25, '더 이상 진행할 수 없습니다.', 22, { color: COLORS.hudText, strokeWidth: 0 }).setOrigin(0.5));
  layer.add(strokeText(scene, GAME_WIDTH / 2, cy + 10, '셔플하거나 다시 시작해 주세요.', 20, { color: '#888888', strokeWidth: 0 }).setOrigin(0.5));

  const button = (x: number, texKey: string, label: string, onClick: () => void): void => {
    const btn = scene.add.image(x, cy + 95, texKey).setOrigin(0.5);
    btn.setDisplaySize(160, 60);
    layer.add(btn);
    layer.add(strokeText(scene, x, cy + 91, label, 22, { strokeWidth: 0 }).setOrigin(0.5));
    layer.add(
      scene.add
        .zone(x, cy + 95, 160, 60)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sfx(scene, 'sfx_button_tap');
          layer.destroy();
          onClick();
        }),
    );
  };

  button(GAME_WIDTH / 2 - 110, 'ui_btn_yellow', '🔀 셔플', opts.onShuffle);
  button(GAME_WIDTH / 2 + 110, 'ui_btn_blue', '🔄 다시', opts.onRetry);
}
