/**
 * 대전 전적 저장 — 레이팅과 승/패/무를 담는다.
 *
 * 싱글플레이 전적(`tictactoe_v3`)과 **분리**한다. 대전 승리가 싱글의 버티기 목표를
 * 올려 버리면 두 모드의 난이도 곡선이 서로 오염되기 때문이다.
 *
 * 저장은 코어 파사드(`gameStorage`)를 거친다 — 백엔드(localStorage / 네이티브 저장소)는
 * 빌드 타겟의 StoragePort 가 정하고, 이 파일은 무엇이 깔렸는지 몰라도 된다.
 */
import { readJson, writeJson } from '@casual/core/store/index.js';
import { VERSUS_KEY } from './saveKeys.js';
import { START_RATING, RATING_FLOOR, applyRatingDelta } from './logic/versus.js';

export interface VersusRecord {
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

const EMPTY: VersusRecord = { rating: START_RATING, wins: 0, losses: 0, draws: 0 };

function toInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function loadVersusRecord(): VersusRecord {
  const parsed = readJson<Partial<VersusRecord>>(VERSUS_KEY, EMPTY);
  return {
    rating: Math.max(RATING_FLOOR, toInt(parsed.rating, START_RATING)),
    wins: Math.max(0, toInt(parsed.wins, 0)),
    losses: Math.max(0, toInt(parsed.losses, 0)),
    draws: Math.max(0, toInt(parsed.draws, 0)),
  };
}

export function saveVersusRecord(record: VersusRecord): void {
  writeJson(VERSUS_KEY, record);
}

/**
 * 서버 권위 레이팅으로 로컬 캐시를 맞춘다(온라인 대전 진입·정산 시점).
 *
 * 실유저 대전이 붙은 뒤로 레이팅의 진실은 서버(`players.rating`)에 있다. 이 저장소는
 * 표시용 캐시로 격하됐다 — 여기 값을 손대도 매칭이나 정산에 영향을 주지 못한다.
 * 승/패/무 카운터는 봇 대전분까지 포함한 로컬 통계라 건드리지 않는다.
 */
export function syncVersusRating(rating: number): void {
  const current = loadVersusRecord();
  const next = Math.max(RATING_FLOOR, Math.floor(rating));
  if (current.rating === next) return;
  saveVersusRecord({ ...current, rating: next });
}

/** 판 결과를 반영한 **새** 전적을 돌려준다(원본은 그대로 둔다). */
export function applyResult(
  record: VersusRecord,
  outcome: 'win' | 'loss' | 'draw',
  delta: number,
): VersusRecord {
  return {
    rating: applyRatingDelta(record.rating, delta),
    wins: record.wins + (outcome === 'win' ? 1 : 0),
    losses: record.losses + (outcome === 'loss' ? 1 : 0),
    draws: record.draws + (outcome === 'draw' ? 1 : 0),
  };
}
