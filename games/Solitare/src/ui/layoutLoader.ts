/**
 * 에디터 레이아웃 로더(간소판) — phaser-ui-editor 가 저장한 ui/layouts/*.json 을 런타임에
 * 그대로 해석해 Phaser 객체로 생성한다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 * image / rect / text 노드라 벤더 런타임 의존 없이 자체 완결. 노드 좌표·크기는 전부 중심 기준(center-anchored).
 *
 * (형제 게임 PawLink/PathRush/Pickmeup 의 검증된 로더를 그대로 계승 — 디자인이 확정되면 그대로 동작.)
 */
import Phaser from 'phaser';
// 에디터가 노드에 저작한 anim(맥동·흔들·파티클 등) 재생 — @casual/core 단일 사본.
import { applyLayoutAnims } from '@casual/core';
import { SAFE_H, SAFE_W, anchorNodes, frameDelta, type AnchorOpts } from '../logic/responsiveFrame.js';
import { viewBounds } from '@casual/core';
import { bottomUiShift, topUiShift } from './safeAreaUi.js';

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
  // path(동선) — 스플라인/폴리라인 웨이포인트(로컬 좌표, 월드 = x+px, y+py). closed=순환.
  readonly points?: ReadonlyArray<{ x: number; y: number }>;
  readonly closed?: boolean;
  readonly tension?: number;
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
  const family = n.fontFamily ? `"${n.fontFamily}", "Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif` : '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';
  const t = scene.add.text(n.x, n.y, n.text ?? '', {
    fontFamily: family,
    fontSize: `${n.fontSize ?? 20}px`,
    color: n.color ?? '#ffffff',
    align: 'center',
  });
  if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2);
  return t;
}

/**
 * 이 로더가 **일부러** 그리지 않는 노드 타입 — 코드가 직접 소비한다.
 *   path(동선): PlayScene.spawnPedestrians 가 points 를 웨이포인트로 읽어 쓴다(그림 아님).
 * 여기 없는 미지의 타입은 아래에서 경고한다.
 */
const NON_RENDERED_TYPES: ReadonlySet<string> = new Set(['path']);

/** 같은 원인으로 매 프레임/매 씬 로그가 도배되지 않도록 1회만 경고. */
const warned = new Set<string>();

function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}

/**
 * 캔버스가 저작 프레임보다 클 때 늘어난 여분(dW/dH)을 노드별로 흡수시킨 **새 문서**를 돌려준다.
 *
 * ⚠️ **렌더 직전 한 번만** 이 함수를 통과시키고, 그 뒤로는 반환된 문서만 읽을 것. 씬이 좌표를
 *   재는 곳(보드 영역·동선·게이지 등)이 여러 군데라, 렌더만 앵커하고 측정은 원본에서 하면
 *   보드와 아트가 서로 어긋난다.
 *
 * · 앵커를 주지 않거나, 저작 프레임이 세이프존(1080×2400)이 아니거나(팝업 720×1600 은
 *   소비처가 `popupScale` 로 따로 매핑한다), 여분이 0이면 **원본 문서를 그대로** 돌려준다
 *   — 현재 고정 캔버스에서는 결과가 100% 동일하다(회귀 없음).
 */
export function anchorDoc(scene: Phaser.Scene, doc: LayoutDoc, anchor: AnchorOpts): LayoutDoc {
  if (doc.frame?.designW !== SAFE_W || doc.frame?.designH !== SAFE_H) return doc;
  // 앵커가 흡수할 여분은 **보이는 영역** 기준이다.
  const v = viewBounds(scene);
  /**
   * 세이프에어리어 반영 — 가장자리 그룹은 침범분만큼 **같은 양**으로 민다(표준: 크기 불변).
   *   · 상단 그룹: 코드 HUD(헤더·배너)와 **동일한 이동량**을 써야 서로 겹치지 않는다.
   *   · 하단 그룹: 프레임 바닥까지 여유가 있으면 0(안 움직인다).
   */
  const nodes = anchorNodes(doc.nodes, frameDelta(v.w, v.h), anchor, {
    top: topUiShift(scene),
    bottom: bottomUiShift(scene),
  });
  return nodes === doc.nodes ? doc : { ...doc, nodes };
}

/**
 * *.json 문서를 씬에 생성. 텍스처 누락·미지원 타입 노드는 건너뛰되 **항상 경고**한다.
 *
 * ⚠️ 이 로더는 에디터(phaser-ui-editor)의 최소 사본이라, 에디터가 새로 지원하는 노드 타입
 *   (field·repeater 등)은 해석하지 못한다. 조용히 사라지면 원인 추적이 사실상 불가능하므로
 *   PROD 에서도 경고를 남긴다 — 화면에서 요소가 안 보이면 콘솔부터 확인할 것.
 */
export function buildLayout(scene: Phaser.Scene, doc: LayoutDoc): LayoutIndex {
  const index = new LayoutIndex(doc);
  for (const n of doc.nodes) {
    let obj: LayoutObject | null = null;
    if (n.type === 'image' && n.key) {
      if (scene.textures.exists(n.key)) {
        const img = scene.add.image(n.x, n.y, n.key);
        if (n.w && n.h) img.setDisplaySize(n.w, n.h);
        obj = img;
      } else {
        warnOnce(`[layout] 텍스처 없음 — 노드 ${n.id}(${n.name ?? ''}) key=${n.key}. 이 노드는 화면에 그려지지 않는다.`);
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
    } else if (n.type === 'image') {
      warnOnce(`[layout] image 노드에 key 가 없다 — ${n.id}(${n.name ?? ''}). 에디터에서 텍스처를 지정할 것.`);
    } else if (!NON_RENDERED_TYPES.has(n.type)) {
      // 에디터가 이 로더보다 앞서 나간 경우(신규 노드 타입). 사본 갱신 전까지는 렌더 불가.
      warnOnce(`[layout] 미지원 노드 타입 "${n.type}" — ${n.id}(${n.name ?? ''}). 이 로더(에디터 런타임 최소 사본)가 해석하지 못해 화면에서 누락된다.`);
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
