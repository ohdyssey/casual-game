/**
 * assets.ts — 에디터 산출물(레이아웃 JSON + 업로드 이미지) 로드 + 게임플레이 카탈로그.
 *
 * 화면 크롬(배경·슬롯기계·HUD·패널·버튼)은 ui/layouts/main.json + ui-assets.json(매니페스트)이 SSOT.
 * **게임플레이 텍스처(슬롯 심볼·매치 퍼즐 타일)는 매니페스트와 별개로 경로 직접 로드**한다 —
 * 디자이너가 에디터에서 매니페스트를 재생성해도 게임 보드/릴이 깨지지 않도록(자체 소유).
 */
import type Phaser from 'phaser';
import { loadSfx } from './audio.js';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
export const UI_LAYOUT_PATH = 'ui/layouts/main.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 업로드 디렉터리(경로 직접 로드용). */
const UPLOAD_DIR = 'ui/uploads';

/**
 * 업로드 에셋 확장자 — **prod 배포본은 WebP**(assemble-deploy 의 다이어트 변환 결과),
 * dev/원본은 PNG. 매니페스트(ui-assets.json)는 배포 시 경로가 .webp 로 재작성되지만,
 * 아래 **하드코딩 직접 로드**(심볼·퍼즐·시트·로비)는 매니페스트를 거치지 않으므로 이 스위치로 분기한다.
 *   (dev 는 항상 png → 디자이너 원본/HMR 무영향.)
 */
const UPLOAD_EXT = import.meta.env?.PROD ? 'webp' : 'png';
/** 업로드 키 → 로드 경로(prod=webp / dev=png). */
export const uploadPath = (key: string): string => `${UPLOAD_DIR}/${key}.${UPLOAD_EXT}`;

/** 슬롯 레버 스프라이트 시트(SC_UI_16-1~8, 각 164×319, 가로 8프레임). */
export const LEVER_SHEET_KEY = 'up_SC_UI_16_sheet';
export const LEVER_FW = 164;
export const LEVER_FH = 319;
export const LEVER_FRAMES = 8;

/** 코인 회전 스프라이트 시트(Coin_01-1~6, 각 146×148, 가로 6프레임). 코인 드랍/버스트 연출용. */
export const COIN_SHEET_KEY = 'up_SC_Coin_01_sheet';
export const COIN_FW = 146;
export const COIN_FH = 148;
export const COIN_FRAMES = 6;

/** 슬롯 릴 심볼 8종(slot.ts SYMBOL_COUNT=8 과 1:1). 인덱스 = 심볼 종류. */
export const SLOT_SYMBOL_KEYS: ReadonlyArray<string> = [
  'up_SC_Symbol_01',
  'up_SC_Symbol_02',
  'up_SC_Symbol_03',
  'up_SC_Symbol_04',
  'up_SC_Symbol_05',
  'up_SC_Symbol_06',
  'up_SC_Symbol_07',
  'up_SC_Symbol_08',
];

/** 매치-3 퍼즐 타일 6종 — 곰인형 젤리(01~04) 제외, 다양한 젤리/캔디(색 6가지 구분).
 *  05 파랑컵 · 07 빨강컵 · 08 분홍하트 · 09 초록캔디 · 10 보라소용돌이 · 14 노랑드롭. */
export const PUZZLE_TILE_KEYS: ReadonlyArray<string> = [
  'up_SC_Puzzle_05',
  'up_SC_Puzzle_07',
  'up_SC_Puzzle_08',
  'up_SC_Puzzle_09',
  'up_SC_Puzzle_10',
  'up_SC_Puzzle_14',
];

/** 대박(10배+) 코인 드랍 카운트업용 컬러 이미지 숫자(Font_01 -2: 골드/레드 3D, 205px). 인덱스=숫자. */
export const BIGWIN_DIGIT_KEYS: ReadonlyArray<string> = Array.from({ length: 10 }, (_, i) => `up_SC_Font_01-${i}-2`);
/** 천단위 콤마 글리프(숫자와 동일 205px 캔버스). */
export const BIGWIN_COMMA_KEY = 'up_SC_Font_01-0-13';

/** SPIN 버튼 상태: 평상시=up_SC_UI_11-1(레이아웃·매니페스트), 눌림=up_SC_UI_11-2(직접 로드). */
export const SPIN_BTN_KEY = 'up_SC_UI_11-1';
export const SPIN_BTN_PRESSED_KEY = 'up_SC_UI_11-2';

/** LoadScene/PlayScene.preload — 레이아웃 + 매니페스트(크롬) + 게임플레이 텍스처(직접) 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
  // 게임플레이 텍스처(슬롯 심볼·퍼즐 타일) + 대박 카운트업 숫자 + SPIN 눌림상태는 매니페스트와 무관하게 직접 적재.
  for (const key of [...SLOT_SYMBOL_KEYS, ...PUZZLE_TILE_KEYS, ...BIGWIN_DIGIT_KEYS, BIGWIN_COMMA_KEY, SPIN_BTN_PRESSED_KEY]) {
    if (!scene.textures.exists(key)) scene.load.image(key, uploadPath(key));
  }
  // 슬롯 레버 애니메이션 스프라이트 시트(당김→복귀). 시트는 다이어트에서 리사이즈 제외(프레임 크기 불변).
  if (!scene.textures.exists(LEVER_SHEET_KEY)) {
    scene.load.spritesheet(LEVER_SHEET_KEY, uploadPath(LEVER_SHEET_KEY), {
      frameWidth: LEVER_FW,
      frameHeight: LEVER_FH,
    });
  }
  // 코인 회전 스프라이트 시트(드랍/버스트 연출).
  if (!scene.textures.exists(COIN_SHEET_KEY)) {
    scene.load.spritesheet(COIN_SHEET_KEY, uploadPath(COIN_SHEET_KEY), {
      frameWidth: COIN_FW,
      frameHeight: COIN_FH,
    });
  }
  // 사운드(SFX) 일괄 로드.
  loadSfx(scene);
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
      fonts.load('800 italic 24px "Kanit"', '0123456789$.,+×'), // 정보패널 굵은 이텔릭 숫자
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
