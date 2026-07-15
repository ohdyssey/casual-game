/**
 * save.ts — 진행 저장(코인 + 건설된 층 수). localStorage 기반, Phaser-free.
 *
 * 게임 모델: 솔리테어를 플레이해 **코인**을 벌고, 그 코인으로 타워의 **다음 층을 건설**한다.
 *   (층 클리어 → 자동 다음 층 이동이 아니라, 코인 축적 → 건설로 위로 쌓아 올린다.)
 */
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
  /** **고수익 경쟁 부지(좌측 L2) 뱅크 건설 층수**(0=미낙찰, 1~4=단계별 건설). 낙찰 시 1층부터 단계 건설. */
  compBankFloors?: number;
}

// **저장 키 버전** — 배포 시 이 버전을 올리면 기존 유저의 옛 저장(구버전 키)은 무시되고 **모두 처음(1레벨)부터 시작**한다.
//   (2026-07-15 배포 리셋: v1→v2. 이후 다시 전체 리셋이 필요하면 v3 로 올린다.)
const KEY = 'solitaire_save_v2';
const OLD_KEYS = ['solitaire_save_v1']; // 리셋 시 옛 저장 정리(orphan 방지) — loadSave 최초 호출에서 제거.
const START_COINS = 5000; // 초기 골드 코인(게임비 재화) — 2026-07-15 배포 리셋 시 1000→5000 상향.
const START_BUILT = 2; // 초기/리셋 시 **1~2층 지어져 있음**(2층=점포매입 대상, 3층부터 건설).
const START_OWNED = 1; // 초기/리셋 시 **1층만 소유**(2층=점포매입 대상).
const MIN_BUILT = 1; // 최소 1층은 항상 건설.
const START_LEVEL = 1;
const START_DIAMONDS = 30; // 초기 다이아(건물 업그레이드 재화).
export const MAX_FLOORS = 10; // 데모: 최대 10층까지 건설.

/** 층별 건설 비용 — index = 층 번호(1층은 기본, 2층부터 비용). 6~10층은 데모용 상향 곡선. */
export const FLOOR_COST = [0, 0, 500, 1200, 2500, 5000, 8000, 12000, 18000, 26000, 36000];

/**
 * **게임 입장비(코인)** — 레벨 플레이 진입 시 차감. 인게임 부스터(+5카드·와일드) 비용의 기준점이기도 하다.
 *   ⚠️ 이후 전체 경제(게임비 + 부스터 비용) 재설계 예정 — 아래 계수는 임시(튜너블).
 */
export const GAME_FEE = 500;

// ── 인게임 부스터 비용(게임비 기준 상승 곡선) ─────────────────────────────
//   한 판에서 같은 부스터를 쓸수록 비용이 오른다(uses = 이번 판 사용 횟수, 0=첫 사용).
//   +5카드: 게임비×(1.5·2.0·2.5…) = 750·1000·1250(게임비 500 기준, 사용당 +0.5×게임비).
//   와일드: +5카드보다 **약간 더**(항상 +0.3×게임비) = 900·1150·1400.
const PLUS5_BASE_MULT = 1.5; // +5카드 첫 사용 = 게임비 × 이 값.
const WILD_BASE_MULT = 1.8; // 와일드 첫 사용 = 게임비 × 이 값(+5보다 0.3 높음=약간 더 비쌈).
const BOOSTER_STEP_MULT = 0.5; // 사용마다 게임비 × 이 값만큼 가산.

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
 * **층 건설 해금 레벨 요구치** — 층별로 플레이어 **레벨(별)**이 이 값 이상이어야 건설 가능.
 *   1~2층은 제한 없음(쉽게 매입). **3층부터 층당 대략 10레벨**(3층=10, 4층=20, …, 10층=80). ⚠️추후 조정.
 */
export function floorLevelReq(floor: number): number {
  if (floor <= 2) return 1;
  return (floor - 2) * 10;
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
        compBankFloors: Math.max(0, Math.floor(s.compBankFloors ?? 0)),
      };
    }
  } catch {
    /* 파싱 실패 시 기본값 */
  }
  return { coins: START_COINS, diamonds: START_DIAMONDS, builtFloors: START_BUILT, ownedFloors: START_OWNED, level: START_LEVEL, playedLevels: [], lot2Built: false, lot2Floors: 0, lot2Owned: 0 };
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
    };
    writeSave(kept);
  } catch {
    /* 무시 — 실패 시 다음 loadSave 가 기본값 폴백 */
  }
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
