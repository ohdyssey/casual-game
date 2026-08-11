/**
 * conditionBadge.ts — 「필수」·「금지」를 뜻하는 표식.
 *
 * 재료 그림이 아니라 **조건 자체**를 나타내는 기호다 — 필수는 체크, 금지는 통행금지 표지.
 * 아트가 따로 없어 도형으로 그리고, 초록/빨강 바탕 위에 얹히므로 흰 선만 쓴다.
 * 반지름 100 기준으로 한 번 그려 두고 `setScale` 로 크기를 맞춘다.
 */
import type Phaser from 'phaser';

const UNIT_R = 100;
const LINE = 0xffffff;

export type ConditionKind = 'required' | 'forbidden';

export class ConditionBadge {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number, kind: ConditionKind) {
    const g = scene.add.graphics().setDepth(depth).setVisible(false);
    if (kind === 'required') {
      // ✔ — 넣어야 하는 것.
      g.lineStyle(26, LINE, 1);
      g.beginPath();
      g.moveTo(-52, 4);
      g.lineTo(-14, 46);
      g.lineTo(56, -46);
      g.strokePath();
    } else {
      // 🚫 — 넣으면 안 되는 것. 테두리 원에 대각선 하나.
      g.lineStyle(22, LINE, 1);
      g.strokeCircle(0, 0, 58);
      g.beginPath();
      g.moveTo(-41, 41);
      g.lineTo(41, -41);
      g.strokePath();
    }
    this.g = g;
  }

  /** 반지름 `r` 로 (x, y) 에 놓는다. */
  place(x: number, y: number, r: number): void {
    this.g.setPosition(x, y).setScale(r / UNIT_R);
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
  }
}
