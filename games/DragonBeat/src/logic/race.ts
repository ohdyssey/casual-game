/**
 * 레이스 시뮬 — 보트 물리(항력+임펄스), AI 페이싱, 순위/보상. 전부 순수 함수.
 *
 * 속도 모델: 스트로크마다 임펄스(속도 가산), 매 프레임 지수 항력 감쇠.
 *   perfect 연타 평형 속도 ≈ 6.3 m/s (≈ 22.7 km/h, 90 BPM 기준)
 *   good 연타 평형 속도 ≈ 3.5 m/s — 정확도가 곧 순위가 되는 구조.
 */
import type { AiProfile, BoatSim, RaceConfig, RaceReward } from './types.js';

/** 초당 속도 잔존율 — v(t+1s) = v(t) × DRAG_PER_SEC (물 저항). */
export const DRAG_PER_SEC = 0.45;

/** perfect 스트로크 1회의 속도 가산 (m/s). */
export const IMPULSE_SPEED = 2.6;

/** 속도 상한 (m/s) — 부스트 포함 절대 한계. */
export const MAX_SPEED = 10;

/** 부스트 — 풀게이지 시 자동 발동, 임펄스 배수 + 지속시간. */
export const BOOST_MULT = 1.5;
export const BOOST_DURATION_MS = 4000;

/** 정지 상태 보트. */
export const IDLE_BOAT: BoatSim = { velocity: 0, distance: 0 };

/** 순위별 코인 (1~4위). */
export const RANK_COINS = [300, 180, 100, 50] as const;

/** 1위 보석 보너스. */
export const FIRST_PLACE_GEMS = 5;

/** 점수 → 보너스 코인 환산 (200점당 1코인). */
export const SCORE_PER_COIN = 200;

/** 3판 레이스 구성 — 템포는 BGM(172BPM)에 고정, 거리·AI 페이스·차트 밀도가 판마다 상승. */
export const RACES: ReadonlyArray<RaceConfig> = [
  {
    id: 1,
    title: '연못 스프린트',
    bpm: 172,
    distanceM: 300,
    baseAiSpeed: 4.6,
    ai: [
      { name: '청룡', tint: 0x9fe2ff, power: 1.05, wobbleAmp: 0.5, wobblePeriodMs: 9000, wobblePhase: 0, rubberBand: 0.012 },
      { name: '백호', tint: 0xfff3c2, power: 0.96, wobbleAmp: 0.6, wobblePeriodMs: 7000, wobblePhase: 2.1, rubberBand: 0.016 },
      { name: '주작', tint: 0xffc2c2, power: 0.88, wobbleAmp: 0.4, wobblePeriodMs: 11000, wobblePhase: 4.2, rubberBand: 0.02 },
    ],
  },
  {
    id: 2,
    title: '강물 랠리',
    bpm: 172,
    distanceM: 400,
    baseAiSpeed: 5.2,
    ai: [
      { name: '청룡', tint: 0x9fe2ff, power: 1.08, wobbleAmp: 0.5, wobblePeriodMs: 8000, wobblePhase: 1.0, rubberBand: 0.012 },
      { name: '백호', tint: 0xfff3c2, power: 1.0, wobbleAmp: 0.7, wobblePeriodMs: 6500, wobblePhase: 3.1, rubberBand: 0.015 },
      { name: '주작', tint: 0xffc2c2, power: 0.92, wobbleAmp: 0.5, wobblePeriodMs: 10000, wobblePhase: 5.0, rubberBand: 0.018 },
    ],
  },
  {
    id: 3,
    title: '대운하 결승',
    bpm: 172,
    distanceM: 500,
    baseAiSpeed: 5.8,
    ai: [
      { name: '청룡', tint: 0x9fe2ff, power: 1.1, wobbleAmp: 0.6, wobblePeriodMs: 7000, wobblePhase: 0.6, rubberBand: 0.01 },
      { name: '백호', tint: 0xfff3c2, power: 1.04, wobbleAmp: 0.8, wobblePeriodMs: 6000, wobblePhase: 2.6, rubberBand: 0.013 },
      { name: '주작', tint: 0xffc2c2, power: 0.97, wobbleAmp: 0.6, wobblePeriodMs: 9000, wobblePhase: 4.6, rubberBand: 0.016 },
    ],
  },
];

/** 레이스 인덱스(1~3) → 구성. 범위 밖은 1번으로 폴백(불량 세이브 방어). */
export function raceConfig(raceNo: number): RaceConfig {
  const idx = Number.isFinite(raceNo) ? Math.floor(raceNo) - 1 : 0;
  return RACES[idx >= 0 && idx < RACES.length ? idx : 0];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 스트로크 임펄스 적용 — 속도 가산 후 상한 클램프 (불변). */
export function applyImpulse(boat: BoatSim, impulse: number, boostActive: boolean): BoatSim {
  const coeff = Number.isFinite(impulse) ? clamp(impulse, 0, 1) : 0;
  const gain = coeff * IMPULSE_SPEED * (boostActive ? BOOST_MULT : 1);
  return { velocity: clamp(boat.velocity + gain, 0, MAX_SPEED), distance: boat.distance };
}

/** 프레임 적분 — 지수 항력 감쇠 + 거리 누적 (불변). */
export function stepBoat(boat: BoatSim, dtMs: number): BoatSim {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return boat;
  const dt = dtMs / 1000;
  const velocity = boat.velocity * Math.pow(DRAG_PER_SEC, dt);
  return { velocity, distance: boat.distance + velocity * dt };
}

/** 표시용 속도 변환 (m/s → km/h, 소수 1자리). */
export function speedKmh(velocity: number): number {
  if (!Number.isFinite(velocity)) return 0;
  return Math.round(velocity * 3.6 * 10) / 10;
}

/**
 * AI 목표 속도 — 기본 페이스 + 사인 출렁임 + 고무줄(플레이어 추격/견제).
 * 고무줄 보정은 ±0.9 m/s 로 클램프 — 레이스가 박빙으로 유지되되 역전 가능.
 */
export function aiTargetSpeed(
  profile: AiProfile,
  baseAiSpeed: number,
  raceTimeMs: number,
  playerDistance: number,
  aiDistance: number,
): number {
  const wobble = profile.wobbleAmp * Math.sin((raceTimeMs / profile.wobblePeriodMs) * Math.PI * 2 + profile.wobblePhase);
  const rubber = clamp((playerDistance - aiDistance) * profile.rubberBand, -0.9, 0.9);
  return clamp(baseAiSpeed * profile.power + wobble + rubber, 0, MAX_SPEED);
}

/** AI 프레임 적분 — 목표 속도로 부드럽게 수렴(시정수 ≈ 800ms) 후 거리 누적. */
export function stepAiBoat(
  boat: BoatSim,
  profile: AiProfile,
  baseAiSpeed: number,
  dtMs: number,
  raceTimeMs: number,
  playerDistance: number,
): BoatSim {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return boat;
  const dt = dtMs / 1000;
  const target = aiTargetSpeed(profile, baseAiSpeed, raceTimeMs, playerDistance, boat.distance);
  const blend = 1 - Math.exp(-dt / 0.8);
  const velocity = boat.velocity + (target - boat.velocity) * blend;
  return { velocity, distance: boat.distance + velocity * dt };
}

/** 플레이어 순위 (1-based) — 동률은 플레이어 우선. */
export function rankOf(playerDistance: number, aiDistances: ReadonlyArray<number>): number {
  return 1 + aiDistances.filter((d) => d > playerDistance).length;
}

/** 레이스 보상 — 순위 코인 + 점수 보너스 코인, 1위 보석. */
export function raceReward(rank: number, score: number): RaceReward {
  const idx = clamp(Math.floor(Number.isFinite(rank) ? rank : RANK_COINS.length), 1, RANK_COINS.length) - 1;
  const bonus = Number.isFinite(score) && score > 0 ? Math.floor(score / SCORE_PER_COIN) : 0;
  return { coins: RANK_COINS[idx] + bonus, gems: idx === 0 ? FIRST_PLACE_GEMS : 0 };
}
