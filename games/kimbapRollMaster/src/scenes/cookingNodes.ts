/**
 * cookingNodes.ts — 에디터 레이아웃 노드 ↔ 조리 역할 매핑.
 *
 * 노드 id 문자열을 코드에 직접 쓰지 않는다는 규약(CLAUDE.md)에 따라
 * 하네스 생성물 `.pue-harness/generated/screens.js` 의 상수만 참조한다.
 * 좌표·크기도 코드에 적지 않고 런타임에 레이아웃 노드에서 읽는다.
 */
import type Phaser from 'phaser';
import { NODES } from '../../.pue-harness/generated/screens.js';
import type { LayoutIndex, LayoutObject } from '../ui/layoutLoader.js';

const M = NODES.MAIN_COPY3;
const C = NODES.MAIN_COPY;
const R1 = NODES.MAIN_COPY2;
const R2 = NODES.MAIN_COPY2_COPY;
const S = NODES.MAIN_COPY2_COPY2;

/** 조리 역할 → 노드 id. */
export const NODE = {
  /** 조리대 중앙에 깔리는 대나무발 */
  mat: M.LAYER_3,
  /** 발 위에 깔리는 김 */
  nori: M.LAYER_4,
  /** 고르게 편 밥(마스크로 점진 노출) */
  rice: M.LAYER_5,
  /** 도구 — 좌측 밥통(밥덩이 공급) */
  ricePot: M.LAYER_7,
  /**
   * 밥통에 꽂힌 **밥주걱** — 밥통을 누르면 이것이 밥을 퍼서 김 위로 옮긴다(`riceHands.RiceScoop`).
   * ⚠️ 이 자리(`layer_6`)는 예전에 상단 도구 칼이 쓰던 id 다. 칼은 에디터에서 삭제됐고 지금은 주걱이다.
   */
  scoop: M.LAYER_6,
  /** 도구 — 좌측 여분 대나무발 */
  matSupply: M.LAYER_8,
  /** 도구 — 우측 여분 김 */
  noriSupply: M.LAYER_9,
  /** 상단 — 참기름 */
  oil: M.LAYER_10,
  /** 상단 — 깨소금 */
  sesame: M.LAYER_10_COPY,
  /** 서빙 호출 종(CALL) — 다 썰어야 켜진다 */
  bell: M.LAYER_12,
  /** 스테이지 시계 — 분침 한 바퀴가 3분(`logic/stage.ts`) */
  stageClock: M.LAYER_22,
  /** 그 분침. 아래 끝을 축으로 돈다 */
  stageHand: M.LAYER_23,
  /** 시계 아래 명판에 저작된 처리량 텍스트(`0 / 10`) */
  stageCount: M.LAYER_24,
  /**
   * **미션 보상 누적**이 뜨는 저작 텍스트 — 보라색 왕관 프레임(`up_UI_10`) 안이다.
   * ⚠️⚠️ 코드가 배경을 따로 그리지 말 것. 예전에는 여기에 **둥근 판을 하나 더 깔아** 보라색 프레임
   *    위에 회색 알약이 겹쳐 보였다 — 저작 프레임이 곧 배경이다.
   */
  money: M.LAYER_29_COPY,
  /** 좌상단 **레벨 숫자** — 보라색 배지(`up_UI_09`) 안의 저작 텍스트. */
  level: M.LAYER_29,
  /**
   * 메뉴 카드 **첫 장** — 크기·부품 배치의 본보기다(`CARD_PART` 가 이 카드 기준으로 읽힌다).
   * 두 자리 모두 저작돼 있다 → `CARD_SLOT_NODES`.
   */
  menuSlotFocus: M.LAYER_16,
  customer1: M.LAYER_14,
  customer2: M.LAYER_15,
  handLeft: M.LAYER_17,
  handRight: M.LAYER_17_COPY,
} as const;

/**
 * 메뉴 카드에 저작된 구성 요소 — **시계 · 김밥 그림 · 이름**뿐이다.
 * 카드는 두 장인데 **저작은 한 장에만** 돼 있고 레이아웃이 평면 구조(부모-자식 없음)라,
 * 여기 노드들은 "카드 크기 대비 어디에 무엇이 온다"는 **본보기**로만 읽고
 * 실제 표시는 카드마다 새로 만든다(`menuCards.ts`).
 *
 * ⚠️ **필수/금지는 카드에 띄우지 않는다.** 조리대 오른쪽 레시피 판이 그 일을 맡는다(`RECIPE_NODE`) —
 * 같은 것을 두 군데에 그리면 눈이 갈라지고, 카드가 좁아 글자도 작아진다.
 */
export const CARD_PART = {
  clock: M.LAYER_20,
  icon: M.LAYER_21,
  name: M.LAYER_20_COPY,
  /** 카드 위쪽에 걸리는 **주문 경로 엠블럼** — 현장·전화·앱 세 종류를 코드가 갈아 끼운다. */
  badge: M.LAYER_13,
  /**
   * **몇 줄 받았나**(`×2`) — 김밥 그림 오른쪽. 카드를 다시 누를수록 올라간다.
   * ×1 일 때는 감춘다(평범한 주문에 군더더기를 붙이지 않는다).
   */
  rolls: M.LAYER_26,
} as const;

export const CARD_PART_NODES: readonly string[] = Object.values(CARD_PART);

/** 카드 두 장의 **자리** — 둘 다 저작돼 있다(크기·높이·x 를 그대로 쓴다). */
export const CARD_SLOT_NODES: readonly string[] = [M.LAYER_16, M.LAYER_16_COPY];

/**
 * 카드 자리 위쪽으로 **엠블럼까지 덮는 여유** — 이 안에 있는 저작 노드는 전부 카드 장식으로 본다.
 * 엠블럼은 카드 윗변보다 조금 위에 걸려 있어서 슬롯 사각형만으로는 잡히지 않는다.
 */
export const CARD_ZONE_TOP_PAD = 0.45;

/**
 * 감춰야 할 **저작 카드 노드**를 찾아낸다 — 카드 자리 안에 들어 있는 것은 전부.
 *
 * ⚠️⚠️ **이름으로 목록을 적어 두면 반드시 새어 나간다.** 디자이너가 둘째 카드를 그리면서
 * 판(`layer_16_copy`) · 엠블럼 · 시계 · 그림 · 이름을 하나씩 늘렸고, 그때마다 목록에서 빠진 것이
 * **저작된 채로 화면에 남아** 「프레임 없는 카드」로 보였다. 그래서 이름이 아니라 **자리로** 판단한다.
 * 카드는 코드가 만들어 쓰므로, 카드 자리 안의 저작 노드는 예외 없이 감춰도 된다.
 */
export function authoredCardNodes(layout: LayoutIndex): readonly string[] {
  const zones = CARD_SLOT_NODES.map((id) => designRect(layout, id)).filter((r): r is DesignRect => !!r);
  const decorates = (n: { x: number; y: number; w?: number; h?: number }): boolean =>
    zones.some(
      (z) =>
        // ⚠️⚠️ **카드보다 큰 것은 카드 장식이 아니다.** 자리만 보고 감췄더니 화면 전체를 덮는
        //    새 배경(1109×1479)이 하필 중심이 카드 안에 들어와 **통째로 사라졌다.**
        //    카드 장식은 판(=자리 크기)·엠블럼·글자뿐이라 전부 카드보다 작거나 같다.
        (n.w ?? 0) <= z.w * 1.02 &&
        (n.h ?? 0) <= z.h * 1.02 &&
        Math.abs(n.x - z.cx) <= z.w / 2 &&
        n.y >= z.cy - z.h / 2 - z.h * CARD_ZONE_TOP_PAD &&
        n.y <= z.cy + z.h / 2,
    );
  const found = layout.doc.nodes.filter(decorates).map((n) => n.id);
  return [...new Set([...CARD_SLOT_NODES, ...CARD_PART_NODES, ...found])];
}

/**
 * 조리대 **오른쪽 판 = 레시피**. 고른 주문을 그대로 받아 적는다 —
 * 위에서부터 **메뉴**(김밥 단면 + 흰 글씨) · **필수**(재료 그림 + 초록 글씨) · **금지**(재료 그림 + 빨간 글씨).
 * 재료를 고르는 진열 바로 옆이라 조건을 보려고 화면 위 카드까지 올려다볼 일이 없다.
 *
 * ⚠️ 판 배경은 조리대 그림(`up_KBRM_BG_02`)에 그려져 있어 **별도 노드가 없다.**
 * 여기 여섯 노드는 그 판 위에 얹힌 내용물이고, **자리·크기는 전부 저작이 정한다** —
 * 코드는 그림(텍스처)과 글자만 갈아 끼운다. 옮기고 싶으면 에디터에서 노드를 옮기면 된다.
 *
 * ⚠️ 「필수」·「금지」라는 글자는 없다 — **글자색이 곧 조건**이다(초록 = 넣어야 함, 빨강 = 넣으면 안 됨).
 * 저작 색을 그대로 쓰므로 코드에 색을 적지 않는다.
 */
export const RECIPE_NODE = {
  menuIcon: M.LAYER_21_COPY,
  menuName: M.LAYER_19_COPY14,
  requiredIcon: M.LAYER_18_COPY13,
  requiredName: M.LAYER_19_COPY13,
  forbiddenIcon: M.LAYER_18_COPY14,
  forbiddenName: M.LAYER_19_COPY12,
} as const;

export const RECIPE_NODES: readonly string[] = Object.values(RECIPE_NODE);

/** 마무리(참기름·깨소금)가 금지로 걸렸을 때 레시피에 띄울 그림 — 상단 도구 노드에서 텍스처를 빌린다. */
export const SEASONING_ART_NODE: Record<'oil' | 'sesame', string> = {
  oil: NODE.oil,
  sesame: NODE.sesame,
};

/**
 * 하단 진열 — **자리는 저작이 정하고, 거기 무엇을 담을지는 코드가 정한다.**
 *
 * ⚠️⚠️ 예전에는 「재료 12종 = 노드 12개」로 **재료마다 제 자리가 박혀** 있었다. 지금은 재료가 23종인데
 * 저작된 칸은 그대로 12개뿐이라, **칸이 먼저이고 재료는 판마다 갈아 끼운다**(`logic/stageTray.ts`).
 * 그래서 아래 배열의 키는 재료가 아니라 **자리 번호**다 — 0~5 가 윗줄, 6~11 이 아랫줄이며 **왼쪽부터**다.
 *
 * 자리를 옮기고 싶으면 **에디터에서 아이콘과 이름표를 함께 옮기면 된다.** 무엇이 담기는지는
 * `stageTray` 가 정하고, 그림·이름은 코드가 갈아 끼운다(`scenes/trayStacks.ts`).
 */
export const TRAY_SLOT_ART: readonly string[] = [
  // 윗줄(y≈1810) — 왼쪽부터
  M.LAYER_18_COPY, M.LAYER_18_COPY2, M.LAYER_18_COPY3, M.LAYER_18_COPY4, M.LAYER_18_COPY5, M.LAYER_18_COPY6,
  // 아랫줄(y≈2042) — 왼쪽부터
  M.LAYER_18_COPY7, M.LAYER_18_COPY8, M.LAYER_18_COPY9, M.LAYER_18_COPY10, M.LAYER_18_COPY11, M.LAYER_18_COPY12,
];

/** 자리 → 이름표(그림 바로 아래). ⚠️ 저작 노드 번호가 자리 순서와 어긋나 있어 **위치로 맞춰 적었다.** */
export const TRAY_SLOT_LABEL: readonly string[] = [
  M.LAYER_19, M.LAYER_19_COPY, M.LAYER_19_COPY2, M.LAYER_19_COPY4, M.LAYER_19_COPY5, M.LAYER_19_COPY7,
  M.LAYER_19_COPY6, M.LAYER_19_COPY3, M.LAYER_19_COPY9, M.LAYER_19_COPY8, M.LAYER_19_COPY10, M.LAYER_19_COPY11,
];

/** 하단 재료 진열판 전체 — 튜토리얼이 진열을 통째로 비출 때 쓴다. */
export const TRAY_PANEL_NODE = M.LAYER_11_COPY7;

/** 자리 → 탭 대상. 아이콘이 넉넉히 커서 그림 자체를 누르면 된다. */
export const TRAY_SLOT_HIT: readonly string[] = TRAY_SLOT_ART;




/**
 * 김 위에 눕히는 재료 스트립의 **본보기** 노드 — 저작된 세 줄 중 맨 아래(단무지).
 * 길이·굵기·맨 아랫줄 높이를 여기서 읽고, 실제 스트립은 코드가 재료 수만큼 만든다.
 * ⚠️ 새 화면의 스트립은 **이미 가로로 누워 있다**(옛 화면은 세로 그림을 90° 돌려 썼다).
 */
export const STRIP_SAMPLE_NODE = M.LAYER_11;
/** 저작된 스트립 세 줄 — 본보기 위에 겹쳐 둔 나머지는 감춘다. */
export const STRIP_SAMPLE_EXTRA_NODES: readonly string[] = [M.LAYER_11_COPY, M.LAYER_11_COPY2];

/** 스트립은 김 위(6·7) 와 말린 부분(27) 사이에 온다. */
export const STRIP_DEPTH = 19;

/** 밥을 문지르는 흰 손 — 밥·밥덩이(7 언저리)보다는 위, 진열 체크(60)보다는 아래. */
export const SPREAD_HAND_DEPTH = 25;

/** 조리 중 보였다 숨었다 하는 main 노드(초기엔 모두 숨김). */
export const COOKED_NODES: readonly string[] = [
  NODE.mat,
  NODE.nori,
  NODE.rice,
  NODE.handLeft,
  NODE.handRight,
  STRIP_SAMPLE_NODE,
];

/**
 * 썰기 화면(main_copy)에서 가져다 쓰는 노드 — 말린 김밥 + 칼집 8개.
 * 나머지 노드(배경·조리대·도구)는 main 과 같은 무대라 다시 만들지 않는다.
 */
export const CUT_NODE = {
  roll: C.LAYER_3,
  /** 손에 쥔 썰기용 칼 — 칼집을 하나씩 따라가며 썬다(상단 도구 칼과는 별개). */
  knife: C.LAYER_17_COPY,
} as const;

/** 칼집 8개 — 저작된 순서 그대로 **오른쪽에서 왼쪽**(x 690 → 389, 43px 간격). */
export const CUT_MARK_NODES: readonly string[] = [
  C.LAYER_4,
  C.LAYER_4_COPY,
  C.LAYER_4_COPY2,
  C.LAYER_4_COPY3,
  C.LAYER_4_COPY4,
  C.LAYER_4_COPY5,
  C.LAYER_4_COPY6,
  C.LAYER_4_COPY7,
];

/** main 위에 얹을 썰기 노드 전체. */
export const CUT_LAYER_NODES: readonly string[] = [CUT_NODE.roll, ...CUT_MARK_NODES, CUT_NODE.knife];

/**
 * 썰기 노드는 main 의 어떤 노드보다 위에 와야 한다(main 의 최상단 = 손 depth 54).
 * 에디터가 준 상대 순서는 유지하되 통째로 이만큼 밀어 올린다.
 */
export const CUT_LAYER_DEPTH_BASE = 100;

/**
 * 말기 1·2단계(main_copy2 / main_copy2_copy)에서 가져다 쓰는 노드.
 * 김·밥은 말린 만큼 줄어든 별도 그림이고, roll 은 그때까지 말린 부분이다.
 * 손은 좌표만 쓰고(그림은 main 것을 그대로 움직인다) 그리지 않는다 — 그래도 좌표를 읽으려면 만들어 둬야 한다.
 */
export const ROLL_STEP1_NODE = {
  nori: R1.LAYER_4,
  rice: R1.LAYER_5,
  roll: R1.LAYER_18,
  handLeft: R1.LAYER_17,
  handRight: R1.LAYER_17_COPY,
} as const;

export const ROLL_STEP2_NODE = {
  nori: R2.LAYER_4,
  rice: R2.LAYER_5,
  roll: R2.LAYER_18_COPY,
  handLeft: R2.LAYER_17,
  handRight: R2.LAYER_17_COPY,
} as const;

/**
 * 서빙 접시와 그 위에 담기는 김밥 조각 — 말기1 화면(main_copy2)에 함께 저작돼 있다.
 * 조각은 저작 깊이 순서(뒤→앞)로 나열해, 담을 때도 그 순서로 얹는다.
 */
export const PLATE_NODE = { plate: R1.LAYER_19 } as const;

export const PLATE_PIECE_NODES: readonly string[] = [
  R1.LAYER_20_COPY4,
  R1.LAYER_20_COPY5,
  R1.LAYER_20,
  R1.LAYER_20_COPY,
  R1.LAYER_20_COPY2,
  R1.LAYER_20_COPY3,
  R1.LAYER_20_COPY6,
  R1.LAYER_20_COPY7,
  R1.LAYER_20_COPY8,
];

/** 접시는 모든 조리 연출보다 위에 온다(서빙은 마지막 화면). */
export const PLATE_DEPTH_BASE = 130;
/** 별 판정은 접시보다도, 안내 문구보다도 위. */
export const STAR_DEPTH = 220;
/** 메뉴 카드는 조리 연출에 가리지 않는다(저작 depth 55~63 위). */
export const CARD_DEPTH_BASE = 80;

/**
 * 마무리 손 — 참기름 바르는 붓 든 손과 깨소금 뿌리는 손(main_copy2_copy2 에 저작).
 * 저작 위치는 "스쳐 지나가는 도중"의 한 지점이라, 지나가는 높이(y)만 그대로 쓰고 x 는 김밥 폭을 훑는다.
 */
export const SEASON_NODE = { oilHand: S.LAYER_5, sesameHand: S.LAYER_5_COPY } as const;
export const SEASON_NODES: readonly string[] = Object.values(SEASON_NODE);

/**
 * 마무리 손의 깊이 — **참기름과 깨소금은 지나가는 때가 달라 층도 다르다.**
 *
 * - **참기름**은 말아 놓은 김밥 겉을 바르므로 썰기 층(`CUT_LAYER_DEPTH_BASE`) 위, 접시 아래면 된다.
 * - ⚠️ **깨소금은 접시에 담은 뒤**에 뿌린다. 접시(`PLATE_DEPTH_BASE`)보다 아래에 두면
 *   손이 접시 **뒤로** 지나가 「접시 밑을 훑는」 것처럼 보인다 — 그래서 접시·조각보다 위로 올린다.
 *
 * 깨 알갱이는 언제나 손보다 위다. 아래면 큰 손 그림에 통째로 가려진다.
 */
export const SEASON_DEPTH = {
  oilHand: 116,
  sesameHand: PLATE_DEPTH_BASE + 20,
  sesameGrain: PLATE_DEPTH_BASE + 22,
} as const;

export const ROLL_STEP1_NODES: readonly string[] = [
  ...Object.values(ROLL_STEP1_NODE),
  PLATE_NODE.plate,
  ...PLATE_PIECE_NODES,
];
export const ROLL_STEP2_NODES: readonly string[] = Object.values(ROLL_STEP2_NODE);

/**
 * 말기 중간 그림의 깊이는 **저작값에서 뽑는다**(`rollDepths`).
 *
 * ⚠️ 예전에는 `{nori: 6.1, rice: 7.1, roll: 27}` 로 박아 뒀는데, 에디터에서 노드를 더 쌓자
 * main 의 depth 가 통째로 밀려(발 5→7 · 김 6→8 · 밥 7→9) **말기 중 김이 대나무발 뒤로 숨는** 사고가 났다.
 * 저작 depth 는 노드를 추가할 때마다 움직이므로 코드에 숫자로 적으면 안 된다.
 */
export function rollDepths(layout: LayoutIndex): { nori: number; rice: number; roll: number } {
  const noriDepth = image(layout, NODE.nori)?.depth ?? 8;
  const riceDepth = image(layout, NODE.rice)?.depth ?? 9;
  const strips = stripDepth(layout);
  // 말기 그림은 평평한 김·밥 **바로 위**에, 말린 부분은 **재료보다 위**(손보다는 아래).
  return { nori: noriDepth + 0.1, rice: riceDepth + 0.1, roll: strips + 8 };
}

/** 김 위에 눕히는 재료 스트립의 깊이 — 저작된 본보기 줄이 놓인 층을 그대로 쓴다. */
export function stripDepth(layout: LayoutIndex): number {
  return image(layout, STRIP_SAMPLE_NODE)?.depth ?? STRIP_DEPTH;
}

export interface Transform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  readonly angle: number;
}

export function snapshot(obj: Phaser.GameObjects.Image): Transform {
  return { x: obj.x, y: obj.y, scaleX: obj.scaleX, scaleY: obj.scaleY, alpha: obj.alpha, angle: obj.angle };
}

/** 스냅샷한 디자인 상태로 되돌린다(주문 리셋용). */
export function restore(obj: Phaser.GameObjects.Image, t: Transform): void {
  obj.setPosition(t.x, t.y).setScale(t.scaleX, t.scaleY).setAlpha(t.alpha).setAngle(t.angle);
}

export interface DesignRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

/** 레이아웃 노드의 디자인 좌표(중심 기준). 노드가 없으면 undefined. */
export function designRect(layout: LayoutIndex, id: string): DesignRect | undefined {
  const n = layout.nodeById(id);
  if (!n) return undefined;
  return { cx: n.x, cy: n.y, w: n.w ?? 0, h: n.h ?? 0 };
}

/**
 * 여러 노드를 한꺼번에 감싸는 최소 사각형 — 튜토리얼이 「이 무리」를 통째로 비출 때 쓴다
 * (진열 아랫줄 두 칸, 주재료 다섯 칸처럼).
 * ⚠️ 글자 노드는 `w`/`h` 가 없어 0으로 잡히므로 **그림 노드만** 넘길 것.
 */
export function unionRect(layout: LayoutIndex, ids: readonly string[]): DesignRect | undefined {
  const rects = ids.map((id) => designRect(layout, id)).filter((r): r is DesignRect => !!r && r.w > 0);
  const first = rects[0];
  if (!first) return undefined;
  const left = Math.min(...rects.map((r) => r.cx - r.w / 2));
  const right = Math.max(...rects.map((r) => r.cx + r.w / 2));
  const top = Math.min(...rects.map((r) => r.cy - r.h / 2));
  const bottom = Math.max(...rects.map((r) => r.cy + r.h / 2));
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
}

/** 이미지 노드만 조회(텍스처 누락 시 undefined). */
export function image(layout: LayoutIndex, id: string): Phaser.GameObjects.Image | undefined {
  const obj = layout.tryById<LayoutObject>(id);
  return obj && 'setTexture' in obj ? (obj as Phaser.GameObjects.Image) : undefined;
}
