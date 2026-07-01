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
 * ⭐**레이드 코인** 스테이크 배수(요청 2026-07-01 개정) — 레이드 룰렛 스테이크 = betCoin × M(L) × **RAID_STAKE_SCALE**.
 *   레이드 = **코인 보상**(어택은 스핀으로 분리 → ATTACK_SPIN_STAKE_SCALE). 어택이 코인 경쟁에서 빠지므로 레이드 코인을
 *   키워도 인플레 안전 → **1.3 → 2.5**(약 2배, 요청 "레이드 코인 더 많이"). 순수 배수 스케일(베팅·레벨 비례, 인플레 안전).
 */
export const RAID_STAKE_SCALE = 2.5;

/**
 * ⭐**어택 스핀** 스테이크 배수(요청 2026-07-01 신설) — 어택 룰렛 베이스(스핀) = **spinBet × ATTACK_SPIN_STAKE_SCALE**.
 *   어택 = **스핀 보상**(레이드는 코인). 같은 룰렛 휠 배수(x1~x150/SUPER)가 곱해져 당첨 스핀이 정해진다(통화만 분기).
 *   ⚠️코인과 달리 **COIN_DENOM·시티레벨(incomeMult) 미적용** — 스핀은 소단위 화폐(베팅 N, 보유 ~200)라 **베팅에만** 비례.
 *   기본 0.6: spinBet 10 → base 6 → 룰렛 평균배수 ~13.8 → 평균 ~83스핀/회(x100=600·SUPER=900, 희귀). 데이터편집 라이브 튜닝.
 */
export const ATTACK_SPIN_STAKE_SCALE = 0.6;

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
 * 미션 플랜(루프) — **목표 150부터 출발 + 시간 점진 연장**(요청 2026-06-30 재설계). ① 보상 **스핀만**. ② 미달성 시 **보상 소멸 + 진행 리셋**.
 *   ③ 어텍/레이드에 쓴 시간은 제외(returnFromStage 가 마감을 그만큼 뒤로 민다). ④ 시티레벨 스케일(progression.missionTarget)이 후반 추가 보정.
 *
 * ⭐**요청 지정 데이터 테이블**(2026-07-01) — 미션마다 목표 퍼즐수·제한시간(초)·스핀보상을 직접 지정(이전 "목표=초수·50~65%" 규칙 대체).
 *   minutes = 초/60 (durationMs = minutes×60000 = 지정 초). 진행 = 수집 타겟퍼즐수 × 베팅. ⚠️목표퍼즐 출현(스폰) 갯수는 **무수정**.
 *   값/보상/시간은 설정→데이터편집(rewardEditor)로 라이브 튜닝 가능. 시티레벨↑ 시 progression.missionTarget 가 목표를 추가 스케일.
 *   ⭐2026-07-01 #2: 목표 **×1.3 난이도 업** + 10단위 반올림(요청). 시간·보상 유지.
 *     미션  퍼즐   제한    보상
 *      1    130   60초    80
 *      2    160   80초   110
 *      3    200  110초   130
 *      4    230  130초   140
 *      5    260  140초   180
 *      6    330  180초   210
 */
export const MISSION_PLAN: ReadonlyArray<MissionEntry> = [
  { target: 130, minutes: 60 / 60, reward: { kind: 'spins', amount: 80 } },  // 60초
  { target: 160, minutes: 80 / 60, reward: { kind: 'spins', amount: 110 } }, // 80초
  { target: 200, minutes: 110 / 60, reward: { kind: 'spins', amount: 130 } }, // 110초
  { target: 230, minutes: 130 / 60, reward: { kind: 'spins', amount: 140 } }, // 130초
  { target: 260, minutes: 140 / 60, reward: { kind: 'spins', amount: 180 } }, // 140초
  { target: 330, minutes: 180 / 60, reward: { kind: 'spins', amount: 210 } }, // 180초
];
