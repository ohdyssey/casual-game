/**
 * 디퍼드 딥링킹 — **절대 바뀌지 않는 계약(contract)**.
 *
 * "설치 전에 본 광고의 game_id 를, 설치 후 첫 실행 때 알아내는" 기능의 인터페이스.
 * JS/허브 쪽 코드는 이 인터페이스에만 의존한다 — 내부가 목(mock)인지 실제 네이티브
 * (Android Install Referrer / iOS AppsFlyer)인지 알 필요가 없어야 한다.
 *
 * 2단계(추후)에서 네이티브 구현으로 교체될 때도 이 파일은 수정하지 않는다.
 */

/** 딥링크 정보의 출처 — referrer(Android Install Referrer) · appsflyer(iOS) · none(없음/실패). */
export type DeferredLinkSource = 'referrer' | 'appsflyer' | 'none';

export interface DeferredLinkResult {
  /** 진입시킬 게임 슬러그. 알 수 없으면 null(→ 기본 허브 진입). */
  readonly gameId: string | null;
  readonly source: DeferredLinkSource;
}

export interface DeferredLinkPlugin {
  /**
   * 설치 유입 딥링크의 대상 게임을 조회한다.
   * ⚠️ 호출부는 반드시 타임아웃 래퍼를 씌운다(bootstrap.ts) — 네이티브 구현은 느릴 수 있다.
   */
  getTargetGameId(): Promise<DeferredLinkResult>;
}

/** "딥링크 없음" 결과 — 타임아웃·실패 폴백으로도 쓴다. */
export const NO_DEFERRED_LINK: DeferredLinkResult = { gameId: null, source: 'none' };
