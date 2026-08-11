/**
 * dailyChallenge.ts — **데일리 랭킹 챌린지**(순수, Phaser-free). 참고: 경쟁작 "Daily Competition Mission"
 *   벤치마크(2026-07-19) — 이미지 2. 하루 단위로 리셋되는 두 하위 시스템을 함께 묶는다:
 *
 *   ① **퍼포먼스 리워드**(단계형) — 그날 누적 스코어가 스테이지 목표를 넘을 때마다 그 스테이지 보상을
 *      즉시 지급(스테이지는 순차 누적 — 하위 스테이지를 건너뛰지 않음). 스테이지1=쉽고 작게, 스테이지가
 *      올라갈수록 목표·보상이 커진다.
 *   ② **그룹 랭킹**(경쟁형) — 같은 그룹(참고 이미지 소규모 그룹) 안에서 스코어 순위에 따라 차등 보상.
 *      1등이 가장 크고, 순위가 낮아질수록 완만히 줄어들다가 컷 밖은 보상 없음.
 *
 *   스코어 정의(경제 모델 가정, PO 2026-07-19 확정 전까지 임시): 판마다 별 등급을 점수로 환산해 누적
 *   (1★=500·2★=1200·3★=2500) — SCORE_PER_STAR 참고. 실제 스코어 산식이 정해지면 이 상수만 바꾸면 된다.
 */

/** 퍼포먼스/랭킹 보상 박스 — missionReward.ts 의 MissionRewardBox 와 동일 모양(공통 재화 표현 통일). */
export interface DailyRewardBox {
  coins?: number;
  diamonds?: number;
  giftBoxes?: number;
}

/** 별 등급 → 판당 점수 환산(경제 모델 가정치 — 실제 스코어 산식 확정 전 임시). */
export const SCORE_PER_STAR: readonly [number, number, number] = [500, 1200, 2500]; // 1★/2★/3★.

export interface PerformanceStage {
  stage: number; // 1-base.
  targetScore: number;
  reward: DailyRewardBox;
}

/**
 * **퍼포먼스 리워드 4단계**(참고 이미지 앵커: 목표 5,000 → 코인5,000+다이아20+보물상자1 = 스테이지2 그대로 채용).
 *   스테이지1은 온보딩용으로 더 쉽게, 3~4는 상위 유저용으로 목표·보상을 더 키운다.
 */
export const PERFORMANCE_STAGES: readonly PerformanceStage[] = [
  { stage: 1, targetScore: 2000, reward: { coins: 2500, diamonds: 8 } },
  { stage: 2, targetScore: 5000, reward: { coins: 5000, diamonds: 20, giftBoxes: 1 } }, // 참고 이미지 그대로.
  { stage: 3, targetScore: 10000, reward: { coins: 9000, diamonds: 35, giftBoxes: 1 } },
  { stage: 4, targetScore: 20000, reward: { coins: 16000, diamonds: 60, giftBoxes: 2 } },
];

export interface RankRewardBand {
  rankFrom: number;
  rankTo: number; // inclusive.
  reward: DailyRewardBox;
}

/**
 * **그룹 랭킹 보상**(그룹 규모 30명 가정 — GROUP_SIZE) — 1등 최대, 완만히 감소, 30위 밖은 보상 없음.
 *   실제 그룹 크기·컷은 매칭 시스템 설계 확정 전까지 가정치.
 */
export const GROUP_SIZE = 30;
export const RANK_REWARDS: readonly RankRewardBand[] = [
  { rankFrom: 1, rankTo: 1, reward: { coins: 15000, diamonds: 60, giftBoxes: 2 } },
  { rankFrom: 2, rankTo: 3, reward: { coins: 10000, diamonds: 40, giftBoxes: 1 } },
  { rankFrom: 4, rankTo: 6, reward: { coins: 6000, diamonds: 25 } },
  { rankFrom: 7, rankTo: 15, reward: { coins: 3000, diamonds: 10 } },
  { rankFrom: 16, rankTo: 30, reward: { coins: 1000 } },
];

/** 그 스코어로 도달한 **최고 스테이지**의 보상(스테이지는 순차 지급이 아니라 "그날 최고 달성분"을 반환 — 경제 모델 단순화). */
export function stageForScore(score: number): PerformanceStage | null {
  let best: PerformanceStage | null = null;
  for (const s of PERFORMANCE_STAGES) if (score >= s.targetScore) best = s;
  return best;
}

/** 순위 → 보상 밴드(컷 밖이면 null). */
export function rewardForRank(rank: number): RankRewardBand | null {
  return RANK_REWARDS.find((b) => rank >= b.rankFrom && rank <= b.rankTo) ?? null;
}

function addBox(a: DailyRewardBox, b: DailyRewardBox | undefined): DailyRewardBox {
  if (!b) return a;
  return { coins: (a.coins ?? 0) + (b.coins ?? 0), diamonds: (a.diamonds ?? 0) + (b.diamonds ?? 0), giftBoxes: (a.giftBoxes ?? 0) + (b.giftBoxes ?? 0) };
}

/**
 * **하루 기대 보상**(경제 모델용) — 가정 평균 달성 스코어의 퍼포먼스 보상 + 가정 평균 순위의 랭킹 보상 합산.
 *   두 입력 모두 econ-board.html 대시보드에서 조정 가능(assumedDailyScore/assumedAvgRank).
 */
export function expectedDailyReward(assumedDailyScore: number, assumedAvgRank: number): DailyRewardBox {
  const stage = stageForScore(assumedDailyScore);
  const rank = rewardForRank(Math.round(assumedAvgRank));
  return addBox(addBox({}, stage?.reward), rank?.reward);
}
