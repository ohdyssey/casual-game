/**
 * pace.ts — 퍼즐 매치 페이스(속도) 추적 → 슬롯 회전·라운드 타이밍 적응.
 *
 * 요청: "유저가 퍼즐을 빠른 속도로 맞추면 슬롯도 그에 맞춰 빠르게 회전하며 따라온다."
 *
 * 두 신호를 0..1 강도(intensity)로 결합한다:
 *   ① **최근 매치 간 간격(EMA)** — 연속 매치가 빠를수록(간격이 짧을수록) ↑.
 *      유효간격 = max(EMA, now−lastMatch) 라 유저가 손을 멈추면 자연 감쇠(슬롯이 다시 느려짐).
 *   ② **대기 백로그 깊이** — 슬롯이 퍼즐에 뒤처진 정도(따라잡기). 큐가 깊을수록 ↑.
 *   intensity = max(①,②). 한 신호만 높아도 가속(매치가 막 빨라진 첫 순간엔 ②가, 정상 회전 중
 *   계속 빠르게 맞추면 ①이 주도).
 *
 * 이를 슬롯 1라운드 타이밍으로 매핑:
 *   - slotPace(0..1) → slotView.spin 의 회전/감속/안착 보간(0=풀연출, 1=터보)
 *   - roundGapMs / puzzleToSlotMs → 라운드 사이·퍼즐→슬롯 간격을 가속 시 단축
 *
 * 순수 함수(불변): 상태는 새 객체로 반환하고 시간은 인자(now)로 받는다 — Phaser/전역 시계 의존이
 *   없어 단위 테스트가 결정론적이다. (now 는 호출부에서 게임 클록 ms 를 넘긴다.)
 */

export interface PaceState {
  /** 마지막 매치 시각(ms, 게임 클록). 아직 매치 없으면 null. */
  readonly lastMatchAt: number | null;
  /** 최근 매치 간 간격의 EMA(ms). 매치가 1회뿐이면 아직 null. */
  readonly emaIntervalMs: number | null;
}

/** 이 간격 이하로 연속 매치하면 간격 신호 최대(intensity 1 기여). */
export const FAST_INTERVAL_MS = 350;
/** 이 간격 이상이면 여유 페이스(간격 신호 0 기여). */
export const SLOW_INTERVAL_MS = 1400;
/** 이 백로그 깊이에서 따라잡기 신호 최대(intensity 1 기여). */
export const BACKLOG_FULL = 3;
/** EMA 평활 계수(0..1, 클수록 최신 간격 비중↑). 0.5 = 직전 간격과 새 간격의 균형. */
const EMA_ALPHA = 0.5;

/** 라운드 간 텀(ms) — 여유(slow)↔질주(fast) 양 끝. slow=한 라운드 분리감, fast=거의 즉시 연결. */
export const ROUND_GAP_SLOW_MS = 220;
export const ROUND_GAP_FAST_MS = 40;
/** 퍼즐 결과 → 슬롯 회전 간격(ms) — 양 끝(가속 시 0 = 한 동작처럼 붙음). */
export const PUZZLE_TO_SLOT_SLOW_MS = 50;
export const PUZZLE_TO_SLOT_FAST_MS = 0;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** 빈 페이스 상태(매치 이력 없음). */
export function createPace(): PaceState {
  return { lastMatchAt: null, emaIntervalMs: null };
}

/**
 * 매치 1회 기록 → 새 상태(불변). now = 게임 클록 ms.
 *   첫 매치는 간격을 알 수 없어 EMA 는 null 로 둔다(= 아직 여유로 취급). 두 번째부터 간격이 잡힌다.
 */
export function recordMatch(state: PaceState, now: number): PaceState {
  if (state.lastMatchAt == null) {
    return { lastMatchAt: now, emaIntervalMs: null };
  }
  const interval = Math.max(0, now - state.lastMatchAt);
  const ema = state.emaIntervalMs == null ? interval : lerp(state.emaIntervalMs, interval, EMA_ALPHA);
  return { lastMatchAt: now, emaIntervalMs: ema };
}

/**
 * 현재 페이스 강도 0..1. now = 현재 게임 클록, backlog = 대기 중 매치 수(scoreQueue.length).
 *   - 간격 기여: 유효간격 = max(EMA, now−lastMatch)(손 멈추면 커져 감쇠) → SLOW..FAST 선형 역비례.
 *   - 백로그 기여: backlog / BACKLOG_FULL 선형.
 *   둘 중 큰 값(어느 신호든 가속을 끌어올린다).
 */
export function paceIntensity(state: PaceState, now: number, backlog: number): number {
  let fromInterval = 0;
  if (state.lastMatchAt != null) {
    const sinceLast = Math.max(0, now - state.lastMatchAt);
    // EMA 가 아직 없으면(매치 1회뿐) 간격을 모르므로 SLOW 로 간주(간격 신호 0). 백로그만 가속 가능.
    const eff = state.emaIntervalMs == null ? Math.max(sinceLast, SLOW_INTERVAL_MS) : Math.max(state.emaIntervalMs, sinceLast);
    fromInterval = clamp01((SLOW_INTERVAL_MS - eff) / (SLOW_INTERVAL_MS - FAST_INTERVAL_MS));
  }
  const fromBacklog = clamp01(Math.max(0, backlog) / BACKLOG_FULL);
  return clamp01(Math.max(fromInterval, fromBacklog));
}

export interface PaceTiming {
  /** slotView.spin 에 넘길 0..1 가속(0=정상 풀연출, 1=터보). */
  readonly slotPace: number;
  /** 라운드 간 텀(ms). */
  readonly roundGapMs: number;
  /** 퍼즐 결과 → 슬롯 회전 간격(ms). */
  readonly puzzleToSlotMs: number;
}

/** 강도(0..1) → 라운드 타이밍. 강도가 높을수록 슬롯이 빨라지고 라운드 사이 텀이 짧아진다. */
export function paceTiming(intensity: number): PaceTiming {
  const k = clamp01(intensity);
  return {
    slotPace: k,
    roundGapMs: Math.round(lerp(ROUND_GAP_SLOW_MS, ROUND_GAP_FAST_MS, k)),
    puzzleToSlotMs: Math.round(lerp(PUZZLE_TO_SLOT_SLOW_MS, PUZZLE_TO_SLOT_FAST_MS, k)),
  };
}
