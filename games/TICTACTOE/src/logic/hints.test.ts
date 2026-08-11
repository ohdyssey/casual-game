import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameState } from './board.js';
import { threatCells, winningCells } from './hints.js';

function play(first: 'O' | 'X', cells: number[]): GameState {
  let s = createGame(first);
  for (const c of cells) s = applyAction(s, c);
  return s;
}

describe('winningCells', () => {
  it('배치 페이즈 — 두면 바로 이기는 칸을 찾는다', () => {
    // O: 0,1 / X: 4,8 → O 차례, 2 에 두면 승리.
    const s = play('O', [0, 4, 1, 8]);
    expect(winningCells(s)).toEqual([2]);
  });

  it('이동 페이즈 — 가장 오래된 말을 옮겨 이기는 목적지를 찾는다', () => {
    // X: 5,0,4 (오래된 5 → 8 이면 0,4,8 대각) / O: 1,2,7.
    const s = play('X', [5, 1, 0, 2, 4, 7]);
    expect(winningCells(s)).toEqual([8]);
  });

  it('없으면 빈 배열', () => {
    expect(winningCells(createGame('O'))).toEqual([]);
  });

  it('즉승 칸은 구조적으로 최대 1개다(고정된 두 말이 정하는 라인은 유일)', () => {
    // 배치든 이동이든 "남는 두 말 + 목적지"가 3목이어야 하므로, 두 말을 지나는
    // 라인은 하나뿐 → winningCells 는 항상 0~1개. 무작위 진행으로 속성을 확인한다.
    let rngState = 7;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) % 2147483648;
      return rngState / 2147483648;
    };
    for (let game = 0; game < 10; game++) {
      let s = createGame(game % 2 === 0 ? 'O' : 'X');
      for (let ply = 0; ply < 20 && !s.winner; ply++) {
        expect(winningCells(s).length).toBeLessThanOrEqual(1);
        const targets = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(
          (c) => !s.pieces.O.includes(c) && !s.pieces.X.includes(c),
        );
        s = applyAction(s, targets[Math.floor(rng() * targets.length)]);
      }
    }
  });
});

describe('threatCells', () => {
  it('상대가 다음 턴에 이길 칸을 경고한다', () => {
    // X: 3,4 / O: 0 → O 차례, X 는 다음 턴 5 로 승리 가능.
    const s = play('X', [3, 0, 4]);
    expect(s.turn).toBe('O');
    expect(threatCells(s)).toEqual([5]);
  });

  it('상대 이동 페이즈의 승리 목적지도 경고한다', () => {
    // X: 5,0,4 / O: 1,2,7 인데 O 차례로 만들기 위해 O 를 마지막에 둔다.
    // O: 1,2 놓고 X: 5,0,4 놓은 뒤 O 가 7 → 다음은 X 차례가 아니라... 순서 맞춰 구성:
    // X 선공으로 5,0,4 / O 1,2,7 → 지금 X 차례(이동). O 관점 위협을 보려면 O 차례 상태가 필요.
    // O 가 한 수 더 둔 상태를 만들 수 없으니(말 3개), X 가 3 으로 이동한 뒤 O 차례로 본다.
    const sx = play('X', [5, 1, 0, 2, 4, 7]); // X 차례(이동), 8 이면 즉승
    const so = applyAction(sx, 3); // X: 5→3 (0,4,3 — 즉승 포기), O 차례
    // 이제 X 의 가장 오래된 말은 0. X 는 다음 턴 0 을 옮겨도 3,4 라인(3,4,5)의 5 로 승리 가능.
    expect(threatCells(so)).toContain(5);
  });

  it('위협이 없으면 빈 배열', () => {
    expect(threatCells(createGame('O'))).toEqual([]);
  });
});
