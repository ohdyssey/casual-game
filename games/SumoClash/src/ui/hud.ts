/**
 * HUD 바인딩 — 에디터 레이아웃의 마나/본진 HP 노드를 잡아 런타임 값으로 갱신한다.
 *   게이지 필(017-3/017-4)은 이미지이므로 setCrop 좌측 크롭으로 비율을 표현한다
 *   (프레임 이미지는 그대로 두고 필만 줄어드는 구조 — 에셋 분리 저작을 그대로 활용).
 */
import type Phaser from 'phaser';
import { NODES } from '../../.pue-harness/generated/screens.js';
import type { BattleState } from '../logic/types.js';
import type { LayoutIndex } from './layoutLoader.js';

/** 이미지 게이지 — 텍스처 원본 폭 기준 좌측 크롭. */
function asCroppedGauge(img: Phaser.GameObjects.Image): (ratio: number) => void {
  const src = img.texture.getSourceImage() as { width: number; height: number };
  return (ratio: number) => {
    const r = Math.max(0, Math.min(1, ratio));
    img.setCrop(0, 0, src.width * r, src.height);
    img.setVisible(r > 0.004);
  };
}

export class Hud {
  private readonly manaText: Phaser.GameObjects.Text | undefined;
  private readonly enemyHpText: Phaser.GameObjects.Text | undefined;
  private readonly enemyGauge: ((r: number) => void) | undefined;
  private readonly allyGauge: ((r: number) => void) | undefined;

  constructor(layout: LayoutIndex) {
    const M = NODES.MAIN;
    // tryById — 디자인 개편으로 노드가 빠져도 게임이 죽지 않게 방어.
    this.manaText = layout.tryById<Phaser.GameObjects.Text>(M.LAYER_2);
    this.enemyHpText = layout.tryById<Phaser.GameObjects.Text>(M.LAYER_6);
    const enemyFill = layout.tryById<Phaser.GameObjects.Image>(M.LAYER_3_COPY38);
    const allyFill = layout.tryById<Phaser.GameObjects.Image>(M.LAYER_3_COPY37);
    this.enemyGauge = enemyFill ? asCroppedGauge(enemyFill) : undefined;
    this.allyGauge = allyFill ? asCroppedGauge(allyFill) : undefined;
  }

  update(state: BattleState): void {
    this.manaText?.setText(String(Math.floor(state.mana)));
    this.enemyHpText?.setText(String(Math.ceil(state.enemyBaseHp)));
    this.enemyGauge?.(state.enemyBaseHp / state.enemyBaseHpMax);
    this.allyGauge?.(state.allyBaseHp / state.allyBaseHpMax);
  }
}
