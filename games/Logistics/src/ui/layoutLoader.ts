/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 배송대작전 레이아웃은 전부 image/rect/text 노드(스프라이트 클립 없음)라 벤더 런타임 의존 없이 자체 완결.
 * 노드 좌표·크기는 전부 중심 기준(center-anchored). (Archery layoutLoader 계승.)
 */
import Phaser from 'phaser';
// 에디터가 노드에 저작한 anim(맥동·흔들·파티클 등) 재생 + 스프라이트 클립(캐릭터 애니) — @casual/core 단일 사본.
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
  // text
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
  readonly stroke?: string;
  readonly strokeW?: number;
  // spriteDocClip(캐릭터 스프라이트 애니 — 로비의 여자 캐릭터 등)
  readonly spriteDocFile?: string;
  readonly spriteDocId?: string;
  readonly clipId?: string;
  readonly autoPlay?: boolean;
  readonly anchor?: { x: number; y: number };
  readonly characterId?: string;
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

export type LayoutObject =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Rectangle
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

/**
 * 텍스트 렌더 해상도 — 캔버스 backing store(720×1280, resolution 1)가 고DPI 화면에서 FIT 으로
 * 확대되며 글자가 흐려진다. setResolution(이 값)으로 텍스트를 고배율로 래스터화해 또렷하게.
 */
export function textResolution(): number {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
  return Math.min(4, Math.max(2, Math.ceil(dpr)));
}

function makeText(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Text {
  const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
    color: n.color ?? '#ffffff',
    align: 'center',
  });
  t.setResolution(textResolution()); // 또렷한 글자(고DPI FIT 확대 대비)
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  return t;
}

/** main.json 문서를 씬에 생성. 텍스처 누락 노드는 건너뛴다(DEV 에서만 경고). */
/**
 * 스프라이트 클립(캐릭터 애니) 노드 — 벤더 런타임으로 컨테이너 생성. 텍스처는 런타임이 on-demand 로드.
 * 실패 시 null → 해당 노드만 스킵(화면 구성은 막지 않음).
 */
function buildSpriteClip(scene: Phaser.Scene, n: LayoutNode): Phaser.GameObjects.Container | null {
  const ref = n.spriteDocFile || n.spriteDocId;
  if (!ref) return null;
  try {
    const c = scene.add.container(n.x, n.y);
    loadSpriteClip(scene, ref, { container: c, clipId: n.clipId || '', autoPlay: n.autoPlay !== false, anchor: n.anchor })
      .then((h) => {
        if (h && n.w && n.h) {
          const ns = clipNativeSize(h.doc || {});
          if (ns.w > 0 && ns.h > 0) c.setScale(n.w / ns.w, n.h / ns.h);
        }
      })
      .catch((e: unknown) => {
        if (import.meta.env?.DEV) console.warn(`[layout] 클립 로드 실패 ${n.id}:`, e);
      });
    return c;
  } catch {
    return null;
  }
}

export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    // 스프라이트 클립(캐릭터 애니) — 벤더 런타임 컨테이너.
    if (n.type === 'spriteDocClip' && (n.spriteDocFile || n.spriteDocId)) {
      const c = buildSpriteClip(scene, n);
      if (c) {
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
      const fill = Phaser.Display.Color.HexStringToColor(n.fill ?? '#ffffff').color;
      obj = scene.add.rectangle(n.x, n.y, n.w ?? 10, n.h ?? 10, fill, n.fillAlpha ?? 1);
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
