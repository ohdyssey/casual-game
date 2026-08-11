/**
 * 에셋 매니페스트 — 에디터(phaser-ui-editor) 산출물 등록 + 의미키 매핑.
 *   · 레이아웃 JSON(main.json) + 업로드 매니페스트(ui-assets.json) → 배경/골대/헤더/HUD(SSOT)
 *   · 말·공·파워업은 의미키(DISC_RED 등)로 참조 — 코드가 물리 바디로 생성.
 *   · 조준 화살표/사거리 링/스파크/그림자는 별도 아트 없이 런타임 Graphics 로 생성.
 */
import type Phaser from 'phaser';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/**
 * 의미키 → 에디터 업로드 키. 무의미한 번호 키를 게임 의미로 매핑(검토 보고 #9 해소).
 * 레드=플레이어(UI_07), 블루=AI(UI_08), 공=UI_09, 스피드=UI_10, 어큐러시=UI_11.
 */
export const TEX = {
  DISC_RED: 'up_SoccerFlick_UI_07', // 레드 디스크(플레이어 말)
  DISC_BLUE: 'up_SoccerFlick_UI_08', // 블루 디스크(AI 말)
  BALL: 'up_SoccerFlick_UI_09', // 축구공
  POWER_SPEED: 'up_SoccerFlick_UI_10', // ⚡ 스피드 파워업
  POWER_ACCURACY: 'up_SoccerFlick_UI_11', // ◎ 어큐러시 파워업
} as const;

/**
 * 에디터가 만든 말·공 목업 노드는 렌더 제외(코드가 생성). 이 텍스처 키를 가진 image 노드는 skip.
 * up_SoccerFlick_UI_07_v2 = 에디터에 배치된 레드 선수 목업(변형 텍스처) — 코드가 레드 말을 생성하므로 제외.
 */
export const CODE_OWNED_KEYS = new Set<string>([TEX.DISC_RED, TEX.DISC_BLUE, TEX.BALL, 'up_SoccerFlick_UI_07_v2']);

/** 런타임 생성 텍스처 키(Graphics). */
export const AIM_DOT_KEY = 'aim_dot'; // 조준 가이드 점
export const SPARK_KEY = 'hit_spark'; // 충돌 스파크

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

/** 조준점/그림자/스파크 텍스처를 Graphics 로 생성(멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  // ── 조준 가이드 점 (작은 흰 원, 16×16) ──
  if (!scene.textures.exists(AIM_DOT_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(8, 8, 5);
    g.lineStyle(2, 0x2f80ed, 0.9);
    g.strokeCircle(8, 8, 6);
    g.generateTexture(AIM_DOT_KEY, 16, 16);
    g.destroy();
  }
  // ── 충돌 스파크 (작은 흰 원, 14×14) ──
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
      fonts.load('700 24px "Jua"', '가나다 0123'),
      fonts.load('400 24px "Jua"', "Red's Turn ABC"),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
