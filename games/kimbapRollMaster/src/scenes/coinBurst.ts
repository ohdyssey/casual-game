/**
 * coinBurst.ts — **손님이 값을 치른다.** 접시가 손님에게 닿는 순간 그 자리에서 코인이 튀어올랐다
 * 떨어지며 사라지고, 받은 금액이 금빛 `+$N` 으로 떠오른다.
 *
 * 연출은 **솔리테어(`games/Solitare`)의 손님 코인 드랍**을 그대로 가져온 것이다
 * (`Solitare/src/scenes/customers.ts` 의 `dropCoins`) — 회전 프레임 6장, 살짝 튀었다 떨어지기,
 * 한 개씩 늦춰 뿌리기, 금빛 `+N` 이 떠오르며 사라지기. 코인 그림도 그 프로젝트에서 반입했다
 * (`public/game/coin/coin_1~6.png`, 원본 `Solitare/public/order/coin/Coin_01-N.png`).
 *
 * ⚠️ **잔고 숫자만 바뀌는 것으로는 「벌었다」가 안 읽힌다.** 화면 맨 위 작은 숫자가 조용히 오르는 것뿐이라
 * 별을 보고 있으면 놓친다. 돈이 **어디서 나와서** 들어오는지가 손님 자리에서 보여야 한다.
 *
 * ⚠️ 손해(실패·이탈)에는 쓰지 않는다 — 코인이 떨어지는 그림은 어떻게 그려도 「벌었다」로 읽힌다.
 */
import Phaser from 'phaser';
import { GAME_FONT_FAMILY, GAME_FONT_STYLE } from '../ui/font.js';

/** 회전 프레임 6장. */
export const COIN_KEYS: readonly string[] = Array.from({ length: 6 }, (_, i) => `game_coin_${i + 1}`);
export const COIN_FILES: ReadonlyArray<readonly [string, string]> = COIN_KEYS.map(
  (key, i) => [key, `game/coin/coin_${i + 1}.png`] as const,
);
const COIN_SPIN = 'kimbapCoinSpin';

/** 코인 표시 높이(디자인 px). 원본 프레임 높이는 ~148 이다. */
const COIN_H = 66;
const FRAME_H = 148;

/** 몇 개를 뿌릴까 — 많이 벌수록 더 쏟아진다. 그래야 「이번엔 크게 벌었다」가 눈에 온다. */
const COINS = { min: 3, max: 9, perDollar: 1 / 3 } as const;

const TOSS = {
  /** 튀어오르는 데 걸리는 시간. */
  upMs: 340,
  /** 떨어지는 데 걸리는 시간. */
  fallMs: 560,
  /** 한 개씩 늦춰 뿌리는 간격 — 한꺼번에 터지면 한 덩어리로 보인다. */
  stepMs: 80,
  /** 옆으로 흩어지는 폭. */
  spreadX: 96,
  /** 살짝만 튀어오른다 — 높이 솟으면 카드·손님 얼굴을 가린다. */
  peakY: [28, 82] as const,
  /** 떨어져 사라지는 깊이. */
  fallY: [180, 300] as const,
} as const;

const AMOUNT = {
  fontSize: '52px',
  color: '#ffd23f',
  stroke: '#5a3210',
  strokeWidth: 8,
  riseY: 96,
  riseMs: 620,
  holdMs: 700,
  fadeMs: 340,
} as const;

/**
 * 회전 애니를 한 번만 등록한다. 그림 6장이 다 와 있어야 만든다 —
 * 없으면 `burstCoins` 가 조용히 아무 일도 하지 않는다(연출이 없다고 게임이 막히면 안 된다).
 */
export function registerCoinSpin(scene: Phaser.Scene): void {
  if (scene.anims.exists(COIN_SPIN)) return;
  if (!COIN_KEYS.every((k) => scene.textures.exists(k))) return;
  scene.anims.create({
    key: COIN_SPIN,
    frames: COIN_KEYS.map((key) => ({ key })),
    frameRate: 14,
    repeat: -1,
  });
}

export interface CoinBurstOptions {
  /** 터지는 자리(디자인 좌표) — 접시가 손님에게 닿는 지점이다. */
  readonly x: number;
  readonly y: number;
  /** 받은 금액. `+$N` 으로 뜨고, 코인 개수도 여기서 나온다. */
  readonly amount: number;
  /** 코인 층. 접시(130)보다 위, 결과 별(220)보다 아래에 둔다. */
  readonly depth: number;
}

/**
 * 코인을 뿌린다. **금액이 0 이하면 아무것도 하지 않는다** — 손해를 코인으로 그리면 뜻이 뒤집힌다.
 * 뿌린 코인은 스스로 사라지므로 부를 쪽에서 치울 것이 없다.
 */
export function burstCoins(scene: Phaser.Scene, opts: CoinBurstOptions): void {
  const { x, y, amount, depth } = opts;
  if (amount <= 0) return;

  showAmount(scene, x, y, amount, depth + 4);
  if (!scene.anims.exists(COIN_SPIN)) return;

  const scale = COIN_H / FRAME_H;
  const count = Phaser.Math.Clamp(Math.round(amount * COINS.perDollar), COINS.min, COINS.max);
  for (let i = 0; i < count; i++) {
    const coin = scene.add
      .sprite(x, y, COIN_KEYS[0] ?? '')
      .setDepth(depth)
      .setScale(scale);
    coin.play(COIN_SPIN);

    const dx = Phaser.Math.Between(-TOSS.spreadX, TOSS.spreadX);
    const peak = y - Phaser.Math.Between(TOSS.peakY[0], TOSS.peakY[1]);
    const land = y + Phaser.Math.Between(TOSS.fallY[0], TOSS.fallY[1]);
    // 튀어오를 때는 옆으로 조금만, 떨어질 때 마저 흩어진다 — 그래야 포물선으로 읽힌다.
    scene.tweens.add({
      targets: coin,
      x: x + dx * 0.4,
      y: peak,
      duration: TOSS.upMs,
      delay: i * TOSS.stepMs,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: coin,
          x: x + dx,
          y: land,
          duration: TOSS.fallMs,
          ease: 'Quad.easeIn',
          onComplete: () => coin.destroy(),
        });
        scene.tweens.add({ targets: coin, alpha: 0, duration: TOSS.fallMs, ease: 'Quad.easeIn' });
      },
    });
  }
}

/** 받은 금액이 금빛으로 떠오른다 — 코인이 몇 개인지 세지 않아도 얼마인지 읽힌다. */
function showAmount(scene: Phaser.Scene, x: number, y: number, amount: number, depth: number): void {
  const text = scene.add
    .text(x, y - 30, `+$${amount}`, {
      fontFamily: GAME_FONT_FAMILY,
      fontStyle: GAME_FONT_STYLE,
      fontSize: AMOUNT.fontSize,
      color: AMOUNT.color,
      stroke: AMOUNT.stroke,
      strokeThickness: AMOUNT.strokeWidth,
    })
    .setOrigin(0.5)
    .setDepth(depth)
    .setAlpha(0);
  scene.tweens.add({
    targets: text,
    alpha: 1,
    y: y - 30 - AMOUNT.riseY,
    duration: AMOUNT.riseMs,
    ease: 'Quad.easeOut',
  });
  scene.tweens.add({
    targets: text,
    alpha: 0,
    duration: AMOUNT.fadeMs,
    delay: AMOUNT.holdMs,
    onComplete: () => text.destroy(),
  });
}
