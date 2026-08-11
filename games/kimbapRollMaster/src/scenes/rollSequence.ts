/**
 * rollSequence.ts — 김밥 말기 연출.
 *
 * 에디터에 저작된 **말기 1·2단계**(main_copy2 / main_copy2_copy)를 키프레임으로 삼아,
 * 평평한 상태 → 1단계 → 2단계 → 완성으로 크로스페이드하며 넘어간다.
 *
 * 저작 데이터에서 읽어낸 규칙:
 * - 김·밥은 **아래에서부터** 말려 들어가므로 높이가 줄고 중심이 위로 올라간다
 *   (김 449→376→168, 중심 1350→1320→1213).
 * - 말린 부분은 그 경계에 튜브로 나타난다(1단계 up_Item_11-2 → 2단계 up_Item_11_v2).
 * - 재료 스트립은 경계가 지나가면 말려 들어가 사라진다(아래쪽부터).
 * - 손은 경계를 따라 위로 올라간다(1551 → 1465 → 1267).
 */
import type Phaser from 'phaser';
import type { DesignRect, Transform } from './cookingNodes.js';

type Img = Phaser.GameObjects.Image;

/** 한 키프레임에서 바뀌는 것들. 없으면 그 단계는 건너뛴다. */
export interface RollFrame {
  /** 아직 펴져 있는 김 */
  readonly nori?: Img;
  /** 아직 펴져 있는 밥 */
  readonly rice?: Img;
  /** 말려 들어간 부분(튜브 / 거의 완성된 김밥) */
  readonly roll?: Img;
  readonly handLeft?: DesignRect;
  readonly handRight?: DesignRect;
}

export interface RollTargets {
  /** 평평한 상태의 김·밥(main) */
  readonly flatNori?: Img;
  readonly flatRice?: Img;
  /** 김 위에 놓인 재료 스트립 — **아래쪽부터** 정렬(말려 들어가는 순서). */
  readonly strips: readonly Img[];
  /** [왼손, 오른손] */
  readonly hands: readonly Img[];
  /** 썰기 화면에 저작된 최종 김밥 */
  readonly finalRoll?: Img;
}

export interface RollTiming {
  readonly stepA: number;
  readonly stepB: number;
  readonly stepC: number;
}

/** 연출 중에는 입력이 잠기므로 너무 길면 답답하다 — 총 1초 안쪽으로 잡는다. */
export const ROLL_TIMING: RollTiming = { stepA: 320, stepB: 380, stepC: 300 };

/** 스트립이 하나씩 말려 들어가는 간격. */
const STRIP_STAGGER_MS = 55;

export interface RollSequenceDeps {
  readonly scene: Phaser.Scene;
  /** 객체의 디자인 상태(위치·크기·투명도) 조회. */
  readonly baseOf: (obj: Img | undefined) => Transform | undefined;
}

/** 페이드 인 — 디자인 상태로 되돌린 뒤 서서히 드러낸다. */
function fadeIn(scene: Phaser.Scene, obj: Img | undefined, t: Transform | undefined, duration: number, delay = 0): void {
  if (!obj || !t) return;
  obj.setVisible(true).setAlpha(0).setPosition(t.x, t.y).setScale(t.scaleX, t.scaleY);
  scene.tweens.add({ targets: obj, alpha: t.alpha, duration, delay, ease: 'Sine.easeOut' });
}

function fadeOut(scene: Phaser.Scene, obj: Img | undefined, duration: number, delay = 0): void {
  if (!obj || !obj.visible) return;
  scene.tweens.add({
    targets: obj,
    alpha: 0,
    duration,
    delay,
    ease: 'Sine.easeIn',
    onComplete: () => obj.setVisible(false),
  });
}

/** 손을 다음 키프레임 위치로 올린다. */
function moveHands(
  scene: Phaser.Scene,
  hands: readonly Img[],
  frame: RollFrame,
  duration: number,
  delay: number,
): void {
  const spots = [frame.handLeft, frame.handRight];
  hands.forEach((hand, i) => {
    const spot = spots[i];
    if (!hand || !spot) return;
    scene.tweens.add({ targets: hand, x: spot.cx, y: spot.cy, duration, delay, ease: 'Sine.easeInOut' });
  });
}

/**
 * 말기 연출을 재생한다. 전체 길이는 stepA+stepB+stepC(기본 1220ms).
 * 완료되면 최종 김밥만 남고 나머지는 감춰진다.
 */
export function playRollSequence(
  deps: RollSequenceDeps,
  targets: RollTargets,
  step1: RollFrame,
  step2: RollFrame,
  onDone: () => void,
  timing: RollTiming = ROLL_TIMING,
): void {
  const { scene, baseOf } = deps;
  const { stepA, stepB, stepC } = timing;
  const tA = 0;
  const tB = stepA;
  const tC = stepA + stepB;

  // ── A. 아래 끝을 접어 올린다 — 평평한 김·밥이 1단계 모습으로 바뀌고 튜브가 생긴다.
  moveHands(scene, targets.hands, step1, stepA, tA);
  fadeOut(scene, targets.flatNori, stepA * 0.75, tA);
  fadeOut(scene, targets.flatRice, stepA * 0.75, tA);
  fadeIn(scene, step1.nori, baseOf(step1.nori), stepA * 0.75, tA);
  fadeIn(scene, step1.rice, baseOf(step1.rice), stepA * 0.75, tA);

  const tube = step1.roll;
  const tubeBase = baseOf(tube);
  if (tube && tubeBase) {
    tube.setVisible(true).setAlpha(0).setPosition(tubeBase.x, tubeBase.y).setScale(tubeBase.scaleX, tubeBase.scaleY * 0.35);
    scene.tweens.add({
      targets: tube,
      alpha: tubeBase.alpha,
      scaleY: tubeBase.scaleY,
      duration: stepA * 0.85,
      delay: tA,
      ease: 'Back.easeOut',
    });
  }

  // ── B. 계속 굴린다 — 재료가 아래쪽부터 말려 들어가고 튜브가 김밥으로 굵어진다.
  moveHands(scene, targets.hands, step2, stepB, tB);
  fadeOut(scene, step1.nori, stepB * 0.65, tB);
  fadeOut(scene, step1.rice, stepB * 0.65, tB);
  fadeIn(scene, step2.nori, baseOf(step2.nori), stepB * 0.65, tB);
  fadeIn(scene, step2.rice, baseOf(step2.rice), stepB * 0.65, tB);

  targets.strips.forEach((strip, i) => {
    fadeOut(scene, strip, 200, tB + i * STRIP_STAGGER_MS);
  });

  // 말린 부분은 **끊기지 않고 이어서** 굵어지며 위로 올라간다.
  // (튜브를 지우고 다른 자리에 김밥을 띄우면 김밥이 두 개로 보인다.)
  const rolled = step2.roll;
  const rolledBase = baseOf(rolled);
  if (rolled && rolledBase) {
    const startY = tubeBase ? tubeBase.y : rolledBase.y;
    rolled
      .setVisible(true)
      .setAlpha(0)
      .setPosition(rolledBase.x, startY)
      .setScale(rolledBase.scaleX * 0.94, rolledBase.scaleY * 0.62);
    scene.tweens.add({
      targets: rolled,
      alpha: rolledBase.alpha,
      y: rolledBase.y,
      scaleX: rolledBase.scaleX,
      scaleY: rolledBase.scaleY,
      duration: stepB * 0.85,
      delay: tB,
      ease: 'Sine.easeOut',
    });
  }
  // 튜브는 김밥이 같은 자리에서 이어받는 동안 곧바로 사라진다.
  fadeOut(scene, tube, stepB * 0.3, tB);

  // ── C. 마무리 — 손을 치우고 완성된 김밥만 남긴다(대나무발은 칼을 들 때 걷는다).
  targets.hands.forEach((hand) => {
    scene.tweens.add({ targets: hand, y: hand.y - 40, alpha: 0, duration: stepC * 0.8, delay: tC, ease: 'Sine.easeIn' });
  });
  fadeOut(scene, step2.nori, stepC * 0.7, tC);
  fadeOut(scene, step2.rice, stepC * 0.7, tC);
  fadeOut(scene, rolled, stepC * 0.7, tC + stepC * 0.15);
  fadeIn(scene, targets.finalRoll, baseOf(targets.finalRoll), stepC * 0.7, tC + stepC * 0.15);

  scene.time.delayedCall(tC + stepC, () => {
    for (const hand of targets.hands) hand.setVisible(false);
    onDone();
  });
}
