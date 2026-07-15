/**
 * luck.ts — **적응형 난이도(동적 럭)** 순수 로직(Phaser-free).
 *
 * 예전 방식: 레벨마다 **고정된 딜**(보드+스톡 랭크)을 미리 정해 난이도를 박아넣음 → 조절이 어렵고 요동침.
 * 새 방식: 보드는 그대로 두되 **뽑기(스톡) 카드의 랭크를 뽑는 순간 동적으로 결정**한다.
 *   - feed(뽑기매칭 행운): 뽑은 카드가 노출 보드카드와 ±1 로 맞아 **바로 낼 수 있을** 확률.
 *   - chain(연속매칭 행운): 매칭을 줄 때 **여러 카드와 이어지는(연쇄) 랭크**를 고를 확률.
 * 두 확률의 기준값은 **초기 난이도 등급**이 정하고, **유저의 실제 플레이**(막힘=stuck / 원활=flow)에 따라
 *   실시간으로 오르내린다(러버밴딩). 어려움일수록 낮게 시작, 잘 풀리면 더 낮아지고, 막히면 구제한다.
 */

/** 난이도 등급 — 1=쉬움 · 2=보통 · 3=어려움. difficulty.ts 의 Grade 와 호환. */
export type Grade = 1 | 2 | 3;

/**
 * 적응 상태 — 초기 등급 + 최근 플레이 흐름 카운터.
 *   stuck: 연속 **비생산 드로우**(뽑아도 낼 수 없던 횟수) → 높을수록 행운 부스트(구제).
 *   flow:  연속 **원활 진행**(매칭 성공/생산 드로우) → 높을수록 행운 절감(도전).
 */
export interface LuckState {
  readonly grade: Grade;
  readonly stuck: number;
  readonly flow: number;
}

/**
 * 등급별 **뽑기매칭(feed) 기준 확률** — 쉬움 높음 · 어려움 낮음.
 *   뽑기 수를 30% 줄였으므로(사용자 요청) **적은 뽑기가 더 잘 맞도록** 기준을 넉넉히 잡는다
 *   (동적 딜의 핵심: 적지만 운 좋은 뽑기). 막히면 아래 STUCK_FEED 로 더 오른다.
 */
const FEED_BASE: Record<Grade, number> = { 1: 0.9, 2: 0.72, 3: 0.6 };
/** 등급별 **연쇄유도(chain) 기준 확률** — 매칭을 줄 때 연쇄 랭크를 고를 확률. */
const CHAIN_BASE: Record<Grade, number> = { 1: 0.82, 2: 0.62, 3: 0.5 };

/** 적응 민감도(튜닝 레버). */
const STUCK_FEED = 0.18; // 막힘 1스텝당 feed 상승(구제 강하게 — 적은 스톡 보완)
const FLOW_FEED = 0.05; // 원활 1스텝당 feed 하락
const STUCK_CHAIN = 0.12; // 막힘 1스텝당 chain 상승
const FLOW_CHAIN = 0.03; // 원활 1스텝당 chain 하락
const STREAK_CAP = 6; // 카운터 상한(과보정 방지)
/** 확률 하/상한 — 완전 0/1(무조건 막힘/구제)로 굳지 않게 여유. */
const FEED_MIN = 0.06;
const FEED_MAX = 0.97;
const CHAIN_MIN = 0.05;
const CHAIN_MAX = 0.95;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** 초기 럭 상태(레벨 시작). */
export function initLuck(grade: Grade): LuckState {
  return { grade, stuck: 0, flow: 0 };
}

/** 현재 뽑기매칭(feed) 확률 — 등급 기준 + 막힘 보정 − 원활 보정. */
export function feedProb(l: LuckState): number {
  return clamp(FEED_BASE[l.grade] + l.stuck * STUCK_FEED - l.flow * FLOW_FEED, FEED_MIN, FEED_MAX);
}

/** 현재 연쇄유도(chain) 확률 — 등급 기준 + 막힘 보정 − 원활 보정. */
export function chainProb(l: LuckState): number {
  return clamp(CHAIN_BASE[l.grade] + l.stuck * STUCK_CHAIN - l.flow * FLOW_CHAIN, CHAIN_MIN, CHAIN_MAX);
}

/** 드로우 직후 갱신 — 생산적(뽑아 바로 낼 수 있음)이면 flow↑·stuck 리셋, 아니면 stuck↑·flow 리셋. */
export function afterDraw(l: LuckState, productive: boolean): LuckState {
  return productive
    ? { ...l, flow: Math.min(STREAK_CAP, l.flow + 1), stuck: 0 }
    : { ...l, stuck: Math.min(STREAK_CAP, l.stuck + 1), flow: 0 };
}

/** 보드 매칭 플레이 직후 갱신 — 원활(flow↑), 막힘 카운터는 1 완화. */
export function afterPlay(l: LuckState): LuckState {
  return { ...l, flow: Math.min(STREAK_CAP, l.flow + 1), stuck: Math.max(0, l.stuck - 1) };
}
