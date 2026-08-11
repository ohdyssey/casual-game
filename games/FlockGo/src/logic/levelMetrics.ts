/**
 * levelMetrics.ts — 레벨(보드)의 **의존 구조·난이도 지표** 계산(순수 로직, Phaser 무관).
 *
 * 설계 근거(외부 게임 레벨디자인 조사, 2026-07-08 플랜):
 *   · 이 장르(탭 탈출 = 분해 퍼즐)의 본질은 의존 그래프(DAG) — "T가 나가야 S가 나갈 수 있다".
 *   · 난이도 ≠ 풀이 길이. 체감 난이도 = 열림 수(openings) + 의존 깊이(depth) + 함정(trap).
 *     (슬라이딩 퍼즐 연구: counterintuitive-move 지표가 인간 체감과 상관 0.69 — 길이 단독보다 우수)
 *   · 생성은 만들고→측정하고→검수(generate-and-test). 이 모듈이 '측정'을 담당한다.
 *
 * 모든 함수는 보드를 변형하지 않는다(불변).
 */
import { resolveTap, moveSheep } from './board.js';
import { DIR_VEC, type Board, type Sheep } from './types.js';
import { randInt, type Rand } from './rng.js';

/** 즉시 탈출 가능한 양 id 목록(열림, openings). */
function exitableIds(board: Board): number[] {
  const out: number[] = [];
  for (const s of board.sheep) {
    if (resolveTap(board, s.id)?.kind === 'exit') out.push(s.id);
  }
  return out;
}

/** 열림 수 — 시작 상태에서 즉시 탈출 가능한 양 수. 적을수록 어렵다. */
export function openings(board: Board): number {
  return exitableIds(board).length;
}

export interface DepthStats {
  /** 평균 의존 깊이(라운드) — "그 양을 빼려면 몇 겹을 먼저 벗겨야 하는가"의 평균. */
  readonly mean: number;
  /** 최대 의존 깊이 — 가장 깊이 묻힌 양. */
  readonly max: number;
  /** 총 라운드 수(전부 벗기는 데 걸린 물결 수). */
  readonly rounds: number;
  /** 그리디(전부-벗기기)로 완주 가능했는가(생성 보드는 항상 true 여야 정상). */
  readonly solved: boolean;
}

/**
 * 의존 깊이 — "물결(peel) 시뮬": 매 라운드 지금 나갈 수 있는 양을 전부 제거, 반복.
 * 양의 깊이 = 제거된 라운드 번호(1=즉시). 제거는 단조(양이 빠질수록 길만 열림)라 그리디가 안전.
 */
export function depthStats(board: Board): DepthStats {
  let cur = board;
  let round = 0;
  let sum = 0;
  let max = 0;
  let solved = true;
  while (cur.sheep.length > 0) {
    round++;
    const ids = new Set(exitableIds(cur));
    if (ids.size === 0) {
      // 비정상(생성 보드에선 도달 불가) — 잔여 양은 깊이 최대치+페널티로 집계.
      solved = false;
      sum += cur.sheep.length * (round + 5);
      max = Math.max(max, round + 5);
      break;
    }
    sum += ids.size * round;
    max = Math.max(max, round);
    cur = { ...cur, sheep: cur.sheep.filter((s) => !ids.has(s.id)) };
  }
  const n = board.sheep.length || 1;
  return { mean: sum / n, max, rounds: round, solved };
}

/**
 * 키스톤 강도 — 지금 나갈 수 있는 양 각각에 대해 "그 양이 나가면 **새로** 열리는 양 수"
 * (1단계 연쇄)를 재고 최댓값을 반환. 값이 클수록 '한 수에 확 풀리는' 아하 지점이 존재.
 */
export function keystoneScore(board: Board): number {
  const base = exitableIds(board);
  let best = 0;
  for (const id of base) {
    const without: Board = { ...board, sheep: board.sheep.filter((s) => s.id !== id) };
    const after = exitableIds(without).length;
    best = Math.max(best, after - (base.length - 1));
  }
  return best;
}

/**
 * 함정률 — **랜덤 플레이어 시뮬**: 매 수 무작위 양을 골라 유효한 첫 행동(탈출 or 막힘전진)을
 * 실행. 완주 못 하고 교착에 빠진 롤아웃 비율. 막힘전진(compaction)이 다른 양의 길을 막아
 * 해결불능이 되는 '가능하지만 해로운 수'의 위험을 정량화한다(억울한 실패 지표).
 */
export function trapRate(board: Board, rollouts: number, rand: Rand): number {
  let stuck = 0;
  for (let r = 0; r < rollouts; r++) {
    let cur = board;
    let guard = 20000;
    while (cur.sheep.length > 0 && guard-- > 0) {
      // 무작위 순서로 양을 훑어 첫 유효 행동 실행(순진한 플레이어 모델).
      const ids = cur.sheep.map((s) => s.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = randInt(rand, i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      let acted = false;
      for (const id of ids) {
        const res = resolveTap(cur, id);
        if (!res) continue;
        if (res.kind === 'exit') {
          cur = { ...cur, sheep: cur.sheep.filter((s) => s.id !== id) };
          acted = true;
          break;
        }
        // 게임 규칙(PlayScene)과 동일: 막힘 전진 = steps−1(머리칸이 블로커 직전 빈칸).
        // steps 그대로 옮기면 머리칸이 블로커와 겹쳐 보드가 오염된다(주의).
        const advance = res.kind === 'blocked' ? Math.max(0, res.steps - 1) : 0;
        if (advance > 0) {
          cur = moveSheep(cur, id, advance);
          acted = true;
          break;
        }
      }
      if (!acted) break; // 유효 수 없음 = 교착(양이 남았으면)
    }
    if (cur.sheep.length > 0) stuck++;
  }
  return rollouts > 0 ? stuck / rollouts : 0;
}

/**
 * R12 — 동일 방향 인접 군집 최대 크기. 인접 = 두 양(같은 방향)의 풋프린트 셀(몸+머리)이
 * 대각 이웃(체커보드에서의 이웃). PO 룰: 최대 4마리까지 허용(5+ 금지).
 */
export function maxSameDirCluster(board: Board): number {
  const cellOwner = new Map<string, number>(); // "col,row" → sheep index
  const cellsOf = (s: Sheep): Array<[number, number]> => {
    const v = DIR_VEC[s.dir];
    return [
      [s.col, s.row],
      [s.col + v.dx, s.row + v.dy],
    ];
  };
  board.sheep.forEach((s, i) => {
    for (const [c, r] of cellsOf(s)) cellOwner.set(`${c},${r}`, i);
  });
  const seen = new Array<boolean>(board.sheep.length).fill(false);
  let best = 0;
  for (let i = 0; i < board.sheep.length; i++) {
    if (seen[i]) continue;
    const dir = board.sheep[i].dir;
    let size = 0;
    const queue = [i];
    seen[i] = true;
    while (queue.length > 0) {
      const cur = queue.pop() as number;
      size++;
      for (const [c, r] of cellsOf(board.sheep[cur])) {
        for (const [dc, dr] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const nb = cellOwner.get(`${c + dc},${r + dr}`);
          if (nb !== undefined && !seen[nb] && board.sheep[nb].dir === dir) {
            seen[nb] = true;
            queue.push(nb);
          }
        }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

/** 싼 지표(함정률 제외) — 생성 루프의 1차 선별용. difficultyBase = 함정 항 제외 난이도(0~85). */
export interface CheapMetrics {
  readonly n: number;
  readonly openings: number;
  readonly openFrac: number;
  readonly depthMean: number;
  readonly depthMax: number;
  readonly rounds: number;
  readonly keystone: number;
  readonly maxSameDirCluster: number;
  readonly difficultyBase: number;
}

export interface BoardMetrics extends CheapMetrics {
  readonly trapRate: number;
  readonly difficulty: number;
}

/**
 * 난이도 합성 상수 — 생성기의 실측 가능 범위(스테이지 1~20 스윕)에 맞춰 캘리브레이션.
 * 스윕 실측: 평균 깊이 3.5~13, 최대 깊이 11~41 — 이전 상수(7/14)는 중반부터 포화돼 변별력을
 * 잃었다. 참고로 레퍼런스 사본(돼지게임 5스테이지 카피)은 깊이 15.3/33 으로 ≈75(고난도)에
 * 위치 — 5스테이지치고 깊은 편이라 '중간=50' 앵커로는 쓰지 않는다.
 */
const W_OPEN = 0.35; // 열림이 적을수록 어렵다
const W_DEPTH = 0.3; // 평균 깊이
const W_MAX = 0.2; // 최대 깊이(가장 깊은 사슬)
const W_TRAP = 0.15; // 함정률
const OPEN_EASY = 0.35; // 열림 35%↑ = 매우 쉬움(0점)
const OPEN_HARD = 0.05; // 열림 5%↓ = 매우 어려움(1점)
const DEPTH_FULL = 10; // 평균 깊이 10라운드 = 만점
const DEPTH_MAX_FULL = 28; // 최대 깊이 28라운드 = 만점
const TRAP_FULL = 0.5; // 교착률 50% = 만점

/** 함정 항이 난이도에 더할 수 있는 최대 점수(생성 루프의 사전 컷오프 판단용). */
export const TRAP_POINTS_MAX = Math.round(100 * W_TRAP);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 싼 지표 일괄 계산(함정 시뮬 없음 — 빠름). */
export function cheapMetrics(board: Board): CheapMetrics {
  const n = board.sheep.length;
  const open = openings(board);
  const d = depthStats(board);
  const key = keystoneScore(board);
  const cluster = maxSameDirCluster(board);
  const openFrac = n > 0 ? open / n : 1;
  const cOpen = clamp01((OPEN_EASY - openFrac) / (OPEN_EASY - OPEN_HARD));
  const cDepth = clamp01(d.mean / DEPTH_FULL);
  const cMax = clamp01(d.max / DEPTH_MAX_FULL);
  const difficultyBase = Math.round(100 * (W_OPEN * cOpen + W_DEPTH * cDepth + W_MAX * cMax));
  return {
    n,
    openings: open,
    openFrac,
    depthMean: d.mean,
    depthMax: d.max,
    rounds: d.rounds,
    keystone: key,
    maxSameDirCluster: cluster,
    difficultyBase,
  };
}

/** 함정 항 점수(0~TRAP_POINTS_MAX). */
export function trapPoints(trap: number): number {
  return Math.round(100 * W_TRAP * clamp01(trap / TRAP_FULL));
}

/** 지표 일괄 계산 + 난이도 점수(0~100). trapRollouts 는 속도/정밀 트레이드오프. */
export function boardMetrics(board: Board, rand: Rand, trapRollouts = 12): BoardMetrics {
  const cheap = cheapMetrics(board);
  const trap = trapRate(board, trapRollouts, rand);
  return { ...cheap, trapRate: trap, difficulty: cheap.difficultyBase + trapPoints(trap) };
}
