/**
 * boardView.ts — **화면에 있어야 할 것 + 누를 수 있는 것**을 상태에서 한 번에 계산하는 순수 함수.
 *
 * ## 왜 있나
 * 예전에는 씬(`PlayScene.refresh`)이 카드 뷰를 순회하며 그림·하이라이트·입력을 **차례로 갱신**했다.
 * 그러다 보니 "기준 카드 갱신이 입력 판정보다 뒤에 있으면 보드 전체 입력이 꺼진다" 같은
 * **문장 순서에만 존재하는 버그**가 생겼고, 컴파일러도 테스트도 잡을 수 없었다(2026-08-21 실제 발생:
 * "첫 매칭 후 두 번째부터 안 눌림").
 *
 * 이 모듈은 그 순서를 없앤다 — 입력 가능 여부를 **같은 계산 안에서** 표시 내용으로부터 파생한다.
 * 씬은 결과를 그대로 그리기만 하므로, 갱신 순서를 잘못 짤 여지 자체가 사라진다.
 *
 * ## 핵심 규칙 하나
 * **"내가 보이고 기준 카드도 보일 때만 누를 수 있다."**
 *   플레이어가 못 본 정보로 판정하는 일이 구조적으로 불가능해진다(부당한 거부의 원천 차단).
 *   ±1 매칭 여부는 여기서 보지 않는다 — 안 맞는 카드도 눌려서 "안 맞는다"는 피드백을 받아야 한다.
 *
 * 좌표·연출·Phaser 는 다루지 않는다. vitest 로 헤드리스 검증 가능.
 */
import type { Card } from './types.js';
import type { GameState } from './tripeaks.js';
import { availableMoves, isExposed, wasteTop } from './tripeaks.js';

/** 카드 한 장의 표시 종류. `face` 만 탭 후보가 된다. */
export type SlotKind = 'back' | 'face' | 'wild' | 'bonus';

export interface SlotView {
  readonly kind: SlotKind;
  /** kind==='face' 일 때의 카드. */
  readonly card?: Card;
  /** kind==='bonus' 일 때 추가되는 뽑기 장수. */
  readonly bonusCount?: number;
  /** 골드 헤일로(낼 수 있음 표시) — 장식이며 탭 가능 여부와 무관. */
  readonly highlight: boolean;
  /** 이 카드를 탭 대상으로 열어도 되는가. */
  readonly tappable: boolean;
  /** 가려진 카드는 살짝 낮은 알파. */
  readonly alpha: number;
}

/** 기준(웨이스트) 카드 표시. `back` = 뽑기 공개 대기(아직 무엇인지 모름). */
export interface WasteView {
  /**
   * `hold` = **직전 기준 카드를 그대로 유지**(연출이 끝날 때까지). 뽑기·매칭 카드가 날아오는 동안
   *   기준 자리가 뒷면으로 바뀌거나 새 카드가 미리 보이면 "중간에 다른 연출이 섞인" 것처럼 보인다
   *   (PO 2026-08-22). 화면은 **도착하는 순간 한 번만** 바뀌어야 한다.
   *   ⚠️ 이때 표시는 상태보다 한 박자 늦다 — 그래서 `wasteShown` 이 false 를 돌려 **보드 탭이 함께 잠긴다**.
   *   "보이는 것과 다른 판정"이 생길 수 없는 이유가 여기 있다.
   */
  readonly kind: 'face' | 'wild' | 'back' | 'hold';
  readonly card?: Card;
}

/** 특수 카드가 **지금 소비돼야 하는가** — 씬이 뷰를 그린 뒤 읽어 연출을 시작한다. */
export interface BoardTriggers {
  readonly bankWild: boolean;
  readonly bonus: boolean;
}

export interface BoardViewInput {
  readonly state: GameState;
  /** 기준 위 와일드 활성(부스터 또는 뽑힌 와일드) — 노출 카드 아무거나 낼 수 있는 상태. */
  readonly wildActive: boolean;
  /**
   * **뽑기 카드가 아직 공개되지 않음** — 무엇이 나올지 모르는 상태라 보드 탭도 함께 잠근다.
   *   기준 자리에는 직전 카드를 그대로 두고(hold), 도착할 때 한 번에 바뀐다.
   */
  readonly drawPending: boolean;
  /**
   * **낸 카드가 기준 자리로 날아가는 중** — 기준 표시만 직전 카드로 잡아 두고(hold) **탭은 막지 않는다**.
   *   막으면 연속으로 낼 수 없어 답답해진다(PO 2026-08-22). 이 구간의 판정 기준은 이미 새 카드지만,
   *   그 카드는 **플레이어가 방금 고른 카드**라 화면과 어긋나 보이지 않는다.
   */
  readonly matchPending?: boolean;
  /**
   * **공개 보류 중인 슬롯들** — 카드를 내면 그 아래가 즉시 노출되지만, 회수 연출이 정점에 닿을 때까지
   *   뒤집지 않는다. 그 사이 "노출됐는데 뒷면"인 상태가 정상이며 탭도 막혀야 한다.
   *   씬이 낼 때 채우고 공개 시점에 비운다(예전의 암묵적 `revealHold` 카운터를 명시 상태로 승격).
   */
  readonly heldReveals: ReadonlySet<string>;
  readonly dealing: boolean;
  readonly ended: boolean;
  /** 보드에 심어진 와일드 슬롯(뱅킹 전까지 아트 유지·탭 불가). */
  readonly wildSlot?: string;
  readonly wildBanked: boolean;
  /** 보드에 심어진 보너스(+N) 슬롯(소비 전까지 아트 유지·탭 불가). */
  readonly bonusSlot?: { readonly id: string; readonly count: number };
  readonly bonusTriggered: boolean;
}

export interface BoardView {
  readonly waste: WasteView;
  readonly slots: ReadonlyMap<string, SlotView>;
  readonly triggers: BoardTriggers;
}

/** 기준 카드가 **제 모습으로** 보이는가 — 보드 탭을 열어도 되는지의 전제. */
export function wasteShown(waste: WasteView): boolean {
  return waste.kind !== 'back' && waste.kind !== 'hold';
}

function wasteViewOf(input: BoardViewInput): WasteView {
  // 연출 중 — 직전 기준 카드를 그대로 유지한다(뒷면으로 바꾸지 않는다).
  if (input.drawPending || input.matchPending) {
    const prev = input.state.waste[input.state.waste.length - 2];
    return prev ? { kind: 'hold', card: prev } : { kind: 'back' };
  }
  const top = wasteTop(input.state);
  if (!top) return { kind: 'back' };
  return top.wild ? { kind: 'wild' } : { kind: 'face', card: top };
}

/**
 * 보드 전체의 목표 표시 상태. 씬은 이 결과대로 그리고, `tappable` 대로 입력을 연다.
 *   같은 입력이면 항상 같은 결과다(순수) — 호출 순서·호출 횟수와 무관.
 */
export function boardView(input: BoardViewInput): BoardView {
  const { state, wildActive, heldReveals, dealing, ended } = input;
  const waste = wasteViewOf(input);
  // 탭을 열 수 있는 전제: 판이 살아 있고, 딜 연출 중이 아니고, 기준 카드가 제 모습으로 보인다.
  // **탭 창** — 딜 중·종료·**뽑기 공개 대기**에만 닫는다. 카드를 내는 연출(matchPending) 중에는 열어 둬
  //   연속으로 낼 수 있게 한다(PO 2026-08-22 "한 장씩 막혀 답답하다").
  const tapWindow = !dealing && !ended && !input.drawPending && waste.kind !== 'back';
  const moves = new Set(availableMoves(state));

  const slots = new Map<string, SlotView>();
  let bankWild = false;
  let bonus = false;

  for (const slot of state.layout.slots) {
    const id = slot.id;
    if (state.cleared.has(id)) continue; // 제거된 슬롯은 뷰가 없다.
    const exposed = isExposed(state, id);
    const isWildSlot = id === input.wildSlot && !input.wildBanked;
    const isBonusSlot = !!input.bonusSlot && id === input.bonusSlot.id && !input.bonusTriggered;
    const held = heldReveals.has(id);

    // 특수 카드는 가려져 있어도 아트를 미리 보여준다(보드 어디에 있는지 프리뷰). 탭은 항상 불가.
    if (isWildSlot || isBonusSlot) {
      slots.set(id, {
        kind: isWildSlot ? 'wild' : 'bonus',
        ...(isBonusSlot ? { bonusCount: input.bonusSlot!.count } : {}),
        highlight: false,
        tappable: false,
        alpha: exposed ? 1 : 0.98,
      });
      // 노출됐고 공개 보류도 아니면 지금 소비할 차례다(딜 연출 중에는 미룬다).
      if (exposed && !held && !dealing) {
        if (isWildSlot) bankWild = true;
        else bonus = true;
      }
      continue;
    }

    if (!exposed) {
      slots.set(id, { kind: 'back', highlight: false, tappable: false, alpha: 0.98 });
      continue;
    }
    if (held) {
      // 노출됐지만 아직 공개 전 — 뒷면이고 누를 수 없다(못 본 카드를 누르는 일 방지).
      slots.set(id, { kind: 'back', highlight: false, tappable: false, alpha: 1 });
      continue;
    }
    slots.set(id, {
      kind: 'face',
      card: state.board[id],
      // 와일드 활성이면 노출 카드 전부 강조(아무거나 낼 수 있으므로), 아니면 ±1 가능 카드만.
      highlight: wildActive || moves.has(id),
      tappable: tapWindow,
      alpha: 1,
    });
  }

  return { waste, slots, triggers: { bankWild, bonus } };
}
