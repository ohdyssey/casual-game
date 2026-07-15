/**
 * clouds.ts — 홈 하늘에 **한 방향으로 천천히 흐르는 구름** 연출.
 *
 * SocialCasino BG 구름 3종(SC_BG_02-2·3·4)을 배경(하늘) 바로 위(depth 2)에 얹어 오른쪽으로 아주 느리게 흘린다.
 * ⚠️ 배경은 하늘+빌딩이 한 장에 그려진 단일 이미지라 물리적으로 "빌딩 뒤"에 넣을 수 없다 →
 *    구름을 **상단 순수 하늘 영역**(빌딩이 없는 높이)에만 띄워 빌딩을 덮지 않게 한다(=시각적으로 빌딩 뒤).
 */
import Phaser from 'phaser';

const W = 1080;
const CLOUD_KEYS = ['cloud_1', 'cloud_2', 'cloud_3'];
const FILES = ['SC_BG_02-2', 'SC_BG_02-3', 'SC_BG_02-4'];
const DEPTH = 1.5; // **하늘(depth 1) 바로 위, 원경(depth 2) 뒤** — 원경 건물 상층부 뒤에서 투명 하늘 틈으로 보인다.
const SF = 0.07; // **원경과 동일 패럴랙스** — 구름이 원경 건물에 붙어(뒤에서) 함께 움직이게(직전 0.12 → 원경 0.07 매칭).
const COUNT = 5; // 구름 개수(3 → 5, 더 잘 보이게).
const Y_MIN = 90; // 원경 **건물 상층부 밴드**(투명 하늘 틈이 많은 높이).
const Y_MAX = 470;
const SPEED_MIN = 6; // px/s — 더 느리게.
const SPEED_MAX = 12;
const ALPHA_MIN = 0.78; // 확실히 보이게(직전 0.45 → 0.78).
const ALPHA_MAX = 0.95;

/** 구름 3종 로드(HomeScene.preload). */
export function preloadClouds(scene: Phaser.Scene): void {
  CLOUD_KEYS.forEach((k, i) => {
    if (!scene.textures.exists(k)) scene.load.image(k, `clouds/${FILES[i]}.png`);
  });
}

interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/** 한 구름을 현재 위치 → 오른쪽 밖까지 등속 이동시키고, 도착하면 왼쪽 밖으로 되돌려 무한 순환. */
function launch(scene: Phaser.Scene, cloud: Cloud): void {
  if (!cloud.img.active) return;
  const halfW = cloud.img.displayWidth / 2;
  const toX = W + halfW + 20;
  const dist = toX - cloud.img.x;
  const dur = Math.max(200, (dist / cloud.speed) * 1000);
  scene.tweens.add({
    targets: cloud.img,
    x: toX,
    duration: dur,
    ease: 'Linear',
    onComplete: () => {
      if (!cloud.img.active) return;
      // 왼쪽 밖으로 되돌리며 세로·크기·투명도·속도를 새로 뽑아 반복감을 줄인다.
      cloud.img.x = -halfW - 20;
      cloud.img.y = Phaser.Math.Between(Y_MIN, Y_MAX);
      cloud.img.setAlpha(Phaser.Math.FloatBetween(ALPHA_MIN, ALPHA_MAX));
      cloud.speed = Phaser.Math.FloatBetween(SPEED_MIN, SPEED_MAX);
      launch(scene, cloud);
    },
  });
}

/** 홈 하늘 구름 드리프트 시작(depth 2, 오른쪽으로 천천히 순환). 씬 종료 시 트윈 자동 정리. */
export function startCloudDrift(scene: Phaser.Scene): void {
  const keys = CLOUD_KEYS.filter((k) => scene.textures.exists(k));
  if (keys.length === 0) return;
  for (let i = 0; i < COUNT; i++) {
    const key = keys[i % keys.length];
    const img = scene.add
      .image(Phaser.Math.Between(-40, W + 40), Phaser.Math.Between(Y_MIN, Y_MAX), key)
      .setDepth(DEPTH)
      .setScrollFactor(SF) // 하늘과 함께 아주 느리게(패럴랙스).
      .setAlpha(Phaser.Math.FloatBetween(ALPHA_MIN, ALPHA_MAX))
      .setScale(Phaser.Math.FloatBetween(1.4, 2.6)); // 더 크게(0.9~1.6 → 1.4~2.6).
    launch(scene, { img, speed: Phaser.Math.FloatBetween(SPEED_MIN, SPEED_MAX) });
  }
}
