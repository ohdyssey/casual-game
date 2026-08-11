/**
 * riceHands.ts — 밥을 **올리고 펴는** 손 연출.
 *
 *  · `RiceScoop`  — 밥통에 놓인 **밥주걱**(저작 노드)이 밥을 퍼서 김 위로 옮겨 쏟는다.
 *  · `SpreadHand` — 밥을 문지르는 동안 **흰 손**이 손끝을 따라다닌다.
 *
 * 둘 다 그림·크기·자리를 **저작 노드에서 읽는다** — 에디터에서 옮기면 그대로 따라온다.
 * 코드가 정하는 건 "어떻게 움직이나"뿐이다.
 */
import Phaser from 'phaser';

/** 주걱이 밥을 퍼서 쏟기까지의 마디. 합이 곧 밥덩이가 나타나기까지의 시간이다(약 0.46초). */
const SCOOP = { dip: 90, lift: 90, travel: 180, pour: 100, back: 240 } as const;
/** 밥통 안으로 담글 깊이 · 퍼 올린 뒤 드는 높이. */
const DIP_Y = 22;
const LIFT_Y = 62;
/** 쏟을 때 기울이는 각도와, 쏟는 자리(밥이 떨어질 지점보다 이만큼 위). */
const POUR_ANGLE = 54;
const POUR_LIFT = 78;

/**
 * 저작된 밥주걱이 밥통에서 밥을 퍼 김 위로 옮긴다.
 * 담근다 → 퍼 올린다 → 건너간다 → **기울여 쏟는다**(이때 밥덩이가 나타난다) → 제자리로.
 */
export class RiceScoop {
  private readonly home: { readonly x: number; readonly y: number; readonly angle: number } | null;
  private chain?: Phaser.Tweens.TweenChain;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly obj: Phaser.GameObjects.Image | undefined,
  ) {
    this.home = obj ? { x: obj.x, y: obj.y, angle: obj.angle } : null;
  }

  /** 한 번 퍼 온다. `onPour` 는 주걱이 기울어 밥을 쏟는 순간 불린다. */
  play(target: { readonly cx: number; readonly cy: number }, onPour: () => void): void {
    const obj = this.obj;
    const home = this.home;
    if (!obj || !home) {
      onPour();
      return;
    }
    this.stop();
    obj.setVisible(true).setPosition(home.x, home.y).setAngle(home.angle).setAlpha(1);
    this.chain = this.scene.tweens.chain({
      targets: obj,
      tweens: [
        // 밥통에 담갔다가
        { y: home.y + DIP_Y, angle: home.angle - 8, duration: SCOOP.dip, ease: 'Sine.easeIn' },
        // 퍼 올리고
        { y: home.y - LIFT_Y, angle: home.angle - 20, duration: SCOOP.lift, ease: 'Back.easeOut' },
        // 김 위로 건너가서
        {
          x: target.cx,
          y: target.cy - POUR_LIFT,
          angle: home.angle - 6,
          duration: SCOOP.travel,
          ease: 'Sine.easeInOut',
        },
        // 기울여 쏟는다 — 밥덩이는 여기서 나타난다.
        {
          angle: POUR_ANGLE,
          duration: SCOOP.pour,
          ease: 'Quad.easeIn',
          onComplete: () => onPour(),
        },
        // 제자리로 물러난다(이 구간은 조작을 막지 않는다).
        {
          x: home.x,
          y: home.y,
          angle: home.angle,
          duration: SCOOP.back,
          delay: 60,
          ease: 'Quad.easeInOut',
        },
      ],
    });
  }

  /** 밥을 쏟기까지 걸리는 시간 — 뷰가 밥덩이 등장 소리를 맞출 때 쓴다. */
  static get pourDelayMs(): number {
    return SCOOP.dip + SCOOP.lift + SCOOP.travel + SCOOP.pour;
  }

  /** 연출을 끊고 저작된 자리로 되돌린다(주문이 끝나거나 실패했을 때). */
  reset(): void {
    this.stop();
    const { obj, home } = this;
    if (!obj || !home) return;
    obj.setVisible(true).setPosition(home.x, home.y).setAngle(home.angle).setAlpha(1);
  }

  private stop(): void {
    this.chain?.destroy();
    this.chain = undefined;
    if (this.obj) this.scene.tweens.killTweensOf(this.obj);
  }
}

/** 손끝이 닿는 자리 — 그림의 중심이 아니라 **손가락 끝**이 문지르는 점에 오도록 내려 잡는다. */
const HAND_OFFSET = { x: 26, y: 54 } as const;
/** 문지르는 방향에 따라 손목이 살짝 꺾이는 폭. */
const TILT_MAX = 14;
const FOLLOW_MS = 70;

/**
 * 밥을 문지르는 동안 따라다니는 **흰 손**.
 * 저작된 「김밥마는 손」에서 그림과 크기만 빌려 오고, 그 노드 자체는 건드리지 않는다
 * (말기 연출이 같은 노드를 쓰기 때문이다).
 */
export class SpreadHand {
  private readonly img: Phaser.GameObjects.Image | undefined;
  private last: { readonly x: number; readonly y: number } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    sample: { readonly key: string; readonly w: number; readonly h: number } | null,
    depth: number,
  ) {
    if (!sample || !scene.textures.exists(sample.key)) return;
    this.img = scene.add
      .image(0, 0, sample.key)
      .setDisplaySize(sample.w, sample.h)
      .setDepth(depth)
      .setVisible(false);
  }

  /** 문지르는 점으로 손을 옮긴다. 처음 부르면 나타난다. */
  moveTo(x: number, y: number): void {
    const img = this.img;
    if (!img) return;
    const to = { x: x + HAND_OFFSET.x, y: y + HAND_OFFSET.y };
    if (!img.visible) {
      img.setVisible(true).setPosition(to.x, to.y).setAlpha(0).setAngle(0);
      this.scene.tweens.add({ targets: img, alpha: 1, duration: 90 });
    } else {
      this.scene.tweens.killTweensOf(img);
      const tilt = this.last ? Phaser.Math.Clamp((to.x - this.last.x) * 0.9, -TILT_MAX, TILT_MAX) : 0;
      this.scene.tweens.add({
        targets: img,
        x: to.x,
        y: to.y,
        angle: tilt,
        duration: FOLLOW_MS,
        ease: 'Sine.easeOut',
      });
    }
    this.last = to;
  }

  /** 저절로 퍼지는 구간 — 손이 위에서 아래로 훑고 지나간다. */
  sweep(points: readonly { readonly x: number; readonly y: number }[], stepMs: number): void {
    points.forEach((p, i) => {
      this.scene.time.delayedCall(i * stepMs, () => this.moveTo(p.x, p.y));
    });
  }

  hide(): void {
    const img = this.img;
    if (!img || !img.visible) return;
    this.scene.tweens.killTweensOf(img);
    this.last = null;
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: 140,
      onComplete: () => img.setVisible(false),
    });
  }
}
