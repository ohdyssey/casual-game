/**
 * overlay — 코드로 그리는 **전체화면 오버레이**(설정·리셋·메뉴·아이템샵 등)의 좌표 헬퍼.
 *
 * 이 오버레이들은 내용물을 전부 저작 좌표(0..1080 × 0..2400)로 배치한다. 정렬은 카메라가
 * 맡으므로(`safeZone.ts`) 내용물 좌표는 한 글자도 고칠 필요가 없고, **딤만 세이프존이 아니라
 * 캔버스 전체를 덮도록** 역오프셋을 적용한다.
 */
import Phaser from 'phaser';
import { fullscreenScrim } from '@casual/core';

/**
 * 오버레이 루트 — 자식은 **저작 좌표 그대로** 쓴다.
 * 세이프존을 화면 가운데 놓는 일은 카메라가 하므로(`safeZone.ts`) 여기서 오프셋을 더하지 않는다.
 */
export function overlayLayer(scene: Phaser.Scene, depth: number): Phaser.GameObjects.Container {
  return scene.add.container(0, 0).setDepth(depth);
}

/**
 * 오버레이 딤 — **캔버스 전체**를 덮는다(세이프존이 아니라). overlayLayer 안에 넣을 것을 전제로
 * 역오프셋을 미리 적용해 둔다. 입력 차단(setInteractive)도 겸한다.
 */
export function overlayScrim(
  scene: Phaser.Scene,
  color: number,
  alpha: number,
  cam?: Phaser.Cameras.Scene2D.Camera,
): Phaser.GameObjects.Rectangle {
  // 구현은 코어. ⚠️ 홈 화면처럼 **UI 전용 카메라**에 붙이는 오버레이는 그 카메라를 넘겨야
  //   딤이 화면 전체를 덮는다(월드 카메라와 줌·스크롤이 다르다).
  return fullscreenScrim(scene, color, alpha, cam);
}
