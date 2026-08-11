import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type GameState } from './board.js';
import { chooseMove } from './ai.js';
import {
  ALTERNATE_FIRST_FROM,
  AI_LEVELS,
  AI_LEVEL_MAX,
  HINTS_OFF_FROM,
  TIME_PRESSURE_FROM,
  TURN_SECONDS_BASE,
  WINS_BASE,
  WINS_CAP,
  aiLevelAt,
  aiLevelLabel,
  alternatesFirst,
  showsHints,
  turnMsFor,
  winsToAdvanceFor,
} from './aiLevels.js';

function play(first: 'O' | 'X', cells: number[]): GameState {
  let s = createGame(first);
  for (const c of cells) s = applyAction(s, c);
  return s;
}

function rngFrom(seed: number): () => number {
  let st = seed;
  return () => {
    st = (st * 1103515245 + 12345) % 2147483648;
    return st / 2147483648;
  };
}

/**
 * 실제 배역대로 한 판 — 사람 역할이 **선공(O)**, AI 등급이 **후공(X)**.
 * (이 룰은 선공이 구조적으로 유리해서, 등급 비교는 반드시 AI 를 후공에 두고 해야 한다)
 * 사람 역할은 완벽하지 않은 상대(얕은 탐색 + 허용폭)로 둔다.
 */
function defendAsAi(level: number, foeDepth: number, seeds: number): { lose: number; win: number } {
  const lv = aiLevelAt(level);
  let lose = 0;
  let win = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = rngFrom(seed);
    let s = createGame('O');
    for (let ply = 0; ply < 60 && !s.winner; ply++) {
      s =
        s.turn === 'O'
          ? applyAction(s, chooseMove(s, { depth: foeDepth, tolerance: 6, random: rng }))
          : applyAction(s, chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, random: rng }));
    }
    if (s.winner === 'O') lose++;
    else if (s.winner === 'X') win++;
  }
  return { lose, win };
}

describe('AI 등급 30단계', () => {
  it('1..10 이 빠짐없이 있고 이름·소개가 붙어 있다', () => {
    expect(AI_LEVEL_MAX).toBe(30);
    expect(AI_LEVELS.map((l) => l.level)).toEqual(
      Array.from({ length: AI_LEVEL_MAX }, (_, i) => i + 1),
    );
    for (const lv of AI_LEVELS) {
      expect(lv.name.length).toBeGreaterThan(0);
      expect(lv.blurb.length).toBeGreaterThan(0);
    }
    expect(new Set(AI_LEVELS.map((l) => l.name)).size).toBe(AI_LEVEL_MAX); // 이름 중복 없음
    expect(aiLevelLabel(4)).toBe('Lv.4 수련생');
  });

  it('승급 승수는 5승에서 시작해 10승에서 멈춘다 — 어떤 등급도 10승을 넘지 않는다', () => {
    for (const lv of AI_LEVELS) {
      expect(lv.winsToAdvance).toBeLessThanOrEqual(WINS_CAP); // ⚠️ 유저 확정: 10승 초과 금지
      expect(lv.winsToAdvance).toBe(Math.min(WINS_BASE + lv.level - 1, WINS_CAP));
    }
    expect(winsToAdvanceFor(1)).toBe(5);
    expect(winsToAdvanceFor(6)).toBe(WINS_CAP); // Lv.6 에서 상한 도달
    expect(winsToAdvanceFor(7)).toBe(WINS_CAP);
    expect(winsToAdvanceFor(AI_LEVEL_MAX)).toBe(WINS_CAP);
    expect(winsToAdvanceFor(0)).toBe(WINS_BASE); // 깨진 저장값도 안전
    expect(winsToAdvanceFor(99)).toBe(WINS_CAP);
  });

  it(`선공 교차는 Lv.${ALTERNATE_FIRST_FROM} 부터 켜진다`, () => {
    for (let lv = 1; lv < ALTERNATE_FIRST_FROM; lv++) expect(alternatesFirst(lv)).toBe(false);
    for (let lv = ALTERNATE_FIRST_FROM; lv <= AI_LEVEL_MAX; lv++) expect(alternatesFirst(lv)).toBe(true);
  });

  it(`화면 안내(위험 박스·놓친 승리)는 Lv.${HINTS_OFF_FROM} 부터 끊긴다`, () => {
    for (let lv = 1; lv < HINTS_OFF_FROM; lv++) expect(showsHints(lv)).toBe(true);
    for (let lv = HINTS_OFF_FROM; lv <= AI_LEVEL_MAX; lv++) expect(showsHints(lv)).toBe(false);
    expect(showsHints(0)).toBe(true); // 깨진 저장값도 안전(최저 등급으로 보정)
    expect(showsHints(99)).toBe(false);
  });

  it(`턴 제한시간은 Lv.${TIME_PRESSURE_FROM} 부터 등급당 1초씩 줄어 Lv.${AI_LEVEL_MAX} 은 10초`, () => {
    for (let lv = 1; lv < TIME_PRESSURE_FROM; lv++) {
      expect(turnMsFor(lv)).toBe(TURN_SECONDS_BASE * 1000);
    }
    for (let lv = TIME_PRESSURE_FROM; lv <= AI_LEVEL_MAX; lv++) {
      expect(turnMsFor(lv)).toBe((TURN_SECONDS_BASE - (lv - TIME_PRESSURE_FROM + 1)) * 1000);
    }
    expect(turnMsFor(AI_LEVEL_MAX)).toBe(10_000); // Lv.30 = 10초
    expect(aiLevelAt(AI_LEVEL_MAX).turnSeconds).toBeGreaterThan(0);
  });

  it('Lv.20 까지는 더 깊이·더 정확해지고, 그 뒤로는 강도가 포화한다', () => {
    for (let i = 1; i < 20; i++) {
      expect(AI_LEVELS[i].depth).toBeGreaterThanOrEqual(AI_LEVELS[i - 1].depth);
      expect(AI_LEVELS[i].tolerance).toBeLessThan(AI_LEVELS[i - 1].tolerance);
    }
    // Lv.21~30 은 강도가 같다(실측상 더 세질 수 없다) — 대신 압박 축으로 어려워진다.
    for (let i = 20; i < AI_LEVEL_MAX; i++) {
      expect(AI_LEVELS[i].depth).toBe(AI_LEVELS[19].depth);
      expect(AI_LEVELS[i].tolerance).toBe(0);
      expect(AI_LEVELS[i].turnSeconds).toBeLessThan(AI_LEVELS[i - 1].turnSeconds);
    }
  });

  it('저장값이 깨져도 안전하게 범위 안으로 잡는다', () => {
    expect(aiLevelAt(0).level).toBe(1);
    expect(aiLevelAt(-5).level).toBe(1);
    expect(aiLevelAt(99).level).toBe(AI_LEVEL_MAX);
    expect(aiLevelAt(Number.NaN).level).toBe(1);
  });

  // ── "1레벨도 멍청하면 안 된다" — 모든 등급이 지켜야 하는 최소선 ──
  it.each(AI_LEVELS.map((l) => [l.level, l.name] as const))(
    'Lv.%i %s — 즉승 자리를 반드시 둔다',
    (level) => {
      const lv = aiLevelAt(level);
      // X: 3,4 → 5 면 즉승. O: 0,8.
      const s = play('X', [3, 0, 4, 8]);
      expect(s.turn).toBe('X');
      for (let i = 0; i < 12; i++) {
        expect(chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, random: rngFrom(i) })).toBe(5);
      }
    },
  );

  it.each(AI_LEVELS.map((l) => [l.level, l.name] as const))(
    'Lv.%i %s — 상대의 3목을 반드시 막는다',
    (level) => {
      const lv = aiLevelAt(level);
      // O: 0,1 (2 가 즉승 칸) / X: 4. X 차례 — 2 를 막아야 한다.
      const s = play('O', [0, 4, 1]);
      expect(s.turn).toBe('X');
      for (let i = 0; i < 12; i++) {
        expect(chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, random: rngFrom(i) })).toBe(2);
      }
    },
  );

  it('이동 페이즈에서도 즉승·차단을 놓치지 않는다(모든 등급)', () => {
    // X: 5,0,4 — 가장 오래된 5 를 8 로 옮기면 0,4,8 대각 3목. O: 1,2,7.
    const s = play('X', [5, 1, 0, 2, 4, 7]);
    expect(s.turn).toBe('X');
    for (const lv of AI_LEVELS) {
      const cell = chooseMove(s, { depth: lv.depth, tolerance: lv.tolerance, random: rngFrom(lv.level) });
      expect(applyAction(s, cell).winner).toBe('X');
    }
  });

  it('등급 구간이 오를수록 실제로 더 잘 막는다(후공 24판)', () => {
    // 강도 축은 Lv.20 에서 포화하므로 거기까지만 잰다(21~30 은 압박 축 담당).
    const loses = AI_LEVELS.slice(0, 20).map((lv) => defendAsAi(lv.level, 3, 24).lose);
    const avg = (from: number, to: number) =>
      loses.slice(from - 1, to).reduce((a, b) => a + b, 0) / (to - from + 1);

    // 깊이 묶음(4등급씩) 평균은 계단을 이룬다.
    // ⚠️ 인접 **단계**는 표본 오차와 강도 포화로 뒤집힐 수 있다 — 구간으로만 검증한다.
    expect(avg(1, 4)).toBeGreaterThan(avg(5, 8));
    expect(avg(5, 8)).toBeGreaterThanOrEqual(avg(9, 12));
    expect(avg(9, 12)).toBeGreaterThan(avg(13, 16));
    expect(avg(13, 16)).toBeGreaterThanOrEqual(avg(17, 20));
    expect(loses[19]).toBe(0); // Lv.20 부터는 한 판도 안 진다(강도 포화)
  }, 300000);

  it('최고 등급은 강한 선공에게도 쉽게 무너지지 않는다', () => {
    const { lose } = defendAsAi(AI_LEVEL_MAX, 4, 20);
    expect(lose).toBe(0);
  }, 120000);
});
