/**
 * civicDesks.ts — **공공건물 민원 창구** 정의(순수·Phaser-free).
 *
 * PO 2026-08-30: "보너스 란에 매칭돼 있는 프리셀 게임을 공공건물에 매칭하라. 공공건물의 기능을
 *   중심으로 설계하라."
 *
 * ## 무엇이 바뀌었나
 * 프리셀(보너스 게임)은 홈 레일의 **이름 없는 '보너스' 아이콘**에서 팝업으로 모드를 골라 들어갔다.
 * 그 팝업은 `1장/3장 × 일반/타임어택` **2×2 격자**였는데, 그 선택을 **팝업에서 없앴다.**
 *   · 층은 **어떤 관공서인가**(=무엇을 받느냐)만 가른다 — 소방 점검·도둑 추적·장부 정리·소포 분류.
 *   · 게임 방식은 **그 창구의 진행도**가 정한다(4단 순환, 아래 `DESK_MODE_CYCLE`) — 모든 층이 같다.
 *   · 창구를 누르면 바로 시작이라 **탭 한 번**이라는 성질이 그대로 유지된다.
 *
 * 공공건물은 지금까지 **대사만 있고 기능이 없었다**(`scenes/officeTalk.ts`). 창구가 붙으면
 * "지나가다 대사를 보는 곳"에서 **매일 가는 곳**이 되고, 만들어 둔 대사 노출도 함께 늘어난다.
 *
 * ## ⚠️ 경제 규칙 — 창구를 나눠도 총량은 그대로
 * 하루 무료 판수와 게임비는 **건물 전체가 공유**한다(`logic/bonusRuntime.startBonusPlay` 단일 지점).
 * 창구별로 판을 주면 다이아 공급이 창구 수만큼 늘어 층 비용 설계(수입 연동)가 무너진다.
 * 창구의 개성은 **다이아가 아닌 재화**(코인·이벤트 진행도·컬렉션 카드)로만 낸다.
 */
import type { BonusMode } from './bonusGame.js';
import type { OfficeRole } from '../scenes/officeTalk.js';

/** 창구 하나 — 공공건물 한 층. */
export interface CivicDesk {
  /** 공공건물 층 번호(1-base, 아래부터). */
  readonly floor: number;
  /** 그 층 캐릭터의 역할 — 대사 시스템(`officeTalk`)과 같은 키를 쓴다. */
  readonly role: OfficeRole;
  /** 창구 이름(간판). */
  readonly office: string;
  /** 이 창구에서 처리하는 민원 — 버튼에 뜨는 말. */
  readonly errand: string;
  /** 이 레벨부터 창구가 열린다 — 초반에 선택지가 한꺼번에 쏟아지지 않게. */
  readonly unlockLevel: number;
  /**
   * 승리 시 **추가 보상**(기본 코인 보상과 별개).
   * ⚠️ **다이아는 넣지 않는다** — 층 비용이 레벨 구간 수입을 기준으로 계산되므로, 창구에서 다이아가
   *   새로 들어오면 그 계산이 어긋난다(공공건물 민원 창구 설계 C절).
   */
  readonly perk?: DeskPerk;
  /** 아직 안 여는 창구(아트는 있으나 설계 미확정) — 자리만 보여 준다. */
  readonly comingSoon?: boolean;
}

/** 창구별 추가 보상 — 종류마다 지급 방식이 달라 태그로 구분한다. */
export type DeskPerk =
  | { readonly kind: 'thiefProgress'; readonly steps: number }
  | { readonly kind: 'coins'; readonly amount: number }
  | { readonly kind: 'collectionCard' };

/**
 * 창구 표 — 층은 **어떤 관공서인가**(보상의 종류)만 정한다. **게임 방식은 층이 아니라 진행도**가 정한다.
 *
 * ⚠️ `perk` 수치는 **잠정값**이다(PO 확정 대기) — 특히 세무서 환급은 코인 수급 시뮬레이션 결과에
 *   맞춰야 한다. 값만 고치면 되도록 여기 한 곳에 모아 둔다.
 */
export const CIVIC_DESKS: readonly CivicDesk[] = [
  {
    floor: 1,
    role: 'fire',
    office: '소방서',
    errand: '안전 점검',
    unlockLevel: 1,
  },
  {
    floor: 2,
    role: 'police',
    office: '경찰서',
    errand: '도둑 추적',
    unlockLevel: 12,
    // 이미 도는 일일 이벤트(Catch the Thief)를 직접 밀어 준다 — 경찰서의 일과 정확히 겹친다.
    perk: { kind: 'thiefProgress', steps: 3 },
  },
  {
    floor: 3,
    role: 'tax',
    office: '세무서',
    errand: '장부 정리',
    unlockLevel: 30,
    // 건설비가 모자란 구간의 숨통. ⚠️ 잠정값 — 코인 수급 시뮬레이션 뒤 확정.
    perk: { kind: 'coins', amount: 3_000 },
  },
  {
    floor: 4,
    role: 'post',
    office: '우체국',
    errand: '소포 분류',
    unlockLevel: 60,
    // 후반 페이싱을 지탱할 자리 — 컬렉션은 층보다 촘촘한 중간 목표다.
    perk: { kind: 'collectionCard' },
  },
  {
    floor: 5,
    role: 'mayor',
    office: '시청',
    errand: '건축 허가',
    unlockLevel: 120,
    /*
     * ⚠️ **아직 열지 않는다.** 허가증(다음 층 다이아 비용 할인)은 층 비용 곡선을 직접 건드려서,
     *   "층 비용 = 구간 수입의 110%"로 잡은 부족분 설계와 **한 세트로** 정해야 한다.
     *   값이 정해지기 전에 열면 다이아 곡선이 조용히 어긋난다.
     */
    comingSoon: true,
  },
];

/**
 * ## 게임 방식 순환 (PO 2026-08-30)
 *
 * "층별로 게임 방식을 나누지 말고 **1장 일반 → 1장 타임어택 → 3장 일반 → 3장 타임어택** 식으로
 *  순환시켜라. 각 층마다 동일한 방식을 적용한다."
 *
 * 예전에는 층마다 모드를 하나씩 고정했다(1F=1장 일반 … 4F=3장 타임). 그러면 **그 층에서는 늘 같은 판**만
 * 돌고, 어려운 모드를 하려면 높은 층이 열릴 때까지 기다려야 했다. 이제 **모든 창구가 같은 4단 순환**을
 * 돌되 **진행도는 창구마다 따로** 쌓인다 — 층은 "무엇을 받느냐"(perk)만 가르고, "어떻게 노느냐"는
 * 그 창구를 얼마나 했는지가 정한다.
 *
 * ⚠️ 순환은 **판을 시작할 때** 넘어간다(이기든 지든). 이기는 것을 조건으로 걸면 어려운 4단계에서
 *   **영영 못 넘어가 같은 판만 반복**하는 벽이 생긴다.
 */
export const DESK_MODE_CYCLE: ReadonlyArray<{ readonly mode: BonusMode; readonly timed: boolean }> = [
  { mode: 'draw1', timed: false },
  { mode: 'draw1', timed: true },
  { mode: 'draw3', timed: false },
  { mode: 'draw3', timed: true },
];

/** 이번 판의 게임 방식 — 그 창구의 진행도가 정한다. */
export function deskModeFor(progress: number): { readonly mode: BonusMode; readonly timed: boolean } {
  const p = Number.isFinite(progress) ? Math.max(0, Math.floor(progress)) : 0;
  return DESK_MODE_CYCLE[p % DESK_MODE_CYCLE.length];
}

/** 순환 안에서 몇 번째 단계인가(1-base, 표시용). */
export function deskStepOf(progress: number): number {
  const p = Number.isFinite(progress) ? Math.max(0, Math.floor(progress)) : 0;
  return (p % DESK_MODE_CYCLE.length) + 1;
}

/** 한 바퀴를 몇 번 돌았나(0-base) — 보상 배수의 근거. */
export function deskRoundOf(progress: number): number {
  const p = Number.isFinite(progress) ? Math.max(0, Math.floor(progress)) : 0;
  return Math.floor(p / DESK_MODE_CYCLE.length);
}

/**
 * ## 진행 보상 배수 (PO 2026-08-30 "진행을 많이 할수록 더 많은 보상")
 *
 * 한 바퀴(4단계)를 돌 때마다 그 창구의 보상이 한 칸씩 오른다. 순환 자체가 이미
 * **1장 일반 < 1장 타임 ≤ 3장 일반 < 3장 타임** 으로 커지므로(보상표), 배수는 그 위에 얹히는
 * **장기 누적분**이다 — 오래 다닌 창구가 더 좋은 창구가 된다.
 *
 * ⚠️ **상한이 반드시 있어야 한다.** 판수는 하루 2판이지만 유료로 계속 살 수 있어, 상한이 없으면
 *   장기 플레이어의 코인 수입이 발산한다. 지금은 10바퀴(40판)에서 ×2.0 으로 멈춘다.
 * ⚠️ 값은 **잠정값**이다 — 코인 수급 시뮬레이션 뒤 확정한다.
 */
export const DESK_ROUND_BONUS = 0.1;
export const DESK_ROUND_CAP = 10;

/** 그 창구의 진행 보상 배수(1.0 ~ 2.0). */
export function deskRewardMult(progress: number): number {
  return 1 + Math.min(deskRoundOf(progress), DESK_ROUND_CAP) * DESK_ROUND_BONUS;
}

/** 그 층의 창구(없으면 undefined). */
export function deskForFloor(floor: number): CivicDesk | undefined {
  return CIVIC_DESKS.find((d) => d.floor === floor);
}

/** 지금 실제로 들어갈 수 있는 창구인가 — 레벨 해금 + 오픈 여부. */
export function isDeskOpen(desk: CivicDesk, level: number): boolean {
  return !desk.comingSoon && level >= desk.unlockLevel;
}

/** 세울 공공건물 층 수 = 정의된 창구 수(아트가 있는 만큼). */
export const CIVIC_FLOORS = CIVIC_DESKS.length;
