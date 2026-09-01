/**
 * **Catch the Thief 이벤트** 튜닝 — 상단 배너를 눌러 여는 주간 사다리 이벤트.
 *
 * 펌프러시의 탑 이벤트(JUMP FEST) **화면 구조를 그대로** 쓰되(PO 2026-08-23), 목표와 보상은
 * 이 게임 것으로 갈아끼웠다. 그쪽은 징검다리에 놓인 수집 아이템 50종(보물선 항로)에 묶여
 * 있는데, 이 게임에는 그 개념이 없다.
 *
 * ## 무엇을 모으는가 — **손님이 가져가는 점포 상품**
 * 리그는 **별**(잘한 만큼)을 센다. 이벤트는 **손님이 한 번에 3개 이상 모아 떠날 때 그 개수**를 센다
 * (PO 2026-08-24). 두 콘텐츠가 서로 다른 행동을 보상한다.
 *
 * ⚠️ 이 문서는 한때 "클리어한 판 수"라고 적혀 있었고 목표도 판 수(합계 90)로 잡혀 있었다. 그런데
 *   실제 적립은 **상품 개수**(실측 판당 평균 22개)라, 4판이면 사다리 전체가 끝나 배너가 곧바로
 *   DONE 이 됐다(PO 신고: "수집하면 게이지도 움직이지 않습니다" — 이미 완주라 움직일 게 없었다).
 *   단위를 상품 개수로 확정하고 목표를 아래처럼 다시 잡았다.
 *
 * ## 규모 — 하루 약 6,000코인 (2026-08-23 하향)
 * 초안(하루 18,000)은 **너무 컸다.** 이벤트·리그 보상이 건설비를 덮어 버리면 코인을 살 이유가
 * 사라진다 — 결제 모델은 "판을 더 하려면 코인이 필요하다"에서 출발하는데, 보상이 그 비용을
 * 대신 내 주면 고리가 끊긴다. 투데이 리그와 같은 기준으로 맞췄다.
 *   · (2026-08-24 개정) 사다리 114,000 + 완주 100,000 = **214,000 / 7일 ≈ 30,600/일** — 위 문단의
 *     "하루 6,100" 은 **옛 값**이다. PO 지시로 5배 올린 임시 상태이며 다시 조정할 예정.
 */

/**
 * 이벤트 **한 바퀴의 길이(일)** — 이 안에서 주기가 두 번 돈다(PO 2026-08-24: 주 2회).
 * 리그(하루)와 **다르다** — 남은 시간 표기 함수도 서로 다르다.
 */
export const THIEF_EVENT_DAYS = 7;
/** 한 바퀴의 앞 주기 길이(일). 뒤 주기는 나머지(3일) — 4일 + 3일 = 주 2회. */
export const THIEF_FIRST_HALF_DAYS = 4;

/** 저작(event.json)이 그리는 사다리 행 수 — 창이 밀리며 보여 준다. */
export const THIEF_ROW_COUNT = 4;

/** 한 칸의 목표와 보상. */
export interface ThiefStage {
  /** 이 칸을 끝내려면 모아야 하는 **상품 개수**(누적이 아니라 이 칸 분량). */
  readonly goal: number;
  /** 코인 보상. */
  readonly coins: number;
  /** 소모 아이템 개수 — 저작 행의 🎁 선물 아이콘 슬롯에 대응. */
  readonly items?: number;
}

/**
 * 10칸 사다리 — **주 100판을 목표, 완주는 몰입한 사람만**(PO 2026-08-24).
 *
 * ## 숫자의 근거
 * 실측 판당 점포 상품 유입 **평균 22개**(레벨 5~320, 8판 표본). 다만 그 수치는 콤보를 길게 잇는
 * 봇 기준이라 사람 손으로는 훨씬 느리다(PO: "수집하기 난이도가 매우 높습니다").
 *   · 그래서 ① 목표를 **절반으로**(2,800 → 1,400) 낮추고
 *   · ② 세는 대상을 점포 상품뿐 아니라 **판에서 모으는 아이템 전부**로 넓혔다
 *        (다이아 · ＋카드 · 와일드 · 컬렉션 카드 — `PlayScene.creditEventFromPlay`).
 *   · 1칸(30개)은 한두 판이면 닿는다 — 첫 보상까지 멀면 사다리를 쳐다보지 않는다.
 *
 * ## 보상 — **직전의 5배**(PO 2026-08-24 "나중에 다시 조정할 예정")
 * 사다리 합계 114,000 + 완주 100,000 = **214,000 / 7일 ≈ 30,600/일**.
 * ⚠️ 이 수치는 판당 적자(약 -3,900)를 크게 웃돈다 — **의도적으로 후하게 둔 임시값**이며,
 *   실플레이 감을 잡은 뒤 되돌릴 예정이다. 경제 균형을 논할 때 이 표를 먼저 확인할 것.
 */
export const THIEF_STAGES: readonly ThiefStage[] = [
  { goal: 30, coins: 2_000 },
  { goal: 45, coins: 3_000 },
  { goal: 60, coins: 4_000, items: 1 },
  { goal: 80, coins: 5_500 },
  { goal: 100, coins: 7_500 },
  { goal: 130, coins: 10_000, items: 1 },
  { goal: 165, coins: 13_000 },
  { goal: 210, coins: 17_000 },
  { goal: 260, coins: 22_000 },
  { goal: 320, coins: 30_000, items: 1 },
];

/** 완주 보너스 — **사다리 마지막 칸이 아니다.** 모든 칸을 끝냈을 때 추가로 받는다. */
export const THIEF_GRAND = { coins: 100_000, diamonds: 200, chest: true } as const; // 5배(PO 2026-08-24 임시값).

/**
 * **칸별 타겟 아이템** — 그 칸에서 **이것만** 수집으로 인정된다(PO 2026-08-24: "현재 다이아가
 * 목표인데 크로와상 수집연출이 일어난다 … 타겟 수집아이템을 수집한 최종 단계에서 수집이 일어나야").
 *
 * 예전에는 판에서 모으는 것을 **전부** 셌고 연출 아이콘만 배너 그림을 썼다. 그래서 목표가 다이아인데
 * 크루아상이 날아가는, 목표와 화면이 어긋난 상태가 됐다. 칸마다 타겟을 하나로 정하고 **아이콘도 그
 * 타겟에서 뽑아** 둘이 갈라질 수 없게 한다.
 */
export type EventTargetKind = 'store' | 'collection' | 'diamond' | 'cards' | 'wild';

/** 칸 순환 타겟 — 점포 상품 → 컬렉션 카드 → 다이아 → 뽑기 카드 → 와일드. */
export const EVENT_STAGE_TARGETS: readonly EventTargetKind[] = ['store', 'collection', 'diamond', 'cards', 'wild'];

/** 그 칸의 타겟 종류. */
export function eventStageTarget(stageIdx: number): EventTargetKind {
  return EVENT_STAGE_TARGETS[Math.max(0, Math.floor(stageIdx)) % EVENT_STAGE_TARGETS.length]!;
}

/** 타겟 종류 → 아트 키. 점포 상품만 층에 따라 달라져 호출부가 키를 넘긴다. */
export function eventTargetIconKey(kind: EventTargetKind, floorKey: string): string {
  switch (kind) {
    case 'store':
      return floorKey;
    case 'collection':
      return 'up_CollectionCard02_01'; // 실제 카드 그림(크루아상). 빈 틀(_Frame)은 무엇인지 읽히지 않았다(PO 2026-08-25).
    case 'diamond':
      return 'up_Solitare_UI_2_2';
    case 'cards':
      return 'up_Solitare_UI_08-2_v2';
    case 'wild':
      return 'up_Solitare_UI_08';
  }
}

/**
 * 그 칸에 보여 줄 아이콘 — **타겟과 같은 그림**(배너·사다리가 이 함수 하나만 쓴다).
 * @param floorKey 지금 점포의 대표 상품 키(층마다 다르므로 호출부가 넘긴다).
 */
export function eventStageIconKey(stageIdx: number, floorKey: string): string {
  return eventTargetIconKey(eventStageTarget(stageIdx), floorKey);
}

/**
 * **라이브 튜닝 상태**(econ/economy.json → econRuntime 이 주입, PO 2026-08-25) — 표(THIEF_STAGES ·
 * THIEF_GRAND)는 설계 기본값으로 두고 유효값은 아래 함수들이 배율을 곱해 계산한다.
 */
let TUNE = { goalMult: 1, coinMult: 1, grandMult: 1 };

/** econRuntime.setEconFromJson 전용 — 게임 코드에서 직접 부르지 말 것. */
export function setEventTuning(t: { goalMult?: number; coinMult?: number; grandMult?: number }): void {
  const ok = (v: number | undefined) => (v != null && Number.isFinite(v) && v > 0 ? v : 1);
  TUNE = { goalMult: ok(t.goalMult), coinMult: ok(t.coinMult), grandMult: ok(t.grandMult) };
}

/** 그 칸의 보상 코인 **유효값**(배율 반영, 100 단위 스냅). 표시·지급 모두 이것을 쓸 것. */
export function eventStageCoins(stageIdx: number): number {
  const i = Math.max(0, Math.floor(stageIdx));
  const base = (THIEF_STAGES[i] ?? THIEF_STAGES[THIEF_STAGES.length - 1]!).coins;
  return Math.round((base * TUNE.coinMult) / 100) * 100;
}

/** 완주 보너스 **유효값**(배율 반영). */
export function eventGrandCoins(): number {
  return Math.round((THIEF_GRAND.coins * TUNE.grandMult) / 1000) * 1000;
}
export function eventGrandDiamonds(): number {
  return Math.round(THIEF_GRAND.diamonds * TUNE.grandMult);
}

/** 그 칸의 목표 수(표를 넘어가면 마지막 칸을 반복한다). */
export function goalOf(stageIdx: number): number {
  const i = Math.max(0, Math.floor(stageIdx));
  const base = (THIEF_STAGES[i] ?? THIEF_STAGES[THIEF_STAGES.length - 1]!).goal;
  return Math.max(1, Math.round(base * TUNE.goalMult)); // 라이브 튜닝 배율 반영.
}

/** 모든 칸을 끝냈는가. */
export function isEventCleared(stage: number): boolean {
  return stage >= THIEF_STAGES.length;
}
