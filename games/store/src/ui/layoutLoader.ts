/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/*.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 진입화면(blank.json = "진입화면")은 image / rect / text 노드만 쓰므로 벤더 런타임 의존 없이
 * 자체 완결. 모든 좌표·크기는 중심 기준(center-anchored).
 */
import Phaser from 'phaser';
// 에디터가 노드에 저작한 anim(맥동·흔들·파티클 등) 재생 — @casual/core 단일 사본.
import { applyLayoutAnims } from '@casual/core';

export interface LayoutNode {
  readonly id: string;
  readonly type: 'image' | 'rect' | 'text' | string;
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
  readonly lockAspect?: boolean;
  // rect
  readonly fill?: string;
  readonly fillAlpha?: number;
  readonly radius?: number;
  readonly stroke?: string;
  readonly strokeW?: number;
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
  readonly fontStyle?: string;
  readonly align?: string;
  readonly shadow?: boolean;
  readonly shadowColor?: string;
  readonly shadowX?: number;
  readonly shadowY?: number;
  readonly shadowBlur?: number;
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

export type LayoutObject =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Graphics
  | Phaser.GameObjects.Text;

export interface LayoutEntry {
  readonly node: LayoutNode;
  readonly obj: LayoutObject;
}

/** 생성 결과 — id 별 조회. */
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

  /** 조회 실패 시 undefined — 디자인 미완성 단계 방어. */
  tryById<T extends LayoutObject = LayoutObject>(id: string): T | undefined {
    return this.byIdMap.get(id)?.obj as T | undefined;
  }

  nodeById(id: string): LayoutNode | undefined {
    return this.byIdMap.get(id)?.node;
  }

  entries(): LayoutEntry[] {
    return [...this.byIdMap.values()];
  }
}

/** align → originX(좌/우/중앙 정렬을 에디터와 동일하게 앵커). */
function originXFor(align?: string): number {
  if (align === 'left') return 0;
  if (align === 'right') return 1;
  return 0.5;
}

function makeText(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Text {
  const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
  const bold = (parseInt(n.fontStyle ?? '', 10) || 0) >= 700;
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
    color: n.color ?? '#ffffff',
    align: n.align ?? 'center',
    fontStyle: bold ? 'bold' : 'normal',
  });
  t.setOrigin(originXFor(n.align), 0.5);
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  if (n.shadow) t.setShadow(n.shadowX ?? 2, n.shadowY ?? 2, n.shadowColor ?? '#000000', n.shadowBlur ?? 2, false, true);
  return t;
}

/** 라운드 사각형(Phaser Rectangle 은 모서리 반경 미지원 → Graphics, 중심 기준 배치). */
function makeRect(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Graphics {
  const w = n.w ?? 10;
  const h = n.h ?? 10;
  const rad = Math.min(n.radius ?? 0, w / 2, h / 2);
  const g = scene.add.graphics();
  g.fillStyle(Phaser.Display.Color.HexStringToColor(n.fill ?? '#ffffff').color, n.fillAlpha ?? 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, rad);
  if (n.stroke && (n.strokeW ?? 0) > 0) {
    g.lineStyle(n.strokeW ?? 1, Phaser.Display.Color.HexStringToColor(n.stroke).color, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, rad);
  }
  // 중심 기준으로 그렸으므로 위치만 노드 좌표로 — 반응형 재배치(y += extra) 와 호환.
  g.setPosition(n.x, n.y);
  return g;
}

/** 레이아웃 문서를 씬에 생성. 텍스처 누락 image 노드는 건너뛴다(DEV 에서만 경고). */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    let obj: LayoutObject | null = null;
    if (n.type === 'image' && n.key) {
      if (scene.textures.exists(n.key)) {
        const img = scene.add.image(n.x, n.y, n.key).setOrigin(0.5, 0.5);
        if (n.w && n.h) img.setDisplaySize(n.w, n.h);
        obj = img;
      } else if (import.meta.env?.DEV) {
        console.warn(`[layout] texture missing for node ${n.id}: ${n.key}`);
      }
    } else if (n.type === 'rect') {
      obj = makeRect(scene, n);
    } else if (n.type === 'text') {
      obj = makeText(scene, n);
    }
    if (!obj) continue;
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
