/**
 * 광고 보상 제안 팝업 — "코인이 부족합니다 → 📺 광고 보고 무료로 한 판"(2026-09-02, 광고 모델).
 *
 * 보너스 게임 입장에서 `startBonusPlay()` 가 null(코인 부족)일 때 띄운다. 광고를 **끝까지 본
 * 경우에만**(어댑터 'rewarded') `startBonusPlayFromAd()` 로 판을 세우고 `onGranted` 를 부른다.
 *
 * ⚠️ 광고를 띄울 수 없는 타겟(fullscreenSupported 도 allowPlaceholders 도 아님)에서는 false 를
 *   돌려준다 — 호출부가 기존 토스트 안내로 폴백해야 한다("광고 보고…" 버튼이 있는데 아무 일도
 *   없으면 미동작 기능이다).
 * ⚠️ 홈 화면에서 부를 땐 반드시 `uiCam` 을 넘길 것(홈은 월드 카메라가 팬·줌으로 움직인다 —
 *   CLAUDE.md 공용 팝업 규칙).
 */
import Phaser from 'phaser';
import { playRewardedAd } from '@casual/core';
import { getStore } from '@casual/core/store/index.js';
import { startBonusPlayFromAd } from '../logic/bonusRuntime.js';
import { sfx } from '../audio.js';
import { uiButton } from './uiButton.js';
import { overlayLayer, overlayScrim } from './overlay.js';
import { FONT } from './uiKit.js';
import { SAFE_W as W, SAFE_H as H } from '../logic/responsiveFrame.js';

export interface AdOfferOpts {
  /** 홈 화면 등 UI 전용 카메라를 쓰는 씬은 넘겨야 딤이 화면 전체를 덮는다. */
  readonly uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 팝업 depth(기본 4300 — 공용 팝업 층). */
  readonly depth?: number;
  /** 광고 시청 완료 + 판 차감까지 끝난 뒤(씬 전환은 호출부가). */
  readonly onGranted: () => void;
  /** 사용자가 닫거나 광고를 못 본 경우(선택). */
  readonly onDeclined?: () => void;
}

/** 광고로 무료 한 판을 제안한다. 광고 불가 타겟이면 아무것도 그리지 않고 false. */
export function offerAdFreePlay(scene: Phaser.Scene, opts: AdOfferOpts): boolean {
  const { ads } = getStore();
  if (!ads.fullscreenSupported && !ads.allowPlaceholders) return false;

  const depth = opts.depth ?? 4300;
  const layer = overlayLayer(scene, depth);
  layer.add(overlayScrim(scene, 0x140a1e, 0.88, opts.uiCam));

  const cx = W / 2;
  const cy = H / 2 - 100;
  const title = scene.add
    .text(cx, cy - 170, '코인이 부족해요', { fontFamily: FONT, fontSize: '54px', color: '#FFE9B0' })
    .setOrigin(0.5);
  const body = scene.add
    .text(cx, cy - 60, '광고를 끝까지 보면\n게임비 없이 한 판 더 할 수 있어요', {
      fontFamily: FONT,
      fontSize: '40px',
      color: '#FFFFFF',
      align: 'center',
    })
    .setOrigin(0.5);
  layer.add([title, body]);

  const close = (declined: boolean): void => {
    layer.destroy();
    if (declined) opts.onDeclined?.();
  };

  layer.add(
    uiButton(scene, cx, cy + 110, '📺 광고 보고 무료 한 판', 'green', () => {
      // 이중 탭 방지 — 광고가 도는 동안 팝업 입력을 막는다(광고 오버레이가 덮지만 대기 구간이 있다).
      layer.setVisible(false);
      playRewardedAd(scene, ads, {
        onReward: () => {
          startBonusPlayFromAd();
          close(false);
          opts.onGranted();
        },
        onUnavailable: () => {
          layer.setVisible(true); // 광고 실패 — 팝업으로 되돌아와 다시 고르게 한다.
          sfx('no_coin');
        },
      }, { fontFamily: FONT });
    }, { width: 620, fontSize: 42 }),
  );
  layer.add(uiButton(scene, cx, cy + 230, '닫기', 'red', () => close(true), { width: 620 }));
  return true;
}
