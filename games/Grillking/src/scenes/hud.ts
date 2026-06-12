/**
 * HUD — 에디터 레이아웃의 바인딩 텍스트/게이지를 실데이터에 연결.
 *   progress(11/42)·time(02:48)·multiplier(X5)·gold(1540)·value(접시 수) + 레벨 배지.
 */
import type Phaser from 'phaser';
import { LayoutIndex, asLeftGauge } from '../ui/layoutLoader.js';

const IDS = {
  time: 'layer_19',
  gold: 'layer_19_copy',
  progress: 'layer_19_copy2',
  mult: 'layer_19_copy3',
  dishes: 'layer_19_copy4',
  progressGauge: 'layer_20',
  multGaugeFill: 'layer_20_copy2',
  clocheLid: 'layer_17_copy',
} as const;

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly goldText: Phaser.GameObjects.Text;
  private readonly progressText: Phaser.GameObjects.Text;
  private readonly multText: Phaser.GameObjects.Text;
  private readonly dishesText: Phaser.GameObjects.Text;
  private readonly progressGauge: ReturnType<typeof asLeftGauge>;
  private readonly multGauge: ReturnType<typeof asLeftGauge>;
  private readonly clocheLid: Phaser.GameObjects.Image;
  private readonly clocheBaseY: number;
  private warned = false;

  constructor(
    private readonly scene: Phaser.Scene,
    layout: LayoutIndex,
    level: number,
  ) {
    this.timeText = layout.byId<Phaser.GameObjects.Text>(IDS.time);
    this.goldText = layout.byId<Phaser.GameObjects.Text>(IDS.gold);
    this.progressText = layout.byId<Phaser.GameObjects.Text>(IDS.progress);
    this.multText = layout.byId<Phaser.GameObjects.Text>(IDS.mult);
    this.dishesText = layout.byId<Phaser.GameObjects.Text>(IDS.dishes);
    this.progressGauge = asLeftGauge(layout.byId<Phaser.GameObjects.Rectangle>(IDS.progressGauge));
    this.multGauge = asLeftGauge(layout.byId<Phaser.GameObjects.Rectangle>(IDS.multGaugeFill));
    this.clocheLid = layout.byId<Phaser.GameObjects.Image>(IDS.clocheLid);
    this.clocheBaseY = this.clocheLid.y;

    // 레벨 배지 — 어닝 좌측(디자인 여백)에 작은 텍스트.
    scene.add
      .text(64, 47, `Lv.${level}`, { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '28px', color: '#fff3da' })
      .setStroke('#7a2b16', 5)
      .setOrigin(0.5)
      .setDepth(24);
  }

  setTime(sec: number): void {
    this.timeText.setText(formatClock(sec));
    if (sec <= 30) {
      this.timeText.setColor('#ff5544');
      if (!this.warned) {
        this.warned = true;
        this.scene.tweens.add({ targets: this.timeText, scale: { from: 1.3, to: 1 }, duration: 300 });
      }
    } else {
      this.warned = false;
      this.timeText.setColor('#2eff7e');
    }
  }

  setProgress(served: number, target: number): void {
    this.progressText.setText(`${served}/${target}`);
    this.progressGauge.setRatio(target > 0 ? served / target : 0);
  }

  setCoins(coins: number): void {
    this.goldText.setText(String(coins));
  }

  /** 배수 + 잔여 콤보 게이지(0..1). */
  setMultiplier(mult: number, ratio: number): void {
    this.multText.setText(`X${mult}`);
    this.multGauge.setRatio(mult > 1 ? ratio : 0);
  }

  /** 접시 수 갱신 + 클로슈 바운스. */
  setDishes(dishes: number, bounce: boolean): void {
    this.dishesText.setText(String(dishes));
    if (!bounce) return;
    this.scene.tweens.killTweensOf(this.clocheLid);
    this.clocheLid.setY(this.clocheBaseY);
    this.scene.tweens.add({
      targets: this.clocheLid,
      y: this.clocheBaseY - 16,
      duration: 130,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** 매치 펄스 — 진행 텍스트 강조. */
  pulseProgress(): void {
    this.scene.tweens.add({ targets: this.progressText, scale: { from: 1.35, to: 1 }, duration: 260 });
  }
}
