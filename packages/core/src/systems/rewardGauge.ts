/**
 * rewardGauge.ts — **단계별 보상 게이지(EARN SPINS류 타임드 이벤트)** 의 순수 로직 = 공용 **기본 시스템**.
 *
 * 프레임워크 무관(Phaser/DOM 의존 없음)·불변(immutable)·완전 결정론 → 모든 게임이 `@casual/core` 에서 재사용.
 * 개념: 플레이로 **진행도(progress, 예: 퍼즐젬 수)** 를 쌓아 **목표(target)** 로 채운다. 도중의 **중간단계 보상(milestones)**
 *   과 **최종 보상(finalReward)** 을 임계에 도달하면 지급한다. **제한시간(durationMs)** 이 지나면 사이클을 리셋한다.
 *
 * 보상 인덱스 규약: `0..milestones.length-1` = 중간단계, `milestones.length` = 최종(=목표 100%).
 *   뷰/지급 로직은 인덱스로 다룬다(`rewardAt`/`thresholdFor`/`dueRewards`).
 *
 * I/O(localStorage 등)·표시는 게임이 담당 — 이 모듈은 **상태 전이/판정/직렬화** 만.
 */

/** 보상 1건 — 종류(게임이 지급에 매핑: 'spins'|'coins'|… )와 수량. */
export interface GaugeReward {
  readonly kind: string;
  readonly amount: number;
}

/** 중간단계 보상 — 목표 대비 비율(0<atRatio<1) 위치에서 지급. */
export interface GaugeMilestone {
  readonly atRatio: number;
  readonly reward: GaugeReward;
}

/** 게이지 구성(게임별 튜닝값) — 불변. */
export interface RewardGaugeConfig {
  readonly target: number; // 목표 진행도(예: 퍼즐젬 2000)
  readonly durationMs: number; // 제한시간(이벤트 1사이클 길이)
  readonly milestones: ReadonlyArray<GaugeMilestone>; // 중간단계 보상(atRatio 오름차순 권장)
  readonly finalReward: GaugeReward; // 최종 보상(목표 100% 도달)
}

/** 게이지 진행 상태 — 영속 대상(직렬화). */
export interface RewardGaugeState {
  readonly progress: number; // 누적 진행도
  readonly startedAtMs: number; // 현 사이클 시작 시각(epoch ms)
  readonly claimed: ReadonlyArray<number>; // 이미 지급한 보상 인덱스
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 새 사이클 상태(진행 0, 지금 시작, 미지급). */
export function createGaugeState(nowMs: number): RewardGaugeState {
  return { progress: 0, startedAtMs: nowMs, claimed: [] };
}

/** 진행도 가산(불변) — 양수만 반영. */
export function addProgress(state: RewardGaugeState, delta: number): RewardGaugeState {
  if (!(delta > 0)) return state;
  return { ...state, progress: state.progress + delta };
}

/** 보상 총 개수(중간단계 + 최종). */
export function rewardCount(config: RewardGaugeConfig): number {
  return config.milestones.length + 1;
}

/** 보상 인덱스 → 보상 정의(마지막 인덱스 = 최종). */
export function rewardAt(config: RewardGaugeConfig, index: number): GaugeReward {
  return index < config.milestones.length ? config.milestones[index].reward : config.finalReward;
}

/** 보상 인덱스 → 도달 임계 진행도(중간단계 = atRatio×target, 최종 = target). */
export function thresholdFor(config: RewardGaugeConfig, index: number): number {
  const ratio = index < config.milestones.length ? clamp01(config.milestones[index].atRatio) : 1;
  return Math.round(ratio * config.target);
}

/** 채움 비율(0..1, target 기준 clamp). 뷰의 바 높이에 사용. */
export function fillRatio(config: RewardGaugeConfig, state: RewardGaugeState): number {
  return config.target > 0 ? clamp01(state.progress / config.target) : 0;
}

/** **도달했지만 아직 미지급**인 보상 인덱스(오름차순). 게임은 이걸 지급하고 `claim` 으로 표시. */
export function dueRewards(config: RewardGaugeConfig, state: RewardGaugeState): number[] {
  const due: number[] = [];
  const n = rewardCount(config);
  for (let i = 0; i < n; i++) {
    if (state.claimed.includes(i)) continue;
    if (state.progress >= thresholdFor(config, i)) due.push(i);
  }
  return due;
}

/** 보상 인덱스들을 지급 완료로 표시(불변, 중복 제거·정렬). */
export function claim(state: RewardGaugeState, indices: ReadonlyArray<number>): RewardGaugeState {
  if (!indices.length) return state;
  const set = new Set(state.claimed);
  for (const i of indices) set.add(i);
  return { ...state, claimed: [...set].sort((a, b) => a - b) };
}

/** 남은 제한시간(ms, ≥0). */
export function remainingMs(config: RewardGaugeConfig, state: RewardGaugeState, nowMs: number): number {
  return Math.max(0, state.startedAtMs + config.durationMs - nowMs);
}

/** 제한시간 만료 여부. */
export function isExpired(config: RewardGaugeConfig, state: RewardGaugeState, nowMs: number): boolean {
  return nowMs >= state.startedAtMs + config.durationMs;
}

/** 직렬화(영속 저장용). */
export function serializeGauge(state: RewardGaugeState): string {
  return JSON.stringify({ progress: state.progress, startedAtMs: state.startedAtMs, claimed: state.claimed });
}

/** 역직렬화 — 형식 불일치/파싱 실패 시 null(게임은 새 사이클 생성). */
export function deserializeGauge(json: string | null | undefined): RewardGaugeState | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<RewardGaugeState>;
    if (o && typeof o.progress === 'number' && typeof o.startedAtMs === 'number' && Array.isArray(o.claimed)) {
      return {
        progress: Math.max(0, o.progress),
        startedAtMs: o.startedAtMs,
        claimed: o.claimed.filter((x): x is number => typeof x === 'number'),
      };
    }
  } catch {
    /* 손상 데이터 → null */
  }
  return null;
}

/** 타이머 표시용 H:MM:SS 포맷. */
export function formatGaugeTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}
