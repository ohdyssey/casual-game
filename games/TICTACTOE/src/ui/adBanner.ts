/**
 * 하단 배너 광고(DOM)와 캔버스 UI 의 충돌 회피 — "이 UI 의 밑변을 배너 윗변 위로 올려라".
 *
 * ⚠️ 배너는 DOM(index.html `#ad-banner-container`)이고 게임은 캔버스라 좌표계가 다르다.
 *    배너 **높이**만 보고 상수로 빼면 화면 비율에 따라 간격이 들쭉날쭉해진다(배너는 CSS px 고정
 *    96px 이라 화면이 작을수록 게임좌표로는 더 두꺼워진다). 그래서 배너의 **실제 화면 위치**를
 *    캔버스 위치와 같이 재서 게임좌표로 환산한다.
 * 광고가 없으면(제거 구매·SDK 미지원) 0 을 돌려주므로 저작 위치가 그대로 유지된다.
 */
import type Phaser from 'phaser';

export const AD_BANNER_ELEMENT_ID = 'ad-banner-container';

/** 배너 광고 윗변의 게임 y 좌표. 광고가 없거나 아직 잴 수 없으면 null. */
export function bannerTopGameY(scene: Phaser.Scene): number | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(AD_BANNER_ELEMENT_ID);
  if (!el) return null;
  const banner = el.getBoundingClientRect();
  const canvas = scene.scale.canvasBounds;
  if (banner.height <= 0 || canvas.height <= 0) return null;
  return ((banner.top - canvas.top) * scene.scale.height) / canvas.height;
}

/**
 * 밑변이 `bottomY`(게임 좌표)인 UI 를 배너 위로 올리기 위해 **위로 밀 거리**(게임 px).
 * 이미 배너보다 충분히 위에 있으면 0.
 *
 * @param gap 배너 윗변과의 여유 간격(게임 px)
 */
export function liftAboveBanner(scene: Phaser.Scene, bottomY: number, gap: number): number {
  const top = bannerTopGameY(scene);
  if (top === null) return 0;
  return Math.max(0, bottomY - (top - gap));
}
