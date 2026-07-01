/**
 * hotelUpgrade.ts — **My Hotel(호텔 업그레이드)** 순수 로직 = 프레임워크 무관·불변·결정론.
 *
 * 스테이지1(blank_3) 의 호텔 오브젝트 5종(접수/벨카트/소파/꽃병/테이블)을 **레벨 1→5** 로 업그레이드한다.
 *   ⚠️ 디자이너가 blank_3 에 **각 오브젝트의 5개 레벨 노드를 전부 배치**(스택)하고 업그레이드 화살표(up_SC_UI_57)도 넣었다.
 *      → 게임은 **현재 레벨 노드만 보이고 나머지 레벨 노드는 숨긴다**(텍스처 스왑 X). 레벨/슬롯/화살표 매핑은
 *      레이아웃에서 **파싱**(키 `up_Stage001_BG_01_{레벨}-{슬롯}` + 화살표는 오브젝트 위치로 근접 매칭) → 디자이너 버전 변경에 견고.
 *   - 업그레이드 비용: 레벨이 오를수록 상승(100K → 5M). 보유 코인으로 지불.
 *   - My Hotel 화면 = 화살표 + 비용 표시 / 레이드·공격 스테이지 = 현재 레벨만(화살표 숨김).
 *
 * I/O(localStorage)·렌더는 씬이 담당 — 이 모듈은 상태/비용/레이아웃 파싱/직렬화만.
 *
 * ⭐비용은 **오브젝트 개별**(자기 레벨), 환급/해금은 **글로벌 시티레벨 L(=누적 업그레이드 수)** 함수(progression.ts SSOT).
 *   - 비용: cityCost(오브젝트레벨−1) 기하곡선 — **그 오브젝트의 레벨에만** 의존(요청 2026-06-29: 개별 가격, 하나 올려도
 *     다른 오브젝트 가격 불변). (이전엔 글로벌 cityCost(L) 트레드밀이라 어떤 걸 올려도 전 오브젝트 가격이 변했음.)
 *   - 환급(레벨업 시): hotelSpinGrant(L) 스핀 + incomeMultiplier(L) 코인획득 배수 + unlocksAt 해금(글로벌 누적 기준).
 */
import { cityCost, incomeMultiplier, hotelSpinGrant, unlocksAt } from './progression.js';

/** 오브젝트 최대 레벨(에셋 1-..5-). */
export const MAX_LEVEL = 5;

/**
 * ⭐호텔 스테이지(테마별 레이아웃, 2026-06-30) — 각 스테이지의 5개 시설을 Lv5 까지 올리면 **완성 → 보상 + 다음 스테이지**.
 *   스테이지마다 레이아웃 파일·오브젝트 키 스킴이 다르다(디자이너 명명):
 *     Stage1 = blank_3 (`up_Stage001_BG_01_{lv}-{slot}`) · Stage2 = blank_3_copy3 (`up_Stage002_Obj_0{lv}-{slot}`).
 *   두 레이아웃은 **노드 ID(배경 layer_1·타이틀·다이얼로그·화살표) 구조가 동일** → 씬 코드 공유.
 */
export interface HotelStageDef {
  readonly layoutKey: string;
  readonly layoutPath: string;
  readonly objKeyRe: RegExp; // 캡처 그룹 (level, slot)
}
export const HOTEL_STAGES: readonly HotelStageDef[] = [
  { layoutKey: 'hotel_stage1', layoutPath: 'ui/layouts/blank_3.json', objKeyRe: /^up_Stage001_BG_01_(\d)-(\d)(?:_v\d+)?$/ },
  { layoutKey: 'hotel_stage2', layoutPath: 'ui/layouts/blank_3_copy3.json', objKeyRe: /^up_Stage002_Obj_0(\d)-(\d)(?:_v\d+)?$/ },
];
export const STAGE_COUNT = HOTEL_STAGES.length;

/** 호텔 오브젝트 정의(스테이지1 좌상→하 순). 슬롯 = blank_3 키 `{lv}-{slot}` 의 slot(접수=1·카트=2·소파=3·꽃병=4·테이블=5). */
export interface HotelObject {
  readonly id: string; // 안정 식별자(영속/레벨 인덱스 순서)
  readonly name: string; // 표시명
  readonly slot: number; // 에셋 슬롯 1..5
}

export const HOTEL_OBJECTS: readonly HotelObject[] = [
  { id: 'reception', name: 'Information', slot: 1 },
  { id: 'bellcart', name: 'Bell Cart', slot: 2 },
  { id: 'sofa', name: 'Lounge Sofa', slot: 3 },
  { id: 'flowers', name: 'Flower Stand', slot: 4 },
  { id: 'table', name: 'Coffee Table', slot: 5 },
];

// ── 레이아웃(blank_3) 파싱 ──

/** 파싱에 필요한 최소 노드 정보(LayoutNode 의 부분집합). */
export interface LayoutNodeLike {
  readonly id: string;
  readonly key?: string;
  readonly x: number;
  readonly y: number;
}

/** 한 슬롯의 레이아웃 정보 — 레벨1..5 노드 id(없으면 null) + 업그레이드 화살표 노드 id. */
export interface SlotLayout {
  readonly slot: number;
  readonly levelNodeIds: ReadonlyArray<string | null>; // [L1..L5]
  readonly arrowNodeId: string | null;
}

/** 업그레이드 화살표 아이콘 키(디자이너). */
export const ARROW_KEY = 'up_SC_UI_57';

/**
 * 스테이지 레이아웃 노드들 → 슬롯별 레이아웃(레벨 노드 + 화살표). HOTEL_OBJECTS 순서로 반환.
 *   - 레벨 노드: **그 스테이지의 키 패턴**(HOTEL_STAGES[stage-1].objKeyRe)으로 (레벨, 슬롯) 추출.
 *   - 화살표: up_SC_UI_57 노드를 각 슬롯 앵커(최저레벨 노드) 위치에 **가장 가까운 것**으로 1:1 배정.
 *   stage = 1-based 현재 스테이지(레이아웃과 일치해야 함).
 */
export function parseHotelLayout(nodes: ReadonlyArray<LayoutNodeLike>, stage = 1): SlotLayout[] {
  const re = (HOTEL_STAGES[Math.max(0, Math.min(STAGE_COUNT - 1, stage - 1))] ?? HOTEL_STAGES[0]).objKeyRe;
  const levelsBySlot = new Map<number, Array<string | null>>();
  const anchorBySlot = new Map<number, { x: number; y: number; level: number }>();
  for (const n of nodes) {
    const m = re.exec(n.key ?? '');
    if (!m) continue;
    const level = Number(m[1]);
    const slot = Number(m[2]);
    if (level < 1 || level > MAX_LEVEL) continue;
    if (!levelsBySlot.has(slot)) levelsBySlot.set(slot, new Array(MAX_LEVEL).fill(null));
    levelsBySlot.get(slot)![level - 1] = n.id;
    const prev = anchorBySlot.get(slot);
    if (!prev || level < prev.level) anchorBySlot.set(slot, { x: n.x, y: n.y, level });
  }
  const arrows = nodes.filter((n) => n.key === ARROW_KEY).map((n) => ({ id: n.id, x: n.x, y: n.y }));
  const usedArrows = new Set<string>();
  return HOTEL_OBJECTS.map((o) => {
    const levelNodeIds = levelsBySlot.get(o.slot) ?? new Array<string | null>(MAX_LEVEL).fill(null);
    const anchor = anchorBySlot.get(o.slot);
    let arrowNodeId: string | null = null;
    if (anchor) {
      let best = Infinity;
      for (const a of arrows) {
        if (usedArrows.has(a.id)) continue;
        const d = (a.x - anchor.x) ** 2 + (a.y - anchor.y) ** 2;
        if (d < best) {
          best = d;
          arrowNodeId = a.id;
        }
      }
    }
    if (arrowNodeId) usedArrows.add(arrowNodeId);
    return { slot: o.slot, levelNodeIds, arrowNodeId };
  });
}

// ── 상태 ──

/** 호텔 상태 — 현재 스테이지(1-based) + 오브젝트별 현재 레벨(HOTEL_OBJECTS 순서, 각 1..MAX_LEVEL). 영속 대상. */
export interface HotelState {
  readonly stage: number;
  readonly levels: readonly number[];
}

/** 새 상태(스테이지1, 전부 레벨1). */
export function createHotelState(): HotelState {
  return { stage: 1, levels: HOTEL_OBJECTS.map(() => 1) };
}

/** 현재 스테이지(1-based, 1..STAGE_COUNT 클램프). */
export function currentStage(state: HotelState): number {
  const s = state.stage ?? 1;
  return s < 1 ? 1 : s > STAGE_COUNT ? STAGE_COUNT : s;
}

/** 현재 스테이지 레이아웃 정의(레이아웃 키/경로/키패턴). */
export function stageDef(state: HotelState): HotelStageDef {
  return HOTEL_STAGES[currentStage(state) - 1] ?? HOTEL_STAGES[0];
}

/** 현 스테이지의 모든 시설이 최고레벨인가(= 스테이지 완성). */
export function isStageComplete(state: HotelState): boolean {
  return HOTEL_OBJECTS.every((_o, i) => objectLevel(state, i) >= MAX_LEVEL);
}

/** 마지막 스테이지인가(더 넘어갈 곳 없음). */
export function isLastStage(state: HotelState): boolean {
  return currentStage(state) >= STAGE_COUNT;
}

/** 다음 스테이지로(레벨 전부 1 리셋). 마지막이면 그대로 반환. */
export function advanceStage(state: HotelState): HotelState {
  if (isLastStage(state)) return state;
  return { stage: currentStage(state) + 1, levels: HOTEL_OBJECTS.map(() => 1) };
}

/** 스테이지 완성 보상 — 완성한 스테이지(1-based)에 비례한 큰 코인 + 스핀 + 젬(보상 팝업 3종: 코인·스핀·젬). */
export interface StageReward {
  readonly coins: number;
  readonly spins: number;
  readonly gems: number;
}
/** ⭐스테이지 승급(다음 스테이지로) 시 지급할 **1회 고정 보상**(요청 2026-06-30 "정해진 숫자"). 스테이지 완성 = 전 시설 Lv5 =
 *  드문 마일스톤이라 한 방 보상. ⛔per-upgrade 기하 스핀 환급 폐지의 대체 = 여기 **정해진 코인+스핀+젬**만 지급(누적 폭주 없음).
 *  배열 인덱스 = 완성한 스테이지(1-based). 마지막 값 이후 스테이지는 마지막 값 유지(추후 스테이지 추가 시 배열만 연장). */
const STAGE_CLEAR_COINS: readonly number[] = [300_000, 800_000]; // ⭐2026-06-30: ÷10 리데노미네이션(3M/8M→300K/800K)
const STAGE_CLEAR_SPINS: readonly number[] = [300, 500];
const STAGE_CLEAR_GEMS: readonly number[] = [100, 200];
export function stageReward(stage: number): StageReward {
  const s = Math.max(1, Math.floor(stage));
  const i = Math.min(s, STAGE_CLEAR_COINS.length) - 1;
  return { coins: STAGE_CLEAR_COINS[i], spins: STAGE_CLEAR_SPINS[i], gems: STAGE_CLEAR_GEMS[i] };
}

/** 오브젝트 인덱스 → 현재 레벨(클램프). */
export function objectLevel(state: HotelState, index: number): number {
  const v = state.levels[index] ?? 1;
  return v < 1 ? 1 : v > MAX_LEVEL ? MAX_LEVEL : v;
}

/** 시티레벨 L = **스테이지 누적** 업그레이드 수 = (이전 스테이지들 완성분) + (현 스테이지 레벨합 − 오브젝트 수).
 *  스테이지가 넘어가도 누적되어 income·티어·해금 등 진행 보상이 리셋되지 않는다(스테이지당 0..N×(MAX−1)=20씩 증가). */
export function cityLevel(state: HotelState): number {
  const perStage = HOTEL_OBJECTS.length * (MAX_LEVEL - 1); // 5×4 = 20
  return Math.max(0, (currentStage(state) - 1) * perStage + (totalLevel(state) - HOTEL_OBJECTS.length));
}

/** 오브젝트 인덱스의 다음 레벨업 비용 — 최대면 null, 아니면 **그 오브젝트 자신의 레벨** 기준 개별 비용.
 *  ⭐개별 가격(요청 2026-06-29): 비용 = cityCost(자기레벨−1) → **해당 오브젝트의 레벨에만** 의존하므로
 *  다른 오브젝트를 올려도 이 오브젝트 가격은 불변(이전엔 글로벌 시티레벨 기반이라 하나 올리면 전부 변했음).
 *  보상/해금/티어(income·spinGrant·unlocks·impact)는 여전히 글로벌 cityLevel — 누적 진행 보상은 유지. */
export function nextCostFor(state: HotelState, index: number): number | null {
  const lv = objectLevel(state, index);
  if (lv >= MAX_LEVEL) return null;
  return cityCost(lv - 1);
}

/** 현재 시티레벨의 코인획득 배수 M(L)(코인 엔진에 곱). */
export function incomeMultiplierFor(state: HotelState): number {
  return incomeMultiplier(cityLevel(state));
}

/** 지금 한 칸 업그레이드하면 지급될 스핀 뭉치(현재 시티레벨 기준). */
export function upgradeSpinGrant(state: HotelState): number {
  return hotelSpinGrant(cityLevel(state));
}

/** 지금 업그레이드가 해금 이벤트를 넘기는가(시티레벨 +1 이 해금 주기). */
export function upgradeUnlocks(state: HotelState): boolean {
  return unlocksAt(cityLevel(state) + 1);
}

/** 업그레이드 가능 여부(최대 미만 + 코인 충분). */
export function canUpgrade(state: HotelState, index: number, coins: number): boolean {
  const cost = nextCostFor(state, index);
  return cost != null && coins >= cost;
}

/** 오브젝트 1레벨 업(불변). 최대면 그대로 반환. */
export function upgradeObject(state: HotelState, index: number): HotelState {
  const cur = objectLevel(state, index);
  if (cur >= MAX_LEVEL) return state;
  const levels = state.levels.slice();
  levels[index] = cur + 1;
  return { stage: state.stage, levels }; // ⭐stage 보존(멀티스테이지 — 업그레이드는 같은 도시 내)
}

/** 오브젝트 1레벨 다운(불변). 최솟값 1. */
export function downgradeObject(state: HotelState, objectIndex: number): HotelState {
  const cur = objectLevel(state, objectIndex);
  if (cur <= 1) return state;
  const levels = state.levels.slice();
  levels[objectIndex] = cur - 1;
  return { stage: state.stage, levels };
}

/** 전 오브젝트 레벨 합. */
export function totalLevel(state: HotelState): number {
  return HOTEL_OBJECTS.reduce((s, _o, i) => s + objectLevel(state, i), 0);
}

/** 코인/비용 K·M 축약 표기("100K"·"1.5M"·"5M"). */
export function formatCompact(n: number): string {
  const a = Math.max(0, Math.round(n));
  if (a >= 1_000_000) {
    const m = a / 1_000_000;
    return (Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)) + 'M';
  }
  if (a >= 1_000) {
    const k = a / 1_000;
    return (Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)) + 'K';
  }
  return String(a);
}

/** 직렬화(영속) — 스테이지 + 레벨. */
export function serializeHotel(state: HotelState): string {
  return JSON.stringify({ stage: state.stage, levels: state.levels });
}

/** 역직렬화 — 손상/형식불일치 시 null(씬은 새 상태 생성). 스테이지·레벨 범위 보정. */
export function deserializeHotel(json: string | null | undefined): HotelState | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as { stage?: unknown; levels?: unknown };
    if (!Array.isArray(o.levels)) return null;
    const arr = o.levels as unknown[];
    const levels = HOTEL_OBJECTS.map((_o, i) => {
      const v = arr[i];
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 1;
      return n < 1 ? 1 : n > MAX_LEVEL ? MAX_LEVEL : n;
    });
    const sr = typeof o.stage === 'number' && Number.isFinite(o.stage) ? Math.floor(o.stage) : 1;
    const stage = sr < 1 ? 1 : sr > STAGE_COUNT ? STAGE_COUNT : sr;
    return { stage, levels };
  } catch {
    return null;
  }
}

// ── 시설 이름·설치 비용 ──

/** 스테이지(1-based) → 시설 이름. 인덱스 0=Lobby(스테이지1) … Arcade(스테이지9). */
export const FACILITY_NAMES: readonly string[] = [
  'Lobby', 'Restaurant', 'Guest Rooms', 'Casino Hall',
  'VIP Lounge', 'Cocktail Bar', 'Poolside', 'Spa Center', 'Arcade',
];

/** 스테이지 완성 후 다음 시설 설치에 필요한 코인 비용.
 *  인덱스 = 완성 스테이지(1-based). [0]=미사용·[1]=Restaurant 설치(스테이지1 완성 후)·… */
export const FACILITY_INSTALL_COSTS: readonly number[] = [
  0,              // [0] 미사용
  2_000_000,      // [1] Restaurant
  5_000_000,      // [2] Guest Rooms
  12_000_000,     // [3] Casino Hall
  30_000_000,     // [4] VIP Lounge
  80_000_000,     // [5] Cocktail Bar
  200_000_000,    // [6] Poolside
  500_000_000,    // [7] Spa Center
  1_200_000_000,  // [8] Arcade
];

/** 완성 스테이지(1-based) → 다음 시설 설치 코인 비용. 마지막 스테이지 이후면 0. */
export function facilityInstallCost(completedStage: number): number {
  return FACILITY_INSTALL_COSTS[Math.max(0, Math.floor(completedStage))] ?? 0;
}

/** 완성 스테이지(1-based) → 다음 시설 이름. 없으면 null(마지막 스테이지 이후). */
export function nextFacilityName(completedStage: number): string | null {
  return FACILITY_NAMES[Math.floor(completedStage)] ?? null;
}

/** localStorage 영속 키. ⚠️v7(2026-06-30)=**1레벨 재설정**(요청 — 구 v6 폐기). 스테이지/레벨 전부 초기(Stage1·Lv1)로 시작.
 *  설정 → 데이터 편집의 '시설 업그레이드 리셋'으로 언제든 재초기화. */
export const HOTEL_SAVE_KEY = 'socialcasino_hotel_v7';
