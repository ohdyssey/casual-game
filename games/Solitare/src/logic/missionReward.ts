/**
 * missionReward.ts — **연속 플레이 미션 리워드**(순수, Phaser-free). 참고: 경쟁작 "Catch the Thief" 벤치마크(2026-07-18).
 *
 * 한 판에서 **별 3개 이상**을 획득하면 그 별 개수만큼 아이템을 모아 진행 바를 채우고,
 * 목표(goal)에 도달하면 아이템 박스(리워드)를 지급하고 **다음 티어**가 자동으로 이어진다.
 * 티어에는 **제한시간**(durationMs)이 있고, 만료 전에 목표를 못 채우면 같은 티어가 진행도 0으로 리셋된다.
 * PO 확정(2026-07-18): 타이머=만료 시 리셋, 보상=티어별로 별도 설정하는 "아이템 박스".
 */

/** 티어 완료 시 지급되는 아이템 박스 내용물 — 코인/다이아/부스터/컬렉션카드/보물상자를 조합 지정(전부 선택 필드). */
export interface MissionRewardBox {
  coins?: number;
  diamonds?: number;
  boosters?: Partial<{ wild: number; plus5: number; undo: number }>;
  /** 컬렉션 카드(신설 예정 시스템) 지급 장수. */
  collectionCards?: number;
  /** 보물상자(복합 보상 — 코인+다이아+카드 등을 한 번에, PO 2026-07-19) 지급 개수. */
  giftBoxes?: number;
}

/** 티어별 설정 — 목표 개수·제한시간·완료 보상. */
export interface MissionTierConfig {
  tier: number; // 1-base.
  goal: number;
  durationMs: number;
  reward: MissionRewardBox;
}

/** 저장되는 진행 상태 — save.ts SaveData.missionReward 에 그대로 보관. */
export interface MissionRewardState {
  tier: number;
  progress: number;
  /** 이 티어가 시작된(또는 마지막으로 리셋된) 시각(epoch ms) + durationMs = 만료 시각. */
  expiresAt: number;
}

/**
 * **6티어 사다리**(2026-07-19 설계 — 경쟁작 Coin Master "빌리지 상자"·Monopoly Go "스티커 러시" 벤치마크:
 *   초반은 싸고 빠르게, 후반으로 갈수록 목표·시간이 늘고 보상이 코인→다이아→컬렉션카드→보물상자 순으로
 *   다양해지는 전형적 "에스컬레이팅 체스트 체인"). 티어1은 참고 이미지(15/35)·확정 보상 그대로 유지.
 *   티어7+ 는 마지막 티어 기준 목표만 완만히 증가시켜 폴백(체인이 끊기지 않게) — 실제 시즌/순환 설계가
 *   나오면 이 배열에 추가만 하면 된다.
 */
export const MISSION_TIERS: readonly MissionTierConfig[] = [
  { tier: 1, goal: 35, durationMs: 15 * 60 * 1000, reward: { coins: 3000, diamonds: 10 } },
  { tier: 2, goal: 50, durationMs: 15 * 60 * 1000, reward: { coins: 4500, diamonds: 14 } },
  { tier: 3, goal: 70, durationMs: 20 * 60 * 1000, reward: { coins: 6500, diamonds: 18, collectionCards: 1 } },
  { tier: 4, goal: 95, durationMs: 20 * 60 * 1000, reward: { coins: 9000, diamonds: 24, collectionCards: 1 } },
  { tier: 5, goal: 130, durationMs: 25 * 60 * 1000, reward: { coins: 12500, diamonds: 32, giftBoxes: 1 } },
  { tier: 6, goal: 170, durationMs: 25 * 60 * 1000, reward: { coins: 17000, diamonds: 42, giftBoxes: 1 } },
];

/** 정의된 티어 설정(없으면 마지막 티어 기준 목표만 완만히 증가시켜 폴백, 보상은 마지막 티어 유지). */
export function tierConfig(tier: number): MissionTierConfig {
  const found = MISSION_TIERS.find((t) => t.tier === tier);
  if (found) return found;
  const last = MISSION_TIERS[MISSION_TIERS.length - 1];
  const steps = Math.max(0, tier - last.tier);
  return { ...last, tier, goal: last.goal + steps * 40 };
}

/** 정의된 티어(1~6) 전체의 평균 보상 — 경제 모델이 "레벨당 미션리워드 다이아"를 추정할 때 참고 기준점. */
export function averageMissionReward(): { coins: number; diamonds: number; goal: number; durationMin: number } {
  const n = MISSION_TIERS.length;
  const sum = MISSION_TIERS.reduce(
    (a, t) => ({
      coins: a.coins + (t.reward.coins ?? 0),
      diamonds: a.diamonds + (t.reward.diamonds ?? 0),
      goal: a.goal + t.goal,
      durationMin: a.durationMin + t.durationMs / 60000,
    }),
    { coins: 0, diamonds: 0, goal: 0, durationMin: 0 },
  );
  return { coins: sum.coins / n, diamonds: sum.diamonds / n, goal: sum.goal / n, durationMin: sum.durationMin / n };
}

/** 새 티어 시작 — 진행도 0, 그 티어 제한시간만큼의 만료 시각. */
export function freshMissionState(tier: number, now: number): MissionRewardState {
  return { tier, progress: 0, expiresAt: now + tierConfig(tier).durationMs };
}

/**
 * 만료 체크 — 지났으면 **같은 티어**로 리셋(진행도 0 + 새 타이머). 안 지났으면 그대로.
 *
 * ⚠️ 2026-07-27 에 "실패하면 다음 티어로" 로 바꿨다가 **되돌렸다** — PO 가 말한 "실패하면 바뀌어야 하는
 *   미션"은 이 상단 티어 배너(CATCH THE THIEF)가 아니라 **우측 MISSIONS 패널의 5콤보 미션**이었다
 *   (PlayScene.rerollMissionOnFail). 여기서 티어를 올리면 티어7+ 폴백이 목표를 +40 씩 계속 키워
 *   계속 실패하는 플레이어의 목표가 도달 불가로 발산한다.
 */
export function withExpiryChecked(state: MissionRewardState, now: number): MissionRewardState {
  return now >= state.expiresAt ? freshMissionState(state.tier, now) : state;
}

export interface ApplyStarsResult {
  state: MissionRewardState;
  /** 이번 반영으로 티어가 완료됐는지(다음 티어로 넘어갔는지). */
  completed: boolean;
  /** completed=true 일 때만 — 지급할 아이템 박스. */
  reward?: MissionRewardBox;
}

/**
 * 아이템 count 개를 **무조건**(게이트 없이) 진행에 더한다 — 게이트(별 3개 이상)는 호출부 책임.
 *   플레이 중 **실시간**(별 게이지가 3번째 별을 켜는 순간부터 1개씩) 반영에 사용(count<=0 은 무반응).
 *   만료된 상태면 먼저 리셋한 뒤 반영. 목표 도달 시 다음 티어로 즉시 롤오버.
 */
export function addItems(state: MissionRewardState, count: number, now: number): ApplyStarsResult {
  const checked = withExpiryChecked(state, now);
  if (count <= 0) return { state: checked, completed: false };
  const cfg = tierConfig(checked.tier);
  const progress = Math.min(cfg.goal, checked.progress + count);
  if (progress >= cfg.goal) {
    return { state: freshMissionState(checked.tier + 1, now), completed: true, reward: cfg.reward };
  }
  return { state: { ...checked, progress }, completed: false };
}

/**
 * 레벨 승리 결과(별 등급)를 미션 진행에 한 번에 반영한다. **별 3개 미만은 무반응**(진행 없음).
 *   ⚠️ 실시간 반영(플레이 중 별이 켜질 때마다)을 쓰는 화면은 이 함수 대신 addItems 로 델타만 넘길 것 —
 *      아니면 finishMission 에서 다시 전체를 더해 이중 지급된다.
 */
export function applyStars(state: MissionRewardState, stars: number, now: number): ApplyStarsResult {
  if (stars < 3) return { state: withExpiryChecked(state, now), completed: false };
  return addItems(state, stars, now);
}

/** 남은 시간(ms, 0 미만 없음) — 배너 타이머 표시용. */
export function remainingMs(state: MissionRewardState, now: number): number {
  return Math.max(0, state.expiresAt - now);
}

/**
 * 카운트다운 텍스트(PO 2026-07-18) — **1시간 이상**이면 "12H 30M"(시+분, 초 생략),
 *   **1시간 미만**이면 "11M 49S"(분+초) 형식. 단위 사이는 띄어쓰기.
 */
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  if (h > 0) {
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}H ${m.toString().padStart(2, '0')}M`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}M ${s.toString().padStart(2, '0')}S`;
}
