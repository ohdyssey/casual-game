/**
 * 오프닝 변주 — **AI 의 첫 응수는 지난 판과 달라야 한다**(2026-08-05 유저 확정).
 *
 * 패배 기억(`lossBook`)만으로는 부족했다. 이 룰은 선공(사람)이 구조적으로 유리해서,
 * 고등급 AI 는 첫 수에서 "지지 않는 유일한 수"가 하나뿐인 국면이 자주 나온다. 그러면
 * 매판 같은 응수 → 사람이 외운 승리 수순이 그대로 재현된다.
 *
 * 그래서 첫 응수만은 **탐색 점수와 무관하게** 최근에 쓴 수를 피한다. 대신
 *  · 적용 대상은 **AI 의 첫 수 한 번뿐**(그 뒤로는 평소대로 최선을 둔다)
 *  · 최근 `KEEP` 개만 피한다 — 후보가 마르면 다시 처음 수부터 돌아간다
 *  · 피할 수를 빼면 둘 곳이 없을 때는 당연히 그대로 둔다(호출부 `avoid` 의 안전장치)
 * 오프닝은 아직 3목이 성립할 수 없는 국면이라, 이 변주가 즉각적인 손해로 이어지지 않는다.
 */
import type { GameState } from './board.js';
import { posKey } from './lossBook.js';

/** 오프닝 국면 키 → 최근에 쓴 첫 응수들(최신이 뒤). */
export type OpeningBook = Record<string, number[]>;

/** 국면당 기억할 최근 응수 개수 — 이만큼은 연속으로 반복하지 않는다. */
export const KEEP_RECENT = 3;
/** 기억할 최대 국면 수(오프닝만 다루므로 작아도 충분하다). */
export const OPENING_CAP = 64;

/** 이 국면에서 최근에 쓴 첫 응수들 — 이번엔 피할 수들. */
export function recentReplies(book: OpeningBook, state: GameState): readonly number[] {
  return book[posKey(state)] ?? [];
}

/**
 * 이번 판에서 쓴 첫 응수를 기억한 **새 책**을 돌려준다(원본 불변).
 * 같은 수가 이미 있으면 맨 뒤로 옮겨 "가장 최근"으로 만든다.
 */
export function rememberReply(book: OpeningBook, state: GameState, cell: number): OpeningBook {
  const key = posKey(state);
  const next: OpeningBook = Object.keys(book).length > OPENING_CAP ? {} : { ...book };
  const prev = (next[key] ?? []).filter((c) => c !== cell);
  next[key] = [...prev, cell].slice(-KEEP_RECENT);
  return next;
}
