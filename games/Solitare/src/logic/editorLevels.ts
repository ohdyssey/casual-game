/**
 * editorLevels.ts — 카드 배치 에디터(design/card-editor.html)가 저장한 레벨을 게임 레이아웃으로 변환.
 *
 * 에디터는 절대 픽셀(디자인 1080×2400) 배치 + 레이어 + 커버 그래프(coveredBy)를 저작한다.
 * 게임 로직(tripeaks/solvable)은 `id`+`coveredBy` 만 필요하고, 렌더(PlayScene)는 절대 좌표(ax/ay)를
 * 보드 영역에 맞춰 스케일한다 → **에디터에서 저작한 배열 그대로** 게임에 적용된다.
 *
 * 소스: localStorage `cardLevels.v1` = { "1": doc, "2": doc, ... }(에디터와 **같은 오리진**일 때 공유)
 *   + 선택적으로 번들 팩(PlayScene 이 넘겨주는 extra).  노드(테스트)에는 localStorage 가 없어 자동으로 빈 맵.
 */
import type { PeakLayout, LayoutSlot } from './layouts.js';

/** 에디터 CardBoard 문서(필요 필드만). */
export interface CardBoardSlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  readonly face?: string;
  readonly rot?: number;
  readonly coveredBy?: readonly string[];
  readonly gid?: string;
}
export interface CardBoardDoc {
  readonly kind?: string;
  readonly frame?: { readonly designW: number; readonly designH: number };
  readonly card?: { readonly w: number; readonly h: number };
  readonly budget?: { readonly board?: number; readonly stock?: number };
  /** 설계 난이도 등급(1=쉬움·2=보통·3=어려움) + 고급 조정(연쇄/뽑기매칭 목표). 게임 딜이 이 값으로 세 요소를 제어. */
  readonly difficulty?: { readonly target?: number; readonly chain?: string; readonly feed?: string };
  /** 에디터에서 검증(테스트)한 **실제 카드 배치**(초기 딜). board=슬롯 순서 랭크·waste=시작 기준·stock=스톡 랭크. 게임 첫 플레이가 이 배치로 시작. */
  readonly deal?: {
    readonly board: readonly number[];
    readonly waste: number;
    readonly stock: readonly number[];
    /** 에디터 솔버가 찾은 **정답 수순**(`p<슬롯>` / `d`) — 별 등급의 기준값(starRating.referenceQuality). */
    readonly solution?: readonly string[];
  };
  readonly slots: readonly CardBoardSlot[];
}

export const EDITOR_LEVELS_KEY = 'cardLevels.v1';
const DEFAULT_CARD_W = 104;
const DEFAULT_CARD_H = 143;
/**
 * 기준(정규화) 카드 크기 — **에디터(card-editor.html CARD_W/H)와 반드시 동일하게 유지**.
 *   어떤 크기로 저작된 레벨이든(구 104×143 localStorage 포함) 게임은 이 크기로 정규화해서 렌더한다 →
 *   데이터 출처와 무관하게 카드 크기가 항상 통일(에디터==게임). 위치도 같은 비율로 확대해 겹침(커버)비율 불변.
 */
const CANON_CARD_W = 120;
const CANON_CARD_H = 164;
/**
 * **덮였다고 눈에 보이는 최소 겹침 면적비**(PO 2026-07-27: "카드가 아주 살짝 걸쳐서 덮는 경우 덮인 것인지
 *   명확하지 않다. 인지 가능하도록 간격을 조절하라").
 *
 * 예전 기준은 **1%** 였다 — 면적 1% 만 걸쳐도 덮인 것으로 판정 → 화면에서는 완전히 열려 보이는 카드가
 *   탭해도 안 눌린다. 실측(2026-07-27, 저작 100 레벨 · 커버쌍 8310):
 *     겹침 <5% 409 쌍(4.9%) · <12% 882 쌍(10.6%) — 100 레벨 중 **96 개**에 존재. p25=37% · p50=72% 라
 *     "진짜 커버"와 "살짝 걸침"은 분포상 뚜렷이 갈린다 → 그 사이(15%)를 기준선으로 잡는다.
 *
 * ⚠️ **카드를 밀어 겹침을 키우는 방식은 실측으로 폐기**했다 — 보드가 조밀해 한 장을 밀면 옆 카드와 새 접촉이
 *   생겨 커버쌍이 8310→8861 로 **늘고** 얕은 커버도 882→1185 로 오히려 악화됐다. 게다가 엣지가 늘면 저작된
 *   정답 수순(deal.solution)이 무효가 될 수 있다. **엣지를 없애는 방향**(임계 상향)은 제약만 줄이므로
 *   기존 정답 수순이 그대로 유효하다.
 */
const PERCEPTIBLE_COVER = 0.15;
const OVERLAP_MIN = PERCEPTIBLE_COVER; // 다른 층: 이만큼 겹쳐야 덮인 것(그 미만은 눈에 안 보여 커버로 치지 않는다).
const SAME_LAYER_MIN = PERCEPTIBLE_COVER; // 같은 층(나중 인덱스가 위에 그려짐)도 동일 기준.

interface Pt {
  x: number;
  y: number;
}
/** 회전(rot°) 반영 카드 네 모서리(중심 x,y·크기 w,h). */
function corners(c: CardBoardSlot, w: number, h: number): Pt[] {
  const r = ((c.rot ?? 0) * Math.PI) / 180;
  const co = Math.cos(r);
  const s = Math.sin(r);
  const hw = w / 2;
  const hh = h / 2;
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const).map(([x, y]) => ({ x: c.x + x * co - y * s, y: c.y + x * s + y * co }));
}
function polyArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return Math.abs(a) / 2;
}
function segX(p1: Pt, p2: Pt, a: Pt, b: Pt): Pt {
  const d = (p1.x - p2.x) * (a.y - b.y) - (p1.y - p2.y) * (a.x - b.x);
  if (!d) return p1;
  const t = ((p1.x - a.x) * (a.y - b.y) - (p1.y - a.y) * (a.x - b.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}
/** Sutherland–Hodgman: 볼록 다각형 cl 로 sub 를 잘라 교집합 다각형 반환. */
function clipPoly(sub: Pt[], cl: Pt[]): Pt[] {
  let out = sub;
  const cx = cl.reduce((s, p) => s + p.x, 0) / cl.length;
  const cy = cl.reduce((s, p) => s + p.y, 0) / cl.length;
  for (let i = 0; i < cl.length; i++) {
    const a = cl[i];
    const b = cl[(i + 1) % cl.length];
    const side = (x: number, y: number): number => (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
    const ref = side(cx, cy);
    const inside = (p: Pt): boolean => side(p.x, p.y) * ref >= 0;
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j];
      const prev = inp[(j + inp.length - 1) % inp.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(segX(prev, cur, a, b));
        out.push(cur);
      } else if (pi) {
        out.push(segX(prev, cur, a, b));
      }
    }
    if (!out.length) return [];
  }
  return out;
}
/**
 * 두 카드의 겹침 면적비 — **회전(rot) 반영 OBB 교집합**.
 * 링/스파이럴처럼 카드가 각기 다른 각도로 돌면 축정렬 박스는 각도에 따라 겹침이 요동쳐(시각적으로 겹쳐도 미검출)
 * "위에 겹친 카드가 있는데 아래가 오픈"되는 버그가 생긴다. 실제 회전 사각형끼리의 교집합으로 판정해 에디터 표시와 일치시킨다.
 */
function overlapRatio(a: CardBoardSlot, b: CardBoardSlot, cw: number, ch: number): number {
  return polyArea(clipPoly(corners(a, cw, ch), corners(b, cw, ch))) / (cw * ch);
}

/** 배치된 카드 한 장(정규화 좌표) — 겹침 계산·밀어넣기에 필요한 최소 형태. */
interface PlacedCard {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  readonly rot?: number;
}

/** o 가 s 를 **앞에서** 덮는 위치인가(층이 높거나, 같은 층이면 나중 인덱스 = 위에 그려짐). */
function isFrontOf(o: PlacedCard, oi: number, s: PlacedCard, si: number): boolean {
  return o.layer > s.layer || (o.layer === s.layer && oi > si);
}

/** 커버쌍 목록 — `{ back: 덮이는 카드 인덱스, front: 덮는 카드 인덱스 }`. 에디터 coverOf 와 동일 규칙. */
function coverPairs(list: readonly PlacedCard[], cw: number, ch: number): Array<{ back: number; front: number }> {
  const out: Array<{ back: number; front: number }> = [];
  for (let si = 0; si < list.length; si++) {
    for (let oi = 0; oi < list.length; oi++) {
      if (si === oi) continue;
      if (!isFrontOf(list[oi], oi, list[si], si)) continue;
      const min = list[oi].layer === list[si].layer ? SAME_LAYER_MIN : OVERLAP_MIN;
      if (overlapRatio(list[si], list[oi], cw, ch) >= min) out.push({ back: si, front: oi });
    }
  }
  return out;
}

/** CardBoard 문서 → PeakLayout. coveredBy 는 문서 값 우선, 없으면 겹침으로 파생. */
export function cardBoardToLayout(doc: CardBoardDoc, id: string): PeakLayout {
  const src = doc.slots ?? [];
  const cw0 = doc.card?.w ?? DEFAULT_CARD_W;
  const ch0 = doc.card?.h ?? DEFAULT_CARD_H;
  // 기준 크기(120×164)로 정규화 — 저작 크기가 달라도 게임 카드 크기를 통일. 위치도 같은 비율(콘텐츠 중심 기준)로
  //   확대해 겹침(커버)비율을 그대로 보존한다(해결가능성 불변). 이미 기준 크기면 kx=ky=1 → 무변화.
  const cw = CANON_CARD_W;
  const ch = CANON_CARD_H;
  const kx = cw / cw0;
  const ky = ch / ch0;
  const ccx = src.length ? (Math.min(...src.map((s) => s.x)) + Math.max(...src.map((s) => s.x))) / 2 : 0;
  const ccy = src.length ? (Math.min(...src.map((s) => s.y)) + Math.max(...src.map((s) => s.y))) / 2 : 0;
  const raw = src.map((s) => ({ ...s, x: ccx + (s.x - ccx) * kx, y: ccy + (s.y - ccy) * ky }));

  // 커버 = 시각적으로 앞에 있는 카드(층이 높거나, 같은 층이면 나중 인덱스=위에 그려짐)가 **눈에 보일 만큼**
  //   겹치면 덮음(PERCEPTIBLE_COVER). 에디터 coverOf 와 동일 규칙.
  const covered = new Map<number, string[]>();
  for (const { back, front } of coverPairs(raw, cw, ch)) {
    covered.set(back, [...(covered.get(back) ?? []), raw[front].id]);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of raw) {
    minX = Math.min(minX, s.x - cw / 2);
    maxX = Math.max(maxX, s.x + cw / 2);
    minY = Math.min(minY, s.y - ch / 2);
    maxY = Math.max(maxY, s.y + ch / 2);
  }

  // 커버 그래프는 **항상 좌표에서 재계산**한다(문서에 저장된 coveredBy 를 신뢰하지 않음) →
  //   임계값(PERCEPTIBLE_COVER) 변경이나 예전 저장분에도 현재 규칙이 그대로 적용된다.
  const slots: LayoutSlot[] = raw.map((s, i) => ({
    id: s.id,
    row: s.layer,
    col: 0,
    coveredBy: covered.get(i) ?? [],
    rot: s.rot ?? 0,
    ax: s.x,
    ay: s.y,
  }));
  const rowCount = raw.length ? Math.max(...raw.map((s) => s.layer)) + 1 : 0;
  const stock = typeof doc.budget?.stock === 'number' && doc.budget.stock >= 0 ? Math.floor(doc.budget.stock) : undefined;
  const dt = doc.difficulty?.target;
  const difficulty = dt === 1 || dt === 2 || dt === 3 ? (dt as 1 | 2 | 3) : undefined;
  const lvl = (v: unknown): 'low' | 'mid' | 'high' | 'vhigh' | undefined =>
    v === 'low' || v === 'mid' || v === 'high' || v === 'vhigh' ? v : undefined;
  const aChain = lvl(doc.difficulty?.chain);
  const aFeed = lvl(doc.difficulty?.feed);
  const diffAdvanced = aChain || aFeed ? { ...(aChain ? { chain: aChain } : {}), ...(aFeed ? { feed: aFeed } : {}) } : undefined;
  // 초기 딜(테스트 카드 배치) — board 길이가 슬롯 수와 같고 랭크가 유효할 때만 채택.
  const rk = (v: unknown): number | null => (typeof v === 'number' && v >= 1 && v <= 13 ? Math.floor(v) : null);
  const d = doc.deal;
  const dBoard = d && Array.isArray(d.board) && d.board.length === raw.length ? d.board.map(rk) : null;
  const initialDeal =
    dBoard && !dBoard.includes(null) && rk(d!.waste) != null && Array.isArray(d!.stock)
      ? {
          board: dBoard as number[],
          waste: rk(d!.waste) as number,
          stock: d!.stock.map(rk).filter((r): r is number => r != null),
          // 정답 수순은 있으면 그대로 넘긴다(별 등급 기준값). 문자열 배열이 아니면 무시.
          ...(Array.isArray(d!.solution) && d!.solution.every((x) => typeof x === 'string') ? { solution: [...d!.solution] } : {}),
        }
      : undefined;
  return {
    id,
    rowCount,
    slots,
    order: slots.map((s) => s.id),
    abs: { cardW: cw, cardH: ch, minX, minY, maxX, maxY },
    ...(stock != null ? { stock } : {}),
    ...(difficulty != null ? { difficulty } : {}),
    ...(diffAdvanced != null ? { diffAdvanced } : {}),
    ...(initialDeal != null ? { initialDeal } : {}),
  };
}

/** localStorage 에서 저장된 에디터 레벨 문서 맵을 읽는다(브라우저 전용, 없으면 빈 맵). */
export function loadEditorLevelDocs(): Record<string, CardBoardDoc> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(EDITOR_LEVELS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CardBoardDoc>;
  } catch {
    return {};
  }
}

/** 유효한 CardBoard 문서인지(슬롯 1장 이상). */
function isValidDoc(doc: unknown): doc is CardBoardDoc {
  return !!doc && typeof doc === 'object' && Array.isArray((doc as CardBoardDoc).slots) && (doc as CardBoardDoc).slots.length > 0;
}

/** 특정 레벨의 에디터 레이아웃(없으면 null). extra=번들 팩(있으면 localStorage 보다 우선). */
export function getEditorLevel(level: number, extra?: Record<string, CardBoardDoc>): PeakLayout | null {
  const docs = { ...(extra ?? {}), ...loadEditorLevelDocs() }; // localStorage(에디터 최신 저장)가 번들 팩보다 우선
  const doc = docs[String(level)];
  if (!isValidDoc(doc)) return null;
  return cardBoardToLayout(doc, `editor-L${level}`);
}

/** 저장된(유효한) 에디터 레벨 번호들(오름차순). */
export function editorLevelNumbers(extra?: Record<string, CardBoardDoc>): number[] {
  const docs = { ...(extra ?? {}), ...loadEditorLevelDocs() }; // localStorage(에디터 최신 저장)가 번들 팩보다 우선
  return Object.keys(docs)
    .map(Number)
    .filter((n) => Number.isFinite(n) && isValidDoc(docs[String(n)]))
    .sort((a, b) => a - b);
}

/**
 * 게임에 노출할 레벨 수 = **1부터 빈틈 없이 연속으로** 저작된 에디터 레벨 수.
 *   예: {1,2,3}→3, {1,3}→1(2가 비어 있어 1까지만), {}→0.
 *   (레벨은 선형 진행이라 중간이 비면 그 앞까지만 플레이 가능하게 막는다.)
 */
export function editorLevelCount(extra?: Record<string, CardBoardDoc>): number {
  const nums = new Set(editorLevelNumbers(extra));
  let n = 0;
  while (nums.has(n + 1)) n++;
  return n;
}
