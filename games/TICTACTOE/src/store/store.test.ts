/**
 * 스토어 어댑터 회귀 가드.
 *
 * 여기서 막고 싶은 사고는 하나다 — **제출 빌드에 "TEST AD" 자리표시가 섞여 나가는 것**.
 * 목업 배너·목업 광고 오버레이는 심사자 눈에 미완성 디버그 UI 라 반려 사유가 된다.
 *
 * ⚠️ toss 어댑터는 `@apps-in-toss/web-framework`(네이티브 브릿지)를 정적 import 해서
 *    node 테스트 환경에 올리지 않는다. 토스 빌드는 실기기 검증 대상이다.
 */
import { describe, expect, it } from 'vitest';
import type { StoreAdapter } from '@casual/core/store/index.js';
import web from './web.js';
import msstore from './msstore.js';
import android from './android.js';
import ios from './ios.js';

/** 앱 스토어에 **제출**되는 빌드 — 자리표시가 절대 나가면 안 되는 타겟들. */
const SUBMITTED: ReadonlyArray<readonly [string, StoreAdapter]> = [
  ['msstore', msstore],
  ['android', android],
  ['ios', ios],
];

const ALL: ReadonlyArray<readonly [string, StoreAdapter]> = [['web', web], ...SUBMITTED];

describe('스토어 어댑터 공통 계약', () => {
  it.each(ALL)('%s — target 문자열이 파일과 일치한다', (name, adapter) => {
    expect(adapter.target).toBe(name);
  });

  it.each(ALL)('%s — 필요한 포트를 모두 갖는다', (_name, adapter) => {
    expect(typeof adapter.ads.attachBanner).toBe('function');
    expect(typeof adapter.ads.detachBanner).toBe('function');
    expect(typeof adapter.ads.showFullscreen).toBe('function');
    expect(typeof adapter.iap.purchase).toBe('function');
    expect(typeof adapter.iap.restorePending).toBe('function');
    expect(typeof adapter.shell.hasHubExit).toBe('boolean');
    expect(typeof adapter.storage.load).toBe('function');
    expect(typeof adapter.storage.set).toBe('function');
    expect(typeof adapter.storage.remove).toBe('function');
    expect(typeof adapter.storage.available).toBe('boolean');
  });

  // 세이브는 광고·결제와 달리 **어느 타겟에서든** 필요하다 — 인메모리 폴백으로 새면 안 된다.
  it.each(ALL)('%s — 저장 백엔드가 비어 있지 않다', async (_name, adapter) => {
    await expect(adapter.storage.load(['tictactoe_v3'])).resolves.toBeTypeOf('object');
  });
});

describe('제출 빌드는 자리표시(TEST AD)를 금지한다', () => {
  it.each(SUBMITTED)('%s — allowPlaceholders 가 false', (_name, adapter) => {
    expect(adapter.ads.allowPlaceholders).toBe(false);
  });

  it('web(개발·데모)만 자리표시를 허용한다', () => {
    expect(web.ads.allowPlaceholders).toBe(true);
  });
});

describe('허브 이탈(◀) 노출', () => {
  it('허브가 있는 web 만 true', () => {
    expect(web.shell.hasHubExit).toBe(true);
  });

  it.each(SUBMITTED)('%s — 단독 설치 앱이라 false', (_name, adapter) => {
    expect(adapter.shell.hasHubExit).toBe(false);
  });
});

describe('광고·결제가 없는 타겟의 안전한 기본값', () => {
  it.each(SUBMITTED)('%s — 광고 요청은 unavailable 로 떨어진다', async (_name, adapter) => {
    await expect(adapter.ads.showFullscreen('rewarded')).resolves.toBe('unavailable');
    await expect(adapter.ads.showFullscreen('interstitial')).resolves.toBe('unavailable');
  });

  it.each(SUBMITTED)('%s — 결제는 unavailable, 복구는 false', async (_name, adapter) => {
    await expect(adapter.iap.purchase('remove_ads')).resolves.toBe('unavailable');
    await expect(adapter.iap.restorePending('remove_ads')).resolves.toBe(false);
  });

  it.each(SUBMITTED)('%s — 배너 호출이 예외를 던지지 않는다', (_name, adapter) => {
    expect(() => adapter.ads.attachBanner({} as HTMLElement)).not.toThrow();
    expect(() => adapter.ads.detachBanner()).not.toThrow();
  });
});
