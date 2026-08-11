/**
 * 스킬 바 — 하단 특수기 4버튼(Rally/Heal Wave/Attack Boost/Sumo Spirit).
 *   탭 → 시전 콜백. 마나 부족/쿨다운은 딤+회색 tint 로 표시.
 *   TODO(하네스 hints 기반) — 에디터에서 「버튼」 역할 저작 시 그쪽이 우선.
 */
import Phaser from 'phaser';
import { NODES } from '../../.pue-harness/generated/screens.js';
import { canCastAbility } from '../logic/abilities.js';
import { ABILITY_ORDER } from '../logic/roster.js';
import type { AbilityKind, BattleState } from '../logic/types.js';
import type { LayoutIndex } from './layoutLoader.js';

const M = NODES.MAIN;

/** 스킬 버튼 노드 — ABILITY_ORDER(rally/healWave/attackBoost/sumoSpirit) 순. */
const BUTTON_IDS = [M.LAYER_3_COPY20, M.LAYER_3_COPY21, M.LAYER_3_COPY22, M.LAYER_3_COPY23];

export class SkillBar {
  private readonly buttons: (Phaser.GameObjects.Image | undefined)[] = [];
  private lastState: BattleState | null = null;

  /** onCast 가 true 를 반환하면 시전 성공(펀치 연출). */
  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
    private readonly onCast: (kind: AbilityKind) => boolean,
  ) {
    ABILITY_ORDER.forEach((kind, i) => {
      const btn = layout.tryById<Phaser.GameObjects.Image>(BUTTON_IDS[i]);
      this.buttons.push(btn);
      if (!btn) return;
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.onTap(kind, btn));
    });
  }

  private onTap(kind: AbilityKind, btn: Phaser.GameObjects.Image): void {
    if (!this.lastState || !canCastAbility(this.lastState, kind)) {
      this.scene.tweens.add({ targets: btn, angle: { from: -3, to: 3 }, duration: 45, yoyo: true, repeat: 2 });
      return;
    }
    if (this.onCast(kind)) {
      // 펀치 — displaySize 를 직접 튕긴다(스케일은 setDisplaySize 기반).
      const { displayWidth, displayHeight } = btn;
      this.scene.tweens.add({
        targets: btn,
        displayWidth: { from: displayWidth * 1.12, to: displayWidth },
        displayHeight: { from: displayHeight * 1.12, to: displayHeight },
        duration: 160,
        ease: 'Back.Out',
      });
    }
  }

  update(state: BattleState): void {
    this.lastState = state;
    ABILITY_ORDER.forEach((kind, i) => {
      const btn = this.buttons[i];
      if (!btn) return;
      const ready = canCastAbility(state, kind);
      btn.setAlpha(ready ? 1 : 0.45);
      const cooling = state.timeMs < state.abilityReadyAtMs[kind];
      if (cooling) btn.setTint(0x8a8a8a);
      else btn.clearTint();
    });
  }
}
