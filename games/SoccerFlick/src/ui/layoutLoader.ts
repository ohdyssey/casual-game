/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 사커플릭 레이아웃은 배경/골대/헤더/HUD = 에디터 렌더, 말·공·물리 = 코드 생성.
 * 따라서 buildLayout 은 skip 술어로 말·공 텍스처 노드를 건너뛴다(에디터 목업 제외).
 *
 * 지원 타입: image / rect / text. 미지원 타입(field 등)은 건너뛴다(좌표는 logic/field 가 파싱).
 * 노드 좌표는 전부 중심 기준(center-anchored); 텍스트만 align 으로 origin 보정.
 */
import Phaser from 'phaser';
// 에디터가 노드에 저작한 anim(맥동·흔들·파티클 등) 재생 — @casual/core 단일 사본.
import { applyLayoutAnims } from '@casual/core';

export interface LayoutNode {
  readonly id: string;
  readonly type: 'image' | 'rect' | 'text' | 'field' | string;
  readonly name?: string;
  readonly key?: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly depth?: number;
  readonly visible?: boolean;
  readonly alpha?: number;
  readonly angle?: number;
  readonly group?: string;
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
  readonly align?: 'left' | 'center' | 'right' | string;
  readonly binding?: string;
  // field (충돌 폴리곤 — 렌더 안 함; logic/field 가 파싱)
  readonly points?: ReadonlyArray<{ x: number; y: number }>;
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

export type LayoutObject =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Text;

export interface LayoutEntry {
  readonly node: LayoutNode;
  readonly obj: LayoutObject;
}

export interface BuildOpts {
  /** true 를 반환하는 노드는 생성하지 않는다(말·공 등 코드 생성 대상 제외). */
  readonly skip?: (n: LayoutNode) => boolean;
}

/** 생성 결과 — id/group/binding 별 조회. */
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

  nodeById(id: string): LayoutNode | undefined {
    return this.byIdMap.get(id)?.node;
  }

  /** binding 값으로 엔트리 조회(여러 개면 x 오름차순). HUD 바인딩용. */
  byBinding(binding: string): LayoutEntry[] {
    return [...this.byIdMap.values()]
      .filter((e) => e.node.binding === binding)
      .sort((a, b) => a.node.x - b.node.x);
  }

  entries(): LayoutEntry[] {
    return [...this.byIdMap.values()];
  }
}

function originForAlign(align?: string): number {
  if (align === 'left') return 0;
  if (align === 'right') return 1;
  return 0.5;
}

function makeText(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Text {
  const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
  const bold = n.fontStyle === '700' || n.fontStyle === 'bold';
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
    color: n.color ?? '#ffffff',
    fontStyle: bold ? 'bold' : 'normal',
    align: (n.align as 'left' | 'center' | 'right') ?? 'center',
  });
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  return t;
}

/** main.json 문서를 씬에 생성. 텍스처 누락 노드는 건너뛴다(DEV 에서만 경고). */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc, opts?: BuildOpts): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    if (opts?.skip?.(n)) continue;
    let obj: LayoutObject | null = null;
    let originX = 0.5;
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
      originX = originForAlign(n.align);
    }
    if (!obj) continue;
    obj.setOrigin(originX, 0.5);
    obj.setDepth(n.depth ?? 0);
    if (n.angle) obj.setAngle(n.angle);
    if (n.alpha !== undefined) obj.setAlpha(n.alpha);
    if (n.visible === false) obj.setVisible(false);
    index.add({ node: n, obj });
  }
  // 에디터 저작 애니를 재생(이 호출이 SSOT 효과의 런타임 스위치).
  applyLayoutAnims(scene, index.entries(), doc);
  return index;
}
