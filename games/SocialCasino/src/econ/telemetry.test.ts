/** telemetry.test.ts — 실측 스냅샷 집계(차분) + ⭐v2 이벤트 원장/누적 집계 검증. */
import { describe, it, expect } from 'vitest';
import {
  observedSummary,
  applyEventToTotals,
  ledgerSummary,
  type PlaySnapshot,
  type EconEvent,
  type EconTotals,
} from './telemetry.js';

const DAY = 86_400_000;

describe('telemetry — observedSummary', () => {
  it('데이터 부족(<2)이면 null', () => {
    expect(observedSummary([])).toBeNull();
    expect(observedSummary([{ t: 0, spins: 300, coins: 0, cityLevel: 0, bet: 10000, winCoins: 0 }])).toBeNull();
  });

  it('차분으로 순증감·코인RTP·업틱 집계', () => {
    const snaps: PlaySnapshot[] = [
      { t: 0, spins: 300, coins: 1_000_000, cityLevel: 0, bet: 10_000, winCoins: 12_000 },
      { t: DAY, spins: 320, coins: 1_030_000, cityLevel: 1, bet: 10_000, winCoins: 8_000 }, // 스핀↑
      { t: 2 * DAY, spins: 280, coins: 1_050_000, cityLevel: 1, bet: 10_000, winCoins: 10_000 }, // 스핀↓
    ];
    const r = observedSummary(snaps)!;
    expect(r.rounds).toBe(3);
    expect(r.days).toBeCloseTo(2, 5);
    expect(r.netSpinPerDay).toBeCloseTo((280 - 300) / 2, 5); // -10/일
    expect(r.coinRtp).toBeCloseTo((12000 + 8000 + 10000) / 30000, 5); // 1.0
    expect(r.uptickRatio).toBeCloseTo(1 / 2, 5); // 3스냅 중 1회 증가
    expect(r.cityLevel).toBe(1);
    expect(r.spins).toBe(280);
  });
});

// ── ⭐v2 — 이벤트 원장 → 누적 집계(순수 함수 applyEventToTotals) ──
const RESET: EconEvent = { t: 0, e: 'reset', n: 300 };

describe('telemetry v2 — applyEventToTotals(소스별 누적)', () => {
  const base = (): EconTotals => applyEventToTotals({} as EconTotals, RESET); // reset = 빈 집계

  it('round 이벤트 — 라운드 수·베팅합·당첨합·슬롯결과/심볼 빈도·퍼즐멀티 누적', () => {
    let t = base();
    t = applyEventToTotals(t, { t: 1, e: 'round', bet: 10, k: 'coin', sym: 4, m: 1.5, win: 4000, sp: 290 });
    t = applyEventToTotals(t, { t: 2, e: 'round', bet: 10, k: 'none', sym: -1, m: 1, win: 0, sp: 280 });
    t = applyEventToTotals(t, { t: 3, e: 'round', bet: 10, k: 'attack', sym: 7, m: 2, win: 0, sp: 270 });
    expect(t.rounds).toBe(3);
    expect(t.spinBetSum).toBe(30);
    expect(t.coinWinSum).toBe(4000);
    expect(t.slotKind).toEqual({ coin: 1, none: 1, attack: 1 });
    expect(t.symbolHits).toEqual({ '4': 1, '7': 1 }); // 미매치(-1)는 심볼 빈도 제외
    expect(t.puzzleMultSum).toBeCloseTo(4.5, 5);
    expect(t.minSpins).toBe(270); // 최저 잔고 추적(아슬아슬 지표)
  });

  it('spin_in/coin_in — 소스별 유입 합계·횟수, upgrade — 비용 지출, block — 막힘 수', () => {
    let t = base();
    t = applyEventToTotals(t, { t: 1, e: 'spin_in', src: 'gem', n: 30, sp: 330 });
    t = applyEventToTotals(t, { t: 2, e: 'spin_in', src: 'gem', n: 60, sp: 390 });
    t = applyEventToTotals(t, { t: 3, e: 'spin_in', src: 'facility', n: 100, sp: 490 });
    t = applyEventToTotals(t, { t: 4, e: 'coin_in', src: 'raid', n: 50_000, co: 1_050_000 });
    t = applyEventToTotals(t, { t: 5, e: 'upgrade', n: 10_000, co: 1_040_000, L: 1 });
    t = applyEventToTotals(t, { t: 6, e: 'block', sp: 3 });
    expect(t.spinIn).toEqual({ gem: 90, facility: 100 });
    expect(t.spinInCount).toEqual({ gem: 2, facility: 1 });
    expect(t.coinIn).toEqual({ raid: 50_000 });
    expect(t.upgrades).toBe(1);
    expect(t.coinOutUpgrade).toBe(10_000);
    expect(t.noSpinBlocks).toBe(1);
    expect(t.minSpins).toBe(3);
  });

  it('stage — 종류별 진입 수·스테이크 누적, reset — 집계 초기화', () => {
    let t = base();
    t = applyEventToTotals(t, { t: 1, e: 'stage', k: 'raid', n: 4000 });
    t = applyEventToTotals(t, { t: 2, e: 'stage', k: 'raid', n: 4400 });
    t = applyEventToTotals(t, { t: 3, e: 'stage', k: 'attack', n: 6 });
    expect(t.stage['raid']).toEqual({ count: 2, stakeSum: 8400, winSum: 0 });
    expect(t.stage['attack']?.count).toBe(1);
    const r = applyEventToTotals(t, { t: 9, e: 'reset', n: 300 });
    expect(r.rounds).toBe(0);
    expect(r.stage).toEqual({});
    expect(r.startedAt).toBe(9);
  });
});

describe('telemetry v2 — ledgerSummary(재설계 KPI)', () => {
  it('라운드 0 이면 null', () => {
    const empty = applyEventToTotals({} as EconTotals, RESET);
    expect(ledgerSummary(empty, 100)).toBeNull();
  });

  it('매치율·순스핀/라운드·코인RTP·소스 점유율 산출', () => {
    let t = applyEventToTotals({} as EconTotals, RESET);
    // 4라운드: 매치 2(코인 1·어택 1) + 미매치 2. 베팅 10×4=40. 당첨 6000코인(코인베팅 10×100=1000/라운드).
    t = applyEventToTotals(t, { t: 1, e: 'round', bet: 10, k: 'coin', sym: 4, m: 1, win: 6000, sp: 290 });
    t = applyEventToTotals(t, { t: 2, e: 'round', bet: 10, k: 'none', sym: -1, m: 1, win: 0, sp: 280 });
    t = applyEventToTotals(t, { t: 3, e: 'round', bet: 10, k: 'attack', sym: 7, m: 1, win: 0, sp: 270 });
    t = applyEventToTotals(t, { t: 4, e: 'round', bet: 10, k: 'none', sym: -1, m: 1, win: 0, sp: 260 });
    t = applyEventToTotals(t, { t: 5, e: 'spin_in', src: 'gem', n: 20, sp: 280 });
    t = applyEventToTotals(t, { t: 6, e: 'spin_in', src: 'facility', n: 20, sp: 300 });
    const s = ledgerSummary(t, 100)!;
    expect(s.rounds).toBe(4);
    expect(s.matchRate).toBeCloseTo(0.5, 5);
    expect(s.kindRate['attack']).toBeCloseTo(0.25, 5);
    expect(s.spinInTotal).toBe(40);
    expect(s.netSpinPerRound).toBeCloseTo((40 - 40) / 4, 5); // 유입 40 − 소모 40
    expect(s.coinRtp).toBeCloseTo(6000 / (40 * 100), 5); // 1.5
    expect(s.spinShare['gem']).toBeCloseTo(0.5, 5);
    expect(s.minSpins).toBe(260);
  });

  it('⭐구매(shop) 스핀은 무료플레이 밸런스에서 분리 — earned/net/share 에서 제외', () => {
    let t = applyEventToTotals({} as EconTotals, RESET);
    t = applyEventToTotals(t, { t: 1, e: 'round', bet: 10, k: 'coin', sym: 4, m: 1, win: 0, sp: 290 });
    t = applyEventToTotals(t, { t: 2, e: 'round', bet: 10, k: 'none', sym: -1, m: 1, win: 0, sp: 280 });
    t = applyEventToTotals(t, { t: 3, e: 'spin_in', src: 'gem', n: 20, sp: 300 }); // 무료 획득
    t = applyEventToTotals(t, { t: 4, e: 'spin_in', src: 'shop', n: 100, sp: 400 }); // ⭐구매(IAP)
    const s = ledgerSummary(t, 100)!;
    expect(s.spinInTotal).toBe(120); // 전체(구매 포함)
    expect(s.purchasedSpins).toBe(100); // 구매 별도 표기
    expect(s.earnedSpinTotal).toBe(20); // 무료 획득만
    // net·share 는 무료 획득 기준(구매 100 이 순증감을 부풀리지 않음).
    expect(s.netSpinPerRound).toBeCloseTo((20 - 20) / 2, 5); // 획득20 − 소모(10×2)=20 → 0
    expect(s.spinShare['gem']).toBeCloseTo(1, 5); // 무료 획득 중 gem 100%
    expect(s.spinShare['shop']).toBeUndefined(); // 구매는 점유율에서 제외
  });
});
