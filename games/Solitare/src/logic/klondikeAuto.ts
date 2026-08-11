/**
 * klondikeAuto.ts — 클론다이크 **자동 완성**(순수 로직, Phaser-free).
 *
 * PO 2026-07-27: "카드가 대부분 맞춰졌을 때 자동플레이되도록" — 태블로 **뒷면 카드가 0장**이 되는 순간부터는
 *   모든 카드가 보이고 남은 일은 파운데이션에 올리는 순서뿐이라 플레이어가 더 결정할 게 없다. 이 시점을
 *   자동 완성 조건으로 삼는다(고전 솔리테어들의 표준 조건과 동일).
 *
 * 수순 생성 규칙: **파운데이션에 올릴 수 있는 가장 낮은 랭크부터** 올린다(태블로 맨 위 카드 + 웨이스트 맨 위).
 *   올릴 게 없으면 스톡을 뽑고(비었으면 재순환), 손패를 한 바퀴 다 돌았는데도 진전이 없으면 멈춘다.
 *   ⚠️ 태블로↔태블로 이동은 하지 않는다 — 뒷면이 없는 종반 컬럼은 대부분 내림차순 런이라 "맨 위부터
 *      랭크 순으로 올리기"만으로 끝나기 때문. 드물게 막히면 수순을 **거기서 끊고 조작권을 돌려준다**
 *      (플레이어가 한 수 두면 조건이 그대로라 자동 완성이 다시 걸린다).
 */
import {
  applyMove,
  canPlaceOnFoundation,
  drawFromStock,
  recycleWaste,
  isWon,
  TABLEAU_COLS,
  type KlondikeState,
  type KlondikeMove,
} from './klondike.js';

/** 태블로에 뒷면 카드가 하나라도 남아 있는가. */
export function hasFaceDown(state: KlondikeState): boolean {
  return state.tableau.some((col) => col.some((tc) => !tc.faceUp));
}

/**
 * 자동 완성 한 수의 **종류** — 재생 속도와 연출을 이걸로 나눈다(PO 2026-07-28 "진행되다 멈추는 현상").
 *   `foundation` = 카드가 파운데이션으로 올라가는 수(보드가 실제로 줄어드는, 보여줘야 할 수)
 *   `draw`/`recycle` = 손패를 돌리는 수. **화면 변화가 거의 없어** 같은 간격으로 재생하면 멈춘 것처럼 보인다
 *   (올릴 카드가 없으면 손패를 한 바퀴 이상 돌리므로 20~48 스텝이 연속으로 나올 수 있다).
 */
export type AutoStepKind = 'foundation' | 'draw' | 'recycle';

/** 자동 완성 한 수 = 그 수의 종류 + 적용 뒤 상태. 호출부가 종류별로 간격/연출을 정한다. */
export interface AutoStep {
  readonly kind: AutoStepKind;
  readonly state: KlondikeState;
}

/**
 * 자동 완성 **후보**인가 — 뒷면 카드가 0장(= 모든 카드가 보인다)이고 아직 안 이긴 상태.
 *   ⚠️ 이건 싼 1차 게이트일 뿐 **끝까지 간다는 보장이 아니다** — 실제 시작 여부는 `planAutoComplete` 가
 *      수순을 끝까지 만들어 보고 결정한다(아래 참조).
 */
export function canAutoComplete(state: KlondikeState): boolean {
  return !isWon(state) && !hasFaceDown(state);
}

/**
 * **끝까지 이기는 수순만 반환**(못 이기면 null) — 자동 완성의 시작 조건은 이것 하나다.
 *
 * PO 2026-07-27 "프리셀 자동 최종 플레이시 멈추는 문제": 예전엔 `canAutoComplete`(뒷면 0장)만 보고
 *   시작해서, 파운데이션에 올릴 카드가 떨어지면 **중간에 멈춰** 화면이 굳은 것처럼 보였다(실제 사례:
 *   파운데이션 ♠7·♥7·♦8·♣6 인데 태블로 맨 위가 8♣·J♣·9♠·10♣·J♥ — 올릴 수 있는 카드가 하나도 없음.
 *   태블로↔태블로 이동이 필요한데 이 수순 생성기는 그걸 하지 않는다).
 *   → 이제 **미리 끝까지 돌려보고 승리로 끝날 때만** 시작한다. 못 끝내면 조용히 아무 일도 하지 않고
 *      조작권을 유지한다(시작했다가 멈추는 일 자체가 없어진다).
 *
 * 💡 뒷면 0장 + 스톡·웨이스트 0장이면 **항상 성공한다**(수학적으로 보장): 그 상태의 각 컬럼은 내림차순
 *    런이라 접근 가능한 끝이 그 컬럼의 최저 랭크다 → 에이스는 반드시 노출돼 있고, 낮은 랭크부터 올리면
 *    귀납적으로 전부 올라간다. 스톡/웨이스트가 남아 있을 때만 실패할 수 있다.
 */
export function planAutoComplete(state: KlondikeState, maxSteps?: number): AutoStep[] | null {
  const steps = autoCompleteStates(state, maxSteps);
  if (steps.length === 0) return null;
  return isWon(steps[steps.length - 1].state) ? steps : null;
}

/** 지금 파운데이션에 올릴 수 있는 수 중 **가장 낮은 랭크** 하나(없으면 null) — 낮은 것부터 올려야 막히지 않는다. */
function nextFoundationMove(state: KlondikeState): KlondikeMove | null {
  let best: KlondikeMove | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  const consider = (rank: number, move: KlondikeMove): void => {
    if (rank < bestRank) {
      bestRank = rank;
      best = move;
    }
  };

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    if (canPlaceOnFoundation(state, top)) consider(top.rank, { from: { kind: 'waste' }, to: { kind: 'foundation' } });
  }
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const column = state.tableau[col];
    const top = column[column.length - 1];
    if (top?.faceUp && canPlaceOnFoundation(state, top.card)) {
      consider(top.card.rank, { from: { kind: 'tableau', col, count: 1 }, to: { kind: 'foundation' } });
    }
  }
  return best;
}

/** 수순 길이 상한(안전장치) — 카드 52장 + 뽑기/재순환을 넉넉히 덮는다. */
const MAX_AUTO_STEPS = 600;

/**
 * 자동 완성 수순 — **한 수마다의 결과 상태**를 순서대로 반환(호출부가 한 프레임씩 재생한다).
 *   승리하면 거기서 끝나고, 더 진행할 수 없으면 진행된 데까지만 반환한다(빈 배열 = 지금 할 수 있는 게 없음).
 */
export function autoCompleteStates(initial: KlondikeState, maxSteps = MAX_AUTO_STEPS): AutoStep[] {
  const out: AutoStep[] = [];
  let state = initial;
  let idleDraws = 0; // 마지막 파운데이션 수 이후로 헛돌린 뽑기/재순환 수.

  for (let step = 0; step < maxSteps; step++) {
    if (isWon(state)) break;

    const move = nextFoundationMove(state);
    if (move) {
      const next = applyMove(state, move);
      if (!next) break; // 방어적(정상 경로에선 발생하지 않음).
      state = next;
      out.push({ kind: 'foundation', state });
      idleDraws = 0;
      continue;
    }

    const hand = state.stock.length + state.waste.length;
    if (hand === 0) break; // 올릴 카드도, 뽑을 카드도 없다 — 여기서 끊는다.
    if (idleDraws > hand) break; // 손패를 한 바퀴 다 돌았는데 진전이 없다 — 교착.
    const drawing = state.stock.length > 0;
    state = drawing ? drawFromStock(state) : recycleWaste(state);
    out.push({ kind: drawing ? 'draw' : 'recycle', state });
    idleDraws++;
  }
  return out;
}
