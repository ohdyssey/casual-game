import { describe, expect, it } from 'vitest';
import {
  BOOST_MULT,
  DRAG_PER_SEC,
  FIRST_PLACE_GEMS,
  IDLE_BOAT,
  IMPULSE_SPEED,
  MAX_SPEED,
  RACES,
  RANK_COINS,
  aiTargetSpeed,
  applyImpulse,
  raceConfig,
  raceReward,
  rankOf,
  speedKmh,
  stepAiBoat,
  stepBoat,
} from './race.js';

describe('applyImpulse', () => {
  it('perfect 임펄스(1)는 IMPULSE_SPEED 만큼 가속', () => {
    expect(applyImpulse(IDLE_BOAT, 1, false).velocity).toBeCloseTo(IMPULSE_SPEED, 9);
  });

  it('부스트 중엔 BOOST_MULT 배', () => {
    expect(applyImpulse(IDLE_BOAT, 1, true).velocity).toBeCloseTo(IMPULSE_SPEED * BOOST_MULT, 9);
  });

  it('속도는 MAX_SPEED 를 넘지 않는다', () => {
    const fast = { velocity: MAX_SPEED - 0.1, distance: 0 };
    expect(applyImpulse(fast, 1, true).velocity).toBe(MAX_SPEED);
  });

  it('임펄스 0 / NaN / 음수는 속도 불변', () => {
    const boat = { velocity: 3, distance: 10 };
    expect(applyImpulse(boat, 0, false).velocity).toBe(3);
    expect(applyImpulse(boat, NaN, false).velocity).toBe(3);
    expect(applyImpulse(boat, -1, false).velocity).toBe(3);
  });

  it('원본 객체를 변경하지 않는다(불변)', () => {
    const boat = { velocity: 1, distance: 5 };
    applyImpulse(boat, 1, false);
    expect(boat).toEqual({ velocity: 1, distance: 5 });
  });
});

describe('stepBoat', () => {
  it('1초 적분 시 속도가 DRAG_PER_SEC 배율로 감쇠한다', () => {
    const boat = stepBoat({ velocity: 4, distance: 0 }, 1000);
    expect(boat.velocity).toBeCloseTo(4 * DRAG_PER_SEC, 6);
  });

  it('거리는 감쇠 후 속도로 누적된다', () => {
    const boat = stepBoat({ velocity: 4, distance: 100 }, 500);
    expect(boat.distance).toBeGreaterThan(100);
    expect(boat.distance).toBeLessThan(102);
  });

  it('dt 분할 적분과 일괄 적분의 속도가 일치한다(지수 감쇠 일관성)', () => {
    let split = { velocity: 5, distance: 0 };
    for (let i = 0; i < 10; i++) split = stepBoat(split, 100);
    const whole = stepBoat({ velocity: 5, distance: 0 }, 1000);
    expect(split.velocity).toBeCloseTo(whole.velocity, 6);
  });

  it('비정상 dt(0, 음수, NaN)는 상태 불변', () => {
    const boat = { velocity: 2, distance: 7 };
    expect(stepBoat(boat, 0)).toBe(boat);
    expect(stepBoat(boat, -16)).toBe(boat);
    expect(stepBoat(boat, NaN)).toBe(boat);
  });
});

describe('speedKmh', () => {
  it('m/s → km/h 소수 1자리', () => {
    expect(speedKmh(5.17)).toBe(18.6);
    expect(speedKmh(0)).toBe(0);
  });

  it('NaN 은 0', () => {
    expect(speedKmh(NaN)).toBe(0);
  });
});

describe('RACES 구성 무결성', () => {
  it('3판 구성 — 템포·거리·AI 페이스가 단조 상승', () => {
    expect(RACES).toHaveLength(3);
    for (let i = 1; i < RACES.length; i++) {
      expect(RACES[i].bpm).toBeGreaterThan(RACES[i - 1].bpm);
      expect(RACES[i].distanceM).toBeGreaterThan(RACES[i - 1].distanceM);
      expect(RACES[i].baseAiSpeed).toBeGreaterThan(RACES[i - 1].baseAiSpeed);
    }
  });

  it('모든 판에 AI 3척 + 양수 밸런스 값', () => {
    for (const race of RACES) {
      expect(race.ai).toHaveLength(3);
      for (const ai of race.ai) {
        expect(ai.power).toBeGreaterThan(0);
        expect(ai.wobblePeriodMs).toBeGreaterThan(0);
        expect(ai.rubberBand).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('raceConfig 는 1-based 조회 + 범위 밖 폴백', () => {
    expect(raceConfig(2)).toBe(RACES[1]);
    expect(raceConfig(0)).toBe(RACES[0]);
    expect(raceConfig(99)).toBe(RACES[0]);
    expect(raceConfig(NaN)).toBe(RACES[0]);
  });
});

describe('aiTargetSpeed', () => {
  const profile = RACES[0].ai[0];

  it('고무줄 보정은 ±0.9 m/s 로 클램프', () => {
    const ahead = aiTargetSpeed(profile, 4.6, 0, 1000, 0);
    const behind = aiTargetSpeed(profile, 4.6, 0, 0, 1000);
    expect(ahead - behind).toBeLessThanOrEqual(1.8 + 1e-9);
  });

  it('목표 속도는 0~MAX_SPEED 범위', () => {
    for (let t = 0; t < 20000; t += 1000) {
      const v = aiTargetSpeed(profile, 4.6, t, 50, 50);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(MAX_SPEED);
    }
  });
});

describe('stepAiBoat', () => {
  it('정지 상태에서 목표 속도로 수렴한다', () => {
    const profile = RACES[0].ai[0];
    let boat = IDLE_BOAT;
    for (let t = 0; t < 8000; t += 100) {
      boat = stepAiBoat(boat, profile, 4.6, 100, t, boat.distance);
    }
    expect(boat.velocity).toBeGreaterThan(3.5);
    expect(boat.distance).toBeGreaterThan(0);
  });

  it('비정상 dt 는 상태 불변', () => {
    const boat = { velocity: 3, distance: 30 };
    expect(stepAiBoat(boat, RACES[0].ai[0], 4.6, NaN, 0, 0)).toBe(boat);
  });
});

describe('rankOf', () => {
  it('플레이어보다 앞선 보트 수 + 1', () => {
    expect(rankOf(100, [50, 80, 90])).toBe(1);
    expect(rankOf(100, [150, 80, 120])).toBe(3);
    expect(rankOf(100, [150, 180, 120])).toBe(4);
  });

  it('동률은 플레이어 우선', () => {
    expect(rankOf(100, [100, 100, 100])).toBe(1);
  });
});

describe('raceReward', () => {
  it('순위 코인 + 점수 보너스(200점당 1코인)', () => {
    expect(raceReward(1, 0)).toEqual({ coins: RANK_COINS[0], gems: FIRST_PLACE_GEMS });
    expect(raceReward(2, 1000)).toEqual({ coins: RANK_COINS[1] + 5, gems: 0 });
    expect(raceReward(4, 199)).toEqual({ coins: RANK_COINS[3], gems: 0 });
  });

  it('비정상 순위/점수도 안전 처리', () => {
    expect(raceReward(0, 0).coins).toBe(RANK_COINS[0]);
    expect(raceReward(99, NaN).coins).toBe(RANK_COINS[3]);
  });
});
