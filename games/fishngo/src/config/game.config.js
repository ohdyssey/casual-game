/**
 * Fishing Game — 게임 설정 상수
 *
 * 모든 수치를 한 곳에서 관리. 코드에 매직 넘버 금지.
 * 세로 모바일 비율 9:16 (720×1280) 기준.
 */

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// 시각 영역 분할 — 세로 레이아웃 (720×1280 기준, 샘플 이미지 #2 기반)
//
// 자산 원본 비율 메모 (왜곡 금지):
//   UI_01 wood deck : 2.44:1  (1606×658)  → W=720 cover → H=295
//   UI_02 craft body: 2.74:1  ( 902×329)  → W=688 cover → H=251
//   UI_04 CAST btn  : 1.19:1  ( 277×233)  → 거의 정사각형
//   UI_05 meter     : 2.59:1  ( 402×155)
//   UI_12 lives bar : 4.86:1  ( 369× 76)
//   UI_15 xp bar    : 4.93:1  ( 227× 46)
//   UI_16 coin bar  : 4.34:1  ( 360× 83)
//   UI_17 quest brd : 2.31:1  ( 282×122)
//
// 구획 (y 좌표):
//   30 ~ 100   상단 HUD 막대 3개 (lives | star+xp | coin)
//  100 ~ 130   "Next life in: 18m 24s" 라벨
//  150 ~ 220   2차 줄 (퀘스트 보드 좌, RANK/MENU 우)
//  240 ~ 700   게임플레이 영역 (산호초 배경 + 물고기 + 훅)
//  680 ~ 990   나무 데크 (UI_01, h=295) — CAST/LURES/RODS 의 backing
//  720 ~ 900   tension meter + CAST + side buttons (데크 위에 얹힘)
//  920 ~ 1170  CRAFT 패널 (UI_02, h=251) — 데크 하단을 자연스럽게 가림
//  1185 ~ 1265 하단 탭 4개
export const LAYOUT = {
  // ─── 샘플 (#1) 비율 정밀 매핑 ───
  // 그리드 분석 결과: HUD 3%, 2차줄 14%, 게임 19~71%, 데크 71~92%, CRAFT 81~92%, 탭 96%
  // 캔버스 1280 기준으로 1% = 12.8px

  // 상단 HUD 1행 (샘플 cy ≈ 3% = 38)
  hudBarY: 38,
  hudBarHeight: 60,
  hudLeftW:  230,
  hudRightW: 230,
  hudStarSizeFactor: 1.45,
  hudStarXpOverlap: 18,

  // lives bar 아래 "Next life in" 텍스트 — lives bar 와 살짝 겹치도록
  // (lives bar 영역 14~62 / nextLife 영역 50~92 → 12px 겹침)
  nextLifeY: 71,

  // 2차 줄 좌측: 퀘스트 보드
  secondRowY: 140,
  secondRowHeight: 80,
  questBoardWidth: 220,

  // 2차 줄 우측: MENU 위 + RANK 아래 (세로 스택, 동일 cx)
  menuY: 105,             // MENU 가 코인 막대 바로 아래
  rankMenuGap: 4,         // MENU ↔ RANK 두 버튼 세로 간격

  // 게임플레이 영역 — 샘플 19~71% = 243~909
  // playBottom 도 maxDepth(870) 수용 가능하도록 890 (cap = 880)
  playTop: 240,
  playBottom: 890,

  // 나무 데크 (UI_01) — 더 큼 (사용자 "너무 작다" 재피드백)
  // scale 1.7 → 폭 1224 (좌우 252씩 화면 밖, 잎사귀가 폰 외곽까지 확실히)
  // H = 1224/2.44 ≈ 502. 두께 = 502/1280 ≈ 39%
  // cy = 1280 - 502/2 = 1029 → 데크 영역 = 778~1280 (캔버스 하단까지)
  woodDeckY: 1029,
  woodDeckWidthScale: 1.7,

  // 액션 행
  meterCenterY: 712,    // 게이지 영역 ≈ 623~801
  castCenterY:  820,    // CAST 영역 ≈ 715~925
  sideCenterY:  840,    // 사이드 LURES/RODS 40px 아래 누적 (사용자 요청)

  // CRAFT 패널 — 하단 탭 (1185~) 과 약간 간격(14px) 유지하며 아래로 배치
  // panel 영역 920~1171 → 탭 1185 와 14px gap
  craftPanelY:      920,
  craftPanelHeight: 251,
  craftHeaderLift:  32,

  // 하단 탭 — 사이즈 키움 (사용자 요청 — 더 크게 균형 배치)
  // + CRAFT 패널 (920~1171) 과 14px 패딩 유지
  bottomTabsY:      1185,
  bottomTabsHeight: 90,

  // 외곽 패딩
  outerPad: 16,

  // ─── 반응형 from-bottom offsets (코드 리뷰 4-1, 4-2) ───
  //   FIT 모드에서 1280 - design 좌표 = from-bottom 값. 화면 높이 동적 변경 시 그대로 사용.
  bottomTabsOffsetFromBottom: 95,   // 1280 - 1185
  //   auto 모드 (CRAFT 패널 있음, 디자인 그대로)
  meterOffsetAuto: 568,    // 1280 - 712
  castOffsetAuto:  460,    // 1280 - 820
  sideOffsetAuto:  440,    // 1280 - 840
  deckOffsetAuto:  251,    // 1280 - 1029
  //   user 모드 (CRAFT 제거, +175 아래로 이동)
  meterOffsetUser: 393,    // 1280 - 887
  castOffsetUser:  285,    // 1280 - 995
  sideOffsetUser:  265,    // 1280 - 1015
  deckOffsetUser:   76,    // 1280 - 1204

};

// ─── 색상 토큰 — 바다 테마 ───
export const COLORS = {
  // 배경 — 그라데이션
  skyTop: '#4ec3ff',
  skyBottom: '#a8e2ff',
  waterTop: '#0d6fb8',
  waterMid: '#0a4a85',
  waterBottom: '#062a55',
  waterDeep: '#031530',

  // HUD
  hudBg: '#0a2540',
  hudStroke: '#1b4d8a',
  hudText: '#ffffff',
  hudLabel: '#aec9ee',

  // 재화
  coinGold: '#ffd147',
  coinGoldDark: '#a35a00',
  gemBlue: '#7cd5ff',
  gemBlueDark: '#1e7fb8',

  // 버튼
  primaryGreen: '#45c34c',
  primaryGreenDark: '#1d6f24',
  warningRed: '#e63946',
  warningRedDark: '#7a1818',

  // 텍스트 스트로크
  textStroke: '#0a2540',
  textWhite: '#ffffff',
};

// ─── 낚시 메카닉 상수 ───
export const FISHING = {
  // 훅 (낚싯바늘) 이동 속도
  hookDescendSpeed: 220,     // px/sec 자유 낙하
  hookReelSpeed:    320,     // px/sec 반대 방향 (탭하면 위로)
  // 캐스팅 — hook 의 평소(idle / cast 직전) 위치 = 사용자가 마크한 position 2
  // 변화 이력: 320 → 420 → 600 → 670 → 770 → 620 (사용자 마크 기반)
  castStartY: 620,
  // 끌어 올려진 fish 의 도달 위치 (HOOKED + REELING state 에서 hook 최상위)
  // (사용자 요청: 추가로 50px 더 위로 끌어 올림 → 270 → 220)
  reelTopY:   220,
  // 최대 수심 (게임플레이 영역 바닥, 게이지/CAST 위)
  // castStartY(770) 위로 가지 못하도록 870 (descent range 100px)
  maxDepth:   870,
  // 입질 윈도우 — 물고기와 충돌 후 채는 타이밍
  biteWindowMs: 450,
  // 한 매치 길이 (초) — 60 → 120 → 180 (사용자 요청: 120 × 1.5 = 180s)
  matchDurationSec: 180,
  // 저항(struggle) 사이클 각 phase 지속 시간 — Hook._updateStruggle 에서 사용 (코드 리뷰 4-4)
  strugglePullDurSec:   1.4,
  struggleResistDurSec: 0.9,

  // ─── 파이팅(user2 struggle) 튜닝 프로파일 (ARCH-04) ───
  //   Hook._updateUser2Struggle 에 흩어져 있던 매직 넘버를 한 곳으로 추출.
  //   값은 기존 인라인 리터럴과 byte-identical — 동작 변화 없음(순수 추출).
  //   3:1 소모:회복 불변식은 consumeSteps / recoverSteps 로 한 곳에서 감사 가능.
  fight: {
    // fightConsumeRate(t): ④25 / ⑤50 / ⑥100 (2배씩↑). zoneThresholds 로 구간 분할.
    consumeSteps:   [25, 50, 100],
    // fightRecoverRate(|t|): ③8 / ②16 / ①32 (2배씩↑).
    recoverSteps:   [8, 16, 32],
    // 구간 경계 (t / |t|) — < 0.33, < 0.67, else.
    zoneThresholds: [0.33, 0.67],
    // 텐션 base rate (호출부에서 sens·zoneBoost·size·dragDamp 곱).
    tensionRise: 0.38,
    tensionDrop: 0.65,
    // HP zone 판정 반경 (CAST anchor 근접) — inHpZone 및 zoneRateBoost.
    hpZoneDist: 80,
    // 강제 snap 타이머 — attachFish 에서 무게 초과 비율로 산정.
    //   forceSnapBaseSec / ratio, 최소 forceSnapMinSec.
    forceSnapBaseSec: 15,
    forceSnapMinSec:  3,
    // 시간 경과 난이도 가속 — 1 + min(timeBoostCap, struggleTime / timeBoostDiv).
    timeBoostCap: 0.6,
    timeBoostDiv: 45,
    // 대형 어종(size > sizeRiseThreshold) tension rise/drop 가속.
    //   sizeRise = min(sizeRiseCap, size / sizeRiseDiv).
    //   sizeDrop = 1 / min(sizeDropCap, size / sizeDropDiv).
    sizeRiseThreshold: 130,
    sizeRiseCap: 2.0,
    sizeRiseDiv: 130,
    sizeDropCap: 1.4,
    sizeDropDiv: 180,
    // 무게 초과(rod.power < fish.weight) reject 후 재입질 쿨다운 (BUG-02).
    //   짧은 일반 입질 쿨다운(2.0~3.5s)과 달리, 잡을 수 없는 어종의 bite→reject
    //   루프를 길게 throttle 하여 "깔끔한 reject" 로 만든다.
    overweightRejectCooldownSec: 6,
  },
};

// ─── 폰트 ───
// 폰트 — Jua (OFL, 저작권 프리). 한글+라틴 둥글고 깔끔한 게임체.
//   index.html @font-face 로 셀프호스팅, main.js 가 캔버스 렌더 전 선로딩.
export const FONT = {
  family: '"Jua", system-ui, -apple-system, sans-serif',
  size: { xs: 12, sm: 14, md: 18, lg: 24, xl: 32, xxl: 44 },
};
