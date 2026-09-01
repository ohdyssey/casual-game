/**
 * 투데이 리그 — **가상 시뮬레이션**(순수 로직) + **P3: 서버 밴드 명단 캐시 우선**.
 *
 * 규칙
 *   ① 기간 = 로컬 자정 기준 24시간. 기간 id 는 "로컬 날짜의 일 인덱스".
 *   ② 참가자 = 나 + 봇 99명. 봇 명단·목표 점수는 **기간 id 로 시드 고정** — 같은 날 팝업을
 *      몇 번 열어도 순위표가 흔들리지 않고, 날이 바뀌면 판이 새로 짜인다.
 *   ③ 봇 점수는 기간 진행률(0~1)에 따라 자기 목표까지 자기 페이스로 오른다(늦게 치고 올라오는
 *      봇, 일찍 달리는 봇). "살아 있는 순위표"의 착시는 여기서 나온다.
 *   ④ 자정을 넘기면 그 기간의 최종 순위로 보상을 정산하고 점수를 0 으로 되돌린다.
 *
 * ⚠️ **P3(2026-09-01)**: `standings`·`settleLeague`가 부르는 `buildRoster(periodId)`는 이제 서버가
 *   미리 채워 둔 캐시(`setServerRoster`)를 **먼저** 본다 — 있으면 그 값(밴드 보정 목표), 없으면
 *   기존 로컬 결정적 알고리즘. `buildRoster` 자체를 비동기로 바꾸지 않은 이유는 이 함수를 부르는
 *   `standings()`가 `leaguePanel.ts`·`leagueRail.ts`·`HomeScene` 등 여러 곳에서 **동기 호출**되기
 *   때문이다(`docs/CLOUDFLARE_SERVER_STRATEGY.md` §3.4 "클라 변경 최소화" 원칙) — 전부 async 로
 *   바꾸는 대신, 화면 진입 시 `logic/serverSync.ts`의 `prefetchLeagueRoster()`가 **미리** 캐시를
 *   채워 두고, 이 함수는 있으면 쓰고 없으면(오프라인·아직 못 받음) 조용히 로컬로 폴백한다.
 *   ⚠️ **서버가 죽어 있어도, 네트워크가 없어도 리그는 항상 동작해야 한다** — 그래서 폴백이 항상
 *   1순위가 아니라 **캐시가 있을 때만** 우선한다.
 *
 * ⚠️ 펌프러시(BobbleRunner)에서 이식(PO 2026-08-23). 원본과 달라진 곳은 둘뿐이다:
 *   · **내 아바타**를 프로필에서 받는다(원본은 마지막 아트로 고정) — `logic/profile.ts`.
 *   · 봇 닉네임 풀이 이 게임 것이다(`config/leagueNames.ts`).
 */
import {
  LEAGUE_GIFT_RANKS,
  LEAGUE_MILESTONES,
  LEAGUE_MILESTONE_REWARDS,
  LEAGUE_RANK_REWARDS,
  LEAGUE_REWARD_DEFAULT,
  LEAGUE_ROSTER_SIZE,
  LEAGUE_TARGET_FALLOFF,
  LEAGUE_TARGET_JITTER,
  LEAGUE_TOP_TARGET,
  LEAGUE_VISIBLE_ROWS,
} from '../config/league.js';
import { LEAGUE_NICKNAMES } from '../config/leagueNames.js';
import { PROFILE_COUNT } from './profile.js';

export interface LeagueBot {
  readonly id: number;
  readonly name: string;
  /** 1~PROFILE_COUNT — 저작 프로필 아트 번호. */
  readonly avatar: number;
  /** 기간 종료 시점의 목표 점수. */
  readonly target: number;
  /** 페이스 지수(<1 = 초반 질주, >1 = 막판 추격). */
  readonly pace: number;
}

export interface LeagueRow {
  readonly rank: number;
  readonly name: string;
  readonly avatar: number;
  readonly points: number;
  readonly isMe: boolean;
  /** 이 순위의 보상(코인). */
  readonly reward: number;
  /** 선물상자(추가 보상) 표시 여부. */
  readonly gift: boolean;
}

export interface LeagueStanding {
  /** 저작 5행에 그대로 꽂는 표시용 행 — 상위권 + (밖이면) 내 행. */
  readonly rows: readonly LeagueRow[];
  /** 전체 순위(1위부터) — '내 주변' 보기처럼 임의 구간을 잘라 쓸 때. */
  readonly allRows: readonly LeagueRow[];
  readonly myRank: number;
  readonly myPoints: number;
  /** 참가자 총원(나 포함). */
  readonly total: number;
}

export interface MilestoneProgress {
  /** 지금 달성한 마지막 마일스톤 값(아직 없으면 0). */
  readonly from: number;
  /** 다음 마일스톤 값(전부 달성했으면 마지막 값). */
  readonly to: number;
  /** 0~1 진행률 — 진행바 채움 비율. */
  readonly ratio: number;
  /** 다음 마일스톤 달성 보상(코인). */
  readonly reward: number;
  /** 전 구간 달성 여부. */
  readonly maxed: boolean;
}

// ─── 기간 ───

/** 로컬 자정 기준 일 인덱스 — 이 값이 바뀌면 새 리그 기간이다. */
export function periodIdFor(now: Date): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** 기간 진행률 0~1(로컬 자정 → 다음 자정). */
export function periodProgress(now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / 86_400_000));
}

// ─── 봇 명단(기간 시드 고정) ───

/** 결정적 해시 — 같은 (period, salt) 면 항상 같은 0~1 값. */
function hash01(period: number, salt: number): number {
  let h = (period * 2654435761 + salt * 40503 + 0x9e3779b9) | 0;
  h = (h ^ (h >>> 15)) * 2246822519;
  h = (h ^ (h >>> 13)) * 3266489917;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * 서버가 미리 채워 둔(prefetch) 밴드 보정 명단 — periodId 별로 최대 3개(오늘·어제·그제)만
 * 들고 있는다(무한 증식 방지, 정산에 필요한 건 오늘·어제뿐).
 */
const serverRoster = new Map<number, readonly LeagueBot[]>();

/** `logic/serverSync.ts` `prefetchLeagueRoster()`가 서버 응답을 받으면 여기로 채운다(P3). */
export function setServerRoster(periodId: number, bots: readonly LeagueBot[]): void {
  serverRoster.set(periodId, bots);
  if (serverRoster.size > 3) {
    const oldest = [...serverRoster.keys()].sort((a, b) => a - b)[0];
    if (oldest !== undefined) serverRoster.delete(oldest);
  }
}

/**
 * 그날의 봇 명단 — 점수 내림차순. 이름은 PVP 닉네임 풀을 기간별로 회전시켜 뽑아
 * 같은 얼굴이 매일 1위에 앉아 있지 않게 한다.
 *
 * ⚠️ 서버 캐시(`setServerRoster`)가 이 periodId 를 갖고 있으면 그걸 먼저 돌려준다(P3) — 없으면
 * (서버 미도달·오프라인 등) 아래 로컬 알고리즘으로 폴백한다. 폴백 결과는 밴드 배율이 없을 뿐
 * **서버 알고리즘과 정확히 같은 값**이라(`apps/api` `domain/leagueTier.test.ts` 골든 테스트로 고정),
 * 캐시가 늦게 도착해도 순위표가 눈에 띄게 달라 보이지 않는다.
 */
export function buildRoster(periodId: number): readonly LeagueBot[] {
  const cached = serverRoster.get(periodId);
  if (cached) return cached;
  const bots: LeagueBot[] = [];
  const offset = Math.floor(hash01(periodId, 7) * LEAGUE_NICKNAMES.length);
  // ⚠️ 원본에는 계정 레벨별 난이도 배수가 있었다(서버 매칭 대용). 이 게임에는 그 개념이 없어
  //   덜어냈다 — 필요해지면 여기 한 줄로 다시 붙일 수 있게 곱셈 자리를 남겨 둔다.
  const top = LEAGUE_TOP_TARGET;
  for (let i = 0; i < LEAGUE_ROSTER_SIZE; i++) {
    const base = top / Math.pow(i + 1, LEAGUE_TARGET_FALLOFF);
    const jitter = 1 + (hash01(periodId, i * 3 + 1) * 2 - 1) * LEAGUE_TARGET_JITTER;
    const name = LEAGUE_NICKNAMES[(offset + i * 7) % LEAGUE_NICKNAMES.length]!;
    bots.push({
      id: i,
      name,
      avatar: 1 + ((i + Math.floor(hash01(periodId, 11) * PROFILE_COUNT)) % PROFILE_COUNT),
      target: Math.max(1, Math.round(base * jitter)),
      pace: 0.6 + hash01(periodId, i * 3 + 2) * 1.0, // 0.6~1.6
    });
  }
  return bots;
}

/** 기간 진행률에 따른 봇의 현재 점수 — 자기 페이스 곡선으로 목표까지 오른다. */
export function botPointsAt(bot: LeagueBot, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(bot.target * Math.pow(p, bot.pace));
}

// ─── 순위·보상 ───

/** 순위별 보상(코인)과 선물상자 여부. */
export function rewardForRank(rank: number): { coins: number; gift: boolean } {
  const coins = LEAGUE_RANK_REWARDS[rank - 1] ?? LEAGUE_REWARD_DEFAULT;
  return { coins, gift: rank <= LEAGUE_GIFT_RANKS };
}

/**
 * 지금 시점의 순위표. 동점이면 **내가 위로** 간다(같은 점수를 모았는데 뒤로 밀리면
 * 억울하다 — 라이브 게임의 관례).
 */
export function standings(
  periodId: number,
  myPoints: number,
  progress: number,
  myName: string,
  /** 내 아바타 번호(1..PROFILE_COUNT) — 프로필에서 온다. */
  myAvatar = 1,
): LeagueStanding {
  const scored = buildRoster(periodId).map((b) => ({
    name: b.name,
    avatar: b.avatar,
    points: botPointsAt(b, progress),
    isMe: false,
  }));
  scored.push({ name: myName, avatar: myAvatar, points: myPoints, isMe: true });
  scored.sort((a, b) => (b.points === a.points ? (a.isMe ? -1 : b.isMe ? 1 : 0) : b.points - a.points));

  const ranked: LeagueRow[] = scored.map((e, i) => {
    const rank = i + 1;
    const { coins, gift } = rewardForRank(rank);
    return { rank, name: e.name, avatar: e.avatar, points: e.points, isMe: e.isMe, reward: coins, gift };
  });
  const myRank = ranked.findIndex((r) => r.isMe) + 1;

  // 표시 행 — 순위표 안이면 상위 N 그대로, 밖이면 상위 (N-1) + 내 행.
  const rows =
    myRank <= LEAGUE_VISIBLE_ROWS
      ? ranked.slice(0, LEAGUE_VISIBLE_ROWS)
      : [...ranked.slice(0, LEAGUE_VISIBLE_ROWS - 1), ranked[myRank - 1]!];

  return { rows, allRows: ranked, myRank, myPoints, total: ranked.length };
}

// ─── 마일스톤(진행바) ───

/** 지금 점수의 마일스톤 구간과 다음 구간까지의 진행률. */
export function milestoneProgress(points: number): MilestoneProgress {
  const ms = LEAGUE_MILESTONES;
  const last = ms[ms.length - 1]!;
  if (points >= last) {
    return { from: last, to: last, ratio: 1, reward: LEAGUE_MILESTONE_REWARDS[ms.length - 1]!, maxed: true };
  }
  let idx = 0; // 다음 마일스톤 인덱스
  while (idx < ms.length && points >= ms[idx]!) idx += 1;
  const from = idx === 0 ? 0 : ms[idx - 1]!;
  const to = ms[idx]!;
  const span = to - from;
  return {
    from,
    to,
    ratio: span <= 0 ? 1 : Math.min(1, Math.max(0, (points - from) / span)),
    reward: LEAGUE_MILESTONE_REWARDS[idx]!,
    maxed: false,
  };
}

// ─── 기간 정산 ───

export interface LeagueSettleInput {
  /** 세이브에 남아 있는 기간 id. */
  readonly savedPeriodId: number;
  /** 그 기간에 모은 점수. */
  readonly savedPoints: number;
  readonly nowPeriodId: number;
  readonly myName: string;
  readonly myAvatar?: number;
}

export interface LeagueSettleResult {
  /** 정산이 일어났는가(기간이 바뀌었고 참가 기록이 있었는가). */
  readonly settled: boolean;
  readonly rank: number;
  readonly points: number;
  readonly coins: number;
  readonly gift: boolean;
}

/**
 * 기간 전환 정산 — 저장된 기간이 지난 기간이면 그 기간의 **최종 순위**(진행률 1)로
 * 보상을 계산한다. 점수가 0 이면(참가 안 함) 보상 없음.
 */
export function settleLeague(input: LeagueSettleInput): LeagueSettleResult {
  const none = { settled: false, rank: 0, points: 0, coins: 0, gift: false };
  if (input.savedPeriodId === input.nowPeriodId) return none;
  if (input.savedPoints <= 0) return none;
  const final = standings(input.savedPeriodId, input.savedPoints, 1, input.myName, input.myAvatar ?? 1);
  const { coins, gift } = rewardForRank(final.myRank);
  return { settled: true, rank: final.myRank, points: input.savedPoints, coins, gift };
}
