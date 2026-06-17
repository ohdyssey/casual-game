/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 덕헌트러시 레이아웃은 전부 image / text 노드라 벤더 런타임 의존 없이 자체 완결.
 * 지원 타입: image / rect / text. 노드 좌표·크기는 전부 중심 기준(center-anchored).
 */
import Phaser from 'phaser';
import { createLayoutAnims, type LayoutAnims } from './layoutAnim.js';

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
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
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
  | Phaser.GameObjects.Text;

export interface LayoutEntry {
  readonly node: LayoutNode;
  readonly obj: LayoutObject;
}

/** 생성 결과 — id/group 별 조회. */
export class LayoutIndex {
  private readonly byIdMap = new Map<string, LayoutEntry>();
  private anims?: LayoutAnims;

  constructor(readonly doc: LayoutDoc) {}

  add(entry: LayoutEntry): void {
    this.byIdMap.set(entry.node.id, entry);
  }

  /** 편집된 애니(바람 등) 러너 부착. */
  attachAnims(a: LayoutAnims): void { this.anims = a; }
  /** 매 프레임 호출 — 편집된 애니 구동. dt(초). 애니 없으면 무동작. */
  tick(dt: number): void { this.anims?.tick(dt); }

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
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
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
    } else if (n.type === 'text') {
      obj = makeText(scene, n);
    } else if (n.type === 'rope' && n.key && scene.textures.exists(n.key)) {
      // 휘는 줄기(rope) — 세로 텍스처 스트립. 바람 애니가 밑동 고정·끝만 휨(layoutAnim). rope 미지원이면 이미지 폴백.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const factory = scene.add as any;
      if (typeof factory.rope === 'function') {
        const w = n.w ?? 60, h = n.h ?? 200;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const N = Math.max(2, Math.min(40, Math.round((n as any).segments ?? 8)));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const src = scene.textures.get(n.key).getSourceImage() as any;
        const fw = (src && src.width) || w, fh = (src && src.height) || h;
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < N; i++) pts.push({ x: 0, y: fh * (i / (N - 1)) });
        const rope = factory.rope(n.x, n.y - h / 2, n.key, null, pts, false);
        rope.setScale(w / fw, h / fh);
        obj = rope as LayoutObject;
      } else {
        const img = scene.add.image(n.x, n.y, n.key);
        if (n.w && n.h) img.setDisplaySize(n.w, n.h);
        obj = img;
      }
    }
    if (!obj) continue;
    if (n.type !== 'rope') obj.setOrigin(0.5, 0.5);   // rope 는 origin 없음(첫 점이 기준)
    obj.setDepth(n.depth ?? 0);
    if (n.angle) obj.setAngle(n.angle);
    if (n.alpha !== undefined) obj.setAlpha(n.alpha);
    if (n.visible === false) obj.setVisible(false);
    index.add({ node: n, obj });
  }
  index.attachAnims(createLayoutAnims(index.entries()));   // 편집된 애니(바람 등) 자동 시작
  return index;
}
