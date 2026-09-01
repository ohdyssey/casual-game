/**
 * loadingVeil.ts — **잠깐 기다려야 할 때** 띄우는 최소한의 표시(딤 + 도는 원).
 *
 * 왜 있나: 화면 아트를 그 화면에 들어갈 때 받는 구조(ui/assetBudget.ts)에서, 미리 받아 두지 못한
 *   경우엔 짧은 대기가 생긴다. 그 구간에 **아무 표시가 없으면 "안 열린다"로 읽힌다** — 실제로 그
 *   신고를 받았다(2026-08-27). 60fps 기준 대기는 대개 100ms 안쪽이라 이 표시는 거의 안 보인다.
 *
 * 반환값은 **치우는 함수**다. 두 번 불러도 안전하다.
 */
import Phaser from 'phaser';
import { overlayLayer, overlayScrim } from './overlay.js';

/** 팝업(4300)보다 위 — 기다리는 동안은 이게 제일 앞이어야 한다. */
const DEPTH = 4900;

export interface LoadingVeilOpts {
  /** UI 전용 카메라를 쓰는 화면(홈)은 넘겨야 딤이 화면 전체를 덮는다. */
  readonly uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 딤 세기 — 기본은 아주 옅게(짧게 스치는 표시라 화면을 어둡게 만들 이유가 없다). */
  readonly alpha?: number;
}

/** 딤 + 도는 원을 띄우고, 치우는 함수를 돌려준다. */
export function showLoadingVeil(scene: Phaser.Scene, opts: LoadingVeilOpts = {}): () => void {
  const layer = overlayLayer(scene, DEPTH);
  layer.add(overlayScrim(scene, 0x000000, opts.alpha ?? 0.28, opts.uiCam));

  const cam = opts.uiCam ?? scene.cameras.main;
  const cx = cam.midPoint.x;
  const cy = cam.midPoint.y;
  const ring = scene.add.graphics({ x: cx, y: cy });
  ring.lineStyle(9, 0xffffff, 0.92);
  ring.beginPath();
  ring.arc(0, 0, 42, 0, Math.PI * 1.35);
  ring.strokePath();
  layer.add(ring);

  const spin = scene.tweens.add({
    targets: ring,
    angle: 360,
    duration: 750,
    repeat: -1,
    // ⚠️ 시간 배속(플레이 화면 시뮬)에 끌려가지 않게 — 로딩 표시는 항상 실시간으로 돈다.
    useFrames: false,
  });

  let done = false;
  return () => {
    if (done) return;
    done = true;
    spin.remove();
    layer.destroy(true);
  };
}
