/**
 * econ/telemetry.ts — **실측 플레이어 데이터 수집 계층**(향후 "플레이 추적 → 데이터 보정" 대시보드 확장 대비).
 *
 *   게임(PlayScene)이 라운드마다 스냅샷을 기록 → 경제 콘솔(econ.html)이 **같은 origin localStorage**로 읽어 집계.
 *   현재 KPI·점검은 시뮬(모델) 기반이고, 이 모듈은 **실측치를 모델과 비교/보정**하기 위한 토대다.
 *   링버퍼(상한)로 용량 통제. 스키마 버전(v1) — 필드 추가 시 v2 로 올린다.
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
