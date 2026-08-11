/**
 * missions.ts — **한 판의 미션 세 가지**(순수).
 *
 * ⚠️⚠️ **왜 필요한가.** 주문을 하나 내면 별·돈·도장·인사가 오는데 그건 전부 **「그 한 건」의 평가**다.
 * 다음 주문이 걸리면 리셋되고, 쌓이는 것은 「10건 중 N건」 하나뿐인데 그건 그냥 숫자다.
 * 그래서 잘 만들어 내도 **무엇을 향해 가는지가 없어** 성취가 남지 않았다.
 * 미션은 **주문 하나하나를 한 칸씩 채워지는 것에 얹는** 장치다.
 *
 * ⚠️⚠️⚠️ **미션은 「레벨」의 것이다 — 판(주문)마다 바뀌지 않는다.**
 *
 *   판(Round)    김밥 한 건. 카드 골라 → 만들어 → 종.
 *   레벨(Level)  **미션 셋을 다 채우면 레벨업.** 미션은 레벨 내내 그대로다.
 *   스테이지     레벨 10개 = 신점포.
 *
 * 그래서 뽑기는 **레벨 번호가 시드**다(`missionsForLevel`) — 같은 레벨은 언제나 같은 미션이고,
 * 실패해 다시 도전해도 목표가 바뀌지 않는다. 목표가 매번 갈리면 그건 목표가 아니라 날씨다.
 *
 * ⚠️ **난이도는 레벨을 따라 조금씩 오른다**(`LEVEL_GROWTH`) — 다만 **상한(`Spec.max`)을 넘지 않는다.**
 *    미션이 클리어 조건이므로 「깰 수 없는 목표」가 되는 순간 게임이 막힌다.
 */
import type { MenuId } from './menu.js';
import { MENU_LABEL } from './menu.js';
import type { Rand } from './orders.js';

/** 한 판에 걸리는 미션 수 — 셋이 한 줄에 들어가는 최대치다(화면 폭 1080). */
export const MISSION_COUNT = 3;

/**
 * **남은 뽑기가 목표에 빠듯한가** — 그때부터 카드가 그 메뉴를 **못 박는다**(`orders.createCard.forceFavor`).
 *
 * ⚠️⚠️ 등장률만 올려서는(`orders.FAVOR_WEIGHT`) 드물게 시킨 것이 끝까지 안 나온다 —
 * 15건에 33% 라도 한 번도 안 뜰 확률이 0.5% 쯤 남는다. 백 판에 한 번은 손도 못 대고 막히는 셈인데,
 * 그건 어려운 게 아니라 **불공평한 것**이다.
 * ⚠️ 여유를 **한 건**만 둔다(`need + 1`). 넉넉히 잡으면 판 후반이 통째로 같은 메뉴가 되어
 *    카드 두 장을 놓고 재는 재미가 사라진다.
 */
export const mustFavor = (need: number, ordersLeft: number): boolean => need > 0 && ordersLeft <= need + 1;

export type MissionKind =
  /** 그 김밥을 N개 낸다. */
  | 'menu'
  /** 주문을 N건 낸다(실패는 세지 않는다). */
  | 'rounds'
  /** ★★★ 를 N번 낸다. */
  | 'perfect'
  /** 이 판에서 $N 을 번다. */
  | 'revenue'
  /** ★★★ 를 N연속으로 낸다. */
  | 'combo'
  /** 참기름·깨소금을 **둘 다** 친 주문을 N건 낸다. */
  | 'seasoned'
  /** 여러 줄(X2 이상) 주문을 N건 **다 채워** 낸다. */
  | 'rolls'
  /** 급행 주문을 N건 낸다. */
  | 'rush';

export interface Mission {
  readonly kind: MissionKind;
  /** 이만큼 채우면 완수. */
  readonly goal: number;
  /** `menu` 미션이 가리키는 김밥. */
  readonly menu?: MenuId;
  /** 완수하는 순간 들어오는 돈. */
  readonly reward: number;
}

export interface MissionState {
  readonly list: readonly Mission[];
  /** 미션마다 지금까지 채운 값. */
  readonly progress: readonly number[];
  /** 이미 완수했는가 — 완수한 뒤로는 더 오르지 않는다. */
  readonly done: readonly boolean[];
}

/** 한 주문을 다 내고 나온 결과 — 미션이 보는 것은 이게 전부다. */
export interface ServeEvent {
  readonly menu: MenuId | null;
  readonly stars: number;
  readonly failed: boolean;
  /** 이번 주문으로 번 돈(음수면 손해). */
  readonly revenue: number;
  /** ★★★ 연속 횟수(0 이면 끊겼다). */
  readonly perfectCombo: number;
  /** 받기로 한 줄 수와 실제로 낸 줄 수. */
  readonly rolls: number;
  readonly rollsDone: number;
  /** 급행 주문이었나. */
  readonly rush: boolean;
  /** 참기름·깨소금을 **둘 다** 쳤나. */
  readonly seasonedBoth: boolean;
}

/**
 * 미션 한 종류의 설계값.
 * `weight` 는 뽑히는 비율이고, `from` 은 그 종류가 **처음 나오는 판**이다 —
 * 첫 판에 「완벽 3연속」이 걸리면 배우기도 전에 못 깨는 목표가 된다.
 */
interface Spec {
  readonly kind: MissionKind;
  /**
   * ⚠️⚠️ **아직 안 쓴다.** 미션이 **레벨 클리어 조건**이 된 이상, 뽑기에 막히면 그 레벨을 영영 못 깬다.
   * 급행(10%)·여러 줄(20%)은 카드가 안 뜨면 손쓸 방법이 없다 —
   * **카드 생성이 그 미션을 보장하도록**(등장률 보정) 고친 뒤에 되살린다.
   */
  readonly hold?: true;
  /**
   * ⚠️⚠️ **이 미션이 서는 칸**(0 왼쪽 · 1 가운데 · 2 오른쪽) — 종류마다 **자리가 고정**이다.
   *
   * 예전에는 셋을 가중치로 아무 데서나 뽑았다. 그러니 「참치」가 이번 판엔 왼쪽, 다음 판엔 오른쪽에
   * 서서 **볼 때마다 세 칸을 처음부터 다시 읽어야 했다.** 빠듯한 시간에 그건 그냥 손해다.
   * 칸마다 성격을 못 박아 두면 **눈이 갈 곳을 안다** — 왼쪽은 무슨 김밥, 가운데는 솜씨, 오른쪽은 실적.
   */
  readonly column: 0 | 1 | 2;
  readonly weight: number;
  readonly from: number;
  /** 목표치 — 그 판의 처리량(`orders`)에 대한 비율로 잡고 아래 범위로 자른다. */
  readonly ratio: number;
  readonly min: number;
  readonly max: number;
  /** 목표 한 칸당 보상($). */
  readonly pay: number;
}

/**
 * **칸마다의 성격.** 이 순서가 곧 화면 순서다(`missionPanel`).
 *   0 「무엇을」 — 그 판에서 밀어야 할 김밥
 *   1 「어떻게」 — 솜씨
 *   2 「얼마나」 — 실적
 */
export const MISSION_COLUMN_LABEL: readonly string[] = ['무엇을', '어떻게', '얼마나'];

const SPECS: readonly Spec[] = [
  // ── 0칸 「무엇을」 — 언제나 메뉴다. 무슨 김밥인지가 판마다 갈리므로 이것만으로 충분히 변주된다.
  // ⚠️⚠️ **목표를 처리량의 1/4 로 잡았더니 깰 수가 없었다.** 카드는 판의 메뉴 대여섯 종에서 고르게
  //    뽑히므로 한 메뉴가 뜨는 것은 다섯 번에 한 번꼴이다 — 15건에 4개를 시키면 **최적 플레이로도
  //    평균 2.7개**밖에 못 낸다. 목표를 낮추고(1/4 → 1/6, 상한 4 → 3) 그 대신
  //    **카드 생성이 그 메뉴를 자주 띄우도록**(`orders.FAVOR_WEIGHT`) 함께 고쳤다.
  { kind: 'menu', column: 0, weight: 30, from: 0, ratio: 0.17, min: 2, max: 3, pay: 5 },
  // ── 1칸 「어떻게」 — 솜씨. 첫 판은 ★★★ 뿐이고 판이 오를수록 갈래가 는다.
  // ⚠️⚠️ **상한 5 가 발목이었다.** 판이 15~22건으로 커져도 목표가 5에 붙박여 있어서, 시뮬레이터로 재 보니
  //    「낼 수 있는 값 7.8 / 목표 4.3」 — **×1.85 여유**로 사실상 공짜였다(달성률 98%).
  { kind: 'perfect', column: 1, weight: 26, from: 0, ratio: 0.38, min: 3, max: 10, pay: 4 },
  { kind: 'seasoned', column: 1, weight: 16, from: 1, ratio: 0.4, min: 3, max: 6, pay: 3 },
  { kind: 'combo', column: 1, weight: 12, from: 2, ratio: 0.25, min: 2, max: 4, pay: 7 },
  // ── 2칸 「얼마나」 — 실적.
  // ⚠️⚠️ **여기가 제일 헐거웠다** — 「낼 수 있는 값 $325 / 목표 $117」로 **×2.77**, 달성률 100%.
  //    상한 140 이 판이 커져도 그대로라 후반에는 판 시작 몇 건이면 끝났다.
  { kind: 'revenue', column: 2, weight: 22, from: 0, ratio: 13, min: 70, max: 600, pay: 0.1 },
  { kind: 'rounds', column: 2, weight: 18, from: 1, ratio: 0.7, min: 4, max: 12, pay: 2 },
  // ⚠️ 뽑기에 기대는 것들 — 지금은 **꺼 두었다**(`hold`). 위 주석 참조.
  { kind: 'rolls', column: 2, weight: 10, from: 3, ratio: 0.12, min: 1, max: 2, pay: 8, hold: true },
  { kind: 'rush', column: 2, weight: 8, from: 4, ratio: 0.1, min: 1, max: 2, pay: 9, hold: true },
];

/** 그 칸에서, 그 판에 뽑을 수 있는 종류. */
const columnSpecs = (column: 0 | 1 | 2, level: number): readonly Spec[] =>
  SPECS.filter((s) => !s.hold && s.column === column && level >= s.from);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

/** 가중치대로 하나 뽑는다. */
function pickSpec(pool: readonly Spec[], rand: Rand): Spec | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, s) => sum + s.weight, 0);
  let left = rand() * total;
  for (const spec of pool) {
    left -= spec.weight;
    if (left < 0) return spec;
  }
  return pool[pool.length - 1] ?? null;
}

const pickOne = <T>(list: readonly T[], rand: Rand): T | undefined =>
  list[Math.floor(rand() * list.length)] ?? list[0];

/**
 * **레벨이 오를수록 목표가 조금씩 커진다.**
 * ⚠️ 40레벨에서 멈춘다(+80%) — 그 위로도 계속 키우면 상한을 넘어 못 깨는 목표가 된다.
 */
const LEVEL_GROWTH = 0.02;
const LEVEL_GROWTH_CAP = 40;

const growthAt = (level: number): number =>
  1 + Math.min(Math.max(0, level), LEVEL_GROWTH_CAP) * LEVEL_GROWTH;

/**
 * **레벨 번호를 시드로 삼는 결정적 난수**(mulberry32).
 * ⚠️ 이게 「같은 레벨 = 같은 미션」의 전부다. `Math.random` 을 쓰면 주문이 바뀔 때마다,
 *    다시 도전할 때마다 목표가 갈려서 **목표가 아니라 날씨**가 된다.
 */
function levelRand(level: number): Rand {
  let s = (Math.max(0, Math.floor(level)) * 0x9e3779b1 + 0x85ebca6b) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * **그 레벨의 미션 셋** — 언제 불러도 같은 결과다.
 * 실패해 다시 도전해도 목표는 그대로이고, 레벨이 오를 때만 갈린다.
 */
export const missionsForLevel = (
  level: number,
  menus: readonly MenuId[],
  orders: number,
): readonly Mission[] => rollMissions(level, menus, orders, levelRand(level));

/**
 * 미션 셋을 뽑는다.
 * ⚠️ 보통은 `missionsForLevel` 을 쓴다 — 이건 그 속이고, 검증에서 난수를 바꿔 끼울 때만 직접 부른다.
 * ⚠️ `menu` 미션은 **그 판에 실제로 나오는 김밥**에서만 뽑는다 — 진열에 없는 김밥을 시키면
 *    카드로 나올 수가 없어 영영 못 깬다(`stageTray.stageMenus`).
 */
export function rollMissions(
  stageIndex: number,
  menus: readonly MenuId[],
  orders: number,
  rand: Rand = Math.random,
): readonly Mission[] {
  const stage = Math.max(0, Math.floor(stageIndex));
  const grow = growthAt(stage);
  const out: Mission[] = [];
  // ⚠️⚠️ **칸마다 하나씩** 뽑는다 — 그래서 결과 순서가 곧 화면 순서이고, 종류마다 자리가 고정된다.
  //    (예전처럼 한 통에서 셋을 뽑으면 같은 미션이 판마다 다른 칸에 서서 매번 다시 읽어야 했다.)
  for (let column = 0; column < MISSION_COUNT; column++) {
    const spec = pickSpec(columnSpecs(column as 0 | 1 | 2, stage), rand);
    if (!spec) continue;
    const goal = clamp(orders * spec.ratio * grow, spec.min, spec.max);
    const reward = Math.max(2, Math.round(goal * spec.pay));
    if (spec.kind === 'menu') {
      // ⚠️ 야채 김밥은 뺀다 — 어느 판에나 있고 값이 제일 싸서 「야채만 계속」이 정답이 되어 버린다.
      const pickable = menus.filter((m) => m !== 'veggie');
      const menu = pickOne(pickable.length > 0 ? pickable : menus, rand);
      if (!menu) continue;
      out.push({ kind: 'menu', goal, menu, reward });
      continue;
    }
    out.push({ kind: spec.kind, goal, reward });
  }
  return out;
}

/** 그 미션이 서는 칸 번호 — 화면이 자리를 정할 때 본다. */
export const missionColumn = (kind: MissionKind): number =>
  SPECS.find((s) => s.kind === kind)?.column ?? 0;

/** 갓 뽑은 미션들로 시작 상태를 만든다. */
export const startMissions = (list: readonly Mission[]): MissionState => ({
  list,
  progress: list.map(() => 0),
  done: list.map(() => false),
});

/** 이 주문이 그 미션을 **얼마나** 채웠나. */
function gained(mission: Mission, ev: ServeEvent, before: number): number {
  if (ev.failed) return 0;
  switch (mission.kind) {
    case 'menu':
      return ev.menu === mission.menu ? 1 : 0;
    case 'rounds':
      return 1;
    case 'perfect':
      return ev.stars >= 3 ? 1 : 0;
    case 'revenue':
      // ⚠️ 손해 본 주문이 진행을 **깎지는 않는다** — 게이지가 뒤로 가면 미션이 벌이 된다.
      return Math.max(0, ev.revenue);
    case 'combo':
      // 연속은 쌓이는 게 아니라 **최고 기록**이다 — 끊겼다 다시 쌓아도 그전 기록은 남는다.
      return Math.max(0, ev.perfectCombo - before);
    case 'seasoned':
      return ev.seasonedBoth ? 1 : 0;
    case 'rolls':
      // 받기만 하고 못 채운 여러 줄 주문은 세지 않는다 — 「다 냈다」가 조건이다.
      return ev.rolls > 1 && ev.rollsDone >= ev.rolls ? 1 : 0;
    case 'rush':
      return ev.rush ? 1 : 0;
    default:
      return 0;
  }
}

export interface MissionUpdate {
  readonly state: MissionState;
  /** 이번 주문으로 **새로 완수한** 미션 번호들. */
  readonly completed: readonly number[];
  /** 그 보상금 합계. */
  readonly reward: number;
}

/** 한 주문의 결과를 미션에 반영한다. 이미 완수한 미션은 더 오르지 않는다. */
export function applyServe(state: MissionState, ev: ServeEvent): MissionUpdate {
  const completed: number[] = [];
  let reward = 0;
  const progress = state.progress.map((value, i) => {
    const mission = state.list[i];
    if (!mission || state.done[i]) return value;
    const next = Math.min(mission.goal, value + gained(mission, ev, value));
    if (next >= mission.goal && value < mission.goal) {
      completed.push(i);
      reward += mission.reward;
    }
    return next;
  });
  const done = state.done.map((was, i) => was || completed.includes(i));
  return { state: { ...state, progress, done }, completed, reward };
}

/** 셋을 다 채웠는가. */
export const allMissionsDone = (state: MissionState): boolean =>
  state.list.length > 0 && state.done.every(Boolean);

/** 화면에 뜨는 한 줄 — **짧아야 한다.** 셋이 한 줄에 나란히 서기 때문이다. */
export function missionLabel(mission: Mission): string {
  switch (mission.kind) {
    case 'menu':
      // 「참치 김밥」에서 「김밥」은 군더더기다 — 칸이 좁다.
      return mission.menu ? MENU_LABEL[mission.menu].replace(' 김밥', '') : '지정 메뉴';
    case 'rounds':
      return '주문 처리';
    case 'perfect':
      return '완벽한 김밥';
    case 'revenue':
      return '매출';
    case 'combo':
      return '완벽 연속';
    case 'seasoned':
      return '마무리 완비';
    case 'rolls':
      return '여러 줄 주문';
    case 'rush':
      return '급행 주문';
    default:
      return '미션';
  }
}

/** 진행 표기 — 매출만 달러다. */
export function missionProgressText(mission: Mission, value: number): string {
  const now = Math.min(mission.goal, Math.floor(value));
  return mission.kind === 'revenue' ? `$${now} / $${mission.goal}` : `${now} / ${mission.goal}`;
}
