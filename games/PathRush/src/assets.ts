/**
 * 에셋 매니페스트 — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지) 등록처.
 * 격자 셀(슬롯/타일)은 에디터 업로드 텍스처를 재사용하고, 경로 빛/파티클만 런타임 생성.
 */
import type Phaser from 'phaser';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 격자 셀 텍스처(에디터 업로드 재사용). */
export const SLOT_KEY = 'up_PathRush_UI_02_v2'; // 빈 슬롯(움푹한 칸 배경)
export const TILE_KEYS = [
  'up_PathRush_UI_03-1', // 핑크
  'up_PathRush_UI_03-2', // 옐로
  'up_PathRush_UI_03-3', // 퍼플
  'up_PathRush_UI_03-4', // 민트
  'up_PathRush_UI_03-5', // 오렌지
] as const;

/** 런타임 생성 텍스처 키(클리어 파티클). */
export const SPARK_KEY = 'pr_spark';

/** LoadScene.preload 에서 호출 — 에디터 레이아웃 + 업로드 이미지 일괄 로드. */
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

/** 클리어 파티클용 작은 별/원 텍스처를 Graphics 로 생성 (멱등). */
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
