import { afterEach, describe, it, expect } from 'vitest';
import {
  addCollected,
  EMPTY_STAGE_STATE,
  isLeagueCleared,
  LEAGUE_COMPLETE_COINS,
  LEAGUE_GRAND,
  LEAGUE_STAGE_COINS,
  LEAGUE_STAGE_COUNT,
  LEAGUE_STAGE_GOALS,
  LEAGUE_TOTAL_GOAL,
  stageFloor,
  stageGoal,
  stageRatio, setLeagueTuning, leagueGrandCoins, leagueGrandDiamonds, stageCoins, STAR_SCALE,
} from './dailyLeague.js';
import { ITEM_FLOORS } from '../config/floorItems.js';

describe('단계 곡선 — 첫 칸도 한 세션은 걸린다', () => {
  /**
   * ⚠️ 옛 계약은 "1단계 = 1개"였다(접속 보상). PO 2026-08-24 가 뒤집었다 —
   * "1단계에서 별이 하나인가요? … 단계별 별수집 목표치는 너무 낮습니다."
   * 실측 판당 평균 3.38별이므로 첫 칸은 **두세 판**은 걸려야 사다리로 읽힌다.
   */
  it('1단계는 한 판으로 못 채운다(실측 판당 평균 3.4별)', () => {
    expect(LEAGUE_STAGE_GOALS[0]!).toBeGreaterThanOrEqual(7);
  });

  /*
   * (개정 2026-08-25) 단조 상승 곡선은 **파형 사다리**로 대체됐다 — 허들(1·3·5·7번 인덱스)과
   * 회복(2·4·6·8번 인덱스) 칸이 교대한다. 아래 불변식이 그 리듬을 지킨다.
   */
  it('파형 — 허들 칸은 양옆 회복 칸보다 깊다(계곡)', () => {
    for (const h of [1, 3, 5, 7]) {
      expect(LEAGUE_STAGE_GOALS[h]!).toBeGreaterThan(LEAGUE_STAGE_GOALS[h - 1]!);
      expect(LEAGUE_STAGE_GOALS[h]!).toBeGreaterThan(LEAGUE_STAGE_GOALS[h + 1]!);
    }
  });

  it('파형 — 허들끼리·회복끼리는 상승 추세(뒤로 갈수록 무겁다)', () => {
    const hurdles = [1, 3, 5, 7].map((i) => LEAGUE_STAGE_GOALS[i]!);
    const reliefs = [0, 2, 4, 6, 8].map((i) => LEAGUE_STAGE_GOALS[i]!);
    for (let i = 1; i < hurdles.length; i++) expect(hurdles[i]!).toBeGreaterThan(hurdles[i - 1]!);
    for (let i = 1; i < reliefs.length; i++) expect(reliefs[i]!).toBeGreaterThanOrEqual(reliefs[i - 1]!);
    expect(LEAGUE_STAGE_GOALS[LEAGUE_STAGE_COUNT - 1]!).toBe(Math.max(...LEAGUE_STAGE_GOALS)); // 완주 칸이 최대.
  });

  it('보상은 난이도와 같은 파형을 그린다(칸 목표 × 별당 코인)', () => {
    const cps = LEAGUE_STAGE_COINS[0]! / LEAGUE_STAGE_GOALS[0]!;
    for (let i = 0; i < LEAGUE_STAGE_COUNT; i++) {
      expect(LEAGUE_STAGE_COINS[i]!).toBe(LEAGUE_STAGE_GOALS[i]! * cps);
    }
  });

  /** 하루 완주가 **한 세션으로는 불가능**해야 한다 — 실측 3.38별/판 기준 40판 이상. */
  it('완주에 하루 40판 이상이 필요하다', () => {
    const STARS_PER_GAME = 3.38; // 실측(레벨 3~300, 8판 표본).
    expect(LEAGUE_TOTAL_GOAL / STARS_PER_GAME).toBeGreaterThan(40);
  });
});

describe('addCollected — 남는 수집은 이월된다', () => {
  it('목표에 못 미치면 같은 단계에 쌓인다', () => {
    const r = addCollected({ stage: 2, count: 0 }, 1);
    expect(r.staged).toBe(0);
    expect(r.next).toEqual({ stage: 2, count: 1 });
    expect(r.coins).toBe(0);
  });

  it('한 단계를 채우면 **그 단계 소보상**이 나온다(톱니바퀴)', () => {
    const r = addCollected({ stage: 0, count: 0 }, LEAGUE_STAGE_GOALS[0]!); // 1단계 목표만큼
    expect(r.staged).toBe(1);
    expect(r.next).toEqual({ stage: 1, count: 0 });
    expect(r.coins).toBe(LEAGUE_STAGE_COINS[0]); // 5,000
    expect(r.justCleared).toBe(false);
  });

  /**
   * 한 번에 여러 개가 들어오는 지금 구조(별 5~25개)에서는 **이월이 필수**다(PO 2026-08-24).
   * 버리면 아무리 모아도 게이지가 제자리로 보인다.
   */
  it('목표를 넘기면 남는 만큼 다음 단계로 이월된다', () => {
    // 1·2단계 목표 합 + 3 → 3단계에 3 이 남는다.
    const two = LEAGUE_STAGE_GOALS[0]! + LEAGUE_STAGE_GOALS[1]!;
    const r = addCollected({ stage: 0, count: 0 }, two + 3);
    expect(r.staged).toBe(2);
    expect(r.next).toEqual({ stage: 2, count: 3 });
    expect(r.coins).toBe(LEAGUE_STAGE_COINS.slice(0, 2).reduce((a, b) => a + b, 0));
  });

  it('한 번에 총 목표를 넘기면 완주하고 남는 수집은 버려진다', () => {
    const r = addCollected({ stage: 0, count: 0 }, LEAGUE_TOTAL_GOAL + 50);
    expect(r.next.stage).toBe(LEAGUE_STAGE_COUNT);
    expect(r.next.count).toBe(0);
    expect(r.justCleared).toBe(true);
    expect(r.coins).toBe(LEAGUE_COMPLETE_COINS + LEAGUE_GRAND.coins);
  });

  it('한 걸음씩 모으면 정확히 누적 목표만큼 걸려 완주한다', () => {
    let s = EMPTY_STAGE_STATE;
    let coins = 0;
    let picked = 0;
    while (!isLeagueCleared(s.stage)) {
      const r = addCollected(s, 1);
      s = r.next;
      coins += r.coins;
      picked += 1;
      expect(picked).toBeLessThanOrEqual(LEAGUE_TOTAL_GOAL); // 무한루프 방어
    }
    expect(picked).toBe(LEAGUE_TOTAL_GOAL);
    // 10단계 소보상 합계 + 완주 그랜드 프라이즈.
    expect(coins).toBe(LEAGUE_COMPLETE_COINS + LEAGUE_GRAND.coins);
  });

  it('완주 뒤에는 더 올라가지 않는다', () => {
    const r = addCollected({ stage: LEAGUE_STAGE_COUNT, count: 0 }, 10);
    expect(r.staged).toBe(0);
    expect(r.coins).toBe(0);
  });
});

describe('stageFloor — 내가 가진 점포 안에서만 순환한다(PO 2026-08-23)', () => {
  /*
   * 옛 규칙은 보유 층에서 **위로** 올라갔다(2층 보유자가 3·4·5층 상품을 모았다). 아직 짓지도 않은
   * 층의 물건이 떨어지니 "내 가게에 없는 것"이 되어 수집의 이유가 끊긴다. 이제는 1층~보유 최고층
   * 안에서만 돈다.
   */
  it('1층만 가진 신규는 언제나 1층 상품', () => {
    expect(stageFloor(0, 1)).toBe(1);
    expect(stageFloor(7, 1)).toBe(1);
  });

  it('보유 층수만큼 번갈아 나온다', () => {
    expect([0, 1, 2, 3, 4, 5].map((st) => stageFloor(st, 2))).toEqual([1, 2, 1, 2, 1, 2]);
    expect([0, 1, 2, 3, 4, 5].map((st) => stageFloor(st, 5))).toEqual([1, 2, 3, 4, 5, 1]);
  });

  it('아트가 있는 층수를 넘는 보유는 그 범위로 잘린다', () => {
    expect(stageFloor(0, ITEM_FLOORS + 5)).toBe(1);
    expect(stageFloor(ITEM_FLOORS - 1, ITEM_FLOORS + 5)).toBe(ITEM_FLOORS);
  });

  it('항상 1..보유층 안이다 — 없는 점포의 상품은 절대 나오지 않는다', () => {
    for (const owned of [1, 2, 3, 7, 20]) {
      for (let st = 0; st < 30; st++) {
        const f = stageFloor(st, owned);
        expect(f).toBeGreaterThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(Math.min(ITEM_FLOORS, owned));
      }
    }
  });
});

describe('stageRatio', () => {
  it('0~1 안에 머문다', () => {
    expect(stageRatio({ stage: 0, count: 0 })).toBe(0);
    expect(stageRatio({ stage: 4, count: stageGoal(4) })).toBe(1);
    expect(stageRatio({ stage: LEAGUE_STAGE_COUNT, count: 0 })).toBe(1);
  });
});

describe('라이브옵스 튜닝(economy.json 노브, PO 2026-08-25)', () => {
  afterEach(() => setLeagueTuning({})); // 기본값 복원 — 다른 테스트 오염 방지.

  it('기본값(배율 1·320/STAR_SCALE 별당)은 설계 표와 일치한다', () => {
    setLeagueTuning({});
    expect(stageGoal(0)).toBe(LEAGUE_STAGE_GOALS[0]);
    expect(stageCoins(0)).toBe(LEAGUE_STAGE_GOALS[0]! * Math.round(320 / STAR_SCALE));
  });

  it('goalMult·coinPerStar·grandMult 가 유효값에 반영된다', () => {
    setLeagueTuning({ goalMult: 1.5, coinPerStar: 200, grandMult: 0.5 });
    expect(stageGoal(0)).toBe(Math.round(LEAGUE_STAGE_GOALS[0]! * 1.5));
    expect(stageCoins(0)).toBe(stageGoal(0) * 200);
    expect(leagueGrandCoins()).toBe(150_000);
    expect(leagueGrandDiamonds()).toBe(150);
  });

  it('비정상 값(0·음수·NaN)은 기본값으로 방어한다', () => {
    setLeagueTuning({ goalMult: 0, coinPerStar: Number.NaN, grandMult: -1 });
    expect(stageGoal(0)).toBe(LEAGUE_STAGE_GOALS[0]);
    expect(stageCoins(0)).toBe(LEAGUE_STAGE_GOALS[0]! * Math.round(320 / STAR_SCALE));
    expect(leagueGrandCoins()).toBe(LEAGUE_GRAND.coins);
  });
});

describe('그랜드 다이아 — 톱니바퀴 + 가끔 계곡(PO 2026-08-31 결제구조)', () => {
  it('periodId 를 안 주면 기준값(배율 1)을 돌려준다', () => {
    expect(leagueGrandDiamonds()).toBe(LEAGUE_GRAND.diamonds);
  });

  it('periodId 에 따라 값이 오르내린다(완전히 고정값이 아니다)', () => {
    const values = new Set(Array.from({ length: 20 }, (_, i) => leagueGrandDiamonds(i)));
    expect(values.size).toBeGreaterThan(1);
  });

  it('계곡 날(13, 22, 31, 49…)은 기준값보다 확실히 낮다', () => {
    const base = LEAGUE_GRAND.diamonds;
    for (const d of [13, 22, 31, 49]) {
      expect(leagueGrandDiamonds(d)).toBeLessThan(base * 0.5);
    }
  });

  it('10의 배수인 계곡 후보(40)는 클론다이크 보너스 자리와 겹치지 않게 계곡에서 제외된다', () => {
    const base = LEAGUE_GRAND.diamonds;
    expect(leagueGrandDiamonds(40)).toBeGreaterThanOrEqual(base * 0.5); // 계곡이었다면 40 도 걸렸을 자리.
  });

  it('모든 periodId 에서 최소 1 다이아는 보장된다', () => {
    for (let d = 0; d < 100; d++) expect(leagueGrandDiamonds(d)).toBeGreaterThanOrEqual(1);
  });

  it('addCollected 는 완주 시에만 diamonds 를 채운다(중간 단계는 0)', () => {
    const mid = addCollected({ stage: 0, count: 0 }, 1, 5); // 1단계도 못 채움.
    expect(mid.diamonds).toBe(0);
    const full = addCollected({ stage: 0, count: 0 }, LEAGUE_TOTAL_GOAL + 50, 5); // 완주.
    expect(full.justCleared).toBe(true);
    expect(full.diamonds).toBe(leagueGrandDiamonds(5));
    expect(full.diamonds).toBeGreaterThan(0);
  });
});
