/**
 * 에셋 매니페스트 — UI 는 에디터 업로드 매니페스트(ui-assets.json)를 그대로 소비한다.
 *   유닛/적 스프라이트는 디자인 확정 후 assets/ 에 추가하고 여기서 키를 등록한다.
 *   현재는 UI 매니페스트 + 레이아웃 JSON 만 로드(스켈레톤 단계).
 */
import type Phaser from 'phaser';

export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';
export const LAYOUT_KEY = 'ui_layout';
export const LAYOUT_PATH = 'ui/layouts/main.json';

/**
 * 게임 전용 추가 아트(public/chr/) — 에디터 매니페스트에 아직 없는 6직업 확장분.
 *   원본: D:\캐쥬얼 게임\SumoClash\Chr. 키는 에디터 업로드 규약(up_ 접두)과 통일.
 *   TODO(디자이너): 에디터에 업로드되면 매니페스트로 흡수되고 이 표는 제거 가능.
 */
const EXTRA_ART: Readonly<Record<string, string>> = {
  up_SC_Chr_me_06: 'chr/up_SC_Chr_me_06.png', // 6 Crusher
  up_SC_Chr_em_05: 'chr/up_SC_Chr_em_05.png', // 적 확장(향후)
  'up_SC_UI_015-04': 'chr/up_SC_UI_015-04.png', // 4 Healer 카드
  'up_SC_UI_015-06': 'chr/up_SC_UI_015-06.png', // 6 Crusher 카드
};

/** LoadScene.preload 에서 호출 — 레이아웃 JSON + UI 매니페스트(체인 로드) + 추가 아트. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(LAYOUT_KEY, LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  for (const [key, path] of Object.entries(EXTRA_ART)) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
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
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
