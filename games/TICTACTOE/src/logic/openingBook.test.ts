import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameState } from './board.js';
import { chooseMove } from './ai.js';
import { AI_LEVELS, aiLevelAt } from './aiLevels.js';
import { KEEP_RECENT, type OpeningBook, recentReplies, rememberReply } from './openingBook.js';

/** 사람이 `first` 로 시작한 직후 국면(= AI 의 첫 응수 차례). */
function afterOpening(first: number): GameState {
  return applyAction(createGame('O'), first);
}

/** 그 등급이 이 국면에서 두는 첫 응수(최근 응수는 하드 제외). */
function firstReply(state: GameState, level: number, book: OpeningBook): number {
  const lv = aiLevelAt(level);
  return chooseMove(state, {
    depth: lv.depth,
    tolerance: lv.tolerance,
    avoid: recentReplies(book, state),
    random: () => 0, // 무작위성을 죽여도 달라져야 한다 — 변주가 진짜인지 보려고
  });
}

describe('오프닝 변주 — AI 첫 응수는 지난 판과 달라야 한다', () => {
  it('최근 응수를 기억하고 최신이 뒤로 간다', () => {
    const s = afterOpening(4);
    let book: OpeningBook = {};
    book = rememberReply(book, s, 0);
    book = rememberReply(book, s, 2);
    expect(recentReplies(book, s)).toEqual([0, 2]);
    // 같은 수를 다시 쓰면 중복이 아니라 "가장 최근"으로 이동한다.
    book = rememberReply(book, s, 0);
    expect(recentReplies(book, s)).toEqual([2, 0]);
  });

  it(`기억은 최근 ${KEEP_RECENT}개까지만 — 후보가 마르면 다시 돌아간다`, () => {
    const s = afterOpening(4);
    let book: OpeningBook = {};
    for (const c of [0, 1, 2, 3, 5]) book = rememberReply(book, s, c);
    expect(recentReplies(book, s)).toHaveLength(KEEP_RECENT);
    expect(recentReplies(book, s)).toEqual([2, 3, 5]);
  });

  it('원본 책을 변형하지 않는다(불변)', () => {
    const s = afterOpening(4);
    const book: OpeningBook = {};
    rememberReply(book, s, 1);
    expect(book).toEqual({});
  });

  it.each(AI_LEVELS.map((l) => [l.level, l.name] as const))(
    'Lv.%i %s — 같은 오프닝을 세 판 연속 받아도 첫 응수가 매번 다르다',
    (level) => {
      for (const first of [0, 1, 4]) {
        const s = afterOpening(first);
        let book: OpeningBook = {};
        const used: number[] = [];
        for (let game = 0; game < 3; game++) {
          const cell = firstReply(s, level, book);
          expect(used, `Lv.${level} 첫수 ${first}: ${cell} 이 반복됨`).not.toContain(cell);
          used.push(cell);
          book = rememberReply(book, s, cell);
        }
      }
    },
  );

  it('피할 수를 빼면 둘 곳이 없을 때는 그대로 둔다(막히지 않는다)', () => {
    const s = afterOpening(4);
    const all = [0, 1, 2, 3, 5, 6, 7, 8];
    const cell = chooseMove(s, { depth: 2, avoid: all, random: () => 0 });
    expect(all).toContain(cell); // 전부 피하라고 해도 유효한 수를 낸다
  });
});
