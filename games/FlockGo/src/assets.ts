/**
 * assets.ts — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지)을 SSOT 로 로드.
 *
 * 화면 크롬은 ui/layouts/main.json 이 단일 진실 공급원. 업로드 이미지는 ui-assets.json(매니페스트)
 * 에서 key→path 로 일괄 적재한다. 양/이펙트 등 동적 오브젝트는 PlayScene 이 코드로 그린다.
 * 디자이너가 에디터에서 이미지를 교체·재배치하면 그대로 반영된다(노드 id 는 바인딩 계약 — 유지 필수).
 */
import type Phaser from 'phaser';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/**
 * 양 스프라이트 — 신규 디자인(그림자 분리판, 438×723). 머리가 아래 = 0°.
 * 에디터 업로드는 자동 버전(_v15…)으로 바뀌므로, 게임은 안정 키(up_FlockGo_sheep)로 복사본을 직접 로드.
 */
export const SHEEP_TEX = 'up_FlockGo_sheep';
/** 양 원본 비율(438×723 = 폭/길이의 역 = 길이/폭) — 표시 폭 = 길이/비율. */
export const SHEEP_TEX_RATIO = 723 / 438;
/** 분리 그림자 실루엣(407×723·회색). 양마다 1개 아래에 깐다. */
export const SHADOW_TEX = 'up_FlockGo_shadow';
export const SHADOW_TEX_RATIO = 723 / 407;
/** 로고 — 클리어/실패 팝업 장식. */
export const LOGO_TEX = 'up_FlockGo_Logo';

/** PlayScene.preload — 에디터 레이아웃 + 매니페스트 + 업로드 이미지 + 양·그림자(안정키) 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 양·그림자는 에디터 버전 churn 과 무관하게 안정 키로 직접 로드.
  if (!scene.textures.exists(SHEEP_TEX)) scene.load.image(SHEEP_TEX, 'ui/uploads/up_FlockGo_sheep.png');
  if (!scene.textures.exists(SHADOW_TEX)) scene.load.image(SHADOW_TEX, 'ui/uploads/up_FlockGo_shadow.png');
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
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%,'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
