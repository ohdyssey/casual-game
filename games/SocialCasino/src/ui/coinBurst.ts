/**
 * coinBurst.ts — 코인 드랍 연출(회전 스프라이트 입자 분수, **연속으로 콸콸 쏟아지는** 스트림).
 *
 * 요청 동작: "톡톡톡" 끊어 뱉는 게 아니라 **"최르르르" 한 줄기로 콸콸 쏟아지는** 흐름.
 *   - 파티클 이미터로 코인을 **짧은 간격(frequency)으로 연속 방출** → 끊김 없는 폭포수.
 *   - 베팅 대비 **배수가 높을수록 더 길게(duration) · 더 굵게(quantity)** 쏟아진다(과도할 정도로 많게).
 *   - 각 코인은 위로 솟구쳐(속도 -Y) 중력으로 좌우로 흩어지며 낙하(분수형), 회전 스프라이트(6프레임) 재생.
 *
 * 파티클은 풀링되어 수백 개도 가볍다(이전 tween 스프라이트 대비). onChime 으로 코인음을 흐름에 맞춰 겹친다.
 */
import Phaser from 'phaser';
import { COIN_SHEET_KEY, COIN_FRAMES } from '../assets.js';

const ANIM_KEY = 'coin_spin';
const GRAVITY = 2600; // px/s² — 낙하 가속도(아래로 끌어내려 분수 호 형성)
const STREAM_FREQ = 30; // ms — 방출 간격(작을수록 촘촘한 한 줄기). 끊김 없는 "최르르르".
const SCALE_MIN = 0.32; // 코인 표시 크기(작게, 기존 1.3배 반영)
const SCALE_MAX = 0.5;
const LIFE_MIN = 850; // ms — 입자 수명(솟았다 낙하)
const LIFE_MAX = 1200;

export class CoinBurst {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;

  constructor(scene: Phaser.Scene, depth = 250) {
    this.scene = scene;
    this.depth = depth;
    this.ensureAnim();
  }

  /**
   * 배수(amount/bet) → 쏟아지는 **길이(duration)** + **굵기(quantity, 방출당 코인 수)**.
   * 배수↑ → 더 길게·더 굵게(과도하게 많게). 순수 함수(검증 용이).
   */
  static streamPlan(amount: number, bet: number): { duration: number; quantity: number } {
    const mult = amount / Math.max(1, bet);
    const duration = Phaser.Math.Clamp(Math.round(450 + mult * 100), 550, 2600); // 0.55s ~ 2.6s
    const quantity = Phaser.Math.Clamp(Math.round(1.5 + mult * 0.14), 2, 7); // 방출당 2~7개
    return { duration, quantity };
  }

  /**
   * 슬롯 당첨 — [xLeft,xRight] 폭에서 코인이 **연속으로 콸콸 쏟아지는** 분수 스트림.
   * 배수가 높을수록 더 길게·더 굵게 흐른다. onChime 은 흐름 중 코인음을 일정 간격으로 겹쳐준다.
   */
  burstRowScaled(xLeft: number, xRight: number, y: number, amount: number, bet: number, onChime?: () => void): void {
    if (!this.scene.textures.exists(COIN_SHEET_KEY)) return;
    const { duration, quantity } = CoinBurst.streamPlan(amount, bet);

    const emitter = this.scene.add.particles(0, 0, COIN_SHEET_KEY, {
      x: { min: xLeft, max: xRight }, // 한 줄 폭 전체에서 흘러나옴
      y: { min: y - 8, max: y + 8 },
      anim: ANIM_KEY, // 입자마다 회전 스프라이트 재생
      lifespan: { min: LIFE_MIN, max: LIFE_MAX },
      speedX: { min: -340, max: 340 }, // 좌우로 흩어짐
      speedY: { min: -1320, max: -780 }, // 위로 솟구침(→ 중력으로 낙하 = 분수)
      gravityY: GRAVITY,
      scale: { min: SCALE_MIN, max: SCALE_MAX },
      frequency: STREAM_FREQ, // 촘촘한 연속 방출(끊김 없는 줄기)
      quantity,
      duration, // 이 시간 동안만 방출(이후 입자는 수명까지 낙하)
    });
    emitter.setDepth(this.depth);

    // 코인음을 흐름에 맞춰 일정 간격으로 겹쳐 "촤르르" 캐스케이드 느낌.
    if (onChime) {
      const ticks = Phaser.Math.Clamp(Math.round(duration / 240), 1, 8);
      for (let i = 0; i < ticks; i++) this.scene.time.delayedCall((i * duration) / ticks, onChime);
    }

    // 마지막 입자까지 낙하한 뒤 이미터 정리.
    this.scene.time.delayedCall(duration + LIFE_MAX + 100, () => emitter.destroy());
  }

  private ensureAnim(): void {
    if (this.scene.anims.exists(ANIM_KEY)) return;
    if (!this.scene.textures.exists(COIN_SHEET_KEY)) return;
    this.scene.anims.create({
      key: ANIM_KEY,
      frames: this.scene.anims.generateFrameNumbers(COIN_SHEET_KEY, { start: 0, end: COIN_FRAMES - 1 }),
      frameRate: 18,
      repeat: -1,
    });
  }
}
