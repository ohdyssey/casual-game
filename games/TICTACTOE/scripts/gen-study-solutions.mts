/**
 * AI 스터디 승리 솔루션 20개 생성기 — `npx tsx scripts/gen-study-solutions.mts`
 *
 * 시드를 훑으며 "안내(studyAdvice)를 그대로 따라갔을 때 실제로 이기는 판"을 모으고,
 * 서로 다른 수순 20개를 골라 `src/logic/studySolutions.ts` 로 굽는다.
 * 상대(makeStudyOpponent)는 국면의 함수라 시드만 있으면 판이 100% 재현된다 —
 * 그래서 솔루션은 "시드 + 내 착수 순서"만 저장하면 충분하다.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LINES, applyAction, createGame } from '../src/logic/board.js';
import { makeStudyOpponent } from '../src/logic/ai.js';
import { STUDY_WIN_TURN, studyAdvice } from '../src/logic/hints.js';

interface Candidate {
  seed: number;
  moves: number[];
  turns: number;
  line: readonly number[];
}

/** 시드 하나로 판을 끝까지 돌려 본다. 안내대로 둬서 이기면 솔루션 후보. */
function solve(seed: number): Candidate | null {
  const opponent = makeStudyOpponent(seed);
  let s = createGame('O');
  const moves: number[] = [];
  while (!s.winner && moves.length < 30) {
    if (s.turn === 'O') {
      const cell = studyAdvice(s, moves.length, opponent, seed).cell;
      moves.push(cell);
      s = applyAction(s, cell);
    } else {
      s = applyAction(s, opponent(s));
    }
  }
  if (s.winner !== 'O' || !s.winLine) return null;
  if (moves.length < STUDY_WIN_TURN) return null; // 10단계 미만은 스터디로 쓰지 않는다
  return { seed, moves, turns: moves.length, line: s.winLine };
}

/** 3목 라인의 모양 이름 — 솔루션 제목에 쓴다. */
function lineName(line: readonly number[]): string {
  const idx = LINES.findIndex((l) => l.every((c) => line.includes(c)));
  return ['윗줄 가로', '가운데 가로', '아랫줄 가로', '왼쪽 세로', '가운데 세로', '오른쪽 세로', '↘ 대각선', '↙ 대각선'][idx] ?? '3목';
}

const WANTED = 20;
const picked: Candidate[] = [];
const seenMoves = new Set<string>();
const openingCount = new Map<number, number>();

for (let seed = 1; picked.length < WANTED && seed <= 20000; seed++) {
  const c = solve(seed);
  if (!c) continue;
  const key = c.moves.join(',');
  if (seenMoves.has(key)) continue; // 같은 수순은 한 번만
  // 첫 수가 한쪽으로 몰리지 않게 — 같은 오프닝은 최대 4개까지.
  const opening = c.moves[0];
  if ((openingCount.get(opening) ?? 0) >= 5) continue;
  seenMoves.add(key);
  openingCount.set(opening, (openingCount.get(opening) ?? 0) + 1);
  picked.push(c);
}

if (picked.length < WANTED) throw new Error(`solutions found: ${picked.length}/${WANTED}`);

const entries = picked
  .map((c, i) => {
    const title = `${lineName(c.line)} 완성 · ${c.turns}턴`;
    return `  { id: ${i + 1}, title: '${title}', seed: ${c.seed}, turns: ${c.turns}, moves: [${c.moves.join(', ')}] },`;
  })
  .join('\n');

const out = `/**
 * AI 스터디 승리 솔루션 ${WANTED}개 — **생성물**(scripts/gen-study-solutions.mts 로 재생성).
 *
 * 각 솔루션은 "상대 시드 + 내 착수 순서"다. 상대(\`makeStudyOpponent(seed)\`)는 국면의
 * 함수라 시드만 같으면 판이 100% 재현되고, \`moves\` 를 그대로 두면 반드시 이긴다.
 * 게임 중 파란 박스 안내(\`studyAdvice\`)도 같은 수를 가리키므로, 플레이어가 안내를
 * 따라오면 저장된 솔루션을 그대로 재현하게 된다(벗어나면 안내가 새 길을 다시 계산한다).
 * 모든 솔루션은 ${STUDY_WIN_TURN}단계 이상 학습한 뒤 승리한다 — studySolutions.test.ts 가 전수 검증.
 */

export interface StudySolution {
  /** 1-based 스터디 번호(= 화면의 "N/${WANTED}"). */
  readonly id: number;
  /** 무엇을 배우는 판인지 한 줄 요약(승리 라인 + 총 턴 수). */
  readonly title: string;
  /** 상대 모델 시드 — 이 값이 판 전체를 결정한다. */
  readonly seed: number;
  /** 안내대로 뒀을 때의 내 턴 수(= 승리 턴). */
  readonly turns: number;
  /** 내 착수 순서(배치 3수 뒤부터는 가장 오래된 말의 목적지). */
  readonly moves: readonly number[];
}

export const STUDY_SOLUTIONS: readonly StudySolution[] = [
${entries}
];

/** 스터디 총 라운드 수. */
export const STUDY_TOTAL = STUDY_SOLUTIONS.length;
`;

const target = fileURLToPath(new URL('../src/logic/studySolutions.ts', import.meta.url));
writeFileSync(target, out, 'utf8');
console.log(`wrote ${picked.length} solutions → ${target}`);
console.log(picked.map((c) => `#${c.seed} ${c.turns}턴 ${c.moves.join('-')}`).join('\n'));
