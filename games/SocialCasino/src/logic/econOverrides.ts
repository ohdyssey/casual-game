/**
 * econOverrides.ts — **라이브 게임 보상 오버라이드**(설정 → 데이터 편집의 "보상 상세 설정"이 편집).
 *
 *   기본값은 SSOT 상수(economy/playParams/roulette). 오버라이드가 있으면 그 값으로 **라이브 게임만** 대체한다.
 *   순수 로직(economy/roulette)은 SSOT 상수를 그대로 두고 **파라미터로 주입** → 시뮬/대시보드는 영향 없음(결정론 유지),
 *   PlayScene/Stage1 이 아래 resolver 를 읽어 인자로 넘긴다.
 *
 *   영속: localStorage(`socialcasino_econ_overrides_v1`). 부분 오버라이드(설정 안 한 항목은 SSOT). 손상 시 SSOT.
 */
import { SLOT_RTP_SCALE, LUCK_TABLE } from './economy.js';
import { RAID_STAKE_SCALE, MISSION_PLAN, type MissionEntry } from './playParams.js';
import { ROULETTE_SEGMENTS, type RouletteSegment } from './roulette.js';

/** 미션 오버라이드 1칸(목표 + 보상액 — 종류는 SSOT 교대 유지). */
export interface MissionOverride {
  readonly target: number;
  readonly rewardAmount: number;
}

/** 부분 오버라이드(없는 항목은 SSOT 기본값). */
export interface EconOverrides {
  slotRtpScale?: number;
  luckMults?: number[]; // LUCK_TABLE 의 m(배수)만 오버라이드(확률 p 는 구조적·고정)
  raidStakeScale?: number;
  segmentMults?: number[]; // ROULETTE_SEGMENTS 각 조각의 mult
  missions?: MissionOverride[]; // MISSION_PLAN 각 칸의 target + rewardAmount
}

// ⚠️v2(2026-06-30): 구 v1 데이터편집 오버라이드 폐기 — 옛 경제(베팅10·미션 300~1450) 기준 값(예: 미션 목표 900)이 남아
//   새 SSOT(베팅5·미션 12~38)를 덮어쓰던 문제 해소. 새 키 = 오버라이드 없음 → 항상 SSOT부터 시작(데이터편집은 다시 설정).
export const OVERRIDES_KEY = 'socialcasino_econ_overrides_v2';

/** 저장된 오버라이드(손상/없음 시 빈 객체). */
export function loadOverrides(): EconOverrides {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as EconOverrides;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function saveOverrides(o: EconOverrides): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
  } catch {
    /* 무시 */
  }
}

export function resetOverrides(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(OVERRIDES_KEY);
  } catch {
    /* 무시 */
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ── resolver(라이브 게임이 읽는 현재값 = 오버라이드 ?? SSOT) ──────────────────────

/** 슬롯 배당 스케일(클수록 슬롯 보상↑). */
export function slotRtpScaleNow(): number {
  const v = loadOverrides().slotRtpScale;
  return finite(v) && v >= 0 ? v : SLOT_RTP_SCALE;
}

/** 슬롯 럭 테이블(확률 p 는 고정, 배수 m 만 오버라이드 가능). */
export function luckTableNow(): ReadonlyArray<{ p: number; m: number }> {
  const ms = loadOverrides().luckMults;
  if (!Array.isArray(ms)) return LUCK_TABLE;
  return LUCK_TABLE.map((t, i) => ({ p: t.p, m: finite(ms[i]) && ms[i] >= 1 ? ms[i] : t.m }));
}

/** 레이드/어텍 스테이크 배수(클수록 레이드 보상↑). */
export function raidStakeScaleNow(): number {
  const v = loadOverrides().raidStakeScale;
  return finite(v) && v >= 0 ? v : RAID_STAKE_SCALE;
}

/** 룰렛 조각(배수만 오버라이드 — 라벨/순서/가중치는 SSOT). */
export function segmentsNow(): ReadonlyArray<RouletteSegment> {
  const ms = loadOverrides().segmentMults;
  if (!Array.isArray(ms)) return ROULETTE_SEGMENTS;
  return ROULETTE_SEGMENTS.map((s, i) => (finite(ms[i]) && ms[i] >= 0 ? { ...s, mult: ms[i] } : s));
}

/** 미션 플랜(target + 코인/스핀 보상액 오버라이드 — 종류는 SSOT 교대 유지). */
export function missionsNow(): ReadonlyArray<MissionEntry> {
  const ms = loadOverrides().missions;
  if (!Array.isArray(ms)) return MISSION_PLAN;
  return MISSION_PLAN.map((m, i) => {
    const ov = ms[i];
    if (!ov) return m;
    const target = finite(ov.target) && ov.target > 0 ? Math.round(ov.target) : m.target;
    const amount = finite(ov.rewardAmount) && ov.rewardAmount >= 0 ? Math.round(ov.rewardAmount) : m.reward.amount;
    return { ...m, target, reward: { ...m.reward, amount } };
  });
}

/** 에디터 초기값용 — 현재 적용값(오버라이드 반영) 스냅샷. */
export function currentValues(): Required<Omit<EconOverrides, 'missions'>> & { missions: MissionOverride[] } {
  return {
    slotRtpScale: slotRtpScaleNow(),
    luckMults: luckTableNow().map((t) => t.m),
    raidStakeScale: raidStakeScaleNow(),
    segmentMults: segmentsNow().map((s) => s.mult),
    missions: missionsNow().map((m) => ({ target: m.target, rewardAmount: m.reward.amount })),
  };
}
