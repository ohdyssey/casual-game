import { describe, expect, it } from 'vitest';
import { applyAction, cellOwner, createGame } from './board.js';
import { makeStudyOpponent } from './ai.js';
import { STUDY_WIN_TURN, studyAdvice } from './hints.js';
import { STUDY_SOLUTIONS, STUDY_TOTAL } from './studySolutions.js';

describe('AI 스터디 승리 솔루션 20개', () => {
  it('20개가 있고 번호·시드·수순이 서로 다르다', () => {
    expect(STUDY_TOTAL).toBe(20);
    expect(STUDY_SOLUTIONS.map((s) => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(STUDY_SOLUTIONS.map((s) => s.seed)).size).toBe(20);
    expect(new Set(STUDY_SOLUTIONS.map((s) => s.moves.join(','))).size).toBe(20);
  });

  it.each(STUDY_SOLUTIONS.map((s) => [s.id, s.title, s] as const))(
    '#%i %s — 저장된 수순대로 두면 실제로 이긴다',
    (_id, _title, sol) => {
      const opponent = makeStudyOpponent(sol.seed);
      let state = createGame('O');
      let myTurns = 0;
      for (const cell of sol.moves) {
        expect(state.turn).toBe('O');
        expect(cellOwner(state, cell)).toBeNull(); // 빈 칸이어야 둘 수 있다
        state = applyAction(state, cell);
        myTurns++;
        if (state.winner) break;
        state = applyAction(state, opponent(state)); // 상대는 봐주지 않는다
        expect(state.winner).not.toBe('X');
      }
      expect(state.winner).toBe('O');
      expect(myTurns).toBe(sol.turns);
      // 스터디는 충분히 배운 뒤에 끝난다.
      expect(myTurns).toBeGreaterThanOrEqual(STUDY_WIN_TURN);
    },
  );

  it.each(STUDY_SOLUTIONS.map((s) => [s.id, s] as const))(
    '#%i — 게임 중 파란 박스 안내가 저장된 수순과 일치한다',
    (_id, sol) => {
      const opponent = makeStudyOpponent(sol.seed);
      let state = createGame('O');
      let myTurns = 0;
      for (const expected of sol.moves) {
        const advice = studyAdvice(state, myTurns, opponent, sol.seed);
        expect(advice.cell).toBe(expected);
        state = applyAction(state, advice.cell);
        myTurns++;
        if (state.winner) break;
        state = applyAction(state, opponent(state));
      }
      expect(state.winner).toBe('O');
    },
  );
});
