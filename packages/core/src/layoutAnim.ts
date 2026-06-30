/**
 * layoutAnim — phaser-ui-editor 런타임의 공용 래퍼(@casual/core 단일 사본).
 *
 * 에디터가 노드/그룹에 저작한 애니메이션(tween: 맥동·통통·흔들·깜빡·회전 / spring / particle /
 * sprite)을 런타임에 재생한다. 게임의 layoutLoader 가 buildLayout 직후 applyLayoutAnims 를
 * 호출하면 에디터 저작물이 그대로 살아난다(이 호출이 없으면 anim 필드는 무시됨).
 *
 *   · 미지원 카테고리(예: 'wind'/grasswind)는 흔들(sway) 트윈으로 **강등**해 무음 실패를 방지.
 *   · 스프링 적분(scene update tick) + 씬 종료(shutdown) 시 핸들 자동 정리(누수 방지).
 *   · spriteDocClip(굽는 쉐프 등)·도형 채움 로더용 함수(loadSpriteClip/clip/shape)도 여기서 재노출.
 *
 * 벤더는 무타입 JS(packages/core/src/uiEditorRuntime/) → @ts-ignore 로 들여오고 타입은 여기서 부여.
 */
import Phaser from 'phaser';
// @ts-ignore — 무타입 벤더 런타임
import { playLayoutAnims as _playLayoutAnims, playAnimForTargets as _playAnimForTargets, stopLayoutAnims as _stopLayoutAnims } from './uiEditorRuntime/phaser-ui-editor/anim/index.js';
// @ts-ignore
import { loadSpriteClip as _loadSpriteClip, clipNativeSize as _clipNativeSize } from './uiEditorRuntime/phaser-ui-editor/anim/clip/spriteClipRuntime.js';
// @ts-ignore
import { clipToShape as _clipToShape } from './uiEditorRuntime/phaser-ui-editor/render/shapeMask.js';
// @ts-ignore
import { pointsBounds as _pointsBounds } from './uiEditorRuntime/phaser-ui-editor/schema/shapeGeometry.js';

/**
 * 스프라이트 클립(프레임 애니) 로드+재생 — rects/grid 자동, 텍스처 on-demand. layoutLoader 의 spriteDocClip 용.
 * 반환 핸들은 무타입 벤더 구조라 `any` 로 둔다(호출부가 자체 handle 타입으로 .then 받음).
 */
export const loadSpriteClip = _loadSpriteClip as (
  scene: Phaser.Scene,
  ref: string,
  opts: { container: Phaser.GameObjects.Container; clipId?: string; autoPlay?: boolean; anchor?: { x: number; y: number } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

/** 클립 원본 한 프레임 px(컨테이너 스케일 기준). */
export const clipNativeSize = _clipNativeSize as (doc: unknown) => { w: number; h: number };

/** 콘텐츠를 도형(polygon/circle/rect)으로 마스킹. fillClip/fillImage 노드용. */
export const clipToShape = _clipToShape as (
  scene: Phaser.Scene,
  content: Phaser.GameObjects.GameObject,
  cfg: Record<string, unknown>,
) => void;

/** 폴리곤 점들의 바운딩 박스. */
export const pointsBounds = _pointsBounds as (points: ReadonlyArray<{ x: number; y: number }>) => {
  w: number;
  h: number;
  cx: number;
  cy: number;
};

/** 레이아웃 인덱스의 entries() 한 항목(노드+생성된 GameObject). */
export interface LayoutAnimEntry {
  readonly node: { readonly id: string; readonly group?: string; readonly anim?: unknown };
  readonly obj: Phaser.GameObjects.GameObject;
}

/** anim 재생에 필요한 레이아웃 문서의 최소 형태(게임별 LayoutDoc 가 구조적으로 만족). */
export interface LayoutAnimDoc {
  readonly nodes: ReadonlyArray<{ readonly id: string; readonly group?: string; readonly anim?: unknown }>;
  readonly groups?: ReadonlyArray<{ readonly id: string; readonly anim?: unknown }>;
  readonly animEnabled?: boolean;
}

export interface ApplyAnimOpts {
  /** 재생할 트리거(기본 ['idle','enter'] — 상시 루프 + 등장). 'tap'/'exit' 는 호출부에서 개별 발화. */
  readonly triggers?: ReadonlyArray<'idle' | 'enter' | 'exit'>;
  /** 파티클 부모 컨테이너(선택). */
  readonly container?: Phaser.GameObjects.Container | null;
}

/** 재생 제어 핸들 — 씬 종료 시 자동 stop 되지만 수동 제어도 가능. */
export interface LayoutAnimController {
  stop(): void;
  pause(): void;
  resume(): void;
}

type RawAnim = Record<string, unknown> | null | undefined;
const SUPPORTED_CATS = new Set(['none', 'tween', 'spring', 'particle', 'sprite']);

/** 미지원 카테고리(예: 'wind'/grasswind)를 흔들(sway) 트윈으로 강등 — 무음 실패 방지. 표준은 그대로. */
function normalizeAnim(anim: RawAnim): RawAnim {
  if (!anim || typeof anim !== 'object') return anim;
  const cat = anim.category as string | undefined;
  if (!cat || SUPPORTED_CATS.has(cat)) return anim; // 표준 v2 또는 레거시(type) — 그대로
  const wind = (anim.wind as Record<string, unknown> | undefined) ?? {};
  const ampDeg = Math.min(12, Math.max(2, Number(wind.amp) || 5));
  const freq = Number(wind.freq) || 0.5;
  const duration = Math.max(700, Math.min(3000, Math.round(1000 / freq)));
  return {
    category: 'tween',
    trigger: (anim.trigger as string) || 'idle',
    delay: (anim.delay as number) || 0,
    tween: { ease: 'Sine.easeInOut', duration, yoyo: true, repeat: -1, props: { angle: { from: -ampDeg, to: ampDeg } } },
  };
}

interface VendorHandle {
  empty: boolean;
  tick(dt: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

/**
 * 에디터 저작 애니를 레이아웃에 적용 — buildLayout 직후 1회 호출.
 *   entries = LayoutIndex.entries(), doc = 빌드에 쓴 레이아웃 문서.
 * 스프링 적분(update)·씬 종료 정리(shutdown)를 자동 연결한다.
 */
export function applyLayoutAnims(
  scene: Phaser.Scene,
  entries: ReadonlyArray<LayoutAnimEntry>,
  doc: LayoutAnimDoc,
  opts: ApplyAnimOpts = {},
): LayoutAnimController {
  const triggers = opts.triggers ?? (['idle', 'enter'] as const);
  const nodeMap = new Map<string, { objects: Phaser.GameObjects.GameObject[] }>();
  for (const e of entries) {
    if (e?.node?.id && e.obj) nodeMap.set(e.node.id, { objects: [e.obj] });
  }

  // 미지원 카테고리 강등을 위해 anim 정규화된 얕은 복제 문서 구성(원본 불변).
  const normDoc = {
    ...doc,
    nodes: doc.nodes.map((n) => (n.anim ? { ...n, anim: normalizeAnim(n.anim as RawAnim) } : n)),
    groups: (doc.groups ?? []).map((g) => (g.anim ? { ...g, anim: normalizeAnim(g.anim as RawAnim) } : g)),
  };

  const handles: VendorHandle[] = [];
  for (const only of triggers) {
    // 불량 anim 데이터가 레이아웃 구성을 깨지 않도록 트리거별로 격리(로더의 "불량 노드 스킵" 철학과 동일).
    try {
      const h = _playLayoutAnims(scene, nodeMap, normDoc, { only, container: opts.container ?? null }) as VendorHandle;
      if (h && !h.empty) handles.push(h);
      else if (h) _stopLayoutAnims(h);
    } catch (e) {
      if (import.meta.env?.DEV) console.warn(`[layoutAnim] '${only}' 재생 실패:`, e);
    }
  }

  // 스프링 적분(빈 경우 no-op) + 씬 종료 시 전체 정지.
  const onUpdate = (_t: number, dtMs: number): void => {
    for (const h of handles) h.tick(dtMs / 1000);
  };
  const teardown = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    for (const h of handles) {
      try {
        h.stop();
      } catch {
        /* 이미 정리됨 */
      }
    }
    handles.length = 0;
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);

  return {
    stop: teardown,
    pause: () => handles.forEach((h) => h.pause()),
    resume: () => handles.forEach((h) => h.resume()),
  };
}

/** 특정 GameObject 에 anim 을 1회 발화(버튼 tap/enter 등 호출부 트리거용). */
export function triggerNodeAnim(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.GameObject,
  anim: unknown,
  container?: Phaser.GameObjects.Container | null,
): void {
  _playAnimForTargets(scene, [obj], normalizeAnim(anim as RawAnim), container ?? null);
}
