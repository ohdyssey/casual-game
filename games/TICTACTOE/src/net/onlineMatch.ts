/**
 * 온라인 대전 1판의 수명 주기 — 서버 상태의 거울을 들고, 화면이 알아들을 이벤트로 번역한다.
 *
 * PlayScene 이 네트워크를 직접 다루지 않게 하는 게 목적이다. 씬은 세 가지만 처리하면 된다:
 *   · `move`     — 상대가 둔 셀. 봇 대전과 **똑같이** commitAction 에 넣으면 된다.
 *   · `finished` — 착수 없이 끝남(시간초과·포기·이탈).
 *   · `sync`     — 화면을 서버 상태로 강제로 맞춰야 함(재접속·경합·백그라운드 복귀).
 *
 * 좌표계: 이 모듈이 들고 있는 `mirror` 는 **서버의 절대 O/X**, 씬에 넘기는 값은 "나 = O" 로
 * 뒤집은 화면 좌표계다(remap.ts). 착수 셀 번호는 심볼과 무관해서 변환이 필요 없다.
 */
import { applyAction, type GameState, type Player } from '../logic/board.js';
import { displayRemainMs } from '@casual/ttt-rules';
import type { MatchCause, MatchSnapshot } from '@casual/ttt-rules/protocol.js';
import { claimTimeout, fetchMatch, resign, sendMove } from './api.js';
import { watchMatch, type MatchUpdate } from './matchChannel.js';
import { remapPlayer, remapToLocal } from './remap.js';

export type OnlineEvent =
  /** 상대의 착수(화면 좌표계와 무관한 셀 번호). */
  | { readonly kind: 'move'; readonly cell: number }
  /** 착수 없이 끝난 판. `winner` 는 이미 화면 좌표계로 뒤집힌 값. */
  | { readonly kind: 'finished'; readonly winner: Player | null; readonly cause: MatchCause }
  /** 화면을 통째로 맞춰야 함. `state` 는 화면 좌표계. */
  | {
      readonly kind: 'sync';
      readonly state: GameState;
      readonly moveCount: number;
      readonly finished: boolean;
      readonly winner: Player | null;
      readonly cause: MatchCause | null;
    }
  /** 턴 마감이 갱신됨(내 착수 확인·상대 착수). 씬은 돌던 타이머를 다시 맞춘다. */
  | { readonly kind: 'deadline' };

/** 서로 다른 두 상태가 같은 판인지 — 착수 하나로 설명되는지 확인할 때 쓴다. */
function sameState(a: GameState, b: GameState): boolean {
  return (
    a.turn === b.turn &&
    a.winner === b.winner &&
    a.pieces.O.join(',') === b.pieces.O.join(',') &&
    a.pieces.X.join(',') === b.pieces.X.join(',')
  );
}

/**
 * `prev` → `next` 가 착수 하나로 설명되면 그 셀 번호를, 아니면 null.
 *
 * 배치든 이동이든 새 말은 항상 배열 맨 뒤에 온다(board.ts 의 순번 순환). 그래서 후보는
 * 하나뿐이고, 실제로 applyAction 을 돌려 결과가 일치하는지까지 확인한다.
 */
function derivedCell(prev: GameState, next: GameState): number | null {
  const mover = prev.turn;
  const arr = next.pieces[mover];
  if (arr.length === 0) return null;
  const cell = arr[arr.length - 1];
  try {
    return sameState(applyAction(prev, cell), next) ? cell : null;
  } catch {
    return null;
  }
}

export class OnlineMatch {
  readonly matchId: string;
  readonly you: Player;
  readonly opponentName: string;
  readonly opponentRating: number;
  /** 정산 입력 — 판 시작 시점의 양쪽 레이팅(서버가 DB 에 쓸 때 쓴 것과 같은 값). */
  readonly myRatingAt: number;
  readonly foeRatingAt: number;

  /** 서버 절대 좌표계의 상태 거울. 여기가 어긋나면 이벤트 번역이 전부 틀어진다. */
  private mirror: GameState;
  private moveIndex: number;
  private turnDeadline: number | null;
  private finished: boolean;
  private unsubscribe: (() => void) | null = null;
  private emit: (event: OnlineEvent) => void = () => {};

  constructor(snapshot: MatchSnapshot) {
    this.matchId = snapshot.matchId;
    this.you = snapshot.you;
    this.opponentName = snapshot.opponent.nickname;
    this.opponentRating = snapshot.opponent.rating;
    this.myRatingAt = snapshot.myRatingAt;
    this.foeRatingAt = snapshot.opponent.ratingAt;
    this.mirror = snapshot.state;
    this.moveIndex = snapshot.moveIndex;
    this.turnDeadline = snapshot.deadline;
    this.finished = snapshot.status !== 'playing';
  }

  /** 판 시작 상태(화면 좌표계) — 씬이 첫 렌더에 쓴다. */
  initialState(): GameState {
    return remapToLocal(this.mirror, this.you);
  }

  /** 현재 턴 마감(epoch ms). 종료됐거나 아직 모르면 null. */
  deadline(): number | null {
    return this.turnDeadline;
  }

  /** 화면에 그릴 남은 시간. 마감을 모르면 온전한 한 턴을 준다(곧 서버 값으로 교정된다). */
  remainMs(fallbackMs: number): number {
    if (this.turnDeadline === null) return fallbackMs;
    return displayRemainMs(this.turnDeadline, Date.now());
  }

  /** 실시간 구독 시작. 반드시 `dispose()` 로 해제한다. */
  async start(emit: (event: OnlineEvent) => void): Promise<void> {
    this.emit = emit;
    this.unsubscribe = await watchMatch(this.matchId, (update) => this.onUpdate(update));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.emit = () => {};
  }

  // ── 서버 → 화면 ──

  private onUpdate(update: MatchUpdate): void {
    if (this.finished) return;
    // 내 착수의 에코는 이미 HTTP 응답으로 반영했다.
    if (update.moveIndex <= this.moveIndex) return;

    // 한 칸 넘게 건너뛰었다 = 놓친 전이가 있다. 추측하지 말고 통째로 맞춘다.
    if (update.moveIndex !== this.moveIndex + 1) {
      this.adopt(update);
      this.emitSync(update);
      return;
    }

    const cell = derivedCell(this.mirror, update.state);
    this.adopt(update);

    if (cell !== null) {
      // 착수로 끝난 판(3목·수 상한)은 씬이 commitAction → afterAction 으로 알아서 끝낸다.
      this.emit({ kind: 'move', cell });
      return;
    }

    if (update.status !== 'playing') {
      this.emit({
        kind: 'finished',
        winner: update.winner ? remapPlayer(update.winner, this.you) : null,
        cause: update.cause ?? 'disconnect',
      });
      return;
    }

    // 착수로 설명되지 않는 진행 중 변화 — 있어선 안 되지만, 있으면 화면을 맞춘다.
    this.emitSync(update);
  }

  private adopt(update: MatchUpdate): void {
    this.mirror = update.state;
    this.moveIndex = update.moveIndex;
    this.turnDeadline = update.deadline;
    this.finished = update.status !== 'playing';
    this.emit({ kind: 'deadline' });
  }

  private emitSync(update: MatchUpdate): void {
    this.emit({
      kind: 'sync',
      state: remapToLocal(update.state, this.you),
      moveCount: update.moveCount,
      finished: update.status !== 'playing',
      winner: update.winner ? remapPlayer(update.winner, this.you) : null,
      cause: update.cause,
    });
  }

  // ── 화면 → 서버 ──

  /**
   * 내 착수를 서버에 보낸다(씬은 이미 낙관적으로 그려 놓은 상태).
   * 거부되면 `sync` 를 내보내 화면을 되돌린다.
   */
  async submitMove(cell: number): Promise<void> {
    const sentIndex = this.moveIndex;

    // 거울도 함께 앞세운다. 그러지 않으면 상대의 다음 착수 알림이 내 HTTP 응답보다 먼저
    // 도착했을 때 번호가 +2 로 보여, 멀쩡한 진행을 강제 재동기화로 오인한다.
    try {
      this.mirror = applyAction(this.mirror, cell);
      this.moveIndex = sentIndex + 1;
      this.turnDeadline = null; // 새 마감은 서버가 알려 준다(그때까지는 온전한 한 턴으로 그린다)
    } catch {
      // 거울이 이미 어긋나 있다 — 보내 봐야 거부되므로 진실부터 받아온다.
      await this.resync();
      return;
    }

    const res = await sendMove(this.matchId, sentIndex, cell);
    if (!res) {
      // 통신 실패 — 서버가 내 수를 받았는지 알 수 없다. 진실을 다시 물어본다.
      await this.resync();
      return;
    }

    if (res.result === 'rejected') {
      // 서버가 내 수를 받지 않았다 — 낙관 적용을 되돌린다.
      this.absorb(res.match, true);
      return;
    }

    // 승인. 응답을 기다리는 사이 상대가 이미 뒀다면(실시간 알림이 먼저 도착) 거울이 더
    // 앞서 있다 — 그때는 뒤로 되돌리지 않고 마감만 그대로 둔다.
    if (res.match.moveIndex >= this.moveIndex) this.absorb(res.match, false);
  }

  /** 시간초과 주장. 서버가 자기 시계로 다시 확인하므로 거부될 수 있다. */
  async claimTimeout(): Promise<void> {
    const res = await claimTimeout(this.matchId, this.moveIndex);
    if (!res) {
      await this.resync();
      return;
    }
    this.absorb(res.match, true);
  }

  /** 판을 버리고 나갈 때(홈으로·메뉴로) — 상대를 20초씩 기다리게 두지 않는다. */
  async resign(): Promise<void> {
    if (this.finished) return;
    const res = await resign(this.matchId);
    if (res) this.finished = true;
  }

  /** 서버에 현재 상태를 다시 물어 화면을 맞춘다(백그라운드 복귀·재접속·통신 실패 후). */
  async resync(): Promise<void> {
    const snapshot = await fetchMatch(this.matchId);
    if (!snapshot) return;
    this.absorb(snapshot, true);
  }

  /**
   * 서버 응답을 거울에 반영한다.
   * `forceSync` 면 화면까지 맞추라고 알린다(거부·재동기화). 정상 확인이면 마감만 갱신한다.
   */
  private absorb(snapshot: MatchSnapshot, forceSync: boolean): void {
    this.mirror = snapshot.state;
    this.moveIndex = snapshot.moveIndex;
    this.turnDeadline = snapshot.deadline;
    this.finished = snapshot.status !== 'playing';

    if (!forceSync) {
      this.emit({ kind: 'deadline' });
      return;
    }

    this.emit({
      kind: 'sync',
      state: remapToLocal(snapshot.state, this.you),
      moveCount: snapshot.moveCount,
      finished: this.finished,
      winner: snapshot.winner ? remapPlayer(snapshot.winner, this.you) : null,
      cause: snapshot.cause,
    });
  }
}
