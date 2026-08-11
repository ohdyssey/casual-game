/**
 * 디퍼드 딥링크 부트스트랩 — 앱 진입 시 1회, "최초 실행이면 설치 유입 딥링크를 조회해
 * 그 게임으로 바로 보낸다"의 전체 흐름.
 *
 * 흐름:
 *   1. deferred_link_handled 플래그 확인 — 이미 처리했으면 아무것도 안 함(기본 허브 진입)
 *   2. 최초 실행이면 DeferredLink.getTargetGameId() 를 **3초 타임아웃**으로 조회
 *   3. 조회를 마쳤으면(결과와 무관하게) 플래그를 true 로 저장 — 딥링크 진입은 딱 한 번이다
 *   4. 유효한 슬러그면 해당 게임으로 즉시 진입, 아니면 기본 허브(이동 없음)
 *   5. 어떤 실패든(저장소 접근 불가 포함) 기본 허브로 폴백 — 부트가 죽는 일은 없어야 한다
 *
 * 의존성 주입(deps): 테스트에서 저장소·플러그인·라우팅을 각각 갈아끼우기 위한 구조이자,
 * 2단계에서 네이티브 플러그인으로 교체할 때의 경계다 — 기본값이 실제 배선이다.
 */
import { DeferredLink } from './mockDeferredLink.js';
import { Preferences, type PreferencesLike } from './preferences.js';
import { type DeferredLinkPlugin, NO_DEFERRED_LINK } from './types.js';
import { hasGame, loadGameScene } from '../gameRegistry.js';

/** "최초 실행에서 딥링크를 이미 처리했다" 플래그 키. */
export const HANDLED_FLAG_KEY = 'deferred_link_handled';
/** 네이티브 조회 대기 상한(ms) — 이보다 늦으면 "없음"으로 간주하고 기본 허브로 간다. */
export const TIMEOUT_MS = 3000;

/**
 * 타임아웃 래퍼 — `ms` 안에 응답이 없으면 fallback 을 돌려준다.
 * 지금의 목 구현은 즉시 응답하지만, 2단계의 실제 네이티브 호출(Install Referrer/AppsFlyer)은
 * 수 초씩 걸릴 수 있다 — 그때 이미 적용돼 있도록 지금부터 씌운다.
 * ⚠️ 원 promise 를 취소하지는 않는다(JS 에 취소가 없다) — 늦게 온 결과는 그냥 버려진다.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** 부트스트랩이 실제로 한 일 — 테스트·로깅용. */
export type BootstrapOutcome = 'deferred' | 'default' | 'skipped';

export interface BootstrapDeps {
  readonly plugin: DeferredLinkPlugin;
  readonly prefs: PreferencesLike;
  readonly hasGame: (slug: string) => boolean;
  /** 해당 게임으로 진입(성공 시 true). 실패하면 기본 허브 폴백. */
  readonly loadGameScene: (slug: string) => boolean;
  readonly timeoutMs: number;
}

/** 실제 배선 — 프로덕션 진입점(main.ts)이 이 기본값 그대로 쓴다. */
const DEFAULT_DEPS: BootstrapDeps = {
  plugin: DeferredLink,
  prefs: Preferences,
  hasGame,
  loadGameScene,
  timeoutMs: TIMEOUT_MS,
};

/**
 * 디퍼드 딥링크 처리 실행. 반환값:
 *   'skipped'  — 최초 실행이 아님(플래그 있음) → 기본 허브
 *   'deferred' — 딥링크 게임으로 진입함
 *   'default'  — 최초 실행이지만 딥링크 없음/무효/실패 → 기본 허브
 *
 * "기본 허브 진입"은 이동이 아니다 — 웹 허브는 이 함수와 무관하게 자기 화면을 그린다.
 * (Capacitor 앱에서도 동일: 아무것도 안 하면 기본 히어로 화면이 뜬다)
 */
export async function runDeferredLinkBootstrap(
  deps: BootstrapDeps = DEFAULT_DEPS,
): Promise<BootstrapOutcome> {
  try {
    const { value: handled } = await deps.prefs.get({ key: HANDLED_FLAG_KEY });
    if (handled === 'true') {
      // 재실행 — 딥링크 조회 자체를 하지 않는다(1회성 보장 + 불필요한 네이티브 호출 제거).
      // TODO: [추후 확장] 재실행의 대표 게임을 "최근 플레이" 기준으로 바꾸는 로직은
      //       featured.ts 가 이미 담당한다 — 여기서는 손대지 않는다.
      return 'skipped';
    }

    const result = await withTimeout(deps.plugin.getTargetGameId(), deps.timeoutMs, NO_DEFERRED_LINK);

    // 조회를 마쳤으니 결과와 무관하게 "처리됨"으로 남긴다 — 다음 실행부터는 조회하지 않는다.
    // (진입 실패로 재시도하고 싶어도 안 한다: 광고 유입 진입은 첫 실행 한 번이 계약이다)
    await deps.prefs.set({ key: HANDLED_FLAG_KEY, value: 'true' });

    if (result.gameId && deps.hasGame(result.gameId) && deps.loadGameScene(result.gameId)) {
      return 'deferred';
    }
    return 'default';
  } catch (err) {
    // 저장소 접근 불가(사생활 보호 모드)·플러그인 예외 등 — 어떤 경우에도 부트가 죽지 않고
    // 기본 허브로 간다. 이 경로에선 플래그 저장도 실패했을 수 있어 다음 실행에 재시도된다.
    console.warn('[deferredLink] 처리 실패, 기본 허브로 폴백', err);
    return 'default';
  }
}

/** 프로덕션 진입점 — main.ts 에서 호출. */
export function bootstrapDeferredLink(): Promise<BootstrapOutcome> {
  return runDeferredLinkBootstrap();
}
