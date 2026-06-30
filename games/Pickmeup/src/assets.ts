/**
 * assets.ts — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지)을 SSOT 로 로드 +
 * 차량/슬롯/승객 카탈로그 텍스처 매핑.
 *
 * 화면은 ui/layouts/main.json 이 단일 진실 공급원. 업로드 이미지는 ui-assets.json(매니페스트)에서
 * key→path 로 일괄 적재한다. 색 정렬 퍼즐이라 "색깔 N종" 카탈로그가 핵심(차량·버스·승객 동색 묶음).
 *
 * ⚠️ 아직 에셋 디자인 착수 단계 — 텍스처 키 상수는 디자인 확정 시 ui-assets.json 과 동기화한다.
 *    런타임은 텍스처 누락을 방어하므로(매니페스트가 비어도 부팅됨) 점진적으로 채워 넣으면 된다.
 */
import type Phaser from 'phaser';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/**
 * 색 카탈로그 — 색 정렬 퍼즐의 축. 스크린샷 기준 코어 6색(슬롯/승객 큐와 동색 매칭).
 * 디자인이 색 수를 바꾸면 여기와 ui-assets.json 만 맞추면 된다.
 */
export const COLOR_IDS = ['blue', 'red', 'yellow', 'green', 'pink', 'orange'] as const;
export type ColorId = (typeof COLOR_IDS)[number];

/** 색별 차량(보드 타일) 텍스처 키. up_Pickmeup_CAR_<color>. */
export const carTexKey = (c: ColorId): string => `up_Pickmeup_CAR_${c}`;
/** 색별 버스(슬롯에 들어찬 픽업 버스) 텍스처 키. */
export const busTexKey = (c: ColorId): string => `up_Pickmeup_BUS_${c}`;
/** 색별 승객(대기 큐) 텍스처 키. */
export const passengerTexKey = (c: ColorId): string => `up_Pickmeup_PAX_${c}`;

/** LoadScene/PlayScene.preload — 에디터 레이아웃 + 매니페스트 + 업로드 이미지 일괄 로드. */
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
