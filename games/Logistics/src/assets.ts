/**
 * 에셋 — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지)을 SSOT 로 로드 +
 * 상품 카탈로그(에디터 item 아트 매핑).
 *
 * 화면은 ui/layouts/main.json 이 단일 진실 공급원. 상품 타일/아이콘은 up_Logistics_item_NN 사용.
 * 아트 미지급 환경 폴백용 생성 텍스처(tile/truck)도 유지(멱등).
 */
import type Phaser from 'phaser';
import type { ProductType } from './logic/types.js';
import { PRODUCT_COUNT } from './logic/types.js';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 폴백 생성 텍스처 키(에디터 아트 누락 시). */
export const TILE_KEY = 'tile';
export const TRUCK_KEY = 'truck';

export interface Product {
  /** 1-based 인덱스(= ProductType). */
  readonly id: ProductType;
  readonly name: string;
  /** 폴백 이모지(아트 미로드 시). */
  readonly emoji: string;
  /** 에디터 item 아트 키. */
  readonly texKey: string;
}

/** 상품 12종 — 에디터 up_Logistics_item_01..12 와 1:1. */
export const PRODUCTS: ReadonlyArray<Product> = Array.from({ length: PRODUCT_COUNT }, (_, i) => {
  const meta = [
    { name: '물', emoji: '💧' },
    { name: '휴지', emoji: '🤧' },
    { name: '사과', emoji: '🍎' },
    { name: '우유', emoji: '🥛' },
    { name: '스낵', emoji: '🍪' },
    { name: '박스', emoji: '📦' },
    { name: '화장지', emoji: '🧻' },
    { name: '바나나', emoji: '🍌' },
    { name: '개껌', emoji: '🦴' },
    { name: '주스', emoji: '🧃' },
    { name: '토마토', emoji: '🍅' },
    { name: '세제', emoji: '🧴' },
  ][i] ?? { name: `상품${i + 1}`, emoji: '📦' };
  return {
    id: i + 1,
    name: meta.name,
    emoji: meta.emoji,
    texKey: `up_Logistics_item_${String(i + 1).padStart(2, '0')}`,
  };
});

export function productById(id: ProductType): Product {
  return PRODUCTS[id - 1] ?? PRODUCTS[0];
}

/**
 * 상품 아이콘 생성 — texKey 아트가 로드돼 있으면 이미지, 아니면 이모지 폴백(원점 중앙).
 */
export function makeProductIcon(
  scene: Phaser.Scene,
  type: ProductType,
  sizePx: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Text {
  const p = productById(type);
  if (p.texKey && scene.textures.exists(p.texKey)) {
    const img = scene.add.image(0, 0, p.texKey);
    img.setDisplaySize(sizePx, sizePx);
    return img;
  }
  return scene.add
    .text(0, 0, p.emoji, { fontSize: `${Math.round(sizePx * 0.82)}px` })
    .setOrigin(0.5);
}

/** LoadScene.preload — 에디터 레이아웃 + 매니페스트 + 업로드 이미지 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 매니페스트 도착 즉시 거기 적힌 업로드 이미지를 같은 로더 사이클에 추가 로드.
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 폴백 보드 셀·트럭 텍스처를 Graphics 로 생성(에디터 아트 누락 대비, 멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TILE_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 100, 100, 22);
    g.generateTexture(TILE_KEY, 100, 100);
    g.destroy();
  }
  if (!scene.textures.exists(TRUCK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(6, 14, 92, 52, 8);
    g.fillRoundedRect(96, 30, 36, 36, 6);
    g.fillStyle(0x2b2b2b, 1);
    g.fillCircle(34, 72, 12);
    g.fillCircle(106, 72, 12);
    g.generateTexture(TRUCK_KEY, 140, 84);
    g.destroy();
  }
}

/** 캔버스 렌더 전 한글 폰트 선로딩(미로드 폰트는 폴백으로 굳음). 실패해도 진행. */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
