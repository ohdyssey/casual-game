/**
 * talkContext.ts — 대화 시스템(점원·공공건물) 공용 **게임 상태 컨텍스트**.
 *
 * HomeScene 이 진입 시 provider 를 등록하면, 대화 모듈들이 발화 시점의 상태(시각·코인·진행도·은행·복귀일수)를
 * 읽어 **맥락 대사**(조건 만족 시 우선 발화)를 고른다. provider 미등록이면 맥락 대사는 건너뛴다(기본 로테이션).
 * 지능화 로드맵: docs/OFFICE_TALK_DESIGN.md Phase 2 — 페르소나/조건 대사의 1단계 기반.
 */

export interface TalkCtx {
  /** 현지 시각(0~23). */
  readonly hour: number;
  /** 보유 코인. */
  readonly coins: number;
  /** 진행 레벨. */
  readonly level: number;
  /** 건설된 층 수(메인 타워). */
  readonly builtFloors: number;
  /** 마지막 접속으로부터 지난 일수(이번 세션 진입 시점 기준, 첫 방문=0). */
  readonly daysAway: number;
  /** 층 점포 은행이 가득 찼는가(수령 대기). */
  readonly bankFull: (floor: number) => boolean;
}

/** 맥락 대사 그룹 — when 이 참이면 lines 중 하나가 기본 로테이션보다 우선 발화된다. */
export interface CtxGroup {
  readonly when: (c: TalkCtx, floor: number) => boolean;
  readonly lines: readonly string[];
}

let provider: (() => TalkCtx) | null = null;

/** HomeScene 진입 시 등록(씬 재시작마다 갱신 — 최신 상태 클로저). */
export function setTalkCtxProvider(fn: (() => TalkCtx) | null): void {
  provider = fn;
}

export function getTalkCtx(): TalkCtx | null {
  try {
    return provider ? provider() : null;
  } catch {
    return null;
  }
}

/** 맥락 그룹들에서 현재 조건에 맞는 대사 후보를 모아 하나 고른다(랜덤). 없으면 null. */
export function pickCtxLine(groups: readonly CtxGroup[] | undefined, floor: number): string | null {
  const c = getTalkCtx();
  if (!c || !groups?.length) return null;
  const pool: string[] = [];
  for (const g of groups) {
    try {
      if (g.when(c, floor)) pool.push(...g.lines);
    } catch {
      /* 개별 조건 오류는 무시(대화는 비치명적) */
    }
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// ── 시간대 헬퍼(대사 조건에서 재사용) ──
export const isMorning = (c: TalkCtx): boolean => c.hour >= 6 && c.hour < 11;
export const isNight = (c: TalkCtx): boolean => c.hour >= 21 || c.hour < 5;
