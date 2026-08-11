/**
 * 앱 껍데기 질의 — "이 빌드에 허브로 나가기가 있는가".
 *
 * 이전에는 `toss.ts` 가 토스 브릿지 존재를 **런타임에** 조회해 판단했다. 이제는 빌드 타겟이
 * 답을 갖고 있다(`@store` alias 가 타겟별 어댑터로 스왑된다):
 *   · web     — ryanlogic.kr 허브가 있다 → ◀ 노출
 *   · toss    — 토스 미니앱. 허브가 없다(토스 앱 뒤로가기가 대신한다)
 *   · msstore / android / ios — 단독 설치 앱. 허브가 없다
 *
 * ⚠️ `getStore()`(코어 전역) 가 아니라 `@store` 를 **직접** 읽는다.
 *    `game.ts` 의 `hubButton: hasHubExit()` 이 모듈 평가 시점에 실행되는데, 그때는 아직
 *    `setStore()` 가 불리기 전이라 전역을 읽으면 기본값(Noop)을 잡는다.
 */
import store from '@store';

export function hasHubExit(): boolean {
  return store.shell.hasHubExit;
}
