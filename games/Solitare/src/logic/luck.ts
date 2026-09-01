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

/**
 * **진도 대비 뽑기 소모 구제(pace rescue)** — 뽑기를 쓴 비율이 보드를 치운 비율보다 앞서 있으면
 * (= 예정보다 뽑기를 많이 썼으면) 매칭 확률을 그만큼 끌어올린다.
 *
 * ## 왜 필요한가 — "뽑기가 많이 남는다"의 진짜 원인
 * 뽑기 장수는 tune-by-coin-cost.mts 가 **꼬리 조건**(p90 구매 ≤ 1회)에 맞춰 정한다. 그런데 판마다
 * 필요한 뽑기 수의 분산이 크면, 꼬리(운 나쁜 판)를 구제하려고 **모든 판에 뽑기를 얹어야** 한다 →
 * 중앙값 판은 그만큼 남기고 이긴다(실측 2026-08-21: 평균 잔여 3.35장 · 500 중 290레벨이 3장 초과,
 * 목표는 1~3장). 즉 잔여의 원인은 "뽑기를 너무 많이 준 것"이 아니라 **분산**이었다.
 *
 * 그래서 뽑기를 일괄로 깎는 대신(그러면 꼬리가 무너져 ＋5 구매가 폭증한다) **뒤처진 판만** 구제해
 * 분산을 줄인다 → 꼬리가 짧아지므로 튜너가 뽑기를 더 낮게 확정할 수 있고, 그 결과 중앙값의 잔여가
 * 줄어든다. 앞서가는 판(진도 ≥ 소모)에는 아무 보정도 없다 — 잘 풀리는 판을 더 떠먹이지 않는다.
 *
 * @param clearedFrac   치운 보드 비율 0~1
 * @param stockUsedFrac 사용한 뽑기 비율 0~1
 */
export const PACE_RESCUE_GAIN = 0.75;
/**
 * **튜닝 훅**(계측 스크립트 전용) — 구제 세기를 코드 수정 없이 스윕하기 위한 런타임 오버라이드.
 *   게임은 호출하지 않는다(기본값 = 위 상수). pace-sweep.mts 가 사용.
 */
const tuning = { paceGain: PACE_RESCUE_GAIN, endgameGain: 0.9 };
export function configureRescue(t: Partial<typeof tuning>): void {
  Object.assign(tuning, t);
}
export function paceBoost(clearedFrac: number, stockUsedFrac: number): number {
  const behind = stockUsedFrac - clearedFrac;
  return behind <= 0 ? 0 : Math.min(1, behind) * tuning.paceGain;
}

/** 매칭 확률에 구제 보정을 얹는다(상한은 feedProb 과 동일). */
export function withBoost(p: number, boost: number): number {
  return clamp(p + boost, FEED_MIN, FEED_MAX);
}

/**
 * **잔량 압박 구제(endgame pressure)** — 남은 뽑기 1장이 치워야 할 보드 카드 수(need)가 커지면
 * 매칭 확률을 끌어올린다. pace 구제(진도 대비 소모)는 종반에 둔감했다 — 보드를 80% 치웠는데 뽑기를
 * 90% 썼으면 "10%p 뒤처짐"으로 약하게만 보정되지만, 실제로는 남은 5장을 남은 2장으로 치워야 하는
 * 절박한 상황일 수 있다. 남은 양의 **비율**을 직접 보는 이 신호가 종반 꼬리를 짧게 만든다.
 *
 * 기준값(ENDGAME_FROM/FULL)은 **뽑기 장수 스윕 실측**으로 정했다(lv9·lv480, 각 지점 120판).
 * 1.6~2.6 은 너무 늦어 꼬리를 못 잡았고(잔여 3.6), 게이트 없이 0.6 부터 걸면 초반부터 "뽑는 족족
 * 맞는" 판이 됐다. 게이트(0.15~0.35) + 0.6~1.6 이 초반 리듬은 살리고 꼬리만 짧게 만드는 지점이다.
 */
export const ENDGAME_FROM = 0.5;   // need 가 이 값을 넘으면 구제 시작(실측 스윕으로 확정)
export const ENDGAME_FULL = 1.3;   // 이 값 이상이면 최대 구제
export const ENDGAME_GAIN = 0.9;
/**
 * 구제가 **언제부터** 걸리는가 — 초반부터 걸면 "뽑는 족족 맞는" 판이 되어(예전 PO 지적) 설계된
 * 초반 리듬이 무너진다. 보드를 GATE_FROM 만큼 치운 뒤부터 서서히 켜서 **종반에만** 작동시킨다.
 */
export const PRESSURE_GATE_FROM = 0.10;
export const PRESSURE_GATE_FULL = 0.30;

/**
 * **마지막 장은 정직하게**(PO 2026-08-30 "마지막 장에서 카드를 매칭하여 게임을 종료시키는 우연이 너무 많다").
 *
 * 잔량 압박 구제는 need(=남은 보드/남은 뽑기)가 클수록 세지는데, 뽑기가 **1장** 남으면 need 가 보드
 * 전체라 무조건 최대치가 걸렸다 → 마지막 장이 97% 로 맞고 연쇄 랭크까지 골라져 "마지막 장 기적"이
 * 판마다 일어났다(실측: 승리의 27% 가 잔여 0 으로 끝남). 뽑기가 LAST_HONEST_FROM 장 이하로 내려가면
 * 구제를 선형으로 접어 1장에서는 0 — 마지막 장은 보정 없는 확률로 뽑힌다(꼭 이길 필요는 없다).
 */
export const LAST_HONEST_FROM = 4; // 이 장수부터 구제가 줄기 시작, 1장에서 0.
export function lastCardsHonesty(stockLeft: number): number {
  return clamp((stockLeft - 1) / (LAST_HONEST_FROM - 1), 0, 1);
}

export function pressureBoost(boardLeft: number, stockLeft: number, clearedFrac = 1): number {
  if (boardLeft <= 0) return 0;
  const need = boardLeft / Math.max(1, stockLeft);
  const gate = clamp((clearedFrac - PRESSURE_GATE_FROM) / (PRESSURE_GATE_FULL - PRESSURE_GATE_FROM), 0, 1);
  return clamp((need - ENDGAME_FROM) / (ENDGAME_FULL - ENDGAME_FROM), 0, 1) * tuning.endgameGain * gate * lastCardsHonesty(stockLeft);
}
