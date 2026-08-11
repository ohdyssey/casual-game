/**
 * simulate.ts — **봇에게 판을 시켜 보고 숫자를 뽑는다**(순수).
 *
 * ⚠️⚠️ **이 도구가 있어야 난이도 표를 손댈 수 있다.** `stage.STAGE_TUNING` 은 손잡이가 셋인데
 * 메뉴 배율·재료 수·미션·카드 뽑기까지 얽혀 있어서 **하나를 만지면 어디가 어떻게 되는지 감으로는 안 보인다.**
 * 실제로 「15건에 4개」짜리 미션이 최적 플레이로도 평균 2.7개였다는 것은 시뮬레이션으로만 드러났다.
 *
 * ⚠️ **카드 뽑기·미션·진열은 진짜 코드를 쓴다**(`orders` · `missions` · `stageTray`).
 *    조리에 걸리는 시간만 모형이다(`timeline.ts`) — 거기까지 Phaser 로 돌릴 수는 없기 때문이다.
 */
import { PAID_STARS, failPenalty, perfectBonus } from '../economy.js';
import { MENU_PRICE, type MenuId } from '../menu.js';
import { applyServe, missionsForLevel, mustFavor, type MissionState } from '../missions.js';
import {
  CARD_COUNT,
  FIRST_CARD_COUNT,
  nextCards,
  presetIngredients,
  rollPrice,
  rollTimeLimitMs,
  type Order,
  type Rand,
} from '../orders.js';
import { stageOrders, stageTimeMs } from '../stage.js';
import { stageMenus } from '../stageTray.js';
import { cookCost } from './timeline.js';
import type { Skill } from './skill.js';

/** 한 판을 돌린 결과. */
export interface StageOutcome {
  readonly level: number;
  /** 시간 안에 낸 주문 수(실패는 안 센다). */
  readonly served: number;
  /**
   * **미션 셋을 다 채웠는가** — 이게 판을 끝내는 조건이다(`cookingFlow.allMissionsDone`).
   * ⚠️ 처리량이 아니다. 명판에 뜨는 것도 「남은 시간」이지 「몇 건 냈나」가 아니다.
   */
  readonly cleared: boolean;
  /** 망친 주문 수와 그 사유. */
  readonly failed: number;
  readonly timeouts: number;
  /** 이 판에서 번 돈. */
  readonly money: number;
  /** 낸 주문에서 남긴 시간의 평균(초) — 0에 가까우면 아슬아슬하게 해내고 있다는 뜻이다. */
  readonly spareSec: number;
  /** 미션 셋 중 몇 개를 깼나(0~3). */
  readonly missionsDone: number;
  /** **종류별로** 깼는가 — 어느 미션이 헐거운지 보려면 종류로 갈라 봐야 한다. */
  readonly missionByKind: readonly { readonly kind: string; readonly goal: number; readonly done: boolean; readonly got: number }[];
  /** 별 평균(실패는 0으로 센다). */
  readonly stars: number;
  /**
   * **상한 없는 잠재치** — 미션 목표를 정할 때 견주는 자.
   * ⚠️ `MissionState.progress` 는 목표에 닿으면 **거기서 멈춘다**(`applyServe`). 그 값으로는
   *    「얼마나 헐거운가」를 잴 수 없다 — 다 깬 미션은 언제나 목표와 같은 값으로 보이기 때문이다.
   */
  readonly potential: { readonly perfect: number; readonly revenue: number };
  /**
   * **미션 셋을 다 채우는 데 실제로 쓴 시간**(ms). 못 채웠으면 판 시간 전부.
   * ⚠️ 제한시간을 정하는 자다 — 「아슬아슬하게 가능」은 결국 **이 값보다 조금만 더 주는 것**이다.
   */
  readonly usedMs: number;
}

/** 결정적 난수(mulberry32) — 시드가 같으면 같은 판이다. */
export function seeded(seed: number): Rand {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 그 봇이 이 카드를 만드는 데 걸리는 시간. */
function costOf(order: Order, skill: Skill, seasoned: boolean, slipMs: number): ReturnType<typeof cookCost> {
  const preset = presetIngredients(order).length;
  return cookCost({
    picks: Math.max(0, order.need - preset),
    rolls: order.rolls,
    tapMs: skill.tapMs,
    decideMs: skill.decideMs,
    seasoned,
    slipMs,
    preInput: skill.usesPreInput,
  });
}

/**
 * **어느 카드를 고를까.**
 *   ① 미션이 시킨 김밥이 보이면 그것(미션이 곧 클리어 조건이다)
 *   ② 아니면 **제 시간에 낼 수 있는 것** 중에서 성향(`greed`)대로 — 비싼 쪽이냐 안전한 쪽이냐
 * ⚠️ 「감당 못 할 카드는 안 고른다」가 사람의 판단이라, 시간이 모자라는 카드는 거른다.
 *    다 모자라면 그중 제일 나은 것을 골라 실패를 감수한다(카드는 고를 수밖에 없다).
 */
function choose(cards: readonly Order[], skill: Skill, want: MenuId | undefined, seasoned: boolean): number {
  const wantAt = cards.findIndex((c) => c.menu === want);
  if (wantAt >= 0) return wantAt;
  const doable = cards
    .map((c, i) => ({ i, c, fits: costOf(c, skill, seasoned, 0).cardMs <= rollTimeLimitMs(c) }))
    .filter((x) => x.fits);
  const pool = doable.length > 0 ? doable : cards.map((c, i) => ({ i, c, fits: false }));
  const byPrice = [...pool].sort((a, b) => rollPrice(a.c) - rollPrice(b.c));
  const at = Math.min(byPrice.length - 1, Math.floor(skill.greed * byPrice.length));
  return byPrice[at]?.i ?? 0;
}

/**
 * 한 판을 끝까지 돌린다.
 * ⚠️ **판 시계가 다 되면 그 자리에서 끝난다** — 목표를 못 채웠으면 클리어가 아니다.
 */
export function simulateStage(
  level: number,
  skill: Skill,
  seed: number,
  /**
   * 판 시간을 갈아 끼운다 — **제한시간을 역산할 때** 쓴다.
   * ⚠️ 지금 판 시간으로 재면 오래 걸린 판이 **시간에 잘려**(다 못 채우고 끝남) 진짜 소요 시간을 알 수 없다.
   *    넉넉히 준 채로 재야 「미션을 다 채우는 데 실제로 얼마가 드는가」가 나온다.
   */
  budgetOverrideMs?: number,
): StageOutcome {
  const rand = seeded(seed);
  const goal = stageOrders(level);
  const budget = budgetOverrideMs ?? stageTimeMs(level);

  let missions: MissionState = {
    list: missionsForLevel(level, stageMenus(level), goal),
    progress: [0, 0, 0],
    done: [false, false, false],
  };
  const wantOf = (): MenuId | undefined => {
    for (let i = 0; i < missions.list.length; i++) {
      const m = missions.list[i];
      if (m?.kind === 'menu' && m.menu && !missions.done[i]) return m.menu;
    }
    return undefined;
  };
  const needOf = (): number => {
    for (let i = 0; i < missions.list.length; i++) {
      const m = missions.list[i];
      if (m?.kind === 'menu' && m.menu && !missions.done[i]) return m.goal - (missions.progress[i] ?? 0);
    }
    return 0;
  };

  let cards = nextCards(null, FIRST_CARD_COUNT, rand, 0, 0, level, wantOf(), false);
  let elapsed = 0;
  let served = 0;
  let failed = 0;
  let timeouts = 0;
  let money = 0;
  let spareSum = 0;
  let starSum = 0;
  let combo = 0;
  let attempts = 0;
  // ⚠️ 미션 목표를 정하려면 **막지 않고 끝까지 센 값**이 있어야 한다.
  let potPerfect = 0;
  let potRevenue = 0;

  // ⚠️ **판은 미션 셋을 다 채우면 끝난다** — 처리량은 시간 곡선의 눈금일 뿐이다.
  const allDone = (): boolean => missions.done.every(Boolean);
  while (elapsed < budget && !allDone()) {
    const seasoned = rand() < skill.seasonRate;
    const at = choose(cards, skill, wantOf(), seasoned);
    const order = cards[at]!;
    const slipped = rand() < skill.slipRate;
    const cost = costOf(order, skill, seasoned, slipped ? skill.slipMs : 0);
    const limit = rollTimeLimitMs(order);
    attempts++;

    const inTime = cost.cardMs <= limit;
    // ⚠️ 별은 「레시피를 지켰는가」로 정해진다 — 여기서는 손이 꼬였는지·마무리를 챙겼는지로 근사한다.
    const stars = !inTime ? 0 : slipped ? 2 : seasoned ? 3 : 2;
    // ⚠️ 정산 규칙 그대로 — ★★★ 판매가 + 웃돈 · ★★ 판매가 · ★ 0 · 실패 −위약금.
    //    (레시피를 지킨 셈 치므로 넘겨 담은 재료값은 없다 — 시뮬레이터는 시간이 관심사다.)
    const price = rollPrice(order);
    const revenue = !inTime
      ? -failPenalty(price)
      : stars >= 3
        ? price + perfectBonus(price)
        : stars >= PAID_STARS
          ? price
          : 0;

    if (inTime && stars >= 3) potPerfect++;
    if (inTime && revenue > 0) potRevenue += revenue;
    if (inTime) {
      served++;
      spareSum += (limit - cost.cardMs) / 1000;
      starSum += stars;
      combo = stars >= 3 ? combo + 1 : 0;
    } else {
      failed++;
      timeouts++;
      combo = 0;
    }
    money += revenue;
    elapsed += cost.stageMs;

    const update = applyServe(missions, {
      menu: inTime ? order.menu : null,
      stars,
      failed: !inTime,
      revenue,
      perfectCombo: combo,
      rolls: order.rolls,
      rollsDone: inTime ? order.rolls : 0,
      rush: order.rush,
      seasonedBoth: seasoned && inTime,
    });
    missions = update.state;
    money += update.reward;

    // 다음 카드 — 고르지 않은 쪽은 남고 빈 자리만 새로 뽑는다(실제와 같은 길).
    const keptAt = cards.length > 1 ? (at === 0 ? 1 : 0) : 0;
    const kept = cards.length > 1 ? (cards[keptAt] ?? null) : null;
    const left = goal - served;
    cards = nextCards(kept, CARD_COUNT, rand, served, keptAt, level, wantOf(), mustFavor(needOf(), left));
  }

  return {
    level,
    served,
    cleared: missions.done.every(Boolean),
    failed,
    timeouts,
    money,
    spareSec: served > 0 ? spareSum / served : 0,
    missionsDone: missions.done.filter(Boolean).length,
    missionByKind: missions.list.map((m, i) => ({
      kind: m.kind,
      goal: m.goal,
      done: missions.done[i] ?? false,
      got: missions.progress[i] ?? 0,
    })),
    stars: attempts > 0 ? starSum / attempts : 0,
    potential: { perfect: potPerfect, revenue: potRevenue },
    usedMs: Math.min(elapsed, budget),
  };
}

/** 미션 한 종류의 성적. */
export interface KindReport {
  readonly kind: string;
  readonly goal: number;
  readonly doneRate: number;
  /** 실제로 채운 값의 평균(목표에서 멈춘 값). */
  readonly gotAvg: number;
  /** **상한 없이** 낼 수 있었던 값 — 목표 대비 이게 얼마나 크냐가 곧 헐거움이다. */
  readonly potentialAvg: number;
}

export interface LevelReport {
  readonly level: number;
  readonly clearRate: number;
  readonly servedAvg: number;
  readonly failAvg: number;
  readonly spareSec: number;
  readonly missionsAvg: number;
  readonly moneyAvg: number;
  readonly starsAvg: number;
  readonly kinds: readonly KindReport[];
  /**
   * 미션을 다 채운 판에서 **걸린 시간의 중앙값**(초). 못 채운 판은 안 센다.
   * ⚠️ 제한시간을 여기에 얼마쯤 얹느냐가 곧 「아슬아슬함」이다.
   */
  readonly usedSecMedian: number;
  /** 그중 위쪽 80% 지점(초) — 이만큼 주면 열에 여덟은 해낸다. */
  readonly usedSecP80: number;
}

/** 한 실력으로 여러 판을 여러 번 돌린 요약. */
export function report(
  levels: readonly number[],
  skill: Skill,
  trials: number,
  budgetOverrideMs?: number,
): LevelReport[] {
  return levels.map((level) => {
    let clears = 0;
    let served = 0;
    let failed = 0;
    let spare = 0;
    let missions = 0;
    let money = 0;
    let stars = 0;
    const kindDone = new Map<string, { goal: number; done: number; got: number; pot: number }>();
    const usedWhenCleared: number[] = [];
    for (let t = 0; t < trials; t++) {
      const r = simulateStage(level, skill, t + level * 7919 + skill.tapMs, budgetOverrideMs);
      if (r.cleared) {
        clears++;
        usedWhenCleared.push(r.usedMs / 1000);
      }
      served += r.served;
      failed += r.failed;
      spare += r.spareSec;
      missions += r.missionsDone;
      money += r.money;
      stars += r.stars;
      for (const k of r.missionByKind) {
        const at = kindDone.get(k.kind) ?? { goal: k.goal, done: 0, got: 0, pot: 0 };
        const pot = k.kind === 'perfect' ? r.potential.perfect : k.kind === 'revenue' ? r.potential.revenue : k.got;
        kindDone.set(k.kind, {
          goal: k.goal,
          done: at.done + (k.done ? 1 : 0),
          got: at.got + k.got,
          pot: at.pot + pot,
        });
      }
    }
    return {
      level,
      clearRate: clears / trials,
      servedAvg: served / trials,
      failAvg: failed / trials,
      spareSec: spare / trials,
      missionsAvg: missions / trials,
      moneyAvg: money / trials,
      starsAvg: stars / trials,
      usedSecMedian: quantile(usedWhenCleared, 0.5),
      usedSecP80: quantile(usedWhenCleared, 0.8),
      kinds: [...kindDone.entries()].map(([kind, v]) => ({
        kind,
        goal: v.goal,
        doneRate: v.done / trials,
        gotAvg: v.got / trials,
        potentialAvg: v.pot / trials,
      })),
    };
  });
}

/** 정렬해 분위수를 뽑는다(빈 배열이면 0). */
function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[at] ?? 0;
}

/** 그 판의 재료 값을 뺀 순수 판매 기준 최대치 — 표를 읽을 때 견주는 자. */
export const stageMaxRevenue = (level: number): number =>
  stageMenus(level).reduce((best, m) => Math.max(best, MENU_PRICE[m]), 0) * stageOrders(level);
