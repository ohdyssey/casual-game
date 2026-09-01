/**
 * 보상형 광고 — 이 게임 전용 얇은 래퍼. 실제 로직(목업 폴백 포함)은 `@casual/core`
 * (`ads/rewardedAdHost.ts`)로 옮겨져 전 게임이 공유한다(2026-09-02 공용화).
 * 결과화면 "광고보고 경기하기"(코인 없이 광고 시청만으로 재도전)에서 쓴다.
 */
import type Phaser from 'phaser';
import { FONT, playRewardedAd as playRewardedAdCore } from '@casual/core';
import store from '@store';

/** 목업 대기 시간(초) — 결과화면 버튼에 적힌 예상 시청시간과 같은 값을 쓴다. */
export const MOCK_AD_SECONDS = 15;

export interface RewardedAdCallbacks {
  /** 광고 시청 완료 시에만 호출 — 여기서 실제 보상(무료 재도전 등)을 준다. */
  readonly onReward: () => void;
  /** 광고를 못 열었거나(네트워크 등) 보상 없이 닫힌 경우. */
  readonly onUnavailable?: () => void;
}

/** 결과화면 등에서 호출 — 지원 환경이면 실광고, 아니면 목업으로 자동 폴백한다. */
export function playRewardedAd(scene: Phaser.Scene, callbacks: RewardedAdCallbacks): void {
  playRewardedAdCore(scene, store.ads, callbacks, { fontFamily: FONT.family });
}
