/**
 * 싱글플레이 승급 규칙 — **순서가 있는 2단계**다(2026-08-05 유저 확정).
 *   1단계 판수 채우기 — 그 등급에서 정해진 판수만큼 이긴다(`winsToAdvance`: 5승 → 최대 10승)
 *   2단계 승급전     — 판수를 채운 **그 다음부터** 3판 연속 승리한다(`WIN_STREAK_TO_ADVANCE`)
 *
 * ⚠️ 판수를 채우는 동안의 연승은 세지 않는다. 예) Lv.1 을 5연승으로 끝내도 그때 판수가
 * 막 채워진 것이므로 승급이 아니라 **거기서부터 다시 3연승**해야 한다(최소 8승).
 * 누적 승수는 져도 깎이지 않고, 2단계의 연승만 0으로 끊긴다.
 *
 * ⚠️ 요구 판수는 **10승을 넘지 않는다**(`WINS_CAP`) — Lv.1~6 이 5→10승이고 그 뒤로는 계속 10승.
 * 상위 등급은 승수 대신 압박 축(선공 교차·제한시간 감소)으로 어려워진다.
 */
import { AI_LEVEL_MAX, AI_LEVEL_MIN, aiLevelAt, winsToAdvanceFor } from './aiLevels.js';

/** 승급을 마무리하는 데 필요한 연승 수. */
export const WIN_STREAK_TO_ADVANCE = 3;

export interface LevelProgress {
  /** 현재 AI 등급(1..10). */
  readonly level: number;
  /** 현재 등급에서 쌓은 누적 승수(승급하면 0). */
  readonly wins: number;
  /** 현재 연승(패배하면 0). */
  readonly streak: number;
}

export const INITIAL_PROGRESS: LevelProgress = {
  level: AI_LEVEL_MIN,
  wins: 0,
  streak: 0,
};

/** 저장값이 깨져도 안전하게 범위 안으로 잡는다. */
export function normalizeProgress(p: Partial<LevelProgress> | undefined): LevelProgress {
  const level = aiLevelAt(typeof p?.level === 'number' ? p.level : AI_LEVEL_MIN).level;
  const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return { level, wins: int(p?.wins), streak: int(p?.streak) };
}

/**
 * 싱글 한 판의 결과를 반영한 **새 진행도**를 돌려준다(원본은 건드리지 않는다).
 * 두 조건을 모두 채우면 등급이 오르고 누적·연승이 초기화된다.
 */
export function applySingleResult(p: LevelProgress, won: boolean): LevelProgress {
  if (!won) return { ...p, streak: 0 }; // 누적 승수는 유지, 승급전 연승만 끊긴다
  const need = winsToAdvanceFor(p.level);
  // 1단계 — 아직 판수를 채우는 중이면 연승은 세지 않는다(채워진 순간부터 승급전 시작).
  if (p.wins < need) return { level: p.level, wins: p.wins + 1, streak: 0 };
  // 2단계 — 승급전. 3연승을 채우면 승급.
  const streak = p.streak + 1;
  if (streak >= WIN_STREAK_TO_ADVANCE && p.level < AI_LEVEL_MAX) {
    return { level: p.level + 1, wins: 0, streak: 0 };
  }
  return { level: p.level, wins: p.wins, streak };
}

/** 판수를 다 채워 승급전(3연승 도전)에 들어와 있는가. */
export function isPromotionStage(p: LevelProgress): boolean {
  return p.level < AI_LEVEL_MAX && p.wins >= winsToAdvanceFor(p.level);
}

/** 이번에 이기면 승급하는 상태인가(마지막 한 판 남았을 때 안내용). */
export function isPromotionMatch(p: LevelProgress): boolean {
  return isPromotionStage(p) && p.streak + 1 >= WIN_STREAK_TO_ADVANCE;
}

/** HUD·결과 화면에 쓸 진행 문구. */
export function progressText(p: LevelProgress): string {
  if (p.level >= AI_LEVEL_MAX) return '최고 등급';
  const need = winsToAdvanceFor(p.level);
  // 1단계 — 판수 채우는 중(연승은 아직 안 센다).
  if (p.wins < need) return `승급 ${p.wins}/${need}승`;
  // 2단계 — 승급전.
  return `승급전 ${Math.min(p.streak, WIN_STREAK_TO_ADVANCE)}/${WIN_STREAK_TO_ADVANCE}연승`;
}

/** 이 등급을 통과하는 데 필요한 조건 한 줄(안내용). */
export function requirementText(level: number): string {
  const lv = aiLevelAt(level);
  if (lv.level >= AI_LEVEL_MAX) return '최고 등급 — 더 오를 곳이 없어요';
  return `${lv.winsToAdvance}승을 채운 뒤 ${WIN_STREAK_TO_ADVANCE}연승`;
}
