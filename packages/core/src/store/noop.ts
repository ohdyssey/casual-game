/**
 * Noop 스토어 어댑터 — 광고도 결제도 없는 기본 구현.
 *
 * 이게 **MS Store 빌드의 실제 어댑터이기도 하다**(Windows 에는 붙일 광고 SDK 도, 쓸 토스
 * 결제 브릿지도 없다). 그 외에도 테스트·미구현 타겟의 안전한 폴백으로 쓴다.
 *
 * 모든 메서드는 조용히 아무것도 하지 않는다 — "미지원"이 예외가 되면 호출부마다 try/catch 를
 * 두게 되고, 그 방어가 빠진 한 곳에서 게임이 죽는다.
 *
 * ⚠️ 저장(storage)만은 예외다 — 광고·결제와 달리 **세이브는 어느 타겟에서든 필요**하므로
 *    호출부가 실제 포트를 넘긴다. 안 넘기면 세션 한정 인메모리(= 재시작하면 사라짐).
 */
import type {
  AdsPort,
  FullscreenAdResult,
  IapPort,
  ShellPort,
  StoragePort,
  StoreAdapter,
  StoreTarget,
} from './contract.js';

export interface NoopStoreOptions {
  readonly target?: StoreTarget;
  /** 허브로 나가기 버튼을 노출할지(웹=true, 네이티브 앱=false). */
  readonly hasHubExit?: boolean;
  /** 자리표시 배너를 허용할지 — 스토어 제출 빌드에서는 반드시 false. */
  readonly allowPlaceholders?: boolean;
  /** 세이브 백엔드. 생략하면 인메모리(비영속). */
  readonly storage?: StoragePort;
}

const noopAds = (allowPlaceholders: boolean): AdsPort => ({
  bannerSupported: false,
  fullscreenSupported: false,
  allowPlaceholders,
  attachBanner: () => {},
  detachBanner: () => {},
  showFullscreen: async (): Promise<FullscreenAdResult> => 'unavailable',
});

const noopIap: IapPort = {
  supported: false,
  restorePending: async () => false,
  purchase: async () => 'unavailable',
};

/**
 * 세션 한정 인메모리 저장소 — 테스트와 "저장 백엔드가 아직 없는" 타겟의 폴백.
 * `available: false` 라 호출부가 "저장이 안 되는 환경"으로 인식할 수 있다.
 */
export function createMemoryStoragePort(): StoragePort {
  const map = new Map<string, string>();
  return {
    available: false,
    load: (keys) => {
      const out: Record<string, string> = {};
      for (const key of keys) {
        const value = map.get(key);
        if (value !== undefined) out[key] = value;
      }
      return Promise.resolve(out);
    },
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  };
}

export function createNoopStore(opts: NoopStoreOptions = {}): StoreAdapter {
  const shell: ShellPort = { hasHubExit: opts.hasHubExit ?? true };
  return {
    target: opts.target ?? 'web',
    ads: noopAds(opts.allowPlaceholders ?? false),
    iap: noopIap,
    shell,
    storage: opts.storage ?? createMemoryStoragePort(),
  };
}
