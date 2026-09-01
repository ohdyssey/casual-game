/**
 * 전면/보상형 광고 — 이 게임 전용 얇은 래퍼. 실제 로직(목업 폴백 포함)은
 * `@casual/core`(`ads/rewardedAdHost.ts`)로 옮겨져 전 게임이 공유한다(2026-09-02 공용화).
 * 여기서는 이 게임의 `store`(=`@store` 타겟 어댑터)와 효과음만 붙여 호출부(PlayScene.ts)의
 * 기존 시그니처를 그대로 유지한다 — 호출부는 안 바뀐다.
 */
import type Phaser from 'phaser';
import { playGateAd as playGateAdCore, playRewardedAd as playRewardedAdCore } from '@casual/core';
import store from '@store';
import { playSfx } from './audio.js';

export interface RewardedAdCallbacks {
  /** 시청 완료 시에만 호출 — 여기서 실제 보상(무료 재도전 등)을 준다. */
  readonly onReward: () => void;
  /** 광고를 못 열었거나 보상 없이 닫힌 경우. */
  readonly onUnavailable?: () => void;
}

/** **관문(전면) 광고** — 결과와 무관하게 콜백은 광고가 닫힌 시점에 온다. */
export function playGateAd(scene: Phaser.Scene, onClosed: () => void): void {
  playGateAdCore(scene, store.ads, onClosed, { fontFamily: 'Jua, sans-serif' });
}

/** 보상형 광고 — 끝까지 본 경우에만 `onReward`. */
export function playRewardedAd(scene: Phaser.Scene, cb: RewardedAdCallbacks): void {
  playRewardedAdCore(scene, store.ads, cb, {
    fontFamily: 'Jua, sans-serif',
    onOpen: () => playSfx('ad_open'),
    onRewardSound: () => playSfx('ad_reward'),
  });
}
