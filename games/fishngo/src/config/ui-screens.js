/**
 * ui-screens.js — 게임 화면 ↔ #uieditor 연결 매니페스트(단일 출처).
 *
 * 각 항목 1개 = "에디터로 편집 가능한 화면 1개". 이 매니페스트가 세 곳을 구동한다:
 *   1) scripts/capture-screen.cjs  — capture 스펙대로 실제 씬을 떠서 시드 JSON 생성
 *   2) src/config/ui-docs.js       — screenToDoc() 로 에디터 문서 목록에 자동 등록
 *   3) docs/UI_EDITOR_INTEGRATION.md — 연결 절차/현황 참조
 *
 * 게임 측 와이어(데이터 바인딩·클릭 핸들러)는 각 씬이 buildChromeFromLayout(sceneChrome) 로 직접 작성
 *   (게임 로직이라 매니페스트엔 두지 않음). 매니페스트는 "어떤 화면을, 어떤 앵커로, 무엇을 캡처하나" 까지.
 *
 * 새 화면 연결 절차는 docs/UI_EDITOR_INTEGRATION.md 참고. 명령: "에디터에 <id> 연결해줘".
 *
 * 필드:
 *   id, name, file(public 기준 저장경로), cacheKey(load.json 키)
 *   captureScene  : 캡처를 뜰 씬 키
 *   reach         : (선택) 캡처 전 그 씬으로 가는 방법 — {sceneStart:{key,data}} | null(부팅 후 기본=홈)
 *   anchor        : 'top' | 'bottom' | 'center'  (sceneChrome 앵커와 동일)
 *   anchorOffset  : (bottom) 화면 하단~프레임중심 거리
 *   frame         : { designW, designH }
 *   sample        : 에디터 바인딩 미리보기 데이터
 *   capture       : 캡처 스펙 — images[] / texts[] / repeat (아래 capture-screen.cjs 가 해석)
 */

// 상단 HUD 캡처 스펙(홈·낚시 공통 — 같은 HUD 구성, 파일은 각자 독립).
const HUD_CAPTURE = {
  images: [
    { key: 'hud_lives_bar',  id: 'lives_bar',   role: 'lives',        name: '하트 막대' },
    { key: 'hud_coin_bar',   id: 'coin_bar',                          name: '코인 막대' },
    { key: 'hud_star',       id: 'star',                              name: '레벨 별' },
    { key: 'hud_quest_board',id: 'quest_board',                       name: '퀘스트 보드' },
    { key: 'btn_menu',       id: 'btn_menu',    role: 'action:menu',  name: '설정 버튼' },
    { key: 'btn_rank',       id: 'btn_rank',    role: 'action:rank',  name: '랭크 버튼' },
    { key: 'bar_progress',   id: 'xp_bar',      pick: 'topmost',      name: 'XP 막대' },
    { key: 'bar_progress',   id: 'nextlife_bg', pick: 'bottommost',   name: '다음생명 막대' },
  ],
  texts: [
    { id: 'nextlife_txt', binding: 'nextLife', contains: 'life',        name: '다음생명 텍스트' },
    { id: 'xp_txt',       binding: 'xp',       contains: '/',           name: 'XP 텍스트' },
    { id: 'gold_txt',     binding: 'gold',     near: { x: 600, y: 38 }, name: '골드' },
    { id: 'level_txt',    binding: 'level',    near: { x: 308, y: 32 }, name: '레벨' },
  ],
};
// 하단 탭바 반복 캡처 스펙(홈·낚시 공통).
const TABS_CAPTURE_REPEAT = {
  tileKey:  'tile_frame_b',
  iconKeys: ['icon_menu_home', 'icon_menu_upgrade', 'icon_menu_album', 'icon_menu_shop'],
  labels:   ['홈', '강화', '도감', '상점'],
  roles:    ['action:home', 'action:upgrade', 'action:album', 'action:shop'],
};

export const UI_SCREENS = [
  {
    id: 'home',
    name: '홈 상단 HUD',
    file: 'ui/layouts/home.json',
    cacheKey: 'layout_home',
    captureScene: 'HomeScene',
    reach: null,                                  // 부팅 후 기본 화면이 홈
    anchor: 'top',
    frame: { designW: 720, designH: 1280 },
    sample: { gold: '1,370', level: '1', xp: '560 / 1000', nextLife: 'Next life in: 18m 24s' },
    capture: HUD_CAPTURE,
  },
  {
    id: 'home_tabs',
    name: '홈 하단 탭바',
    file: 'ui/layouts/home_tabs.json',
    cacheKey: 'layout_home_tabs',
    captureScene: 'HomeScene',
    reach: null,
    anchor: 'bottom',
    anchorOffset: 95,
    frame: { designW: 720, designH: 200 },
    sample: {},
    capture: { repeat: TABS_CAPTURE_REPEAT },
  },
  {
    id: 'fishing',
    name: '낚시 화면 상단 HUD',
    file: 'ui/layouts/fishing.json',
    cacheKey: 'layout_fishing',
    captureScene: 'FishingScene',
    reach: { sceneStart: { key: 'FishingScene', data: { location: 'beach', mode: 'auto' } } },
    anchor: 'top',
    frame: { designW: 720, designH: 1280 },
    sample: { gold: '1,850', level: '1', xp: '0 / 1000', nextLife: 'Next life in: 18m 24s' },
    capture: HUD_CAPTURE,                          // 홈 HUD 와 동일 구성(낚시는 독립 파일)
  },
  {
    id: 'fishing_tabs',
    name: '낚시 화면 하단 탭바',
    file: 'ui/layouts/fishing_tabs.json',
    cacheKey: 'layout_fishing_tabs',
    captureScene: 'FishingScene',
    reach: { sceneStart: { key: 'FishingScene', data: { location: 'beach', mode: 'auto' } } },
    anchor: 'bottom',
    anchorOffset: 95,
    frame: { designW: 720, designH: 200 },
    sample: {},
    capture: { repeat: TABS_CAPTURE_REPEAT },
  },
];

/** id 로 매니페스트 항목 조회. */
export function getScreen(id) { return UI_SCREENS.find((s) => s.id === id) || null; }

/**
 * 매니페스트 항목 → UI_DOCS 문서 형태 변환(에디터 목록 자동 등록용).
 *   실제 노드는 캡처된 file(JSON)에서 로드되므로 getDefault 는 빈 프레임(앵커 메타 포함) 시드.
 */
export function screenToDoc(screen) {
  return {
    id: screen.id,
    name: screen.name,
    file: screen.file,
    wired: true,
    sample: screen.sample || {},
    getDefault: () => ({
      frame: { ...screen.frame },
      ...(screen.anchor === 'bottom' ? { _anchor: 'bottom', _anchorOffset: screen.anchorOffset ?? 95 } : {}),
      nodes: [],
    }),
  };
}
