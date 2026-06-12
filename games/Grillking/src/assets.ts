/**
 * 에셋 매니페스트 — UI 는 에디터 업로드 매니페스트(ui-assets.json)를 그대로 소비하고,
 * 꼬치 아이템 24종은 assets/items 에서 item_01..item_24 키로 로드한다.
 */
import type Phaser from 'phaser';
import { ITEM_TYPE_COUNT } from './logic/levels.js';

export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 꼬치 종류(1..24) → 텍스처 키. */
export function itemKey(type: number): string {
  return `item_${String(type).padStart(2, '0')}`;
}

/** LoadScene.preload 에서 호출 — 아이템 + UI 매니페스트 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  for (let t = 1; t <= ITEM_TYPE_COUNT; t++) {
    scene.load.image(itemKey(t), `assets/items/GK_Item_${String(t).padStart(2, '0')}.png`);
  }
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
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
