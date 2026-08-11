/**
 * econ/telemetry.ts — **실측 플레이어 데이터 수집 계층**(향후 "플레이 추적 → 데이터 보정" 대시보드 확장 대비).
 *
 *   게임(PlayScene)이 라운드마다 스냅샷을 기록 → 경제 콘솔(econ.html)이 **같은 origin localStorage**로 읽어 집계.
 *   현재 KPI·점검은 시뮬(모델) 기반이고, 이 모듈은 **실측치를 모델과 비교/보정**하기 위한 토대다.
 *   링버퍼(상한)로 용량 통제. 스키마 버전(v1) — 필드 추가 시 v2 로 올린다.
 *
 * ⭐v2(2026-07-07, 보상구조 재설계 시뮬레이션) — v1 스냅샷(잔고 궤적)에 더해 **이벤트 원장 + 누적 집계** 2층 추가.
 *   설계 근거(테스트플레이 데이터 → 확률 조정 연구):
 *     ① **이벤트 원장(EconEvent 링버퍼)** — 모든 재화 증감을 **소스별 태깅**으로 기록. "어느 지급원이 과잉/부족인가"를
 *        판단하는 확률 재설계의 1차 근거(라운드·슬롯결과 심볼·퍼즐멀티·스테이지·업그레이드·구매 전부).
 *     ② **누적 집계(EconTotals 별도 키)** — 링버퍼는 오래된 이벤트가 잘리므로, 장기 합계(소스별 유입·빈도·최저 잔고)는
 *        **이벤트마다 즉시 반영되는 집계 레코드**에 영속. 몇 시간짜리 오토플레이도 총량이 소실되지 않는다.
 *     ③ **아슬아슬(생존) 지표** — minSpins(최저 스핀 잔고)·noSpinBlocks(스핀 부족으로 막힘 횟수)를 집계해
 *        "스핀보상이 아슬아슬하게 통과"하는지(잔고가 0 근처를 스치되 자주 막히지 않는지)를 정량 판정.
 *   소비층: 경제 콘솔(econ.html) + PlayScene `window.__scEconDump()`(헤드리스 오토플레이 감시가 JSON 으로 수거).
 */

/** 라운드 1회 스냅샷(절대값). 연속 스냅샷의 차분으로 순증감·환수율·업틱을 집계. */
export interface PlaySnapshot {
  readonly t: number; // 타임스탬프(ms)
  readonly spins: number; // 라운드 종료 시 보유 스핀
  readonly coins: number; // 보유 코인
  readonly cityLevel: number; // 시티레벨
  readonly bet: number; // 이 라운드 코인 베팅(= spinBet × COIN_DENOM)
  readonly winCoins: number; // 이 라운드 획득 코인
}

export const TELEMETRY_KEY = 'socialcasino_econ_telemetry_v1';
export const TELEMETRY_CAP = 2000; // 링버퍼 상한(최근 N 라운드)

function read(): PlaySnapshot[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TELEMETRY_KEY) : null;
    if (!raw) return [];
    const o = JSON.parse(raw) as PlaySnapshot[];
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}

function write(list: ReadonlyArray<PlaySnapshot>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TELEMETRY_KEY, JSON.stringify(list));
  } catch {
    /* 용량 초과/시크릿 모드 무시 */
  }
}

/** 게임에서 라운드 종료 시 호출(PlayScene). 링버퍼에 append. */
export function recordSnapshot(s: PlaySnapshot): void {
  const list = read();
  list.push(s);
  write(list.length > TELEMETRY_CAP ? list.slice(list.length - TELEMETRY_CAP) : list);
}

export function loadSnapshots(): PlaySnapshot[] {
  return read();
}

export function clearTelemetry(): void {
  write([]);
}

/** 실측 집계(스냅샷 차분). 데이터 부족 시 null. */
export interface ObservedSummary {
  readonly rounds: number;
  readonly days: number;
  readonly netSpinPerDay: number;
  readonly coinRtp: number; // Σ획득코인 / Σ베팅
  readonly uptickRatio: number; // 스핀 증가 라운드 비율
  readonly spins: number; // 최신 잔고
  readonly coins: number;
  readonly cityLevel: number;
  readonly firstTs: number;
  readonly lastTs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⭐v2 — 이벤트 원장(소스별 태깅) + 누적 집계(링버퍼 소실 없음)
// ═══════════════════════════════════════════════════════════════════════════

/** 스핀 유입 소스 태그 — 지급구조 재설계의 분해 축. */
export type SpinSource =
  | 'gem' // 퍼즐 스핀젬 환급(그룹 3+)
  | 'bigwin' // 슬롯 대박/초대박 스핀
  | 'attack' // 어택 스테이지 보상(현 설정 0 — 계측으로 검증)
  | 'mission' // 미션 기본 보상
  | 'mission_bonus' // 미션 타임 보너스
  | 'daily' // 일일 로그인 지급
  | 'regen' // ⭐시간당 재생(50/시간, 상한 50)
  | 'facility' // ⭐시설 마일스톤(10업그레이드=100스핀)
  | 'stage_clear' // 호텔 스테이지 완성 보상
  | 'shop'; // 상점 구매
/** 코인 유입 소스 태그. */
export type CoinSource = 'slot' | 'jackpot' | 'raid' | 'mission' | 'stage_clear' | 'shop';

/**
 * 경제 이벤트 1건(원장 링버퍼) — 필드는 **짧은 키**(수천 건 JSON 영속 용량 통제).
 *   e='round'   : 한 라운드 정산. bet=스핀베팅, k=슬롯결과(none|coin|attack|raid), sym=매치심볼(-1=미매치),
 *                 m=퍼즐멀티, win=최종 획득 코인.
 *   e='spin_in' : 스핀 유입. src=SpinSource, n=수량.
 *   e='coin_in' : 코인 유입(라운드 승리 외 — 잭팟/레이드/미션/상점 등). src=CoinSource, n=수량.
 *   e='stage'   : 스테이지 진입. k=attack|raid, n=룰렛 스테이크.
 *   e='upgrade' : 시설(호텔) 업그레이드. n=코인 비용, L=업그레이드 **후** 시티레벨.
 *   e='block'   : 스핀 부족으로 플레이 막힘(생존 지표).
 *   e='reset'   : 시뮬레이션 리셋 마커. n=시작 스핀.
 *   공통: sp/co=이벤트 직후 스핀/코인 잔고, L=시티레벨(있으면).
 */
export interface EconEvent {
  readonly t: number;
  readonly e: 'round' | 'spin_in' | 'coin_in' | 'stage' | 'upgrade' | 'block' | 'reset';
  readonly src?: SpinSource | CoinSource;
  readonly n?: number;
  readonly k?: string;
  readonly sym?: number;
  readonly m?: number;
  readonly win?: number;
  readonly bet?: number;
  readonly sp?: number;
  readonly co?: number;
  readonly L?: number;
}

export const EVENTS_KEY = 'socialcasino_econ_events_v2';
export const EVENTS_CAP = 4000; // 원장 링버퍼 상한(최근 N 이벤트 ≈ 수 시간 오토플레이)
export const TOTALS_KEY = 'socialcasino_econ_totals_v2';

/** 스테이지(어택/레이드) 누적 한 종. */
export interface StageTotals {
  readonly count: number;
  readonly stakeSum: number;
  readonly winSum: number;
}

/**
 * 누적 집계 — **이벤트마다 즉시 갱신·별도 키 영속**(원장 링버퍼가 잘려도 총량 보존).
 *   슬롯결과 빈도(slotKind)·소스별 유입(spinIn/coinIn)·아슬아슬 지표(minSpins/noSpinBlocks)가 확률 재설계 입력.
 */
export interface EconTotals {
  readonly v: 2;
  readonly startedAt: number; // 집계 시작(리셋) 시각
  readonly rounds: number;
  readonly spinBetSum: number; // Σ스핀 베팅(총 소모)
  readonly coinWinSum: number; // Σ라운드 최종 획득 코인
  readonly puzzleMultSum: number; // Σ퍼즐멀티(평균 = /rounds)
  readonly slotKind: Readonly<Record<string, number>>; // none/coin/attack/raid 라운드 수
  readonly symbolHits: Readonly<Record<string, number>>; // 매치 심볼별 3매치 수(확률 실측)
  readonly spinIn: Readonly<Record<string, number>>; // 소스별 스핀 유입 합
  readonly spinInCount: Readonly<Record<string, number>>; // 소스별 지급 횟수
  readonly coinIn: Readonly<Record<string, number>>; // 소스별 코인 유입 합(라운드 승리 제외)
  readonly coinOutUpgrade: number; // 업그레이드 코인 지출 합
  readonly upgrades: number; // 업그레이드 횟수
  readonly stage: Readonly<Record<string, StageTotals>>; // attack/raid 진입·스테이크·당첨
  readonly minSpins: number; // 관측 최저 스핀 잔고(아슬아슬 지표)
  readonly noSpinBlocks: number; // 스핀 부족 막힘 횟수
  readonly lastT: number;
}

function emptyTotals(now: number): EconTotals {
  return {
    v: 2,
    startedAt: now,
    rounds: 0,
    spinBetSum: 0,
    coinWinSum: 0,
    puzzleMultSum: 0,
    slotKind: {},
    symbolHits: {},
    spinIn: {},
    spinInCount: {},
    coinIn: {},
    coinOutUpgrade: 0,
    upgrades: 0,
    stage: {},
    minSpins: Number.POSITIVE_INFINITY,
    noSpinBlocks: 0,
    lastT: now,
  };
}

// 모듈 캐시 — 이벤트마다 localStorage 전체 재파싱 방지(쓰기는 즉시 write-through).
let eventsCache: EconEvent[] | null = null;
let totalsCache: EconTotals | null = null;

function readEvents(): EconEvent[] {
  if (eventsCache) return eventsCache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(EVENTS_KEY) : null;
    const o = raw ? (JSON.parse(raw) as EconEvent[]) : [];
    eventsCache = Array.isArray(o) ? o : [];
  } catch {
    eventsCache = [];
  }
  return eventsCache;
}

function readTotals(): EconTotals {
  if (totalsCache) return totalsCache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TOTALS_KEY) : null;
    const o = raw ? (JSON.parse(raw) as EconTotals) : null;
    totalsCache = o && o.v === 2 ? o : emptyTotals(Date.now());
  } catch {
    totalsCache = emptyTotals(Date.now());
  }
  return totalsCache;
}

function persist(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 용량 초과/시크릿 모드 무시 */
  }
}

const bump = (rec: Readonly<Record<string, number>>, key: string, by: number): Record<string, number> => ({
  ...rec,
  [key]: (rec[key] ?? 0) + by,
});

/** 이벤트 1건을 집계에 반영(불변 — 새 totals 반환). 내보내 vitest 로 순수 검증. */
export function applyEventToTotals(t: EconTotals, ev: EconEvent): EconTotals {
  let next: EconTotals = { ...t, lastT: ev.t };
  if (typeof ev.sp === 'number' && ev.sp < next.minSpins) next = { ...next, minSpins: ev.sp };
  switch (ev.e) {
    case 'round':
      next = {
        ...next,
        rounds: next.rounds + 1,
        spinBetSum: next.spinBetSum + (ev.bet ?? 0),
        coinWinSum: next.coinWinSum + (ev.win ?? 0),
        puzzleMultSum: next.puzzleMultSum + (ev.m ?? 0),
        slotKind: bump(next.slotKind, ev.k ?? 'none', 1),
      };
      if (typeof ev.sym === 'number' && ev.sym >= 0) next = { ...next, symbolHits: bump(next.symbolHits, String(ev.sym), 1) };
      return next;
    case 'spin_in':
      return {
        ...next,
        spinIn: bump(next.spinIn, ev.src ?? 'other', ev.n ?? 0),
        spinInCount: bump(next.spinInCount, ev.src ?? 'other', 1),
      };
    case 'coin_in':
      return { ...next, coinIn: bump(next.coinIn, ev.src ?? 'other', ev.n ?? 0) };
    case 'stage': {
      const kind = ev.k ?? 'unknown';
      const cur = next.stage[kind] ?? { count: 0, stakeSum: 0, winSum: 0 };
      return {
        ...next,
        stage: { ...next.stage, [kind]: { count: cur.count + 1, stakeSum: cur.stakeSum + (ev.n ?? 0), winSum: cur.winSum + (ev.win ?? 0) } },
      };
    }
    case 'upgrade':
      return { ...next, upgrades: next.upgrades + 1, coinOutUpgrade: next.coinOutUpgrade + (ev.n ?? 0) };
    case 'block':
      return { ...next, noSpinBlocks: next.noSpinBlocks + 1 };
    case 'reset':
      return emptyTotals(ev.t);
    default:
      return next;
  }
}

/** 이벤트 기록 — 원장 append(링버퍼) + 누적 집계 갱신. 게임 어디서든 안전(실패 무시). */
export function recordEvent(ev: EconEvent): void {
  const list = readEvents();
  list.push(ev);
  if (list.length > EVENTS_CAP) list.splice(0, list.length - EVENTS_CAP);
  persist(EVENTS_KEY, list);
  totalsCache = applyEventToTotals(readTotals(), ev);
  persist(TOTALS_KEY, totalsCache);
}

export function loadEvents(): ReadonlyArray<EconEvent> {
  return readEvents();
}

export function loadTotals(): EconTotals {
  return readTotals();
}

/** 원장·집계 전체 리셋(시뮬레이션 리셋 경로) — 캐시와 storage 를 함께 비워 스테일 재기록 방지. */
export function clearLedger(): void {
  eventsCache = [];
  totalsCache = emptyTotals(Date.now());
  persist(EVENTS_KEY, eventsCache);
  persist(TOTALS_KEY, totalsCache);
}

/** 원장 요약 — 확률/지급구조 재설계용 핵심 KPI(누적 집계 기반이라 링버퍼 손실 무관). */
export interface LedgerSummary {
  readonly rounds: number;
  readonly hours: number; // 집계 구간(시간)
  readonly spinBetSum: number;
  readonly spinInTotal: number; // 전체 유입(구매 포함)
  // ⭐구매(IAP) 분리 — 무료플레이 밸런스("아슬아슬") 분석은 **구매 제외 획득분(earned)** 으로만 판단해야 왜곡이 없다.
  readonly earnedSpinTotal: number; // 무료 획득 스핀(shop 제외)
  readonly purchasedSpins: number; // 구매 스핀(shop) — 별도 표기, 밸런스 계산서 제외
  readonly netSpinPerRound: number; // (**무료 획득** − 소모)/라운드 — 구매 제외. "아슬아슬" = 소폭 음수 목표
  readonly matchRate: number; // 슬롯 3매치율(none 제외)
  readonly kindRate: Readonly<Record<string, number>>; // 라운드 대비 슬롯결과 비율
  readonly avgPuzzleMult: number;
  readonly coinRtp: number; // Σ획득코인 / Σ코인베팅(= 스핀베팅×coinDenom)
  readonly spinShare: Readonly<Record<string, number>>; // 소스별 **무료 획득** 스핀 점유율(shop 제외)
  readonly minSpins: number;
  readonly noSpinBlocks: number;
  readonly upgrades: number;
  readonly stage: Readonly<Record<string, StageTotals>>;
}

/** 누적 집계 → 요약 KPI. coinDenom 은 코인베팅 환산용(playParams.COIN_DENOM — 순환 의존 방지로 인자). */
/** 구매(IAP) 스핀 소스 — 무료플레이 밸런스 분석에서 제외한다. */
export const PURCHASE_SPIN_SOURCES: ReadonlyArray<string> = ['shop'];

export function ledgerSummary(t: EconTotals = readTotals(), coinDenom = 100): LedgerSummary | null {
  if (t.rounds <= 0) return null;
  const spinInTotal = Object.values(t.spinIn).reduce((s, v) => s + v, 0);
  // ⭐구매(shop) 분리 — 무료 획득분만으로 밸런스 판단(구매 스핀이 "아슬아슬" 지표를 부풀리지 않게).
  const purchasedSpins = PURCHASE_SPIN_SOURCES.reduce((s, k) => s + (t.spinIn[k] ?? 0), 0);
  const earnedSpinTotal = spinInTotal - purchasedSpins;
  const matched = t.rounds - (t.slotKind['none'] ?? 0);
  const kindRate: Record<string, number> = {};
  for (const [k, v] of Object.entries(t.slotKind)) kindRate[k] = v / t.rounds;
  // 점유율은 **무료 획득분** 기준(구매 제외).
  const spinShare: Record<string, number> = {};
  for (const [k, v] of Object.entries(t.spinIn)) {
    if (PURCHASE_SPIN_SOURCES.includes(k)) continue;
    spinShare[k] = earnedSpinTotal > 0 ? v / earnedSpinTotal : 0;
  }
  return {
    rounds: t.rounds,
    hours: Math.max(0, (t.lastT - t.startedAt) / 3_600_000),
    spinBetSum: t.spinBetSum,
    spinInTotal,
    earnedSpinTotal,
    purchasedSpins,
    netSpinPerRound: (earnedSpinTotal - t.spinBetSum) / t.rounds, // ⭐구매 제외 순증감
    matchRate: matched / t.rounds,
    kindRate,
    avgPuzzleMult: t.puzzleMultSum / t.rounds,
    coinRtp: t.spinBetSum > 0 ? t.coinWinSum / (t.spinBetSum * coinDenom) : 0,
    spinShare,
    minSpins: Number.isFinite(t.minSpins) ? t.minSpins : -1,
    noSpinBlocks: t.noSpinBlocks,
    upgrades: t.upgrades,
    stage: t.stage,
  };
}

export function observedSummary(snaps: ReadonlyArray<PlaySnapshot> = read()): ObservedSummary | null {
  if (snaps.length < 2) return null;
  const s = [...snaps].sort((a, b) => a.t - b.t);
  const first = s[0], last = s[s.length - 1];
  const spanDays = Math.max(1 / 24, (last.t - first.t) / 86_400_000); // 최소 1시간
  let betSum = 0, winSum = 0, up = 0;
  for (let i = 0; i < s.length; i++) {
    betSum += s[i].bet;
    winSum += s[i].winCoins;
    if (i > 0 && s[i].spins > s[i - 1].spins) up++;
  }
  return {
    rounds: s.length,
    days: spanDays,
    netSpinPerDay: (last.spins - first.spins) / spanDays,
    coinRtp: betSum > 0 ? winSum / betSum : 0,
    uptickRatio: s.length > 1 ? up / (s.length - 1) : 0,
    spins: last.spins,
    coins: last.coins,
    cityLevel: last.cityLevel,
    firstTs: first.t,
    lastTs: last.t,
  };
}
