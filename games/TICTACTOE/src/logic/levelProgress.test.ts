import { describe, expect, it } from 'vitest';
import { AI_LEVEL_MAX, winsToAdvanceFor } from './aiLevels.js';
import {
  INITIAL_PROGRESS,
  WIN_STREAK_TO_ADVANCE,
  applySingleResult,
  isPromotionMatch,
  isPromotionStage,
  normalizeProgress,
  progressText,
  requirementText,
  type LevelProgress,
} from './levelProgress.js';

/** 결과 문자열대로 연속 적용 — 'W'=승, 'L'=패. */
function run(seq: string, from: LevelProgress = INITIAL_PROGRESS): LevelProgress {
  let p = from;
  for (const ch of seq) p = applySingleResult(p, ch === 'W');
  return p;
}

describe('승급 규칙 — 판수를 채운 "뒤에" 3연승', () => {
  it('Lv.1 은 5승을 채우고, 그 다음 3연승해야 한다(최소 8승)', () => {
    expect(winsToAdvanceFor(1)).toBe(5);

    // 5연승 — 판수는 채워졌지만 그 순간부터 승급전이 시작된다(아직 승급 아님).
    const filled = run('WWWWW');
    expect(filled.level).toBe(1);
    expect(filled.wins).toBe(5);
    expect(filled.streak).toBe(0);
    expect(isPromotionStage(filled)).toBe(true);

    // 여기서 3연승 → 승급(총 8승).
    expect(run('W', filled).streak).toBe(1);
    expect(run('WW', filled).streak).toBe(2);
    const promoted = run('WWW', filled);
    expect(promoted.level).toBe(2);
    expect(promoted.wins).toBe(0);
    expect(promoted.streak).toBe(0);
  });

  it('판수를 채우는 동안의 연승은 세지 않는다', () => {
    const p = run('WWWW'); // 4연승이지만 아직 1단계
    expect(p.streak).toBe(0);
    expect(isPromotionStage(p)).toBe(false);
  });

  it('승급전에서 지면 연승만 0으로 끊기고 판수는 유지된다', () => {
    const filled = run('WWWWW');
    const broken = run('WWL', filled); // 2연승 뒤 패배
    expect(broken.level).toBe(1);
    expect(broken.wins).toBe(5); // 판수는 그대로
    expect(broken.streak).toBe(0);
    expect(isPromotionStage(broken)).toBe(true); // 승급전은 계속
    expect(run('WWW', broken).level).toBe(2); // 다시 3연승하면 승급
  });

  it('1단계에서 패배해도 누적 승수는 깎이지 않는다', () => {
    const p = run('WWLWL');
    expect(p.wins).toBe(3);
    expect(p.level).toBe(1);
  });

  it('등급이 오를수록 요구 판수가 늘지만 10승에서 멈춘다', () => {
    const lv2 = run('WWWWW' + 'WWW'); // Lv.2 진입(5승 후 3연승)
    expect(lv2.level).toBe(2);
    expect(winsToAdvanceFor(2)).toBe(6);
    expect(run('WWWWWW', lv2).level).toBe(2); // 6승 — 판수만 채움
    expect(run('WWWWWW' + 'WW', lv2).level).toBe(2); // 2연승 — 아직
    expect(run('WWWWWW' + 'WWW', lv2).level).toBe(3); // 3연승 — 승급
    // 상한 — Lv.7 이상은 전부 10승 + 3연승이다.
    const high: LevelProgress = { level: 7, wins: 0, streak: 0 };
    expect(winsToAdvanceFor(7)).toBe(10);
    expect(run('W'.repeat(10), high).level).toBe(7); // 판수만 채움
    expect(run('W'.repeat(13), high).level).toBe(8); // +3연승 → 승급
  });

  it('최고 등급에서는 더 오르지 않는다', () => {
    const top: LevelProgress = { level: AI_LEVEL_MAX, wins: 0, streak: 0 };
    const p = run('WWWWWWWWWWWWWWWWWWWW', top);
    expect(p.level).toBe(AI_LEVEL_MAX);
    expect(isPromotionStage(p)).toBe(false);
    expect(isPromotionMatch(p)).toBe(false);
    expect(progressText(p)).toBe('최고 등급');
  });

  it('승급이 걸린 판을 알려준다', () => {
    expect(isPromotionMatch({ level: 1, wins: 5, streak: 2 })).toBe(true); // 이기면 3연승 완성
    expect(isPromotionMatch({ level: 1, wins: 5, streak: 1 })).toBe(false);
    expect(isPromotionMatch({ level: 1, wins: 4, streak: 2 })).toBe(false); // 판수 미완성
  });

  it('진행 문구가 단계를 그대로 보여준다', () => {
    expect(progressText({ level: 1, wins: 2, streak: 0 })).toBe('승급 2/5승');
    expect(progressText({ level: 1, wins: 5, streak: 0 })).toBe('승급전 0/3연승');
    expect(progressText({ level: 1, wins: 5, streak: 2 })).toBe('승급전 2/3연승');
    expect(requirementText(1)).toBe(`5승을 채운 뒤 ${WIN_STREAK_TO_ADVANCE}연승`);
  });

  it('깨진 저장값도 안전하게 정규화한다', () => {
    expect(normalizeProgress(undefined)).toEqual(INITIAL_PROGRESS);
    expect(normalizeProgress({ level: 99, wins: -3, streak: Number.NaN })).toEqual({
      level: AI_LEVEL_MAX,
      wins: 0,
      streak: 0,
    });
  });

  it('원본 진행도를 변형하지 않는다(불변)', () => {
    const p: LevelProgress = { level: 1, wins: 1, streak: 1 };
    applySingleResult(p, true);
    applySingleResult(p, false);
    expect(p).toEqual({ level: 1, wins: 1, streak: 1 });
  });
});
