/**
 * play-sim.mts — **실제 PlayScene 규칙을 그대로 따르는** 공용 플레이아웃 시뮬레이터.
 *
 * ## 왜 새로 만들었나(PO 2026-07-28 "시뮬레이션에서 와일드카드가 적용되지 않는다")
 * 지금까지 튜닝·감사 스크립트들은 그리디 매칭 플레이만 흉내 냈지, **보드 와일드**와 **보드 보너스(+N)**
 * 를 빼먹었다. 그런데 이 둘은 PlayScene 이 **모든 레벨에 자동으로** 배치한다(designateWild):
 *   - 와일드: 덮인 슬롯 하나가 와일드로 지정된다. 노출되면 **자동으로** 보드에서 사라지고(공짜 클리어)
 *     스톡 중간에 와일드 카드 1장이 삽입된다. 그 카드가 뽑히면 다음 1수는 ±1 매칭 없이 노출 카드 아무거나
 *     낼 수 있다(playWild).
 *   - 보너스(+N, N∈{1,2,3,5}): 다른 덮인 슬롯 하나가 보너스로 지정된다. 노출되면 **자동으로** 사라지고
 *     스톡에 N장이 추가된다(consumeBonusCard). N 은 레벨별로 **결정적**(BONUS_PATTERN, PlayScene.ts 와
 *     동일한 고정시드 셔플 — 레벨마다 항상 같은 값).
 * 둘 다 "공짜로 보드가 줄고 스톡이 늘어나는" 방향이라, 이걸 빼고 측정하면 **실제보다 뽑기가 더 필요한
 * 것처럼 나온다** — 반대로 튜닝을 하면 실제 플레이에서 뽑기 더미가 예상보다 훨씬 많이 남는다(PO 실측:
 * 8~10장). 이 모듈은 두 메커니즘을 정확히 재현해, 튜닝·감사가 실제 체감과 일치하게 한다.
 *
 * ## 3번째 누락 — **미션 리워드**(PO 2026-08-21 "아직도 뽑기 잔여가 5~7장까지 남는다")
 * 위 두 개를 넣고도 실제와 안 맞았다. 빠진 것은 PlayScene 의 **미션 틱**이다 — **연속 5매칭**마다
 * (콤보가 끊기면 리셋) 보상을 하나 추첨해 지급하는데, 그 표(MISSION_REWARD_TABLE)의 절반이
 * **뽑기 추가**다: cards +2(가중 34) · plus5 +3(8) · wild +2(8). 나머지(코인 38 · 다이아 6 ·
 * 컬렉션 14~34)는 스톡과 무관하다. 즉 **틱 1회당 기대 스톡 +1.0장**, 판당 3~5틱이면 **+3~5장**이
 * 공짜로 얹힌다. 와일드(+1)·보너스(+2)까지 합치면 판당 **6장 안팎**이 모델 밖에 있었고, 그게 그대로
 * 잔여로 남았다. 이제 여기서 같은 규칙으로 재현한다.
 */
import { seededRng } from '../src/logic/deck.js';
import {
  MISSION_REWARD_TABLE, MISSION_SET_SIZE, collectionWeightForLevel, missionStockAmount, stockIsAmple as ampleRule,
  bonusValueForLevel, pickSpecialSlots,
} from '../src/logic/economyRules.js';
import { pickBotMoves } from '../src/logic/botPolicy.js';
import {
  isWin, isExposed, availableMoves, playCard, playWild, drawStock, refillStock,
  bankWildToStock, consumeBonusCard, type GameState,
} from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import type { PeakLayout } from '../src/logic/layouts.js';

/** PlayScene.ts BONUS_PATTERN 과 완전히 동일 — 순서를 그대로 재현해야 레벨별 보너스 값이 실제와 일치한다. */
/**
 * 미션 리워드 표 — PlayScene.ts MISSION_REWARD_TABLE 과 **동일**(스톡에 영향 있는 항목만 amount 사용).
 *   컬렉션 가중치는 레벨에 따라 34(레벨1) → 14(레벨20+)로 감소한다(collectionWeightForLevel 과 동일).
 */
/** 스톡에 영향 있는 보상만 장수로 환산(coins/diamond/collection = 0). */
const MISSION_TABLE = MISSION_REWARD_TABLE.filter((r) => r.kind !== 'collection').map((r) => ({
  stock: r.kind === 'cards' || r.kind === 'plus5' || r.kind === 'wild' ? r.amount : 0,
  weight: r.weight,
}));
/** 미션 1틱 = **연속 5매칭**(PlayScene SET_SIZE). 콤보가 끊기면(뽑기) 연속 카운터는 0으로 돌아간다. */
const SET_SIZE = MISSION_SET_SIZE;
/** PlayScene 의 "뽑기가 넉넉하면 코인으로 대체" 규칙과 **동일**(STOCK_AMPLE_RATIO / MIN). */
function stockIsAmple(s: GameState): boolean {
  return ampleRule(s.layout.slots.length - s.cleared.size, s.stock.length); // economyRules 단일 출처.
}
/** 미션 틱 1회의 보상 추첨 → 스톡에 더해질 장수(0이면 재화 보상). */
function rollMissionStock(level: number, rng: Rng): number {
  const entries = [...MISSION_TABLE, { stock: 0, weight: collectionWeightForLevel(level) }];
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) { r -= e.weight; if (r <= 0) return e.stock; }
  return 0;
}

// 보너스 패턴·초반 상한은 economyRules.bonusValueForLevel (단일 출처).


/** 특수 슬롯 결정 — **economyRules.pickSpecialSlots 단일 출처**(PlayScene 과 같은 코드). */
export function assignSpecials(layout: PeakLayout, start: GameState, level: number) {
  const exposedNow = new Set(layout.order.filter((id) => isExposed(start, id)));
  const picked = pickSpecialSlots(layout, exposedNow, level);
  return {
    wildSlotId: picked.wildSlotId,
    bonusSlotId: picked.bonusSlotId,
    bonusCount: picked.bonusSlotId ? bonusValueForLevel(level) : 0,
  };
}

const MAX_BUYS = 12;
const ADD5_COUNT = 5;

export interface PlayoutResult {
  win: boolean;
  buys: number;
  leftover: number;
  /** 패배 시 남은 보드 카드 수(= 부족 체감의 크기). 승리면 0. */
  boardLeft: number;
  /**
   * **니어미스 사건 수** — 노출 카드가 있는데 뽑은 카드가 3연속 이상 안 맞은 구간의 횟수.
   *   "일부러 안 준다"고 의심할 만한 사건의 대리 지표(조향 반감 측정용). 뽑기 부족 게이트와 무관하게 센다.
   */
  nearMiss: number;
  /** 미션 틱 기록(옵션) — 콤보가 끊길 때 정산된 건별 콤보 길이(PlayScene.endComboRun 규약). */
  missionTicks?: Array<{ filled: number }>;
}

/**
 * 그리디(최대 오픈 카드수 우선) 플레이아웃 — 와일드·보너스 자동 트리거 포함.
 * `allowBuys=false` 면 막혔을 때 그냥 패배 처리(순수 승률 측정용), true 면 PlayScene 과 같은 ＋5 구매 루프.
 */
export function playout(layout: PeakLayout, start: GameState, level: number, rng: Rng, allowBuys: boolean, opts: { trackMissions?: boolean } = {}): PlayoutResult {
  const ticks: Array<{ filled: number }> = [];
  let pendingTicks = 0;
  let s = start;
  const { wildSlotId, bonusSlotId, bonusCount } = assignSpecials(layout, start, level);
  let wildBanked = false, bonusTriggered = false, wildActive = false;

  const autoTrigger = () => {
    if (wildSlotId && !wildBanked && isExposed(s, wildSlotId)) { wildBanked = true; s = bankWildToStock(s, wildSlotId, rng); }
    if (bonusSlotId && !bonusTriggered && isExposed(s, bonusSlotId)) { bonusTriggered = true; s = consumeBonusCard(s, bonusSlotId, bonusCount); }
  };
  autoTrigger();

  // 수 선택은 **logic/botPolicy.ts 단일 출처**(PlayScene 시뮬 봇과 동일한 "가장 스마트한 플레이").
  const bestGainAmong = (ids: readonly string[], chainAware = false): string[] => pickBotMoves(s, ids, chainAware);

  let buys = 0;
  let missRun = 0; // 연속 비생산 드로우(노출 카드가 있는데 안 맞음).
  let nearMiss = 0;
  const boardLeftNow = (): number => s.layout.slots.length - s.cleared.size;
  const settle = (): void => { for (let k = 0; k < pendingTicks; k++) ticks.push({ filled: runMatches }); pendingTicks = 0; };
  const done = (win: boolean): PlayoutResult => { settle(); return { win, buys, leftover: win ? s.stock.length : 0, boardLeft: win ? 0 : boardLeftNow(), nearMiss, ...(opts.trackMissions ? { missionTicks: ticks } : {}) }; };
  /** 연속 매칭 수(콤보 런) — 5 가 될 때마다 미션 틱 1회, 뽑으면 0 으로 끊긴다(PlayScene 과 동일). */
  let runMatches = 0;
  const onMatch = () => {
    runMatches++;
    if (runMatches % SET_SIZE === 0) {
      pendingTicks++;
      const add = rollMissionStock(level, rng);
      // 뽑기가 넉넉하면 **종류는 그대로 두고 장수만** 최소로 깎는다(PlayScene.rollMissionReward 와 동일 규칙).
      if (add > 0) s = refillStock(s, missionStockAmount(add, stockIsAmple(s)), rng);
    }
  };
  const cap = (s.layout.slots.length + s.stock.length) * 8 + 300;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return done(true);
    if (wildActive) {
      // 뽑힌 와일드의 1회 자유 수 — 노출 카드 아무거나(매칭 무시), 가장 많이 여는 카드를 고른다(그리디 일관).
      const exposedIds = s.layout.slots.filter((o) => !s.cleared.has(o.id) && o.coveredBy.every((c) => s.cleared.has(c))).map((o) => o.id);
      wildActive = false;
      if (exposedIds.length > 0) {
        s = playWild(s, bestGainAmong(exposedIds)[0]);
        onMatch();
        autoTrigger();
        continue;
      }
    }
    const moves = availableMoves(s);
    if (moves.length > 0) {
      s = playCard(s, bestGainAmong(moves, true)[0]);
      onMatch();
      autoTrigger();
      continue;
    }
    if (s.stock.length > 0) {
      const hadExposed = availableMoves(s).length === 0 && boardLeftNow() > 0; // 막힌 상태에서 뽑는다.
      settle(); // 뽑기 = 콤보 종료 → 미션 정산(건별 별 = 콤보 길이).
      s = drawStock(s, rng);
      runMatches = 0; // 뽑으면 콤보 런이 끊긴다 → 미션 진행도 리셋.
      const top = s.waste[s.waste.length - 1];
      if (top?.wild) wildActive = true;
      const productive = top?.wild || availableMoves(s).length > 0;
      if (hadExposed && !productive) {
        missRun++;
        if (missRun === 3) nearMiss++; // 3연속 헛뽑기 = 사건 1회(그 이상은 같은 사건).
      } else missRun = 0;
      continue;
    }
    if (!allowBuys) return done(false);
    if (buys >= MAX_BUYS || s.waste.length <= 1) return done(false);
    const next = refillStock(s, ADD5_COUNT, rng);
    if (next === s) return done(false);
    s = next;
    buys++;
  }
  return done(isWin(s));
}
