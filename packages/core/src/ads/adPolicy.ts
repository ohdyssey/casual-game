/**
 * 광고 배치 정책 — **전 게임 공통 문법**(2026-09-02, PO: "일관성을 기반으로 각 게임 특성에
 * 맞도록 배치").
 *
 * ## 배치 표준(placement taxonomy)
 *
 * 전 게임이 같은 두 종류만 쓴다. 게임마다 새 유형을 발명하지 않는다:
 *
 * | 유형 | 언제 | 규칙 |
 * |---|---|---|
 * | **관문(전면)** | 판과 판 사이의 자연스러운 끊김(패배 후 재도전·레벨 전환·라운드 종료) | N회에 1번만(`isAdGateTurn`). 봐도 보상 없음 — 그냥 통과 관문. 도중 닫아도 통과시킨다 |
 * | **보상형** | 사용자가 **직접 버튼을 눌러** 실질 보상을 얻는 순간 | 끝까지 시청(`'rewarded'`)에만 지급. 게임 진행을 광고 뒤에 가두지 않는다 — 광고 없이도 도달 가능한 경로가 항상 있어야 한다 |
 *
 * ## 게임 특성별 권장 배치(설계 기준표)
 *
 * | 게임 유형 | 관문(전면) | 보상형 |
 * |---|---|---|
 * | 대전·라운드형(틱택토) | 패배 N회마다 재도전 관문 | 승급전 패배 무효화(아까운 손실 구제) |
 * | 리그·입장료형(홈런팝) | 안 씀(입장료 마찰이 이미 있음) | 입장료 대체("광고보고 경기하기") |
 * | 레벨 진행형(솔리테어·열정편의점·꼬치왕·배송대작전) | 레벨 클리어 → 다음 레벨 전환 N회마다 | 무료 재화 소진 후 1회 더 / 클리어 보상 2배 |
 * | 라운드 점수형(아처리) | 라운드 종료 N회마다 | 점수·코인 2배 |
 * | 무한 러너(펌프러시) | 게임오버 N회마다 | 죽은 자리에서 이어하기 |
 *
 * ## 지켜야 할 것(전 게임 공통)
 *
 * - **빈도 상한**: 관문은 N ≥ 3(기본 `DEFAULT_GATE_EVERY`). AdSense 계정은 도메인 전체가
 *   하나라, 한 게임의 과노출이 전체 계정 정지로 번질 수 있다.
 * - **광고 불가 타겟에서는 관문 자체가 사라져야 한다**(`adsUsable`) — 라벨만 "광고 보고…"이고
 *   아무 일도 없으면 스토어 심사에서 미동작 기능이다(틱택토 MS Store 실사).
 * - 보상은 어댑터의 `'rewarded'` 결과에서만 지급(중간 닫힘 우회 금지 — 정책 위반).
 */

/** 관문(전면) 광고 기본 주기 — N회에 1번. 게임이 특성에 맞게 조절하되 3 미만 금지. */
export const DEFAULT_GATE_EVERY = 3;

export interface AdGateInput {
  /** 관문 판정의 기준 카운트(누적 패배 수·클리어한 레벨 수·게임오버 수 등 게임이 정한 축). */
  readonly count: number;
  /**
   * 이 빌드가 전면 광고를 실제로 보여줄 수 있는가.
   * 호출부에서 `store.ads.fullscreenSupported || store.ads.allowPlaceholders` 로 넘긴다
   * (목업을 허용하는 dev 타겟은 배치 확인을 위해 관문을 유지한다).
   */
  readonly adsUsable: boolean;
  /** 몇 회마다 한 번인가(기본 `DEFAULT_GATE_EVERY`). */
  readonly every?: number;
  /** 이 판이 관문 대상에서 빠지는가(튜토리얼·실유저 대전·이벤트 판 등 — 게임이 정한다). */
  readonly exempt?: boolean;
}

/**
 * 이번이 관문(전면) 광고를 거칠 차례인가 — 카운트가 `every` 의 배수일 때만.
 * 판정 기준이 누적 카운트라 별도 상태 없이도 주기가 정확하고 앱을 껐다 켜도 유지된다.
 */
export function isAdGateTurn(input: AdGateInput): boolean {
  const { count, adsUsable, exempt = false } = input;
  const every = input.every ?? DEFAULT_GATE_EVERY;
  if (!adsUsable || exempt) return false;
  if (every <= 0) return false;
  return count > 0 && count % every === 0;
}
