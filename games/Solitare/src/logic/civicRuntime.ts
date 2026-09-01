/**
 * civicRuntime.ts — 민원 창구 **진행도의 세이브 연결부**(순수 규칙 `civicDesks.ts` + 저장).
 *
 * 창구마다 진행도가 **따로** 쌓인다. 그 값이 두 가지를 정한다:
 *   ① **이번 판의 게임 방식** — 1장 일반 → 1장 타임 → 3장 일반 → 3장 타임 순환(`deskModeFor`)
 *   ② **보상 배수** — 한 바퀴 돌 때마다 한 칸씩(`deskRewardMult`)
 *
 * ⚠️ 진행도는 **판을 시작할 때** 올린다(이기든 지든). 승리를 조건으로 걸면 어려운 4단계에서 못 넘어가
 *   같은 판만 반복하는 벽이 생긴다.
 * ⚠️ 하루 판수·게임비와는 **다른 축**이다 — 그쪽은 건물 전체가 공유하고(`bonusRuntime.startBonusPlay`),
 *   이쪽은 창구별로 쌓인다. 두 개를 한 곳에서 세지 말 것.
 */
import { loadSave, writeSave } from '../save.js';
import { deskModeFor, deskRewardMult, deskRoundOf, deskStepOf } from './civicDesks.js';
import type { BonusMode } from './bonusGame.js';
import type { OfficeRole } from '../scenes/officeTalk.js';

/** 그 창구의 누적 진행도(시작한 판 수). 기록이 없거나 깨졌으면 0. */
export function civicProgressOf(role: OfficeRole): number {
  const raw = loadSave().civicProgress?.[role];
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

/** 지금 그 창구에 들어가면 어떤 판인가 — 방식 + 보상 배수 + 표시용 단계/바퀴. */
export function civicDeskStateOf(role: OfficeRole): {
  readonly progress: number;
  readonly mode: BonusMode;
  readonly timed: boolean;
  readonly mult: number;
  readonly step: number;
  readonly round: number;
} {
  const progress = civicProgressOf(role);
  const { mode, timed } = deskModeFor(progress);
  return { progress, mode, timed, mult: deskRewardMult(progress), step: deskStepOf(progress), round: deskRoundOf(progress) };
}

/**
 * 판을 시작했다 — 그 창구의 진행도를 한 칸 민다. 새 누적값을 돌려준다.
 * ⚠️ 게임비·판수 차감은 여기서 하지 않는다(`bonusRuntime.startBonusPlay` 단일 지점) — 이 함수는
 *   **순환과 보상 배수만** 담당한다.
 */
export function advanceCivicProgress(role: OfficeRole): number {
  const save = loadSave();
  const next = civicProgressOf(role) + 1;
  save.civicProgress = { ...(save.civicProgress ?? {}), [role]: next };
  writeSave(save);
  return next;
}
