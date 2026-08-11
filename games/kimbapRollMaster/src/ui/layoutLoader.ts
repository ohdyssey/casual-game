/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/main.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * 김밥 롤 마스터 레이아웃은 image / rect / text 노드라 벤더 런타임 의존 없이 자체 완결.
 * 노드 좌표·크기는 전부 중심 기준(center-anchored).
 *
 * (형제 게임 PawLink/PathRush/Pickmeup 의 검증된 로더를 그대로 계승 — 디자인이 확정되면 그대로 동작.)
 */
import Phaser from 'phaser';
import { gameText } from './font.js';
// 에디터가 노드에 저작한 anim(맥동·흔들·파티클 등) 재생 — @casual/core 단일 사본.
import { applyLayoutAnims } from '@casual/core';
import { hasWarp, warpedTextureKey } from './warpTexture.js';

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
  /**
   * 텍스트 정렬. ⚠️ **가로 기준점이 정렬을 따라간다** —
   * 에디터는 `left` 면 `x` 를 글상자의 **왼쪽 끝**으로, `center` 면 **가운데**로 내보낸다.
   * 그래서 정렬을 무시하고 전부 가운데 원점으로 두면 왼쪽 정렬 텍스트가 글자 폭의 절반만큼 왼쪽으로 밀린다
   * (메뉴판 레시피가 판 밖으로 삐져나갔다).
   */
  readonly align?: 'left' | 'center' | 'right';
  // 뒤틀기(에디터의 **테이퍼**) — 사다리꼴로 한쪽 끝이 좁아진다. `warpTexture.ts` 가 굽는다.
  readonly warp?: boolean;
  readonly warpTaper?: number;
  readonly warpAxis?: string;
  readonly warpSkewX?: number;
  readonly warpSkewY?: number;
}

export interface LayoutDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<LayoutNode>;
}

export type LayoutObject =
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Graphics
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
  // ⚠️ **저작 글꼴은 쓰지 않는다.** 에디터가 잡아 주는 `Roboto` 에는 한글 글리프가 없어
  //    한글만 브라우저 기본 고딕으로 떨어진다. 화면 전체를 게임 글꼴 한 벌로 통일한다
  //    (크기·색·정렬은 저작대로 둔다).
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    ...gameText(),
    fontSize: `${n.fontSize ?? 20}px`,
    color: n.color ?? '#ffffff',
    align: n.align ?? 'center',
  });
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  return t;
}

/** 정렬에 맞춘 가로 원점 — 에디터가 내보낸 `x` 가 어디를 가리키는지와 짝을 이룬다. */
const ORIGIN_X: Record<string, number> = { left: 0, center: 0.5, right: 1 };

/** main.json 문서를 씬에 생성. 텍스처 누락 노드는 건너뛴다(DEV 에서만 경고). */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    let obj: LayoutObject | null = null;
    if (n.type === 'image' && n.key) {
      if (scene.textures.exists(n.key)) {
        // ⚠️ 저작된 **테이퍼(사다리꼴)** 는 텍스처를 미리 구워 반영한다 — 노드는 그대로 Image 로 남는다.
        const key = (hasWarp(n) ? warpedTextureKey(scene, n.key, n) : null) ?? n.key;
        const img = scene.add.image(n.x, n.y, key);
        if (n.w && n.h) img.setDisplaySize(n.w, n.h);
        obj = img;
      } else if (import.meta.env?.DEV) {
        console.warn(`[layout] texture missing for node ${n.id}: ${n.key}`);
      }
    } else if (n.type === 'rect') {
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
    } else if (n.type === 'text') {
      obj = makeText(scene, n);
    }
    if (!obj) continue;
    // 그림·도형은 언제나 중심 기준. 텍스트만 **저작 정렬을 따라** 가로 기준점을 옮긴다.
    obj.setOrigin(n.type === 'text' ? (ORIGIN_X[n.align ?? 'center'] ?? 0.5) : 0.5, 0.5);
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
