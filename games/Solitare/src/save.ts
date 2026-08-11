/**
 * save.ts — 진행 저장(코인 + 건설된 층 수). localStorage 기반, Phaser-free.
 *
 * 게임 모델: 솔리테어를 플레이해 **코인**을 벌고, 그 코인으로 타워의 **다음 층을 건설**한다.
 *   (층 클리어 → 자동 다음 층 이동이 아니라, 코인 축적 → 건설로 위로 쌓아 올린다.)
 */
import { freshMissionState, withExpiryChecked, type MissionRewardState } from './logic/missionReward.js';
import { coerceCollection, defaultCollection, type CollectionState } from './logic/collection.js';

export interface SaveData {
  coins: number;
  /** **다이아** — 게임 중 카드에서 수집(판당 ~2개). 건물 건설/업그레이드 비용으로 사용. */
  diamonds?: number;
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
  /** 우 내측 부지(lot2) 철거 완료(빈 부지) 상태. */
  lot2Demolished?: boolean;
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
}

// **저장 키 버전** — 배포 시 이 버전을 올리면 기존 유저의 옛 저장(구버전 키)은 무시되고 **모두 처음(1레벨)부터 시작**한다.
//   (2026-07-15 배포 리셋: v1→v2. 2026-07-20: 클론다이크 10레벨 보너스 라운드 도입 배포에 맞춰 v2→v3,
//   PO 지시 "레벨을 모두 초기화" — 이후 다시 전체 리셋이 필요하면 v4 로 올린다.)
export const SAVE_KEY = 'solitaire_save_v3'; // export 해서 테스트가 하드코딩 문자열 대신 이 상수를 참조하게(버전 올릴 때마다 테스트 깨지는 것 방지).
const KEY = SAVE_KEY;
const OLD_KEYS = ['solitaire_save_v1', 'solitaire_save_v2']; // 리셋 시 옛 저장 정리(orphan 방지) — loadSave 최초 호출에서 제거.
export const START_COINS = 20000; // 초기 골드 코인 — 2026-07-19 PO 확정(40000→20000).
const START_BUILT = 2; // 초기/리셋 시 **1~2층 지어져 있음**(2층=점포매입 대상, 3층부터 건설).
const START_OWNED = 1; // 초기/리셋 시 **1층만 소유**(2층=점포매입 대상).
const MIN_BUILT = 1; // 최소 1층은 항상 건설.
const START_LEVEL = 1;
export const START_DIAMONDS = 0; // 초기 다이아 — 2026-07-19 PO 확정(30→0).
export const MAX_FLOORS = 10; // 데모: 최대 10층까지 건설.

/** 층별 건설 비용 — index = 층 번호(1층은 기본, 2층부터 비용). 6~10층은 데모용 상향 곡선. */
export const FLOOR_COST = [0, 0, 500, 1200, 2500, 5000, 8000, 12000, 18000, 26000, 36000];

/**
 * **게임 입장비(코인)** — 레벨 플레이 진입 시 차감. 인게임 부스터(+5카드·와일드) 비용의 기준점이기도 하다.
 *   ⚠️ 이후 전체 경제(게임비 + 부스터 비용) 재설계 예정 — 아래 계수는 임시(튜너블).
 */
export const GAME_FEE = 2000; // 2026-07-16 500→2000 상향(500은 너무 낮음).

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
 *   **PO 2026-07-29**: "별 3개를 획득했을 때 게임 비용 이상을 수익이 가능하도록" → 3★ 부터 배수 > 1.0.
 *   1★=×0.45(900) · 2★=×0.85(1,700) · **3★=×1.3(2,600 — 흑자 전환)** · 4★=×1.75(3,500) · 5★=×2.3(4,600).
 */
const STAR_REWARD_MULT = [0, 0.45, 0.85, 1.3, 1.75, 2.3] as const;
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

export function storeAcquireCostFor(floor: number): { coins: number; diamonds: number } {
  const f = Math.max(1, Math.floor(floor));
  return {
    coins: STORE_COST_BASE_COINS + STORE_COST_STEP_COINS * (f - 1),
    diamonds: STORE_COST_BASE_DIAMONDS + STORE_COST_STEP_DIAMONDS * (f - 1),
  };
}

/**
 * **층 건설 해금 레벨 요구치**(PO 2026-07-19 확정) — 1층은 제한 없음, **2층 상한 = 레벨 10**,
 *   **3층부터 층당 +30레벨**(3층=40, 4층=70, 5층=100, …). ⚠️ "이후 다시 설정할 예정" — 임시값.
 */
export function floorLevelReq(floor: number): number {
  if (floor <= 1) return 1;
  if (floor === 2) return 10;
  return 10 + (floor - 2) * 30;
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
        lot2Floors: Math.min(MAX_FLOORS, Math.max(0, Math.floor(s.lot2Floors ?? 0))),
        lot2Owned: Math.max(0, Math.floor(s.lot2Owned ?? 0)),
        lot1Built: !!s.lot1Built,
        lot1Floors: Math.min(MAX_FLOORS, Math.max(0, Math.floor(s.lot1Floors ?? 0))),
        sideBuilt: s.sideBuilt && typeof s.sideBuilt === 'object' ? { ...s.sideBuilt } : {},
        sideDemolished: s.sideDemolished && typeof s.sideDemolished === 'object' ? { ...s.sideDemolished } : {},
        lot2Demolished: !!s.lot2Demolished,
        floorCoinBanks: s.floorCoinBanks && typeof s.floorCoinBanks === 'object' ? { ...s.floorCoinBanks } : {},
        storeIncomeAt: typeof s.storeIncomeAt === 'number' && Number.isFinite(s.storeIncomeAt) ? s.storeIncomeAt : undefined,
        storeIncomeBank: Math.max(0, Math.floor(s.storeIncomeBank ?? 0)),
        storeIncomeLevel: Math.max(0, Math.floor(s.storeIncomeLevel ?? 0)),
        compBankFloors: Math.max(0, Math.floor(s.compBankFloors ?? 0)),
        items: coerceItems(s.items),
        missionReward: coerceMissionReward(s.missionReward),
        collection: coerceCollection(s.collection),
        collectionSeen: coerceCollection(s.collectionSeen),
      };
    }
  } catch {
    /* 파싱 실패 시 기본값 */
  }
  return { coins: START_COINS, diamonds: START_DIAMONDS, builtFloors: START_BUILT, ownedFloors: START_OWNED, level: START_LEVEL, playedLevels: [], lot2Built: false, lot2Floors: 0, lot2Owned: 0, items: { wild: 2, plus5: 2, undo: 3 }, collection: defaultCollection(), collectionSeen: defaultCollection() };
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

/** 다음 층 건설 비용(없으면 null). */
export function nextFloorCost(builtFloors: number): number | null {
  const n = nextFloor(builtFloors);
  return n == null ? null : FLOOR_COST[n];
}
