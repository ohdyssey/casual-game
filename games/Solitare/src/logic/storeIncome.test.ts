import { describe, it, expect } from 'vitest';
import { DEFAULT_ECON, claimGoalFor } from './economy.js';
import {
  INCOME_PERIOD_BASE_MS,
  INCOME_PERIOD_STEP_MS,
  INCOME_PERIOD_MAX_MS,
  periodFor,
  INTEGRATED_FROM_FLOORS,
  usesIntegratedClaim,
  incomePerPeriod,
  msUntilFull,
  canClaim,
  capacityFor,
  formatIncomeTimer,
  addToBank,
  isBankFull,
  accrueByTime,
} from './storeIncome.js';

const FEE = 2000; // 대표 게임비(경제 모델의 기준 단위).

describe('수금 주기 — 10분(PO 2026-07-28)', () => {
  it('주기는 정확히 10분', () => {
    expect(INCOME_PERIOD_BASE_MS).toBe(10 * 60 * 1000);
  });

  it('3층부터 통합 수금', () => {
    expect(INTEGRATED_FROM_FLOORS).toBe(3);
    expect(usesIntegratedClaim(2)).toBe(false);
    expect(usesIntegratedClaim(3)).toBe(true);
    expect(usesIntegratedClaim(10)).toBe(true);
  });
});

describe('incomePerPeriod — 건설된 층 전체 합', () => {
  it('층이 늘수록 한 주기 수익도 늘어난다', () => {
    const a = incomePerPeriod(DEFAULT_ECON, FEE, 1);
    const b = incomePerPeriod(DEFAULT_ECON, FEE, 3);
    const c = incomePerPeriod(DEFAULT_ECON, FEE, 5);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('기존 경제 모델(claimGoalFor)의 층별 합과 정확히 일치한다 — 새 숫자를 만들지 않는다', () => {
    const expected = [1, 2, 3, 4].reduce((s, f) => s + claimGoalFor(DEFAULT_ECON, FEE, f), 0);
    expect(incomePerPeriod(DEFAULT_ECON, FEE, 4)).toBe(expected);
  });

  it('건설 층이 없으면 0', () => {
    expect(incomePerPeriod(DEFAULT_ECON, FEE, 0)).toBe(0);
  });
});

describe('addToBank — 손님 코인을 담되 한 주기분에서 멈춘다', () => {
  it('상한 전까지는 그대로 담긴다', () => {
    expect(addToBank(0, 120, 1000)).toEqual({ bank: 120, added: 120 });
    expect(addToBank(120, 80, 1000)).toEqual({ bank: 200, added: 80 });
  });

  /** 핵심 규칙 — 받지 않으면 **더 쌓이지 않는다**(방치 무한 누적 방지). */
  it('상한에 닿으면 잘리고, 가득 찬 뒤엔 하나도 안 담긴다', () => {
    expect(addToBank(950, 200, 1000)).toEqual({ bank: 1000, added: 50 }); // 넘치는 만큼만.
    expect(addToBank(1000, 500, 1000)).toEqual({ bank: 1000, added: 0 }); // 가득 — 연출도 생략 가능.
  });

  it('음수·소수 입력 방어', () => {
    expect(addToBank(-50, 30, 1000).bank).toBe(30);
    expect(addToBank(0, -30, 1000)).toEqual({ bank: 0, added: 0 });
    expect(addToBank(0, 10.7, 1000).added).toBe(10);
  });

  it('상한이 0(건설 층 없음)이면 담기지 않는다', () => {
    expect(addToBank(0, 500, 0)).toEqual({ bank: 0, added: 0 });
  });

  it('isBankFull — 가득 판정', () => {
    expect(isBankFull(999, 1000)).toBe(false);
    expect(isBankFull(1000, 1000)).toBe(true);
    expect(isBankFull(0, 0)).toBe(false); // 층이 없으면 '가득'도 아니다.
  });
});

describe('msUntilFull / canClaim — 다 채워야 받는다(잔액 기준)', () => {
  const CAP = 1000;

  it('가득 차야 수금 가능', () => {
    expect(canClaim(CAP - 1, CAP)).toBe(false);
    expect(canClaim(CAP, CAP)).toBe(true);
    expect(canClaim(CAP * 3, CAP)).toBe(true);
  });

  it('남은 시간은 잔액에 비례하고 주기를 넘지 않는다', () => {
    expect(msUntilFull(0, CAP)).toBe(INCOME_PERIOD_BASE_MS);
    expect(msUntilFull(CAP / 2, CAP)).toBe(INCOME_PERIOD_BASE_MS / 2);
    expect(msUntilFull(CAP, CAP)).toBe(0);
  });

  /**
   * 🐞 회귀 — PO 2026-07-29 "가득인데 회수가 안 된다". `accrueByTime` 은 가득 찬 뒤 `lastAt` 을 매 틱
   *    now 로 민다. 예전처럼 `lastAt` 나이로 판정하면 그 갱신 때문에 10분이 영원히 안 채워져 수령이
   *    **영구 잠금**됐다. 잔액 기준이면 몇 번을 갱신해도 가득이면 항상 수령 가능이어야 한다.
   */
  it('가득 찬 뒤 시간이 계속 갱신돼도 수령 가능 상태가 유지된다', () => {
    let bank = 0;
    let lastAt = 1_000_000;
    let now = lastAt + INCOME_PERIOD_BASE_MS; // 한 주기 경과 → 가득.
    ({ bank, lastAt } = accrueByTime(bank, lastAt, now, CAP));
    expect(bank).toBe(CAP);
    // 이후 1초마다 배지 갱신(틱)이 계속 돌아도 수령 가능해야 한다.
    for (let i = 0; i < 30; i++) {
      now += 1000;
      ({ bank, lastAt } = accrueByTime(bank, lastAt, now, CAP));
      expect(canClaim(bank, CAP)).toBe(true);
      expect(msUntilFull(bank, CAP)).toBe(0);
    }
  });

  it('건설 층이 없으면(cap 0) 채워지지 않고 수령도 불가', () => {
    expect(canClaim(0, 0)).toBe(false);
    expect(msUntilFull(0, 0)).toBe(INCOME_PERIOD_BASE_MS);
  });
});

describe('capacityFor — 수금함 용량 업그레이드(배선만, PO 2026-07-29)', () => {
  it('레벨 0 은 기본 용량 그대로', () => {
    expect(capacityFor(1000, 0)).toBe(1000);
    expect(capacityFor(1000)).toBe(1000);
  });

  it('레벨이 오르면 용량이 커진다(레벨당 +25%)', () => {
    expect(capacityFor(1000, 1)).toBe(1250);
    expect(capacityFor(1000, 4)).toBe(2000);
    expect(capacityFor(1000, 2)).toBeGreaterThan(capacityFor(1000, 1));
  });

  it('음수·소수 입력을 방어한다', () => {
    expect(capacityFor(-100, 3)).toBe(0);
    expect(capacityFor(1000, -2)).toBe(1000);
  });
});

describe('periodFor — 층이 늘수록 주기가 길어진다(PO 2026-07-30)', () => {
  it('1층은 기본 주기(10분)', () => {
    expect(periodFor(1)).toBe(INCOME_PERIOD_BASE_MS);
    expect(periodFor(0)).toBe(INCOME_PERIOD_BASE_MS); // 0·음수는 1층으로 클램프.
    expect(periodFor(-3)).toBe(INCOME_PERIOD_BASE_MS);
  });

  it('층마다 정확히 STEP 만큼 늘어난다', () => {
    for (let f = 2; f <= 30; f++) {
      expect(periodFor(f) - periodFor(f - 1)).toBe(INCOME_PERIOD_STEP_MS);
    }
    expect(periodFor(10)).toBe(28 * 60 * 1000);
    expect(periodFor(30)).toBe(68 * 60 * 1000);
  });

  it('상한(4시간)에서 고정된다 — 층이 아무리 많아도 그 이상 길어지지 않는다', () => {
    expect(periodFor(1000)).toBe(INCOME_PERIOD_MAX_MS);
    expect(periodFor(10_000)).toBe(INCOME_PERIOD_MAX_MS);
  });

  /** 주기가 길어져도 **그 주기 안에** 정확히 가득 찬다(적립 속도 = cap/주기). */
  it('늘어난 주기만큼 시간이 지나야 가득 찬다', () => {
    const CAP = 1000;
    const t0 = 1_000_000;
    const p30 = periodFor(30);
    expect(accrueByTime(0, t0, t0 + p30 / 2, CAP, p30).bank).toBe(CAP / 2);
    expect(accrueByTime(0, t0, t0 + p30, CAP, p30).bank).toBe(CAP);
    // 같은 시간이라도 주기가 짧은 1층이면 이미 가득이다.
    expect(accrueByTime(0, t0, t0 + p30 / 2, CAP, periodFor(1)).bank).toBe(CAP);
  });

  it('남은 시간도 그 층의 주기를 기준으로 계산된다', () => {
    const CAP = 1000;
    expect(msUntilFull(0, CAP, periodFor(30))).toBe(periodFor(30));
    expect(msUntilFull(CAP / 2, CAP, periodFor(30))).toBe(periodFor(30) / 2);
  });
});

describe('formatIncomeTimer — MM:SS / H:MM:SS', () => {
  it('10분 주기라 분·초만 쓴다', () => {
    expect(formatIncomeTimer(INCOME_PERIOD_BASE_MS)).toBe('10:00');
    expect(formatIncomeTimer(59_000)).toBe('00:59');
    expect(formatIncomeTimer(0)).toBe('00:00');
    // 주기가 층에 따라 1시간을 넘을 수 있다 — 시 단위 표기(예전 MM:SS 고정은 68분을 "68:00" 으로 보여줬다).
    expect(formatIncomeTimer(periodFor(30))).toBe('1:08:00');
    expect(formatIncomeTimer(INCOME_PERIOD_MAX_MS)).toBe('4:00:00');
    expect(formatIncomeTimer(-5000)).toBe('00:00'); // 음수 방어.
  });
});

describe('accrueByTime — 화면·접속과 무관하게 시간으로 쌓인다(PO 2026-07-29)', () => {
  const t0 = 1_000_000;
  const CAP = 1200;

  it('한 주기의 절반이 지나면 절반이 쌓인다', () => {
    const r = accrueByTime(0, t0, t0 + INCOME_PERIOD_BASE_MS / 2, CAP);
    expect(r.bank).toBe(600);
  });

  /** 오프라인 적립 — 앱을 껐던 시간도 그대로 반영된다. */
  it('앱을 껐다 켜도 그 사이 시간만큼 들어온다', () => {
    expect(accrueByTime(0, t0, t0 + INCOME_PERIOD_BASE_MS, CAP).bank).toBe(CAP);
  });

  /** 핵심 규칙 — 받지 않으면 상한에서 멈춘다. */
  it('오래 방치해도 한 주기분에서 멈춘다', () => {
    expect(accrueByTime(0, t0, t0 + INCOME_PERIOD_BASE_MS * 100, CAP).bank).toBe(CAP);
    expect(accrueByTime(CAP, t0, t0 + INCOME_PERIOD_BASE_MS * 5, CAP).bank).toBe(CAP);
  });

  /** 자주 호출해도 나머지가 버려지지 않아야 한다(1초 틱으로 갱신하므로 중요). */
  it('1초씩 잘게 나눠 호출해도 총액이 한 번에 부른 것과 같다', () => {
    let bank = 0;
    let at = t0;
    for (let sec = 1; sec <= 600; sec++) {
      const r = accrueByTime(bank, at, t0 + sec * 1000, CAP);
      bank = r.bank;
      at = r.lastAt;
    }
    expect(bank).toBe(CAP); // 10분(600초) = 한 주기 → 정확히 가득.
  });

  it('시계가 거꾸로 가면 그대로 둔다', () => {
    expect(accrueByTime(300, t0, t0 - 5000, CAP)).toEqual({ bank: 300, lastAt: t0 });
  });

  it('건설 층이 없으면(상한 0) 쌓이지 않는다', () => {
    expect(accrueByTime(0, t0, t0 + INCOME_PERIOD_BASE_MS, 0).bank).toBe(0);
  });
});
