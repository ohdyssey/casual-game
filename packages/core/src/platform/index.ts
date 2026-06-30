/**
 * @casual/core/platform — 플랫폼 계약 + 어댑터 주입 진입점.
 *
 * 사용:
 *   import { resolvePlatform, setPlatform, getPlatform } from '@casual/core/platform';
 *   setPlatform(resolvePlatform());   // 부팅 시 1회(호스트가 모드별 어댑터 주입)
 *   const ctx = getPlatform();         // 이후 게임은 ctx 로만 플랫폼 접근
 *
 * `setProfileStore` 와 같은 모듈-전역 싱글톤 패턴. 기본값=Local(현 동작 보존).
 */
import type { PlatformContext, PlatformMode } from './contract.js';
import { createLocalPlatform } from './local.js';

export * from './contract.js';
export { createLocalPlatform } from './local.js';

let active: PlatformContext = createLocalPlatform();

/** 활성 PlatformContext 주입(호스트가 부팅 시 호출). */
export function setPlatform(ctx: PlatformContext): void {
  active = ctx;
}

/** 활성 PlatformContext. 미주입이면 Local 기본값. */
export function getPlatform(): PlatformContext {
  return active;
}

/** 모드 판별 입력(호스트/부트가 제공). */
export interface ResolveOptions {
  /** ?portal=<hubOrigin> 값(있으면 통합 후보). */
  portalOrigin?: string | null;
  /** 빌드/런타임 강제 모드(예: VITE_PLATFORM_MODE). */
  forceMode?: PlatformMode;
  /** 원격 백엔드 base URL(없으면 Local 폴백). */
  apiBaseUrl?: string;
}

/**
 * 환경을 보고 적절한 어댑터를 만든다.
 *
 * P0(현재): 항상 Local 반환(원격 어댑터 미구현). Integrated/Standalone 은 같은 자리에서
 * 분기하도록 골격만 둔다 — P1(Integrated)·P3(Standalone)에서 createRemotePlatform 으로 채운다.
 */
export function resolvePlatform(opts: ResolveOptions = {}): PlatformContext {
  const mode: PlatformMode = opts.forceMode ?? (opts.portalOrigin ? 'integrated' : 'standalone');

  // 원격 백엔드가 설정되지 않았으면 어떤 모드든 Local 로 폴백(무회귀·오프라인 안전).
  if (!opts.apiBaseUrl) return createLocalPlatform();

  // TODO(P1/P3): return createRemotePlatform({ mode, apiBaseUrl: opts.apiBaseUrl, portalOrigin: opts.portalOrigin });
  void mode;
  return createLocalPlatform();
}
