import { SAFE_H, SAFE_W } from './responsiveFrame.js';
/**
 * floorLevels.ts — 층(Floor) 디자인 에디터(design/floor-editor.html)가 저장한 층 구성을 게임이 소비하는 순수 모델.
 *
 * 모델(v2, 1층=마스터 템플릿):
 *   · **template** = facade/roof/glass/interior 의 **전 층 공유 위치·크기**(슬롯). 층마다 이미지만 교체.
 *   · **floor**    = 층 전용 `character` + template 슬롯별 이미지 `overrides`.
 *   · 건물 하단은 모든 층 동일 지점(buildingBottom = DARK_TOP 645)에 정렬.
 *
 * 소비 규칙:
 *   · **홈 타워화면** = facade+roof+glass+character  → 층별 세로 스택(homeBand 높이 = 스택 피치)
 *   · **플레이화면**  = 전체(+ interior)             → 카드 보드가 interior 위에 딜됨
 *   · 렌더 순서(하→상): interior · facade · roof · character · glass  (캐릭터는 유리 뒤)
 *
 * Phaser 무관(순수) — 렌더는 HomeScene/PlayScene 이 `placementsForHome`/`placementsForPlay` 결과를
 * 프레임(1080×2400) 좌표 그대로 이미지로 그린다. 테스트는 vitest.
 */

export const TEMPLATE_LAYERS = ['facade', 'roof', 'glass', 'interior'] as const;
/** 홈 타워에서 쓰는 레이어(외관 — interior 제외). */
export const HOME_LAYERS = ['facade', 'roof', 'glass', 'character'] as const;
/** 플레이 화면에서 쓰는 레이어(전체). */
export const PLAY_LAYERS = ['facade', 'roof', 'glass', 'character', 'interior'] as const;
/** 렌더 스택 하→상(내부 뒤 … 유리 최전면 → 캐릭터가 유리 뒤). */
export const RENDER_ORDER = ['interior', 'facade', 'roof', 'character', 'glass'] as const;

export type TemplateLayerKey = (typeof TEMPLATE_LAYERS)[number];
export type FloorLayerKey = (typeof PLAY_LAYERS)[number];

export const FRAME_W = SAFE_W;
export const FRAME_H = SAFE_H;

/** 배치(요소). 프레임 절대 좌표, x,y = 중심. */
export interface Placement {
  readonly id: string;
  readonly asset: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rot: number;
  readonly flipX: boolean;
}
/** 렌더용 배치(레이어 태그 부여). */
export interface RenderPlacement extends Placement {
  readonly layer: FloorLayerKey;
}

/** 층 문서 — 전 층 공유 template 슬롯의 이미지 override + 층 전용 character. */
export interface FloorDoc {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly character: readonly Placement[];
  readonly overrides: Readonly<Record<TemplateLayerKey, Readonly<Record<string, string>>>>;
}

/** 층 팩(전체 내보내기 산출) — 공유 template + 층별 문서. */
export interface FloorLevelPack {
  readonly kind?: string;
  readonly frame?: { readonly w: number; readonly h: number };
  readonly template: Readonly<Record<TemplateLayerKey, readonly Placement[]>>;
  readonly levels: readonly FloorDoc[];
}

function num(v: unknown, d = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

/** 임의 입력(JSON) → 검증된 Placement. asset 없으면 null. */
function coercePlacement(raw: unknown, idx: number): Placement | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.asset !== 'string' || !o.asset) return null;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `e${idx}`,
    asset: o.asset,
    x: num(o.x, FRAME_W / 2),
    y: num(o.y, FRAME_H / 2),
    w: Math.max(1, num(o.w, 200)),
    h: Math.max(1, num(o.h, 200)),
    rot: num(o.rot, 0),
    flipX: o.flipX === true,
  };
}

function coerceTemplate(raw: unknown): Record<TemplateLayerKey, Placement[]> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<TemplateLayerKey, Placement[]>;
  for (const layer of TEMPLATE_LAYERS) {
    const arr = Array.isArray(o[layer]) ? (o[layer] as unknown[]) : [];
    out[layer] = arr.map((it, i) => coercePlacement(it, i)).filter((p): p is Placement => p !== null);
  }
  return out;
}

function coerceOverrides(raw: unknown): Record<TemplateLayerKey, Record<string, string>> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<TemplateLayerKey, Record<string, string>>;
  for (const layer of TEMPLATE_LAYERS) {
    const m = (o[layer] && typeof o[layer] === 'object' ? o[layer] : {}) as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) if (typeof v === 'string' && v) clean[k] = v;
    out[layer] = clean;
  }
  return out;
}

/** 임의 입력(JSON) → 검증된 FloorDoc. */
export function coerceFloor(raw: unknown, fallbackIndex = 1): FloorDoc {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const index = num(o.index, fallbackIndex) || fallbackIndex;
  const characterRaw = Array.isArray(o.character) ? (o.character as unknown[]) : [];
  return {
    index,
    id: typeof o.id === 'string' && o.id ? o.id : `floor-${String(index).padStart(3, '0')}`,
    name: typeof o.name === 'string' && o.name ? o.name : `${index}층`,
    theme: typeof o.theme === 'string' && o.theme ? o.theme : 'bakery',
    character: characterRaw.map((it, i) => coercePlacement(it, i)).filter((p): p is Placement => p !== null),
    overrides: coerceOverrides(o.overrides),
  };
}

/** 팩(floorLevelPack) → 검증된 { template, levels }. levels 는 index 순 정렬. */
export function coercePack(raw: unknown): FloorLevelPack {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const template = coerceTemplate(o.template);
  const list = Array.isArray(o.levels) ? (o.levels as unknown[]) : [];
  const levels = list
    .map((f, i) => coerceFloor(f, i + 1))
    .sort((a, b) => a.index - b.index);
  return { kind: 'floorLevelPack', frame: { w: FRAME_W, h: FRAME_H }, template, levels };
}

/** template 슬롯 + 층 override 를 합쳐 지정 레이어들의 배치(하→상)로 해석. */
function resolve(pack: FloorLevelPack, floor: FloorDoc, use: readonly FloorLayerKey[]): RenderPlacement[] {
  const out: RenderPlacement[] = [];
  for (const layer of RENDER_ORDER) {
    if (!use.includes(layer)) continue;
    if (layer === 'character') {
      for (const it of floor.character) out.push({ ...it, layer: 'character' });
    } else {
      const slots = pack.template[layer] ?? [];
      const ov = floor.overrides[layer] ?? {};
      for (const s of slots) out.push({ ...s, asset: ov[s.id] ?? s.asset, layer });
    }
  }
  return out;
}

/** 플레이 화면용 전체 배치(하→상). */
export function placementsForPlay(pack: FloorLevelPack, floor: FloorDoc): RenderPlacement[] {
  return resolve(pack, floor, PLAY_LAYERS);
}

/** 홈 타워용 배치 — 외관 레이어만, 세로 `dy` 평행이동(원본 불변). */
export function placementsForHome(pack: FloorLevelPack, floor: FloorDoc, dy = 0): RenderPlacement[] {
  const base = resolve(pack, floor, HOME_LAYERS);
  return dy ? base.map((p) => ({ ...p, y: p.y + dy })) : base;
}

/** 타워 스택 밴드 = 공유 template(facade+roof+glass) 세로 bbox. 전 층 동일. 비면 null. */
export function homeBand(pack: FloorLevelPack): { y0: number; y1: number } | null {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const layer of ['facade', 'roof', 'glass'] as const) {
    for (const s of pack.template[layer] ?? []) {
      y0 = Math.min(y0, s.y - s.h / 2);
      y1 = Math.max(y1, s.y + s.h / 2);
    }
  }
  if (y0 === Infinity) return null;
  return { y0: Math.max(0, y0), y1: Math.min(FRAME_H, y1) };
}

/** 타워 스택 피치(= 밴드 높이). 비면 기본값. */
export function stackPitch(pack: FloorLevelPack): number {
  const b = homeBand(pack);
  return b ? Math.max(1, b.y1 - b.y0) : FRAME_H * 0.4;
}
