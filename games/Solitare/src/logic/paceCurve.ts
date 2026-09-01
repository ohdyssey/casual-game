/**
 * paceCurve.ts — **뽑기 결말의 톱니바퀴 리듬**(PO 2026-08-25: "딱 0장으로 떨어지게 하지 말고 모자라거나 0장이거나
 * 한두 장 남는 톱니바퀴로, 가끔 난이도 계곡을 만들어 결제를 유도").
 *
 * 레벨마다 **목표 승률(구매 없음)** 과 **장수 편향**(최소 장수에 더하거나 빼는 카드 수)을 정한다. 튜너
 * (scripts/tune-pace.mts)가 이 표대로 레벨별 뽑기 장수를 산출한다 — 여기가 단일 출처.
 *
 * | 국면 | 승률 | 편향 | 체감 |
 * |---|---|---|---|
 * | ample 넉넉 | 0.70 | +2 | 두세 장 남기고 이김 — 숨 고르기 |
 * | exact 딱   | 0.55 | 0  | 0장 근처에서 갈림 — 아슬아슬 |
 * | short 모자람| 0.45 | −2 | 두어 장 모자라 ＋5 가 "살 만한" 거리 |
 * | valley 계곡| 0.22 | −3 | ＋5 여러 번 기대 — 결제 유도(PO: 편차 +2~−3) |
 *
 * 주기 6(ample·exact·short·exact·ample·short) 위에 계곡을 **13레벨부터 9레벨마다** 얹는다(13·22·31…).
 * ⚠️ 10의 배수는 클론다이크 보너스 라운드라 계곡을 두지 않는다(9주기라 자연히 비켜가지만 명시 보장).
 * 1~10 은 튜토리얼 구간 — 1~2 는 85%(+1), 3~10 은 60%(0).
 */
export type PacePhase = 'ample' | 'exact' | 'short' | 'valley' | 'tutorial';

export interface PaceTarget {
  readonly phase: PacePhase;
  /** 목표 승률(구매 없음) — 이 값을 겨우 넘기는 최소 장수를 고른 뒤 bias 를 더한다. */
  readonly winRate: number;
  /** 최소 장수에 더하는 카드 수(음수 = 일부러 모자라게). */
  readonly bias: number;
}

export const PACE_PERIOD = 6;
export const VALLEY_FROM = 13;
export const VALLEY_EVERY = 9;
const CYCLE: readonly PacePhase[] = ['ample', 'exact', 'short', 'exact', 'ample', 'short'];
const TARGETS: Record<PacePhase, Omit<PaceTarget, 'phase'>> = {
  ample: { winRate: 0.7, bias: 2 },
  exact: { winRate: 0.55, bias: 0 },
  short: { winRate: 0.45, bias: -2 },
  valley: { winRate: 0.22, bias: -3 }, // PO 2026-08-25 2차 "편차 +2~−3 으로 더 크게" — 계곡은 가장 깊게(＋5 여러 번 기대).
  tutorial: { winRate: 0.6, bias: 0 },
};

export function isValleyLevel(level: number): boolean {
  return level >= VALLEY_FROM && (level - VALLEY_FROM) % VALLEY_EVERY === 0 && level % 10 !== 0;
}

export function paceTargetFor(level: number): PaceTarget {
  if (level <= 2) return { phase: 'tutorial', winRate: 0.85, bias: 2 };
  if (level <= 10) return { phase: 'tutorial', ...TARGETS.tutorial };
  if (isValleyLevel(level)) return { phase: 'valley', ...TARGETS.valley };
  const phase = CYCLE[(level - 11) % PACE_PERIOD];
  return { phase, ...TARGETS[phase] };
}
