/**
 * 에셋 매니페스트 — UI 는 에디터 업로드 매니페스트(ui-assets.json)를 그대로 소비하고,
 * 꼬치 아이템 24종은 assets/items 에서 item_01..item_24 키로 로드한다.
 */
import type Phaser from 'phaser';
import { ITEM_TYPE_COUNT } from './logic/levels.js';

export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 진입화면(홈) 레이아웃 — 게임플레이(main.json)와 별개 캐시 키로 보관. */
export const HOME_LAYOUT_KEY = 'home_layout';
export const HOME_LAYOUT_PATH = 'ui/layouts/blank.json';
/** 스프라이트 문서 레지스트리 — 굽는 쉐프 클립 해석용(시트는 클립 런타임이 on-demand 로드). */
export const UI_SPRITE_INDEX_KEY = 'ui_sprite_index';
export const UI_SPRITE_INDEX_PATH = 'ui/sprites/_index.json';

/** 꼬치 종류(1..24) → 텍스처 키. */
export function itemKey(type: number): string {
  return `item_${String(type).padStart(2, '0')}`;
}

/** LoadScene.preload 에서 호출 — 아이템 + UI 매니페스트 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  for (let t = 1; t <= ITEM_TYPE_COUNT; t++) {
    // WebP(무손실) — PNG 대비 화질 동일하며 용량↓(scripts/optimize-assets.mjs 로 생성).
    scene.load.image(itemKey(t), `assets/items/GK_Item_${String(t).padStart(2, '0')}.webp`);
  }
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 진입화면 레이아웃 + 스프라이트 레지스트리(실패해도 진행 — 게임플레이는 main.json 으로 독립 동작).
  scene.load.json(HOME_LAYOUT_KEY, HOME_LAYOUT_PATH);
  scene.load.json(UI_SPRITE_INDEX_KEY, UI_SPRITE_INDEX_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, unknown>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && typeof path === 'string' && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 캔버스 렌더 전 한글 폰트 선로딩(미로드 폰트는 폴백으로 굳음). 실패해도 진행. */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
