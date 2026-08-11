import { describe, expect, it } from 'vitest';
import { applyAction, cellOwner, createGame, legalTargets, type GameState } from './board.js';
import { chooseMove, chooseStudyOpponentMove, makeStudyOpponent } from './ai.js';
import { STUDY_WIN_TURN, studyAdvice } from './hints.js';

function play(first: 'O' | 'X', cells: number[]): GameState {
  let s = createGame(first);
  for (const c of cells) s = applyAction(s, c);
  return s;
}

const fixedRandom = () => 0;

describe('chooseMove — 배치 페이즈', () => {
  it('즉시 이길 수 있으면 반드시 이긴다', () => {
    // X: 3,4 → 5 를 두면 승리. O: 0,8.
    const s = play('X', [3, 0, 4, 8]);
    expect(s.turn).toBe('X');
    const cell = chooseMove(s, { random: fixedRandom });
    const next = applyAction(s, cell);
    expect(next.winner).toBe('X');
  });

  it('상대의 즉승 라인을 차단한다', () => {
    // O: 0,1 (2 를 두면 승리) / X: 4. X 차례 — 2 를 막아야 한다.
    const s = play('O', [0, 4, 1]);
    expect(s.turn).toBe('X');
    expect(chooseMove(s, { random: fixedRandom })).toBe(2);
  });

  it('차단보다 즉승을 우선한다', () => {
    // X: 3,4 (5=즉승) / O: 0,1 (2=즉승). X 차례 → 수비(2)가 아니라 5 로 이겨야 한다.
    const s = play('X', [3, 0, 4, 1]);
    const cell = chooseMove(s, { random: fixedRandom });
    expect(cell).toBe(5);
  });
});

describe('chooseMove — 이동 페이즈', () => {
  it('가장 오래된 말 이동으로 즉승 라인을 완성한다', () => {
    // X: 5,0,4 (오래된 5 를 8 로 옮기면 0,4,8 대각 3목) / O: 1,2,3(3목 아님... 1,2 는 같은 라인,
    // 세 번째 O 는 7 로 두어 어느 라인도 완성 직전이 아니게 한다).
    const s = play('X', [5, 1, 0, 2, 4, 7]);
    // O: 1,2,7 — 즉승 없음(1,2 라인의 0 은 X 점유). X 이동 차례.
    expect(s.turn).toBe('X');
    const cell = chooseMove(s, { random: fixedRandom });
    const next = applyAction(s, cell);
    expect(next.winner).toBe('X');
    expect(cell).toBe(8);
  });

  it('자기 라인을 깨는 이동은 앞수가 더 좋을 때만 택한다 — 항상 유효한 수를 반환한다', () => {
    const s = play('O', [0, 5, 1, 7, 3, 8]);
    const cell = chooseMove(s, { random: fixedRandom });
    expect(legalTargets(s)).toContain(cell);
  });
});

describe('chooseMove — 강도(멍청한 수 회귀 방지)', () => {
  it('기본 깊이(8수) 후공 AI 는 얕은(2수) 플레이어에게 지지 않는다', () => {
    let rngState = 5;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) % 2147483648;
      return rngState / 2147483648;
    };
    for (let game = 0; game < 6; game++) {
      let s = createGame('O'); // O = 얕은 플레이어(선공), X = 기본 깊이 AI(후공)
      let plies = 0;
      while (!s.winner && plies < 40) {
        const cell =
          s.turn === 'O' ? chooseMove(s, { depth: 2, random: rng }) : chooseMove(s, { random: rng });
        s = applyAction(s, cell);
        plies++;
      }
      expect(s.winner).not.toBe('O');
    }
  });
});

describe('chooseMove — 패배 기억(banned) 회피', () => {
  it('회피 목록의 셀은 대안이 있는 한 두지 않는다', () => {
    const s = createGame('X');
    for (let i = 0; i < 20; i++) {
      expect(chooseMove(s, { banned: [4] })).not.toBe(4);
    }
  });

  it('회피 때문에 필수 차단을 포기하지 않는다(3수 패배 버그 회귀 방지)', () => {
    // O: 0,1 (2 만 막으면 됨) / X: 4 — 2 가 회피 목록에 있어도 차단해야 한다.
    const s = play('O', [0, 4, 1]);
    expect(s.turn).toBe('X');
    expect(chooseMove(s, { random: fixedRandom, banned: [2] })).toBe(2);
  });

  it('즉승 수는 회피 목록에 있어도 무조건 둔다', () => {
    // X: 3,4 → 5 즉승. banned 에 5 가 있어도 승리를 포기하면 안 된다.
    const s = play('X', [3, 0, 4, 8]);
    expect(chooseMove(s, { random: fixedRandom, banned: [5] })).toBe(5);
  });

  it('모든 수가 회피 대상이면 전체에서 최선을 고른다', () => {
    const s = createGame('X');
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const cell = chooseMove(s, { random: fixedRandom, banned: all });
    expect(all).toContain(cell);
  });
});

describe('chooseStudyOpponentMove — AI 스터디 상대(성실하게 두되 얕게 읽는다)', () => {
  it('자신의 즉승 수를 반드시 둔다(져 주지 않는다)', () => {
    // X: 3,4 → 5 면 X 즉승. O: 0,8.
    const s = play('X', [3, 0, 4, 8]);
    expect(s.turn).toBe('X');
    for (let i = 0; i < 10; i++) {
      expect(chooseStudyOpponentMove(s)).toBe(5);
    }
  });

  it('플레이어의 즉승 칸을 반드시 막는다', () => {
    // O: 0,1 (2 가 즉승 칸) / X: 4. X 차례.
    const s = play('O', [0, 4, 1]);
    expect(s.turn).toBe('X');
    for (let i = 0; i < 10; i++) {
      expect(chooseStudyOpponentMove(s)).toBe(2);
    }
  });

  it('같은 국면이면 같은 응수 — 안내수가 상대를 시뮬레이션할 수 있다', () => {
    const opponent = makeStudyOpponent(1234);
    const s = play('O', [4]);
    const first = opponent(s);
    for (let i = 0; i < 5; i++) expect(opponent(s)).toBe(first);
    // 시드가 다르면 수순이 달라질 수 있다(판마다 변주) — 유효한 수이기만 하면 된다.
    expect(legalTargets(s)).toContain(makeStudyOpponent(9999)(s));
  });

  it('안내(studyAdvice)를 따르면 10턴 이상 배우고 나서 승리한다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const opponent = makeStudyOpponent(seed);
      let s = createGame('O');
      let myTurns = 0;
      while (!s.winner && myTurns < 30) {
        if (s.turn === 'O') {
          s = applyAction(s, studyAdvice(s, myTurns, opponent).cell);
          myTurns++;
        } else {
          s = applyAction(s, opponent(s));
        }
      }
      // 상대가 봐주지 않는데도 안내를 따라오면 이긴다 — 그리고 10턴 전에 끝나지 않는다.
      expect(s.winner).toBe('O');
      expect(myTurns).toBeGreaterThanOrEqual(STUDY_WIN_TURN);
    }
  });

  it('안내는 매 턴 이유(단계 표시 포함)를 함께 준다', () => {
    const opponent = makeStudyOpponent(42);
    let s = createGame('O');
    let myTurns = 0;
    while (!s.winner && myTurns < STUDY_WIN_TURN) {
      if (s.turn === 'O') {
        const advice = studyAdvice(s, myTurns, opponent);
        expect(advice.step).toBe(myTurns + 1);
        expect(advice.total).toBe(STUDY_WIN_TURN);
        expect(advice.reason.length).toBeGreaterThan(0);
        expect(legalTargets(s)).toContain(advice.cell);
        myTurns++;
        s = applyAction(s, advice.cell);
      } else {
        s = applyAction(s, opponent(s));
      }
    }
    expect(myTurns).toBe(STUDY_WIN_TURN);
  });

  it('안내를 벗어나 최선(깊은 탐색)으로 두면 10턴 전에 이길 수도 있다 — 상대는 봐주지 않는다', () => {
    let rngState = 7;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) % 2147483648;
      return rngState / 2147483648;
    };
    for (let seed = 1; seed <= 10; seed++) {
      const opponent = makeStudyOpponent(seed);
      let s = createGame('O');
      let plies = 0;
      while (!s.winner && plies < 40) {
        s = applyAction(s, s.turn === 'O' ? chooseMove(s, { random: rng }) : opponent(s));
        plies++;
      }
      expect(s.winner).toBe('O'); // 얕은 상대는 깊은 탐색을 이기지 못한다
    }
  });
});

describe('chooseMove — 견고성', () => {
  it('무작위 진행 어느 시점에도 항상 유효한 수를 반환한다', () => {
    let rngState = 42;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) % 2147483648;
      return rngState / 2147483648;
    };
    for (let game = 0; game < 20; game++) {
      let s = createGame(game % 2 === 0 ? 'O' : 'X');
      for (let ply = 0; ply < 30 && !s.winner; ply++) {
        const cell = chooseMove(s, { random: rng, depth: 2 });
        expect(cellOwner(s, cell)).toBeNull();
        s = applyAction(s, cell);
      }
    }
  });
});
