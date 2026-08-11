/**
 * 대전 정산 — 매치 결과를 두 플레이어의 레이팅 변동으로 바꾸는 순수 로직.
 *
 * 계산 기준은 **매치 시작 시점의 레이팅**(`o_rating_at`/`x_rating_at`)이다. 대기 중이나
 * 대국 중에 다른 판이 끝나 레이팅이 변해도 이 판의 보상이 흔들리지 않게 하기 위해서다.
 */
import { applyRatingDelta, ratingDelta, type Outcome, type Player } from '@casual/ttt-rules';
import type { MatchRow } from './matchFlow.js';

export interface SideSettlement {
  readonly userId: string;
  readonly outcome: Outcome;
  readonly delta: number;
  /** 매치 시작 시점 레이팅에 변동을 적용한 값(하한 적용). */
  readonly rating: number;
}

export interface Settlement {
  readonly O: SideSettlement;
  readonly X: SideSettlement;
}

function outcomeFor(side: Player, winner: Player | null): Outcome {
  if (winner === null) return 'draw';
  return winner === side ? 'win' : 'loss';
}

/** 승자(무승부면 null)로부터 양쪽의 레이팅 변동을 계산한다. */
export function settle(match: MatchRow, winner: Player | null): Settlement {
  const build = (side: Player): SideSettlement => {
    const mine = side === 'O' ? match.oRatingAt : match.xRatingAt;
    const theirs = side === 'O' ? match.xRatingAt : match.oRatingAt;
    const outcome = outcomeFor(side, winner);
    const delta = ratingDelta(mine, theirs, outcome);
    return {
      userId: side === 'O' ? match.oPlayer : match.xPlayer,
      outcome,
      delta,
      rating: applyRatingDelta(mine, delta),
    };
  };

  return { O: build('O'), X: build('X') };
}
