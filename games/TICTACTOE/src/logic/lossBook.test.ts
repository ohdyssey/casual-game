import { describe, expect, it } from 'vitest';
import { applyAction, cellOwner, createGame, type GameState } from './board.js';
import { chooseMove } from './ai.js';
import { aiLevelAt } from './aiLevels.js';
import {
  type AiMoveLog,
  type LossBook,
  bannedAt,
  posKey,
  rememberLoss,
  shouldRemember,
} from './lossBook.js';

function rngFrom(seed: number): () => number {
  let st = seed;
  return () => {
    st = (st * 1103515245 + 12345) % 2147483648;
    return st / 2147483648;
  };
}

/**
 * 사람이 **똑같은 수순**을 그대로 두는 한 판. PlayScene 의 싱글 흐름을 그대로 흉내낸다
 * (등급 강도 + 패배 기억 조회 → 진 판이면 그 판의 응수를 전부 기억).
 */
function replayRoutine(
  routine: readonly number[],
  level: number,
  book: LossBook,
  seed: number,
): { replies: number[]; humanWon: boolean; book: LossBook } {
  const lv = aiLevelAt(level);
  const rng = rngFrom(seed);
  const log: AiMoveLog[] = [];
  const replies: number[] = [];
  let s: GameState = createGame('O');

  for (const cell of routine) {
    if (s.winner) break;
    // 사람 수 — 수순대로. 이미 막힌 칸이면 루틴이 재현되지 않은 것이니 거기서 끝.
    if (cellOwner(s, cell) !== null) break;
    s = applyAction(s, cell);
    if (s.winner) break;
    // AI 응수
    const key = posKey(s);
    const reply = chooseMove(s, {
      depth: lv.depth,
      tolerance: lv.tolerance,
      banned: bannedAt(book, s),
      random: rng,
    });
    log.push({ key, cell: reply });
    replies.push(reply);
    s = applyAction(s, reply);
  }

  const humanWon = s.winner === 'O';
  return { replies, humanWon, book: humanWon ? rememberLoss(book, log) : book };
}

describe('패배 기억 — 같은 승리 루틴을 반복할 수 없다', () => {
  it('국면 키는 말의 나이 순서까지 구분한다', () => {
    const a = applyAction(applyAction(createGame('O'), 0), 4); // O:0 / X:4
    const b = applyAction(applyAction(createGame('O'), 4), 0); // O:4 / X:0
    expect(posKey(a)).not.toBe(posKey(b));
  });

  it('진 판의 응수를 전부 기억한다(마지막 2수만이 아니라)', () => {
    const log: AiMoveLog[] = [
      { key: 'a', cell: 1 },
      { key: 'b', cell: 2 },
      { key: 'c', cell: 3 },
    ];
    const book = rememberLoss({}, log);
    expect(Object.keys(book).sort()).toEqual(['a', 'b', 'c']);
    // 같은 국면에서 다른 수로 또 지면 둘 다 쌓인다.
    const book2 = rememberLoss(book, [{ key: 'a', cell: 5 }]);
    expect(book2.a.sort()).toEqual([1, 5]);
    // 같은 수는 중복 저장하지 않는다.
    expect(rememberLoss(book2, [{ key: 'a', cell: 5 }]).a).toHaveLength(2);
  });

  it('원본 책을 변형하지 않는다(불변)', () => {
    const book: LossBook = { a: [1] };
    const next = rememberLoss(book, [{ key: 'a', cell: 2 }]);
    expect(book.a).toEqual([1]);
    expect(next.a).toEqual([1, 2]);
  });

  /**
   * 이 등급을 실제로 이기는 "승리 루틴"을 하나 만든다 — 사람 역할은 깊게 읽는 탐색.
   * 돌려주는 것은 사람이 둔 셀 순서(= 플레이어가 외워서 반복할 수 있는 수순).
   */
  function findWinningRoutine(level: number, seed: number): number[] | null {
    const lv = aiLevelAt(level);
    // ⚠️ 난수 스트림을 역할별로 분리한다 — AI 쪽 스트림이 replayRoutine 과 같아야
    //    "같은 수순 → 같은 응수"가 재현된다(섞어 쓰면 1회차부터 딴 판이 된다).
    const rngHuman = rngFrom(seed + 777);
    const rngAi = rngFrom(seed);
    let s: GameState = createGame('O');
    const routine: number[] = [];
    for (let ply = 0; ply < 100 && !s.winner; ply++) {
      if (s.turn === 'O') {
        // 사람 역할은 상대보다 깊게 읽는다 — 최고 등급도 뚫는 루틴이 나와야 한다.
        const cell = chooseMove(s, { depth: 12, random: rngHuman });
        routine.push(cell);
        s = applyAction(s, cell);
      } else {
        s = applyAction(s, chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, random: rngAi }));
      }
    }
    return s.winner === 'O' ? routine : null;
  }

  it.each([1, 5, 10])(
    'Lv.%i — 이겼던 수순을 그대로 반복하면 AI 가 응수를 바꾼다',
    (level) => {
      let routine: number[] | null = null;
      let seed = 1;
      for (let s = 1; s <= 20 && !routine; s++) {
        routine = findWinningRoutine(level, s);
        seed = s; // 루틴을 만든 그 시드로 재현해야 한다(다음 시드가 아니라)
      }
      expect(routine, `Lv.${level} 을 이기는 루틴을 찾지 못함`).not.toBeNull();
      if (!routine) return;

      // 1회차 — 기억 없이. 그 루틴이 실제로 통해야 한다.
      const first = replayRoutine(routine, level, {}, seed);
      expect(first.humanWon).toBe(true);
      expect(Object.keys(first.book).length).toBeGreaterThan(0); // 판 전체가 기억됐다

      // 2회차 — 같은 수순, 같은 난수. 기억이 붙었으니 응수가 달라져야 한다.
      const again = replayRoutine(routine, level, first.book, seed);
      expect(again.replies).not.toEqual(first.replies);
    },
  );

  it('승리 방식으로 거르지 않는다 — 버티기·시간초과 승리도 기억한다', () => {
    const log: AiMoveLog[] = [{ key: 'a', cell: 1 }];
    // 3목이든 버티기든 시간초과든, 사람이 이긴 싱글 판이면 전부 기억 대상이다.
    expect(shouldRemember({ humanWon: true, isStudy: false, log })).toBe(true);
    // 진 판·스터디 판·기록이 없는 판은 대상이 아니다.
    expect(shouldRemember({ humanWon: false, isStudy: false, log })).toBe(false);
    expect(shouldRemember({ humanWon: true, isStudy: true, log })).toBe(false);
    expect(shouldRemember({ humanWon: true, isStudy: false, log: [] })).toBe(false);
  });

  it('오프닝은 등급이 정확해도 매판 같은 수만 두지 않는다', () => {
    // 사람이 중앙(4)으로 시작한 국면 — 최고 등급(tolerance 0)이라도 첫 응수가 갈려야 한다.
    const s = applyAction(createGame('O'), 4);
    const lv = aiLevelAt(10);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      seen.add(chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, random: rngFrom(i) }));
    }
    expect(seen.size).toBeGreaterThan(1);
  }, 60000);

  it('필수 차단은 기억보다 우선한다(3수 패배 버그 회귀 방지)', () => {
    // O: 0,1 (2 가 즉승 칸) / X: 4 — 2 가 금지 목록에 있어도 막아야 한다.
    let s = createGame('O');
    for (const c of [0, 4, 1]) s = applyAction(s, c);
    expect(s.turn).toBe('X');
    for (const level of [1, 5, 10]) {
      const lv = aiLevelAt(level);
      expect(
        chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, banned: [2], random: rngFrom(3) }),
      ).toBe(2);
    }
  });
});
