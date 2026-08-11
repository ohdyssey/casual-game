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
/** 초기 스핀. playerState.DEFAULT_SPINS 와 동일해야 함.
 *  ⭐2026-07-07(2차): 500→**300** — **보상구조 재설계 시뮬레이션 기준**(요청: 초기 300스핀 지급 → 오토플레이 전량 소진
 *  시뮬로 지급 데이터 확보). 스핀보상은 "아슬아슬하게 통과" 목표 — 시뮬 데이터(econ/telemetry v2)로 재조정 예정. */
export const START_SPINS = 300;
/**
 * ⭐스핀 회수 배수 — **한 그룹에서 매칭된 스핀젬 수 s** 에 따른 회수 배수. 회수 = spinBet(N) × spinRefundMult(s).
 *   ⭐2026-07-06 #11 요청 지정 곡선: s<3 → 0 (2개 이하 회수 없음) · **3 → ×3 · 4 → ×6 · 5+ → ×12** (베팅 N배 기준).
 *   ※ 판정은 **그룹 단위**(onCollectSpecials/sim) — 서로 다른 그룹의 1~2개 스텝 합산 회수도 제거.
 */
export function spinRefundMult(count: number): number {
  if (count < 3) return 0; // 1~2개 = 회수 없음(실제 콤보만)
  if (count === 3) return 3; // 3매치 → ×3 (=3N)
  if (count === 4) return 6; // 4매치 → ×6 (=6N)
  return 12; // 5개 이상 → ×12 (=12N)
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
 *   ⭐2026-07-07 시뮬 베이스라인: 2.5→**4.0** — 요청 "레이드 = 상대 카지노를 털어오는 구조이므로 보상을 더 높게".
 *     슬롯 일반당첨(coinBase 12~120×)·업그레이드 비용 대비 레이드가 뚜렷한 코인 스파이크가 되도록. 시뮬 실측 후 재조정.
 */
export const RAID_STAKE_SCALE = 4.0;

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

/** 미션 플랜 한 칸 — target(수집 목표=젬수×베팅) + minutes(**보너스 창**) + reward(기본보상·시간무관) + timeBonus(시간내 완료 추가보상). */
export interface MissionEntry {
  readonly target: number;
  readonly minutes: number; // ⚠️2026-07-06 #5: 몰수 시간 아님 → **추가보상(timeBonus) 획득 제한시간**. 초과해도 기본보상은 목표 달성 시 지급.
  readonly reward: GaugeReward; // 기본 보상(시간 무관·목표 달성 시). = 순 스핀투입 대비 **약간의 손실**(0.78×target).
  readonly timeBonus: GaugeReward; // ⭐추가 보상 — **minutes 내 완료 시에만** 지급(타임어택). 기본+보너스면 약 이득.
}

/**
 * 미션 플랜(루프) — **목표 150부터 출발 + 시간 점진 연장**(요청 2026-06-30 재설계). ① 보상 **스핀만**. ② 미달성 시 **보상 소멸 + 진행 리셋**.
 *   ③ 어텍/레이드에 쓴 시간은 제외(returnFromStage 가 마감을 그만큼 뒤로 민다). ④ 시티레벨 스케일(progression.missionTarget)이 후반 추가 보정.
 *
 * ⭐**요청 지정 데이터 테이블**(2026-07-01) — 미션마다 목표 퍼즐수·제한시간(초)·스핀보상을 직접 지정(이전 "목표=초수·50~65%" 규칙 대체).
 *   minutes = 초/60 (durationMs = minutes×60000 = 지정 초). 진행 = 수집 타겟퍼즐수 × 베팅. ⚠️목표퍼즐 출현(스폰) 갯수는 **무수정**.
 *   값/보상/시간은 설정→데이터편집(rewardEditor)로 라이브 튜닝 가능. 시티레벨↑ 시 progression.missionTarget 가 목표를 추가 스케일.
 *   ⭐2026-07-01 #2: 목표 ×1.3 난이도 업 + 10단위 반올림. 시간·보상 유지.
 *   ⭐2026-07-06 #3 "**투입 스핀 ≈ 보상 스핀 균형**": econ 시뮬(7×7·라이브 스폰·스킬플레이·tier0) 실측 =
 *     완료 순(net) 스핀비용 ≈ **0.856 × target**(젬 환급 23.5% 반영) → **보상 = round10(0.856×target)**(완료 시 스핀 중립).
 *   구조(2026-07-06 #5): ① **기본보상(reward)** = 목표 달성 시 지급(**시간 무관·몰수 없음**). ② **추가보상(timeBonus)** =
 *     minutes(보너스 창) 내 완료 시에만(**타임어택**).
 *   ⭐#14(2026-07-06) "코인마스터식 곡선 + **3시간 사이클** 테스트(향후 일일 미션)": 풀루프 실측(_fullFlow, 7×7·
 *     specialOnMatch 레이드7:스핀3·환급3/6/12·슬롯어택 2.09/r·대박10× 6.45/r) = **수동 순소모 1.41스핀/라운드** ·
 *     **미션 순비용 ≈ 0.151×target** · 진행 9.3/라운드. 가정 라운드≈5초(오토) → 6미션 합 목표 20,000 ≈ **3시간 플레이**.
 *     곡선: 누적 스핀잔고가 **미션3까지 상승(정점) → 이후 하강(사이클 끝 약손실)** — 코인마스터식.
 *   ⭐#15 요청 "보상은 100부터 시작해 **상승**(후기 보상이 작으면 욕심이 발동하지 않음)": 보상 = **단조 증가**.
 *   ⭐#16 요청 "**보너스는 설계에서 제외**(달성 어려움 — 덤일 뿐)·목표는 **달성 난이도 기준**·직전 목표 과도": 곡선은
 *     **기본보상만**으로 성립(timeBonus 무관). 목표 = 미션당 ~3분(쉬움)→~25분(어려움) 달성가능 밴드로 하향(직전 최대
 *     7,700≈48분 폐기). 보상 상승폭을 완만(100→260)하게 잡아 낮은 목표에서도 후반 소모 곡선 유지.
 *     손익(기본만) = 보상 − 0.151×target: [+55, +49, +19, −27, −87, −163] → 누적 미션3 정점(+123)·사이클 끝 −153 약손실.
 *     사이클 합 목표 8,300 ≈ 75분 플레이(3시간 창 안에서 휴식 포함 자연 소화). 보너스창 ≈ 자연페이스의 70%(순수 덤).
 *     ⚠️라운드 5초 가정·계수 0.151 은 경제 변경 시 재실측(_fullFlow 패턴). 향후 일일(24h) 미션으로 확장 예정.
 *     미션  퍼즐    보너스창    기본보상  추가보상   순비용≈0.151T   손익     누적
 *      1    300    110초     100     20       45       +55     +55↗
 *      2    600    230초     140     30       91       +49    +104↗
 *      3   1000    380초     170     40      151       +19    +123⛰
 *      4   1500    560초     200     50      227       −27     +97↘
 *      5   2100    790초     230     60      317       −87     +10↘
 *      6   2800   1050초     260     70      423      −163    −153↘
 */
export const MISSION_PLAN: ReadonlyArray<MissionEntry> = [
  { target: 300, minutes: 110 / 60, reward: { kind: 'spins', amount: 100 }, timeBonus: { kind: 'spins', amount: 20 } },   // ~3분 미션
  { target: 600, minutes: 230 / 60, reward: { kind: 'spins', amount: 140 }, timeBonus: { kind: 'spins', amount: 30 } },   // ~5분
  { target: 1000, minutes: 380 / 60, reward: { kind: 'spins', amount: 170 }, timeBonus: { kind: 'spins', amount: 40 } },  // ~9분
  { target: 1500, minutes: 560 / 60, reward: { kind: 'spins', amount: 200 }, timeBonus: { kind: 'spins', amount: 50 } },  // ~13분
  { target: 2100, minutes: 790 / 60, reward: { kind: 'spins', amount: 230 }, timeBonus: { kind: 'spins', amount: 60 } },  // ~19분
  { target: 2800, minutes: 1050 / 60, reward: { kind: 'spins', amount: 260 }, timeBonus: { kind: 'spins', amount: 70 } }, // ~25분
];
