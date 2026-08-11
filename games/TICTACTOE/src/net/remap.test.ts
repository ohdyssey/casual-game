import { describe, it, expect } from 'vitest';
import { createGame, applyAction, type GameState } from '../logic/board.js';
import { remapPlayer, remapToLocal } from './remap.js';

/** O:0,2 / X:4 이고 지금은 X 턴인 상태. */
function sample(): GameState {
  return [0, 4, 2].reduce<GameState>((s, c) => applyAction(s, c), createGame('O'));
}

describe('remapToLocal', () => {
  it('내가 O 면 아무것도 바꾸지 않는다(같은 참조)', () => {
    const s = sample();
    expect(remapToLocal(s, 'O')).toBe(s);
  });

  it('내가 X 면 말·턴을 통째로 맞바꾼다', () => {
    const s = sample();
    const local = remapToLocal(s, 'X');
    expect(local.pieces.O).toEqual(s.pieces.X);
    expect(local.pieces.X).toEqual(s.pieces.O);
    expect(local.turn).toBe('O'); // 서버 기준 X 턴 = 내 턴
  });

  it('두 번 뒤집으면 원래대로다', () => {
    const s = sample();
    expect(remapToLocal(remapToLocal(s, 'X'), 'X')).toEqual(s);
  });

  it('승자도 함께 뒤집는다 — 내가 X 로 이겼으면 화면에서는 O 승', () => {
    const won = [0, 3, 1, 4, 6, 5].reduce<GameState>((s, c) => applyAction(s, c), createGame('O'));
    expect(won.winner).toBe('X'); // X 가 3,4,5 로 승리
    expect(remapToLocal(won, 'X').winner).toBe('O');
    expect(remapToLocal(won, 'O').winner).toBe('X');
  });

  it('승리 라인은 셀 번호라 그대로 둔다', () => {
    const won = [0, 3, 1, 4, 6, 5].reduce<GameState>((s, c) => applyAction(s, c), createGame('O'));
    expect(remapToLocal(won, 'X').winLine).toEqual(won.winLine);
  });

  it('원본을 변형하지 않는다', () => {
    const s = sample();
    const before = JSON.stringify(s);
    remapToLocal(s, 'X');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('말 순서(나이)를 보존한다 — 다음 이동 대상이 바뀌면 안 된다', () => {
    const s = sample();
    expect(remapToLocal(s, 'X').pieces.X).toEqual([0, 2]); // 서버 O 의 순서 그대로
  });
});

describe('remapPlayer', () => {
  it('내가 O 면 그대로', () => {
    expect(remapPlayer('X', 'O')).toBe('X');
  });

  it('내가 X 면 뒤집힌다', () => {
    expect(remapPlayer('X', 'X')).toBe('O');
    expect(remapPlayer('O', 'X')).toBe('X');
  });
});
