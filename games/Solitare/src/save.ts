/**
 * save.ts — 진행 저장(코인 + 건설된 층 수). localStorage 기반, Phaser-free.
 *
 * 게임 모델: 솔리테어를 플레이해 **코인**을 벌고, 그 코인으로 타워의 **다음 층을 건설**한다.
 *   (층 클리어 → 자동 다음 층 이동이 아니라, 코인 축적 → 건설로 위로 쌓아 올린다.)
 */
import { freshMissionState, withExpiryChecked, type MissionRewardState } from './logic/missionReward.js';
import { coerceCollection, defaultCollection, type CollectionState } from './logic/collection.js';
import { normalizeProfile, type Profile } from './logic/profile.js';
import type { ThiefEventSave } from './logic/thiefEvent.js';
import { HOTEL_FLOOR_COUNT } from './config/hotelFloors.js';

export interface SaveData {
  coins: number;
  /** **다이아** — 게임 중 카드에서 수집(판당 ~2개). 건물 건설/업그레이드 비용으로 사용. */
  diamonds?: number;
  /** **광고 제거 구매 여부**(홈 NoAds 아이콘). 사면 전면 광고를 띄우지 않는다. */
  noAds?: boolean;
  /** 건설된 층 수(1..TOTAL). 시작 시 1층은 기본 건설. */
  builtFloors: number;
  /** 소유한 층 수(건설됐지만 미소유=점포매입 대상). */
  ownedFloors?: number;
  /** 현재/최고 도달 레벨(1-base). 승리 시 +1 → 타워 나갔다 와도 이 값으로 이어짐. */
  level: number;
  /** 이미 한 번 플레이한 레벨들(1회 이상). 첫 플레이는 에디터가 저장한 초기 딜을 사용, 이후엔 재딜. */
  playedLevels?: number[];
  /** **스테이지2(우측 부지)** 건설 상태 — 임시저장. */
  lot2Built?: boolean;
  lot2Floors?: number;
  lot2Owned?: number;
  /** **좌측 부지** 건설 상태 — 임시저장(폐건물 철거 후 1층). */
  lot1Built?: boolean;
  lot1Floors?: number;
  /** **사이드 부지(좌/우 외곽 포함) 건설 상태** — 부지키(L1/L2/R2 등)→건설여부. */
  sideBuilt?: Record<string, boolean>;
  /** 사이드 부지 **철거 완료(빈 부지)** 상태 — 철거했지만 1층 미건설. */
  sideDemolished?: Record<string, boolean>;
  /**
   * **이벤트 1회 리셋 표식**(PO 2026-08-24 "이벤트 리셋하세요") — 이 값이 최신 태그와 다르면
   * 부팅 때 이벤트(리그·위클리·배너·재고)를 한 번 초기화하고 태그를 찍는다. 코인·레벨은 그대로.
   */
  eventResetTag?: string;
  /**
   * **진행 중인 판의 보상 표식**(PO 2026-08-24) — 판 도중 지급된 보상을 되돌리기 위한 스냅샷.
   * 정상 종료 시 지워진다. 남아 있으면 강제 종료된 것이므로 다음 부팅에서 회수한다.
   * 타입은 `logic/playSession.ts` 의 `PlaySessionSnap`(순환 참조를 피해 여기선 구조만 둔다).
   */
  /** **스타터 팩(초회 한정) 구매 표식**(PO 2026-08-25) — 산 적 있으면 오퍼를 다시 띄우지 않는다. */
  starterPackBought?: boolean;
  playSession?: {
    coins: number;
    diamonds: number;
    leagueStage: SaveData['leagueStage'];
    leaguePeriodId: number;
    leaguePoints: number;
    thiefEvent: SaveData['thiefEvent'];
    collection: SaveData['collection'];
  };
  /** 우 내측 부지(lot2) 철거 완료(빈 부지) 상태. */
  lot2Demolished?: boolean;
  /**
   * **호텔(3번 라인) 건설 상태**(2026-08-31 재설계) — 2번 라인 20/20 완공 뒤 해금(`HomeScene.hotelUnlocked`),
   *   레벨(`hotelFloorLevelReq`)·다이아(`diamondCostFor(LOT2_MAX_FLOORS+floor)`) 둘 다 충족해야 다음 층 건설.
   *   lot2 와 동일하게 별도 매입 단계 없음(`hotelOwned` = `hotelFloors`). R2 부지 슬롯을 차지한다 —
   *   `hotelBuilt`(1층 이상)면 R2 는 더 이상 평범한 사이드 부지가 아니다.
   *   ⚠️ 예전 `lot3Shown`(표시 전용 테스트 플래그)을 대체한다.
   */
  hotelBuilt?: boolean;
  hotelFloors?: number;
  hotelOwned?: number;
  /** **테스트 모드: 2번 라인 전층 표시**(2026-08-31) — 완공 테스트에서 11~20층까지 세운다(표시만). */
  showAllLot2?: boolean;
  /** **점포(층)별 누적 코인** — 손님이 떨어뜨린 코인을 층별로 보관. 목표(100) 도달 시 점원 위 말풍선으로 수령 대기. floor(문자열)→코인. */
  floorCoinBanks?: Record<string, number>;
  /**
   * **점포 수익 통합 수금 — 마지막 정산 시각**(epoch ms, PO 2026-07-28).
   *   여기서부터 한 주기(`storeIncome.periodFor(층수)` — 10분에서 층당 +2분)가 지나면 가득 찬다. 받으면 이 값이 갱신되고,
   *   **받지 않으면 더 쌓이지 않는다**. 없으면(구 세이브) 최초 조회 시점을 기준으로 시작한다.
   */
  storeIncomeAt?: number;
  /** **수금함 잔액** — 손님이 떨어뜨린 코인을 층 구분 없이 모아 둔다. 한 주기분(10분치)에서 누적이 멈춘다. */
  storeIncomeBank?: number;
  /**
   * **수금함 용량 업그레이드 레벨**(0=기본, PO 2026-07-29 "더 많은 코인을 회수할 수 있는 업그레이드가
   *   가능하도록 이후에 기능을 추가할 예정"). 아직 올리는 UI 는 없다 — `storeIncome.capacityFor` 가
   *   레벨당 +25% 로 상한(=시간당 수입)을 키운다. 구매 화면이 붙으면 이 값만 올리면 된다.
   */
  storeIncomeLevel?: number;
  /** **고수익 경쟁 부지(좌측 L2) 뱅크 건설 층수**(0=미낙찰, 1~4=단계별 건설). 낙찰 시 1층부터 단계 건설. */
  compBankFloors?: number;
  /**
   * **부스터 아이템 인벤토리**(2026-07-16 PO) — 보유분이 있으면 코인 대신 아이템을 소모(무료 사용).
   *   PlayScene 버튼에 보유 개수를 **원문자(①②…)**로 표시, 소진되면 코인 가격 표시로 전환.
   */
  items?: { wild: number; plus5: number; undo: number };
  /** **미션 리워드**(연속 플레이 별 수집, 2026-07-18) — 홈/플레이 공용 배너 상태. 없으면 첫 사용 시 지연 초기화. */
  missionReward?: MissionRewardState;
  /** **컬렉션 카드 보유**(2026-07-26) — 세트별 보유 카드 목록. 없으면 초기 보유(1세트 완성·2세트 -2장·3세트 절반). */
  collection?: CollectionState;
  /**
   * **컬렉션 NEW 배지 "확인함" 스냅샷**(2026-07-20) — collection 과 같은 형태. 세트를 markSetSeen 으로
   *   확인 처리하기 전까지는 collection 보다 값이 낮게 남아 있어 hasNewInSet/isNewCard 가 참이 된다.
   *   없으면 전부 미확인(defaultCollection()=0)으로 시작 — 콜렉션 자체가 0에서 시작하므로 자연히 맞아떨어진다.
   */
  collectionSeen?: CollectionState;
  /**
   * **플레이어 프로필**(표시 이름 + 아바타) — 투데이 리그·랭킹에서 나를 가리키는 정보.
   * 없으면 `loadSave` 가 기본 이름을 만들어 채운다(규칙은 `logic/profile.ts`).
   */
  profile?: Profile;
  /**
   * **투데이 리그** — 참가 중인 기간 id(로컬 자정 기준 일 인덱스)와 그 기간에 모은 점수(별).
   * 기간이 바뀌면 `settleLeague` 가 최종 순위로 보상을 주고 점수를 0 으로 되돌린다.
   */
  leaguePeriodId?: number;
  leaguePoints?: number;
  /** **Catch the Thief 주간 이벤트** 진행도(주기 id · 칸 · 칸 안 카운트). */
  thiefEvent?: ThiefEventSave;
  /** **투데이 리그 단계 사다리** — 하루 10단계. 날이 바뀌면 1단계부터. */
  leagueStage?: { periodId: number; stage: number; count: number };
  /**
   * **보너스 게임 일일 사용 기록** — 홈 좌측 아이콘으로 들어가는 보너스 게임의 그날 시작한 판 수.
   *   `day` 가 오늘이 아니면 무시된다(자동 회복) — 별도 리셋 처리가 없다. 규칙은 `logic/bonusGame.ts`.
   */
  bonusGame?: { day: number; used: number };
  /**
   * **타임어택 누적 승수 — 모드별**(1장/3장 사다리가 따로 움직인다, `logic/bonusGame.ts`).
   * ⚠️ 읽을 땐 반드시 `toBonusTimeWins()` 를 지날 것 — **옛 형식(숫자 하나)** 도 들어 있을 수 있다
   *   (사다리가 모드 공용이던 시절, 2026-08-30 당일 개정).
   * ⚠️ `bonusGame` 과 달리 **날짜로 리셋되지 않는다** — 난이도 진행도지 일일 사용량이 아니다.
   */
  bonusTimeWins?: number | { draw1: number; draw3: number };
  /**
   * **민원 창구별 누적 진행도**(시작한 판 수) — 창구마다 따로 쌓인다.
   * 이 값이 ①이번 판의 게임 방식(4단 순환) ②보상 배수를 정한다(`logic/civicDesks.ts`).
   * ⚠️ 날짜로 리셋되지 않는다 — 하루 판수(`bonusGame`)와는 다른 축이다.
   */
  civicProgress?: Readonly<Record<string, number>>;
  /**
   * **층별 상품 재고** — 층 번호(1..20) → 모은 개수. 소모하지 않는 기록이다
   * (단계 판정은 각자의 카운터가 한다 — `logic/collectRuntime.ts` 주석 참고).
   */
  itemStock?: Record<number, number>;
}

// **저장 키 버전** — 배포 시 이 버전을 올리면 기존 유저의 옛 저장(구버전 키)은 무시되고 **모두 처음(1레벨)부터 시작**한다.
//   (2026-07-15 배포 리셋: v1→v2. 2026-07-20: 클론다이크 10레벨 보너스 라운드 도입 배포에 맞춰 v2→v3,
//   PO 지시 "레벨을 모두 초기화" — 이후 다시 전체 리셋이 필요하면 v4 로 올린다.)
/**
 * 기본 이름에 쓸 **시드** — 같은 기기에서 늘 같은 이름이 나오도록 저장값에서 유도한다.
 * (난수를 쓰면 열 때마다 이름이 바뀐다.)
 */
function profileSeed(s: Partial<SaveData>): number {
  return (s.level ?? 1) * 7919 + (s.coins ?? 0);
}
/** 새 저장(첫 실행)용 시드 — 이때는 참조할 진행값이 없어 시각을 쓴다(한 번만 뽑히고 저장된다). */
function freshProfileSeed(): number {
  return Date.now();
}

export const SAVE_KEY = 'solitaire_save_v4'; // export 해서 테스트가 하드코딩 문자열 대신 이 상수를 참조하게(버전 올릴 때마다 테스트 깨지는 것 방지).
const KEY = SAVE_KEY;
const OLD_KEYS = ['solitaire_save_v1', 'solitaire_save_v2', 'solitaire_save_v3']; // v4(2026-08-31 전원 리셋 — 레벨·경제·건설 전부 처음부터). // 리셋 시 옛 저장 정리(orphan 방지) — loadSave 최초 호출에서 제거.
export const START_COINS = 20000; // 초기 골드 코인 — PO 2026-08-25: 40,000 → 20,000(결제 유도 — 저레벨 핀치 포인트 설계, 실측 L1-40 판당 비용 ~4,000 기준 약 5판+수입 런웨이).
//   ⚠️ SAVE_KEY 를 올리지 않았으므로 **기존 유저에게는 적용되지 않는다**(신규/리셋에만 지급).
//   게임비 1,500 기준 26.7판 분량(구: 2,000×20판).
const START_BUILT = 2; // 초기/리셋 시 **1~2층 지어져 있음**(2층=점포매입 대상, 3층부터 건설).
const START_OWNED = 1; // 초기/리셋 시 **1층만 소유**(2층=점포매입 대상).
const MIN_BUILT = 1; // 최소 1층은 항상 건설.
const START_LEVEL = 1;
export const START_DIAMONDS = 0; // 초기 다이아 — 2026-07-19 PO 확정(30→0).
export const MAX_FLOORS = 10; // 메인타워(1라인) 최대 층수 — 1~10층 전부 고유 아트 완비, 11층부터는 아트가 없다(2026-08-31 확정, 늘리지 않는다).
/** 2번 라인(우 내측) 최대 건설 층수 — 1~20층 전부 고유 아트 완비(BG_02=1~10F·BG_03=11~20F). */
export const LOT2_MAX_FLOORS = 20;

/** 층별 건설 비용 — index = 층 번호(1층은 기본, 2층부터 비용). 6~10층은 데모용 상향 곡선. */
export const FLOOR_COST = [0, 0, 500, 1200, 2500, 5000, 8000, 12000, 18000, 26000, 36000];

/**
 * **게임 입장비(코인)** — 레벨 플레이 진입 시 차감. 인게임 부스터(+5카드·와일드) 비용의 기준점이기도 하다.
 *   ⚠️ 이후 전체 경제(게임비 + 부스터 비용) 재설계 예정 — 아래 계수는 임시(튜너블).
 */
export const GAME_FEE = 1500; // 2026-08-23 2000→1500 하향. ⚠️경제 SSOT 는 public/econ/economy.json —
//   플레이 화면은 econRuntime(=economy.json) 을 쓰고 이 상수는 save.ts 내부 헬퍼 전용 사본이다.
//   세 곳(economy.json · DEFAULT_ECON · 여기)을 **항상 같이** 고칠 것(economy.test.ts 가 감시).

// ── 인게임 부스터 비용(게임비 기준 상승 곡선) ─────────────────────────────
//   한 판에서 같은 부스터를 쓸수록 비용이 오른다(uses = 이번 판 사용 횟수, 0=첫 사용).
//   +5카드: 게임비×(3.0·4.0·5.0…) = 6000·8000·10000(게임비 2000 기준, 사용당 +1.0×게임비).
//   와일드: +5카드보다 **약간 더**(항상 +0.6×게임비) = 7200·9200·11200.
//   ⚠️ 경제모델 v2(src/logic/economy.ts)는 다른 곡선(시작 2,000/3,000 + 레벨램프)을 검토 중 —
//     PO 지시(2026-07-16)로 **게임 반영 보류**(P3 economy.json 소비 때 일괄 적용). 여긴 라이브 현행 유지.
const PLUS5_BASE_MULT = 3.0; // +5카드 첫 사용 = 게임비 × 이 값.
const WILD_BASE_MULT = 3.6; // 와일드 첫 사용 = 게임비 × 이 값(+5보다 0.6 높음=약간 더 비쌈).
const BOOSTER_STEP_MULT = 1.0; // 사용마다 게임비 × 이 값만큼 가산.

/**
 * **남은 카드 보너스(장당)** — 승리 시 남은 뽑기 카드 1장당 추가 지급 코인.
 *   게임비(GAME_FEE)에 비례(×0.2 = 현재 400/장) → 이후 게임비·보상 인상 시 자동으로 비례 상승.
 */
const STOCK_BONUS_RATE = 0; // 남은카드 코인 보너스 **폐지**(PO 2026-07-17) — 남은 카드는 스타포인트(별)로 전환.
export function stockBonusPerCard(): number {
  return Math.round(GAME_FEE * STOCK_BONUS_RATE);
}

/**
 * **별 보상(코인)** — 승리 시 달성 별 수(**1~5**) 기준 지급(누적 아님). 게임비(GAME_FEE)에 비례해
 *   경제 인상 시 자동 비례. ⚠️ 값의 SSOT 는 `logic/economy.ts` 의 `starMult` — 여기는 그 사본이고
 *   economy.test.ts 의 계약 테스트가 두 곳이 어긋나지 않는지 감시한다.
 *   **PO 2026-08-23 재조정**: 3★ 을 **손익분기(×1.0)** 로 내렸다.
 *   왜: 예전 값(3★=×1.3)은 이기면 무조건 남는 구조라 **플레이 자체가 코인을 버는 곳**이었다.
 *     그러면 코인을 사서 판을 더 해도 그 판이 또 벌어들이므로 **인앱결제가 필요 없어진다**
 *     (실측: 3.5★ 평균 판당 +1,050 · 하루 10판 +10,500). 경제 모델은 그 반대여야 한다 —
 *     플레이는 코인을 **쓰는 곳**, 버는 곳은 이벤트·리그, 그 수입은 판수에 비례한다.
 *   1★=×0.3(600) · 2★=×0.65(1,300) · **3★=×1.0(2,000 — 본전)** · 4★=×1.35(2,700) · 5★=×1.75(3,500).
 */
const STAR_REWARD_MULT = [0, 0.3, 0.65, 1.0, 1.35, 1.75] as const;
export function starCoins(stars: number): number {
  const i = Math.min(STAR_REWARD_MULT.length - 1, Math.max(0, Math.floor(stars)));
  return Math.round(GAME_FEE * STAR_REWARD_MULT[i]);
}

/** +5카드 부스터 코인 비용 — uses=이번 판 이미 사용한 횟수(다음 사용 비용을 반환). */
export function plus5Cost(uses: number): number {
  return Math.round(GAME_FEE * (PLUS5_BASE_MULT + BOOSTER_STEP_MULT * Math.max(0, Math.floor(uses))));
}

/** 와일드카드 부스터 코인 비용 — +5카드보다 항상 약간(+0.3×게임비) 비싸다. */
export function wildCost(uses: number): number {
  return Math.round(GAME_FEE * (WILD_BASE_MULT + BOOSTER_STEP_MULT * Math.max(0, Math.floor(uses))));
}

/**
 * **점포 매입/업그레이드 다이아 비용** — 초기부터 **순차 증가**(10, 12, 15, 19, 24, …). ⚠️추후 조정.
 *   level = 단계(부지 매입=1단계=10, 이후 층 업그레이드마다 다음 값). 범위 밖은 마지막 값 기준 연장.
 */
const DIAMOND_COST = [10, 12, 15, 19, 24, 30, 37, 45, 54, 64]; // index = level-1 (1~10단계).
export function diamondCostFor(level: number): number {
  if (level < 1) return 0;
  if (level <= DIAMOND_COST.length) return DIAMOND_COST[level - 1];
  // 배열 밖(11+)은 마지막 값에서 증분 연장.
  return DIAMOND_COST[DIAMOND_COST.length - 1] + (level - DIAMOND_COST.length) * 12;
}

/**
 * **점포매입/건설 공통 비용**(PO 2026-07-19 임시 확정) — 층수와 무관하게 코인 1,500 + 다이아 20 고정.
 *   점포매입(이미 지어진 미소유 층)과 건설(새 층)이 **같은 버튼·같은 값**을 쓴다("이 점포매입버튼을
 *   건설버튼으로도 사용" PO 지시). ⚠️ "이후에 이 내용은 다시 설정하겠습니다" — 층별 증가 곡선(DIAMOND_COST·
 *   FLOOR_COST)으로 되돌릴 수도 있으니 이 상수 하나만 바꾸면 되게 유지할 것.
 */
export const STORE_ACQUIRE_COST = { coins: 1500, diamonds: 20 } as const;

/**
 * **층별 건설/매입 비용**(메인 타워) — 1층 값에서 층마다 일정액씩 오르는 **선형** 곡선.
 *   층수를 늘려도 곡선이 폭주하지 않고, 상수 두 쌍만 보면 전체를 읽을 수 있다.
 *
 * ── 코인(PO 2026-07-29 "초기 1.5K로부터 시작 / 층별로 0.5K씩 증가") ──
 *   1층 1,500 · 2층 2,000 · 3층 2,500 … 30층 16,000 (2~30층 합계 246,500)
 *
 * ── 다이아(PO 2026-07-30 A안 승인) ──
 *   1층 20 · 2층 25 · 5층 40 · 10층 65 · 20층 115 · **30층 165** (2~30층 합계 2,755)
 *
 *   **A안의 근거(실측, 저작 레벨 500 × 8판 = 4,000판)** — 3000레벨 동안의 다이아 공급은 소스 3개뿐이다:
 *     ① 보드 배치(판당 1.2 × 승률 53.9%) ≈ 1,941
 *     ② 인게임 5매치 미션(6% × 세트 2.02 × 승률) ≈ 196
 *     ③ 미션 티어 박스(판당 적립 별 21.95 → 티어 58개) ≈ 2,324
 *   합계 ≈ 4,462. 단 ③은 티어 제한시간(15~25분)을 못 채우면 진행도가 리셋되므로 **완료율 50% 를 가정**해
 *   공급을 3,300 으로 보고, 그 **80%(≈2,640)** 를 30층 건설에 배분했다 → 층당 증분 5(실제 합계 2,755).
 *   ⚠️ 데일리 챌린지는 **미구현**(랭킹 화면은 가상 데이터)이라 공급에 넣지 않았다. 실제 지급을 붙이면
 *      공급이 3배가 되므로 이 곡선을 다시 잡아야 한다.
 *   ⚠️ 전체 재화 재설계가 예정돼 있다(PO 2026-07-30) — 그때 이 상수 4개가 조정 지점이다.
 */
export const STORE_COST_BASE_COINS = 1500;
export const STORE_COST_STEP_COINS = 500;
export const STORE_COST_BASE_DIAMONDS = 20;
export const STORE_COST_STEP_DIAMONDS = 5;

/**
 * **건설 코인 배수**(PO 2026-08-23 지시) — 2층 ×20 에서 30층 ×10 까지 선형으로 내린다.
 *
 * 왜 배수인가: 기존 선형식(1,500 + 500/층)이 만드는 **곡선의 모양은 유지**하고 수준만 끌어올린다.
 * 손댈 상수가 3개뿐이라 이후 재조정도 이 자리에서 끝난다.
 *
 * 왜 이 수준인가: 코인은 플레이 외에 **이벤트·리그로도 지급**된다(PO). 플레이 수입만으로 감당되는
 * 수준에 맞추면 층 건설이 저절로 되는 소비처가 되어 목표로 기능하지 못한다.
 *   · 30층까지 건설비 합계 ≈ 355만 · 플레이 수입 ≈ 119만 → **이벤트가 전체 공급의 약 2/3** 를 담당.
 *   · 이벤트 설계 시 이 값이 지급 규모의 목표치가 된다(하루 7판 · 약 120일 여정 기준 일 2만 코인).
 */
const STORE_MULT_FIRST = 20; // 2층 배수.
const STORE_MULT_LAST = 10; // STORE_MULT_LAST_FLOOR 층 배수(이후 층은 이 값 유지).
/**
 * ⚠️ **배수 하한 도달 층을 30 으로 두면 안 된다.** 기본값은 층당 +500 으로 오르는데 배수는 층당
 *   내려가므로, 곱이 어느 층에서 **정점을 찍고 다시 내려간다**(실측: 28층 160,500 → 30층 160,000 역전).
 *   30층이 28층보다 싸지면 진행감이 무너진다. 도달 층을 40 으로 밀면 30층까지 단조 증가한다
 *   (2층 ×20 → 30층 ×12.6 → 40층 이후 ×10 고정). 하한을 낮추는 대신 **구간을 늘려** 해결한 것이라
 *   값은 오히려 올라간다(30층 160,000 → 202,000).
 */
const STORE_MULT_LAST_FLOOR = 40;

/**
 * 해당 층의 코인 배수 — 2층 미만은 2층과 동일.
 *
 * ⚠️ 배수를 끝까지 내리면 **비용이 정점을 찍고 다시 내려간다**. 기본값이 층당 +500 으로 오르고
 *   배수가 층당 일정하게 내려가므로, 곱의 정점은 항상 `도달층 − 2` 에 온다(실측: 도달층 30 → 28층 정점,
 *   30층이 28층보다 쌌다). 그래서 배수 계산에 쓰는 층을 **정점 직전까지로 제한**한다 — 그 뒤로는
 *   배수가 고정되어 비용이 계속 오른다(단조 증가 보장). 배수는 ×10.5 근처로 수렴한다.
 */
function storeCoinMult(floor: number): number {
  const span = STORE_MULT_LAST_FLOOR - 2;
  const peak = STORE_MULT_LAST_FLOOR - 3; // 이 층을 넘으면 배수 고정(정점 직전 = 반올림으로 평평해지지 않게 한 칸 앞).
  const t = (Math.min(floor, peak) - 2) / span;
  const c = Math.min(1, Math.max(0, t));
  return STORE_MULT_FIRST + (STORE_MULT_LAST - STORE_MULT_FIRST) * c;
}

export function storeAcquireCostFor(floor: number): { coins: number; diamonds: number } {
  const f = Math.max(1, Math.floor(floor));
  const base = STORE_COST_BASE_COINS + STORE_COST_STEP_COINS * (f - 1);
  return {
    // 500 단위로 반올림 — 화면 표기(1.5K 식)와 어긋나지 않게.
    coins: Math.round((base * storeCoinMult(f)) / 500) * 500,
    diamonds: STORE_COST_BASE_DIAMONDS + STORE_COST_STEP_DIAMONDS * (f - 1),
  };
}

/**
 * **레벨 3,000판 전체에 걸친 층 해금 곡선**(PO 2026-08-31 "레벨에 따른 층배치를 다시 설계") — 메인타워
 *   (2~10층)만 채우던 예전 곡선은 레벨250에서 끝나 나머지 2,750레벨(92%) 동안 건물 쪽 목표가 없었다.
 *   메인(10층, 이미 완비)→2번 라인(20층, 이미 완비)→호텔(15층, 이미 완비) **순차**로 세 구간을 나눠
 *   레벨 1~3000 전체를 채운다(각 라인은 앞 라인이 다 지어져야 해금 — `HomeScene.lotsUnlocked`/`hotelUnlocked`).
 *
 * `blockLevelReq(k, n, lStart, lEnd, p)` — 구간 안에서 k번째(1-base, n개 중) 해금 레벨. `p>1`(컨벡스)이라
 *   **초반엔 촘촘하고 후반으로 갈수록 벌어진다**("초반 빠르게 후반 느리게", PO 확정 페이스). 세 구간 다
 *   같은 형태를 쓰되 끝점만 다르다 — 메인 1→250(기존 최종값 유지) · 2번라인 260→1400 · 호텔 1450→3000
 *   (호텔 15층 = 정확히 레벨 3000, 게임 최종 목표). 각 구간 시작점은 **앞 구간 끝점보다 높게** 잡아 레벨
 *   게이트만으로도 순서가 지켜지게 한다(진짜 순서는 건설 완공 여부가 정하지만, 레벨도 어긋나지 않는다).
 */
function blockLevelReq(k: number, n: number, lStart: number, lEnd: number, p = 1.6): number {
  return Math.round(lStart + (lEnd - lStart) * (k / n) ** p);
}

/** 메인타워 층 건설 해금 레벨(1층은 제한 없음, 2~10층은 컨벡스 곡선). */
export function floorLevelReq(floor: number): number {
  if (floor <= 1) return 1;
  return blockLevelReq(floor - 1, MAX_FLOORS - 1, 1, 250);
}

/** 2번 라인(우 내측) 층 건설 해금 레벨(1~20층) — 메인타워 완공 레벨(250)보다 높은 지점부터 시작. */
export function lot2FloorLevelReq(floor: number): number {
  return blockLevelReq(floor, LOT2_MAX_FLOORS, 260, 1400);
}

/** 호텔(3번 라인) 층 건설 해금 레벨(1~15층) — 2번 라인 완공 뒤부터, 15층이 레벨 3000(엔드 콘텐츠). */
export function hotelFloorLevelReq(floor: number): number {
  return blockLevelReq(floor, HOTEL_FLOOR_COUNT, 1450, 3000);
}

// 옛 저장 키 정리(세션당 1회) — 배포 리셋 시 orphan 데이터 제거.
let oldKeysCleaned = false;
function cleanupOldSaves(): void {
  if (oldKeysCleaned) return;
  oldKeysCleaned = true;
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
  } catch {
    /* localStorage 미존재(노드/테스트) 무시 */
  }
}

export function loadSave(): SaveData {
  cleanupOldSaves();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SaveData>;
      const built = Math.min(MAX_FLOORS, Math.max(MIN_BUILT, Math.floor(s.builtFloors ?? START_BUILT)));
      // **소유 치유** — 게임 규칙상 다음 층을 건설하려면 아래 층을 모두 소유해야 하므로, **초기 매입 대상(2층)을
      //   넘어 지어진 타워(built > START_BUILT)의 모든 층은 소유 상태**다. 과거 저장 버그(건설 후 owned 미반영)로
      //   owned 가 built 보다 뒤처진 세이브를 여기서 바로잡아 **불필요한 재-점포매입 버튼**을 제거한다.
      const ownedRaw = Math.max(0, Math.floor(s.ownedFloors ?? START_OWNED));
      const owned = built > START_BUILT ? built : Math.min(built, ownedRaw);
      return {
        // 다른 수치 필드와 동일하게 음수·소수·비정상값 방어(손상/변조 세이브의 음수 잔액이 게이트를 영구 실패시키지 않게).
        coins: Number.isFinite(s.coins) ? Math.max(0, Math.floor(s.coins as number)) : START_COINS,
        diamonds: Math.max(0, Math.floor(s.diamonds ?? START_DIAMONDS)),
        builtFloors: built,
        ownedFloors: owned,
        level: Math.max(1, Math.floor(s.level ?? START_LEVEL)),
        playedLevels: Array.isArray(s.playedLevels) ? s.playedLevels.filter((x): x is number => Number.isFinite(x)) : [],
        lot2Built: !!s.lot2Built,
        // ⚠️ 예전엔 MAX_FLOORS(10)로 잘랐다 — 2번 라인은 20층까지 실제 건설 가능하므로 LOT2_MAX_FLOORS 로 클램프.
        lot2Floors: Math.min(LOT2_MAX_FLOORS, Math.max(0, Math.floor(s.lot2Floors ?? 0))),
        lot2Owned: Math.max(0, Math.floor(s.lot2Owned ?? 0)),
        lot1Built: !!s.lot1Built,
        lot1Floors: Math.min(MAX_FLOORS, Math.max(0, Math.floor(s.lot1Floors ?? 0))),
        sideBuilt: s.sideBuilt && typeof s.sideBuilt === 'object' ? { ...s.sideBuilt } : {},
        sideDemolished: s.sideDemolished && typeof s.sideDemolished === 'object' ? { ...s.sideDemolished } : {},
        lot2Demolished: !!s.lot2Demolished,
        hotelBuilt: !!s.hotelBuilt,
        hotelFloors: Math.min(HOTEL_FLOOR_COUNT, Math.max(0, Math.floor(s.hotelFloors ?? 0))),
        hotelOwned: Math.max(0, Math.floor(s.hotelOwned ?? 0)),
        showAllLot2: !!s.showAllLot2,
        ...(s.eventResetTag ? { eventResetTag: String(s.eventResetTag) } : {}),
        ...(s.playSession ? { playSession: s.playSession as SaveData['playSession'] } : {}),
        ...(s.starterPackBought === true ? { starterPackBought: true } : {}),
        floorCoinBanks: s.floorCoinBanks && typeof s.floorCoinBanks === 'object' ? { ...s.floorCoinBanks } : {},
        storeIncomeAt: typeof s.storeIncomeAt === 'number' && Number.isFinite(s.storeIncomeAt) ? s.storeIncomeAt : undefined,
        storeIncomeBank: Math.max(0, Math.floor(s.storeIncomeBank ?? 0)),
        storeIncomeLevel: Math.max(0, Math.floor(s.storeIncomeLevel ?? 0)),
        compBankFloors: Math.max(0, Math.floor(s.compBankFloors ?? 0)),
        items: coerceItems(s.items),
        missionReward: coerceMissionReward(s.missionReward),
        collection: coerceCollection(s.collection),
        collectionSeen: coerceCollection(s.collectionSeen),
        // 프로필은 **읽을 때 채운다** — 옛 저장에도 이름이 생기고, 손상된 값은 규칙대로 접힌다.
        profile: normalizeProfile(s.profile, profileSeed(s)),
        leaguePeriodId: typeof s.leaguePeriodId === 'number' ? s.leaguePeriodId : 0,
        leaguePoints: Math.max(0, Math.floor(s.leaguePoints ?? 0)),
        thiefEvent: s.thiefEvent,
        leagueStage: s.leagueStage,
        itemStock: s.itemStock,
        /*
         * ⚠️ **여기 없는 필드는 매번 지워진다.** loadSave 는 화이트리스트로 세이브를 다시 짓기 때문에,
         *   인터페이스에만 필드를 추가하고 이 목록을 빼먹으면 **쓰는 즉시 다음 loadSave→writeSave 에서
         *   사라진다**(실측 2026-08-29: 보너스 게임 판수가 계속 2로 되돌아갔다 — 회귀가 잡았다).
         *   새 필드를 만들면 반드시 여기에도 한 줄 추가할 것.
         */
        bonusGame: s.bonusGame,
        bonusTimeWins: s.bonusTimeWins,
        civicProgress: s.civicProgress,
      };
    }
  } catch {
    /* 파싱 실패 시 기본값 */
  }
  return { coins: START_COINS, diamonds: START_DIAMONDS, builtFloors: START_BUILT, ownedFloors: START_OWNED, level: START_LEVEL, playedLevels: [], lot2Built: false, lot2Floors: 0, lot2Owned: 0, items: { wild: 2, plus5: 2, undo: 3 }, collection: defaultCollection(), collectionSeen: defaultCollection(), profile: normalizeProfile(undefined, freshProfileSeed()), leaguePeriodId: 0, leaguePoints: 0 };
}

/**
 * 진행 저장 초기화 — **코인·다이아·레벨·플레이 기록은 유지**하고 **건설/부지 상태만** 초기값으로 되돌린다.
 *   (예전엔 removeItem 으로 전체를 지워 코인·다이아·레벨까지 날아갔다 — UI 안내와 불일치. 선택적 리셋으로 수정.)
 */
export function resetProgress(): void {
  try {
    const s = loadSave(); // 현재 저장(유지할 재화·레벨 확보).
    const kept: SaveData = {
      coins: s.coins,
      diamonds: s.diamonds,
      level: s.level,
      playedLevels: s.playedLevels ?? [],
      // ── 건설/부지 상태만 초기값으로 ──
      builtFloors: START_BUILT,
      ownedFloors: START_OWNED,
      lot2Built: false,
      lot2Floors: 0,
      lot2Owned: 0,
      lot2Demolished: false,
      lot1Built: false,
      lot1Floors: 0,
      hotelBuilt: false,
      hotelFloors: 0,
      hotelOwned: 0,
      showAllLot2: false,
      sideBuilt: {},
      sideDemolished: {},
      floorCoinBanks: {},
      storeIncomeAt: undefined, // 층이 리셋되면 수금 타이머도 처음부터.
      storeIncomeBank: 0,
      storeIncomeLevel: 0,

      items: itemsOf(s), // 부스터 아이템도 재화처럼 유지.
      missionReward: s.missionReward, // ⚠️ loadSave() 와 동일한 필드 누락 버그 재발 방지(2026-07-18) — 건설/부지 상태가 아니므로 유지.
      collection: collectionOf(s), // 컬렉션 카드도 수집물이므로 건설 리셋과 무관하게 유지(2026-07-26).
      collectionSeen: collectionSeenOf(s), // NEW 배지 확인 상태도 동일하게 유지.
    };
    writeSave(kept);
  } catch {
    /* 무시 — 실패 시 다음 loadSave 가 기본값 폴백 */
  }
}

/** 초기 지급 부스터 아이템(신규/미보유 세이브) — 온보딩에서 부스터 사용을 학습시키는 무료 체험분. */
const START_ITEMS = { wild: 2, plus5: 2, undo: 3 } as const;
function coerceItems(raw: unknown): { wild: number; plus5: number; undo: number } {
  if (!raw || typeof raw !== 'object') return { ...START_ITEMS };
  const o = raw as Record<string, unknown>;
  const n = (v: unknown, d: number): number => (Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : d);
  return { wild: n(o.wild, 0), plus5: n(o.plus5, 0), undo: n(o.undo, 0) };
}

/**
 * ⚠️ **loadSave() 필드 누락 버그 수정**(2026-07-18) — missionReward 가 이 파일 재구성 로직에서
 *   빠져 있어 매 loadSave() 호출마다 조용히 사라지고(다음 씬 진입 때 진행도가 3→0 으로 리셋되는
 *   것처럼 보임), 같은 함수 안에서 메모리 참조만 재사용할 때만 우연히 살아남았었다.
 */
function coerceMissionReward(raw: unknown): MissionRewardState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (!Number.isFinite(o.tier) || !Number.isFinite(o.progress) || !Number.isFinite(o.expiresAt)) return undefined;
  return { tier: Math.max(1, Math.floor(o.tier as number)), progress: Math.max(0, Math.floor(o.progress as number)), expiresAt: o.expiresAt as number };
}

/** 부스터 아이템 보유 조회(항상 정규화된 객체 반환). */
export function itemsOf(s: SaveData): { wild: number; plus5: number; undo: number } {
  return coerceItems(s.items);
}

/** 컬렉션 카드 보유 조회(항상 정규화된 상태 반환 — 없으면 초기 보유). */
export function collectionOf(s: SaveData): CollectionState {
  return coerceCollection(s.collection);
}

/** 컬렉션 NEW 배지 "확인함" 스냅샷 조회(항상 정규화된 상태 반환 — 없으면 전부 미확인). */
export function collectionSeenOf(s: SaveData): CollectionState {
  return coerceCollection(s.collectionSeen);
}

/** 미션 리워드 상태 조회 — 없으면 1티어로 지연 초기화, 만료됐으면 리셋(둘 다 순수 계산, 저장은 호출부 책임). */
export function missionRewardOf(s: SaveData, now: number): MissionRewardState {
  return withExpiryChecked(s.missionReward ?? freshMissionState(1, now), now);
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 저장 실패 무시 */
  }
}

/** 다음 건설할 층 번호(없으면 null = 최상층까지 완공). */
export function nextFloor(builtFloors: number): number | null {
  const next = builtFloors + 1;
  return next <= MAX_FLOORS ? next : null;
}



/**
 * **튜토리얼 안내 기록**은 별도 키로 둔다.
 *   본 세이브(SaveData)에 넣었더니, 다른 곳에서 `writeSave({...})` 로 통째로 덮을 때 조용히 지워져
 *   같은 안내가 매 레벨 다시 떴다(실측 2026-08-22). 안내 기록은 게임 진행과 무관한 작은 상태라
 *   충돌 지점을 아예 없앤다.
 */
const TIPS_KEY = 'solitaire_tips_v1';

export function loadTipsSeen(): string[] {
  try {
    const raw = localStorage.getItem(TIPS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 안내 기록 초기화 — **레벨 1 은 언제나 튜토리얼부터** 시작하기 위해 진입 시 호출한다
 * (PO 2026-08-22 "1레벨이 시작될 때는 반드시 튜토리얼이 시작되게 할 것").
 */
export function resetTipsSeen(): void {
  try {
    localStorage.removeItem(TIPS_KEY);
  } catch {
    /* 저장 불가 — 무시(어차피 안내가 다시 뜬다). */
  }
}

export function markTipSeen(key: string): void {
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify([...new Set([...loadTipsSeen(), key])]));
  } catch {
    /* 저장 불가(프라이빗 모드 등) — 안내가 다시 뜰 뿐이라 무시한다. */
  }
}

/**
 * **메시지 표시 횟수** — 같은 안내를 1~2회까지만 띄우기 위한 기록(PO 2026-08-22).
 *   판/세션이 바뀌어도 유지돼야 하므로 세이브가 아닌 전용 키에 남긴다.
 */
const MSG_COUNT_KEY = 'solitaire_msgcount_v1';

export function loadMessageCounts(): Map<string, number> {
  try {
    const raw = localStorage.getItem(MSG_COUNT_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : null;
    if (!obj || typeof obj !== 'object') return new Map();
    return new Map(
      Object.entries(obj as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number'),
    );
  } catch {
    return new Map();
  }
}

export function saveMessageCounts(counts: ReadonlyMap<string, number>): void {
  try {
    localStorage.setItem(MSG_COUNT_KEY, JSON.stringify(Object.fromEntries(counts)));
  } catch {
    /* 저장 불가 — 이번 세션 안에서만 제한이 걸린다. */
  }
}

/** 광고 제거를 샀는가(홈 NoAds 아이콘). */
export function hasNoAds(): boolean {
  return loadSave().noAds === true;
}

/** 광고 제거 적용 — 되돌릴 일이 없으므로 켜기만 한다. */
export function grantNoAds(): void {
  const save = loadSave();
  if (save.noAds) return;
  writeSave({ ...save, noAds: true });
}
