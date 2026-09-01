/**
 * clerkIdle.ts — **서 있는 캐릭터의 숨쉬기 연출**(점원·공무원 공용).
 *
 * 홈 화면 안에만 있던 것을 빼냈다. 프리셀(보너스 게임)이 상단에 공공건물과 담당 공무원을 올리면서
 * **같은 캐릭터가 두 화면에 서게 됐는데**, 홈에서는 움직이고 플레이 화면에서는 굳어 있었다
 * (PO 2026-08-30 "프리셀 게임에서 캐릭터가 움직이지 않는다"). 두 벌로 두면 반드시 갈라지므로
 * 한 곳에 둔다.
 *
 * 연출은 두 겹이다 — **좌우 갸웃**(각도)과 **숨쉬기**(세로 스케일). 주기를 서로 어긋나게(1500 / 1950ms)
 * 둬서 두 움직임이 겹쳐도 기계적으로 반복되어 보이지 않는다.
 *
 * ⚠️ **발밑을 고정한다.** 각도·세로 스케일을 원점(0.5) 기준으로 주면 캐릭터가 바닥에서 떠오르거나
 *   파묻힌다. 그래서 하단을 계산해 `originY = 1` 로 바꾸고 그 자리에 다시 앉힌다 — 어떤 원점으로
 *   만들어진 이미지든 이 함수를 그냥 부르면 된다.
 * ⚠️ `phase` 로 캐릭터마다 시작 시점을 어긋나게 할 것. 안 그러면 여러 명이 **한 몸처럼** 같이 움직인다.
 */
import type Phaser from 'phaser';

/** 좌우 갸웃 진폭(도). */
const SWAY = 1.1;

/**
 * 캐릭터에 idle 연출을 건다(이미 걸려 있으면 무시).
 * @param phase 시작 지연(ms) — 같은 화면의 캐릭터끼리 위상을 어긋나게 하는 값.
 */
export function animateClerkIdle(scene: Phaser.Scene, img: Phaser.GameObjects.Image, phase = 0): void {
  if (img.getData('clerkAnim')) return; // 중복 방지(재배선 경로에서 두 번 걸리면 진폭이 두 배가 된다).
  img.setData('clerkAnim', true);
  const baseAngle = img.angle;
  const bottom = img.y + img.displayHeight * (1 - img.originY); // 발밑(하단) 고정.
  img.setOrigin(img.originX, 1);
  img.y = bottom;
  img.setAngle(baseAngle - SWAY);
  scene.tweens.add({
    targets: img,
    angle: baseAngle + SWAY,
    duration: 1500,
    delay: phase,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: img,
    scaleY: img.scaleY * 1.03, // 숨쉬기.
    duration: 1950,
    delay: phase + 250,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}
