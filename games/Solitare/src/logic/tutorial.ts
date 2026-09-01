/**
 * tutorial.ts — **상황별 순차 안내**(순수 로직, Phaser-free).
 *
 * PO 2026-08-22: "1레벨에서 ＋5·와일드를 **배치하지 말라는 게 아니다**. 배치는 하되 사용법을 순차적으로
 *   튜토리얼로 안내하면서 진행시키라."
 *
 * 그래서 기능을 잠그지 않는다. 대신 **그 요소를 처음 만나는 순간** 한 번만 설명한다:
 *   와일드 카드가 보드에 드러났을 때 · 뽑기가 처음 바닥났을 때 · 보너스 ＋N 이 터졌을 때 …
 * 안내는 **본 것만 기록**(SaveData.tipsSeen)해 두 번 뜨지 않는다. 순서는 플레이가 정한다 —
 * 화면에 실제로 나타난 것만 설명하므로 자연히 순차가 된다.
 *
 * ⚠️ 안내가 겹쳐 쏟아지면 튜토리얼이 아니라 방해다. `pickTip` 은 **한 번에 하나만** 고르고,
 *   같은 판에서 이미 하나를 보여 줬으면 다음 판으로 미룬다(shownThisRound).
 */

/** 안내 시점(트리거) 키 — 게임에서 그 상황이 처음 생겼을 때 부른다. */
export type TipKey =
  | 'match'        // 판 시작 — 기본 규칙
  | 'draw'         // 낼 카드가 없어 뽑아야 할 때
  | 'combo'        // 연속 매칭이 붙기 시작할 때
  | 'bonusCard'    // 보드 보너스 ＋N 이 드러났을 때
  | 'wildCard'     // 보드 와일드가 뽑기 더미에 들어갔을 때
  | 'wildUse'      // 와일드가 기준 카드가 됐을 때(실제로 쓸 차례)
  | 'diamond'      // 다이아를 처음 모았을 때
  | 'emptyStock'   // 뽑기가 처음 바닥났을 때(＋5 결제 시점)
  | 'undo'         // 되돌리기를 쓸 수 있게 됐을 때
  | 'customerStar' // 콤보가 끝나 손님이 별을 게이지에 넣을 때
  | 'mission'      // 미션(연속 5매칭)이 처음 달성됐을 때
  | 'collection'   // 컬렉션 카드를 처음 받았을 때
  | 'star';        // 첫 클리어 직전 — 별 기준 안내

/**
 * 안내 문구 — **제목 / 부제 / 본문** 3단(PO 2026-08-23).
 *   제목은 창 위 탭에 들어가므로 **아주 짧게**(4~6자), 부제는 한 줄 요약, 본문은 자세한 설명.
 */
export interface TipText {
  /** 탭에 들어가는 아주 짧은 이름. */
  readonly title: string;
  /** 한 줄 요약 — 본문 위에 굵게. */
  readonly subtitle: string;
  readonly body: string;
}

/**
 * **표시 우선순위 겸 기본 순서** — 여러 트리거가 동시에 걸리면 앞쪽을 먼저 보여 준다.
 * 기본 규칙(match·draw)이 특수 요소(와일드·보너스)보다 먼저 오도록 배치했다.
 */
export const TIP_ORDER: readonly TipKey[] = [
  'match', 'draw', 'combo', 'customerStar', 'mission', 'collection',
  'emptyStock', 'bonusCard', 'wildCard', 'wildUse', 'diamond', 'undo', 'star',
];

export const TIPS: Readonly<Record<TipKey, TipText>> = {
  match: { title: '매칭 방식', subtitle: '숫자가 1 차이면 낼 수 있어요', body: '숫자 +1, −1 차이 매칭 · 무늬는 상관없음\nA와 K도 이어집니다.' },
  draw: { title: '뽑기', subtitle: '낼 카드가 없을 때 눌러요', body: '매칭할 카드가 없으면 뽑기 카드를 눌러 주세요.\n새 카드 한 장이 기준 카드 자리로 옮겨집니다.' },
  combo: { title: '연속 보상', subtitle: '연속으로 내면 더 큰 보상을 받아요', body: '끊지 않고 이어서 내면 점수와 미션 보상이 커집니다.' },
  emptyStock: { title: '뽑기 소진', subtitle: '＋5 카드로 이어서 할 수 있어요', body: '＋5 카드를 구매하면 이미 쓴 카드 5장이\n뽑기 더미로 돌아와 이어서 할 수 있습니다.' },
  bonusCard: {
    title: '＋N 카드',
    subtitle: '뽑을 카드가 그만큼 늘어나요',
    body: '이 ＋N 카드가 오픈되면 표시된 숫자만큼 카드가 생성되어\n뽑기 더미에 추가됩니다.\n그만큼 뽑을 수 있는 카드가 늘어납니다.',
  },
  wildCard: {
    title: '와일드',
    subtitle: '어떤 카드와도 매칭돼요',
    body: '와일드 카드가 나타났습니다.\n이 카드는 뽑기 카드 더미로 들어갑니다.\n뽑아서 기준 카드가 되면 어떤 카드와도 매칭할 수 있습니다.',
  },
  wildUse: { title: '지금 와일드', subtitle: '아무 카드나 낼 수 있어요', body: '기준 카드가 와일드입니다. 숫자·무늬와 상관없이 아무 카드나 한 장 탭하세요.' },
  diamond: { title: '다이아', subtitle: '건설에 쓰는 재화예요', body: '카드에 끼워진 다이아는 그 카드를 내면 모입니다. 건설에 쓰여요.' },
  undo: { title: '되돌리기', subtitle: '코인으로 방금 수를 물려요', body: '방금 낸 수가 아쉬우면 되돌리기 기능을 통하여 코인으로 물릴 수 있어요.' },
  customerStar: {
    title: '손님의 별',
    subtitle: '콤보가 별이 되어 쌓여요',
    body: '연속으로 낼 때마다 손님이 별을 하나씩 모읍니다.\n콤보가 끊기면 손님이 모은 별을 상단 게이지에 넣고 떠납니다.\n게이지가 찰수록 클리어 별 등급이 올라갑니다.',
  },
  mission: {
    title: '미션 달성',
    subtitle: '연속 5매칭마다 보상이 나와요',
    body: '연속 5매칭마다 미션이 달성되어 보상을 받습니다.\n상단 MISSIONS 칸에서 다음 보상을 미리 볼 수 있어요.\n콤보가 끊겨 5개를 못 채우면 미션이 바뀝니다.',
  },
  collection: {
    title: '컬렉션 카드',
    subtitle: '세트를 완성하면 추가 보상을 받아요',
    body: '미션 보상으로 나오는 특별한 카드입니다.\n홈 화면 컬렉션에 모이고, 세트를 완성하면 추가 보상을 받습니다.',
  },
  star: { title: '별 등급', subtitle: '깨끗하게 깰수록 별이 늘어요', body: '＋5 없이 깨면 기본 3개.\n손님이 넣은 별로 게이지가 찰수록 4·5개가 됩니다.' },
};

/**
 * 지금 보여 줄 안내 하나를 고른다 — **아직 안 본 것** 중 우선순위가 가장 앞선 것.
 * @param seen      이미 본 안내 키들(SaveData.tipsSeen)
 * @param triggered 이번에 조건이 충족된 키들
 * @param shownThisRound 이 판에서 이미 안내를 보여 줬는가(한 판에 하나만)
 */
export function pickTip(seen: readonly string[], triggered: readonly TipKey[], shownThisRound: boolean): TipKey | null {
  if (shownThisRound) return null;
  const set = new Set(triggered);
  // **기본 안내(뽑기)가 먼저다.** 첫 수를 두자마자 조건이 서는 '되돌리기'·'콤보'가 차례를 채가면
  //   정작 "낼 카드가 없으면 뽑는다"는 가장 기본적인 안내가 한참 뒤로 밀린다(실측: lv3 에야 등장).
  //   상황성 안내(와일드·보너스·다이아 등 그 순간에만 볼 수 있는 것)는 막지 않는다 — 놓치면 다시 못 본다.
  const deferred: readonly TipKey[] = ['combo', 'undo'];
  const gate = seen.includes('draw') ? [] : deferred;
  return TIP_ORDER.find((k) => set.has(k) && !seen.includes(k) && !gate.includes(k)) ?? null;
}

/** 남은(아직 안 본) 안내 수 — 튜토리얼이 끝났는지 판단용. */
export function remainingTips(seen: readonly string[]): number {
  return TIP_ORDER.filter((k) => !seen.includes(k)).length;
}
