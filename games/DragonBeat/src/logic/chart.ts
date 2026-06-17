/**
 * 리듬 차트 — 박자 인덱스 → 발생하는 노트 이벤트(순수 함수, Phaser 의존 없음).
 *
 * 음악 리듬게임처럼 박자마다 "악보"를 깐다: 좌/우 단타(L/R)에 쉼표(.)로 프레이징을 주고,
 * 양손 동시(B)와 길게-누르기 홀드(l/r = 연이은 리듬의 꾹누르기)를 섞는다.
 * 레벨(레이스 1/2/3)마다 별도 패턴 — 위로 갈수록 밀도·홀드·동시타가 늘어 난이도가 오른다.
 * 처음 몇 박자는 워밍업(단순 교대)으로 진입 난이도를 낮춘다.
 */
import type { PaddleSide } from './types.js';

/** 박자 토큰 — L/R 단타, B 양손 동시, l/r 홀드(길게 누르기), '.' 쉼표(노트 없음). */
export type BeatToken = 'L' | 'R' | 'B' | 'l' | 'r' | '.';

/** 홀드 노트 길이(박자) — 연이은 리듬을 한 번의 꾹누르기로 표현. */
export const HOLD_BEATS = 1.5;

/** 첫 박자들은 단순 교대(워밍업). */
const WARMUP: ReadonlyArray<BeatToken> = ['L', 'R', 'L', 'R'];

/** 레벨별 16박 루프 패턴 — 1=쉬움(단타 위주), 2=중간(동시타+홀드), 3=어려움(밀도↑). */
const PATTERNS: Record<number, ReadonlyArray<BeatToken>> = {
  1: ['L', 'R', 'L', 'R', 'L', '.', 'R', 'L', 'R', 'L', '.', 'R', 'L', 'R', 'B', '.'],
  2: ['L', 'R', 'B', '.', 'R', 'L', 'R', '.', 'B', 'L', 'r', '.', 'R', 'L', 'B', '.'],
  3: ['R', 'L', 'B', 'R', 'L', 'l', '.', 'R', 'B', 'R', 'r', '.', 'L', 'B', 'R', 'B'],
};

/** 차트 노트 1개 — side + beat(도착 박자) + holdBeats(0=단타, >0=홀드 길이). */
export interface ChartNote {
  readonly side: PaddleSide;
  readonly beat: number;
  readonly holdBeats: number;
}

/** beatIndex(1-based)의 토큰 — 워밍업 후 레벨 패턴을 순환. 잘못된 레벨은 1로 폴백. */
export function beatToken(beatIndex: number, level: number): BeatToken {
  if (beatIndex < 1) return '.';
  if (beatIndex <= WARMUP.length) return WARMUP[beatIndex - 1];
  const pat = PATTERNS[level] ?? PATTERNS[1];
  return pat[(beatIndex - 1 - WARMUP.length) % pat.length];
}

/** 정수 박자에서 발생하는 노트들 — 단타 1, 양손 2(좌/우 동시), 홀드 1(길게), 쉼표 0. */
export function notesAtBeat(beatIndex: number, level: number): ChartNote[] {
  const tok = beatToken(beatIndex, level);
  switch (tok) {
    case '.':
      return [];
    case 'B':
      return [
        { side: 'left', beat: beatIndex, holdBeats: 0 },
        { side: 'right', beat: beatIndex, holdBeats: 0 },
      ];
    case 'l':
      return [{ side: 'left', beat: beatIndex, holdBeats: HOLD_BEATS }];
    case 'r':
      return [{ side: 'right', beat: beatIndex, holdBeats: HOLD_BEATS }];
    case 'L':
      return [{ side: 'left', beat: beatIndex, holdBeats: 0 }];
    case 'R':
      return [{ side: 'right', beat: beatIndex, holdBeats: 0 }];
  }
}
