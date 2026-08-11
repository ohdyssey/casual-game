/**
 * 패배 기억(loss book) — "같은 승리 루틴에 두 번 당하지 않기" 위한 순수 로직.
 *
 * 진 판에서 AI 가 뒀던 응수를 (국면 → 응수) 로 적어 두고, 다음에 같은 국면이 나오면
 * 그 응수를 피한다. 국면 키에는 **말의 나이 순서까지** 들어가므로, 겉보기가 같아도
 * 이동 순번이 다르면 다른 국면으로 본다(이 룰에선 순번이 곧 다음에 움직일 말이다).
 *
 * ⚠️ 과거 두 번의 사고를 기억할 것:
 *  1) 판 전체를 기억했더니 **정상 차단 수까지 금지**되어 AI 가 3수 만에 지는 버그가 났다.
 *     → 지금은 `chooseMove` 가 "대안이 전부 강제 패배면 금지를 무시" 하므로 필수 차단은 보전된다.
 *  2) 반대로 마지막 2수만 기억했더니 **루틴 앞부분이 매번 그대로 재현**되어, 같은 수순으로
 *     계속 이길 수 있었다(2026-08-04 유저 제보). → 이제 그 판의 응수를 전부 기억한다.
 */
import type { GameState } from './board.js';

/** 국면 키 → 그 국면에서 뒀다가 진 응수들. */
export type LossBook = Record<string, number[]>;

/** AI 가 실제로 둔 기록 한 수(국면 키 + 응수). */
export interface AiMoveLog {
  readonly key: string;
  readonly cell: number;
}

/** 기억할 최대 국면 수 — 넘치면 통째로 비운다(무한 증식 방지). */
export const LOSSBOOK_CAP = 400;

/** 국면 키 — 말 배열(나이 순서 포함)과 턴이 같으면 같은 국면. */
export function posKey(state: GameState): string {
  return `${state.pieces.O.join('')}.${state.pieces.X.join('')}.${state.turn}`;
}

/** 이 국면에서 피해야 할 응수들(없으면 빈 배열). */
export function bannedAt(book: LossBook, state: GameState): readonly number[] {
  return book[posKey(state)] ?? [];
}

/**
 * 진 판의 응수들을 기억한 **새 책**을 돌려준다(원본은 건드리지 않는다).
 * 같은 국면에 같은 수가 이미 있으면 중복 저장하지 않는다.
 */
export function rememberLoss(book: LossBook, log: readonly AiMoveLog[]): LossBook {
  if (log.length === 0) return book;
  const next: LossBook = Object.keys(book).length > LOSSBOOK_CAP ? {} : { ...book };
  for (const { key, cell } of log) {
    const prev = next[key] ?? [];
    if (!prev.includes(cell)) next[key] = [...prev, cell];
  }
  return next;
}

/**
 * 이 판을 기억해야 하는가 — **사람이 이긴 싱글 판이면 승리 방식과 무관하게** 기억한다.
 * ⚠️ 예전엔 승리 방식으로 걸러서(3목만 기억) **다른 방식으로 이긴 수순은 영원히 재사용**
 * 할 수 있었다(2026-08-05 유저 제보). 승리 방식으로 거르지 말 것.
 */
export function shouldRemember(opts: {
  humanWon: boolean;
  isStudy: boolean;
  log: readonly AiMoveLog[];
}): boolean {
  return opts.humanWon && !opts.isStudy && opts.log.length > 0;
}
