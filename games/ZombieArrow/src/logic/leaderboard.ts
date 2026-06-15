/**
 * leaderboard — 좀비애로우러시 글로벌 랭킹(1~10위) 데이터(순수 함수, 테스트 가능).
 *
 * 표시 규칙(공통 국기 라이브러리 참조): 행 = [순위][국기][아이디][점수].
 *   국가명이 아니라 "플레이어 아이디"를 노출한다(국기는 소속 국가 장식).
 *
 * 실시간 랭킹: NPC 9명의 점수는 판 시작 시 한 번 결정(고정 사다리, 내 아이디 시드).
 *   내 점수는 0에서 시작해 좀비를 잡을수록 오르고, 매번 NPC 사다리에 다시 끼워 등수를 매긴다
 *   → 처치할수록 왼쪽 패널에서 등수가 실시간으로 올라간다.
 *   - 내 식별자(아이디·국가)는 localStorage 에 1회 생성·영속(허브와 동일 키 → prod 동일 origin 공유).
 *
 * (추후 @casual/core 로 hoist 고려 — 허브 games/hub/src/leaderboard.ts 와 설계 공유.)
 */

const IDENTITY_KEY = 'playpop_identity_v1';

/** 플레이어 식별자(아이디 + 소속 국가 ISO3). 국기 파일 = flag_{iso3}.svg */
export interface Identity {
  id: string;
  iso3: string;
}

/** NPC 한 명(국가·아이디·고정 점수). */
export interface NpcRow {
  iso3: string;
  id: string;
  score: number;
}

/** 리더보드 한 행(순위 매겨진 결과). */
export interface RankRow {
  rank: number;
  iso3: string;
  id: string;
  score: number;
  you: boolean;
}

/** NPC 로스터(아이디 + 국가). 국가명이 아니라 아이디로 표시된다. */
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
  const r = rng(hashSeed(`${Date.now()}`));
  const id = `${ADJ[Math.floor(r() * ADJ.length)]}${NOUN[Math.floor(r() * NOUN.length)]}${10 + Math.floor(r() * 89)}`;
  const identity: Identity = { id, iso3: 'KOR' };
  saveIdentity(identity);
  return identity;
}

/** 내 식별자 영속. */
export function saveIdentity(identity: Identity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* 저장 실패는 치명적이지 않음 */
  }
}

/**
 * 판 시작 시 NPC 9명의 고정 점수 사다리 생성(내 아이디 시드 → 판마다 같은 상대 구성).
 * 최상위 ~900~1320 에서 비율로 내려오는 사다리 → 좋은 한 판이면 1위까지 노려볼 만하고,
 * 중위권 상대는 플레이하며 하나씩 추월한다.
 */
export function buildNpcScores(identity: Identity): NpcRow[] {
  const rand = rng(hashSeed(identity.id || 'guest'));
  const pool = [...NPCS].sort(() => rand() - 0.5).slice(0, 9);
  let s = 900 + Math.floor(rand() * 420); // 최상위 점수
  return pool.map((n) => {
    const row: NpcRow = { iso3: n.iso3, id: n.id, score: Math.round(s / 5) * 5 };
    s *= 0.74 + rand() * 0.12; // 다음 등수는 74~86%로 하강
    return row;
  });
}

/**
 * 내 현재 점수를 NPC 사다리에 끼워 Top 10 산출(실시간 호출).
 *  - myScore: 지금까지의 점수(내 행의 점수).
 * 동점이면 나를 위로 노출. 9 NPC + 나 = 10명이라 나는 항상 보드에 든다(등수만 변한다).
 */
export function rankBoard(npcs: readonly NpcRow[], identity: Identity, myScore: number): RankRow[] {
  const me = Math.max(0, Math.floor(myScore));
  const all = [
    ...npcs.map((n) => ({ iso3: n.iso3, id: n.id, score: n.score, you: false })),
    { iso3: identity.iso3, id: identity.id, score: me, you: true },
  ];
  all.sort((a, b) => b.score - a.score || (a.you ? -1 : b.you ? 1 : 0));
  return all.slice(0, 10).map((row, i) => ({ rank: i + 1, ...row }));
}
