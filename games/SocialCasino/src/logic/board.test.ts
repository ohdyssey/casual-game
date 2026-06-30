import { describe, it, expect } from 'vitest';
import {
  createGrid,
  findRuns,
  groupMatches,
  collapse,
  resolveSwap,
  comboMultiplier,
  isAdjacent,
  hasAnyMove,
  countAvailableMoves,
  impactForGroup,
  tierForStage,
  powerForMatch,
  powerCells,
  encodePower,
  isPower,
  powerKind,
  powerColor,
  isSpecial,
  POWER_LINE_H,
  POWER_LINE_V,
  POWER_BOMB,
  SPECIAL_BASE,
  SPECIAL_SPIN,
  type Grid,
  type MatchGroup,
  type MatchShape,
} from './board.js';
import { makeRng } from './rng.js';

describe('createGrid', () => {
  it('has the requested shape and no initial matches', () => {
    const g = createGrid(6, 5, 6, makeRng(42));
    expect(g.length).toBe(6);
    expect(g[0].length).toBe(5);
    expect(findRuns(g).matched.length).toBe(0);
  });
});

describe('findRuns', () => {
  it('detects a horizontal run of 3', () => {
    const g: Grid = [
      [1, 1, 1, 2],
      [2, 3, 0, 3],
    ];
    const { matched, runs } = findRuns(g);
    expect(runs).toEqual([3]);
    expect(matched).toHaveLength(3);
    expect(matched.every((m) => m.r === 0)).toBe(true);
  });

  it('detects a vertical run of 4', () => {
    const g: Grid = [
      [1, 2],
      [1, 3],
      [1, 0],
      [1, 4],
    ];
    const { matched, runs } = findRuns(g);
    expect(runs).toEqual([4]);
    expect(matched).toHaveLength(4);
  });

  it('ignores empty cells (-1)', () => {
    const g: Grid = [[-1, -1, -1, 2]];
    expect(findRuns(g).matched).toHaveLength(0);
  });

  it('deduplicates a cell shared by an L (cross) match', () => {
    // 가로 3 + 세로 3 이 (0,0) 공유 → 좌표 5개(중복 1 제거), run 2개
    const g: Grid = [
      [1, 1, 1],
      [1, 2, 2],
      [1, 0, 0],
    ];
    const { matched, runs } = findRuns(g);
    expect(runs.sort()).toEqual([3, 3]);
    expect(matched).toHaveLength(5);
  });
});

describe('groupMatches (모양 인식)', () => {
  const groupsOf = (g: Grid) => groupMatches(findRuns(g).matched, g);

  it('직선 가로 4 → 한 그룹 size 4 line', () => {
    const groups = groupsOf([[1, 1, 1, 1, 2]]);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(4);
    expect(groups[0].shape).toBe('line');
  });

  it('L자(코너 공유) → 직선 2개가 아니라 한 그룹 size 5 L', () => {
    // findRuns 는 [3,3] 으로 보지만 groupMatches 는 5칸 한 그룹.
    const groups = groupsOf([
      [1, 1, 1],
      [1, 2, 2],
      [1, 0, 0],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(5);
    expect(groups[0].shape).toBe('L');
  });

  it('T자(가로3 + 끝에서 세로) → size 5 T', () => {
    const groups = groupsOf([
      [1, 1, 1],
      [2, 1, 3],
      [4, 1, 5],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(5);
    expect(groups[0].shape).toBe('T');
  });

  it('十자(가로3 × 세로3 중앙 교차) → size 5 cross', () => {
    const groups = groupsOf([
      [6, 1, 7],
      [1, 1, 1],
      [8, 1, 9],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(5);
    expect(groups[0].shape).toBe('cross');
  });

  it('서로 떨어진 두 색 매치 → 별개 그룹 2개', () => {
    const groups = groupsOf([
      [1, 1, 1, 9, 2, 2, 2],
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((gr) => gr.size === 3 && gr.shape === 'line')).toBe(true);
  });
});

describe('collapse', () => {
  it('clears matched cells and refills the column from the top', () => {
    const g: Grid = [
      [1, 9],
      [1, 8],
      [1, 7],
    ];
    const matched = [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 2, c: 0 },
    ];
    const next = collapse(g, matched, 6, makeRng(1));
    // col 1 은 불변, col 0 은 새 타일로 가득.
    expect(next.map((row) => row[1])).toEqual([9, 8, 7]);
    expect(next.every((row) => row[0] >= 0 && row[0] < 6)).toBe(true);
  });

  it('applies gravity to surviving tiles', () => {
    const g: Grid = [
      [5, 0],
      [1, 0],
      [2, 0],
    ];
    // 가운데(1,0) 제거 → 위 타일이 내려와야 함.
    const next = collapse(g, [{ r: 1, c: 0 }], 6, makeRng(2));
    // 살아남은 5,2 가 아래로: [new, 5, 2]
    expect(next[1][0]).toBe(5);
    expect(next[2][0]).toBe(2);
  });
});

describe('comboMultiplier', () => {
  it('scales with run length', () => {
    expect(comboMultiplier(3)).toBe(1);
    expect(comboMultiplier(4)).toBe(2);
    expect(comboMultiplier(5)).toBe(3);
    expect(comboMultiplier(6)).toBe(5);
    expect(comboMultiplier(8)).toBe(5);
  });
});

describe('isAdjacent', () => {
  it('is true for orthogonal neighbors only', () => {
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe(true);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 1, c: 0 })).toBe(true);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe(false);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 0 })).toBe(false);
  });
});

describe('resolveSwap', () => {
  it('returns valid=false and leaves grid unchanged when swap makes no match', () => {
    const g: Grid = [
      [0, 1, 2],
      [3, 4, 5],
      [0, 1, 2],
    ];
    const res = resolveSwap(g, { r: 0, c: 0 }, { r: 0, c: 1 }, 6, makeRng(3));
    expect(res.valid).toBe(false);
    expect(res.spins).toBe(0);
    expect(res.finalGrid).toEqual(g);
  });

  it('earns spins and a multiplier when the swap creates a match', () => {
    // 스왑 (0,2)<->(1,2) 하면 열 2 가 [2,2,2] 세로매치.
    const g: Grid = [
      [0, 1, 2],
      [3, 4, 0],
      [5, 6, 2],
    ];
    // 위 격자로는 직접 맞추기 까다로우니, 가로 매치가 보장되는 구성으로 검증.
    const g2: Grid = [
      [7, 1, 1],
      [3, 4, 5],
      [6, 0, 2],
    ];
    // (0,0)=7 <-> (0,1)? no. 대신 명시적 가로: 첫 행을 [1,7,1] 로 두고 (0,1)<->(1,1)
    const g3: Grid = [
      [1, 7, 1],
      [2, 1, 3],
      [4, 5, 6],
    ];
    const res = resolveSwap(g3, { r: 0, c: 1 }, { r: 1, c: 1 }, 8, makeRng(7));
    expect(res.valid).toBe(true);
    expect(res.spins).toBeGreaterThanOrEqual(1);
    expect(res.multiplier).toBeGreaterThanOrEqual(1);
    expect(res.cleared).toBeGreaterThanOrEqual(3);
    void g;
    void g2;
  });
});

describe('hasAnyMove', () => {
  it('detects an available swap', () => {
    const g: Grid = [
      [1, 7, 1],
      [2, 1, 3],
      [4, 5, 6],
    ];
    expect(hasAnyMove(g)).toBe(true);
  });
});

describe('countAvailableMoves (매칭 발견성)', () => {
  it('counts at least one move on a board with a known swap', () => {
    const g: Grid = [
      [1, 7, 1],
      [2, 1, 3],
      [4, 5, 6],
    ];
    expect(countAvailableMoves(g)).toBeGreaterThanOrEqual(1);
  });

  it('cap short-circuits the count (never exceeds cap)', () => {
    const g = createGrid(6, 6, 5, makeRng(7));
    expect(countAvailableMoves(g, 1)).toBeLessThanOrEqual(1);
    expect(countAvailableMoves(g, 3)).toBeLessThanOrEqual(3);
  });

  it('a grid too small to form any 3-run returns 0 and agrees with hasAnyMove === false', () => {
    // 2x2(서로 다른 값) — 어떤 인접 스왑도 3연속을 만들 수 없으므로 가용 매치 0(완전 교착과 동치).
    const g: Grid = [
      [0, 1],
      [2, 3],
    ];
    expect(countAvailableMoves(g)).toBe(0);
    expect(hasAnyMove(g)).toBe(false);
  });

  it('agrees with hasAnyMove (cap=1) across several generated boards', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const g = createGrid(6, 6, 5, makeRng(seed));
      const n = countAvailableMoves(g);
      expect(n).toBe(countAvailableMoves(g, Infinity));
      expect(n > 0).toBe(hasAnyMove(g));
      expect(n).toBeLessThanOrEqual(60); // 6x6 인접쌍 상한(30 가로 + 30 세로)
    }
  });
});

describe('tierForStage (스테이지별 임팩트 상승)', () => {
  it('스테이지가 오를수록 티어가 단조 상승', () => {
    expect(tierForStage(0)).toBe(0);
    expect(tierForStage(1)).toBe(1);
    expect(tierForStage(5)).toBe(2);
    expect(tierForStage(20)).toBe(3);
    expect(tierForStage(50)).toBe(4);
    expect(tierForStage(150)).toBe(5);
    expect(tierForStage(500)).toBe(6);
  });
});

describe('impactForGroup (파워 매치: 라인/십자/폭탄)', () => {
  const fill = (rows: number, cols: number, v = 1): Grid =>
    Array.from({ length: rows }, () => new Array<number>(cols).fill(v));
  const grid = fill(6, 6, 1);
  const grp = (cells: { r: number; c: number }[], size: number, shape: MatchShape, special = false): MatchGroup =>
    ({ cells, size, shape, special });

  it('3매치·tier0·특수젬은 임팩트 없음', () => {
    expect(impactForGroup(grp([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], 3, 'line'), 3, grid)).toBeNull();
    expect(impactForGroup(grp([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }], 4, 'line'), 0, grid)).toBeNull();
    expect(impactForGroup(grp([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }], 4, 'line', true), 3, grid)).toBeNull();
  });

  it('4직선 가로 → 한 줄(행) 삭제 (tier1, 6칸)', () => {
    const imp = impactForGroup(grp([{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }], 4, 'line'), 1, grid);
    expect(imp?.kind).toBe('line-row');
    expect(imp?.cells.length).toBe(6);
    expect(imp?.cells.every((p) => p.r === 2)).toBe(true);
  });

  it('4직선 세로 → 한 줄(열) 삭제', () => {
    const imp = impactForGroup(grp([{ r: 0, c: 3 }, { r: 1, c: 3 }, { r: 2, c: 3 }, { r: 3, c: 3 }], 4, 'line'), 1, grid);
    expect(imp?.kind).toBe('line-col');
    expect(imp?.cells.every((p) => p.c === 3)).toBe(true);
  });

  it('고티어(≥4) 가로 4직선 → 2줄(12칸)', () => {
    const imp = impactForGroup(grp([{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }], 4, 'line'), 4, grid);
    expect(imp?.kind).toBe('line-row');
    expect(imp?.cells.length).toBe(12);
  });

  it('L/T → 십자(행+열) (tier2, 11칸)', () => {
    const cells = [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 1, c: 1 }, { r: 3, c: 1 }];
    const imp = impactForGroup(grp(cells, 5, 'T'), 2, grid);
    expect(imp?.kind).toBe('cross');
    expect(imp?.cells.length).toBe(11); // 행6 + 열(6-1 중복) = 11
  });

  it('十(cross) → 폭탄 3×3 (tier3, 9칸)', () => {
    const cells = [{ r: 2, c: 2 }, { r: 1, c: 2 }, { r: 3, c: 2 }, { r: 2, c: 1 }, { r: 2, c: 3 }];
    const imp = impactForGroup(grp(cells, 5, 'cross'), 3, grid);
    expect(imp?.kind).toBe('bomb');
    expect(imp?.cells.length).toBe(9);
  });

  it('5직선 → 컬러폭탄: 같은 색 전체 (tier5)', () => {
    const g2 = fill(6, 6, 2);
    g2[0][0] = 1; // 색1 1칸 — 컬러폭탄은 origin 색(2)만 지움
    const cells = [{ r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }, { r: 3, c: 5 }];
    const imp = impactForGroup(grp(cells, 5, 'line'), 5, g2);
    expect(imp?.kind).toBe('colorbomb');
    expect(imp?.cells.every((p) => g2[p.r][p.c] === 2)).toBe(true);
    expect(imp?.cells.length).toBe(35); // 36 - [0][0]
  });
});

describe('resolveSwap 임팩트(tier) 통합', () => {
  // (0,2)<->(1,2) 스왑 시 row0 가 [1,1,1,1,..] 4매치(사전 매치 없음).
  const base = (): Grid => [
    [1, 1, 2, 1, 0, 3],
    [4, 5, 1, 6, 2, 4],
    [2, 3, 4, 5, 6, 2],
    [3, 4, 5, 6, 2, 3],
    [4, 5, 6, 2, 3, 4],
    [5, 6, 3, 4, 5, 1],
  ];
  const A = { r: 0, c: 2 };
  const B = { r: 1, c: 2 };

  it('tier=0 → 임팩트 없음(하위호환)', () => {
    const res = resolveSwap(base(), A, B, 7, makeRng(1), undefined, 0);
    expect(res.valid).toBe(true);
    expect(res.steps[0].impacts).toEqual([]);
  });

  it('tier≥1 → 4매치가 라인 임팩트 발동, 첫 단계 제거 수 증가', () => {
    const r0 = resolveSwap(base(), A, B, 7, makeRng(1), undefined, 0);
    const r2 = resolveSwap(base(), A, B, 7, makeRng(1), undefined, 2);
    expect(r2.steps[0].impacts.length).toBe(1);
    expect(r2.steps[0].impacts[0].kind).toBe('line-row');
    // 라인 삭제로 첫 단계 제거 칸이 4 → 행 전체(6)로 늘어남
    expect(r2.steps[0].matched.length).toBeGreaterThan(r0.steps[0].matched.length);
  });
});

describe('파워 타일 (Phase 2 지속형)', () => {
  const grp = (cells: { r: number; c: number }[], size: number, shape: MatchShape, special = false): MatchGroup =>
    ({ cells, size, shape, special });
  const fill = (rows: number, cols: number, v = 1): Grid =>
    Array.from({ length: rows }, () => new Array<number>(cols).fill(v));

  it('인코딩 roundtrip + 특수/파워 범위 구분', () => {
    const p = encodePower(POWER_LINE_H, 2);
    expect(isPower(p)).toBe(true);
    expect(powerKind(p)).toBe(POWER_LINE_H);
    expect(powerColor(p)).toBe(2);
    expect(isSpecial(p)).toBe(false); // 파워(200+)는 특수(100~199) 아님
    expect(isSpecial(SPECIAL_BASE + 1)).toBe(true);
    expect(isPower(SPECIAL_BASE + 1)).toBe(false);
  });

  it('powerForMatch: 4가로=LINE_H · 4세로=LINE_V · L/T·5+=BOMB', () => {
    const g = fill(6, 6, 3);
    expect(powerForMatch(grp([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }], 4, 'line'), g))
      .toEqual({ kind: POWER_LINE_H, color: 3 });
    expect(powerForMatch(grp([{ r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }, { r: 3, c: 1 }], 4, 'line'), g)?.kind)
      .toBe(POWER_LINE_V);
    expect(powerForMatch(grp([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 1 }, { r: 2, c: 1 }], 5, 'T'), g)?.kind)
      .toBe(POWER_BOMB);
    expect(powerForMatch(grp([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], 3, 'line'), g)).toBeNull();
  });

  it('powerCells: 라인=행/열, 폭탄=3×3', () => {
    const g = fill(6, 6, 1);
    expect(powerCells(encodePower(POWER_LINE_H, 1), { r: 2, c: 2 }, g).length).toBe(6);
    expect(powerCells(encodePower(POWER_LINE_V, 1), { r: 2, c: 2 }, g).length).toBe(6);
    expect(powerCells(encodePower(POWER_BOMB, 1), { r: 2, c: 2 }, g).length).toBe(9);
  });

  it('resolveSwap persistent: 4매치가 파워 타일을 생성(보드에 남음)', () => {
    // (0,2)<->(1,2) 스왑 → row0 [1,1,1,1..] 4매치 → 파워 생성.
    const g: Grid = [
      [1, 1, 2, 1, 0, 3],
      [4, 5, 1, 6, 2, 4],
      [2, 3, 4, 5, 6, 2],
      [3, 4, 5, 6, 2, 3],
      [4, 5, 6, 2, 3, 4],
      [5, 6, 3, 4, 5, 1],
    ];
    const res = resolveSwap(g, { r: 0, c: 2 }, { r: 1, c: 2 }, 7, makeRng(1), undefined, 3, true);
    expect(res.valid).toBe(true);
    expect(res.steps[0].gridAfter.flat().some(isPower)).toBe(true); // 파워 타일 생성됨
  });

  it('파워 타일이 매치되면 발동: powerCells 만큼 추가 제거', () => {
    const P = encodePower(POWER_LINE_H, 1); // 가로 라인, 색1
    const g: Grid = [
      [1, P, 2, 5, 0, 3], // P @ (0,1) 색1
      [4, 5, 1, 6, 2, 4], // (1,2)=1
      [2, 3, 4, 5, 6, 2],
      [3, 4, 6, 2, 3, 5],
      [4, 5, 2, 6, 5, 4],
      [5, 6, 3, 4, 2, 1],
    ];
    // (0,2)<->(1,2): (0,2)=2↔(1,2)=1 → row0 [1,P,1] 색1 3매치 → P 발동(가로 라인).
    const res = resolveSwap(g, { r: 0, c: 2 }, { r: 1, c: 2 }, 7, makeRng(1), undefined, 0, false);
    expect(res.valid).toBe(true);
    expect(res.steps[0].impacts.some((i) => i.kind === 'line-row')).toBe(true);
    expect(res.steps[0].matched.length).toBeGreaterThanOrEqual(6); // 행 전체 제거
  });
});

describe('special gems', () => {
  const ATK = SPECIAL_BASE + 0;
  const RAID = SPECIAL_BASE + 1;
  const SPIN = SPECIAL_BASE + SPECIAL_SPIN; // 102

  it('special gems match as one group regardless of kind', () => {
    expect(findRuns([[ATK, RAID, SPIN, 0]]).matched.length).toBe(3); // 종류 섞여도 특수끼리 매치
  });

  it('regular tiles match by color only (a special breaks a color run)', () => {
    const g: Grid = [[0, 0, SPIN, 0]];
    expect(findRuns(g).matched.length).toBe(0);
  });

  it('resolveSwap reports collected specials by kind from a group match', () => {
    // swap (0,2)<->(1,2) makes row0 = [ATK,RAID,SPIN] → special group match (mixed kinds).
    const g: Grid = [
      [ATK, RAID, 0],
      [0, 1, SPIN],
    ];
    const res = resolveSwap(g, { r: 0, c: 2 }, { r: 1, c: 2 }, 2, makeRng(1));
    expect(res.valid).toBe(true);
    expect(res.collected[0]).toBe(1); // attack (total)
    expect(res.collected[1]).toBe(1); // raid
    expect(res.collected[SPECIAL_SPIN]).toBe(1); // spin
    // 콤보 단계별 수집(첫 매치=성격 결정용) — 이 단계의 [공격,약탈,스핀].
    expect(res.steps[0].collected).toEqual([1, 1, 1]);
  });

  it('default resolveSwap (no spawn) never introduces specials', () => {
    const g = createGrid(6, 6, 5, makeRng(5));
    const res = resolveSwap(g, { r: 0, c: 0 }, { r: 0, c: 1 }, 5, makeRng(5));
    const anySpecial = res.finalGrid.some((row) => row.some((v) => v >= SPECIAL_BASE));
    expect(anySpecial).toBe(false);
  });
});
