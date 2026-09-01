/**
 * economyRules.mission.test.ts — **미션 보상 출현 비율 = 보상표** 불변식(2026-08-24 회귀).
 *
 * 예전에는 뽑기가 넉넉하면 cards/plus5/wild 를 통째로 stars 로 치환했고, 그 조건이 거의 항상 참이라
 * 보상표의 절반이 화면에 안 나왔다(실측 44.5% 설계 → 2.9% 출현). 이제 공급 억제는 **장수**로만 한다.
 */
import { describe, it, expect } from 'vitest';
import {
  MISSION_REWARD_TABLE, COLLECTION_WEIGHT_BASE, COLLECTION_WEIGHT_EARLY, COLLECTION_BOOST_UNTIL_LEVEL,
  collectionWeightForLevel, missionStockAmount, stockIsAmple, STOCK_AMPLE_AMOUNT,
  bonusMissionTable, rollBonusMissionReward,
} from './economyRules.js';

describe('미션 보상표', () => {
  it('보상표의 collection 가중치는 레벨 하한(COLLECTION_WEIGHT_BASE)과 일치한다 — 죽은 값 금지', () => {
    const row = MISSION_REWARD_TABLE.find((r) => r.kind === 'collection');
    expect(row?.weight).toBe(COLLECTION_WEIGHT_BASE);
    expect(collectionWeightForLevel(COLLECTION_BOOST_UNTIL_LEVEL)).toBe(COLLECTION_WEIGHT_BASE);
    expect(collectionWeightForLevel(1)).toBe(COLLECTION_WEIGHT_EARLY);
  });

  it('모든 종류의 가중치가 0보다 크다 — 표에 있으면 반드시 나올 수 있어야 한다', () => {
    for (const row of MISSION_REWARD_TABLE) expect(row.weight).toBeGreaterThan(0);
  });

  /**
   * ⚠️ 옛 계약은 "부스터 3종(＋5·와일드·되돌리기)이 모두 표에 있다"였다.
   * PO 2026-08-24 가 **＋5카드를 미션 보상에서 제외**했다 — 남은 두 종만 확인한다.
   */
  it('부스터 2종(와일드·되돌리기)이 표에 있고, ＋5카드는 **없다**', () => {
    const kinds = MISSION_REWARD_TABLE.map((r) => r.kind);
    expect(kinds).toContain('wild');
    expect(kinds).toContain('undo');
    expect(kinds).not.toContain('plus5');
  });

  it('종류가 중복되지 않는다 — 같은 종류가 두 줄이면 실제 확률이 표와 달라진다', () => {
    const kinds = MISSION_REWARD_TABLE.map((r) => r.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('missionStockAmount — 공급 억제는 장수로만', () => {
  it('뽑기가 넉넉하면 최소 장수로 깎지만 **0이 되지는 않는다**(종류가 사라지면 안 된다)', () => {
    for (const row of MISSION_REWARD_TABLE.filter((r) => r.kind === 'cards' || r.kind === 'plus5' || r.kind === 'wild')) {
      const cut = missionStockAmount(row.amount, true);
      expect(cut).toBe(STOCK_AMPLE_AMOUNT);
      expect(cut).toBeGreaterThan(0);
      expect(cut).toBeLessThanOrEqual(row.amount);
    }
  });

  it('넉넉하지 않으면 표의 장수를 그대로 준다', () => {
    for (const row of MISSION_REWARD_TABLE) expect(missionStockAmount(row.amount, false)).toBe(row.amount);
  });

  it('stockIsAmple 은 후반(남은 보드가 작을 때)에도 하한 3장 기준으로 거의 항상 참이다 — 그래서 종류를 바꾸면 안 된다', () => {
    expect(stockIsAmple(40, 12)).toBe(true); // 초반: 스톡이 많다.
    expect(stockIsAmple(4, 3)).toBe(true); // 후반: 기준선이 하한 3으로 내려간다.
    expect(stockIsAmple(4, 2)).toBe(false); // 정말 마를 때만 거짓.
  });
});

describe('보너스 라운드 미션 풀 — 순수 수집 아이템만', () => {
  it('진행 아이템(＋카드·와일드·되돌리기)은 **절대** 나오지 않는다', () => {
    const banned = new Set(['cards', 'plus5', 'wild', 'undo']);
    let seed = 987;
    const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 5000; i++) {
      const kind = rollBonusMissionReward(10, rng);
      expect(banned.has(kind)).toBe(false);
    }
  });

  it('풀은 별·다이아·컬렉션 3종이다', () => {
    expect(bonusMissionTable(20).map((r) => r.kind).sort()).toEqual(['collection', 'diamond', 'stars']);
  });

  it('가중치는 메인 표를 그대로 물려받는다 — 두 게임의 체감이 어긋나지 않게', () => {
    const main = new Map(MISSION_REWARD_TABLE.map((r) => [r.kind, r.weight]));
    for (const row of bonusMissionTable(20)) expect(row.weight).toBe(main.get(row.kind));
  });

  it('컬렉션 가중치는 레벨을 따른다(저레벨 부스트)', () => {
    const at1 = bonusMissionTable(1).find((r) => r.kind === 'collection')!.weight;
    const at20 = bonusMissionTable(20).find((r) => r.kind === 'collection')!.weight;
    expect(at1).toBeGreaterThan(at20);
  });
});
