/**
 * 결과 화면의 "다시 하기" 를 **광고 관문**으로 바꿀 차례인가.
 *
 * 진 판 N번에 한 번만 광고를 거치게 하는 구조다(유저 확정 2026-08-05: 3판에 한 판).
 * 판정 기준이 통산 패배 수라, 별도 카운터 없이도 주기가 정확하고 앱을 껐다 켜도 유지된다.
 *
 * ⚠️ **광고를 띄울 수 없는 타겟에서는 관문 자체가 없어야 한다.** 예전에는 타겟과 무관하게
 *    켜져서, MS Store 빌드에서도 버튼이 "광고 보고 다시하기" 로 바뀐 채 눌러도 효과음만 나고
 *    바로 새 판이 시작됐다. 심사자에게는 **동작하지 않는 기능**이고, "광고 없음" 으로 신고한
 *    IARC 설문·개인정보처리방침과도 어긋난다(허위 응답은 등급 취소 사유).
 *
 * 씬에서 떼어낸 이유: Phaser 씬 안에 두면 이 분기를 테스트로 못 잠근다.
 */
export interface AdGateInput {
  /** 통산 패배 수. */
  readonly losses: number;
  /** 스터디(가르치는 판)인가 — 대상 아님. */
  readonly studyMode: boolean;
  /** 실유저 대전인가 — 대상 아님. */
  readonly versus: boolean;
  /**
   * 이 빌드가 전면 광고를 실제로 보여줄 수 있는가.
   * 호출부에서 `store.ads.fullscreenSupported || store.ads.allowPlaceholders` 로 넘긴다
   * (목업을 허용하는 web·toss dev 는 배치 확인을 위해 관문을 유지한다).
   */
  readonly adsUsable: boolean;
  /** 몇 번의 패배마다 한 번인가. */
  readonly every: number;
}

export function isAdGateTurn(input: AdGateInput): boolean {
  const { losses, studyMode, versus, adsUsable, every } = input;
  if (!adsUsable || studyMode || versus) return false;
  if (every <= 0) return false;
  return losses > 0 && losses % every === 0;
}
