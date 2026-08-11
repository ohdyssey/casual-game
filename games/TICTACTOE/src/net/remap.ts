/**
 * 서버 좌표계 ↔ 화면 좌표계 변환.
 *
 * `PlayScene` 은 **내 말이 언제나 'O'** 라는 전제 위에 서 있다 — 피스 텍스처(O_KEY/X_KEY),
 * 색상(COLOR_HUMAN/COLOR_AI), 파이터 캐릭터, 타이머 링 색이 전부 그 상수에 매달려 있다.
 * 실유저 대전에서는 내가 'X' 를 쥘 수도 있는데, 그걸 렌더링 계층까지 동적으로 만들면
 * 열 곳 넘게 고쳐야 한다.
 *
 * 대신 **네트워크 경계에서 한 번만 뒤집는다.** 서버가 보낸 절대 상태를 "나 = O" 관점으로
 * 바꿔서 넘겨주면 PlayScene 은 한 줄도 바뀌지 않는다.
 *
 * 반대 방향(내 착수 → 서버)은 변환이 필요 없다. 이 게임의 행동은 목적지 셀 번호 하나로
 * 완전히 표현되고(어느 말을 옮길지는 항상 가장 오래된 말로 강제), 심볼이 등장하지 않는다.
 */
import { opponentOf, type GameState, type Player } from '../logic/board.js';

/** 서버의 절대 O/X 상태를 "나 = O" 관점으로 뒤집는다(내가 이미 O 면 그대로). */
export function remapToLocal(state: GameState, you: Player): GameState {
  if (you === 'O') return state;
  return {
    pieces: { O: state.pieces.X, X: state.pieces.O },
    turn: opponentOf(state.turn),
    winner: state.winner ? opponentOf(state.winner) : null,
    // 승리 라인은 셀 번호 집합이라 심볼과 무관 — 그대로 둔다.
    winLine: state.winLine,
  };
}

/** 서버의 절대 심볼을 화면 심볼로. 결과 판정("내가 이겼나")에 쓴다. */
export function remapPlayer(symbol: Player, you: Player): Player {
  return you === 'O' ? symbol : opponentOf(symbol);
}
