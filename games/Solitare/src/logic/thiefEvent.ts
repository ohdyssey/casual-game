/**
 * thiefEvent.ts — Catch the Thief 주간 사다리 이벤트의 **순수 로직**(Phaser·DOM 없음).
 *
 * 규칙
 *   ① 주기 = `THIEF_EVENT_DAYS`(7일). 주기가 바뀌면 사다리가 처음부터 다시 시작한다.
 *   ② 판을 클리어할 때마다 지금 칸의 카운트가 1 오른다. 칸 목표를 채우면 다음 칸으로 올라간다.
 *   ③ 칸을 올릴 때마다 그 칸의 코인 보상이 확정된다 — 지급은 호출부(runtime)가 한다.
 *
 * ⚠️ 리그와 **주기가 다르다**(리그는 하루). 남은 시간 표기도 다른 함수를 써야 한다.
 */
import { eventStageCoins, goalOf, isEventCleared, THIEF_EVENT_DAYS, THIEF_FIRST_HALF_DAYS } from '../config/thiefEvent.js';
import { periodIdFor } from './league.js';

/** 세이브에 담기는 진행 상태. */
export interface ThiefEventSave {
  /** 이 진행도가 속한 주기 id. 지금 주기와 다르면 처음부터다. */
  readonly periodId: number;
  /** 지금 도전 중인 칸(0부터). `THIEF_STAGES.length` 면 완주. */
  readonly stage: number;
  /** 지금 칸에서 채운 수. */
  readonly count: number;
}

export interface ThiefProgress {
  readonly stage: number;
  readonly count: number;
  /** 지금 칸의 목표. */
  readonly goal: number;
  /** 0~1 진행률. */
  readonly ratio: number;
  readonly cleared: boolean;
}

export const EMPTY_THIEF_SAVE: ThiefEventSave = { periodId: -1, stage: 0, count: 0 };

/** 지금 시점의 이벤트 주기 id — 이 값이 바뀌면 사다리가 리셋된다. */
/**
 * **주기 = 한 주에 두 번**(PO 2026-08-24: "3일 혹은 4일 간격으로 반복됩니다. 즉 일주일에 2회").
 *
 * 7일을 **전반 4일 + 후반 3일**로 갈라 두 주기를 만든다. 요일 경계에 딱 맞아 "주 2회"가 흔들리지
 * 않는다(3.5일 같은 반나절 경계를 쓰면 주기 시작 시각이 매주 12시간씩 밀린다).
 */
export function thiefPeriodId(now: Date): number {
  const day = periodIdFor(now);
  const week = Math.floor(day / THIEF_EVENT_DAYS);
  return week * 2 + (day % THIEF_EVENT_DAYS < THIEF_FIRST_HALF_DAYS ? 0 : 1);
}

/** 다음 주기까지 남은 ms. */
export function msUntilEventReset(now: Date): number {
  const dayMs = 86_400_000;
  const day = periodIdFor(now);
  const inWeek = day % THIEF_EVENT_DAYS;
  // 다음 경계는 전반부면 4일째, 후반부면 다음 주 시작.
  const boundary = inWeek < THIEF_FIRST_HALF_DAYS ? THIEF_FIRST_HALF_DAYS : THIEF_EVENT_DAYS;
  const daysLeft = boundary - inWeek - 1;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const msLeftToday = startOfToday + dayMs - now.getTime();
  return Math.max(0, daysLeft * dayMs + msLeftToday);
}

/** 저장값을 지금 주기 기준으로 해석한다(주기가 지났으면 처음부터). */
/**
 * **넘친 진행도를 굴려 올린다** — `count >= goal` 인 상태를 다음 칸으로 옮긴다.
 *
 * PO 2026-08-24 신고: "45/45 이면 이 미션이 완성되고 보상이 이루어져야 합니다."
 * 목표표를 고치면 **이미 쌓인 진행도**가 새 목표를 넘어선 채 남는다(옛 목표 50 에서 45 개 →
 * 새 목표 45). 그때 화면은 `45/45` 로 가득 찬 채 멈춰 보인다. 읽을 때도 굴려 올려 그 상태를 없앤다.
 *
 * ⚠️ 여기서는 **코인을 주지 않는다**(순수 계산). 실제 지급은 `advance` 가 같은 규칙으로 처리한다.
 */
function rollOverflow(stage: number, count: number): { stage: number; count: number } {
  let st = Math.max(0, Math.floor(stage));
  let c = Math.max(0, Math.floor(count));
  while (!isEventCleared(st) && c >= goalOf(st)) {
    c -= goalOf(st);
    st += 1;
  }
  if (isEventCleared(st)) c = 0;
  return { stage: st, count: c };
}

export function progressNow(save: ThiefEventSave | undefined, nowPeriodId: number): ThiefProgress {
  const s = save && save.periodId === nowPeriodId ? save : EMPTY_THIEF_SAVE;
  const rolled = rollOverflow(s.stage, s.count);
  const stage = rolled.stage;
  const cleared = isEventCleared(stage);
  const goal = goalOf(stage);
  const count = cleared ? goal : Math.max(0, Math.min(goal, rolled.count));
  return { stage, count, goal, ratio: goal <= 0 ? 1 : count / goal, cleared };
}

export interface ThiefAdvance {
  readonly next: ThiefEventSave;
  /** 이번에 올라간 칸 수(0이면 아직 같은 칸). */
  readonly stagesCleared: number;
  /** 올라간 칸들의 코인 보상 합. */
  readonly coins: number;
  /** 이번에 완주했는가(완주 보너스 지급 시점). */
  readonly justCleared: boolean;
}

/**
 * 판을 `n` 번 클리어한 것을 반영한다. 목표를 넘기면 **여러 칸을 연달아** 올릴 수 있다
 * (한 판에 여러 칸이 열리는 일은 없지만, 오프라인 보정 등으로 n 이 커질 수 있어 일반화해 둔다).
 */
export function advance(save: ThiefEventSave | undefined, nowPeriodId: number, n = 1): ThiefAdvance {
  const base = save && save.periodId === nowPeriodId ? save : EMPTY_THIEF_SAVE;
  let stage = Math.max(0, Math.floor(base.stage));
  let count = Math.max(0, Math.floor(base.count));
  const wasCleared = isEventCleared(stage);
  let coins = 0;
  let stagesCleared = 0;
  /*
   * **이미 넘쳐 있던 진행도를 먼저 정산한다**(PO 2026-08-24). 목표표를 낮추면 저장된 진행도가
   *   새 목표를 넘긴 채 남아 `45/45` 로 멈춰 보인다. 그 몫도 정상적으로 칸을 올리고 보상을 준다.
   */
  while (!isEventCleared(stage) && count >= goalOf(stage)) {
    count -= goalOf(stage);
    coins += eventStageCoins(stage);
    stage += 1;
    stagesCleared += 1;
  }
  let left = Math.max(0, Math.floor(n));
  while (left > 0 && !isEventCleared(stage)) {
    const goal = goalOf(stage);
    const need = goal - count;
    if (left < need) {
      count += left;
      left = 0;
      break;
    }
    left -= need;
    coins += eventStageCoins(stage);
    stage += 1;
    count = 0;
    stagesCleared += 1;
  }
  const justCleared = !wasCleared && isEventCleared(stage);
  return { next: { periodId: nowPeriodId, stage, count }, stagesCleared, coins, justCleared };
}
