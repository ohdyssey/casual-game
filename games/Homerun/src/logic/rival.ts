/**
 * 라이벌 매칭 — 이번 판에 붙을 상대의 9회 기록을 정한다. 순수 로직(Phaser 무관, 테스트 대상).
 *
 * 두 가지 경로가 있다(사용자 요청):
 *  1. **첫 판 = 튜토리얼** — 정해진 성적(홈런 3 · 안타 2)의 가상 플레이어와 붙는다. 처음 잡는
 *     사람이 "이 정도는 쳐야 이긴다"는 감을 잡도록 상대 성적을 흔들지 않고 고정한다.
 *  2. **두 번째 판부터** — 이미 치러진 경기 기록을 꺼내 그 사람이 다시 치는 것처럼 매칭한다.
 *
 * ⚠️ "다른 유저의 기 경기 데이터"는 서버가 있어야 진짜가 된다. 홈런팝엔 아직 백엔드가 없어,
 * **이 기기에서 끝낸 경기들**을 저장해 두고 그중 하나를 꺼내 쓴다(고스트 대전). 서버가 생기면
 * loadRecords() 만 원격 조회로 바꾸면 나머지 흐름은 그대로다 — 그래서 저장소 접근을 이 파일
 * 한 곳에 모아 뒀다.
 */

import { HIT_SCORE_RANGE, homerunScore, type RivalRoundOutcome } from './scoring.js';

/** 한 회차 기록 — 화면 표시(라벨)와 점수. */
export interface RivalRound {
  readonly outcome: RivalRoundOutcome;
  readonly score: number;
}

/** 끝난 경기 한 판의 기록 — 다음 사람의 상대로 재사용된다. */
export interface RivalRecord {
  /** 9회 각각의 결과. */
  readonly rounds: ReadonlyArray<RivalRound>;
  /** 최종 점수(합계) — 목록에서 고를 때 쓴다. */
  readonly total: number;
  /** 기록 시각(ms) — 오래된 기록부터 밀어낸다. */
  readonly playedAt: number;
}

/** 한 경기 회차 수 — PlayScene.PITCHES_PER_GAME 과 같아야 한다. */
export const ROUNDS_PER_GAME = 9;

/**
 * 튜토리얼 상대의 고정 성적 — 홈런 3 · 안타 2 · 나머지 4회는 범타(사용자 요청: "홈런 3개 안타
 * 2개 치는 모드"). 나머지를 스트라이크/아웃/파울로 섞는 건 9회 내내 같은 그림이 반복되지 않게
 * 하기 위한 것으로, 점수에는 거의 영향이 없다(파울 5점, 나머지 0점).
 */
const TUTORIAL_OUTCOMES: ReadonlyArray<RivalRoundOutcome> = [
  'homerun',
  'strike',
  'hit',
  'out',
  'homerun',
  'foul',
  'hit',
  'strike',
  'homerun',
];

/**
 * 튜토리얼 상대의 회차별 비거리(m) — 홈런 3개에 순서대로 쓴다. 실제 플레이어가 낼 수 있는
 * 범위(96~230m) 안에서 중간값 언저리로 잡아, 처음 붙는 상대가 "닿을 만한" 점수가 되게 한다.
 */
const TUTORIAL_HOMERUN_METERS: ReadonlyArray<number> = [128, 152, 141];
/** 튜토리얼 상대의 안타 점수 — 외야 안타 범위(40~50)의 가운데. */
const TUTORIAL_HIT_SCORE = Math.round((HIT_SCORE_RANGE.outfield.min + HIT_SCORE_RANGE.outfield.max) / 2);
/** 파울 점수 — scoring.FOUL_SCORE 와 같은 값(여기서 중복 정의하지 않도록 import 해서 쓴다). */
const TUTORIAL_FOUL_SCORE = 5;

/**
 * 튜토리얼 상대의 9회 기록을 만든다 — 매번 같은 결과(랜덤 없음)라 첫 경험이 사람마다 흔들리지
 * 않는다. 합계는 홈런 3개(128+152+141=421) + 안타 2개(45×2=90) + 파울 1개(5) = 516점.
 */
export function buildTutorialRival(): RivalRecord {
  let hr = 0;
  const rounds = TUTORIAL_OUTCOMES.map<RivalRound>((outcome) => {
    if (outcome === 'homerun') {
      const meters = TUTORIAL_HOMERUN_METERS[hr % TUTORIAL_HOMERUN_METERS.length];
      hr += 1;
      return { outcome, score: homerunScore(meters) };
    }
    if (outcome === 'hit') return { outcome, score: TUTORIAL_HIT_SCORE };
    if (outcome === 'foul') return { outcome, score: TUTORIAL_FOUL_SCORE };
    return { outcome, score: 0 }; // strike · out
  });
  return { rounds, total: rounds.reduce((sum, r) => sum + r.score, 0), playedAt: 0 };
}

// ── 지난 경기 기록 저장소 ──────────────────────────────────────────────

/** localStorage 키 — 이 기기에서 끝낸 경기들. */
const RECORDS_KEY = 'homerun_rival_records_v1';
/** 보관할 최대 경기 수 — 넘치면 오래된 것부터 버린다. */
const MAX_RECORDS = 20;

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // 사파리 프라이빗 모드 등
  }
}

/** 저장된 경기 기록 전체(형식이 깨졌으면 빈 배열). */
export function loadRecords(): RivalRecord[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function isRecord(v: unknown): v is RivalRecord {
  const r = v as RivalRecord;
  return (
    !!r &&
    Array.isArray(r.rounds) &&
    r.rounds.length === ROUNDS_PER_GAME &&
    r.rounds.every((x) => typeof x?.score === 'number' && typeof x?.outcome === 'string') &&
    typeof r.total === 'number'
  );
}

/**
 * 방금 끝난 경기를 상대 후보로 저장한다 — 다음 판부터 누군가의 상대가 된다.
 * 회차 수가 안 맞는(중간 기권 등) 기록은 버린다 — 9회를 다 채운 경기만 상대로 쓸 수 있다.
 */
export function saveRecord(rounds: ReadonlyArray<RivalRound>, playedAt: number): void {
  const s = safeStorage();
  if (!s || rounds.length !== ROUNDS_PER_GAME) return;
  const record: RivalRecord = { rounds, total: rounds.reduce((sum, r) => sum + r.score, 0), playedAt };
  const next = [...loadRecords(), record].slice(-MAX_RECORDS);
  try {
    s.setItem(RECORDS_KEY, JSON.stringify(next));
  } catch {
    /* 용량 초과 등 — 저장 실패해도 게임 진행에는 지장 없다 */
  }
}

/**
 * 이번 판의 상대를 고른다.
 *  · 저장된 경기가 없으면(=첫 판) 튜토리얼 상대.
 *  · 있으면 그중 하나를 무작위로 — 매번 같은 상대만 나오지 않게 한다.
 */
export function pickRival(rng: () => number = Math.random): RivalRecord {
  const records = loadRecords();
  if (!records.length) return buildTutorialRival();
  const idx = Math.min(records.length - 1, Math.floor(rng() * records.length));
  return records[idx];
}

/** 첫 판(=튜토리얼)인지 — 저장된 경기 기록이 하나도 없으면 첫 판이다. */
export function isTutorialMatch(): boolean {
  return loadRecords().length === 0;
}
