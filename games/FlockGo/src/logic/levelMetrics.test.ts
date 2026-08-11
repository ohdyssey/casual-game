import { describe, expect, it } from 'vitest';
import {
  openings,
  depthStats,
  keystoneScore,
  trapRate,
  maxSameDirCluster,
  boardMetrics,
} from './levelMetrics.js';
import { generateReferenceBoard } from './board.js';
import { mulberry32 } from './rng.js';
import type { Board, Sheep } from './types.js';

const mk = (partial: Partial<Sheep> & Pick<Sheep, 'id' | 'col' | 'row' | 'dir'>): Sheep => ({
  kind: 'normal',
  fuse: 0,
  ...partial,
});

const board = (cols: number, rows: number, sheep: Sheep[]): Board => ({ cols, rows, sheep });

describe('levelMetrics — 손계산 소보드 정합성', () => {
  // 5×5 사슬: s1 몸(2,2) 머리(3,1), 레이 (4,0) 비어 있음 → 즉시 탈출(깊이 1).
  //          s2 몸(0,4) 머리(1,3), 레이 첫 칸 (2,2)=s1 몸칸에 막힘 → s1 이 나가야 열림(깊이 2).
  const twoChain = board(5, 5, [mk({ id: 1, col: 2, row: 2, dir: 'ne' }), mk({ id: 2, col: 0, row: 4, dir: 'ne' })]);

  it('openings — 즉시 탈출 가능 양 수', () => {
    expect(openings(twoChain)).toBe(1);
  });

  it('depthStats — 의존 깊이(물결 라운드)', () => {
    const d = depthStats(twoChain);
    expect(d.solved).toBe(true);
    expect(d.max).toBe(2); // s2 는 2번째 물결
    expect(d.mean).toBeCloseTo(1.5); // (1+2)/2
    expect(d.rounds).toBe(2);
  });

  it('keystoneScore — 하나가 나가면 새로 열리는 양 수', () => {
    // s1 제거 → s2 가 새로 열림 = 연쇄 1.
    expect(keystoneScore(twoChain)).toBe(1);
  });

  it('maxSameDirCluster — 동일 방향 인접 군집(R12 지표)', () => {
    // twoChain: 같은 방향(ne) + s2 머리(1,3)와 s1 몸(2,2)이 대각 이웃 → 군집 2.
    expect(maxSameDirCluster(twoChain)).toBe(2);
    // 방향이 다르면 인접해도 각각 1.
    const mixed = board(5, 5, [mk({ id: 1, col: 2, row: 2, dir: 'ne' }), mk({ id: 2, col: 0, row: 4, dir: 'nw' })]);
    expect(maxSameDirCluster(mixed)).toBe(1);
  });

  it('trapRate — 풀 수 있는 보드 0, 상호 교착 보드 1', () => {
    expect(trapRate(twoChain, 10, mulberry32(1))).toBe(0);
    // 마주보기(상호 차단) — s1 머리(1,3)·s2 머리(3,1)가 서로의 레이를 막고, 막힘 전진도
    // steps−1=0 이라 어떤 행동도 불가 → 모든 롤아웃 즉시 교착.
    const facing = board(5, 5, [mk({ id: 1, col: 0, row: 4, dir: 'ne' }), mk({ id: 2, col: 4, row: 0, dir: 'sw' })]);
    expect(trapRate(facing, 10, mulberry32(2))).toBe(1);
  });

  it('boardMetrics — 결정적(같은 시드 = 같은 결과)이고 난이도는 0~100', () => {
    const ref = generateReferenceBoard();
    const a = boardMetrics(ref, mulberry32(7), 6);
    const b = boardMetrics(ref, mulberry32(7), 6);
    expect(a).toEqual(b);
    expect(a.difficulty).toBeGreaterThanOrEqual(0);
    expect(a.difficulty).toBeLessThanOrEqual(100);
    expect(a.n).toBe(108);
  });
});
