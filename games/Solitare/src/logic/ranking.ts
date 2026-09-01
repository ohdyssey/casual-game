/**
 * ranking.ts — 리더보드 데이터(가상). 순수 로직(Phaser·DOM 없음).
 *
 * 펌프러시 리더보드 화면을 이식하면서(PO 2026-08-23) 데이터 층은 **이 게임 것으로 새로 썼다.**
 * 그쪽 카테고리(무한·질주·타임어택·PVP 레이팅)는 이 게임에 없는 모드라 그대로 옮기면 빈 탭만 남는다.
 *
 * ## 저작 탭 3개에 1:1 대응
 *   · 최고 레벨 — 진행도(save.level)
 *   · 최고 층   — 지어 올린 층수(save.builtFloors)
 *   · 리그 점수 — 오늘 모은 별(save.leaguePoints)
 * 셋 다 **이미 저장되는 값**이다. 새 지표를 만들지 않았다.
 *
 * ⚠️ 서버가 없다. 봇은 **기간 시드로 고정**해 만든다 — 같은 날 몇 번을 열어도 순위표가 흔들리지
 *   않고, 날이 바뀌면 판이 새로 짜인다(리그와 같은 규약).
 */
import { LEAGUE_NICKNAMES } from '../config/leagueNames.js';
import type { SaveData } from '../save.js';

export type RankCategory = 'level' | 'floor' | 'league';

export const RANK_CATEGORIES: ReadonlyArray<{ id: RankCategory; label: string }> = [
  { id: 'level', label: '최고레벨' },
  { id: 'floor', label: '최고층' },
  { id: 'league', label: '리그점수' },
];

/** 한 줄. */
export interface RankEntry {
  readonly name: string;
  /** ISO3 국가 코드 — `public/flags/flag_{ISO3}.svg`. */
  readonly flag: string;
  readonly value: number;
  readonly isPlayer: boolean;
  /** 1..5 프로필 아트 번호. */
  readonly avatar: number;
}

export interface RankingView {
  readonly entries: readonly RankEntry[];
  /** 내 순위(1부터). 기록이 없으면 null. */
  readonly playerRank: number | null;
}

/** 봇에 붙일 국기 풀 — `public/flags` 에 실제로 있는 것만. */
const FLAGS: readonly string[] = [
  'KOR', 'USA', 'JPN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'CAN', 'AUS',
  'BRA', 'ARG', 'MEX', 'IND', 'IDN', 'THA', 'VNM', 'PHL', 'TUR', 'POL',
];
/** 내 국기 — 계정에 국가 정보가 없어 한국 고정(계정이 붙으면 여기서 교체). */
const MY_FLAG = 'KOR';

/** 참가자 총원(나 포함) — 순위 숫자가 그럴듯해 보이는 규모. */
const ROSTER = 25;

/** 결정적 해시 — 같은 (seed, salt) 면 항상 같은 0~1. */
function hash01(seed: number, salt: number): number {
  let h = (seed * 2654435761 + salt * 40503 + 0x9e3779b9) | 0;
  h = (h ^ (h >>> 15)) * 2246822519;
  h = (h ^ (h >>> 13)) * 3266489917;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100_000) / 100_000;
}

/** 내 값 — 카테고리별로 세이브에서 뽑는다. */
export function playerValue(cat: RankCategory, save: SaveData): number {
  if (cat === 'level') return Math.max(1, Math.floor(save.level));
  if (cat === 'floor') return Math.max(1, Math.floor(save.builtFloors));
  return Math.max(0, Math.floor(save.leaguePoints ?? 0));
}

/**
 * 카테고리별 봇 분포의 **기준값** — 내 값 근처에 몰리도록 만든다.
 * 고정 상수로 두면 초반엔 전부 나보다 위, 후반엔 전부 아래가 되어 순위가 의미를 잃는다.
 */
function topFor(cat: RankCategory, mine: number): number {
  const floor = cat === 'floor' ? 3 : cat === 'league' ? 12 : 20;
  return Math.max(floor, Math.round(mine * 1.6) + floor);
}

/** 봇 명단(시드 고정). `seed` 는 날짜 인덱스 — 날이 바뀌면 판이 새로 짜인다. */
function botEntries(cat: RankCategory, seed: number, mine: number): RankEntry[] {
  const top = topFor(cat, mine);
  const out: RankEntry[] = [];
  const offset = Math.floor(hash01(seed, 3) * LEAGUE_NICKNAMES.length);
  for (let i = 0; i < ROSTER - 1; i++) {
    // 1등에서 아래로 완만히 감쇠 + 흔들림 — 같은 값이 줄줄이 붙지 않게.
    const base = top / Math.pow(i + 1, 0.45);
    const jitter = 1 + (hash01(seed, i * 5 + 1) * 2 - 1) * 0.1;
    out.push({
      name: LEAGUE_NICKNAMES[(offset + i * 7) % LEAGUE_NICKNAMES.length]!,
      flag: FLAGS[Math.floor(hash01(seed, i * 5 + 2) * FLAGS.length)]!,
      value: Math.max(1, Math.round(base * jitter)),
      isPlayer: false,
      avatar: 1 + Math.floor(hash01(seed, i * 5 + 3) * 5),
    });
  }
  return out;
}

/** 지금 순위표. 동점이면 **내가 위로** 간다(리그와 같은 규약). */
export function buildRanking(cat: RankCategory, save: SaveData, seed: number, myAvatar = 1): RankingView {
  const mine = playerValue(cat, save);
  const entries = botEntries(cat, seed, mine);
  entries.push({ name: '나', flag: MY_FLAG, value: mine, isPlayer: true, avatar: myAvatar });
  entries.sort((a, b) => (b.value === a.value ? (a.isPlayer ? -1 : b.isPlayer ? 1 : 0) : b.value - a.value));
  const idx = entries.findIndex((e) => e.isPlayer);
  return { entries, playerRank: idx >= 0 ? idx + 1 : null };
}

/** 값 표기 — 카테고리마다 단위가 다르다. */
export function formatRankValue(cat: RankCategory, value: number): string {
  if (cat === 'level') return `Lv.${value.toLocaleString()}`;
  if (cat === 'floor') return `${value.toLocaleString()}층`;
  return value.toLocaleString();
}

/** 리더보드가 쓰는 모든 국기 코드(로드용). */
export const RANK_FLAGS: readonly string[] = [...new Set([MY_FLAG, ...FLAGS])];
