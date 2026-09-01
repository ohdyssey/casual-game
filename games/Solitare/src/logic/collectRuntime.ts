/**
 * collectRuntime.ts — **수집 드랍의 세이브 연결부**. 순수 로직(`dailyLeague`·`thiefEvent`)과 저장을 잇는다.
 *
 * ## 한 번의 드랍이 두 곳으로 간다 (A안, PO 2026-08-23)
 * 3콤보를 낼 때마다 상품 1개가 떨어진다. **무엇이 떨어질지는 투데이 리그의 지금 단계가 정한다** —
 * 리그는 하루 10단계이고 단계마다 목표 층이 바뀌므로, 하루를 플레이하면 여러 층 상품을 훑게 된다.
 *
 *   · 리그: 항상 +1 (그 단계의 목표 상품이므로)
 *   · 주간 이벤트: 떨어진 층이 **이벤트 칸의 층과 같을 때만** +1
 *   · 재고: 층별로 **독립 카운터**에 쌓인다(PO "상품은 서로 독립적으로")
 *
 * 재고는 소모하지 않는다 — 단계 판정은 각자의 카운터가 하고, 재고는 "무엇을 얼마나 모았나"를
 * 보여 주는 기록이다. 이렇게 해야 리그와 이벤트가 서로의 진행을 갉아먹지 않는다.
 */
import { loadSave, writeSave, type SaveData } from '../save.js';
import { periodIdFor } from './league.js';
import { addCollected, stageFloor, stageGoal, stageCoins, EMPTY_STAGE_STATE, isLeagueCleared, rollStageOverflow, type LeagueStageState } from './dailyLeague.js';
import { advance as advanceEvent, progressNow as eventProgressNow, thiefPeriodId, msUntilEventReset } from './thiefEvent.js';
import { eventGrandCoins, eventGrandDiamonds, eventStageCoins, eventStageIconKey } from '../config/thiefEvent.js';
import { floorItemKey, ITEM_FLOORS } from '../config/floorItems.js';
import { currentStore } from './currentStore.js';

/** 배너 보상 자리에 쓰는 코인 아이콘(홈 수금 배지와 같은 아트). */
const COIN_ICON_KEY = 'up_Solitare_UI_2-3';

/** 세이브에 담기는 오늘의 리그 단계(기간 id 포함). */
export interface LeagueStageSave extends LeagueStageState {
  readonly periodId: number;
}

/** 오늘의 리그 단계 — 날이 바뀌었으면 1단계부터. */
export function leagueStageOf(save: SaveData, now = new Date()): LeagueStageState {
  const pid = periodIdFor(now);
  const s = save.leagueStage;
  // 넘쳐 멈춘 진행도(`29/29`)를 굴려 올려서 읽는다 — 표를 바꿔도 화면이 멈추지 않는다.
  return s && s.periodId === pid ? rollStageOverflow({ stage: s.stage, count: s.count }) : EMPTY_STAGE_STATE;
}

/** 지금 리그 단계가 모으는 층. */
export function leagueTargetFloor(save: SaveData, now = new Date()): number {
  return stageFloor(leagueStageOf(save, now).stage, save.builtFloors);
}

/**
 * **지금 열린 최고층** — 주간 이벤트가 모으는 상품의 출처(PO 2026-08-24).
 * 아트가 있는 범위(ITEM_FLOORS)로 자른다. 층을 올리면 모으는 물건이 그 층 것으로 바뀐다.
 */
export function openFloorOf(save: SaveData): number {
  // **화면의 점포와 같은 층**(PO 2026-08-24) — 2번 부지를 올렸으면 그쪽 최상층이 지금 점포다.
  //   규칙은 `logic/currentStore.ts` 단일 출처(플레이 화면의 점포 아트도 같은 값을 쓴다).
  return Math.min(ITEM_FLOORS, Math.max(1, currentStore(save).itemFloor));
}

/** 지금 주간 이벤트 칸이 모으는 층. */
export function eventTargetFloor(save: SaveData, now = new Date()): number {
  /*
   * **칸마다 층을 바꾸지 않는다**(PO 2026-08-24: "현재 점포는 편의점이기에 편의점 수집아이템이
   *   표시되어야 합니다"). 실제 적립(`creditEventItems`)은 이미 **지금 열린 점포**의 상품만 세는데,
   *   표시만 `stageFloor` 로 단계마다 다른 층을 그려서 화면과 적립이 어긋났다(편의점인데 크루아상).
   */
  void now;
  return openFloorOf(save);
}

/** 배너 표시용 묶음 — 지금 모으는 상품·진행·보상·남은 시간. */
export interface EventBannerView {
  readonly itemKey: string;
  readonly current: number;
  readonly goal: number;
  readonly rewardText: string;
  readonly remainMs: number;
  /** 보상 아이콘 — 이벤트 칸 보상은 코인이다(옛 티어는 다이아였다). */
  readonly rewardIconKey: string;
}

/** 상단 배너(CATCH THE THIEF)가 그릴 값 — 주간 이벤트 기준. */
export function eventBannerView(save: SaveData, now = new Date()): EventBannerView {
  const prog = eventProgressNow(save.thiefEvent, thiefPeriodId(now));
  const floor = openFloorOf(save);
  const coins = eventStageCoins(prog.stage); // 유효값(라이브 배율 반영).
  return {
    // 배너 아이콘 = **사다리의 지금 칸과 같은 그림**(config/thiefEvent.eventStageIconKey 단일 출처).
    itemKey: eventStageIconKey(prog.stage, floorItemKey(floor)),
    current: prog.count,
    goal: prog.goal,
    rewardText: prog.cleared ? 'DONE' : coins.toLocaleString(),
    remainMs: msUntilEventReset(now),
    rewardIconKey: COIN_ICON_KEY,
  };
}

/** 리그 별 적립 결과 — 호출부(PlayScene)는 이 값으로 연출만 한다. */
export interface LeagueStarResult {
  /** 이번에 지급된 단계 보상 코인 합. */
  readonly coins: number;
  /** 완주로 지급된 그랜드 다이아(톱니바퀴 배율 반영) — 완주가 아니면 0. */
  readonly diamonds: number;
  /** 이번에 올라간 단계 수. */
  readonly stagesCleared: boolean;
  readonly stage: number;
  readonly count: number;
  readonly goal: number;
  /** 오늘 누적 점수(= 오늘 모은 별 총수, 순위 산정용). */
  readonly points: number;
}

/**
 * **투데이 리그에 별 n 개를 넣는다**(PO 2026-08-24).
 *
 * 리그가 세는 것은 **별**이다 — 미션(5매치) 보상으로 보드에 꽂혔다가 회수된 별과, 판을 끝내고 받은
 * 등급 별(1~5)이 같은 통에 들어간다. 예전에는 "주운 상품 개수"를 셌는데, 그러면 리그와 주간 이벤트가
 * 같은 것을 두고 다투게 되고 무엇이 어디로 가는지 화면에서 구분되지 않았다.
 *
 * ⚠️ 세이브를 한 번만 읽고 한 번만 쓴다 — 중간에 다른 곳에서 loadSave 하면 덮어쓰기가 난다.
 */
export function creditLeagueStars(n: number, now = new Date()): LeagueStarResult {
  const add = Math.max(0, Math.floor(n));
  const save = loadSave();
  const dayId = periodIdFor(now);
  const league = leagueStageOf(save, now);

  let coins = 0;
  let diamonds = 0;
  let staged = false;
  if (!isLeagueCleared(league.stage) && add > 0) {
    const r = addCollected(league, add, dayId); // dayId = 그랜드 다이아 톱니바퀴 배율 계산용.
    save.leagueStage = { periodId: dayId, stage: r.next.stage, count: r.next.count };
    coins += r.coins;
    diamonds += r.diamonds;
    staged = r.staged > 0;
  } else {
    save.leagueStage = { periodId: dayId, stage: league.stage, count: league.count };
  }
  /**
   * 순위 점수 = **오늘 모은 별 총수**.
   * ⚠️ 어제 값인지 **먼저 판정**하고 나서 기간을 갱신해야 한다 — 순서를 뒤집으면 조건이 항상 참이 되어
   *   자정에 점수가 리셋되지 않는다(어제 점수를 이어받아 순위가 부풀려진다).
   */
  const sameDay = (save.leaguePeriodId ?? -1) === dayId;
  save.leaguePoints = (sameDay ? (save.leaguePoints ?? 0) : 0) + add;
  save.leaguePeriodId = dayId;

  if (coins > 0) save.coins += coins;
  if (diamonds > 0) save.diamonds = (save.diamonds ?? 0) + diamonds;
  writeSave(save);

  const after = leagueStageOf(save, now);
  return {
    coins,
    diamonds,
    stagesCleared: staged,
    stage: after.stage,
    count: after.count,
    goal: stageGoal(after.stage),
    points: save.leaguePoints ?? 0,
  };
}

/** 주간 이벤트 적립 결과. */
export interface EventItemResult {
  readonly coins: number;
  readonly diamonds: number;
  readonly stagesCleared: boolean;
  readonly justCleared: boolean;
  readonly stage: number;
  readonly count: number;
  readonly goal: number;
  /** 지금 모으는 상품(= **열린 최고층**의 상품) 아트 키. */
  readonly itemKey: string;
  readonly floor: number;
}

/**
 * **주간 이벤트에 상품 n 개를 넣는다**(PO 2026-08-24).
 *
 * 손님이 **3개 이상** 모으고 떠날 때 그 숫자만큼 들어온다(호출부가 게이트를 지킨다).
 *
 * ## 무엇을 모으는가 — 지금 **열린 최고층**의 상품
 * 예전에는 리그 단계가 정한 층과 이벤트가 기다리는 층이 **우연히 같을 때만** 진행했다. 그래서 층을
 * 많이 지을수록 두 사다리의 박자가 어긋나 이벤트가 사실상 멈췄다(실측: 10층 보유 시 100개를 모아도
 * 0칸). 이제는 조건 없이 **항상** 들어가고, 그림만 지금 열린 층의 상품을 쓴다.
 */
/**
 * 이벤트 적립을 **계산만** 한다(저장 없음) — `creditEventItems` 와 `previewEventItems` 의 공통 몸통.
 *
 * ⚠️ 미리보기와 확정이 **같은 구현**을 써야 한다. 따로 두면 화면에 보여 준 보상과 실제 지급이
 *   갈라지는데, 그 어긋남은 판이 끝나야 드러나서 원인을 찾기 어렵다.
 */
function computeEventItems(save: SaveData, add: number, evtId: number): { next: SaveData['thiefEvent']; coins: number; diamonds: number; stagesCleared: boolean; justCleared: boolean } {
  const e = advanceEvent(save.thiefEvent, evtId, add);
  let coins = e.coins;
  let diamonds = 0;
  if (e.justCleared) {
    coins += eventGrandCoins();
    diamonds += eventGrandDiamonds();
  }
  return { next: e.next, coins, diamonds, stagesCleared: e.stagesCleared > 0, justCleared: e.justCleared };
}

/**
 * **적립하면 무엇을 받게 되는지 미리 계산**한다 — 저장하지 않는다.
 *
 * 메인 솔리테어는 판 중에 이벤트 아이템을 **모으는 연출**을 보여 주되 실제 지급은 판이 끝날 때 한다
 * (PO 2026-08-30 "최종적인 게임결과로 수집되도록"). 그 연출이 정확한 숫자를 보여 주려면, 아직 저장되지
 * 않은 **이번 판의 누적분**(`pending`)까지 얹은 상태에서 계산해야 한다.
 *
 * @param pending 이번 판에서 이미 쌓아 둔(아직 미지급) 적립 수
 * @param add     이번에 새로 쌓는 수
 */
export function previewEventItems(pending: number, add: number, now = new Date()): EventItemResult {
  const save = loadSave();
  const evtId = thiefPeriodId(now);
  const floor = openFloorOf(save);
  const before = computeEventItems(save, Math.max(0, Math.floor(pending)), evtId);
  const after = computeEventItems(save, Math.max(0, Math.floor(pending)) + Math.max(0, Math.floor(add)), evtId);
  const prog = eventProgressNow(after.next, evtId);
  return {
    // 이번 배치가 **새로** 만든 몫만 돌려준다(앞서 쌓아 둔 분은 이미 보여 줬다).
    coins: Math.max(0, after.coins - before.coins),
    diamonds: Math.max(0, after.diamonds - before.diamonds),
    stagesCleared: after.stagesCleared && !before.stagesCleared,
    justCleared: after.justCleared && !before.justCleared,
    stage: prog.stage,
    count: prog.count,
    goal: prog.goal,
    itemKey: floorItemKey(floor),
    floor,
  };
}

export function creditEventItems(n: number, now = new Date()): EventItemResult {
  const add = Math.max(0, Math.floor(n));
  const save = loadSave();
  const evtId = thiefPeriodId(now);
  const floor = openFloorOf(save);

  const e = computeEventItems(save, add, evtId);
  save.thiefEvent = e.next;
  if (e.coins > 0) save.coins += e.coins;
  if (e.diamonds > 0) save.diamonds = (save.diamonds ?? 0) + e.diamonds;
  writeSave(save);

  const prog = eventProgressNow(save.thiefEvent, evtId);
  return {
    coins: e.coins,
    diamonds: e.diamonds,
    stagesCleared: e.stagesCleared,
    justCleared: e.justCleared,
    stage: prog.stage,
    count: prog.count,
    goal: prog.goal,
    itemKey: floorItemKey(floor),
    floor,
  };
}

/** 지금 리그 단계의 보상 코인(표시용). */
export function leagueStageReward(save: SaveData, now = new Date()): number {
  return stageCoins(leagueStageOf(save, now).stage);
}
