/**
 * 1단계 목(mock) 구현 — 항상 "딥링크 없음"을 반환한다.
 *
 * 그래서 이 코드가 배포돼도 **현재 앱 동작(모든 유저가 기본 허브 진입)은 100% 동일**하다.
 * 나중에 이 파일 하나만 실제 네이티브 연동으로 바뀐다 — 나머지 전체 시스템(부트스트랩,
 * 레지스트리, 테스트)은 손댈 필요가 없다.
 *
 * TODO: [1단계 완료 후] Android — Play Install Referrer API 결과로 교체
 *       (Kotlin 네이티브 플러그인 + JS 브릿지, referrerUrl 의 game_id 파라미터 파싱)
 * TODO: [1단계 완료 후] iOS — AppsFlyer SDK onConversionDataSuccess 콜백 결과로 교체
 *       (Swift 네이티브 플러그인 + JS 브릿지, deep_link_value → game_id)
 */
import { type DeferredLinkPlugin, type DeferredLinkResult, NO_DEFERRED_LINK } from './types.js';

export const mockDeferredLink: DeferredLinkPlugin = {
  async getTargetGameId(): Promise<DeferredLinkResult> {
    return NO_DEFERRED_LINK;
  },
};

// 2단계에서 플랫폼별로 아래처럼 교체될 예정(지금은 구현하지 않음):
// import { Capacitor } from '@capacitor/core';
// export const DeferredLink: DeferredLinkPlugin =
//   Capacitor.getPlatform() === 'android' ? androidDeferredLink :
//   Capacitor.getPlatform() === 'ios' ? iosDeferredLink :
//   mockDeferredLink;

export const DeferredLink: DeferredLinkPlugin = mockDeferredLink;
