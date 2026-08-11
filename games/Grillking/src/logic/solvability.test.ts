/**
 * 해결가능성 회귀 테스트 — 레벨 생성이 "구조적으로 못 푸는" 보드를 만들지 않는지 지킨다.
 *
 * 게임 규칙(board.ts)을 그대로 돌리는 휴리스틱 솔버로 다수 시드를 실제 플레이해 승리 가능한지 확인한다.
 * (완전 탐색이 아니라 하한선 — 솔버가 이기면 "확실히 풀림". 못 이겨도 사람은 풀 수 있을 수 있으나,
 *  구조적 결함이 생기면 승률이 급락하므로 임계값으로 회귀를 잡는다.)
 *
 * 과거 결함(모두 이 테스트로 확인·수정):
 *  · 고정 그릴 큐 잠금 — 고정 그릴은 절대 비지 않아 리필이 안 걸려 큐 꼬치가 영구히 갇힘 → 승리 불가.
 *  · 방해(숯/고정) 과다 — 작은 보드에 숯4+고정4 → 자유 그릴 0 → 교착.
 *  · 숯의 코너 배치 — 인접 1칸 뿐이라 냉각 경로가 취약.
 */
import { describe, expect, it } from 'vitest';
import { generateBoard, levelConfig } from './levels.js';
import {
  coolNeighborChar,
  findMatchGrill,
  firstFreeSlot,
  makeRng,
  moveSkewer,
  pinnedRemaining,
  refillEmptyGrills,
  resolveMatch,
  shuffleBoard,
  slotPinned,
} from './board.js';
import type { BoardState, ItemType } from './types.js';

/** 매치·리필·냉각을 자동으로 고정점까지 적용. */
function resolveAll(b: BoardState): BoardState {
  for (;;) {
    const m = findMatchGrill(b);
    if (m !== -1) {
      b = coolNeighborChar(resolveMatch(b, m).board, m).board;
      continue;
    }
    const rf = refillEmptyGrills(b);
    if (rf.refills.length) {
      b = rf.board;
      continue;
    }
    return b;
  }
}

type Move = [number, number, number];

function completingMove(b: BoardState): Move | null {
  for (const t of b.grills) {
    if (t.locked || firstFreeSlot(t) === -1) continue;
    const filled = t.slots.filter((s) => s !== null) as ItemType[];
    if (filled.length !== 2 || filled[0] !== filled[1]) continue;
    for (const g of b.grills) {
      if (g.locked || g.id === t.id) continue;
      for (let i = 0; i < 3; i++) if (g.slots[i] === filled[0] && !slotPinned(g, i)) return [g.id, i, t.id];
    }
  }
  return null;
}

function consolidationMoves(b: BoardState): { m: Move; w: number }[] {
  const out: { m: Move; w: number }[] = [];
  for (const t of b.grills) {
    if (t.locked || firstFreeSlot(t) === -1) continue;
    for (const X of new Set(t.slots.filter((s) => s !== null) as ItemType[])) {
      const cnt = t.slots.filter((s) => s === X).length;
      // 고정(pinned) 꼬치는 제자리에서만 완성되므로(자동 서빙 대상 아님), 같은 종류 고정 앵커가 있는
      // 그릴로 자유 꼬치를 모으는 이동을 강하게 우선한다(고정을 확실히 해소 → 막판 자동 서빙 발동).
      const pinnedAnchor = t.slots.some((s, i) => s === X && slotPinned(t, i));
      const w = cnt + (pinnedAnchor ? 3 : 0);
      for (const g of b.grills) {
        if (g.locked || g.id === t.id) continue;
        for (let i = 0; i < 3; i++) if (g.slots[i] === X && !slotPinned(g, i)) out.push({ m: [g.id, i, t.id], w });
      }
    }
  }
  return out;
}

function freeGrills(b: BoardState): number[] {
  return b.grills.filter((g) => !g.locked && firstFreeSlot(g) !== -1).map((g) => g.id);
}
function hash(b: BoardState): string {
  return b.grills.map((g) => `${g.slots.join(',')}|${g.queue.length}`).join(';') + `#${b.served}`;
}

/**
 * 승리 판정 — 게임의 막판 자동 서빙을 모델링한다: 남은 꼬리(target=수동목표)까지 서빙했고 **고정 꼬치가
 * 하나도 안 남았으면** 자유 꼬리는 게임이 자동으로 마무리하므로 승리 확정. (고정은 자동 서빙 대상 아님 →
 * 플레이어가 직접 다 풀어야 하고, 그래야 자유 꼬리 자동 서빙이 발동한다.)
 */
function won(b: BoardState, target: number): boolean {
  return b.served >= target && pinnedRemaining(b) === 0;
}

/** 한 판 시도 — 완성→합치기→큐배출→탐색→셔플 순의 휴리스틱. 승리하면 true. */
function attempt(board: BoardState, target: number, rng: () => number): boolean {
  let b = resolveAll(board);
  let shuffles = 0;
  let noProg = 0;
  const seen = new Set<string>();
  for (let step = 0; step < 5000; step++) {
    if (won(b, target)) return true;
    const cm = completingMove(b);
    if (cm) {
      b = resolveAll(moveSkewer(b, cm[0], cm[1], cm[2]).board);
      noProg = 0;
      continue;
    }
    const cons = consolidationMoves(b);
    if (cons.length && noProg < 25) {
      const topW = Math.max(...cons.map((c) => c.w));
      const top = cons.filter((c) => c.w >= topW);
      const p = top[Math.floor(rng() * top.length)];
      const nb = resolveAll(moveSkewer(b, p.m[0], p.m[1], p.m[2]).board);
      const k = hash(nb);
      if (seen.has(k)) noProg++;
      else {
        seen.add(k);
        noProg = 0;
      }
      b = nb;
      continue;
    }
    // 큐 배출 — 고정 없는 그릴을 비워 리필 순환(가장 적게 든 그릴부터).
    const drainable = b.grills
      .filter((g) => !g.locked && g.queue.length > 0 && !g.pinned?.some(Boolean) && g.slots.some((s) => s !== null))
      .sort((a, c) => a.slots.filter((s) => s !== null).length - c.slots.filter((s) => s !== null).length);
    if (drainable.length && noProg < 70) {
      const g = drainable[0];
      const slot = g.slots.findIndex((s, i) => s !== null && !slotPinned(g, i));
      const tg = freeGrills(b).filter((id) => id !== g.id);
      if (slot !== -1 && tg.length) {
        b = resolveAll(moveSkewer(b, g.id, slot, tg[Math.floor(rng() * tg.length)]).board);
        noProg++;
        continue;
      }
    }
    // 무작위 탈출.
    const movers: Move[] = [];
    for (const g of b.grills) {
      if (g.locked) continue;
      for (let i = 0; i < 3; i++) if (g.slots[i] !== null && !slotPinned(g, i)) movers.push([g.id, i, -1]);
    }
    const frees = freeGrills(b);
    if (movers.length && frees.length && noProg < 90) {
      const mv = movers[Math.floor(rng() * movers.length)];
      const tg = frees.filter((id) => id !== mv[0]);
      if (tg.length) {
        b = resolveAll(moveSkewer(b, mv[0], mv[1], tg[Math.floor(rng() * tg.length)]).board);
        noProg++;
        continue;
      }
    }
    // 셔플(구출).
    if (movers.length && shuffles < 80) {
      b = resolveAll(shuffleBoard(b, rng));
      shuffles++;
      noProg = 0;
      seen.clear();
      continue;
    }
    break;
  }
  return won(b, target);
}

function solvable(board: BoardState, target: number, tries = 30): boolean {
  for (let k = 0; k < tries; k++) if (attempt(board, target, makeRng(9973 + k * 131))) return true;
  return false;
}

/**
 * 실질(수동) 목표 — 재료 총량 = 목표(잉여 0)이고, **맨 마지막 한 세트(자유 3개)만** 게임이 자동 3매치한다
 * (요구: "마지막 자동매칭은 3개 매칭만"). 고정은 자동 대상 아님 → 플레이어가 직접 해소해야 하며, 그 뒤
 * 목표−3 까지 서빙하면 승리 확정(won() 참조). 즉 사실상 "마지막 한 매치를 뺀 전량 클리어"가 가능해야 한다.
 */
function manualTarget(lv: number): number {
  return levelConfig(lv).targetSkewers - 3;
}

describe('level solvability', () => {
  // 커브 요지 레벨(9칸 시작·그릴 개방·방해 도입·2겹 숯·이형 보드·후반) 샘플.
  const LEVELS = [1, 10, 21, 25, 41, 45, 61, 80, 110, 125, 160, 200, 250, 300];
  const SEEDS = 16;

  it.each(LEVELS)('level %i generates only solvable boards', (lv) => {
    const cfg = levelConfig(lv);
    let win = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const board = generateBoard(cfg, (lv * 100003 + s * 7919) >>> 0);
      if (solvable(board, manualTarget(lv))) win++;
    }
    // 휴리스틱 하한이라 100%를 강제하진 않되, 구조 결함(승률 급락)은 확실히 잡는 임계값.
    expect(win, `level ${lv}: only ${win}/${SEEDS} solvable — 레벨 구조 결함 의심`).toBeGreaterThanOrEqual(SEEDS - 1);
  });

  it('full sweep: all 300 levels are solvable', () => {
    // 전 레벨 × 몇 시드를 가벼운 예산으로 훑고, 놓친 것만 강한 예산으로 재확인 → 0 이어야 한다.
    const fails: string[] = [];
    for (let lv = 1; lv <= 300; lv++) {
      const cfg = levelConfig(lv);
      const target = manualTarget(lv);
      for (let s = 1; s <= 3; s++) {
        const board = generateBoard(cfg, (lv * 100003 + s * 7919) >>> 0);
        if (!solvable(board, target, 8) && !solvable(board, target, 50)) {
          fails.push(`L${lv}#${s}`);
        }
      }
    }
    expect(fails, `해결 불가 레벨: ${fails.slice(0, 10).join(', ')}`).toHaveLength(0);
  });

  it('pinned grills never trap skewers in their queue (structural invariant)', () => {
    // 고정 그릴 큐는 비어 있어야 한다(리필 불가 그릴에 꼬치를 넣으면 영구 잠금).
    for (const lv of LEVELS) {
      const cfg = levelConfig(lv);
      for (let s = 1; s <= 20; s++) {
        const board = generateBoard(cfg, (lv * 7919 + s) >>> 0);
        for (const g of board.grills) {
          if (g.pinned?.some(Boolean)) {
            expect(g.queue.length, `L${lv} grill ${g.id} 고정인데 큐 ${g.queue.length}개(잠김)`).toBe(0);
          }
        }
      }
    }
  });
});
