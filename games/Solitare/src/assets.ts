/**
 * assets.ts — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지)을 SSOT 로 로드 +
 * 카드/배경 텍스처 키 매핑.
 *
 * 화면은 ui/layouts/{main,home}.json 이 단일 진실 공급원. 업로드 이미지는 ui-assets.json(매니페스트)에서
 * key→path 로 일괄 적재한다.
 *
 * ⚠️ 아직 에셋 디자인 착수 단계 — 카드/배경은 정식 에셋 전까지 씬에서 코드 드로우한다. 아래 텍스처 키 상수는
 *    정식 에셋(에디터 업로드) 착수 시 ui-assets.json 과 동기화할 계약이다. 런타임은 텍스처 누락을 방어한다.
 */
import type Phaser from 'phaser';
import type { Suit, Rank } from './logic/types.js';

/** 에디터 산출물 — 레이아웃 JSON 캐시 키 + 업로드 매니페스트. */
export const UI_MAIN_KEY = 'ui_main';
export const UI_MAIN_PATH = 'ui/layouts/main.json';
export const UI_HOME_KEY = 'ui_home';
// 에디터(GameDevTool)가 편집하는 최신 홈 레이아웃 — 근경/원경/하늘 3층 패럴랙스 배경 반영본.
export const UI_HOME_PATH = 'ui/layouts/home.json';
// **플레이 진입(레벨 엔트리) 팝업** 레이아웃 — 에디터 저작 blank.json(패널·별·보상·플레이 버튼) SSOT.
export const UI_ENTRY_KEY = 'ui_entry';
export const UI_ENTRY_PATH = 'ui/layouts/blank.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/**
 * **업로드 이미지 경로** — PROD(배포·diet-assets 변환 후)는 `.webp`, DEV(원본)는 `.png`.
 *   하드코딩 `this.load.image(key, uploadPath(key))` 에 사용(매니페스트 구동은 diet 가 .webp 재작성).
 */
const UPLOAD_EXT = import.meta.env?.PROD ? 'webp' : 'png';
export const uploadPath = (key: string): string => `ui/uploads/${key}.${UPLOAD_EXT}`;

/** 카드 앞면 텍스처 키(정식 에셋 계약). 예: up_Solitaire_CARD_H1. */
export const cardFaceKey = (suit: Suit, rank: Rank): string => `up_Solitaire_CARD_${suit}${rank}`;
/** 카드 뒷면 텍스처 키. */
export const CARD_BACK_KEY = 'up_Solitaire_CARD_back';

/** 도시 거리 배경(홈·플레이 공용, 이미지 Slitare_BG_Back01). */
export const BACK_BG_KEY = 'up_Solitaire_BG_Back01';
/** 보드 반투명 막 패널(에디터 저작 Slitare_BG_Back02_v2·어두운 프레임) — 플레이 보드 배경. */
export const BOARD_PANEL_KEY = 'up_Slitare_BG_Back02_v2';
export const BOARD_PANEL_PATH = uploadPath('up_Slitare_BG_Back02_v2');
/** 층(상점 스토어front) 아트 키 — 레벨 1..5 = up_Solitaire_BG_01..05. */
export const floorArtKey = (level: number): string => `up_Solitaire_BG_0${((level - 1) % 5) + 1}`;

/**
 * 배경 보행 캐릭터 스프라이트 시트(8방향, 4열×2행) — D:\…\SolitareHeights\Ani → public/char.
 *   각 방향은 정지 포즈 1장뿐이라 걷기 프레임은 없다 → 런타임에서 맥동(bob)으로 걷는 느낌을 준다(pedestrians.ts).
 *   frameW/H = 시트 폭/4·높이/2(정수화). 프레임 순서(행우선 0..7)는 세 시트 공통.
 */
//   ⚠️ char_chef·char_girl 시트는 좌우가 **반대(수평 미러, frame6이 좌향)** → flip:true 로 sprite 를 뒤집어
//      셋 다 동일 프레임 매핑을 쓴다(1·2번 캐릭터 좌우 방향 반대 문제 해결). char_man 만 정상(우향).
export const CHAR_SHEETS: ReadonlyArray<{
  key: string;
  path: string;
  frameW: number;
  frameH: number;
  flip?: boolean;
}> = [
  { key: 'char_chef', path: 'char/Ani_01_01.png', frameW: 255, frameH: 339, flip: true },
  { key: 'char_girl', path: 'char/Ani_01_02.png', frameW: 264, frameH: 353, flip: true },
  { key: 'char_man', path: 'char/Ani_01_03.png', frameW: 238, frameH: 357 },
];

/** 씬 preload — 레이아웃 + 매니페스트 + 업로드 이미지 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_MAIN_KEY, UI_MAIN_PATH);
  scene.load.json(UI_HOME_KEY, UI_HOME_PATH);
  scene.load.json(UI_ENTRY_KEY, UI_ENTRY_PATH); // 플레이 진입 팝업 레이아웃.
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  // 배경 보행 캐릭터 시트(8방향).
  for (const s of CHAR_SHEETS) {
    if (!scene.textures.exists(s.key)) {
      scene.load.spritesheet(s.key, s.path, { frameWidth: s.frameW, frameHeight: s.frameH });
    }
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
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%,'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  } catch {
    /* 폰트 실패 시 시스템 폴백 */
  }
}
