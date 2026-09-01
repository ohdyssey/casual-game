import { describe, expect, it } from 'vitest';
import { solitaireClearReward, solitaireLeagueGrandReward } from './rewards.js';

describe('solitaireLeagueGrandReward — 톱니바퀴 + 계곡(서버 카탈로그 사본)', () => {
  it('기준값은 300 근방을 오간다(1.3/1.0/0.7배)', () => {
    const values = new Set(Array.from({ length: 20 }, (_, d) => solitaireLeagueGrandReward(d).gems));
    expect(values.size).toBeGreaterThan(1);
  });

  it('계곡 날(13, 22, 31, 49…)은 확실히 낮다', () => {
    for (const d of [13, 22, 31, 49]) {
      expect(solitaireLeagueGrandReward(d).gems).toBeLessThan(150);
    }
  });

  it('10의 배수인 계곡 후보(40)는 계곡에서 제외된다', () => {
    expect(solitaireLeagueGrandReward(40).gems).toBeGreaterThanOrEqual(150);
  });

  it('모든 periodId 에서 최소 1은 보장된다', () => {
    for (let d = 0; d < 100; d++) expect(solitaireLeagueGrandReward(d).gems).toBeGreaterThanOrEqual(1);
  });

  it('게임 클라(logic/dailyLeague.ts leagueGrandDiamonds)와 값이 동일해야 한다 — 이 표는 그 알고리즘의 서버 사본', () => {
    // 클라 기준값도 300, 배열도 [1.3,1.0,0.7,1.0,1.3,0.7] — periodId=0 → 1.3배 → 390.
    expect(solitaireLeagueGrandReward(0).gems).toBe(390);
  });
});

describe('solitaireClearReward — 클리어 등급 다이아+코인(서버 카탈로그 사본, 코인은 근사치)', () => {
  it('등급 4 미만은 0다이아', () => {
    for (const g of [1, 2, 3]) expect(solitaireClearReward(g, 1, 1).gems).toBe(0);
  });

  it('등급 4 이상은 1다이아(economyRules.clearRewardsForGrade 와 동일 규칙)', () => {
    for (const g of [4, 5]) expect(solitaireClearReward(g, 1, 1).gems).toBe(1);
  });

  it('범위를 벗어난 등급은 1~5로 접는다(클라 입력을 그대로 신뢰하지 않는다)', () => {
    expect(solitaireClearReward(0, 1, 1).gems).toBe(0); // → 1로 클램프
    expect(solitaireClearReward(-3, 1, 1).gems).toBe(0);
    expect(solitaireClearReward(99, 1, 1).gems).toBe(1); // → 5로 클램프
  });

  it('Lv1 게임비(1,500) × 등급 배수 — 등급이 높을수록 코인도 오른다', () => {
    // feeForLevel(1) = 1500(내림 단위 100 이하라 그대로). starMult = [0.3,0.65,1.0,1.35,1.75].
    expect(solitaireClearReward(1, 1, 1).coins).toBe(450); // 1500*0.3
    expect(solitaireClearReward(3, 1, 1).coins).toBe(1500); // 1500*1.0(손익분기)
    expect(solitaireClearReward(5, 1, 1).coins).toBe(2625); // 1500*1.75
  });

  it('레벨이 오르면 게임비 계단(150레벨마다 ×1.129)만큼 코인도 오른다', () => {
    const lv1 = solitaireClearReward(3, 1, 1).coins ?? 0;
    const lv151 = solitaireClearReward(3, 151, 1).coins ?? 0; // 1계단 지남
    expect(lv151).toBeGreaterThan(lv1);
  });

  it('도전 배수는 화이트리스트([1,2,3,5])만 인정 — 임의 배수는 1로 접힌다', () => {
    const base = solitaireClearReward(3, 1, 1).coins ?? 0;
    expect(solitaireClearReward(3, 1, 2).coins).toBe(base * 2);
    expect(solitaireClearReward(3, 1, 999).coins).toBe(base); // 화이트리스트 밖 → 1배
  });

  it('레벨 캡(3000)을 넘겨도 안전하게 클램프된다', () => {
    expect(() => solitaireClearReward(3, 999999, 1)).not.toThrow();
    expect(solitaireClearReward(3, 999999, 1).coins).toBe(solitaireClearReward(3, 3000, 1).coins);
  });
});
