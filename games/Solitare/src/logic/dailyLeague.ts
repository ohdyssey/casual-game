/**
 * dailyLeague.ts — **투데이 리그 단계 사다리**(24시간, 10단계). 순수 로직.
 *
 * 구조(PO 2026-08-23 확정)
 *   ① 하루 10단계. 단계마다 **목표 상품이 바뀐다**(층별 점포 상품 — `config/floorItems.ts`).
 *   ② 3콤보를 낼 때마다 **지금 단계의 목표 상품**이 1개 드랍된다.
 *   ③ 단계를 채우면 **코인 보상**이 즉시 지급되고 다음 단계로 올라간다.
 *   ④ 하루 총 수집량이 **리그 점수** — 자정에 순위 보상이 따로 나온다.
 *
 * ## 왜 이 곡선인가 — 앞은 가볍게, 뒤는 벽
 * 증가폭이 1·1·1·2·2·3·4·6·8 로 계속 커진다. 마지막 칸(29) 하나가 앞 9단계 합(71)의 40% 다.
 *   · 5판(≈12개)  → 4단계
 *   · 10판(≈25개) → 6단계
 *   · 20판(≈50개) → 8단계
 *   · 40판(≈100개) → 완주
 * 1단계가 1개인 것이 중요하다 — **접속해서 한 판만 해도 즉시 하나 받는다.**
 * (드랍률 근거: 레벨 1~300 · 2,400판 실측에서 3콤보 기준 판당 2.47개.)
 *
 * ## 이월이 없다
 * 단계를 넘길 때 남은 수집은 **버린다**. 이월을 허용하면 앞에서 쌓아 둔 것으로 마지막 29개를
 * 그냥 통과해 버려 뒷단계가 벽이 되지 못한다.
 */
import { ITEM_FLOORS } from '../config/floorItems.js';

/** 단계별 목표 수집량(이 단계 분량 — 누적이 아니다). */
/*
 * **단계별 별 목표**(PO 2026-08-24: "단계별 별수집 목표치는 너무 낮습니다").
 *
 * ## 숫자의 근거 — 실측 판당 평균 **3.38별**
 * 레벨 3~300 8판 표본: 0 · 1 · 7 · 1 · 6 · 1 · 6 · 5. 미션 보상표에서 '별'이 38% 확률로 뽑히고
 * 그때 콤보 길이만큼 들어오므로, 판마다 편차가 크고 **0개인 판도 흔하다**.
 *
 * ## 옛 표의 문제
 * `[1,2,3,4,6,8,11,15,21,29]`(합계 100)는 **1단계가 별 하나**였다 — 첫 미션 한 번이면 5,000코인이
 * 나온다(PO 지적: "1단계에서 별이 하나인가요?"). 사다리를 타는 느낌이 아니라 접속 보상이 된다.
 *
 * ## 새 표 — **1단계 10 → 10단계 300**(PO 2026-08-24 지정)
 * 증가폭이 계속 커지는 톱니바퀴다: +6 · +8 · +11 · +15 · +20 · +26 · +39 · +60 · **+105**.
 * 마지막 칸 하나(300)가 앞 아홉 칸 합(631)의 절반에 가깝다 — **최종 단계는 아주 어렵게**.
 *
 * 실측 3.38별/판 기준 누적 도달 판수:
 *   1단계 3판 · 2단계 8판 · 3단계 15판 · 4단계 25판 · 5단계 40판 ·
 *   6단계 61판 · 7단계 89판 · 8단계 129판 · 9단계 187판 · **완주 275판**
 *
 * ⚠️ 하루 275판은 사실상 도달 불가다 — **완주는 상징**이고 실제 수령은 중간 단계에서 일어난다는
 *   전제다(PO 지정값). 완주를 실제로 닿게 하려면 이 표가 아니라 **별 유입량**(미션 보상표의 별 38%
 *   비중·콤보 길이)을 손대야 한다.
 *
 * ⚠️ 유입량은 미션 보상표(별 38%)와 콤보 길이에 좌우된다. 둘 중 하나를 바꾸면 **다시 재고** 고칠 것.
 */
/**
 * **파형 사다리**(PO 2026-08-25) — 단조 상승을 버리고 **허들 칸 ↔ 회복 칸을 교대**로 배치한다.
 *   허들(30·45·65·100)을 넘으면 곧바로 얕은 회복 칸(15·22·35·55)이 터져 "고비 하나 = 보상 2연타"가
 *   되고, 하루 마감이 허들 중간에 걸려 다음 접속 목표가 생긴다(리그 지속성 설계).
 *   1칸(10)은 첫 보상 훅(실측 1.8판) 보존, 10칸(300)은 완주 상징 보존.
 *   ⚠️ 간격은 실측 별 유입 5.64개/판 기준 — 미션 보상표(별 38%)·콤보 곡선을 바꾸면 재보정할 것.
 */
/*
 * ⚠️ **2026-08-30 ×6 — 별 인플레 계수(STAR_SCALE)**. 클리어 정산(`economyRules.clearRewardsForGrade`)으로 메인
 *   승리 1판의 리그 별이 5.64 → ≈34(보너스 승리 1판 41 과 같은 자)가 됐다. 표의 **판수 감각**(1칸 = 1.8판 ·
 *   허들2 = 5.3판 …)을 그대로 지키려면 목표도 같은 배율로 올려야 한다. 별당 코인은 같은 배율로 **내려**
 *   칸당 코인(= 목표 × 별당)이 예전과 같게 — 리그 일수입(실측 31,385)이 변하지 않는다.
 *   ⚠️ 목표만 올리고 별당 코인을 두면 리그 수입이 6배가 된다(코인 인플레).
 */
export const STAR_SCALE = 6;
export const LEAGUE_STAGE_GOALS: readonly number[] = [10, 30, 15, 45, 22, 65, 35, 100, 55, 300].map((g) => g * STAR_SCALE);
/**
 * 단계별 코인 보상 — 난이도와 같은 기울기로 오른다.
 *
 * ⚠️ 초안(500~25,000 · 합 65,000)은 **너무 컸다**(PO 2026-08-23). 하루 보상이 건설비 한 층을
 *   덮어 버리면 코인을 살 이유가 사라진다. 결제 모델의 자리를 남기려면 이 값은 **판수에 비례하는
 *   가속기**여야지 급여가 되면 안 된다. 합계 20,200 = 완주(하루 40판) 기준.
 */
/**
 * **10단계 톱니바퀴 보상**(PO 2026-08-24: "보상 역시 이 톱니바퀴에 대응하는 구조로").
 *
 * 목표가 10 → 300 으로 **30배** 커지는데 보상만 완만히 오르면, 뒤 칸은 "많이 걸리는데 덜 받는" 칸이
 * 되어 아무도 올라가지 않는다. 그래서 **별 한 개의 값을 고정**(`COIN_PER_STAR`)하고 각 칸의 보상을
 * 그 칸의 목표에 곱해서 만든다 — 난이도와 보상이 같은 곡선을 그린다.
 *
 *   1단계 10별 → 3,200 … 10단계 300별 → 96,000 (합계 216,640 — 2026-08-25 파형+320/별 기준)
 *
 * ⚠️ 위클리 5배 상향과 마찬가지로 **의도적으로 후한 임시값**이다(PO: 나중에 다시 조정 예정).
 *   경제 균형을 논할 때 `config/thiefEvent.ts` 와 이 표를 함께 볼 것.
 */
// PO 2026-08-25: 500 → 320 — 리그 일수입 **-30%**(실측 13일 대입 45,000 → 31,385) 조정.
//   저레벨 무료 코인 다이어트(결제 유도 핀치 설계)의 일부 — 절감 폭은 이 한 값으로 튜닝한다.
const COIN_PER_STAR = Math.round(320 / STAR_SCALE); // = 53. 칸당 코인은 예전(목표×320)과 같다(2026-08-30 ×6 정합).

export const LEAGUE_STAGE_COINS: readonly number[] = LEAGUE_STAGE_GOALS.map((g) => g * COIN_PER_STAR);

/**
 * **라이브 튜닝 상태**(econ/economy.json → econRuntime 이 주입) — 표는 설계 기본값(SSOT)으로 두고,
 * 유효값은 stageGoal/stageCoins/leagueGrand* 가 배율을 곱해 계산한다. 코드 배포 없이 JSON 만
 * 바꿔 전체 유저의 리그 수익/난이도를 조절하기 위한 구조(PO 2026-08-25).
 */
let TUNE = { goalMult: 1, coinPerStar: COIN_PER_STAR, grandMult: 1 };

/** econRuntime.setEconFromJson 전용 — 게임 코드에서 직접 부르지 말 것. */
export function setLeagueTuning(t: { goalMult?: number; coinPerStar?: number; grandMult?: number }): void {
  TUNE = {
    goalMult: t.goalMult != null && Number.isFinite(t.goalMult) && t.goalMult > 0 ? t.goalMult : 1,
    coinPerStar: t.coinPerStar != null && Number.isFinite(t.coinPerStar) && t.coinPerStar > 0 ? t.coinPerStar : COIN_PER_STAR,
    grandMult: t.grandMult != null && Number.isFinite(t.grandMult) && t.grandMult > 0 ? t.grandMult : 1,
  };
}

/** 완주 그랜드 프라이즈 **유효값**(배율 반영). 표시·지급 모두 이것을 쓸 것. */
export function leagueGrandCoins(): number {
  return Math.round((LEAGUE_GRAND.coins * TUNE.grandMult) / 1000) * 1000;
}

/**
 * **그랜드 다이아 배율 — 톱니바퀴 + 가끔 계곡**(PO 2026-08-31 "다이아도 보상을 통해 지급 … 톱니바퀴 형태의
 *   지급을 통해 가끔 계곡이 발생하여 결제구조를 만들어야 합니다"). `logic/paceCurve.ts` 의 난이도 톱니바퀴와
 *   **같은 모양**을 그랜드 다이아 지급에도 적용한다 — 매일 같은 300이면 살 이유가 없고, 매번 다르면 계획을
 *   못 세운다. 6일 주기로 넉넉(1.3배)·기준(1.0배)·박함(0.7배)을 오가다, 13일째부터 9일마다(단 10의 배수는
 *   제외 — 클론다이크 보너스 자리와 겹치지 않게) **깊은 계곡(0.3배)** 을 박아 결제 유도 지점을 만든다.
 *
 * ⚠️ **periodId 기준**(플레이어별 리그 완주 횟수 아님) — `league.periodIdFor()`(자정 기준 일 인덱스, 서버
 *   전체 공통값)를 그대로 넣는다. 그래야 "오늘은 계곡"이 전 유저에게 동시에 적용되는 라이브옵스 신호가 된다.
 */
const GRAND_DIA_CYCLE = [1.3, 1.0, 0.7, 1.0, 1.3, 0.7] as const; // paceCurve.CYCLE 과 같은 6단 리듬.
const GRAND_DIA_VALLEY_FROM = 13;
const GRAND_DIA_VALLEY_EVERY = 9;
const GRAND_DIA_VALLEY_MULT = 0.3;

function grandDiamondMultFor(periodId: number): number {
  const d = Math.abs(Math.floor(periodId));
  if (d >= GRAND_DIA_VALLEY_FROM && (d - GRAND_DIA_VALLEY_FROM) % GRAND_DIA_VALLEY_EVERY === 0 && d % 10 !== 0) {
    return GRAND_DIA_VALLEY_MULT;
  }
  return GRAND_DIA_CYCLE[d % GRAND_DIA_CYCLE.length];
}

/**
 * 완주 그랜드 다이아 **유효값**. `periodId` 를 주면 톱니바퀴 배율까지 반영(실지급·화면 표시는 항상 이렇게
 *   부를 것) — 생략하면 기준(1.0배, econLab 시뮬레이터 등 "평균값"이 필요한 곳 전용) 값만 돌려준다.
 */
export function leagueGrandDiamonds(periodId?: number): number {
  const base = LEAGUE_GRAND.diamonds * TUNE.grandMult;
  const mult = periodId == null ? 1 : grandDiamondMultFor(periodId);
  return Math.max(1, Math.round(base * mult));
}

/**
 * **완주 그랜드 프라이즈** — 10단계를 모두 끝냈을 때 단계 보상에 **추가로** 얹는다.
 * 마지막 칸 하나(150,000)의 두 배로 두어 "완주"가 사다리의 최상위 목표임을 분명히 한다.
 */
export const LEAGUE_GRAND = { coins: 300_000, diamonds: 300 } as const;
/** 단계 수. */
export const LEAGUE_STAGE_COUNT = LEAGUE_STAGE_GOALS.length;

/**
 * **완주 목표 판수** — 이 한 값이 "판당 몇 개를 보드에 끼울지"를 정한다(PO 2026-08-23).
 *
 * 예전엔 3콤보마다 자동으로 떨어졌다. 그러면 판당 개수가 **콤보 운**에 좌우돼(1,500판 실측 6.48개,
 * 설계 가정 2.47개의 2.6배) 사다리가 15판에 끝나 버렸다 — 마지막 칸(29)을 벽으로 세운 설계가 무의미해진다.
 * 이제는 딜 시점에 **정해진 개수만 카드 뒤에 끼운다**(다이아와 같은 방식). 개수가 결정적이므로
 * 이 상수 하나로 완주 속도를 정확히 조준할 수 있다.
 */
export const LEAGUE_TARGET_GAMES = 40;

/**
 * 이 레벨의 보드에 끼울 **수집 상품 개수**.
 *
 * 평균은 `LEAGUE_TOTAL_GOAL / LEAGUE_TARGET_GAMES`(= 100/40 = 2.5)여야 하는데 개수는 정수라
 * 매 판 반올림하면 오차가 한쪽으로 쌓인다. 그래서 **누적값의 차분**을 쓴다 — 어느 구간을 잘라도
 * 평균이 유지되고(2,3,2,3…), 레벨이 같으면 항상 같은 값이라 재현도 된다.
 */
export function collectItemsForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  const avg = LEAGUE_TOTAL_GOAL / LEAGUE_TARGET_GAMES;
  return Math.max(1, Math.round(avg * lv) - Math.round(avg * (lv - 1)));
}

export interface LeagueStageState {
  /** 지금 도전 중인 단계(0부터). `LEAGUE_STAGE_COUNT` 면 완주. */
  readonly stage: number;
  /** 지금 단계에서 모은 수. */
  readonly count: number;
}

export const EMPTY_STAGE_STATE: LeagueStageState = { stage: 0, count: 0 };

/**
 * **넘친 진행도를 굴려 올린다** — `count >= goal` 인 채로 멈춘 상태를 다음 단계로 옮긴다.
 *
 * PO 2026-08-24 신고: "게이지가 완료되었는데 다음단계 보상으로 넘어가지 않았습니다."
 * 보상 규칙이나 목표표를 바꾸면 **이미 저장된 진행도**가 새 목표를 넘어선 채 남는다. 그러면 화면은
 * `29/29` 로 가득 찬 채 멈춰 보이고, 다음 단계로도 가지 않는다. 읽을 때 굴려 올려 그 상태를 없앤다.
 *
 * ⚠️ 여기서는 **코인을 주지 않는다**(순수 계산). 지급은 `addCollected` 가 같은 규칙으로 처리한다.
 */
export function rollStageOverflow(state: LeagueStageState): LeagueStageState {
  let stage = Math.max(0, Math.floor(state.stage));
  let count = Math.max(0, Math.floor(state.count));
  while (!isLeagueCleared(stage) && count >= stageGoal(stage)) {
    count -= stageGoal(stage);
    stage += 1;
  }
  return { stage, count: isLeagueCleared(stage) ? 0 : count };
}

/** 그 단계의 목표(표를 넘어가면 마지막 값). */
export function stageGoal(stage: number): number {
  const i = Math.max(0, Math.floor(stage));
  const base = LEAGUE_STAGE_GOALS[i] ?? LEAGUE_STAGE_GOALS[LEAGUE_STAGE_COUNT - 1]!;
  return Math.max(1, Math.round(base * TUNE.goalMult)); // 라이브 튜닝 배율 반영.
}

/** 그 단계의 보상 코인. */
export function stageCoins(stage: number): number {
  const i = Math.max(0, Math.floor(stage));
  if ((LEAGUE_STAGE_GOALS[i] ?? 0) <= 0) return 0;
  // 난이도↔보상 정합 원칙 유지: 보상 = **유효 목표** × 별당 코인(둘 다 튜닝 노브).
  return stageGoal(i) * TUNE.coinPerStar;
}

/** 사다리 10칸을 다 받았을 때의 **단계 보상 합계**(그랜드 프라이즈는 별도). */
export const LEAGUE_COMPLETE_COINS = LEAGUE_STAGE_COINS.reduce((a, b) => a + b, 0);

/** 완주했는가. */
export function isLeagueCleared(stage: number): boolean {
  return stage >= LEAGUE_STAGE_COUNT;
}

/**
 * 그 단계가 노리는 **층** — 플레이어가 **가진 점포 안에서만** 순환한다(PO 2026-08-23).
 *
 * ⚠️ 예전 규칙은 보유 층에서 시작해 단계마다 한 층씩 **위로** 올라갔다(2층 보유자가 3·4·5층…).
 *   그러면 아직 짓지도 않은 층의 상품을 모으게 돼 "내 가게에 없는 물건"이 화면에 뜬다 — 무엇을 왜
 *   모으는지가 끊긴다. 이제는 **1층~보유 최고층** 안에서만 돌아, 떨어지는 상품이 항상 자기 점포 것이다.
 *
 * 신규(1층)는 1층 상품만, 5층 보유자는 1~5층 상품이 번갈아 나온다 — 지을수록 종류가 늘어난다.
 * 아트가 있는 층수(ITEM_FLOORS)를 넘는 보유는 그 범위로 잘린다.
 */
export function stageFloor(stage: number, builtFloors: number): number {
  const owned = Math.min(ITEM_FLOORS, Math.max(1, Math.floor(builtFloors)));
  return (Math.max(0, Math.floor(stage)) % owned) + 1;
}

export interface StageAdvance {
  readonly next: LeagueStageState;
  /** 이번에 올라간 단계 수. */
  readonly staged: number;
  /** 올라간 단계들의 코인 합(완주 시 그랜드 코인 포함). */
  readonly coins: number;
  /** 완주 시 그랜드 다이아(톱니바퀴 배율 반영) — 완주가 아니면 항상 0(단계 소보상엔 다이아 없음). */
  readonly diamonds: number;
  readonly justCleared: boolean;
}

/**
 * 수집 `n` 개를 반영한다. 목표를 넘겨도 **남는 만큼은 버린다**(이월 없음) — 한 번에 두 단계가
 * 오르는 일은 없다. 그래서 반환 `staged` 는 0 또는 1 이다.
 * `periodId` 는 완주 그랜드 다이아의 톱니바퀴 배율 계산용(`league.periodIdFor()`) — 생략하면 기준값.
 */
export function addCollected(state: LeagueStageState, n = 1, periodId?: number): StageAdvance {
  const add = Math.max(0, Math.floor(n));
  if (isLeagueCleared(state.stage) || add === 0) {
    return { next: state, staged: 0, coins: 0, diamonds: 0, justCleared: false };
  }
  /*
   * **남는 수집은 다음 단계로 이월한다**(PO 2026-08-24: "게이지는 별을 수집하면서 누적되어 표시되어야
   *   합니다").
   *
   * 예전 규칙은 한 번에 한 단계만 올리고 나머지를 **버렸다**. 수집이 한 개씩 떨어지던 시절엔 문제가
   * 없었지만, 지금은 별이 한 번에 5~25개씩 들어온다 — 25개를 모아도 1단계만 오르고 24개가 사라지니
   * 게이지가 아무리 채워도 제자리로 보인다. 남는 만큼 계속 밀어 올려 실제로 누적되게 한다.
   */
  let stage = state.stage;
  let count = state.count + add;
  let staged = 0;
  let coins = 0;
  /*
   * 이미 넘쳐 있던 진행도부터 정산한다 — 표를 바꾸면 저장된 값이 새 목표를 넘긴 채 남는다.
   * (같은 루프가 아래 새 수집분까지 이어서 처리한다.)
   */
  while (!isLeagueCleared(stage) && count >= stageGoal(stage)) {
    count -= stageGoal(stage);
    coins += stageCoins(stage); // 그 단계의 소보상.
    stage += 1;
    staged += 1;
  }
  const justCleared = staged > 0 && isLeagueCleared(stage);
  if (isLeagueCleared(stage)) count = 0; // 완주 뒤에는 더 쌓지 않는다.
  /*
   * **단계마다 소보상, 완주에 그랜드 프라이즈**(PO 2026-08-24: "1단계 완성 후 2단계 식으로 10단계를
   *   완성하면서 소보상을 받습니다 … 최종적으로 완성하면 그랜드 프라이즈"). 그랜드에는 코인뿐 아니라
   *   **다이아도 함께**(PO 2026-08-31) — 톱니바퀴 배율은 `periodId` 로 오늘이 계곡인지 정한다.
   */
  let diamonds = 0;
  if (justCleared) {
    coins += leagueGrandCoins(); // 배율 반영 유효값.
    diamonds = leagueGrandDiamonds(periodId);
  }
  return { next: { stage, count }, staged, coins, diamonds, justCleared };
}

/** 표시용 — 지금 단계의 진행률(0~1). */
export function stageRatio(state: LeagueStageState): number {
  if (isLeagueCleared(state.stage)) return 1;
  const goal = stageGoal(state.stage);
  return goal <= 0 ? 1 : Math.min(1, state.count / goal);
}

/** 완주까지의 누적 목표(설계 검산용). */
export const LEAGUE_TOTAL_GOAL = LEAGUE_STAGE_GOALS.reduce((a, b) => a + b, 0);

/**
 * **그 단계까지의 누적 목표**(PO 2026-08-24: "게이지는 별을 수집하면서 누적되어 표시되어야 합니다").
 *
 * 단계별 목표만 쓰면 게이지가 단계마다 0 으로 되돌아가, 아무리 모아도 제자리로 보인다.
 * 누적으로 재면 막대가 하루 내내 한 방향으로만 자란다 — 오늘 얼마나 왔는지가 한눈에 남는다.
 *
 * @param stage 0-based 단계(= 지금까지 통과한 단계 수). 완주면 총 목표.
 */
export function cumulativeGoal(stage: number): number {
  const upto = Math.max(0, Math.min(LEAGUE_STAGE_COUNT, Math.floor(stage)));
  return LEAGUE_STAGE_GOALS.slice(0, upto).reduce((a, b) => a + b, 0);
}

/** 지금 상태의 **누적 수집량** — 통과한 단계들의 목표 합 + 이번 단계 진행분. */
export function cumulativeCollected(stage: number, count: number): number {
  return cumulativeGoal(stage) + Math.max(0, Math.floor(count));
}
/** 완주 시 단계 보상 합(경제 검산용). */
export const LEAGUE_TOTAL_STAGE_COINS = LEAGUE_STAGE_COINS.reduce((a, b) => a + b, 0);
