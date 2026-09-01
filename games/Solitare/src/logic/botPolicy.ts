/**
 * botPolicy.ts — **자동테스트 봇의 수 선택 정책**(순수, Phaser-free) — 단일 출처.
 *
 * PO 2026-08-23: "자동화 테스트는 플레이어가 **가장 스마트한 플레이**를 한다고 가정한다."
 * 씬 내장 시뮬(PlayScene.simTick)과 튜닝 시뮬레이터(scripts/play-sim.mts)가 **같은 정책**을 써야
 * 실측과 예측이 어긋나지 않는다 — 그래서 여기 한 곳에만 둔다.
 *
 * 정책(스마트 플레이어 근사):
 *   1) **연쇄 우선** — 이 수를 두면 뽑기 없이 몇 수를 이어갈 수 있는가(깊이 2, 상위 3분기 DFS).
 *      콤보를 끊지 않아야 미션 틱(연속 5매칭)이 터진다.
 *   2) 같으면 **많이 여는 수**(가려진 카드를 최다 노출).
 */
import { availableMoves, playCard, type GameState } from './tripeaks.js';

/** 이 수로 새로 노출되는 카드 수. */
export function openGain(state: GameState, id: string): number {
  let gain = 0;
  for (const o of state.layout.slots) {
    if (state.cleared.has(o.id) || !o.coveredBy.includes(id)) continue;
    if (o.coveredBy.every((c) => c === id || state.cleared.has(c))) gain++;
  }
  return gain;
}

/** 이 수를 두면 뽑기 없이 몇 수를 연달아 낼 수 있는가(깊이 제한 DFS — 상위 3분기만). */
export function chainLen(state: GameState, id: string, depth: number): number {
  const t = playCard(state, id);
  if (depth <= 0) return 1;
  const ms = availableMoves(t);
  if (!ms.length) return 1;
  let best = 0;
  for (const m of ms.slice(0, 3)) best = Math.max(best, chainLen(t, m, depth - 1));
  return 1 + best;
}

/**
 * 지금 낼 수 있는 수 가운데 **가장 스마트한 수**를 고른다(동점이면 배열로 — 호출부가 하나 뽑는다).
 * @param chainAware false 면 연쇄 계산 없이 오픈 수만 본다(와일드 자유수 — 매칭 제약이 없어 연쇄 무의미).
 */
export function pickBotMoves(state: GameState, ids: readonly string[], chainAware = true): string[] {
  let bv = -1;
  let best: string[] = [];
  for (const id of ids) {
    const v = chainAware ? chainLen(state, id, 2) * 10 + openGain(state, id) : openGain(state, id);
    if (v > bv) {
      bv = v;
      best = [id];
    } else if (v === bv) best.push(id);
  }
  return best;
}
