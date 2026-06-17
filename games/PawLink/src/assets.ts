/**
 * assets.ts — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지)을 SSOT 로 로드 +
 * 아이템/셀 카탈로그 텍스처 매핑.
 *
 * 화면은 ui/layouts/main.json 이 단일 진실 공급원. 매칭 아이템 = up_PawLink_UI_09-01..10(10종),
 * 셀 슬롯 배경 = up_PawLink_UI_15. 경로 빛/파티클만 런타임 생성.
 */
import type Phaser from 'phaser';
import { ITEM_COUNT } from './logic/levels.js';
import type { ItemType } from './logic/types.js';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 셀 슬롯(빈 칸 배경) 텍스처 — 에디터 업로드 재사용. */
export const SLOT_KEY = 'up_PawLink_UI_15';
/** 클리어/매치 파티클 텍스처(런타임 생성). */
export const SPARK_KEY = 'pl_spark';

/** 아이템 종류(1-based) → 텍스처 키. up_PawLink_UI_09-01 .. -10. */
export function itemTexKey(type: ItemType): string {
  return `up_PawLink_UI_09-${String(type).padStart(2, '0')}`;
}

/** 모든 아이템 텍스처 키(1..ITEM_COUNT). */
export const ITEM_TEX_KEYS: ReadonlyArray<string> = Array.from({ length: ITEM_COUNT }, (_, i) => itemTexKey(i + 1));

/** LoadScene.preload — 에디터 레이아웃 + 매니페스트 + 업로드 이미지 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 매치 파티클용 작은 원 텍스처를 Graphics 로 생성(멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(7, 7, 6);
    g.generateTexture(SPARK_KEY, 14, 14);
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
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%,'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
