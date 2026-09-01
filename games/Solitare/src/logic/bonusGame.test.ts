import { describe, it, expect } from 'vitest';
import { BONUS_PLAYS_PER_DAY, BONUS_PAID_FEE, BONUS_DRAW_COUNT, BONUS_WIN_COINS, bonusWinCoins, bonusEntryFee, bonusPlaysLeft, canPlayBonus, consumeBonusPlay, toBonusMode, bonusBoardDiamondRate, rollBonusBoardDiamond } from './bonusGame.js';

const day = (d: number) => new Date(2026, 7, d, 12, 0, 0); // 2026-08-dd 정오(로컬).

describe('보너스 게임 일일 제한', () => {
  it('기록이 없으면 가득 찬 판수', () => {
    expect(bonusPlaysLeft(undefined, day(29))).toBe(BONUS_PLAYS_PER_DAY);
    expect(canPlayBonus(undefined, day(29))).toBe(true);
  });

  it('시작할 때마다 무료 판이 줄고, 다 쓰면 유료가 된다', () => {
    let use = consumeBonusPlay(undefined, day(29));
    expect(bonusPlaysLeft(use, day(29))).toBe(1);
    use = consumeBonusPlay(use, day(29));
    expect(bonusPlaysLeft(use, day(29))).toBe(0);
    expect(canPlayBonus(use, day(29), 0)).toBe(false); // 코인 0 이면 못 들어간다.
    expect(canPlayBonus(use, day(29), BONUS_PAID_FEE)).toBe(true); // 게임비가 있으면 들어간다.
  });

  it('무료 판을 넘겨도 계속 세지만 남은 판은 0 아래로 안 간다', () => {
    let use = consumeBonusPlay(consumeBonusPlay(undefined, day(29)), day(29));
    use = consumeBonusPlay(use, day(29)); // 3판째(유료)
    expect(use.used).toBe(BONUS_PLAYS_PER_DAY + 1); // 유료 판이 몇 번째인지 알려면 계속 세야 한다.
    expect(bonusPlaysLeft(use, day(29))).toBe(0);
  });

  it('날짜가 바뀌면 스스로 회복된다 — 별도 리셋이 필요 없다', () => {
    const spent = consumeBonusPlay(consumeBonusPlay(undefined, day(29)), day(29));
    expect(bonusPlaysLeft(spent, day(29))).toBe(0);
    expect(bonusPlaysLeft(spent, day(30))).toBe(BONUS_PLAYS_PER_DAY);
    expect(canPlayBonus(spent, day(30), 0)).toBe(true); // 무료 판이라 코인 없이도 된다.
  });

  it('원본 기록을 바꾸지 않는다(불변)', () => {
    const before = consumeBonusPlay(undefined, day(29));
    const snapshot = { ...before };
    consumeBonusPlay(before, day(29));
    expect(before).toEqual(snapshot);
  });

  it('무료 판을 다 쓰면 게임비가 붙고, 코인이 있으면 계속 들어갈 수 있다', () => {
    const free = consumeBonusPlay(undefined, day(29));
    expect(bonusEntryFee(free, day(29))).toBe(0); // 아직 1판 무료가 남았다.
    const spent = consumeBonusPlay(free, day(29));
    expect(bonusEntryFee(spent, day(29))).toBe(BONUS_PAID_FEE);
    expect(canPlayBonus(spent, day(29), BONUS_PAID_FEE)).toBe(true); // 딱 맞게 있으면 가능.
    expect(canPlayBonus(spent, day(29), BONUS_PAID_FEE - 1)).toBe(false); // 모자라면 불가.
    expect(bonusEntryFee(spent, day(30))).toBe(0); // 날이 바뀌면 다시 무료.
  });

  it('깨진 값(음수·소수)에도 판수가 범위를 벗어나지 않는다', () => {
    const today = consumeBonusPlay(undefined, day(29)).day;
    expect(bonusPlaysLeft({ day: today, used: -5 }, day(29))).toBe(BONUS_PLAYS_PER_DAY);
    expect(bonusPlaysLeft({ day: today, used: 1.7 }, day(29))).toBe(1);
    expect(bonusPlaysLeft({ day: today, used: 99 }, day(29))).toBe(0);
  });
});

describe('보너스 게임 모드(1장 / 3장)', () => {
  /**
   * 보상표(PO 2026-08-30 개정) — 1장 3,000/5,000 · 3장 5,000/7,000.
   * ⚠️ 배수로 떨어지지 않는다(×1.67 / ×1.4) — 배수 상수로 되돌리면 값이 어긋난다.
   */
  it('보상표가 PO 지시와 일치한다', () => {
    expect(BONUS_DRAW_COUNT.draw1).toBe(1);
    expect(BONUS_DRAW_COUNT.draw3).toBe(3);
    expect(BONUS_WIN_COINS.draw1).toEqual({ normal: 3_000, timed: 5_000 });
    expect(BONUS_WIN_COINS.draw3).toEqual({ normal: 5_000, timed: 7_000 });
  });

  it('bonusWinCoins 가 표를 그대로 읽는다 — 화면과 지급이 어긋나지 않게', () => {
    expect(bonusWinCoins('draw1', false)).toBe(3_000);
    expect(bonusWinCoins('draw1', true)).toBe(5_000);
    expect(bonusWinCoins('draw3', false)).toBe(5_000);
    expect(bonusWinCoins('draw3', true)).toBe(7_000);
  });

  it('어느 조합이든 게임비보다는 많이 준다 — 이겨도 손해인 판은 없다', () => {
    for (const mode of ['draw1', 'draw3'] as const) {
      for (const timed of [false, true]) expect(bonusWinCoins(mode, timed)).toBeGreaterThan(BONUS_PAID_FEE);
    }
  });

  it('모드 값이 깨져 들어와도 기본(1장)으로 접는다 — 실수로 어려운 판이 열리지 않게', () => {
    expect(toBonusMode('draw3')).toBe('draw3');
    expect(toBonusMode('draw1')).toBe('draw1');
    for (const bad of [undefined, null, '', 'DRAW3', 3, {}, 'draw2']) expect(toBonusMode(bad)).toBe('draw1');
  });

  it('게임비·무료 판수는 모드와 무관하다 — 어려운 쪽을 골라도 판을 더 주지 않는다', () => {
    const spent = consumeBonusPlay(consumeBonusPlay(undefined, day(29)), day(29));
    expect(bonusEntryFee(spent, day(29))).toBe(BONUS_PAID_FEE); // 모드 인자가 아예 없다.
    expect(bonusPlaysLeft(spent, day(29))).toBe(0);
  });
});

describe('보드 다이아 배치율 — 난이도 사다리', () => {
  it('표를 그대로 읽는다 — 3장+타임 1판당 1개 … 1장+일반 3판당 1개', () => {
    expect(bonusBoardDiamondRate('draw3', true)).toBe(1);
    expect(bonusBoardDiamondRate('draw3', false)).toBeCloseTo(1 / 2, 6);
    expect(bonusBoardDiamondRate('draw1', true)).toBeCloseTo(1 / 2, 6);
    expect(bonusBoardDiamondRate('draw1', false)).toBeCloseTo(1 / 3, 6);
  });

  it('승리 보상표와 **같은 순서**다 — 한쪽만 고쳐 "어려운 판이 덜 주는" 역전이 생기지 않게', () => {
    const rows = [
      ['draw1', false], ['draw1', true], ['draw3', false], ['draw3', true],
    ] as const;
    const byCoins = [...rows].sort((a, b) => bonusWinCoins(a[0], a[1]) - bonusWinCoins(b[0], b[1]));
    for (let i = 1; i < byCoins.length; i++) {
      const prev = bonusBoardDiamondRate(byCoins[i - 1][0], byCoins[i - 1][1]);
      const cur = bonusBoardDiamondRate(byCoins[i][0], byCoins[i][1]);
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it('확률 1.0 은 난수와 무관하게 항상 배치한다', () => {
    expect(rollBonusBoardDiamond('draw3', true, () => 0.999)).toBe(true);
  });

  it('확률 미만이면 배치, 이상이면 미배치 — 경계 포함', () => {
    expect(rollBonusBoardDiamond('draw1', false, () => 0.32)).toBe(true);
    expect(rollBonusBoardDiamond('draw1', false, () => 0.34)).toBe(false);
    expect(rollBonusBoardDiamond('draw3', false, () => 0.49)).toBe(true);
    expect(rollBonusBoardDiamond('draw3', false, () => 0.5)).toBe(false);
  });

  it('장기 평균이 표와 일치한다 — 3,000판 시뮬', () => {
    let seed = 12345;
    const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const [mode, timed] of [['draw1', false], ['draw1', true], ['draw3', false]] as const) {
      let hit = 0;
      for (let i = 0; i < 3000; i++) if (rollBonusBoardDiamond(mode, timed, rng)) hit++;
      expect(hit / 3000).toBeCloseTo(bonusBoardDiamondRate(mode, timed), 1);
    }
  });
});
