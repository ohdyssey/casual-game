/**
 * 에디터 레이아웃 로더 — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 노드 좌표/크기는 전부 중심 기준(center-anchored). 지원 타입: image / rect / text
 *   + (벤더 런타임) spriteDocClip(스프라이트 애니) · polygon/원/사각 + fillClip/fillImage(전광판: 도형 안 애니/이미지).
 */
import Phaser from 'phaser';
// 에디터 런타임(스프라이트 클립·도형 렌더·노드 anim 재생)은 @casual/core 단일 공용 사본에서 가져온다.
import { applyLayoutAnims, loadSpriteClip, clipNativeSize, clipToShape, pointsBounds } from '@casual/core';

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
  // rect
  readonly fill?: string;
  readonly fillAlpha?: number;
  readonly radius?: number;
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
  readonly stroke?: string;
  readonly strokeW?: number;
  readonly binding?: string;
  /** 텍스트 정렬 — x 를 기준으로 왼쪽/중앙/오른쪽 중 어디에 앵커할지(에디터 저작값). 기본 center. */
  readonly align?: 'left' | 'center' | 'right';
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

export type LayoutObject = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Container;

export interface LayoutEntry {
  readonly node: LayoutNode;
  readonly obj: LayoutObject;
}

/** 생성 결과 — id/binding/group 별 조회. */
export class LayoutIndex {
  private readonly byIdMap = new Map<string, LayoutEntry>();

  constructor(readonly doc: LayoutDoc) {}

  add(entry: LayoutEntry): void {
    this.byIdMap.set(entry.node.id, entry);
  }

  byId<T extends LayoutObject = LayoutObject>(id: string): T {
    const e = this.byIdMap.get(id);
    if (!e) throw new Error(`layout node not found: ${id}`);
    return e.obj as T;
  }

  /** 조회 실패 시 throw 대신 undefined — 디자인 미완성 단계 방어. */
  tryById<T extends LayoutObject = LayoutObject>(id: string): T | undefined {
    return this.byIdMap.get(id)?.obj as T | undefined;
  }

  nodeById(id: string): LayoutNode {
    const e = this.byIdMap.get(id);
    if (!e) throw new Error(`layout node not found: ${id}`);
    return e.node;
  }

  byGroup(group: string): LayoutEntry[] {
    return [...this.byIdMap.values()].filter((e) => e.node.group === group);
  }

  /** 그룹 전체 표시/숨김. */
  setGroupVisible(group: string, visible: boolean): void {
    for (const e of this.byGroup(group)) e.obj.setVisible(visible);
  }

  entries(): LayoutEntry[] {
    return [...this.byIdMap.values()];
  }
}

function makeText(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Text {
  const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
    color: n.color ?? '#ffffff',
    align: n.align ?? 'center',
  });
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  return t;
}

/** align('left'/'center'/'right') → x 기준 origin. 노드의 x,y 는 이 앵커 기준 좌표(에디터 저작값). */
function textOriginX(align: LayoutNode['align']): number {
  return align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
}

type BBox = { w: number; h: number; cx: number; cy: number };

function shapeBBox(n: LayoutNode): BBox {
  if (n.type === 'polygon' && n.points && n.points.length) {
    const b = pointsBounds(n.points as Array<{ x: number; y: number }>);
    return { w: Math.max(2, b.w), h: Math.max(2, b.h), cx: b.cx, cy: b.cy };
  }
  if (n.type === 'circle') { const d = (n.r ?? 50) * 2; return { w: d, h: d, cx: 0, cy: 0 }; }
  return { w: n.w ?? 10, h: n.h ?? 10, cx: 0, cy: 0 };
}

/** 도형 배경(채움색) — 채움 애니/이미지의 투명부 뒤에 비치는 판. 로컬좌표(컨테이너 기준). */
function drawShapeBg(scene: Phaser.Scene, n: LayoutNode, bb: BBox): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(Phaser.Display.Color.HexStringToColor(n.fill ?? '#000000').color, n.fillAlpha ?? 1);
  if (n.type === 'polygon' && n.points && n.points.length >= 3) {
    g.beginPath(); g.moveTo(n.points[0].x, n.points[0].y);
    for (let i = 1; i < n.points.length; i++) g.lineTo(n.points[i].x, n.points[i].y);
    g.closePath(); g.fillPath();
  } else if (n.type === 'circle') {
    g.fillCircle(0, 0, n.r ?? 50);
  } else {
    g.fillRoundedRect(-bb.w / 2, -bb.h / 2, bb.w, bb.h, n.radius ?? 0);
  }
  return g;
}

/**
 * 전광판(도형+애니/이미지 채움) · 스프라이트 애니 노드 — 벤더 런타임으로 렌더. 컨테이너 1개 반환.
 *   실패하면 null → 해당 노드만 스킵(기존 HUD 보존). 모든 객체는 hudLayer(scale 1) 에 들어가므로
 *   마스크 월드좌표(도형 중심 n.x,n.y)와 채움 콘텐츠 월드좌표가 정확히 정렬된다(도형 밖으로 안 샘).
 */
function buildAdvancedNode(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Container | null {
  try {
    if (n.type === 'spriteDocClip' && (n.spriteDocFile || n.spriteDocId)) {
      const ref = n.spriteDocFile || n.spriteDocId;
      if (!ref) return null;
      const c = scene.add.container(n.x, n.y);
      loadSpriteClip(scene, ref, {
        container: c, clipId: n.clipId || '', autoPlay: n.autoPlay !== false, anchor: n.anchor,
      }).then((h: { doc?: unknown } | null) => {
        if (h && n.w && n.h) { const ns = clipNativeSize(h.doc || {}); if (ns.w > 0 && ns.h > 0) c.setScale((n.w as number) / ns.w, (n.h as number) / ns.h); }
        c.setData('spriteClipHandle', h);
        c.emit('clipready', h);
      }).catch(() => { /* 클립 로드 실패 — 빈 컨테이너 */ });
      return c;
    }
    if ((n.type === 'polygon' || n.type === 'rect' || n.type === 'circle') && (n.fillClip || n.fillImage)) {
      const bb = shapeBBox(n);
      const c = scene.add.container(n.x, n.y);
      if (n.fill) c.add(drawShapeBg(scene, n, bb));
      let content: Phaser.GameObjects.GameObject | null = null;
      if (n.fillClip) {
        const sub = scene.add.container(bb.cx, bb.cy);
        loadSpriteClip(scene, n.fillClip, { container: sub, autoPlay: true, anchor: { x: 0.5, y: 0.5 } })
          .then((h: { doc?: unknown } | null) => { if (h) { const ns = clipNativeSize(h.doc || {}); if (ns.w > 0 && ns.h > 0 && bb.w > 0 && bb.h > 0) sub.setScale(Math.max(bb.w / ns.w, bb.h / ns.h)); } })
          .catch(() => { /* */ });
        content = sub;
      } else if (n.fillImage && scene.textures.exists(n.fillImage)) {
        const img = scene.add.image(bb.cx, bb.cy, n.fillImage);
        const si = scene.textures.get(n.fillImage).getSourceImage() as { width: number; height: number };
        const sc = Math.max(bb.w / (si.width || 1), bb.h / (si.height || 1));
        img.setDisplaySize((si.width || 1) * sc, (si.height || 1) * sc);
        content = img;
      }
      if (content) {
        c.add(content);
        // 도형 모양으로 정확히 클립 — 마스크는 월드좌표(컨테이너 c가 n.x,n.y·scale1 → content world = n.x+local).
        clipToShape(scene, content, { type: n.type, cx: n.x, cy: n.y, w: bb.w, h: bb.h, radius: n.radius, points: n.points as Array<{ x: number; y: number }>, angle: n.angle });
      }
      return c;
    }
  } catch (e) { if (import.meta.env?.DEV) console.warn(`[layout] advanced node 실패 ${n.id}:`, e); }
  return null;
}

/** main.json 문서를 씬에 생성. 텍스처 누락 노드는 건너뛴다(DEV 에서만 경고). */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    // 전광판(도형+채움) · 스프라이트 애니 — 벤더 런타임으로 렌더(컨테이너). 실패 시 스킵(기존 HUD 보존).
    if (n.type === 'spriteDocClip' || ((n.type === 'polygon' || n.type === 'rect' || n.type === 'circle') && (n.fillClip || n.fillImage))) {
      const adv = buildAdvancedNode(scene, n);
      if (adv) {
        adv.setDepth(n.depth ?? 0);
        if (n.angle) adv.setAngle(n.angle);
        if (n.alpha !== undefined) adv.setAlpha(n.alpha);
        if (n.visible === false) adv.setVisible(false);
        index.add({ node: n, obj: adv });
      }
      continue;
    }
    let obj: LayoutObject | null = null;
    if (n.type === 'image' && n.key) {
      if (scene.textures.exists(n.key)) {
        const img = scene.add.image(n.x, n.y, n.key);
        if (n.w && n.h) img.setDisplaySize(n.w, n.h);
        obj = img;
      } else if (import.meta.env?.DEV) {
        console.warn(`[layout] texture missing for node ${n.id}: ${n.key}`);
      }
    } else if (n.type === 'rect') {
      const fill = Phaser.Display.Color.HexStringToColor(n.fill ?? '#ffffff').color;
      obj = scene.add.rectangle(n.x, n.y, n.w ?? 10, n.h ?? 10, fill, n.fillAlpha ?? 1);
    } else if (n.type === 'text') {
      obj = makeText(scene, n);
    }
    if (!obj) continue;
    obj.setOrigin(n.type === 'text' ? textOriginX(n.align) : 0.5, 0.5);
    obj.setDepth(n.depth ?? 0);
    if (n.angle) obj.setAngle(n.angle);
    if (n.alpha !== undefined) obj.setAlpha(n.alpha);
    if (n.visible === false) obj.setVisible(false);
    index.add({ node: n, obj });
  }
  // 에디터가 노드/그룹에 저작한 애니(맥동·흔들·파티클 등)를 재생. 이 호출이 SSOT 효과의 런타임 스위치.
  applyLayoutAnims(scene, index.entries(), doc);
  return index;
}

/** 게이지 렉트를 좌측 고정 막대로 변환 — 이후 setRatio 로 폭 갱신(마나/HP 바). */
export function asLeftGauge(rect: Phaser.GameObjects.Rectangle): { setRatio: (r: number) => void; fullW: number } {
  const fullW = rect.width;
  const left = rect.x - fullW / 2;
  rect.setOrigin(0, 0.5);
  rect.setX(left);
  return {
    fullW,
    setRatio: (r: number) => {
      const clamped = Math.max(0, Math.min(1, r));
      rect.setDisplaySize(Math.max(1, fullW * clamped), rect.height);
      rect.setVisible(clamped > 0.005);
    },
  };
}
