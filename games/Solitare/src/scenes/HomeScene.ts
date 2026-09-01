/**
 * HomeScene — 타워(건설 모델).
 *
 * 게임 모델: 솔리테어를 플레이해 **코인**을 벌고, 그 코인으로 타워의 **다음 층을 건설**한다.
 *   (층 클리어 → 자동 다음 층이 아니라, 코인 축적 → 건설로 위로 쌓아 올린다.)
 *   · 건설된 층(1..builtFloors) = 탭하면 플레이(코인 획득)
 *   · 다음 층 = "🔨 건설" 버튼(비용 표시), 코인 충분하면 건설
 *   · 미건설 상층 = 흐린 실루엣
 *
 * 배경/타워 배치는 에디터(home.json) SSOT. 없으면 코드 드로우 플레이스홀더.
 * ⚠️ HD(1080×2400) — 절대 좌표(순수 FIT 1:1).
 */
import Phaser from 'phaser';
import { loadGameAssets, UI_HOME_KEY, BACK_BG_KEY, floorArtKey, uploadPath, loadUpload, texSize, whenAstcReady } from '../assets.js';
import { buildLayout, LayoutIndex, type LayoutDoc, type LayoutEntry } from '../ui/layoutLoader.js';
import { preloadCustomers, registerCustomerFrames, startCustomerVisits, type CustomerSpot } from './customers.js';
import { startOfficeTalk, type OfficeSpeaker, type OfficeTalkHandle, type OfficeRole } from './officeTalk.js';
import { animateClerkIdle } from './clerkIdle.js';
import { CIVIC_FLOORS, deskForFloor, isDeskOpen, type CivicDesk } from '../logic/civicDesks.js';
import { advanceCivicProgress, civicDeskStateOf } from '../logic/civicRuntime.js';
import { wireClerkTalk, themeForFloor, themeForStage2Floor, THEME_RIVAL_LOT } from './clerkTalk.js';
import { setTalkCtxProvider } from './talkContext.js';
import { buildTopHeader, type TopHeader } from './topHeader.js';
import { EDITOR_PACK_URL } from './PlayScene.js';
import { buildMissionRewardBanner, MISSION_BANNER_BOTTOM, MISSION_BANNER_CENTER_Y } from './missionRewardBanner.js';
import { buildEntryPopup, createChallengeBadge } from './entryPopup.js';
import { buildCollectionPopup, UI_COLLECTION_KEY, UI_COLLECTION_PATH, CARD_ART_SETS, COUNT_BADGE_KEY, NEW_CARD_BADGE_KEY, collectionCardKey } from './collectionPopup.js';
import { buildCollectionHub } from './collectionHub.js';
import { defaultCollection } from '../logic/collection.js';
import { preloadClouds, startCloudDrift } from './clouds.js';
import { startRoadsTraffic, type CarTrafficOpts } from './cars.js';
import { addContactShadow } from './shadows.js';
import { FLOORS, TOTAL_LEVELS, editorLevelCount } from '../logic/levels.js';
import { loadEditorLevelDocs } from '../logic/editorLevels.js';
import { isShortMessage, shouldShowMessage } from '../logic/messageStyle.js';
import { fitMessagePanel, GREEN_PANEL, YELLOW_PANEL } from '../ui/messagePanel.js';
import { uiButton, setButtonLabel, type ButtonColor } from '../ui/uiButton.js';
import { openProfilePopup } from './profilePopup.js';
import { openStarterOffer } from './starterOffer.js';
import { bumpMetrics } from '../logic/dailyMetrics.js';
import { profileOf, settleLeagueIfNeeded } from '../logic/leagueRuntime.js';
import { eventBannerView, openFloorOf } from '../logic/collectRuntime.js';
import { periodIdFor } from '../logic/league.js';
import { prefetchLeagueRoster } from '../logic/serverSync.js';
import { rankLabel, remainLabel } from '../ui/leagueRail.js';
import { openLeaguePanel } from '../ui/leaguePanel.js';
import { ensure as ensureAssetGroup, prefetch as prefetchGroup } from '../ui/assetBudget.js';
import { BONUS_PLAYS_PER_DAY, BONUS_PAID_FEE, BONUS_DRAW_COUNT, bonusEntryFee, bonusPlaysLeft } from '../logic/bonusGame.js';
import { startBonusPlay } from '../logic/bonusRuntime.js';
import { offerAdFreePlay } from '../ui/adOffer.js';
import { FONT } from '../ui/uiKit.js';
/** 보너스 게임 레일 아이콘 아트(준비 중) — 매니페스트에 들어오면 자동으로 임시 아이콘을 대체한다. */
const BONUS_ICON_KEY = 'up_Solitare_UI_BonusGame';
import { openEventPanel } from '../ui/eventPanel.js';
import { openLeaderboardPanel } from '../ui/leaderboardPanel.js';
import { loadMessageCounts, saveMessageCounts, hasNoAds, grantNoAds, markTipSeen } from '../save.js';
import type { CardBoardDoc } from '../logic/editorLevels.js';
import {
  loadSave,
  writeSave,
  resetProgress,
  FLOOR_COST,
  MAX_FLOORS,
  LOT2_MAX_FLOORS,
  diamondCostFor,
  floorLevelReq,
  lot2FloorLevelReq,
  hotelFloorLevelReq,
  missionRewardOf,
  storeAcquireCostFor,
  START_COINS,
  START_DIAMONDS,
  type SaveData,
} from '../save.js';
import { HOTEL_FLOOR_COUNT } from '../config/hotelFloors.js';
import { EVENT_RESET_ITEMS, resetAllEvents } from '../logic/eventReset.js';
import { ECON_JSON_KEY, ECON_JSON_URL, setEconFromJson, entryFeeFor, econ } from '../econRuntime.js';
import {
  usesIntegratedClaim,
  incomePerPeriod,
  msUntilFull,
  canClaim,
  capacityFor,
  periodFor,
  formatIncomeTimer,
  isBankFull,
  accrueByTime,
} from '../logic/storeIncome.js';
import { preloadAudio, playBgm, sfx, cycleVolume, volumeLabel, type Bgm } from '../audio.js';
import { hapticsLabel, toggleHaptics } from '../haptics.js';
import { openItemShop } from './itemShop.js';
import { SAFE_H as H, SAFE_W as W } from '../logic/responsiveFrame.js';
import { overlayLayer, overlayScrim } from '../ui/overlay.js';
import { centerSafeZone, safeOffset } from '../ui/safeZone.js';
import { fullBleedBounds, viewBounds } from '@casual/core';
import { topUiShift } from '../ui/safeAreaUi.js';
import {
  LOT_DX,
  LOT1L_CX,
  LOT2_CX,
  OFFICE_CX,
  centerOf,
  currentStageIndex,
  isOverLot,
  isRightInnerSide,
  scrollXForCenter,
  snapStageIndex,
  stageCenter,
  STAGE_CX,
  TOWER_CX,
} from '../logic/homeStages.js';

/** 층 아트 텍스처 키(…_BG_01..05, 뒤에 _v2 같은 버전 접미사 허용). 배경(…_BG_Back01)·지붕(…_BG_roof)·유리는 제외. */
const FLOOR_KEY_RE = /_BG_0[1-5](?:_v\d+)?$/;

/** 에디터 저작 레벨 팩(public/levels/cardLevels.json) — PlayScene 과 동일 키·동일 경로(캐시 무효화 포함). */
const EDITOR_PACK_KEY = 'editorLevelPack';

// 저작(=세이프존) 프레임 — 좌표 계약의 단일 출처는 logic/responsiveFrame.ts 다.
//   ⚠️ 이 값은 **캔버스 크기가 아니라 저작 크기**다. 캔버스는 앞으로 가변이 될 수 있으므로
//      화면 전체를 덮는 요소(딤 등)는 W/H 가 아니라 scene.scale.width/height 를 써야 한다.

/**
 * 빌드 버전 라벨 — 홈 화면 우하단에 항상 표시.
 *   dev 서버에서 "지금 뜬 게 방금 고친 버전인지" 즉시 확인용. 변경할 때마다 손으로 올린다.
 *   card1.2 = PlayScene computeGeom 카드 크기 상한(scale cap) 값.
 */
const BUILD_VERSION = 'v7.8 · 다이아(헤더)·게임비팝업·건물다이아비용(10·12·15…)·아이템샵·재화재설정';

const FLOOR_SCALE = 0.72;
const OVERLAP = 46;
const BASE_Y = 2190;

// ── 크레인 · 타워건설 연출 ────────────────────────────────────────────────
// home.json 엔 크레인 노드가 없어 코드로 올린다(레이아웃에 Crane 노드가 있으면 그걸 재사용).
const CRANE_KEY = 'up_Slitare_BG_Crane_v6'; // 매니페스트(ui-assets.json)로 항상 로드됨.
const CRANE_CX = 716; // 크레인 중심 x(디자인) — home_copy 저작 크레인과 동일(마스트 우측·지브 좌측 건물 위).
const CRANE_CY = 642; // 크레인 중심 y.
const CRANE_W = 793; // 크레인 표시 폭(높이는 원본 비율).
// **중경(depth 6) 앞 · 층 아트(depth 9+) 뒤** — 중경 건물이 크레인을 가리지 않도록 6 위로,
//   층/지붕(9~22)보다는 아래라 마스트가 건물 뒤에 서고 지브만 지붕 위로 보인다. (직전 5 → 중경 6 에 가려짐)
const CRANE_DEPTH = 7;
const CABLE_DEPTH = 40; // 케이블은 최상단(층·지붕) 앞에서 보이게 — 리프팅 연결 가시화.
const HOOK_RATIO = { x: 0.277, y: 0.466 }; // 크레인 이미지 내 고리(케이블 끝) 위치 비율 — PNG 실측(가장 깊게 매달린 블록).
const CABLE_COLOR = 0x101010; // 약간 굵은 검은 케이블.
const CABLE_W = 7;
const LIFT_HOOK = 320; // 건설 시 고리를 새 층 최종 중심보다 이만큼 위에 둔다(크레인이 위에서 내림). ↓=크레인 더 아래.
const FLOOR_LIFT = 200; // 새 층이 최종 위치보다 이만큼 위에서 시작해 낙하(쿵). 크레인 고리 아래로 유지(케이블 정상). ⚠️세밀조정 대상.
const DYN_FLOOR_OVERLAP = 30; // 동적 층(4층+)이 **바로 아래층 상단을 침범**하는 양(px). 값↓=4층이 더 위로(겹침↓·틈 방지). ⚠️튜닝.
const INITIAL_OWNED = 1; // **초기 소유 층수(1층만 소유)** — 2층은 건설돼 있으나 미소유 → 점포매입.
// 상단 여백 — 최상단까지 스크롤했을 때 건설 버튼이 헤더 아래로 내려와 보이게.
// ⚠️2026-07-19: 헤더 바로 아래 **미션 리워드 배너**(missionRewardBanner.ts, uiCam 고정·화면 y 약 240~385)가
//   생기면서 240 이었던 옛 여백이 배너에 가려 "상층 건설 버튼이 안 보인다"는 QA 재현 — 배너 하단(약 385)보다
//   더 아래로 내려오도록 여백을 키운다.
/** 토스트 깊이 — **모든 팝업(4000~5000)보다 위**. 안내 메시지가 팝업 뒤에 가리지 않게. */
export const TOAST_DEPTH = 7000;
const HEADER_MARGIN = 420;
/**
 * 미션 리워드 배너 **아래로 건설 버튼이 확보해야 할 최소 간격**(px).
 * ⚠️ 예전엔 HEADER_MARGIN(420) 하나로 때웠다 — 저작 기준 배너 하단(385)에 35px 여유를 더한 값이다.
 *   그런데 배너는 세이프에어리어·허브 버튼을 피해 **아래로 내려간다**. 고정 420 은 그만큼을 모르고
 *   그대로 있어, 상하폭이 좁은 기기에서 "8층 건설" 버튼이 배너 뒤로 들어갔다(실측 리포트 2026-08-22).
 *   → 이제 배너의 **실제 하단**에서 이 간격을 더해 잡는다.
 */
const BUILD_BTN_BANNER_GAP = 35;
/** 배경 타일 이음매 — 소스 기준 잘라낼 좌우 가장자리(px). 원경 끝단의 어두운 픽셀 제거용. */
/** 상단 헤더 영역의 아래 끝(저작 y) — 이보다 위는 좌우 앵커 대상에서 제외한다(헤더는 통짜 UI). */
const HEADER_MAX_Y = 150;
/** 좌우 레일로 볼 저작 x 경계 — 이 바깥쪽에 있는 HUD 만 화면 가장자리에 붙인다. */
const RAIL_LEFT_MAX_X = 300;
const RAIL_RIGHT_MIN_X = W - RAIL_LEFT_MAX_X;

/** 이 노드가 좌측 레일(-1)인지 우측 레일(+1)인지, 아니면 중앙 UI(0)인지. */
function railSide(x: number): -1 | 0 | 1 {
  if (x < RAIL_LEFT_MAX_X) return -1;
  if (x > RAIL_RIGHT_MIN_X) return 1;
  return 0;
}

const EDGE_CROP = 8;
/** 배경 타일끼리 겹칠 양(월드 px) — 서브픽셀 반올림으로 생기는 1px 틈 방지. */
const TILE_OVERLAP = 2;
/** 미션 리워드 배너의 저작 기준 상단 여백(세이프에어리어 회피분은 여기에 더해진다). */
const MISSION_BANNER_TOP = 60;
const MAX_TOP_MARGIN = 520; // **최상층(10) 완공** 시 지붕 위 여백 — 헤더와 겹치지 않게 하늘 공간을 넉넉히.
const BOTTOM_SAFE = 30; // 하단 여백 — 뷰 하단이 근경(지면) 안쪽에 머물게(끝선 안 보이게).
// 부지 간격·부지 중심·스테이지 스냅 계산은 전부 logic/homeStages.ts(순수 모듈)로 옮겼다.
//   ⚠️ 예전엔 LOT_DX(부지 간격)와 "한 화면 폭"을 같은 숫자로 썼다 — 캔버스 폭이 가변이 되면
//      갈라지므로, 스크롤 목표는 **부지 중심에서 캔버스 폭으로 유도**한다(그 모듈 주석 참조).
// **좌측 공공건물 타워** — 메인타워 왼쪽 부지(LOT1L_CX)에 공공건물 5개를 기존 타워 방식으로 **프리빌트**(항상 완공 상태).
/**
 * 공공건물 층 수 = **민원 창구 수**(`logic/civicDesks.ts` 가 단일 출처).
 * ⚠️ 예전엔 3 으로 잠겨 있었다. 창구를 붙이면서 5층까지 세운다 — 아트는 원래 5개 다 있었고
 *   코드 상한만 막고 있었다. 5층(시청)은 `comingSoon` 이라 자리만 보이고 눌러도 안 들어간다.
 */
const OFFICE_FLOORS = CIVIC_FLOORS;
const COMP_BANK_FLOORS = 4; // 고수익 경쟁 부지 낙찰 시 단계별로 세우는 뱅크 층 수(Bank_01~04).
const BANK_CLERK_DROP_FRAC = 0.12; // 뱅크 은행원을 공공건물(officer) 위치보다 이 비율(층높이)만큼 아래로(앞으로) — 사용자 요청(더 아래).
// OFFICE_CX(좌측 부지 중심) 도 homeStages 에서 가져온다.
// 공공건물 층별 대화 화자 역할(1층부터) — 3층 릴리스에선 소방수·경찰관·세무원, 5층 확장 시 우체국·시장 합류.
const OFFICE_ROLES: readonly OfficeRole[] = ['fire', 'police', 'tax', 'post', 'mayor'];
const UI_OFFICE_KEY = 'ui_office'; // 공공건물 에디터 저작 레이아웃(home_copy2.json) — 관리자 캐릭터 배치 좌표 소스.
const UI_SALE_KEY = 'ui_sale'; // 판매건물(폐건물) 에디터 저작 레이아웃(home_copy2_copy.json) — 간판·텍스트 배치 좌표 소스.
const UI_DAILY_KEY = 'ui_daily'; // 데일리 미션 팝업 에디터 저작 레이아웃(blank_copy.json, 720×1600) — 랭크 버튼으로 오픈.
// **공공건물 지붕**(Office_roof) — 최상층 위에 civic 지붕(돔·시계·중앙 네임플레이트). 상단 지명은 나중에 얹는다(임시로 지붕만).
const OFFICE_ROOF_KEY = 'up_Slitare_Office_roof';
const OFFICE_ROOF_W = 840; // 건물 폭(858)에 맞춤(양옆 여백 약간). ⚠️LOT2_FLOOR_W는 아래에서 선언되므로 리터럴 사용.
const OFFICE_ROOF_H = Math.round(OFFICE_ROOF_W * (440 / 774)); // 원본 비율(774×440) 보존.
const OFFICE_ROOF_OVERLAP = 40; // 지붕 하단(파사드)이 최상층 상단 뒤로 겹치는 양(얹힌 느낌).

/** 사이드 부지 1개. cx=부지 중심 x, ruinKey=폐건물 텍스처(**고유·중복금지**), saveKey=저장키. */
interface SideLot {
  cx: number;
  ruinKey: string; // 폐건물 텍스처(코드 선배치).
  saveKey: string;
  hintText: string;
  hintX: number;
  built: boolean;
  demolished: boolean; // 철거 완료(빈 부지, 1층 미건설).
  ruin?: Phaser.GameObjects.Image; // 코드로 생성한 폐건물.
  forSale?: Phaser.GameObjects.Image; // 폐건물 앞 'FOR SALE' 표지판(건설/철거 시 제거).
  sign?: Phaser.GameObjects.Image; // 폐건물 상단 간판(UI_25, 건물 뒤 레이어) — 잠금/구입 메시지 판.
  signMsg?: Phaser.GameObjects.Text | Phaser.GameObjects.Container; // 간판 위 메시지(단문=Text / 제목+설명 2단=Container).
  bankTopY?: number; // 경쟁 부지 뱅크(다층) 최상층 top edge — 세로 스크롤 상한용.
  signOverride?: string; // 이 부지 고유 간판 문구(잠금/구입 문구 대신 항상 표시) — 예: 고수익 경쟁 부지 안내.
  floor?: { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image };
  btn?: Phaser.GameObjects.Container;
  hint?: Phaser.GameObjects.Text;
  stage: number; // 손님 스팟 stage id(중복 방지).
}
const RUIN_W = 760; // 폐건물 표시 폭(공통) — 높이는 텍스처 비율 보존.
const GROUND_Y = 2221; // 지면(1층 건물 밑면) — 폐건물 밑면을 여기에 맞춘다.
const RUIN_DEPTH = 40; // 폐건물 depth — 프롭/1층(≤18) 앞, 근경 차(51) 뒤(부지의 주요 건물).
const FOR_SALE_VARIANTS = 3; // 'FOR SALE' 표지판 변형 수(UI_24-1~3) — 부지별 순환 배치.
const FOR_SALE_BOX = 230; // 표지판 최대 표시 박스(정사각) — 세로/가로 변형 모두 비율 보존해 이 안에 맞춤.
const FOR_SALE_DEPTH = RUIN_DEPTH + 1.5; // 폐건물 바로 앞(지면 표지판) — 근경 차보다는 뒤.
// **폐건물 상단 간판**(UI_25-1~3) — 지붕 위 하늘 영역에 걸린 장식 간판(잠금/구입 메시지). **건물 뒤 레이어**라
//   간판 하단이 지붕 꼭대기·박공(dormer) 뒤로 겹쳐 "지붕에 얹혀 하늘로 솟은" 느낌(사용자 지정 배치 위치).
const LOT_SIGN_W = Math.round(RUIN_W * 0.9); // 간판 표시 폭 = **건물 지붕 폭**(지붕이 건물 상단 가로를 거의 다 덮음).
const LOT_SIGN_DEPTH = RUIN_DEPTH - 2; // **건물 뒤** — 지붕/박공이 간판 하단을 덮어 지붕 위로 솟은 부분만 보인다.
const LOT_SIGN_OVERLAP = 118; // 간판 하단(다리)이 지붕 꼭대기 뒤로 겹치는 양 — 다리가 지붕 기와에 닿도록 더 아래로 내림.
const LOT_SIGN_RAISE_FRAC = 0.13; // 저작 배치 대비 간판을 이 비율(간판높이)만큼 위로 — 지붕에 덜 파묻히게(사용자 요청·부지 간 일관).
const LOT_SIGN_TEXT_DROP_FRAC = 0.02; // 정밀 패널중심(평탄밴드 검출) 대비 폰트 상하 여백 보정용 소량 하향(변형 간 일관).
const LOT_SIGN_TEXT_DEPTH = 62; // 간판 메시지(간판 위·항상 최상단).
// **중경 패럴랙스 계수**(applyParallax·중경 도로 통행 공용) — 가로는 근경보다 느리게(붙어 이동 방지),
//   세로는 미세하게만(근경 침범 방지). 중경 도로에 얹는 자동차도 이 계수로 동기화한다.
/** 원경·하늘 상단 확장 배율(applyParallax.growUp) — 20층 타워 최상단(−8000)에서도 윗변이 화면에 안 들어오게. */
const FAR_GROW = 1.2;
const SKY_GROW = 1.1;
const PARALLAX_MID_X = 0.72;
const PARALLAX_MID_Y = 0.94;
// 중경(뒤쪽) 도로 차량 depth = **9** — 정확한 레이어링:
//   · 먼 배경 건물(중경 depth 6·8, 화면 우측 절반을 덮음) **앞** → 타워 뒤를 지나 **반대편에서 다시 나타나** 끝까지 이동.
//   · 도로변 가로등(depth 10·11)·타워 건물(18) **뒤** → 소품/타워 **앞쪽으로 튀어나오지 않고** 그 뒤로 지나감.
//   (소화전·화분은 y≥1965로 차 Y(1823~1937)와 안 겹쳐 무관. 차보다 위 겹침은 가로등뿐 → 얇아 노출 충분.)
const LOT2_FLOOR_W = 858; // 스테이지2 층 폭(타워1과 동일).
/**
 * **30층 전체 표시 테스트**(PO 2026-08-30 "임시 테스트를 위해 게임 레벨·진행과 상관없이 30층이 다 건설된 것으로").
 *   true 면 ① 메인 타워 1~10층 전부 표시 ② 우 내측(lot2) 타워 20층(11~30F) 복원 ③ 우 외곽에 호텔 15층(lot3).
 *   ⚠️ **표시만** 바꾼다 — 저장(builtFloors/lot2*)은 건드리지 않는다. 검토가 끝나면 false 로 되돌릴 것.
 */
/** 타워 성장 프리뷰를 본 적 있는지(1회 제한) — 본 세이브가 아니라 전용 팁 키에 남긴다. */
/** 이 레벨을 넘으면 타워 성장 연출을 더 이상 보여 주지 않는다(PO 2026-08-31). */
const PREVIEW_UNTIL_LEVEL = 5;
/**
 * **이번 실행에서 이미 보여 줬는가** — 모듈 스코프라 페이지를 새로 열 때만 초기화된다(씬 재시작에는 남는다).
 *   PO 2026-08-31: "처음 게임 진입했을 때만 1회" — 플레이 후 홈으로 돌아올 때마다 다시 도는 것을 막는다.
 *   ⚠️ 세이브·팁 키에 남기지 않는다. 앱을 다시 켜면 (레벨 5 이하인 동안) 한 번 더 보여 주는 것이 의도다.
 */
let towerPreviewShownThisRun = false;
const TOWER_PREVIEW_TIP = 'towerGrowthPreview'; // '전체 완공 테스트'가 연출을 끄는 용도로만 남는다.

const SHOW_ALL_FLOORS_TEST = false; // 2026-08-31: 검토 종료 — 실제 진행(1·2층부터)으로 돌아간다.
/**
 * **2번 라인(우 내측) 타워는 20층**(PO 2026-08-30 "2번 라인 건물 상층에 21~30층을 덧붙여 20층 건물로").
 *   층 1~10 = `up_Slitare_BG_02_NN`(11~20F) · 층 11~20 = `up_Slitare_BG_03_NN`(21~30F). 3번 라인은 아트가 다시 오면.
 *   ⚠️ 건설 진행(buildLot2Next·저장)의 상한은 **`LOT2_MAX_FLOORS`**(save.ts SSOT, =20) — 2026-08-31 재설계로
 *   실제 20층까지 건설 가능해졌다(레벨 게이팅 `lot2FloorLevelReq` 함께 적용).
 */
/**
 * **3번 라인(우 외곽) = 호텔**(PO 2026-08-30 아트, 2026-08-31 진짜 건설 시스템으로 전환). 아트
 *   `up_Slitare_BG_04_01~15`(808×488 통일). 1F Entrance Lobby … 15F Sky Lounge(`config/hotelFloors.ts`,
 *   층수 SSOT = `HOTEL_FLOOR_COUNT`). 2번 라인 완공 뒤 해금, 손님·수입 배너는 없다(PO 결정).
 */
const LOT3_CX = LOT2_CX + LOT_DX;
const lot3ArtKey = (level: number): string => `up_Slitare_BG_04_${pad2(level)}`;
/** 2번 라인 점원 키 — 1~10층 = Chr_02, 11~20층 = Chr_03(PO 2026-08-31 `Solirare_Chr_03-01~10`, 트림 후 높이 320 으로 이식). */
const lot2ClerkKey = (level: number): string => (level <= MAX_FLOORS ? `up_Solirare_Chr_02_${pad2(level)}` : `up_Solirare_Chr_03_${pad2(level - MAX_FLOORS)}`);
/** 3번 라인(호텔) 점원·투숙객 키 — `Solirare_Chr_04-01~15`. */
const lot3ClerkKey = (level: number): string => `up_Solirare_Chr_04_${pad2(level)}`;
/** 2번 라인 층 번호(1~20) → 아트 키. */
const lot2ArtKey = (level: number): string => (level <= MAX_FLOORS ? `up_Slitare_BG_02_${pad2(level)}` : `up_Slitare_BG_03_${pad2(level - MAX_FLOORS)}`);
const LOT2_FLOOR_H = 513; // 스테이지2 층 높이.
const LOT2_FLOOR1_Y = 1965; // 스테이지2 1층 중심 y(타워1 1층과 동일 지면).
const LOT2_ROOF_W = 849;
const LOT2_ROOF_H = 298;
const LOT2_ROOF_OVERLAP = 24; // 지붕이 최상층을 너무 가리지 않게 위쪽 배치(겹침 최소). ⚠️튜닝.
/**
 * 층 간 겹침(px) — **양 스테이지 공통**. ⚠️튜닝.
 *   16 → 44(PO 2026-08-30 "층과 층 사이 빈공간을 없애라 — 상위 층이 하위 층 뒤로"). 층 아트 실측: 3번 라인
 *   (`up_Slitare_BG_03_NN`)은 위쪽 19~22px 이 투명, 좌우 60px 폭은 130~160px 까지 투명(둥근 어깨). 16 으로는
 *   그 여백이 배경으로 비쳤다. 44 면 위층 바닥 슬래브가 아래층 차양 **뒤로** 충분히 들어간다(depth 도 아래층이 앞).
 */
const LOT2_SMALL_OVERLAP = 44;
const MID_ROAD_CAR_DEPTH = 9; // 2번 차선(중경) 차 — 배경 건물 앞·타워 뒤(층 depth 최소 10 미만).
const FLOOR_DEPTH_BASE = 10; // 1층 depth 기준(배경 1~7 위). **양 스테이지 공통 논리적 레이어**.
const FLOOR_DEPTH_STEP = 3; // 층당 depth 간격(**아래층일수록 앞** — floorDepth 참조).
// **계속하기(플레이) 버튼**을 최상단 건설 층 중심 아래로 내려 **전면 발코니(테라스)**에 앉히는 비율(층높이 대비).
const CONTINUE_FLOOR_OFFSET = 0.30;
// 계속하기 버튼 depth = 그 층 depth + 이 값(손님 코인 floorDepth+50 위로 확실히).
const CONTINUE_DEPTH_LIFT = 60;

// ── 점포(층) 코인 누적 → 말풍선 수령 ─────────────────────────────────────
const FLOOR_COIN_GOAL = 100; // 이 값(100) 누적 시 점원 위 말풍선(수령 대기) + **상한 고정(수령 전까지 정지)**.
// **상점(층)별 손님 방문 수익** — 상점마다 수익성이 다르다: 고층(건설비 비싼 고급 상점)일수록 방문 1회 수익↑.
//   [1층 2 … 10층 15] — 기존 일률(3~4)을 대체. 고층은 은행(100) 이 빨리 차 수령 빈도도 높아진다.
const FLOOR_VISIT_YIELD = [0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15] as const;
const visitYieldFor = (floor: number): number => FLOOR_VISIT_YIELD[((floor - 1) % 10) + 1];
// 사이드 부지(단층 파일럿 상점) 수익 — 부지(stage)마다 다르게.
const SIDE_LOT_YIELD: Record<number, number> = { 4: 5, 5: 7, 6: 9 };
// **부지(스테이지)별 BGM** — 카메라 스테이지 인덱스(-2..3, LOT_DX 배수) → 트랙 이름.
//   public/audio/bgm_lot_*.m4a 파일을 넣으면 그 부지에서 재생, 없으면 **무음**(다른 스테이지 사운드 재생 금지, 2026-07-16).
const STAGE_BGM: readonly Bgm[] = ['lot_l2', 'lot_l1', 'home', 'lot_r1', 'lot_r2', 'lot_r3'];
/** 작은 메시지 팝업 아트(점원 수집 숫자 등) — 없으면 색 배경 텍스트로 폴백. */
/** 광고 제거 아이콘의 저작 노드 id(home.json) — 숫자 하드코딩 대신 여기 한 곳에서 관리. */
const NOADS_NODE_ID = 'layer_18';

const TOAST_PANEL_KEY = 'up_Solitare_UI_29';
/** 문장용 초록 창(가로 리본). */
const TOAST_SENTENCE_KEY = 'up_Solitare_UI_28';
const CLAIM_BUBBLE_KEY = 'up_Solitare_UI_11'; // 말머리 풍선(주문 말풍선 재사용).
const CLAIM_COIN_KEY = 'up_Solitare_UI_2-3'; // 말풍선에 띄울 코인 아이콘.
const CUST_COIN_SPIN = 'custCoinSpin'; // 손님 드랍과 동일한 스핀 코인 애니 키(customers.ts).
// **코인 저장소(상단 헤더 코인 카운터)** 화면 좌표 — 코인 샤워가 빨려드는 목표(topHeader 코인값 근처).
const HEADER_COIN_X = 330;
const HEADER_COIN_Y = 88;
const MICRO_ZOOM_OUT_MAX = 0.06; // 스크롤 중 미세 줌아웃 최대치(직전 0.13 → 축소: 배경 하단 노출 폭↓·연출은 유지).
// **카메라가 도달하는 가장 깊은 줌아웃**(건설 연출 포함) — 원경/도로 하단 커버 계산의 기준.
//   스크롤 미세줌(0.94)보다 건설 연출 줌아웃이 더 깊으므로, 그 값을 여기로 통일하고 건설도 이 값을 쓴다.
const MIN_CAMERA_ZOOM = 0.9;
// ── 타워 스크롤 감촉(부드러움/가속도) ──────────────────────────────────
//   드래그: 손가락을 1:1로 딱 붙어 따라가는 대신 **목표(target)로 부드럽게 수렴**해 미세한 지연=가속/감속감을 준다.
//   릴리스: 관성으로 길게 미끄러지다(SCROLL_FRICTION) 정지 직전 부드럽게 감속(SETTLE_FOLLOW).
const DRAG_FOLLOW = 0.4; // 드래그 중 목표 추종 비율(1=즉시·딱딱, 낮을수록 부드러운 지연)
const SETTLE_FOLLOW = 0.16; // 관성/정지 시 목표 수렴 비율(감속 마무리)
const SCROLL_FRICTION = 0.955; // 관성 감속 계수(1에 가까울수록 더 오래 미끄러짐 = 관성↑)
/** 층 번호 → 2자리 zero-pad("01".."10"). 층별 지정 아트/점원 키(up_Slitare_BG_NN·up_Solirare_Chr_NN)용. */
const pad2 = (n: number): string => String(n).padStart(2, '0');
// **데모(연출 미리보기) 모드** — 4층 배치 버튼을 눌러도 코인 차감·영구저장 없이 연출만 재생하고 3층으로 리셋.
//   반복해서 건설 연출만 확인하기 위한 임시 모드. 실제 건설로 전환하려면 false.
const DEMO_CONSTRUCTION = true;

// 진입 팝업(blank.json) 노드 타입은 entryPopup.ts 에서 import(EntryNode/EntryDoc) — 데일리미션 팝업도 재사용.
// 층 파사드의 **시각 모서리**(이미지 좌우/상하 여백 보정) — 노드 중심 대비 비율. ⚠️세밀조정 대상.
const BLD_HALF = 0.42; // 상단/하단 모서리 x = 중심 ± w×0.42.
const BLD_TOP = 0.3; // 상단 모서리 y = 중심 − h×0.30.
const BLD_BOT = 0.34; // 하단 모서리 y = 중심 + h×0.34.

/**
 * **홈 화면이 쓰는 아트를 전부 로드**(2026-08-31, LoadScene·HomeScene 공용으로 추출) — 원래 HomeScene.preload()
 *   안에만 있어서, LoadScene 진행바가 끝난 뒤 홈이 처음 뜰 때 **여기서 두 번째로** 조용히(진행바 없이) 다시
 *   로드됐다. 콜렉션 카드가 63->135장으로 늘면서 이 보이지 않는 2차 로딩이 길어져 "로딩화면 지나간 뒤
 *   2~3초 어두운 화면" 으로 체감됐다 — LoadScene 이 먼저 이 함수를 불러 진행바에 태우면, 홈에
 *   도착했을 땐 전부 텍스처가 이미 있어 이 함수가 사실상 즉시 끝난다.
 */
export function preloadHomeAssets(scene: Phaser.Scene): void {
  loadGameAssets(scene);
  preloadAudio(); // 사운드팩(m4a) 미리 디코드 + 첫 제스처 BGM 훅.
  preloadCustomers(scene); // 점포 방문 손님 시트(10종).
  preloadClouds(scene); // 하늘 구름 3종.
  // 에디터 저작 레벨 팩(배포 시 번들). 없어도 무방(dev 는 localStorage 공유).
  scene.load.json(EDITOR_PACK_KEY, EDITOR_PACK_URL);
  // 경제 파라미터(시뮬 도구 '게임 반영' 산출물) — 없으면 DEFAULT_ECON 폴백(로드 에러 무해).
  scene.load.json(ECON_JSON_KEY, ECON_JSON_URL);
  // 층 건물 아트를 확실히 선로딩(매니페스트 타이밍과 무관하게) → 색상 사각형 폴백 방지.
  whenAstcReady(scene, () => {
    for (let i = 1; i <= TOTAL_LEVELS; i++) loadUpload(scene, floorArtKey(i), uploadPath(`up_Solitaire_BG_0${i}`), `up_Solitaire_BG_0${i}`); // ASTC 표 키는 업로드 키.
  });
  // ⚠️ 부지 아트(2번 라인 BG_02/03·점원 Chr_02/03, 호텔 BG_04·Chr_04)는 **부팅에 올리지 않는다** — 부지 그룹
  //   ('lot2'·'lot3', ui/assetBudget)으로 그 부지를 세우기 직전에 받는다(2026-08-31: 부팅 상주 +56MB 를 걷어냄).
  // **철거 연출 에셋**(Destroy_01~05) — 01 철구·02 착암기·03 해머·04 먼지+잔해·05 먼지+구멍.
  for (let i = 1; i <= 5; i++) {
    const k = `up_Destroy_0${i}`;
    if (!scene.textures.exists(k)) scene.load.image(k, uploadPath(`${k}`));
  }
  // **폐건물 6종**(Ruin_01~06) — 매니페스트엔 01·05만 있어 나머지도 코드로 선로딩(부지별 고유 텍스처).
  for (let i = 1; i <= 6; i++) {
    const k = `up_Slitare_BG_Ruin_0${i}`;
    if (!scene.textures.exists(k)) scene.load.image(k, uploadPath(`${k}`));
  }
  // **건설 연출 에셋**(Const) — 01 톱·04 흙손·07 판자·09/10 벽돌·14 붓.
  for (const n of ['01', '04', '07', '09', '10', '14']) {
    const k = `up_Const_${n}`;
    if (!scene.textures.exists(k)) scene.load.image(k, uploadPath(`${k}`));
  }
  // **다이아·코인 아이콘** + **아이템샵** 패널 + **와일드**(진입 팝업 아이템 슬롯).
  if (!scene.textures.exists('up_Solitare_UI_2_2')) scene.load.image('up_Solitare_UI_2_2', uploadPath('up_Solitare_UI_2_2'));
  if (!scene.textures.exists('up_Solitare_UI_2_3')) scene.load.image('up_Solitare_UI_2_3', uploadPath('up_Solitare_UI_2_3'));
  if (!scene.textures.exists('up_Solitare_UI_ItemShop')) scene.load.image('up_Solitare_UI_ItemShop', uploadPath('up_Solitare_UI_ItemShop'));
  if (!scene.textures.exists('up_Solitare_UI_08')) scene.load.image('up_Solitare_UI_08', uploadPath('up_Solitare_UI_08'));
  if (!scene.textures.exists('up_Solitare_UI_02_v2')) scene.load.image('up_Solitare_UI_02_v2', uploadPath('up_Solitare_UI_02_v2')); // 별(진입 팝업).
  // **점포 코인 수령 말풍선** — 말머리 풍선(UI_11) + 코인 아이콘(UI_2-3).
  if (!scene.textures.exists(CLAIM_BUBBLE_KEY)) scene.load.image(CLAIM_BUBBLE_KEY, uploadPath('up_Solitare_UI_11'));
  if (!scene.textures.exists(CLAIM_COIN_KEY)) scene.load.image(CLAIM_COIN_KEY, uploadPath('up_Solitare_UI_2-3'));
  /*
   * **좌측 공공건물 타워 · 경쟁 부지 은행 아트는 부팅에 올리지 않는다**(2026-08-27).
   *   부지는 좌우로 늘어서 있고 화면엔 한 부지만 보이는데, 예전엔 여기서 전부 올렸다 —
   *   부지가 늘수록 부팅 메모리가 그대로 늘어(부지 1개 ≈ 16MB) iOS 한도를 밀어 올린다.
   *   지금은 `ui/assetBudget` 의 부지 그룹('office'·'bank')으로 받아 두고, 도착하면 그 부지를 세운다
   *   (create 끝에서 prefetch → ensureLotArt). 지붕은 오피스와 한 몸이라 같이 미룬다.
   * ⚠️ 중앙 메인 타워 아트는 **부팅 화면**이라 여기 남는다(위 floorArtKey 루프).
   */
  scene.load.json(UI_OFFICE_KEY, 'ui/layouts/home_copy2.json'); // 관리자 배치 좌표(빌딩 대비 상대).
  scene.load.json(UI_SALE_KEY, 'ui/layouts/home_copy2_copy.json'); // 판매건물 간판·텍스트 배치 좌표(빌딩 대비 상대).
  scene.load.json(UI_DAILY_KEY, 'ui/layouts/blank_copy.json'); // 데일리 미션 팝업 레이아웃.
  scene.load.json(UI_COLLECTION_KEY, UI_COLLECTION_PATH); // 콜렉션 카드 팝업 레이아웃(Pass 아이콘).
  // 세트별 테마 배너(up_CollecttionCard_02..10)는 loadGameAssets 의 ui-assets.json 매니페스트 로더가 자동 로드.
  // 콜렉션 카드 **보유 장수 배지 원판**(PO 2026-07-26: Solitare_UI_Play_03-1 위에 숫자) — 매니페스트 밖 직접 로드.
  if (!scene.textures.exists(COUNT_BADGE_KEY)) scene.load.image(COUNT_BADGE_KEY, uploadPath(COUNT_BADGE_KEY));
  // **NEW 배지 리본**(2026-07-20: Solitare_UI_Play_03-3, 허브·세트 상세 공용) — 매니페스트 밖 직접 로드.
  if (!scene.textures.exists(NEW_CARD_BADGE_KEY)) scene.load.image(NEW_CARD_BADGE_KEY, uploadPath(NEW_CARD_BADGE_KEY));
  // **세트별 카드 아트**(2번 세트부터, 수동 이식·매니페스트 밖) — CARD_ART_SETS 등록분만 직접 로드(9장/세트).
  for (const set of CARD_ART_SETS) {
    for (let c = 1; c <= 9; c++) {
      const k = collectionCardKey(set, c);
      if (!scene.textures.exists(k)) scene.load.image(k, uploadPath(k));
    }
  }
  // **구입 가능한 폐건물** — 앞 'FOR SALE' 표지판(UI_24-1~3) + 상단 간판(UI_25-1~3, 잠금/구입 메시지). 부지별 변형·건설 시 삭제.
  for (let n = 1; n <= FOR_SALE_VARIANTS; n++) {
    const k24 = `up_Solitare_UI_24-${n}`;
    if (!scene.textures.exists(k24)) scene.load.image(k24, uploadPath(`${k24}`));
    const k25 = `up_Solitare_UI_25-${n}`;
    if (!scene.textures.exists(k25)) scene.load.image(k25, uploadPath(`${k25}`));
  }
}

export class HomeScene extends Phaser.Scene {
  constructor() {
    super('home');
  }

  // 타워/크레인 연출 상태(에디터 레이아웃 경로에서만 채워짐).
  private layoutIdx?: LayoutIndex;
  private towerFloors: LayoutEntry[] = [];
  private officeFloors: Phaser.GameObjects.Image[] = []; // 좌측 공공건물 타워 5층(프리빌트) — 세로 스크롤 상한 산출용.
  officeTalk?: OfficeTalkHandle; // 공공건물 대화 디렉터(소방수·경찰관 등 말 걸기) — public: 디버그/검증용 핸들.
  private talkDaysAway = 0; // 이번 진입 기준 마지막 접속 경과 일수(대화 맥락용).
  private officeRoof?: Phaser.GameObjects.Image; // 공공건물 최상층 지붕(civic 돔·시계·네임플레이트).
  private craneImg?: Phaser.GameObjects.Image;
  private craneIsLayout = false; // 크레인이 에디터 레이아웃 노드면 true → 그 위치(아래층에 붙인 위치) 그대로 사용.
  private cablesGfx?: Phaser.GameObjects.Graphics;
  private buildBtn?: Phaser.GameObjects.Text;
  private buildStoreBtn?: Phaser.GameObjects.Image; // 에디터 저작 4층 건축 버튼(연출 중·매입 전 숨김).
  private buildStoreLabel?: Phaser.GameObjects.Text; // 그 버튼의 라벨(같이 숨김).
  /** 계속하기(플레이) 버튼 + '계속하기' 타이틀 + 레벨 라벨(최상단 건설 층에 배치) + 각 상대 오프셋. */
  private continueBtn?: Phaser.GameObjects.Image;
  private continueTitle?: Phaser.GameObjects.Text;
  private continueLabel?: Phaser.GameObjects.Text;
  private continueTitleDX = 0;
  private continueTitleDY = -15;
  private continueLabelDX = 0;
  private continueLabelDY = 27;
  private constructing = false;
  /** 콜렉션 카드 팝업 등 자체 스와이프 제스처를 쓰는 오버레이가 열려 있는 동안 타워 드래그 스크롤을 잠근다
   *   (2026-07-19 QA "스와이프하면 뒤 타워도 같이 움직인다" — enableTowerScroll 이 this.input 전역 리스너라
   *   팝업 쪽 stopPropagation 으로는 못 막고, 이 플래그로 직접 막아야 한다). */
  private scrollSuspended = false;
  /** 층별 장식(유리/캐릭터) 오브젝트 — 건설 연출이 해당 층의 장식만 등장시키도록. */
  private floorDecor = new Map<number, { glass?: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image }>();
  private previewPlaying = false; // 타워 성장 프리뷰 재생 중(중복 실행 가드).
  /** UI 전용 카메라(줌·스크롤 없음) — 월드(타워)만 줌/스크롤하고 HUD 는 고정 크기로. */
  private uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** UI 오브젝트(헤더·레일·버전·건설버튼 등) — uiCam 만 렌더, mainCam 은 무시. */
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  /**
   * 이번 진입에서 리그 기간 정산이 일어났는가 — `create()` 앞머리에서 재고 화면 구성 뒤에 알린다.
   * ⚠️ 정산은 **세이브를 읽기 전에** 해야 한다(아래 create 주석 참고) — 그래서 결과만 들고 다닌다.
   */
  private leagueSettled?: ReturnType<typeof settleLeagueIfNeeded>;
  /** 공공건물 민원 창구 버튼 — 판수/해금이 바뀌면 다시 칠한다. */
  private civicDeskBoxes: Array<{
    desk: CivicDesk;
    box: Phaser.GameObjects.Container;
    plate: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
  }> = [];
  private homeHeader?: TopHeader; // 공통 상단 헤더(코인·다이아) — 갱신용.
  // 위아래 드래그 스크롤 + **관성(가속도)** 상태.
  private scrollOn = false;
  private scrollDragging = false;
  private scrollVel = 0;
  private scrollTargetY = 0; // 드래그/관성이 갱신하는 세로 목표 — 카메라가 부드럽게 수렴.
  private scrollTargetX = 0; // 좌우 목표(부지 팬).
  private scrollMin = 0;
  private scrollMax = 0;
  // **수평 스크롤**(부지 확장) — 타워1(scrollX=0) ↔ 우측 부지/타워2(scrollX=LOT_DX).
  private scrollMinX = 0;
  private scrollMaxX = 0;
  private scrollVelX = 0;
  // 좌우 스테이지 이동 화살표(디자이너 배치 UI 노드 layer_17/17_copy) — 해당 방향 스테이지가 없으면 숨김.
  private leftArrow?: Phaser.GameObjects.Image;
  private rightArrow?: Phaser.GameObjects.Image;
  // 현재 부지(스테이지) BGM — 카메라가 다른 부지로 넘어가면 그 부지 트랙으로 전환.
  private lastStageBgm?: Bgm;
  private lot2Built = false; // 두 번째 부지 1층 건설 여부(=스테이지2 시작).
  private lot2Btn?: Phaser.GameObjects.Container; // 부지 구입·1층 건설 버튼.
  private lot2Hint?: Phaser.GameObjects.Text; // '새 부지 →' 힌트.
  // **스테이지 2 타워**(우측 부지) — 코드 구동. 층 아트=up_Slitare_BG_02_NN, 점원=up_Solirare_Chr_02_NN.
  private lot2Floors = 0; // 건설된 스테이지2 층 수.
  private lot2FloorObjs = new Map<number, { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image }>();
  private lot2Roof?: Phaser.GameObjects.Image; // 스테이지2 지붕(최상층 위).
  // **3번 라인 호텔**(2026-08-31 재설계) — 2번 라인을 일반화한 진짜 건설 시스템. 손님·수입 배너는 없다(PO 결정).
  //   R2 부지 슬롯을 차지한다(더 이상 평범한 사이드 부지 아님) — 2번 라인 20/20 완공 뒤 해금.
  private hotelBuilt = false;
  private hotelBtn?: Phaser.GameObjects.Container; // 부지 구입·1층 건설 버튼.
  private hotelHint?: Phaser.GameObjects.Text; // '새 부지 →' 힌트.
  private hotelFloors = 0; // 건설된 호텔 층 수.
  private lot3FloorObjs = new Map<number, { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image }>();
  private lot3Roof?: Phaser.GameObjects.Image;
  private hotelBuildBtn?: Phaser.GameObjects.Container; // 호텔 'N층 건설' 버튼.
  private hotelRuin?: Phaser.GameObjects.Image; // 호텔 부지 폐건물(코드 선배치).
  private hotelForSale?: Phaser.GameObjects.Image; // 호텔 폐건물 앞 'FOR SALE' 표지판.
  private hotelSign?: Phaser.GameObjects.Image; // 호텔 폐건물 상단 간판(UI_25).
  private hotelSignMsg?: Phaser.GameObjects.Text | Phaser.GameObjects.Container; // 호텔 간판 메시지.
  private lot2BuildBtn?: Phaser.GameObjects.Container; // 스테이지2 'N층 건설' 버튼.
  private lot2Ruin?: Phaser.GameObjects.Image; // 우 내측 부지 폐건물(코드 선배치).
  private lot2ForSale?: Phaser.GameObjects.Image; // 우 내측 폐건물 앞 'FOR SALE' 표지판.
  private lot2Sign?: Phaser.GameObjects.Image; // 우 내측 폐건물 상단 간판(UI_25).
  private lot2SignMsg?: Phaser.GameObjects.Text | Phaser.GameObjects.Container; // 우 내측 간판 메시지.
  private ruinTopRatioCache = new Map<string, number>(); // 폐건물 텍스처별 **실제 지붕(불투명 최상단) 비율**(0..1) 캐시 — 간판을 상단 투명여백 아닌 실지붕에 얹기 위함.
  private panelCenterCache = new Map<string, number>(); // 간판 텍스처별 **밝은 패널(글씨 영역) 세로 중심 비율**(0..1) 캐시 — 아트 재디자인돼도 텍스트가 패널 중앙에 오게.
  // **판매건물 간판·텍스트 저작 배치**(home_copy2_copy.json에서 파싱, 건물 대비 분수) — undefined=미계산, null=없음(폴백).
  private saleLayoutCache?: { boardVFrac: number; boardXFrac: number; boardWFrac: number; textVFrac: number; textXFrac: number } | null;
  // **사이드 부지들**(좌 내/외 · 우 외 — 폐건물 철거→1층 파일럿). 우 내(lot2)는 다층 시스템 별도.
  private sideLots: SideLot[] = [];
  private scrollBaseZoom = 1; // 스크롤 미세 줌 기준(원래 줌=1). 이동 시 축소→멈추면 원복.
  private prevScrollY = 0; // 직전 프레임 scrollY — 실제 이동량(속도) 산출용(미세 줌).
  private atMaxFloor = false; // 최상층(10) 완공 상태 — 최상단 여백을 크게(공간 확보).
  /**
   * 미션 리워드 배너를 아래로 내린 양(저작 여백 + 세이프에어리어·허브 버튼 회피분).
   *
   * ⚠️ **지연 계산이어야 한다.** 배너를 만드는 `wireHomeUI` 보다 `wireTower`→`frameTower` 가
   *   먼저 돈다 — 필드에 담아 두면 프레이밍이 옛 값을 보고 여백을 잡아 건설 버튼이 배너에
   *   가린다(실측 2026-08-22). 한 번 재고 캐시해 배너와 프레이밍이 **같은 값**을 쓰게 한다.
   */
  private bannerOffsetCache?: number;
  /** 원경 헤이즈(안개막) — 원경을 좌우로 이어 붙일 때 함께 넓힌다. */
  private farHaze?: Phaser.GameObjects.Rectangle;
  private justBuiltLevel = 0; // 직전에 건설한 층 — 프레이밍을 그 층에 맞춘다(0=없음).
  private builtFloors = 3; // **건설된(보이는) 층 수(제자리 진행)** — 재시작 없이 finishConstruction 에서 증가.
  // 점포 수익 통합 수금 배지(에디터 저작 노드) + 1초 갱신 타이머.
  private incomePanel?: Phaser.GameObjects.Image;
  private incomeAmountText?: Phaser.GameObjects.Text;
  private incomeTimerText?: Phaser.GameObjects.Text;
  private incomeTicker?: Phaser.Time.TimerEvent;
  private incomeBank = 0; // 수금함 잔액(손님이 떨어뜨린 코인 누적) — 세이브 storeIncomeBank 미러.
  private ownedFloors = 1; // **소유한 층 수** — 건설됐지만 미소유 층은 점포매입 대상. 매입/건설 시 증가.
  private customerActive = new Set<string>(); // 손님 시트 중복 방지 공유 셋(동적 층 추가 시에도 공유).
  private customerSpots: CustomerSpot[] = []; // **라이브** 손님 스팟 배열 — 랜덤 스포너가 참조, 건설 시 push.
  // **점포 코인 누적**: 층→누적코인(세이브 미러) + 층→수령 말풍선 오브젝트(중복 방지·정리).
  private floorBanks = new Map<number, number>();
  private floorClaimBubbles = new Map<number, Phaser.GameObjects.GameObject[]>();


  preload(): void {
    preloadHomeAssets(this);
  }

  /** 에디터 저작 레벨 수(1부터 연속). 번들 팩 + localStorage 병합 기준. 최소 1(항상 1레벨은 시도 가능). */
  private levelCount(): number {
    const packRaw = this.cache.json.get(EDITOR_PACK_KEY) as
      | { levels?: Record<string, CardBoardDoc> }
      | Record<string, CardBoardDoc>
      | null;
    const pack = ((packRaw && 'levels' in packRaw ? packRaw.levels : packRaw) ?? {}) as Record<string, CardBoardDoc>;
    return Math.max(1, editorLevelCount(pack));
  }

  /**
   * **레벨 팩 지문** — 지금 화면이 어느 팩으로 도는지 한눈에 보기 위한 짧은 서명(레벨수·해시).
   *
   * 팩을 갈아 끼워도 **탭을 새로고침하지 않으면** 예전 팩으로 계속 플레이하게 된다(팩은 페이지 로드 때
   * 한 번만 받는다). 그 상태에서 "레벨이 그대로다"라고 보고돼 원인 찾는 데 반나절이 날아간 적이 있다
   * (2026-08-22). 설정 화면에 지문을 띄워 **말이 아니라 숫자로** 대조할 수 있게 한다.
   */
  private packSignature(): string {
    const packRaw = this.cache.json.get(EDITOR_PACK_KEY) as
      | { levels?: Record<string, CardBoardDoc> }
      | Record<string, CardBoardDoc>
      | null;
    const bundled = ((packRaw && 'levels' in packRaw ? packRaw.levels : packRaw) ?? {}) as Record<string, CardBoardDoc>;
    // ⚠️ **실제로 플레이되는 팩**을 지문으로 남긴다 — localStorage 저작본(cardLevels.v1)이 번들을 덮으므로
    //   번들만 보고 지문을 찍으면 "최신인데 옛 레벨이 나온다"를 못 잡는다(editorLevels.ts 참고).
    const pack = { ...bundled, ...loadEditorLevelDocs() };
    const keys = Object.keys(pack);
    let h = 0;
    for (const k of keys) {
      const d = pack[k];
      h = (h * 31 + (d.slots?.length ?? 0) * 97 + (d.budget?.stock ?? 0)) >>> 0;
    }
    return `pack ${keys.length}/${h.toString(36).slice(-5)}`;
  }

  create(data?: { fromLoad?: boolean }): void {
    /*
     * **화면 아트 미리 받기** — 홈이 다 그려진 뒤 한가할 때 팝업 그룹을 먼저 받아 둔다.
     *   이래야 아이콘을 눌렀을 때 기다림이 **0** 이다. 예산(assetBudget.BUDGET_BYTES)을 넘으면
     *   받지 않으므로, 그림이 아무리 늘어도 상주 총량은 예산 안에 머문다.
     *
     *   ⚠️ 우선순위 순서가 곧 정책이다 — 자주 눌리는 것부터. 예산이 모자라면 뒤쪽은 열 때 받는다.
     *   ⚠️ 부팅 로딩과 겹치지 않게 **한 프레임 뒤**에 시작한다(로더가 돌고 있으면 assetBudget 이 기다린다).
     */
    this.time.delayedCall(0, () => {
      if (!this.scene.isActive()) return;
      // 팝업 아트는 전부 부팅 상주다(2026-08-31 그룹 해제) — 여기서 미리받을 것이 없다.
      this.time.delayedCall(700, () => this.playTowerGrowthPreview()); // 타워 성장 프리뷰(레벨 5까지 매 진입 1회).
    });
    // **로딩에서 진입 시 검정에서 페이드인** — 홈 초기 렌더(하늘 배경)가 찰나 노출되던 하늘색 플래시 방지.
    //   먼저 검정으로 덮고 즉시 페이드인 → 홈 아트가 다 그려진 뒤 부드럽게 드러난다.
    if (data?.fromLoad) {
      this.cameras.main.setBackgroundColor('#0a0810');
      this.cameras.main.fadeIn(360, 10, 8, 16);
    }
    this.uiObjects = []; // restart 마다 재수집(스테일 참조 누적 방지).
    this.civicDeskBoxes = []; // 씬 재시작으로 파괴된 버튼 참조가 남지 않게(파괴된 Text 접근 = 루프 정지).
    this.previewPlaying = false; // ⚠️ 씬 인스턴스는 재사용된다 — 연출 중 홈을 떠났으면 플래그가 남아 간판 탭이 막힌다.
    /*
     * ⚠️ **공공건물 타워 참조도 여기서 비운다**(실측 2026-08-30 "공공건물이 사라졌습니다").
     *   `buildOfficeTower` 는 `officeFloors.length === 0` 일 때만 도는데, 그 비우기가 **함수 안**에만
     *   있었다. 홈 → 프리셀 → 홈 으로 돌아오면 배열에는 **이전 씬에서 파괴된 이미지 5개**가 그대로
     *   남아 있어 길이가 5 → 관문에 걸려 **타워를 다시 세우지 않는다**. 화면에는 건물도 창구 버튼도
     *   없어진다(실측: 살아있는 층 0 · 창구 0, 아트는 5개 다 로드된 상태).
     */
    this.officeFloors = [];
    this.officeRoof = undefined;
    this.uiCam = undefined;
    setEconFromJson(this.cache.json.get(ECON_JSON_KEY)); // 경제 SSOT(economy.json) 적용 — 없으면 기본값.
    /*
     * **투데이 리그 기간 정산은 세이브를 읽기 전에** 한다(자정을 넘겼으면 지난 기간 순위로 보상 지급 +
     *   점수 리셋). 결과 표시는 헤더가 생긴 뒤(아래 `settled` 사용).
     *
     * ⚠️ **여기 순서가 버그였다**(실측 2026-08-30 "어제 리그 5위 했다는게 계속 뜬다"). 예전엔
     *   정산을 한참 뒤에 불렀는데, `create()` 앞머리에서 뜬 `save` 스냅샷을 그 뒤 `writeSave(save)` 로
     *   되쓰면서 **정산 결과(leaguePeriodId·leaguePoints·지급된 코인)를 통째로 되돌렸다.**
     *   그래서 홈에 들어올 때마다 같은 정산이 다시 일어나 같은 토스트가 계속 떴고, 헤더에 잠깐
     *   보였던 보상 코인도 저장되지 않았다.
     * ⚠️ 새 코드를 넣을 때도 **`loadSave()` 보다 뒤에서 세이브를 바꾸는 함수를 부르지 말 것** —
     *   부르려면 스냅샷을 다시 읽어야 한다. 이 파일은 스냅샷 하나를 오래 들고 있어 특히 위험하다.
     */
    this.leagueSettled = settleLeagueIfNeeded();
    // P3: 오늘·어제 밴드 명단을 미리 받아 둔다(오늘=표시용, 어제=자정을 막 넘겼을 때 정산용).
    //   fire-and-forget — 못 받아도 buildRoster 가 로컬로 폴백해 리그는 그대로 동작한다.
    const nowPeriodId = periodIdFor(new Date());
    prefetchLeagueRoster(nowPeriodId);
    prefetchLeagueRoster(nowPeriodId - 1);
    const save = loadSave();
    // 데모 모드: 저장과 무관하게 **점포매입 → 건설 데모**. 진행은 restart init(demoBuilt)로 이어붙여 3층 시작 → 최대 10층까지 쌓는다.
    this.justBuiltLevel = 0;
    this.customerActive = new Set<string>();
    // (초기 재화는 save 기본값: 코인 1000·다이아 30. 데모 자동 충전 제거 — 상점/재설정 메뉴로 조정.)
    // **임시저장 기반 진행**: 저장된 건설 상태를 그대로 이어간다(리셋/첫 진입 = 1~2층·1소유).
    this.builtFloors = save.builtFloors;
    this.ownedFloors = save.ownedFloors ?? INITIAL_OWNED;
    // **씬 재사용 대비 스테이지2 상태 리셋** — Phaser 는 씬 인스턴스를 재사용하므로, 이전 진입에서 남은
    //   lot2Built 등이 그대로면 setupLot2 가 조기 반환해(빈 부지 + 버튼 없음) 저장 복원/구입 버튼이 모두 사라진다.
    //   여기서 런타임 상태만 비우고, setupLot2 가 매 진입 저장(save)으로부터 다시 구성하게 한다.
    this.lot2Built = false;
    this.lot2Floors = 0;
    this.lot2Btn = undefined;
    this.lot2Hint = undefined;
    this.lot2BuildBtn = undefined;
    this.lot2Roof = undefined;
    this.lot2Ruin = undefined;
    this.lot2ForSale = undefined;
    this.lot2Sign = undefined;
    this.lot2SignMsg = undefined;
    this.lot2FloorObjs.clear();
    this.sideLots = []; // 사이드 부지 리스트 리셋(setupSideLots 가 저장으로 재구성).
    // 수평 스크롤 기본 위치 = **중앙 타워를 화면 가운데** 두는 값(예전엔 0 — 캔버스 폭 1080 전제였다).
    //   setupLot2/사이드 부지가 여기서부터 좌우로 범위를 열어준다.
    const homeX = scrollXForCenter(TOWER_CX, this.camW());
    this.scrollMaxX = homeX;
    this.scrollMinX = homeX;
    this.leftArrow = undefined; // 좌우 화살표는 enableTowerScroll 에서 재생성(씬 재사용 대비 참조 비움).
    this.rightArrow = undefined;
    // ⚠️ **소프트락 방지**: constructing 은 필드 초기화라 씬 재사용 시 1회만 실행됨. 건설 애니 도중 홈을 떠나면
    //   Phaser 가 리셋 콜백(delayedCall/tween)을 파괴해 true 로 굳는다 → 복귀 시 스크롤·건설·매입 전부 잠김.
    //   매 진입마다 여기서 강제로 풀어 소프트락을 회복한다(건설 중 이탈은 아래 씬-이탈 버튼 가드로도 예방).
    this.constructing = false;
    this.floorClaimBubbles.clear(); // 씬 재사용 대비: 스테일 말풍선 참조 비움(오브젝트는 씬 재시작이 파괴).
    this.loadFloorBanks(); // 층별 누적 코인을 세이브에서 로드.
    // **대화 컨텍스트(지능화 1단계)** — 점원/공공건물 맥락 대사가 읽는 게임 상태 제공 + 복귀 일수 추적.
    this.talkDaysAway = this.trackDaysAway();
    setTalkCtxProvider(() => {
      const sv = loadSave();
      return {
        hour: new Date().getHours(),
        coins: sv.coins,
        level: sv.level,
        builtFloors: this.builtFloors,
        daysAway: this.talkDaysAway,
        bankFull: (fl: number) => (this.floorBanks.get(fl) ?? 0) >= FLOOR_COIN_GOAL,
      };
    });
    playBgm('home'); // 홈 BGM(첫 제스처에서 실제 시작).

    // 홈(로비)에는 카드가 있어선 안 된다 — 비정상 전환으로 play/preview 가 남아 있으면 강제 정지(카드 오버레이 방지).
    for (const key of ['play', 'preview']) {
      if (this.scene.key !== key && this.scene.isActive(key)) this.scene.stop(key);
    }

    const homeDoc = (this.cache.json.get(UI_HOME_KEY) ?? null) as LayoutDoc | null;
    if (homeDoc && Array.isArray(homeDoc.nodes) && homeDoc.nodes.length > 0) {
      const idx = buildLayout(this, homeDoc);
      this.wireTower(idx);
      this.animateCharacters(idx);
      registerCustomerFrames(this);
      this.customerSpots = this.buildCustomerSpots(); // 건설된 층 손님 스팟(라이브 배열).
      startCustomerVisits(this, this.customerSpots, this.customerActive); // 전역 랜덤 스포너(랜덤 층·랜덤 간격).
      this.startBottomCars(idx); // 하단 도로 자동차 통행(디자이너 참조 차 위치/크기/depth 기준).
      this.wireHomeUI(idx, save); // 새 UI(플레이 버튼·설정 기어·코인/레벨 텍스트) 배선.
    } else {
      // 폴백(디자인 미저작) — 코드 크롬.
      this.drawBackground();
      this.drawTitle();
      this.drawPlaceholderTower(save);
      this.drawCoins(save);
      this.drawNav(save);
      this.drawHint(save);
    }
    startCloudDrift(this); // 하늘(배경 위·빌딩 뒤)에 구름을 한 방향으로 천천히 흘려보낸다.
    // 빌드 버전 라벨은 **메뉴(설정) 화면 하단**으로 이관(openSettings) — 홈 화면에는 표시하지 않음.
    // 에디터 레이아웃 경로: 월드/UI 카메라 분리(월드만 줌·스크롤, UI 는 고정 크기).
    if (homeDoc && Array.isArray(homeDoc.nodes) && homeDoc.nodes.length > 0) {
      this.setupCameras();
      this.restoreClaimBubbles(); // 이미 목표 채운 층에 수령 말풍선 복원(uiCam 준비 후 = pinToWorld 유효).
      this.scale.on(Phaser.Scale.Events.RESIZE, this.onViewportResize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onViewportResize, this));
    }
  }

  /**
   * 모바일에서 알림창을 내렸다 올리는 것처럼 뷰포트 높이가 잠깐 바뀌면(주소창 접힘/펼침도 동일)
   * `game-shell.ts`가 캔버스 크기를 다시 재고 `Phaser.Scale.Events.RESIZE`를 쏜다. 이 씬은
   * `autoCenterSafeZone:false`라 카메라를 직접 관리하는데, 그동안 이 이벤트를 **아무도 안 듣고**
   * 있었다 — 그래서 `uiCam` 크기와 월드 카메라 스크롤 상·하한이 부팅 시점 값으로 굳어, 알림창을
   * 접었다 펴고 돌아오면 건물이 화면 하단 기준선보다 위로 들려 보이는 등 어긋났다(실측 2026-09-01).
   *
   * ⚠️ `cam.scrollY`만 고치고 `scrollTargetY`를 안 맞추면 다음 프레임의 관성 lerp(4484번 줄 부근)가
   *   다시 옛 목표로 끌고 간다 — 반드시 같이 맞춘다.
   */
  private onViewportResize(): void {
    if (this.uiCam) {
      this.uiCam.setSize(this.scale.width, this.scale.height);
      centerSafeZone(this, this.uiCam);
    }
    if (!Number.isFinite(this.towerTop())) return;
    const cam = this.cameras.main;
    if (this.scrollOn) {
      this.updateScrollBounds(); // 상·하한 재계산 + cam.scrollY 재클램프.
      cam.scrollX = Phaser.Math.Clamp(cam.scrollX, this.scrollMinX, this.scrollMaxX);
      this.scrollTargetY = cam.scrollY;
      this.scrollTargetX = cam.scrollX;
      this.scrollVel = 0; // 관성이 옛 목표로 튀지 않게.
    } else {
      this.frameTower(); // 스크롤 활성화 전(초기 idle) — 처음과 같은 방식으로 다시 배치.
    }
  }

  /** HUD(상단 헤더 + 좌우 레일 아이콘)를 **UI 카메라 대상**으로 등록(고정·비줌). 계속하기(layer_8*)는 타워 하단에 붙어 함께 스크롤(제외). */
  private collectHud(idx: LayoutIndex, header: TopHeader): void {
    this.uiObjects.push(...header.objects);
    // ⚠️ **새 HUD 노드는 여기 등록해야 한다** — 빠지면 UI 카메라에 안 붙어 타워와 함께 스크롤되고,
    //   폭이 넓어져도 가장자리로 안 밀린다(실측: NoAds(layer_18)가 화면 안쪽에 남아 건물을 가림).
    const HUD_RE = /^(layer_11|layer_13|layer_17|layer_18|layer_4|layer_5)(_|$)/;
    /**
     * **상단 레일**(상점·패키지 / 리그·랭킹·시즌패스와 라벨)은 화면 위에 붙는 UI 라, 노치 침범분만큼
     * 헤더와 **같은 양**으로 내려야 헤더에 가려지지 않는다(실측: 아이폰 15 Pro 에서 상점·리그가 가림).
     * 기준은 저작 y — 상단 ⅓(800) 안쪽만 상단 레일로 본다. 코인상점(1137)·스와이프 화살표(1754)처럼
     * 아래쪽에 있는 HUD 는 화면 위와 무관하므로 건드리지 않는다.
     */
    const TOP_RAIL_MAX_Y = 800;
    const sa = topUiShift(this);
    /**
     * **가로가 넓어진 만큼 좌우 레일을 바깥으로**(사용자 요청 2026-08-22).
     *
     * UI 카메라는 저작 프레임(1080)을 화면 가운데 놓으므로, 캔버스가 넓어지면 남는 폭이 좌우로
     * 절반씩 생긴다. 레일 아이콘은 저작 x 그대로 남아 **가운데 타워 위로 파고든다**(실측: 상점·팩이
     * 건물을 가림). 늘어난 절반만큼 바깥으로 밀어 **가장자리와의 거리를 저작값 그대로** 유지한다.
     *
     * 헤더(y≈90)는 화면 폭 전체를 쓰는 한 덩어리라 건드리지 않는다 — 밀면 코인·레벨 값만 흩어진다.
     */
    const edge = Math.max(0, (this.scale.width - W) / 2);
    for (const e of idx.entries()) {
      if (!HUD_RE.test(e.node.id)) continue;
      this.uiObjects.push(e.obj);
      const o = e.obj as unknown as { x?: number; y?: number };
      if (sa > 0 && e.node.y < TOP_RAIL_MAX_Y && typeof o.y === 'number') o.y += sa;
      const side = edge > 0 && e.node.y >= HEADER_MAX_Y ? railSide(e.node.x) : 0;
      if (side !== 0 && typeof o.x === 'number') o.x += side * edge;
    }
  }

  /**
   * 새 홈 UI(에디터 저작 home.json) 배선 — 계속하기 플레이 버튼·코인/레벨 텍스트·설정 기어.
   *   레벨 선택/배치 점검은 상단 코인패널 우측 **⚙ 설정 기어**를 눌러 여는 설정 오버레이로 이동.
   */
  private wireHomeUI(idx: LayoutIndex, save: SaveData): void {
    const cont = Math.min(Math.max(1, save.level), this.levelCount());
    // 디자이너 헤더 노드(코인 패널+통화 텍스트)는 숨기고 **공통 헤더**로 대체(골드 우측정렬 + 플레이와 동일).
    for (const id of ['layer_4', 'layer_5', 'layer_5_copy', 'layer_5_copy2']) idx.tryById(id)?.setVisible(false);
    const header = buildTopHeader(
      this,
      save.coins,
      save.diamonds ?? 0,
      cont,
      () => {
        sfx('button');
        this.openSettings(save);
      },
      1600,
      undefined,
      // **LV 뱃지 탭 = 프로필 설정**(PO 2026-08-23) — 리그·랭킹에 표시될 이름/얼굴.
      () => {
        sfx('button');
        openProfilePopup(this, {
          uiCam: this.uiCam,
          pinToUi: (o) => this.pinToUi(o),
          toast: (msg) => this.toast(msg),
        });
      },
    );
    this.homeHeader = header;
    this.collectHud(idx, header); // HUD(헤더·레일)를 UI 카메라 대상으로 등록(고정·비줌).
    // **투데이 리그 정산 결과 알림** — 정산 자체는 `create()` 앞머리(세이브를 읽기 전)에서 끝났다.
    const settled = this.leagueSettled;
    if (settled?.settled) {
      header.setCoins(loadSave().coins);
      this.time.delayedCall(900, () => this.toast(`어제 리그 ${settled.rank}위 · +🪙 ${settled.coins.toLocaleString()}`));
    }
    // **미션 리워드 배너**(연속 플레이 별 수집) — 헤더 바로 아래, 플레이 화면과 동일 위치/구성.
    const mrState = missionRewardOf(save, Date.now());
    save.missionReward = mrState; // 만료 리셋이 있었다면 즉시 저장(다음 진입 때도 일관).
    writeSave(save);
    // 타워홈에서는 살짝 더 아래(PO 2026-07-18). 홈에 머무는 중 제한시간이 끝나면 리셋 상태를 즉시 반영한다.
    // ⚠️ 침범분은 **offsetY 인자로** 준다 — 생성 뒤 y 를 옮기면 setState 가 원위치로 되돌린다(실측).
    const missionBanner = buildMissionRewardBanner(this, mrState, this.missionBannerOffsetY(), 1580, () => {
      const s = loadSave();
      const next = missionRewardOf(s, Date.now());
      s.missionReward = next;
      writeSave(s);
      missionBanner.setState(next);
    });
    missionBanner.setView(eventBannerView(loadSave())); // 배너 = 주간 이벤트(현재 상품·진행·보상).
    this.uiObjects.push(...missionBanner.objects);
    /**
     * **배너 탭 = 주간 이벤트 팝업**(PO 2026-08-23). 배너는 코드로 그린 오브젝트 묶음이라
     * 저작 노드가 없다 — 배너 영역을 덮는 투명 존을 얹어 입력만 받는다.
     * (배너 자체를 interactive 로 만들면 진행바 갱신 때마다 히트영역을 다시 잡아야 한다.)
     */
    {
      const y = MISSION_BANNER_CENTER_Y + this.missionBannerOffsetY();
      const zone = this.add
        .zone(W / 2, y, 520, 190)
        .setInteractive({ useHandCursor: true })
        .setDepth(1590)
        .on('pointerdown', () => {
          sfx('button');
          this.openThiefEvent();
        });
      this.uiObjects.push(zone);
    }
    // **아이템샵** — 좌측 레일 '상점'(layer_11) 아이콘 → 코인/다이아 팩 상점.
    //   ⚠️ layer_11_copy2 는 디자이너가 **점포 수익 통합 수금 배지**로 옮겨 재사용했다(2026-07-28) →
    //      상점 배선에서 제외하고 아래 setupStoreIncome() 이 수금 버튼으로 잡는다.
    {
      const b = idx.tryById<Phaser.GameObjects.Image>('layer_11');
      b?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        sfx('button');
        this.openItemShop();
      });
    }
    /*
     * ⚠️ **좌측 레일 '민원' 아이콘은 표시하지 않는다**(PO 2026-08-31 "홈화면에서 민원 아이콘을 삭제").
     *   보너스(프리셀) 진입은 **좌측 공공건물의 민원 창구 버튼**(`openCivicDesk` → playKlondike)에 남아 있어
     *   경로가 사라지지는 않는다. 되살리려면 이 줄의 주석을 풀 것(setupBonusGameIcon 은 그대로 둔다).
     */
    void this.setupBonusGameIcon; // 되살릴 때: 아래 줄의 주석을 풀 것.
    // this.setupBonusGameIcon(idx);
    this.setupStoreIncome(idx); // 점포 수익 통합 수금(배지 + 10분 타이머).
    // **투데이 리그** — 우측 상단 '트로피'(layer_11_copy3, 15·타이머) 아이콘.
    //   PO 2026-08-23: 펌프러시의 리그 팝업을 그대로 이식했다(ui/leaguePanel.ts).
    //   예전의 정적 데일리 미션 목업(blank_copy 저작 + 가상 랭킹)은 이걸로 대체돼 삭제됐다.
    idx
      .tryById<Phaser.GameObjects.Image>('layer_11_copy3')
      ?.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx('button');
        this.openLeague();
      });
    /*
     * **리그 아이콘의 남은 시간은 실제 시간이어야 한다**(PO 2026-08-24: "하드코딩된 숫자가 아닌 실제
     *   시간을 표시해야 합니다"). 저작 텍스트(`layer_13_copy6`)에 "12:00:00" 이 박혀 있어, 자정까지
     *   얼마나 남았든 늘 같은 숫자가 보였다. 1초마다 실제 남은 시간으로 갱신한다.
     *   `layer_13_copy3`("15")는 **지금 순위**로 바꾼다 — 아이콘만 보고도 내 위치가 읽힌다.
     *   표기 규약은 `ui/leagueRail.ts` 단일 출처(플레이 화면도 같은 것을 쓴다).
     */
    {
      const remain = idx.tryById<Phaser.GameObjects.Text>('layer_13_copy6');
      const points = idx.tryById<Phaser.GameObjects.Text>('layer_13_copy3');
      // ⚠️ 순위 계산은 무겁다(세이브 파싱 + 봇 99명 정렬) — 5초마다. 시간만 매초.
      const paintTime = (): void => {
        remain?.setText(remainLabel(new Date()));
      };
      const paintRank = (): void => {
        points?.setText(rankLabel(new Date()));
      };
      paintTime();
      paintRank();
      if (remain) this.time.addEvent({ delay: 1000, loop: true, callback: paintTime });
      if (points) this.time.addEvent({ delay: 5000, loop: true, callback: paintRank });
    }
    // **랭킹** — 우측 'Rank'(layer_11_copy4) 아이콘 → 펌프러시 리더보드 화면(PO 지정).
    idx
      .tryById<Phaser.GameObjects.Image>('layer_11_copy4')
      ?.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx('button');
        this.openLeaderboard();
      });
    // **콜렉션 카드**(2026-07-19) — 우측 'Pass'(layer_11_copy5) 아이콘 → 세트별 콜렉션 카드 팝업.
    idx
      .tryById<Phaser.GameObjects.Image>('layer_11_copy5')
      ?.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx('button');
        this.showCollectionCards();
      });
    // **광고 제거(NoAds) 아이콘**(디자이너 저작 layer_18, 2026-08-23) — 누르면 안내 팝업, 사면 아이콘이 사라진다.
    this.noAdsIcon = idx.tryById<Phaser.GameObjects.Image>(NOADS_NODE_ID);
    this.noAdsIcon?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      this.showNoAds();
    });
    this.syncNoAdsIcon();
    // **좌우 스테이지 이동 화살표**(디자이너 배치) — 스와이프를 모르는 플레이어용. 누르면 한 스테이지씩 팬.
    //   layer_17=좌(x=72), layer_17_copy=우(x=1004). 해당 방향 스테이지 없으면 updateLotArrows 가 숨김.
    this.leftArrow = idx.tryById<Phaser.GameObjects.Image>('layer_17');
    this.rightArrow = idx.tryById<Phaser.GameObjects.Image>('layer_17_copy');
    this.leftArrow?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      this.panOneStage(-1);
    });
    this.rightArrow?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      this.panOneStage(1);
    });
    this.updateLotArrows(); // 초기 표시 상태(우측 부지 유무 등) 반영.
    // 계속하기 = **플레이 버튼(UI_21, layer_8)** + 레벨 라벨(layer_12) → **최상단(최신) 건설 층 전면 발코니**에 배치.
    const playBtn = idx.tryById<Phaser.GameObjects.Image>('layer_8');
    const playTitle = idx.tryById<Phaser.GameObjects.Text>('layer_9'); // '계속하기' 타이틀.
    const playLbl = idx.tryById<Phaser.GameObjects.Text>('layer_12'); // 'Lv N' 라벨.
    if (playBtn) {
      this.continueBtn = playBtn;
      this.continueTitle = playTitle;
      this.continueLabel = playLbl;
      // 타이틀/라벨의 버튼 대비 상대 오프셋(저작 위치)을 보존해 옮겨도 배치 동일.
      const bNode = idx.nodeById('layer_8');
      const tNode = idx.nodeById('layer_9');
      const lNode = idx.nodeById('layer_12');
      if (bNode && tNode) {
        this.continueTitleDX = tNode.x - bNode.x;
        this.continueTitleDY = tNode.y - bNode.y;
      }
      if (bNode && lNode) {
        this.continueLabelDX = lNode.x - bNode.x;
        this.continueLabelDY = lNode.y - bNode.y;
      }
      playBtn.setInteractive({ useHandCursor: true });
      playBtn.on('pointerdown', () => {
        if (this.constructing) return; // 건설/철거 애니 중 이탈 금지(소프트락 방지).
        sfx('floor_select');
        this.startPlay(Math.min(Math.max(1, loadSave().level), this.levelCount()));
      });
      this.placeContinueButton(); // 최상단 건설 층으로 이동.
    }
  }

  /**
   * **계속하기(플레이) 버튼을 최상단 "소유"층의 전면 발코니에 배치**(요구사항: 최종 업그레이드 층에 CTA).
   *   ⚠️ 2026-07-19 수정 — 예전엔 `builtFloors`(건설=보이기만, 미소유 가능) 기준이라, 2층이 지어져 있지만
   *   아직 매입 전이면 플레이 버튼이 2층 발코니(매입 게이트 뒤)로 올라가 버려 **1층엔 진입 버튼이 없는 것처럼
   *   보였다**(PO 리포트). 실제 플레이도 소유 최고층에서 진행하므로(PlayScene floorThemeIdx) 버튼도 그 층과
   *   맞춘다 — `ownedFloors` 기준으로 변경.
   *   층을 매입/건설하면 그 새 최상층으로 함께 올라간다. 월드 오브젝트라 타워와 함께 스크롤.
   */
  private placeContinueButton(): void {
    const btn = this.continueBtn;
    if (!btn) return;
    const topLevel = Math.max(1, Math.min(this.ownedFloors, this.towerFloors.length));
    const entry = this.towerFloors[topLevel - 1];
    if (!entry) return;
    const cx = entry.node.x ?? W / 2;
    const by = entry.node.y + (entry.node.h ?? LOT2_FLOOR_H) * CONTINUE_FLOOR_OFFSET; // 층 중심 아래 = 전면 발코니.
    const depth = this.floorDepth(topLevel) + CONTINUE_DEPTH_LIFT; // 손님/코인 위로.
    btn.setPosition(cx, by).setDepth(depth).setVisible(true);
    const cont = Math.min(Math.max(1, loadSave().level), this.levelCount());
    this.continueTitle
      ?.setPosition(cx + this.continueTitleDX, by + this.continueTitleDY)
      .setDepth(depth + 1)
      .setVisible(true);
    this.continueLabel
      ?.setPosition(cx + this.continueLabelDX, by + this.continueLabelDY)
      .setDepth(depth + 1)
      .setVisible(true)
      .setText(`Lv ${cont}`);
  }

  /** 다이아 보유 표시 갱신(건설 차감·상점 구매 뒤 호출) — 상단 헤더의 다이아(젬) 값. */
  private refreshHomeDiamond(): void {
    this.homeHeader?.setDiamonds(loadSave().diamonds ?? 0);
  }

  /**
   * **도전 배수 선택 줄**(진입 팝업 공용, 임시 코드드로우 — 디자인 재작업 예정).
   *   해금(레벨) 배수만 활성 — 선택 시 onChange(mult). '베팅' 용어 금지(비도박 프레임).
   */
  /**
   * **게임 진입 팝업**(레벨 엔트리) — entryPopup.ts(blank.json SSOT, 홈·플레이 공용)를 그린다.
   *   디자인 미저작 시 코드 드로우 폴백(startPlayFallback).
   */
  private startPlay(level: number): void {
    const handle = buildEntryPopup(this, {
      level,
      pinToUi: (o) => this.pinToUi(o), // UI(고정) 카메라 전용 — 타워 스크롤과 무관.
      uiCam: this.uiCam, // 딤이 **이 카메라** 기준으로 화면 전체를 덮게 한다.
      toast: (msg) => this.toast(msg),
      onCoinsChanged: (coins) => this.homeHeader?.setCoins(coins),
      onPlay: ({ level: lv, mult }) => this.scene.start('play', { level: lv, mult }),
    });
    if (!handle) this.startPlayFallback(level);
  }

  /**
   * **투데이 리그**(우상단 트로피·랭크 아이콘) — 펌프러시에서 이식한 팝업(`ui/leaguePanel.ts`).
   *
   * 예전에는 저작 blank_copy(DAILY COMPETITION MISSION)를 정적으로 그리고 가상 랭킹을 얹은
   * **목업**이었다(PO 2026-08-23 "현재 적용을 삭제한다"). 지금은 순위·보상·마일스톤이 전부
   * 시뮬레이션(`logic/league.ts`)에서 나오고, 내 이름·아바타는 프로필에서 온다.
   */
  /**
   * **Catch the Thief 주간 이벤트** — 상단 배너를 누르면 열리는 사다리 팝업.
   *   펌프러시의 탑 이벤트 화면을 구조 그대로 이식했다(`ui/eventPanel.ts`). 목표·보상은
   *   이 게임 것이다(`config/thiefEvent.ts`).
   */
  private openThiefEvent(): void {
    this.openThiefEventNow(); // 부팅 상주(그룹 해제 2026-08-31).
  }

  private openThiefEventNow(): void {
    this.scrollSuspended = true;
    let panel: Phaser.GameObjects.Container | undefined;
    panel = openEventPanel(this, {
      depth: 4300,
      uiCam: this.uiCam,
      itemFloor: openFloorOf(loadSave()), // **지금 점포**의 상품(칸마다 바뀌지 않는다 — PO 2026-08-24).
      onClose: () => {
        panel?.destroy();
        panel = undefined;
        this.scrollSuspended = false;
      },
    });
    this.pinToUi(panel);
  }

  /**
   * **리더보드**(우측 Rank 아이콘) — 펌프러시 `blank_6` 저작 화면을 그대로 이식했다.
   *   탭 3개는 이 게임 지표로 바꿨다(최고레벨 · 최고층 · 리그점수) — 원본 탭(무한·질주·PVP)은
   *   이 게임에 없는 모드라 그대로 두면 빈 표가 된다.
   */
  private openLeaderboard(): void {
    this.openLeaderboardNow(); // 부팅 상주(그룹 해제 2026-08-31).
  }

  private openLeaderboardNow(): void {
    this.scrollSuspended = true;
    let panel: Phaser.GameObjects.Container | undefined;
    panel = openLeaderboardPanel(this, {
      depth: 4300,
      uiCam: this.uiCam,
      onClose: () => {
        panel?.destroy();
        panel = undefined;
        this.scrollSuspended = false;
      },
    });
    this.pinToUi(panel);
  }

  private openLeague(startNearMe = false): void {
    // ⚠️ **리그는 지연 로드하지 않는다**(PO 2026-08-31 "후반 로딩하면서 이미지가 깨진다 — 메모리 문제가 없다면
    //   이 후반 로딩을 적용하지 마라"). 리그 아트는 부팅에 상주한다(gen-asset-groups GROUPS 에서 제외).
    this.openLeagueNow(startNearMe);
  }

  private openLeagueNow(startNearMe: boolean): void {
    const save = loadSave();
    const me = profileOf(save);
    const points = (save.leaguePeriodId ?? 0) === periodIdFor(new Date()) ? (save.leaguePoints ?? 0) : 0;
    this.scrollSuspended = true; // 팝업 위 스와이프가 배경 타워를 끌지 않게.
    // ⚠️ 패널은 **닫기를 알려 줄 뿐 스스로 사라지지 않는다**(원본 규약) — 정리는 여기서 한다.
    let panel: Phaser.GameObjects.Container | undefined;
    panel = openLeaguePanel(this, {
      depth: 4300,
      uiCam: this.uiCam, // 딤이 **화면 전체**를 덮게(세이프존 중앙정렬 오프셋 보정).
      startNearMe,
      stageFloor: save.builtFloors, // 진행바 아이콘 = 지금 단계가 모으는 층 상품.
      myName: me.name,
      myPoints: points,
      onClose: () => {
        panel?.destroy();
        panel = undefined;
        this.scrollSuspended = false;
      },
    });
    this.pinToUi(panel); // UI(고정) 카메라 전용 — 타워 스크롤과 무관.
  }


  /**
   * **콜렉션 카드**(우상단 Pass 아이콘, 2026-07-19) — 세트를 직접 여는 대신 **메인 카드(허브)**를 먼저 연다
   *   (PO 지시: "콜렉션카드를 직접 진입하지 말고 이 메인카드에 진입 후 각 카드 스테이지에 진입" — 허브는
   *   다시 제작될 예정이라 collectionHub.ts 는 지금은 코드 드로우 임시 그리드다). 허브에서 세트를 고르면
   *   그 세트의 상세 화면(collectionPopup.ts, blank_copy2.json)을 `initialPage`로 열고, 그 화면을 닫으면
   *   허브로 돌아온다(드릴다운 네비게이션). 열려 있는 동안 **타워 드래그 스크롤을 잠근다**(scrollSuspended)
   *   — 안 그러면 카드 스와이프와 배경 타워 드래그 스크롤이 같은 포인터 제스처에 동시에 반응한다(2026-07-19 QA).
   */
  private showCollectionCards(): void {
    this.showCollectionCardsNow(); // 부팅 상주(그룹 해제 2026-08-31).
  }

  private showCollectionCardsNow(): void {
    this.scrollSuspended = true;
    const hub = buildCollectionHub(this, {
      pinToUi: (o) => this.pinToUi(o),
      uiCam: this.uiCam,
      onClose: () => {
        this.scrollSuspended = false;
      },
      onSelect: (setIndex) => {
        hub.layer.setVisible(false);
        const popup = buildCollectionPopup(this, {
          initialPage: setIndex,
          pinToUi: (o) => this.pinToUi(o),
          uiCam: this.uiCam,
          onClose: () => {
            hub.layer.setVisible(true); // 세트 화면을 닫으면 메인 카드로 복귀.
          },
        });
        if (!popup) {
          hub.layer.setVisible(true);
          this.toast('콜렉션 카드 준비 중');
        }
      },
    });
  }

  /**
   * **게임 진입 팝업 폴백**(디자인 미저작) — 코드 드로우 placeholder.
   *   상단: 레벨 + 별3 · ✕ | 중앙: 보상 미리보기 | 아이템 슬롯 3칸 | 플레이 버튼 + 게임비.
   */
  private startPlayFallback(level: number): void {
    const save = loadSave();
    const cx = W / 2;
    const layer = overlayLayer(this, 4000);
    this.pinToUi(layer);
    layer.add(overlayScrim(this, 0x140a1e, 0.86, this.uiCam));

    // ── 패널(크림 프레임, 추후 디자인 교체) ──
    const panelTop = 420;
    const panelBot = 1980;
    const panel = this.add.rectangle(cx, (panelTop + panelBot) / 2, 940, panelBot - panelTop, 0xfff3e0).setStrokeStyle(10, 0xe0b070);
    layer.add(panel);

    // ── 상단: 레벨 + 별3 + ⓘ/✕ ──
    layer.add(this.add.text(cx, panelTop + 60, `레벨 ${level}`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '64px', color: '#7a4a1a', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5));
    for (let i = 0; i < 3; i++) {
      const st = this.add.image(cx + (i - 1) * 90, panelTop + 150, 'up_Solitare_UI_02_v2').setDisplaySize(76, 76);
      if (!this.textures.exists('up_Solitare_UI_02_v2')) st.setVisible(false);
      layer.add(st);
    }
    const closeBtn = this.add.text(panelBot > 0 ? cx + 400 : 0, panelTop + 40, '✕', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '56px', color: '#c0392b', backgroundColor: '#ffffff', padding: { x: 16, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      sfx('level_close');
      layer.destroy();
    });
    layer.add(closeBtn);

    // ── 중앙: 보상 미리보기(승리 시 획득) — 코인·다이아 아이콘. ──
    const rewY = panelTop + 430;
    layer.add(this.add.text(cx, rewY - 130, '승리 보상', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '42px', color: '#9a6a2a' }).setOrigin(0.5));
    const coinPrev = this.add.image(cx - 170, rewY, 'up_Solitare_UI_2_3');
    if (this.textures.exists('up_Solitare_UI_2_3')) {
      const s = texSize(coinPrev.texture);
      coinPrev.setDisplaySize(150, 150 * (s.height / s.width));
    }
    layer.add(coinPrev);
    layer.add(this.add.text(cx - 170, rewY + 110, '코인', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '36px', color: '#7a4a1a' }).setOrigin(0.5));
    const gemPrev = this.add.image(cx + 170, rewY, 'up_Solitare_UI_2_2');
    if (this.textures.exists('up_Solitare_UI_2_2')) {
      const s = texSize(gemPrev.texture);
      gemPrev.setDisplaySize(140, 140 * (s.height / s.width));
    }
    layer.add(gemPrev);
    layer.add(this.add.text(cx + 170, rewY + 110, '다이아', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '36px', color: '#7a4a1a' }).setOrigin(0.5));

    // ── **아이템 슬롯 3칸**(부스터 placeholder) — 추후 인벤토리/디자인 연동. ──
    const slotY = panelTop + 780;
    const slots: Array<{ icon: string; label: string; count: number }> = [
      { icon: '🃏', label: '와일드', count: 2 },
      { icon: '➕', label: '＋5 카드', count: 2 },
      { icon: '↩', label: '되돌리기', count: 1 },
    ];
    slots.forEach((it, i) => {
      const sx = cx + (i - 1) * 250;
      const box = this.add.rectangle(sx, slotY, 200, 200, 0xffe6bf).setStrokeStyle(6, 0xd8a860);
      layer.add(box);
      layer.add(this.add.text(sx, slotY - 20, it.icon, { fontSize: '80px' }).setOrigin(0.5));
      layer.add(this.add.text(sx, slotY + 72, it.label, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '28px', color: '#7a4a1a' }).setOrigin(0.5));
      // 개수 배지(우하단).
      layer.add(this.add.circle(sx + 78, slotY + 78, 30, 0x2a7ad8).setStrokeStyle(4, 0xffffff));
      layer.add(this.add.text(sx + 78, slotY + 78, `${it.count}`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '34px', color: '#ffffff' }).setOrigin(0.5));
    });
    layer.add(this.add.text(cx, slotY + 150, '아이템(부스터) — 배치 자리', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '26px', color: '#a98' }).setOrigin(0.5));

    // ── 플레이 버튼(대형) + 게임비(레벨 곡선 × 도전 배수) ──
    const playBg = this.add.rectangle(cx, panelBot - 200, 560, 150, 0x4caf50).setStrokeStyle(8, 0xffffff).setInteractive({ useHandCursor: true });
    const playTxt = this.add.text(cx, panelBot - 200, '플레이', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '68px', color: '#ffffff', stroke: '#2a6a2a', strokeThickness: 6 }).setOrigin(0.5);
    layer.add(playBg);
    layer.add(playTxt);
    const costText = this.add.text(cx, panelBot - 90, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '38px', color: '#7a4a1a' }).setOrigin(0.5);
    layer.add(costText);
    let mult = 1;
    const refreshCost = (): boolean => {
      const fee = entryFeeFor(level, mult);
      const ok = loadSave().coins >= fee;
      costText.setText(`게임비  🪙 ${fee.toLocaleString()}   (보유 ${save.coins.toLocaleString()})`).setColor(ok ? '#7a4a1a' : '#c0392b');
      playBg.setFillStyle(ok ? 0x4caf50 : 0x9a9a9a);
      return ok;
    };
    createChallengeBadge(this, layer, level, cx, panelBot - 340, 110, 1, (msg) => this.toast(msg), (m) => { mult = m; refreshCost(); });
    refreshCost();
    const doPlay = (): void => {
      const fee = entryFeeFor(level, mult);
      const s = loadSave();
      if (s.coins < fee) {
        sfx('no_coin');
        /*
         * **핀치 순간의 초회 오퍼**(PO 2026-08-25) — 입장료가 모자란 그 순간 스타터 팩(초회 한정)을
         *   제안한다. ⚠️ 홈은 uiCam·pinToUi 필수(공용 팝업 규칙 — 월드 카메라 팬/줌과 무관하게 덮는다).
         */
        if (openStarterOffer(this, {
          uiCam: this.uiCam,
          pinToUi: (o) => this.pinToUi(o),
          toast: (m) => this.toast(m),
          onGranted: () => {
            const sv = loadSave();
            this.homeHeader?.setCoins(sv.coins);
            refreshCost();
          },
        })) { bumpMetrics({ pinch: 1 }); return; }
        bumpMetrics({ pinch: 1 }); // 일일 지표 — 입장료 핀치.
        this.toast('코인이 부족해요');
        return;
      }
      sfx('floor_select');
      s.coins = Math.max(0, s.coins - fee);
      bumpMetrics({ fee, starts: 1, levelMax: level }); // 일일 지표 — 입장료·판 시작.
      writeSave(s);
      this.homeHeader?.setCoins(s.coins);
      layer.destroy();
      this.scene.start('play', { level, mult });
    };
    playBg.on('pointerdown', () => {
      this.tweens.add({ targets: [playBg, playTxt], scaleX: 0.94, scaleY: 0.94, duration: 80, yoyo: true, onComplete: doPlay });
    });
  }

  /**
   * **아이템샵** — 코인 팩·다이아 팩 상점 오버레이. 화면 구성은 공용 모듈 itemShop.ts 가 그린다
   *   (PO 2026-07-29 "게임플레이시 숍메뉴에 접근할 수 있어야 함" → 플레이 화면과 **같은 화면**을 쓰기 위해
   *   씬 밖으로 분리). 여기서는 홈 전용 배선(UI 카메라 고정 + 헤더 갱신 + 토스트)만 넘긴다.
   */
  private openItemShop(): void {
    openItemShop(this, {
      pin: (layer) => this.pinToUi(layer),
      uiCam: this.uiCam,
      onCoins: (n) => this.homeHeader?.setCoins(n),
      onDiamonds: () => this.refreshHomeDiamond(),
      toast: (msg) => this.toast(msg, true),
    });
  }

  /** 설정 오버레이 — 레벨 선택 · 배치 점검 · 사운드 토글 · 레벨 설정 · 리셋 관리. */
  private openSettings(save: SaveData): void {
    const cont = Math.min(Math.max(1, save.level), this.levelCount());
    const layer = overlayLayer(this, 3000);
    this.pinToUi(layer); // 오버레이는 UI(고정) 카메라 전용.
    const bg = overlayScrim(this, 0x140a1e, 0.92, this.uiCam);
    layer.add(bg);
    layer.add(
      this.add
        .text(W / 2, 380, '⚙ 설정', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '80px',
          color: '#ffe066',
          stroke: '#7a2d9a',
          strokeThickness: 9,
        })
        .setOrigin(0.5),
    );
    /**
     * **공용 버튼 아트**(ui/uiButton.ts) — 예전엔 색만 다른 네모 텍스트라 팝업마다 모양이 달랐다.
     * ⚠️ 알약 아트는 **폭의 1/3 이 높이**다(2172×724). 예전 네모 버튼 기준으로 잡아 둔 140px 간격에
     *   폭 640(높이 213)을 넣으면 서로 겹친다 — 간격(SETTINGS_STEP)에 맞춰 폭을 잡는다.
     */
    const SETTINGS_STEP = 190;
    let mkBtnIdx = 0; // 고정 인덱스 대신 순번 카운터 — 항목을 추가·삭제해도 하드코딩 번호를 다시 안 맞춰도 됨.
    const mkBtn = (label: string, color: ButtonColor, fn: () => void): Phaser.GameObjects.Container => {
      const b = uiButton(this, W / 2, 560 + mkBtnIdx * SETTINGS_STEP, label, color, fn, { width: 560, fontSize: 46 });
      mkBtnIdx += 1;
      layer.add(b);
      return b;
    };
    mkBtn('≡ 레벨 선택', 'purple', () => {
      sfx('level_open');
      layer.destroy();
      this.showLevelSelect(loadSave());
    });
    mkBtn('🔍 배치 점검', 'blue', () => {
      if (this.constructing) return; // 건설/철거 애니 중 이탈 금지(소프트락 방지).
      sfx('button');
      this.scene.start('preview', { level: cont });
    });
    // **사운드 볼륨**(PO 2026-07-28) — 플레이 메뉴와 동일한 단계 순환 버튼(100→75→50→25→꺼짐).
    const snd = mkBtn(volumeLabel(), 'purple', () => {
      const v = cycleVolume();
      setButtonLabel(snd, volumeLabel());
      if (v > 0) sfx('button');
    });
    // **진동**(2026-08-25) — 켜짐/꺼짐 토글(플레이 메뉴와 동일, haptics.ts).
    const hap = mkBtn(hapticsLabel(), 'purple', () => {
      toggleHaptics();
      setButtonLabel(hap, hapticsLabel());
      sfx('button');
    });
    // **레벨 설정**(개발/테스트) — 현재 진행 레벨을 임의 값으로 조정(상한 = 저작된 레벨 수).
    mkBtn('🎚 레벨 설정', 'orange', () => {
      sfx('button');
      layer.destroy();
      this.openLevelEditor();
    });
    // **리셋 관리**(개발/테스트) — 레벨·건설·이벤트 리셋 + 재화 재설정을 한 화면에 모아둔다(2026-07-19,
    //   예전엔 이 4개가 설정 목록에 낱개로 흩어져 있어 관리가 번거로웠다).
    mkBtn('🔄 리셋 관리', 'orange', () => {
      sfx('button');
      layer.destroy();
      this.openResetMenu();
    });
    mkBtn('✕ 닫기', 'red', () => {
      sfx('level_close');
      layer.destroy();
    });
    // **빌드 버전** — 메뉴(설정) 화면 하단에 표시(홈 화면에서 이관).
    layer.add(
      this.add
        .text(W / 2, H - 36, `${BUILD_VERSION}
${this.packSignature()}`, {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#00000055',
          padding: { x: 14, y: 7 },
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.8),
    );
  }

  /**
   * **리셋 관리**(설정 → 🔄 리셋 관리, 2026-07-19) — 개발/테스트용 리셋 4종을 한 화면에 모은다:
   *   레벨 리셋 · 건설 리셋 · 이벤트 리셋(신설) · 재화 재설정. 예전엔 설정 목록에 낱개 버튼으로 흩어져
   *   있어 서로 다른 화면(직접 실행/확인창/별도 에디터)을 오가야 했다 — 여기서 한 번에 접근한다.
   */
  private openResetMenu(): void {
    const layer = overlayLayer(this, 3000);
    this.pinToUi(layer);
    layer.add(overlayScrim(this, 0x140a1e, 0.92, this.uiCam));
    layer.add(
      this.add
        .text(W / 2, 380, '🔄 리셋 관리', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '76px',
          color: '#ffe066',
          stroke: '#7a2d9a',
          strokeThickness: 9,
        })
        .setOrigin(0.5),
    );
    const mkBtn = (y: number, label: string, bgc: string, fn: () => void): void => {
      const t = this.add
        .text(W / 2, y, label, {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '50px',
          color: '#ffffff',
          backgroundColor: bgc,
          padding: { x: 40, y: 26 },
          align: 'center',
          fixedWidth: 660,
        })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    // **레벨 리셋** — 진행 레벨을 1로 되돌린다(플레이 기록도 초기화). PO 2026-07-20: "모든 상황을 1레벨로
    //   초기화" + "콜렉션 카드를 전부 0으로" — 콜렉션 보유 상태도 함께 비운다(defaultCollection()이 SSOT).
    mkBtn(600, '⏮ 레벨 리셋 (→ Lv1)', '#6a3a9a', () => {
      sfx('button');
      const s = loadSave();
      s.level = 1;
      s.playedLevels = [];
      s.collection = defaultCollection();
      writeSave(s);
      this.homeHeader?.setLevel(1);
      this.toast('레벨을 1로 리셋했어요(콜렉션 포함)', true);
      layer.destroy();
      this.scene.restart(); // 타워/진행 표시 갱신.
    });
    // **건설 리셋** — 확인창을 거쳐 초기 상태(건설/부지)로 재시작.
    mkBtn(740, '🏗 건설 리셋', '#a15c1e', () => {
      sfx('button');
      layer.destroy();
      this.confirmReset();
    });
    /*
     * **전체 이벤트 리셋**(PO 2026-08-24: "전체 이벤트도 리셋하세요") — 예전엔 상단 미션 리워드 배너만
     *   지워서, 투데이 리그가 완주 상태로 남아 다음 테스트가 통째로 0 이 되는 일이 있었다. 이제
     *   지울 목록은 `logic/eventReset.ts` 한 곳에 있고 계측 대시보드도 같은 함수를 쓴다.
     *   코인·다이아·레벨·건설·컬렉션은 건드리지 않는다.
     */
    mkBtn(880, '🎉 전체 이벤트 리셋', '#7a3a5a', () => {
      sfx('button');
      writeSave(resetAllEvents(loadSave()));
      this.toast(`이벤트를 초기화했어요 — ${EVENT_RESET_ITEMS.join(' · ')}`, true);
      layer.destroy();
      this.scene.restart(); // 미션 배너 갱신.
    });
    // **재화 재설정** — 코인·다이아 조정/초기화 전용 화면으로.
    mkBtn(1020, '💰 재화 재설정', '#2a7a5a', () => {
      sfx('button');
      layer.destroy();
      this.openCurrencyEditor();
    });
    // **전체 레벨 테스트**(2026-07-20) — 진행도(save.level)와 무관하게 저작된 모든 레벨을 잠금 해제해
    // 바로 골라 플레이할 수 있는 QA 전용 진입점(정상 "레벨 선택"의 게이팅은 그대로 유지, 별도 화면).
    mkBtn(1160, '🧪 전체 레벨 테스트', '#3a5a9a', () => {
      sfx('button');
      layer.destroy();
      this.showLevelSelect(loadSave(), true);
    });
    /*
     * **테스트용 전체 완공**(2026-08-31 재설계 — 메인→2번라인→호텔 순차 3구간 전부 지금 상태로).
     *   리셋해도 모든 건물이 선 상태를 볼 수 있게. 세이브를 실제로 완공 상태로 쓰므로 **되돌리려면
     *   '건설 리셋'** 을 누르면 된다(옆 항목). 재화·레벨은 건드리지 않는다.
     *   ⚠️ 프리뷰 연출(1회)도 이미 본 것으로 표시한다 — 완공 상태에서 3~10층이 다시 솟는 연출은 어색하다.
     *   ⚠️ **R2 자리는 호텔 전용 슬롯이다**(`sideLots` 목록에서 아예 뺐다) — 더 이상 sideBuilt.R2 로 다루지
     *   않는다. R3 는 그와 무관한 별개 부지라 그대로 짓는다.
     */
    mkBtn(1300, '🏙 전체 건물 완공 (테스트)', '#2f6fb0', () => {
      sfx('button');
      const s = loadSave();
      s.builtFloors = MAX_FLOORS; // 메인타워 10층.
      s.ownedFloors = MAX_FLOORS;
      s.lot2Built = true;
      s.lot2Floors = LOT2_MAX_FLOORS; // 2번 라인 20층 — 실제 건설 상한까지.
      s.lot2Owned = LOT2_MAX_FLOORS;
      s.lot2Demolished = true;
      s.hotelBuilt = true;
      s.hotelFloors = HOTEL_FLOOR_COUNT; // 호텔 15층.
      s.hotelOwned = HOTEL_FLOOR_COUNT;
      s.sideBuilt = { L2: true, R3: true }; // 좌 외곽·우 최외곽 부지 1층.
      s.sideDemolished = { L2: true, R3: true };
      writeSave(s);
      markTipSeen(TOWER_PREVIEW_TIP); // 완공 상태에서 성장 프리뷰가 다시 돌지 않게.
      layer.destroy();
      this.scene.restart();
    });
    mkBtn(1440, '✕ 닫기', '#c0392b', () => {
      sfx('level_close');
      layer.destroy();
    });
  }

  /**
   * **재화 재설정 메뉴**(설정 → 재화 재설정) — 코인·다이아 현재값 표시 + 조정(±)·초기화(코인 1000·다이아 30).
   *   상단 헤더 값도 즉시 갱신.
   */
  private openCurrencyEditor(): void {
    const layer = overlayLayer(this, 3200);
    this.pinToUi(layer);
    layer.add(overlayScrim(this, 0x140a1e, 0.94, this.uiCam));
    layer.add(this.add.text(W / 2, 480, '💰 재화 재설정', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '72px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 }).setOrigin(0.5));
    const coinVal = this.add.text(W / 2, 700, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '54px', color: '#ffd84a' }).setOrigin(0.5);
    const gemVal = this.add.text(W / 2, 1120, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '54px', color: '#e79bff' }).setOrigin(0.5);
    layer.add(coinVal);
    layer.add(gemVal);
    const refresh = (): void => {
      const s = loadSave();
      coinVal.setText(`🪙 코인 : ${s.coins.toLocaleString()}`);
      gemVal.setText(`💎 다이아 : ${(s.diamonds ?? 0).toLocaleString()}`);
      this.homeHeader?.setCoins(s.coins);
      this.refreshHomeDiamond();
    };
    const adjust = (coinD: number, gemD: number): void => {
      const s = loadSave();
      s.coins = Math.max(0, s.coins + coinD);
      s.diamonds = Math.max(0, (s.diamonds ?? 0) + gemD);
      writeSave(s);
      sfx('button');
      refresh();
    };
    const setVals = (coins: number, gems: number): void => {
      const s = loadSave();
      s.coins = coins;
      s.diamonds = gems;
      writeSave(s);
      sfx('button');
      refresh();
    };
    // 작은 조정 버튼(±) — 코인 라벨 아래 / 다이아 라벨 아래.
    const small = (x: number, y: number, label: string, bg: string, fn: () => void): void => {
      const t = this.add
        .text(x, y, label, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '40px', color: '#fff', backgroundColor: bg, padding: { x: 26, y: 16 }, align: 'center', fixedWidth: 220 })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    small(W / 2 - 260, 820, '−1000', '#7a3a3a', () => adjust(-1000, 0));
    small(W / 2, 820, '+1000', '#3a6a3a', () => adjust(1000, 0));
    small(W / 2 + 260, 820, '+10000', '#3a6a3a', () => adjust(10000, 0));
    small(W / 2 - 260, 1240, '−10', '#5a3a6a', () => adjust(0, -10));
    small(W / 2, 1240, '+10', '#5a4a7a', () => adjust(0, 10));
    small(W / 2 + 260, 1240, '+100', '#5a4a7a', () => adjust(0, 100));
    // 초기화 + 닫기.
    const big = (y: number, label: string, bg: string, fn: () => void): void => {
      const t = this.add
        .text(W / 2, y, label, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '50px', color: '#fff', backgroundColor: bg, padding: { x: 40, y: 24 }, align: 'center', fixedWidth: 640 })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    big(1440, `↺ 초기값 (코인 ${START_COINS.toLocaleString()}·다이아 ${START_DIAMONDS})`, '#2a7a5a', () => setVals(START_COINS, START_DIAMONDS));
    big(1620, '✕ 닫기', '#c0392b', () => {
      sfx('level_close');
      layer.destroy();
    });
    refresh();
  }

  /**
   * **레벨 설정 메뉴**(설정 → 🎚 레벨 설정) — 현재 진행 레벨 표시 + 조정(±)·Lv1/최대 바로가기.
   *   상한 = 에디터에 저작된 레벨 수(levelCount) — 그 이상은 플레이할 레벨이 없으므로 여기서 클램프.
   *   레벨을 내리면 그 이상 레벨의 플레이 기록(playedLevels)도 정리해 첫 플레이(에디터 초기 딜)로
   *   되돌린다(레벨 리셋 →Lv1 과 동일한 규칙). 변경이 있었으면 닫을 때 씬 재시작(타워/진행 표시 갱신).
   */
  private openLevelEditor(): void {
    const max = this.levelCount();
    let changed = false;
    const layer = overlayLayer(this, 3200);
    this.pinToUi(layer);
    layer.add(overlayScrim(this, 0x140a1e, 0.94, this.uiCam));
    layer.add(this.add.text(W / 2, 480, '🎚 레벨 설정', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '72px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 }).setOrigin(0.5));
    const lvlVal = this.add.text(W / 2, 700, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '54px', color: '#8fd3ff' }).setOrigin(0.5);
    layer.add(lvlVal);
    const refresh = (): void => {
      const s = loadSave();
      lvlVal.setText(`⭐ 현재 레벨 : Lv ${s.level.toLocaleString()}  (최대 Lv ${max.toLocaleString()})`);
      this.homeHeader?.setLevel(s.level);
    };
    const applyLevel = (n: number): void => {
      const s = loadSave();
      const lv = Math.min(max, Math.max(1, Math.floor(n)));
      if (lv !== s.level) {
        writeSave({ ...s, level: lv, playedLevels: (s.playedLevels ?? []).filter((p) => p < lv) });
        changed = true;
      }
      sfx('button');
      refresh();
    };
    // 작은 조정 버튼(±) — 재화 재설정 메뉴와 동일한 스타일.
    const small = (x: number, y: number, label: string, bg: string, fn: () => void): void => {
      const t = this.add
        .text(x, y, label, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '40px', color: '#fff', backgroundColor: bg, padding: { x: 26, y: 16 }, align: 'center', fixedWidth: 220 })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    small(W / 2 - 390, 860, '−10', '#7a3a3a', () => applyLevel(loadSave().level - 10));
    small(W / 2 - 130, 860, '−1', '#7a3a3a', () => applyLevel(loadSave().level - 1));
    small(W / 2 + 130, 860, '+1', '#3a6a3a', () => applyLevel(loadSave().level + 1));
    small(W / 2 + 390, 860, '+10', '#3a6a3a', () => applyLevel(loadSave().level + 10));
    small(W / 2 - 260, 1000, '−100', '#7a3a3a', () => applyLevel(loadSave().level - 100));
    small(W / 2 + 260, 1000, '+100', '#3a6a3a', () => applyLevel(loadSave().level + 100));
    // 바로가기 + 닫기.
    const big = (y: number, label: string, bg: string, fn: () => void): void => {
      const t = this.add
        .text(W / 2, y, label, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '50px', color: '#fff', backgroundColor: bg, padding: { x: 40, y: 24 }, align: 'center', fixedWidth: 640 })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
    };
    big(1200, '⏮ Lv 1 로', '#6a3a9a', () => applyLevel(1));
    big(1360, `⏭ 최대 (Lv ${max.toLocaleString()})`, '#2a7a5a', () => applyLevel(max));
    big(1540, '✕ 닫기', '#c0392b', () => {
      sfx('level_close');
      layer.destroy();
      if (changed) this.scene.restart(); // 타워/진행 표시 갱신(레벨 리셋과 동일).
    });
    refresh();
  }

  /** 건설 리셋 확인 — 초기화 시 임시저장 삭제 후 씬 재시작(초기 상태). */
  /** 구매 상태에 맞춰 아이콘 표시 — 이미 산 사람에게 광고 제거 버튼을 계속 보일 이유가 없다. */
  private syncNoAdsIcon(): void {
    this.noAdsIcon?.setVisible(!hasNoAds());
  }

  /**
   * **광고 제거 안내**(PO 2026-08-23, 홈 NoAds 아이콘).
   *   ⚠️ 이 게임엔 아직 광고 모듈이 붙어 있지 않다 — 지금은 구매 상태만 저장해 두고(`save.noAds`),
   *   나중에 광고를 붙일 때 이 값을 보고 건너뛴다. 결제도 아이템샵 팩과 같은 **데모**(즉시 적용)다.
   */
  private showNoAds(): void {
    const layer = overlayLayer(this, 3100);
    this.pinToUi(layer);
    layer.add(overlayScrim(this, 0x000000, 0.72, this.uiCam));
    const cy = H / 2 - 150;
    // 본문은 **창 안쪽 한가운데**, 제목은 **위로 솟은 탭**에 — 아트가 그렇게 그려져 있다(PO 2026-08-23).
    const body = this.add
      .text(W / 2, cy, ['게임 중 나오는 전면 광고가 사라져요.', '한 번 사면 계속 적용됩니다.'].join(String.fromCharCode(10)), {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '44px',
        color: '#4a2f14',
        align: 'center',
        wordWrap: { width: W * 0.66 },
      })
      .setOrigin(0.5);
    const fit = fitMessagePanel(GREEN_PANEL, body.width, body.height, { minW: W * 0.8, maxW: W * 0.94, padX: 60, padY: 52 });
    if (this.textures.exists(TOAST_SENTENCE_KEY)) {
      layer.add(this.add.image(W / 2, cy, TOAST_SENTENCE_KEY).setDisplaySize(fit.pw, fit.ph));
    } else {
      layer.add(this.add.rectangle(W / 2, cy, fit.pw * 0.92, fit.ph * 0.86, 0xfff2df, 0.98).setStrokeStyle(6, 0x8ac46b));
    }
    body.setY(cy + fit.textY);
    layer.add(body);
    layer.add(
      this.add
        .text(W / 2, cy + (fit.titleY ?? -fit.ph * 0.42), '광고 제거', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '46px',
          color: '#ffffff',
          stroke: '#2f6b18',
          strokeThickness: 6,
          wordWrap: { width: fit.pw * (GREEN_PANEL.titleW ?? 0.5) },
        })
        .setOrigin(0.5),
    );
    // 버튼은 공용 아트(UI_30) — 어느 화면에서든 같은 모양(ui/uiButton.ts).
    const btnY = cy + fit.ph * 0.5 + 150;
    layer.add(uiButton(this, W / 2 - 240, btnY, '닫기', 'blue', () => layer.destroy(), { sound: 'level_close' }));
    layer.add(
      uiButton(this, W / 2 + 240, btnY, '광고 제거', 'green', () => {
        grantNoAds();
        layer.destroy();
        this.syncNoAdsIcon();
        this.toast('광고가 제거되었어요', true);
      }),
    );
  }

  private confirmReset(): void {
    const layer = overlayLayer(this, 3100);
    this.pinToUi(layer);
    layer.add(overlayScrim(this, 0x000000, 0.72, this.uiCam));
    layer.add(
      this.add
        .text(W / 2, H / 2 - 170, '건설 진행을 초기화할까요?\n(스테이지1·2 모두 초기 상태로)', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '54px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5),
    );
    // 공용 버튼 아트(UI_30) — 팝업 버튼은 전부 같은 모양으로(ui/uiButton.ts).
    layer.add(uiButton(this, W / 2 - 240, H / 2 + 90, '취소', 'blue', () => layer.destroy(), { sound: 'level_close' }));
    layer.add(
      uiButton(this, W / 2 + 240, H / 2 + 90, '초기화', 'red', () => {
        resetProgress();
        this.scene.restart();
      }),
    );
  }

  /** 하단 내비 — 계속하기(저장 레벨) + 레벨 선택. */
  private drawNav(save: SaveData): void {
    // 진행 레벨을 **저작된 레벨 수**로 클램프(미저작 레벨로 못 들어가게).
    const cont = Math.min(Math.max(1, save.level), this.levelCount());
    this.add
      .text(W / 2, H - 250, `▶ 계속하기  Lv.${cont}`, {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '52px',
        color: '#2a1830',
        backgroundColor: '#ffd166',
        padding: { x: 46, y: 20 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setShadow(0, 3, '#00000066', 6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.startPlay(cont);
      });
    this.add
      .text(W / 2 - 150, H - 150, '≡ 레벨 선택', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '40px',
        color: '#ffffff',
        backgroundColor: '#3a2a52',
        padding: { x: 30, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setShadow(0, 3, '#00000066', 6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx('level_open');
        this.showLevelSelect(save);
      });
    // 배치(디자인) 점검 — 게임이 아닌 레벨별 카드 배치 갤러리.
    this.add
      .text(W / 2 + 160, H - 150, '🔍 배치 점검', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '40px',
        color: '#20143a',
        backgroundColor: '#8fd0ff',
        padding: { x: 30, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setShadow(0, 3, '#00000066', 6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (this.constructing) return; // 건설/철거 애니 중 이탈 금지(소프트락 방지).
        sfx('button');
        this.scene.start('preview', { level: cont });
      });
  }

  /**
   * 레벨 선택 오버레이 — **저작된 레벨(1..N)만** 표시, 진행(save.level) 이하만 탭 가능(정상 플레이 경로).
   * `testMode=true` 면 진행도와 무관하게 **전부 잠금 해제**해서 아무 레벨이나 바로 테스트 플레이할 수
   * 있다(설정→🔄 리셋 관리→🧪 전체 레벨 테스트 전용 진입점 — 실제 플레이어 진행 게이팅은 안 건드림).
   */
  private showLevelSelect(save: SaveData, testMode = false): void {
    const total = this.levelCount(); // 에디터에 저작된 레벨 수(그 이상은 아예 표시하지 않음)
    const layer = overlayLayer(this, 2000);
    this.pinToUi(layer); // 레벨 선택 오버레이 — UI(고정) 카메라 전용.
    const bg = overlayScrim(this, 0x140a1e, 0.94, this.uiCam);
    layer.add(bg);
    layer.add(
      this.add
        .text(W / 2, 130, testMode ? '🧪 전체 레벨 테스트' : '레벨 선택', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: testMode ? '58px' : '72px',
          color: '#ffe066',
          stroke: '#7a2d9a',
          strokeThickness: 8,
        })
        .setOrigin(0.5),
    );

    const cols = 5;
    const cellW = 200;
    const cellH = 170;
    const startX = W / 2 - ((cols - 1) * cellW) / 2;
    const startY = 300;
    const shown = total; // 저작된 레벨 수만큼만 표시(이후 에디터로 추가하면 자동 증가)
    const gridC = this.add.container(0, 0);
    layer.add(gridC);
    for (let lv = 1; lv <= shown; lv++) {
      const idx = lv - 1;
      const x = startX + (idx % cols) * cellW;
      const y = startY + Math.floor(idx / cols) * cellH;
      const unlocked = testMode || lv <= Math.min(save.level, total);
      const btn = this.add
        .text(x, y, unlocked ? `${lv}` : `🔒`, {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '54px',
          color: unlocked ? '#2a1830' : '#ffffff',
          backgroundColor: unlocked ? '#ffd166' : '#4a3a5a',
          fixedWidth: 150,
          fixedHeight: 130,
          align: 'center',
        })
        .setOrigin(0.5)
        .setPadding(0, 44, 0, 0);
      if (unlocked) {
        btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.startPlay(lv);
        });
      }
      gridC.add(btn);
    }

    // 넘치면 드래그 스크롤.
    const rows = Math.ceil(shown / cols);
    const contentBottom = startY + rows * cellH;
    const minY = Math.min(0, H - 190 - contentBottom);
    if (minY < 0) {
      bg.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) gridC.y = Phaser.Math.Clamp(gridC.y + (p.position.y - p.prevPosition.y), minY, 0);
      });
    }

    layer.add(
      this.add
        .text(W / 2, H - 90, '✕ 닫기', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '44px',
          color: '#ffffff',
          backgroundColor: '#c0392b',
          padding: { x: 40, y: 16 },
        })
        .setOrigin(0.5)
        .setDepth(2001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          sfx('level_close');
          layer.destroy();
        }),
    );
  }

  /** 에디터 층 노드를 건설 상태에 따라 배선(플레이 / 건설 / 실루엣). */
  private wireTower(idx: LayoutIndex): void {
    this.layoutIdx = idx; // ⚠️ **먼저** 설정 — 아래 nearestEntry(floorDecor 구성)가 this.layoutIdx 를 쓴다.
    const allFloors = idx.entries().filter((e) => FLOOR_KEY_RE.test(e.node.key ?? ''));
    allFloors.sort((a, b) => b.node.y - a.node.y); // 아래(y 큰)=1F
    // **타워 = 템플릿의 모든 층 노드**(카드레벨 lc 와 무관). lc 로 자르면 4층이 동적층으로 중복 생성돼 idle 유리가 생겼음.
    const floors = allFloors;
    // 숨긴 층 위에 얹힌 장식(점주 Chr·유리난간)도 함께 숨긴다 — 최상위 표시층의 상단보다 위면 숨김.
    const topVisible = floors[floors.length - 1]?.node;
    if (topVisible) {
      const cutY = topVisible.y - (topVisible.h ?? 500) / 2;
      idx
        .entries()
        .filter((e) => /_Chr_|_BG_Glass/i.test(e.node.key ?? '') && e.node.y < cutY)
        .forEach((e) => (e.obj as Phaser.GameObjects.Image).setVisible(false));
    }
    this.floorDecor.clear();
    floors.forEach((e, i) => {
      const level = i + 1;
      const obj = e.obj as Phaser.GameObjects.Image;
      // 이 층의 장식(유리/캐릭터) — 건설 연출이 해당 층 것만 등장시키게 기록.
      const decorChar = this.nearestEntry(e.node, /_Chr_/i)?.obj as Phaser.GameObjects.Image | undefined;
      this.floorDecor.set(level, {
        glass: this.nearestEntry(e.node, /_BG_Glass/i)?.obj as Phaser.GameObjects.Image | undefined,
        char: decorChar,
      });
      wireClerkTalk(this, decorChar, themeForFloor(level), level); // 점원 탭 = 점포 테마 대사(+층 맥락).
      if (level <= this.shownFloors()) {
        obj.setAlpha(1); // 건설됨 — **표시만**. 층 탭으로 게임 진입 안 함(게임은 '계속하기'로만 진입).
      } else {
        obj.setVisible(false); // 미건설 층은 **숨김**(반투명 실루엣 X). 건설 연출에서만 등장.
        // 이 층 **자기 장식(유리/캐릭터)만** 숨긴다 — 아래 건설된 층 것(멀리 있는 것)은 건드리지 않게 근접 판정.
        const dec = this.floorDecor.get(level);
        const near = (o?: Phaser.GameObjects.Image): boolean => !!o && Math.abs(o.y - e.node.y) < (e.node.h ?? 500) * 0.7;
        if (near(dec?.glass)) dec!.glass!.setVisible(false);
        if (near(dec?.char)) dec!.char!.setVisible(false);
        // 건설 버튼은 **에디터 버튼(점포매입/건축)**을 쓴다 → wireStoreButtons. (코드 버튼 미생성)
      }
    });
    // **1층(편의점)은 앞 유리팬스 미설치**(요구사항 예외) — 유리 숨김 + decor 에서 제거(손님 depth 폴백).
    const dec1 = this.floorDecor.get(1);
    if (dec1?.glass) {
      dec1.glass.setVisible(false);
      dec1.glass = undefined;
    }
    this.towerFloors = floors.slice();
    // 레이아웃에 없는 상위 층(4~10)은 **전부 코드로 미리 렌더**(미건설은 숨김) → 건설 시 제자리에서 등장(재시작 없음).
    this.renderDynamicFloors();
    this.restackStage1(); // **스테이지2 기준 통일 스택**으로 스테이지1 층·장식을 재조정(수직위치·겹침·레이어 통일).
    // 지붕은 **현재 건설된 최상층**에 얹는다(3층까지 지어진 상태면 3층 위).
    this.capRoof(idx, this.towerFloors, Math.max(1, Math.min(this.shownFloors(), this.towerFloors.length)));
    this.normalizeClerkDepths(); // **모든 층 점원을 자기 층 유리팬스 바로 뒤로**(에디터 3층 점원이 유리 위로 올라오던 문제 수정).
    this.wireStoreButtons(idx); // 에디터 저작 점포매입/건축 버튼 배선 + depth 정정(손님이 앞을 가리지 않게).
    this.setupCrane();
    this.applyParallax(idx); // 배경 패럴랙스(근경 빠름·원경 느림·하늘 가장 느림).
    this.frameTower(); // 타워가 화면보다 크므로 카메라를 타워에 맞춘다(층 전체가 보이게).
    this.enableTowerScroll(); // 위아래 드래그 스크롤(월드 카메라).
    this.coverFarBackground(idx); // 원경(느린 패럴랙스)이 스크롤 하단에서 잘리지 않게 아래로 연장.
    this.tileBackdropLayers(idx); // 하늘·원경을 좌우로 이어 붙여 넓은 화면 가장자리를 채운다.
    // 도로/보도블록은 **에디터 위치 그대로** 둔다(늘리지 않음). 대신 update() 의 줌아웃을 지면 근처에서
    //   제한해(minZoomForGround) 도로 바닥 아래가 드러나지 않게 한다 → 도로가 화면 하단에서 안 떨어짐.
    this.applyPropShadows(idx); // 건물·가로등·소화전·화분 발밑 접지 그림자.
    this.setupLot2(); // 우측 내측 부지(lot2, 다층) 구입·건설 + 우측 팬 개방.
    this.setupSideLots(); // 좌 내/외·우 외 부지(폐건물 철거→1층) + 좌우 팬 개방.
    /*
     * **좌측 공공건물 타워** — 아트를 부팅에 안 올리므로(ui/assetBudget 'office' 그룹) **도착한 뒤 세운다**.
     *   부팅 카메라는 중앙 타워를 보고 있어 이 부지는 화면 밖이고, 그룹 로드는 60fps 기준 ~85ms 라
     *   좌로 팬하기 한참 전에 끝난다. 세로 스크롤 상한(officeTop)도 **그 부지 위에 있을 때만** 읽으므로
     *   늦게 세워도 안전하다(HomeScene:3684 isOverLot 가드).
     * ⚠️ **딱 한 번만 세운다.** buildOfficeTower 는 기존 오브젝트를 파괴하지 않고 배열만 비우므로,
     *   두 번 부르면 건물이 겹쳐 쌓인다.
     */
    void ensureAssetGroup(this, 'office').then(() => {
      if (this.scene.isActive() && this.officeFloors.length === 0) this.buildOfficeTower();
    });
    // **각 부지 건물 좌우에 프롭**(가로등/소화전/화분) — 타워(중앙)는 home.json 이 이미 배치. 5개 부지에 코드 생성.
    for (const cx of [LOT1L_CX - LOT_DX, LOT1L_CX, LOT2_CX, LOT2_CX + LOT_DX, LOT2_CX + 2 * LOT_DX]) this.addLotProps(cx, cx === OFFICE_CX); // 오피스 부지 프롭은 타워 뒤로.
    this.extendRoad(); // 도로가 최외곽 부지까지 자동으로 이어지도록 타일 확장(끊김 방지).
  }

  /**
   * **좌측 공공건물 타워(프리빌트)** — 메인타워 왼쪽 부지(OFFICE_CX=-540)에 공공건물 5개(소방서 등)를
   *   기존 타워 층 스택 방식(동일 폭 LOT2_FLOOR_W·높이 LOT2_FLOOR_H·겹침 LOT2_SMALL_OVERLAP·1층 지면 동일)으로
   *   **항상 완공 상태로 미리 배치**한다. 정적(비상호작용) 월드 오브젝트라 타워와 함께 스크롤(좌로 한 화면 팬 시 중앙).
   */
  private buildOfficeTower(): void {
    this.officeFloors = []; // 씬 재사용 대비: 스테일 참조 비움(오브젝트는 씬 재시작이 파괴).
    this.officeRoof = undefined;
    const fw = LOT2_FLOOR_W;
    const fh = LOT2_FLOOR_H;
    // 공공건물 에디터(home_copy2) 노드 — 관리자 캐릭터의 **빌딩 대비 상대 위치**를 읽어 게임 층에 적용.
    const officeDoc = (this.cache.json.get(UI_OFFICE_KEY) ?? null) as { nodes?: Array<{ key?: string; type?: string; text?: string; fontSize?: number; color?: string; x: number; y: number; w?: number; h?: number }> } | null;
    const nodes = officeDoc?.nodes ?? [];
    const findByKey = (part: string): (typeof nodes)[number] | undefined => nodes.find((n) => (n.key ?? '').includes(part));
    const speakers: OfficeSpeaker[] = []; // 대화 시스템 화자(층 순 역할 매핑).
    for (let level = 1; level <= OFFICE_FLOORS; level++) {
      const key = `up_Slitare_Office_${pad2(level)}`;
      if (!this.textures.exists(key)) continue; // 아트 없으면 건너뜀(방어).
      const y = LOT2_FLOOR1_Y - (level - 1) * (fh - LOT2_SMALL_OVERLAP); // 동일 높이 층을 위로 스택.
      const img = this.add.image(OFFICE_CX, y, key).setDisplaySize(fw, fh).setDepth(this.floorDepth(level));
      this.pinToWorld(img); // 월드(타워와 함께 스크롤) — uiCam 제외.
      this.officeFloors.push(img);
      // **관리자 캐릭터를 건물 중앙(저작 위치)에** — home_copy2 의 Officer 노드를 빌딩 대비 상대로 배치.
      const chrKey = `up_Solirare_Officer_${pad2(level)}`;
      const bNode = findByKey(`Office_${pad2(level)}_v2`) ?? findByKey(`Office_${pad2(level)}`);
      const oNode = findByKey(`Officer_${pad2(level)}`);
      let chr: Phaser.GameObjects.Image | undefined;
      if (oNode && this.textures.exists(chrKey)) {
        const s = fh / (bNode?.h ?? fh); // 저작 빌딩 높이 → 게임 표시(fh) 스케일.
        const offX = bNode ? (oNode.x - bNode.x) * s : 0;
        const offY = bNode ? (oNode.y - bNode.y) * s : fh * 0.1;
        chr = this.add
          .image(OFFICE_CX + offX, y + offY, chrKey)
          .setDisplaySize((oNode.w ?? 110) * s, (oNode.h ?? 240) * s)
          .setDepth(this.floorDepth(level) + 1); // 자기 층 앞(캐릭터가 건물 안에 보이게), 다음 층 뒤.
        this.pinToWorld(chr);
        this.animateClerk(chr, level * 430); // 점포 점원과 동일한 idle 애니(발밑 고정 갸웃+숨쉬기, 층별 위상차).
        // 대화 화자 등록 — 층별 역할(1 소방수·2 경찰관·3 세무원·4 우체국·5 시장).
        const role = OFFICE_ROLES[level - 1];
        if (role) {
          speakers.push({ img: chr, role });
          // **캐릭터 클릭 = 그 공공기관의 메시지 즉시 시작**(officeTalk 은 루프 뒤 생성되므로 클릭 시점에 참조).
          chr.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.officeTalk?.fire(role));
        }
      }
      // **민원 창구 버튼** — 이 층이 담당하는 프리셀 모드로 들어간다(logic/civicDesks.ts).
      const desk = deskForFloor(level);
      if (desk) this.addCivicDeskButton(desk, y, fw, fh);
      // **2층+ 앞 유리팬스** — 메인타워와 동일 스타일(y+fh*0.33·폭690·depth+2, 관리자=유리 바로 뒤).
      //   1층(지면 로비)은 유리팬스 없음(타워1/타워2 1층 예외와 동일). 5층까지 업그레이드 시 자동 적용.
      if (level !== 1 && this.textures.exists('up_Slitare_BG_Glass')) {
        const glass = this.add.image(OFFICE_CX, y + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(this.floorDepth(level) + 2);
        glass.setDisplaySize(690, glass.height * (690 / glass.width));
        this.pinToWorld(glass);
        if (chr) chr.setDepth(glass.depth - 0.5); // 관리자=유리 바로 뒤.
      }
    }
    // **공공건물 대화 시스템** — 관리자들이 띄엄띄엄 말을 건다(부지가 화면에 보일 때만, 탭=다음 대사).
    if (speakers.length) {
      this.officeTalk = startOfficeTalk(this, speakers, () => Math.abs(this.cameras.main.scrollX - (OFFICE_CX - W / 2)) < W * 0.55);
    }
    // **지붕을 최상층 위에 얹는다** + **네임플레이트 지명**(에디터 저작 텍스트를 지붕 대비 상대로 렌더).
    if (this.officeFloors.length && this.textures.exists(OFFICE_ROOF_KEY)) {
      const top = this.officeFloors.reduce((a, b) => (b.y < a.y ? b : a)); // 가장 위(작은 y) 층.
      const roofY = top.y - top.displayHeight / 2 - OFFICE_ROOF_H / 2 + OFFICE_ROOF_OVERLAP; // 파사드가 최상층 상단에 겹쳐 얹힘.
      this.officeRoof = this.add.image(OFFICE_CX, roofY, OFFICE_ROOF_KEY).setDisplaySize(OFFICE_ROOF_W, OFFICE_ROOF_H).setDepth(top.depth + 3);
      this.pinToWorld(this.officeRoof);
      // **지명 라벨** — 에디터(home_copy2)의 지붕 노드 대비 텍스트 노드(지붕 경계 안) 위치로 배치.
      const roofNode = findByKey('Office_roof');
      const nameNode = nodes.find(
        (n) => n.type === 'text' && !!(n.text ?? '').trim() && roofNode && Math.abs(n.x - roofNode.x) < (roofNode.w ?? OFFICE_ROOF_W) / 2 && Math.abs(n.y - roofNode.y) < (roofNode.h ?? OFFICE_ROOF_H) / 2,
      );
      if (nameNode && roofNode) {
        const sx = OFFICE_ROOF_W / (roofNode.w ?? OFFICE_ROOF_W);
        const sy = OFFICE_ROOF_H / (roofNode.h ?? OFFICE_ROOF_H);
        const nameTxt = this.add
          .text(this.officeRoof.x + (nameNode.x - roofNode.x) * sx, this.officeRoof.y + (nameNode.y - roofNode.y) * sy, nameNode.text ?? '', {
            fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
            fontSize: `${Math.round((nameNode.fontSize ?? 40) * sy)}px`,
            color: nameNode.color ?? '#4b2020',
            fontStyle: 'bold',
            align: 'center',
          })
          .setOrigin(0.5)
          .setDepth(this.officeRoof.depth + 1); // 지붕 위(네임플레이트).
        this.pinToWorld(nameTxt);
      }
    }
  }

  /** 좌측 공공건물 타워 **상단**(지붕 포함 최상단 edge) — 없으면 지면. 세로 스크롤 상한 산출용. */
  private officeTop(): number {
    let topY = Infinity;
    for (const o of this.officeFloors) if (o.visible) topY = Math.min(topY, o.y - o.displayHeight / 2);
    if (this.officeRoof?.visible) topY = Math.min(topY, this.officeRoof.y - this.officeRoof.displayHeight / 2); // 지붕(돔·시계)까지 스크롤.
    return Number.isFinite(topY) ? topY : this.groundBottom();
  }

  /**
   * **도로 자동 확장** — 기존 도로(home.json)가 최외곽 부지에서 끊기므로, 도로 텍스처를 좌우로 타일링해
   *   **모든 스테이지 화면 범위(scrollMinX~scrollMaxX)까지** 이어 붙인다. 기존 커버 밖에만 추가(중복 최소).
   */
  private extendRoad(): void {
    const roads = (this.layoutIdx?.entries() ?? []).filter((e) => e.node.type === 'image' && /도로/.test(e.node.name ?? ''));
    if (roads.length === 0) return;
    const ref = roads[0].node;
    const key = ref.key ?? '';
    if (!key || !this.textures.exists(key)) return;
    const w = ref.w ?? 2285;
    const h = ref.h ?? 592;
    const y = ref.y ?? 2180;
    const depth = ref.depth ?? 3;
    // 기존 도로 커버 범위(월드 x).
    let covL = Infinity;
    let covR = -Infinity;
    for (const r of roads) {
      const nw = r.node.w ?? w;
      covL = Math.min(covL, r.node.x - nw / 2);
      covR = Math.max(covR, r.node.x + nw / 2);
    }
    // 필요 범위 = 최좌·최우 스테이지의 화면 좌우 끝 + 여유.
    const needL = this.scrollMinX - 120;
    const needR = this.scrollMaxX + this.camW() + 120;
    const step = w * 0.98; // 살짝 겹쳐 이음새 없이.
    const tile = (cx: number): void => {
      const img = this.add.image(cx, y, key).setDisplaySize(w, h).setDepth(depth);
      this.pinToWorld(img);
    };
    for (let cx = covR + step / 2; cx - w / 2 < needR; cx += step) tile(cx); // 우측 확장.
    for (let cx = covL - step / 2; cx + w / 2 > needL; cx -= step) tile(cx); // 좌측 확장.
  }

  /**
   * **두 번째 부지(우측)** — 편의점(타워1) 오른쪽 빈 부지로 수평 스크롤을 열고, 부지 중앙에
   *   "부지 구입 · 1층 건설" 버튼을 둔다. 버튼을 누르면 화면이 우측으로 이동하며 타워2 1층을 건설한다.
   *   지면(도로/중경 복사)은 이미 우측을 덮고 있고, 원경/하늘은 near-fixed 라 팬해도 함께 보인다.
   */
  private setupLot2(): void {
    if (this.lot2Built) return;
    this.scrollMaxX = scrollXForCenter(LOT2_CX, this.camW()); // 우측 빈 부지까지 팬 가능(타워1 ↔ 부지).
    // **아트는 도착한 뒤 세운다**(부지 그룹 'lot2') — 안 그러면 텍스처 없이 그려져 층이 조용히 빠진다.
    const saved = loadSave();
    if (SHOW_ALL_FLOORS_TEST || saved.showAllLot2) {
      void ensureAssetGroup(this, 'lot2').then(() => {
        if (this.scene.isActive() && this.lot2FloorObjs.size === 0) this.restoreLot2(LOT2_MAX_FLOORS); // 전부(표시만).
      });
      return;
    }
    // **임시저장 복원**: 저장된 스테이지2 건설 상태가 있으면 즉시 그 높이까지 세운다(폐건물 없이).
    if (saved.lot2Built && (saved.lot2Floors ?? 0) >= 1) {
      void ensureAssetGroup(this, 'lot2').then(() => {
        if (this.scene.isActive() && this.lot2FloorObjs.size === 0) this.restoreLot2(saved.lot2Floors ?? 1);
      });
      return;
    }
    // **메인타워가 거의 다 지어졌을 때만 미리 받는다**(2026-09-01) — 부지 그룹은 예산 판정을 면제받고
    //   한 번 올라오면 세션 내내 안 내려가는 "서 있는 그룹"이라, 예전처럼 신규 유저(레벨 1, 메인타워
    //   1~2층)한테도 무조건 미리 받아 두면 곧 지을 일도 없는데 메모리만 영구히 차지했다(실측: 부팅
    //   상주가 예산 220MB 턱밑까지 참). 해금(lotsUnlocked = 10층 완공) 한 걸음 전부터 당겨 받아
    //   실제로 해금될 즈음엔 이미 준비돼 있게 한다 — "누구나 항상"에서 "필요해질 사람만 그때"로.
    if (this.builtFloors >= MAX_FLOORS - 1) prefetchGroup(this, 'lot2');
    if (saved.lot2Demolished) {
      // 철거됨(빈 부지) → 1층 건설 버튼만.
      this.lot2Btn = this.makeLotButton(LOT2_CX, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}`, () => this.buildLot2Floor1(), 240);
      return;
    }
    this.lot2Ruin = this.spawnRuin(LOT2_CX, 'up_Slitare_BG_Ruin_05'); // 폐건물 코드 선배치(고유).
    this.lot2ForSale = this.spawnForSaleSign(LOT2_CX, FOR_SALE_VARIANTS - 1); // 'FOR SALE'(우 내측 = 마지막 변형).
    const lot2Sign = this.spawnLotSignboard(LOT2_CX, FOR_SALE_VARIANTS - 1, this.lot2Ruin, this.lotSignMessage()); // 상단 간판 + 메시지.
    this.lot2Sign = lot2Sign.board;
    this.lot2SignMsg = lot2Sign.text;
    if (!this.lotsUnlocked()) return; // 메인타워 10층 완공 전 = 구입 잠금(간판 메시지로 안내).
    this.showLot2BuyButton();
  }

  /** 우 내측(lot2) '부지 구입(철거)' 버튼 + '새 부지 →' 힌트(잠금 해제 시). */
  private showLot2BuyButton(): void {
    const btnY = this.lot2Ruin ? this.lot2Ruin.y - this.lot2Ruin.displayHeight / 2 + 60 : 1780;
    this.lot2Btn = this.makeLotButton(LOT2_CX, btnY, '🏗️ 부지 구입\n(철거)', () => this.demolishLot2(), 260);
    const hint = this.add
      .text(1035, 1360, '새 부지 →', { fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(60);
    hint.setShadow(2, 2, '#00000088', 4);
    this.pinToWorld(hint);
    this.tweens.add({ targets: hint, x: 1065, alpha: 0.5, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.lot2Hint = hint;
  }

  /** 우 내측 부지 **철거** → 빈 부지(1층 건설 버튼). 그 뒤 1층부터 다층 건설(기존 lot2 시스템). */
  private demolishLot2(): void {
    if (this.lot2Built || this.constructing) return;
    this.constructing = true; // 연출 중 스크롤/입력 잠금.
    sfx('button');
    for (const o of [this.lot2Btn, this.lot2Hint, this.lot2ForSale, this.lot2Sign, this.lot2SignMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }); // 표지판·간판도 함께 제거.
    }
    this.lot2Btn = undefined;
    this.lot2Hint = undefined;
    this.lot2ForSale = undefined;
    this.lot2Sign = undefined;
    this.lot2SignMsg = undefined;
    const ruin = this.lot2Ruin;
    this.lot2Ruin = undefined;
    this.panToLot2Floor(1, 700);
    const done = (): void => {
      this.constructing = false;
      const s = loadSave();
      s.lot2Demolished = true;
      writeSave(s);
      this.lot2Btn = this.makeLotButton(LOT2_CX, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}`, () => this.buildLot2Floor1(), 240);
      this.toast('🏚️ 철거 완료 — 빈 부지', true);
    };
    if (!ruin) {
      done();
      return;
    }
    this.demolishRuin(ruin, done);
  }

  /** 폐건물 철거 연출 — 흔들림 → 붕괴(가라앉으며 기울고 먼지·화면 흔들) → 소멸 후 onDone. */
  /**
   * **철거 연출**(Destroy_01~05 · 2번 이미지 스타일) — 도구가 두드리는 사이 먼지가 뭉클뭉클 피어오르며 건물이 주저앉는다.
   *   · 도구 01(철구)·02(착암기)·03(해머)를 건물 위에 등장시켜 스윙/드릴/내리치기.
   *   · 먼지 04를 **반투명(≈0.75)** 로 깔고 **크게-작게 뭉클뭉클** 펄스로 키우다 후반 **05로 교체**.
   *   · 건물은 흔들→주저앉아 소멸. 끝나면 onDone(=빈 부지).
   *   에셋 없으면 간단 붕괴로 폴백.
   */
  private demolishRuin(ruin: Phaser.GameObjects.Image, onDone: () => void): void {
    const cx = ruin.x;
    const y0 = ruin.y;
    const rh = ruin.displayHeight;
    const rw = ruin.displayWidth;
    const baseY = y0 + rh / 2;
    const D = ruin.depth ?? RUIN_DEPTH;

    if (!this.textures.exists('up_Destroy_04')) {
      // 폴백(에셋 미로드) — 기존 간단 붕괴.
      this.cameras.main.shake(320, 0.008);
      this.emitSmokeBand(cx, baseY, rw * 0.92, D + 1);
      this.tweens.add({ targets: ruin, y: y0 + 130, angle: -5, alpha: 0, scaleY: ruin.scaleY * 0.65, duration: 680, ease: 'Quad.easeIn', onComplete: () => { ruin.destroy(); onDone(); } });
      return;
    }

    sfx('build');
    // ── 도구 3종 — 건물 주변에 등장해 두드린다(01 철구·02 착암기·03 해머). ──
    const tools: Phaser.GameObjects.Image[] = [];
    const addTool = (key: string, x: number, y: number, dispH: number, from: { x: number; y: number; a: number }, hit: (t: Phaser.GameObjects.Image) => void): void => {
      if (!this.textures.exists(key)) return;
      // **도구는 먼지(연기, D+7)·잔해밴드(D+8)보다 위 레이어**(D+10)에 둔다 — 연기 뒤로 가리지 않게.
      const t = this.add.image(from.x, from.y, key).setDepth(D + 10).setAngle(from.a).setAlpha(0);
      const src = texSize(this.textures.get(key));
      t.setDisplaySize(dispH * (src.width / src.height), dispH);
      this.pinToWorld(t);
      this.tweens.add({ targets: t, x, y, angle: 0, alpha: 1, duration: 260, ease: 'Back.easeOut', onComplete: () => hit(t) });
      tools.push(t);
    };
    // 도구는 **건물 안쪽**(중심에 가깝게)에서 두드린다(바깥으로 튀지 않게).
    addTool('up_Destroy_01', cx - rw * 0.18, y0 - rh * 0.14, 240, { x: cx - rw * 0.38, y: y0 - rh * 0.42, a: -30 }, (t) => {
      this.tweens.add({ targets: t, angle: 18, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 철퇴 스윙.
    });
    addTool('up_Destroy_02', cx + rw * 0.18, y0 + rh * 0.12, 220, { x: cx + rw * 0.38, y: baseY + 46, a: 16 }, (t) => {
      const yy = t.y;
      this.tweens.add({ targets: t, y: yy + 12, duration: 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 착암기 드릴.
    });
    addTool('up_Destroy_03', cx + rw * 0.02, y0 - rh * 0.22, 230, { x: cx + rw * 0.14, y: y0 - rh * 0.42, a: -42 }, (t) => {
      this.tweens.add({ targets: t, angle: 24, duration: 300, yoyo: true, repeat: -1, ease: 'Cubic.easeIn' }); // 망치 내리치기.
    });

    // ── 먼지 04 — 반투명·뭉클뭉클(크게-작게) 성장 후 05 로 교체. ──
    const dust = this.add.image(cx, y0 + rh * 0.12, 'up_Destroy_04').setDepth(D + 7).setAlpha(0);
    const src4 = texSize(this.textures.get('up_Destroy_04'));
    const fullW = rw * 1.25;
    dust.setDisplaySize(fullW * 0.5, fullW * 0.5 * (src4.height / src4.width));
    this.pinToWorld(dust);
    let puff: Phaser.Tweens.Tween | undefined;
    this.tweens.add({
      targets: dust,
      alpha: 0.95, // 투명도 낮춤(더 불투명하게) — 건물이 비쳐 보이지 않게.
      scaleX: dust.scaleX * 2,
      scaleY: dust.scaleY * 2,
      duration: 340,
      ease: 'Back.easeOut', // 뭉클 부풀며 등장.
      onComplete: () => {
        const s = dust.scaleX;
        // **크게-작게 뭉클뭉클**(가로/세로 어긋난 스쿼시 펄스).
        puff = this.tweens.add({ targets: dust, scaleX: s * 0.88, scaleY: s * 1.14, duration: 230, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
    this.emitSmokeBand(cx, baseY, rw * 0.95, D + 8); // 하단 잔해 먼지.

    // ── 건물 붕괴(먼지 뒤에서 흔들→주저앉으며 소멸) — **약 2배 더 긴 철거**. ──
    this.tweens.add({ targets: ruin, x: cx + 8, duration: 60, yoyo: true, repeat: 9, ease: 'Sine.easeInOut' }); // 더 오래 흔들.
    this.tweens.add({ targets: ruin, y: y0 + 140, scaleY: ruin.scaleY * 0.55, alpha: 0, angle: -4, delay: 420, duration: 1440, ease: 'Quad.easeIn', onComplete: () => { this.cameras.main.shake(180, 0.006); ruin.destroy(); } });
    // 중간중간 추가 잔해 먼지(길어진 연출을 채운다).
    this.time.delayedCall(700, () => this.emitSmokeBand(cx, baseY, rw * 0.85, D + 8));
    this.time.delayedCall(1300, () => this.emitSmokeBand(cx, baseY, rw * 0.8, D + 8));

    // 후반: 먼지 04 → 05 교체(구멍/걷힘).
    this.time.delayedCall(1560, () => {
      if (!dust.active) return;
      const dw = dust.displayWidth;
      const dh = dust.displayHeight;
      dust.setTexture('up_Destroy_05').setDisplaySize(dw, dh); // 비율 유지 교체(펄스는 아래서 재개).
      const s = dust.scaleX;
      puff?.stop();
      puff = this.tweens.add({ targets: dust, scaleX: s * 0.9, scaleY: s * 1.12, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // 종료: 먼지·도구 걷히고(페이드) → 빈 부지. onDone.
    this.time.delayedCall(2360, () => {
      puff?.stop();
      this.tweens.add({ targets: dust, alpha: 0, duration: 520, ease: 'Sine.easeIn', onComplete: () => dust.destroy() });
      for (const t of tools) this.tweens.add({ targets: t, alpha: 0, y: t.y - 44, duration: 420, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
    });
    this.time.delayedCall(3100, () => onDone());
  }

  /**
   * **건설 연출**(Const 도구 · 2단계) — 새 층이 올라오는 동안 도구들이 먼지 위에서 작업한다.
   *   · 먼지(Destroy_04→05) 반투명·뭉클뭉클 + 벽돌(Const_09/10) 쌓임.
   *   · **1단계(왼쪽)**: 톱(Const_01)이 켜고 판자(Const_07)를 얹는다.
   *   · **2단계(오른쪽)**: 붓(Const_14)으로 칠하고 흙손(Const_04)으로 마감 + 판자.
   *   도구는 먼지보다 **위 레이어**(가리지 않게). 자체 정리(정해진 시간 뒤 페이드).
   */
  private constructFx(cx: number, cy: number, w: number): void {
    const D = 130; // FX 레이어(건물/차 위).
    const baseY = GROUND_Y - 30;
    const tools: Phaser.GameObjects.Image[] = [];
    // 공용 도구 헬퍼 — 등장(delay) → work 반복 → leaveAt 에 퇴장.
    const addTool = (key: string, x: number, y: number, dispH: number, ang: number, delay: number, leaveAt: number, work: (t: Phaser.GameObjects.Image) => void): void => {
      if (!this.textures.exists(key)) return;
      const t = this.add.image(x, y + 34, key).setDepth(D + 8).setAngle(ang - 10).setAlpha(0);
      const src = texSize(this.textures.get(key));
      t.setDisplaySize(dispH * (src.width / src.height), dispH);
      this.pinToWorld(t);
      this.tweens.add({ targets: t, y, angle: ang, alpha: 1, delay, duration: 260, ease: 'Back.easeOut', onComplete: () => work(t) });
      this.time.delayedCall(leaveAt, () => this.tweens.add({ targets: t, alpha: 0, y: t.y - 42, duration: 320, ease: 'Sine.easeIn', onComplete: () => t.destroy() }));
      tools.push(t);
    };

    // ── 먼지(반투명·뭉클뭉클) — 전 구간 유지. ──
    let dust: Phaser.GameObjects.Image | undefined;
    let puff: Phaser.Tweens.Tween | undefined;
    if (this.textures.exists('up_Destroy_04')) {
      dust = this.add.image(cx, cy + 30, 'up_Destroy_04').setDepth(D + 3).setAlpha(0);
      const src = texSize(this.textures.get('up_Destroy_04'));
      const fw = w * 0.8; // 먼지 조금 작게.
      dust.setDisplaySize(fw * 0.55, fw * 0.55 * (src.height / src.width));
      this.pinToWorld(dust);
      const d = dust;
      this.tweens.add({
        targets: d,
        alpha: 0.9,
        scaleX: d.scaleX * 1.5,
        scaleY: d.scaleY * 1.5,
        duration: 340,
        ease: 'Back.easeOut',
        onComplete: () => {
          const s = d.scaleX;
          puff = this.tweens.add({ targets: d, scaleX: s * 0.9, scaleY: s * 1.12, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        },
      });
    }
    // ── 벽돌 쌓임(3개, 바닥에서 **크게 튀어오르며** 회전·안착 후 계속 들썩). ──
    ['up_Const_09', 'up_Const_10', 'up_Const_09'].forEach((bk, i) => {
      if (!this.textures.exists(bk)) return;
      const src = texSize(this.textures.get(bk));
      const bw = 110; // 벽돌 조금 크게.
      const b = this.add.image(cx - 70 + i * 70, baseY - i * 30, bk).setDepth(D + 4).setAlpha(0);
      b.setDisplaySize(bw, bw * (src.height / src.width));
      this.pinToWorld(b);
      const fy = b.y;
      const spin = i % 2 === 0 ? 1 : -1;
      b.y = fy - 190; // 더 높이서 낙하.
      b.setAngle(spin * -30);
      // 크게 튀어오르며 회전 안착.
      this.tweens.add({ targets: b, y: fy, angle: 0, alpha: 1, delay: 200 + i * 150, duration: 560, ease: 'Bounce.easeOut', onComplete: () => {
        this.tweens.add({ targets: b, y: fy - 14, angle: spin * 4, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 계속 들썩(큰 움직임).
      } });
      this.time.delayedCall(2700, () => this.tweens.add({ targets: b, alpha: 0, y: fy - 30, duration: 400, onComplete: () => b.destroy() }));
    });

    // ── 1단계(왼쪽): 톱 + 판자 (0~1400ms) — 움직임 크게. ──
    addTool('up_Const_01', cx - w * 0.14, cy - 20, 210, -20, 0, 1400, (t) => {
      const x0 = t.x;
      this.tweens.add({ targets: t, x: x0 + 40, angle: t.angle + 6, duration: 190, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 톱질(크게).
    });
    addTool('up_Const_07', cx + w * 0.15, cy + 24, 150, 20, 160, 1400, (t) => {
      const y0 = t.y;
      this.tweens.add({ targets: t, y: y0 - 20, angle: t.angle + 8, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 판자 얹기(크게).
    });

    // ── 2단계(오른쪽): 붓 + 흙손 + 판자 (1450~2700ms) — 움직임 크게. ──
    addTool('up_Const_14', cx + w * 0.17, cy - 40, 200, 28, 1450, 2700, (t) => {
      this.tweens.add({ targets: t, angle: 2, y: t.y + 22, duration: 280, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 붓칠(크게 위아래).
    });
    addTool('up_Const_04', cx - w * 0.16, cy + 30, 170, -22, 1560, 2700, (t) => {
      const x0 = t.x;
      this.tweens.add({ targets: t, x: x0 + 30, angle: -6, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); // 흙손 마감(크게).
    });
    addTool('up_Const_07', cx, cy - 6, 140, -14, 1620, 2700, (t) => {
      const y0 = t.y;
      this.tweens.add({ targets: t, y: y0 - 16, angle: -2, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ── 마무리: 1단계→2단계 사이 먼지 05 교체 + 종료 시 먼지 걷힘. ──
    if (dust) {
      const d = dust;
      this.time.delayedCall(1450, () => {
        if (!d.active || !this.textures.exists('up_Destroy_05')) return;
        const dw = d.displayWidth;
        const dh = d.displayHeight;
        d.setTexture('up_Destroy_05').setDisplaySize(dw, dh);
      });
      this.time.delayedCall(2700, () => {
        puff?.stop();
        this.tweens.add({ targets: d, alpha: 0, duration: 520, ease: 'Sine.easeIn', onComplete: () => d.destroy() });
      });
    }
  }

  // ── 사이드 부지(좌 내/외·우 외) — 폐건물 철거 → 1층 건설. 데이터 기반 일반화 ──
  /** 사이드 부지 목록 구성 — 좌 내(-540)·좌 외(-1620)·우 외(2700). 우 내(1620)는 lot2(다층) 별도. */
  private setupSideLots(): void {
    // 편집기(home.json) 의존 없이 **폐건물을 코드로 선배치** — 편집기 자동저장이 되돌려도 항상 표시.
    this.hideLayoutRuins(); // home.json Ruin 노드는 숨김(중복 방지).
    // **폐건물 5개(lot2 포함) 각기 다른 텍스처**(중복 금지). 여기 4개(좌2·우2) + lot2(우 내측, Ruin_05).
    this.sideLots = [
      // ⚠️ 좌측 첫 부지(LOT1L_CX)는 **공공건물 타워 프리빌트**(buildOfficeTower)가 차지 → 폐건물 부지에서 제외.
      // **가장 왼쪽 부지 = 고수익 경쟁 부지**(간판 문구 고정) — 건설 수익↑ 이지만 공격 시 강제경매되는 경쟁형 부지.
      { cx: LOT1L_CX - LOT_DX, ruinKey: 'up_Slitare_BG_Ruin_02', saveKey: 'L2', hintText: '← 새 부지', hintX: 45, built: false, demolished: false, stage: 4, signOverride: '고수익 경쟁 부지\n건설 수익은 높지만 공격 시 강제경매됩니다.' },
      { cx: LOT2_CX + 2 * LOT_DX, ruinKey: 'up_Slitare_BG_Ruin_04', saveKey: 'R3', hintText: '새 부지 →', hintX: 1035, built: false, demolished: false, stage: 6 },
    ];
    // 좌우 팬 범위 = 최외곽 부지까지(중앙 기준 ±스테이지 오프셋).
    const canvasW = this.camW();
    this.scrollMinX = Math.min(this.scrollMinX, scrollXForCenter(LOT1L_CX - LOT_DX, canvasW)); // 좌 외곽.
    this.scrollMaxX = Math.max(this.scrollMaxX, scrollXForCenter(LOT2_CX + 2 * LOT_DX, canvasW)); // 우 최외곽.
    const saved = loadSave();
    for (const lot of this.sideLots) this.setupSideLot(lot, !!saved.sideBuilt?.[lot.saveKey], !!saved.sideDemolished?.[lot.saveKey]);
    // ⚠️ **R2(구 사이드 부지)는 호텔 전용 슬롯이다**(`LOT3_CX === LOT2_CX + LOT_DX` = R2 의 cx) — 위 sideLots
    //   목록에서 아예 뺐다(2026-08-31 재설계). R3 는 그보다 한 칸 더 바깥의 별개 부지라 그대로 짓는다.
    this.setupLot3();
  }

  /**
   * 호텔(3번 라인) 해금 여부 — 2번 라인 20/20 완공이 선행 조건(순차 진행).
   * ⚠️ **저장값으로 판정한다**(`this.lot2Floors` 아님) — `setupLot3()` 는 `setupLot2()` 직후 **동기로** 불리는데,
   *   `this.lot2Floors` 는 부지 그룹('lot2') 로드가 끝난 뒤 `restoreLot2()` 가 **비동기로** 채운다. 그 사이엔
   *   0 이라 완공 상태에서도 해금 판정이 늦어(호텔이 잠긴 채로 보임) 진짜 완공 여부를 못 본다.
   */
  private hotelUnlocked(): boolean {
    return (loadSave().lot2Floors ?? 0) >= LOT2_MAX_FLOORS;
  }

  /** 잠금 상태에 따른 호텔 간판 메시지. */
  private hotelSignMessage(): string {
    return this.hotelUnlocked() ? '🏗️ 구입 가능!' : '🔒 2번 라인\n완공 시 개방';
  }

  /** 호텔 부지 세팅 — lot2 를 일반화한 패턴(손님·수입 배너 없음). R2 부지 슬롯을 그대로 쓴다. */
  private setupLot3(): void {
    if (this.hotelBuilt) return;
    const saved = loadSave();
    if (SHOW_ALL_FLOORS_TEST || saved.showAllLot2) {
      void ensureAssetGroup(this, 'lot3').then(() => {
        if (this.scene.isActive() && this.lot3FloorObjs.size === 0) this.restoreLot3(HOTEL_FLOOR_COUNT); // 전부(표시만).
      });
      return;
    }
    // **임시저장 복원**: 저장된 호텔 건설 상태가 있으면 즉시 그 높이까지 세운다(폐건물 없이).
    if (saved.hotelBuilt && (saved.hotelFloors ?? 0) >= 1) {
      void ensureAssetGroup(this, 'lot3').then(() => {
        if (this.scene.isActive() && this.lot3FloorObjs.size === 0) this.restoreLot3(saved.hotelFloors ?? 1);
      });
      return;
    }
    // 2번 라인이 거의 다 지어졌을 때만 미리 받는다 — lot2 와 같은 이유(위 setupLot2 주석 참고).
    if ((saved.lot2Floors ?? 0) >= LOT2_MAX_FLOORS - 1) prefetchGroup(this, 'lot3');
    if (saved.sideDemolished?.R2) {
      // 철거됨(빈 부지) → 1층 건설 버튼만.
      this.hotelBtn = this.makeLotButton(LOT3_CX, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(LOT2_MAX_FLOORS + 1)}`, () => this.buildLot3Floor1(), 240);
      return;
    }
    this.hotelRuin = this.spawnRuin(LOT3_CX, 'up_Slitare_BG_Ruin_03'); // R2 가 쓰던 텍스처를 그대로(자리가 같다).
    this.hotelForSale = this.spawnForSaleSign(LOT3_CX, FOR_SALE_VARIANTS - 2); // 'FOR SALE'(호텔 = R2 자리 변형).
    const hotelSign = this.spawnLotSignboard(LOT3_CX, FOR_SALE_VARIANTS - 2, this.hotelRuin, this.hotelSignMessage());
    this.hotelSign = hotelSign.board;
    this.hotelSignMsg = hotelSign.text;
    if (!this.hotelUnlocked()) return; // 2번 라인 20층 완공 전 = 구입 잠금(간판 메시지로 안내).
    this.showLot3BuyButton();
  }

  /** 호텔 '부지 구입(철거)' 버튼 + '새 부지 →' 힌트(잠금 해제 시). */
  private showLot3BuyButton(): void {
    const btnY = this.hotelRuin ? this.hotelRuin.y - this.hotelRuin.displayHeight / 2 + 60 : 1780;
    this.hotelBtn = this.makeLotButton(LOT3_CX, btnY, '🏗️ 부지 구입\n(철거)', () => this.demolishLot3(), 260);
    const hint = this.add
      .text(1035, 1360, '새 부지 →', { fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(60);
    hint.setShadow(2, 2, '#00000088', 4);
    this.pinToWorld(hint);
    this.tweens.add({ targets: hint, x: 1065, alpha: 0.5, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.hotelHint = hint;
  }

  /** 호텔 부지 **철거** → 빈 부지(1층 건설 버튼). 그 뒤 1층부터 다층 건설(lot2 시스템 재사용). */
  private demolishLot3(): void {
    if (this.hotelBuilt || this.constructing) return;
    this.constructing = true; // 연출 중 스크롤/입력 잠금.
    sfx('button');
    for (const o of [this.hotelBtn, this.hotelHint, this.hotelForSale, this.hotelSign, this.hotelSignMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() });
    }
    this.hotelBtn = undefined;
    this.hotelHint = undefined;
    this.hotelForSale = undefined;
    this.hotelSign = undefined;
    this.hotelSignMsg = undefined;
    const ruin = this.hotelRuin;
    this.hotelRuin = undefined;
    this.panToLot3Floor(1, 700);
    const done = (): void => {
      this.constructing = false;
      const s = loadSave();
      s.sideDemolished = { ...(s.sideDemolished ?? {}), R2: true };
      writeSave(s);
      this.hotelBtn = this.makeLotButton(LOT3_CX, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(LOT2_MAX_FLOORS + 1)}`, () => this.buildLot3Floor1(), 240);
      this.toast('🏚️ 철거 완료 — 빈 부지', true);
    };
    if (!ruin) {
      done();
      return;
    }
    this.demolishRuin(ruin, done);
  }

  /** 호텔 한 층 렌더 — 아트(up_Slitare_BG_04_NN) + 점원/투숙객(홀수=우·짝수=좌) + 유리팬스. **손님 스팟은 등록 안 함**(호텔 손님 없음). */
  private renderLot3Floor(level: number, visible: boolean): { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image } | undefined {
    const key = lot3ArtKey(level);
    if (!this.textures.exists(key)) return undefined;
    const ref = this.lot2FloorRef(level); // 2번 라인과 같은 통일 스택 y/depth + 층 w/h.
    const img = this.add.image(LOT3_CX, ref.y, key).setDisplaySize(ref.w, ref.h).setDepth(ref.depth).setVisible(visible);
    this.pinToWorld(img);
    let char: Phaser.GameObjects.Image | undefined;
    const chKey = lot3ClerkKey(level);
    if (this.textures.exists(chKey)) {
      const side = level % 2 === 1 ? 1 : -1; // 홀수=우, 짝수=좌.
      char = this.add.image(LOT3_CX + side * ref.w * 0.22, ref.y + ref.h * 0.16, chKey).setDepth(ref.depth + 1.5).setVisible(visible);
      char.setDisplaySize(char.width * (245 / char.height), 245);
      this.pinToWorld(char);
    }
    // **1층은 앞 유리팬스 없음**(다른 라인과 동일 예외).
    let glass: Phaser.GameObjects.Image | undefined;
    if (level !== 1 && this.textures.exists('up_Slitare_BG_Glass')) {
      glass = this.add.image(LOT3_CX, ref.y + ref.h * 0.33, 'up_Slitare_BG_Glass').setDepth(ref.depth + 2).setVisible(visible);
      glass.setDisplaySize(690, glass.height * (690 / glass.width));
      this.pinToWorld(glass);
      if (char) char.setDepth(glass.depth - 0.5); // 투숙객=유리 바로 뒤.
    }
    if (char) this.animateClerk(char, (level * 137) % 1500);
    this.lot3FloorObjs.set(level, { img, char, glass });
    return { img, char, glass };
  }

  /** 저장된 호텔 층수를 **즉시**(연출 없이) 그 높이까지 세운다 — 로드 복원용. */
  private restoreLot3(floors: number): void {
    this.hotelBuilt = true;
    this.hotelFloors = 0;
    for (let l = 1; l <= Math.min(HOTEL_FLOOR_COUNT, floors); l++) {
      this.hotelFloors = l;
      this.renderLot3Floor(l, true);
    }
    this.capLot3Roof();
    this.wireLot3BuildButton();
  }

  /** **임시저장**: 호텔 건설 상태 저장(건설 시 호출). */
  private saveLot3(): void {
    const s = loadSave();
    s.hotelBuilt = this.hotelBuilt;
    s.hotelFloors = this.hotelFloors;
    s.hotelOwned = this.hotelFloors; // 건설=소유(호텔은 매입 단계 없음, lot2 와 동일).
    writeSave(s);
  }

  /** 호텔 지붕을 최상 건설층 위에 얹는다(층 늘 때마다 재배치) — lot2 와 동일 규칙. */
  private capLot3Roof(): void {
    if (this.hotelFloors < 1 || !this.textures.exists('up_Slitare_BG_roof_v2')) return;
    const ref = this.lot2FloorRef(this.hotelFloors);
    const roofY = ref.y - ref.h / 2 - LOT2_ROOF_H / 2 + LOT2_ROOF_OVERLAP;
    if (!this.lot3Roof) {
      this.lot3Roof = this.add.image(LOT3_CX, roofY, 'up_Slitare_BG_roof_v2').setDisplaySize(LOT2_ROOF_W, LOT2_ROOF_H);
      this.pinToWorld(this.lot3Roof);
    } else {
      this.lot3Roof.setPosition(LOT3_CX, roofY).setVisible(true);
    }
    const topDepth = this.lot3FloorObjs.get(this.hotelFloors)?.img.depth ?? 20;
    this.lot3Roof.setDepth(topDepth + 2.5); // 유리(+2)보다 위.
  }

  /** 호텔 'N층 건설' 버튼을 지붕 위에 배치·갱신(레벨 미달이면 잠금 표시, 15층 완공 시 숨김). */
  private wireLot3BuildButton(): void {
    const next = this.hotelFloors + 1;
    if (next > HOTEL_FLOOR_COUNT) {
      this.hotelBuildBtn?.setVisible(false);
      return;
    }
    const ref = this.lot2FloorRef(this.hotelFloors);
    const roofTop = this.lot3Roof ? this.lot3Roof.y - this.lot3Roof.displayHeight / 2 : ref.y - ref.h / 2;
    const by = roofTop - 30 - 66;
    const reqLevel = hotelFloorLevelReq(next);
    const locked = loadSave().level < reqLevel;
    const label = locked ? `${next}층 건설\n🔒 레벨 ${reqLevel}` : `${next}층 건설\n💎 ${diamondCostFor(LOT2_MAX_FLOORS + next)}`;
    if (!this.hotelBuildBtn) {
      this.hotelBuildBtn = this.makeLotButton(LOT3_CX, by, label, () => this.buildLot3Next());
    } else {
      this.hotelBuildBtn.setPosition(LOT3_CX, by).setVisible(true);
      const t = this.hotelBuildBtn.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      t?.setText(label);
    }
  }

  /** 카메라를 호텔 특정 층으로 부드럽게 팬(호텔 세로 범위 내 클램프). */
  private panToLot3Floor(level: number, dur: number): void {
    const cam = this.cameras.main;
    const y = Phaser.Math.Clamp(this.lot2FloorRef(level).y - this.camH() * 0.55, this.scrollMinYFor(true), this.scrollMax);
    cam.pan(LOT3_CX, y + this.camH() / 2, dur, 'Sine.easeInOut');
  }

  /** 호텔 1층 건설(부지 구입 뒤 최초 건설) — lot2 1층 건설과 동일 패턴, 손님 등록만 없다. */
  private buildLot3Floor1(): void {
    if (this.hotelBuilt) return;
    void ensureAssetGroup(this, 'lot3').then(() => { if (this.scene.isActive()) this.buildLot3Floor1Now(); });
  }

  private buildLot3Floor1Now(): void {
    if (this.hotelBuilt) return;
    const floor = LOT2_MAX_FLOORS + 1; // 다이아 비용 수열은 2번 라인에 이어서(21번째 자리).
    const reqLevel = hotelFloorLevelReq(1);
    const sv = loadSave();
    if ((sv.level ?? 1) < reqLevel) {
      this.toast(`🔒 레벨 ${reqLevel} 필요`);
      return;
    }
    const cost = diamondCostFor(floor);
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.hotelBuilt = true;
    this.hotelFloors = 1;
    for (const o of [this.hotelBtn, this.hotelHint, this.hotelForSale, this.hotelSign, this.hotelSignMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 400, onComplete: () => o.destroy() });
    }
    this.hotelBtn = undefined;
    this.hotelHint = undefined;
    this.hotelForSale = undefined;
    this.hotelSign = undefined;
    this.hotelSignMsg = undefined;
    sfx('button');
    const objs = this.renderLot3Floor(1, false);
    if (objs) this.raiseLot2Floor(objs, 1); // 등장 연출은 lot2 와 공유(라인 무관 범용 연출).
    this.constructFx(LOT3_CX, LOT2_FLOOR1_Y, LOT2_FLOOR_W);
    this.capLot3Roof();
    this.wireLot3BuildButton();
    const dsv = loadSave();
    dsv.diamonds = Math.max(0, (dsv.diamonds ?? 0) - cost);
    writeSave(dsv);
    this.refreshHomeDiamond();
    this.saveLot3();
    this.panToLot3Floor(1, 1100);
    this.toast('🏨 호텔 1층(로비) 건설!', true);
  }

  /** 호텔 다음 층 건설 — lot2 의 6단계 크레인 연출을 그대로 재사용(크레인/케이블은 씬 공유 오브젝트). */
  private buildLot3Next(): void {
    if (this.constructing) return;
    void ensureAssetGroup(this, 'lot3').then(() => { if (this.scene.isActive()) this.buildLot3NextNow(); });
  }

  private buildLot3NextNow(): void {
    if (this.constructing) return;
    const next = this.hotelFloors + 1;
    if (next > HOTEL_FLOOR_COUNT) return;
    const reqLevel = hotelFloorLevelReq(next);
    const sv = loadSave();
    if ((sv.level ?? 1) < reqLevel) {
      this.toast(`🔒 레벨 ${reqLevel} 필요`);
      return;
    }
    const cost = diamondCostFor(LOT2_MAX_FLOORS + next);
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.constructing = true;
    this.hotelFloors = next;
    const dsv = loadSave();
    dsv.diamonds = Math.max(0, (dsv.diamonds ?? 0) - cost);
    writeSave(dsv);
    this.refreshHomeDiamond();
    this.saveLot3();
    this.hotelBuildBtn?.setVisible(false); // 연출 중 버튼 숨김.

    const cam = this.cameras.main;
    const z0 = cam.zoom;
    const idleY = cam.midPoint.y;
    const ref = this.lot2FloorRef(next);
    const fh = ref.h;
    const fw = ref.w;
    const depth = 16 + next * 3;
    const node = { w: fw, h: fh };
    const objs = this.renderLot3Floor(next, false); // 숨긴 채 준비.
    if (!objs) {
      this.constructing = false;
      return;
    }
    const bld = objs.img;
    const finalY = bld.y;
    const glassObj = objs.glass;
    const glassFinalY = glassObj?.y;
    const charObj = objs.char;
    const charFinalY = charObj?.y;
    const roof = this.lot3Roof;
    const crane = this.craneImg;

    if (crane) {
      crane.x = LOT3_CX - crane.displayWidth * (HOOK_RATIO.x - 0.5);
      crane.y = finalY - LIFT_HOOK - crane.displayHeight * (HOOK_RATIO.y - 0.5);
      crane.setVisible(true).setAlpha(0);
    }

    sfx('button');
    const conZoom = Math.max(z0 * MIN_CAMERA_ZOOM, this.minZoomForGround(idleY - this.camH() / 2));
    cam.zoomTo(conZoom, 820, 'Sine.easeInOut');
    cam.pan(LOT3_CX, idleY - 220, 820, 'Sine.easeInOut');
    if (crane) this.tweens.add({ targets: crane, alpha: 1, duration: 460, ease: 'Sine.easeOut' });
    if (roof) this.tweens.add({ targets: roof, y: roof.y - 200, alpha: 0, duration: 460, ease: 'Sine.easeIn' });

    this.time.delayedCall(900, () => {
      bld.setAlpha(0).setVisible(true);
      bld.y = finalY - FLOOR_LIFT;
      this.tweens.add({ targets: bld, alpha: 1, duration: 200 });
      if (glassObj && glassFinalY != null) {
        glassObj.setAlpha(0).setVisible(true);
        glassObj.y = glassFinalY - FLOOR_LIFT;
        this.tweens.add({ targets: glassObj, alpha: 1, duration: 200 });
        this.tweens.add({ targets: glassObj, y: glassFinalY, duration: 780, ease: 'Bounce.easeOut' });
      }
      this.cablesGfx?.setVisible(true).setAlpha(1);
      this.tweens.add({
        targets: bld,
        y: finalY,
        duration: 780,
        ease: 'Bounce.easeOut',
        onUpdate: () => this.redrawCables(bld, node),
        onComplete: () => {
          cam.shake(240, 0.01);
          sfx('build');
          this.emitSmokeBand(LOT3_CX, finalY + fh * 0.5, fw * 0.92, depth + 3);
          this.tweens.add({ targets: this.cablesGfx, alpha: 0, duration: 240, onComplete: () => this.cablesGfx?.clear().setVisible(false).setAlpha(1) });
        },
      });
    });

    this.time.delayedCall(1860, () => {
      this.capLot3Roof();
      const r = this.lot3Roof;
      if (r) {
        const ry = r.y;
        r.setAlpha(1);
        r.y = ry - 170;
        this.tweens.add({ targets: r, y: ry, duration: 440, ease: 'Bounce.easeOut' });
      }
      if (crane) this.tweens.add({ targets: crane, alpha: 0, y: crane.y - 60, duration: 480, ease: 'Sine.easeIn', onComplete: () => crane.setVisible(false) });
    });

    this.time.delayedCall(2360, () => {
      if (charObj && charFinalY != null) {
        charObj.setAlpha(0).setVisible(true);
        charObj.y = charFinalY - 44;
        this.tweens.add({ targets: charObj, y: charFinalY, alpha: 1, duration: 340, ease: 'Back.easeOut', onComplete: () => this.animateClerk(charObj) });
      }
    });

    this.time.delayedCall(2760, () => {
      cam.zoomTo(z0, 1400, 'Sine.easeInOut');
      const target = Phaser.Math.Clamp(finalY - this.camH() * 0.55, this.scrollMinYFor(true), this.scrollMax);
      cam.pan(LOT3_CX, target + this.camH() / 2, 1400, 'Sine.easeInOut');
    });

    this.time.delayedCall(4400, () => {
      this.wireLot3BuildButton();
      this.constructing = false;
      if (next >= HOTEL_FLOOR_COUNT) this.toast('🏨 호텔 완공! (15층)', true);
    });
  }

  /** 호텔 최상단 y(세로 스크롤 상한용). 안 지었으면 폐건물/간판 상단, 그마저 없으면 지면. */
  private lot3Top(): number {
    if (this.hotelFloors < 1) {
      let t = this.hotelRuin ? this.hotelRuin.y - this.hotelRuin.displayHeight / 2 : this.groundBottom();
      if (this.hotelSign) t = Math.min(t, this.hotelSign.y - this.hotelSign.displayHeight / 2);
      return this.hotelRuin ? t : this.groundBottom();
    }
    let topY = Infinity;
    for (const o of this.lot3FloorObjs.values()) if (o.img.visible) topY = Math.min(topY, o.img.y - o.img.displayHeight / 2);
    if (this.lot3Roof?.visible) topY = Math.min(topY, this.lot3Roof.y - this.lot3Roof.displayHeight / 2);
    if (this.hotelBuildBtn?.visible) topY = Math.min(topY, this.hotelBuildBtn.y - 66);
    return Number.isFinite(topY) ? topY : this.groundBottom();
  }


  /** home.json 의 폐건물(Ruin) 노드를 모두 숨긴다 — 폐건물은 코드로 선배치하므로 중복/편집기 되돌림 방지. */
  private hideLayoutRuins(): void {
    for (const e of this.layoutIdx?.entries() ?? []) {
      if (/Ruin/i.test(e.node.key ?? '')) (e.obj as Phaser.GameObjects.Image).setVisible(false);
    }
  }

  /** 폐건물 코드 선배치 — cx·지면 정렬, **텍스처 비율 보존**(높이=폭×원본비). depth=RUIN_DEPTH. */
  private spawnRuin(cx: number, key: string): Phaser.GameObjects.Image | undefined {
    if (!this.textures.exists(key)) return undefined;
    const src = texSize(this.textures.get(key));
    const h = RUIN_W * (src.height / Math.max(1, src.width));
    const img = this.add.image(cx, GROUND_Y - h / 2, key).setDisplaySize(RUIN_W, h).setDepth(RUIN_DEPTH);
    this.pinToWorld(img);
    return img;
  }

  /**
   * **'FOR SALE' 표지판 선배치** — 구입 가능한 폐건물 앞(좌측 인도, 입구 안 가림)에 지면으로 세운다.
   *   variant(0-base)로 UI_24-1~3 순환 → 부지마다 다른 표지판. 세로/가로 변형 모두 정사각 박스에 비율 보존 맞춤.
   *   depth=폐건물 바로 앞. 건설/철거 시 호출부에서 제거한다.
   */
  private spawnForSaleSign(cx: number, variant: number): Phaser.GameObjects.Image | undefined {
    const n = (((variant % FOR_SALE_VARIANTS) + FOR_SALE_VARIANTS) % FOR_SALE_VARIANTS) + 1; // 1..3 순환.
    const key = `up_Solitare_UI_24-${n}`;
    if (!this.textures.exists(key)) return undefined;
    const src = texSize(this.textures.get(key));
    const scale = Math.min(FOR_SALE_BOX / Math.max(1, src.width), FOR_SALE_BOX / Math.max(1, src.height)); // 박스 안 맞춤.
    const w = src.width * scale;
    const h = src.height * scale;
    const x = cx - RUIN_W * 0.3; // 건물 앞-좌측(입구 안 가리게).
    const img = this.add.image(x, GROUND_Y - h / 2, key).setDisplaySize(w, h).setDepth(FOR_SALE_DEPTH); // 지면에 세움.
    this.pinToWorld(img);
    return img;
  }

  /**
   * **폐건물 상단 간판**(UI_25-1~3, 부지별 변형) — 지붕 위로 솟은 장식 간판. **건물 뒤 레이어**(하단이 건물에
   *   가려 지붕 위로만 보임). `message`가 있으면 간판 패널 위에 메시지(잠금 안내 등)를 얹는다.
   *   반환: `{ board, text }` — 철거/건설 시 호출부가 함께 제거.
   */
  /** 폐건물 텍스처의 **실제 지붕(불투명 최상단) 비율**(0..1) — 상단 투명여백을 건너뛰어 간판을 실지붕에 얹기 위함. 캐시. */
  private visibleTopRatio(key: string): number {
    const cached = this.ruinTopRatioCache.get(key);
    if (cached !== undefined) return cached;
    let ratio = 0;
    try {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
      const w = src.width;
      const hh = src.height;
      const cnv = document.createElement('canvas');
      cnv.width = w;
      cnv.height = hh;
      const ctx = cnv.getContext('2d', { willReadFrequently: true });
      if (ctx && w > 0 && hh > 0) {
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, w, hh).data;
        scan: for (let y = 0; y < hh; y++) {
          const row = y * w * 4;
          for (let x = 0; x < w; x++) {
            if (data[row + x * 4 + 3] > 30) {
              ratio = y / hh;
              break scan;
            }
          }
        }
      }
    } catch {
      ratio = 0; // CORS/미지원 시 바운딩박스 상단 사용(폴백).
    }
    this.ruinTopRatioCache.set(key, ratio);
    return ratio;
  }

  /**
   * 간판 텍스처의 **밝은 패널(글씨 쓰는 크림 영역) 세로 중심 비율**(0..1) — 아트가 재디자인돼(비율 변경 등) 되어도
   *   텍스트가 항상 패널 중앙에 오도록 런타임 검출. 중앙 50% 폭에서 밝은(불투명·밝기 높은) 픽셀의 밝기가중 세로 중심. 캐시.
   */
  private panelCenterRatio(key: string): number {
    const cached = this.panelCenterCache.get(key);
    if (cached !== undefined) return cached;
    let ratio = 0.46; // 폴백(검출 실패 시 대략 중앙-상).
    try {
      const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
      const w = src.width;
      const hh = src.height;
      const cnv = document.createElement('canvas');
      cnv.width = w;
      cnv.height = hh;
      const ctx = cnv.getContext('2d', { willReadFrequently: true });
      if (ctx && w > 0 && hh > 0) {
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, w, hh).data;
        const x0 = Math.floor(w * 0.28);
        const x1 = Math.floor(w * 0.72);
        const span = x1 - x0;
        // **평탄(uniform) 밴드 검출** — 크림 패널은 밝고 분산 낮은 넓은 밴드(프레임/헤더/다리는 디테일 많음). 최장 밴드가 패널.
        const flat: boolean[] = new Array(hh);
        for (let y = 0; y < hh; y++) {
          let cnt = 0;
          let sr = 0;
          let sg = 0;
          let sb = 0;
          let qr = 0;
          let qg = 0;
          let qb = 0;
          for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] > 200) {
              const r = data[i];
              const gg = data[i + 1];
              const b = data[i + 2];
              cnt++;
              sr += r;
              sg += gg;
              sb += b;
              qr += r * r;
              qg += gg * gg;
              qb += b * b;
            }
          }
          if (cnt < span * 0.85) {
            flat[y] = false; // 중앙이 꽉 안 참(다리 사이 틈 등) = 패널 아님.
            continue;
          }
          const bright = (sr + sg + sb) / (3 * cnt);
          const sd = (q: number, s: number): number => Math.sqrt(Math.max(0, q / cnt - (s / cnt) ** 2));
          const variation = sd(qr, sr) + sd(qg, sg) + sd(qb, sb);
          flat[y] = bright > 175 && variation < 70; // 밝은 크림 + 낮은 분산(평탄).
        }
        let bestS = 0;
        let bestLen = 0;
        let s = -1;
        for (let y = 0; y <= hh; y++) {
          const ok = y < hh && flat[y];
          if (ok && s < 0) s = y;
          if (!ok && s >= 0) {
            if (y - s > bestLen) {
              bestLen = y - s;
              bestS = s;
            }
            s = -1;
          }
        }
        if (bestLen > 0) ratio = (bestS + bestLen / 2) / hh; // 최장 평탄 밴드 중심 = 패널 중심.
      }
    } catch {
      ratio = 0.46; // CORS/미지원 폴백.
    }
    this.panelCenterCache.set(key, ratio);
    return ratio;
  }

  /**
   * **판매건물 간판·텍스트 저작 배치**(home_copy2_copy.json) — 간판(UI_25)·텍스트 노드를 **기준 건물(Ruin) 대비 분수**로 환산.
   *   건물 상단(지붕선) 기준 세로 분수 + 폭 분수 → 각 폐건물의 실지붕/표시크기에 스케일 적용(패딩 무관 밀착). 없으면 null(폴백).
   */
  private saleSignPlacement(): { boardVFrac: number; boardXFrac: number; boardWFrac: number; textVFrac: number; textXFrac: number } | null {
    if (this.saleLayoutCache !== undefined) return this.saleLayoutCache;
    let result: { boardVFrac: number; boardXFrac: number; boardWFrac: number; textVFrac: number; textXFrac: number } | null = null;
    try {
      const doc = this.cache.json.get(UI_SALE_KEY) as { nodes?: Array<{ key?: string; x: number; y: number; w?: number; h?: number }> } | undefined;
      const nodes = doc?.nodes ?? [];
      const board = nodes.find((n) => /UI_25/.test(n.key ?? ''));
      const ruins = nodes.filter((n) => /Ruin/.test(n.key ?? ''));
      if (board && board.w && board.h && ruins.length) {
        const building = ruins.reduce((a, b) => (Math.abs(b.x - board.x) < Math.abs(a.x - board.x) ? b : a)); // 간판과 x가 가장 가까운 건물.
        const bw = building.w ?? 1;
        const bh = building.h ?? 1;
        const bTop = building.y - bh / 2; // 건물 상단(≈지붕선).
        // 텍스트 블록 중심 = 간판 패널 내 텍스트(키 없음) 노드들의 중점.
        const texts = nodes.filter((n) => !(n.key ?? '') && Math.abs(n.y - board.y) < (board.h ?? 0) / 2 && Math.abs(n.x - board.x) < (board.w ?? 0) / 2);
        const tx = texts.length ? texts.reduce((s, t) => s + t.x, 0) / texts.length : board.x;
        const ty = texts.length ? texts.reduce((s, t) => s + t.y, 0) / texts.length : board.y;
        result = {
          boardVFrac: (board.y - bTop) / bh, // 간판 중심(건물 상단 기준, 건물높이 분수).
          boardXFrac: (board.x - building.x) / bw,
          boardWFrac: (board.w ?? bw) / bw,
          textVFrac: (ty - bTop) / bh,
          textXFrac: (tx - building.x) / bw,
        };
      }
    } catch {
      result = null;
    }
    this.saleLayoutCache = result;
    return result;
  }

  private spawnLotSignboard(cx: number, variant: number, ruin: Phaser.GameObjects.Image | undefined, message?: string): { board?: Phaser.GameObjects.Image; text?: Phaser.GameObjects.Text | Phaser.GameObjects.Container } {
    const n = (((variant % FOR_SALE_VARIANTS) + FOR_SALE_VARIANTS) % FOR_SALE_VARIANTS) + 1; // 1..3 순환.
    const key = `up_Solitare_UI_25-${n}`;
    // 건물 **실제 지붕선**(상단 투명여백 제외) — 간판 하단을 여기 얹어 지붕과 간판 사이 빈틈이 없게 한다.
    const ruinTop = ruin ? ruin.y - ruin.displayHeight / 2 + this.visibleTopRatio(ruin.texture.key) * ruin.displayHeight : 1500;
    let board: Phaser.GameObjects.Image | undefined;
    let panelX = cx;
    let panelY = ruinTop - 120; // 폴백(간판 없을 때 메시지 y).
    if (this.textures.exists(key)) {
      const src = texSize(this.textures.get(key));
      const place = ruin ? this.saleSignPlacement() : null; // 저작 배치(있으면 우선).
      if (place && ruin) {
        // **에디터 저작 위치 적용** — 간판/텍스트를 건물 대비 분수로 환산해 각 폐건물 실지붕(ruinTop)·표시크기에 스케일.
        const dw = ruin.displayWidth;
        const dh = ruin.displayHeight;
        const boardW = place.boardWFrac * dw;
        const h = boardW * (src.height / Math.max(1, src.width)); // 텍스처 비율 보존.
        const raise = h * LOT_SIGN_RAISE_FRAC; // 간판을 조금 위로(지붕에 덜 파묻히게) — 간판높이 기준이라 부지 간 일관.
        const by = ruinTop + place.boardVFrac * dh - raise;
        board = this.add.image(ruin.x + place.boardXFrac * dw, by, key).setDisplaySize(boardW, h).setDepth(LOT_SIGN_DEPTH);
        this.pinToWorld(board);
        // **텍스트는 간판 패널 중앙**(검출) + 약간 아래로(사용자 요청) — 간판 위치/올림과 무관하게 항상 중앙 근처.
        panelX = board.x;
        panelY = by + (this.panelCenterRatio(key) - 0.5) * h + h * LOT_SIGN_TEXT_DROP_FRAC;
      } else {
        // 폴백(저작 배치 없음) — 실지붕에 얹고 밝은 패널 중심 검출.
        const h = LOT_SIGN_W * (src.height / Math.max(1, src.width));
        const y = ruinTop + LOT_SIGN_OVERLAP - h / 2;
        board = this.add.image(cx, y, key).setDisplaySize(LOT_SIGN_W, h).setDepth(LOT_SIGN_DEPTH);
        this.pinToWorld(board);
        panelY = y + (this.panelCenterRatio(key) - 0.5) * h;
      }
    }
    let text: Phaser.GameObjects.Text | Phaser.GameObjects.Container | undefined;
    if (message) {
      const long = [...message.replace(/\n/g, '')].length > 18; // 긴 설명형 문구(예: 고수익 경쟁 부지)만 제목+설명 2단(코드포인트 기준 — 이모지 서로게이트 오판 방지).
      const dress = (t: Phaser.GameObjects.Text): Phaser.GameObjects.Text => {
        t.setStroke('#5a3410', 6); // 크림/파랑 패널 모두 가독(흰 글자+진갈색 외곽선).
        t.setShadow(2, 2, '#00000066', 4);
        return t;
      };
      if (long) {
        // **제목(첫 줄) 크게 + 설명(나머지) 조금 작게** — 2단 스택을 컨테이너로 패널 중앙에 배치.
        const [title, ...rest] = message.split('\n');
        const desc = rest.join('\n');
        const wrap = Math.round(LOT_SIGN_W * 0.8);
        const base = { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', color: '#ffffff', align: 'center' as const, fontStyle: 'bold', wordWrap: { width: wrap } };
        const tTitle = dress(this.add.text(0, 0, title, { ...base, fontSize: '36px' }).setOrigin(0.5, 0));
        const tDesc = dress(this.add.text(0, 0, desc, { ...base, fontSize: '28px', lineSpacing: -4 }).setOrigin(0.5, 0));
        const gap = -2; // 제목↔설명 줄간 — 제목 아래 여백만 살짝 당기고, 너무 좁지 않게 자연스러운 간격 유지.
        const totalH = tTitle.height + gap + tDesc.height;
        tTitle.y = -totalH / 2;
        tDesc.y = tTitle.y + tTitle.height + gap;
        text = this.add.container(panelX, panelY, [tTitle, tDesc]).setDepth(LOT_SIGN_TEXT_DEPTH); // 저작(또는 검출) 텍스트 위치에 2단 블록 중앙 배치.
        this.pinToWorld(text);
      } else {
        text = dress(this.add.text(panelX, panelY, message, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '32px', color: '#ffffff', align: 'center', fontStyle: 'bold', lineSpacing: -10 }).setOrigin(0.5).setDepth(LOT_SIGN_TEXT_DEPTH));
        this.pinToWorld(text);
      }
    }
    return { board, text };
  }

  /** 잠금 상태에 따른 간판 메시지 문구. */
  private lotSignMessage(): string {
    return this.lotsUnlocked() ? '🏗️ 구입 가능!' : '🔒 타워 10층\n완공 시 개방';
  }

  /** 한 사이드 부지 세팅 — 경쟁부지(뱅크 낙찰)·건설됨(1층)·철거됨(빈부지)·폐건물(구입/경매) 상태 분기. */
  private setupSideLot(lot: SideLot, savedBuilt: boolean, savedDemolished: boolean): void {
    const isComp = !!lot.signOverride; // 고수익 경쟁 부지(좌측 L2).
    if (isComp && (loadSave().compBankFloors ?? 0) >= 1) {
      this.renderCompetitiveBank(lot, false); // 낙찰됨 → 저장 층수만큼 복원 + 다음 층 버튼.
      return;
    }
    if (savedBuilt) {
      lot.built = true;
      const objs = this.renderSideFloor1(lot, true);
      if (objs?.char) this.animateClerk(objs.char);
      this.addSideCustomer(lot);
      return;
    }
    if (savedDemolished) {
      lot.demolished = true; // 빈 부지 → 1층 건설 버튼만.
      this.showSideBuildButton(lot);
      return;
    }
    lot.ruin = this.spawnRuin(lot.cx, lot.ruinKey); // 폐건물 선배치(잠금 여부와 무관하게 항상 표시).
    const variant = this.sideLots.indexOf(lot);
    lot.forSale = this.spawnForSaleSign(lot.cx, variant); // 구입 가능한 폐건물 앞 'FOR SALE'(부지별 변형).
    const sign = this.spawnLotSignboard(lot.cx, variant, lot.ruin, lot.signOverride ?? this.lotSignMessage()); // 상단 간판 + 메시지(부지 고유 문구 우선).
    lot.sign = sign.board;
    lot.signMsg = sign.text;
    if (isComp) {
      this.showSideAuctionButton(lot); // **경쟁 부지 = 10층 제한 없이 처음부터 경매 신청**(사용자 요청).
      return;
    }
    if (!this.lotsUnlocked()) return; // **일반 부지 = 메인타워 10층 완공 전 잠금**(간판 메시지로 안내, 버튼 없음).
    this.showSideBuyButton(lot);
  }

  /** 고수익 경쟁 부지 '🔨 경매 신청' 버튼(잠금 해제 시) — 낙찰 시 4층 뱅크 한꺼번에 건설. */
  private showSideAuctionButton(lot: SideLot): void {
    const by = lot.ruin ? lot.ruin.y - lot.ruin.displayHeight / 2 + 60 : 1780;
    lot.btn = this.makeLotButton(lot.cx, by, '🔨 경매 신청', () => this.buildCompetitiveBank(lot), 260);
  }

  /** 사이드 부지 '부지 구입(철거)' 버튼 + 방향 힌트(잠금 해제 시). */
  private showSideBuyButton(lot: SideLot): void {
    const by = lot.ruin ? lot.ruin.y - lot.ruin.displayHeight / 2 + 60 : 1780;
    lot.btn = this.makeLotButton(lot.cx, by, '🏗️ 부지 구입\n(철거)', () => this.demolishSide(lot), 260);
    const hint = this.add
      .text(lot.hintX, 1360, lot.hintText, { fontFamily: 'sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(60);
    hint.setShadow(2, 2, '#00000088', 4);
    this.pinToWorld(hint);
    const dir = lot.cx < W / 2 ? -1 : 1;
    this.tweens.add({ targets: hint, x: lot.hintX + dir * 20, alpha: 0.5, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    lot.hint = hint;
  }

  /**
   * **부지 구입 잠금 해제**(메인타워 10층 완공 시) — 잠긴 부지의 자물쇠 라벨을 없애고 구입 버튼을 켠다.
   *   건설/철거 완료된 부지는 건너뛴다. 재진입 없이 즉시 반영.
   */
  private unlockLots(): void {
    if (!this.lotsUnlocked()) return;
    // 우 내측(lot2) — 간판 메시지를 '구입 가능'으로 바꾸고 구입 버튼 켜기.
    if (!this.lot2Built && this.lot2Ruin && !this.lot2Btn && !loadSave().lot2Demolished) {
      (this.lot2SignMsg as Phaser.GameObjects.Text | undefined)?.setText(this.lotSignMessage()); // lot2는 고유문구 없음 → 항상 Text.
      this.showLot2BuyButton();
    }
    // 사이드 부지.
    for (const lot of this.sideLots) {
      if (lot.built || lot.demolished || lot.btn || !lot.ruin) continue;
      if (lot.signOverride) {
        this.showSideAuctionButton(lot); // 경쟁 부지 = 경매 신청(간판 문구 유지).
      } else {
        (lot.signMsg as Phaser.GameObjects.Text | undefined)?.setText(this.lotSignMessage()); // 단문 Text만 '구입 가능!'.
        this.showSideBuyButton(lot);
      }
    }
  }

  /** **일반 부지 구입 활성 조건** — 메인타워가 최대(10)층까지 완공돼야 열린다. (경쟁 부지는 예외 = 처음부터 열림.) */
  private lotsUnlocked(): boolean {
    return this.builtFloors >= MAX_FLOORS;
  }

  /** 빈 부지에 `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}` 버튼(철거 후). */
  private showSideBuildButton(lot: SideLot): void {
    lot.btn = this.makeLotButton(lot.cx, LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2 - 90, `🏗️ 1층 건설\n💎 ${diamondCostFor(1)}`, () => this.buildSideFloor1(lot), 240);
  }

  /** 사이드 부지 1층(서점 아트) 렌더 — 부지 cx·지면. 유리팬스 없음(1층 예외). */
  private renderSideFloor1(lot: SideLot, visible: boolean): { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image } | undefined {
    const key = 'up_Slitare_BG_02_01';
    if (!this.textures.exists(key)) return undefined;
    const y = LOT2_FLOOR1_Y;
    const depth = this.floorDepth(1); // 1층 depth(floorDepth 규약 — 아래층이 앞).
    const img = this.add.image(lot.cx, y, key).setDisplaySize(LOT2_FLOOR_W, LOT2_FLOOR_H).setDepth(depth).setVisible(visible);
    this.pinToWorld(img);
    let char: Phaser.GameObjects.Image | undefined;
    const chKey = 'up_Solirare_Chr_02_01';
    if (this.textures.exists(chKey)) {
      char = this.add.image(lot.cx + LOT2_FLOOR_W * 0.22, y + LOT2_FLOOR_H * 0.16, chKey).setDepth(depth + 1.5).setVisible(visible);
      char.setDisplaySize(char.width * (245 / char.height), 245);
      this.pinToWorld(char);
      wireClerkTalk(this, char, THEME_RIVAL_LOT, 0); // 사이드(경쟁부지) 점원 탭 = 경쟁 시스템 예고 대사.
    }
    lot.floor = { img, char };
    return { img, char };
  }

  /** 경쟁 부지 뱅크 **한 층 추가**(Bank_0N + 2층+ 유리팬스). 최상층 top 을 lot.bankTopY 로 갱신. animate=낙하 등장. */
  private addCompetitiveFloor(lot: SideLot, level: number, animate: boolean): void {
    const fw = LOT2_FLOOR_W;
    const fh = LOT2_FLOOR_H;
    const key = `up_Bank_${pad2(level)}`;
    if (!this.textures.exists(key)) return; // 아트 없으면 방어.
    const y = LOT2_FLOOR1_Y - (level - 1) * (fh - LOT2_SMALL_OVERLAP); // 동일 높이 층 위로 스택.
    const img = this.add.image(lot.cx, y, key).setDisplaySize(fw, fh).setDepth(this.floorDepth(level));
    this.pinToWorld(img);
    lot.built = true;
    lot.bankTopY = Math.min(lot.bankTopY ?? Infinity, y - fh / 2);
    // **은행원 캐릭터를 건물 가운데(공공건물 배치 위치)에** + 동일 idle 애니.
    const chr = this.placeBankClerk(lot.cx, level, y);
    if (level !== 1 && this.textures.exists('up_Slitare_BG_Glass')) {
      const glass = this.add.image(lot.cx, y + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(this.floorDepth(level) + 2);
      glass.setDisplaySize(690, glass.height * (690 / glass.width));
      this.pinToWorld(glass);
      if (chr) chr.setDepth(glass.depth - 0.5); // 캐릭터=유리 바로 뒤(오피스와 동일).
      if (animate) this.raiseLot2Floor({ img: glass }, level);
    }
    if (chr && animate) this.raiseLot2Floor({ img: chr }, level);
    if (animate) this.raiseLot2Floor({ img }, level); // 위에서 내려오며 등장(공용).
  }

  /**
   * 뱅크 층 **은행원 캐릭터**(up_Solirare_Bank_0N)를 **공공건물 배치 위치**(home_copy2 Officer 노드 오프셋)와 동일하게
   *   건물 가운데 배치 + `animateClerk` 동일 애니. 4층은 오피서 3층 위치 재사용. 반환=캐릭터(없으면 undefined).
   */
  private placeBankClerk(cx: number, level: number, floorY: number): Phaser.GameObjects.Image | undefined {
    const chrKey = `up_Solirare_Bank_${pad2(level)}`;
    if (!this.textures.exists(chrKey)) return undefined;
    const fh = LOT2_FLOOR_H;
    const doc = (this.cache.json.get(UI_OFFICE_KEY) ?? null) as { nodes?: Array<{ key?: string; x: number; y: number; w?: number; h?: number }> } | null;
    const nodes = doc?.nodes ?? [];
    const ref = Math.min(Math.max(1, level), OFFICE_FLOORS); // 4층은 오피서 최상층(3) 위치 재사용.
    const find = (part: string): (typeof nodes)[number] | undefined => nodes.find((n) => (n.key ?? '').includes(part));
    const bNode = find(`Office_${pad2(ref)}_v2`) ?? find(`Office_${pad2(ref)}`);
    const oNode = find(`Officer_${pad2(ref)}`);
    const s = fh / (bNode?.h ?? fh);
    const offX = bNode && oNode ? (oNode.x - bNode.x) * s : 0;
    // 공공건물(officer) 위치 + **조금 아래로**(수직 하향, 사용자 요청: 공공건물보다 앞/아래에 서게).
    const offY = (bNode && oNode ? (oNode.y - bNode.y) * s : fh * 0.12) + fh * BANK_CLERK_DROP_FRAC;
    const chr = this.add
      .image(cx + offX, floorY + offY, chrKey)
      .setDisplaySize((oNode?.w ?? 110) * s, (oNode?.h ?? 240) * s)
      .setDepth(this.floorDepth(level) + 1);
    this.pinToWorld(chr);
    this.animateClerk(chr, level * 430); // 오피스 관리자와 동일 idle(위상차).
    return chr;
  }

  /** 저장된 층수만큼 뱅크 복원(재진입) + 미완공이면 '다음 층 건설' 버튼. */
  private renderCompetitiveBank(lot: SideLot, _animate: boolean): void {
    const floors = Math.max(0, Math.min(COMP_BANK_FLOORS, loadSave().compBankFloors ?? 0));
    lot.bankTopY = undefined;
    if (floors === 0) return; // 지을 게 없으면 아트도 필요 없다.
    // 은행 아트도 부지 그룹('bank')이라 **도착한 뒤** 세운다 — addCompetitiveFloor 는 텍스처가 없으면
    //   조용히 건너뛰므로(방어) 기다리지 않으면 층이 통째로 안 그려진다.
    void ensureAssetGroup(this, 'bank').then(() => {
      if (!this.scene.isActive()) return;
      for (let level = 1; level <= floors; level++) this.addCompetitiveFloor(lot, level, false);
      if (floors < COMP_BANK_FLOORS) this.showCompetitiveNextButton(lot); // 다음 단계 건설 버튼.
    });
  }

  /** 경쟁 부지 '🏦 뱅크 N층 건설' 버튼 — 현재 최상층 위. (미완공 시) */
  private showCompetitiveNextButton(lot: SideLot): void {
    const floors = loadSave().compBankFloors ?? 0;
    if (floors >= COMP_BANK_FLOORS) return; // 완공(4층).
    const topY = lot.bankTopY ?? LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2;
    lot.btn = this.makeLotButton(lot.cx, topY - 96, `🏦 뱅크 ${floors + 1}층 건설`, () => this.buildCompetitiveNext(lot), 260);
  }

  /** **경매 신청 → 낙찰 → 1층부터 단계 건설 시작**(경쟁 부지). 폐건물/간판 제거 후 1층 등장 + '다음 층' 버튼. */
  private buildCompetitiveBank(lot: SideLot): void {
    if (lot.built || this.constructing) return;
    this.constructing = true;
    sfx('button');
    for (const o of [lot.btn, lot.hint, lot.forSale, lot.sign, lot.signMsg, lot.ruin]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }); // 폐건물·간판·표지판·버튼 제거.
    }
    lot.btn = undefined;
    lot.hint = undefined;
    lot.forSale = undefined;
    lot.sign = undefined;
    lot.signMsg = undefined;
    lot.ruin = undefined;
    lot.bankTopY = undefined;
    this.panToSide(lot, 700);
    this.time.delayedCall(320, () => {
      this.addCompetitiveFloor(lot, 1, true); // **1층부터** 단계 건설.
      this.constructFx(lot.cx, LOT2_FLOOR1_Y, LOT2_FLOOR_W);
      const s = loadSave();
      s.compBankFloors = 1;
      writeSave(s);
      this.constructing = false;
      this.panToSide(lot, 900);
      this.toast('🏦 경매 낙찰! 뱅크 1층 완공', true);
      this.showCompetitiveNextButton(lot); // 다음 층 건설 버튼.
    });
  }

  /** 경쟁 부지 뱅크 **다음 층 단계 건설**(버튼) — 한 층씩 위로. 완공(4층)까지 반복. */
  private buildCompetitiveNext(lot: SideLot): void {
    if (this.constructing) return;
    const cur = loadSave().compBankFloors ?? 0;
    if (cur >= COMP_BANK_FLOORS) return; // 완공.
    this.constructing = true;
    sfx('button');
    if (lot.btn) {
      const b = lot.btn;
      this.tweens.add({ targets: b, alpha: 0, duration: 250, onComplete: () => b.destroy() });
      lot.btn = undefined;
    }
    const next = cur + 1;
    const y = LOT2_FLOOR1_Y - (next - 1) * (LOT2_FLOOR_H - LOT2_SMALL_OVERLAP);
    this.addCompetitiveFloor(lot, next, true);
    this.constructFx(lot.cx, y, LOT2_FLOOR_W);
    const s = loadSave();
    s.compBankFloors = next;
    writeSave(s);
    this.panToSide(lot, 700);
    this.time.delayedCall(520, () => {
      this.constructing = false;
      if (next >= COMP_BANK_FLOORS) this.toast('🏦 고수익 뱅크 4층 완공!', true);
      else this.showCompetitiveNextButton(lot); // 다음 단계 버튼.
    });
  }

  /** 사이드 부지 **철거** = 폐건물 철거 연출 → **빈 부지**(1층 건설 버튼). */
  private demolishSide(lot: SideLot): void {
    if (lot.built || lot.demolished || this.constructing) return;
    this.constructing = true;
    sfx('button');
    for (const o of [lot.btn, lot.hint, lot.forSale, lot.sign, lot.signMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }); // 표지판·간판도 함께 페이드 제거.
    }
    lot.btn = undefined;
    lot.hint = undefined;
    lot.forSale = undefined;
    lot.sign = undefined;
    lot.signMsg = undefined;
    const ruin = lot.ruin;
    lot.ruin = undefined;
    this.panToSide(lot, 700);
    const done = (): void => {
      this.constructing = false;
      lot.demolished = true;
      const s = loadSave();
      s.sideDemolished = { ...(s.sideDemolished ?? {}), [lot.saveKey]: true };
      writeSave(s);
      this.showSideBuildButton(lot); // 빈 부지 → 1층 건설 버튼.
      this.toast('🏚️ 철거 완료 — 빈 부지', true);
    };
    if (!ruin) {
      done();
      return;
    }
    this.demolishRuin(ruin, done);
  }

  /** 빈 부지 → 1층 건설 — **다이아 비용**(10) 차감 + 렌더 + 등장 + 저장 + 팬. */
  private buildSideFloor1(lot: SideLot): void {
    if (lot.built) return;
    const cost = diamondCostFor(1);
    const sv = loadSave();
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    lot.built = true;
    if (lot.btn) {
      const b = lot.btn;
      this.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: () => b.destroy() });
      lot.btn = undefined;
    }
    sfx('button');
    const objs = this.renderSideFloor1(lot, false);
    if (objs) this.raiseLot2Floor(objs, 1); // 위에서 내려오며 등장(공용).
    this.constructFx(lot.cx, LOT2_FLOOR1_Y, LOT2_FLOOR_W); // 건설 연출(2단계 도구+먼지).
    this.addSideCustomer(lot);
    const s = loadSave();
    s.diamonds = Math.max(0, (s.diamonds ?? 0) - cost); // 다이아 차감.
    s.sideBuilt = { ...(s.sideBuilt ?? {}), [lot.saveKey]: true };
    writeSave(s);
    this.refreshHomeDiamond();
    this.panToSide(lot, 1100);
    this.toast('🏗️ 1층(서점) 건설!', true);
  }

  /** 카메라를 사이드 부지로 팬(현재 세로 유지, 가로만 이동). */
  private panToSide(lot: SideLot, dur: number): void {
    const cam = this.cameras.main;
    const y = Phaser.Math.Clamp(cam.scrollY, this.sideStageMinY(lot), this.scrollMax);
    cam.pan(lot.cx, y + this.camH() / 2, dur, 'Sine.easeInOut');
  }

  /** 사이드 스테이지 세로 스크롤 상한(폐건물/1층 상단 위 여백). 상단 간판이 지붕 위로 솟으므로 간판 상단도 포함. */
  private sideStageMinY(lot: SideLot): number {
    let top = lot.ruin ? lot.ruin.y - lot.ruin.displayHeight / 2 : LOT2_FLOOR1_Y - LOT2_FLOOR_H / 2;
    if (lot.sign) top = Math.min(top, lot.sign.y - lot.sign.displayHeight / 2); // 간판 상단까지 스크롤 허용.
    if (lot.bankTopY !== undefined) top = Math.min(top, lot.bankTopY); // 경쟁 부지 뱅크(4층) 최상층까지.
    return Math.min(this.scrollMax, top - this.topMargin());
  }

  /** 사이드 부지 손님 스팟 — 전역 스포너가 랜덤 등장. */
  private addSideCustomer(lot: SideLot): void {
    const objs = lot.floor;
    if (!objs || this.customerSpots.some((s) => s.stage === lot.stage)) return;
    const clerk = objs.char;
    const groundY = clerk ? clerk.y + clerk.displayHeight * (1 - clerk.originY) : LOT2_FLOOR1_Y + LOT2_FLOOR_H * 0.4;
    const depth = objs.img.depth + 1.8;
    this.customerSpots.push({
      entryX: lot.cx - LOT2_FLOOR_W * 0.22,
      centerX: lot.cx,
      groundY,
      height: 233 * 0.92,
      depth,
      floor: 1,
      stage: lot.stage,
      coinYield: SIDE_LOT_YIELD[lot.stage] ?? 5, // 사이드 부지 상점별 수익성(부지마다 다름).
    });
  }

  /** 스테이지 스크롤 위치가 속한 사이드 부지(대략 반 화면 이내) — 세로 상한 판정용. */
  private sideLotForScrollX(sx: number): SideLot | undefined {
    return this.sideLots.find((l) => isOverLot(l.cx, sx, this.camW()));
  }

  /**
   * **각 부지 건물 좌우에 프롭**(가로등·소화전·화분) — 타워 프롭(home.json) 오프셋/크기/depth 를 그대로 복제해
   *   부지 cx 좌우에 코드로 세운다. 접지 그림자도 함께. (부지는 항상 있는 거리 풍경이므로 건설 여부와 무관.)
   */
  private addLotProps(cx: number, behindTower = false): void {
    // **behindTower**(공공건물 오피스 부지) — 프롭(특히 소화전)이 타워 앞으로 튀어나오지 않게 **타워 뒤 레이어**로.
    //   오피스 1층 depth(floorDepth(1)=13) 미만으로 상한을 걸어 전부 건물 뒤에 둔다.
    const cap = behindTower ? Math.min(this.floorDepth(1), this.floorDepth(MAX_FLOORS)) - 1 : Infinity; // 모든 층보다 뒤(depth 역순 대응).
    const mk = (dx: number, y: number, w: number, h: number, key: string, depth: number): void => {
      if (!this.textures.exists(key)) return;
      const img = this.add.image(cx + dx, y, key).setDisplaySize(w, h).setDepth(Math.min(depth, cap));
      this.pinToWorld(img);
    };
    // 타워(중앙 550) 프롭의 상대 오프셋/크기/depth 를 그대로 사용.
    mk(-486, 1889, 79, 391, 'up_Slitare_BG_Item_01', 10); // 가로등 L
    mk(465, 1890, 79, 391, 'up_Slitare_BG_Item_01', 11); // 가로등 R
    mk(-422, 2024, 79, 119, 'up_Slitare_BG_Item_02', 12); // 소화전 L
    mk(404, 2024, 79, 119, 'up_Slitare_BG_Item_02', 14); // 소화전 R
    mk(-497, 2097, 112, 109, 'up_Slitare_BG_Item_04', 13); // 화분 L
    mk(479, 2094, 112, 113, 'up_Slitare_BG_Item_05', 15); // 화분 R
  }

  /** 저장된 스테이지2를 **즉시**(연출 없이) 그 높이까지 세운다 — 로드 복원용. */
  private restoreLot2(floors: number): void {
    this.lot2Built = true;
    this.lot2Floors = 0;
    for (let l = 1; l <= Math.min(LOT2_MAX_FLOORS, floors); l++) {
      this.lot2Floors = l;
      const objs = this.renderLot2Floor(l, true);
      if (objs?.char) this.animateClerk(objs.char);
      this.addLot2Customer(l);
    }
    this.capLot2Roof();
    this.wireLot2BuildButton();
  }

  /** **임시저장**: 스테이지2 건설 상태 저장(건설/매입 시 호출). */
  private saveLot2(): void {
    const s = loadSave();
    s.lot2Built = this.lot2Built;
    s.lot2Floors = this.lot2Floors;
    s.lot2Owned = this.lot2Floors; // 건설=소유(스테이지2는 매입 단계 없음).
    writeSave(s);
  }

  /** 부지/건설 버튼 = **1번 스테이지와 동일한 UI_22(파란 버튼)** + 라벨(월드 오브젝트, 명멸 펄스). 탭 시 onTap. */
  private makeLotButton(x: number, y: number, label: string, onTap: () => void, bw = 200): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(61);
    const btn = this.add.image(0, 0, 'up_Solitare_UI_22');
    btn.setDisplaySize(bw, bw * (btn.height / btn.width));
    const fontSize = Math.round(bw * 0.13); // 버튼 폭에 비례한 라벨 크기.
    const t = this.add
      .text(0, 0, label, { fontFamily: 'sans-serif', fontSize: `${fontSize}px`, color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    t.setShadow(2, 2, '#00000077', 3);
    c.add([btn, t]);
    // **자식 이미지에 직접 interactive**(컨테이너 히트영역 변환 이슈 회피 → 첫 탭 확실 작동). 스테이지1(Image+pointerdown)과 동일 방식.
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', onTap);
    this.pinToWorld(c);
    this.tweens.add({ targets: c, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c;
  }

  /**
   * **민원 창구 버튼** — 공공건물 한 층에 붙는 프리셀 진입점(`logic/civicDesks.ts`).
   *
   * PO 2026-08-30: 프리셀을 홈 레일의 '보너스' 아이콘에서 떼어 공공건물로 옮긴다. 층마다 담당 모드가
   * 달라, **건물 자체가 모드 선택기**가 된다(아래층이 쉽고 위층이 어렵다).
   *
   * ⚠️ **깊이**: 층 아트(floorDepth) → 캐릭터(+1) → 유리팬스(+2) 순이라 버튼은 **+3**. 낮게 두면
   *   2층 이상에서 유리 뒤로 들어가 눌리지 않는다.
   * ⚠️ **위치**: 캐릭터가 층 중앙에 서 있으므로 버튼은 **오른쪽 아래**로 뺀다(캐릭터를 가리지 않게).
   * ⚠️ 하루 판수·게임비는 **건물 전체가 공유**한다 — 여기서 따로 세지 않고 `startBonusPlay()` 한 곳만 쓴다.
   */
  /**
   * 좌측 **공공건물 부지로 카메라 이동**(레일 '민원' 아이콘이 부른다).
   * 부지 인덱스는 `homeStages.STAGE_CX` 순서 — 0 좌외곽 / **1 공공건물** / 2 메인타워 / 3 우측 부지.
   */
  private panToCivicLot(): void {
    const cam = this.cameras.main;
    if (cam.panEffect?.isRunning || this.constructing) return;
    const canvasW = this.camW();
    const target = Phaser.Math.Clamp(scrollXForCenter(OFFICE_CX, canvasW), this.scrollMinX, this.scrollMaxX);
    this.scrollVelX = 0;
    const y = Phaser.Math.Clamp(cam.scrollY, this.scrollMinYForScrollX(target), this.scrollMax);
    this.scrollTargetX = target;
    this.scrollTargetY = y;
    cam.pan(centerOf(target, canvasW), y + this.camH() / 2, 560, 'Cubic.easeOut');
    this.repaintCivicDesks(); // 도착 화면이 최신 판수를 보여주게.
  }

  private addCivicDeskButton(desk: CivicDesk, floorY: number, fw: number, fh: number): void {
    const bx = OFFICE_CX + fw * 0.29;
    const by = floorY + fh * 0.22;
    const depth = this.floorDepth(desk.floor) + 3;

    const box = this.add.container(bx, by).setDepth(depth);
    const plate = this.add.image(0, 0, 'up_Solitare_UI_22');
    const bw = 236;
    plate.setDisplaySize(bw, bw * (plate.height / plate.width));
    const label = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold', align: 'center', lineSpacing: 2 })
      .setOrigin(0.5);
    label.setShadow(2, 2, '#00000077', 3);
    box.add([plate, label]);
    this.pinToWorld(box);
    this.civicDeskBoxes.push({ desk, box, plate, label });
    plate.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.enterCivicDesk(desk));
    this.paintCivicDesk(desk, box, plate, label);
  }

  /**
   * 창구 버튼의 글자·상태를 다시 칠한다 — 판수/게임비/해금은 **누를 때마다 달라지므로** 갱신이 필요하다.
   * ⚠️ 잠긴 창구도 **보여 준다**(회색) — 위층에 무엇이 있는지 보이는 것이 올라갈 이유가 된다.
   */
  private paintCivicDesk(
    desk: CivicDesk,
    box: Phaser.GameObjects.Container,
    plate: Phaser.GameObjects.Image,
    label: Phaser.GameObjects.Text,
  ): void {
    const save = loadSave();
    const open = isDeskOpen(desk, save.level);
    // 게임 방식은 **층이 아니라 그 창구의 진행도**가 정한다(4단 순환) — 버튼에 지금 차례를 보여 준다.
    const st = civicDeskStateOf(desk.role);
    const mode = `${BONUS_DRAW_COUNT[st.mode]}장${st.timed ? ' ⏱' : ''}`;
    if (desk.comingSoon) {
      label.setText(`${desk.office}
준비중`);
      box.setAlpha(0.55);
      return;
    }
    if (!open) {
      label.setText(`${desk.office}
🔒 Lv${desk.unlockLevel}`);
      box.setAlpha(0.62);
      return;
    }
    const free = bonusPlaysLeft(save.bonusGame, new Date());
    const fee = bonusEntryFee(save.bonusGame, new Date());
    const cost = fee === 0 ? `무료 ${free}` : `🪙${(fee / 1000).toFixed(0)}k`;
    // 3번째 줄 = **진행 보상 배수**(한 바퀴 돌 때마다 오른다). 1.0 배면 굳이 안 보여 준다.
    const boost = st.mult > 1 ? `
×${st.mult.toFixed(1)} 보상` : '';
    label.setText(`${desk.errand} ${st.step}/4
${mode} · ${cost}${boost}`);
    box.setAlpha(save.coins >= fee ? 1 : 0.62);
    void plate;
  }

  /** 열려 있는 창구 버튼 전체 다시 칠하기(판을 쓰거나 홈으로 돌아왔을 때). */
  private repaintCivicDesks(): void {
    for (const e of this.civicDeskBoxes) {
      if (!e.box.scene) continue; // 씬 재시작으로 파괴된 것은 건너뛴다.
      this.paintCivicDesk(e.desk, e.box, e.plate, e.label);
    }
  }

  /**
   * 창구 입장 — **차감은 `startBonusPlay()` 단일 지점**(logic/bonusRuntime 규약)을 그대로 지난다.
   * ⚠️ 새 진입 경로를 만들 때 이 함수를 우회하면 그 문으로는 판수가 안 세진다.
   */
  private enterCivicDesk(desk: CivicDesk): void {
    if (this.constructing) return;
    sfx('button');
    const save = loadSave();
    if (desk.comingSoon) {
      this.toast(`${desk.office}은(는) 준비 중이에요`);
      return;
    }
    if (!isDeskOpen(desk, save.level)) {
      this.toast(`🔒 레벨 ${desk.unlockLevel} 이상 필요
(현재 레벨 ${save.level})`);
      return;
    }
    const started = startBonusPlay();
    if (started === null) {
      // 코인 부족 — **광고 보상으로 무료 한 판** 제안(2026-09-02 광고 모델: 무료 재화 소진 구제).
      //   광고 불가 타겟이면 기존 토스트 폴백. ⚠️ 홈 화면은 반드시 uiCam 을 넘긴다(공용 팝업 규칙).
      const enterViaAd = (): void => {
        const st = civicDeskStateOf(desk.role);
        advanceCivicProgress(desk.role);
        this.scene.start('playKlondike', { mode: st.mode, timed: st.timed, desk: desk.role, mult: st.mult });
      };
      const offered = offerAdFreePlay(this, { uiCam: this.uiCam, onGranted: enterViaAd });
      if (!offered) {
        this.toast(`코인이 부족합니다 — 게임비 🪙${BONUS_PAID_FEE.toLocaleString()} (무료 ${BONUS_PLAYS_PER_DAY}판은 내일 다시 채워집니다)`);
      }
      this.repaintCivicDesks();
      return;
    }
    if (started.paid > 0) this.toast(`게임비 🪙${started.paid.toLocaleString()} 지불`);
    /*
     * **이번 판의 방식은 진행도가 정한다** — 읽고 나서 한 칸 민다(이기든 지든 다음엔 다음 단계).
     * ⚠️ 순서가 중요하다: 먼저 `civicDeskStateOf` 로 **지금 차례**를 읽고, 그 값으로 씬을 띄운 뒤
     *   진행도를 올린다. 올리고 읽으면 한 단계 건너뛴다.
     */
    const st = civicDeskStateOf(desk.role);
    advanceCivicProgress(desk.role);
    this.scene.start('playKlondike', { mode: st.mode, timed: st.timed, desk: desk.role, mult: st.mult });
  }

  /**
   * **우측 부지 1층 건설** — 화면을 타워2 자리로 팬하면서 편의점(1층) 아트+점원을 페이드인으로 세운다.
   *   버튼/힌트는 제거. 이후 이 부지에도 위로 층을 쌓는 구조로 확장 가능(현재는 1층까지).
   */
  /** 층 높이(레벨) — 스테이지1 towerFloors 기준(양 스테이지 공통). */
  private floorHeight(level: number): number {
    return this.towerFloors[level - 1]?.node.h ?? LOT2_FLOOR_H;
  }
  /** 층 폭(레벨). */
  private floorWidth(level: number): number {
    return this.towerFloors[level - 1]?.node.w ?? LOT2_FLOOR_W;
  }

  /**
   * **통일 스택 y** — 1층=지면(FLOOR1_Y), 위로 **작은 균일 겹침(LOT2_SMALL_OVERLAP)**만큼만 침범하며 누적.
   *   두 스테이지가 동일하게 이 로직으로 쌓인다(스테이지2 기준을 스테이지1에도 적용).
   */
  private stackedFloorY(level: number): number {
    let y = LOT2_FLOOR1_Y;
    for (let l = 2; l <= level; l++) {
      y = y - this.floorHeight(l - 1) / 2 + LOT2_SMALL_OVERLAP - this.floorHeight(l) / 2;
    }
    return y;
  }

  /** 층 레이어(depth) — 논리적 순차(위층일수록 앞). 양 스테이지 공통. */
  private floorDepth(level: number): number {
    // **아래층이 앞, 위층이 뒤**(PO 2026-08-30) — 위층의 바닥 슬래브가 아래층 차양 뒤로 들어가 층간 틈이 사라진다.
    //   예전엔 위층일수록 앞이었다(그때는 위층 바닥이 아래층 위에 얹혀 아트 투명 여백이 틈으로 보였다).
    //   층에 붙는 것들(유리 +2 · 점원 +1.5 · 지붕 +2.5)은 전부 이 값 기준 상대라 그대로 따라온다.
    // ⚠️ 기준은 **가장 높은 타워의 층수**(LOT2_MAX_FLOORS=20) — MAX_FLOORS(10)로 두면 11층부터 depth 가 배경(1~7)
    //   아래로 떨어져 **타워가 도시 배경 뒤로 사라진다**(실측 2026-08-30).
    return FLOOR_DEPTH_BASE + (LOT2_MAX_FLOORS + 1 - level) * FLOOR_DEPTH_STEP;
  }

  /** 화면에 **보이는** 메인 타워 층 수 — 평소엔 건설된 층, 30층 테스트면 전부. 저장값(builtFloors)은 그대로다. */
  private shownFloors(): number {
    return SHOW_ALL_FLOORS_TEST ? Math.max(this.builtFloors, MAX_FLOORS) : this.builtFloors;
  }

  /** 스테이지2 층 기하 = 통일 스택(y/depth) + 스테이지1 동일 층 w/h. */
  private lot2FloorRef(level: number): { y: number; w: number; h: number; depth: number } {
    return { y: this.stackedFloorY(level), w: this.floorWidth(level), h: this.floorHeight(level), depth: this.floorDepth(level) };
  }

  /**
   * **스테이지1을 통일 스택으로 재조정** — 각 층 이미지·장식(유리·점원)을 stackedFloorY(겹침 통일)로 이동하고
   *   depth 를 floorDepth(논리적 순차)로 재설정한다. 이후 capRoof/normalizeClerkDepths/wireStoreButtons 가
   *   갱신된 위치·depth 를 사용한다(지붕·버튼 자동 정렬). → 스테이지1·2 가 동일 로직으로 쌓인다.
   */
  private restackStage1(): void {
    const n = this.towerFloors.length;
    for (let level = 1; level <= n; level++) {
      const entry = this.towerFloors[level - 1];
      const img = entry.obj as Phaser.GameObjects.Image;
      const newY = this.stackedFloorY(level);
      const dy = newY - entry.node.y;
      const newDepth = this.floorDepth(level);
      img.y += dy;
      img.setDepth(newDepth);
      const mn = entry.node as { y: number; depth: number }; // 런타임 노드는 가변(towerTop/버튼이 node.y 를 참조).
      mn.y = newY;
      mn.depth = newDepth;
      const dec = this.floorDecor.get(level);
      if (dec?.glass) {
        dec.glass.y += dy;
        dec.glass.setDepth(newDepth + 2);
      }
      if (dec?.char) {
        dec.char.y += dy;
        dec.char.setDepth(newDepth + 1.5); // 유리 있으면 normalizeClerkDepths 가 glass−0.5 로 다시 맞춤.
      }
    }
  }

  /** 스테이지2 층 중심 y(스테이지1 동일 층 기준). */
  private lot2FloorY(level: number): number {
    return this.lot2FloorRef(level).y;
  }

  /**
   * 스테이지2 한 층 렌더 — 아트(up_Slitare_BG_02_NN) + 점원(홀수=우·짝수=좌) + 유리팬스. built=false 면 숨겨 둔다.
   *   depth 는 층마다 위로(타워2는 x가 달라 타워1과 겹치지 않음). 반환 objs 는 건설 연출이 등장시킨다.
   */
  private renderLot2Floor(level: number, visible: boolean): { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image } | undefined {
    const key = lot2ArtKey(level); // 1~10 = BG_02, 11~20 = BG_03(21~30F).
    if (!this.textures.exists(key)) return undefined;
    const ref = this.lot2FloorRef(level); // 통일 스택 y/depth + 층 w/h.
    const y = ref.y;
    const fw = ref.w;
    const fh = ref.h;
    const depth = ref.depth;
    const img = this.add.image(LOT2_CX, y, key).setDisplaySize(fw, fh).setDepth(depth).setVisible(visible);
    this.pinToWorld(img);
    let char: Phaser.GameObjects.Image | undefined;
    const chKey = lot2ClerkKey(level); // 1~10 = Chr_02, 11~20 = Chr_03.
    if (this.textures.exists(chKey)) {
      const side = level % 2 === 1 ? 1 : -1; // 홀수=우, 짝수=좌.
      char = this.add.image(LOT2_CX + side * fw * 0.22, y + fh * 0.16, chKey).setDepth(depth + 1.5).setVisible(visible);
      char.setDisplaySize(char.width * (245 / char.height), 245);
      this.pinToWorld(char);
      wireClerkTalk(this, char, themeForStage2Floor(level), 0); // 스테이지2 점포 테마 대사(서점·문구·장난감…).
    }
    // **1층은 앞 유리팬스 없음**(타워1 1층과 동일 예외). 2층+ 만 유리팬스.
    let glass: Phaser.GameObjects.Image | undefined;
    if (level !== 1 && this.textures.exists('up_Slitare_BG_Glass')) {
      glass = this.add.image(LOT2_CX, y + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(depth + 2).setVisible(visible);
      glass.setDisplaySize(690, glass.height * (690 / glass.width));
      this.pinToWorld(glass);
      if (char) char.setDepth(glass.depth - 0.5); // 점원=유리 바로 뒤.
    }
    this.lot2FloorObjs.set(level, { img, char, glass });
    return { img, char, glass };
  }

  /** 스테이지2 지붕을 최상 건설층 위에 얹는다(층 늘 때마다 재배치). */
  private capLot2Roof(): void {
    if (this.lot2Floors < 1 || !this.textures.exists('up_Slitare_BG_roof_v2')) return;
    const ref = this.lot2FloorRef(this.lot2Floors);
    const roofY = ref.y - ref.h / 2 - LOT2_ROOF_H / 2 + LOT2_ROOF_OVERLAP; // 최상층 위(차양이 층 상단에 닿게 겹침).
    if (!this.lot2Roof) {
      this.lot2Roof = this.add.image(LOT2_CX, roofY, 'up_Slitare_BG_roof_v2').setDisplaySize(LOT2_ROOF_W, LOT2_ROOF_H);
      this.pinToWorld(this.lot2Roof);
    } else {
      this.lot2Roof.setPosition(LOT2_CX, roofY).setVisible(true);
    }
    const topDepth = this.lot2FloorObjs.get(this.lot2Floors)?.img.depth ?? 20;
    this.lot2Roof.setDepth(topDepth + 2.5); // 유리(+2)보다 위.
  }

  /** 스테이지2 'N층 건설' 버튼을 지붕 위에 배치·갱신(10층 완공 시 숨김). */
  private wireLot2BuildButton(): void {
    const next = this.lot2Floors + 1;
    if (next > LOT2_MAX_FLOORS) {
      this.lot2BuildBtn?.setVisible(false);
      return;
    }
    const ref = this.lot2FloorRef(this.lot2Floors);
    const roofTop = this.lot2Roof ? this.lot2Roof.y - this.lot2Roof.displayHeight / 2 : ref.y - ref.h / 2;
    const by = roofTop - 30 - 66;
    const reqLevel = lot2FloorLevelReq(next);
    const locked = loadSave().level < reqLevel;
    const label = locked ? `${next}층 건설\n🔒 레벨 ${reqLevel}` : `${next}층 건설\n💎 ${diamondCostFor(next)}`; // 업그레이드 다이아 비용 표시.
    if (!this.lot2BuildBtn) {
      this.lot2BuildBtn = this.makeLotButton(LOT2_CX, by, label, () => this.buildLot2Next());
    } else {
      this.lot2BuildBtn.setPosition(LOT2_CX, by).setVisible(true);
      const t = this.lot2BuildBtn.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      t?.setText(label);
    }
  }

  /** 카메라를 스테이지2 특정 층으로 부드럽게 팬(스테이지2 세로 범위 내 클램프). */
  private panToLot2Floor(level: number, dur: number): void {
    const cam = this.cameras.main;
    const y = Phaser.Math.Clamp(this.lot2FloorY(level) - this.camH() * 0.55, this.scrollMinYFor(true), this.scrollMax);
    cam.pan(LOT2_CX, y + this.camH() / 2, dur, 'Sine.easeInOut');
  }

  /** 한 층을 위에서 내려오며 페이드인(건설감) + 점원/유리 등장. */
  private raiseLot2Floor(objs: { img: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image; glass?: Phaser.GameObjects.Image }, _level: number): void {
    const y = objs.img.y; // 렌더된 안착 y(하단 연장 오프셋 반영).
    objs.img.setAlpha(0).setVisible(true);
    objs.img.y = y - 60;
    this.tweens.add({ targets: objs.img, y, alpha: 1, duration: 700, ease: 'Back.easeOut' });
    for (const o of [objs.char, objs.glass]) {
      if (!o) continue;
      o.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 700, delay: 250 });
    }
    if (objs.char) this.time.delayedCall(750, () => objs.char && this.animateClerk(objs.char));
  }

  /**
   * **우측 부지 1층 건설(스테이지2 시작)** — 화면을 타워2로 팬하고 서점(1층) 아트+점원을 세운다.
   *   이후 지붕 위 'N층 건설' 버튼으로 1번 스테이지와 **동일한 개념**으로 2~10층을 쌓는다.
   */
  private buildLot2Floor1(): void {
    if (this.lot2Built) return;
    void ensureAssetGroup(this, 'lot2').then(() => { if (this.scene.isActive()) this.buildLot2Floor1Now(); }); // 아트 도착 뒤.
  }

  private buildLot2Floor1Now(): void {
    if (this.lot2Built) return;
    const reqLevel = lot2FloorLevelReq(1);
    const sv = loadSave();
    if ((sv.level ?? 1) < reqLevel) {
      this.toast(`🔒 레벨 ${reqLevel} 필요`);
      return;
    }
    const cost = diamondCostFor(1);
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.lot2Built = true;
    this.lot2Floors = 1;
    // 매입/힌트 버튼 + 표지판 + 간판 제거(방어 — 보통 철거 시 이미 제거됨).
    for (const o of [this.lot2Btn, this.lot2Hint, this.lot2ForSale, this.lot2Sign, this.lot2SignMsg]) {
      if (o) this.tweens.add({ targets: o, alpha: 0, duration: 400, onComplete: () => o.destroy() });
    }
    this.lot2Btn = undefined;
    this.lot2Hint = undefined;
    this.lot2ForSale = undefined;
    this.lot2Sign = undefined;
    this.lot2SignMsg = undefined;
    sfx('button');
    const objs = this.renderLot2Floor(1, false);
    if (objs) this.raiseLot2Floor(objs, 1);
    this.constructFx(LOT2_CX, LOT2_FLOOR1_Y, LOT2_FLOOR_W); // 건설 연출(2단계 도구+먼지).
    this.capLot2Roof();
    this.wireLot2BuildButton();
    this.addLot2Customer(1); // 스테이지2 손님(stage=2 아이템).
    const dsv = loadSave();
    dsv.diamonds = Math.max(0, (dsv.diamonds ?? 0) - cost); // 다이아 차감.
    writeSave(dsv);
    this.refreshHomeDiamond();
    this.saveLot2(); // 임시저장.
    this.panToLot2Floor(1, 1100); // 타워2 1층 프레이밍(우측으로 이동).
    this.toast('🏗️ 2번 스테이지 1층(서점) 건설!', true);
  }

  /**
   * 스테이지2 다음 층 건설 — **1번 스테이지 runConstruction 과 동일한 연출**:
   *   ①줌아웃+포커스 상향(크레인 드러남)·옛 지붕 걷힘 → ②새 층·유리가 위에서 바운스 낙하(쿵+연기)
   *   → ③지붕 재-캡·크레인 퇴장 → ④점원 등장 → ⑤원래 줌 복귀+새 층 포커스 → ⑥완료.
   */
  private buildLot2Next(): void {
    if (this.constructing) return;
    void ensureAssetGroup(this, 'lot2').then(() => { if (this.scene.isActive()) this.buildLot2NextNow(); }); // 아트 도착 뒤.
  }

  private buildLot2NextNow(): void {
    if (this.constructing) return;
    const next = this.lot2Floors + 1;
    if (next > LOT2_MAX_FLOORS) return;
    const reqLevel = lot2FloorLevelReq(next);
    const sv = loadSave();
    if ((sv.level ?? 1) < reqLevel) {
      this.toast(`🔒 레벨 ${reqLevel} 필요`);
      return;
    }
    // **업그레이드 다이아 비용** — 부족하면 차단.
    const cost = diamondCostFor(next);
    if ((sv.diamonds ?? 0) < cost) {
      sfx('build_fail');
      this.toast(`💎 다이아가 부족해요 (필요 ${cost})`);
      return;
    }
    this.constructing = true;
    this.lot2Floors = next;
    const dsv = loadSave();
    dsv.diamonds = Math.max(0, (dsv.diamonds ?? 0) - cost); // 다이아 차감.
    writeSave(dsv);
    this.refreshHomeDiamond();
    this.saveLot2(); // 임시저장(건설 확정).
    this.lot2BuildBtn?.setVisible(false); // 연출 중 버튼 숨김.

    const cam = this.cameras.main;
    const z0 = cam.zoom;
    const idleY = cam.midPoint.y;
    const ref = this.lot2FloorRef(next);
    const fh = ref.h;
    const fw = ref.w;
    const depth = 16 + next * 3;
    const node = { w: fw, h: fh };
    const objs = this.renderLot2Floor(next, false); // 숨긴 채 준비.
    if (!objs) {
      this.constructing = false;
      return;
    }
    const bld = objs.img;
    const finalY = bld.y; // 안착 y(=ref.y).
    const glassObj = objs.glass;
    const glassFinalY = glassObj?.y;
    const charObj = objs.char;
    const charFinalY = charObj?.y;
    const roof = this.lot2Roof;
    const crane = this.craneImg;

    // 크레인을 새 층 위(스테이지2 타워)로 배치.
    if (crane) {
      crane.x = LOT2_CX - crane.displayWidth * (HOOK_RATIO.x - 0.5);
      crane.y = finalY - LIFT_HOOK - crane.displayHeight * (HOOK_RATIO.y - 0.5);
      crane.setVisible(true).setAlpha(0);
    }

    sfx('button');
    // ① 줌아웃 + 포커스 상향(크레인 드러남) + 옛 지붕 걷힘 + 크레인 페이드인.
    const conZoom = Math.max(z0 * MIN_CAMERA_ZOOM, this.minZoomForGround(idleY - this.camH() / 2));
    cam.zoomTo(conZoom, 820, 'Sine.easeInOut');
    cam.pan(LOT2_CX, idleY - 220, 820, 'Sine.easeInOut');
    if (crane) this.tweens.add({ targets: crane, alpha: 1, duration: 460, ease: 'Sine.easeOut' });
    if (roof) this.tweens.add({ targets: roof, y: roof.y - 200, alpha: 0, duration: 460, ease: 'Sine.easeIn' });

    // ② 새 층·유리 낙하(바운스) + 케이블 + 쿵 + 가로 연기.
    this.time.delayedCall(900, () => {
      bld.setAlpha(0).setVisible(true);
      bld.y = finalY - FLOOR_LIFT;
      this.tweens.add({ targets: bld, alpha: 1, duration: 200 });
      if (glassObj && glassFinalY != null) {
        glassObj.setAlpha(0).setVisible(true);
        glassObj.y = glassFinalY - FLOOR_LIFT;
        this.tweens.add({ targets: glassObj, alpha: 1, duration: 200 });
        this.tweens.add({ targets: glassObj, y: glassFinalY, duration: 780, ease: 'Bounce.easeOut' });
      }
      this.cablesGfx?.setVisible(true).setAlpha(1);
      this.tweens.add({
        targets: bld,
        y: finalY,
        duration: 780,
        ease: 'Bounce.easeOut',
        onUpdate: () => this.redrawCables(bld, node),
        onComplete: () => {
          cam.shake(240, 0.01); // 쿵.
          sfx('build');
          this.emitSmokeBand(LOT2_CX, finalY + fh * 0.5, fw * 0.92, depth + 3);
          this.tweens.add({ targets: this.cablesGfx, alpha: 0, duration: 240, onComplete: () => this.cablesGfx?.clear().setVisible(false).setAlpha(1) });
        },
      });
    });

    // ③ 지붕 재-캡(새 최상층) + 크레인 퇴장.
    this.time.delayedCall(1860, () => {
      this.capLot2Roof();
      const r = this.lot2Roof;
      if (r) {
        const ry = r.y;
        r.setAlpha(1);
        r.y = ry - 170;
        this.tweens.add({ targets: r, y: ry, duration: 440, ease: 'Bounce.easeOut' });
      }
      if (crane) this.tweens.add({ targets: crane, alpha: 0, y: crane.y - 60, duration: 480, ease: 'Sine.easeIn', onComplete: () => crane.setVisible(false) });
    });

    // ④ 점원 등장(살짝 튀어오르며) + idle 애니.
    this.time.delayedCall(2360, () => {
      if (charObj && charFinalY != null) {
        charObj.setAlpha(0).setVisible(true);
        charObj.y = charFinalY - 44;
        this.tweens.add({ targets: charObj, y: charFinalY, alpha: 1, duration: 340, ease: 'Back.easeOut', onComplete: () => this.animateClerk(charObj) });
      }
    });

    // ⑤ 원래 줌 복귀 + 새 층 포커스.
    this.time.delayedCall(2760, () => {
      cam.zoomTo(z0, 1400, 'Sine.easeInOut');
      const target = Phaser.Math.Clamp(finalY - this.camH() * 0.55, this.scrollMinYFor(true), this.scrollMax);
      cam.pan(LOT2_CX, target + this.camH() / 2, 1400, 'Sine.easeInOut');
    });

    // ⑥ 완료(버튼 재배선·손님 추가·잠금 해제).
    this.time.delayedCall(4400, () => {
      this.wireLot2BuildButton();
      this.addLot2Customer(next);
      this.constructing = false;
      if (next >= LOT2_MAX_FLOORS) {
        this.unlockHotel(); // 2번 라인 20/20 완공 → 호텔 잠금 해제(재진입 없이 즉시).
        this.toast('🏙️ 2번 스테이지 완공! 호텔이 해금됐어요', true);
      }
    });
  }

  /**
   * **호텔 부지 구입 잠금 해제**(2번 라인 20층 완공 시) — 잠긴 간판 문구를 '구입 가능'으로 바꾸고
   *   구입 버튼을 켠다. `unlockLots()`(메인타워 완공 → lot2/사이드 부지)와 같은 패턴. 재진입 없이 즉시 반영.
   */
  private unlockHotel(): void {
    if (!this.hotelUnlocked() || this.hotelBuilt || !this.hotelRuin || this.hotelBtn) return;
    if (loadSave().sideDemolished?.R2) return; // 이미 철거된 빈 부지 — buildLot3Floor1Now 가 레벨을 직접 확인.
    (this.hotelSignMsg as Phaser.GameObjects.Text | undefined)?.setText(this.hotelSignMessage());
    this.showLot3BuyButton();
  }

  /** 스테이지2 층에 손님 스팟 추가(stage=2 → 그 층 아이템 세트). 전역 스포너(customerSpots)가 랜덤 등장시킴. */
  private addLot2Customer(level: number): void {
    const objs = this.lot2FloorObjs.get(level);
    if (!objs || this.customerSpots.some((s) => s.stage === 2 && s.floor === level)) return;
    const ref = this.lot2FloorRef(level);
    const side = level % 2 === 1 ? 1 : -1; // 점원 위치(홀=우) → 손님은 반대편.
    const clerk = objs.char;
    const groundY = clerk ? clerk.y + clerk.displayHeight * (1 - clerk.originY) : ref.y + ref.h * 0.4;
    const depth = objs.glass ? objs.glass.depth - 0.3 : objs.img.depth + 1.8;
    this.customerSpots.push({
      entryX: LOT2_CX - side * ref.w * 0.22, // 점원 반대편 끝자리.
      centerX: LOT2_CX,
      groundY,
      height: 233 * 0.92,
      depth,
      floor: level,
      stage: 2,
      coinYield: visitYieldFor(level), // 스테이지2 도 층별 수익성 동일 곡선.
    });
  }

  /**
   * **접지 그림자 배치** — 현재 배치된 건물(타워 base)·가로등·소화전·화분 발밑에 부드러운 타원 그림자.
   *   소품은 자기 depth 바로 뒤, 건물은 소품보다 뒤(지면 레이어)로 깔아 소품이 그림자 위에 서게 한다.
   *   (자동차 그림자는 이동을 따라야 하므로 cars.ts 에서 컨테이너에 함께 붙인다.)
   */
  private applyPropShadows(idx: LayoutIndex): void {
    const pick = (re: RegExp): Phaser.GameObjects.Image[] =>
      idx.entries().filter((e) => re.test(e.node.name ?? '')).map((e) => e.obj as Phaser.GameObjects.Image);

    for (const o of pick(/가로등/)) this.pinToWorld(addContactShadow(this, o, { widthScale: 1.05, thickness: 0.5, alpha: 0.5, lift: 0.42 }));
    for (const o of pick(/소화전/)) this.pinToWorld(addContactShadow(this, o, { widthScale: 1.3, thickness: 0.55, alpha: 0.52, lift: 0.5 }));
    for (const o of pick(/화분/)) this.pinToWorld(addContactShadow(this, o, { widthScale: 1.2, thickness: 0.45, alpha: 0.52, lift: 0.48 }));

    // 건물 = 타워 최하층(가장 아래) base. **건물(d16) 폭과 같으면 건물 뒤에 가려지므로**, 건물보다 조금 넓게 +
    //   base 아래(보도) 로 내려(lift 음수) 보도에 드리운 부분이 보이게 한다. depth 는 소품보다 뒤(6.5).
    let base: { obj: Phaser.GameObjects.Image; y: number } | undefined;
    for (const f of this.towerFloors) {
      const o = f.obj as Phaser.GameObjects.Image;
      if (o.visible && (!base || f.node.y > base.y)) base = { obj: o, y: f.node.y };
    }
    if (base) this.pinToWorld(addContactShadow(this, base.obj, { widthScale: 1.12, thickness: 0.13, alpha: 0.4, lift: -0.35, depth: 6.5 }));
  }

  /**
   * 줌아웃이 **도로(지면) 바닥 아래를 드러내지 않는 최소 줌** — 뷰포트 바닥(월드)이 groundBottom 을 넘지 않게.
   *   뷰포트 바닥 = (scrollY + H/2) + (H/2)/z ≤ groundBottom → z ≥ (H/2)/(groundBottom - scrollY - H/2).
   *   지면 근처(scrollY≈scrollMax)에선 ≈1(줌아웃 거의 없음), 위로 올라갈수록 여유가 생겨 줌아웃 허용.
   */
  private minZoomForGround(scrollY: number): number {
    const denom = this.groundBottom() - scrollY - this.camH() / 2;
    if (denom <= 0) return 1;
    return Math.min(1, this.camH() / 2 / denom);
  }

  /**
   * **원경 하단 화면 바닥 고정** — 원경은 패럴랙스로 거의 안 움직이지만, 스크롤 전 범위에서 이미지 바닥이
   *   화면 밑(H) 아래에 **항상** 머물러야 한다(하단 경계선/틈 노출 방지). scrollFactor 를 고려한 최소 필요 바닥
   *   = scrollMax*factor + H + 여유 를 **반드시 충족**하도록 부족할 때만 아래로 연장(상단 고정). 이미 충분하면 손대지 않아
   *   신장 0. 낮은 패럴랙스(0.0008)+도로 기준 scrollMax 라 실제 신장은 수 px 수준.
   */
  /**
   * **하늘·원경을 좌우로 이어 붙인다**(화면이 넓어질 때 가장자리가 비지 않도록).
   *
   * 이 두 레이어는 near-fixed 패럴랙스(하늘 0.02·원경 0.04)라 카메라를 거의 안 따라간다.
   * 그래서 캔버스가 넓어지거나 부지를 좌우로 팬하면 저작 폭 밖이 그대로 빈 하늘색/검정으로 드러난다.
   * 확대(cover)로 때우면 그림이 뭉개지고 세로도 같이 커지므로, **원본 배율 그대로 옆으로 반복**한다.
   *
   * 이음매는 **좌우 반전 반복**(mirror tiling)으로 없앤다 — 한 칸 건너 뒤집으면 맞닿는 변이 항상
   * 같은 픽셀이라 경계선이 생기지 않는다. 그림이 가로로 이어지도록 저작돼 있지 않아도 안전하다.
   */
  private tileBackdropLayers(idx: LayoutIndex): void {
    const camW = this.camW();
    // 좌우 팬으로 도달 가능한 스크롤 범위 — 스테이지 목록에서 직접 유도(scrollMinX/MaxX 확정 순서에 의존하지 않게).
    const scrolls = [0, ...STAGE_CX.map((cx) => scrollXForCenter(cx, camW))];
    const minS = Math.min(...scrolls);
    const maxS = Math.max(...scrolls);
    for (const e of idx.entries()) {
      if (!/원경|하늘/.test(e.node.name ?? '')) continue;
      this.repeatLayerX(e.obj as Phaser.GameObjects.Image, minS, maxS, camW);
    }
  }

  /**
   * 한 레이어를 필요한 만큼 좌우로 복제한다(반전 반복).
   *
   * ⚠️ **가장자리를 잘라내야 한다.** 원경 그림은 좌우 끝 몇 픽셀이 어둡다(건물 실루엣의 끝단).
   *   그냥 이어 붙이면 뒤집힌 이웃의 어두운 변이 맞닿아 **화면을 세로로 가르는 검은 선**이 된다
   *   (실측 2026-08-22, 캔버스 1420폭). 양끝을 소스 기준 EDGE_CROP 만큼 잘라내고, 남은 폭끼리
   *   OVERLAP 만큼 겹쳐 서브픽셀 틈까지 없앤다.
   */
  private repeatLayerX(img: Phaser.GameObjects.Image, minS: number, maxS: number, camW: number): void {
    const w = img.displayWidth;
    const srcW = img.frame?.width ?? 0;
    if (!(w > 0) || !(srcW > 0)) return;
    const f = img.scrollFactorX;
    // scrollFactor f 인 레이어가 화면에 보이는 월드 x 구간 = [scrollX·f, scrollX·f + 화면폭].
    const needLeft = minS * f;
    const needRight = maxS * f + camW;
    const sx = w / srcW; // 월드 px per 소스 px.
    const crop = Math.min(EDGE_CROP, Math.floor(srcW / 8));
    const inset = crop * sx; // 잘라낸 만큼 스프라이트 좌우가 비어 보인다(위치 계산에 반영).
    const visW = w - inset * 2; // 실제로 그려지는 폭.
    const step = visW - TILE_OVERLAP;
    if (!(step > 0)) return;
    this.cropEdges(img, crop);
    const spriteLeft = img.x - w * img.originX;
    let visLeft = spriteLeft + inset;
    let visRight = visLeft + visW;
    const MAX_TILES = 8; // 폭주 방지(정상값은 1~2).
    for (let i = 1; i <= MAX_TILES && visLeft > needLeft; i += 1) {
      visLeft -= step;
      this.cloneLayerX(img, visLeft - inset + w * img.originX, i % 2 === 1, crop);
    }
    for (let i = 1; i <= MAX_TILES && visRight < needRight; i += 1) {
      // 다음 타일의 **보이는 왼쪽 끝** = 지금 오른쪽 끝에서 겹침만큼 앞으로.
      this.cloneLayerX(img, visRight - TILE_OVERLAP - inset + w * img.originX, i % 2 === 1, crop);
      visRight += step;
    }
    if (this.farHaze && img.depth < this.farHaze.depth && Math.abs(img.y - this.farHaze.y) < img.displayHeight) {
      this.farHaze.setPosition((visLeft + visRight) / 2, this.farHaze.y);
      this.farHaze.setSize(visRight - visLeft, this.farHaze.height);
    }
  }

  /** 좌우 끝 `crop` 소스픽셀을 잘라낸다(세로는 그대로). */
  private cropEdges(img: Phaser.GameObjects.Image, crop: number): void {
    const fr = img.frame;
    if (!fr || crop <= 0) return;
    img.setCrop(crop, 0, fr.width - crop * 2, fr.height);
  }

  /** 배경 레이어 복제본 1장 — 텍스처·배율·깊이·패럴랙스를 그대로 승계한다. */
  private cloneLayerX(src: Phaser.GameObjects.Image, x: number, mirror: boolean, crop: number): void {
    const c = this.add
      .image(x, src.y, src.texture.key, src.frame?.name)
      .setOrigin(src.originX, src.originY)
      .setDisplaySize(src.displayWidth, src.displayHeight)
      .setDepth(src.depth)
      .setAlpha(src.alpha)
      .setScrollFactor(src.scrollFactorX, src.scrollFactorY);
    c.setFlipX(mirror !== src.flipX);
    this.cropEdges(c, crop);
    this.pinToWorld(c);
  }

  private coverFarBackground(idx: LayoutIndex): void {
    const far = idx.entries().find((e) => /원경/.test(e.node.name ?? ''))?.obj as
      | Phaser.GameObjects.Image
      | undefined;
    if (!far || !Number.isFinite(this.scrollMax)) return;
    const FAR_DROP = 70; // 원경을 약간 아래로 배치(사용자 요청) — 상단은 하늘이 덮어 여유 있음.
    far.y += FAR_DROP;
    const factor = Math.max(0, far.scrollFactorY);
    // 원경은 near-fixed(factor≈0)라 **줌아웃 시 화면 중심 기준으로 수축** → 바닥이 위로 뜬다.
    //   가장 깊은 줌아웃(MIN_CAMERA_ZOOM)에서도 원경 바닥이 화면 밑(H)을 덮으려면 월드 바닥 ≥ (H/2)(1+1/zoom).
    //   스크롤 항(scrollMax*factor)은 미미하지만 함께 취해 더 안전한 쪽으로. +여유 80.
    const zoomBottom = (this.camH() / 2) * (1 + 1 / MIN_CAMERA_ZOOM);
    const needBottom = Math.max(this.scrollMax * factor + H, zoomBottom) + 80;
    const topEdge = far.y - far.displayHeight / 2; // 상단은 고정(위로는 이미 충분히 덮음).
    const curBottom = far.y + far.displayHeight / 2;
    if (curBottom < needBottom) {
      const newH = needBottom - topEdge;
      far.displayHeight = newH; // 부족분만 아래로 연장(scaleY 증가).
      far.y = topEdge + newH / 2; // 상단 고정 유지.
    }
    this.hazeFarBackground(far); // 원경이 너무 선명하지 않게 뿌연(haze) 오버레이.
  }

  /**
   * **원경 흐림(haze)** — 원경이 너무 또렷하게 드러나지 않도록 그 앞에 옅은 반투명 안개막을 깐다.
   *   원경과 **같은 near-fixed 패럴랙스**로 붙여 함께 움직이고, depth 는 원경 바로 앞(중경/도로보다 뒤).
   *   블러 대신 흰빛 오버레이(대기원근·헤이즈)로 대비/채도를 낮춰 원근감을 준다(성능·호환 안전).
   */
  private hazeFarBackground(far: Phaser.GameObjects.Image): void {
    const b = far.getBounds();
    const haze = this.add
      .rectangle(b.centerX, b.centerY, b.width, b.height, 0xdfe8f2, 0.28)
      .setDepth((far.depth ?? 2) + 0.1)
      .setScrollFactor(far.scrollFactorX, far.scrollFactorY)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.pinToWorld?.(haze); // 월드(mainCam) 레이어로 — uiCam 누수 방지.
    this.farHaze = haze; // 원경을 좌우로 이어 붙이면 헤이즈도 같이 넓혀야 한다(tileBackdropLayers).
  }

  /**
   * 에디터 저작 **점포매입/건설 버튼**(2026-07-19 재설계) 배선 + depth 정정.
   *   디자이너가 버튼을 **하나만**(layer_8_copy) 다시 만들어 매입·건설 두 상태에서 재사용한다("이 점포매입
   *   버튼을 건설버튼으로도 사용합니다" PO 지시) — 예전엔 층별로 버튼 3개(layer_8_copy/2/3)를 미리 깔아두고
   *   그중 하나를 골라 썼지만, 이제 버튼 1개 + 라벨(layer_10) + 고정 비용 표시(코인 아이콘 layer_8_copy4·
   *   "1.5K" layer_10_copy3·다이아 아이콘 layer_8_copy5·"20" layer_10_copy4, STORE_ACQUIRE_COST)를
   *   대상 층 자리(매입) 또는 지붕 위(건설)로 매번 옮겨 그린다.
   *   - 손님/말풍선/코인이 (floorDepth+1.8 ~ +50) 이라 depth 12~37 버튼을 **앞에서 가리던 문제** →
   *     버튼·라벨 depth 를 손님 코인(최대 floorDepth+50) 위로 올린다(월드 오브젝트 유지=타워와 함께 스크롤).
   */
  private wireStoreButtons(idx: LayoutIndex): void {
    const BTN_LIFT = 110; // 손님 코인(floorDepth+50, 최대 ~64) 위로 확실히.
    const btn = idx.tryById<Phaser.GameObjects.Image>('layer_8_copy');
    const btnNode = idx.nodeById('layer_8_copy');
    if (!btn || !btnNode) return;
    const title = idx.tryById<Phaser.GameObjects.Text>('layer_10');
    const titleNode = idx.nodeById('layer_10');
    const coinIcon = idx.tryById<Phaser.GameObjects.Image>('layer_8_copy4');
    const coinIconNode = idx.nodeById('layer_8_copy4');
    const coinText = idx.tryById<Phaser.GameObjects.Text>('layer_10_copy3');
    const coinTextNode = idx.nodeById('layer_10_copy3');
    const gemIcon = idx.tryById<Phaser.GameObjects.Image>('layer_8_copy5');
    const gemIconNode = idx.nodeById('layer_8_copy5');
    const gemText = idx.tryById<Phaser.GameObjects.Text>('layer_10_copy4');
    const gemTextNode = idx.nodeById('layer_10_copy4');

    const d = (btnNode.depth ?? 0) + BTN_LIFT; // depth 정정 — 손님 위로(부속 요소는 버튼보다 위).
    btn.setDepth(d);
    title?.setDepth(d + 1);
    coinIcon?.setDepth(d + 1);
    gemIcon?.setDepth(d + 1);
    coinText?.setDepth(d + 2);
    gemText?.setDepth(d + 2);

    // 부속 요소는 버튼(layer_8_copy) 저작 위치 대비 **상대 오프셋**을 유지한 채로 함께 옮겨 다닌다.
    const rel = (node: LayoutEntry['node'] | undefined): { dx: number; dy: number } =>
      node ? { dx: node.x - btnNode.x, dy: node.y - btnNode.y } : { dx: 0, dy: 0 };
    const titleRel = rel(titleNode);
    const coinIconRel = rel(coinIconNode);
    const coinTextRel = rel(coinTextNode);
    const gemIconRel = rel(gemIconNode);
    const gemTextRel = rel(gemTextNode);
    const moveTo = (bx: number, by: number): void => {
      btn.setPosition(bx, by);
      title?.setOrigin(0.5).setPosition(bx + titleRel.dx, by + titleRel.dy).setAlign('center');
      coinIcon?.setPosition(bx + coinIconRel.dx, by + coinIconRel.dy);
      coinText?.setOrigin(0.5).setPosition(bx + coinTextRel.dx, by + coinTextRel.dy);
      gemIcon?.setPosition(bx + gemIconRel.dx, by + gemIconRel.dy);
      gemText?.setOrigin(0.5).setPosition(bx + gemTextRel.dx, by + gemTextRel.dy);
    };
    // 비용 표시 — **대상 층의 비용**(층당 +0.5K, PO 2026-07-29). 층을 안 넘기면 1층 기준.
    const setCostVisible = (visible: boolean, floor = 1): void => {
      const cost = storeAcquireCostFor(floor);
      coinIcon?.setVisible(visible);
      coinText?.setVisible(visible).setText(cost.coins >= 1000 ? `${(cost.coins / 1000).toLocaleString()}K` : `${cost.coins}`);
      gemIcon?.setVisible(visible);
      gemText?.setVisible(visible).setText(`${cost.diamonds}`);
    };

    this.atMaxFloor = this.builtFloors >= MAX_FLOORS; // 프레이밍 상단 여백을 크게(공간 확보).
    // **개념**: 건설된(보이는) 미소유 층이 있으면 그 층 **점포매입**(그 층 자리), 없으면 다음 미건설 층 **건설**(지붕 위).
    const purchaseStep = this.ownedFloors < this.builtFloors;
    const complete = !purchaseStep && this.builtFloors >= MAX_FLOORS;

    btn.removeAllListeners('pointerdown');
    this.buildStoreBtn = btn;
    this.buildStoreLabel = title;

    if (complete) {
      btn.setVisible(false);
      title?.setVisible(false);
      setCostVisible(false);
      btn.disableInteractive();
      return;
    }

    if (purchaseStep) {
      // ── **점포매입** — 대상 층의 저작 슬롯 위치(layer_2* 층 자리) 기준 버튼 표시. ──
      const target = this.ownedFloors + 1;
      const floorEntry = this.towerFloors[target - 1];
      const bx = floorEntry ? floorEntry.node.x : btnNode.x;
      const by = floorEntry ? floorEntry.node.y + (btnNode.y - (this.towerFloors[1]?.node.y ?? btnNode.y)) : btnNode.y;
      moveTo(bx, by);
      title?.setText(`${target}층 점포매입`).setFontSize(38).setLineSpacing(0);
      setCostVisible(true, target);
      btn.setAlpha(1).setVisible(true).setInteractive({ useHandCursor: true });
      title?.setVisible(true);
      btn.on('pointerdown', () => this.purchaseFloor(target));
    } else {
      // ── **건설** — 다음 미건설 층. 건축 버튼을 **지붕 위**에. ──
      const target = Math.min(MAX_FLOORS, this.builtFloors + 1);
      const req = floorLevelReq(target); // **레벨 해금 요구치**(3층=10, 층당 10레벨).
      const playerLevel = loadSave().level;
      const locked = playerLevel < req;
      const roofObj = idx.entries().find((e) => /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;
      const bx = roofObj ? roofObj.x : btnNode.x;
      const by = roofObj ? roofObj.y - roofObj.displayHeight / 2 - 30 - btn.displayHeight / 2 : btnNode.y;
      moveTo(bx, by);
      // 제목은 **점포매입과 동일 타입**(한 줄, 38px) — 잠금 여부와 무관하게 항상 "N층 건설"만 표시.
      title?.setText(`${target}층 건설`).setFontSize(38).setLineSpacing(0);
      if (locked) {
        // ⚠️2026-07-19: "🔒 Lv N"을 제목에 두 번째 줄로 욱여넣던 방식(버튼 밖으로 삐져나옴)을 폐기 —
        //   **점포매입의 비용 행과 동일 타입**(제목 아래, 아이콘+숫자 한 줄)으로 자리만 재사용해 잠금 정보를
        //   표시한다. 코인/다이아 아이콘 두 개는 숨기고, 그 행의 폭 전체에 "🔒 Lv N" 한 줄만 중앙정렬.
        coinIcon?.setVisible(false);
        gemIcon?.setVisible(false);
        gemText?.setVisible(false);
        coinText
          ?.setVisible(true)
          .setOrigin(0.5)
          .setPosition(bx, by + coinTextRel.dy)
          .setFontSize(30)
          .setLineSpacing(0)
          .setText(`🔒 Lv ${req}`);
      } else {
        setCostVisible(true, target);
      }
      btn.setVisible(true).setInteractive({ useHandCursor: true });
      btn.setAlpha(locked ? 0.75 : 1);
      title?.setVisible(true);
      btn.on('pointerdown', () => {
        if (this.constructing) return;
        if (locked) {
          sfx('build_fail');
          this.toast(`🔒 레벨 ${req} 이상 필요\n(현재 레벨 ${playerLevel})`);
          return;
        }
        this.runConstruction(target, storeAcquireCostFor(target).coins);
      });
    }
  }

  /**
   * 층 **점포매입** — 이미 **건설된(보이는) 점포**를 소유한다(크레인·등장 없음). 비용 차감 + 성공 메시지 →
   *   상단 버튼이 다음 단계(**미건설 층 건설**)로 전환. (개념: 건설된 점포=매입, 미건설=건설.)
   */
  private purchaseFloor(level: number): void {
    if (this.constructing) return;
    // **점포매입 비용 = 건설과 동일**(층별 곡선, storeAcquireCostFor). 부족하면 차단.
    const cost = storeAcquireCostFor(level);
    const s = loadSave();
    if (s.coins < cost.coins || (s.diamonds ?? 0) < cost.diamonds) {
      sfx('build_fail');
      this.toast(`재화가 부족해요 (필요 🪙${cost.coins.toLocaleString()} 💎${cost.diamonds})`);
      return;
    }
    this.ownedFloors = Math.max(this.ownedFloors, level); // 소유.
    bumpMetrics({ buildCoins: cost.coins, buildDiamonds: cost.diamonds, builds: 1 }); // 일일 지표 — 점포매입.
    s.coins = Math.max(0, s.coins - cost.coins);
    s.diamonds = Math.max(0, (s.diamonds ?? 0) - cost.diamonds);
    s.ownedFloors = this.ownedFloors; // **임시저장**: 소유 상태 저장.
    writeSave(s);
    this.refreshHomeDiamond();
    this.homeHeader?.setCoins(s.coins);
    sfx('build');
    this.toast(`${level}층 점포매입 성공!\n(🪙-${cost.coins.toLocaleString()} 💎-${cost.diamonds})`, true);
    if (this.layoutIdx) this.wireStoreButtons(this.layoutIdx); // 상단 버튼 재배선(→ "3층 건설").
    this.placeContinueButton(); // 계속하기 버튼도 새로 매입한 층으로 함께 이동.
    this.panToFloor(level, 900); // 매입한 층으로 부드럽게 포커스.
  }

  /** 카메라를 특정 층으로 **부드럽게 팬**(범위 내 클램프). 매입/건설 후 새 층 안착용. */
  private panToFloor(level: number, duration: number): void {
    const entry = this.towerFloors[level - 1];
    if (!entry) return;
    const cam = this.cameras.main;
    const target = Phaser.Math.Clamp(entry.node.y - this.camH() * 0.55, this.scrollMin, this.scrollMax);
    cam.pan(W / 2, target + this.camH() / 2, duration, 'Sine.easeInOut');
    this.prevScrollY = target; // 미세줌 튐 방지.
  }

  /**
   * 배경 **패럴랙스** — 카메라(월드) 스크롤·건설 포커싱 시 레이어별로 다른 속도로 따라 올라간다.
   *   근경=빠르게(카메라 바로 따라), 원경=아주 느리게, 하늘=가장 느리게. Phaser scrollFactor 로 구현.
   *   (UI 는 uiCam 이라 무관. 배경 레이어는 월드=mainCam 렌더.)
   */
  private applyParallax(idx: LayoutIndex): void {
    // **가로/세로 계수를 분리** — 세로(타워 상승)와 가로(부지 좌우 이동)의 패럴랙스를 독립 제어.
    // ⚠️ **near-fixed 레이어 중앙정렬 보정** — 카메라는 세이프존을 가운데 놓으려고 -offset 만큼
    //   스크롤돼 있는데, scrollFactor 가 작은(≈고정) 레이어는 그 스크롤을 그만큼만 따라간다.
    //   그래서 하늘(0.02)·원경(0.04)은 사실상 제자리에 남아 넓어진 쪽 가장자리가 빈다(실측: 16:9 우상단).
    //   보정량 = offset × (1 − factor) — factor 1 이면 0(보정 불필요), 0 이면 offset 전량.
    const off = safeOffset(this);
    const set = (re: RegExp, fx: number, fy: number = fx): void => {
      for (const e of idx.entries()) {
        if (!re.test(e.node.name ?? '')) continue;
        const img = e.obj as Phaser.GameObjects.Image;
        img.setScrollFactor(fx, fy);
        img.x += off.x * (1 - fx);
        img.y += off.y * (1 - fy);
      }
    };
    // 패럴랙스 계수(scrollFactor) — 0=화면에 고정, 1=카메라와 완전히 함께. factor>0 이면 **위로 스크롤(타워 상승)
    //   할수록 원경이 화면 아래로 내려온다**(자연스러운 원근 + 하단 커버). 0.0008 은 사실상 0이라 "적용 안 됨"으로 보였음.
    const PARALLAX_NEAR = 1.0; // 근경(도로) = 타워가 선 지면 → 카메라와 함께(하단 도로 끝선 이탈 방지).
    // 중경 가로/세로 계수는 모듈 상수(PARALLAX_MID_X/Y) 사용 — 중경 도로 통행과 공유.
    //   가로: 근경보다 느리게 흘러 붙어 이동 방지(중경 노드 폭 4341px라 가장자리 안 드러남).
    //   세로: 미세하게만(도로 가시 구간 |scrollY|≲516·겹침 여유 ~80px → fm≥0.94 유지 시 침범 없음).
    const PARALLAX_FAR = 0.04; // 원경 — 타워가 올라갈수록 아래로 약간씩 이동(눈에 보이되 과하지 않게).
    const PARALLAX_SKY = 0.02; // 하늘 — 원경보다 더 느리게(가장 먼 배경).
    set(/근경|도로/, PARALLAX_NEAR); // 도로(근경) 명시 고정(기본값과 동일하지만 의도 명확화).
    set(/중경/, PARALLAX_MID_X, PARALLAX_MID_Y);
    set(/원경/, PARALLAX_FAR);
    set(/하늘/, PARALLAX_SKY);
    /*
     * **원경·하늘을 위로 키운다**(PO 2026-08-30 "윗부분 원경이 바탕색과 벗어난다 — 원경을 조금 확대").
     *   타워가 20층(우 내측 30F)이 되면서 최상단 스크롤이 y≈−8000 까지 간다. 원경은 factor 0.04 라 그만큼
     *   화면 아래로 0.04×8000≈320px 내려오고, 저작 원경(top −364)의 **윗변이 화면 안으로 들어와** 그 위 바탕색이
     *   드러났다. 밑변(지면 정렬)은 그대로 두고 **위로만** 늘린다 — 중심 스케일 뒤 늘어난 높이의 절반만큼 올린다.
     *   ⚠️ 폭도 같이 커진다(원경 1498→1798) — 좌우 여유가 생겨 넓은 캔버스에도 유리하다.
     */
    const growUp = (re: RegExp, k: number): void => {
      for (const e of idx.entries()) {
        if (!re.test(e.node.name ?? '')) continue;
        const img = e.obj as Phaser.GameObjects.Image;
        const h0 = img.displayHeight;
        img.setScale(img.scaleX * k, img.scaleY * k);
        img.y -= (img.displayHeight - h0) / 2; // 밑변 고정.
      }
    };
    growUp(/원경/, FAR_GROW);
    growUp(/하늘/, SKY_GROW);
  }

  /**
   * 타워 **위아래 드래그 스크롤** — **목표(scrollTarget)로 부드럽게 수렴**(직선 X, 가속/감속) + 관성 + **이동 중 미세 줌**.
   *   드래그는 목표만 옮기고, 카메라는 매 프레임 목표로 lerp → 시작·정지가 부드럽게 이어진다. UI 는 uiCam 이라 안 움직임.
   */
  /**
   * 카메라 **뷰포트 높이** = 캔버스 높이. 세로 스크롤 상·하한과 포커싱은 저작 높이가 아니라
   * 실제로 보이는 높이로 계산해야 한다(21:9 처럼 캔버스가 더 길어지면 지면 아래가 드러난다).
   */
  private camH(): number {
    return viewBounds(this).h;
  }

  /** 월드 카메라가 실제로 보여주는 가로 폭 — 부지 스냅·지면 타일 범위 계산의 기준. */
  private camW(): number {
    return viewBounds(this).w;
  }

  /** 스크롤 상·하한만 재계산(카메라는 건드리지 않음). */
  private computeScrollBounds(): void {
    if (!Number.isFinite(this.towerTop())) return;
    this.scrollMax = this.groundBottom() - this.camH() - BOTTOM_SAFE; // 하단 = 지면(근경 바닥) 안쪽.
    this.scrollMin = Math.min(this.scrollMax, this.buildButtonTop() - this.topMargin()); // 상단 = 버튼/지붕 위 여백.
  }

  /** 상·하한 재계산 + 현재 위치 클램프(초기/enableTowerScroll 용). */
  private updateScrollBounds(): void {
    this.computeScrollBounds();
    const cam = this.cameras.main;
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, this.scrollMin, this.scrollMax);
  }

  private enableTowerScroll(): void {
    const cam = this.cameras.main;
    if (!Number.isFinite(this.towerTop())) return;
    this.updateScrollBounds(); // 상·하한 + 초기(frameTower) 위치 클램프.
    this.scrollOn = true;
    this.updateLotArrows(); // 좌우 스테이지 이동 화살표 초기 표시 상태.
    this.scrollVel = 0;
    this.scrollTargetY = cam.scrollY;
    this.scrollTargetX = cam.scrollX;
    this.scrollBaseZoom = 1; // idle 줌 기준.
    this.prevScrollY = cam.scrollY;
    const LOCK = 14; // 축 확정 임계(px) — 이만큼 움직여야 방향 잠금.
    let lastY = 0;
    let lastX = 0;
    let startY = 0;
    let startX = 0;
    let axis: 'none' | 'x' | 'y' = 'none'; // 이 제스처의 잠긴 축(상하 or 좌우) — 한쪽만 반응.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.constructing || this.scrollSuspended) return;
      this.scrollDragging = true;
      this.scrollVel = 0;
      this.scrollVelX = 0;
      // 목표를 현재 카메라 위치에 재동기화(직전 관성/팬의 잔여로 튀지 않게).
      this.scrollTargetY = cam.scrollY;
      this.scrollTargetX = cam.scrollX;
      lastY = startY = p.y;
      lastX = startX = p.x;
      axis = 'none';
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.scrollDragging || !p.isDown || this.constructing || this.scrollSuspended) return;
      // **축 잠금**: 시작점 대비 누적 이동으로 지배 축을 정한다(정해지기 전엔 아무 것도 안 움직임 → 드리프트 방지).
      if (axis === 'none') {
        const tdx = Math.abs(p.x - startX);
        const tdy = Math.abs(p.y - startY);
        if (tdx > LOCK || tdy > LOCK) {
          if (tdx > tdy * 1.3) axis = 'x'; // 확실히 좌우일 때만 좌우.
          else if (tdy > tdx * 1.3) axis = 'y'; // 확실히 상하일 때만 상하.
          else return; // 애매하면 더 움직일 때까지 대기.
        } else {
          lastY = p.y;
          lastX = p.x;
          return;
        }
      }
      const dy = p.y - lastY;
      const dx = p.x - lastX;
      lastY = p.y;
      lastX = p.x;
      // **목표만 갱신** — 카메라는 update() 에서 목표로 부드럽게 수렴(1:1 즉시 이동의 딱딱함 제거).
      //   릴리스 관성 속도는 프레임 델타의 지수이동평균(EMA)으로 매끈하게(단일 프레임 노이즈 제거).
      if (axis === 'y') {
        this.scrollTargetY = Phaser.Math.Clamp(this.scrollTargetY - dy, this.currentScrollMinY(), this.scrollMax);
        this.scrollVel = this.scrollVel * 0.55 + -dy * 1.5 * 0.45;
      } else if (axis === 'x') {
        this.scrollTargetX = Phaser.Math.Clamp(this.scrollTargetX - dx, this.scrollMinX, this.scrollMaxX);
        this.scrollVelX = this.scrollVelX * 0.55 + -dx * 1.5 * 0.45;
      }
    });
    const stop = (): void => {
      if (this.scrollDragging && axis === 'x') this.snapToStage(); // 좌우 스와이프는 놓으면 스테이지로 스냅(확실한 이동).
      this.scrollDragging = false;
      axis = 'none';
    };
    this.input.on('pointerup', stop);
    this.input.on('pointerupoutside', stop);
  }

  /**
   * **좌우 스와이프 후 스테이지 스냅** — 릴리스 시 스와이프 속도/위치로 가까운 스테이지(scrollX 0 or LOT_DX)로 팬.
   *   빠른 스와이프면 방향대로 다음 스테이지, 느리면 가장 가까운 쪽. 좌우 관성 대신 확실한 스냅으로 "확실한 이동".
   */
  private snapToStage(): void {
    if (this.scrollMaxX <= 0 && this.scrollMinX >= 0) return;
    const cam = this.cameras.main;
    const canvasW = this.camW();
    // 스냅 대상은 **부지 중심**으로 정하고, 카메라 값은 캔버스 폭으로 유도한다 —
    //   폭이 넓어져도 부지가 화면 정중앙에 온다(logic/homeStages.ts).
    const idx = snapStageIndex(cam.scrollX, canvasW, this.scrollVelX);
    const target = Phaser.Math.Clamp(scrollXForCenter(stageCenter(idx), canvasW), this.scrollMinX, this.scrollMaxX);
    this.scrollVelX = 0; // 좌우 관성 끄고 스냅으로만.
    // 대상 스테이지의 세로 범위로 scrollY 도 함께 클램프(짧은 스테이지로 가면 아래로 내려 빈 하늘 방지).
    const y = Phaser.Math.Clamp(cam.scrollY, this.scrollMinYForScrollX(target), this.scrollMax);
    // 살짝 길고 부드러운 감속 이징 — 좌우 스테이지 전환이 딱 끊기지 않고 미끄러지듯.
    cam.pan(centerOf(target, canvasW), y + this.camH() / 2, 560, 'Cubic.easeOut');
  }

  /** 한 스테이지(LOT_DX)만큼 dir 방향으로 팬 — 좌우 스와이프 1회와 동일. 경계 밖이면 무시. */
  private panOneStage(dir: number): void {
    const cam = this.cameras.main;
    if (cam.panEffect?.isRunning || this.constructing) return;
    const canvasW = this.camW();
    const curIdx = snapStageIndex(cam.scrollX, canvasW, 0); // 속도 무시 = 가장 가까운 스테이지.
    const target = Phaser.Math.Clamp(scrollXForCenter(stageCenter(curIdx + dir), canvasW), this.scrollMinX, this.scrollMaxX);
    if (Math.abs(target - cam.scrollX) < 1) return; // 더 갈 스테이지 없음.
    this.scrollVelX = 0;
    const yy = Phaser.Math.Clamp(cam.scrollY, this.scrollMinYForScrollX(target), this.scrollMax);
    this.scrollTargetX = target;
    this.scrollTargetY = yy;
    cam.pan(centerOf(target, canvasW), yy + this.camH() / 2, 560, 'Cubic.easeOut');
  }

  /** 현재 스크롤 위치 기준으로 좌/우 스테이지 존재 여부에 따라 화살표 표시/숨김. */
  private updateLotArrows(): void {
    if (!this.leftArrow || !this.rightArrow) return;
    const sx = this.cameras.main.scrollX;
    this.leftArrow.setVisible(sx > this.scrollMinX + 2);
    this.rightArrow.setVisible(sx < this.scrollMaxX - 2);
  }

  /**
   * **부지별 사운드** — 카메라가 머무는 스테이지(-2..3, LOT_DX 배수)의 BGM 으로 전환한다.
   *   부지 전용 트랙(bgm_lot_*.m4a)이 없으면 **무음**(audio.ts가 이전 트랙 페이드아웃) — 다른 스테이지 사운드는 재생하지 않는다.
   */
  private updateStageBgm(): void {
    const idx = currentStageIndex(this.cameras.main.scrollX, this.camW());
    const name = STAGE_BGM[idx];
    if (name === this.lastStageBgm) return;
    this.lastStageBgm = name;
    playBgm(name);
  }

  /** scrollX 위치가 속한 스테이지의 세로 스크롤 상한(사이드 부지/우 내측 lot2/중앙 타워). */
  private scrollMinYForScrollX(sx: number): number {
    // **좌측 공공건물 타워 영역**(OFFICE_CX=-540) — 그 타워 높이 기준 세로 상한(5층이라 메인타워보다 높을 수 있어
    //   메인타워 기준으로 두면 위로 스크롤이 막힌다). 오피스 존을 먼저 판정.
    if (this.officeFloors.length > 0 && isOverLot(OFFICE_CX, sx, this.camW())) {
      return Math.min(this.scrollMax, this.officeTop() - this.topMargin());
    }
    if (this.lot3FloorObjs.size > 0 && isOverLot(LOT3_CX, sx, this.camW())) {
      return Math.min(this.scrollMax, this.lot3Top() - this.topMargin()); // 3번 라인 호텔 높이까지.
    }
    const side = this.sideLotForScrollX(sx);
    if (side) return this.sideStageMinY(side); // 사이드 부지(좌 내/외·우 외).
    return this.scrollMinYFor(isRightInnerSide(sx, this.camW())); // 우 내측(lot2) or 중앙(타워).
  }

  /**
   * 매 프레임 — ① 놓은 뒤 **관성(더 미끄러지듯 오래)** → ② **실제 이동 속도에 비례한 미세 줌**(움직일수록 더 축소, 멈추면 원복).
   *   드래그 중엔 손가락을 바로 따라가고(밀착), 놓으면 길게 미끄러진다. 건설 중엔 건너뜀(카메라 연출 우선).
   */
  update(): void {
    if (!this.scrollOn) return;
    const cam = this.cameras.main;
    this.updateLotArrows(); // 좌우 스테이지 존재 여부에 따라 화살표 표시/숨김(매 프레임).
    this.updateStageBgm(); // 카메라가 머무는 부지의 BGM 으로 전환(부지별 사운드).
    // 카메라 팬/줌 연출(snapToStage·panToFloor·건설) 중엔 수동 스크롤 개입 금지 — 연출이 scrollX/Y 를 소유.
    //   ⚠️ **constructing 체크보다 먼저** 목표를 카메라에 동기화한다 → 건설 완료(⑤ 층 포커스 팬) 직후
    //   낡은 목표로 되돌아가며 아래로 튀는 현상 방지(팬이 안착한 '맨 위층' 위치를 그대로 유지).
    if (cam.panEffect?.isRunning || cam.zoomEffect?.isRunning) {
      this.scrollTargetY = cam.scrollY;
      this.scrollTargetX = cam.scrollX;
      this.prevScrollY = cam.scrollY;
      return;
    }
    if (this.constructing) return;
    const minY = this.currentScrollMinY();
    if (this.scrollDragging) {
      // ① 드래그 — 카메라가 손가락 목표로 **부드럽게 수렴**(즉시 1:1 대신 미세 지연 → 가속/감속감).
      cam.scrollY += (this.scrollTargetY - cam.scrollY) * DRAG_FOLLOW;
      cam.scrollX += (this.scrollTargetX - cam.scrollX) * DRAG_FOLLOW;
    } else {
      // ② 관성 — 놓은 뒤 목표를 속도로 밀며 감속(길게 미끄러짐), 카메라는 목표로 수렴(정지 직전 부드럽게).
      if (Math.abs(this.scrollVel) >= 0.04) {
        const nt = Phaser.Math.Clamp(this.scrollTargetY + this.scrollVel, minY, this.scrollMax);
        if (nt === this.scrollTargetY) this.scrollVel = 0; // 경계 → 정지.
        this.scrollTargetY = nt;
        this.scrollVel *= SCROLL_FRICTION;
      } else {
        this.scrollVel = 0;
      }
      cam.scrollY += (this.scrollTargetY - cam.scrollY) * SETTLE_FOLLOW;
    }
    // ③ **이동 속도(실제 프레임 이동량)에 비례한 미세 줌** — 멈추면 원래(1)로 복귀.
    const speed = Math.abs(cam.scrollY - this.prevScrollY);
    this.prevScrollY = cam.scrollY;
    const wantZoom = this.scrollBaseZoom * (1 - Math.min(MICRO_ZOOM_OUT_MAX, speed * 0.006));
    // 줌아웃이 도로(지면) 바닥 아래를 드러내지 않도록 현재 스크롤 기준 최소 줌으로 하한 → 지면 근처선 거의 줌아웃 없음.
    const targetZoom = Math.max(wantZoom, this.minZoomForGround(cam.scrollY));
    cam.zoom += (targetZoom - cam.zoom) * 0.1;
  }

  /** 콘텐츠 **상단** = 보이는 최상단 층/지붕/건설버튼 중 가장 위(작은 y). */
  private towerTop(): number {
    let topY = Infinity;
    for (const f of this.towerFloors) {
      const o = f.obj as Phaser.GameObjects.Image;
      if (o.visible) topY = Math.min(topY, f.node.y - (f.node.h ?? 500) / 2);
    }
    const roof = this.layoutIdx?.entries().find((e) => /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;
    if (roof?.visible) topY = Math.min(topY, roof.y - roof.displayHeight / 2);
    // 건설 버튼이 **보일 때만** 상단에 포함(최상층 완공 시 버튼 숨김 → 지붕 기준으로 일정 여백).
    if (this.buildStoreBtn?.visible) topY = Math.min(topY, this.buildStoreBtn.y - this.buildStoreBtn.displayHeight / 2);
    return topY;
  }

  /** 스테이지2 콘텐츠 상단(가장 위 층/지붕/버튼). **미건설(0층)이면** 폐건물+상단 간판(있으면) 기준, 없으면 지면. */
  private lot2Top(): number {
    if (this.lot2Floors < 1) {
      let t = this.lot2Ruin ? this.lot2Ruin.y - this.lot2Ruin.displayHeight / 2 : this.groundBottom();
      if (this.lot2Sign) t = Math.min(t, this.lot2Sign.y - this.lot2Sign.displayHeight / 2); // 간판 상단까지.
      return this.lot2Ruin ? t : this.groundBottom();
    }
    let topY = Infinity;
    for (const o of this.lot2FloorObjs.values()) if (o.img.visible) topY = Math.min(topY, o.img.y - o.img.displayHeight / 2);
    if (this.lot2Roof?.visible) topY = Math.min(topY, this.lot2Roof.y - this.lot2Roof.displayHeight / 2);
    if (this.lot2BuildBtn?.visible) topY = Math.min(topY, this.lot2BuildBtn.y - 66);
    return Number.isFinite(topY) ? topY : this.groundBottom();
  }

  /** 해당 스테이지의 **세로 상한(스크롤 최소 y)** — 그 스테이지의 건설 높이 기준. 안 지어졌으면 지면(상한=바닥). */
  private scrollMinYFor(atLot2: boolean): number {
    const top = atLot2 ? this.lot2Top() : this.towerTop();
    return Math.min(this.scrollMax, top - this.topMargin());
  }

  /** 현재 카메라가 있는 스테이지 기준 세로 상한(좌/중앙/우 위치로 스테이지 판정). */
  private currentScrollMinY(): number {
    return this.scrollMinYForScrollX(this.cameras.main.scrollX);
  }

  /**
   * 스크롤 **하단 한계**(지면) = **도로(보도블록)/근경** 레이어의 바닥.
   *   이 값으로 scrollMax 를 잡아, 스크롤을 끝까지 내려도 **도로 하단이 화면 밑에서 떨어지지 않게**(그 아래 틈 방지).
   *   예전엔 최하층+300 으로 잡아 실제 도로/원경 바닥(더 얕음)보다 깊게 스크롤 → 도로·원경이 화면 바닥에서 떴다.
   */
  private groundBottom(): number {
    const grounds = this.layoutIdx?.entries().filter((e) => /도로|근경/.test(e.node.name ?? '')) ?? [];
    let bot = -Infinity;
    for (const e of grounds) {
      const o = e.obj as Phaser.GameObjects.Image;
      bot = Math.max(bot, o.y + o.displayHeight / 2);
    }
    if (Number.isFinite(bot)) return bot;
    for (const f of this.towerFloors) bot = Math.max(bot, f.node.y + (f.node.h ?? 500) / 2);
    return Number.isFinite(bot) ? bot + 300 : H;
  }

  /**
   * 도로 자동차 통행 — 디자이너가 home.json 에 배치한 **참조 차(up_Car_0N)를 숨기고**, 그 위치/크기/depth 를
   *   기준으로 애니메이션 통행(cars.ts)으로 대체한다. depth 로 **두 도로를 분리**:
   *     · 근경(하단) 도로 = depth ≥ MID_ROAD_DEPTH_MAX (자동차1·2) → 카메라와 함께(패럴랙스 없음).
   *     · 중경(뒤쪽) 도로 = depth < MID_ROAD_DEPTH_MAX (자동차3) → **중경 레이어와 같은 패럴랙스**로 얹어
   *       스크롤/부지 팬 시에도 도로에서 벗어나지 않게 한다.
   *   참조 차가 없으면 근경 바닥 기준 단일 통행으로 폴백.
   */
  private startBottomCars(idx: LayoutIndex): void {
    const MID_ROAD_DEPTH_MAX = 20; // 이 미만 depth = 배경(중경) 도로 차.
    const refs = idx.entries().filter((e) => /up_Car_0/i.test(e.node.key ?? ''));
    refs.forEach((e) => (e.obj as Phaser.GameObjects.Image).setVisible(false)); // 참조 차는 숨김.
    const roadYOf = (list: typeof refs): number => Math.max(...list.map((e) => (e.node.y ?? 0) + (e.node.h ?? 0) / 2));
    const widthOf = (list: typeof refs): number => Math.max(...list.map((e) => e.node.w ?? 430));
    const depthOf = (list: typeof refs): number => Math.max(...list.map((e) => e.node.depth ?? 39));

    const near = refs.filter((e) => (e.node.depth ?? 0) >= MID_ROAD_DEPTH_MAX); // 근경(하단) 도로.
    const mid = refs.filter((e) => (e.node.depth ?? 0) < MID_ROAD_DEPTH_MAX); // 중경(뒤쪽) 도로.

    // **전체 주행 범위** — 최좌 스테이지 화면 좌단(scrollMinX) ~ 최우 스테이지 화면 우단(scrollMaxX+W).
    //   차량이 **왼쪽 끝에서 오른쪽 끝까지** 지나가고 중간에 사라지지 않도록 전 부지 폭을 덮는다.
    const worldMinX = this.scrollMinX;
    const worldW = this.scrollMaxX + this.camW() - this.scrollMinX;

    // 도로 구성 — 근경(하단)·중경(뒤쪽). **한 번에 한 대만, 매번 랜덤 도로**로 나오게 하나의 컨트롤러에 넘긴다.
    const roads: CarTrafficOpts[] = [];
    if (near.length > 0) {
      /*
       * **근경(하단) 도로 차는 모든 건물 위**(PO 2026-08-31 "차량 상단이 건물에 가려짐"). 예전엔 저작 참조 차의
       *   depth(≈39)를 그대로 썼는데, 층 depth 를 역순(아래층이 앞: 1층 = BASE+20×STEP = 70)으로 바꾼 뒤
       *   1·2번 라인 저층이 차 위를 덮었다. 하단 도로는 건물보다 **앞**(화면 제일 아래)이므로 층 최대치 위로 올린다.
       */
      const nearDepth = Math.max(depthOf(near), FLOOR_DEPTH_BASE + (LOT2_MAX_FLOORS + 1) * FLOOR_DEPTH_STEP + 2);
      roads.push({ roadY: roadYOf(near), depth: nearDepth, width: widthOf(near), worldMinX, worldW });
    }
    /*
     * **중경(뒤쪽·2번 차선) 도로는 건물 뒤**(PO 2026-08-31 2차: "1번 차선은 상위 레이어가 맞으나 2번 차선은
     *   건물 뒤편으로") — 먼 배경 건물 앞·타워 뒤. 원근이 그렇게 읽혀야 두 차선이 구분된다.
     *   ⚠️ 1번(근경) 차선만 건물 위(nearDepth)다 — 둘을 같은 규칙으로 묶지 말 것.
     */
    if (mid.length > 0) {
      roads.push({ roadY: roadYOf(mid), depth: MID_ROAD_CAR_DEPTH, width: widthOf(mid), worldMinX, worldW });
    }
    if (roads.length === 0) {
      // 참조 차가 전혀 없을 때만 폴백(근경 바닥).
      roads.push({ roadY: this.groundBottom() - 80, depth: 4, width: 300, worldMinX, worldW });
    }
    // **한 대씩·랜덤 도로** — 한 대가 끝나야 다음 대(랜덤 도로)가 나온다 → 앞/뒤 동시 등장 없음.
    startRoadsTraffic(this, roads);
  }

  /** 건설 버튼 상단 y(버튼이 보일 때만; 최상층 완공 등 숨김 시 최상층/지붕 기준). 프레이밍·스크롤 상한 기준. */
  private buildButtonTop(): number {
    // towerTop 이 이미 **보이는 건설 버튼**을 포함(건설=지붕 위 버튼이 최상단, 매입=버튼이 층 위라 지붕이 최상단).
    return this.towerTop();
  }

  /**
   * 상단 여백 — 최상층 완공 시엔 넉넉히(MAX_TOP_MARGIN), 그 외엔 HEADER_MARGIN.
   * 단, **미션 리워드 배너 아래**를 항상 확보한다(배너가 내려간 만큼 여백도 같이 커진다).
   */
  private topMargin(): number {
    return this.topMarginFor(this.atMaxFloor);
  }

  /** 배너 오프셋(캐시) — 배너 생성과 카메라 프레이밍이 반드시 같은 값을 봐야 한다. */
  private missionBannerOffsetY(): number {
    if (this.bannerOffsetCache === undefined) this.bannerOffsetCache = MISSION_BANNER_TOP + topUiShift(this);
    return this.bannerOffsetCache;
  }

  /** `topMargin` 의 계산부 — 건설 연출 중엔 완공 여부가 달라지므로 인자로 받는다. */
  private topMarginFor(atMax: boolean): number {
    const base = atMax ? MAX_TOP_MARGIN : HEADER_MARGIN;
    const belowBanner = MISSION_BANNER_BOTTOM + this.missionBannerOffsetY() + BUILD_BTN_BANNER_GAP;
    return Math.max(base, belowBanner);
  }

  /**
   * 카메라(월드) idle 배치 — **항상 zoom 1(축소하지 않는다. 축소는 건설 연출 때만).**
   *   초기엔 **상단(건설 버튼/지붕) 아래 여백** 확보 + **뷰 하단이 지면(근경) 밖으로 안 나가게**.
   *   **방금 건설한 층이 있으면 그 층에 포커스**(층 중심을 화면 중상단) — 건설 후 위아래로 튀지 않고 건설된 층에 안착.
   */
  private frameTower(): void {
    const cam = this.cameras.main;
    cam.setZoom(1); // ★ idle 은 원본 배율 고정.
    if (!Number.isFinite(this.towerTop())) return;
    const bottomAligned = this.groundBottom() - this.camH() - BOTTOM_SAFE; // 지면 하단(끝선 안 넘게).
    const topAligned = this.buildButtonTop() - this.topMargin(); // 건설 버튼/최상층 지붕 위 여백(스크롤 상한).
    const built = this.justBuiltLevel ? this.towerFloors[this.justBuiltLevel - 1] : undefined;
    if (built) {
      // 방금 지은 층 중심을 화면 ~55% 지점에(상한/하한 범위 내). → 건설된 층에 맞춰 안착.
      const focus = built.node.y - this.camH() * 0.55;
      cam.setScroll(0, Phaser.Math.Clamp(focus, topAligned, bottomAligned));
    } else {
      // x = 중앙 타워를 화면 가운데(캔버스 폭이 저작 폭이면 0 = 종전과 동일).
      cam.setScroll(scrollXForCenter(TOWER_CX, this.camW()), Math.min(bottomAligned, topAligned));
    }
  }

  /** 월드/UI 카메라 분리 — mainCam=월드(줌·스크롤), uiCam=UI(고정). 이후 생성물은 pinToWorld/pinToUi 로 분류. */
  private setupCameras(): void {
    // 뷰포트는 **캔버스 전체**(저작 크기가 아니라) — 폭이 넓어진 만큼 UI 카메라도 넓어져야 한다.
    const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    // 세이프존 배치(줌 + 스크롤) — 헤더·배너·오버레이가 전부 이 카메라다.
    //   노치/아일랜드 인셋이 있으면 줌이 낮아지며 UI 가 그 안쪽으로 들어간다.
    centerSafeZone(this, uiCam);
    this.uiCam = uiCam;
    const uiSet = new Set(this.uiObjects);
    for (const o of this.children.list) {
      if (uiSet.has(o)) this.cameras.main.ignore(o); // UI 는 월드 카메라서 제외.
      else uiCam.ignore(o); // 월드는 UI 카메라서 제외.
    }
  }

  /** 월드 오브젝트(타워·연출·손님 등) — mainCam 만 렌더(줌·스크롤 따라감). uiCam 에서 제외. (손님 등 외부 생성물도 호출) */
  pinToWorld(o?: Phaser.GameObjects.GameObject): void {
    if (o) this.uiCam?.ignore(o);
  }

  /** UI 오브젝트(오버레이·토스트 등) — uiCam 만 렌더(고정). mainCam 에서 제외. */
  /**
   * **보너스 게임 아이콘**(좌측 레일) — 누르면 보너스 게임으로. 하루 판수가 남았을 때만 들어간다.
   *
   * ## 왜 코드로 그리나
   * 이 아이콘은 **아직 저작 노드가 없다**(아트도 준비 중). 그래서 자리를 코드가 만들되, 좌표는
   * **기존 레일 노드에서 유도**한다 — 상점(layer_11)과 팩(layer_11_copy)의 x·크기·세로 간격을 읽어
   * 그 다음 칸에 놓는다. 숫자를 박아 두면 디자이너가 레일을 옮길 때 이 아이콘만 남는다.
   *
   * ⚠️ **아트가 오면 저작으로 옮기는 것이 정답이다.** `BONUS_ICON_KEY` 텍스처가 있으면 자동으로
   *   그 그림을 쓰고, 없으면 임시 원판+🎁 로 그린다 — 아트만 매니페스트에 들어오면 코드 수정이 없다.
   * ⚠️ 레일 노드를 못 찾으면 **아무것도 그리지 않는다**(조용히 건너뜀). 없는 노드에 붙이려다
   *   `undefined.x` 로 씬이 통째로 멈추는 사고를 막는다.
   */
  private setupBonusGameIcon(idx: LayoutIndex): void {
    const shop = idx.tryById<Phaser.GameObjects.Image>('layer_11');
    const pack = idx.tryById<Phaser.GameObjects.Image>('layer_11_copy');
    if (!shop || !pack) return; // 레일 저작이 바뀌었다 — 조용히 건너뛴다(씬은 계속 산다).
    const pitch = pack.y - shop.y; // 레일 세로 간격(저작에서 유도).
    /*
     * ⚠️ **레일의 마지막 칸 아래**에 놓는다. 처음엔 팩 바로 다음 칸(y≈650)에 뒀다가
     *   **광고 제거 아이콘(layer_18, y=646)과 그대로 겹쳐 보이지 않았다**(실측 2026-08-29).
     *   좌측에 이미 놓인 것들 중 가장 아래를 찾아 그 아래로 간다 — 저작이 늘어도 따라간다.
     */
    //   ⚠️ 범위를 **레일 구간으로 좁힌다**(상점부터 3칸). 넓게 잡으면 한참 아래의 점포 수익 배지
    //     (layer_11_copy2, y=1137)까지 "레일"로 세어 아이콘이 타워 중턱(y≈1328)에 놓인다.
    const RAIL_SPAN = pitch * 3;
    const railBottom = (idx.entries() ?? [])
      .filter((e) => e.node.type === 'image' && e.node.x < shop.x + pitch && e.node.y >= shop.y && e.node.y <= shop.y + RAIL_SPAN)
      .reduce((mx, e) => Math.max(mx, e.node.y), pack.y);
    const x = pack.x;
    const y = railBottom + pitch;
    const w = pack.displayWidth;
    const h = pack.displayHeight;

    const box = this.add.container(x, y).setDepth(pack.depth);
    if (this.textures.exists(BONUS_ICON_KEY)) {
      box.add(this.add.image(0, 0, BONUS_ICON_KEY).setDisplaySize(w, h));
    } else {
      // 임시 아이콘 — 아트가 오기 전까지의 자리 표시. 레일의 다른 칸과 크기·중심을 맞춘다.
      box.add(this.add.rectangle(0, 0, w, h, 0x4b2e83, 0.92).setStrokeStyle(4, 0xffd166, 0.9));
      box.add(this.add.text(0, -6, '🎁', { fontSize: `${Math.round(h * 0.5)}px` }).setOrigin(0.5));
    }
    // 라벨 — 레일의 다른 칸(layer_13 계열)과 같은 위치 규약(아이콘 아래).
    const label = this.add
      .text(0, h * 0.42, '민원', { fontFamily: FONT, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5);
    box.add(label);
    // 남은 판수 배지 — 0 이면 회색으로 눌러도 안 들어간다는 것을 미리 보여준다.
    const badge = this.add
      .text(w * 0.36, -h * 0.36, '', { fontFamily: FONT, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5);
    box.add(badge);

    /*
     * 배지 = **무료 판이 남았으면 남은 수, 다 썼으면 게임비**(PO 2026-08-29 "2회 이상 하루에 플레이 할
     *   경우 2천코인의 게임비"). 유료여도 **막지 않는다** — 코인이 모자랄 때만 흐리게 보여 준다.
     */
    const paint = (): { free: number; fee: number; afford: boolean } => {
      const save = loadSave();
      const free = bonusPlaysLeft(save.bonusGame, new Date());
      const fee = bonusEntryFee(save.bonusGame, new Date());
      const afford = save.coins >= fee;
      badge.setText(fee === 0 ? String(free) : `🪙${(fee / 1000).toFixed(0)}k`);
      badge.setColor(fee === 0 ? '#ffe066' : afford ? '#ffffff' : '#9b8fae');
      box.setAlpha(afford ? 1 : 0.62);
      return { free, fee, afford };
    };
    paint();

    box.setSize(w, h);
    /*
     * **누르면 공공건물로 데려간다**(PO 2026-08-30) — 예전엔 모드 선택 팝업을 열었다. 이제 모드는
     *   건물의 층이 곧 선택지라, 팝업 대신 **좌측 공공건물 부지로 카메라를 옮긴다.**
     *
     * ⚠️ 레일 아이콘을 **없애지 않는다.** 하루 2판짜리 데일리를 스크롤 뒤에 숨기면 그냥 안 하게 된다
     *   — 아이콘은 남겨 "오늘 할 일이 남았다"를 홈에서 바로 읽히게 하고, 역할만 '이동'으로 바꾼다.
     */
    box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('button');
      this.panToCivicLot();
      paint();
    });
    this.pinToUi(box);
    this.uiObjects.push(box);
  }



  private pinToUi(o?: Phaser.GameObjects.GameObject): void {
    if (o && this.uiCam) this.cameras.main.ignore(o);
  }

  /**
   * 레이아웃 층 노드(1..B) 위로 **동적 층(B+1..)**을 코드로 쌓는다. 층 아트(up_Slitare_BG_0N)를 레이아웃 최상단
   *   층과 같은 폭·세로피치로 올리고, 건설된 층은 유리+캐릭터를, 다음 건설 대상은 실루엣+건설버튼을 붙인다.
   *   ⚠️ 현재 화면 한 장에 들어오는 높이까지만 자연스럽다(아주 높은 탑은 스크롤/축소가 후속 과제).
   */
  /**
   * **타워 성장 프리뷰**(PO 2026-08-31) — 처음 온 사람에게 "이 건물을 이렇게 올려 간다"를 한 번 보여 준다.
   *   1·2층만 있는 상태에서 3~10층이 **아래에서 올라와 차례로 얹히고**, 잠시 머문 뒤 **역순으로 사라져**
   *   다시 1·2층만 남는다. 카메라도 함께 위로 따라 올라갔다 돌아온다.
   *
   * ⚠️ **표시만 바꾼다** — 세이브(builtFloors)는 건드리지 않는다. 연출이 끝나면 원래 화면과 완전히 같다.
   * ⚠️ 연출 중에는 스크롤을 잠근다(사용자가 끌면 카메라 트윈과 싸운다). 끝나면 반드시 되돌린다.
   * ⚠️ 1회 제한은 **전용 팁 키**(TIPS_KEY)에 남긴다 — 본 세이브에 넣으면 다른 writeSave 가 덮어 다시 뜬다.
   */
  private playTowerGrowthPreview(force = false): void {
    if (this.previewPlaying) return; // 연출 중 재실행 금지(트윈이 겹쳐 층이 어긋난다).
    /*
     * **레벨 5까지는 홈에 들어올 때마다 한 번씩**(PO 2026-08-31 최종) — 초반에는 목표(타워를 올린다)를
     *   반복해서 보여 주고, 6레벨부터 조용해진다. 간판(지붕) 탭은 레벨과 무관하게 재생(force).
     *
     * ⚠️ **팁 키(1회 제한)로 막지 않는다.** 팁은 세이브와 별개 키라 세이브를 리셋해도 남아,
     *   "처음 실행인데 연출이 안 나온다"가 됐다(PO 신고 2026-08-31). 판정은 **레벨 하나로만** 한다.
     */
    if (!force && (towerPreviewShownThisRun || loadSave().level > PREVIEW_UNTIL_LEVEL)) return;
    const shown = this.shownFloors();
    const levels: number[] = [];
    for (let l = shown + 1; l <= MAX_FLOORS; l++) if (this.towerFloors[l - 1]) levels.push(l);
    if (levels.length === 0) return;
    this.previewPlaying = true;
    if (!force) towerPreviewShownThisRun = true; // 이번 실행에서는 다시 돌지 않는다(간판 탭은 예외).

    const objsOf = (level: number): Phaser.GameObjects.Image[] => {
      const e = this.towerFloors[level - 1];
      const dec = this.floorDecor.get(level);
      return [e?.obj as Phaser.GameObjects.Image, dec?.glass, dec?.char].filter(Boolean) as Phaser.GameObjects.Image[];
    };
    const RISE = 90; // 아래에서 올라오는 거리(px).
    /*
     * **간판(지붕)은 늘 최상층 위에 있는다**(PO 2026-08-31) — 층이 하나 얹힐 때마다 지붕도 그 위로 옮긴다.
     *   위치 공식은 `capRoof` 와 같다(최상층 윗변 − 지붕 반높이 + 겹침). 연출이 끝나면 원래 자리로 돌린다.
     */
    const roof = this.layoutIdx?.entries().find((e) => e.node.type === 'image' && /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;
    const roofHomeY = roof?.y ?? 0;
    const roofYFor = (level: number): number => {
      const e = this.towerFloors[level - 1]?.obj as Phaser.GameObjects.Image | undefined;
      if (!e || !roof) return roofHomeY;
      return e.y - e.displayHeight / 2 - roof.displayHeight / 2 + LOT2_ROOF_OVERLAP;
    };
    const STEP = 170; // 층 간 등장 간격(ms).
    this.scrollOn = false; // 연출 중 조작 잠금.
    const cam = this.cameras.main;
    const baseY = cam.scrollY;

    levels.forEach((level, i) => {
      const objs = objsOf(level);
      const homeY = objs.map((o) => o.y);
      for (const [k, o] of objs.entries()) {
        o.setVisible(true).setAlpha(0);
        o.y = homeY[k] + RISE;
      }
      this.time.delayedCall(i * STEP, () => {
        if (!this.scene.isActive()) return;
        sfx('build');
        objs.forEach((o, k) => {
          this.tweens.add({
            targets: o,
            y: homeY[k],
            alpha: 1,
            duration: 320,
            ease: 'Back.easeOut',
            /*
             * **안내는 마지막 층(10층)이 실제로 앉은 순간에만**(PO 2026-08-31 "중간에 출력하지 말 것").
             *   시간 계산(upMs)으로 띄우면 프레임이 느린 기기에서 아직 올라가는 중에 떠 버린다 —
             *   마지막 층 트윈의 완료 콜백에 붙여 화면과 문구를 정확히 맞춘다.
             */
            onComplete: k === 0 && level === MAX_FLOORS && level === levels[levels.length - 1]
              ? () => { if (this.scene.isActive()) this.toast('이렇게 층이 올라갑니다!'); }
              : undefined,
          });
        });
        /*
         * 카메라가 새 최상층을 따라 올라간다.
         * ⚠️ **scrollMin 으로 클램프하면 안 된다** — 그 값은 지금 지어진 높이(2층) 기준이라 위로 못 올라가고
         *   연출이 화면 밖에서 벌어진다(실측 2026-08-31). 프리뷰는 "아직 없는 층"을 보여 주는 것이라
         *   임시로 상한을 넘어선다. 스크롤은 이미 잠갔고(scrollOn=false) 끝나면 baseY 로 되돌린다.
         */
        const top = this.stackedFloorY(level) - this.camH() * 0.45;
        this.tweens.add({ targets: cam, scrollY: Math.min(top, this.scrollMax), duration: 320, ease: 'Sine.easeOut' });
        // 간판(지붕)도 새 최상층 위로 — 늘 꼭대기에 얹혀 있어야 "여기까지 지었다"가 읽힌다(PO 2026-08-31).
        if (roof) this.tweens.add({ targets: roof, y: roofYFor(level), duration: 320, ease: 'Back.easeOut' });
      });
    });

    const upMs = levels.length * STEP + 380;
    // 다 올라간 뒤 잠깐 보여 주고, 역순으로 거둬들인다 — "지금은 여기까지"를 눈으로 잇는다.
    this.time.delayedCall(upMs + 900, () => {
      if (!this.scene.isActive()) return;
      const DOWN_STEP = 150; // 내려오는 간격 — 카메라가 따라오는 것이 보이도록 올라갈 때(170)와 비슷하게.
      [...levels].reverse().forEach((level, i) => {
        this.time.delayedCall(i * DOWN_STEP, () => {
          if (!this.scene.isActive()) return;
          /*
           * **카메라도 층을 따라 내려온다**(PO 2026-08-31) — 예전엔 층이 다 사라진 뒤에 한 번에 내려와
           *   "사라지는 것"과 "내려오는 것"이 따로 놀았다. 지금 지워지는 층의 **바로 아래층**을 기준으로
           *   한 칸씩 내려오고, 남은 층(1·2층)에 닿으면 원래 위치(baseY)로 마무리한다.
           */
          const below = level - 1;
          const camTo = below > shown ? Math.min(this.stackedFloorY(below) - this.camH() * 0.45, this.scrollMax) : baseY;
          this.tweens.add({ targets: cam, scrollY: camTo, duration: DOWN_STEP + 120, ease: 'Sine.easeInOut' });
          if (roof) this.tweens.add({ targets: roof, y: below > shown ? roofYFor(below) : roofHomeY, duration: DOWN_STEP + 120, ease: 'Sine.easeInOut' });
          for (const o of objsOf(level)) {
            this.tweens.add({
              targets: o,
              alpha: 0,
              y: o.y + RISE * 0.5,
              duration: 220,
              ease: 'Quad.easeIn',
              onComplete: () => {
                o.setVisible(false).setAlpha(1);
                o.y -= RISE * 0.5; // 제자리로 복구(다음 건설 연출이 이 좌표를 쓴다).
              },
            });
          }
        });
      });
      this.time.delayedCall(levels.length * DOWN_STEP + 400, () => {
        if (this.scene.isActive()) this.tweens.add({ targets: cam, scrollY: baseY, duration: 420, ease: 'Sine.easeInOut' }); // 마무리 정렬.
      });
      this.time.delayedCall(levels.length * DOWN_STEP + 900, () => {
        this.scrollOn = true; // 조작 복귀.
        this.previewPlaying = false; // 안내 문구는 **10층에 닿았을 때 한 번**뿐이다(PO 2026-08-31) — 여기서 또 띄우지 않는다.
      });
    });
  }

  private renderDynamicFloors(): void {
    const base = this.towerFloors;
    const B = base.length;
    if (B < 2) return;
    const top = base[B - 1].node;
    const fw = top.w ?? 832; // 폭·높이는 **바로 아래층과 동일**(아래폭 일치).
    const fh = top.h ?? 517;
    const fx = top.x;
    let prevTopEdge = top.y - fh / 2; // 바로 아래(최상단 레이아웃) 층의 상단 edge.
    // **4~10층 전부 미리 렌더**(미건설은 숨김) → 건설 시 제자리에서 등장(재시작 없이 부드럽게).
    for (let level = B + 1; level <= MAX_FLOORS; level++) {
      const key = this.floorArtVersion(level);
      if (!key) continue;
      // 이 층의 **하단이 아래층 상단을 DYN_FLOOR_OVERLAP 만큼 침범** → 틈 없이 약간 겹침.
      const y = prevTopEdge - fh / 2 + DYN_FLOOR_OVERLAP;
      const depth = 11 + (level - B) * 5; // 레이아웃 최상단(11) 위로.
      const img = this.add.image(fx, y, key).setDepth(depth);
      img.setDisplaySize(fw, fh);
      const node = { id: `dynfloor_${level}`, type: 'image', key, x: fx, y, w: fw, h: fh, depth };
      const built = level <= this.shownFloors();
      const decor = this.addDynamicDecor(level, fx, y, fw, fh, depth, built);
      this.floorDecor.set(level, decor);
      prevTopEdge = y - fh / 2; // 다음(더 위) 층은 이 층 상단 위로 쌓인다.
      img.setAlpha(1).setVisible(built); // 건설된 층만 표시(미건설은 숨김, 건설 연출서 등장).
      if (built && decor.char) this.animateClerk(decor.char, (level - 1) * 300); // 건설된 동적 점원 idle 애니.
      this.towerFloors.push({ node, obj: img } as unknown as LayoutEntry);
    }
  }

  /**
   * 층 아트 텍스처 키 — **최신 버전(_v3 > _v2 > base) 우선**. 6~10층은 아트가 5종뿐이라 **순환**(2~5 재사용,
   *   1층 로비는 제외)해 데모용으로 채운다. 없으면 undefined.
   */
  private floorArtVersion(level: number): string | undefined {
    // **층별 지정 아트**(BG_01~10, 순환 아님) — 최신 버전(_v3>_v2>base) 우선. 예: 4층=라멘 BG_04_v3.
    const p = pad2(level);
    const cands = [`up_Slitare_BG_${p}_v3`, `up_Slitare_BG_${p}_v2`, `up_Slitare_BG_${p}`];
    const found = cands.find((k) => this.textures.exists(k));
    if (found) return found;
    const fb = floorArtKey(level);
    return this.textures.exists(fb) ? fb : undefined;
  }

  /**
   * **모든 층 점원을 자기 층 유리팬스 바로 뒤(glass.depth − 0.5)로 정규화**한다.
   *   에디터 저작 3층 점원(Chr_03)이 유리팬스보다 위 depth 로 저작돼 **유리 위로 올라오던** 문제를 코드로 교정.
   *   동적 층 점원은 이미 유리 뒤라 무영향(멱등). 위치는 그대로(홀·짝 좌우 규칙 유지).
   */
  private normalizeClerkDepths(): void {
    for (const dec of this.floorDecor.values()) {
      if (dec.char && dec.glass) dec.char.setDepth(dec.glass.depth - 0.5);
    }
  }

  /** 동적 층의 유리·점원(레이아웃 층의 상대 오프셋을 모사). built=false 면 숨겨 두고 건설 연출이 등장시킨다. */
  private addDynamicDecor(
    level: number,
    fx: number,
    fy: number,
    fw: number,
    fh: number,
    depth: number,
    built: boolean,
  ): { glass?: Phaser.GameObjects.Image; char?: Phaser.GameObjects.Image } {
    let glass: Phaser.GameObjects.Image | undefined;
    const glassDepth = depth + 2;
    if (this.textures.exists('up_Slitare_BG_Glass')) {
      glass = this.add.image(fx, fy + fh * 0.33, 'up_Slitare_BG_Glass').setDepth(glassDepth);
      glass.setDisplaySize(690, glass.height * (690 / glass.width));
      glass.setVisible(built);
    }
    // **층별 지정 점원(Chr_NN)** — 예: 4층 라멘집 점원 up_Solirare_Chr_04. 아트엔 사람이 없어 코드로 카운터에 세운다.
    //   배치: **홀수 층=오른쪽, 짝수 층=왼쪽**(1층 우·2층 좌… 규칙). depth = 유리 바로 뒤(유리팬스 뒤·건물 앞).
    let char: Phaser.GameObjects.Image | undefined;
    const charKey = `up_Solirare_Chr_${pad2(level)}`;
    if (this.textures.exists(charKey)) {
      const side = level % 2 === 1 ? 1 : -1; // 홀수=오른쪽(+), 짝수=왼쪽(−).
      const charX = fx + side * fw * 0.22; // 중심서 ~±185 (아래층 점원과 동일).
      char = this.add.image(charX, fy + fh * 0.16, charKey).setDepth(glassDepth - 0.5);
      char.setDisplaySize(char.width * (245 / char.height), 245); // 아래층 점원 키(~240)에 맞춤.
      char.setVisible(built);
      wireClerkTalk(this, char, themeForFloor(level), level); // 동적 층 점원 탭 = 점포 테마 대사(+층 맥락).
    }
    return { glass, char };
  }

  /**
   * 크레인 + 케이블 준비 — **평소엔 숨김**(건설 연출 중에만 표시). 레이아웃에 Crane 노드가 있으면 재사용,
   *   없으면(home.json) 코드로 만든다.
   */
  private setupCrane(): void {
    const idx = this.layoutIdx;
    if (!idx) return;
    const existing = idx.entries().find((e) => /Crane/i.test(e.node.key ?? ''));
    if (existing) {
      // 에디터 배치 크레인 — 위치는 그대로 쓰되, **중경(depth 6) 앞으로** depth 를 끌어올린다(가림 방지).
      this.craneImg = existing.obj as Phaser.GameObjects.Image;
      this.craneIsLayout = true;
      if (((existing.obj as Phaser.GameObjects.Image).depth ?? 0) < CRANE_DEPTH) {
        (existing.obj as Phaser.GameObjects.Image).setDepth(CRANE_DEPTH);
      }
    } else if (this.textures.exists(CRANE_KEY)) {
      const img = this.add.image(CRANE_CX, CRANE_CY, CRANE_KEY).setDepth(CRANE_DEPTH);
      img.setScale(CRANE_W / img.width);
      this.craneImg = img;
      this.craneIsLayout = false;
    }
    // 크레인은 **건설 연출 중에만** 등장(평소 숨김). 에디터 크레인은 위치(건물 뒤·아래층에 붙음)만 유지.
    this.craneImg?.setVisible(false);
    this.cablesGfx = this.add.graphics().setDepth(CABLE_DEPTH).setVisible(false);
  }

  /** 크레인 고리(케이블 시작점) — 크레인 이미지 내 HOOK_RATIO 위치(원점 0.5 기준 보정). */
  private hookPoint(): { x: number; y: number } {
    const c = this.craneImg;
    if (!c) return { x: CRANE_CX, y: CRANE_CY };
    const left = c.x - c.displayWidth * c.originX;
    const top = c.y - c.displayHeight * c.originY;
    return { x: left + c.displayWidth * HOOK_RATIO.x, y: top + c.displayHeight * HOOK_RATIO.y };
  }

  /**
   * 고리 → **들어올리는 층(obj)의 시각 4개 모서리** 케이블(약간 굵은 검은 선) + 고리 매듭.
   *   obj 의 **현재 위치**로 그려서 층이 내려오는 동안 케이블이 따라온다(연결 유지).
   */
  private redrawCables(obj: Phaser.GameObjects.Image, node: { w?: number; h?: number }): void {
    const g = this.cablesGfx;
    if (!g) return;
    g.clear();
    const hook = this.hookPoint();
    const w = node.w ?? 800;
    const h = node.h ?? 500;
    const corners = [
      { x: obj.x - w * BLD_HALF, y: obj.y - h * BLD_TOP },
      { x: obj.x + w * BLD_HALF, y: obj.y - h * BLD_TOP },
      { x: obj.x - w * BLD_HALF, y: obj.y + h * BLD_BOT },
      { x: obj.x + w * BLD_HALF, y: obj.y + h * BLD_BOT },
    ];
    g.lineStyle(CABLE_W, CABLE_COLOR, 0.92);
    for (const c of corners) {
      g.beginPath();
      g.moveTo(hook.x, hook.y);
      g.lineTo(c.x, c.y);
      g.strokePath();
    }
    g.fillStyle(CABLE_COLOR, 1);
    g.fillCircle(hook.x, hook.y, CABLE_W * 1.1); // 고리 매듭 — 케이블 시작점을 덮어 연결감.
  }

  /** 특정 층 노드에 가장 가까운(중심 y 최근접) 장식 엔트리(유리/캐릭터). */
  private nearestEntry(floorNode: { y: number }, re: RegExp): LayoutEntry | undefined {
    const idx = this.layoutIdx;
    if (!idx) return undefined;
    return idx
      .entries()
      .filter((e) => re.test(e.node.key ?? ''))
      .sort((a, b) => Math.abs(a.node.y - floorNode.y) - Math.abs(b.node.y - floorNode.y))[0];
  }

  /**
   * 타워건설 연출 — ①줌아웃+포커스 상향(크레인 드러남)·옛 지붕 걷힘 → ②새 층·유리가 위에서 낙하(쿵) →
   *   ③캐릭터 등장 → ④지붕 재-캡 + 카메라 복귀 → ⑤저장·정착(restart).
   *   레이아웃/타워 정보가 없으면(플레이스홀더 경로) 즉시 반영으로 폴백.
   */
  private runConstruction(level: number, cost: number): void {
    if (this.constructing) return;
    const s = loadSave();
    // **레벨 해금 요구치** — 미달이면 차단(3층=Lv10, 층당 10레벨).
    const req = floorLevelReq(level);
    if (s.level < req) {
      sfx('build_fail');
      this.toast(`🔒 레벨 ${req} 이상 필요 (현재 ${s.level})`);
      return;
    }
    // **건설 비용 = 점포매입과 동일**(층별 곡선, storeAcquireCostFor). 코인·다이아 둘 다 필요.
    const need = storeAcquireCostFor(level);
    if (s.coins < need.coins || (s.diamonds ?? 0) < need.diamonds) {
      sfx('build_fail');
      this.toast(`재화가 부족해요 (필요 🪙${need.coins.toLocaleString()} 💎${need.diamonds})`);
      return;
    }
    const idx = this.layoutIdx;
    const entry = this.towerFloors[level - 1];
    if (!idx || !entry) {
      this.finishConstruction(level, cost);
      return;
    }
    this.constructing = true;
    this.buildBtn?.destroy();
    this.buildBtn = undefined;
    this.buildStoreBtn?.setVisible(false); // 에디터 건축 버튼·라벨은 연출 중 숨김(완료 후 그 층은 건설됨).
    this.buildStoreLabel?.setVisible(false);

    const cam = this.cameras.main;
    const z0 = cam.zoom; // idle(원래) 줌 — 배치 후 이 값으로 되돌린다(원래대로 확대).
    const idleY = cam.midPoint.y; // idle 카메라 세로 중심.
    const bld = entry.obj as Phaser.GameObjects.Image;
    const node = entry.node;
    const fh = node.h ?? 500;
    const fw = node.w ?? 800;
    const finalY = bld.y; // 에디터에서 조정한 4층 최종 위치.
    const roof = idx.entries().find((e) => /roof/i.test(e.node.key ?? ''))?.obj as Phaser.GameObjects.Image | undefined;

    // 유리팬스 = **템플릿의 4층 유리(layer_6_copy3, 지붕 자리에 미리 있던 것)를 그대로 등장**시킨다(중복 생성 X).
    const glassObj = this.floorDecor.get(level)?.glass;
    const glassFinalY = glassObj?.y ?? finalY + fh * 0.33;
    // **층 점원** = addDynamicDecor 가 만들어 둔 Chr_0{level}(예: 4층 라멘 점원 Chr_04). 지붕이 씌워진 뒤 등장.
    //   (라멘 아트엔 사람이 없어 코드 점원을 세운다. 별도 신규 생성 X — 중복 방지.)
    const charObj = this.floorDecor.get(level)?.char;
    const charFinalY = charObj?.y ?? finalY + fh * 0.16;

    // 크레인은 **건설 중에만** 등장. 에디터 크레인은 위치(건물 뒤·아래층에 붙음) 유지, 코드 폴백만 새 층 위로 재배치.
    const crane = this.craneImg;
    if (crane) {
      if (!this.craneIsLayout) {
        crane.x = node.x - crane.displayWidth * (HOOK_RATIO.x - 0.5);
        crane.y = finalY - LIFT_HOOK - crane.displayHeight * (HOOK_RATIO.y - 0.5);
      }
      crane.setVisible(true).setAlpha(0); // 숨김에서 페이드인.
    }

    sfx('button');
    // ① **화면 살짝 축소(줌아웃) + 살짝 위로** — 4층 내려올 자리·크레인 드러냄. (UI 는 uiCam 이라 안 변함)
    //   줌아웃은 MIN_CAMERA_ZOOM 까지만, 그리고 지면 근처(낮은 타워)에선 도로 바닥이 드러나지 않는 선까지만.
    const conZoom = Math.max(z0 * MIN_CAMERA_ZOOM, this.minZoomForGround(idleY - H / 2));
    cam.zoomTo(conZoom, 820, 'Sine.easeInOut');
    cam.pan(W / 2, idleY - 220, 820, 'Sine.easeInOut');
    if (crane) this.tweens.add({ targets: crane, alpha: 1, duration: 460, ease: 'Sine.easeOut' });
    if (roof) this.tweens.add({ targets: roof, y: roof.y - 200, alpha: 0, duration: 460, ease: 'Sine.easeIn' });

    // ② 크레인이 4층을 최종 위치로 내림 → **3층과 마주 닿는 순간** 안착(쿵 + 가로 연기). 유리팬스는 4층과 함께 낙하.
    this.time.delayedCall(900, () => {
      bld.setAlpha(0).setVisible(true);
      bld.y = finalY - FLOOR_LIFT;
      this.tweens.add({ targets: bld, alpha: 1, duration: 200 });
      if (glassObj) {
        glassObj.setAlpha(0).setVisible(true);
        glassObj.y = glassFinalY - FLOOR_LIFT;
        this.tweens.add({ targets: glassObj, alpha: 1, duration: 200 });
        this.tweens.add({ targets: glassObj, y: glassFinalY, duration: 780, ease: 'Bounce.easeOut' });
      }
      this.cablesGfx?.setVisible(true).setAlpha(1);
      this.tweens.add({
        targets: bld,
        y: finalY,
        duration: 780,
        ease: 'Bounce.easeOut',
        onUpdate: () => this.redrawCables(bld, node),
        onComplete: () => {
          cam.shake(240, 0.01); // 쿵.
          sfx('build');
          // **3층↔4층이 닿는 접합선 전체에 가로로 풍부한 연기**(위로가 아니라 옆으로 퍼짐).
          this.emitSmokeBand(node.x, finalY + fh * 0.5, fw * 0.92, (node.depth ?? 34) + 3);
          this.tweens.add({
            targets: this.cablesGfx,
            alpha: 0,
            duration: 240,
            onComplete: () => this.cablesGfx?.clear().setVisible(false).setAlpha(1),
          });
        },
      });
    });

    // ③ **지붕이 상단(4층)에 맞춰짐** — 캐릭터보다 먼저. + 크레인 퇴장.
    this.time.delayedCall(1860, () => {
      if (roof) {
        this.capRoof(idx, this.towerFloors, level);
        const ry = roof.y;
        roof.setAlpha(1);
        roof.y = ry - 170;
        this.tweens.add({ targets: roof, y: ry, duration: 440, ease: 'Bounce.easeOut' });
      }
      if (crane) this.tweens.add({ targets: crane, alpha: 0, y: crane.y - 60, duration: 480, ease: 'Sine.easeIn' });
    });

    // ④ **지붕이 맞춰진 뒤 점원 등장**(카운터 자리에서 살짝 튀어오르며).
    this.time.delayedCall(2360, () => {
      if (charObj) {
        charObj.setAlpha(0).setVisible(true);
        charObj.y = charFinalY - 44;
        this.tweens.add({ targets: charObj, y: charFinalY, alpha: 1, duration: 340, ease: 'Back.easeOut' });
      }
    });

    // ⑤ 배치 후 **원래대로 확대(z0) + 방금 지은 층에 포커스** — **느리고 부드럽게**(1.4초, Cubic.easeOut).
    //   목표를 **건설 후 스크롤 범위 안**으로 미리 클램프해 팬 → 이후 클램프로 툭 튕기지 않게(끊김 제거).
    this.time.delayedCall(2760, () => {
      cam.zoomTo(z0, 1400, 'Sine.easeInOut');
      const scrollMaxEst = this.groundBottom() - H - BOTTOM_SAFE;
      const roofTop = roof ? roof.y - roof.displayHeight / 2 : finalY - 400;
      const atMaxNow = level >= MAX_FLOORS;
      const marginNow = this.topMarginFor(atMaxNow);
      const btnH = this.buildStoreBtn?.displayHeight ?? 120;
      const topRef = atMaxNow ? roofTop : roofTop - 30 - btnH; // 다음 건설 버튼 상단(대략) 또는 지붕.
      const scrollMinEst = Math.min(scrollMaxEst, topRef - marginNow);
      const target = Phaser.Math.Clamp(finalY - H * 0.55, scrollMinEst, scrollMaxEst); // 층 포커스, 범위 내.
      cam.pan(W / 2, target + H / 2, 1400, 'Sine.easeInOut');
    });

    // ⑥ 팬(1.4초)이 끝난 뒤 완료 처리(제자리 갱신).
    this.time.delayedCall(4400, () => this.finishConstruction(level, cost));
  }

  /**
   * 안착 연기 — **접합선(y)에 가로로 풍부한 먼지 밴드**. 위로가 아니라 좌우 바깥으로 퍼지며 옅어진다.
   *   centerX 중심 width 폭에 균일 분포.
   */
  private emitSmokeBand(centerX: number, y: number, width: number, depth: number): void {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const px = centerX + t * width;
      const c = this.add
        .circle(px + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-10, 10), Phaser.Math.Between(16, 32), 0xf3f3f3, 0.72)
        .setDepth(depth);
      this.pinToWorld(c);
      this.tweens.add({
        targets: c,
        x: c.x + Math.sign(t || 1) * Phaser.Math.Between(40, 130), // 주로 가로(바깥)로.
        y: c.y - Phaser.Math.Between(4, 26), // 위로는 살짝만.
        scale: Phaser.Math.FloatBetween(2.2, 3.2),
        alpha: 0,
        duration: Phaser.Math.Between(560, 920),
        ease: 'Sine.easeOut',
        onComplete: () => c.destroy(),
      });
    }
  }

  /** 건설 확정 — 데모면 방금 지은 층을 유지한 채 **다음 층 건설 가능 상태로 이어붙임**(restart+demoBuilt), 최대 10층. */
  private finishConstruction(level: number, _cost: number): void {
    this.constructing = false;
    this.builtFloors = Math.min(MAX_FLOORS, level); // **제자리 증가**(재시작 없음).
    // **건설 = 소유** — 저장 **전에** 소유를 반영해야 한다. (안 그러면 저장된 ownedFloors 가 builtFloors 보다
    //   1 뒤처져, 다음 홈 진입 때 방금 지은 층을 '미소유'로 보고 **불필요한 N층 점포매입 버튼**이 뜬다 = 재매입 버그.)
    this.ownedFloors = Math.max(this.ownedFloors, this.builtFloors);
    // **임시저장**: 건설 레벨 저장 + **코인·다이아 비용 차감**(층별 곡선, 점포매입과 동일) + 소유 반영.
    const paid = storeAcquireCostFor(level);
    bumpMetrics({ buildCoins: paid.coins, buildDiamonds: paid.diamonds, builds: 1 }); // 일일 지표 — 건설.
    const s = loadSave();
    s.coins = Math.max(0, s.coins - paid.coins);
    s.diamonds = Math.max(0, (s.diamonds ?? 0) - paid.diamonds);
    s.builtFloors = this.builtFloors;
    s.ownedFloors = Math.max(s.ownedFloors ?? 0, this.ownedFloors);
    writeSave(s);
    this.homeHeader?.setCoins(s.coins);
    this.advanceAfterBuild(level);
  }

  /**
   * 건설 완료 후 **제자리 갱신**(재시작 없이 부드럽게) — 지붕 재-캡·점원 애니·손님 등장·건설 버튼 재배선·스크롤 범위 갱신.
   *   카메라는 이미 연출 ⑤에서 방금 지은 층으로 부드럽게 팬돼 있으므로, 여기선 위치를 건드리지 않고 범위만 맞춘다.
   */
  private advanceAfterBuild(level: number): void {
    this.refreshHomeDiamond(); // 타워 건설로 차감된 다이아 표시 갱신.
    const idx = this.layoutIdx;
    if (!idx) return;
    this.justBuiltLevel = level;
    this.ownedFloors = Math.max(this.ownedFloors, this.builtFloors); // 건설=소유(크레인으로 지은 층은 내 것).
    this.capRoof(idx, this.towerFloors, Math.max(1, Math.min(this.builtFloors, this.towerFloors.length)));
    this.normalizeClerkDepths();
    const dec = this.floorDecor.get(level);
    if (dec?.char) this.animateClerk(dec.char, 0); // 방금 지은 층 점원 idle 애니.
    const spot = this.spotForLevel(level); // 이 층을 손님 스포너 후보(라이브 배열)에 추가 → 랜덤 등장.
    if (spot && !this.customerSpots.some((s) => s.floor === level)) this.customerSpots.push(spot);
    this.wireStoreButtons(idx); // 건설 버튼을 다음 층으로(또는 최상층 완공 시 숨김).
    this.placeContinueButton(); // 계속하기 버튼을 방금 지은 **새 최상층**으로 이동.
    this.computeScrollBounds(); // 스크롤 범위만 갱신(카메라는 ⑤ 팬이 이미 범위 내에 안착 → 클램프로 튕기지 않게).
    // 스크롤 목표/관성을 방금 팬으로 안착한 '맨 위층' 위치에 고정 — 낡은 목표로 되돌아가 아래로 튀지 않게.
    const cam = this.cameras.main;
    this.scrollTargetY = cam.scrollY;
    this.scrollTargetX = cam.scrollX;
    this.scrollVel = 0;
    this.scrollVelX = 0;
    this.prevScrollY = cam.scrollY; // 미세줌 속도 튐 방지(팬 직후 정지 상태).
    if (this.builtFloors >= MAX_FLOORS) {
      this.toast('🏙️ 타워 완공! 새 부지 구입이 열렸어요', true);
      this.unlockLots(); // **메인타워 10층 완공 → 부지 구입 잠금 해제**(재진입 없이 즉시).
    }
  }

  /**
   * 타워 캐릭터(up_Solirare_Chr_0N) — **발밑(하단) 고정 + 상단만 살랑살랑** 아이들 애니메이션.
   *   캐릭터 느낌을 위해 (1) 바닥을 축으로 좌우로 아주 살짝 갸웃(회전 ±SWAY°)하고,
   *   (2) 숨쉬듯 세로로 미세하게 늘었다 줄었다(scaleY 브레스, 바닥 고정이라 머리만 오르내림) 한다.
   *   원점을 하단 중앙으로 옮겨 회전·신축 축을 발밑에 두고, 시각 위치를 유지하도록 y 를 바닥으로 보정.
   *   캐릭터마다 위상(delay)을 어긋나게 해 로봇처럼 동시에 움직이지 않게 한다.
   */
  private animateCharacters(idx: LayoutIndex): void {
    const chars = idx.entries().filter((e) => /_Chr_/i.test(e.node.key ?? ''));
    chars.forEach((e, i) => {
      const img = e.obj as Phaser.GameObjects.Image;
      if (img.visible) this.animateClerk(img, i * 430);
    });
  }

  /**
   * 점원·공무원 idle 연출 — 실제 구현은 **공용 모듈**(`scenes/clerkIdle.ts`).
   * ⚠️ 프리셀 화면도 같은 캐릭터를 세우므로 두 벌로 두지 않는다(2026-08-30).
   */
  private animateClerk(img: Phaser.GameObjects.Image, phase = 0): void {
    animateClerkIdle(this, img, phase);
  }

  /**
   * 점포 방문 손님 스팟 계산 — **표시 중인(저작·건설된) 각 층**에 대해 가게 주인(Chr)과 겹치지 않는
   *   반대쪽 지점을 잡는다. 층/주인 좌표는 에디터 노드값(FIT 1:1 이라 화면 좌표와 동일)에서 읽는다.
   */
  private buildCustomerSpots(): CustomerSpot[] {
    // **건설된 모든 층(1~builtFloors, 레이아웃+동적)**에 손님 스팟. 동적 층도 floorDecor 로 점원/유리 참조.
    const shown = Math.min(this.builtFloors, this.towerFloors.length);
    const spots: CustomerSpot[] = [];
    for (let level = 1; level <= shown; level++) {
      const spot = this.spotForLevel(level);
      if (spot) spots.push(spot);
    }
    return spots;
  }

  /** 한 층의 손님 스팟 — 층 노드 + 그 층 점원(floorDecor.char)·유리(floorDecor.glass) 기준. 없으면 undefined. */
  private spotForLevel(level: number): CustomerSpot | undefined {
    const entry = this.towerFloors[level - 1];
    if (!entry) return undefined;
    const f = entry.node;
    const fw = f.w ?? 800;
    const fh = f.h ?? 500;
    const dec = this.floorDecor.get(level);
    const owner = dec?.char; // 점원 이미지(위치·크기·origin 무관하게 하단 산출).
    const glass = dec?.glass;
    const ownerX = owner?.x ?? f.x + fw * 0.18;
    // 등장/퇴장 = 점원 반대편(중심 대칭 미러) → 층 폭 안 클램프.
    const entryX = Phaser.Math.Clamp(2 * f.x - ownerX, f.x - fw * 0.34, f.x + fw * 0.34);
    // 발끝(바닥선) = 점원 이미지 하단(origin 무관: y + displayHeight×(1−originY)). 없으면 층 하단서 살짝 위.
    const ownerBottom = owner ? owner.y + owner.displayHeight * (1 - owner.originY) : f.y + fh / 2 - 46;
    const ownerH = owner ? owner.displayHeight : 220;
    return {
      entryX,
      centerX: f.x,
      groundY: ownerBottom,
      height: ownerH * 0.924, // 점원의 0.924배.
      // depth = **이 층 유리팬스 바로 뒤**(유리가 손님을 가림). 유리 없으면 아트 살짝 앞. 버튼(120+)보다 훨씬 아래.
      depth: glass ? glass.depth - 0.3 : (f.depth ?? 0) + 1.8,
      floor: level,
      onSatisfied: (fl, coins, dx, dy) => this.accrueFloorCoins(fl, coins, dx, dy), // 만족 방문 → 누적 + 떨어진 자리에서 흡입.
      coinYield: visitYieldFor(level), // **상점별 수익성** — 고층일수록 방문 1회 수익↑.
    };
  }

  // ── 점포 코인 누적 → 말풍선 수령 ─────────────────────────────────────
  /** 마지막 접속 일수 추적 — 이번 진입 기준 경과 일수를 반환하고 타임스탬프를 갱신한다(대화 맥락용). */
  private trackDaysAway(): number {
    try {
      const K = 'solitaire.lastSeen.v1';
      const prev = parseInt(localStorage.getItem(K) ?? '0', 10);
      localStorage.setItem(K, String(Date.now()));
      if (!prev || !Number.isFinite(prev)) return 0;
      return Math.max(0, Math.floor((Date.now() - prev) / 86_400_000));
    } catch {
      return 0;
    }
  }

  /** 세이브의 층별 누적 코인을 런타임 맵으로 로드(create 초기화용). */
  private loadFloorBanks(): void {
    this.floorBanks.clear();
    const banks = loadSave().floorCoinBanks ?? {};
    for (const [k, v] of Object.entries(banks)) {
      const fl = parseInt(k, 10);
      if (Number.isFinite(fl) && Number.isFinite(v)) this.floorBanks.set(fl, Math.max(0, Math.floor(v as number)));
    }
  }

  /** 이미 목표를 채운 층에 수령 말풍선을 띄운다(홈 재진입 시 복원). */
  // ── 점포 수익 통합 수금(PO 2026-07-28) ──────────────────────────────
  //   층이 여러 층이면 층별로 받기 번거로우므로 **한 배지에 모아** 받는다. 주기는 10분,
  //   **받지 않으면 더 쌓이지 않는다**(storeIncome.pendingIncome 의 한 주기 상한).
  //   배지는 에디터 저작: 패널 layer_11_copy2 · 금액 layer_13_copy7 · 타이머 layer_13_copy2.

  /** 마지막 정산 시각 — 없으면(구 세이브·첫 실행) 지금부터 시작해 저장한다. */
  private storeIncomeAt(): number {
    const s = loadSave();
    if (typeof s.storeIncomeAt === 'number' && Number.isFinite(s.storeIncomeAt)) return s.storeIncomeAt;
    const now = Date.now();
    writeSave({ ...s, storeIncomeAt: now });
    return now;
  }

  /** 한 주기에 쌓이는 코인 — 건설된 층 전체 합(경제 모델 재사용). 층이 늘면 자동으로 커진다. */
  private incomePerPeriodNow(): number {
    return incomePerPeriod(econ(), entryFeeFor(loadSave().level, 1), this.builtFloors);
  }

  /** 이 층수에서의 **수금 주기**(ms) — 층이 늘수록 길어진다(PO 2026-07-30). */
  private incomePeriod(): number {
    return periodFor(this.builtFloors);
  }

  private setupStoreIncome(idx: LayoutIndex): void {
    this.incomeBank = Math.max(0, Math.floor(loadSave().storeIncomeBank ?? 0));
    this.incomePanel = idx.tryById<Phaser.GameObjects.Image>('layer_11_copy2');
    this.incomeAmountText = idx.tryById<Phaser.GameObjects.Text>('layer_13_copy7');
    this.incomeTimerText = idx.tryById<Phaser.GameObjects.Text>('layer_13_copy2');
    if (!this.incomePanel) return;
    this.incomePanel.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.claimStoreIncome());
    this.refreshStoreIncome();
    // 1초마다 남은 시간·금액 갱신(가벼운 텍스트 갱신뿐).
    this.incomeTicker?.remove(false);
    this.incomeTicker = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshStoreIncome() });
  }

  /**
   * 수금함 상한 = 한 주기(10분)분 총액 **× 업그레이드 배수**. 층이 늘면 상한도 자동으로 늘어난다.
   *   업그레이드는 아직 UI 가 없어 항상 레벨 0 이다(PO 2026-07-29 "이후에 기능을 추가할 예정") —
   *   세이브에 `storeIncomeLevel` 을 올려주기만 하면 상한과 시간당 수입이 함께 오른다.
   */
  private incomeCap(): number {
    return capacityFor(this.incomePerPeriodNow(), loadSave().storeIncomeLevel ?? 0);
  }

  /**
   * **시간 적립 반영**(PO 2026-07-29) — 마지막 정산 이후 흐른 시간만큼 수금함에 넣고 저장한다.
   *   화면 진입·1초 틱·손님 방문 등 **아무 때나 불러도 안전**하다(소비한 시간만 당기므로 중복 적립 없음).
   *   앱을 껐던 시간도 그대로 들어온다 — 서버 없이 기기 시계만으로 동작하는 기본 구현이다.
   *   ⚠️ 기기 시계를 앞으로 돌리면 그만큼 더 받는다(오프라인 보상의 알려진 한계) — 서버 시각 도입 시 해결 대상.
   */
  private tickStoreIncome(): void {
    const sv = loadSave();
    const at = this.storeIncomeAt();
    const r = accrueByTime(this.incomeBank, at, Date.now(), this.incomeCap(), this.incomePeriod());
    if (r.bank === this.incomeBank && r.lastAt === at) return; // 변화 없음 — 저장도 생략.
    this.incomeBank = r.bank;
    writeSave({ ...sv, storeIncomeBank: r.bank, storeIncomeAt: r.lastAt });
  }

  /** 배지 표시 갱신 — 수금함 잔액 + 남은 시간. 통합 구간이 아니면(3층 미만) 배지를 숨긴다. */
  private refreshStoreIncome(): void {
    const show = usesIntegratedClaim(this.builtFloors);
    this.incomePanel?.setVisible(show);
    this.incomeAmountText?.setVisible(show);
    this.incomeTimerText?.setVisible(show);
    if (!show) return;
    this.tickStoreIncome(); // 화면을 보고 있는 동안에도 시간 적립을 계속 반영.
    const cap = this.incomeCap();
    this.incomeAmountText?.setText(this.incomeBank.toLocaleString());
    // 가득이면 '수령'(=받을 수 있다), 아니면 남은 시간. ⚠️ 예전엔 '수령'/'가득'을 서로 다른 기준
    //   (타이머 vs 잔액)으로 판정해 **가득인데 수령이 안 되는** 모순 표시가 났다 — 이제 기준은 잔액 하나뿐.
    this.incomeTimerText?.setText(canClaim(this.incomeBank, cap) ? '수령' : formatIncomeTimer(msUntilFull(this.incomeBank, cap, this.incomePeriod())));
  }

  /**
   * 통합 수금 — 한 주기(전 층 발생)를 다 채웠을 때만 받는다(찔끔 수금 방지).
   *   ⚠️ **코인이 날아가는 연출은 여기가 아니라 '수익 발생 시점'에 있다**(`emitFloorIncome`) — 배지에는 이미
   *      코인이 모여 있는 상태이므로, 수령은 그 모인 금액을 지갑으로 옮기는 즉시 처리다.
   */
  private claimStoreIncome(): void {
    const now = Date.now();
    this.tickStoreIncome(); // 누른 순간까지의 적립을 먼저 반영하고 판정한다(1초 틱 사이의 오차 제거).
    const cap = this.incomeCap();
    if (!canClaim(this.incomeBank, cap)) {
      sfx('button');
      this.toast(`아직 모으는 중이에요 — ${formatIncomeTimer(msUntilFull(this.incomeBank, cap, this.incomePeriod()))} 남음`);
      return;
    }
    const amount = this.incomeBank;
    if (amount <= 0) {
      sfx('button');
      this.toast('아직 모인 수익이 없어요');
      return;
    }
    const s = loadSave();
    s.coins += amount;
    s.storeIncomeBank = 0; // 비우고
    s.storeIncomeAt = now; // 여기서부터 다시 10분.
    writeSave(s);
    this.incomeBank = 0;
    this.homeHeader?.setCoins(s.coins);
    sfx('coin_burst');
    this.pulseIncomeBadge();
    this.toast(`점포 수익 🪙 ${amount.toLocaleString()} 수령!`);
    this.refreshStoreIncome();
  }

  /**
   * 흡입 코인 크기 — **시작 0.125 → 도착 0.055**(PO 2026-07-28 "절반으로" 두 차례 반영).
   *   ⚠️ 두 값을 **같은 비율로** 줄여야 한다. 시작만 줄이면 날아가며 오히려 커져 보인다.
   */
  private static readonly COIN_FLY_START = 0.125;
  private static readonly COIN_FLY_END = 0.055;

  /** 층당 날릴 코인 수 — 한 층이 발생할 때 이만큼이 배지로 빨려든다. */
  private static readonly INCOME_COINS_PER_FLOOR = 4;

  /**
   * **손님 코인 → 수금 배지 흡입 연출**(PO 2026-07-28 "손님이 동전이 떨어지면서 수령점으로 조금씩 빨아들이도록")
   *   — 손님이 만족하고 코인을 떨어뜨린 **그 층에서** 코인이 튀어나와 수금 배지로 빨려든다.
   *
   *   ⚠️ 좌표계가 둘이다 — 층(점원)은 **월드**(mainCam, 타워와 함께 스크롤·줌)이고 배지는 **고정 UI**(uiCam)다.
   *      그래서 층의 현재 **화면 좌표**를 `cam.worldView` 로 역산해 코인을 UI 레이어에 띄운다(줌·스크롤 반영).
   *   숫자(배지 잔액)는 `refreshStoreIncome` 이 순수 로직(`pendingIncome`)으로 계산하므로, 이 연출이 실패해도
   *   금액이 어긋나지 않는다 — 연출은 **순수 장식**이다.
   */
  private flyCoinsToIncomeBadge(floor: number, amount: number, dropX?: number, dropY?: number): void {
    const panel = this.incomePanel;
    if (!panel || amount <= 0 || !this.textures.exists(CLAIM_COIN_KEY)) return;
    const cam = this.cameras.main;
    const view = cam.worldView;
    if (view.width <= 0 || view.height <= 0) return;
    // 점원이 없으면(아트 미배치) 층 파사드 중심에서 출발 — 연출이 통째로 빠지지 않게 폴백.
    // 출발점 = **손님이 코인을 떨어뜨린 자리**(customers 가 넘겨준 월드 좌표). 없으면 점원 → 층 파사드 순 폴백.
    const clerk = this.floorDecor.get(floor)?.char;
    const node = this.towerFloors[floor - 1]?.node;
    const world =
      dropX != null && dropY != null
        ? { x: dropX, y: dropY }
        : clerk
          ? { x: clerk.x, y: clerk.y }
          : node
            ? { x: node.x ?? W / 2, y: node.y }
            : null;
    if (!world) return;
    const from = {
      x: ((world.x - view.x) / view.width) * cam.width,
      y: ((world.y - view.y) / view.height) * cam.height,
    };
    const depth = (panel.depth ?? 0) + 5; // 배지 위로 지나가게.
    const perCoin = HomeScene.INCOME_COINS_PER_FLOOR;
    sfx('coin_burst', { volume: 0.125 }); // 흡입 연출음 — 손님마다 울리므로 작게(PO 2026-07-28 절반으로).
    for (let c = 0; c < perCoin; c++) {
      const coin = this.add
        .image(from.x + Phaser.Math.Between(-26, 26), from.y + Phaser.Math.Between(-18, 18), CLAIM_COIN_KEY)
        .setDepth(depth)
        .setScale(HomeScene.COIN_FLY_START);
      this.pinToUi(coin);
      const last = c === perCoin - 1;
      // **떨어지다 빨려드는 포물선**(PO 2026-07-28) — 손님이 떨어뜨린 자리에서 **먼저 아래로 떨어졌다가**
      //   수금 배지 쪽으로 휘어 빨려든다. 그래서 제어점을 출발점 **아래**(중점 위가 아니라)에 두고,
      //   가로로는 출발점 근처에 붙여(0.18) 초반에는 낙하처럼 보이게 한다.
      //   ⚠️ 제어점을 위에 두면 던져 올리는 토스 궤적이 된다 — 낙하감이 사라진다.
      const sx = coin.x;
      const sy = coin.y;
      const dist = Phaser.Math.Distance.Between(sx, sy, panel.x, panel.y);
      const fall = Math.min(120, dist * 0.26); // 거리에 비례한 낙하 깊이(과하지 않게 상한).
      const cxp = sx + (panel.x - sx) * 0.18; // 초반엔 거의 제자리에서 떨어진다.
      const cyp = sy + fall;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        delay: c * 60,
        duration: 520,
        ease: 'Cubic.easeIn', // 뒤로 갈수록 빨라져 '빨려드는' 느낌.
        onUpdate: (tw) => {
          if (!coin.scene) return; // 파괴된 뒤 좌표를 쓰지 않는다(게임 루프 사망 방지).
          const t = tw.getValue() ?? 0;
          const u = 1 - t;
          coin.x = u * u * sx + 2 * u * t * cxp + t * t * panel.x;
          coin.y = u * u * sy + 2 * u * t * cyp + t * t * panel.y;
          coin.setScale(Phaser.Math.Linear(HomeScene.COIN_FLY_START, HomeScene.COIN_FLY_END, t));
          coin.setAlpha(Phaser.Math.Linear(1, 0.9, t));
        },
        onComplete: () => {
          coin.destroy(); // 도착 즉시 정리(파괴된 뒤 트윈이 남지 않게).
          if (last) this.pulseIncomeBadge();
        },
      });
    }
  }

  /** 배지가 코인을 받아 삼키는 반응 — 짧게 커졌다 돌아온다. */
  private pulseIncomeBadge(): void {
    const panel = this.incomePanel;
    if (!panel) return;
    const base = panel.scaleX;
    this.tweens.killTweensOf(panel);
    panel.setScale(base);
    this.tweens.add({ targets: panel, scaleX: base * 1.1, scaleY: base * 1.1, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  private restoreClaimBubbles(): void {
    if (usesIntegratedClaim(this.builtFloors)) return; // 통합 수금 구간 — 층별 말풍선을 쓰지 않는다.
    const shown = Math.min(this.builtFloors, this.towerFloors.length);
    for (let level = 1; level <= shown; level++) {
      if ((this.floorBanks.get(level) ?? 0) >= FLOOR_COIN_GOAL) this.spawnClaimBubble(level);
    }
  }

  /**
   * 만족 방문 1회 → 이 층에 **떨어뜨린 코인 수만큼** 누적(세이브 반영). **100 도달 시 상한 고정 + 더 누적 안 함**
   *   (플레이어가 수령하기 전까지 정지). 목표 도달 시 점원 위 수령 말풍선 표시.
   */
  private accrueFloorCoins(floor: number, coins: number, dropX?: number, dropY?: number): void {
    if (floor < 1 || floor > this.builtFloors) return;
    // **3층부터는 통합 수금**(PO 2026-07-28) — 층별 말풍선을 쓰지 않는다.
    //   ⚠️ **적립은 여기서 하지 않는다**(PO 2026-07-29 "접속하든 안 하든, 플레이 중이든 수집") — 수익의 근거는
    //      오직 **시간**(accrueByTime)이다. 손님 방문은 그 적립을 **눈에 보이게 하는 연출**일 뿐이라,
    //      여기서 또 더하면 화면을 보고 있는 동안만 두 배로 쌓이는 이중 적립이 된다.
    if (usesIntegratedClaim(this.builtFloors)) {
      this.tickStoreIncome(); // 지금까지의 시간 적립부터 반영하고,
      if (isBankFull(this.incomeBank, this.incomeCap())) return; // 가득이면 연출도 생략(수령 대기).
      this.flyCoinsToIncomeBadge(floor, coins, dropX, dropY); // 손님이 떨어뜨린 자리 → 배지 흡입(연출만).
      this.refreshStoreIncome();
      return;
    }
    const cur = this.floorBanks.get(floor) ?? 0;
    if (cur >= FLOOR_COIN_GOAL) return; // **이미 가득참(100) → 수령 전까지 더 누적하지 않음.**
    const next = Math.min(FLOOR_COIN_GOAL, cur + Math.max(1, Math.floor(coins))); // 100 상한.
    this.floorBanks.set(floor, next);
    const s = loadSave();
    s.floorCoinBanks = { ...(s.floorCoinBanks ?? {}), [floor]: next };
    writeSave(s);
    // 목표(100) 도달 + 아직 말풍선 없음 → 수령 말풍선.
    if (next >= FLOOR_COIN_GOAL && !this.floorClaimBubbles.has(floor)) this.spawnClaimBubble(floor);
  }

  /**
   * **수령 말풍선** — 그 층 점원 머리 위에 말머리 풍선(UI_11) + 코인 아이콘(UI_2-3)을 띄운다.
   *   맥동으로 눈에 띄게. 탭하면 claimFloorCoins(코인 쏟아짐 → 유저 코인).
   */
  private spawnClaimBubble(floor: number): void {
    if (this.floorClaimBubbles.has(floor)) return; // 중복 방지.
    const clerk = this.floorDecor.get(floor)?.char;
    if (!clerk || !this.textures.exists(CLAIM_BUBBLE_KEY)) return;
    const headX = clerk.x;
    const headTop = clerk.y - clerk.displayHeight * clerk.originY; // 점원 머리 top.
    const bubY = headTop - 12;
    const baseDepth = (clerk.depth ?? 20) + 45; // 점원·유리 앞.
    const BW = 150;
    const bub = this.add.image(headX, bubY, CLAIM_BUBBLE_KEY).setOrigin(0.5, 1).setDepth(baseDepth);
    bub.setScale(BW / bub.width);
    this.pinToWorld(bub);
    const objs: Phaser.GameObjects.GameObject[] = [bub];
    // 코인 아이콘(말풍선 몸통 중앙).
    if (this.textures.exists(CLAIM_COIN_KEY)) {
      const cy = bubY - bub.displayHeight * 0.6;
      const coin = this.add.image(headX, cy, CLAIM_COIN_KEY).setOrigin(0.5).setDepth(baseDepth + 1);
      const fit = Math.min((bub.displayHeight * 0.52) / coin.height, (BW * 0.6) / coin.width);
      coin.setScale(fit);
      this.pinToWorld(coin);
      objs.push(coin);
    }
    this.floorClaimBubbles.set(floor, objs);
    // 팝인 + 맥동(수령 유도).
    bub.setScale((BW / bub.width) * 0.7);
    this.tweens.add({ targets: bub, scaleX: BW / bub.width, scaleY: BW / bub.width, duration: 260, ease: 'Back.easeOut' });
    for (const o of objs) this.tweens.add({ targets: o, y: `-=8`, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 탭 히트존(말풍선 전체) — 월드 좌표.
    const hit = this.add.zone(headX, bubY - bub.displayHeight / 2, bub.displayWidth, bub.displayHeight).setInteractive({ useHandCursor: true });
    this.pinToWorld(hit);
    hit.on('pointerdown', () => this.claimFloorCoins(floor));
    objs.push(hit);
  }

  /** 수령 — 점원 위에서 코인이 많이 쏟아지는 연출 후 유저 코인으로 적립. 누적 리셋 + 말풍선 제거. */
  private claimFloorCoins(floor: number): void {
    const amount = this.floorBanks.get(floor) ?? 0;
    if (amount <= 0) return;
    const clerk = this.floorDecor.get(floor)?.char;
    const bx = clerk ? clerk.x : W / 2;
    const by = clerk ? clerk.y - clerk.displayHeight * clerk.originY : H / 2;
    // 말풍선 제거 — **무한 맥동 트윈을 먼저 종료**하고 파괴(Phaser 는 destroy 시 트윈 자동취소 안 함 → 파괴된 객체에
    //   repeat:-1 트윈이 매프레임 계속 write 하는 좀비 누수 방지).
    this.floorClaimBubbles.get(floor)?.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.floorClaimBubbles.delete(floor);
    // 누적 리셋(세이브).
    this.floorBanks.set(floor, 0);
    const s = loadSave();
    s.floorCoinBanks = { ...(s.floorCoinBanks ?? {}), [floor]: 0 };
    s.coins += amount; // 유저 코인 적립.
    writeSave(s);
    this.homeHeader?.setCoins(s.coins);
    this.spawnCoinShower(bx, by, amount); // 코인 쏟아짐 연출.
    this.toast(`🪙 +${amount.toLocaleString()}`, true);
  }

  /**
   * 코인 샤워 — (x,y)에서 코인이 **손님 드랍처럼** 튀어나와 **커지며 흩어졌다가**, 상단 **코인 저장소(헤더)로
   *   빨려 들어가며** 사라진다. 스핀 코인 스프라이트(손님 드랍과 동일) 사용, 없으면 코인 아이콘 폴백.
   */
  private spawnCoinShower(x: number, y: number, amount: number): void {
    sfx('coin_burst', { volume: 0.35 });
    const spin = this.anims.exists(CUST_COIN_SPIN) && this.textures.exists('cust_coin_1');
    const coinKey = spin ? 'cust_coin_1' : this.textures.exists(CLAIM_COIN_KEY) ? CLAIM_COIN_KEY : 'up_Solitare_UI_2_3';
    if (!this.textures.exists(coinKey)) return;
    // **코인 저장소(헤더 코인 카운터)** 의 월드 좌표 — 현재 카메라 기준 화면 좌표를 월드로 역변환(빨려드는 목표).
    const target = this.cameras.main.getWorldPoint(HEADER_COIN_X, HEADER_COIN_Y);
    const n = Phaser.Math.Clamp(Math.round(amount / 8), 12, 24); // 코인 개수(금액 비례).
    for (let i = 0; i < n; i++) {
      const c = spin ? this.add.sprite(x, y, 'cust_coin_1') : this.add.image(x, y, coinKey);
      c.setDepth(4000).setScale(0.24);
      this.pinToWorld(c);
      if (spin) (c as Phaser.GameObjects.Sprite).play(CUST_COIN_SPIN);
      const dx = Phaser.Math.Between(-150, 150);
      const fallY = y + Phaser.Math.Between(30, 120); // 손님 드랍처럼 살짝 아래로 떨어짐.
      // ① 흩어지며 **커지며** 살짝 떨어진다(손님 코인 드랍 느낌).
      this.tweens.add({
        targets: c,
        x: x + dx,
        y: fallY,
        scale: Phaser.Math.FloatBetween(0.66, 0.92), // 작게 시작 → 커짐.
        duration: 360,
        delay: i * 28,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // ② 코인 저장소로 **빨려 들어가며** 축소·페이드(가속 진입).
          this.tweens.add({
            targets: c,
            x: target.x,
            y: target.y,
            scale: 0.18,
            alpha: 0.25,
            duration: 480,
            ease: 'Back.easeIn',
            onComplete: () => c.destroy(),
          });
        },
      });
    }
  }

  /**
   * 지붕을 **타워 최상단 층 위에 항상 얹는다**. 에디터 저작상 (지붕 하단 ↔ 최상단 층 상단) 관계를
   * 그대로 재현하되, 건설 상태로 최상단이 바뀌거나 에디터에서 층을 추가/재배치해도 지붕이 자동으로
   * 그 층 위로 옮겨가 항상 꼭대기를 덮는다. (지붕 노드 key 에 'roof' 포함 규칙.)
   */
  private capRoof(idx: LayoutIndex, floors: LayoutEntry[], topBuiltLevel: number): void {
    if (floors.length === 0) return;
    const roofEntry = idx.entries().find((e) => e.node.type === 'image' && /roof/i.test(e.node.key ?? ''));
    const top = floors[topBuiltLevel - 1];
    if (!roofEntry || !top) return;
    const roof = roofEntry.obj as Phaser.GameObjects.Image;
    const topFloor = top.obj as Phaser.GameObjects.Image;
    const roofNode = roofEntry.node;
    const floorTop = topFloor.y - topFloor.displayHeight / 2;
    // **지붕을 최상층에 붙인다** — 2번 라인 지붕(capLot2Roof)과 **같은 규칙**: 지붕 밑변이 최상층 윗변을
    //   LOT2_ROOF_OVERLAP 만큼 덮는다.
    roof.setY(floorTop - roof.displayHeight / 2 + LOT2_ROOF_OVERLAP);
    /*
     * **가로는 지붕 자신의 저작 중심 고정**(2026-08-31 "지붕이 오른쪽으로 치우쳐 보인다" — 노트8 실측).
     *   예전엔 `topFloor.x + (roofNode.x − 저작상 최상단층.x)` 로 **현재 최상층의 x를 따라갔다**. 그런데
     *   이 타워는 층마다 저작 x가 살짝 다르다(1·2층 550 vs 3층 이상 537, 저작 오차 ±10px) — 지붕은
     *   원래 3층 기준으로 얹혀 그 오차가 상쇄됐지만(540≈537+3), 1·2층만 지어진 초반 상태(전원 리셋 직후
     *   기본값)에서는 **다른 층의 x를 그대로 물려받아** 지붕이 화면 중앙(W/2=540)에서 13px 오른쪽으로
     *   밀렸다. 지붕 x(540)는 그 자체로 이미 캔버스 정중앙이라 — 최상층이 몇 층이든 **지붕은 자기
     *   저작 위치를 그대로** 쓰는 것이 옳다(세로만 최상층을 따라간다).
     */
    roof.setX(roofNode.x);
    roof.setDepth((topFloor.depth ?? 14) + 1); // 지붕은 최상층 위로.
    roof.setVisible(true); // 템플릿에서 지붕이 visible:false 여도 **항상 최상층에 표시**(요구사항: 배치 전에도 지붕 존재).
    // ⚠️ 간판(지붕)에는 **입력을 걸지 않는다** — 연출 확인용 탭은 검토가 끝나 제거했다(PO 2026-08-31).
    //   다시 필요하면 `roof.setInteractive(...).on('pointerdown', () => this.playTowerGrowthPreview(true))` 한 줄이면 된다.
  }

  private drawBackground(): void {
    if (this.textures.exists(BACK_BG_KEY)) {
      const img = this.add.image(W / 2, H / 2, BACK_BG_KEY).setDepth(-100);
      const src = texSize(img.texture);
      img.setScale(Math.max(W / src.width, H / src.height));
      return;
    }
    const g = this.add.graphics().setDepth(-100);
    const top = Phaser.Display.Color.IntegerToColor(0x9ad0f5);
    const bot = Phaser.Display.Color.IntegerToColor(0xf7c9e4);
    const fb = fullBleedBounds(this); // 캔버스 전체를 채운다.
    for (let i = 0; i < 40; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, 100, (i / 39) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(fb.x, fb.y + (fb.h / 40) * i, fb.w, fb.h / 40 + 1);
    }
  }

  private drawTitle(): void {
    this.add
      .text(W / 2, 130, 'SOLITAIRE', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '100px',
        color: '#ffffff',
        stroke: '#7a2d9a',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.add
      .text(W / 2, 218, 'HEIGHTS', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '64px',
        color: '#ffe066',
        stroke: '#7a2d9a',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  /** 플레이스홀더 타워(에디터 미저작 시) — 건설 상태 반영. */
  private drawPlaceholderTower(save: SaveData): void {
    let yb = BASE_Y;
    // 저작된 레벨 수만큼만(단, 층 아트는 5종 → 그 이하로) 그린다.
    const shownFloors = Math.min(this.levelCount(), FLOORS.length);
    for (let level = 1; level <= shownFloors; level++) {
      const floor = FLOORS[level - 1];
      const h = floor.artH * FLOOR_SCALE;
      const cy = yb - h / 2;
      this.placeFloor(level, cy, save);
      yb = cy - h / 2 + OVERLAP;
    }
  }

  private placeFloor(level: number, cy: number, save: SaveData): void {
    const floor = FLOORS[level - 1];
    const key = floorArtKey(level);
    const hasArt = this.textures.exists(key);
    const built = level <= save.builtFloors;

    const hit: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = hasArt
      ? this.add.image(W / 2, cy, key).setScale(FLOOR_SCALE).setDepth(level)
      : this.add
          .rectangle(W / 2, cy, floor.artW * FLOOR_SCALE, floor.artH * FLOOR_SCALE, floor.tint, 0.95)
          .setStrokeStyle(5, 0xffffff, 0.85)
          .setDepth(level);
    hit.setAlpha(built ? 1 : 0.16);

    if (!hasArt && built) {
      this.add
        .text(W / 2, cy, `${floor.name}\n${floor.sub}`, {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '40px',
          color: '#3a1030',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(level + 0.5);
    }

    if (built) {
      const s = hasArt ? FLOOR_SCALE : 1;
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.startPlay(level);
      });
      hit.on('pointerover', () => hit.setScale(s * 1.03));
      hit.on('pointerout', () => hit.setScale(s));
    } else if (level === save.builtFloors + 1) {
      this.placeBuildButton(W / 2, cy, level, save);
    }
  }

  /** 다음 층 건설 버튼(비용 표시). 코인 충분 → 건설 연출, 부족 → 안내. */
  private placeBuildButton(_x: number, _y: number, level: number, save: SaveData): void {
    const cost = FLOOR_COST[level] ?? 0;
    const can = DEMO_CONSTRUCTION || save.coins >= cost;
    const label = DEMO_CONSTRUCTION ? `🔨 ${level}층 배치\n(연출 보기)` : `🔨 ${level}층 건설\n💰 ${cost.toLocaleString()}`;
    this.buildBtn?.destroy();
    // **고정 UI 버튼**(상단·화면 고정) — 타워를 줌/스크롤해도 항상 눌러지도록 uiCam 대상.
    const btn = this.add
      .text(W / 2, 250, label, {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '40px',
        color: '#ffffff',
        align: 'center',
        backgroundColor: can ? '#3aa655' : '#7a6f7a',
        padding: { x: 30, y: 18 },
        stroke: '#2a1830',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(600)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.runConstruction(level, cost));
    this.buildBtn = btn;
    this.uiObjects.push(btn); // UI 카메라(고정) 대상.
  }

  /** 상단 코인 표시. */
  private drawCoins(save: SaveData): void {
    this.add
      .rectangle(44, 60, 320, 84, 0x2a1830, 0.6)
      .setOrigin(0, 0.5)
      .setDepth(700)
      .setStrokeStyle(3, 0xffffff, 0.3);
    this.add
      .text(70, 60, `🪙 ${save.coins.toLocaleString()}`, {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '46px',
        color: '#ffe9a0',
      })
      .setOrigin(0, 0.5)
      .setDepth(701);
  }

  private drawHint(save: SaveData): void {
    const done = save.builtFloors >= MAX_FLOORS;
    this.add
      .text(
        W / 2,
        H - 40,
        done ? '타워 완공! 지은 층을 탭해 플레이하세요' : '지은 층을 탭해 플레이 · 코인을 모아 위층을 건설하세요',
        { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '30px', color: '#ffffff', align: 'center' },
      )
      .setOrigin(0.5, 1)
      .setDepth(700)
      .setShadow(0, 2, '#000000', 4);
  }

  /** 문구별 표시 횟수 — 같은 메시지를 1~2회까지만(logic/messageStyle.ts). */
  /** 광고 제거(NoAds) 아이콘 — 구매 후에는 숨긴다. */
  private noAdsIcon?: Phaser.GameObjects.Image;

  private readonly msgCounts = loadMessageCounts();

  private toast(msg: string, ok = false): void {
    // **홈의 안내는 언제나 팝업창으로**(PO 2026-08-23) — 여기 뜨는 문구는 플레이어가 직접 누른 것에
    //   대한 응답(건설 잠금·수령 결과)이라 반복돼도 격을 낮추면 안 된다. 창 없이 낮추는 규칙은
    //   플레이 화면의 상시 안내(PlayScene.toast)에만 적용한다.
    const withPanel = true;
    shouldShowMessage(this.msgCounts, msg); // 횟수는 계속 세어 둔다(다른 규칙이 참고).
    saveMessageCounts(this.msgCounts);
    const layer = this.add.container(W / 2, H * 0.5).setDepth(TOAST_DEPTH);
    // **노란 창 = 숫자 등 짧은 표시 · 초록 창 = 문장**(PO 2026-08-22).
    const panelKey = withPanel ? (isShortMessage(msg) ? TOAST_PANEL_KEY : TOAST_SENTENCE_KEY) : '';
    // **작은 메시지 팝업 아트**(up_Solitare_UI_29) — 점원 코인 수집처럼 짧은 숫자·문구를 띄우는 창
    //   (PO 2026-08-22). 아트가 없으면 예전처럼 색 배경 텍스트로 폴백한다.
    const t = this.add
      .text(0, 0, msg, {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '48px',
        color: this.textures.exists(panelKey) ? '#4a2f14' : '#ffffff',
        align: 'center',
        stroke: ok ? '#ffffff' : '',
        strokeThickness: ok && !this.textures.exists(panelKey) ? 4 : 0,
        wordWrap: { width: W * 0.66 },
      })
      .setOrigin(0.5);
    if (this.textures.exists(panelKey)) {
      // **글자 크기에 맞춰 창이 커진다**(PO 2026-08-22) — 폭만 보고 잡으면 두 줄짜리 문구에서
      //   글자가 테두리에 닿는다. 세로도 필요한 만큼 확보하되 아트 비율을 먼저 지키고,
      //   폭 상한에 걸리면 그때만 세로로 늘린다.
      //   ⚠️ 창의 **안쪽 영역**(테두리·꼬리를 뺀 자리)을 기준으로 키우고 글자를 그 한가운데 앉힌다
      //   (PO 2026-08-23) — 이미지 정중앙에 놓으면 아랫줄이 테두리에 걸린다. 실측은 ui/messagePanel.ts.
      const sentence = !isShortMessage(msg);
      const fit = fitMessagePanel(sentence ? GREEN_PANEL : YELLOW_PANEL, t.width, t.height, {
        minW: W * (sentence ? 0.72 : 0.56),
        maxW: W * 0.94,
        padX: 60,
        padY: 44,
      });
      const { pw, ph } = fit;
      t.setY(fit.textY);
      layer.add(this.add.image(0, 0, panelKey).setDisplaySize(pw, ph));
    } else {
      layer.add(this.add.rectangle(0, 0, t.width + 80, t.height + 48, ok ? 0x2e9e4f : 0xc0392b, 0.95));
    }
    layer.add(t);
    // ⚠️ **팝업보다 위**(팝업 레이어 4000~5000). 예전엔 1500 이라 진입 팝업에서 띄운
    //   '코인이 부족해요' 가 팝업 뒤에 가려 보이지 않았다(PO 보고 2026-08-21).
    this.pinToUi(layer); // 토스트는 UI(고정) 카메라 전용.
    // 성공은 살짝 팝 + 조금 더 오래 유지.
    if (ok) {
      layer.setScale(0.8);
      this.tweens.add({ targets: layer, scale: 1, duration: 240, ease: 'Back.easeOut' });
    }
    this.tweens.add({
      targets: layer,
      alpha: 0,
      y: H * 0.42,
      duration: 800,
      // **최소 1.6초 유지**(PO 2026-08-22) — 예전엔 실패 안내가 0.5초 만에 사라져 읽히지 않았다.
      delay: withPanel ? (ok ? 1800 : 1600) : 900, // 창 없는 반복 표시는 짧게 스친다.
      onComplete: () => layer.destroy(),
    });
  }
}
