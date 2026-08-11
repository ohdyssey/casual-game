/**
 * StoreAdapter — 게임이 **배포 스토어**(광고·결제·셸)에 접근하는 단일 계약.
 *
 * `platform/contract.ts`(계정·지갑·세이브·라이브옵스)와 **직교**한다. 축을 헷갈리지 말 것:
 *   · PlatformContext — "어느 백엔드를 쓰나"  (local / integrated / standalone)
 *   · StoreAdapter    — "어느 스토어에 올라가 있나" (web / toss / msstore / android / ios)
 * 토스 미니앱이면서 Local 백엔드일 수도, MS Store 면서 Integrated 백엔드일 수도 있다.
 *
 * ⚠️ Phaser-free · DOM 최소 의존. 어댑터 선택은 **런타임이 아니라 빌드 시점**에 한다
 *    (vite alias `@store`). 런타임 분기로 두면 토스 SDK 가 MS Store 번들에 실려 들어가고,
 *    "동작하지 않는 기능"이 스토어 심사에 노출된다.
 *
 * 범위(v1): ads · iap · shell · storage.
 * auth(토스 로그인 / Google / Apple)는 같은 원칙(추가-only)으로 뒤에 붙인다.
 */

export type StoreTarget = 'web' | 'toss' | 'msstore' | 'android' | 'ios';

// ── 광고 ──

export type FullscreenAdKind = 'rewarded' | 'interstitial';

/**
 * 전면/보상형 광고 결과.
 *  · `rewarded`    — 끝까지 시청(보상 지급 가능). **보상은 이 값에서만 준다.**
 *  · `closed`      — 광고는 떴지만 보상 조건 미충족(그냥 닫힘). 관문 광고는 이걸로 통과시킨다.
 *  · `unavailable` — 광고를 띄우지 못함. 우리 쪽 실패로 사용자를 가두지 않는다.
 */
export type FullscreenAdResult = 'rewarded' | 'closed' | 'unavailable';

export interface AdsPort {
  /** 이 스토어에서 배너를 붙일 수 있는가(런타임 브릿지 확인 포함). */
  readonly bannerSupported: boolean;
  /** 전면/보상형을 띄울 수 있는가. */
  readonly fullscreenSupported: boolean;
  /**
   * 광고가 없을 때 **자리표시(TEST AD) 목업**을 그려도 되는 타겟인가.
   * 개발·웹 데모에서는 배치 확인에 유용하지만, 스토어 제출 빌드에서는 미완성 UI 로 보여
   * 반려 사유가 된다 — msstore/android/ios 는 반드시 false.
   */
  readonly allowPlaceholders: boolean;
  /**
   * 실제 배너를 컨테이너에 붙인다. 실패해도 예외를 던지지 않는다.
   * @param onRendered 광고가 실제로 그려진 시점 콜백 — 호스트가 높이를 다시 재는 데 쓴다.
   */
  attachBanner(container: HTMLElement, onRendered?: () => void): void;
  /** 붙인 배너를 떼어낸다(광고 제거 구매 등). */
  detachBanner(): void;
  /** 전면/보상형 1회 재생. 미지원이면 즉시 `unavailable`. */
  showFullscreen(kind: FullscreenAdKind): Promise<FullscreenAdResult>;
}

// ── 인앱결제 ──

/**
 * 단건 구매 결과.
 *  · `granted`       — 이번에 구매 성공
 *  · `already-owned` — 계정에 이미 있음(기기 변경·재설치 복구). 과금 없음 → 성공으로 취급
 *  · `cancelled`     — 사용자가 결제창을 닫음. 실패 안내를 띄우지 않는다
 *  · `unavailable`   — 이 스토어에 결제 수단이 없음
 *  · `failed`        — 그 외 실패
 */
export type PurchaseResult = 'granted' | 'already-owned' | 'cancelled' | 'unavailable' | 'failed';

export interface IapPort {
  readonly supported: boolean;
  /**
   * 부팅 시 1회 — 과금은 됐는데 지급완료 통보를 못 보낸 주문을 복구한다.
   * 복구할 주문이 있었으면 true(호출부가 로컬 지급 플래그를 남긴다).
   */
  restorePending(sku: string): Promise<boolean>;
  purchase(sku: string): Promise<PurchaseResult>;
}

// ── 셸(앱 껍데기) ──

export interface ShellPort {
  /**
   * 이 환경에 "허브(게임 목록)로 나가기"가 있는가.
   * 토스 미니앱·네이티브 앱에는 돌아갈 허브가 없다 — 앱 자체의 뒤로가기가 그 역할을 한다.
   */
  readonly hasHubExit: boolean;
}

// ── 영구 저장 ──

/**
 * 세이브 백엔드. **비동기가 기본**이다 — 네이티브 저장소(Capacitor Preferences,
 * 앱인토스 `Storage`)가 전부 Promise 라 계약을 거기에 맞춘다.
 *
 * ⚠️ 키를 열거하는 API(`keys()`)에 기대지 않는다 — 앱인토스 `Storage` 에는 아예 없다.
 *    그래서 로드는 **앱이 소유한 키 목록을 넘겨 받는** 형태다(`gameStorage.ts` 의 hydrate).
 * ⚠️ 쓰기는 반환값이 없다(fire-and-forget). 게임 루프가 저장을 기다리면 안 된다.
 */
export interface StoragePort {
  /**
   * 이 환경에서 저장이 실제로 되는가(사생활 보호 모드 등에서 false).
   * 저장이 안 되는 걸 아는 것과 "값이 없는 것"은 다르다 — 예: 스터디 진행도는
   * 저장이 불가능하면 매번 처음부터 시키는 대신 건너뛰게 한다.
   */
  readonly available: boolean;
  /** 넘긴 키들을 한 번에 읽는다. 값이 없는 키는 결과에서 뺀다. */
  load(keys: readonly string[]): Promise<Record<string, string>>;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface StoreAdapter {
  readonly target: StoreTarget;
  readonly ads: AdsPort;
  readonly iap: IapPort;
  readonly shell: ShellPort;
  readonly storage: StoragePort;
}
