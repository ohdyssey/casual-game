/**
 * checkBadge.ts — 「선택됨」 체크 표시.
 *
 * 체크 아트가 따로 없어 도형으로 그린다. 반지름 100 기준으로 그려 두고 `setScale` 로 크기를 맞춘다.
 * 색은 두 단계다 — 아직 다 못 채웠으면 **옅은 초록**, 필요한 만큼 다 채우면 **짙은 녹색**.
 */
import Phaser from 'phaser';

/** 그리는 기준 반지름 — 실제 크기는 scale 로 맞춘다. */
const UNIT_R = 100;
const EDGE = 0xffffff;

export type CheckTone = 'light' | 'strong';

const TONE_FILL: Record<CheckTone, number> = {
  light: 0x9ccc65,
  strong: 0x2e7d32,
};

export class CheckBadge {
  private readonly g: Phaser.GameObjects.Graphics;
  /** 지금 놓여 있어야 할 크기 — 튀어나오는 연출이 여기로 되돌아온다. */
  private targetScale = 1;
  private tone: CheckTone;

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
    tone: CheckTone = 'strong',
  ) {
    this.g = scene.add.graphics().setDepth(depth).setVisible(false);
    this.tone = tone;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    g.fillStyle(TONE_FILL[this.tone], 1);
    g.fillCircle(0, 0, UNIT_R);
    g.lineStyle(13, EDGE, 1);
    g.strokeCircle(0, 0, UNIT_R - 7);
    g.lineStyle(26, EDGE, 1);
    g.beginPath();
    g.moveTo(-48, 2);
    g.lineTo(-13, 42);
    g.lineTo(51, -42);
    g.strokePath();
  }

  /** 옅은 초록 ↔ 짙은 녹색. */
  setTone(tone: CheckTone): void {
    if (this.tone === tone) return;
    this.tone = tone;
    this.draw();
  }

  /** 반지름 `r` 로 (x, y) 에 놓는다. `duration` 을 주면 그만큼 미끄러져 간다(카드를 따라갈 때). */
  place(x: number, y: number, r: number, duration = 0): void {
    this.targetScale = r / UNIT_R;
    if (duration <= 0) {
      this.g.setPosition(x, y).setScale(this.targetScale);
      return;
    }
    this.scene.tweens.add({
      targets: this.g,
      x,
      y,
      scaleX: this.targetScale,
      scaleY: this.targetScale,
      duration,
      ease: 'Quad.easeOut',
    });
  }

  /** 톡 튀어나오며 나타난다. */
  show(): void {
    if (this.g.visible) return;
    const rest = this.targetScale;
    this.g.setVisible(true).setAlpha(0).setScale(rest * 0.4);
    this.scene.tweens.add({
      targets: this.g,
      alpha: 1,
      scaleX: rest,
      scaleY: rest,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  hide(): void {
    this.scene.tweens.killTweensOf(this.g);
    this.g.setVisible(false).setAlpha(1);
  }

  /** 카드처럼 같이 움직여야 할 때. */
  get object(): Phaser.GameObjects.Graphics {
    return this.g;
  }
}
