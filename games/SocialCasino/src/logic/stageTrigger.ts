/**
 * stageTrigger.ts — 퍼즐 특수젬 매치 → 스테이지(어택/레이드) 발동 **판정**(순수 로직).
 *
 * ⭐2026-07-06 #6 정밀화(요청): 발동은 **단일 특수 그룹**(연결된 특수젬 한 묶음, 크기 3 이상) 안에서 담당 종류가
 *   **2개 이상** 매칭됐을 때만 한다. 즉 레이드 발동 = "한 매치에서 **3개 이상 특수젬 그룹** + 그 안에 **레이드 2개 이상**".
 *   기존 스텝 합산(서로 다른 그룹의 1개씩 합쳐 2개)이나 연쇄 스텝 합산으로 인한 오발동을 제거한다.
 *
 * 입력 `groups` = **각 특수 그룹의 종류별 수** 벡터 [attack, raid, spin, …] (board.ResolveStep.specialGroups 를 연쇄 전체에서 모은 것).
 * Phaser 무관 순수 함수(vitest 대상). PlayScene.onStageTrigger 가 이 결정을 그대로 사용한다.
 */
import { SPECIAL_ATTACK, SPECIAL_RAID } from './board.js';

export type StageKind = 'attack' | 'raid' | null;

export interface StageDecision {
  readonly kind: 'attack' | 'raid' | null; // 발동할 스테이지(null=미발동)
  readonly count: number; // 발동 그룹의 해당 종류 수(위력 산정용). 미발동 시 0
}

const NONE: StageDecision = { kind: null, count: 0 };

const sum = (a: readonly number[]): number => a.reduce((x, y) => x + (y > 0 ? y : 0), 0);

/**
 * groups     = 특수 그룹별 종류 수 벡터 [attack, raid, spin, …]. 각 벡터의 합 = 그 그룹의 특수젬 총수.
 * puzzleKind = 이 소스(퍼즐)가 담당하는 스테이지(현 설정=레이드). null 이면 발동 없음.
 * threshold  = **한 그룹**에서 담당 종류를 이 수 이상 매칭해야 발동(기본 2).
 * minGroup   = 그룹의 **특수젬 총수** 하한(기본 3 — "3개 이상 특수 매칭"). 특수 매치 최소 크기라 통상 자동 충족이나 명시.
 */
export function decideStageTrigger(
  groups: readonly number[][],
  puzzleKind: StageKind,
  threshold = 2,
  minGroup = 3,
): StageDecision {
  if (puzzleKind == null) return NONE;
  const idx = puzzleKind === 'attack' ? SPECIAL_ATTACK : SPECIAL_RAID;
  let count = 0;
  let fire = false;
  for (const g of groups) {
    const n = g[idx] ?? 0;
    if (n >= threshold && sum(g) >= minGroup) {
      fire = true;
      count += n; // 발동 그룹의 담당 종류 수만 위력에 반영
    }
  }
  return fire ? { kind: puzzleKind, count } : NONE;
}
