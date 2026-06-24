/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 슬롯매치 레이아웃은 image / rect / text 노드라 벤더 런타임 의존 없이 자체 완결.
 * 노드 좌표·크기는 전부 중심 기준(center-anchored).
 *
 * (형제 게임 PawLink/PathRush/Pickmeup 의 검증된 로더를 그대로 계승 — 디자인이 확정되면 그대로 동작.)
 */
import Phaser from 'phaser';
// 에디터가 노드에 저작한 anim(맥동·흔들·파티클 등) 재생 + 스프라이트 클립(spriteDocClip) 로더 — @casual/core 단일 사본.
import { applyLayoutAnims, loadSpriteClip, clipNativeSize } from '@casual/core';

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
  readonly fillImage?: string; // 이미지 채움(에디터 옵션). 있으면 솔리드 컬러 대신 이미지로 그린다.
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
  readonly fontStyle?: string;
  // spriteDocClip(에디터 스프라이트 애니 — 예: 삐에로 캐릭터). 벤더 런타임이 on-demand 로드.
  readonly spriteDocFile?: string;
  readonly spriteDocId?: string;
  readonly clipId?: string;
  readonly autoPlay?: boolean;
  readonly anchor?: { x: number; y: number };
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

export type LayoutObject =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Graphics
  | Phaser.GameObjects.Text
  | Phaser.GameObjects.Container;

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

export interface BuildLayoutOptions {
  /** true 를 반환하는 노드는 생성하지 않는다(예: 게임이 동적으로 제어할 슬롯 심볼/퍼즐 타일). */
  readonly skip?: (node: LayoutNode) => boolean;
}

/** main.json 문서를 씬에 생성. 텍스처 누락 노드는 건너뛴다(DEV 에서만 경고). */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc, opts: BuildLayoutOptions = {}): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    if (opts.skip?.(n)) continue;
    // 스프라이트 애니(에디터 spriteDocClip — 예: 삐에로 캐릭터). 벤더 런타임으로 컨테이너 렌더(텍스처 on-demand).
    if (n.type === 'spriteDocClip' && (n.spriteDocFile || n.spriteDocId)) {
      const ref = n.spriteDocFile || n.spriteDocId;
      if (ref) {
        const c = scene.add.container(n.x, n.y);
        loadSpriteClip(scene, ref, { container: c, clipId: n.clipId || '', autoPlay: n.autoPlay !== false, anchor: n.anchor })
          .then((h: { doc?: unknown } | null) => {
            if (h && n.w && n.h) {
              const ns = clipNativeSize(h.doc ?? {});
              if (ns.w > 0 && ns.h > 0) c.setScale(n.w / ns.w, n.h / ns.h);
            }
          })
          .catch((e: unknown) => {
            if (import.meta.env?.DEV) console.warn(`[layout] 클립 로드 실패 ${n.id}:`, e);
          });
        c.setDepth(n.depth ?? 0);
        if (n.angle) c.setAngle(n.angle);
        if (n.alpha !== undefined) c.setAlpha(n.alpha);
        if (n.visible === false) c.setVisible(false);
        index.add({ node: n, obj: c });
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
      // 이미지 채움(fillImage)이 지정된 사각형은 솔리드 컬러 박스가 아니라 그 이미지로 그린다.
      //   (에디터의 fillBlur 블러는 런타임 미지원 → 이미지 그대로. 솔리드 파란 박스 오작화 방지.)
      if (n.fillImage && scene.textures.exists(n.fillImage)) {
        const im = scene.add.image(n.x, n.y, n.fillImage);
        if (n.w && n.h) im.setDisplaySize(n.w, n.h);
        im.setOrigin(0.5, 0.5);
        im.setDepth(n.depth ?? 0);
        im.setAlpha(n.alpha ?? n.fillAlpha ?? 1);
        if (n.angle) im.setAngle(n.angle);
        if (n.visible === false) im.setVisible(false);
        index.add({ node: n, obj: im });
        continue;
      }
      // radius 가 있으면 라운드 사각형(Phaser Rectangle 은 모서리 반경 미지원 → Graphics 로 그린다).
      const w = n.w ?? 10;
      const h = n.h ?? 10;
      const rad = Math.min(n.radius ?? 0, w / 2, h / 2);
      const g = scene.add.graphics();
      g.fillStyle(Phaser.Display.Color.HexStringToColor(n.fill ?? '#ffffff').color, n.fillAlpha ?? 1);
      g.fillRoundedRect(n.x - w / 2, n.y - h / 2, w, h, rad);
      if (n.stroke && (n.strokeW ?? 0) > 0) {
        g.lineStyle(n.strokeW ?? 1, Phaser.Display.Color.HexStringToColor(n.stroke).color, 1);
        g.strokeRoundedRect(n.x - w / 2, n.y - h / 2, w, h, rad);
      }
      g.setDepth(n.depth ?? 0);
      if (n.alpha !== undefined) g.setAlpha(n.alpha);
      if (n.visible === false) g.setVisible(false);
      index.add({ node: n, obj: g });
      continue;
    } else if (n.type === 'circle') {
      // 원/타원(에디터 circle 노드 — 예: 팝업 액센트 점). w/h 를 지름으로 중심 기준 그린다.
      const cw = n.w ?? 10;
      const ch = n.h ?? 10;
      const g = scene.add.graphics();
      g.fillStyle(Phaser.Display.Color.HexStringToColor(n.fill ?? '#ffffff').color, n.fillAlpha ?? 1);
      g.fillEllipse(n.x, n.y, cw, ch);
      if (n.stroke && (n.strokeW ?? 0) > 0) {
        g.lineStyle(n.strokeW ?? 1, Phaser.Display.Color.HexStringToColor(n.stroke).color, 1);
        g.strokeEllipse(n.x, n.y, cw, ch);
      }
      g.setDepth(n.depth ?? 0);
      if (n.alpha !== undefined) g.setAlpha(n.alpha);
      if (n.visible === false) g.setVisible(false);
      index.add({ node: n, obj: g });
      continue;
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
  // 에디터 저작 애니를 재생(이 호출이 SSOT 효과의 런타임 스위치).
  applyLayoutAnims(scene, index.entries(), doc);
  return index;
}
