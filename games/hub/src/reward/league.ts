/**
 * reward/league — CashPOP 주간 리그(순위 경쟁) 순수 로직 + 로컬 mock 상태.
 *
 * 미션리워드 앱 벤치마크 구조:
 *   · 주간 시즌(월 00:00 ~ 일 23:59) — 종료 시 순위 구간별 캐시 계단식 차등 + 참여 전원 보상
 *   · 포인트(P)는 미션·광고 완료로만 획득(광고 2배 가중) → 광고 시청이 순위의 연료
 *   · 주사위 = P 가속 부스터(굴려서 P 획득). 광고 시청으로 충전, 유료 패키지는 mock
 *   · 경쟁 상대 = 결정적 봇 99명(시즌키 시드) — 시간이 지날수록 점수가 올라 재접속을 압박
 *
 * Phase A(프론트 mock): 상태는 localStorage. 실서버 랭킹은 Phase B.
 */
import {
  LEAGUE_TIERS,
  LEAGUE_JOIN_DIA,
  LEAGUE_SIZE,
  ROLL_MULT,
  ROLL_JACKPOT,
  DICE_START,
  SLOT_BONUS_MULT,
  type LeagueTier,
} from './data.js';

const DAY = 86400000;
const WEEK = 7 * DAY;
const STORE_KEY = 'cashpop_league_v1';

/* ─────────── 시즌(주간) ─────────── */

/** 이번 주 월요일 00:00(로컬) 타임스탬프. */
export function seasonStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  return d.getTime() - dow * DAY;
}

/** 시즌 종료(일요일 23:59:59.999). */
export function seasonEnd(now: number): number {
  return seasonStart(now) + WEEK - 1;
}

/** 시즌 키 — 주 시작일 기반('W2026-07-06'). 정산 시 이 키로 시작 시각을 복원한다. */
export function seasonKey(now: number): string {
  const s = new Date(seasonStart(now));
  const mm = String(s.getMonth() + 1).padStart(2, '0');
  const dd = String(s.getDate()).padStart(2, '0');
  return `W${s.getFullYear()}-${mm}-${dd}`;
}

/** 시즌 키 → 시작 타임스탬프(로컬 자정). 파싱 실패 시 null. */
export function seasonStartOfKey(key: string): number | null {
  const m = /^W(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** 종료까지 남은 일수(오늘 포함, 1~7). */
export function seasonDday(now: number): number {
  return Math.max(1, Math.ceil((seasonEnd(now) - now) / DAY));
}

/** 표기용 시즌 라벨('7/6 ~ 7/12'). */
export function seasonLabel(now: number): string {
  const s = new Date(seasonStart(now));
  const e = new Date(seasonEnd(now));
  return `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
}

/* ─────────── 시간대 보너스(아침/점심/저녁) ─────────── */

export interface SlotBonus {
  name: string;
  icon: string;
  mult: number;
  /** 보너스 종료 시각 표기(예: '11:00'). */
  until: string;
}

/** 현재 시각이 보너스 시간대(아침 06~11 / 점심 11~14 / 저녁 17~23)면 그 정보를 반환. */
export function slotBonus(now: number): SlotBonus | null {
  const h = new Date(now).getHours();
  if (h >= 6 && h < 11) return { name: '아침', icon: '🌅', mult: SLOT_BONUS_MULT, until: '11:00' };
  if (h >= 11 && h < 14) return { name: '점심', icon: '☀️', mult: SLOT_BONUS_MULT, until: '14:00' };
  if (h >= 17 && h < 23) return { name: '저녁', icon: '🌙', mult: SLOT_BONUS_MULT, until: '23:00' };
  return null;
}

/** 시간대 보너스를 적용한 P(비활성 시간대엔 원값). */
export function withSlotBonus(pts: number, now: number): number {
  const b = slotBonus(now);
  return b ? Math.round(pts * b.mult) : pts;
}

/* ─────────── 결정적 봇 99명 ─────────── */

const BOT_NAMES = [
  '골드킹', '잭팟왕', '밤샘러', '미션마', '보물꾼', '새벽별', '출석왕', '캐시백', '주사위신', '행운아',
  '골드러시', '시즌킹', '퀴즈왕', '돌림판', '사다리', '황금손', '럭키가이', '성실왕', '도전자', '불꽃적립',
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bot {
  name: string;
  /** 시간당 P 상승률 — 상위 소수만 빠른 지수적 분포. */
  rate: number;
  phase: number;
}

function makeBots(key: string): Bot[] {
  const rnd = mulberry32(hashStr(key));
  const bots: Bot[] = [];
  for (let i = 0; i < LEAGUE_SIZE - 1; i++) {
    const name = BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? String(i + 1) : '');
    const t = rnd(); // 0~1 — 제곱 분포로 상위 봇만 가파르게
    bots.push({ name, rate: 3 + 31 * t * t, phase: rnd() * Math.PI * 2 });
  }
  return bots;
}

/** 시즌 경과시간 기준 봇 점수(5분 계단 — 재접속 때마다 조금씩 올라 추격 압박). */
function botScore(b: Bot, elapsedMs: number): number {
  const h = Math.floor(Math.max(0, elapsedMs) / 300000) / 12; // 5분 양자화 → 시간 단위
  const wave = 1 + 0.25 * Math.sin(h / 2.6 + b.phase); // 봇별 완급(결정적)
  return Math.max(0, Math.round(b.rate * h * wave));
}

/* ─────────── 순위/보상 ─────────── */

export interface BoardRow {
  rank: number;
  name: string;
  pts: number;
  isMe: boolean;
}

export interface Board {
  /** TOP 10 + (내가 10위 밖이면) 내 주변 3행. */
  rows: BoardRow[];
  myRank: number;
  total: number;
}

/** 현재 시각 기준 전체 보드 계산(나+봇 99, 동점은 봇 우선 — 추월 동기 부여). */
export function computeBoard(myPts: number, now: number): Board {
  const key = seasonKey(now);
  const elapsed = now - seasonStart(now);
  const entries = makeBots(key)
    .map((b) => ({ name: b.name, pts: botScore(b, elapsed), isMe: false }));
  entries.push({ name: '나', pts: myPts, isMe: true });
  entries.sort((a, b) => b.pts - a.pts || (a.isMe ? 1 : -1));
  const ranked: BoardRow[] = entries.map((e, i) => ({ rank: i + 1, ...e }));
  const myRank = ranked.find((r) => r.isMe)!.rank;
  const rows = ranked.slice(0, 10);
  if (myRank > 11) rows.push(...ranked.slice(myRank - 2, myRank + 1));
  else if (myRank === 11) rows.push(ranked[10]);
  return { rows, myRank, total: LEAGUE_SIZE };
}

/** 순위가 속한 보상 구간(1,000위 밖 등 구간 없음 → null). */
export function tierFor(rank: number): LeagueTier | null {
  return LEAGUE_TIERS.find((t) => rank >= t.from && rank <= t.to) ?? null;
}

/** 시즌 종료 시 예상 수령액(💎 다이아) = 구간 보상 + 참여 보상(P>0). 환전은 교환소에서. */
export function rewardFor(rank: number, pts: number): number {
  const tier = pts > 0 ? tierFor(rank) : null;
  return (tier?.dia ?? 0) + (pts > 0 ? LEAGUE_JOIN_DIA : 0);
}

/* ─────────── 로컬 상태(mock) ─────────── */

export interface LeagueState {
  key: string;
  pts: number;
  dice: number;
}

function readRaw(): Partial<LeagueState> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Partial<LeagueState>;
  } catch {
    return {};
  }
}

function write(s: LeagueState): LeagueState {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패는 무시(mock) */
  }
  return s;
}

/** 현재 시즌 상태 로드(첫 진입이면 체험용 주사위 지급). 시즌 정산은 settleIfNeeded 로. */
export function loadLeague(now: number): LeagueState {
  const raw = readRaw();
  return {
    key: typeof raw.key === 'string' ? raw.key : seasonKey(now),
    pts: Number(raw.pts) || 0,
    dice: raw.dice === undefined ? DICE_START : Number(raw.dice) || 0,
  };
}

export interface SeasonResult {
  rank: number;
  pts: number;
  /** 지급 다이아(💎) — 환전 가능 재화. P는 랭킹 전용이라 시즌과 함께 소멸. */
  dia: number;
}

/**
 * 시즌 롤오버 정산 — 저장된 키가 지난 시즌이면 그 시즌 '종료 시점' 순위로 보상을 계산하고
 * 새 시즌 상태로 리셋한다. 다이아 지급은 호출부(셸) 책임.
 */
export function settleIfNeeded(now: number): SeasonResult | null {
  const cur = seasonKey(now);
  const s = loadLeague(now);
  if (s.key === cur) {
    write(s); // 첫 진입 시 기본 상태 확정
    return null;
  }
  let result: SeasonResult | null = null;
  const prevStart = seasonStartOfKey(s.key);
  if (prevStart !== null && s.pts > 0) {
    const prevEnd = prevStart + WEEK - 1;
    const rank = computeBoardAt(s.key, s.pts, prevEnd - prevStart);
    result = { rank, pts: s.pts, dia: rewardFor(rank, s.pts) };
  }
  write({ key: cur, pts: 0, dice: s.dice });
  return result;
}

/** 특정 시즌 키·경과시간 기준 내 순위(정산용). */
function computeBoardAt(key: string, myPts: number, elapsedMs: number): number {
  const scores = makeBots(key).map((b) => botScore(b, elapsedMs));
  return scores.filter((p) => p >= myPts).length + 1; // 동점은 봇 우선
}

/** P 적립(자동 시즌 참여). 갱신된 상태 반환. */
export function addPts(n: number, now: number): LeagueState {
  const s = loadLeague(now);
  if (n <= 0) return s;
  return write({ ...s, key: seasonKey(now), pts: s.pts + n });
}

/** 주사위 적립. */
export function addDice(n: number, now: number): LeagueState {
  const s = loadLeague(now);
  if (n <= 0) return s;
  return write({ ...s, key: seasonKey(now), dice: s.dice + n });
}

export interface RollResult {
  face: number;
  gained: number;
  jackpot: boolean;
  state: LeagueState;
}

/** 주사위 1개 굴리기 — 눈(1~6)×ROLL_MULT P, 6이면 잭팟 +ROLL_JACKPOT. 없으면 null. */
export function rollDice(now: number): RollResult | null {
  const s = loadLeague(now);
  if (s.dice <= 0) return null;
  const face = 1 + Math.floor(Math.random() * 6);
  const jackpot = face === 6;
  const gained = face * ROLL_MULT + (jackpot ? ROLL_JACKPOT : 0);
  const state = write({ key: seasonKey(now), pts: s.pts + gained, dice: s.dice - 1 });
  return { face, gained, jackpot, state };
}
