import { describe, it, expect } from 'vitest';
import { buildNpcScores, rankBoard, type Identity } from './leaderboard.js';

const ME: Identity = { id: 'TestArcher', iso3: 'KOR' };

describe('buildNpcScores', () => {
  it('정확히 NPC 9명을 만든다(9 + 나 = 10)', () => {
    expect(buildNpcScores(ME)).toHaveLength(9);
  });

  it('같은 아이디는 같은 사다리(결정적) — 판마다 동일 상대 구성', () => {
    expect(buildNpcScores(ME)).toEqual(buildNpcScores(ME));
  });

  it('점수는 내림차순 사다리이고 양궁 만점(90) 범위 안', () => {
    const npcs = buildNpcScores(ME);
    for (let i = 1; i < npcs.length; i++) {
      expect(npcs[i].score).toBeLessThanOrEqual(npcs[i - 1].score);
    }
    expect(npcs[0].score).toBeLessThanOrEqual(90);
    expect(npcs[npcs.length - 1].score).toBeGreaterThan(0);
  });
});

describe('rankBoard', () => {
  const npcs = buildNpcScores(ME);

  it('항상 10행(1~10위)을 돌려준다', () => {
    expect(rankBoard(npcs, ME, 0)).toHaveLength(10);
    expect(rankBoard(npcs, ME, 90)).toHaveLength(10);
  });

  it('나는 언제나 보드에 든다(9 NPC + 나 = 10명)', () => {
    expect(rankBoard(npcs, ME, 0).some((r) => r.you)).toBe(true);
    expect(rankBoard(npcs, ME, 45).some((r) => r.you)).toBe(true);
  });

  it('점수 0이면 꼴찌(10위)에 가깝고, 만점이면 1위로 올라온다', () => {
    const low = rankBoard(npcs, ME, 0).find((r) => r.you)!;
    const high = rankBoard(npcs, ME, 999).find((r) => r.you)!;
    expect(high.rank).toBeLessThan(low.rank);
    expect(high.rank).toBe(1);
  });

  it('점수가 오를수록 내 등수는 단조적으로 좋아진다(추월만, 후퇴 없음)', () => {
    let prevRank = Infinity;
    for (let s = 0; s <= 90; s += 5) {
      const rank = rankBoard(npcs, ME, s).find((r) => r.you)!.rank;
      expect(rank).toBeLessThanOrEqual(prevRank);
      prevRank = rank;
    }
  });

  it('순위는 1..10 연속이고 점수 내림차순', () => {
    const board = rankBoard(npcs, ME, 50);
    expect(board.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 1; i < board.length; i++) {
      expect(board[i].score).toBeLessThanOrEqual(board[i - 1].score);
    }
  });
});
