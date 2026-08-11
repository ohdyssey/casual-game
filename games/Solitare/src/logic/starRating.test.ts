import { describe, it, expect } from 'vitest';
import {
  STAR_CUTS,
  STAR_RATIO_CUTS,
  STAR_WEIGHTS,
  MAX_STARS,
  COMBO_CAP,
  PLUS5_CARDS,
  matchGain,
  comboTerm,
  leftoverTerm,
  cleanTerm,
  finalQuality,
  playingQuality,
  referenceQuality,
  starsForQuality,
  starsForRatio,
  type PlayOutcome,
} from './starRating.js';

/** 기준 판 — 개별 축을 바꿔 가며 비교하는 베이스라인. */
const BASE: PlayOutcome = { comboScore: 60, boardSize: 30, leftover: 10, stockSize: 40, plus5Uses: 0 };
const withOutcome = (patch: Partial<PlayOutcome>): number => finalQuality({ ...BASE, ...patch });

describe('별 등급 컷', () => {
  it('컷은 오름차순이고 첫 컷은 0(승리하면 최소 1★)', () => {
    for (const cuts of [STAR_CUTS, STAR_RATIO_CUTS]) {
      expect(cuts[0]).toBe(0);
      for (let i = 1; i < cuts.length; i++) expect(cuts[i]).toBeGreaterThan(cuts[i - 1]);
      expect(cuts.length).toBe(MAX_STARS);
    }
    expect(MAX_STARS).toBe(5);
  });

  it('별은 항상 1~5 범위', () => {
    for (const q of [-5, 0, 0.3, 0.5, 1, 100]) {
      const s = starsForQuality(q);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(5);
    }
  });

  it('가중치 합은 1(품질이 0~1 범위를 벗어나지 않는다)', () => {
    const sum = STAR_WEIGHTS.combo + STAR_WEIGHTS.leftover + STAR_WEIGHTS.clean;
    expect(sum).toBeCloseTo(1, 12);
    // 세 축 모두 만점이면 품질 1.0.
    expect(finalQuality({ comboScore: 1e9, boardSize: 30, leftover: 40, stockSize: 40, plus5Uses: 0 })).toBeCloseTo(1, 12);
  });

  /** PO "연속별획득을 높이 점수를 주고" — 콤보가 가장 무거운 축이어야 한다. */
  it('콤보 축이 가장 무겁다', () => {
    expect(STAR_WEIGHTS.combo).toBeGreaterThan(STAR_WEIGHTS.leftover);
    expect(STAR_WEIGHTS.leftover).toBeGreaterThan(STAR_WEIGHTS.clean);
  });
});

describe('축① 연속 콤보 — 이을수록 크게 준다', () => {
  /** 핵심: 같은 매치 수라도 **연속으로 이으면** 합계가 훨씬 크다(런 합이 삼각수). */
  it('5연속 매칭이 흩어진 5매칭보다 3배 높다', () => {
    const streak = [1, 2, 3, 4, 5].reduce((a, r) => a + matchGain(r), 0);
    const scattered = 5 * matchGain(1);
    expect(streak).toBe(15);
    expect(scattered).toBe(5);
    expect(streak).toBeGreaterThan(scattered * 2.9);
  });

  /** 캡까지는 계속 오르고, 그 위로는 평평 — 캡이 낮으면 최상위 연쇄가 잘려 5★ 변별이 사라진다. */
  it('런은 캡까지 오르고 그 이상은 더 오르지 않는다', () => {
    expect(matchGain(COMBO_CAP - 1)).toBe(COMBO_CAP - 1);
    expect(matchGain(COMBO_CAP)).toBe(COMBO_CAP);
    expect(matchGain(COMBO_CAP + 10)).toBe(COMBO_CAP);
  });

  /** 되감김 금지의 근거 — 가산은 항상 0 이상이라 누적 점수가 줄어들 수 없다. */
  it('가산은 절대 음수가 아니다(누적 단조 증가 = 게이지 되감김 없음)', () => {
    for (const run of [-3, 0, 1, 8, 30]) expect(matchGain(run)).toBeGreaterThanOrEqual(0);
  });

  it('보드 크기로 정규화되어 레벨 크기와 무관하게 비교된다', () => {
    expect(comboTerm(60, 20)).toBeCloseTo(comboTerm(120, 40), 12);
  });

  it('콤보 점수가 크면 품질이 오른다', () => {
    expect(withOutcome({ comboScore: 120 })).toBeGreaterThan(withOutcome({ comboScore: 40 }));
  });
});

describe('축② 남은 카드 수 — 많이 남길수록 높다(PO "남은 카드갯수에 점수를 줘야 합니다")', () => {
  it('남은 카드가 많을수록 품질이 오른다', () => {
    expect(withOutcome({ leftover: 25 })).toBeGreaterThan(withOutcome({ leftover: 5 }));
  });

  it('한 장도 안 뽑고 이기면 이 축은 만점', () => {
    expect(leftoverTerm(40, 0, 40)).toBe(1);
    expect(leftoverTerm(0, 0, 40)).toBe(0);
  });

  /**
   * ⚠️ ＋5 는 스톡을 5장 채우므로 **잔여를 인위적으로 부풀린다**. 그 몫을 빼지 않으면
   *    "부스터를 쓸수록 별이 오르는" 역전이 생긴다 — 축③과 정면으로 모순되는 버그.
   */
  it('＋5 로 채운 몫은 잔여에서 빼고 센다', () => {
    expect(leftoverTerm(10, 1, 40)).toBeCloseTo(leftoverTerm(10 - PLUS5_CARDS, 0, 40), 12);
    expect(leftoverTerm(2, 1, 40)).toBe(0); // 음수는 0으로 클램프.
  });

  it('0으로 나누지 않는다(스톡 0)', () => {
    expect(Number.isFinite(leftoverTerm(0, 0, 0))).toBe(true);
  });
});

describe('축③ 추가카드 없이 한 번에 성공', () => {
  it('＋5 를 한 번도 안 썼으면 1, 한 번이라도 썼으면 0', () => {
    expect(cleanTerm(0)).toBe(1);
    expect(cleanTerm(1)).toBe(0);
    expect(cleanTerm(3)).toBe(0);
  });

  /** 같은 콤보·같은 실질 잔여인데 ＋5 를 쓴 판은 반드시 낮아야 한다. */
  it('＋5 를 쓰면 같은 성적이라도 품질이 낮다', () => {
    const clean = withOutcome({ leftover: 10, plus5Uses: 0 });
    const boosted = withOutcome({ leftover: 10 + PLUS5_CARDS, plus5Uses: 1 }); // 실질 잔여 동일.
    expect(boosted).toBeLessThan(clean);
    expect(clean - boosted).toBeCloseTo(STAR_WEIGHTS.clean, 12);
  });
});

describe('되감김 금지 — 플레이 중 품질은 최종 품질을 넘지 않는다', () => {
  it('플레이 중 품질(축①만) ≤ 최종 품질(축①②③)', () => {
    const during = playingQuality(BASE.comboScore, BASE.boardSize);
    expect(during).toBeLessThanOrEqual(finalQuality(BASE));
  });

  /** 최악의 판(잔여 0 + ＋5 사용)에서도 정산이 게이지를 **끌어내리지 않는다**. */
  it('잔여 0 · ＋5 사용 판에서도 최종 품질이 진행 중 품질보다 낮지 않다', () => {
    const worst: PlayOutcome = { comboScore: 60, boardSize: 30, leftover: 0, stockSize: 40, plus5Uses: 2 };
    expect(finalQuality(worst)).toBeGreaterThanOrEqual(playingQuality(worst.comboScore, worst.boardSize));
  });
});

describe('referenceQuality / starsForRatio — 그 판의 정답 수순 대비 상대 평가', () => {
  /** `p`=카드 내기(런 이어짐), `d`=뽑기(런을 끊고 잔여도 줄인다). */
  it('뽑기 없이 길게 이은 수순이 자주 끊긴 수순보다 기준 품질이 높다', () => {
    const smooth = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const choppy = ['p1', 'd', 'p2', 'd', 'p3', 'd', 'p4', 'd', 'p5', 'd', 'p6'];
    expect(referenceQuality(smooth, 6, 20)).toBeGreaterThan(referenceQuality(choppy, 6, 20));
  });

  it('빈 수순은 0(기준 없음)', () => {
    expect(referenceQuality([], 30, 20)).toBe(0);
  });

  /**
   * **＋5 없이 정답 수순만큼 풀면 3★**(PO 2026-07-29) — 기본값이다. 5★ 는 기준을 크게 넘어야 나오고,
   * 1·2★ 는 기준에 한참 못 미치거나 ＋5 를 쓴 판의 자리다.
   */
  it('＋5 없이 기준 수순만큼 풀면 3★(기본값)', () => {
    const ref = referenceQuality(['p1', 'p2', 'd', 'p3', 'p4'], 4, 20);
    expect(starsForRatio(ref, ref)).toBe(3);
  });

  /** 같은 성적이라도 ＋5 를 쓰면 기본값 3★ 아래로 내려갈 수 있어야 한다. */
  it('＋5 를 쓰면 기본값(3★) 아래로 내려간다', () => {
    const base = { comboScore: 60, boardSize: 30, stockSize: 40 };
    const ref = finalQuality({ ...base, leftover: 10, plus5Uses: 0 }); // 이 판의 클린 성적을 기준으로 삼는다.
    const clean = starsForRatio(finalQuality({ ...base, leftover: 10, plus5Uses: 0 }), ref);
    const boosted = starsForRatio(finalQuality({ ...base, leftover: 15, plus5Uses: 1 }), ref); // 실질 잔여 동일.
    expect(clean).toBe(3);
    expect(boosted).toBeLessThan(clean);
  });

  it('기준을 크게 넘어서면 5★', () => {
    const ref = referenceQuality(['p1', 'd', 'p2', 'd', 'p3'], 3, 20);
    expect(starsForRatio(ref * STAR_RATIO_CUTS[4], ref)).toBe(5);
  });

  it('기준에 크게 못 미치면 1★', () => {
    const ref = referenceQuality(['p1', 'p2', 'p3'], 3, 20);
    expect(starsForRatio(ref * 0.3, ref)).toBe(1);
  });

  it('기준이 없으면(0) 절대 컷으로 폴백한다', () => {
    const q = finalQuality(BASE);
    expect(starsForRatio(q, 0)).toBe(starsForQuality(q));
  });
});
