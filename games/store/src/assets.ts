import type Phaser from 'phaser';

/**
 * 에셋 매니페스트 — 텍스처 키 ↔ 경로. public/assets/store/ (Vite root 서빙).
 * P1: PNG 직접 로드. M3: WebP 변환 + 매니페스트 자동생성.
 */
export const STORE_ASSETS: Record<string, string> = {
  // 로고 / 로딩
  logo: 'assets/store/Store_Logo_01.png',
  loading: 'assets/store/CG_ST_Loading.png',
  // 배경/구조
  bg_room: 'assets/store/CG_ST_BG_01.png', // 매장 내부 배경
  shelf: 'assets/store/CG_ST_BG_02.png', // 나무 진열장(3×5=15칸)
  shelf12: 'assets/store/CG_ST_BG_02-1.png', // 작은 진열장(3×4=12칸, 저레벨)
  shelf9: 'assets/store/CG_ST_BG_02-2.png', // 작은 진열장(3×3=9칸, 저레벨)
  // 조립식 진열장 부품(9-slice) — Left/Center/Right × 01/02/03. shelfAssembly.partKey 와 일치.
  shelf_left01: 'assets/store/CG_ST_BG_Left01.png',
  shelf_center01: 'assets/store/CG_ST_BG_Center01.png',
  shelf_right01: 'assets/store/CG_ST_BG_Right01.png',
  shelf_left02: 'assets/store/CG_ST_BG_Left02.png',
  shelf_center02: 'assets/store/CG_ST_BG_Center02.png',
  shelf_right02: 'assets/store/CG_ST_BG_Right02.png',
  shelf_left03: 'assets/store/CG_ST_BG_Left03.png',
  shelf_center03: 'assets/store/CG_ST_BG_Center03.png',
  shelf_right03: 'assets/store/CG_ST_BG_Right03.png',
  shelf_one: 'assets/store/CG_ST_BG_one.png', // 독립 단일 칸(상단 요철 돌출용)
  // 진열장 상단 캐릭터(마스코트) — 칸 완성 시 좌단 불/메달 애니메이션은 이후 적용
  neko_01: 'assets/store/Neko_01.png',
  // 하단 전시 행 전시용 상품(저레벨 장식, 게임 무관)
  goods01: 'assets/store/goods01.png',
  goods02: 'assets/store/goods02.png',
  goods03: 'assets/store/goods03.png',
  bar: 'assets/store/CG_ST_BG_03.png', // 크림 바(하단 파워업/슬롯 배경)
  bar_sub: 'assets/store/CG_ST_BG_03-1.png', // 서브 바
  // HUD
  ui_lv: 'assets/store/CG_ST_UI_01.png',
  ui_timer: 'assets/store/CG_ST_UI_02.png',
  ui_score: 'assets/store/CG_ST_UI_03.png',
  ui_pause: 'assets/store/CG_ST_UI_04.png',
  ui_combo: 'assets/store/CG_ST_UI_05.png',
  ui_lock: 'assets/store/CG_ST_UI_06.png',
  ui_star: 'assets/store/CG_ST_UI_07.png',
  ui_add: 'assets/store/CG_ST_UI_08.png',
  ui_clock: 'assets/store/CG_ST_UI_09.png',
  ui_reward_box: 'assets/store/CG_ST_UI_10.png',
  ui_btn_yellow: 'assets/store/CG_ST_UI_11.png',
  ui_btn_blue: 'assets/store/CG_ST_UI_12.png',
  // 상품 (27종) — item_NN = 상품 그리드 위치. levels.ts PRODUCTS 와 1:1.
  item_01: 'assets/store/CG_ST_item_01.png',
  item_02: 'assets/store/CG_ST_item_02.png',
  item_03: 'assets/store/CG_ST_item_03.png',
  item_04: 'assets/store/CG_ST_item_04.png',
  item_05: 'assets/store/CG_ST_item_05.png',
  item_06: 'assets/store/CG_ST_item_06.png',
  item_07: 'assets/store/CG_ST_item_07.png',
  item_08: 'assets/store/CG_ST_item_08.png',
  item_09: 'assets/store/CG_ST_item_09.png',
  item_10: 'assets/store/CG_ST_item_10.png',
  item_11: 'assets/store/CG_ST_item_11.png',
  item_12: 'assets/store/CG_ST_item_12.png',
  item_13: 'assets/store/CG_ST_item_13.png',
  item_14: 'assets/store/CG_ST_item_14.png',
  item_15: 'assets/store/CG_ST_item_15.png',
  item_16: 'assets/store/CG_ST_item_16.png',
  item_17: 'assets/store/CG_ST_item_17.png',
  item_18: 'assets/store/CG_ST_item_18.png',
  item_19: 'assets/store/CG_ST_item_19.png',
  item_20: 'assets/store/CG_ST_item_20.png',
  item_21: 'assets/store/CG_ST_item_21.png',
  item_22: 'assets/store/CG_ST_item_22.png',
  item_23: 'assets/store/CG_ST_item_23.png',
  item_24: 'assets/store/CG_ST_item_24.png',
  item_25: 'assets/store/CG_ST_item_25.png',
  item_26: 'assets/store/CG_ST_item_26.png',
  item_27: 'assets/store/CG_ST_item_27.png',
};

/**
 * 진입화면(HomeScene) UI — phaser-ui-editor 산출물을 SSOT 로 로드.
 *   · 레이아웃 JSON: ui/layouts/blank.json (에디터 화면명 "진입화면")
 *   · 업로드 이미지 매니페스트: ui-assets.json (키 → ui/uploads/*.png)
 */
export const UI_HOME_LAYOUT_KEY = 'ui_home_layout';
export const UI_HOME_LAYOUT_PATH = 'ui/layouts/blank.json';
// 게임플레이 화면(크롬: 배경/헤더/타이머/사이드아이콘/하단메뉴) — 에디터 "플레이 화면"(blank_copy2).
export const UI_PLAY_LAYOUT_KEY = 'ui_play_layout';
export const UI_PLAY_LAYOUT_PATH = 'ui/layouts/blank_copy2.json';
// 결과 팝업 — 에디터 "팝업 성공"(blank_3) / "팝업 실패"(blank_3_copy).
export const UI_WIN_LAYOUT_KEY = 'ui_win_layout';
export const UI_WIN_LAYOUT_PATH = 'ui/layouts/blank_3.json';
export const UI_LOSE_LAYOUT_KEY = 'ui_lose_layout';
export const UI_LOSE_LAYOUT_PATH = 'ui/layouts/blank_3_copy.json';
// 메시지창(토스트) — 에디터 "빈 화면"(blank_4). 패널 + "Msg" 텍스트 노드.
export const UI_MSG_LAYOUT_KEY = 'ui_msg_layout';
export const UI_MSG_LAYOUT_PATH = 'ui/layouts/blank_4.json';
// 일시정지 메뉴 — 에디터 "팝업 메뉴표시"(blank_3_copy_copy). 패널 + 제목 + 버튼 이미지 4개.
export const UI_MENU_LAYOUT_KEY = 'ui_menu_layout';
export const UI_MENU_LAYOUT_PATH = 'ui/layouts/blank_3_copy_copy.json';
export const UI_MANIFEST_KEY = 'ui_assets';
export const UI_MANIFEST_PATH = 'ui-assets.json';

/**
 * preload — 진입화면 + 게임플레이 + 결과팝업 에디터 레이아웃 + 업로드 이미지 매니페스트를 로드.
 * 업로드 이미지는 4개 레이아웃 공통 풀(매니페스트) → 매니페스트 완료 시 한 번에 큐잉.
 */
export function loadHomeUi(scene: Phaser.Scene): void {
  scene.load.json(UI_HOME_LAYOUT_KEY, UI_HOME_LAYOUT_PATH);
  scene.load.json(UI_PLAY_LAYOUT_KEY, UI_PLAY_LAYOUT_PATH);
  scene.load.json(UI_WIN_LAYOUT_KEY, UI_WIN_LAYOUT_PATH);
  scene.load.json(UI_LOSE_LAYOUT_KEY, UI_LOSE_LAYOUT_PATH);
  scene.load.json(UI_MSG_LAYOUT_KEY, UI_MSG_LAYOUT_PATH);
  scene.load.json(UI_MENU_LAYOUT_KEY, UI_MENU_LAYOUT_PATH);
  scene.load.json(UI_MANIFEST_KEY, UI_MANIFEST_PATH);
  scene.load.on(`filecomplete-json-${UI_MANIFEST_KEY}`, () => {
    const manifest = (scene.cache.json.get(UI_MANIFEST_KEY) ?? {}) as Record<string, string>;
    for (const [key, path] of Object.entries(manifest)) {
      if (key && path && !scene.textures.exists(key)) scene.load.image(key, path);
    }
  });
}
