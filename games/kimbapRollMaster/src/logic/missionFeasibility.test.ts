/**
 * missionFeasibility.test.ts — **미션을 정말로 깰 수 있나.**
 *
 * ⚠️⚠️ 미션은 레벨 클리어 조건이므로 **깰 수 없는 목표는 곧 막힌 게임**이다.
 * 특히 「무엇을」 미션(그 김밥 N개)은 **카드가 그 메뉴를 띄워 줘야** 손을 댈 수 있는데,
 * 카드는 그 판의 메뉴 대여섯 종에서 뽑히므로 그냥 두면 한 메뉴가 뜨는 건 다섯 번에 한 번꼴이다.
 * 실제로 등장률 보정을 넣기 전에는 **15건짜리 판에서 「4개」를 시키고 최적 플레이 평균이 2.7개**였다 —
 * 어려운 게 아니라 **불공평한 것**이었다.
 *
 * 그래서 여기서는 카드 뽑기를 그대로 돌려 **최적 플레이(보이면 무조건 고른다)로 목표를 채우는지**를 본다.
 */
import { describe, expect, it } from 'vitest';
import { MENU_LABEL, type MenuId } from './menu.js';
import { MISSION_COUNT, missionsForLevel, mustFavor } from './missions.js';
import { CARD_COUNT, FIRST_CARD_COUNT, nextCards, type Order } from './orders.js';
import { stageOrders } from './stage.js';
import { STAGE_MENU_ROUNDS, stageMenus } from './stageTray.js';

/** 검증용 결정적 난수(mulberry32) — 시드마다 다른 판을 만든다. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 한 판을 끝까지 돌려 **그 메뉴를 몇 개나 낼 수 있는지** 센다.
 * 카드 뽑기·밀어주기·못 박기는 실제(`nextCards` · `mustFavor`)와 같은 길을 쓴다.
 */
function servableCount(level: number, target: MenuId, goal: number, seed: number): number {
  const rand = seeded(seed);
  const orders = stageOrders(level);
  let got = 0;
  let cards: readonly Order[] = nextCards(null, FIRST_CARD_COUNT, rand, 0, 0, level, target, false);
  for (let n = 0; n < orders; n++) {
    // 보이면 무조건 고른다 — 최적 플레이.
    const at = cards.findIndex((c) => c.menu === target);
    const pick = at >= 0 ? at : 0;
    if (cards[pick]?.menu === target) got++;
    const keptAt = cards.length > 1 ? (pick === 0 ? 1 : 0) : 0;
    const kept = cards.length > 1 ? (cards[keptAt] ?? null) : null;
    const left = orders - (n + 1);
    const force = mustFavor(goal - got, left);
    cards = nextCards(kept, CARD_COUNT, rand, n + 1, keptAt, level, target, force);
  }
  return got;
}

/** 그 레벨의 「무엇을」 미션(없으면 null). */
function menuMission(level: number): { menu: MenuId; goal: number } | null {
  const list = missionsForLevel(level, stageMenus(level), stageOrders(level));
  for (let i = 0; i < MISSION_COUNT; i++) {
    const m = list[i];
    if (m?.kind === 'menu' && m.menu) return { menu: m.menu, goal: m.goal };
  }
  return null;
}

const LEVELS = Array.from({ length: STAGE_MENU_ROUNDS }, (_, i) => i);
const TRIALS = 400;

describe('스무 레벨 안에서 미션을 깰 수 있다', () => {
  it('⚠️⚠️ 「무엇을」 미션은 **어떤 판에서도** 최적 플레이로 목표를 채운다', () => {
    for (const level of LEVELS) {
      const mission = menuMission(level);
      if (!mission) continue;
      let worst = Number.POSITIVE_INFINITY;
      for (let t = 0; t < TRIALS; t++) {
        worst = Math.min(worst, servableCount(level, mission.menu, mission.goal, t + level * 7919));
      }
      expect(
        worst,
        `${level + 1}레벨 ${MENU_LABEL[mission.menu]} 목표 ${mission.goal} — 최악 ${worst}`,
      ).toBeGreaterThanOrEqual(mission.goal);
    }
  });

  it('그래도 여유가 있다 — 보이는 족족 고르면 목표보다 많이 낼 수 있다', () => {
    for (const level of LEVELS) {
      const mission = menuMission(level);
      if (!mission) continue;
      let sum = 0;
      for (let t = 0; t < TRIALS; t++) {
        sum += servableCount(level, mission.menu, mission.goal, t + level * 104_729);
      }
      const avg = sum / TRIALS;
      expect(avg, `${level + 1}레벨 평균 ${avg.toFixed(1)} / 목표 ${mission.goal}`).toBeGreaterThan(
        mission.goal,
      );
    }
  });

  it('시킨 김밥은 반드시 그 판에 나오는 것이다 — 없는 메뉴를 시키면 영영 못 깬다', () => {
    for (const level of LEVELS) {
      const mission = menuMission(level);
      if (!mission) continue;
      expect(stageMenus(level), `${level + 1}레벨`).toContain(mission.menu);
    }
  });

  it('못 박기는 **빠듯할 때만** 켜진다 — 늘 켜지면 카드 두 장이 매번 같아진다', () => {
    expect(mustFavor(0, 10)).toBe(false); // 다 깼다
    expect(mustFavor(3, 10)).toBe(false); // 아직 넉넉하다
    expect(mustFavor(3, 4)).toBe(true); // 남은 넷에 셋을 내야 한다
    expect(mustFavor(3, 3)).toBe(true);
    expect(mustFavor(1, 2)).toBe(true);
  });
});

describe('메뉴 편성은 스무 판까지 되풀이되지 않는다', () => {
  it('스무 판의 편성이 모두 다르다', () => {
    const keys = LEVELS.map((i) => [...stageMenus(i)].sort().join(','));
    expect(new Set(keys).size).toBe(STAGE_MENU_ROUNDS);
  });

  it('이웃한 두 판은 주재료가 셋을 넘게 겹치지 않는다 — 넷이 같으면 바뀐 티가 안 난다', () => {
    for (let i = 1; i < STAGE_MENU_ROUNDS; i++) {
      const prev = stageMenus(i - 1).filter((m) => m !== 'veggie');
      const now = stageMenus(i).filter((m) => m !== 'veggie');
      const shared = now.filter((m) => prev.includes(m)).length;
      expect(shared, `${i}판↔${i + 1}판`).toBeLessThanOrEqual(3);
    }
  });
});
