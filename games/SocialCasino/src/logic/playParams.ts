/**
 * playParams.ts — **플레이/스핀 경제 파라미터의 단일 출처(SSOT)**. 순수(프레임워크 무관) — PlayScene 와 경제 콘솔(econ)이 **둘 다 import**.
 *
 * 이전엔 이 상수들이 PlayScene.ts 안에 박혀 있어(Phaser 의존) 경제 콘솔이 값을 추적할 수 없었다. 여기로 추출해
 *   - PlayScene 은 그대로 import 해 사용(동작 불변),
 *   - econ 콘솔(econ.html, Phaser-free)도 같은 모듈을 import → **콘솔 표시값이 게임 실제값과 항상 일치**(드리프트 없음).
 *
 * ⚠️ 코인 RTP/포춘/잭팟/퍼즐멀티는 economy.ts, 진행(시티) 수식은 progression.ts 가 SSOT. 여기는 **스핀 경제 + 베팅 + 미션 플랜**.
 */
import type { GaugeReward } from '@casual/core';

/** 시작 골드. ⭐2026-06-30: **100만**으로 재설정(요청 — 1레벨 재설정·시작 코인 100만). wallet.START_COINS 와 동일해야 함. */
export const START_COINS = 1_000_000;

/** 베팅(스핀 베팅 ×N) 사다리 — GO 패널 ◀▶ 로 단계 이동. */
export const BET_LADDER = [1, 3, 5, 10, 20, 30, 50, 100, 250, 500, 750, 1000] as const;
/** 시작 베팅값(BET_LADDER 내 값). ⭐2026-06-30: 5→**10**으로 재설정(요청 — 1레벨 재설정·시작 베팅 10). */
export const BET_START = 10;

/**
 * ⭐골드(코인) 단위 배수 — 에너지(spinBet)와 분리해 코인 보상만 큰 단위로. 코인 베팅 = spinBet × COIN_DENOM(슬롯 배당·잭팟에만).
 *   RTP 비율은 bet 크기에 무관(선형) → 시뮬·밸런스 불변, 표시 골드 절댓값만 스케일.
 *   ⭐2026-06-30: 1000→**100**(코인 ÷10 리데노미네이션 — "골드 단위 너무 큼" 요청. 비율·밸런스·스핀 전부 불변, 표시 숫자만 1/10).
 */
export const COIN_DENOM = 100;

// ── 스핀 경제(코인마스터식): 스핀=플레이 화폐(슬롯/매치에 소모), 코인=보상(시티 건설용) ──
/** 초기 스핀. playerState.DEFAULT_SPINS 와 동일해야 함. ⭐2026-06-30: 300→**200**(요청 — 200스핀·베팅5 기준 경제 설계). */
export const START_SPINS = 200;
/**
 * ⭐스핀 회수 배수 — **매칭된 스핀젬 수 s 에 따른 총 회수 배수**(요청 2026-06-30 개정). 회수 = spinBet(N) × spinRefundMult(s).
 *   매칭수 s 자체 × (3개+ 추가 배수)를 함께 반영해, 많이 맞출수록 가파르게 보상:
 *     1 → ×1 (=N) · 2 → ×2 (=2N) · 3 → ×6 · 4 → ×12 · 5 → ×20.  (6개+ 는 5 취급 = ×20, 런어웨이 방지)
 *   공식: s × max(1, s-1)  — s≤2 는 s×1, s≥3 은 s×(s-1).
 *   (이전엔 1·2개가 모두 ×1 로 같아 1·2 매칭 회수가 동일하던 문제 해소 — 이제 s 에 비례해 또렷이 달라짐.)
 */
export function spinRefundMult(count: number): number {
  if (count <= 0) return 0;
  const s = Math.min(count, 5); // 6개+ 는 5 취급(런어웨이 방지)
  return s * Math.max(1, s - 1); // 1→1, 2→2, 3→6, 4→12, 5→20
}
/** 대박 스핀 주입 — win ≥ 베팅×BIG_X 면 spinBet×BIG 스핀(작은 상승니). */
export const BIGWIN_SPIN_BIG_X = 10;
export const BIGWIN_SPIN_BIG = 2;
/** 초대박 — win ≥ 베팅×MEGA_X 면 spinBet×MEGA 스핀. */
export const BIGWIN_SPIN_MEGA_X = 50;
export const BIGWIN_SPIN_MEGA = 5;
/** 하루 1회 로그인 지급량(일일 보충). */
export const DAILY_SPINS = 300;

/**
 * ⭐레이드/어텍 스테이크 배수(요청 2026-06-30) — 룰렛 스테이크 = betCoin × M(L) × **RAID_STAKE_SCALE**.
 *   레이드/어텍 보상을 슬롯보다 크게(레이드는 향후 **타유저 공격** 구조 → 이벤트성 큰 보상). 슬롯은 SLOT_RTP_SCALE↓.
 *   순수 배수 스케일(플랫 절대값 아님 = 인플레 안전, 베팅·레벨 비례 유지).
 */
export const RAID_STAKE_SCALE = 1.3;

/**
 * 특수젬(스핀·공격·약탈 공통) 매치 크기별 보상 배수 — 베팅에 추가로 곱한다.
 *   3=×8·4=×15·5=×30·6+=×150(특수젬 cap 8 보정 반영). 공격/약탈 ≥2 발동 임계는 onCollectSpecials.
 */
export function specialMatchMult(count: number): number {
  if (count >= 6) return 150;
  if (count === 5) return 30;
  if (count === 4) return 15;
  if (count >= 3) return 8;
  return Math.max(1, count) * 2; // 1~2(부분 수집, 드묾)도 보정(소량)
}

/** 미션 플랜 한 칸 — target(수집 목표 = 젬수×베팅) + 분(제한시간) + 보상(스핀↔코인 교대). */
export interface MissionEntry {
  readonly target: number;
  readonly minutes: number;
  readonly reward: GaugeReward;
}

/**
 * 미션 플랜(루프) — **2분 타임어택 스프린트**(요청 2026-06-30). 6칸 모두: ① 제한시간 **2분**(강한 시간 압박. ⭐어텍/레이드에 쓴 시간은 제외 — returnFromStage 가 마감을 그만큼 뒤로 민다).
 *   ② 보상 **스핀만**. ③ **베팅10에서 "간신히 달성"** 수준으로 calibrate(요청). ④ 미달성 시 **보상 소멸 + 진행 리셋**(같은 미션 재도전).
 *
 * ⭐목표 calibrate(실측): 진행 = **수집젬수 × 베팅**. 수집젬은 5종 중 1종이라 ~0.3개/라운드 → **베팅10에서 ≈3.2 진행/라운드**.
 *   2분 ≈ 35~40라운드 + 초기 200스핀÷베팅10=20라운드(스핀 환급으로 연장) → **베팅10 2분 예산 ≈ 110~130 진행**. 후반 목표(108·120)를 그 근방에 둬 "간신히".
 *   첫 미션(50)은 베팅10에서 ~16라운드면 달성(루프 습관), 뒤로 갈수록 예산 한계에 근접(간신히 → 못하면 놓침). 시티레벨 스케일(progression.missionTarget)이 후반 추가 보정.
 *   값/보상은 설정→데이터편집(rewardEditor)로 라이브 튜닝 가능(분은 SSOT 고정).
 */
export const MISSION_PLAN: ReadonlyArray<MissionEntry> = [
  { target: 50, minutes: 2, reward: { kind: 'spins', amount: 40 } },   // 첫 미션 — 베팅10에서 ~16라운드면 달성(루프 습관)
  { target: 65, minutes: 2, reward: { kind: 'spins', amount: 50 } },
  { target: 80, minutes: 2, reward: { kind: 'spins', amount: 65 } },
  { target: 95, minutes: 2, reward: { kind: 'spins', amount: 80 } },   // 베팅10 예산 근접 — 간신히
  { target: 108, minutes: 2, reward: { kind: 'spins', amount: 100 } },
  { target: 120, minutes: 2, reward: { kind: 'spins', amount: 130 } }, // 최고 난이도 — 베팅10 2분 풀예산(간신히, 못하면 놓침)
];
