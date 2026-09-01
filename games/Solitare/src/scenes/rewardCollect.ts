import { texSize } from '../assets.js';
/**
 * rewardCollect.ts — **결과창 보상 최종 회수 연출**(PO 2026-08-30 "결과창에서 획득한 보상이나 아이템을
 * 최종적으로 회수하는 연출이 없다").
 *
 * 결과 팝업(resultPopup.ts)의 HOME/NEXT 를 누르면 팝업에 보이던 것이 **전부** 제자리로 날아간다:
 *   코인 → 헤더 코인 카운터 · 다이아 → 헤더 다이아 카운터 · 리그 별 → 리그 아이콘 · 컬렉션 카드 → 컬렉션 보관함.
 * 메인(PlayScene)·보너스(PlayKlondikeScene) 공용 — 예전엔 메인에만 코인·다이아 버스트가 있었고 별·카드는
 * 날아가지 않았으며, 보너스는 아무 연출 없이 화면이 바뀌었다.
 *
 * `rewardBurstFly` 는 PlayScene 에 있던 것을 그대로 옮긴 것이다(낙하하며 커졌다가 → 축소되며 회수).
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import type { ResultPopupHandle } from './resultPopup.js';

const FLY_DEPTH = 2100; // 결과 팝업(2000)·보너스 팝업(3000)보다 위 — 호출부가 depth 를 넘길 수 있다.
export const COIN_KEY = 'up_Solitare_UI_2_3';
export const GEM_KEY = 'up_Solitare_UI_2_2';
export const STAR_KEY = 'up_Solitare_UI_02_v6';
/** 전체 회수가 끝나는 데 걸리는 시간(낙하 + 스태거 상승) — 이 뒤에 씬을 바꾼다. */
export const COLLECT_DURATION_MS = 2300; // 코인 16개 기준 마지막 입자 도착 ≈ 1.9s + 여유.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CollectTargets {
  readonly coin: Point;
  readonly gem: Point;
  readonly star: Point;
  readonly card: Point;
}

export interface CollectAmounts {
  readonly coins: number;
  readonly diamonds: number;
  readonly stars: number;
  /** true 면 별은 호출부가 따로 보낸다(메인의 리그 게이지 계단 연출). */
  readonly starsHandledByCaller?: boolean;
}

/**
 * 입자 버스트 — 원점에서 흩어져 떨어졌다가(커지며) 목표점으로 하나씩 축소 회수.
 */
export function rewardBurstFly(
  scene: Phaser.Scene,
  srcX: number,
  srcY: number,
  texKey: string,
  count: number,
  target: Point,
  dispW: number,
  depth = FLY_DEPTH,
): void {
  if (!scene.textures.exists(texKey) || count <= 0) return;
  for (let i = 0; i < count; i++) {
    const img = scene.add.image(srcX, srcY, texKey).setDepth(depth);
    const src = texSize(img.texture);
    img.setDisplaySize(dispW, dispW * (src.height / src.width));
    const bsx = img.scaleX;
    const bsy = img.scaleY;
    // ① 낙하 — 좌우로 흩어지며 살짝 떠올랐다가(포물선 정점) 아래로 떨어진다.
    const dx = Phaser.Math.Between(-190, 190);
    const rise = Phaser.Math.Between(20, 110);
    const drop = Phaser.Math.Between(110, 300);
    const ex = srcX + dx;
    const ey = srcY + drop;
    const ctrlX = srcX + dx * 0.55;
    const ctrlY = srcY - rise;
    const GROW = 1.75; // 낙하하며 이 배율까지 **크게 확대** → 상승 회수에서 축소.
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Phaser.Math.Between(320, 460),
      delay: i * 18,
      ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const u = 1 - t;
        img.x = u * u * srcX + 2 * u * t * ctrlX + t * t * ex;
        img.y = u * u * srcY + 2 * u * t * ctrlY + t * t * ey;
        img.setAngle(dx * 0.35 * t);
        const s = Phaser.Math.Linear(1, GROW, t);
        img.setScale(bsx * s, bsy * s);
      },
      onComplete: () => {
        // ② 상승 회수 — 잠깐 머문 뒤 축소되며 목표점으로(하나씩 타라락).
        scene.tweens.add({
          targets: img,
          x: target.x,
          y: target.y,
          scaleX: bsx * 0.25,
          scaleY: bsy * 0.25,
          angle: 0,
          alpha: 0.9,
          duration: Phaser.Math.Between(420, 540),
          delay: 70 + i * 34,
          ease: 'Cubic.easeIn',
          onComplete: () => img.destroy(),
        });
      },
    });
  }
}

/** 팝업의 컬렉션 카드가 보관함으로 날아간다 — 카드는 그 그림 그대로(입자 아님) 축소·회전하며 이동. */
function flyCards(scene: Phaser.Scene, handle: ResultPopupHandle, target: Point, depth: number): void {
  for (const b of handle.cardBadgeObjs) scene.tweens.add({ targets: b, alpha: 0, scale: 0, duration: 200 });
  handle.cardObjs.forEach((card, i) => {
    // 컨테이너 안 좌표 → 월드 좌표로 뽑아 씬 루트에 사본을 만든다(컨테이너는 팝업과 함께 사라진다).
    const m = card.getWorldTransformMatrix();
    const copy = scene.add.image(m.tx, m.ty, card.texture.key).setDisplaySize(card.displayWidth, card.displayHeight).setDepth(depth);
    card.setVisible(false);
    scene.tweens.add({
      targets: copy,
      y: copy.y - 60,
      scaleX: copy.scaleX * 1.15,
      scaleY: copy.scaleY * 1.15,
      duration: 260,
      delay: i * 90,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: copy,
          x: target.x,
          y: target.y,
          scaleX: copy.scaleX * 0.25,
          scaleY: copy.scaleY * 0.25,
          angle: 22,
          alpha: 0.9,
          duration: 520,
          delay: 120,
          ease: 'Cubic.easeIn',
          onComplete: () => copy.destroy(),
        });
      },
    });
  });
}

/**
 * 결과창의 보상을 전부 회수한다. 끝나면 `onDone`(씬 전환은 거기서).
 *   큰 아이콘·숫자는 팝하며 소멸하고 그 자리에서 입자가 터진다 — 화면에 보여 준 것이 사라지며 카운터로 들어간다.
 */
export function collectResultRewards(
  scene: Phaser.Scene,
  handle: ResultPopupHandle,
  amounts: CollectAmounts,
  targets: CollectTargets,
  onDone: () => void,
  depth = FLY_DEPTH,
): void {
  sfx('coin_burst', { volume: 0.35 });
  scene.cameras.main.shake(160, 0.004); // 살짝 임팩트.
  scene.tweens.add({ targets: [...handle.rewardObjs], scaleX: '*=1.5', scaleY: '*=1.5', alpha: 0, duration: 260, ease: 'Quad.easeOut' });
  // 코인: 금액 비례 여러 개(8~16).
  const coinN = Phaser.Math.Clamp(Math.round(amounts.coins / 125), 8, 16);
  if (amounts.coins > 0) rewardBurstFly(scene, handle.coinAt.x, handle.coinAt.y, COIN_KEY, coinN, targets.coin, 92, depth);
  // 다이아: 개수만큼.
  if (amounts.diamonds > 0) rewardBurstFly(scene, handle.gemAt.x, handle.gemAt.y, GEM_KEY, amounts.diamonds, targets.gem, 96, depth);
  // 리그 별: 개수만큼(상한 12) → 리그 아이콘. 메인은 게이지 계단 연출을 따로 하므로 건너뛸 수 있다.
  if (amounts.stars > 0 && !amounts.starsHandledByCaller) {
    rewardBurstFly(scene, handle.starAt.x, handle.starAt.y, STAR_KEY, Math.min(12, amounts.stars), targets.star, 84, depth);
  }
  // 컬렉션 카드 → 보관함.
  flyCards(scene, handle, targets.card, depth);
  scene.time.delayedCall(COLLECT_DURATION_MS, onDone);
}
