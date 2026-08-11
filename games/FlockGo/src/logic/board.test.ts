import { describe, expect, it } from 'vitest';
import {
  applyExit,
  bombCountForStage,
  boosterRemove,
  flipDir,
  generateBoard,
  generateReferenceBoard,
  isOverlapFree,
  isSolvable,
  moveSheep,
  resolveTap,
  sheepById,
  sheepCountForStage,
  shuffleDirs,
  stageParams,
} from './board.js';
import { maxSameDirCluster } from './levelMetrics.js';
import { mulberry32 } from './rng.js';
import type { Board, Sheep } from './types.js';

const mk = (partial: Partial<Sheep> & Pick<Sheep, 'id' | 'col' | 'row' | 'dir'>): Sheep => ({
  kind: 'normal',
  fuse: 0,
  ...partial,
});

const board3x3 = (sheep: Sheep[]): Board => ({ cols: 3, rows: 3, sheep });

describe('generateBoard', () => {
  it('스테이지 커브 — 마릿수·폭탄(미배치=0)', () => {
    // 캐주얼 곡선 원칙(2026-07-08 플랜): 초반 확실히 쉽게(60) → 램프 → cap 132.
    expect(sheepCountForStage(1)).toBe(60);
    expect(sheepCountForStage(5)).toBe(92);
    expect(sheepCountForStage(99)).toBe(132);
    // 폭탄 양은 아직 미배치(PO 지시 2026-07-07) — 어느 스테이지든 0.
    expect(bombCountForStage(1)).toBe(0);
    expect(bombCountForStage(3)).toBe(0);
    expect(bombCountForStage(11)).toBe(0);
  });

  it('셀 중복 없이 경계 안·체커보드 패리티에 생성되고, 방향은 전부 대각(45°)이다', () => {
    const b = generateBoard(4, mulberry32(7));
    const keys = new Set(b.sheep.map((s) => `${s.col},${s.row}`));
    expect(keys.size).toBe(b.sheep.length);
    for (const s of b.sheep) {
      expect(s.col).toBeGreaterThanOrEqual(0);
      expect(s.col).toBeLessThan(b.cols);
      expect(s.row).toBeGreaterThanOrEqual(0);
      expect(s.row).toBeLessThan(b.rows);
      // 체커보드 패리티(45° 격자) 칸에만 배치.
      expect(((s.col + s.row) % 2 + 2) % 2).toBe(0);
      expect(['ne', 'se', 'sw', 'nw']).toContain(s.dir);
    }
  });

  it('4방향 모두 등장하되, 로브 실루엣 탓에 편중은 허용한다(레퍼런스도 44/27/20/17로 불균등)', () => {
    const b = generateBoard(5, mulberry32(4));
    const c: Record<string, number> = { ne: 0, se: 0, sw: 0, nw: 0 };
    for (const s of b.sheep) c[s.dir] += 1;
    // 4방향 모두 등장(0마리인 방향 없음) — 균등 배분은 더 이상 요구하지 않는다(비대칭 실루엣 의도).
    for (const d of ['ne', 'se', 'sw', 'nw'] as const) expect(c[d]).toBeGreaterThan(0);
    // 다만 한 방향이 압도적(전체 70% 이상)이지는 않아야 한다(4방향 구조 자체는 유지).
    const vals = Object.values(c);
    expect(Math.max(...vals)).toBeLessThan(b.sheep.length * 0.7);
  });

  it('생성 보드는 항상 해결 가능하다(시드 30종)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const stage = 1 + (seed % 12);
      expect(isSolvable(generateBoard(stage, mulberry32(seed)))).toBe(true);
    }
  });

  it('초기 배치 — 어떤 양도 시각적으로 겹치지 않는다(회전 AABB, 측면 살짝 겹침만 허용)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const b = generateBoard(1 + (seed % 8), mulberry32(seed));
      expect(isOverlapFree(b)).toBe(true);
    }
  });

  it('빈틈없이 꽉 채운다 — 마름모 내부에 통과 가능한 빈 채널이 없다(도미노 완전덮음)', () => {
    // 목표수 이상 배치되고(트림 전 완전덮음), 트림 후에도 목표수를 채운다.
    for (let seed = 1; seed <= 6; seed++) {
      const b = generateBoard(3, mulberry32(seed));
      expect(b.sheep.length).toBe(sheepCountForStage(3));
    }
  });

  it('폭탄 양은 스폰되지 않는다(미배치)', () => {
    const b = generateBoard(7, mulberry32(3));
    expect(b.sheep.filter((s) => s.kind === 'bomb').length).toBe(0);
  });
});

describe('스테이지 스케줄·검수(레벨 설계 원칙, 2026-07-08 플랜)', () => {
  it('톱니 목표 — 완화 스테이지(5의 배수)는 직전보다 목표 난이도·마릿수가 낮다', () => {
    for (const s of [5, 10, 15, 20]) {
      expect(stageParams(s).targetDifficulty).toBeLessThan(stageParams(s - 1).targetDifficulty);
      expect(stageParams(s).count).toBeLessThan(stageParams(s - 1).count);
    }
    // 비완화 구간은 램프 상승(단조).
    expect(stageParams(2).targetDifficulty).toBeGreaterThan(stageParams(1).targetDifficulty);
    expect(stageParams(7).targetDifficulty).toBeGreaterThan(stageParams(6).targetDifficulty);
  });

  it('생성 보드 스윕 — R12 동일방향 군집≤4 + 해결가능 + 겹침0', () => {
    for (const stage of [1, 2, 3, 5, 8, 10, 12, 15, 17, 20]) {
      const b = generateBoard(stage, mulberry32(stage * 13 + 7));
      expect(isSolvable(b)).toBe(true);
      expect(isOverlapFree(b)).toBe(true);
      expect(maxSameDirCluster(b)).toBeLessThanOrEqual(4);
    }
  }, 180000);
});

describe('generateReferenceBoard — 레퍼런스 사본(PO 규칙 2026-07-08)', () => {
  it('규칙① 겹침 없음 ② 교착 없음(해결가능) ③ 1양=2칸(도미노 보존)', () => {
    const b = generateReferenceBoard();
    expect(b.sheep.length).toBe(108);
    expect(isOverlapFree(b)).toBe(true); // ① 그리드 상 양 겹침 금지
    expect(isSolvable(b)).toBe(true); // ② 같은 라인 상호 교착 금지(항상 완주 가능)
    // ③ 길이 기준 2그리드=1양 — 몸+머리 2칸이 전부 서로소(216칸)
    const cells = new Set<string>();
    for (const s of b.sheep) {
      const v = { ne: { dx: 1, dy: -1 }, se: { dx: 1, dy: 1 }, sw: { dx: -1, dy: 1 }, nw: { dx: -1, dy: -1 } }[s.dir];
      cells.add(`${s.col},${s.row}`);
      cells.add(`${s.col + v.dx},${s.row + v.dy}`);
    }
    expect(cells.size).toBe(216);
  });

  it('결정적 — 두 번 생성해도 동일', () => {
    const a = generateReferenceBoard();
    const b = generateReferenceBoard();
    expect(a.sheep).toEqual(b.sheep);
  });
});

describe('resolveTap — 대각 이동', () => {
  it('길이 비면 exit + 경계까지 남은 칸 수', () => {
    // (0,2)에서 ne(↗) → (1,1),(2,0) 지나 밖으로.
    const b = board3x3([mk({ id: 1, col: 0, row: 2, dir: 'ne' })]);
    expect(resolveTap(b, 1)).toEqual({ kind: 'exit', steps: 2 });
  });

  it('막히면 blocked + 블로커 직전까지 칸 수', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 2, dir: 'ne' }),
      mk({ id: 2, col: 2, row: 0, dir: 'nw' }),
    ]);
    expect(resolveTap(b, 1)).toEqual({ kind: 'blocked', steps: 1, blockerId: 2 });
  });

  it('바로 옆(대각)이 막히면 steps 0', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 2, dir: 'ne' }),
      mk({ id: 2, col: 1, row: 1, dir: 'nw' }),
    ]);
    expect(resolveTap(b, 1)).toEqual({ kind: 'blocked', steps: 0, blockerId: 2 });
  });

  it('경계 셀에서 밖을 보면 steps 0 으로 즉시 exit', () => {
    const b = board3x3([mk({ id: 1, col: 2, row: 1, dir: 'ne' })]);
    expect(resolveTap(b, 1)).toEqual({ kind: 'exit', steps: 0 });
  });

  it('대각선이 아닌 칸(옆 열 직선상)은 경로에 걸리지 않는다', () => {
    // (0,2) ne 경로는 (1,1),(2,0) — (1,2)나 (0,1)의 양은 무관.
    const b = board3x3([
      mk({ id: 1, col: 0, row: 2, dir: 'ne' }),
      mk({ id: 2, col: 1, row: 2, dir: 'nw' }),
      mk({ id: 3, col: 0, row: 1, dir: 'se' }),
    ]);
    expect(resolveTap(b, 1)).toEqual({ kind: 'exit', steps: 2 });
  });

  it('앞칸(머리칸)도 점유 — 다른 양의 머리칸을 통과하지 못한다', () => {
    // 6×6. s1 (0,5) ne → 경로 (1,4)(2,3)(3,2)(4,1)(5,0).
    // s2 는 몸칸 (4,-?) 밖이고 머리칸이 (3,2)에 놓이도록: s2 body (2,3) dir se? head=(3,4) 아님.
    // 간단히: s2 body (4,1) dir 무관이면 몸칸이 경로에 있음(기존도 잡음). 머리칸만 걸리는 케이스:
    //   s2 body (5,2) dir sw → head (4,3)?? 경로 아님. body (2,1) dir se → head (3,2) ∈ 경로.
    const board6 = (sheep: Sheep[]): Board => ({ cols: 6, rows: 6, sheep });
    const b = board6([
      mk({ id: 1, col: 0, row: 5, dir: 'ne' }),
      mk({ id: 2, col: 2, row: 1, dir: 'se' }), // 몸칸(2,1) 경로 밖, 머리칸=(3,2) 경로 위
    ]);
    const r = resolveTap(b, 1);
    // 몸칸만 봤다면 exit(steps 5) 였겠지만, 머리칸(3,2)에서 막혀야 한다.
    expect(r?.kind).toBe('blocked');
    expect(r).toMatchObject({ kind: 'blocked', steps: 2, blockerId: 2 });
  });
});

describe('moveSheep — 막힘 전진(복귀 없음)', () => {
  it('블로커 직전 칸으로 위치가 확정된다', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 2, dir: 'ne' }),
      mk({ id: 2, col: 2, row: 0, dir: 'nw' }),
    ]);
    const r = resolveTap(b, 1);
    expect(r).toEqual({ kind: 'blocked', steps: 1, blockerId: 2 });
    const moved = moveSheep(b, 1, 1);
    expect(sheepById(moved, 1)).toMatchObject({ col: 1, row: 1 });
    // 전진 후 재탭 → 바로 옆이 막혀 steps 0.
    expect(resolveTap(moved, 1)).toEqual({ kind: 'blocked', steps: 0, blockerId: 2 });
  });

  it('steps 0 이면 보드 불변', () => {
    const b = board3x3([mk({ id: 1, col: 0, row: 2, dir: 'ne' })]);
    expect(moveSheep(b, 1, 0)).toBe(b);
  });
});

describe('applyExit — 폭탄 fuse(메커닉 유지)', () => {
  it('탈출 시 남은 폭탄 fuse 가 1 줄고, 0 이 되면 explodedIds 에 담긴다', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 0, dir: 'nw' }),
      mk({ id: 2, col: 2, row: 2, dir: 'se', kind: 'bomb', fuse: 1 }),
    ]);
    const out = applyExit(b, 1);
    expect(out.board.sheep.length).toBe(1);
    expect(out.explodedIds).toEqual([2]);
  });

  it('fuse 가 남아 있으면 폭발하지 않는다', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 0, dir: 'nw' }),
      mk({ id: 2, col: 2, row: 2, dir: 'se', kind: 'bomb', fuse: 3 }),
    ]);
    const out = applyExit(b, 1);
    expect(out.explodedIds).toEqual([]);
    expect(sheepById(out.board, 2)?.fuse).toBe(2);
  });

  it('원본 보드는 변형되지 않는다(불변)', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 0, dir: 'nw' }),
      mk({ id: 2, col: 2, row: 2, dir: 'se', kind: 'bomb', fuse: 3 }),
    ]);
    applyExit(b, 1);
    expect(b.sheep.length).toBe(2);
    expect(sheepById(b, 2)?.fuse).toBe(3);
  });
});

describe('부스터', () => {
  it('제거 — fuse 진행 없이 그 양만 빠진다', () => {
    const b = board3x3([
      mk({ id: 1, col: 0, row: 0, dir: 'nw' }),
      mk({ id: 2, col: 2, row: 2, dir: 'se', kind: 'bomb', fuse: 2 }),
    ]);
    const out = boosterRemove(b, 1);
    expect(out.sheep.length).toBe(1);
    expect(sheepById(out, 2)?.fuse).toBe(2);
  });

  it('전환 — 방향 180° 반전(대각)', () => {
    const b = board3x3([mk({ id: 1, col: 1, row: 1, dir: 'ne' })]);
    expect(sheepById(flipDir(b, 1), 1)?.dir).toBe('sw');
    const b2 = board3x3([mk({ id: 1, col: 1, row: 1, dir: 'nw' })]);
    expect(sheepById(flipDir(b2, 1), 1)?.dir).toBe('se');
  });

  it('섞기 — 위치·id 보존, 결과는 항상 해결 가능', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const b = generateBoard(6, mulberry32(seed));
      // 전환 부스터 등으로 방향이 뒤틀렸다고 가정하고 전부 ne 로 고정.
      const broken: Board = { ...b, sheep: b.sheep.map((s) => ({ ...s, dir: 'ne' as const })) };
      const shuffled = shuffleDirs(broken, mulberry32(seed + 100));
      expect(shuffled.sheep.map((s) => [s.id, s.col, s.row])).toEqual(
        b.sheep.map((s) => [s.id, s.col, s.row]),
      );
      expect(isSolvable(shuffled)).toBe(true);
    }
  });
});
