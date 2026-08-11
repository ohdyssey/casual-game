/**
 * 레벨 설계 — 하이브리드 구조.
 *
 *  · 1~15: 손설계 온보딩. 메커니즘을 한 번에 하나씩 도입하고 튜토리얼 토스트로 안내한다.
 *      L1~2  기본 이동·매치(작은 보드)         L3~5  불판 해제(보드 성장)
 *      L6    전체 개방                          L7~9  고정 꼬치(📌)
 *      L10~  숯/방해 꼬치(🔥, 인접 매치로 제거)  L14~  2겹 숯
 *  · 16+: 절차 생성. Phase 별로 종류·목표·고정·숯을 완만히 키우고, 5의 배수 레벨은 버퍼를
 *      줄여(재료 빡빡) 변주를 준다. 13레벨 이후 정체되던 기존 커브 문제를 해소.
 *
 * 난이도 레버(가장 강한 것부터): 종류 수 > 목표 > 고정/숯 개수 > 버퍼(여유) > 제한 시간 > 보드 크기.
 * 모든 생성은 시드 기반 결정적(테스트 가능).
 */
import type { BoardState, GrillState, ItemType, LevelCfg, Rng } from './types.js';
import { SLOT_COUNT, makeRng, neighborsOf, shuffled } from './board.js';

export const GRID_COLS = 3;
export const GRID_ROWS = 4;
export const GRILL_COUNT = GRID_COLS * GRID_ROWS;
export const ITEM_TYPE_COUNT = 31;

/** 12칸 전체 활성(기본 보드). */
const FULL_LAYOUT: number[] = Array.from({ length: GRILL_COUNT }, (_, i) => i);

/** 시각 마스크(행=3칸 문자열, '#'=그릴 있음, 그 외=빈 테이블)를 활성 셀 인덱스로. */
function maskLayout(rows: string[]): number[] {
  const out: number[] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < GRID_COLS; c++) if (row[c] === '#') out.push(r * GRID_COLS + c);
  });
  return out;
}

/**
 * 보드 모양 변주 — 다 자란 보드(12칸)에서 구멍/이형 배치. 모두 3열×4행 마스크('#'=그릴).
 * 이동은 인접이 아니라 전역 드래그라 모양이 이동을 막지 않는다(숯 냉각만 인접 필요 →
 * 인접쌍이 없는 모양은 generateBoard 가 숯을 자동으로 0개 배치해 안전).
 */
const SHAPES: ReadonlyArray<ReadonlyArray<number>> = [
  maskLayout(['#.#', '###', '###', '#.#']), // 10 모서리 컷
  maskLayout(['###', '#.#', '#.#', '###']), // 10 링(가운데 통로)
  maskLayout(['.#.', '###', '###', '.#.']), // 8  다이아몬드
  maskLayout(['###', '###', '#.#', '#.#']), // 10 아래 갈래
  maskLayout(['#.#', '###', '#.#', '###']), // 9  체크
  maskLayout(['.##', '###', '###', '##.']), // 10 어긋난 사각
  maskLayout(['###', '###', '###', '.#.']), // 10 T
  maskLayout(['.#.', '###', '###', '###']), // 10 역T
  maskLayout(['##.', '###', '###', '.##']), // 10 S
  maskLayout(['###', '.#.', '###', '###']), // 10 모래시계 변형
];

/**
 * 그리드 맨 위 n칸(낮은 인덱스)을 잠근다 — 활성 그릴은 아래쪽에서 시작하고, 레벨이 오르면
 * 위 칸이 하나씩 열려 **추가 그릴이 상단에 배치**된다(아래→위 성장). 잠긴 칸은 🔒Lv 표시.
 */
function lockTop(n: number): number[] {
  return Array.from({ length: Math.max(0, Math.min(GRILL_COUNT, n)) }, (_, i) => i);
}

// ── 혼동 방지 + 최대 다양성: 유사 꼬치를 피하고, 한 판의 '색 계열'까지 최대한 흩뿌린다 ──────
//
// 문제: 연속 인덱스 선택은 번호가 가까운 유사 디자인을 늘 같이 냈다. 패밀리(거의 동일 디자인)만
//   막으면 '넓은 색 계열'(붉은 여럿·노란 여럿)이 여전히 한 판에 몰려 헷갈릴 수 있다.
// 해법(2단계):
//   ① 패밀리(FAMILY) = 거의 동일한 꼬치 묶음 → 한 판에 **최대 1개**(near-dup 절대 공존 금지).
//   ② 색 그룹(COLOR_GROUP) = 패밀리를 넓은 색 계열로 묶음 → 종류를 색 그룹 **라운드로빈**으로 뽑아
//      한 판에 색이 최대한 겹치지 않게 한다(종류 ≤ 색 그룹 수면 전부 다른 색, 그 이상이면 최소 편중).
//   레벨(lv)로 시작 색 그룹·패밀리·멤버를 모두 회전 → 연속 레벨 변주 + 300레벨에 31종 고른 노출.
//
// 최하위 배열 = 서로 혼동되는 꼬치(GK_Item 인덱스). 길이 1 = 고유 디자인 싱글턴.
export const COLOR_GROUPS: ReadonlyArray<ReadonlyArray<ReadonlyArray<ItemType>>> = [
  [[3, 28], [13, 14], [22]], //           붉은/분홍 (삼겹·베이컨 / 토마토 / 오징어)
  [[5, 6, 18]], //                         주황 (매운 양념·새우·소시지)
  [[1, 11, 15], [17, 21], [20, 26], [10]], // 노랑/금빛 (두부블록 / 콘도그·토스트 / 파인애플·옥수수 / 피자)
  [[9, 23, 25, 27]], //                    초록 (구운채소·베이컨말이·피망)
  [[2, 8, 12, 24], [30]], //               갈색/베이지 (미트볼·버섯·큐브 / 킹느타리)
  [[7], [31]], //                          흰/연한 (관자 / 팽이)
  [[29]], //                               보라 (가지)
  [[4], [16], [19]], //                    멀티컬러 (레인보우 / 믹스 / 모둠)
];

/** 근접 중복 판정용 평탄화 패밀리 목록(테스트/불변식). 색 그룹 순서대로 나열. */
export const FAMILIES: ReadonlyArray<ReadonlyArray<ItemType>> = COLOR_GROUPS.flat();

/**
 * 레벨 종류 풀 — 색 그룹을 라운드로빈으로 순회하며 그룹당 패밀리 1개씩 뽑는다.
 *   · 종류 ≤ 색 그룹 수(8) 이면 전부 다른 색 → 최대 다양성. 그 이상이면 색 편중을 최소로 분산.
 *   · 한 패밀리는 한 판에 최대 1회 → near-dup(거의 동일 디자인) 절대 공존 금지.
 *   · 시작 그룹·패밀리 순서·패밀리 내 멤버를 lv 로 회전 → 변주 + 300레벨에 걸쳐 31종 전부 사용.
 */
function makeTypePool(count: number, lv: number): ItemType[] {
  const C = COLOR_GROUPS.length;
  const totalFamilies = COLOR_GROUPS.reduce((s, g) => s + g.length, 0);
  const n = Math.min(Math.max(0, count), totalFamilies); // 종류 ≤ 총 패밀리 수(중복 방지 보장)
  const gStart = (lv - 1) % C; // 시작 색 그룹 회전
  // 색 그룹별 패밀리 방문 순서를 lv 로 회전(연속 레벨이 다른 패밀리 조합).
  const famOrder = COLOR_GROUPS.map((g) => g.map((_, i) => g[(i + lv) % g.length]));
  const cursor = new Array<number>(C).fill(0);
  const out: ItemType[] = [];
  while (out.length < n) {
    for (let k = 0; k < C && out.length < n; k++) {
      const gi = (gStart + k) % C;
      const fams = famOrder[gi];
      if (cursor[gi] >= fams.length) continue; // 이 색 그룹은 더 뽑을 패밀리 없음
      const fam = fams[cursor[gi]++];
      out.push(fam[(lv - 1) % fam.length]); // 패밀리 내 멤버(아이템) 회전
    }
  }
  return out;
}

// ── 300레벨 난이도 커브(총 600 설계 중 우선 300) ──────────────────────────────
// 모든 레버가 레벨에 따라 미세하게 상승하고, clampForSolvability 가 마지막에 "항상 풀 수 있게" 보정한다.
//   저레벨: 그릴이 적고(하단 잠금=🔒Lv 표시) 종류·목표 작음 → 쉬움.
//   레벨↑: 그릴이 하나씩 열려 최대 12칸, 종류·목표·고정·숯·시간압박·이형 보드가 완만히 증가.
/** 우선 구현하는 레벨 수(이후 600까지 확장 예정). */
export const MAX_LEVEL = 300;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 활성 그릴 수 — **최소 9칸**에서 시작해 **20레벨마다 +1**, L61에 12칸(만석).
 * 저레벨=상단에 잠금 그릴(🔒Lv), 레벨↑=상단부터 하나씩 열려 그릴이 늘어남.
 */
function activeGrills(lv: number): number {
  return clamp(9 + Math.floor((lv - 1) / 20), 9, GRILL_COUNT);
}
/** 종류 수(레벨 기준) — 성장기 4→9(L24), 이후 16까지 완만. 실제론 levelConfig 에서 보드 크기로 재상한. */
function typesFor(lv: number): number {
  const base = lv <= 24 ? 4 + Math.floor((lv - 1) / 4) : 9 + Math.floor((lv - 24) / 15);
  return clamp(base, 4, 16);
}
/** 목표 세트(3개 묶음) — 4→24 완만(레벨당 서빙 수). */
function setsFor(lv: number): number {
  return clamp(4 + Math.floor((lv - 1) / 9), 4, 24);
}
/** 제한 시간 — 목표에 비례(넉넉)하되 레벨이 오를수록 점점 더 조인다(후반 시간압박). */
function timeFor(lv: number, target: number): number {
  return clamp(Math.round(target * 2.7) + 25 - Math.min(70, Math.floor((lv - 1) / 5)), 90, 240);
}
/** 고정 꼬치(메뉴고정) 수 — 초반엔 없음. L25 도입, ~25레벨마다 +1(최대 4). clamp 가 보드 대비 재보정. */
function pinnedFor(lv: number): number {
  return lv < 25 ? 0 : clamp(1 + Math.floor((lv - 25) / 25), 1, 4);
}
/** 숯 꼬치(메뉴 빈곳) 수 — 초반엔 없음. L45 도입, ~30레벨마다 +1(최대 4). clamp 가 보드 대비 재보정. */
function charredFor(lv: number): number {
  return lv < 45 ? 0 : clamp(1 + Math.floor((lv - 45) / 30), 1, 4);
}
/** 숯 단계 — 고레벨(L110+)에서 2겹(인접 매치 2번 필요). */
function charLevelFor(lv: number): number {
  return lv >= 110 ? 2 : 1;
}
/** 보드 배치 — 다 자란 뒤(12칸)엔 5레벨마다 이형 모양, 그 외엔 하단 잠금으로 성장. */
function layoutFor(lv: number): { layout: number[]; lockN: number } {
  const active = activeGrills(lv);
  if (active >= GRILL_COUNT && lv % 5 === 0) {
    return { layout: [...SHAPES[Math.floor(lv / 5) % SHAPES.length]], lockN: 0 };
  }
  return { layout: [...FULL_LAYOUT], lockN: GRILL_COUNT - active };
}

/** 신규 메커니즘 첫 등장 안내(해당 레벨에서 1회 토스트). */
const TUTORIALS: Record<number, string> = {
  1: '같은 꼬치 3개를 한 불판에 모으면 서빙! 드래그해서 옮겨요.',
  21: '새 불판이 열렸어요! 레벨이 오르면 위쪽에 불판이 하나씩 늘어나요 🔓',
  25: '📌 고정 꼬치는 뺄 수 없어요 — 같은 꼬치 2개를 가져와 완성!',
  45: '🔥 탄 꼬치는 옆 불판에서 매치하면 구워져 사라져요!',
  110: '탄 꼬치가 두 겹! 인접 매치를 두 번 내야 없어져요.',
  125: '불판 배치가 바뀌어요 — 모양이 다른 판도 나옵니다.',
};

/**
 * 해결가능성 보정(SSOT 안전장치) — 모든 레벨 cfg 에 마지막으로 적용해 "구조적으로 못 푸는" 판을 막는다.
 *
 * 배경(시뮬레이션으로 확인): 방해 요소가 활성 칸 수 대비 과하면 승리 불가 보드가 나온다.
 *   · 숯 그릴은 슬롯2가 영구히 막혀 **자기 그릴에선 절대 매치 불가**(인접 매치로만 냉각) → 매치 가능한
 *     그릴은 "숯이 아닌 그릴"뿐. 숯이 많을수록 매치 공간이 급감.
 *   · 고정 그릴은 슬롯0 이 항상 점유 → 작업 공간 감소(단, 고정 종류로는 매치 가능).
 *   · 8칸짜리 작은 보드에 숯4+고정4 → 여유 그릴 0 → 자주 교착/승리불가.
 *
 * 규칙: 활성(플레이 가능) 칸 수 대비 숯 ≤ 25%, 고정 ≤ 33%, 그리고 "숯도 고정도 아닌 자유 그릴"을
 *   최소 MIN_FREE 개 남긴다(작업/셔플 공간). 방해가 빽빽하면 버퍼(여유 재료)를 1세트 더 준다.
 */
function clampForSolvability(cfg: LevelCfg): LevelCfg {
  const playable = Math.max(1, cfg.layout.length - cfg.lockedGrills.length);
  const minFree = Math.max(2, Math.floor(playable / 4));
  let charred = Math.min(cfg.charredCount, Math.floor(playable / 4)); // 숯 ≤ 25%
  let pinned = Math.min(cfg.pinnedCount, Math.floor(playable / 3)); // 고정 ≤ 33%
  // 자유 그릴 최소 확보: (숯+고정) ≤ 플레이가능 − MIN_FREE. 초과분은 고정 → 숯 순으로 줄인다.
  let over = charred + pinned - (playable - minFree);
  while (over > 0) {
    if (pinned > 0) pinned--;
    else if (charred > 0) charred--;
    else break;
    over--;
  }
  return { ...cfg, charredCount: charred, pinnedCount: pinned };
}

export function levelConfig(level: number): LevelCfg {
  const lv = clamp(Math.floor(level) || 1, 1, MAX_LEVEL);
  const { layout, lockN } = layoutFor(lv);
  const playable = layout.length - lockN;
  // 종류 수 상한 — ① 보드 크기(작은 보드에 종류 과다 방지) ② 세트 수(종류 > 세트면 재료가
  //   목표를 초과 생성됨 → 항상 종류 ≤ 세트로 캡). 둘 중 작은 값.
  const types = Math.min(typesFor(lv), playable + 4, setsFor(lv));
  const target = setsFor(lv) * SLOT_COUNT;
  const base: LevelCfg = {
    level: lv,
    typePool: makeTypePool(types, lv),
    targetSkewers: target,
    timeSec: timeFor(lv, target),
    initialPerGrill: 2,
    layout,
    lockedGrills: lockTop(lockN),
    pinnedCount: pinnedFor(lv),
    charredCount: charredFor(lv),
    charLevel: charLevelFor(lv),
    tutorial: TUTORIALS[lv],
  };
  return clampForSolvability(base);
}

/**
 * 종류별 세트(3개 묶음)를 배분해 전체 꼬치 멀티셋 생성 — 모든 종류 ≥1세트, **합계 = 목표(정확히)**.
 * 잉여 재료를 만들지 않는다("남는 음식 0" 요구) → 총량이 목표와 같아 전량 서빙 시 남는 꼬치가 없다.
 * (맨 마지막 자유 3개는 GrillScene.autoFinish 가 자동 3매치로 마무리한다.)
 */
function buildItemPool(cfg: LevelCfg, rng: Rng): ItemType[] {
  const totalSets = cfg.targetSkewers / SLOT_COUNT;
  // 종류가 세트 수보다 많으면 세트 수만큼만 사용 — 총량 = totalSets×3 유지(과잉 생성 방지).
  const used = shuffled(cfg.typePool, rng).slice(0, totalSets);
  const setsPerType = new Map<ItemType, number>(used.map((t) => [t, 1]));
  for (let i = used.length; i < totalSets; i++) {
    const t = used[Math.floor(rng() * used.length)];
    setsPerType.set(t, (setsPerType.get(t) ?? 0) + 1);
  }
  const items: ItemType[] = [];
  for (const [t, sets] of setsPerType) for (let i = 0; i < sets * SLOT_COUNT; i++) items.push(t);
  return shuffled(items, rng);
}

/**
 * 레벨 보드 생성 — 잠금/고정/숯을 cfg 대로 배치. 시드가 같으면 같은 보드.
 * 규칙:
 *  · 숯 그릴: 오른쪽 슬롯(2번)을 숯이 점유(빈 슬롯은 항상 앞쪽 prefix 유지 → 리필 순서 단순).
 *    빈 슬롯을 1칸 남기려 초기 꼬치는 1개만.
 *  · 고정 그릴: 초기 꼬치 중 0번 슬롯을 고정.
 *  · 숯·고정 그릴은 서로 겹치지 않게 선정.
 */
export function generateBoard(cfg: LevelCfg, seed: number): BoardState {
  const rng = makeRng(seed);
  const items = buildItemPool(cfg, rng);

  const active = new Set(cfg.layout);
  const lockedSet = new Set(cfg.lockedGrills);
  const playableIds = [...active].filter((i) => !lockedSet.has(i)).sort((a, b) => a - b);

  // 숯/고정 그릴 선정(겹치지 않게, 결정적).
  const order = shuffled(playableIds, rng);
  /** 매치 가능한(활성 + 잠기지 않은) 직교 인접 그릴 — 숯 냉각/배치 판정용. */
  const usableNbrs = (id: number): number[] =>
    neighborsOf(id, GRILL_COUNT).filter((n) => active.has(n) && !lockedSet.has(n));
  // 숯 후보: 인접이 있는 칸을 "인접 많은(내부) 칸" 우선 정렬(동률은 시드 셔플 순) → 코너(인접1) 회피.
  const charCandidates = [...order]
    .filter((id) => usableNbrs(id).length >= 1)
    .sort((a, b) => usableNbrs(b).length - usableNbrs(a).length);
  const wantChar = Math.min(cfg.charredCount, charCandidates.length);
  const charredGrills = new Set<number>();
  for (const id of charCandidates) {
    if (charredGrills.size >= wantChar) break;
    const nbrs = usableNbrs(id);
    // 냉각 가능(숯 아닌 인접 존재) + 이미 숯인 인접의 "마지막 자유 인접"을 뺏지 않을 때만 숯으로.
    const selfClearable = nbrs.some((n) => !charredGrills.has(n));
    const strandsNeighbor = nbrs.some(
      (n) => charredGrills.has(n) && usableNbrs(n).every((x) => x === id || charredGrills.has(x)),
    );
    if (selfClearable && !strandsNeighbor) charredGrills.add(id);
  }
  const pinnedPool = order.filter((id) => !charredGrills.has(id));
  const pinnedCount = Math.min(cfg.pinnedCount, pinnedPool.length);
  const pinnedGrills = new Set(pinnedPool.slice(0, pinnedCount));

  const slotsById = new Map<number, (ItemType | null)[]>();
  const queueById = new Map<number, ItemType[]>();
  const pinnedById = new Map<number, boolean[]>();
  const charById = new Map<number, number[] | undefined>();
  for (const id of playableIds) {
    slotsById.set(id, [null, null, null]);
    queueById.set(id, []);
    charById.set(id, charredGrills.has(id) ? [0, 0, cfg.charLevel] : undefined);
  }

  // 초기 배치 — 그릴당 initialPerGrill(숯 그릴은 빈 칸 1개 남기려 1개), 슬롯 0,1 순.
  //   ⚠️ 고정(pinned)은 **종류 유일**하게만 건다. 같은 종류를 두 그릴에 고정하면(특히 잉여 0 설계라
  //   그 종류가 1세트=3개뿐이면) 고정 2 + 자유 1 → 한 그릴에 3개를 못 모아 **영구 서빙 불가**(해결 불가
  //   레벨). 종류당 고정 1개면 자유가 ≥2 남아 그 고정 그릴에서 항상 완성된다.
  const pinnedTypes = new Set<ItemType>();
  let cursor = 0;
  for (const id of playableIds) {
    const want = charredGrills.has(id) ? Math.min(cfg.initialPerGrill, 1) : cfg.initialPerGrill;
    const slots = slotsById.get(id) as (ItemType | null)[];
    for (let s = 0; s < want && cursor < items.length; s++) slots[s] = items[cursor++];
    const t0 = slots[0];
    if (pinnedGrills.has(id) && t0 !== null && !pinnedTypes.has(t0)) {
      pinnedById.set(id, [true, false, false]);
      pinnedTypes.add(t0);
    }
  }

  // 나머지 → 큐 라운드로빈. ⚠️고정 그릴은 슬롯0 고정 탓에 "빈 그릴"이 되지 못해 리필이 걸리지
  //   않는다(refillEmptyGrills 는 슬롯이 완전히 빈 그릴만 채움) → 고정 그릴 큐의 꼬치는 그 고정을
  //   완성하기 전까지 갇혀 순환 불가. 그 갇힌 꼬치가 바로 그 고정 완성에 필요하면 영구 교착(승리 불가).
  //   따라서 큐는 "고정이 아닌" 그릴(자유·숯 — 둘 다 완전히 비울 수 있어 리필 순환됨)에만 분배한다.
  const queueTargets = playableIds.filter((id) => !pinnedGrills.has(id));
  const qids = queueTargets.length > 0 ? queueTargets : playableIds;
  let qi = 0;
  while (cursor < items.length) {
    const id = qids[qi % qids.length];
    (queueById.get(id) as ItemType[]).push(items[cursor++]);
    qi++;
  }

  const grills: GrillState[] = Array.from({ length: GRILL_COUNT }, (_, id) => {
    // 활성 아님(빈 테이블) 또는 잠김 → 비활성 그릴(로직은 잠금처럼 건너뜀, 씬은 모양에 따라 렌더).
    if (!active.has(id) || lockedSet.has(id)) return { id, locked: true, slots: [null, null, null], queue: [] };
    return {
      id,
      locked: false,
      slots: slotsById.get(id) as (ItemType | null)[],
      queue: queueById.get(id) as ItemType[],
      pinned: pinnedById.get(id),
      char: charById.get(id),
    };
  });
  return { grills, served: 0, dishes: 0 };
}
