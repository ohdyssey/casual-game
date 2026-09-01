import { describe, it, expect } from 'vitest';
import { storeAcquireCostFor, STORE_COST_BASE_COINS, STORE_COST_STEP_COINS, STORE_COST_STEP_DIAMONDS } from '../save.js';
import {
  DEFAULT_ECON,
  feeForLevel,
  maxChallengeMult,
  starCoinsFor,
  starProfitFor,
  BREAKEVEN_STARS,
  stockBonusFor,
  starsForSets,
  plus5CostFor,
  wildCostFor,
  undoCostFor,
  floorReqFor,
  diamondCostForFloor,
  totalDiamondsPerLevelExpected,
  floorCoinCost,
  compDiamondCost,
  claimGoalFor,
  compAuctionCost,
  compFloorCost,
  compTotalInvested,
  compDailyYield,
  coerceEcon,
} from './economy.js';
import { GAME_FEE, plus5Cost, wildCost, stockBonusPerCard, starCoins } from '../save.js';

describe('economy — 게임비 곡선(레벨 단위 계단, PO 2026-07-16, 2026-07-18 레벨캡 3배 확장)', () => {
  it('기저 1,500 · 150레벨마다 ×1.129(19단계 유지) · 100 단위 내림 — Lv3000 = 1만5천(시작값 비례)', () => {
    expect(feeForLevel(DEFAULT_ECON, 1)).toBe(1500); // PO 2026-08-23: 2,000 → 1,500 하향.
    expect(feeForLevel(DEFAULT_ECON, 150)).toBe(1500); // 같은 단계 내 고정.
    expect(feeForLevel(DEFAULT_ECON, 151)).toBe(1600); // 원값 1,693 → 100 단위 내림.
    expect(feeForLevel(DEFAULT_ECON, 301)).toBe(1900); // 원값 1,912 → 1,900.
    expect(feeForLevel(DEFAULT_ECON, 451)).toBe(2100); // 원값 2,159 → 2,100.
    expect(feeForLevel(DEFAULT_ECON, 3000)).toBe(15000); // 원값 15,041 → 1만5천(19단계 총 ×10.03 은 그대로).
    let prev = 0;
    for (let lv = 1; lv <= 3000; lv += 7) {
      const fee = feeForLevel(DEFAULT_ECON, lv);
      expect(fee).toBeGreaterThanOrEqual(prev);
      expect(fee % 100).toBe(0); // 모든 게임비는 100의 배수.
      prev = fee;
    }
  });
  it('도전 배수(비도박 프레임, 2026-07-18 레벨캡 3배 확장): x2=Lv300·x3=Lv900·x5=Lv1800 해금', () => {
    expect(maxChallengeMult(DEFAULT_ECON, 1)).toBe(1);
    expect(maxChallengeMult(DEFAULT_ECON, 299)).toBe(1);
    expect(maxChallengeMult(DEFAULT_ECON, 300)).toBe(2);
    expect(maxChallengeMult(DEFAULT_ECON, 900)).toBe(3);
    expect(maxChallengeMult(DEFAULT_ECON, 1800)).toBe(5);
    expect(maxChallengeMult(DEFAULT_ECON, DEFAULT_ECON.levelCap)).toBe(5);
  });
  it('범위 클램프 — 0 이하=Lv1, 레벨캡 초과=캡 값 고정', () => {
    expect(feeForLevel(DEFAULT_ECON, 0)).toBe(feeForLevel(DEFAULT_ECON, 1));
    expect(feeForLevel(DEFAULT_ECON, 99999)).toBe(feeForLevel(DEFAULT_ECON, DEFAULT_ECON.levelCap));
  });
});

describe('economy — 현행 게임(save.ts, 게임비 1500)과 정합', () => {
  // P3(게임이 economy.json 소비) 전까지 두 소스가 어긋나지 않는지 감시하는 계약 테스트.
  const fee = GAME_FEE; // 1500 — save.ts 사본. 실가동은 econRuntime(=public/econ/economy.json).
  it('별 보상 곡선(1~5★) — 모델·save.ts 정합', () => {
    for (let stars = 1; stars <= 5; stars++) {
      expect(starCoinsFor(DEFAULT_ECON, fee, stars)).toBe(starCoins(stars));
    }
    // PO 2026-08-23: 3★ = **손익분기**(게임비와 같다). 예전엔 ×1.3(2,600)이라 이기면 무조건 남았고,
    //   그러면 코인을 사서 판을 더 해도 그 판이 또 벌어들여 **인앱결제가 필요 없어진다**.
    expect(starCoins(3)).toBe(1500);
    expect(starCoins(3)).toBe(fee);
  });
  it('남은카드 공식 동일 (부스터는 의도적 분기 — 모델 선행, 게임 미적용)', () => {
    expect(stockBonusFor(DEFAULT_ECON, fee, 1)).toBe(stockBonusPerCard());
    // 부스터는 PO 지시로 모델(economy.ts)만 신규 곡선 — 라이브(save.ts)는 현행 유지(P3 때 일괄 반영).
    expect(plus5Cost(0)).toBe(4500); // 라이브: 게임비 1500×3.0.
    expect(wildCost(0)).toBe(5400); // 1500×3.6.
  });
  it('부스터 모델 곡선(시작값 연동): Lv1 +5=3,000·와일드=4,500(게임비 1,500×2/×3), 캡 ×1.5 램프', () => {
    expect(plus5CostFor(DEFAULT_ECON, feeForLevel(DEFAULT_ECON, 1), 0, 1)).toBe(3000);
    expect(wildCostFor(DEFAULT_ECON, feeForLevel(DEFAULT_ECON, 1), 0, 1)).toBe(4500);
    const feeCap = feeForLevel(DEFAULT_ECON, DEFAULT_ECON.levelCap); // 15,000.
    expect(plus5CostFor(DEFAULT_ECON, feeCap, 0, DEFAULT_ECON.levelCap)).toBe(45_000); // 15,000×2×1.5.
    expect(wildCostFor(DEFAULT_ECON, feeCap, 0, DEFAULT_ECON.levelCap)).toBe(67_500);
    // 과도 방지 가드: 캡에서 와일드가 게임비의 5배를 넘지 않는다.
    expect(wildCostFor(DEFAULT_ECON, feeCap, 0, DEFAULT_ECON.levelCap)).toBeLessThanOrEqual(feeCap * 5);
    // 100 단위 검증(중간 레벨·재사용 포함): 원값이 단위 미달이면 내림.
    for (const lv of [1, 137, 500, 777, 1000]) {
      const f = feeForLevel(DEFAULT_ECON, lv);
      for (const uses of [0, 1, 2]) {
        expect(plus5CostFor(DEFAULT_ECON, f, uses, lv) % 100).toBe(0);
        expect(wildCostFor(DEFAULT_ECON, f, uses, lv) % 100).toBe(0);
      }
    }
  });
  /**
   * ⚠️ 게임비 하향(2,000→1,500)의 **부수 효과** — 시작 코인은 그대로인데 판수 환산이 20 → 26.7 판으로
   *   늘었다. startCoins 를 줄여 20판으로 되돌릴지는 별도 PO 결정 사항이라 여기서는 사실만 고정한다.
   *   PO 2026-08-23: 라이브 save.ts START_COINS 도 40,000 으로 맞춰 모델과 일치시켰다.
   */
  it('초기값(시작 게임비 연동): 코인 40,000 = 26.7판 분량 · 다이아 30', () => {
    expect(DEFAULT_ECON.startCoins).toBe(20_000);
    expect(DEFAULT_ECON.startCoins / feeForLevel(DEFAULT_ECON, 1)).toBeCloseTo(13.33, 1);
    expect(DEFAULT_ECON.startDiamonds).toBe(30);
  });
});

describe('economy — 별/보상/비용 공식', () => {
  it('별 판정 컷: 1세트=2★·3세트=3★', () => {
    expect(starsForSets(DEFAULT_ECON, 0)).toBe(1);
    expect(starsForSets(DEFAULT_ECON, 1)).toBe(2);
    expect(starsForSets(DEFAULT_ECON, 2)).toBe(2);
    expect(starsForSets(DEFAULT_ECON, 3)).toBe(3);
    expect(starsForSets(DEFAULT_ECON, 7)).toBe(3);
  });
  it('undo = 게임비×0.1', () => {
    expect(undoCostFor(DEFAULT_ECON, 2000)).toBe(200);
  });
  it('층 해금(100층·레벨캡 3000, 2026-07-18 3배 확장): 온보딩 3·9·18·30, 6층부터 +30 → 100층=Lv2880(캡 이내)', () => {
    expect(floorReqFor(DEFAULT_ECON, 2)).toBe(3);
    expect(floorReqFor(DEFAULT_ECON, 3)).toBe(9);
    expect(floorReqFor(DEFAULT_ECON, 4)).toBe(18);
    expect(floorReqFor(DEFAULT_ECON, 5)).toBe(30);
    expect(floorReqFor(DEFAULT_ECON, 6)).toBe(60);
    expect(floorReqFor(DEFAULT_ECON, 100)).toBe(2880);
    expect(floorReqFor(DEFAULT_ECON, DEFAULT_ECON.maxFloors)).toBeLessThanOrEqual(DEFAULT_ECON.levelCap);
  });
  it('다이아 소스 3원 합산(보드+미션리워드+데일리챌린지) = 판당 약 7.04개(2026-07-19 실제 티어 테이블 반영)', () => {
    // 1.2(보드: 기본1+가끔0.2) + 1.5556(미션리워드: 평균티어23.33개÷15레벨) + 30/7(데일리챌린지→판환산) ≈ 7.0413.
    expect(totalDiamondsPerLevelExpected(DEFAULT_ECON)).toBeCloseTo(7.0413, 3);
  });
  it('다이아 비용 = 구간 수입 연동(비율 1.0) — 누적이 누진되지 않는다(PO)', () => {
    // 온보딩 구간(판수 3·6·12) → 비용 21·42·84, 6층+(판수 30) → 211 ≈ 수입과 동일.
    expect(diamondCostForFloor(DEFAULT_ECON, 2)).toBe(21);
    expect(diamondCostForFloor(DEFAULT_ECON, 3)).toBe(42);
    expect(diamondCostForFloor(DEFAULT_ECON, 5)).toBe(84);
    expect(diamondCostForFloor(DEFAULT_ECON, 6)).toBe(211);
    expect(diamondCostForFloor(DEFAULT_ECON, 100)).toBe(211);
    // 구조 보장: 캡 여정 총 건설비 = 총 수입 × 비율 (레벨 곡선 무관 — 누진 원천 차단).
    let build = 0;
    for (let f = 2; f <= DEFAULT_ECON.maxFloors; f++) build += diamondCostForFloor(DEFAULT_ECON, f);
    const income = floorReqFor(DEFAULT_ECON, DEFAULT_ECON.maxFloors) * totalDiamondsPerLevelExpected(DEFAULT_ECON);
    expect(Math.abs(build - income * DEFAULT_ECON.diamondCostIncomeRatio)).toBeLessThanOrEqual(DEFAULT_ECON.maxFloors); // 라운딩 오차 이내.
  });
  it('점포 수령 단위: 게임비 2000×0.05=100(1층), 층가중 +15%/층', () => {
    expect(claimGoalFor(DEFAULT_ECON, 2000, 1)).toBe(100);
    expect(claimGoalFor(DEFAULT_ECON, 2000, 5)).toBe(160);
  });
});

describe('economy — 복합 건설비(다이아+코인, 2026-07-19: 2층부터 처음부터 복합)', () => {
  it('1층(무료 시작층) = 코인 0, 2층부터 = 그 시점 게임비×5', () => {
    expect(floorCoinCost(DEFAULT_ECON, 1000, 1)).toBe(0);
    expect(floorCoinCost(DEFAULT_ECON, 1000, 2)).toBe(5000);
    expect(floorCoinCost(DEFAULT_ECON, 1000, 4)).toBe(5000);
    expect(floorCoinCost(DEFAULT_ECON, 1000, 5)).toBe(5000);
    expect(floorCoinCost(DEFAULT_ECON, 3050, 100)).toBe(15_250);
  });
});

describe('economy — 경쟁부지(시뮬 전용)', () => {
  it('낙찰가 = 게임비×15, 총투자 = 낙찰가×1.8^(층-1), 일수익 = 총투자/ROI일수', () => {
    const fee = 2000;
    expect(compAuctionCost(DEFAULT_ECON, fee)).toBe(30_000);
    expect(compFloorCost(DEFAULT_ECON, fee, 1)).toBe(0); // 1층은 낙찰 포함.
    expect(compTotalInvested(DEFAULT_ECON, fee, 1)).toBe(30_000);
    // 2층 증축 = 직전 총투자 × 0.8 → 총투자 = ×1.8.
    expect(compFloorCost(DEFAULT_ECON, fee, 2)).toBe(24_000);
    expect(compTotalInvested(DEFAULT_ECON, fee, 2)).toBe(54_000);
    expect(compDailyYield(DEFAULT_ECON, fee, 2)).toBe(13_500); // 54,000 / 4일.
  });
  it('다이아 대량 소모(PO): 낙찰 60·증축당 40 → 완공 총 180', () => {
    expect(compDiamondCost(DEFAULT_ECON, 0)).toBe(60);
    expect(compDiamondCost(DEFAULT_ECON, 1)).toBe(40);
    const total = compDiamondCost(DEFAULT_ECON, 0) + compDiamondCost(DEFAULT_ECON, 1) * (DEFAULT_ECON.compFloors - 1);
    expect(total).toBe(180);
  });
});

describe('economy — coerceEcon(JSON 병합)', () => {
  it('부분 JSON 은 기본값과 병합, 잘못된 타입은 무시', () => {
    const merged = coerceEcon({ feeBase: 800, starMult: [1, 2, 4, 6, 8], junk: 'x', feeStepMult: 'bad' });
    expect(merged.feeBase).toBe(800);
    expect(merged.starMult).toEqual([1, 2, 4, 6, 8]);
    expect(merged.feeStepMult).toBe(DEFAULT_ECON.feeStepMult);
    expect(coerceEcon(null)).toEqual(DEFAULT_ECON);
  });
});

describe('별 보상 곡선(1~5★) — 3★ 부터 게임비 이상 수익(PO 2026-07-29)', () => {
  const fee = feeForLevel(DEFAULT_ECON, 1);

  /**
   * 핵심 계약 — 3★ 이 **손익분기**(PO 2026-08-23 재조정).
   * 여기가 흑자로 돌아가면 플레이가 코인을 버는 곳이 되어 결제 모델이 무너진다.
   * 4★ 부터 남는다 — 잘한 만큼만 남는 구조.
   */
  it('3★ 은 본전, 4★ 부터 흑자', () => {
    expect(starProfitFor(DEFAULT_ECON, fee, BREAKEVEN_STARS)).toBe(0);
    expect(starProfitFor(DEFAULT_ECON, fee, BREAKEVEN_STARS + 1)).toBeGreaterThan(0);
  });

  it('1·2★ 는 게임비에 못 미친다(부스터를 쓴 판의 자리)', () => {
    expect(starProfitFor(DEFAULT_ECON, fee, 1)).toBeLessThan(0);
    expect(starProfitFor(DEFAULT_ECON, fee, 2)).toBeLessThan(0);
  });

  /** 4·5★ 가 3★ 와 같은 보상이던 구멍(3칸 표 인덱스 클램프)의 회귀 방지. */
  it('4★·5★ 는 3★ 보다 더 준다', () => {
    const s3 = starCoinsFor(DEFAULT_ECON, fee, 3);
    const s4 = starCoinsFor(DEFAULT_ECON, fee, 4);
    const s5 = starCoinsFor(DEFAULT_ECON, fee, 5);
    expect(s4).toBeGreaterThan(s3);
    expect(s5).toBeGreaterThan(s4);
  });

  it('보상 곡선은 단조 증가하고 5칸이다', () => {
    expect(DEFAULT_ECON.starMult).toHaveLength(5);
    for (let i = 1; i < DEFAULT_ECON.starMult.length; i++) {
      expect(DEFAULT_ECON.starMult[i]).toBeGreaterThan(DEFAULT_ECON.starMult[i - 1]);
    }
  });

  it('별 범위를 벗어나도 안전하다(0 이하=0, 표 초과=마지막 칸)', () => {
    expect(starCoinsFor(DEFAULT_ECON, fee, 0)).toBe(0);
    expect(starCoinsFor(DEFAULT_ECON, fee, -3)).toBe(0);
    expect(starCoinsFor(DEFAULT_ECON, fee, 99)).toBe(starCoinsFor(DEFAULT_ECON, fee, 5));
  });

  /** 구 3칸 저장본(economy.json) 이 들어와도 4·5★ 가 NaN 이 되지 않아야 한다. */
  it('구 3칸 starMult 저장본은 기본 곡선으로 보정된다', () => {
    const merged = coerceEcon({ starMult: [0.55, 1.0, 2.2] });
    expect(merged.starMult).toHaveLength(5);
    expect(Number.isFinite(starCoinsFor(merged, fee, 5))).toBe(true);
    expect(merged.starMult[3]).toBe(DEFAULT_ECON.starMult[3]);
  });
});

describe('층별 건설/매입 비용 — 코인 배수 2층 ×20 → 30층 ×10(PO 2026-08-23) · 다이아 20+5/층', () => {
  it('2층 ×20(40,000) — 지시된 초기 배수 그대로', () => {
    expect(storeAcquireCostFor(2).coins).toBe(40000); // 2,000 × 20
  });

  /**
   * ⚠️ **가장 중요한 계약** — 배수는 내려가지만 비용은 반드시 계속 올라야 한다.
   *   배수 하한 도달 층을 30 으로 두면 28층이 정점이 되어 30층이 더 싸진다(실측). 도달 층을 40 으로
   *   밀고 정점 직전에서 배수를 고정해 이 역전을 막는다 — 이 테스트가 그 방어선이다.
   */
  it('비용은 어떤 층에서도 이전 층보다 비싸다(역전 금지)', () => {
    for (let f = 3; f <= 60; f++) {
      expect(storeAcquireCostFor(f).coins).toBeGreaterThan(storeAcquireCostFor(f - 1).coins);
    }
  });

  it('30층 ×12.6 수준(202,000) — 배수는 이후 ×10 근처로 수렴', () => {
    expect(storeAcquireCostFor(30).coins).toBe(202000);
    const mult = storeAcquireCostFor(30).coins / (STORE_COST_BASE_COINS + STORE_COST_STEP_COINS * 29);
    expect(mult).toBeGreaterThan(12);
    expect(mult).toBeLessThan(13);
  });

  it('0·음수 층은 1층 비용으로 클램프', () => {
    expect(storeAcquireCostFor(0).coins).toBe(storeAcquireCostFor(1).coins);
    expect(storeAcquireCostFor(-5).coins).toBe(storeAcquireCostFor(1).coins);
  });

  /** 이벤트 설계의 목표치 — 30층까지 건설비 합계(플레이 수입 ≈119만의 약 3배). */
  it('2~30층 코인 누적이 설계 규모(≈399만) 범위 안이다', () => {
    let sum = 0;
    for (let f = 2; f <= 30; f++) sum += storeAcquireCostFor(f).coins;
    expect(sum).toBeGreaterThan(3_800_000);
    expect(sum).toBeLessThan(4_200_000);
  });

  /**
   * **A안**(PO 2026-07-30 승인) — 3000레벨 다이아 공급(실측 ≈3,300, 티어 완료율 50% 가정)의 80% 를
   * 30층 건설에 배분한 값이다. 30층 누적이 그 예산(≈2,640)을 크게 벗어나면 설계가 깨진 것이다.
   */
  it('다이아는 1층 20 에서 시작해 층마다 5씩 오른다', () => {
    expect(storeAcquireCostFor(1).diamonds).toBe(20);
    expect(storeAcquireCostFor(2).diamonds).toBe(25);
    expect(storeAcquireCostFor(10).diamonds).toBe(65);
    expect(storeAcquireCostFor(30).diamonds).toBe(165);
  });

  it('2~30층 다이아 누적이 배분 예산(≈2,640) 범위 안이다', () => {
    let sum = 0;
    for (let f = 2; f <= 30; f++) sum += storeAcquireCostFor(f).diamonds;
    expect(sum).toBeGreaterThan(2400);
    expect(sum).toBeLessThan(2900);
  });

  it('다이아 증분도 선형(층당 정확히 STORE_COST_STEP_DIAMONDS)', () => {
    for (let f = 2; f <= 50; f++) {
      expect(storeAcquireCostFor(f).diamonds - storeAcquireCostFor(f - 1).diamonds).toBe(STORE_COST_STEP_DIAMONDS);
    }
  });
});
