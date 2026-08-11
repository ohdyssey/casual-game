/**
 * layoutAnchor — 에디터 레이아웃의 **좌표 계약**(순수 함수·타입). Phaser 비의존.
 *
 * 여기 담긴 것은 "노드가 어디에 놓이는가"뿐이다. 실제 Phaser 객체 생성은 layoutLoader.ts 가 한다.
 * 분리 이유: 좌표 규약은 화면비마다 달라지는 표준의 핵심이라 단위 테스트로 고정해야 하는데,
 * Phaser 를 import 하면 DOM 없는 테스트 환경에서 로드 자체가 실패한다.
 *
 * ## 좌표 규약
 * · 노드 x/y/w/h 는 전부 **중심 기준**(center-anchored). 텍스트만 align 에 따라 x 가 앵커점(textAnchor).
 * · 저작 프레임(frame.designW×designH)과 캔버스 크기가 다르면 anchorLayoutDoc 이 흡수한다:
 *     세로 pin  — top=고정 · bottom=y+dH · center=y+dH/2 (미지정 시 위치 휴리스틱)
 *     가로 pinX — left=고정 · right=x+dW · center=x+dW/2 (미지정 시 항상 center = 세이프존 중앙정렬)
 */

export interface LayoutNode {
  readonly id: string;
  readonly type: 'image' | 'rect' | 'text' | 'spriteDocClip' | 'polygon' | 'circle' | 'zone';
  readonly name?: string;
  readonly key?: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly r?: number;
  readonly depth?: number;
  readonly visible?: boolean;
  readonly alpha?: number;
  readonly angle?: number;
  readonly group?: string;
  /** 좌표공간(에디터 계약) — 'world'=배경과 함께 카메라 줌/팬(전광판) · 'screen'=HUD 고정. 미설정=게임 휴리스틱 폴백. */
  readonly space?: 'screen' | 'world';
  /** 화면고정(screen) 노드의 반응형 앵커 — 디자인≠캔버스 높이 시 가장자리 정렬(P1). */
  readonly pin?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'center';
  /**
   * 가로 앵커 — 캔버스 폭이 저작 폭(designW)보다 넓을 때(양축 가변) 노드가 따라가는 가장자리.
   * 미지정 기본은 'center' = 세이프존 중앙정렬(저작 배치의 상대 관계가 그대로 보존된다).
   * 화면 좌/우 끝에 붙어야 하는 노드(모서리 메뉴 등)만 'left'/'right' 로 예외 저작한다.
   */
  readonly pinX?: 'left' | 'center' | 'right';
  // rect
  readonly fill?: string;
  readonly fillAlpha?: number;
  readonly radius?: number;
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontStyle?: string;
  readonly color?: string;
  readonly stroke?: string;
  readonly strokeW?: number;
  readonly binding?: string;
  /** 텍스트 정렬 — 에디터 저작값. 앵커 규약은 wrapW 유무에 따라 달라진다(textAnchor 참조). */
  readonly align?: 'left' | 'center' | 'right';
  /**
   * 텍스트 상자(고정 폭/높이) — 에디터에서 텍스트를 상자로 저작했을 때만 있다. 이게 있으면
   * x,y 는 "상자의 중심"이고 align 은 상자 안에서의 정렬을 뜻한다(textAnchor 참조).
   */
  readonly wrapW?: number;
  readonly wrapH?: number;
  // text 드롭섀도 — 현재 공용 makeText() 는 아직 미적용(범용 렌더는 이 세션 범위 밖), 필드만
  // 선언해 개별 소비처(예: scoreboard.ts)가 raw 노드 데이터를 그대로 읽어 반영할 수 있게 한다.
  readonly shadow?: boolean;
  readonly shadowColor?: string;
  readonly shadowX?: number;
  readonly shadowY?: number;
  readonly shadowBlur?: number;
  readonly shadowAlpha?: number;
  // polygon / 전광판(도형 채움)
  readonly points?: ReadonlyArray<{ x: number; y: number }>;
  readonly fillImage?: string;
  readonly fillClip?: string;
  // spriteDocClip(스프라이트 애니)
  readonly spriteDocFile?: string;
  readonly spriteDocId?: string;
  readonly clipId?: string;
  readonly autoPlay?: boolean;
  readonly anchor?: { x: number; y: number };
  /** 캐릭터 식별자 — 레지스트리(_index.json)에서 같은 캐릭터의 다른 동작(준비/스윙/후) 조회용. */
  readonly characterId?: string;
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

/**
 * 텍스트 노드의 가로 앵커 — 에디터(.pue-harness 가 노출하는 anchorX)의 두 가지 규약을 그대로 구현한다:
 *
 *   · wrapW 없음 → x 가 곧 앵커점. align 이 그 앵커의 종류(left=왼쪽끝 · right=오른쪽끝 · center=중앙).
 *     예) ROOKIE27 at=[178] align=left → anchorX:"left" (글자 왼쪽 끝이 178)
 *         SLUGGER89 at=[899] align=right → anchorX:"right" (글자 오른쪽 끝이 899)
 *   · wrapW 있음 → x 는 "상자의 중심"(anchorX:"center(box)")이고 align 은 그 상자 안에서의 정렬.
 *     예) SEASON PASS at=[210] align=left wrapW=133 → 글자 왼쪽 끝은 210-133/2=143.5
 *
 * ⚠️ 이전엔 두 번째 규약이 없어 wrapW 상자 노드의 left/right 정렬 텍스트가 상자 중심에 왼쪽
 * 끝을 맞춰 wrapW/2 만큼 오른쪽으로 밀렸다(사용자 보고: "하단 폰트가 에디터에서 설정한 정렬과
 * 맞지 않는다" — SEASON PASS 66.5px · HIT 5 HOMRUNS 84.5px 밀림).
 *
 * Phaser 의 setFixedSize 로 상자를 재현하지 않는 이유: 고정 폭을 주면 텍스트 캔버스가 그 폭으로
 * 잘려, 상자보다 넓은 글자(위 두 노드 모두 해당)가 오른쪽에서 잘려나간다. 앵커 위치만 직접
 * 계산하면 클리핑 없이 에디터 배치와 정확히 일치한다.
 */
export function textAnchor(n: LayoutNode): { x: number; originX: number } {
  const originX = n.align === 'left' ? 0 : n.align === 'right' ? 1 : 0.5;
  if (!n.wrapW) return { x: n.x, originX };
  const half = n.wrapW / 2;
  // 상자 중심(n.x) 기준으로 정렬 방향에 맞는 상자 모서리를 앵커점으로 삼는다.
  return { x: n.x + (originX - 0.5) * 2 * half, originX };
}

/** 세로 앵커 모드 — 캔버스 높이가 디자인 높이(2400)와 다를 때 노드가 따라가는 가장자리. */
export type PinMode = 'top' | 'bottom' | 'center';
/** 가로 앵커 모드 — 캔버스 폭이 디자인 폭(1080)보다 넓을 때(양축 가변) 노드가 따라가는 가장자리. */
export type PinXMode = 'left' | 'center' | 'right';

/**
 * 노드의 세로 pin 결정 — 우선순위: 노드 자체 pin(에디터 저작) > overrides(게임 코드) > 휴리스틱.
 * 휴리스틱: 디자인 상단 ⅓ 안이면 top, 하단 ⅓ 안이면 bottom, 그 사이는 center.
 * (홈런팝 main/blank 레이아웃 실측 기준 — 헤더/홈버튼/라운드표시=top, 필드·캐릭터·하단바=bottom,
 *  리그카드·팝업류=center 로 떨어진다. 예외는 overrides 로 명시.)
 */
export function resolvePin(n: LayoutNode, designH: number, overrides?: Readonly<Record<string, PinMode>>): PinMode {
  if (n.pin === 'top' || n.pin === 'bottom' || n.pin === 'center') return n.pin;
  const o = overrides?.[n.id];
  if (o) return o;
  if (n.y < designH / 3) return 'top';
  if (n.y > (designH * 2) / 3) return 'bottom';
  return 'center';
}

/**
 * 노드의 가로 pin 결정 — 우선순위: 노드 자체 pinX(에디터 저작) > overrides(게임 코드) > 'center'.
 *
 * 세로(resolvePin)와 달리 위치 휴리스틱을 쓰지 않는다: 기본값 'center' 는 **세이프존 중앙정렬**을
 * 뜻하고, 늘어난 폭(dW)의 절반씩을 좌우에 균등 분배해 저작 배치의 상대 관계를 그대로 보존한다.
 * 위치로 추측하면(좌⅓=left 등) 중앙에 있어야 할 UI 가 화면 폭에 따라 벌어져 디자인이 깨진다.
 */
export function resolvePinX(n: LayoutNode, overrides?: Readonly<Record<string, PinXMode>>): PinXMode {
  if (n.pinX === 'left' || n.pinX === 'center' || n.pinX === 'right') return n.pinX;
  return overrides?.[n.id] ?? 'center';
}

/**
 * 레이아웃 문서를 캔버스 크기에 맞춰 **양축 앵커 변환**한 새 문서를 반환(원본 불변).
 * 캔버스 크기 == 디자인 크기면 원본 그대로(런타임 동작 완전 동일 — 회귀 없음).
 *
 *   dH = canvasH − designH (세로 가변 게임에선 항상 ≤ 0)
 *     top → 그대로 · bottom → y+dH · center → y+dH/2
 *   dW = canvasW − designW (가로 확장 구간에서만 > 0, 그 외 0)
 *     left → 그대로 · right → x+dW · center → x+dW/2 (기본, 세이프존 중앙정렬)
 *
 * 반환 문서의 frame 도 캔버스 크기로 바꿔, 이후 소비자(배경 cover·카메라 bounds 등)가 일관되게 본다.
 */
export function anchorLayoutDoc(
  doc: LayoutDoc,
  canvasH: number,
  overrides?: Readonly<Record<string, PinMode>>,
  opts: { canvasW?: number; xOverrides?: Readonly<Record<string, PinXMode>> } = {},
): LayoutDoc {
  const designH = doc.frame?.designH ?? canvasH;
  const designW = doc.frame?.designW ?? opts.canvasW ?? 0;
  const canvasW = opts.canvasW ?? designW;
  const dH = canvasH - designH;
  const dW = canvasW - designW;
  if (dH === 0 && dW === 0) return doc;
  const shiftY: Record<PinMode, number> = { top: 0, bottom: dH, center: dH / 2 };
  const shiftX: Record<PinXMode, number> = { left: 0, right: dW, center: dW / 2 };
  return {
    ...doc,
    frame: { designW: canvasW, designH: canvasH },
    nodes: doc.nodes.map((n) => {
      const dy = dH === 0 ? 0 : shiftY[resolvePin(n, designH, overrides)];
      const dx = dW === 0 ? 0 : shiftX[resolvePinX(n, opts.xOverrides)];
      return dy === 0 && dx === 0 ? n : { ...n, x: n.x + dx, y: n.y + dy };
    }),
  };
}
