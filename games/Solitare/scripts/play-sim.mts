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
 */
import { seededRng } from '../src/logic/deck.js';
import {
  isWin, isExposed, availableMoves, playCard, playWild, drawStock, refillStock,
  bankWildToStock, consumeBonusCard, type GameState,
} from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import type { PeakLayout } from '../src/logic/layouts.js';

/** PlayScene.ts BONUS_PATTERN 과 완전히 동일 — 순서를 그대로 재현해야 레벨별 보너스 값이 실제와 일치한다. */
const BONUS_PATTERN: readonly number[] = (() => {
  const counts: ReadonlyArray<readonly [number, number]> = [[1, 30], [2, 15], [3, 10], [5, 6]];
  const arr: number[] = [];
  for (const [v, c] of counts) for (let i = 0; i < c; i++) arr.push(v);
  const rng = seededRng(424242);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

/**
 * 슬롯별 "노출까지 남은 단계"(구조적 깊이) — 초기 노출 슬롯이 0, 그걸 다 치워야 열리는 슬롯이 1, ...
 * 커버 그래프만으로 계산(카드 랭크·매칭과 무관) — waveWidths 와 동일한 BFS.
 */
function exposureDepth(layout: PeakLayout, exposedNow: ReadonlySet<string>): Map<string, number> {
  const depth = new Map<string, number>();
  const cleared = new Set(exposedNow);
  let frontier = [...exposedNow];
  for (const id of frontier) depth.set(id, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next: string[] = [];
    for (const s of layout.slots) {
      if (cleared.has(s.id)) continue;
      if (s.coveredBy.every((c) => cleared.has(c))) next.push(s.id);
    }
    for (const id of next) { cleared.add(id); depth.set(id, d); }
    frontier = next;
  }
  return depth;
}

/** PlayScene.designateWild() 와 동일한 선택 규칙 — 초기 비노출 슬롯 중 결정적 셔플로 와일드·보너스 위치 결정. */
function assignSpecials(layout: PeakLayout, start: GameState, level: number) {
  const exposedNow = new Set(layout.order.filter((id) => isExposed(start, id)));
  const covered = layout.order.filter((id) => !exposedNow.has(id));
  let pool = covered.length ? covered : layout.order.filter((id) => !exposedNow.has(id));
  if (!pool.length) return { wildSlotId: undefined as string | undefined, bonusSlotId: undefined as string | undefined, bonusCount: 0 };
  // **가장 늦게(=거의 다 클리어된 시점) 노출되는 구간은 후보에서 뺀다**(PO 2026-07-29 "와일드/보너스가
  // 가장 아래쪽에 나와 사실상 쓸 필요가 없다") — 남은 깊이의 마지막 35%는 제외, 걸러지고 남는 게
  // 없으면(아주 얕은 보드) 원래 후보 전체로 되돌린다.
  const depth = exposureDepth(layout, exposedNow);
  const maxDepth = Math.max(0, ...pool.map((id) => depth.get(id) ?? 0));
  const cutoff = Math.floor(maxDepth * 0.65);
  const shallow = pool.filter((id) => (depth.get(id) ?? 0) <= cutoff);
  if (shallow.length) pool = shallow;
  const rng = seededRng(level * 733 + 991);
  const shuffled = pool.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.id);
  const wildSlotId = shuffled[0];
  let bonusSlotId: string | undefined, bonusCount = 0;
  if (shuffled.length >= 2) {
    bonusSlotId = shuffled[1];
    bonusCount = BONUS_PATTERN[(level - 1) % BONUS_PATTERN.length];
  }
  return { wildSlotId, bonusSlotId, bonusCount };
}

const MAX_BUYS = 12;
const ADD5_COUNT = 5;

export interface PlayoutResult { win: boolean; buys: number; leftover: number; }

/**
 * 그리디(최대 오픈 카드수 우선) 플레이아웃 — 와일드·보너스 자동 트리거 포함.
 * `allowBuys=false` 면 막혔을 때 그냥 패배 처리(순수 승률 측정용), true 면 PlayScene 과 같은 ＋5 구매 루프.
 */
export function playout(layout: PeakLayout, start: GameState, level: number, rng: Rng, allowBuys: boolean): PlayoutResult {
  let s = start;
  const { wildSlotId, bonusSlotId, bonusCount } = assignSpecials(layout, start, level);
  let wildBanked = false, bonusTriggered = false, wildActive = false;

  const autoTrigger = () => {
    if (wildSlotId && !wildBanked && isExposed(s, wildSlotId)) { wildBanked = true; s = bankWildToStock(s, wildSlotId, rng); }
    if (bonusSlotId && !bonusTriggered && isExposed(s, bonusSlotId)) { bonusTriggered = true; s = consumeBonusCard(s, bonusSlotId, bonusCount); }
  };
  autoTrigger();

  const bestGainAmong = (ids: readonly string[]): string[] => {
    let bg = -1; let best: string[] = [];
    for (const id of ids) {
      let gain = 0;
      for (const o of s.layout.slots) {
        if (s.cleared.has(o.id) || !o.coveredBy.includes(id)) continue;
        if (o.coveredBy.every((c) => c === id || s.cleared.has(c))) gain++;
      }
      if (gain > bg) { bg = gain; best = [id]; } else if (gain === bg) best.push(id);
    }
    return best;
  };

  let buys = 0;
  const cap = (s.layout.slots.length + s.stock.length) * 8 + 300;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return { win: true, buys, leftover: s.stock.length };
    if (wildActive) {
      // 뽑힌 와일드의 1회 자유 수 — 노출 카드 아무거나(매칭 무시), 가장 많이 여는 카드를 고른다(그리디 일관).
      const exposedIds = s.layout.slots.filter((o) => !s.cleared.has(o.id) && o.coveredBy.every((c) => s.cleared.has(c))).map((o) => o.id);
      wildActive = false;
      if (exposedIds.length > 0) {
        s = playWild(s, bestGainAmong(exposedIds)[0]);
        autoTrigger();
        continue;
      }
    }
    const moves = availableMoves(s);
    if (moves.length > 0) {
      s = playCard(s, bestGainAmong(moves)[0]);
      autoTrigger();
      continue;
    }
    if (s.stock.length > 0) {
      s = drawStock(s, rng);
      if (s.waste[s.waste.length - 1]?.wild) wildActive = true;
      continue;
    }
    if (!allowBuys) return { win: false, buys, leftover: 0 };
    if (buys >= MAX_BUYS || s.waste.length <= 1) return { win: false, buys, leftover: 0 };
    const next = refillStock(s, ADD5_COUNT, rng);
    if (next === s) return { win: false, buys, leftover: 0 };
    s = next;
    buys++;
  }
  return { win: isWin(s), buys, leftover: s.stock.length };
}
