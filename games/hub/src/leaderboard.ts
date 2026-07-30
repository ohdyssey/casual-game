/**
 * leaderboard — PlayPOP 포털 글로벌 랭킹(1~10위) 데이터.
 *
 * 표시 규칙(공통 국기 라이브러리 참조): 행 = [순위][국기][아이디][점수].
 *   국가명이 아니라 "플레이어 아이디"를 노출한다(국기는 소속 국가 장식).
 * 백엔드(Supabase) 연동 전까지는 로컬에서 결정적으로 생성한 데모 보드를 쓴다.
 *   - 내 식별자(아이디·국가)는 localStorage 에 1회 생성·영속.
 *   - NPC 9명은 내 아이디를 시드로 결정적 생성 → 새로고침해도 보드가 흔들리지 않음.
 *   - 내 점수는 프로필(레벨·최고점)에서 환산 → NPC 가 그 주변에 분포해 자연스러운 등수.
 */
import type { Profile } from '@casual/core/liveops';

const IDENTITY_KEY = 'playpop_identity_v1';

/** 플레이어 식별자(아이디 + 소속 국가 ISO3). 국기 파일 = flag_{iso3}.svg */
export interface Identity {
  id: string;
  iso3: string;
}

/** 리더보드 한 행. */
export interface RankRow {
  rank: number;
  iso3: string;
  id: string;
  score: number;
  you: boolean;
}

/** NPC 로스터(아이디 + 국가). 다양한 국가의 핸들 — 국가명이 아니라 아이디로 표시된다. */
const NPCS: readonly Identity[] = [
  { id: 'ShadowFox', iso3: 'USA' },
  { id: '네온라이더', iso3: 'KOR' },
  { id: 'Kaito_77', iso3: 'JPN' },
  { id: 'LongMa', iso3: 'CHN' },
  { id: 'Verde99', iso3: 'BRA' },
  { id: 'Lumière', iso3: 'FRA' },
  { id: 'BlitzKron', iso3: 'DEU' },
  { id: 'ElToro', iso3: 'MEX' },
  { id: 'Yıldız', iso3: 'TUR' },
  { id: 'RajaX', iso3: 'IND' },
  { id: 'Gunner_UK', iso3: 'GBR' },
  { id: 'Matador', iso3: 'ESP' },
  { id: 'Azzurro', iso3: 'ITA' },
  { id: 'MapleByte', iso3: 'CAN' },
  { id: 'Outback_9', iso3: 'AUS' },
  { id: 'TangoZ', iso3: 'ARG' },
  { id: 'Oranje', iso3: 'NLD' },
  { id: 'NordViking', iso3: 'SWE' },
  { id: 'BondiBlue', iso3: 'PRT' },
  { id: 'RedSquare', iso3: 'RUS' },
];

/** 내 아이디 자동 생성용 단어 풀(영속 전 1회). */
const ADJ = ['Swift', 'Neon', 'Iron', 'Lucky', 'Crimson', 'Turbo', 'Mega', 'Pixel', 'Golden', 'Wild'];
const NOUN = ['Tiger', 'Comet', 'Falcon', 'Bolt', 'Ninja', 'Dragon', 'Panda', 'Rocket', 'Wolf', 'Star'];

/** 문자열 해시(FNV-1a 32bit) → 결정적 시드. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — 시드 기반 결정적 0~1 난수 생성기. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** localStorage 에서 내 식별자 로드(없으면 생성·저장). */
export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Identity>;
      if (v && typeof v.id === 'string' && typeof v.iso3 === 'string') {
        return { id: v.id, iso3: v.iso3 };
      }
    }
  } catch {
    /* 손상된 값은 무시하고 재생성 */
  }
  const r = rng(hashSeed(String(Date.now())));
  const id = `${ADJ[Math.floor(r() * ADJ.length)]}${NOUN[Math.floor(r() * NOUN.length)]}${10 + Math.floor(r() * 89)}`;
  const identity: Identity = { id, iso3: 'KOR' };
  saveIdentity(identity);
  return identity;
}

/** 내 식별자 영속(아이디 변경 시에도 사용). */
export function saveIdentity(identity: Identity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* 저장 실패는 치명적이지 않음 */
  }
}

/** 프로필 → 리더보드 점수(트로피) 환산. 신규 프로필도 중위권에서 시작하도록 베이스 부여. */
export function trophyScore(p: Profile): number {
  return 20 + p.level * 3 + Math.floor(p.bestScore / 50);
}

/**
 * 글로벌 Top 10 보드 생성.
 * NPC 점수는 내 점수 주변(±band)에 결정적으로 분포 → 등수가 자연스럽게 갈린다.
 *   mode(일일/주간/미션)별로 시드를 달리해 서로 다른 랭킹 보드를 결정적으로 만든다.
 */
export function buildBoard(identity: Identity, profile: Profile, mode = 'daily'): RankRow[] {
  const me = trophyScore(profile);
  const rand = rng(hashSeed(`${identity.id || 'guest'}:${mode}`));

  // NPC 9명을 시드로 셔플·선택.
  const pool = [...NPCS].sort(() => rand() - 0.5).slice(0, 9);

  const npcRows = pool.map((n) => {
    // 내 점수 기준 -10 ~ +14 분포(살짝 위가 더 강한 상대들).
    const delta = Math.round((rand() - 0.42) * 24);
    return { iso3: n.iso3, id: n.id, score: Math.max(1, me + delta), you: false };
  });

  const all = [
    ...npcRows,
    { iso3: identity.iso3, id: identity.id, score: me, you: true },
  ];

  // 점수 내림차순(동점이면 나를 우선 노출).
  all.sort((a, b) => b.score - a.score || (a.you ? -1 : b.you ? 1 : 0));

  return all.slice(0, 10).map((row, i) => ({ rank: i + 1, ...row }));
}
