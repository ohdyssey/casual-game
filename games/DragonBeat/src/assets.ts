/**
 * 에셋 매니페스트 — DragonBeat 디자인 데이터(public/assets/)의 단일 등록처.
 * 물/파티클은 별도 아트 없이 런타임 Graphics 로 생성한다(P0).
 */
import type Phaser from 'phaser';

export const LOGO_KEY = 'logo';
export const BOAT_KEY = 'boat';
export const CHR_KEY = 'chr_01';
export const ROWER_ATLAS_KEY = 'rower_atlas';
/** 에디터(phaser-ui-editor) 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';
/** 런타임 생성 텍스처 키. */
export const WATER_KEY = 'water_tile';
export const ROPE_KEY = 'lane_rope';
export const FINISH_KEY = 'finish_line';
export const SPARK_KEY = 'spark';
export const SPRAY_KEY = 'spray';

/**
 * 노젓기 아틀라스 — 트리밍 패킹(투명 여백 제거, d:\tmp\build_dragonbeat_assets.py 로 생성).
 * sourceSize 는 672×672 셀 유지 — 씬의 앵커 픽셀 좌표가 원본 프레임과 동일하다.
 * row_00~10: 패들 들기 → 입수 → 당기기, 한 사이클 = 박자당 1스트로크.
 */
export const ROWER_FRAME = { width: 672, height: 672, count: 11 } as const;

/** 아틀라스 프레임 이름 (zero-pad 2). */
export const rowerFrame = (i: number): string => `row_${String(i).padStart(2, '0')}`;

const IMAGE_MANIFEST: ReadonlyArray<[key: string, path: string]> = [
  // 용선 본체(504×1297, 탑뷰 — 위 = 용머리/원경, 아래 = 북단/근경).
  [BOAT_KEY, 'assets/boat.png'],
  // 드러머(448×597) — 북 위에서 박자를 지휘.
  [CHR_KEY, 'assets/chr_01.png'],
];

const ATLAS_MANIFEST: ReadonlyArray<[key: string, png: string, json: string]> = [
  [ROWER_ATLAS_KEY, 'assets/rower_atlas.png', 'assets/rower_atlas.json'],
];

/** LoadScene.preload 에서 호출 — 디자인 이미지 + 노젓기 아틀라스 + 에디터 UI 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  for (const [key, path] of IMAGE_MANIFEST) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  for (const [key, png, json] of ATLAS_MANIFEST) {
    if (!scene.textures.exists(key)) scene.load.atlas(key, png, json);
  }
  // 에디터 UI — 레이아웃 JSON + 업로드 매니페스트(ui-assets.json)의 이미지 일괄 로드.
  scene.load.json(UI_LAYOUT_KEY, 'ui/layouts/main.json');
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 물/레인/파티클 텍스처를 Graphics 로 생성 (아트 미지급분 대체, 멱등). */
export function ensureGeneratedTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(WATER_KEY)) {
    // 물 타일(128×128) — 베이스 블루 + 밝은 물결 호(가로 줄무늬). tileSprite 로 세로 스크롤.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x1a9ed9, 1);
    g.fillRect(0, 0, 128, 128);
    g.fillStyle(0x35b2e8, 0.5);
    for (let row = 0; row < 4; row++) {
      const y = 16 + row * 32;
      for (let i = 0; i < 4; i++) {
        g.fillEllipse(16 + i * 36 + (row % 2) * 18, y, 26, 7);
      }
    }
    g.fillStyle(0x8fdcff, 0.35);
    for (let row = 0; row < 4; row++) {
      const y = 24 + row * 32;
      for (let i = 0; i < 3; i++) {
        g.fillEllipse(28 + i * 44 + ((row + 1) % 2) * 20, y, 16, 4);
      }
    }
    g.generateTexture(WATER_KEY, 128, 128);
    g.destroy();
  }
  if (!scene.textures.exists(ROPE_KEY)) {
    // 레인 로프(16×64) — 빨강/흰색 교대 부표 라인.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xe63946, 1);
    g.fillRoundedRect(2, 0, 12, 32, 6);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 32, 12, 32, 6);
    g.generateTexture(ROPE_KEY, 16, 64);
    g.destroy();
  }
  if (!scene.textures.exists(FINISH_KEY)) {
    // 결승선(640×48) — 체커보드 배너.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 640, 48);
    g.fillStyle(0x222222, 1);
    for (let cx = 0; cx < 640 / 16; cx++) {
      for (let cy = 0; cy < 3; cy++) {
        if ((cx + cy) % 2 === 0) g.fillRect(cx * 16, cy * 16, 16, 16);
      }
    }
    g.generateTexture(FINISH_KEY, 640, 48);
    g.destroy();
  }
  if (!scene.textures.exists(SPARK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(6, 6, 5);
    g.generateTexture(SPARK_KEY, 12, 12);
    g.destroy();
  }
  if (!scene.textures.exists(SPRAY_KEY)) {
    // 물보라 입자 — 흰 원, 파티클 alpha/scale 로 스플래시 연출.
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xeafbff, 1);
    g.fillCircle(5, 5, 4);
    g.generateTexture(SPRAY_KEY, 10, 10);
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
