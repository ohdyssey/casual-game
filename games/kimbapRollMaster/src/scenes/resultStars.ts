/**
 * resultStars.ts — 서빙 결과(별 1~3 / 실패) 표시.
 *
 * 별 아트가 아직 없어 도형으로 그린다(금색 채움 + 진한 테두리).
 * 빈 별 세 개를 먼저 깔고 얻은 만큼만 순서대로 튀어 오르게 채운다.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';
import { STAR_DEPTH } from './cookingNodes.js';

const STAR_COUNT = 3;
/**
 * 별이 다 뜬 뒤 그대로 붙잡아 두는 시간.
 * 점수·수익까지 읽어야 하는데 1초 남짓이면 눈에 담기도 전에 사라진다.
 */
const HOLD_MS = 2200;
const OUTER_R = 52;
const INNER_R = 24;
const GAP = 132;

const GOLD = 0xffc93c;
const GOLD_EDGE = 0x8a5a00;
const EMPTY = 0x000000;

/** 완벽한 김밥을 연달아 냈을 때 터지는 별가루 수 — 풀로 만들어 두고 돌려 쓴다. */
const SPARK_COUNT = 18;
const SPARK_R = 15;

export class ResultStars {
  private readonly empties: Phaser.GameObjects.Star[] = [];
  private readonly filled: Phaser.GameObjects.Star[] = [];
  private readonly sparks: Phaser.GameObjects.Star[] = [];
  private readonly message: Phaser.GameObjects.Text;
  private readonly combo: Phaser.GameObjects.Text;
  private readonly center: { readonly x: number; readonly y: number };

  constructor(
    private readonly scene: Phaser.Scene,
    center: { readonly x: number; readonly y: number },
  ) {
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = center.x + (i - (STAR_COUNT - 1) / 2) * GAP;
      this.empties.push(this.makeStar(x, center.y, EMPTY, 0.34));
      this.filled.push(this.makeStar(x, center.y, GOLD, 1));
    }
    this.message = scene.add
      .text(center.x, center.y + OUTER_R + 66, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: '46px',
        color: '#ffffff',
        stroke: '#4a2a0c',
        strokeThickness: 9,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(STAR_DEPTH + 1)
      .setVisible(false);
    this.center = { x: center.x, y: center.y };
    // 콤보 배너는 별 **위쪽**에 뜬다 — 아래는 점수·수익 줄이 이미 쓰고 있다.
    this.combo = scene.add
      .text(center.x, center.y - OUTER_R - 62, '', {
        fontFamily: GAME_FONT_FAMILY,
        fontStyle: GAME_FONT_STYLE,
        fontSize: '58px',
        color: '#ffe27a',
        stroke: '#7a3c00',
        strokeThickness: 11,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(STAR_DEPTH + 2)
      .setVisible(false);
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparks.push(
        scene.add
          .star(center.x, center.y, 5, SPARK_R * 0.45, SPARK_R, GOLD, 1)
          .setStrokeStyle(3, GOLD_EDGE, 0.8)
          .setDepth(STAR_DEPTH + 2)
          .setVisible(false),
      );
    }
  }

  private makeStar(x: number, y: number, color: number, alpha: number): Phaser.GameObjects.Star {
    return this.scene.add
      .star(x, y, 5, INNER_R, OUTER_R, color, alpha)
      .setStrokeStyle(5, GOLD_EDGE, 0.85)
      .setDepth(STAR_DEPTH)
      .setVisible(false);
  }

  /**
   * 별 `stars` 개를 하나씩 채우며 보여 준다. 완료되면 `onDone`.
   * `onStar` 는 별이 하나 채워질 때마다(1부터) 불린다 — 소리를 연출 타이밍에 맞추려면 여기서 받아야 한다.
   */
  show(stars: number, message: string, onDone?: () => void, onStar?: (step: number) => void): void {
    for (const s of this.empties) s.setVisible(true).setScale(1).setAlpha(0.34);
    for (const s of this.filled) s.setVisible(false).setScale(1);
    this.message.setText(message).setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.message, alpha: 1, duration: 220 });

    const earned = Phaser.Math.Clamp(Math.floor(stars), 0, STAR_COUNT);
    for (let i = 0; i < earned; i++) {
      const star = this.filled[i];
      if (!star) continue;
      star.setVisible(true).setScale(0.2).setAlpha(0);
      this.scene.tweens.add({
        targets: star,
        scale: 1,
        alpha: 1,
        duration: 260,
        delay: 140 + i * 200,
        ease: 'Back.easeOut',
        onStart: () => onStar?.(i + 1),
      });
    }
    const total = 140 + Math.max(1, earned) * 200 + 320 + HOLD_MS;
    this.scene.time.delayedCall(total, () => onDone?.());
  }

  /**
   * 완벽한 김밥을 **연달아** 냈을 때의 축하 — 콤보 배너가 튀어 오르고 별가루가 사방으로 퍼진다.
   * 별이 다 찬 뒤에 불러야 별 채우는 연출과 겹치지 않는다.
   */
  celebrate(combo: number): void {
    this.combo
      .setText(`완벽한 김밥 ${combo}연속!`)
      .setVisible(true)
      .setAlpha(0)
      .setScale(0.4)
      .setAngle(-6);
    this.scene.tweens.add({
      targets: this.combo,
      alpha: 1,
      scale: 1,
      angle: 0,
      duration: 320,
      ease: 'Back.easeOut',
    });
    // 배너는 살짝 떠오르다 사라진다 — 별보다 먼저 비켜 줘야 점수 줄이 읽힌다.
    this.scene.tweens.add({
      targets: this.combo,
      y: this.combo.y - 26,
      alpha: 0,
      duration: 520,
      delay: 1300,
      onComplete: () => {
        this.combo.setVisible(false).setY(this.center.y - OUTER_R - 62);
      },
    });

    for (const [i, spark] of this.sparks.entries()) {
      const angle = (Math.PI * 2 * i) / this.sparks.length + (combo % 2) * 0.18;
      const dist = 190 + (i % 3) * 54;
      this.scene.tweens.killTweensOf(spark);
      spark
        .setPosition(this.center.x, this.center.y)
        .setVisible(true)
        .setAlpha(1)
        .setScale(0.5)
        .setAngle(0);
      this.scene.tweens.add({
        targets: spark,
        x: this.center.x + Math.cos(angle) * dist,
        y: this.center.y + Math.sin(angle) * dist,
        angle: 220,
        scale: 1.1,
        alpha: 0,
        duration: 620 + (i % 4) * 70,
        delay: (i % 6) * 30,
        ease: 'Quad.easeOut',
        onComplete: () => spark.setVisible(false),
      });
    }
  }

  hide(): void {
    for (const s of [...this.empties, ...this.filled, ...this.sparks]) {
      this.scene.tweens.killTweensOf(s);
      s.setVisible(false);
    }
    for (const t of [this.message, this.combo]) {
      this.scene.tweens.killTweensOf(t);
      t.setVisible(false);
    }
    this.combo.setY(this.center.y - OUTER_R - 62);
  }
}
