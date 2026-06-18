/**
 * Asset Manifest — Phaser 텍스처 키 ↔ 파일 경로 매핑.
 *
 * UI 조각은 모두 public/ui/ 아래에 위치. Vite 가 그대로 서빙하므로
 * base 경로는 'ui/<filename>.webp' 형태로 사용 (vite.config.js base: './').
 * 이미지 포맷은 전부 WebP — PNG 사용 금지 (모든 새 자산도 WebP 로 추가).
 *
 * 게임플레이 배경(bg_*)은 public/ui/BG/ 하위에 보관 → 'ui/BG/<filename>' 경로.
 *   향후 50개 테마 수중 배경(Fishing_BG_NN)을 이 폴더에 추가 예정.
 *   NN 은 테마 카탈로그 기본 라벨일 뿐 낚시터 순서가 아님(순서는 추후 변경).
 *   로딩 화면 전용 자산은 public/ui/loading/ 하위에 모아둠 (BG 포함).
 *
 * 키 네이밍 규칙:
 *   bg_*       : 배경
 *   panel_*    : 정적 패널/보드/슬롯
 *   btn_*      : 클릭 가능한 버튼
 *   bar_*      : 진행/리소스 막대
 *   hud_*      : HUD 아이콘
 *   meter_*    : 게이지/미터
 *   item_*     : 재료/도감 아이템 (베이지 슬롯 안에 들어가는 아이콘)
 *   tab_*      : 하단 탭 네비게이션 버튼
 */

/**
 * 로딩 화면 전용 자산 — BootScene 에서 최우선으로 먼저 로드.
 * LoadingScene 이 표시될 때 이 자산들이 이미 cache 에 있어야 함.
 */
export const LOADING_ASSETS = {
  loading_bg:      'ui/loading/Loding_BG_01.webp',    // 펭귄+앵무새+보트 풀 씬 (720×1280 cover)
  stage_loading_bg:'ui/loading/Loding_Stage_BG_01.webp', // 스테이지(낚시터) 로딩 배경 — 등대 낮 씬 (720×1280)
  stage_loading_title:'ui/loading/Loading_08.webp',   // "STAGE LOADING" 타이틀 배너 (309×119)
  loading_logo:    'ui/loading/Loading_01_logo_01.webp', // Fish & Go! 로고 (나무판자 버전, 376×354)
  loading_bar_bg:  'ui/loading/Loading_05-1.webp',    // 빈 진행 바 배경 (428×63)
  loading_bar_l:   'ui/loading/Loading_05-2.webp',    // 채움 좌측 캡 (28×27)
  loading_bar_m:   'ui/loading/Loading_05-3.webp',    // 채움 중앙 stretch (175×27)
  loading_bar_r:   'ui/loading/Loading_05-4.webp',    // 채움 우측 캡 (29×27)
  loading_fish_a:  'ui/loading/Loading_06-1.webp',    // 점프 물고기 — 파랑 (228×249)
  loading_fish_b:  'ui/loading/Loading_06-2.webp',    // 점프 물고기 — 주황 (138×154)
  loading_gull_1:  'ui/loading/Loading_07-1.webp',    // 갈매기 (94×69)
  loading_gull_2:  'ui/loading/Loading_07-2.webp',    // 갈매기 (106×62)
  loading_gull_3:  'ui/loading/Loading_07-3.webp',    // 갈매기 (65×91)
};

import { STORY_STAGES, STAGE_CARD_DESC } from './story-catalog.js';
import { ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS } from './items.config.js';

export const ASSETS = {
  // ─── 배경 ───
  bg_play:           'ui/BG/Fishing_BG.webp',          // HomeScene 등 일반 배경
  bg_fishing:        'ui/BG/Fishing_BG_01-2.webp',     // FishingScene 기본 (해변 — beach, 배경 교체본)
  bg_fishing_hk:     'ui/BG/Fishing_BG_02-1.webp',     // FishingScene 홍콩 (hongkong, 배경 교체본)
  bg_fishing_glacier:'ui/BG/Fishing_BG_03.webp',       // FishingScene 빙하 (glacier)
  bg_result:         'ui/BG/result_BG.webp',           // RESULT 화면 배경 (수직 산호초)

  // ─── RESULT 화면 ───
  result_header:    'ui/Fishing_UI_31.webp',     // RESULT 헤더 + FINAL SCORE 박스
  result_breakdown: 'ui/Fishing_UI_32.webp',     // SCORE BREAKDOWN 박스
  result_rewards:   'ui/Fishing_UI_33.webp',     // REWARDS 박스
  btn_home:         'ui/Fishing_UI_34.webp',     // HOME (녹색)
  btn_play_again:   'ui/Fishing_UI_35.webp',     // PLAY AGAIN (빨강)

  // ─── 패널 (게임플레이) ───
  panel_wood_board: 'ui/Fishing_UI_01.webp',     // 나무 헤더 보드
  panel_craft_body: 'ui/Fishing_UI_02.webp',     // CRAFT NEW BAIT 본문 패널
  panel_slot:       'ui/Fishing_UI_20.webp',     // 베이지 정사각 슬롯 (재료/결과)
  // 팝업 배경 프레임 — 금/나무 테두리 + 연파랑 본문 + 하단 나무 널판 (663×1001, 비율 0.662).
  //   블루 컨텐츠 영역 ≈ x[0.06..0.94] y[0.05..0.785], 나무 널판 중심 y≈0.90.
  panel_popup:      'ui/Popup_01.webp',          // ItemPopupScene 배경 패널
  // 팝업 부품 — Popup_01 프레임 위에 합성 (슬롯/버튼).
  slot_hero:        'ui/Popup_05.webp',          // 히어로 아이콘 슬롯 (연파랑, 184×201)
  slot_item:        'ui/Popup_02.webp',          // 아이템 그리드 슬롯 (파랑, 118×117)
  btn_pop_close:    'ui/Popup_03.webp',          // 닫기 ✕ (빨강 원형, 83×83)
  btn_pop_blue:     'ui/Popup_04.webp',          // 파랑 액션 버튼 (209×95)
  btn_pop_green:    'ui/Popup_04-1.webp',        // 초록 액션 버튼 (209×95)
  // 배너 제목 워드아트 (슬롯별).
  poptitle_line:    'ui/Popup_06-1.webp',        // "낚시줄"
  poptitle_bait:    'ui/Popup_06-2.webp',        // "미끼"
  poptitle_reel:    'ui/Popup_06-3.webp',        // "릴"
  poptitle_rod:     'ui/Popup_06-4.webp',        // "낚시대"
  // 히어로 카테고리 아이콘.
  popcat_reel:      'ui/Popup_07-1.webp',        // 릴
  popcat_lure:      'ui/Popup_07-2.webp',        // 루어/미끼 (물고기형)
  popcat_line:      'ui/Popup_07-3.webp',        // 낚시줄 (스풀)
  popcat_rod:       'ui/Popup_07-4.webp',        // 낚시대
  // 능력치 아이콘.
  stat_power:       'ui/Popup_08-1.webp',        // ⚔ 검 (파워/강도)
  stat_vis:         'ui/Popup_08-2.webp',        // 👁 눈 (시야)
  stat_def:         'ui/Popup_08-3.webp',        // 🛡 방패 (방어/드래그/안정)
  stat_depth:       'ui/Popup_08-4.webp',        // ⚓ 닻 (수심/길이)
  stat_speed:       'ui/Popup_08-5.webp',        // ↻ 화살표 (속도/기어/액션)
  // 티어 배지 T1~T6 (번호 각인).
  tier_badge_1:     'ui/Popup_09-1.webp',
  tier_badge_2:     'ui/Popup_09-2.webp',
  tier_badge_3:     'ui/Popup_09-3.webp',
  tier_badge_4:     'ui/Popup_09-4.webp',
  tier_badge_5:     'ui/Popup_09-5.webp',
  tier_badge_6:     'ui/Popup_09-6.webp',
  // 마커 + 강화 별 + 골드 플레이트.
  pop_check:        'ui/Popup_09-7.webp',        // ✓ 보유
  pop_star_on:      'ui/Popup_09-8.webp',        // ★ 강화 채움
  pop_star_off:     'ui/Popup_09-9.webp',        // ☆ 강화 빈
  pop_plate_gold:   'ui/Popup_09-10.webp',       // 골드 바 (재화 플레이트)

  // ─── 버튼 ───
  btn_craft_text:   'ui/Fishing_UI_03.webp',     // 청록 "CRAFT NEW BAIT" 텍스트 캡슐
  btn_cast:         'ui/Fishing_UI_04.webp',     // 큰 오렌지 CAST! 버튼
  btn_side_lures:   'ui/Fishing_UI_06.webp',     // 게임플레이 좌측 LURES 아이콘
  btn_side_rods:    'ui/Fishing_UI_07.webp',     // 게임플레이 우측 RODS 아이콘
  btn_rank:         'ui/Fishing_UI_18.webp',     // 트로피 RANK 버튼
  btn_menu:         'ui/Fishing_UI_19.webp',     // 기어 MENU 버튼

  // ─── 하단 탭 ───
  tab_baits:        'ui/Fishing_UI_08.webp',
  tab_lures:        'ui/Fishing_UI_09.webp',
  tab_rod_parts:    'ui/Fishing_UI_10.webp',
  tab_reels:        'ui/Fishing_UI_11.webp',

  // ─── HUD ───
  hud_lives_bar:    'ui/Fishing_UI_12.webp',     // 하트 5개 컨테이너 + (+)
  hud_heart:        'ui/Fishing_UI_13.webp',     // 빨간 하트 (개별)
  hud_star:         'ui/Fishing_UI_14.webp',     // 노란 별 (레벨)
  bar_progress:     'ui/Fishing_UI_15.webp',     // 파란 진행 트랙
  hud_coin_bar:     'ui/Fishing_UI_16.webp',     // 골드 + 코인 + (+)
  hud_quest_board:  'ui/Fishing_UI_17.webp',     // 데일리 퀘스트 클립보드 + 6/10

  // ─── 게이지 ───
  meter_tension:    'ui/Fishing_UI_05.webp',     // GOOD CATCH! 호형 게이지
  meter_needle:     'ui/Fishing_UI_05-1.webp',   // 게이지 위 좌우 swing 바늘

  // ─── 재료/도감 아이템 ───
  item_shrimp:      'ui/Fishing_UI_21.webp',
  item_shell:       'ui/Fishing_UI_22.webp',
  item_worm:        'ui/Fishing_UI_23.webp',
  item_gem:         'ui/Fishing_UI_24.webp',
  item_fish_blue:   'ui/Fishing_UI_25.webp',
  item_crab:        'ui/Fishing_UI_26.webp',
  item_snail:       'ui/Fishing_UI_27.webp',
  item_squid:       'ui/Fishing_UI_28.webp',
  item_coral:       'ui/Fishing_UI_29.webp',
  item_pearl:       'ui/Fishing_UI_30.webp',

  // ─── 낚시 미끼 (lure) — 작은 미니 luring tackle ───
  // 원본 51×143. 상단=낚시줄 연결점, 하단=미끼 끝(고기 입질 지점).
  lure:             'ui/Fishing_UI_36.webp',

  // ─── 물고기 위 부유 게이지 (사용자 요청) ───
  //   arc tension + 라운드 HP 바. fish 가 PECKING/HOOKED 일 때 머리 위에 표시.
  fish_gauge_arc:      'sprites/fishing_gauge_01.webp',   // 색상 채워진 arc (green→red)
  fish_gauge_needle:   'sprites/fishing_gauge_03.webp',   // 호 위 needle (회전)
  fish_gauge_bar_bg:   'sprites/fishing_gauge_02-1.webp', // HP 바 빈 outline
  fish_gauge_bar_fill: 'sprites/fishing_gauge_02.webp',   // HP 바 색상 채움

  // ─── 유저모드II 신규 아이콘 (사용자 요청) ───
  //   UI_37, UI_38 = 나무 타일 프레임 (아이콘 배경용 — 각 아이콘이 들어가는 사각 액자).
  //   UI_39~46 = 실제 아이콘 (각 타일 안에 들어감).
  tile_frame_a:      'ui/Fishing_UI_37.png',   // 나무 타일 (A — 살짝 가로/둥근)
  tile_frame_b:      'ui/Fishing_UI_38.png',   // 나무 타일 (B — 정사각/돌출)
  //   상단 아이템 (CAST 양옆): 미끼/낚시줄/릴/낚시대
  icon_item_bait:    'ui/Fishing_UI_39.png',   // 미끼 (bobber)
  icon_item_line:    'ui/Fishing_UI_40.png',   // 낚시줄 (spool)
  icon_item_reel:    'ui/Fishing_UI_41.png',   // 릴
  icon_item_rod:     'ui/Fishing_UI_42.png',   // 낚시대
  //   하단 메뉴: 홈/강화/도감/상점
  icon_menu_home:    'ui/Fishing_UI_43.png',   // 홈
  icon_menu_upgrade: 'ui/Fishing_UI_45.png',   // 강화 (녹색 위 화살표)
  icon_menu_album:   'ui/Fishing_UI_44.png',   // 도감 (물고기)
  icon_menu_shop:    'ui/Fishing_UI_46.png',   // 상점 (바구니)

  // ─── 낚시터 카드 (HomeScene 캐러셀) ───
  //   PNG → WebP 변환 완료 (사용자 요청: 모든 이미지 webp).
  //   ⚠ 레거시 통짜 카드 — 신규 동적 카드(LocationCard) 로 대체됨. fallback 으로만 유지.
  card_loc_beach:    'ui/Location_kr_01.webp',  // 해변 낚시터 (레거시 baked)
  card_loc_glacier:  'ui/Location_kr_02.webp',  // 빙하 만 낚시터 (레거시 baked)
  card_loc_hongkong: 'ui/Location_kr_03.webp',  // 홍콩 낚시터 (레거시 baked)

  // ─── 동적 낚시터 카드 조각 (LocationCard 조립용) ───
  //   원본: D:/피시게임/UI/popup/*.png → scripts/convert-ui.cjs 로 WebP 반입 (public/ui/card/).
  //   2번 레퍼런스(펭귄 템플릿) 스타일. card.spec.js 의 분수 좌표로 정밀 배치.
  //   ※ 파일명은 원본 번호 보존(재반입 용이) — 키는 의미 기반.
  card_header:   'ui/card/popup_01.webp',    // 나무 타이틀 배너 (414×131) — 낚시터명
  card_frame:    'ui/card/popup_02.webp',    // 메인 프레임 (408×645) — 로프/골드 보더 + 산호
  card_panel_a:  'ui/card/popup_03.webp',    // 추천 어종 패널 (224×92) — 로프 매듭 상단 (wide)
  card_panel_b:  'ui/card/popup_04.webp',    // 난이도 패널 (139×92) — 코너 장식 (small)
  card_star_on:  'ui/card/popup_05-1.webp',  // 채워진 별 — 골드 (21×22)
  card_star_off: 'ui/card/popup_05-2.webp',  // 빈 별 — 브라운 (21×21)
  card_panel_c:  'ui/card/popup_06.webp',    // 4슬롯 패널 (365×125) — 상세팝업 확장용
  card_slot:     'ui/card/popup_07.webp',    // 아이템 슬롯 (65×64) — 상세팝업 확장용
  card_bar:      'ui/card/popup_08.webp',    // 획득 보상 바 (364×50) — 앵커+컴퍼스 장식
  card_btn:      'ui/card/popup_09.webp',    // 오렌지 액션 버튼 (148×48) — 상세팝업 확장용

  // ─── 낚시터 카드 아트창 (스토리 스테이지 일러스트) ───
  //   원본: D:/피씨앤고/스테이지배경/Stage_NN.png (1448×1086 가로) → 1024×768 WebP 변환.
  //   카드 상단 "창"의 스테이지 대표 일러스트(스토리 장면 + 수중). artKey=card_art_<order>(story-catalog).
  card_art_01:   'ui/card/stage_01.webp',    // 1 두루마리 산호만 (오키나와)
  card_art_02:   'ui/card/stage_02.webp',    // 2 안다만 햇살 라군 (푸켓)
  card_art_03:   'ui/card/stage_03.webp',    // 3 팔라완 동굴 산호문
  card_art_04:   'ui/card/stage_04.webp',    // 4 발리 화산 라군
  card_art_05:   'ui/card/stage_05.webp',    // 5 보르네오 해초정원
  card_art_06:   'ui/card/stage_06.webp',    // 6 몰디브 별빛 아톨
  card_art_07:   'ui/card/stage_07.webp',    // 7 대산호 생명의 장벽 (GBR)
  card_art_08:   'ui/card/stage_08.webp',    // 8 피지 둥근 산호만
  card_art_09:   'ui/card/stage_09.webp',    // 9 파푸아 원시 산호해

  // ─── 미끼/낚시줄 아이콘 (30 + 30 = 60) ───
  //   원본 PNG → WebP 변환 + 폴더 정리 (Bate 오타 → bait).
  //   각 ~5-13KB. items.config.js 의 BAITS / LINES 정의에 매칭. ItemPopup/Equipment 그리드용.
  bait_01: 'ui/Item/bait/bait_01.webp', bait_02: 'ui/Item/bait/bait_02.webp',
  bait_03: 'ui/Item/bait/bait_03.webp', bait_04: 'ui/Item/bait/bait_04.webp',
  bait_05: 'ui/Item/bait/bait_05.webp', bait_06: 'ui/Item/bait/bait_06.webp',
  bait_07: 'ui/Item/bait/bait_07.webp', bait_08: 'ui/Item/bait/bait_08.webp',
  bait_09: 'ui/Item/bait/bait_09.webp', bait_10: 'ui/Item/bait/bait_10.webp',
  bait_11: 'ui/Item/bait/bait_11.webp', bait_12: 'ui/Item/bait/bait_12.webp',
  bait_13: 'ui/Item/bait/bait_13.webp', bait_14: 'ui/Item/bait/bait_14.webp',
  bait_15: 'ui/Item/bait/bait_15.webp', bait_16: 'ui/Item/bait/bait_16.webp',
  bait_17: 'ui/Item/bait/bait_17.webp', bait_18: 'ui/Item/bait/bait_18.webp',
  bait_19: 'ui/Item/bait/bait_19.webp', bait_20: 'ui/Item/bait/bait_20.webp',
  bait_21: 'ui/Item/bait/bait_21.webp', bait_22: 'ui/Item/bait/bait_22.webp',
  bait_23: 'ui/Item/bait/bait_23.webp', bait_24: 'ui/Item/bait/bait_24.webp',
  bait_25: 'ui/Item/bait/bait_25.webp', bait_26: 'ui/Item/bait/bait_26.webp',
  bait_27: 'ui/Item/bait/bait_27.webp', bait_28: 'ui/Item/bait/bait_28.webp',
  bait_29: 'ui/Item/bait/bait_29.webp', bait_30: 'ui/Item/bait/bait_30.webp',

  line_01: 'ui/Item/line/line_01.webp', line_02: 'ui/Item/line/line_02.webp',
  line_03: 'ui/Item/line/line_03.webp', line_04: 'ui/Item/line/line_04.webp',
  line_05: 'ui/Item/line/line_05.webp', line_06: 'ui/Item/line/line_06.webp',
  line_07: 'ui/Item/line/line_07.webp', line_08: 'ui/Item/line/line_08.webp',
  line_09: 'ui/Item/line/line_09.webp', line_10: 'ui/Item/line/line_10.webp',
  line_11: 'ui/Item/line/line_11.webp', line_12: 'ui/Item/line/line_12.webp',
  line_13: 'ui/Item/line/line_13.webp', line_14: 'ui/Item/line/line_14.webp',
  line_15: 'ui/Item/line/line_15.webp', line_16: 'ui/Item/line/line_16.webp',
  line_17: 'ui/Item/line/line_17.webp', line_18: 'ui/Item/line/line_18.webp',
  line_19: 'ui/Item/line/line_19.webp', line_20: 'ui/Item/line/line_20.webp',
  line_21: 'ui/Item/line/line_21.webp', line_22: 'ui/Item/line/line_22.webp',
  line_23: 'ui/Item/line/line_23.webp', line_24: 'ui/Item/line/line_24.webp',
  line_25: 'ui/Item/line/line_25.webp', line_26: 'ui/Item/line/line_26.webp',
  line_27: 'ui/Item/line/line_27.webp', line_28: 'ui/Item/line/line_28.webp',
  line_29: 'ui/Item/line/line_29.webp', line_30: 'ui/Item/line/line_30.webp',

  // 낚시대 아이콘 30종 (PNG → WebP 변환, ~1-2KB 각). items.config.js RODS 매칭.
  rod_01: 'ui/Item/rod/rod_01.webp', rod_02: 'ui/Item/rod/rod_02.webp',
  rod_03: 'ui/Item/rod/rod_03.webp', rod_04: 'ui/Item/rod/rod_04.webp',
  rod_05: 'ui/Item/rod/rod_05.webp', rod_06: 'ui/Item/rod/rod_06.webp',
  rod_07: 'ui/Item/rod/rod_07.webp', rod_08: 'ui/Item/rod/rod_08.webp',
  rod_09: 'ui/Item/rod/rod_09.webp', rod_10: 'ui/Item/rod/rod_10.webp',
  rod_11: 'ui/Item/rod/rod_11.webp', rod_12: 'ui/Item/rod/rod_12.webp',
  rod_13: 'ui/Item/rod/rod_13.webp', rod_14: 'ui/Item/rod/rod_14.webp',
  rod_15: 'ui/Item/rod/rod_15.webp', rod_16: 'ui/Item/rod/rod_16.webp',
  rod_17: 'ui/Item/rod/rod_17.webp', rod_18: 'ui/Item/rod/rod_18.webp',
  rod_19: 'ui/Item/rod/rod_19.webp', rod_20: 'ui/Item/rod/rod_20.webp',
  rod_21: 'ui/Item/rod/rod_21.webp', rod_22: 'ui/Item/rod/rod_22.webp',
  rod_23: 'ui/Item/rod/rod_23.webp', rod_24: 'ui/Item/rod/rod_24.webp',
  rod_25: 'ui/Item/rod/rod_25.webp', rod_26: 'ui/Item/rod/rod_26.webp',
  rod_27: 'ui/Item/rod/rod_27.webp', rod_28: 'ui/Item/rod/rod_28.webp',
  rod_29: 'ui/Item/rod/rod_29.webp', rod_30: 'ui/Item/rod/rod_30.webp',

  // 릴 아이콘 30종 (PNG → WebP 변환, ~8-13KB 각). items.config.js REELS 매칭.
  reel_01: 'ui/Item/reel/reel_01.webp', reel_02: 'ui/Item/reel/reel_02.webp',
  reel_03: 'ui/Item/reel/reel_03.webp', reel_04: 'ui/Item/reel/reel_04.webp',
  reel_05: 'ui/Item/reel/reel_05.webp', reel_06: 'ui/Item/reel/reel_06.webp',
  reel_07: 'ui/Item/reel/reel_07.webp', reel_08: 'ui/Item/reel/reel_08.webp',
  reel_09: 'ui/Item/reel/reel_09.webp', reel_10: 'ui/Item/reel/reel_10.webp',
  reel_11: 'ui/Item/reel/reel_11.webp', reel_12: 'ui/Item/reel/reel_12.webp',
  reel_13: 'ui/Item/reel/reel_13.webp', reel_14: 'ui/Item/reel/reel_14.webp',
  reel_15: 'ui/Item/reel/reel_15.webp', reel_16: 'ui/Item/reel/reel_16.webp',
  reel_17: 'ui/Item/reel/reel_17.webp', reel_18: 'ui/Item/reel/reel_18.webp',
  reel_19: 'ui/Item/reel/reel_19.webp', reel_20: 'ui/Item/reel/reel_20.webp',
  reel_21: 'ui/Item/reel/reel_21.webp', reel_22: 'ui/Item/reel/reel_22.webp',
  reel_23: 'ui/Item/reel/reel_23.webp', reel_24: 'ui/Item/reel/reel_24.webp',
  reel_25: 'ui/Item/reel/reel_25.webp', reel_26: 'ui/Item/reel/reel_26.webp',
  reel_27: 'ui/Item/reel/reel_27.webp', reel_28: 'ui/Item/reel/reel_28.webp',
  reel_29: 'ui/Item/reel/reel_29.webp', reel_30: 'ui/Item/reel/reel_30.webp',
};

/**
 * BGM — Phaser sound 시스템으로 로드 (this.load.audio).
 *   music_01 : 일반 상태 (홈 + FishingScene 평상시).
 *   music_02 : 물고기 끌어올리는 (HOOKED) 상태.
 */
export const AUDIO_ASSETS = {
  music_01: 'sound/music_01.mp3',
  music_02: 'sound/music_02.mp3',
  // 릴 효과음 (3가지 모델) — HOOKED 시 catch 마다 1개 랜덤 선택.
  reel_bright:  'sound/fishing_reel_kiririk_bright_loop.mp3',
  reel_fast:    'sound/fishing_reel_kiririk_fast_loop.mp3',
  reel_tension: 'sound/fishing_reel_kiririk_tension_loop.mp3',
  // 잡기 성공 효과음 (3가지) — 잡을 때마다 1개 랜덤 재생 (loop X).
  success_clear:   'sound/success_big_clear_4s.mp3',
  success_fanfare: 'sound/success_celebration_fanfare_3s.mp3',
  success_jackpot: 'sound/success_coin_jackpot_2s.mp3',
  // 실패 효과음 (3가지) — 실패할 때마다 1개 랜덤 재생.
  fail_line_snap:  'sound/fail_fishing_line_snap_1s.mp3',
  fail_game_over:  'sound/fail_game_over_short_3s.mp3',
  fail_soft_drop:  'sound/fail_soft_drop_2s.mp3',
  // 물튀김 효과음 (3가지) — 잡기 성공 시 1개 랜덤, 작은 볼륨 (사용자 요청).
  splash_crisp:    'sound/fish_catch_chwaaa_arcade_crisp_1s.mp3',
  splash_big:      'sound/fish_catch_chwaaa_big_splash_2s.mp3',
  splash_standard: 'sound/fish_catch_chwaaa_splash_standard_1s.mp3',
};

export const REEL_SFX_KEYS = ['reel_bright', 'reel_fast', 'reel_tension'];
export const SUCCESS_SFX_KEYS = ['success_clear', 'success_fanfare', 'success_jackpot'];
export const FAIL_SFX_KEYS = ['fail_line_snap', 'fail_game_over', 'fail_soft_drop'];
export const SPLASH_SFX_KEYS = ['splash_crisp', 'splash_big', 'splash_standard'];

/**
 * 낚시터 정의 — HomeScene 캐러셀 + FishingScene 진입 시 location 식별.
 *   unlocked: false 면 선택 불가 → 단색 실루엣 표시 + 선택/CAST 차단.
 *
 *   card: 동적 LocationCard 조립 데이터 (card.spec.js + LocationCard.js).
 *     - artKey      : 아트창 스테이지 일러스트 키 (card_art_NN)
 *     - fishIcons   : 추천 어종 아이콘 키 (HomeScene eager 로드 스프라이트만 — lazy 시트 금지)
 *     - difficulty  : 채워진 별 수 (0~3)
 *     - rewardMin/Max : 획득 보상 범위
 *   key(레거시 baked) 는 fallback 으로만 유지.
 */
// ⚠ DEPRECATED·미사용: 아래 _STAGE_V2 는 더 이상 LOCATIONS 빌드에 쓰이지 않는다.
//   스테이지 정본(제목/지역/막/배경번호)은 story-catalog.js 의 STORY_STAGES 로 일원화됨.
//   (LOCATIONS 빌더가 STORY_STAGES 에서 파생.) 스테이지 수정은 story-catalog.js 를 편집할 것.
//   이 배열은 참조되지 않으므로 값이 옛것이어도 무해 — 추후 제거 예정.
const _STAGE_V2_DEPRECATED_UNUSED = [
  null,
  // ── 1막 열대 산호의 각성 (1~11, 시트 1막 권역) ──
  { no: 1,  bgNo: 4,  ko: '두루마리 산호만',        region: '일본 오키나와',         act: 1 },
  { no: 2,  bgNo: 9,  ko: '안다만 햇살 라군',        region: '태국 푸켓 / 안다만해',   act: 1 },
  { no: 3,  bgNo: 10, ko: '팔라완 동굴 산호문',      region: '필리핀 팔라완',         act: 1 },
  { no: 4,  bgNo: 11, ko: '발리 화산 라군',          region: '인도네시아 발리 / 롬복', act: 1 },
  { no: 5,  bgNo: 12, ko: '보르네오 해초정원',      region: '말레이시아 보르네오 사바', act: 1 },
  { no: 6,  bgNo: 13, ko: '몰디브 별빛 아톨',        region: '몰디브 아톨',           act: 1 },
  { no: 7,  bgNo: 17, ko: '대산호 생명의 장벽',      region: '호주 그레이트 배리어 리프', act: 1 },
  { no: 8,  bgNo: 20, ko: '피지 둥근 산호만',        region: '피지 라군',             act: 1 },
  { no: 9,  bgNo: 21, ko: '파푸아 원시 산호해',      region: '파푸아뉴기니 산호해',    act: 1 },
  { no: 10, bgNo: 22, ko: '보라보라 몽환 라군',      region: '타히티 / 보라보라',     act: 1 },
  { no: 11, bgNo: 37, ko: '플로리다 키스 얕은 산호길', region: '미국 플로리다 키스',  act: 1 },
  // ── 2~5막: bgNo 를 각 스테이지 스토리/지역 바이옴에 맞춰 수동 매칭 ──
  //   (온대/켈프/피오르드/민물/운하/빙하 등. 40~50 은 BG 파일 부재 → 테마 맞는 기존 BG 재사용.)
  { no: 12, bgNo: 16, ko: '한국 남해 앞바다',        region: '한국 남해',             act: 2 },
  { no: 13, bgNo: 2,  ko: '제주도 화산 해안',        region: '제주',                 act: 2 },
  { no: 14, bgNo: 3,  ko: '홋카이도 냉수 해역',      region: '일본 홋카이도',         act: 4 },
  { no: 15, bgNo: 31, ko: '저우산 군도',            region: '중국 저우산',           act: 2 },
  { no: 16, bgNo: 6,  ko: '남중국해 연안',          region: '홍콩',                 act: 2 },
  { no: 17, bgNo: 7,  ko: '펑후 제도',              region: '대만',                 act: 2 },
  { no: 18, bgNo: 28, ko: '하롱베이',              region: '베트남',                act: 2 },
  { no: 19, bgNo: 14, ko: '케랄라 백워터',          region: '인도',                 act: 2 },
  { no: 20, bgNo: 15, ko: '스리랑카 남해안',        region: '스리랑카',              act: 2 },
  { no: 21, bgNo: 16, ko: '아라비아해',              region: '오만',                 act: 2 },
  { no: 22, bgNo: 18, ko: '태즈메이니아',            region: '호주',                 act: 3 },
  { no: 23, bgNo: 19, ko: '밀포드 사운드',          region: '뉴질랜드',              act: 3 },
  { no: 24, bgNo: 23, ko: '노르웨이 피오르드',      region: '노르웨이',              act: 4 },
  { no: 25, bgNo: 24, ko: '아이슬란드 화산 해안',    region: '아이슬란드',            act: 4 },
  { no: 26, bgNo: 25, ko: '스코틀랜드 로크',        region: '스코틀랜드',            act: 4 },
  { no: 27, bgNo: 26, ko: '아일랜드 절벽 해안',      region: '아일랜드',              act: 4 },
  { no: 28, bgNo: 27, ko: '프랑스 리비에라',        region: '프랑스',                act: 3 },
  { no: 29, bgNo: 28, ko: '아말피 / 카프리',        region: '이탈리아',              act: 3 },
  { no: 30, bgNo: 33, ko: '산토리니 / 에게해',      region: '그리스',                act: 3 },
  { no: 31, bgNo: 30, ko: '달마티아 해안',          region: '크로아티아',            act: 3 },
  { no: 32, bgNo: 24, ko: '아조레스',              region: '포르투갈',              act: 3 },
  { no: 33, bgNo: 9,  ko: '카나리아 제도',          region: '스페인',                act: 3 },
  { no: 34, bgNo: 34, ko: '운하 낚시',              region: '네덜란드',              act: 4 },
  { no: 35, bgNo: 35, ko: '알래스카 빙하만',        region: '미국 알래스카',         act: 4 },
  { no: 36, bgNo: 32, ko: '밴쿠버섬',              region: '캐나다',                act: 4 },
  { no: 37, bgNo: 36, ko: '오대호',                region: '미국',                 act: 5 },
  { no: 38, bgNo: 38, ko: '루이지애나 습지',        region: '미국 루이지애나',       act: 5 },
  { no: 39, bgNo: 39, ko: '바하마',                region: '바하마',                act: 5 },
  { no: 40, bgNo: 7,  ko: '바하 캘리포니아',        region: '멕시코',                act: 5 },
  { no: 41, bgNo: 8,  ko: '훔볼트 해류',            region: '페루',                 act: 5 },
  { no: 42, bgNo: 5,  ko: '아마존강',              region: '브라질',                act: 5 },
  { no: 43, bgNo: 36, ko: '파타고니아 강·호수',     region: '아르헨티나',            act: 5 },
  { no: 44, bgNo: 6,  ko: '갈라파고스 제도',        region: '에콰도르',              act: 5 },
  { no: 45, bgNo: 4,  ko: '하와이',                region: '미국 하와이',           act: 5 },
  { no: 46, bgNo: 17, ko: '홍해',                  region: '이집트',                act: 5 },
  { no: 47, bgNo: 20, ko: '세이셸',                region: '세이셸',                act: 5 },
  { no: 48, bgNo: 13, ko: '마다가스카르',          region: '마다가스카르',          act: 5 },
  { no: 49, bgNo: 18, ko: '케이프타운',            region: '남아공',                act: 5 },
  { no: 50, bgNo: 29, ko: '북극 아이스 피싱',      region: '북극',                 act: 5 },
];

// 원문(시트) BG 번호 → 텍스처 키 + 파일 경로.
//   BG_01/02/03 = 기존 키(bg_fishing/bg_fishing_hk/bg_fishing_glacier) 재사용.
//   ⚠ Fishing_BG_38·40~50.webp 는 아직 미존재 → story-catalog imageDirection 에 맞는
//     기존 BG 로 치환(아래 _BG_FILE_SUBSTITUTE). 해당 전용 아트 추가 시 치환에서 제거.
const _BG_FILE_SUBSTITUTE = {
  38: 14,  // 루이지애나 늪지(43) → 녹색 민물
  40: 8,   // 바하 캘리포니아 사막심해(44) → 심해 개활
  41: 32,  // 페루 훔볼트 냉류(45) → 켈프/해조
  42: 5,   // 아마존 수몰나무 강(46) → 탁한 녹색 강
  43: 31,  // 파타고니아 투명 계곡호(48) → 맑은 담수 암반
  44: 11,  // 갈라파고스 원시 암초(47) → 화산 암초
  45: 7,   // 하와이 화산해안(13) → 밝은 열대
  46: 9,   // 홍해 붉은 산호협곡(14) → 열대 산호
  47: 27,  // 세이셸 수정 화강암만(15) → 맑은 화강암 암초
  48: 12,  // 마다가스카르 야생 산호(16) → 열대 산호정원
  49: 18,  // 케이프타운 켈프절벽(49) → 켈프 숲
  50: 29,  // 북극 아이스(50) → 빙하 얼음기둥
};
function _bgFromNo(bgNo) {
  const fileNo = _BG_FILE_SUBSTITUTE[bgNo] ?? bgNo;
  const nn = String(fileNo).padStart(2, '0');
  if (fileNo === 1) return { key: 'bg_fishing',          path: 'ui/BG/Fishing_BG_01-2.webp' };
  if (fileNo === 2) return { key: 'bg_fishing_hk',       path: 'ui/BG/Fishing_BG_02-1.webp' };
  if (fileNo === 3) return { key: 'bg_fishing_glacier',  path: 'ui/BG/Fishing_BG_03.webp'   };
  return { key: `bg_stage_${nn}`, path: `ui/BG/Fishing_BG_${nn}.webp` };
}

// ─── 5막 구조 (스토리텔링 시트 v2 기반 추정) ───
//   1막 1~16:  열대 산호의 각성 — 인도-태평양 (clownfish/angelfish/moorishidol 류)
//   2막 17~26: 동아시아·인도양 항로 (mullet/marbled_sole/yellow_tang)
//   3막 27~33: 남반구·지중해 유적 (blue_tang/lion_fish/porcupinefish)
//   4막 34~43: 북대서양·냉수 항로 (flounder/rockfish/half_beak)
//   5막 44~50: 미주·극지 최종 항로 (cutlasfish/whiteshark/horse_mackerel)
const _ACT_INFO = [
  { range:[ 1,16], fish:['sprite_clownfish',  'sprite_angelfish',  'sprite_moorishidol'] },
  { range:[17,26], fish:['sprite_mullet',     'sprite_marbledsole','sprite_yellowtang']  },
  { range:[27,33], fish:['sprite_bluetang',   'sprite_lionfish',   'sprite_porcupinefish']},
  { range:[34,43], fish:['sprite_flounder',   'sprite_rockfish',   'sprite_halfbeak']    },
  { range:[44,50], fish:['sprite_cutlasfish', 'sprite_whiteshark', 'sprite_horsemackerel']},
];
function _actFor(no) {
  for (const a of _ACT_INFO) if (no >= a.range[0] && no <= a.range[1]) return a;
  return _ACT_INFO[0];
}
// 난이도 별 1~3 (기존 카드와 동일 max 3) — 진행도 기반.
function _stageDifficulty(no) {
  if (no <= 15) return 1;
  if (no <= 30) return 2;
  return 3;
}
// 보상 진행도 — stage 1: 150~300, stage 50: 3000~6000.
function _stageReward(no) {
  const min = 100 + no * 60;
  return { min, max: min * 2 };
}

// ─── 스테이지 추천 장착 아이템 — 카드 "장착 아이템" 4슬롯 ───
//   "적정 수준의 필요 아이템": 필수는 아니나 있으면 순조로운 낚시가 가능한 진행도별 장비.
//   각 장비 30종(01~30) → 스테이지 진행도(1~50)에 비례한 아이템 레벨로 선택.
//   표시 순서: 낚시줄 → 미끼 → 릴 → 낚시대.  (전부 ASSETS 로드됨)
// 아이콘 키 → 한글 명칭(카드 슬롯 마우스오버 툴팁용).
const _ITEM_NAME_BY_ICON = (() => {
  const map = {};
  for (const grp of [ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS]) {
    for (const it of Object.values(grp)) if (it.icon) map[it.icon] = it.name;
  }
  return map;
})();
// 스테이지 진행도(1~50) → 아이템 레벨(1~30). 30종을 진행도에 고르게 배분(s1→lv1, s50→lv30).
function _itemLevelForStage(no) {
  const t = (Math.max(1, Math.min(50, no)) - 1) / 49;   // 0..1
  return Math.round(t * 29) + 1;                          // 1..30
}
// 4슬롯 추천 아이템 아이콘 — 낚시줄 → 미끼 → 릴 → 낚시대 (모두 같은 레벨).
function _slotItemsForStage(no) {
  const lv = String(_itemLevelForStage(no)).padStart(2, '0');
  return [`line_${lv}`, `bait_${lv}`, `reel_${lv}`, `rod_${lv}`];
}
// 4슬롯 추천 아이템의 한글 명칭(아이콘과 같은 순서) — 마우스오버 툴팁용.
function _slotItemNamesForStage(no) {
  return _slotItemsForStage(no).map((k) => _ITEM_NAME_BY_ICON[k] || '');
}

// ─── 50 스테이지 LOCATIONS — v2 시트 순서대로 빌드 ───
//   각 스테이지: no(새 순서) + bgNo(원본 BG 파일 번호) + ko(스토리 지역명).
//   1~3 은 id=beach/hongkong/glacier (backward-compat) — 기존 일러스트 card_art_01/02/03 재사용.
//   4~50 은 id=stage_NN (NN = 새 순서) — card_art 미존재 → ivory placeholder 자동 표시.
//   모두 unlocked: true (사용자 요청).
const _LEGACY_ID_MAP = { 1: 'beach', 2: 'hongkong', 3: 'glacier' };

export const LOCATIONS = (() => {
  const arr = [];
  for (const s of [...STORY_STAGES].sort((a, b) => a.order - b.order)) {
    const nn = String(s.order).padStart(2, '0');
    const bg = _bgFromNo(s.originalNo);
    const act = _actFor(s.order);
    const reward = _stageReward(s.order);
    const isLegacy = s.order <= 3;
    const id = _LEGACY_ID_MAP[s.order] || `stage_${nn}`;
    arr.push({
      id, no: s.order, bgNo: s.originalNo,
      name: s.storyName,
      story: { ko: s.storyName, region: s.realRegion, act: s.actId, role: s.role },
      bgKey: bg.key, bgPath: bg.path,
      unlocked: true,
      // 1~3 은 기존 일러스트(card_art_01/02/03) — 카드 art 영역에 실제 이미지 표시.
      // 4~50 은 card_art_NN(미존재) → LocationCard 가 ivory placeholder 자동.
      key: isLegacy ? `card_loc_${id}` : undefined,
      card: {
        artKey:      `card_art_${nn}`,
        description: STAGE_CARD_DESC[s.order] || s.keyEvent,   // 카드 "스테이지 설명" — 플레이어 권유체(존대) 한 줄 소개
        fishIcons:   act.fish,
        difficulty:  _stageDifficulty(s.order),
        rewardMin:   reward.min,
        rewardMax:   reward.max,
        slotItems:     _slotItemsForStage(s.order),       // 카드 "장착 아이템" 4슬롯 추천 장비(낚시줄·미끼·릴·낚시대, 진행도별 티어)
        slotItemNames: _slotItemNamesForStage(s.order),   // 슬롯별 한글 명칭(마우스오버 툴팁용)
      },
    });
  }
  return arr;
})();

/**
 * 크래프트 패널 재료 슬롯 — 새 와이어프레임 기준 2 × 5 그리드 = 10개.
 * 1행: shrimp / shell / worm / gem / fish_blue
 * 2행: crab / snail / squid / coral / pearl
 */
export const CRAFT_INGREDIENTS = [
  // row 1
  { key: 'item_shrimp',    have: 4, need: 2 },
  { key: 'item_shell',     have: 8, need: 2 },
  { key: 'item_worm',      have: 6, need: 2 },
  { key: 'item_gem',       have: 5, need: 1 },
  { key: 'item_fish_blue', have: 3, need: 1 },
  // row 2
  { key: 'item_crab',      have: 2, need: 1 },
  { key: 'item_snail',     have: 7, need: 1 },
  { key: 'item_squid',     have: 1, need: 1 },
  { key: 'item_coral',     have: 4, need: 2 },
  { key: 'item_pearl',     have: 0, need: 1 },
];

export const CRAFT_GRID_COLS = 5;
export const CRAFT_GRID_ROWS = 2;

/**
 * Spritesheet 자산 — 단일 이미지 안에 그리드로 여러 프레임이 있는 자산.
 *
 * key       : Phaser 텍스처 키
 * path      : public/ 기준 상대 경로
 * frameWidth/Height : 각 프레임 픽셀 크기 (원본 이미지 기준)
 */
export const ASSETS_SPRITESHEETS = {
  sprite_clownfish: {
    path: 'sprites/clownfish_swim.webp',
    // 정규 사이즈 1024 × 512 (4 cols × 2 rows, 각 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_bluetang: {
    path: 'sprites/bluetang_swim.webp',
    // clownfish 와 동일 규격 — 1024 × 512 (4 cols × 2 rows, 각 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_porcupinefish: {
    path: 'sprites/porcupinefish_swim.webp',
    // 동일 규격 1024 × 512 (4 × 2, 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_moorishidol: {
    path: 'sprites/moorishidol_swim.webp',
    // 동일 규격 1024 × 512 (4 × 2, 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_parrotfish: {
    path: 'sprites/parrotfish_swim.webp',
    // 동일 규격 1024 × 512 (4 × 2, 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_whiteshark: {
    path: 'sprites/whiteshark_swim.webp',
    // 동일 규격 1024 × 512 (4 × 2, 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_angelfish: {
    path: 'sprites/angelfish_swim.webp',
    // 동일 규격 1024 × 512 (4 × 2, 셀 256×256)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_yellowtang: {
    path: 'sprites/yellow_tang.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 → 4×2 grid 로 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_lionfish: {
    path: 'sprites/lion_fish.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×396 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_halfbeak: {
    path: 'sprites/half_beak.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×509 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_horsemackerel: {
    path: 'sprites/horse_mackerel.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×475 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_filefish: {
    path: 'sprites/filefish.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×396 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_rockfish: {
    path: 'sprites/rockfish.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×509 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_cutlasfish: {
    path: 'sprites/cutlasfish.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×509 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_flounder: {
    path: 'sprites/flounder.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×356 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_marbledsole: {
    path: 'sprites/marbled_sole.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×397 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_mullet: {
    path: 'sprites/mullet.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×396 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  sprite_whiting: {
    path: 'sprites/whiting.webp',
    // 동일 규격 1024 × 512 (원본 1×7 가로시트 1187×454 → 4×2 grid 재구성, 5프레임 사용)
    frameWidth:  256,
    frameHeight: 256,
  },
  // 물 splash 이펙트 — 1024×512 POT (4 cols × 1 row, 셀 256×512)
  // 새 인덱스 0~3 = 기존 1~4 (wispy frame 0 drop). 셀 하단 128px 는 투명 패딩.
  sprite_splash: {
    path: 'sprites/water_splash.webp',
    frameWidth:  256,
    frameHeight: 512,
  },
  // PRESS & HOLD 버튼 — 4 프레임 (idle → 살짝 → 중간 → 풀 press)
  // 4개 개별 PNG (Fishing_btt_01~04) 를 1×4 시트로 합쳤음 (1024×256)
  sprite_castbtn: {
    path: 'ui/Fishing_btt.webp',
    frameWidth:  256,
    frameHeight: 256,
  },
  // 낚시 성공 이펙트 — 1024×1024 (2×2 grid, 각 셀 512×512, 콘텐츠 중앙 정렬)
  // 4 프레임 = 회오리/스월 progression (작음 → 큼 → 최대 → 분산)
  // 주의: 모바일(특히 iOS Safari)은 큰 이미지를 디코딩 시 다운스케일 → 프레임 그리드가
  //       깨져 4개 셀이 한 프레임에 겹쳐 보임. 1MP 이하(1024²)로 유지해야 안전.
  sprite_fish_effect: {
    path: 'sprites/fishing_effect.webp',
    frameWidth:  512,
    frameHeight: 512,
  },

  // 해파리 (감상용 배경 장식) — 위에서 본 맥동 시트. 6프레임 1행, 균일 정사각 셀.
  //   POT 패딩본 → 2048×512 (셀 328, 우/하단 투명 패딩). frame 0..5 만 사용.
  sprite_jellyfish: {
    path: 'sprites/jellyfish_pulse_pot.webp',
    frameWidth:  328,
    frameHeight: 328,
  },
};

/**
 * 애니메이션 정의 — Phaser anims 시스템에 등록할 키와 frame 시퀀스.
 *
 * frames 배열은 spritesheet 의 프레임 인덱스 순서. 시트의 grid 인덱스는
 *   0 1 2 3
 *   4 5 6 7
 *
 * swim cycle (sin wave): center → 약우 → 강우 → 약우 → center → 약좌 → 강좌 → 약좌 → loop
 */
/**
 * 활동량(swim intensity) 에 따라 3 단계 swim 애니메이션:
 *  - slow   : 천천히 유영 (작은 휨만 사용, 강한 휨 프레임 2/5 제외, 느린 fps)
 *  - normal : 보통 속도 (전체 swim cycle, 중간 fps)
 *  - fast   : 빠른 속도/회전 (전체 cycle + 빠른 fps)
 *
 * 프레임 인덱스 매핑 (4×2 grid):
 *   0 1 2 3
 *   4 5 6 7
 *   2 = 강한 우측 휨, 5 = 강한 좌측 휨
 */
export const ANIMATIONS = {
  clownfish_swim_slow: {
    spriteKey: 'sprite_clownfish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],   // 약한 휨만 (큰 휨 2/5 제외)
    frameRate: 5,
    repeat: -1,
  },
  clownfish_swim_normal: {
    spriteKey: 'sprite_clownfish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],   // 전체 sin wave
    frameRate: 9,
    repeat: -1,
  },
  clownfish_swim_fast: {
    spriteKey: 'sprite_clownfish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],   // 강한 휨 위주 + 빠른 fps
    frameRate: 14,
    repeat: -1,
  },

  // 블루탱(파란탱) — clownfish 와 동일한 프레임 매핑/속도 정책 사용
  bluetang_swim_slow: {
    spriteKey: 'sprite_bluetang',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  bluetang_swim_normal: {
    spriteKey: 'sprite_bluetang',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  bluetang_swim_fast: {
    spriteKey: 'sprite_bluetang',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 가시복(porcupinefish) — 둥근 몸 + 느린 헤엄 컨셉에 맞춰 fps 살짝 낮춤
  porcupinefish_swim_slow: {
    spriteKey: 'sprite_porcupinefish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 4,
    repeat: -1,
  },
  porcupinefish_swim_normal: {
    spriteKey: 'sprite_porcupinefish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 7,
    repeat: -1,
  },
  porcupinefish_swim_fast: {
    spriteKey: 'sprite_porcupinefish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 11,
    repeat: -1,
  },

  // 무어리쉬 아이돌 — 우아한 reef 어종, clownfish 와 동일한 fps 패턴
  moorishidol_swim_slow: {
    spriteKey: 'sprite_moorishidol',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  moorishidol_swim_normal: {
    spriteKey: 'sprite_moorishidol',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  moorishidol_swim_fast: {
    spriteKey: 'sprite_moorishidol',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 패럿피쉬 — 큰 몸집의 reef 어종, clownfish 와 동일한 fps 패턴
  parrotfish_swim_slow: {
    spriteKey: 'sprite_parrotfish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  parrotfish_swim_normal: {
    spriteKey: 'sprite_parrotfish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  parrotfish_swim_fast: {
    spriteKey: 'sprite_parrotfish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 백상아리 — 대형 어종, 매우 느리고 유유히 헤엄치는 컨셉 → fps 대폭 낮춤
  whiteshark_swim_slow: {
    spriteKey: 'sprite_whiteshark',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 2,
    repeat: -1,
  },
  whiteshark_swim_normal: {
    spriteKey: 'sprite_whiteshark',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 3,
    repeat: -1,
  },
  whiteshark_swim_fast: {
    spriteKey: 'sprite_whiteshark',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 5,
    repeat: -1,
  },

  // 엔젤피쉬 — 작은 reef 어종, clownfish 와 동일한 fps 패턴
  angelfish_swim_slow: {
    spriteKey: 'sprite_angelfish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  angelfish_swim_normal: {
    spriteKey: 'sprite_angelfish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  angelfish_swim_fast: {
    spriteKey: 'sprite_angelfish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 옐로우탱 — reef 어종, clownfish 와 동일한 fps 패턴
  yellowtang_swim_slow: {
    spriteKey: 'sprite_yellowtang',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  yellowtang_swim_normal: {
    spriteKey: 'sprite_yellowtang',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  yellowtang_swim_fast: {
    spriteKey: 'sprite_yellowtang',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 라이언피쉬 — reef 어종 (만다린/lion-style 패턴), 표준 fps
  lionfish_swim_slow: {
    spriteKey: 'sprite_lionfish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  lionfish_swim_normal: {
    spriteKey: 'sprite_lionfish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  lionfish_swim_fast: {
    spriteKey: 'sprite_lionfish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 할새치(half_beak) — 가는 몸 + 뾰족한 부리, 표면 darting (real-world surface skipper)
  halfbeak_swim_slow: {
    spriteKey: 'sprite_halfbeak',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 6,
    repeat: -1,
  },
  halfbeak_swim_normal: {
    spriteKey: 'sprite_halfbeak',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 11,
    repeat: -1,
  },
  halfbeak_swim_fast: {
    spriteKey: 'sprite_halfbeak',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 16,
    repeat: -1,
  },

  // 대전갱이(horse_mackerel) — schooling fast cruiser
  horsemackerel_swim_slow: {
    spriteKey: 'sprite_horsemackerel',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 6,
    repeat: -1,
  },
  horsemackerel_swim_normal: {
    spriteKey: 'sprite_horsemackerel',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 10,
    repeat: -1,
  },
  horsemackerel_swim_fast: {
    spriteKey: 'sprite_horsemackerel',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 15,
    repeat: -1,
  },

  // 쥐치(filefish) — reef 어종, hovering 가능한 신중한 swimmer
  filefish_swim_slow: {
    spriteKey: 'sprite_filefish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 4,
    repeat: -1,
  },
  filefish_swim_normal: {
    spriteKey: 'sprite_filefish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 7,
    repeat: -1,
  },
  filefish_swim_fast: {
    spriteKey: 'sprite_filefish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 11,
    repeat: -1,
  },

  // 우럭(rockfish) — reef 거주, 거의 hovering, 느린 fps
  rockfish_swim_slow: {
    spriteKey: 'sprite_rockfish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 3,
    repeat: -1,
  },
  rockfish_swim_normal: {
    spriteKey: 'sprite_rockfish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 6,
    repeat: -1,
  },
  rockfish_swim_fast: {
    spriteKey: 'sprite_rockfish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 10,
    repeat: -1,
  },

  // 갈치(cutlasfish) — 가늘고 긴 은빛 어종, 빠른 회유성 (실제 darting swimmer)
  cutlasfish_swim_slow: {
    spriteKey: 'sprite_cutlasfish',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 6,
    repeat: -1,
  },
  cutlasfish_swim_normal: {
    spriteKey: 'sprite_cutlasfish',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 11,
    repeat: -1,
  },
  cutlasfish_swim_fast: {
    spriteKey: 'sprite_cutlasfish',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 17,
    repeat: -1,
  },

  // 광어(flounder) — flat-fish, 거의 hovering, 매우 느림 (bottom-dweller)
  flounder_swim_slow: {
    spriteKey: 'sprite_flounder',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 3,
    repeat: -1,
  },
  flounder_swim_normal: {
    spriteKey: 'sprite_flounder',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 5,
    repeat: -1,
  },
  flounder_swim_fast: {
    spriteKey: 'sprite_flounder',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 9,
    repeat: -1,
  },

  // 도다리(marbled_sole) — flat-fish, flounder 와 동일 패턴 (bottom-dweller)
  marbledsole_swim_slow: {
    spriteKey: 'sprite_marbledsole',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 3,
    repeat: -1,
  },
  marbledsole_swim_normal: {
    spriteKey: 'sprite_marbledsole',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 5,
    repeat: -1,
  },
  marbledsole_swim_fast: {
    spriteKey: 'sprite_marbledsole',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 9,
    repeat: -1,
  },

  // 숭어(mullet) — 연안 회유, 표면 활동, horse_mackerel 와 유사한 cruiser
  mullet_swim_slow: {
    spriteKey: 'sprite_mullet',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  mullet_swim_normal: {
    spriteKey: 'sprite_mullet',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  mullet_swim_fast: {
    spriteKey: 'sprite_mullet',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 보구치/조기(whiting) — 연안 중층, 표준 fps (general cruiser)
  whiting_swim_slow: {
    spriteKey: 'sprite_whiting',
    frames: [0, 1, 0, 4, 0, 1, 0, 4],
    frameRate: 5,
    repeat: -1,
  },
  whiting_swim_normal: {
    spriteKey: 'sprite_whiting',
    frames: [0, 1, 2, 1, 0, 4, 5, 4],
    frameRate: 9,
    repeat: -1,
  },
  whiting_swim_fast: {
    spriteKey: 'sprite_whiting',
    frames: [0, 2, 0, 5, 0, 2, 0, 5],
    frameRate: 14,
    repeat: -1,
  },

  // 물 splash — fish 가 낚였을 때 1회 재생. 1초 정도.
  // POT 변환 시 wispy frame(원본 0) 제거됨 → 전 인덱스 −1 재매핑.
  // 새 인덱스: 원본 [1,2,3,4,4,3,2] → [0,1,2,3,3,2,1].
  water_splash: {
    spriteKey: 'sprite_splash',
    frames: [0, 1, 2, 3, 3, 2, 1],   // 짧은 burst 후 잦아듦 (POT 재매핑)
    frameRate: 10,
    repeat: 0,
  },

  // PRESS & HOLD 버튼 애니메이션 (2x2 시트, 인덱스 0=idle, 3=full pressed)
  castbtn_press_down: {
    spriteKey: 'sprite_castbtn',
    frames: [0, 1, 2, 3],
    frameRate: 30,    // 0~3 진행 = 약 130ms
    repeat: 0,
  },
  castbtn_press_up: {
    spriteKey: 'sprite_castbtn',
    frames: [3, 2, 1, 0],
    frameRate: 30,
    repeat: 0,
  },

  // 낚시 성공 이펙트 — 1.5s 동안 4 프레임 progression. 마지막 분산 프레임에서 정지.
  //   0 → 1 → 2 → 3 (작음 → 큼 → 최대 → 별 분산)
  //   8 fps × 4 = 0.5s 짧게 → repeat 0 → showcase 끝까지 frame 3 유지.
  fish_effect: {
    spriteKey: 'sprite_fish_effect',
    frames: [0, 1, 2, 3],
    frameRate: 8,
    repeat: 0,
  },

  // 해파리 맥동 — 작게(0)→크게(5)→작게 ping-pong 루프. 부드러운 호흡.
  //   FishingScene 부유 장식이 개체별 timeScale/startFrame 으로 위상 분산.
  jellyfish_pulse: {
    spriteKey: 'sprite_jellyfish',
    frames: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
    frameRate: 7,
    repeat: -1,
  },
};

/**
 * 하단 탭 네비게이션 정의 (좌→우 순서).
 * sceneTarget 은 클릭 시 전환할 씬 키 (없으면 toggle 동작).
 */
export const BOTTOM_TABS = [
  { key: 'tab_baits',     label: 'BAITS' },
  { key: 'tab_lures',     label: 'LURES' },
  { key: 'tab_rod_parts', label: 'ROD PARTS' },
  { key: 'tab_reels',     label: 'REELS' },
];
