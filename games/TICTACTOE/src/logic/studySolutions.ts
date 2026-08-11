/**
 * AI 스터디 승리 솔루션 20개 — **생성물**(scripts/gen-study-solutions.mts 로 재생성).
 *
 * 각 솔루션은 "상대 시드 + 내 착수 순서"다. 상대(`makeStudyOpponent(seed)`)는 국면의
 * 함수라 시드만 같으면 판이 100% 재현되고, `moves` 를 그대로 두면 반드시 이긴다.
 * 게임 중 파란 박스 안내(`studyAdvice`)도 같은 수를 가리키므로, 플레이어가 안내를
 * 따라오면 저장된 솔루션을 그대로 재현하게 된다(벗어나면 안내가 새 길을 다시 계산한다).
 * 모든 솔루션은 10단계 이상 학습한 뒤 승리한다 — studySolutions.test.ts 가 전수 검증.
 */

export interface StudySolution {
  /** 1-based 스터디 번호(= 화면의 "N/20"). */
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
  { id: 1, title: '↙ 대각선 완성 · 16턴', seed: 1, turns: 16, moves: [3, 0, 2, 8, 4, 7, 6, 2, 0, 7, 3, 8, 1, 6, 2, 4] },
  { id: 2, title: '↙ 대각선 완성 · 14턴', seed: 2, turns: 14, moves: [5, 2, 0, 3, 4, 8, 7, 2, 5, 0, 7, 2, 4, 6] },
  { id: 3, title: '오른쪽 세로 완성 · 13턴', seed: 3, turns: 13, moves: [3, 0, 2, 5, 4, 6, 0, 8, 1, 3, 2, 8, 5] },
  { id: 4, title: '↙ 대각선 완성 · 14턴', seed: 4, turns: 14, moves: [7, 8, 2, 0, 4, 3, 6, 2, 8, 3, 7, 2, 4, 6] },
  { id: 5, title: '아랫줄 가로 완성 · 13턴', seed: 5, turns: 13, moves: [5, 2, 0, 6, 4, 8, 1, 3, 2, 0, 6, 7, 8] },
  { id: 6, title: '↘ 대각선 완성 · 14턴', seed: 6, turns: 14, moves: [7, 6, 0, 2, 4, 5, 8, 0, 6, 5, 7, 0, 4, 8] },
  { id: 7, title: '↙ 대각선 완성 · 16턴', seed: 7, turns: 16, moves: [7, 8, 2, 0, 4, 3, 7, 1, 8, 3, 7, 0, 5, 6, 2, 4] },
  { id: 8, title: '오른쪽 세로 완성 · 13턴', seed: 8, turns: 13, moves: [1, 0, 6, 8, 4, 2, 3, 7, 0, 6, 8, 5, 2] },
  { id: 9, title: '↙ 대각선 완성 · 14턴', seed: 9, turns: 14, moves: [7, 6, 0, 1, 4, 8, 5, 6, 7, 0, 5, 6, 4, 2] },
  { id: 10, title: '윗줄 가로 완성 · 13턴', seed: 11, turns: 13, moves: [1, 0, 6, 7, 4, 2, 5, 3, 8, 6, 0, 1, 2] },
  { id: 11, title: '왼쪽 세로 완성 · 13턴', seed: 12, turns: 13, moves: [3, 0, 2, 5, 4, 6, 7, 1, 8, 2, 0, 3, 6] },
  { id: 12, title: '↘ 대각선 완성 · 14턴', seed: 13, turns: 14, moves: [5, 8, 6, 3, 4, 2, 1, 8, 5, 6, 1, 8, 4, 0] },
  { id: 13, title: '왼쪽 세로 완성 · 13턴', seed: 14, turns: 13, moves: [1, 2, 8, 6, 4, 0, 5, 7, 2, 8, 6, 3, 0] },
  { id: 14, title: '왼쪽 세로 완성 · 13턴', seed: 15, turns: 13, moves: [3, 6, 8, 5, 4, 0, 1, 7, 2, 8, 6, 3, 0] },
  { id: 15, title: '아랫줄 가로 완성 · 13턴', seed: 16, turns: 13, moves: [3, 0, 2, 8, 4, 6, 1, 5, 0, 2, 8, 7, 6] },
  { id: 16, title: '↘ 대각선 완성 · 14턴', seed: 20, turns: 14, moves: [1, 2, 8, 6, 4, 3, 0, 8, 2, 3, 1, 8, 4, 0] },
  { id: 17, title: '윗줄 가로 완성 · 13턴', seed: 21, turns: 13, moves: [7, 6, 0, 1, 4, 8, 6, 2, 3, 7, 0, 2, 1] },
  { id: 18, title: '왼쪽 세로 완성 · 13턴', seed: 27, turns: 13, moves: [5, 8, 6, 3, 4, 2, 8, 0, 7, 5, 6, 0, 3] },
  { id: 19, title: '윗줄 가로 완성 · 13턴', seed: 28, turns: 13, moves: [1, 2, 8, 7, 4, 0, 3, 5, 6, 8, 2, 1, 0] },
  { id: 20, title: '오른쪽 세로 완성 · 13턴', seed: 49, turns: 13, moves: [5, 2, 0, 3, 4, 8, 7, 1, 6, 0, 2, 5, 8] },
];

/** 스터디 총 라운드 수. */
export const STUDY_TOTAL = STUDY_SOLUTIONS.length;
