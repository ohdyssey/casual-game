/**
 * dailyMetrics.ts — **실유저 플레이의 일일 지표 수집**(PO 2026-08-25 "유저 플레이 데이터를 일일 단위로
 * 분석하여 조정이 가능한 구조").
 *
 * ## 구조 — 원장 어휘를 그대로 유지한다
 * 필드명은 econ-lab 대시보드의 일별 원장과 동일하다(fee/plus5/buildCoins/starCoins/leagueCoins/
 * eventCoins/tierCoins/iapCoins/pinch …). 그래서 수집된 실유저 데이터를 **대시보드 원장과 같은
 * 어휘로 비교**할 수 있고, 분석 결과는 economy.json 노브 6종(leagueCoinPerStar 등)으로 바로 조정한다.
 * KPI → 노브 결정표는 docs/ECON_LIVEOPS.md.
 *
 * ## 저장
 * localStorage `solitaire_metrics_v1` = { [dayId]: DayMetrics } — 최근 60일 유지.
 * dayId 는 리그와 같은 로컬 자정 기준(logic/league.periodIdFor)이라 리그 일자와 정확히 겹친다.
 *
 * ⚠️ **계측 모드(?lab=1)에서는 기록하지 않는다** — 봇 플레이가 실유저 지표를 오염시키면 안 된다.
 * ⚠️ 업로드는 아직 없다 — `exportDailyMetrics()` 가 전송용 배열을 만든다(PlayPOP API 연동 예정,
 *   콘솔에서 `__dailyMetrics()` 로도 꺼낼 수 있다).
 */
import { LAB_SILENT } from '../audio.js';
import { periodIdFor } from './league.js';

/** 하루치 지표 — 숫자 필드는 전부 **가산**(bump) 방식. 대시보드 일별 원장과 같은 어휘. */
export interface DayMetrics {
  readonly day: number; // periodIdFor 기준 dayId.
  /** 판 시작/완주 — starts-games 차이가 곧 중도 이탈 수다. */
  starts: number;
  games: number;
  wins: number;
  /** 승리 판 별 등급 합(평균★ = starsSum/wins). */
  starsSum: number;
  /** 무부스터 승리 수(핀치·난이도 곡선의 축). */
  cleanWins: number;
  // ── 지출 ──
  fee: number;
  /** 부스터(＋5·와일드·되돌리기) 코인 지출 합. */
  plus5: number;
  buildCoins: number;
  buildDiamonds: number;
  builds: number;
  // ── 수입 ──
  starCoins: number;
  leagueCoins: number;
  eventCoins: number;
  tierCoins: number;
  iapCoins: number;
  iapCount: number;
  // ── 신호 ──
  pinch: number;
  missionTicks: number;
  leagueStars: number;
  eventItems: number;
  boardDiamonds: number;
  /** 그날 도달한 최고 레벨(핀치 도달 레벨 분석용). */
  levelMax: number;
}

const KEY = 'solitaire_metrics_v1';
const KEEP_DAYS = 60;

function emptyDay(day: number): DayMetrics {
  return {
    day, starts: 0, games: 0, wins: 0, starsSum: 0, cleanWins: 0,
    fee: 0, plus5: 0, buildCoins: 0, buildDiamonds: 0, builds: 0,
    starCoins: 0, leagueCoins: 0, eventCoins: 0, tierCoins: 0, iapCoins: 0, iapCount: 0,
    pinch: 0, missionTicks: 0, leagueStars: 0, eventItems: 0, boardDiamonds: 0, levelMax: 0,
  };
}

function loadAll(): Record<string, DayMetrics> {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : null;
    return obj && typeof obj === 'object' ? (obj as Record<string, DayMetrics>) : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, DayMetrics>): void {
  try {
    // 최근 KEEP_DAYS 일만 유지 — 무한 성장 방지.
    const keys = Object.keys(all).map(Number).sort((a, b) => b - a).slice(0, KEEP_DAYS);
    const trimmed: Record<string, DayMetrics> = {};
    for (const k of keys) trimmed[k] = all[k]!;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* 저장 불가(프라이빗 모드 등) — 지표만 잃는다. */
  }
}

/** 오늘 지표에 가산한다. levelMax 는 max 로 병합. 계측 모드(?lab=1)면 아무 것도 하지 않는다. */
export function bumpMetrics(patch: Partial<DayMetrics>, now = new Date()): void {
  if (LAB_SILENT) return; // 봇/계측 플레이는 실유저 지표에 섞지 않는다.
  const dayId = periodIdFor(now);
  const all = loadAll();
  const d = { ...emptyDay(dayId), ...(all[dayId] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (k === 'day') continue;
    if (k === 'levelMax') d.levelMax = Math.max(d.levelMax, v);
    else (d as unknown as Record<string, number>)[k] = ((d as unknown as Record<string, number>)[k] ?? 0) + v;
  }
  all[dayId] = d;
  saveAll(all);
}

/** 전 기간 지표(날짜 오름차순) — 업로드/분석용. */
export function exportDailyMetrics(): DayMetrics[] {
  const all = loadAll();
  return Object.keys(all).map(Number).sort((a, b) => a - b).map((k) => all[k]!);
}

/** 오늘 지표(없으면 빈 값) — 디버그·HUD 용. */
export function metricsToday(now = new Date()): DayMetrics {
  const dayId = periodIdFor(now);
  return loadAll()[dayId] ?? emptyDay(dayId);
}

/** 콘솔 진단용 전역(`__dailyMetrics()`) — game.ts 부팅에서 1회 건다. */
export function installDailyMetrics(): void {
  (globalThis as unknown as Record<string, unknown>).__dailyMetrics = exportDailyMetrics;
}
