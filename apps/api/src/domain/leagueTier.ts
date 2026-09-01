/**
 * 투데이 리그 밴드 매칭 — **P2 인프라**(docs/CLOUDFLARE_SERVER_STRATEGY.md §3 설계, Postgres 로 재타깃).
 *
 * ⚠️ 이 모듈은 아직 게임 클라가 실제로 소비하지 않는다 — 클라는 지금도 `logic/league.ts`의
 * `buildRoster`를 로컬에서 그대로 돌린다. 여기서는 ① `player_tier` 집계를 서버에 조용히 쌓고
 * ② 밴드별 봇 명단을 **밴드 배율 0(중립)일 때 클라 알고리즘과 정확히 같은 값**이 나오도록 구현해
 * 두어(아래 테스트가 골든값으로 고정) 나중에 클라를 `GET /league/roster` 호출로 전환할 때
 * 순위표가 갑자기 달라 보이지 않게 한다(`games/Solitare/docs/SERVER_INTEGRATION.md` §4 로드맵 P3).
 *
 * 정책 가드레일(§3.1): 입력은 레벨·승패·별(전부 유저 화면에 이미 보이는 값)뿐이다 — 결제·이탈
 * 확률 같은 비공개 신호는 이 파일에도, `player_tier` 스키마에도 컬럼으로조차 존재하지 않는다.
 */

// ─── 유저별 밴드 집계 ───

export interface PlayerTier {
  levelBand: number;
  /** 지수이동평균(0~1) — "최근 N판"의 근사(무한 이력을 안 쌓고 최근에 더 가중). */
  recentWinRate: number;
  /** 지수이동평균(0~5). */
  recentStarAvg: number;
  gamesCounted: number;
}

/** 레벨 밴드 단위 — 게임 클라 `save.ts`의 메인타워 완공 레벨(250)과 동일 사본. */
const LEVEL_BAND_SIZE = 250;
export function levelBandFor(level: number): number {
  return Math.max(0, Math.floor(Math.max(1, Math.floor(level)) / LEVEL_BAND_SIZE));
}

/** 최근 판에 더 가중 — 무한 이력 테이블 없이 "최근 N판" 취지를 근사한다. */
const EMA_ALPHA = 0.15;

export function applyRoundReport(prev: PlayerTier | null, input: { level: number; win: boolean; stars: number }): PlayerTier {
  const levelBand = levelBandFor(input.level);
  const stars = Math.min(5, Math.max(0, input.stars));
  const winVal = input.win ? 1 : 0;
  if (!prev || prev.gamesCounted === 0) {
    return { levelBand, recentWinRate: winVal, recentStarAvg: stars, gamesCounted: 1 };
  }
  return {
    levelBand,
    recentWinRate: EMA_ALPHA * winVal + (1 - EMA_ALPHA) * prev.recentWinRate,
    recentStarAvg: EMA_ALPHA * stars + (1 - EMA_ALPHA) * prev.recentStarAvg,
    gamesCounted: Math.min(999_999, prev.gamesCounted + 1),
  };
}

// ─── 밴드별 봇 명단(클라 `logic/league.ts` buildRoster/botPointsAt 과 동일 알고리즘의 서버 사본) ───

/** 봇 닉네임 40개 — 게임 클라 `config/leagueNames.ts`와 동일 사본(값을 바꿀 땐 두 파일 다 고칠 것). */
const LEAGUE_NICKNAMES: readonly string[] = [
  '카드장인', 'AceHunter', '한줄더', 'SpadeKing', '건물주꿈나무', 'CityBloom', '솔리테어러버', 'RoyalFlush7',
  '조커한장', 'TowerUp', '연승중', 'HeartQueen', '층층이', 'CardSmith', '다이아모아', 'NeonDeck',
  '오늘도한판', 'ClubMaster', '스택쌓기', 'PennyLane', '골든크러스트', 'MidnightDeal', '별다섯', 'ShuffleGo',
  '점포왕', 'AceOfCity', '느긋한손', 'PixelPile', '커피한잔', 'GrandSlam88', '무한콤보', 'VelvetJack',
  '옥상정원', 'LuckyDraw', '한수앞', 'SkylineKo', '분양완료', 'CardCarla', '야근왕', 'QuietRiver',
] as const;

const LEAGUE_ROSTER_SIZE = 99;
const LEAGUE_TOP_TARGET = 510; // = 85 * STAR_SCALE(6) — 클라 config/league.ts 사본.
const LEAGUE_TARGET_FALLOFF = 1.0;
const LEAGUE_TARGET_JITTER = 0.12;
const PROFILE_COUNT = 5;
/** 밴드 배율의 기준 별 평균 — 게임 클라 `economy.ts` BREAKEVEN_STARS(3★=손익분기)와 같은 앵커. */
const BAND_STAR_REF = 3.0;

/** 결정적 해시 — 클라와 정확히 같은 정수 연산(부동소수 아님, 포팅 드리프트 없음). */
function hash01(period: number, salt: number): number {
  let h = (period * 2654435761 + salt * 40503 + 0x9e3779b9) | 0;
  h = (h ^ (h >>> 15)) * 2246822519;
  h = (h ^ (h >>> 13)) * 3266489917;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100_000) / 100_000;
}

export interface LeagueBot {
  readonly id: number;
  readonly name: string;
  readonly avatar: number;
  readonly target: number;
  readonly pace: number;
}

/**
 * 밴드 배율 — 그 밴드 평균 별이 기준선(3.0)보다 높으면(잘하는 유저가 많은 밴드) 목표를 살짝
 * 올린다. 데이터가 아직 없는 밴드(`bandAvgStar=null`)는 배율 1(클라 로컬 알고리즘과 동일).
 * ±15% 로 묶어 둔다 — PO 검토 전에는 체감 차이가 크지 않게(§ 파일 헤더의 "아직 미소비" 참고).
 */
function bandDifficultyMult(bandAvgStar: number | null): number {
  if (bandAvgStar == null) return 1;
  return Math.min(1.15, Math.max(0.85, bandAvgStar / BAND_STAR_REF));
}

/**
 * 그날·그 밴드의 봇 명단 — `bandAvgStar=null`이면 클라 `buildRoster(periodId)`와 **정확히 동일**한
 * 출력을 낸다(아래 테스트의 골든값 참조).
 */
export function buildRosterForBand(periodId: number, bandAvgStar: number | null): readonly LeagueBot[] {
  const bots: LeagueBot[] = [];
  const offset = Math.floor(hash01(periodId, 7) * LEAGUE_NICKNAMES.length);
  const top = LEAGUE_TOP_TARGET * bandDifficultyMult(bandAvgStar);
  for (let i = 0; i < LEAGUE_ROSTER_SIZE; i++) {
    const base = top / Math.pow(i + 1, LEAGUE_TARGET_FALLOFF);
    const jitter = 1 + (hash01(periodId, i * 3 + 1) * 2 - 1) * LEAGUE_TARGET_JITTER;
    const name = LEAGUE_NICKNAMES[(offset + i * 7) % LEAGUE_NICKNAMES.length]!;
    bots.push({
      id: i,
      name,
      avatar: 1 + ((i + Math.floor(hash01(periodId, 11) * PROFILE_COUNT)) % PROFILE_COUNT),
      target: Math.max(1, Math.round(base * jitter)),
      pace: 0.6 + hash01(periodId, i * 3 + 2) * 1.0,
    });
  }
  return bots;
}
