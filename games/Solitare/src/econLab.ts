/**
 * econLab.ts — **실질 경제 계측 브리지**(`public/econ-lab.html` 전용).
 *
 * ## 왜 필요한가
 * 뽑기 대시보드(stock-lab)는 **한 판 안의 일**만 잰다. 그런데 이 게임의 수지는 판 밖에서 결정된다 —
 * 투데이 리그(하루 10단계 + 자정 순위 보상)와 주간 이벤트(7일 사다리 + 완주 보너스)가
 * **판이 아니라 날짜**에 묶여 있기 때문이다. 판만 1,500번 돌리면 그 둘이 통째로 빠진 그림이 나온다.
 *
 * 실제로 2026-08-23 실측 1,500판은 `leagueStages` · `eventStages` · `dropCoins` 가 **전부 0** 이었다.
 * 세이브가 이미 리그 완주(stage 10) 상태였고 `dropCollect` 가 `isLeagueCleared` 로 막았기 때문이다.
 * 계측 도구가 **날짜를 굴리지 못하면** 같은 일이 반복된다.
 *
 * ## 무엇을 하는가 — 시계를 건드리지 않고 날짜를 굴린다
 * `Date` 를 패치하면 Phaser 트윈·타이머까지 흔들려 게임이 이상해진다. 대신 **세이브의 기간 id 를
 * 하루 전으로 되돌린다**. 리그·이벤트 로직은 전부 "저장된 periodId ≠ 지금 periodId 면 새 기간"으로
 * 판정하므로(`leagueStageOf` · `progressNow` · `settleLeague`), 이것만으로 자정을 정확히 재현한다.
 *
 * ⚠️ 이 모듈은 **세이브를 직접 쓴다**. 계측 전용이며 게임 코드에서 호출하지 말 것.
 */
import { floorLevelReq, loadSave, MAX_FLOORS, storeAcquireCostFor, writeSave, type SaveData } from './save.js';
import { leagueStageOf, leagueTargetFloor, openFloorOf } from './logic/collectRuntime.js';
import { periodIdFor } from './logic/league.js';
import { settleLeagueIfNeeded, currentStandings } from './logic/leagueRuntime.js';
import { thiefPeriodId, progressNow as eventProgressNow } from './logic/thiefEvent.js';
import { LEAGUE_STAGE_COUNT, leagueGrandCoins, leagueGrandDiamonds, stageCoins, stageGoal } from './logic/dailyLeague.js';
import { MISSION_REWARD_TABLE } from './logic/economyRules.js';
import { EVENT_STAGE_TARGETS } from './config/thiefEvent.js';
import { eventGrandCoins, eventGrandDiamonds, eventStageCoins, goalOf as eventGoalOf, THIEF_EVENT_DAYS, THIEF_STAGES } from './config/thiefEvent.js';
import { entryFeeFor, plus5PriceAt, starCoinsAt, undoPriceAt, wildPriceAt } from './econRuntime.js';
import { bonusValueForLevel } from './logic/economyRules.js';
import { EVENT_RESET_ITEMS, resetAllEvents } from './logic/eventReset.js';
import { TIP_ORDER } from './logic/tutorial.js';
import { buyStarterPack, STARTER_PACK, starterOfferAvailable } from './logic/starterOffer.js';

/** 지금 세이브의 경제 상태 한 덩어리 — 대시보드가 판 전후로 찍어 델타를 낸다. */
export interface EconSnapshot {
  readonly coins: number;
  readonly diamonds: number;
  readonly level: number;
  readonly builtFloors: number;
  readonly ownedFloors: number;
  /** 투데이 리그 — 지금 단계(0..10)와 그 단계에서 모은 수. */
  readonly leagueStage: number;
  readonly leagueCount: number;
  readonly leagueGoal: number;
  /** 오늘 모은 총 개수(= 리그 순위 점수). */
  readonly leaguePoints: number;
  readonly leagueTargetFloor: number;
  /** 주간 이벤트 — 지금 칸(0..10)과 그 칸에서 모은 수. */
  readonly eventStage: number;
  readonly eventCount: number;
  readonly eventGoal: number;
  readonly eventTargetFloor: number;
  /** 층별 상품 재고(드랍이 쌓이는 곳). */
  readonly itemStock: Record<number, number>;
}

function snap(save: SaveData, now: Date): EconSnapshot {
  const lg = leagueStageOf(save, now);
  const ev = eventProgressNow(save.thiefEvent, thiefPeriodId(now));
  const dayId = periodIdFor(now);
  return {
    coins: save.coins,
    diamonds: save.diamonds ?? 0,
    level: save.level,
    builtFloors: save.builtFloors,
    ownedFloors: save.ownedFloors ?? 1,
    leagueStage: lg.stage,
    leagueCount: lg.count,
    leagueGoal: stageGoal(lg.stage),
    leaguePoints: (save.leaguePeriodId ?? -1) === dayId ? (save.leaguePoints ?? 0) : 0,
    leagueTargetFloor: leagueTargetFloor(save, now),
    eventStage: ev.stage,
    eventCount: ev.count,
    eventGoal: ev.goal,
    eventTargetFloor: openFloorOf(save), // 이벤트는 **열린 최고층** 상품을 모은다(PO 2026-08-24).
    itemStock: { ...(save.itemStock ?? {}) },
  };
}

/** 지금 상태를 읽는다(세이브를 바꾸지 않는다). */
export function snapshot(now = new Date()): EconSnapshot {
  return snap(loadSave(), now);
}

export interface PrepareOpts {
  readonly coins?: number;
  readonly diamonds?: number;
  readonly level?: number;
  /** 층을 고정하면 드랍 상품이 고정된다 — 이벤트 층 일치율을 재려면 건드리지 말 것. */
  readonly builtFloors?: number;
  readonly ownedFloors?: number;
}

/**
 * **계측 시작 상태로 맞춘다** — 리그·이벤트를 오늘 처음 접속한 것처럼 되돌린다.
 *
 * 기간 id 를 `-1`(어떤 날과도 다른 값)로 두면 다음 드랍에서 리그는 1단계, 이벤트는 1칸부터 시작한다.
 * ⚠️ 순위 점수(`leaguePoints`)도 함께 0 으로 — 안 지우면 첫 정산이 어제 점수를 물고 들어간다.
 */
export function prepare(opts: PrepareOpts = {}): EconSnapshot {
  const save = loadSave();
  if (opts.coins != null) save.coins = Math.max(0, Math.floor(opts.coins));
  if (opts.diamonds != null) save.diamonds = Math.max(0, Math.floor(opts.diamonds));
  if (opts.level != null) save.level = Math.max(1, Math.floor(opts.level));
  if (opts.builtFloors != null) save.builtFloors = Math.max(1, Math.floor(opts.builtFloors));
  if (opts.ownedFloors != null) save.ownedFloors = Math.max(1, Math.floor(opts.ownedFloors));
  save.starterPackBought = false; // 계측 시작 = 스타터 팩 미구매 상태(과금 시나리오가 이 표식을 쓴다).
  // 이벤트 초기화는 **리셋 메뉴와 같은 함수**를 쓴다 — 한쪽만 고쳐 어긋나는 일을 막는다.
  writeSave(resetAllEvents(save));
  /*
   * **튜토리얼 안내를 전부 '본 것'으로**(2026-08-24) — 새(깨끗한) 프로필에서 계측을 돌리면 팁 카드가
   *   시뮬 입력을 막아 첫 판이 240초 타임아웃 → 무한 재시도로 겉돈다(실측). 계측에 튜토리얼은 표본이
   *   아니라 잡음이다. 화살표('drawArrow')까지 함께 마킹한다.
   */
  try {
    localStorage.setItem('solitaire_tips_v1', JSON.stringify([...TIP_ORDER, 'drawArrow']));
  } catch { /* 저장 불가 — 안내가 뜰 뿐. */ }
  return snapshot();
}

/**
 * **전체 이벤트만 리셋**(코인·레벨은 그대로) — 대시보드의 "🔄 전체 이벤트 리셋" 버튼.
 * 무엇이 지워지는지는 `EVENT_RESET_ITEMS` 가 알려 준다.
 */
export function resetEvents(now = new Date()): { items: ReadonlyArray<string>; after: EconSnapshot } {
  writeSave(resetAllEvents(loadSave(), now.getTime()));
  return { items: EVENT_RESET_ITEMS, after: snapshot(now) };
}

export interface DayResult {
  /** 정산이 일어났는가(점수 0 이면 참가 안 한 것으로 보고 보상 없음). */
  readonly settled: boolean;
  readonly rank: number;
  readonly points: number;
  /** 순위 보상 코인(이미 세이브에 반영됨). */
  readonly rankCoins: number;
  readonly gift: boolean;
  /** 하루를 마감한 뒤 상태. */
  readonly after: EconSnapshot;
}

/**
 * **하루를 마감한다** — 자정 통과를 재현한다.
 *
 * ① 저장된 기간 id 를 하루 전으로 밀어 `settleLeagueIfNeeded` 가 **정산을 하게** 만든다
 *    (그 함수는 `savedPeriodId === nowPeriodId` 면 아무 것도 하지 않는다).
 * ② 정산이 순위 보상을 지급하고 점수를 0 으로 되돌린다.
 * ③ 리그 **단계** 사다리도 함께 되돌린다 — 정산 함수는 점수만 보고 단계는 건드리지 않는다.
 */
export function endDay(now = new Date()): DayResult {
  const dayId = periodIdFor(now);
  const pre = loadSave();
  const points = (pre.leaguePeriodId ?? -1) === dayId ? (pre.leaguePoints ?? 0) : 0;
  pre.leaguePeriodId = dayId - 1; // 어제 참가한 것으로 만든다.
  pre.leaguePoints = points;
  writeSave(pre);

  const r = settleLeagueIfNeeded(now); // 순위 보상 지급 + 점수 리셋.
  /*
   * **순위 보상 제외**(PO 2026-08-25) — 순위 보상은 상위 ~10%(봇 필드에선 계측 봇이 매일 1위)에게만
   * 유의미하다. 평균 유저 데이터를 재는 것이 목적이므로 **지급된 코인을 그대로 되돌려** 잔고·원장
   * 양쪽에서 뺀다(원장에서만 빼면 잔고가 부풀어 런웨이가 왜곡된다). 등수는 정보로만 남긴다.
   */
  if (r.settled && r.coins > 0) {
    const sv = loadSave();
    sv.coins = Math.max(0, sv.coins - r.coins);
    writeSave(sv);
  }

  const post = loadSave();
  post.leagueStage = { periodId: -1, stage: 0, count: 0 }; // 단계 사다리도 새 날부터.
  writeSave(post);

  return { settled: r.settled, rank: r.rank, points: r.points, rankCoins: 0, gift: r.gift, after: snapshot(now) }; // rankCoins 0 = 제외 반영.
}

/**
 * **이벤트 주기를 마감한다**(7일). 사다리를 처음부터 다시 시작하게 만든다.
 * 완주 보너스는 `dropCollect` 안에서 이미 지급되므로 여기서는 되돌리기만 한다.
 */
export function endEventPeriod(now = new Date()): EconSnapshot {
  const save = loadSave();
  save.thiefEvent = { periodId: -1, stage: 0, count: 0 };
  writeSave(save);
  return snapshot(now);
}

export interface FeeResult {
  readonly ok: boolean;
  readonly fee: number;
  readonly coinsAfter: number;
}

/**
 * **입장료를 낸다** — 대시보드가 판을 시작하기 전에 반드시 부를 것.
 *
 * ⚠️ 게임비는 씬이 아니라 **입장 지점**(HomeScene · entryPopup · 다음판 팝업)에서 차감된다.
 *   계측 도구처럼 `scene.start('play')` 를 직접 부르면 **공짜로 플레이하게 된다** — 그러면 수지가
 *   통째로 틀어진다(기존 stock-lab 이 그랬다). 여기서 같은 규칙으로 대신 낸다.
 *
 * 코인이 모자라면 `ok:false` 로 돌려준다 — 실제 유저가 막히는 지점이 곧 런웨이의 끝이다.
 */
export function payFee(level: number, mult = 1): FeeResult {
  const fee = entryFeeFor(level, mult);
  const save = loadSave();
  if (save.coins < fee) return { ok: false, fee, coinsAfter: save.coins };
  save.coins = Math.max(0, save.coins - fee);
  writeSave(save);
  return { ok: true, fee, coinsAfter: save.coins };
}

/**
 * **과금 유저 시나리오**(PO 2026-08-25) — 계측 봇이 핀치 순간에 스타터 팩을 목업 구매한다.
 *   지급 내용·초회 한정 규칙은 실유저와 동일(logic/starterOffer). 원장에는 '결제 유입'으로 적는다.
 */
export function starterAvailable(): boolean {
  return starterOfferAvailable(loadSave());
}
export function buyStarter(): { ok: boolean; coins: number; plus5: number; wild: number } {
  const save = loadSave();
  if (!starterOfferAvailable(save)) return { ok: false, coins: 0, plus5: 0, wild: 0 };
  buyStarterPack(save);
  writeSave(save);
  return { ok: true, coins: STARTER_PACK.coins, plus5: STARTER_PACK.plus5, wild: STARTER_PACK.wild };
}

/** autoBuild 가 실행한 건설/매입 한 건. */
export interface BuildAction {
  readonly kind: 'purchase' | 'build';
  readonly floor: number;
  readonly coins: number;
  readonly diamonds: number;
}

/**
 * **자동 건설**(PO 2026-08-25 "건설비용을 포함해야 실질적인 유저 경제") — 홈의 실제 규칙 그대로:
 *   ① 소유 < 건설이면 다음 층 **점포매입** 먼저 ② 아니면 다음 층 **건설**(floorLevelReq 레벨 해금).
 *   비용은 둘 다 storeAcquireCostFor(층) = 코인+다이아. 여유가 있는 한 반복해서 짓는다.
 *
 * @param reserveCoins 남겨 둘 최소 코인(기본: 다음 판 입장료 3판분) — 실유저는 잔고를 0으로 만들지 않는다.
 * @returns 실행된 건설 목록과 총 지출 — 대시보드가 원장의 '층 건설 (지출)' 행으로 적는다.
 */
export function autoBuild(reserveCoins?: number): { actions: BuildAction[]; coins: number; diamonds: number } {
  const save = loadSave();
  const reserve = reserveCoins ?? entryFeeFor(save.level, 1) * 3;
  const actions: BuildAction[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const owned = save.ownedFloors ?? 1;
    const built = save.builtFloors;
    const purchase = owned < built;
    const target = purchase ? owned + 1 : Math.min(MAX_FLOORS, built + 1);
    if (!purchase && (target <= built || save.level < floorLevelReq(target))) break;
    const cost = storeAcquireCostFor(target);
    if (save.coins - cost.coins < reserve || (save.diamonds ?? 0) < cost.diamonds) break;
    save.coins -= cost.coins;
    save.diamonds = (save.diamonds ?? 0) - cost.diamonds;
    if (purchase) save.ownedFloors = target;
    else save.builtFloors = target;
    actions.push({ kind: purchase ? 'purchase' : 'build', floor: target, coins: cost.coins, diamonds: cost.diamonds });
  }
  if (actions.length) writeSave(save);
  return { actions, coins: actions.reduce((a, b) => a + b.coins, 0), diamonds: actions.reduce((a, b) => a + b.diamonds, 0) };
}

/** ＋5 한 번의 정가(차감 없이 조회만) — 대시보드가 원장 대사(reconciliation)에 쓴다. */
export function plus5Price(level: number, uses: number, mult = 1): number {
  return plus5PriceAt(level, uses, mult);
}

/** 그 레벨의 입장료(차감 없이 조회만). */
export function feeOf(level: number, mult = 1): number {
  return entryFeeFor(level, mult);
}

/**
 * **계측용 코인 충전**(레벨 스윕 전용) — 파산으로 스윕이 멈추면 뒤쪽 레벨 표본이 통째로 빈다.
 *   판 시작 전(payFee 이전)에만 부를 것 — 판별 원장은 판 전후 스냅샷 델타라 오염되지 않는다.
 */
export function addCoins(n: number): number {
  const save = loadSave();
  save.coins += Math.max(0, Math.floor(n));
  writeSave(save);
  return save.coins;
}

/** 한 레벨의 **설계 경제 한 줄** — 비용(입장료·부스터가)과 수익(별 등급 보상·손익분기)을 함께 준다. */
export interface LevelEconRow {
  readonly level: number;
  readonly fee: number;
  /** 별 1~5 등급의 클리어 보상 코인. */
  readonly starCoins: readonly number[];
  /** 별 1~5 등급의 순손익(보상 − 입장료). */
  readonly starNet: readonly number[];
  /** 손익분기 별 등급(이 등급부터 흑자, 없으면 0). */
  readonly breakevenStars: number;
  /** ＋5 1·2·3회차 가격(회차마다 오른다). */
  readonly plus5Prices: readonly number[];
  readonly wildPrice: number;
  readonly undoPrice: number;
  /** 보드 보너스(＋N) 카드의 N 합(레벨 설계값). */
  readonly bonusValue: number;
}

/**
 * **레벨 경제표**(설계) — 대시보드 '레벨 경제' 탭이 그린다(PO 2026-08-24 "각 레벨 비용·수익·리워드").
 *   전부 순수 조회(세이브 무변경) — 실제 지급 함수(starCoinsAt 등)를 그대로 불러 설계표와 게임이
 *   어긋날 수 없게 한다(별도 표를 만들면 반드시 어긋난다).
 */
export function levelEconTable(from: number, to: number, mult = 1): LevelEconRow[] {
  const rows: LevelEconRow[] = [];
  const a = Math.max(1, Math.floor(from));
  const b = Math.max(a, Math.floor(to));
  for (let lv = a; lv <= b; lv++) {
    const fee = entryFeeFor(lv, mult);
    const starCoins = [1, 2, 3, 4, 5].map((st) => starCoinsAt(lv, st, mult));
    const starNet = starCoins.map((c) => c - fee);
    const be = starNet.findIndex((n) => n >= 0);
    rows.push({
      level: lv,
      fee,
      starCoins,
      starNet,
      breakevenStars: be < 0 ? 0 : be + 1,
      plus5Prices: [0, 1, 2].map((u) => plus5PriceAt(lv, u, mult)),
      wildPrice: wildPriceAt(lv, 0, mult),
      undoPrice: undoPriceAt(lv, mult),
      bonusValue: bonusValueForLevel(lv),
    });
  }
  return rows;
}

/** 지금 순위표(봇 포함) — 정산 전에 예상 등수를 보고 싶을 때. */
export function standingsNow(now = new Date()): { rank: number; points: number } {
  const s = currentStandings(now);
  return { rank: s.myRank, points: s.myPoints };
}

/**
 * 설계 테이블 — **라이브 튜닝(economy.json 노브) 반영 유효값**으로 매번 계산한다(PO 2026-08-25).
 *   배율이 1이면 설계 기본표와 같다. 대시보드 '설계 대비/보상 구조/레벨 경제' 탭이 쓴다.
 */
export function tablesNow() {
  const idx = Array.from({ length: LEAGUE_STAGE_COUNT }, (_, i) => i);
  return {
    leagueStageGoals: idx.map((i) => stageGoal(i)),
    leagueStageCoins: idx.map((i) => stageCoins(i)),
    leagueStageCount: LEAGUE_STAGE_COUNT,
    leagueGrand: { coins: leagueGrandCoins(), diamonds: leagueGrandDiamonds() },
    eventStages: THIEF_STAGES.map((_, i) => ({ goal: eventGoalOf(i), coins: eventStageCoins(i) })),
    eventGrand: { coins: eventGrandCoins(), diamonds: eventGrandDiamonds(), chest: true },
    eventDays: THIEF_EVENT_DAYS,
    /** 미션(5매치) 보상 설계표 — 대시보드 '보상 구조' 탭이 실측 분포와 나란히 그린다. */
    missionRewardTable: MISSION_REWARD_TABLE,
    /** 위클리 칸 순환 타겟(store→collection→diamond→cards→wild). */
    eventTargets: EVENT_STAGE_TARGETS,
  } as const;
}

/** 대시보드(다른 창)가 부를 수 있도록 window 에 건다. */
export function installEconLab(): void {
  (globalThis as unknown as Record<string, unknown>).__econLab = {
    snapshot,
    prepare,
    levelEconTable,
    resetEvents,
    payFee,
    feeOf,
    addCoins,
    autoBuild,
    starterAvailable,
    buyStarter,
    plus5Price,
    endDay,
    endEventPeriod,
    standingsNow,
    get TABLES() { return tablesNow(); }, // 라이브 튜닝 반영 유효값 — 접근 시점 계산.
  };
}
