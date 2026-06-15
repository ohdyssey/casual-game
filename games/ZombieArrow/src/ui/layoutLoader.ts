/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 지원 타입: image / rect / circle / text. 노드 좌표·크기는 전부 중심 기준(center-anchored).
 * spriteDocClip(에디터에 배치된 좀비 클립)은 여기서 의도적으로 건너뛴다 — 런타임에 PlayScene 이
 * 같은 스프라이트 시트로 좀비를 직접 스폰하기 때문(에디터 배치는 디자인 참고용).
 */
import Phaser from 'phaser';

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
  // rect / circle
  readonly fill?: string;
  readonly fillAlpha?: number;
  readonly radius?: number;
  readonly r?: number; // circle 반지름
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontStyle?: string;
  readonly color?: string;
  readonly stroke?: string;
  readonly strokeW?: number;
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

export type LayoutObject =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Arc
  | Phaser.GameObjects.Text;

export interface LayoutEntry {
  readonly node: LayoutNode;
  readonly obj: LayoutObject;
}

/** 생성 결과 — id/group 별 조회. */
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

  byGroup(group: string): LayoutEntry[] {
    return [...this.byIdMap.values()].filter((e) => e.node.group === group);
  }

  setGroupVisible(group: string, visible: boolean): void {
    for (const e of this.byGroup(group)) e.obj.setVisible(visible);
  }

  entries(): LayoutEntry[] {
    return [...this.byIdMap.values()];
  }
}

function makeText(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Text {
  const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
  const bold = n.fontStyle === '700' || n.fontStyle === 'bold' ? 'bold ' : '';
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
    fontStyle: bold.trim() || undefined,
    color: n.color ?? '#ffffff',
    align: 'center',
  });
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  return t;
}

/** main.json 문서를 씬에 생성. 텍스처 누락 노드는 건너뛴다(DEV 에서만 경고). */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
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
    } else if (n.type === 'circle') {
      const fill = Phaser.Display.Color.HexStringToColor(n.fill ?? '#ffffff').color;
      const arc = scene.add.circle(n.x, n.y, n.r ?? n.radius ?? 10, fill, n.fillAlpha ?? 1);
      if (n.stroke && (n.strokeW ?? 0) > 0) {
        const sc = Phaser.Display.Color.HexStringToColor(n.stroke).color;
        arc.setStrokeStyle(n.strokeW ?? 1, sc, 1);
      }
      obj = arc;
    } else if (n.type === 'text') {
      obj = makeText(scene, n);
    }
    if (!obj) continue;
    obj.setOrigin(0.5, 0.5);
    obj.setDepth(n.depth ?? 0);
    if (n.angle) obj.setAngle(n.angle);
    if (n.alpha !== undefined) obj.setAlpha(n.alpha);
    if (n.visible === false) obj.setVisible(false);
    index.add({ node: n, obj });
  }
  return index;
}
