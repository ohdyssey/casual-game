/**
 * assets.ts — 에디터(phaser-ui-editor) 산출물(레이아웃 JSON + 업로드 이미지) 로더 +
 * 게임 소유 연출 텍스처.
 *
 * 화면은 ui/layouts/*.json 이 단일 진실 공급원. 업로드 이미지는 ui-assets.json(매니페스트)에서
 * key→path 로 일괄 적재한다.
 *
 * ⚠️ `public/game/` 은 **게임 소유** 에셋이다. 에디터 업로드(`public/ui/uploads` + `ui-assets.json`)는
 *    `pue export` 가 덮어쓰므로 연출용 이미지를 그쪽에 섞지 않는다.
 *    여기 있는 것들은 에디터 업로드 이름이 실제 그림과 어긋나 있거나(단면 Item_12-*),
 *    아예 업로드되지 않은 것들(당근·참치 스트립)이다.
 *
 * 재료·메뉴 카탈로그는 순수 로직 쪽(`logic/ingredients.ts`, `logic/menu.ts`)에 있다.
 */
import type Phaser from 'phaser';
import { INGREDIENT_IDS, INGREDIENT_STRIP_TEX, INGREDIENT_TRAY_TEX } from './logic/ingredients.js';
import { MENU_IDS, MENU_PIECE_TEX } from './logic/menu.js';
import { COIN_FILES } from './scenes/coinBurst.js';

/** 에디터 산출물 — 레이아웃 JSON + 업로드 매니페스트. */
export const UI_LAYOUT_KEY = 'ui_layout';
/**
 * 조리대(플레이) 화면 = 에디터의 **「조리 화면1」(`main_copy3`)**.
 * ⚠️ 옛 `main.json` 은 더 이상 쓰지 않는다 — 하단 진열이 「길쭉한 용기 7 + 사각용기 5」였던 옛 구성이다.
 * 지금 화면은 **재료 12종이 저마다 아이콘 한 장**으로 두 줄에 놓여 있다.
 */
export const UI_LAYOUT_PATH = 'ui/layouts/main_copy3.json';
/**
 * 썰기 화면(main_copy) — 조리대 화면과 같은 무대에 "썰기 상태"를 저작한 것.
 * 여기서 **말린 김밥과 칼집 8개의 위치가 진실**이라, 그 노드만 골라 main 위에 얹는다.
 */
export const UI_CUT_LAYOUT_KEY = 'ui_layout_cut';
export const UI_CUT_LAYOUT_PATH = 'ui/layouts/main_copy.json';

/** 말기 1·2단계 화면 — 김이 말려 가는 중간 모습의 키프레임. */
export const UI_ROLL1_LAYOUT_KEY = 'ui_layout_roll1';
export const UI_ROLL1_LAYOUT_PATH = 'ui/layouts/main_copy2.json';
export const UI_ROLL2_LAYOUT_KEY = 'ui_layout_roll2';
export const UI_ROLL2_LAYOUT_PATH = 'ui/layouts/main_copy2_copy.json';

/** 마무리(참기름·깨소금) 화면 — 손 두 개의 지나가는 높이가 여기 저작돼 있다. */
export const UI_SEASON_LAYOUT_KEY = 'ui_layout_season';
export const UI_SEASON_LAYOUT_PATH = 'ui/layouts/main_copy2_copy2.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/** 밥통을 눌렀을 때 김 위에 올라가는 밥덩이(Item_06-1). */
export const TEX_RICE_LUMP = 'game_rice_lump';

/**
 * 게임 소유 텍스처 — `public/game/` 에서 직접 읽는다.
 *
 * ⚠️⚠️ **재료·메뉴 그림은 목록을 손으로 적지 않는다.** 재료 23종 × 2장(진열 덩어리 + 김 위 스트립)에
 * 김밥 단면 16장이라 예순 줄이 넘고, 카탈로그에 재료를 하나 더할 때마다 여기 적는 걸 잊으면
 * **그 재료만 화면에서 사라진다**(텍스처가 없으면 조용히 안 그려진다). 그래서 카탈로그에서 뽑는다.
 *   · `game_tray_<재료>`  ← `public/game/tray_<재료>.png`  (원본 `Img/Item/Menu/Menu_NN.png`)
 *   · `game_strip_<재료>` ← `public/game/strip_<재료>.png` (원본 `Menu_NN-1.png`)
 *   · `game_piece_<메뉴>` ← `public/game/piece_<메뉴>.png` (원본 `Roll_NN.png`)
 */
const CATALOG_TEXTURES: ReadonlyArray<readonly [string, string]> = [
  ...INGREDIENT_IDS.flatMap(
    (id) =>
      [
        [INGREDIENT_TRAY_TEX[id], `game/tray_${id}.png`],
        [INGREDIENT_STRIP_TEX[id], `game/strip_${id}.png`],
      ] as const,
  ),
  ...MENU_IDS.map((id) => [MENU_PIECE_TEX[id], `game/piece_${id}.png`] as const),
];

const GAME_TEXTURES: ReadonlyArray<readonly [string, string]> = [
  [TEX_RICE_LUMP, 'game/rice_lump.png'],
  // 주문 종류 엠블럼 3종(현장·전화·앱) — 카드 위쪽에 붙는다. 주문마다 코드가 갈아 끼우므로
  // 에디터 업로드(1번만 올라와 있다)가 아니라 **게임 소유**로 둔다. 원본 `Img/UI/UI_06-1~3.png`.
  ['game_order_onsite', 'game/order_onsite.png'], // UI_06-1 현장주문(클립보드+스톱워치)
  ['game_order_phone', 'game/order_phone.png'], // UI_06-2 전화주문(수화기)
  ['game_order_app', 'game/order_app.png'], // UI_06-3 앱주문(스마트폰)
  // 서빙 값을 치를 때 튀어오르는 회전 코인 6프레임 — 솔리테어에서 반입(`scenes/coinBurst.ts`).
  ...COIN_FILES,
  ...CATALOG_TEXTURES,
];

/** PlayScene.preload — 에디터 레이아웃 + 매니페스트 + 업로드 이미지 일괄 로드. */
export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.json(UI_LAYOUT_KEY, UI_LAYOUT_PATH);
  scene.load.json(UI_CUT_LAYOUT_KEY, UI_CUT_LAYOUT_PATH);
  scene.load.json(UI_ROLL1_LAYOUT_KEY, UI_ROLL1_LAYOUT_PATH);
  scene.load.json(UI_ROLL2_LAYOUT_KEY, UI_ROLL2_LAYOUT_PATH);
  scene.load.json(UI_SEASON_LAYOUT_KEY, UI_SEASON_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  for (const [key, path] of GAME_TEXTURES) {
    if (!scene.textures.exists(key)) scene.load.image(key, path);
  }
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}

/** 글꼴 CDN 이 느리거나 죽어도 이만큼만 기다린다 — 그 뒤로는 시스템 폴백으로 부팅한다. */
const FONT_WAIT_MS = 4_000;

/**
 * 캔버스 렌더 전 한글 폰트 선로딩. **반드시 씬을 켜기 전에 끝나야 한다**
 * — 캔버스 텍스트는 만들어지는 순간의 글꼴로 굳어서, 늦게 도착한 Jua 는 반영되지 않는다
 * (그러면 화면 절반이 시스템 고딕으로 그려진 채 남는다). 실패해도 진행한다.
 */
export async function preloadKoreanFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  const load = (async () => {
    await Promise.all([
      fonts.load('400 24px "Do Hyeon"', '가나다 0123 X/:%,'),
      fonts.load('400 24px "Jua"', '가나다 0123'),
      // 화면 전체가 **Jua 볼드**다. Jua 는 굵기가 한 벌뿐이라 브라우저가 합성하는데,
      // 미리 불러 두지 않으면 첫 프레임이 시스템 폰트로 그려졌다가 뒤늦게 바뀐다.
      fonts.load('bold 24px "Jua"', '가나다 0123'),
    ]);
    await fonts.ready;
  })().catch(() => undefined);
  await Promise.race([load, timeout]);
}
