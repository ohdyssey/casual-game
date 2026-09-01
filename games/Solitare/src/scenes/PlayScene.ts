/**
 * PlayScene — 솔리테어 하이츠 본편(에디터 SSOT 크롬 + 실제 플레이).
 *
 * 구성:
 *   ① 화면 크롬 = **에디터 저작 main.json 이 SSOT**(배경 layer_1 · 베이커리 storefront layer_2 ·
 *      내부 진열장 layer_3 · 검은 반투명 암막 보드 패널 layer_4). 코드 배경/타워/암막은 이제
 *      main.json 이 크롬을 저작하지 않은 경우의 **폴백**으로만 남는다.
 *   ② 암막 보드 패널(layer_4) 세로 범위 안에서 ±1 순환 솔리테어(팬 그룹) 진행.
 *
 * 규칙 = ±1 + 순환(A↔K). 팬 그룹: 앞면(노출) 탭 제거 → 뒤의 두 장이 열림. 엔진은 src/logic/*(순수).
 * ⚠️ HD(1080×2400) — 코어 720 responsive 헬퍼 미사용. 절대 좌표(순수 FIT 1:1).
 */
import Phaser from 'phaser';
import {
  loadGameAssets,
  UI_MAIN_KEY,
  UI_HOME_KEY,
  BACK_BG_KEY,
  CARD_BACK_KEY,
  floorArtKey,
  CHAR_SHEETS,
  uploadPath, texSize } from '../assets.js';
import { anchorDoc, buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { Pedestrian, pathToWaypoints } from './pedestrians.js';
import { CardView } from './cardView.js';
import { levelDef, editorLevelCount, MAX_PROGRESS_LEVEL, FLOORS } from '../logic/levels.js';
import { preloadAudio, playBgm, sfx, sfxCardPlace, sfxWinSting, cycleVolume, volumeLabel, LAB_SILENT } from '../audio.js';
import { hapticsLabel, toggleHaptics } from '../haptics.js';
import { buildTopHeader, type TopHeader } from './topHeader.js';
import { openItemShop } from './itemShop.js';
import { buildMissionRewardBanner, type MissionRewardBanner } from './missionRewardBanner.js';
import { buildEntryPopup } from './entryPopup.js';
import { squashInObjects } from './popupFx.js';
import { beginPlaySession, endPlaySession, playSessionRewards, revokePlaySession } from '../logic/playSession.js';
import { openStarterOffer } from './starterOffer.js';
import { bumpMetrics } from '../logic/dailyMetrics.js';
import { preloadCustomers, registerCustomerFrames, startCustomerVisits, type CustomerSpot } from './customers.js';
import { OrderQueue } from './orderQueue.js';
import type { CardBoardDoc } from '../logic/editorLevels.js';
import { EDITOR_LEVELS_KEY } from '../logic/editorLevels.js';
import { seededRng } from '../logic/deck.js';
import { DYN_STOCK_REDUCE, dealDynamic } from '../logic/solvable.js';
import type { Grade } from '../logic/difficulty.js';
import { loadSave, writeSave, itemsOf, missionRewardOf, collectionOf, loadTipsSeen, markTipSeen, type SaveData } from '../save.js';
import { applyStars as applyMissionStars } from '../logic/missionReward.js';
import { CARD_COMPLETE_COUNT, COLLECTIBLE_SETS, cardCount, grantCard, pickRandomCard, type CollectionSlot } from '../logic/collection.js';
import { CARD_ART_SETS, collectionArtKey, collectionCardKey } from './collectionPopup.js';
import { UI_RESULT_KEY, UI_RESULT_PATH, buildResultPopup } from './resultPopup.js';
import { collectResultRewards } from './rewardCollect.js';
import {
  ECON_JSON_KEY,
  ECON_JSON_URL,
  setEconFromJson,
  entryFeeFor,
  challengeOptions,
  starCoinsAt,
  plus5PriceAt,
  wildPriceAt,
  undoPriceAt,
  circledCount,
  econ,
} from '../econRuntime.js';
import { incomePerPeriod, playIncomeFor, addToBank } from '../logic/storeIncome.js';
import { pickTip, TIPS, type TipKey } from '../logic/tutorial.js';
import { stockFanLayout } from '../logic/stockFan.js';
import { pickBotMoves } from '../logic/botPolicy.js';
import {
  RESCUE_MAX_LEVEL, PLUS5_CURATED_MAX_LEVEL, bonusValueForLevel, pickSpecialSlots,
  MISSION_REWARD_TABLE, MISSION_SET_SIZE, MISSION_STARS_MAX, MISSION_STARS_MIN, collectionWeightForLevel, missionStockAmount, stockIsAmple, clearRewardsForGrade,
  type MissionRewardKind, plus5AssistFor } from '../logic/economyRules.js';
import { GAUGE_STAR_XS, GAUGE_STAR_Y, GAUGE_STAR_SZ, GAUGE_BAR_GEOM } from '../ui/gaugeGeom.js';
import { isShortMessage, shouldShowMessage } from '../logic/messageStyle.js';
import { fitMessagePanel, GREEN_PANEL, YELLOW_PANEL } from '../ui/messagePanel.js';
import { loadMessageCounts, saveMessageCounts } from '../save.js';
import { STAR_CUTS, STAR_RATIO_CUTS, MAX_STARS, starsForQuality, starsForRatio, referenceQuality, matchGain, playingQuality, finalQuality, qualityWithCleanFloor } from '../logic/starRating.js';
import { SUITS, RANKS, type Card, type Rank, type Suit } from '../logic/types.js';
import {
  type GameState,
  wasteTop,
  isExposed,
  isPlayable,
  availableMoves,
  playCard,
  playWild,
  addStockCards,
  addWildCards,
  bankWildToStock,
  consumeBonusCard,
  drawStock,
  refillStock,
  refillableCount,
  remaining,
  isWin,
  isStuck,
} from '../logic/tripeaks.js';
import type { LayoutSlot } from '../logic/layouts.js';
import { autoTestState, recordAutoTestResult, exportAutoTestData, type LevelTestResult } from './autoTest.js';
import { boardView, type BoardView, type SlotView } from '../logic/boardView.js';
import { appendError } from '@casual/core';
import { SAFE_H as H, SAFE_W as W } from '../logic/responsiveFrame.js';
import { MAIN_ANCHOR } from '../ui/mainPins.js';
import { SAFE_W, coverScale } from '../logic/responsiveFrame.js';
import { fullBleedBounds, viewBounds } from '@casual/core';
import { overlayLayer, overlayScrim } from '../ui/overlay.js';
import { centerSafeZone } from '../ui/safeZone.js';
import { uiButton } from '../ui/uiButton.js';
import { creditEventItems, creditLeagueStars, previewEventItems, eventBannerView, leagueStageOf, leagueTargetFloor, openFloorOf } from '../logic/collectRuntime.js';
import { backupTowerSnapshot, mirrorClearReward, mirrorLeagueGrand, mirrorRoundReport } from '../logic/serverSync.js';
import { eventStageTarget, eventTargetIconKey, type EventTargetKind } from '../config/thiefEvent.js';
import { floorItemKey } from '../config/floorItems.js';
import { currentStore, type StoreRef } from '../logic/currentStore.js';
import { attachLeagueBadge } from '../ui/leagueRail.js';
import { openEventPanel } from '../ui/eventPanel.js';
import { LEAGUE_STAGE_COUNT, leagueGrandCoins, stageCoins, stageGoal } from '../logic/dailyLeague.js';
import { profileOf } from '../logic/leagueRuntime.js';
import { openLeaguePanel } from '../ui/leaguePanel.js';

import { progressNow as eventProgressNow, thiefPeriodId } from '../logic/thiefEvent.js';

/**
 * **수집 드랍 임계 콤보** — 뽑기 없이 이 수만큼 이어 내면 상품 1개가 떨어진다.
 * 3 인 근거: 레벨 1~300 · 2,400판 실측에서 3콤보는 판당 2.47개(하루 10판 ≈ 25개)로
 * "플레이하면 나온다"가 되지만, 5콤보는 0.72개라 절반 넘는 판에서 한 번도 안 나온다.
 * 1~2연속(전체 런의 62%)에서는 안 나오므로 실력 보상 성격도 유지된다.
 */
import { topUiShift } from '../ui/safeAreaUi.js';

// 저작(=세이프존) 프레임 — 좌표 계약의 단일 출처는 logic/responsiveFrame.ts 다.
//   ⚠️ 이 값은 **캔버스 크기가 아니라 저작 크기**다. 캔버스는 앞으로 가변이 될 수 있으므로
//      화면 전체를 덮는 요소(딤 등)는 W/H 가 아니라 scene.scale.width/height 를 써야 한다.
/** 레벨 점검 시뮬레이션의 한 수 간격(게임시간 ms) — 실제 간격은 이 값 ÷ 배속. 1배속에서 0.7초/수. */
const SIM_TICK_MS = 700;

// 보너스(+N) 카드 값 → 아트 키(에디터 업로드). +5 는 08-4, 나머지는 숫자와 일치.
//   **+10 카드 제거**(PO 2026-07-17 "10개는 너무 많다") — 최대 +5.
const BONUS_VALUES: readonly number[] = [1, 2, 3, 5];
const BONUS_ART: Record<number, string> = {
  1: 'up_Solitare_UI_08-1',
  2: 'up_Solitare_UI_08-2',
  3: 'up_Solitare_UI_08-3',
  5: 'up_Solitare_UI_08-4',
};
// 보너스 값 패턴·초반 상한은 logic/economyRules.ts(단일 출처 — 시뮬레이터와 공유).

// 에디터 저작 레벨 팩(public/levels/cardLevels.json) 캐시 키.
const EDITOR_PACK_KEY = 'editorLevelPack';
/**
 * 레벨 팩 요청 경로 — **개발 중에는 캐시를 무시**한다.
 * 팩(JSON)을 고쳐도 브라우저/서비스워커가 옛 사본을 계속 주면 예전 난이도로 플레이하게 되고, 그걸
 * "레벨이 이상하다"로 오해하게 된다(실제로 겪음: 서버는 새 팩을 주는데 화면은 옛 팩이었다).
 * dev 에서만 타임스탬프를 붙여 항상 새로 받는다(배포본은 파일이 바뀌면 경로 해시가 바뀌므로 불필요).
 */
export const EDITOR_PACK_URL = import.meta.env.DEV
  ? `levels/cardLevels.json?t=${Date.now()}`
  : 'levels/cardLevels.json';

// 부스터 코인 비용 — **경제모델(econRuntime) 적용**(P3): 레벨 곡선×램프×도전 배수, 재사용 가산.
//   되돌리기도 유료(undoPriceAt, PO 2026-07-16). 보유 아이템이 있으면 코인 대신 아이템 소모(원문자 표시).
const ADD5_COUNT = 5; // ＋5 카드 = 소모 카드 5장을 스톡으로 되돌림.
/**
 * **튜토리얼 글자 크기(저작 px)** — 안내 창마다 제각각이던 값을 한곳으로 모았다(PO 2026-08-22
 * "폰트 사이즈가 통일되어 있지 않음"). 전체적으로 한 단계씩 키워 작은 화면에서도 읽히게 한다.
 */
const TIP_FONT_SIZE = { title: 58, body: 40, foot: 34, label: 36, tag: 34, caption: 34 } as const;
/** 튜토리얼 포인터 아이콘(업로드 에셋). 없으면 이모지 폴백. */
const TUTORIAL_POINTER_KEY = 'up_Solitare_UI_26';
/** 메시지를 **그대로 유지**하는 시간(ms) — 이 뒤에 페이드아웃이 시작된다. */
const TOAST_HOLD_MS = 1600;
/** **작은 메시지 창**(노란 프레임, 1536×1024) — 코인 숫자·획득 안내 등 짧은 문구용. */
const SMALL_MSG_PANEL_KEY = 'up_Solitare_UI_29';
/** **일반 메시지 창**(초록 프레임, 가로 리본 2172×724) — 코인 부족 등 짧은 알림 전용. 튜토리얼 말풍선과 구분한다. */
const MESSAGE_PANEL_KEY = 'up_Solitare_UI_28';
/** 안내 말풍선 패널(업로드 에셋, 아래쪽 꼬리가 대상을 가리킨다). 없으면 사각형 폴백. */
const TUTORIAL_PANEL_KEY = 'up_Solitare_UI_27';
/** 패널 원본 비율(1122×1402) — 표시 크기는 폭으로 정하고 높이를 이 비율로 맞춘다. */
const TUTORIAL_PANEL_RATIO = 1402 / 1122;

/**
 * 되돌리기 히스토리 1스텝 — GameState + **GameState 밖 씬 래치**를 함께 스냅샷한다.
 *   (예전엔 GameState 만 저장해, undo 후 wildBanked/bonusTriggered/setsCompleted/comboColors 가 되돌지 않아
 *    특수카드 영구 무력화·미션게이지 파밍 버그가 있었다.)
 */
/**
 * 히스토리 1칸이 되돌리는 **행동의 종류** — `'other'`(카드 내기 등 결정적인 수)를 뺀 나머지는 **rng 로 결과가
 *   갈리는 수**라, 되돌린 뒤 같은 행동을 다시 하면 결과가 달라진다(PO 2026-07-27 "되돌리기 이후 다시 뽑으면
 *   새로운 카드가 나타난다 — 유저가 혼란"). undo 가 그 결과를 기억해 두고 같은 자리에서 재현한다.
 */
type HistoryKind = 'other' | 'draw' | 'plus5' | 'plus5draw';

interface HistorySnap {
  readonly state: GameState;
  /** 이 스냅샷 **다음에 일어난** 행동의 종류(undo 가 재현 대상인지 판단). */
  readonly kind: HistoryKind;
  readonly wildBanked: boolean;
  readonly bonusTriggered: boolean;
  readonly starGauge: number;
  readonly setsDone: number; // 완성 세트 수(별 판정 소스) — 게이지와 함께 되돌려 세트 파밍 방지.
  readonly wildActive: boolean; // **기준 위 와일드 활성 여부** — undo 가 되돌린 뒤 와일드가 사라지지 않도록(PO 2026-07-17).
  /**
   * **콤보 런**(수 직전) — 되돌리면 콤보도 그 수 직전으로 돌아간다(PO 2026-08-24: "되돌리기 아이템을
   * 쓸 경우 콤보가 리셋되는 문제"). 예전엔 undo 가 무조건 `resetComboRun()` 을 불러, 애써 이어 온
   * 콤보가 한 번의 되돌리기로 사라졌다 — 되돌리기를 쓸수록 손해라 아무도 쓰지 않게 된다.
   */
  readonly comboColors: readonly Suit[];
  readonly melodyStep: number;
  /**
   * **미션 진행 래치**(PO 2026-08-24 신고: "되돌리기를 쓰면 보드에 아이템이 두 개 배치된다").
   *
   * 미션 보상은 콤보가 끝나는 순간 보드에 꽂힌다. 되돌리기는 판 상태만 되돌리고 **이미 꽂힌 물건**은
   * 그대로 두었기 때문에, 같은 콤보를 다시 완성하면 **한 번 더** 꽂혔다. 수 직전에 "그때 꽂혀 있던
   * 슬롯"을 적어 두고, 되돌릴 때 그 뒤에 생긴 것만 걷어낸다.
   */
  readonly pendingMissions: number;
  readonly starSlots: readonly string[];
  readonly stockSlots: readonly string[];
  readonly boardCollections: readonly string[];
}

// ── 미션 콤보(에디터 크롬 전용) ────────────────────────────────────────
// 콤보로 카드를 연속 매칭 → 오른쪽 상단 박스(PLAY MISSION)의 5칸이 맞춘 카드 색으로 채워진다.
// 5칸이 다 차면 한 세트 완료. **별 = 완성 세트 수**(아래 SETS_FOR_*), 게이지는 시각 연출용.
const STOCK_REWARD_KINDS = new Set<MissionRewardKind>(['cards', 'plus5', 'wild']);
/**
 * "뽑기가 넉넉하다"의 기준 — 남은 보드 카드 대비 비율.
 *   **2026-08-22 0.5 → 0.25** — 0.5 는 너무 후해서 중반에 거의 발동하지 않았다(남은 보드 20장이면
 *   뽑기 10장을 들고 있어야 넉넉 판정). 그 사이 미션 보상이 계속 뽑기를 얹어, 콤보를 잘 잇는 판일수록
 *   끝에 5~7장이 남았다(PO 실측 lv231). 연쇄 덕분에 뽑기 1장이 평균 2장 이상을 치우므로
 *   `남은보드 × 0.25` 면 이미 충분하다.
 */
/** 위 비율의 하한(장) — 보드가 거의 끝났을 때 기준이 0 이 되는 걸 막는다. */
const SET_SIZE = MISSION_SET_SIZE; // 미션 1틱 = 5매칭 — 값은 logic/economyRules.ts(시뮬레이터와 공유). 손님 주문 별도 이 배수.
const SETS_TARGET = 5; // 별 최대 **5개**(최종 5별 구조) — 보상 팝업 별 아이콘 수.
// 레벨 클리어 별 등급 = accumStars(좌측 5칸 게이지에 축적된 별 수, 0~5)로 판정(checkEnd).
// 별 개수별 코인 보상 — save.ts starCoins(게임비 연동, 2별부터 순이익)로 이관(2026-07-16).

// ── 미션 보상(콤보 5 완성 시, PO 2026-07-17) ──────────────────────────────
//   **좌측 5별 게이지 = 콤보 진행**(매치마다 +1). **+5 완성 → 미션 보상 지급** + 게이지 리셋 + 다음 보상 재추첨.
//   우측 MISSIONS 패널이 **다음 보상을 미리 예고**(아이콘+수량, 완성 전까지 고정 — pre-announced).
//   테이블: 코인·추가카드 자주 / 다이아·와일드·+5카드 드묾.
//   **컬렉션 카드**(2026-07-26 PO) — 이 예고 슬롯에 **아직 못 모은 컬렉션 카드가 랜덤으로** 뜰 수 있고,
//   지급되는 순간 "어떤 카드를 뽑았는지" 확대 연출로 보여준 뒤 콜렉션 보관함으로 날아간다.
/** 보드에 꽂힌 컬렉션 카드 1장 — 슬롯별로 독립된 상태를 가진다(동시 여러 장 지원). */
interface BoardCollection {
  readonly slotId: string;
  readonly card: CollectionSlot;
  readonly view: Phaser.GameObjects.Image;
  /** 오픈(수집) 연출을 이미 시작했는가 — 1회 보장. */
  opened: boolean;
  /** 획득 연출이 도착해 뱃지가 켜졌는가 — 켜지기 전엔 수집 트리거를 보류한다. */
  armed: boolean;
  /** 뱃지가 도착하기 전에 그 카드를 이미 냈는가 — 도착 즉시 수집. */
  played: boolean;
}

// 미션 보상표·콜렉션 가중치·뽑기 넉넉 판정은 **logic/economyRules.ts 단일 출처**(시뮬레이터와 공유).
//   여기는 씬 전용(아이콘·연출·CollectionSlot 확장)만 남긴다.
interface MissionReward {
  readonly kind: MissionRewardKind;
  readonly amount: number;
  /** kind='collection' 일 때만 — 추첨된(예고된) 컬렉션 카드 슬롯. 지급 시 이미 보유했으면 재추첨. */
  readonly slot?: CollectionSlot;
}
const MISSION_ICON: Record<MissionRewardKind, string> = {
  stars: 'up_Solitare_UI_02_v2', // 리그 별(좌측 게이지와 같은 아트).
  cards: 'up_Solitare_UI_08-2_v2',
  diamond: 'up_Solitare_UI_2_2',
  wild: 'up_Solitare_UI_08',
  // ⚠️ plus5 는 예전에 `up_Solitare_UI_07`(= **되돌리기 그림**)을 쓰고 있었다 — 화면엔 리와인드가 뜨는데
  //    실제로는 뽑기 ＋3장이 나왔다(PO 2026-08-24 지적). 부스터 패널과 **같은 아트**로 맞춘다.
  plus5: 'up_Solitare_UI_06-1', // ＋5 카드(부스터 layer_11 과 동일 아트).
  undo: 'up_Solitare_UI_07-1', // 되돌리기(부스터 layer_10_copy 와 동일 아트).
  collection: 'up_CollecttionCard_Frame', // 폴백(슬롯 추첨 전) — 실제로는 추첨된 카드 아트로 대체된다.
};
// 컬렉션 카드가 "보관되는" 곳 — 콜렉션은 홈 상단 우측(Pass 아이콘)에서 열린다. 플레이 화면엔 아이콘이
//   없으므로 헤더 우측 끝(메뉴 근처)을 보관함 방향으로 삼아 카드가 그쪽으로 빨려 들어간다.
const COLLECTION_STORE_TARGET = { x: 1005, y: 90 } as const;
/** 보드에 꽂히는 **투데이 리그 별** 아트 — 좌측 5별 게이지와 같은 그림(같은 것을 모은다는 신호). */
const LEAGUE_STAR_KEY = 'up_Solitare_UI_02_v2';
// 좌측 5별 게이지 위치 — HUD 배경 UI_10-1_v3 의 별 외곽선 5개 중심(정밀 측정, layer_15_copy3 x=104 정합).
// 게이지 좌표는 **ui/gaugeGeom.ts 단일 출처** — 보너스 라운드(PlayKlondikeScene)가 같은 HUD 를 쓴다.
//   여기서 베껴 두면 저작이 바뀔 때 한쪽만 따라가 어긋난다.
// **콤보 점수 기반 별 등급** — 매치마다 현재 콤보 길이(캡)를 가산(초선형). 동기 누적이라 긴 콤보가
//   마지막 정산에서 누락되던 역전이 없다. 가산량·컷은 starRating.ts(matchGain)가 정한다.
// ⚠️ 별 컷·품질 공식은 **src/logic/starRating.ts 로 이관**(PO 2026-07-29) — 게임과 시뮬레이션이 같은 함수를
//   쓰도록. 최종평가는 **3축**(① 연속 콤보 ② 남은 카드 수 ③ ＋5 없이 클리어)의 가중합이고, 이 씬은
//   그 함수들에 원재료(comboScore·leftover·stockSize·plus5Uses)를 넘기는 역할만 한다.

/**
 * 텍스트에 **이탤릭 + 우측 패딩** 적용 — Phaser Text 는 이탤릭 기울기만큼 캔버스 폭이 모자라 **끝 글자가 잘린다**.
 *   fontStyle 을 'italic' 로 두고 우측 패딩을 폰트크기의 ~35% 주어 잘림을 없앤다(PO 2026-07-17 지적).
 */
function applyItalic(t: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  const fs = typeof t.style.fontSize === 'string' ? parseInt(t.style.fontSize, 10) : 32;
  t.setFontStyle('italic');
  t.setPadding(0, 0, Math.ceil((fs || 32) * 0.35), 0); // 우측 패딩(끝 글자 잘림 방지).
  return t;
}

// 동적으로 제어하는 에디터 노드(정적 크롬에서 제외 → 코드가 직접 그린다).
//   layer_7=게이지 채움 샘플 · layer_14~16=보상 팝업 목업 · layer_13*/17/19/8_copy4=미션 리워드 배너(2026-07-18,
//   missionRewardBanner.ts 가 홈·플레이 공용으로 대신 그린다 — home.json 에 없는 노드라 정적 크롬에 맡기면 플레이에만 뜬다).
export const DYNAMIC_NODE_IDS: ReadonlySet<string> = new Set([
  'layer_7', // 좌측 게이지 채움 트랙(구) — 5별 게이지로 대체, 정적 렌더 제외.
  'layer_15_copy3', // 좌측 게이지 첫 별 — 코드가 5별을 직접 생성하므로 정적 렌더 제외.
  'layer_14',
  'layer_15',
  'layer_15_copy',
  'layer_15_copy2',
  'layer_16',
  'layer_13', // 미션 리워드 배지(up_Rewards_01_v2) — missionRewardBanner.ts.
  'layer_13_copy', // 타이틀 리본(up_Rewards_03).
  'layer_13_copy2', // 좌측 아이콘 원판(up_Rewards_02).
  'layer_13_copy3', // 우측 GO 아이콘(up_Rewards_05).
  'layer_13_copy4', // 타이머 배경(up_Rewards_04).
  'layer_13_copy5', // 아이템(캔) 아이콘(up_Item_01_01-4).
  'layer_17', // 진행 바 채움(파랑) — 진행도 비례로 코드가 채운다.
  'layer_19', // 타이머 텍스트 — 실시간 카운트다운으로 코드가 갱신.
  'layer_8_copy4', // 진행도 텍스트("N/goal") — 코드가 갱신.
]);

// 층 아트 배치(상단) — 아래 반투명 보드와 붙는다(에디터 크롬 없을 때의 폴백에서만 사용).
const FLOOR_ART_H = 500;
const DARK_TOP = 728; // 반투명 보드 상단(= 건물 하단에 붙음) — layer_4 패널 상단(2026-07-18 전체 하향 조정 반영, 645+83).

// 기준 카드 크기(scale=1). 실제 표시 크기는 레벨 배치에 맞춰 축소(geom.scale)한다.
const BASE_CARD_W = 132;
const BASE_CARD_H = 181;

/**
 * 카드 크기 조정 손잡이 — **이 값 하나만** 바꾼다(다른 상한/함수는 이 게임에서 실행 안 됨).
 *   `1.0` = 확정 기준 크기 = **에디터에서 저작한 카드 크기(card-editor.html CARD_W/H = 120×164) 그대로**(1:1).
 *   키우려면 1.1(=10%↑), 줄이려면 0.9(=10%↓). 에디터·게임·레벨데이터가 모두 이 크기로 통일됨(숨은 배율 없음).
 *   ⚠️ 카드 크기 자체를 바꿀 땐 에디터(CARD_W/H)와 함께 바꿔야 에디터==게임 일치가 유지된다.
 *      이 값(CARD_SIZE)은 게임에서만 미세조정할 때 쓰는 배수이며, 1.05 근처를 넘으면 배치가 넓은 레벨이
 *      보드 fit 에 먼저 걸려 레벨 간 크기가 갈라질 수 있다(오버플로 방지).
 */
const CARD_SIZE = 1.0;

/**
 * 실제 적용 상한 — **1.15**(PO 2026-08-25 "좌우 패딩 줄여 카드 확대"). 보드 폭(970)보다 좁게 저작된 레벨은 최대 15% 까지
 *   커지고, 보드를 다 쓰는 레벨은 1:1 그대로. 균일 스케일이라 커버 판정(15% 겹침)·정답 수순은 불변.
 *   ⚠️ 레벨 간 카드 크기 편차가 최대 15% 생긴다 — 그 이상 올리지 말 것(구 1.0 = 편차 0 이 원래 의도였다).
 */
const ABS_CARD_MAX_SCALE = 1.15 * CARD_SIZE;
/** 가로 fit 기준 = 보드 폭의 95% — 확대 시 카드가 암막 패널 가장자리에 붙어 답답해 보이지 않게 소량 여백을 남긴다. */
const ABS_FIT_W_RATIO = 0.95;

// 보드 영역 기본값(폴백) — 에디터 암막 패널(layer_4)이 있으면 그 세로 범위로 덮어쓴다(applyEditorChrome).
/**
 * **보드 상단 안쪽 패딩** — 에디터 암막 패널 상단에서 이만큼 내려온 지점이 보드 영역의 시작이다
 *   (applyEditorChrome 가 `panelTop + BOARD_TOP_PAD` 로 boardTop 을 잡는다).
 *   PO 2026-07-27 "상단에 여백을 조금 확보하세요" — 48 → 110. fit 이 걸린 레벨은 맨 윗줄 카드가 패널 상단에
 *   거의 닿아 있었다(여백 ≈58px). 이 값이 곧 그 여백이라 여기만 바꾸면 된다.
 */
const BOARD_TOP_PAD = 110;
const BOARD_TOP = 763 + (BOARD_TOP_PAD - 48); // 에디터 크롬이 없을 때의 폴백 — 위 패딩 변화량을 같이 반영.
// **보드 하단**(PO 2026-07-27 "하단 스톡카드와 보드카드가 너무 붙어 있습니다") — 1950 → 1870 으로 80px 올려
//   스톡과의 간격을 벌렸다. 이어서 "상단에 여백을 조금 확보" 요청으로 상단 패딩을 62px 늘렸는데(BOARD_TOP_PAD),
//   둘을 다 적용하면 영역이 13% 줄어 카드가 눈에 띄게 작아진다 → 하단을 40px 되돌려 **1910** 으로 상쇄.
//   결과: 상단 여백 +62px · 하단 간격은 원래(108px)보다 여전히 여유(≈148px) · 영역 높이는 거의 그대로.
const BOARD_BOTTOM = 1910;
// **아래로 내리는 바이어스**(PO 2026-07-18) — 상단은 점포 아트가 가려 '상단정렬'처럼 보인다.
//   여유가 있을 때 카드 클러스터를 이만큼 더 내려 **시각적으로 보드 중앙**에 오게 한다(스케일/오버플로는 그대로).
//   2026-07-27: 하단이 붙어 보이는 원인 중 하나라 90 → 50 으로 완화(여유가 있는 레벨도 40px 위로).
const BOARD_DOWN_BIAS = 50;
/**
 * **보드 안쪽 상하 여백**(PO 2026-07-28 "보드카드에서 상단 여유를 확보하세요") — 카드가 놓일 수 있는 범위를
 *   이만큼 안쪽으로 좁힌다. 배치가 이 여백까지 침범하지 않도록, 넘치면 `fitVertical` 이 **세로 조밀도**로
 *   먼저 흡수한다(카드 크기는 유지). 여백을 늘리고 싶으면 이 두 값만 만지면 된다.
 */
const BOARD_PAD_TOP = 56;
const BOARD_PAD_BOTTOM = 40;
/**
 * **세로 조밀도 하한** — 행 간격에 곱하는 계수의 최소값(1=원본 간격). 0.7 이면 세로 간격이 30% 줄어 그만큼
 *   더 겹친다. 이보다 더 조이면 카드 **좌상단 랭크가 가려져** 무슨 카드인지 못 읽으므로 여기서 멈추고,
 *   그래도 넘치면 그때만 카드 크기를 줄인다.
 */
const MIN_VERT_COMPACT = 0.7;
const BOARD_LEFT = 55; // 좌우 패딩(카드가 커지도록 영역 넓게)
const BOARD_RIGHT = 1025;

// 뽑기(스톡)·기준(웨이스트) 카드 — 화면 하단(테이블 위, 부스터보다 위)으로 더 내린다. 기준은 중앙 쪽,
// 스톡은 왼쪽으로 부채처럼 펼쳐 장수가 보이게(buildStockPile).
const STOCK = { x: 470, y: 2140 };
const WASTE = { x: 640, y: 2140 };

/** 하단 부스터 아이콘 id — 이 셋의 **아래 모서리**가 뽑기/기준 카드를 맞출 기준선이다(에디터 저작 rect). */
const BOOSTER_NODE_IDS = ['layer_11', 'layer_10_copy', 'layer_10'] as const;

/**
 * **뽑기·기준 카드를 부스터 아이콘 하단선에 정렬**(PO 2026-07-28 "하단 아이콘을 변경하고 위치를 재배치했다.
 *   뽑기 카드와 기준 카드를 이 아이콘의 하단선에 정렬하라").
 *   카드의 **아래 모서리**가 기준선에 오도록 중심 y 를 역산한다. 카드 높이는 레벨마다 달라지므로(geom.scale)
 *   상수로 박지 않고 **매 판 계산**한다 — 에디터에서 아이콘을 다시 옮겨도 코드 수정 없이 따라간다.
 */
function alignStockRowToBottom(bottomY: number, cardH: number): void {
  const y = Math.round(bottomY - cardH / 2);
  STOCK.y = y;
  WASTE.y = y;
}
// 스톡 더미에 보유 수량만큼 카드를 **왼쪽으로 펼쳐** 표시(장수 파악용). 과다 방지 상한.
// 간격을 좁혀(15→9) 더 많은 장수(16→26)를 같은 폭 안에 촘촘히 펼친다.
/** 뽑기 더미(컨테이너 80·탭 존 85) 위로 올릴 UI depth — 겹치는 부스터 아이콘이 카드에 안 가리게. */
const STOCK_OVERLAP_DEPTH = 95;
/** 뽑기 비행이 이 시간 안에 끝나지 않으면 워치독이 강제 종료한다(보드 영구 잠금 방지). 최장 연출 0.56초의 여유 4배. */
/**
 * 연출 워치독은 **실시간(ms)** 기준이다.
 *
 * 예전엔 `time.delayedCall(3000)` 하나로 끝냈는데, 그 delay 는 **게임시간**이라 `time.timeScale` 에 나뉜다.
 * QA 배속(8배)에서는 3000ms 가 실시간 375ms 로 줄어드는 반면 프레임은 5fps(200ms/프레임)라, 트윈 체인이
 * **두 번째 프레임을 밟기도 전에** 워치독이 터졌다(실측: 매 레벨 1회 오발동, stage=fly-start·onUpdate 0회).
 * 배속과 프레임레이트에 흔들리지 않도록 실시간으로 재고, 그 사이엔 짧게 폴링하며 완료를 확인한다.
 */
const DRAW_FLIGHT_WATCHDOG_REAL_MS = 3000;
const FLIGHT_WATCHDOG_REAL_MS = 4000;
/** 워치독 폴링 간격(게임시간) — 완료 여부만 확인하므로 가벼움. */
const WATCHDOG_POLL_MS = 400;
const STOCK_STACK_CAP = 26;
const STOCK_FAN_STEP = 9; // 카드 한 장당 왼쪽 이동(px) — 좁게 겹치되 왼쪽 가장자리가 드러나 셀 수 있게.
/** 펼침 간격을 줄일 수 있는 하한(px) — 이보다 좁으면 장수가 안 읽힌다 → 2열로 나눈다. */


const STOCK_FAN_MIN_STEP = 4;
/** ＋5 아이콘과 띄울 최소 간격(px). */
const STOCK_FAN_MARGIN = 18;
/** ＋5 아이콘을 못 찾을 때(비-에디터 크롬) 쓰는 왼쪽 한계선(저작 x). */
const STOCK_FAN_LEFT_FALLBACK = 250;

export class PlayScene extends Phaser.Scene {
  private level = 1;
  /** dev 실측 전용 — 이 판의 런타임 뽑기 장수 강제값(real-measure.mjs 가 넣는다). */
  private stockOverride?: number;
  /** dev 실측 전용 — 시뮬 봇이 막혔을 때 ＋5 를 사게 할지 + 구매 횟수. */
  simBuy = false;
  simBuys = 0;
  /** dev 실측 전용 — 한 판 구매 상한(econ-lab 이 정책별로 바꾼다). */
  simMaxBuys = 12;
  /**
   * dev 실측 전용 — ＋5 를 **실제로 코인 내고** 살지.
   *
   * ⚠️ 기본값 false 는 뽑기 계측(stock-lab)용이다. 그쪽은 "카드가 몇 장 모자라나"만 보므로 지갑을
   *   무시해야 표본이 코인 잔고에 오염되지 않는다. 반대로 **경제 계측(econ-lab)은 이걸 켜야 한다** —
   *   끄고 재면 ＋5 지출이 세이브에 안 잡혀 수지가 통째로 흑자로 보인다.
   */
  simPayBuys = false;
  /**
   * **실측 대시보드(stock-lab.html)용 판 단위 계측** — 게임이 실제로 지급/소모한 값만 담는다.
   *   예측 모델이 아니라 **이 판에서 진짜 일어난 일**의 기록이라, 대시보드가 그대로 데이터로 쓴다.
   */
  labRun: {
    missionTicks: number;
    maxCombo: number;
    diamonds: number;
    collection: number;
    collectionCards: string[];
    bonusValue: number;
    /** 수집 드랍(3콤보) — 리그·주간이벤트 실데이터(PO 2026-08-23 "드랍률·보상구조 실데이터 확보"). */
    drops: number;
    /** 이번 판에 **투데이 리그로 보낸 별** 총수(미션 보상 회수분). */
    leagueStars: number;
    /** 이번 판에 **주간 이벤트로 보낸 상품** 총수(손님 3개 이상 정산분). */
    eventItems: number;
    dropCoins: number;
    dropDiamonds: number;
    leagueStages: number;
    eventStages: number;
    dropFloors: Record<number, number>;
    /** 수입 분해(PO 2026-08-24 "보상·경제구조 파악") — dropCoins 를 출처별로 가른 것(합 = dropCoins). */
    leagueCoins: number;
    eventCoins: number;
    /** 미션리워드 배너 **티어 박스** 보상(연속 플레이 별 수집) — 원장 미상 차액의 정체였다(실측 2026-08-24). */
    tierCoins: number;
    tierDiamonds: number;
    /** 미션 보상 분해 — 종류별 지급 횟수/총량(설계표 MISSION_REWARD_TABLE 대비 실측). */
    missionKinds: Record<string, number>;
    missionAmounts: Record<string, number>;
    /** 위클리 적립 분해 — 칸 타겟 종류별 적립 수(store/collection/diamond/cards/wild). */
    eventKinds: Record<string, number>;
    /** **핀치 이벤트** — 코인 부족으로 입장/＋5 를 못 한 횟수(PO 2026-08-25, 오퍼 시점 튜닝 근거). */
    pinch: number;
    /** 이 판의 부스터(＋5·와일드·되돌리기) 코인 지출 합 — 일일 지표(dailyMetrics)용. */
    boosterCoins: number;
    wildBanked: number;
    wildUses: number;
    plus5Uses: number;
    undos: number;
    stars: number;
    coins: number;
    startedAt: number;
  } = PlayScene.emptyLabRun();

  private static emptyLabRun(): PlayScene['labRun'] {
    return {
      missionTicks: 0, maxCombo: 0, diamonds: 0, collection: 0, collectionCards: [], leagueStars: 0, eventItems: 0,
      bonusValue: 0, wildBanked: 0, wildUses: 0, plus5Uses: 0, undos: 0,
      drops: 0, dropCoins: 0, dropDiamonds: 0, leagueStages: 0, eventStages: 0, dropFloors: {},
      leagueCoins: 0, eventCoins: 0, tierCoins: 0, tierDiamonds: 0, missionKinds: {}, missionAmounts: {}, eventKinds: {}, pinch: 0, boosterCoins: 0,
      stars: 0, coins: 0, startedAt: Date.now(),
    };
  }

  /** 대시보드가 읽는 **현재 판 전체 상태** — 한 판이 끝나면 이 한 덩어리가 곧 실측 레코드가 된다. */
  labSnapshot(): Record<string, unknown> {
    const total = this.state?.layout?.slots?.length ?? 0;
    const cleared = this.state?.cleared?.size ?? 0;
    return {
      level: this.level,
      boardCards: total,
      startStock: this.initialStock,
      stock: this.state?.stock?.length ?? 0,
      cleared,
      boardLeft: total - cleared,
      win: total > 0 && cleared === total,
      buys: this.simBuys,
      draws: this.drawsUsed,
      moves: this.state?.moves ?? 0,
      maxCombo: this.labRun.maxCombo, // 실제 플레이의 콤보 최댓값(자동테스트 모드와 무관하게 항상 기록).
      missionTicks: this.labRun.missionTicks,
      diamonds: this.labRun.diamonds,
      collection: this.labRun.collection,
      collectionCards: [...this.labRun.collectionCards],
      bonusValue: this.labRun.bonusValue,
      wildBanked: this.labRun.wildBanked,
      wildUses: this.wildUses,
      plus5Uses: this.plus5Uses,
      undos: this.labRun.undos,
      stars: this.labRun.stars,
      coins: this.labRun.coins,
      // 수집 드랍(투데이 리그·주간 이벤트) 실데이터.
      drops: this.labRun.drops,
      leagueStars: this.labRun.leagueStars,
      eventItems: this.labRun.eventItems,
      dropCoins: this.labRun.dropCoins,
      dropDiamonds: this.labRun.dropDiamonds,
      leagueStages: this.labRun.leagueStages,
      eventStages: this.labRun.eventStages,
      dropFloors: { ...this.labRun.dropFloors },
      // 보상·경제구조 분해(PO 2026-08-24) — 대시보드 원장이 출처별로 나눠 그린다.
      leagueCoins: this.labRun.leagueCoins,
      eventCoins: this.labRun.eventCoins,
      tierCoins: this.labRun.tierCoins,
      tierDiamonds: this.labRun.tierDiamonds,
      missionKinds: { ...this.labRun.missionKinds },
      missionAmounts: { ...this.labRun.missionAmounts },
      eventKinds: { ...this.labRun.eventKinds },
      pinch: this.labRun.pinch,
      leagueStageNow: leagueStageOf(loadSave()).stage,
      eventStageNow: eventProgressNow(loadSave().thiefEvent, thiefPeriodId(new Date())).stage,
      /** 정산(별·코인)이 끝났는가 — 대시보드는 이 값이 true 가 될 때까지 잠깐 기다린다. */
      settled: this.finished,
      ms: Date.now() - this.labRun.startedAt,
    };
  }
  // **점포(층) 테마 = 소유한 최고층 기준**(PO 2026-07-19) — 레벨 번호와 무관. 2층을 아직 매입 안 했으면
  //   몇 레벨을 플레이하든 항상 1층(편의점)에서 진행하고, 매입/건설로 최고 소유층이 오르면 그 층에서 진행한다.
  //   FLOORS 아트가 5종뿐이라 6층 이상은 순환(6층→1층 테마, …).
  private floorThemeIdx = 1;
  /** **이 판의 상품 층**(1..20) — 위클리 이벤트가 모으는 상품과 같은 층. */
  private playFloor = 1;
  /** **이 판에 보여 줄 점포** — 홈 화면이 쓰는 것과 같은 아트(`logic/currentStore.ts`). */
  private store: StoreRef = { lot: 1, floor: 1, itemFloor: 1, artKeys: [], clerkKeys: [] };
  private chMult = 1; // **도전 배수**(진입 팝업 선택) — 보상·부스터 가격에 적용. '베팅' 용어 금지.
  private orderQueue?: OrderQueue; // **주문 대기열**(상단 점포 손님 줄 — 주문서 시스템 연출).
  private state!: GameState;
  private cards = new Map<string, CardView>();
  // **다이아**(게임 중 카드에서 수집 — 판당 ~2개). 건물 업그레이드 재화.
  private diamondSlots = new Set<string>(); // 다이아가 끼워진 슬롯.
  private diamondViews = new Map<string, Phaser.GameObjects.Image>(); // 슬롯별 다이아 아이콘.
  /** **투데이 리그 별이 꽂힌 슬롯** → 그 카드에 걸린 별 개수. 다이아와 같은 모델(카드 뒤). */
  private starSlots = new Map<string, number>();
  private starViews = new Map<string, { img: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text }>();
  /**
   * **＋카드가 꽂힌 슬롯** → 그 카드에 걸린 뽑기 장수(PO 2026-08-24: "미션에서 플러스 카드가 발생했을 때
   * 뽑기 카드로 바로 들어온다. 보드카드에 배치되었다가 들어와야 한다").
   * 별·다이아와 같은 모델 — 보드 카드 뒤에 꽂히고, 그 카드를 낼 때 뽑기 더미로 들어간다.
   */
  private stockSlots = new Map<string, { count: number; wild: boolean }>();
  private stockViews = new Map<string, { img: Phaser.GameObjects.Image }>();
  private pendingDiamonds = 0; // **보관(미확정) 다이아** — 게임 중 수집분. **승리 시에만** save 에 확정.
  /**
   * **보관(미확정) 리그 별 · 이벤트 아이템** — 다이아와 같은 모델(PO 2026-08-30 "최종적인 게임결과로
   *   수집되도록. 게임 중간에 지급되는 과정이 아닌").
   *
   * 판 중에는 **모으는 연출만** 하고 게이지는 미리보기로 움직인다. 실제 저장·코인 지급은 승리 시
   * 한 번(`settleRoundCollectibles`). 지거나 나가면 사라진다 — "끝까지 푼다"가 곧 보상이다.
   * ⚠️ 지급을 미루므로 **`notePlayReward`(중단 시 회수) 대상이 아니다** — 준 적이 없으니 회수할 것도 없다.
   */
  private pendingStars = 0;
  /** 별 보관 배지(다이아 배지와 같은 줄) — 판 중 모인 별을 보여 준다. */
  private starHold?: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text };
  /** 결과 확인 시 리그로 보낼 별 수와 **적립 직전** 리그 상태(게이지 출발점). */
  private payoutStars = 0;
  private payoutLeagueBefore?: ReturnType<typeof leagueStageOf>;
  private pendingEventItems = 0;
  private diamondHold?: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }; // 다이아 완성 보상풀 표시(중앙 고정 슬롯).
  private missionDiamondPos?: { x: number; y: number }; // 중앙 다이아 슬롯 좌표(회수 목표점).
  // **컬렉션 카드 = 보드 투입형 보상**(PO 2026-07-26 2차) — 미션으로 뽑힌 카드는 즉시 지급되지 않고 보드의
  //   가려진 카드에 꽂혀 있다가, 그 카드가 **열리는 순간** 일반 카드 오픈보다 1.5배로 커졌다 스타게이지로
  //   빨려 들어간다. 실제 확정 지급은 **레벨 클리어(승리) 시** — 다이아(pendingDiamonds)와 같은 모델.
  //   ⚠️ **동시 여러 장**(PO 2026-07-29) — 예전엔 한 번에 한 장만 허용해, 먼저 꽂힌 카드가 깊이 묻혀 있으면
  //   그 판의 이후 컬렉션 카드가 전부 즉시지급(instant)으로 새어 나갔다(우상단으로 날아가 사라지는 것처럼
  //   보이던 그 현상). 이제 슬롯별로 독립 관리한다 — 상태 플래그도 카드마다 따로 가진다.
  private boardCollections = new Map<string, BoardCollection>();
  /**
   * **컬렉션 카드 흰 바탕**(PO 2026-08-24: "흰색 카드 바탕이 너무 좁습니다 — 약간 키워서 카드와 같은
   * 느낌으로") — 카드 아트에 딸린 흰 테두리가 얇아 일러스트만 떠 있는 것처럼 보인다. 아트 뒤에
   * **조금 큰 흰 라운드 판**을 깔아 진짜 카드처럼 보이게 한다.
   *
   * 아트는 트윈으로 계속 움직이고(확대·회전·흡입) 크기가 바뀌므로, 매 프레임 `update` 에서 따라붙인다.
   * 아트가 파괴되면 바탕도 함께 정리된다 — 남으면 화면에 흰 판만 떠 있게 된다.
   */
  private cardBackings = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.Graphics>();
  /**
   * **완성했지만 아직 지급하지 않은 미션 수** — 콤보 런 도중 5매치를 통과한 횟수.
   * 콤보가 끝나 **매칭 수가 확정되는 순간** 그 수만큼 지급하고 0 으로 돌린다.
   */
  private pendingMissions = 0;
  private pendingCollection: CollectionSlot[] = []; // 열어서 확보한 카드(승리 시 save 에 확정).
  private cardBacking?: Phaser.GameObjects.Graphics; // 카드 바로 뒤 반투명 막(카드 위치에만)
  private wasteView?: CardView;
  private stockContainer?: Phaser.GameObjects.Container;
  private stockCountText?: Phaser.GameObjects.Text;
  private emptyStockPlus5?: Phaser.GameObjects.Container; // 스톡 소진 시 그 자리에 뜨는 **+5 플로팅 카드**(탭=＋5).
  private emptyStockPending = false; // 스톡 소진 → '카드 없어요' 메시지 후 +5 카드 지연 등장 대기 중.
  private lastStockCount = -1; // 스톡 더미 카드 수 캐시(바뀔 때만 다시 쌓기).
  private stockRevealMax = 999; // 스톡 부채에 **표시할 최대 장수**(보너스 +N 순차 노출 연출용 — 평소 무제한).
  private comboText?: Phaser.GameObjects.Text;
  private coinText?: Phaser.GameObjects.Text;
  private remainText?: Phaser.GameObjects.Text;
  private busy = false;
  private baseCoins = 0;
  private ended = false;
  private stuckLogged = false; // 임시 진단 로그(PO 2026-07-29 "실제 게임 잔여뽑기 확인용") — 판마다 1회만.
  // 초기 딜 연출 진행 중 플래그 — 카드가 날아드는 동안 뽑기/탭 입력을 잠근다.
  private dealing = false;
  // 공개 보류 플래그 — 카드를 낸 직후엔 아래 노출 카드를 바로 뒤집지 않고(뒷면 유지),
  //   낸 카드의 토스(튀어오름) 회수가 끝난 뒤 뒤집어 공개한다.
  /**
   * **공개 보류 슬롯** — 카드를 내면 그 아래가 즉시 노출되지만, 회수 연출이 정점에 닿을 때까지 뒤집지 않는다.
   *   예전에는 `suppressReveal` 플래그 + `revealHold` 카운터 + `view.isFaceUp()` 조합으로 암묵 처리했는데,
   *   "지금 어떤 카드가 보류 중인가"가 어디에도 없어 불변식 검사가 오탐을 냈다. 명시 상태로 승격.
   */
  private readonly heldReveals = new Set<string>();
  // 에디터에 저작된 레벨 수(1부터 연속) — 승리 진행/다음 레벨 버튼을 이 범위로 클램프.
  private editorLevels = 1;
  // 부스터: 되돌리기 히스토리(**GameState 밖 래치까지 스냅샷** — undo 가 미션게이지·특수카드 상태를 정확히 되돌리도록) + 와일드 활성 + 버튼.
  private history: HistorySnap[] = [];
  /** 되돌리기로 취소된 **무작위 결과가 있는 수** 1건(뽑기/＋5) — 같은 자리에서 다시 하면 재현할 결과. */
  private undoneRandomStep?: { readonly kind: HistoryKind; readonly from: GameState; readonly to: GameState };
  /** 이번 판에서 이미 안내를 하나 띄웠는가 — 한 판에 하나만(logic/tutorial.ts). */
  private tipShownThisRound = false;
  /** 지금 안내 창이 떠 있는가 — 겹쳐 뜨는 것만 막는다(상황성 안내는 판당 제한을 받지 않는다). */
  private tipOpen = false;
  /** 문구별 표시 횟수 — 같은 메시지를 1~2회까지만 띄운다(logic/messageStyle.ts). */
  private readonly msgCounts = loadMessageCounts();
  /** 낸 카드가 기준 자리로 날아가는 중인 수 — 표시만 잡아 두고 탭은 막지 않는다(boardView.matchPending). */
  private matchFlights = 0;
  /** 스톡 부채가 실제로 차지한 폭(px) — 탭 존을 그만큼만 넓힌다. */
  private stockFanWidth = 0;
  /** 이미 본 안내 키 — refresh 마다 세이브를 읽지 않도록 판 시작 때 한 번만 읽는다. */
  private tipsSeen: string[] = [];
  /** **안내 중 정지** — 코치 카드가 떠 있는 동안엔 특수 카드 자동 소비·입력을 멈춘다. */
  private coachHold = false;
  /** 지금 화면에 떠 있는 코치 화살표(가리키기). */
  private coachArrow?: Phaser.GameObjects.Container;
  /** 초반 "이 카드를 탭하세요" 화살표를 몇 번 더 보여 줄지(레벨 시작 때 설정). */
  private arrowHintsLeft = 0;
  /** 지금 화살표가 **뽑기 더미**를 가리키는 중인가 — 실제로 뽑는 순간 '한 번 봤음'으로 영구 기록한다. */
  private stockArrowActive = false;
  // **비행 중 카드 수**(매칭 토스·스톡 플립) — >0 이면 undo/+5 를 막아 상태 갱신 레이스를 방지(카드 탭 자체는 계속 허용=동시 플레이).
  //   ⚠️ 직접 증감하지 말 것 — beginFlight/endFlight 로만 다룬다(워치독이 누수를 되돌릴 수 있게).
  private flyingCards = 0;
  /** 진행 중인 비행 토큰 → 강제 종료 시 실행할 정리(고스트 파기 등). */
  private readonly activeFlights = new Map<number, (() => void) | undefined>();
  private flightSeq = 0;
  /**
   * **공개 대기 중인 뽑기 비행 수**(스톡 탭·＋5 도드로우) — >0 이면 기준 카드 뷰를 **뒷면으로 둔다**.
   *   뽑기는 "무엇이 나올지 모르는" 연출이라 목적지에 미리 그리면 카드가 두 번 바뀌어 보인다.
   *   ⚠️ 이 값은 **표시만** 통제한다 — 상태상의 기준(state 의 waste top)은 이미 새 카드다(S1 단일 진실).
   *   카드를 내는 토스(playCard)는 무엇이 올라가는지 플레이어가 이미 알므로 여기 포함되지 않는다 → 즉시 반영.
   */
  private drawFlights = 0;
  /** 진행 중인 뽑기 비행 토큰 — 워치독이 개별 비행을 식별해 강제 종료할 수 있게 한다. */
  private readonly activeDrawFlights = new Set<number>();
  private drawFlightSeq = 0;
  /** 이번 판에서 이미 기록한 불변식 위반 종류(같은 종류를 매번 쌓지 않게). */
  private readonly loggedInvariants = new Set<string>();

  private wildActive = false;
  private wildBtn?: Phaser.GameObjects.Text;
  private undoBtn?: Phaser.GameObjects.Text;
  private addBtn?: Phaser.GameObjects.Text;
  // **부스터 사용 횟수(이번 판)** — 사용할수록 비용 상승(econRuntime 모델 곡선). 매 판 create 에서 0 리셋.
  private plus5Uses = 0;
  private wildUses = 0;

  // ── 부스터 가격/아이템(경제모델 P3) ──────────────────────────────
  private plus5Price(): number {
    return plus5PriceAt(this.level, this.plus5Uses, this.chMult);
  }
  private wildPrice(): number {
    return wildPriceAt(this.level, this.wildUses, this.chMult);
  }
  private undoPrice(): number {
    return undoPriceAt(this.level, this.chMult);
  }
  /** 보유 아이템 개수(save 인벤토리). */
  private itemCount(kind: 'wild' | 'plus5' | 'undo'): number {
    return itemsOf(loadSave())[kind];
  }
  /** 보유 아이템 1개 소모(있으면 true — 코인 대신 무료 사용). */
  private consumeItem(kind: 'wild' | 'plus5' | 'undo'): boolean {
    const s = loadSave();
    const it = itemsOf(s);
    if (it[kind] <= 0) return false;
    it[kind] -= 1;
    s.items = it;
    writeSave(s);
    return true;
  }
  /** 부스터 라벨 — 보유분 있으면 **원문자**(①②…), 없으면 코인 가격(PO 2026-07-16). */
  private boosterLabel(kind: 'wild' | 'plus5' | 'undo', price: number): string {
    const n = this.itemCount(kind);
    return n > 0 ? circledCount(n) : `🪙 ${price.toLocaleString()}`;
  }
  // 에디터 부스터 이미지 옆 코인 비용 라벨(+5·와일드).
  private plus5CostLabel?: Phaser.GameObjects.Text;
  private wildCostLabel?: Phaser.GameObjects.Text;
  private undoCostLabel?: Phaser.GameObjects.Text;
  /** '기준 카드' 라벨 — 하단 라벨 수평 정렬 대상. */
  private wasteLabel?: Phaser.GameObjects.Text;
  private readonly rng: () => number = () => Math.random();
  // 크롬 소스 = 에디터 main.json(true) or 코드 폴백(false). true 면 코드 암막(drawBoardMask) 생략.
  private chromeFromEditor = false;
  // 에디터 노드 인덱스(id 조회) — 미션 게이지/박스/부스터 배선에 사용.
  private chrome?: LayoutIndex;
  // 미션 상태: 현재 콤보 런에서 맞춘 카드 색(무늬) = 손님 주문 별(무제한 누적), 종료 플래그.
  private comboColors: Suit[] = [];
  private starGauge = 0; // (레거시 HistorySnap 필드 — 현재 미사용, 스냅샷 호환 위해 유지).
  private setsDone = 0; // 미션 틱(5매치) 누적 횟수 — 내부 지표.
  private finished = false;
  // 연속 매칭 멜로디(도레미파솔라시…) — 매칭마다 한 음씩 올라가고, 콤보가 끊기면 다시 도(0)부터.
  private melodyStep = 0;
  private audioCtx?: AudioContext;
  // 미션 크롬 오브젝트(에디터 노드 기반) — 게이지 채움/별/박스 칸/기준 색 표기.
  private header?: TopHeader; // 홈과 동일한 공통 상단 헤더(코인 패널).
  private missionBanner?: MissionRewardBanner; // 홈과 동일한 미션 리워드 배너(연속 플레이 별 수집).
  private gaugeGeom = { left: 0, width: 0, y: 0, h: 0 }; // 5별 게이지 span(다이아 회수·주문 별 목표점 산출용).
  // **좌측 5별 스타축적 게이지**(손님이 지불한 별이 날아와 점등 축적) + **우측 MISSIONS 보상 예고**.
  private comboStars: Phaser.GameObjects.Image[] = []; // 좌측 5칸 게이지 별(손님 회수 별이 흡입되며 점등).
  private accumStars = 0; // **게이지에 표시된(점등) 별 수**(0..5) = gaugeScore 비율 컷 통과. 수집 연출로 전진.
  private drawsUsed = 0; // 이 판에서 스톡을 뽑은 횟수 — 별 등급의 '짧은 수순' 축(starRating).
  private refQuality = 0; // 이 레벨 **정답 수순의 품질** — 별은 이 값 대비 상대 평가(0=기준 없음→절대 컷).
  private comboScore = 0; // **콤보 점수(동기 누적·판정용)** — 매치마다 min(콤보길이, CAP) 가산. 별 등급 판정 소스.
  private gaugeScore = 0; // **게이지에 반영된 품질(0~1, 시각)** — 손님 별이 흡입 도착할 때마다 qualityNow() 를 따라잡는다(동시 변화 연출).
  private boardSlots = 28; // 이번 판 보드 카드 수(딜 시 캡처) — 별 등급 축① 정규화 분모.
  private initialStock = 0; // 이번 판 **처음 받은 스톡 장수**(딜 시 캡처) — 별 등급 축②(남은 카드 수) 분모.
  private gaugeBar?: Phaser.GameObjects.Graphics; // 전체 스타 게이지(파란 반투명 바) — 콤보 점수 진행도(다음 컷까지) 표시.
  private barGeom?: { left: number; y: number; h: number; r: number }; // 파란 바 기하(에디터 layer_7 기반).
  private missionRewardImg?: Phaser.GameObjects.Image; // layer_8_copy3 = 다음 보상 아이콘(예고).
  private missionIconBox = { w: 50, h: 68 }; // 보상 아이콘 표시 상자(에디터 노드 크기) — 아이콘 비율유지 축소 기준.
  private comboCountText?: Phaser.GameObjects.Text; // layer_8 = 축적 별 수 '+N'.
  private missionReward?: MissionReward; // 예고된(다음 완성 시 지급될) 보상 — 완성 전까지 고정.
  // 배경 보행 캐릭터(에디터 동선 따라 걷기, 반투명막 뒤).
  private pedestrians: Pedestrian[] = [];
  // 와일드: 기준 카드 위에 얹히는 와일드 마커(활성 동안 표시).
  private wildMarker?: Phaser.GameObjects.Image;
  // **보드 와일드 카드** — 딜 때 지정한 슬롯 id. 노출되면 자동으로 스톡 중간에 삽입(뱅킹)된다.
  private wildSlotId?: string;
  private wildBanked = false; // 뱅킹 완료 여부(1회)
  private wildBanking = false; // 뱅킹 비행 진행 중 — 스톡 더미에 와일드 아트를 아직 표시하지 않음(도착 후 표시)
  // **보드 보너스(+N) 카드** — 노출되면 스톡에 N장 추가(뒷면 흡입 연출) 후 사라진다.
  private bonusSlot?: { id: string; count: number };
  private bonusTriggered = false;
  // 에디터 부스터 이미지(코드 텍스트 버튼 대신 사용).
  private wildImg?: Phaser.GameObjects.Image;
  private undoImg?: Phaser.GameObjects.Image;
  private addImg?: Phaser.GameObjects.Image;
  // 보드 영역(에디터 암막 패널이 있으면 그 세로 범위로 덮어쓴다) — computeGeom 이 참조.
  private boardTop = BOARD_TOP;
  private boardBottom = BOARD_BOTTOM;

  // ── 자동 시뮬레이션 테스트(dev 전용 QA 도구) ────────────────────────
  //   토글 자체(running/autoAdvance)와 누적 결과는 모듈 전역(autoTestState)에 있음(레벨 전환 생존).
  //   아래는 **이번 판(씬 인스턴스) 한정** 진행 상태 — create() 에서 매번 리셋.
  private autoTimer?: Phaser.Time.TimerEvent;
  private autoTestDone = false;

  // ── 레벨 점검용 시뮬레이션 바(하단 중앙) ──────────────────────────
  //   위 QA 자동테스트와 달리 **결과 화면으로 넘어가지 않는다**(finishMission 진입 차단) — 클리어해도
  //   진행도·보상이 오르지 않고 바에 결과만 표시한다. 레벨이 제대로 도는지 눈으로 확인하는 용도.
  private simRunning = false;
  /** 1=보통(사람이 눈으로 따라갈 수 있는 속도) · 2 · 4배속. 눌러서 1→2→4→1 로 순환. */
  /**
   * 시뮬 배속 — 화면 토글은 1/2/4 지만, **실측 러너(stock-lab)는 더 큰 값**을 넣어 최대 속도로 돌린다
   *   (PO 2026-08-23 "테스트 속도를 최대로"). 값이 커지면 틱 간격(SIM_TICK_MS/배속)도 함께 짧아진다.
   */
  simSpeed: number = 1;
  private simTimer?: Phaser.Time.TimerEvent;
  private simBar?: Phaser.GameObjects.Container;
  private simPlayBtn?: Phaser.GameObjects.Text;
  private simSpeedBtn?: Phaser.GameObjects.Text;
  private simStatus?: Phaser.GameObjects.Text;
  private autoRunCombo = 0; // 현재 진행 중인 콤보 런 길이(뽑기/승리 시 comboRuns 로 확정).
  /**
   * **실제 플레이의 콤보 런** — 뽑기 없이 이어 낸 매치 수(별 판정 축① 소스).
   * ⚠️ 위 `autoRunCombo` 는 자동 테스트 봇 전용이라 실제 입력에서는 오르지 않는다 — 별도 카운터가 필요하다.
   */
  private collectRun = 0;
  /** 리그 아이콘의 화면 위치 — 수집 연출의 도착점 중 하나. */
  private leagueIconAt?: { x: number; y: number };
  /** 리그 아이콘 바로 아래 — 수집 중에만 뜨는 별 게이지의 중심 y(아이콘 참조가 없을 때의 폴백). */
  private leagueGaugeY?: number;
  /** 리그 아이콘 본체 — 게이지가 이걸 따라다닌다(좌표를 베끼지 않는다). */
  private leagueIconImg?: Phaser.GameObjects.Image;
  /** 수집 중에만 존재하는 별 게이지 컨테이너. */
  private leagueGaugeBox?: Phaser.GameObjects.Container;
  private autoComboRuns: number[] = []; // 이번 판에서 끊긴 콤보 런들의 길이 목록.
  private autoDrawCount = 0;
  private autoBtn?: Phaser.GameObjects.Text;
  private autoAdvanceBtn?: Phaser.GameObjects.Text;
  private autoStatusText?: Phaser.GameObjects.Text;
  private autoTestUI?: Phaser.GameObjects.Container; // 위 4개를 묶어 메뉴의 표시 토글로 한번에 켜고 끔.
  private readonly AUTO_SPEED = 8; // 배속 시뮬레이션 타임스케일(트윈+타이머 동일 배율).

  constructor() {
    super('play');
  }

  init(data: { level?: number; mult?: number; stockOverride?: number }): void {
    // 명시 레벨이 없으면 저장된 진행 레벨로 이어서 플레이.
    this.level = data?.level ?? loadSave().level;
    // **실측 러너 전용**(dev) — 뽑기 장수를 강제로 지정해 실게임으로 장수별 결과를 잰다(real-measure.mjs).
    this.stockOverride = import.meta.env.DEV ? data?.stockOverride : undefined;
    // **도전 배수**(진입 팝업에서 선택) — 보상·부스터 가격에 함께 적용. 미지정=x1.
    this.chMult = Math.max(1, Math.floor(data?.mult ?? 1));
    /*
     * **점포 = 플레이어의 현재 최고 층**(PO 2026-08-24: "플레이시 나타는 점포가 항상 똑같습니다 …
     *   그래야 수집이 의미가 있습니다").
     *
     * 예전엔 `ownedFloors`(매입한 부지) 를 5로 나눈 나머지를 썼는데, 위클리 이벤트가 모으는 상품은
     * `openFloorOf`(= builtFloors) 층 것이라 **화면의 점포와 모으는 물건이 서로 달랐다**. 둘을 같은
     * 값으로 묶어, 지금 짓고 있는 층의 점포에서 그 층의 상품을 모으게 한다.
     */
    this.store = currentStore(loadSave());
    this.playFloor = this.store.itemFloor;
    this.floorThemeIdx = ((this.store.floor - 1) % PlayScene.FLOOR_ART_COUNT) + 1;
  }

  preload(): void {
    loadGameAssets(this);
    // 경제 파라미터(economy.json) — 홈을 거치지 않은 직행(dev) 대비 재로딩(캐시면 no-op).
    if (!this.cache.json.exists(ECON_JSON_KEY)) this.load.json(ECON_JSON_KEY, ECON_JSON_URL);
    preloadCustomers(this); // 손님 스프라이트(방문·이모지) — 플레이 상단 점포에도 손님 등장.
    preloadAudio(); // 사운드팩(m4a) — 홈에서 이미 로드됐으면 캐시.
    // 아이템샵 아트 — 플레이 중에도 상점을 열 수 있어야 한다(PO 2026-07-29). 홈에서 이미 로드됐으면 no-op.
    if (!this.textures.exists('up_Solitare_UI_ItemShop')) this.load.image('up_Solitare_UI_ItemShop', uploadPath('up_Solitare_UI_ItemShop'));
    // 카드 뒷면 정식 아트(매니페스트 타이밍과 무관하게 확실히 선로딩) → cardView 가 이 텍스처로 뒷면을 굽는다.
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, uploadPath('up_Solitaire_CARD_back'));
    }
    // 에디터 저작 레벨 팩(번들·배포용). 없거나 비어도 무해({}) — localStorage(dev 즉시적용)가 우선.
    this.load.json(EDITOR_PACK_KEY, EDITOR_PACK_URL);
    // **결과화면 저작**(blank_2.json) — 레벨 클리어 팝업의 배치 SSOT(resultPopup.ts).
    if (!this.cache.json.exists(UI_RESULT_KEY)) this.load.json(UI_RESULT_KEY, UI_RESULT_PATH);
    // **결과/메뉴 버튼**(UI_23: 1 다음레벨·2 홈·4 재시도·5 계속·6 확인·7 닫기) — 친절한 이미지 버튼.
    for (const n of ['1', '2', '4', '5', '6', '7']) {
      const k = `up_Solitare_UI_23_${n}`;
      if (!this.textures.exists(k)) this.load.image(k, uploadPath(`${k}`));
    }
    // **다이아 아이콘**(UI_2_2) + **코인 아이콘**(UI_2_3) — 재화 표시/보상.
    if (!this.textures.exists('up_Solitare_UI_2_2')) this.load.image('up_Solitare_UI_2_2', uploadPath('up_Solitare_UI_2_2'));
    if (!this.textures.exists('up_Solitare_UI_2_3')) this.load.image('up_Solitare_UI_2_3', uploadPath('up_Solitare_UI_2_3'));
    // **컬렉션 카드 아트**(2번 세트부터 — 매니페스트 밖 수동 이식분, HomeScene 과 동일 로더).
    //   미션 보상으로 카드가 드랍되면서 플레이 화면에서도 예고 아이콘·획득 연출에 필요해졌다(2026-07-26).
    //   1번 세트 아트(up_01_v2 등)는 ui-assets 매니페스트에 있어 loadGameAssets 가 이미 로드한다.
    for (const set of CARD_ART_SETS) {
      for (let c = 1; c <= 9; c++) {
        const k = collectionCardKey(set, c);
        if (!this.textures.exists(k)) this.load.image(k, uploadPath(k));
      }
    }
  }

  /**
   * **이미지 버튼**(UI_23 세트) — 텍스트 없이 이미지에 라벨이 박혀 있어 그대로 쓴다. 탭 시 살짝 눌리는 피드백.
   *   반환 이미지를 팝업 컨테이너에 add 한다. 폴백: 텍스처 없으면 텍스트 버튼.
   */
  private uiButton(x: number, y: number, key: string, on: () => void, targetW = 430): Phaser.GameObjects.GameObject {
    if (!this.textures.exists(key)) {
      return this.add
        .text(x, y, '버튼', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '44px', color: '#2a1830', backgroundColor: '#ffd166', padding: { x: 40, y: 16 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', on);
    }
    const img = this.add.image(x, y, key).setInteractive({ useHandCursor: true });
    const src = texSize(img.texture);
    img.setDisplaySize(targetW, targetW * (src.height / src.width));
    const bsx = img.scaleX;
    const bsy = img.scaleY;
    img.on('pointerover', () => img.setScale(bsx * 1.05, bsy * 1.05));
    img.on('pointerout', () => img.setScale(bsx, bsy));
    img.on('pointerdown', () => {
      this.tweens.add({ targets: img, scaleX: bsx * 0.92, scaleY: bsy * 0.92, duration: 80, yoyo: true, ease: 'Quad.easeOut', onComplete: on });
    });
    return img;
  }

  create(): void {
    /*
     * 플레이 중에도 눌릴 수 있는 팝업 아트를 **한가할 때 미리** 받아 둔다 — 누르면 기다림 0.
     *   예산(assetBudget)을 넘으면 받지 않으므로 상주 총량은 그림 수와 무관하게 유지된다.
     *   ⚠️ 딜 연출과 겹치지 않게 한 프레임 뒤에 건다.
     */
    this.time.delayedCall(0, () => {
      if (!this.scene.isActive()) return;
      // 팝업 아트는 전부 부팅 상주다(2026-08-31 그룹 해제).
    });
    // **세이프존을 화면 가운데로** — 이 한 줄로 저작 노드·코드 HUD·팝업이 전부 같은 좌표계에 정렬된다.
    //   (캔버스가 저작 크기와 같으면 스크롤 0 = 종전과 동일)
    centerSafeZone(this);
    setEconFromJson(this.cache.json.get(ECON_JSON_KEY)); // 경제 SSOT 적용(없으면 기본값).
    playBgm('play'); // 플레이 BGM 으로 전환(첫 제스처에서 시작·홈 BGM 크로스페이드).
    this.cards.clear();
    this.busy = false;
    this.flyingCards = 0; // 씬 재사용 대비: 비행 카운터 리셋(중단된 애니의 onComplete 미발화 대비).
    this.activeFlights.clear();
    this.matchFlights = 0;
    this.drawFlights = 0;
    this.activeDrawFlights.clear();
    this.loggedInvariants.clear();
    this.heldReveals.clear();
    this.dealing = false;
    this.ended = false;
    this.stuckLogged = false;
    this.history = [];
    this.undoneRandomStep = undefined; // 씬 재사용 대비(이전 판의 되돌린 뽑기가 새 판에 재현되지 않게).
    this.wildActive = false;
    this.plus5Uses = 0; // 부스터 비용 곡선 리셋(새 판=첫 사용부터).
    this.wildUses = 0;
    // Phaser 는 씬 인스턴스를 재사용 → 이전 세션의 (파괴된) 참조를 비워 재생성되게 한다(막/웨이스트가 사라지는 문제 방지).
    this.cardBacking = undefined;
    this.wasteView = undefined;
    this.wildBtn = undefined;
    this.undoBtn = undefined;
    this.addBtn = undefined;
    this.plus5CostLabel = undefined;
    this.wildCostLabel = undefined;
    this.undoCostLabel = undefined;
    this.wasteLabel = undefined;
    this.chromeFromEditor = false;
    // 미션 상태 초기화(씬 재사용 대비).
    this.chrome = undefined;
    this.comboColors = [];
    this.starGauge = 0;
    this.setsDone = 0;
    this.finished = false;
    this.orderQueue?.destroy(); // 씬 재사용 대비 — 이전 판 손님 줄 제거(setupStorefrontLife 가 재생성).
    this.orderQueue = undefined;
    this.melodyStep = 0;
    this.header = undefined;
    this.comboStars = [];
    this.accumStars = 0;
    this.drawsUsed = 0;
    this.refQuality = 0;
    this.initialStock = 0;
    this.comboScore = 0;
    this.gaugeScore = 0;
    this.gaugeBar = undefined;
    this.barGeom = undefined;
    this.missionRewardImg = undefined;
    this.comboCountText = undefined;
    this.missionReward = undefined;
    this.wildMarker = undefined;
    this.wildSlotId = undefined;
    this.wildBanked = false;
    this.wildBanking = false;
    this.bonusSlot = undefined;
    this.bonusTriggered = false;
    this.emptyStockPlus5 = undefined;
    this.emptyStockPending = false;
    this.wildImg = undefined;
    this.undoImg = undefined;
    // 다이아 상태 초기화(씬 재사용 대비).
    this.diamondSlots.clear();
    this.starSlots.clear();
    this.starViews.clear();
    this.stockSlots.clear();
    this.stockViews.clear();
    this.diamondViews.clear();
    this.pendingDiamonds = 0;
    this.pendingStars = 0;
    this.pendingEventItems = 0;
    this.labRun = PlayScene.emptyLabRun(); // 실측 계측도 판마다 새로.
    this.diamondHold = undefined;
    this.missionDiamondPos = undefined;
    // 컬렉션 카드(보드 투입) 상태 초기화 — 보관분은 승리에서만 확정되므로 씬 재시작 시 전부 버린다.
    this.pendingMissions = 0;
    this.leagueIconImg = undefined;
    this.leagueGaugeBox = undefined;
    for (const [, bg] of this.cardBackings) bg.destroy();
    this.cardBackings.clear();
    this.boardCollections.clear();
    this.pendingCollection = [];
    this.addImg = undefined;
    this.lastStockCount = -1;
    this.stockRevealMax = 999;
    // 자동 시뮬레이션 진행 상태 리셋(씬 재사용 대비) — 토글값(autoTestState)은 모듈 전역이라 유지됨.
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
    this.autoTimer = undefined;
    this.autoTestDone = false;
    this.autoRunCombo = 0;
    this.autoComboRuns = [];
    this.autoDrawCount = 0;
    this.autoTestUI = undefined;
    // 시뮬 바는 씬마다 새로 그린다 — 이전 씬의 객체 참조가 남아 있으면 죽은 객체를 건드리게 된다.
    this.simRunning = false;
    this.simTimer = undefined;
    this.simBar = undefined;
    this.simPlayBtn = undefined;
    this.simSpeedBtn = undefined;
    this.simStatus = undefined;
    for (const p of this.pedestrians) p.destroy();
    this.pedestrians = [];
    this.boardTop = BOARD_TOP;
    this.boardBottom = BOARD_BOTTOM;
    const save = loadSave();
    this.baseCoins = save.coins;

    // 에디터 저작 레벨 우선: localStorage(같은 오리진 dev 즉시적용) → 번들 팩(배포). 없으면 절차적 생성.
    //   번들 파일은 에디터 '레벨팩 내보내기' 형식({kind,levels}) 또는 bare 맵({"1":doc}) 둘 다 허용.
    const packRaw = this.cache.json.get(EDITOR_PACK_KEY) as { levels?: Record<string, CardBoardDoc> } | Record<string, CardBoardDoc> | null;
    const pack = ((packRaw && 'levels' in packRaw ? packRaw.levels : packRaw) ?? {}) as Record<string, CardBoardDoc>;
    // 저작된 레벨 수(승리 진행/다음 레벨 버튼 클램프에 사용).
    this.editorLevels = Math.max(1, editorLevelCount(pack));
    const def = levelDef(this.level, pack);

    // **미저작 레벨 방어** — 에디터에 없는 레벨(예: 아직 안 만든 상위 레벨)로 진입하면 홈으로 돌려보낸다.
    if (!def.layout) {
      this.toast('아직 만들어지지 않은 레벨이에요');
      this.time.delayedCall(900, () => this.scene.start('home'));
      return;
    }
    const layout = def.layout;

    // 화면 크롬 = 에디터 저작 main.json 이 SSOT. 저작된 이미지 크롬이 있으면 그것을 렌더하고 보드
    // 영역을 암막 패널(layer_4)에 맞춘다. 없으면(디자인 미완) 코드 배경/타워/암막으로 폴백.
    // **앵커 변환은 여기 한 번뿐** — 아래로 내려가는 모든 측정(보드 영역·동선·게이지)이 렌더와
    //   같은 좌표를 보게 한다. 현재 캔버스(고정 1080×2400)에서는 여분 0이라 원본 그대로다.
    const rawMainDoc = (this.cache.json.get(UI_MAIN_KEY) ?? null) as LayoutDoc | null;
    const mainDoc = rawMainDoc ? anchorDoc(this, rawMainDoc, MAIN_ANCHOR) : null;
    if (this.hasEditorChrome(mainDoc)) {
      this.applyEditorChrome(mainDoc!);
    } else {
      this.drawBackground(FLOORS[(this.floorThemeIdx - 1) % FLOORS.length].tint);
      this.drawTower(save.builtFloors);
    }

    this.drawHud();

    // **레벨별 결정적 시드** — 리로드/재플레이해도 같은 딜이 나와 **저장된 난이도(특히 연속매칭)가 유지**된다(예전 Date.now() 시드는 매번 달라져 난이도가 요동쳤음).
    const rng = seededRng(this.level * 7919 + 104729);
    // **동적(적응형) 난이도 딜** — 보드 배치는 결정적(저작 or 생성)이되 스톡은 placeholder 카운트만 두고,
    //   실제 뽑기 랭크는 drawStock 이 초기 등급 + 유저 플레이(막힘/원활)에 맞춰 뽑는 순간 결정한다(러버밴딩).
    //   등급 미설정 레벨은 보통(2)을 기본으로. 뽑기 수는 저작값(또는 등급 산출)에서 30% 감소.
    const grade: Grade = (layout.difficulty ?? 2) as Grade;
    if (layout.initialDeal) {
      // 에디터가 저작·테스트한 보드 배치는 유지(디자이너 의도), 스톡만 동적으로 전환.
      this.state = dealDynamic(layout, rng, grade, {
        board: layout.initialDeal.board,
        waste: layout.initialDeal.waste,
        stockCount: this.stockOverride != null ? Math.round(this.stockOverride / DYN_STOCK_REDUCE) : layout.initialDeal.stock.length,
        rescue: this.level <= RESCUE_MAX_LEVEL,
        plus5Curated: this.level <= PLUS5_CURATED_MAX_LEVEL,
      });
    } else {
      this.state = dealDynamic(layout, rng, grade, { stockCount: this.stockOverride != null ? Math.round(this.stockOverride / DYN_STOCK_REDUCE) : (layout.stock ?? undefined), rescue: this.level <= RESCUE_MAX_LEVEL, plus5Curated: this.level <= PLUS5_CURATED_MAX_LEVEL });
    }
    this.boardSlots = Math.max(1, Object.keys(this.state.board).length); // 별 등급 축① 정규화 기준(보드 크기).
    this.initialStock = this.state.stock.length; // 축②(남은 카드 수) 분모 — **뽑기 전** 장수로 고정.
    // 이 레벨 **정답 수순의 품질** — 별은 이 값 대비로 매긴다(최적으로 풀수록 5★에 가까워진다).
    const sol = layout.initialDeal?.solution;
    this.refQuality = sol && sol.length ? referenceQuality(sol, this.boardSlots, this.initialStock) : 0;
    this.buildBoard();
    // 부스터 하단선에 뽑기/기준 카드 정렬 — buildBoard 뒤(카드 높이 확정)·buildStockAndWaste 앞이어야 한다.
    const boosterBottom = this.boosterBottomY();
    if (boosterBottom != null) alignStockRowToBottom(boosterBottom, this.geom.cardH);
    this.buildStockAndWaste();
    this.drawBoosters();
    this.alignBottomLabels(); // 하단 라벨 5개를 한 줄로.
    this.playWindowEntrance(); // 창(배경 제외)이 살짝 찌그러졌다 펴지며 등장.
    /*
     * **보상 회수 표식 시작**(PO 2026-08-24) — 이 판에서 나갈 보상을 되돌릴 수 있게 지금 상태를 찍는다.
     *   세이브에 남으므로 앱을 강제 종료해도 다음 부팅에서 회수된다.
     */
    beginPlaySession();
    this.placeDiamonds(); // 카드 2장에 다이아 끼우기(수집 시 별 게이지 옆에 보관) — PO 2026-08-24 재요청으로 복원.
    this.designateWild(); // 보드 카드 하나를 와일드로 지정(노출 시 자동으로 스톡에 삽입).
    this.refresh();
    // 최초 딜 연출 — 폴드 먼저 차르륵, 오픈 카드는 좌우에서 날아와 안착(가속 리듬).
    this.dealInAnimation();
    // 자동 시뮬레이션 QA 도구(dev 빌드 전용) — 버튼 배치 + 이전 판에서 켜둔 상태면 이어서 진행.
    this.drawAutoTestUI();
    if (autoTestState.running) this.startAutoTest();
    // 레벨 점검용 시뮬레이션 바(하단 중앙) — 켠 채로 레벨을 옮겨도 자동 진행되지 않게 항상 꺼진 상태로 시작.
    this.drawSimBar();
    this.tipShownThisRound = false;
    /*
     * **안내는 기기당 딱 한 번**(PO 2026-08-24: "이 화면은 한번만 표시하세요 · 반복 표시 금지").
     *   예전 규칙 "레벨 1 은 언제나 튜토리얼부터"(PO 2026-08-23)는 레벨 1 진입마다 기록을
     *   지웠는데(resetTipsSeen), 그래서 1레벨을 다시 할 때마다 뽑기 등 모든 안내가 또 떴다 —
     *   최신 지시로 대체한다. 처음 설치한 기기는 기록이 비어 있으므로 첫 1레벨 튜토리얼은 그대로 나온다.
     *   (되살리려면 save.ts 의 resetTipsSeen 을 리셋 메뉴 등에서 부르면 된다 — 지금은 호출처 없음.)
     */
    this.tipsSeen = loadTipsSeen();
    // 초반 몇 수는 "이 카드를 탭하세요" 화살표를 반복해 보여 준다(레벨 1~3 한정).
    this.arrowHintsLeft = this.level <= 3 ? 5 : 0;
    this.tryTip('match'); // 판 시작 — 아직 기본 규칙을 안 본 유저에게만 뜬다.
  }


  /** 미션 보상으로 나올 리그 별 개수 — 1~10 랜덤(PO 2026-08-24). */
  private rollStarAmount(): number {
    return Phaser.Math.Between(MISSION_STARS_MIN, MISSION_STARS_MAX);
  }

  /**
   * **＋카드 배치**(PO 2026-08-24) — 미션이 준 뽑기 보충분을 **보드 카드 뒤에 꽂아 둔다**.
   *   그 자리에서 바로 스톡에 넣으면 "저절로 늘었다"가 되고, 무엇을 받았는지 볼 틈도 없다.
   *   그 카드를 내는 순간(`onCardTap`) 뽑기 더미로 날아 들어간다 — 받는 것도 플레이어의 행동이 된다.
   *
   * @returns 꽂힌 좌표(예고 아이콘이 정확히 그 자리로 날아온다). 자리가 없으면 null.
   */
  private placeStockCards(count: number, wild = false, artKey?: string): { x: number; y: number } | null {
    const key = artKey ?? (wild ? MISSION_ICON.wild : MISSION_ICON.plus5);
    if (!this.textures.exists(key)) return null;
    const want = Math.max(0, Math.floor(count));
    if (want <= 0) return null;
    const exposedNow = new Set(this.state.layout.slots.filter((sl) => isExposed(this.state, sl.id)).map((sl) => sl.id));
    const taken = (id: string): boolean =>
      this.diamondSlots.has(id) || id === this.wildSlotId || id === this.bonusSlot?.id ||
      this.boardCollections.has(id) || this.starSlots.has(id) || this.stockSlots.has(id);
    const hidden = [...this.cards.keys()].filter((id) => !exposedNow.has(id) && !taken(id));
    const any = [...this.cards.keys()].filter((id) => !taken(id));
    const pool = hidden.length ? hidden : any; // 가려진 자리 우선(열릴 때 드러나는 맛).
    if (!pool.length) return null;
    const got = this.pickVisibleSlot(pool); // 가장 잘 드러나는 카드에 꽂는다.
    if (!got) return null;
    const { id, spot } = got;
    const view = this.cards.get(id);
    if (!view) return null;
    this.stockSlots.set(id, { count: want, wild });
    const img = this.add.image(0, 0, key).setDepth((view.depth ?? 100) - PlayScene.BADGE_BEHIND);
    const sz = this.geom.cardW * 0.62;
    const src = texSize(img.texture);
    img.setDisplaySize(sz, sz * (src.height / src.width));
    const baseSX = img.scaleX;
    const baseSY = img.scaleY;
    img.setPosition(spot.x, spot.y);
    img.setAlpha(0).setScale(baseSX * 1.7, baseSY * 1.7);
    this.tweens.add({ targets: img, alpha: 1, scaleX: baseSX, scaleY: baseSY, duration: 240, ease: 'Back.easeOut' });
    this.stockViews.set(id, { img });
    return { x: img.x, y: img.y };
  }

  /** 꽂혀 있던 ＋카드를 **뽑기 더미로** 회수한다 — 카드를 낸 순간에 불린다. */
  private collectStockCards(gift: { count: number; wild: boolean }, sv?: { img: Phaser.GameObjects.Image }): void {
    const { count: n, wild } = gift;
    /*
     * ⚠️ 와일드는 `refillStock` 으로 줄 수 없다(PO 2026-08-24 신고: "미션 보상으로 확보된 와일드
     *   카드는 어디에도 표시되지 않고 사라진다"). 그 함수는 **버린 더미의 카드를 되돌리는** 것이라
     *   와일드를 한 장도 만들지 않고, 버린 더미가 비어 있으면 아무 일도 없이 끝난다.
     *   와일드는 `addWildCards` 로 **새로 만들어** 스톡 중간에 섞어 넣는다.
     */
    /*
     * ⚠️ `refillStock` 을 쓰면 안 된다(PO 2026-08-24 신고: "연출은 일어나지만 실제로 뽑기 카드에
     *   반영되지 않습니다"). 그 함수는 **버린 더미(waste)의 카드를 되돌리는** 것이라, 아직 버린 카드가
     *   없으면 조용히 아무 일도 하지 않는다 — 판 초반 미션 보상에서 정확히 그 상황이 된다.
     *   보드 보너스(+N)와 같은 `addStockCards` 로 **새 카드를 실제로 얹는다**.
     */
    const before = this.state.stock.length;
    if (sv?.img.active) {
      // ＋카드·와일드도 위클리 수집 대상(PO 2026-08-24).
      this.creditEventFromPlay(n, { x: sv.img.x, y: sv.img.y }, wild ? 'wild' : 'cards');
    }
    this.state = wild ? addWildCards(this.state, n, this.rng) : addStockCards(this.state, n);
    if (this.state.stock.length === before) return; // 방어 — 늘지 않았으면 연출도 하지 않는다.
    /*
     * ⚠️ **표시 상한을 걸지 않는다**(PO 2026-08-24 신고: "뽑기 더미에 카드가 없을 경우 추가된 카드가
     *   표시되지 않는다").
     *
     * 보너스(+N) 카드는 회수 카드가 **한 장씩 날아오며** 상한을 1씩 올려 순차 노출한다. 그런데 여기서는
     * 아이콘 **하나만** 날아가므로 상한을 올려 줄 사람이 없다 — 더미가 비어 있었다면(`before === 0`)
     * 상한이 0 에 묶여 **추가된 카드가 영영 안 보인다**. 도착하는 순간 전량 표시한다.
     */
    this.stockRevealMax = 999;
    this.buildStockPile();
    this.refresh();
    if (wild) this.labRun.wildBanked += n;
    sfx('card_deal');
    this.toast(wild ? `🃏 와일드 +${n} — 뽑기 더미에 섞였어요` : `🃏 뽑기 +${n}`);
    if (!sv?.img.active) return;
    const img = sv.img;
    this.tweens.killTweensOf(img);
    img.setDepth(6900);
    // 확대했다가 뽑기 더미로 빨려 들어간다(별과 같은 문법 — 커졌다가 목적지로).
    this.tweens.add({
      targets: img,
      scaleX: img.scaleX * 1.6,
      scaleY: img.scaleY * 1.6,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!img.active) return;
        this.tweens.add({
          targets: img,
          x: STOCK.x,
          y: STOCK.y,
          scaleX: img.scaleX * 0.3,
          scaleY: img.scaleY * 0.3,
          duration: 460,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            img.destroy();
            if (!this.scene.isActive()) return;
            this.buildStockPile(); // 도착과 함께 더미가 늘어난 모습으로 갱신.
            this.refresh();
          },
        });
      },
    });
  }

  /**
   * **보드에 꽂히는 미션 보상을 실제로 꽂는다**(PO 2026-08-24) — **미션이 완료되는 그 순간**
   * (5매치 달성 = `grantMissionReward`)에 불린다. 지급·연출·다음 예고 교체까지 여기서 끝낸다.
   *
   * @param rw     미션이 예고해 둔 보상(별 또는 컬렉션 카드).
   * @param filled 그 시점까지 매칭한 수 — 별 개수는 이 값이다(랜덤이 아니다).
   */
  private placeBoardMissionReward(rw: MissionReward, filled: number): void {
    if (rw.kind === 'stars') {
      const landing = this.placeLeagueStars(filled);
      /*
       * 꽂은 별은 **날아온 아이콘이 도착할 때까지 숨긴다**. 먼저 보이면 "이미 있던 별"과 "날아온 별"이
       *   따로 놀아 두 개처럼 읽힌다. 도착 순간에 등장 트윈을 돌려 하나로 이어 붙인다.
       */
      const placed = landing ? [...this.starViews.values()].pop() : undefined;
      if (placed) {
        this.tweens.killTweensOf(placed.img);
        placed.img.setAlpha(0);
      }
      this.missionRewardBurst(rw, landing ?? undefined, () => {
        if (!placed?.img.active) return;
        const sx = placed.img.scaleX;
        const sy = placed.img.scaleY;
        placed.img.setScale(sx * 1.7, sy * 1.7);
        this.tweens.add({ targets: placed.img, alpha: 1, scaleX: sx, scaleY: sy, duration: 240, ease: 'Back.easeOut' });
      });
      this.rerollMissionPreview(); // 지급을 마쳤으니 이제 다음 미션으로.
      return;
    }
    if (rw.kind === 'plus5' || rw.kind === 'wild' || rw.kind === 'cards') {
      const landing = this.placeStockCards(rw.amount, rw.kind === 'wild', MISSION_ICON[rw.kind]);
      const placed = landing ? [...this.stockViews.values()].pop() : undefined;
      if (placed) {
        this.tweens.killTweensOf(placed.img);
        placed.img.setAlpha(0);
      }
      this.missionRewardBurst(rw, landing ?? undefined, () => {
        if (!placed?.img.active) return;
        const sx = placed.img.scaleX;
        const sy = placed.img.scaleY;
        placed.img.setScale(sx * 1.7, sy * 1.7);
        this.tweens.add({ targets: placed.img, alpha: 1, scaleX: sx, scaleY: sy, duration: 240, ease: 'Back.easeOut' });
      });
      this.rerollMissionPreview();
      return;
    }
    if (rw.kind !== 'collection') return;
    const save = loadSave();
    const slot = this.resolveCollectionSlot(rw.slot);
    if (!slot) {
      // 다 모았다 → 리그 별로 대체 지급(빈손 방지). 개수는 마찬가지로 매칭 수.
      this.placeLeagueStars(filled);
      this.toast(`미션 보상  ⭐ 리그 별 +${filled}`);
      this.rerollMissionPreview();
      return;
    }
    // **보드 투입** — 카드가 보드의 가려진 카드에 꽂히고, 열릴 때 스타게이지로 획득된다.
    const entry = this.awardCollectionCard(save, slot);
    writeSave(save);
    this.tryTip('collection'); // 컬렉션 카드를 처음 받았을 때 한 번 설명.
    this.playCollectionCardReveal(slot, entry);
    this.toast(entry ? '미션 보상  🧩 컬렉션 조각 → 보드에 꽂혔어요' : `미션 보상  🧩 컬렉션 조각 ${slot.set}-${slot.card}`);
    this.rerollMissionPreview();
  }

  /**
   * **투데이 리그 별 배치**(PO 2026-08-24) — 미션(5매치)을 완성하면 그 보상으로 보드에 별이 꽂힌다.
   *
   * ## 왜 보드에 꽂는가
   * 그 자리에서 바로 날아가면 "저절로 생긴 것"이 된다. 다이아·컬렉션 카드처럼 **가려진 카드 뒤에**
   * 꽂아 두면, 그 카드를 여는 것이 곧 회수다 — 보상을 받는 것도 플레이어의 행동이 된다.
   *
   * ⚠️ 이 별은 **그 판의 등급(1★~5★) 판정과 완전히 무관**하다. 좌측 5별 게이지(품질)는 건드리지 않고
   *   오직 투데이 리그 점수로만 들어간다. 둘을 섞으면 리그를 돌리려고 등급이 오르는 착시가 생긴다.
   */
  private placeLeagueStars(count: number): { x: number; y: number } | null {
    if (!this.textures.exists(LEAGUE_STAR_KEY)) return null;
    const want = Math.max(0, Math.floor(count));
    if (want <= 0) return null;
    const exposedNow = new Set(this.state.layout.slots.filter((sl) => isExposed(this.state, sl.id)).map((sl) => sl.id));
    // 자리 다툼 방지 — 다이아·와일드·보너스·컬렉션·이미 꽂힌 별이 쓰는 슬롯은 뺀다(겹치면 뒤가 안 보인다).
    const taken = (id: string): boolean =>
      this.diamondSlots.has(id) || id === this.wildSlotId || id === this.bonusSlot?.id ||
      this.boardCollections.has(id) || this.starSlots.has(id) || this.stockSlots.has(id);
    const hidden = [...this.cards.keys()].filter((id) => !exposedNow.has(id) && !taken(id));
    const any = [...this.cards.keys()].filter((id) => !taken(id));
    const pool = hidden.length ? hidden : any; // 가려진 자리 우선(열릴 때 드러나는 맛).
    if (!pool.length) return null;
    /*
     * **한 곳에 몰아서 놓는다**(PO 2026-08-24). 여러 카드에 흩뿌리면 몇 개를 받았는지 세어야 하고,
     *   회수도 찔끔찔끔 나뉘어 "한 방"이 없다. 한 카드에 크게 하나 두고 **개수 배지**로 양을 보여준 뒤,
     *   그 카드를 열 때 그 자리에서 터지듯 흩어져 리그로 들어가는 편이 읽기도 쉽고 손맛도 있다.
     */
    const got = this.pickVisibleSlot(pool); // 가장 잘 드러나는 카드에 꽂는다.
    if (!got) return null;
    const { id, spot } = got;
    const view = this.cards.get(id);
    if (!view) return null;
    this.starSlots.set(id, want);
    const img = this.add.image(0, 0, LEAGUE_STAR_KEY).setDepth((view.depth ?? 100) - PlayScene.BADGE_BEHIND);
    const sz = this.geom.cardW * 0.62 * 0.96; // 다이아 기준 **96%**(PO 2026-08-24: 120% 에서 다시 80% 로).
    img.setDisplaySize(sz, sz);
    const baseSX = img.scaleX;
    const baseSY = img.scaleY;
    img.setPosition(spot.x, spot.y);
    img.setAlpha(0).setScale(baseSX * 1.7, baseSY * 1.7);
    // ⚠️ delay 트윈 금지 — 씬 재시작 시 대기 트윈이 파괴된 오브젝트를 물고 루프를 멈춘다(전 게임 공통).
    this.tweens.add({ targets: img, alpha: 1, scaleX: baseSX, scaleY: baseSY, duration: 240, ease: 'Back.easeOut' });
    /*
     * **숫자를 적지 않는다**(PO 2026-08-24). 보드 위는 카드가 주인공이라 배지가 붙으면 시선을 뺏고
     *   다이아·와일드와도 격이 어긋난다. 몇 개인지는 **회수 순간 흩어지는 개수**로 보여 준다.
     */
    this.starViews.set(id, { img });
    return { x: img.x, y: img.y }; // 미션 예고 아이콘이 **정확히 이 자리로** 날아온다.
  }

  /**
   * **보드에 꽂는 물건(다이아·별·＋카드)이 실제로 보이는 자리**를 찾는다(PO 2026-08-24).
   *
   * 이 게임의 보드는 카드가 세로로 촘촘히 겹치고 열 사이 간격도 좁다. 한 방향으로만 삐져나오게 두면
   * 그 방향에 카드가 있는 순간 **완전히 가려져 "배치가 안 됐다"로 보인다**(다이아가 안 보인다는 신고).
   * 네 방향(우·좌·위·아래)을 놓고 **덮는 카드와의 여유(clear)를 실제로 재서** 가장 트인 쪽을 쓴다.
   *
   * @returns 절대 좌표 + 기울임 + `clear`(0=완전히 겹침, 1=아무 것도 안 겹침).
   */
  private bestBadgeSpot(view: Phaser.GameObjects.GameObject & { x: number; y: number; depth?: number }): {
    x: number;
    y: number;
    angle: number;
    clear: number;
  } {
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const cands = [
      { x: view.x + cw * 0.62, y: view.y + ch * 0.16, angle: 13 },
      { x: view.x - cw * 0.62, y: view.y + ch * 0.16, angle: -13 },
      { x: view.x, y: view.y - ch * 0.66, angle: -13 },
      { x: view.x, y: view.y + ch * 0.66, angle: 13 },
    ];
    /** 그 지점을 **앞에서 덮는** 카드와 얼마나 떨어져 있나(가장 가까운 것 기준, 0..1). */
    const clearOf = (px: number, py: number): number => {
      let worst = 1;
      for (const [, cv] of this.cards) {
        if (cv === view) continue;
        if ((cv.depth ?? 0) < (view.depth ?? 0)) continue; // 먼저 그려진(뒤) 카드는 배지를 가리지 않는다.
        const dx = Math.abs(cv.x - px) / (cw * 0.5);
        const dy = Math.abs(cv.y - py) / (ch * 0.5);
        const overlap = Math.min(1, Math.max(0, 1 - dx)) * Math.min(1, Math.max(0, 1 - dy));
        worst = Math.min(worst, 1 - overlap);
      }
      return worst;
    };
    let best = { ...cands[0], clear: -1 };
    for (const c of cands) {
      const clear = clearOf(c.x, c.y);
      if (clear > best.clear) best = { ...c, clear };
      if (clear >= 1) break; // 완전히 트였으면 더 볼 것 없다.
    }
    return best;
  }

  /**
   * 후보 슬롯 중 **꽂은 물건이 가장 잘 드러나는** 카드를 고른다.
   *   무작위로 고르면 조밀한 한복판이 뽑혀 아무리 놓아도 안 보인다.
   *   자리 값이 같으면 앞쪽(무작위로 섞인 순서)을 쓴다 — 매번 같은 카드에 몰리지 않게.
   */
  private pickVisibleSlot(pool: readonly string[]): { id: string; spot: { x: number; y: number; angle: number } } | null {
    let best: { id: string; spot: { x: number; y: number; angle: number }; clear: number } | null = null;
    const order = [...pool].sort(() => Phaser.Math.FloatBetween(-1, 1));
    for (const id of order) {
      const view = this.cards.get(id);
      if (!view) continue;
      const spot = this.bestBadgeSpot(view);
      if (!best || spot.clear > best.clear) best = { id, spot, clear: spot.clear };
      if (spot.clear >= 0.98) break;
    }
    return best ? { id: best.id, spot: best.spot } : null;
  }

  /**
   * **다이아 배치** — 보드 카드 중 2장에 다이아를 끼운다(초기 노출 팁은 피해 '중간에 낀' 느낌).
   *   위치: 카드 **오른쪽**에 자리가 있으면 옆, 없으면 왼쪽, 그것도 없으면 **위/아래**.
   *
   * ⚠️ 2026-08-24 에 한 번 제거했다가 **같은 날 복원**했다(PO 재요청). 새 보상(리그 별·＋카드·와일드)이
   *   보드 자리를 함께 쓰므로, 자리 다툼 목록(`taken`)에 다이아가 빠지지 않게 유지할 것.
   */
  private placeDiamonds(): void {
    if (!this.textures.exists('up_Solitare_UI_2_2')) return;
    const exposedNow = new Set(this.state.layout.slots.filter((s) => isExposed(this.state, s.id)).map((s) => s.id));
    // 초기 비노출(가려진) 슬롯 우선 → 플레이 중반에 드러나 수집되게.
    const candidates = [...this.cards.keys()].filter((id) => !exposedNow.has(id));
    const pool = candidates.length >= 2 ? candidates : [...this.cards.keys()];
    // **다이아 기본 1개 + 가끔(20%) 보너스 1개**(PO 2026-07-18: 미션 리워드·데일리챌린지로 다이아 소스가
    //   다변화돼 보드 고정 지급을 2→1로 낮춤 — economy.ts DEFAULT_ECON.boardDiamondBase/BonusRate 와 정합).
    //   결정적 셔플(레벨 시드) 후 앞에서 뽑음.
    const bonusRng = seededRng(this.level * 271 + 89);
    const count = Math.min(pool.length, bonusRng() < 0.2 ? 2 : 1);
    const rng = seededRng(this.level * 131 + 57);
    const shuffled = pool.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.id);
    // **가장 잘 보이는 카드부터** count 개(무작위 한복판에 놓으면 옆 카드에 덮여 안 보인다).
    const picked: { id: string; spot: { x: number; y: number; angle: number } }[] = [];
    const rest = [...shuffled];
    for (let k = 0; k < count; k++) {
      const got = this.pickVisibleSlot(rest);
      if (!got) break;
      picked.push(got);
      rest.splice(rest.indexOf(got.id), 1);
    }
    picked.forEach(({ id, spot }) => {
      const view = this.cards.get(id);
      if (!view) return;
      this.diamondSlots.add(id);
      // **카드 뒤**(depth − 0.3)에 배치 → 카드가 사라지면(플레이) 드러나 획득. 위/아래로 살짝 삐져나오게.
      const gem = this.add.image(0, 0, 'up_Solitare_UI_2_2').setDepth((view.depth ?? 100) - PlayScene.BADGE_BEHIND);
      const src = texSize(gem.texture);
      const gs = this.geom.cardW * 0.62;
      gem.setDisplaySize(gs, gs * (src.height / src.width));
      /*
       * **좌우로 비켜 놓는다**(PO 2026-08-24 신고: "다이아 복원되지 않았습니다. 화면에 안 보임").
       *   실제로는 배치돼 있었지만 **위/아래로 삐져나오게** 두어, 세로로 촘촘히 겹친 열에서는
       *   바로 위·아래 카드에 완전히 가려졌다. 별(우상)·＋카드(좌상)와 같이 옆으로 내보내면
       *   열이 아무리 겹쳐도 드러난다.
       */
      gem.setPosition(spot.x, spot.y);
      gem.setAngle(spot.angle);
      gem.setAlpha(0);
      this.tweens.add({ targets: gem, alpha: 1, duration: 300 }); // ⚠️ delay 트윈 금지(씬 재시작 시 루프 정지).
      this.diamondViews.set(id, gem);
    });
  }

  /**
   * **보드 특수 카드 지정** — 딜 시 보드 카드에서 와일드 1장 + 보너스(+N) 1장을 지정한다.
   *   (초기 비노출·다이아 아닌 슬롯 중 결정적 선택, 서로 다른 슬롯). 플레이 진행으로 노출되면
   *   refresh 가 감지해 와일드=스톡 뱅킹, 보너스=스톡 N장 추가 연출을 자동 트리거한다.
   */
  private designateWild(): void {
    if (!this.textures.exists('up_Solitare_UI_08')) return;
    const exposedNow = new Set(
      this.state.layout.slots.filter((s) => isExposed(this.state, s.id)).map((s) => s.id),
    );
    // 위치·값 규칙은 **logic/economyRules.ts 단일 출처**(시뮬레이터와 공유) — 여기선 아트 유무만 얹는다.
    const picked = pickSpecialSlots(this.state.layout, exposedNow, this.level, this.diamondSlots);
    if (!picked.wildSlotId) return;
    this.wildSlotId = picked.wildSlotId;
    this.wildBanked = false;
    const values = BONUS_VALUES.filter((v) => this.textures.exists(BONUS_ART[v]));
    if (picked.bonusSlotId && values.length) {
      const want = bonusValueForLevel(this.level);
      const count = values.includes(want) ? want : values[0]; // 아트 미로드 시 +1 폴백.
      this.bonusSlot = { id: picked.bonusSlotId, count };
      this.bonusTriggered = false;
    }
  }

  /**
   * **보너스 +N 연출** — 보드 +N 카드가 노출되면: ①확대·부양 → ②N장 뒷면이 순차적으로 스톡으로 빨려들어감
   *   → ③확대된 +N 카드 소멸. 상태는 즉시 갱신(스톡 N 증가 + 슬롯 클리어).
   */
  private triggerBonus(): void {
    const sp = this.bonusSlot;
    if (!sp || this.bonusTriggered) return;
    this.bonusTriggered = true;
    const { id: slot, count } = sp;
    this.labRun.bonusValue += count; // 실측: 이 판에서 보너스로 늘어난 뽑기 장수.
    const view = this.cards.get(slot);
    this.cards.delete(slot);
    const preStock = this.state.stock.length; // 보너스 전 스톡 수(순차 노출 시작점).
    this.state = consumeBonusCard(this.state, slot, count); // 스톡 N 추가 + 슬롯 클리어
    // **순차 노출** — 회수 카드가 하나씩 도착할 때마다 스톡 부채가 한 장씩 늘어난다(전량 즉시 표시 방지).
    this.stockRevealMax = preStock;
    this.buildStockPile();
    sfx('card_deal');
    this.toast(`🎁 +${count} 카드! 뽑기 더미가 늘어났어요`);
    this.tryTip('bonusCard');
    if (!view) {
      this.refresh();
      return;
    }
    view.disableInteractive();
    if (view.input) view.input.enabled = false;
    view.showArt(BONUS_ART[count]);
    view.setDepth(1300);
    const bsx = view.scaleX;
    const bsy = view.scaleY;
    // ① 확대·부양(잠시 보드에 보이게).
    this.tweens.add({
      targets: view,
      scaleX: bsx * 1.35,
      scaleY: bsy * 1.35,
      y: view.y - 40,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② N장 뒷면이 순차적으로 스톡으로 흡입.
        let arrived = 0;
        const emitEnd = (): void => {
          if (++arrived < count) return;
          this.stockRevealMax = 999; // 순차 노출 종료 — 전량 표시로 복귀.
          this.buildStockPile();
          // ③ +N 카드 소멸(팝 + 페이드).
          this.tweens.add({
            targets: view,
            scaleX: bsx * 1.55,
            scaleY: bsy * 1.55,
            alpha: 0,
            duration: 240,
            ease: 'Quad.easeIn',
            onComplete: () => {
              view.destroy();
              this.refresh();
            },
          });
        };
        // 뒷면 카드 크기: **확대된 +N 카드 크기(1.35)에서 → 뽑기 카드 크기(1.0)까지만 미소 축소**.
        const START = 1.35;
        const END = 1.0;
        // **뽑기 더미 중간으로 회수** — 부채(왼쪽 펼침)의 중앙 지점을 타깃(위/top 이 아님).
        const target = this.stockMidPoint();
        for (let i = 0; i < count; i++) {
          const back = new CardView(this, view.x, view.y, this.geom.cardW, this.geom.cardH, false);
          back.showBack();
          back.setDepth(1290 + i);
          back.setScale(bsx * START, bsy * START);
          const fx = view.x;
          const fy = view.y;
          const ctrlX = (fx + target.x) / 2;
          const ctrlY = Math.min(fy, target.y) - 150;
          this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 460, // 너무 빠르지 않은 회수 속도
            delay: i * 210, // 순차 '타라락'(3장이면 차례로)
            ease: 'Sine.easeInOut',
            onUpdate: (tw) => {
              const t = tw.getValue() ?? 0;
              const u = 1 - t;
              back.x = u * u * fx + 2 * u * t * ctrlX + t * t * target.x;
              back.y = u * u * fy + 2 * u * t * ctrlY + t * t * target.y;
              const s = Phaser.Math.Linear(START, END, t); // 미소 축소
              back.setScale(bsx * s, bsy * s);
              back.setAngle(60 * t); // 은은한 회전
            },
            onComplete: () => {
              back.destroy();
              // **도착한 이 한 장을 스톡 부채에 노출**(순차적으로 늘어남).
              if (this.stockRevealMax < 999) {
                this.stockRevealMax += 1;
                this.buildStockPile();
              }
              emitEnd();
            },
          });
        }
      },
    });
  }

  /**
   * **와일드 뱅킹 연출** — 보드 와일드가 노출되면 보드에서 제거(cleared)하고 스톡 중간에 와일드 카드를 삽입한다.
   *   시각적으로는 와일드 앞면을 드러낸 뒤 **팝 → 스톡 더미로 회전·축소하며 포물선 비행**한다(1회).
   */
  private bankWild(): void {
    const slot = this.wildSlotId;
    if (!slot || this.wildBanked) return;
    this.wildBanked = true;
    this.labRun.wildBanked += 1; // 실측: 보드 와일드가 뽑기 더미로 회수된 횟수.
    this.wildBanking = true; // 비행 도착 전까지 더미에 와일드 아트를 표시하지 않음
    const view = this.cards.get(slot);
    this.cards.delete(slot);
    this.state = bankWildToStock(this.state, slot, this.rng); // 스톡 중간(임의 순서) 삽입 + 슬롯 클리어
    sfx('card_deal');
    this.toast('🃏 와일드 카드 발견! 뽑기 더미 속으로 들어갔어요');
    this.tryTip('wildCard');
    if (!view) {
      this.wildBanking = false;
      this.refresh();
      return;
    }
    view.disableInteractive();
    if (view.input) view.input.enabled = false;
    view.showWild();
    view.setDepth(1300);
    const bsx = view.scaleX;
    const bsy = view.scaleY;
    // ① 잠시 보드에 와일드로 보인 뒤 → 팝(확대, 살짝 뜸).
    this.tweens.add({
      targets: view,
      scaleX: bsx * 1.22,
      scaleY: bsy * 1.22,
      y: view.y - 26,
      delay: 320,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② 스톡 더미로 포물선 비행 → 더미 속으로. **최종 크기는 뽑기 카드 크기(×1.0)로 유지**(미소 축소만).
        const fx = view.x;
        const fy = view.y;
        const ctrlX = (fx + STOCK.x) / 2;
        const ctrlY = Math.min(fy, STOCK.y) - 300;
        // 잔상(트레일) 미사용 — 회수 시 카드 흰 외곽이 경로에 반복 표시되지 않게.
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 560,
          ease: 'Sine.easeIn',
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            const u = 1 - t;
            view.x = u * u * fx + 2 * u * t * ctrlX + t * t * STOCK.x;
            view.y = u * u * fy + 2 * u * t * ctrlY + t * t * STOCK.y;
            view.setAngle(720 * t);
            view.setScale(Phaser.Math.Linear(bsx * 1.22, bsx, t), Phaser.Math.Linear(bsy * 1.22, bsy, t));
          },
          onComplete: () => {
            view.destroy();
            this.wildBanking = false; // 도착 후에야 더미에 와일드 아트 표시
            this.buildStockPile(); // 수량 불변이라 refresh 만으론 재구성 안 됨 → 직접 재빌드(와일드 아트 노출)
            this.refresh(); // 하이라이트·라벨 갱신
          },
        });
      },
    });
  }

  /**
   * **다이아 회수 애니메이션**(요구) — 다이아가 **크게 떴다가** 상단 보유 표시 공간으로 **위로 회수**된다.
   */
  private collectDiamond(gem: Phaser.GameObjects.Image): void {
    sfx('coin_burst', { volume: 0.3 }); // 수집음(대용).
    // **다이아 위치를 가리켜** 안내한다(PO 2026-08-22) — 말풍선 꼬리가 그 다이아를 향하고, 창 안에도 다이아를 띄운다.
    this.tryTipAt('diamond', { x: gem.x, y: gem.y }, gem.texture.key);
    const s0 = gem.scaleX;
    gem.setDepth(1500).setAlpha(1);
    // ① 크게 팝업(위로 살짝).
    this.tweens.add({
      targets: gem,
      scaleX: s0 * 2.6,
      scaleY: s0 * 2.6,
      y: gem.y - 70,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② **별 게이지(선수집 장소)** 로 회수(위로, 작아지며). — 헤더가 아니라 게이지 옆에 보관된다.
        const t = this.diamondHoldTarget();
        this.tweens.add({
          targets: gem,
          x: t.x,
          y: t.y,
          scaleX: s0 * 0.4,
          scaleY: s0 * 0.4,
          duration: 480,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            gem.destroy();
            this.holdDiamond(1);
          },
        });
      },
    });
  }

  /** 다이아 **완성 보상풀 위치** — 중앙 고정 슬롯(layer_5). 미설정 시 게이지 옆/폴백. */
  private diamondHoldTarget(): { x: number; y: number } {
    if (this.missionDiamondPos) return this.missionDiamondPos;
    if (this.gaugeGeom.width > 0) return { x: this.gaugeGeom.left + this.gaugeGeom.width + 30, y: this.gaugeGeom.y + 4 };
    return { x: 250, y: 360 };
  }

  /**
   * **다이아 보관**(미확정) — 수집분을 pendingDiamonds 에 쌓고, **별 게이지 옆 보관 배지**에 개수 표시.
   *   **승리 시에만** finishMission 에서 save 에 확정된다(패배/이탈 시 보관분은 사라짐). 헤더는 건드리지 않는다.
   */
  private holdDiamond(n: number): void {
    this.pendingDiamonds += n;
    this.labRun.diamonds += n;
    const t = this.diamondHoldTarget();
    if (!this.diamondHold) {
      const icon = this.add.image(t.x, t.y, 'up_Solitare_UI_2_2').setDepth(75);
      if (this.textures.exists('up_Solitare_UI_2_2')) {
        const src = texSize(icon.texture);
        icon.setDisplaySize(46, 46 * (src.height / src.width));
      }
      const text = this.add
        .text(t.x + 26, t.y, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#5a1a6a', strokeThickness: 6 })
        .setOrigin(0, 0.5)
        .setDepth(75);
      this.diamondHold = { icon, text };
    }
    this.diamondHold.text.setText(`+${this.pendingDiamonds}`); // 완성 보상풀 누적 표시.
    this.tweens.add({ targets: [this.diamondHold.icon, this.diamondHold.text], scaleX: '*=1.3', scaleY: '*=1.3', duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ── 에디터 SSOT 크롬 ────────────────────────────────────────────────
  /** main.json 이 화면 크롬(배경/storefront 등 이미지 노드)을 저작했는지 — 텍스처 로드까지 확인. */
  private hasEditorChrome(doc: LayoutDoc | null): boolean {
    return !!doc?.nodes?.some((n) => n.type === 'image' && this.textures.exists(n.key ?? ''));
  }

  /**
   * 에디터 크롬 렌더 + 보드 영역을 암막 패널에 맞춤.
   *   layer_4 처럼 화면 대부분을 덮는 rect(암막 보드 패널)을 찾아 그 세로 범위를 보드 상단으로 채택 →
   *   코드 암막(drawBoardMask)은 생략(중복 방지). 하단은 스톡(STOCK.y) 위 여백을 유지.
   */
  /**
   * **배경은 축소(fit)하지 않고 크롭/확장(cover)** 한다(화면비 표준 4절) — 캔버스가 저작 프레임보다
   * 커졌을 때 배경 옆·위아래가 비지 않게 덮을 때까지만 키운다. 앵커가 이미 배경을 캔버스 중앙에
   * 놓았으므로 크기만 손보면 된다.
   *
   * ⚠️ **이 게임의 플레이 배경(layer_1)은 저작 폭과 정확히 같은 1080×2400 이고 원본 PNG 는 841×1870**
   *   이다 — 가로 블리드가 0이라, 폭이 늘어나면 세로가 크게 잘리고(1520 폭에서 상하 각 489px)
   *   원본 대비 1.8배 업스케일이 된다. 그래서 양축 가변은 아직 켜지 않았다(game.ts 참조).
   *   여기 코드는 **블리드 포함 배경 에셋이 들어오면 곧바로 동작**하도록 미리 배선해 둔 것이고,
   *   현재 고정 캔버스에서는 배율이 정확히 1이라 아무 일도 하지 않는다.
   */
  private applyBackgroundCover(): void {
    const bg = this.chrome?.tryById<Phaser.GameObjects.Image>('layer_1');
    const node = this.chrome?.nodeById('layer_1');
    if (!bg || !node?.w || !node?.h) return;
    const v = viewBounds(this); // 줌이 걸리면 "화면 전체"는 캔버스 크기가 아니다.
    const s = coverScale(node.w, node.h, v.w, v.h);
    if (s === 1) return; // 여분 0 — 저작 그대로(현재 경로).
    bg.setDisplaySize(node.w * s, node.h * s);
  }

  /** 암막 보드 패널(layer_4)의 라운드 반경(px) — 폭이 넓어져 모서리가 드러날 때만 적용. */
  private static readonly BOARD_PANEL_RADIUS = 36;

  /**
   * **암막 보드 패널의 귀퉁이 라운드** — 캔버스 폭이 저작 폭보다 넓어지면 패널(layer_4, 저작 폭 1106)이
   * 화면을 다 덮지 못해 **네 귀퉁이가 배경 위에 그대로 드러난다**. 저작값은 radius 0 이라 직각으로
   * 잘린 사각형이 보인다(PO 지적 2026-08-21) — 그럴 때만 같은 자리에 라운드로 다시 그린다.
   *
   * 저작 폭과 같을 때는(여분 0) 모서리가 화면 밖이라 손대지 않는다 — 기존 화면과 100% 동일.
   */
  private roundBoardPanelCorners(): void {
    if (viewBounds(this).w <= SAFE_W) return; // 보이는 폭이 저작 폭 이하면 귀퉁이가 화면 밖이다.
    const node = this.chrome?.nodeById('layer_4');
    const g = this.chrome?.tryById<Phaser.GameObjects.Graphics>('layer_4');
    if (!node || !g || node.type !== 'rect' || !node.w || !node.h) return;
    const r = Math.min(PlayScene.BOARD_PANEL_RADIUS, node.w / 2, node.h / 2);
    g.clear();
    g.fillStyle(Phaser.Display.Color.HexStringToColor(node.fill ?? '#000000').color, node.fillAlpha ?? 1);
    g.fillRoundedRect(node.x - node.w / 2, node.y - node.h / 2, node.w, node.h, r);
  }

  private applyEditorChrome(doc: LayoutDoc): void {
    // 동적 노드(게이지 채움·박스 칸·보상 팝업 목업)는 코드가 직접 제어하므로 정적 렌더에서 제외.
    const staticDoc: LayoutDoc = { ...doc, nodes: doc.nodes.filter((n) => !DYNAMIC_NODE_IDS.has(n.id)) };
    this.chrome = buildLayout(this, staticDoc);
    this.applyBackgroundCover();
    this.roundBoardPanelCorners();
    this.chromeFromEditor = true;
    const panel = doc.nodes
      .filter((n) => n.type === 'rect' && (n.h ?? 0) >= 800)
      .sort((a, b) => (b.h ?? 0) - (a.h ?? 0))[0];
    if (panel?.h) {
      const panelTop = panel.y - panel.h / 2;
      this.boardTop = Math.round(panelTop + BOARD_TOP_PAD); // 패널 상단(=storefront 하단) 안쪽 패딩
      this.boardBottom = Math.min(BOARD_BOTTOM, STOCK.y - 60); // 스톡과 분리 간격
    }
    this.applyFloorInterior(); // **층별 인테리어 배선** — 현재 층 배치로 교체(없으면 1층 편의점 폴백).
    this.setupMissionChrome();
    this.setupEditorBoosters();
    this.spawnPedestrians(doc);
    this.setupStorefrontLife(); // **상단 점포에 점원 애니 + 손님 방문(이모지)** — 홈처럼 살아있게.
    // **홈과 동일한 상단 헤더**(코인 패널 UI_14_v3) 를 얹는다.
    //   (구 에디터 코인 패널 layer_4_2·layer_5_2 를 숨기던 배선은 해당 노드가 main.json 에서
    //    삭제되면서 죽은 코드가 돼 제거했다 — 코인 표시는 전적으로 이 헤더가 담당한다.)
    // ⚠️ 이 시점엔 아직 딜(this.state) 전이라 baseCoins 만 사용(점수 반영은 refresh 가 갱신).
    this.header = buildTopHeader(this, this.baseCoins, loadSave().diamonds ?? 0, this.level, () => this.openPlayMenu());
    /**
     * **상점·리그 아이콘 — 플레이 중에도 항상 표시**(PO 2026-08-22 상점 · 2026-08-23 리그).
     *
     * 코인이 모자라면 여기서 바로 충전하고, 지금 모으는 상품이 리그 어디쯤인지도 나가지 않고 본다.
     * ⚠️ 예전 상점은 **맨 텍스트에 반투명 배경**이라 홈의 레일 아이콘과 모양이 달랐고, 상단 배너·
     *   가게 아트에 반쯤 가려 보였다(사용자 리포트). 홈과 **같은 저작 아트**를 좌우 대칭으로 놓는다.
     */
    this.buildPlayRail();
    // 플레이 화면 닫기(✕) 버튼 = layer_20(up_DailyMission_08-1_v3, 우상단) — 저작만 돼 있고 미배선이었다
    //   (2026-07-19 PO 지시). ☰메뉴의 "홈으로"와 동일 동작 — 별도 확인창 없이 바로 홈으로.
    this.chrome?.tryById<Phaser.GameObjects.Image>('layer_20')?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('level_close');
      this.confirmQuit(); // 보상 회수 경고 후 이동(PO 2026-08-24).
    });
    // **미션 리워드 배너**(연속 플레이 별 수집) — 홈과 동일 위치/구성. 만료됐으면 여기서도 즉시 리셋 반영.
    //   손님을 정산할 때마다 creditMissionStars 가 실시간으로 저장까지 확정한다(PO 2026-07-18 3차) — 여기서는
    //   이번 판 진입 시점의 확정 진행도로 배너를 초기 표시만 한다.
    const mrSave = loadSave();
    const mrState = missionRewardOf(mrSave, Date.now());
    mrSave.missionReward = mrState;
    writeSave(mrSave);
    // ⚠️ 침범분은 **offsetY 인자로**(생성 뒤 이동은 setState 가 되돌린다).
    this.missionBanner = buildMissionRewardBanner(this, mrState, topUiShift(this), 1580, () => this.resetExpiredMissionTier());
    // **배너 = 주간 이벤트**(PO 2026-08-23) — 지금 모으는 층 상품 · 진행 · 코인 보상을 보여 준다.
    this.refreshEventBanner();
    /*
     * **플레이 화면에서도 배너를 눌러 위클리 팝업을 연다**(PO 2026-08-24). 홈에서만 열리면
     *   판을 도는 동안에는 목표를 확인할 길이 없다.
     *
     * ⚠️ 배너 **오브젝트마다** `setInteractive()` 를 걸면 안 된다(2026-08-24 사고). 크기가 없는
     *   오브젝트(Graphics 등)는 히트영역 콜백이 만들어지지 않아 `input.hatAreaCallback is not a
     *   function` 예외가 나고, 그러면 **그 프레임의 히트테스트 전체가 중단**된다 —
     *   보드 카드까지 한 장도 눌리지 않는다(PO 신고: "각 카드 클릭이 안 됩니다").
     *   대신 배너 영역을 덮는 **Zone 하나**만 둔다.
     */
    this.addBannerHit();
  }

  /**
   * **아이템샵 열기**(플레이 중) — 홈과 **같은 화면**(itemShop.ts 공용 모듈). 구매로 코인/다이아가 늘면
   *   이 씬의 잔액 캐시(`baseCoins`)와 헤더·부스터 활성 상태까지 즉시 맞춘다 — 안 그러면 코인을 샀는데도
   *   부스터가 계속 비활성으로 보인다.
   *   depth 는 플레이 메뉴(3000)보다 높게 잡아 메뉴 위에 뜬다.
   */
  /**
   * 플레이 화면 좌우 상단 레일 — 좌 상점 / 우 리그. 홈 레일과 같은 아트·같은 크기.
   * 배너(중앙)와 겹치지 않도록 화면 **가장자리**에 붙이고, 넓은 화면에서는 함께 바깥으로 나간다.
   */
  private buildPlayRail(): void {
    /*
     * **홈과 같은 아이콘·같은 크기·같은 구조**(PO 2026-08-24: "메인화면에서 배치된 아이콘 사이즈와
     *   구조를 동일하게 적용해야 함"). 예전엔 홈의 85%(118×139)로 줄이고 아래에 'Shop'·'League'
     *   글자를 따로 그려서, 같은 아트인데 두 화면이 달라 보였다. 라벨은 아트에 들어 있다.
     */
    const SIZE = { w: 139, h: 164 }; // 홈 저작값(home.json layer_11 / layer_11_copy3).
    const y = 250 + topUiShift(this);
    const edge = Math.max(0, (this.scale.width - W) / 2); // 넓어진 폭만큼 바깥으로.
    const mk = (x: number, key: string, label: string, onTap: () => void): void => {
      const cx = x + (x < W / 2 ? -edge : edge);
      if (this.textures.exists(key)) {
        const icon = this.add
          .image(cx, y, key)
          .setDisplaySize(SIZE.w, SIZE.h)
          .setDepth(1610)
          .setInteractive({ useHandCursor: true });
        icon.on('pointerdown', () => { sfx('button'); onTap(); });
        if (label === 'League') this.leagueIconImg = icon; // 게이지가 따라붙을 기준.
      }
      /*
       * 라벨 — 홈 저작값 그대로(`layer_13` "Shop": 아이콘 중심 y=268 기준 **+45**, 34px).
       * ⚠️ 리그 아이콘에는 라벨을 달지 않는다 — 홈도 그 자리에 **순위·남은 시간**을 쓰기 때문이다.
       */
      if (label) {
        this.add
          .text(cx, y + 45, label, { fontFamily: PlayScene.TIP_FONT, fontSize: '34px', color: '#ffffff' })
          .setOrigin(0.5)
          .setDepth(1611)
          .setStroke('#3a2410', 6);
      }
    };
    mk(100, 'up_Solitare_UI_15', 'Shop', () => this.openShop());
    mk(W - 100, 'up_Solitare_UI_18_v2', '', () => this.openLeagueFromPlay()); // 라벨 없음(순위·시간이 그 자리).
    this.leagueIconAt = { x: W - 100 + edge, y }; // 수집 연출 도착점(리그로 가는 드랍).
    // **순위 + 남은 시간** — 홈 리그 아이콘과 같은 규약(ui/leagueRail.ts).
    attachLeagueBadge(this, W - 100 + edge, y, 1611);
    // 별 수집 게이지가 붙을 자리 — 아이콘·배지 **바로 아래**(PO 2026-08-24).
    this.leagueGaugeY = y + SIZE.h * 0.5 + 49; // 게이지 상하폭 30→40 확대 반영(+5).
  }

  /**
   * **플레이 창 등장 연출**(PO 2026-08-24) — 팝업과 같은 "찌그러졌다 펴짐"을 판이 열릴 때도 준다.
   *
   * ⚠️ **배경은 제외**한다(`layer_1` 하늘·거리). 배경까지 흔들면 화면 전체가 출렁여 멀미가 난다 —
   *   움직여야 하는 것은 **창**(점포·매장·암막 패널과 그 위 장식)뿐이다.
   */
  private playWindowEntrance(): void {
    /*
     * 대상 = **창 전체**(점포 · 매장 인테리어 · 암막 패널 · 카드 · 부스터). 배경(하늘·거리)과 상단
     * HUD(헤더 · Shop/League 레일 · 배너)는 뺀다 — 배경이 흔들리면 화면 전체가 출렁여 멀미가 나고,
     * HUD 는 창 밖의 고정 요소다.
     *
     * ⚠️ 저작 노드만 모으면 **점포가 빠진다**: `setupStorefrontLife` 가 저작 점포(layer_2)를 숨기고
     *   **코드로 다시 그린다**(홈과 같은 아트 + 점원 + 유리). 그래서 노드 목록이 아니라 **깊이 범위**로
     *   훑는다(창 요소는 전부 depth ≤ 1300, HUD 는 1580 이상, 배경은 음수).
     */
    /*
     * ⚠️ **보드 카드는 뺀다**. 카드는 같은 순간 `dealInAnimation` 이 자리로 날려 보내는 중이라,
     *   여기서도 매 프레임 x/y 를 덮어쓰면 두 연출이 서로 밀어내며 딜이 뭉개지고 계산도 두 배가 된다
     *   (2026-08-24 점검). 창(점포·매장·암막·프레임)만 일렁이면 충분하다.
     */
    /*
     * ⚠️ **자체 트윈이 걸린 오브젝트도 뺀다**(PO 2026-08-25: "플레이 진입 시 첫 손님의 말풍선이 없어진다").
     *   `squashInObjects` 는 시작 순간의 scale 을 스냅샷해 매 프레임 되쓴다. 주문 말풍선·아이템은
     *   그 순간 팝인 트윈 시작값(scale 0)이라 **0 으로 굳어 끝까지 보이지 않았다**(실측: 10초 뒤에도
     *   scaleX 0, 팝인 트윈은 밀려나 소멸). 손님 숨쉬기 트윈도 같은 이유로 창 연출과 충돌한다.
     */
    const cardSet = new Set<Phaser.GameObjects.GameObject>(this.cards.values());
    const objs = this.children.list.filter((o) => {
      if (cardSet.has(o)) return false;
      if (this.tweens.getTweensOf(o).length > 0) return false; // 자체 연출 중(말풍선 팝인·손님 숨쉬기 등).
      const d = (o as Phaser.GameObjects.GameObject & { depth?: number }).depth ?? 0;
      if (d < 0 || d > PlayScene.WINDOW_MAX_DEPTH) return false; // 배경·HUD 제외.
      const key = (o as Phaser.GameObjects.Image).texture?.key;
      return key !== BACK_BG_KEY; // 코드로 그린 뒤 배경도 제외.
    });
    if (!objs.length) return;
    squashInObjects(this, objs, { x: W / 2, y: DARK_TOP + (H - DARK_TOP) * 0.35 });
  }

  /** 배너를 덮는 탭 영역 하나 — 오브젝트 각각에 입력을 걸지 않는다(히트테스트 사고 방지). */
  private addBannerHit(): void {
    const objs = (this.missionBanner?.objects ?? []).filter(
      (o): o is Phaser.GameObjects.GameObject & { getBounds: () => Phaser.Geom.Rectangle } =>
        typeof (o as { getBounds?: unknown }).getBounds === 'function',
    );
    if (!objs.length) return;
    let box: Phaser.Geom.Rectangle | undefined;
    for (const o of objs) {
      const b = o.getBounds();
      if (b.width <= 0 || b.height <= 0) continue;
      box = box ? Phaser.Geom.Rectangle.Union(box, b) : Phaser.Geom.Rectangle.Clone(b);
    }
    if (!box) return;
    this.add
      .zone(box.centerX, box.centerY, box.width, box.height)
      .setDepth(1650)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        sfx('button');
        this.openWeeklyFromPlay();
      });
  }

  /** 플레이 중 **주간 이벤트 팝업** — 홈과 같은 화면(ui/eventPanel). */
  private openWeeklyFromPlay(): void {
    this.openWeeklyFromPlayNow(); // 부팅 상주(그룹 해제 2026-08-31).
  }

  private openWeeklyFromPlayNow(): void {
    let panel: Phaser.GameObjects.Container | undefined;
    panel = openEventPanel(this, {
      depth: 4300,
      itemFloor: this.playFloor, // 지금 점포의 상품(배너와 같은 값).
      onClose: () => {
        panel?.destroy();
        panel = undefined;
      },
    });
  }

  /** 플레이 중 리그 팝업 — 홈과 같은 화면(ui/leaguePanel). */
  private openLeagueFromPlay(): void {
    this.openLeagueFromPlayNow(); // ⚠️ 리그는 **지연 로드하지 않는다**(PO 2026-08-31 — 후반 로딩 중 아트가 깨졌다). 부팅 상주.
  }

  private openLeagueFromPlayNow(): void {
    const save = loadSave();
    const me = profileOf(save);
    let panel: Phaser.GameObjects.Container | undefined;
    panel = openLeaguePanel(this, {
      depth: 4300,
      myName: me.name,
      myPoints: save.leaguePoints ?? 0,
      stageFloor: leagueTargetFloor(save),
      onClose: () => {
        panel?.destroy();
        panel = undefined;
      },
    });
  }

  private openShop(): void {
    openItemShop(this, {
      depth: 4500,
      onCoins: (total) => {
        this.baseCoins = total;
        this.header?.setCoins(total);
        this.updateBoosters(); // 살 수 있게 된 부스터를 즉시 활성화.
      },
      onDiamonds: (total) => this.header?.setDiamonds(total),
      toast: (msg) => this.toast(msg, true), // 팝업 메시지는 항상 표시.
    });
  }

  /**
   * **티어 제한시간 만료 처리** — 배너 타이머가 0 이 되는 순간 리셋 상태(진행도 0 + 새 타이머)를 저장하고
   *   배너에 반영한다. 예전엔 타이머가 0 에 멈춰 있다가 다음 별 반영/씬 재진입 때야 갱신됐다.
   *   리셋 규칙 자체는 `missionRewardOf`(내부 `withExpiryChecked`)가 담당 — 여기서 중복 구현하지 않는다.
   */
  private resetExpiredMissionTier(): void {
    const save = loadSave();
    const next = missionRewardOf(save, Date.now());
    save.missionReward = next;
    writeSave(save);
    /*
     * ⚠️ **배너에 티어 숫자를 다시 그리지 않는다**(PO 2026-08-24 신고: "플레이상에서 표현되는
     *   위클리미션과 팝업화면의 숫자가 다르다").
     *
     * 이 배너는 **주간 이벤트**를 보여 주기로 정해져 있다(2026-08-23). 그런데 미션 리워드 **티어**
     * (또 다른 시스템, 목표 35·50·70…)가 `setState` 로 같은 배너를 덮어써서, 플레이 중에는 티어
     * 진행(예: 41/50)이 보이고 팝업에서는 이벤트 진행이 보였다 — 같은 배너에 두 시스템의 숫자.
     * 티어 적립 자체는 그대로 두고, **표시는 이벤트 하나로** 고정한다.
     */
    this.refreshEventBanner();
  }

  /**
   * **층별 플레이 인테리어 배선** — 현재 층(레벨→테마 순환 idx)의 인테리어 `up_Slitare_BG_01-{idx}` 로
   *   에디터 main.json 의 매장 인테리어 레이어(layer_3) **텍스처만 교체**. (배치·크기는 에디터 저작 그대로.)
   *   해당 층 이미지가 없으면 **1층 편의점(01-1)** 으로 폴백(사용자 요구). storefront 테마 순환과 동일 idx 라 상·하 층 일치.
   */
  private applyFloorInterior(): void {
    const interior = this.chrome?.tryById<Phaser.GameObjects.Image>('layer_3');
    const node = this.chrome?.nodeById('layer_3');
    if (!interior || !node) return;
    const idx = this.floorThemeIdx; // 층 테마(storefront 와 동일 순환, 소유 최고층 기준) 1..5.
    const floorKey = `up_Slitare_BG_01-${idx}`;
    const key = this.textures.exists(floorKey) ? floorKey : 'up_Slitare_BG_01-1'; // 층 배치 없으면 1층 편의점.
    interior.setTexture(key);
    if (node.w && node.h) interior.setDisplaySize(node.w, node.h); // 저작 표시 크기 유지(텍스처 교체가 크기 리셋하므로 재적용).
  }

  /**
   * **중단 경고창**(PO 2026-08-24) — 판을 중간에 그만두면 **이미 받은 보상이 회수된다**는 사실을
   * 먼저 알린다. 모르고 나갔다가 코인이 줄어 있으면 버그로 오해한다.
   *
   * ⚠️ 게임비와 판 중에 쓴 부스터 비용은 **돌려주지 않는다** — 이미 소비한 것이고, 환불하면
   *   "중단해서 부스터를 무르는" 다른 구멍이 생긴다. 문구에도 그대로 적는다.
   */
  private confirmQuit(): void {
    if (this.ended) {
      this.scene.start('home'); // 이미 끝난 판은 회수할 것이 없다.
      return;
    }
    const got = playSessionRewards();
    const layer = overlayLayer(this, 5200);
    layer.add(overlayScrim(this, 0x140a1e, 0.86));
    const lines = [
      '판을 중간에 그만두시겠어요?',
      '',
      got.coins > 0 || got.diamonds > 0
        ? `이번 판에서 받은 보상이 회수됩니다${String.fromCharCode(10)}🪙 ${got.coins.toLocaleString()}${got.diamonds > 0 ? `   💎 ${got.diamonds}` : ''}`
        : '이번 판에서 받은 보상은 회수됩니다',
      '',
      '게임비와 사용한 부스터 비용은',
      '돌려드리지 않습니다',
    ].join(String.fromCharCode(10));
    layer.add(
      this.add
        .text(W / 2, H * 0.38, lines, {
          fontFamily: PlayScene.TIP_FONT,
          fontSize: '46px',
          color: '#ffffff',
          align: 'center',
          lineSpacing: 10,
        })
        .setOrigin(0.5)
        .setStroke('#4a1030', 8),
    );
    let closing = false; // 중복 클릭 가드(연출 중 재클릭 방지).
    layer.add(
      this.uiButton(W / 2, H * 0.62, 'up_Solitare_UI_23_2', () => {
        if (closing) return;
        closing = true;
        sfx('button');
        const back = revokePlaySession(); // **여기서 실제로 회수한다.**
        if (back.coins > 0 || back.diamonds > 0) this.baseCoins = loadSave().coins;
        layer.destroy();
        this.scene.start('home');
      }, 440),
    );
    layer.add(
      this.uiButton(W / 2, H * 0.74, 'up_Solitare_UI_23_5', () => {
        if (closing) return;
        sfx('level_close');
        layer.destroy();
      }, 440),
    );
  }

  /** 플레이 상단 헤더의 메뉴(☰) — 사운드 토글 + 홈으로. */
  private openPlayMenu(): void {
    sfx('button');
    const layer = overlayLayer(this, 3000);
    layer.add(overlayScrim(this, 0x140a1e, 0.88));
    layer.add(
      this.add
        .text(W / 2, 620, '⚙ 메뉴', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '80px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 })
        .setOrigin(0.5),
    );
    const mk = (y: number, label: string, bg: string, fn: () => void): Phaser.GameObjects.Text => {
      const t = this.add
        .text(W / 2, y, label, {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '52px',
          color: '#ffffff',
          backgroundColor: bg,
          padding: { x: 40, y: 26 },
          align: 'center',
          fixedWidth: 620,
        })
        .setOrigin(0.5)
        .setShadow(0, 4, '#00000066', 8)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn);
      layer.add(t);
      return t;
    };
    // **상점**(PO 2026-07-29 "게임플레이시 숍메뉴에 접근할 수 있어야 함") — 홈과 같은 아이템샵 화면.
    //   부스터를 살 코인이 모자랄 때 홈으로 나갔다 오지 않아도 되게, 메뉴 최상단에 둔다.
    mk(720, '🛒 상점', '#c25e00', () => {
      sfx('button');
      this.openShop();
    });
    // **사운드 볼륨**(PO 2026-07-28) — 누를 때마다 100→75→50→25→꺼짐 순환. 마지막 단계가 음소거라 별도 on/off 없음.
    const snd = mk(840, volumeLabel(), '#4a3a5a', () => {
      const v = cycleVolume();
      snd.setText(volumeLabel());
      if (v > 0) sfx('button'); // 바뀐 볼륨을 바로 귀로 확인시켜 준다(꺼짐이면 무음).
    });
    // **진동**(2026-08-25) — 켜짐/꺼짐 토글. 켜는 순간 한 번 울려 손으로 확인시킨다(haptics.ts).
    const hap = mk(960, hapticsLabel(), '#4a3a5a', () => {
      toggleHaptics();
      hap.setText(hapticsLabel());
      sfx('button');
    });
    // **자동테스트 표시 토글**(dev 빌드 전용) — QA 버튼 묶음을 화면에서 켜고 끈다.
    let autoUiBtn: Phaser.GameObjects.Text | undefined;
    if (import.meta.env.DEV) {
      const autoUiLabel = (): string => `🧪 자동테스트 표시: ${autoTestState.uiVisible ? '켜짐' : '꺼짐'}`;
      autoUiBtn = mk(1080, autoUiLabel(), '#4a3a5a', () => {
        this.toggleAutoTestUI();
        autoUiBtn?.setText(autoUiLabel());
        sfx('button');
      });
    }
    // **친절한 이미지 버튼**(UI_23) — 홈(주황)·계속(핑크). 사운드 토글만 텍스트(온/오프 상태 표시).
    layer.add(
      this.uiButton(W / 2, 1160, 'up_Solitare_UI_23_2', () => {
        sfx('button');
        layer.destroy();
        this.confirmQuit(); // 보상 회수 경고 후 이동(PO 2026-08-24).
      }, 440),
    );
    layer.add(
      this.uiButton(W / 2, 1320, 'up_Solitare_UI_23_5', () => {
        sfx('level_close');
        layer.destroy();
      }, 440),
    );
  }

  /**
   * 배경 보행 캐릭터 — 에디터 **동선(path 노드)** 을 따라 3명(셰프·소녀·청년)이 걷는다.
   *   반투명막(layer_4) 바로 뒤 깊이에 두어 은은히 비친다. 동선이 없으면 하단 플로어 왕복(폴백).
   */
  private spawnPedestrians(doc: LayoutDoc): void {
    const pathNode = doc.nodes.find((n) => n.type === 'path' && (n.points?.length ?? 0) >= 2);
    const waypoints = pathNode
      ? pathToWaypoints(pathNode)
      : [
          { x: 200, y: 1700 },
          { x: 880, y: 1700 },
        ]; // 폴백: 하단 플로어 가로 왕복
    // **반투명막 바로 뒤**(막 depth − 1) — 암막 뒤에서 은은히 비치는 배경 보행.
    //   path 노드 자체의 depth(에디터 선 표시용, 막 앞일 수 있음)는 무시하고 항상 막 뒤에 둔다.
    const maskDepth = doc.nodes
      .filter((n) => n.type === 'rect' && (n.h ?? 0) >= 800)
      .reduce((d, n) => Math.max(d, n.depth ?? 0), 5);
    const depth = maskDepth - 1;
    // **시계방향으로만 순환**(교차 금지) — 경로를 닫힌 루프로 강제(끝점→시작점 연결, 하단 오프스크린에서 닫힘).
    //   전원 같은 방향(forward)으로 돌아 서로 마주쳐 교차하지 않는다. 웨이포인트 1→8 순서 = 시계방향.
    const closed = true;
    const sheets = CHAR_SHEETS.filter((s) => this.textures.exists(s.key));
    // **동일 기본속도** → 서로 따라잡지 않아 루프 둘레 간격이 유지된다(개별 걸음은 gait 로 불규칙).
    const speeds = sheets.map(() => 112);
    // 시작 위치를 루프 둘레에 **고르게(1/N)** 분산 → 충분한 간격.
    const starts = sheets.map((_, i) => i / Math.max(1, sheets.length));
    sheets.forEach((s, i) => {
      this.pedestrians.push(
        new Pedestrian(this, s.key, waypoints, {
          scale: 0.72, // 이전 0.55 대비 +30%
          speed: speeds[i % speeds.length],
          depth,
          closed,
          startFrac: starts[i % starts.length],
          bobAmp: 11,
          seed: i * 2.1 + 0.7, // 걸음 불규칙 위상 시드
          flip: s.flip, // 미러 시트(char_girl) 좌우 반전
        }),
      );
    });
  }

  /** Phaser 씬 루프 — 보행 캐릭터를 매 프레임 전진(맥동·교차 회피 포함)시킨다. */
  update(_time: number, delta: number): void {
    for (const p of this.pedestrians) p.update(delta, this.pedestrians);
    this.syncCardBackings();
    this.syncLeagueGauge();
  }

  /** 컬렉션 카드 흰 바탕을 아트에 붙여 둔다(위치·크기·각도·투명도·깊이). 아트가 사라지면 같이 지운다. */
  private syncCardBackings(): void {
    for (const [img, bg] of this.cardBackings) {
      if (!img.active || !bg.active) {
        bg.destroy();
        this.cardBackings.delete(img);
        continue;
      }
      const k = (img.displayWidth * PlayScene.CARD_BACK_PAD) / PlayScene.CARD_BACK_UNIT;
      bg.setPosition(img.x, img.y).setAngle(img.angle).setAlpha(img.alpha).setDepth(img.depth - 0.01);
      bg.setScale(k, (img.displayHeight * PlayScene.CARD_BACK_PAD) / (PlayScene.CARD_BACK_UNIT * 1.4));
    }
  }

  /**
   * 아트 뒤에 **흰 카드 판**을 깔아 준다 — 카드 아트의 흰 테두리가 좁아 보이는 문제를 덮는다.
   * 반환값은 없다(수명은 `cardBackings` 가 아트에 묶어 관리한다).
   */
  private addCardBacking(img: Phaser.GameObjects.Image): void {
    const U = PlayScene.CARD_BACK_UNIT;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(-U / 2 + 2, -U * 0.7 + 4, U, U * 1.4, U * 0.12); // 얕은 그림자 — 카드가 떠 보이게.
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-U / 2, -U * 0.7, U, U * 1.4, U * 0.12);
    g.lineStyle(4, 0xe6dccb, 1);
    g.strokeRoundedRect(-U / 2, -U * 0.7, U, U * 1.4, U * 0.12);
    this.cardBackings.set(img, g);
    this.syncCardBackings();
  }

  // ── 미션 크롬(게이지·별·박스) 배선 ──────────────────────────────────
  /**
   * 에디터가 저작한 미션 게이지(layer_6 트랙 + layer_8* 별)와 오른쪽 상단 박스(layer_9)를 런타임 상태에
   * 연결한다. 게이지 채움 막대·박스 5칸 마커·기준 카드 색 표기는 코드가 직접 그린다(동적).
   */
  private setupMissionChrome(): void {
    const idx = this.chrome;
    if (!idx) return;
    const bgDepth = idx.nodeById('layer_9')?.depth ?? 8;
    // **좌측 5칸 스타축적 게이지** — 손님 정산 시 지불한 별이 여기로 날아와 **점등된 채 축적**된다.
    //   HUD 배경 별 외곽선 위에 금색 별을 얹는다. 미획득=숨김(scale 0).
    this.comboStars = [];
    if (this.textures.exists('up_Solitare_UI_02_v2')) {
      for (let i = 0; i < SET_SIZE; i++) {
        const st = this.add
          .image(GAUGE_STAR_XS[i] ?? GAUGE_STAR_XS[0], GAUGE_STAR_Y, 'up_Solitare_UI_02_v2')
          .setDisplaySize(GAUGE_STAR_SZ, GAUGE_STAR_SZ)
          .setDepth(bgDepth + 0.5)
          .setScale(0);
        this.comboStars.push(st);
      }
    }
    // 다이아 회수 목표점 산출용 게이지 span(공용).
    this.gaugeGeom = { left: GAUGE_STAR_XS[0], width: GAUGE_STAR_XS[SET_SIZE - 1] - GAUGE_STAR_XS[0], y: GAUGE_STAR_Y, h: GAUGE_STAR_SZ };
    // **전체 스타 게이지(파란 바, 반투명)** — layer_7(#006eff·radius) 기반. front 가 별 위치에 닿으면 그 별 점등.
    this.barGeom = { ...GAUGE_BAR_GEOM }; // layer_7 은 정적 렌더 제외라 값 고정 사용.
    this.gaugeBar = this.add.graphics().setDepth(bgDepth + 0.3);

    // **중앙 다이아 완성 보상풀** — layer_5=다이아 아이콘·layer_8_copy='+N'(고정 슬롯을 diamondHold 로 재사용).
    const dIcon = idx.tryById<Phaser.GameObjects.Image>('layer_5');
    const dText = idx.tryById<Phaser.GameObjects.Text>('layer_8_copy');
    if (dIcon && dText) {
      this.diamondHold = { icon: dIcon, text: dText };
      this.missionDiamondPos = { x: dIcon.x, y: dIcon.y };
      applyItalic(dText).setText(`+${this.pendingDiamonds}`); // #4 이탤릭 + 우측 패딩(끝 글자 잘림 방지).
    }

    // **우측 MISSIONS 패널** — layer_8='combo +N'(현재 콤보), layer_8_copy3=다음 보상 아이콘(5별 완성 시 지급).
    this.comboCountText = idx.tryById<Phaser.GameObjects.Text>('layer_8');
    if (this.comboCountText) applyItalic(this.comboCountText); // #4 이탤릭 + 우측 패딩.
    const lbl = idx.tryById<Phaser.GameObjects.Text>('layer_8_copy2');
    if (lbl) applyItalic(lbl); // 'combo' 라벨도 이탤릭.
    this.missionRewardImg = idx.tryById<Phaser.GameObjects.Image>('layer_8_copy3');
    idx.tryById('layer_8_copy3__shadow')?.setVisible(false); // 보상 아이콘 뒤 회색 그림자 박스 제거.
    const rn = idx.nodeById('layer_8_copy3');
    this.missionIconBox = { w: rn?.w ?? 50, h: rn?.h ?? 68 };
    this.missionReward = this.rollMissionReward();
    this.showMissionPreview();
    this.updateGaugeBar();
    this.updateStars();
    this.comboCountText?.setText(`+${this.comboColors.length}`);
  }

  /** 별 위치 배열 P — P[0]=바 좌단, P[1..5]=별 위치(front 보간·별 점등 기준). */
  private starGaugePoints(): number[] {
    const left = this.barGeom?.left ?? GAUGE_STAR_XS[0] - 40;
    return [left + 8, ...GAUGE_STAR_XS];
  }

  /**
   * **전체 스타 게이지 갱신** — front = **품질(0~1)의 다음 컷까지 진행도** 위치. 파란 바(반투명).
   *   품질은 매치마다만 증가(단조)하고 승리 정산에서 축②③이 더해질 뿐이라 **되감김이 없다**.
   *   컷 사이는 선형 보간해 부드럽게 찬다.
   */
  /** **품질**(0~1) → 게이지 fill **front X**(끝 위치). 손님 별이 흡입되는 목표점이자 파란 바의 끝. */
  private frontXForScore(quality: number): number {
    const P = this.starGaugePoints(); // 길이 6: P[0]=바 좌단, P[1..5]=별 위치.
    // **별 점등과 같은 축**을 써야 바 끝과 켜진 별이 어긋나지 않는다 — 기준 수순이 있으면 상대 비율 축.
    const useRatio = this.refQuality > 0;
    const cuts = useRatio ? STAR_RATIO_CUTS : STAR_CUTS;
    const sc = useRatio ? quality / this.refQuality : quality;
    if (sc >= cuts[cuts.length - 1]) return P[SET_SIZE];
    let i = 0;
    while (i < cuts.length && sc >= cuts[i]) i++; // 넘긴 컷 수 = 다음 별 인덱스.
    const lo = i === 0 ? 0 : cuts[i - 1];
    const hi = cuts[i];
    const frac = Phaser.Math.Clamp((sc - lo) / Math.max(1e-6, hi - lo), 0, 1);
    return Phaser.Math.Linear(P[i], P[i + 1], frac);
  }

  /**
   * **품질(0~1) → 점등될 별 수(1..5)** — 그 판 **정답 수순 대비 상대 평가**(starRating.ts, PO 2026-07-29).
   *   기준 수순이 없는 레벨(생성 배치 등)은 절대 컷으로 폴백한다.
   */
  private ratioStars(quality: number): number {
    return this.refQuality > 0 ? starsForRatio(quality, this.refQuality) : starsForQuality(quality);
  }

  /** 지금까지의 **플레이 중 품질**(축①만) — 게이지가 향하는 목표값. 승리 정산에서 축②③이 더 얹힌다. */
  private qualityNow(): number {
    return playingQuality(this.comboScore, this.boardSlots);
  }

  /** **파란 바 갱신** — 게이지에 반영된 점수(gaugeScore)의 fill front 까지 채운다(수집 도착 시 전진). */
  private updateGaugeBar(): void {
    const g = this.gaugeBar;
    const b = this.barGeom;
    if (!g || !b) return;
    g.clear();
    const w = this.frontXForScore(this.gaugeScore) - b.left;
    if (w > b.r) {
      g.fillStyle(0x006eff, 0.55); // #006eff 반투명.
      g.fillRoundedRect(b.left, b.y - b.h / 2, w, b.h, b.r);
      g.fillStyle(0x8fd4ff, 0.3); // 상단 하이라이트.
      g.fillRoundedRect(b.left + 4, b.y - b.h / 2 + 4, w - 8, b.h * 0.34, b.r * 0.7);
    }
  }

  /** 별 게이지 — 게이지 점수(gaugeScore) 기준 점등 별 수만큼 표시(좌→우). */
  private updateStars(): void {
    this.accumStars = this.ratioStars(this.gaugeScore);
    this.comboStars.forEach((st, i) => {
      const on = i < this.accumStars;
      st.setScale(on ? 1 : 0);
      if (on) st.setDisplaySize(GAUGE_STAR_SZ, GAUGE_STAR_SZ);
    });
  }

  /**
   * **손님 별 회수(흡입) 연출** — 손님이 쌓은 **정확한 개수(count)**의 개별 별을 말풍선(src)에서 게이지 **끝(front)**으로
   *   **커지며 가속 흡입**한다(손님 별<게이지 별). 별이 하나씩 도착할 때마다 gaugeScore 가 qualityNow() 를 향해 전진 →
   *   **흡입과 게이지 변화가 동시에** 일어난다(핵심 연출). 큰별(=5)도 여기선 5개의 개별 별로 순차 회수.
   */
  private suckStarsIntoGauge(count: number, src: { x: number; y: number }): void {
    if (count <= 0 || this.finished || !this.textures.exists('up_Solitare_UI_02_v2')) return;
    const startScore = this.gaugeScore;
    const targetScore = this.qualityNow(); // 이 손님까지 반영된 품질(축①).
    // **미션 리워드 실시간 정산**(PO 2026-07-18 3차 수정) — 손님이 모은 별이 **3개 이상이면 그 정확한
    //   개수(3,4,5,6…)를 그대로**, 레벨의 1~5별 등급과 무관하게(무제한) 게이지 흡입과 같은 프레임에서
    //   즉시 저장까지 확정한다. 레벨이 끝나야만 반영되던 예전 방식은 "손님 단위로 계속 쌓여야 한다"는
    //   요구와 맞지 않았다 — 이제 손님을 정산하는 그 순간이 바로 적립 시점이다.
    this.creditMissionStars(count, src);
    const n = Math.min(count, 60); // 시각 방어(과도한 개수).
    const startSz = 30; // 손님 별(작음).
    const endSz = GAUGE_STAR_SZ * 1.15; // 게이지 별보다 살짝 크게 도착(임팩트).
    const stagger = Math.min(70, 640 / n); // 순차 발사(총 창 ≤ ~0.64s).
    for (let k = 0; k < n; k++) {
      const arriveScore = startScore + (targetScore - startScore) * ((k + 1) / n); // 이 별 도착 후 반영될 점수.
      const sx = src.x + Phaser.Math.Between(-14, 14);
      const sy = src.y + Phaser.Math.Between(-10, 10);
      const star = this.add.image(sx, sy, 'up_Solitare_UI_02_v2').setDisplaySize(startSz, startSz).setDepth(2200);
      const tx = this.frontXForScore(arriveScore); // 게이지 끝(front) — 도착 시점 위치.
      const ty = GAUGE_STAR_Y;
      const cx = (sx + tx) / 2;
      const cy = Math.min(sy, ty) - 70; // 살짝 솟았다 끝으로.
      this.tweens.addCounter({
        from: 0,
        to: 1,
        delay: k * stagger,
        duration: 420,
        ease: 'Cubic.easeIn', // 가속(빨려들어감).
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          const v = 1 - u;
          star.x = v * v * sx + 2 * v * u * cx + u * u * tx;
          star.y = v * v * sy + 2 * v * u * cy + u * u * ty;
          const sz = startSz + (endSz - startSz) * u; // **커지며** 흡입.
          star.setDisplaySize(sz, sz);
          star.setAlpha(1 - 0.12 * u);
        },
        onComplete: () => {
          star.destroy();
          // **동시 게이지 변화** — 이 별이 도착하며 gaugeScore 를 목표로 한 몫 전진 + 새 별 점등/펄스.
          this.gaugeScore = Math.max(this.gaugeScore, arriveScore);
          const before = this.accumStars;
          this.accumStars = this.ratioStars(this.gaugeScore);
          this.updateGaugeBar();
          // 게이지 슬롯 팝 연출만(미션 배너 미리보기는 위에서 손님 정산 시점에 이미 동시 처리).
          for (let s = before; s < this.accumStars; s++) this.lightMissionStar(s);
        },
      });
    }
  }

  /**
   * **남은 카드 → 별 변환 연출**(게임 종료 시, PO 2026-07-17) — 남은 뽑기 카드가 스톡에서 **위쪽 스타 게이지로
   *   빨려올라가며 별로 변환**되고, 도착마다 게이지(gaugeScore)가 fromScore→toScore 로 차오른다. onDone=완료 콜백.
   */
  private convertLeftoverToStars(leftover: number, fromScore: number, toScore: number, onDone: () => void): void {
    const n = Math.min(leftover, 30);
    if (n <= 0 || !this.textures.exists('up_Solitare_UI_02_v2')) {
      this.gaugeScore = toScore;
      this.updateGaugeBar();
      this.updateStars();
      onDone();
      return;
    }
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const ty = GAUGE_STAR_Y;
    const endSz = GAUGE_STAR_SZ * 1.15;
    const stagger = Math.min(95, 780 / n);
    let done = 0;
    // **아래 뽑기 더미 비우기** — 남은 카드가 위로 빨려올라가므로 스톡 자리에는 아무것도 남기지 않는다(비행 카드가 그 대체).
    this.stockRevealMax = 0;
    this.buildStockPile();
    this.stockCountText?.setText('');
    const bump = (arriveScore: number): void => {
      this.gaugeScore = Math.max(this.gaugeScore, arriveScore);
      const before = this.accumStars;
      this.accumStars = this.ratioStars(this.gaugeScore);
      this.updateGaugeBar();
      // 남은 카드 전환분은 게이지 별(팝 연출)만 켜고 미션 리워드 미리보기에는 반영하지 않는다.
      for (let s = before; s < this.accumStars; s++) this.lightMissionStar(s);
      if (++done >= n) onDone();
    };
    sfx('card_deal', { volume: 0.3 });
    for (let k = 0; k < n; k++) {
      const arriveScore = fromScore + (toScore - fromScore) * ((k + 1) / n);
      // **시작 위치를 스톡 주변으로 넓게 분산**(카드마다 다른 출발점).
      const sx = STOCK.x + Phaser.Math.Between(-60, 60);
      const sy = STOCK.y + Phaser.Math.Between(-28, 28);
      const ttx = this.frontXForScore(arriveScore) + Phaser.Math.Between(-24, 24); // 게이지 끝(front) — 도착점도 약간 분산.
      // **3차 베지어(카드마다 완전히 다른 휨곡선)** — 아래로 떨어졌다가, **좌/우 랜덤 방향으로 크게 부풀고 호 높이도 제각각**
      //   → 여러 곡선이 부채처럼 흩어져 게이지로 빨려들어간다(한 줄 수렴 방지). 중간에 별로 변환.
      const side = Math.random() < 0.5 ? -1 : 1; // 좌/우 스윙 랜덤.
      const swing = Phaser.Math.Between(70, 300) * side; // 스윙 폭·방향 다양.
      const p1x = sx + Phaser.Math.Between(-70, 70);
      const p1y = sy + Phaser.Math.Between(15, 110); // 낙하 폭 다양.
      const p2x = ttx + swing; // 게이지 좌/우로 크게 부풀었다가 훅.
      const p2y = ty - Phaser.Math.Between(40, 360); // 호 높이 매우 다양(낮게~아주 높게).
      const card = new CardView(this, sx, sy, cw, ch, false);
      card.showBack();
      card.setDepth(2300);
      const cardSX = card.scaleX;
      let star: Phaser.GameObjects.Image | null = null;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        delay: k * stagger,
        duration: 600,
        ease: 'Sine.easeIn', // 아래로 떨어졌다 가속하며 빨려올라감.
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          const mt = 1 - u;
          const b0 = mt * mt * mt;
          const b1 = 3 * mt * mt * u;
          const b2 = 3 * mt * u * u;
          const b3 = u * u * u;
          const x = b0 * sx + b1 * p1x + b2 * p2x + b3 * ttx;
          const y = b0 * sy + b1 * p1y + b2 * p2y + b3 * ty;
          // **수직 오픈/폴드** — scaleY 를 접었다 편다.
          //   ⚠️ 예전엔 |cos(3π·u)| 를 그대로 곱해 **높이가 0 에 붙는 순간**이 세 번이나 있었다. 그 프레임이
          //   잡히면 카드가 **잘려 보인다**(PO 2026-08-22 지적). 접힘은 한 번만, 그리고 최소 높이를 남긴다.
          const FLIP_MIN = 0.34;
          const flip = FLIP_MIN + (1 - FLIP_MIN) * Math.abs(Math.cos(u * Math.PI));
          if (u < 0.5) {
            // 카드 단계 — 떨어졌다 솟으며 **약간 작아지고** 세로로 오픈/폴드(위아래 접힘).
            const shrink = cardSX * (1 - 0.22 * (u / 0.5));
            card.setPosition(x, y);
            card.setScale(shrink, shrink * flip);
          } else {
            // **별로 변환**(엣지온에서 교체) — 별도 세로로 열렸다 접히며 커져 게이지로 빨려들어감.
            if (!star) {
              card.setVisible(false);
              star = this.add.image(x, y, 'up_Solitare_UI_02_v2').setDepth(2300);
            }
            const p = (u - 0.5) / 0.5;
            const sz = 26 + (endSz - 26) * p;
            star.setPosition(x, y).setDisplaySize(sz, sz).setAlpha(1 - 0.1 * p);
            star.scaleY *= flip; // 세로 오픈/폴드 유지.
          }
        },
        onComplete: () => {
          card.destroy();
          star?.destroy();
          bump(arriveScore); // **도착 시 게이지 차오름**.
        },
      });
    }
  }

  /**
   * 게이지 별 1개 점등(팝 연출만) — front 가 그 위치에 닿는 순간 팝으로 켠다.
   *   미션 리워드 미리보기는 이 함수가 아니라 **손님 정산 시점**(suckStarsIntoGauge 진입 즉시)에
   *   게이지 흡입과 동시에 한 번 쏜다(PO 2026-07-18) — 자세한 이유는 suckStarsIntoGauge 주석 참고.
   *   **남은 카드(스톡) → 별 전환**(convertLeftoverToStars)에서도 이 함수로 팝 연출만 재사용한다
   *   (실제 매칭이 아니므로 애초에 미션 미리보기를 여기서 다루지 않는 것이 맞다).
   */
  private lightMissionStar(idx: number): void {
    const st = this.comboStars[idx];
    if (!st) return;
    st.setScale(1).setDisplaySize(GAUGE_STAR_SZ, GAUGE_STAR_SZ);
    this.tweens.add({ targets: st, displayWidth: GAUGE_STAR_SZ * 1.35, displayHeight: GAUGE_STAR_SZ * 1.35, yoyo: true, duration: 170, ease: 'Back.easeOut' });
    sfx('star', { volume: 0.4 });
  }


  /**
   * **판 결과로 수집물을 확정한다**(PO 2026-08-30 "최종적인 게임결과로 수집되도록").
   *
   * 판 중에는 별·이벤트 아이템을 **모으는 연출만** 하고 보관해 두었다가, 여기서 한 번에 적립한다.
   * 지거나 나가면 이 함수를 지나지 않으므로 **아무것도 지급되지 않는다** — 다이아·컬렉션 카드와 같은 모델.
   *
   * ⚠️ 두 함수 모두 **스스로 loadSave/writeSave** 한다 — 호출부의 `save` 스냅샷을 되쓰기 **전**에
   *   부르면 적립이 통째로 사라진다(리그 정산에서 실제로 겪은 사고와 같은 함정).
   * @returns 이번 정산으로 받은 코인·다이아(결과 화면 표시용).
   */
  private settleRoundCollectibles(): { coins: number; diamonds: number } {
    let coins = 0;
    let diamonds = 0;
    if (this.pendingStars > 0) {
      const r = creditLeagueStars(this.pendingStars);
      coins += r.coins;
      diamonds += r.diamonds; // 완주 그랜드 다이아(톱니바퀴 배율) — 2026-08-31 추가.
      this.labRun.dropCoins += r.coins;
      this.labRun.leagueCoins += r.coins;
      this.labRun.dropDiamonds += r.diamonds;
      if (r.stagesCleared) this.labRun.leagueStages += 1;
      if (r.diamonds > 0) mirrorLeagueGrand(); // 서버 원장 미러링(추가만, 로컬 권위는 그대로) — 2026-09-01.
      this.pendingStars = 0;
    }
    if (this.pendingEventItems > 0) {
      const r = creditEventItems(this.pendingEventItems);
      coins += r.coins;
      diamonds += r.diamonds;
      this.labRun.dropCoins += r.coins;
      this.labRun.eventCoins += r.coins;
      this.labRun.dropDiamonds += r.diamonds;
      if (r.stagesCleared) this.labRun.eventStages += 1;
      this.pendingEventItems = 0;
    }
    return { coins, diamonds };
  }

  /** 별 **보관 배지** 위치 — 다이아 보관 배지 왼쪽(같은 줄에 나란히). */
  private starHoldTarget(): { x: number; y: number } {
    const d = this.diamondHoldTarget();
    return { x: d.x - 120, y: d.y };
  }

  /**
   * **리그 별 보관**(미확정) — 다이아(`holdDiamond`)와 **완전히 같은 모델**.
   *
   * PO 2026-08-30 "별이 바로 투데이리그로 들어간다": 예전에는 별을 먹는 즉시 리그 아이콘으로 날아가고
   * 게이지가 차고 코인이 터졌다 — 저장을 미뤄도 **보이는 과정이 그대로면 바로 들어간 것으로 읽힌다.**
   * 이제 판 중에는 **보관 배지로만** 모이고, 리그로 들어가는 연출은 **판이 끝난 뒤** 한 번 돈다.
   */
  private holdLeagueStars(
    n: number,
    fallback: { x: number; y: number },
    sv?: { img: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text },
  ): void {
    if (n <= 0) return;
    this.pendingStars += n;
    this.labRun.leagueStars += n; // 실측 계측 — 코인은 확정 시점에 센다.
    const t = this.starHoldTarget();
    if (!this.starHold) {
      const icon = this.add.image(t.x, t.y, LEAGUE_STAR_KEY).setDepth(75);
      if (this.textures.exists(LEAGUE_STAR_KEY)) {
        const src = texSize(icon.texture);
        icon.setDisplaySize(46, 46 * (src.height / src.width));
      }
      const text = this.add
        .text(t.x + 26, t.y, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#5a1a6a', strokeThickness: 6 })
        .setOrigin(0, 0.5)
        .setDepth(75);
      this.starHold = { icon, text };
    }
    /*
     * **보드에 있던 그 별을 그대로 들어 올려 보관 배지로 보낸다.**
     *
     * ⚠️ 원본 뷰(`sv`)를 **반드시 여기서 치워야 한다.** 예전엔 이 정리를 리그 정산 연출이 하고 있었는데,
     *   그 연출이 판 끝으로 옮겨 가면서 판 중에는 아무도 안 치웠다 → **카드 뒤에 있던 별이 보드에
     *   그대로 남았다**(PO 2026-08-30 신고). 새 스프라이트를 따로 띄우는 방식은 원본이 남는 이 사고를
     *   숨기기만 하므로, 원본을 그대로 날린다.
     * ⚠️ 진행 중이던 등장 트윈을 **먼저 끊는다** — 안 끊으면 이 트윈과 겹쳐 크기가 튀고, 파괴 뒤에
     *   옛 트윈이 살아 있으면 게임 루프가 멈춘다(전 게임 공통 함정).
     */
    const from = { x: sv?.img.x ?? fallback.x, y: sv?.img.y ?? fallback.y };
    if (sv?.label) {
      this.tweens.killTweensOf(sv.label);
      sv.label.destroy(); // 숫자 배지가 남으면 별만 떠나는 그림이 어긋나 보인다.
    }
    const moving = sv?.img;
    if (moving?.active) {
      this.tweens.killTweensOf(moving);
      moving.setDepth(6901);
      this.tweens.add({
        targets: moving,
        x: t.x,
        y: t.y,
        scaleX: moving.scaleX * 0.45,
        scaleY: moving.scaleY * 0.45,
        duration: 460,
        ease: 'Cubic.easeIn',
        onComplete: () => moving.destroy(),
      });
    } else if (this.textures.exists(LEAGUE_STAR_KEY)) {
      // 원본 뷰가 없는 경로(등급 별 등) — 위치만 알고 있으므로 임시 스프라이트로 보여 준다.
      const fly = this.add.image(from.x, from.y, LEAGUE_STAR_KEY).setDepth(6901).setDisplaySize(60, 60);
      this.tweens.add({
        targets: fly,
        x: t.x,
        y: t.y,
        scaleX: fly.scaleX * 0.5,
        scaleY: fly.scaleY * 0.5,
        duration: 460,
        ease: 'Cubic.easeIn',
        onComplete: () => fly.destroy(),
      });
    }
    this.starHold.text.setText(`+${this.pendingStars}`);
    this.tweens.add({ targets: [this.starHold.icon, this.starHold.text], scaleX: '*=1.3', scaleY: '*=1.3', duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  private playLeagueStarPayout(
    n: number,
    before: ReturnType<typeof leagueStageOf>,
    fallback: { x: number; y: number },
    sv?: { img: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text },
  ): void {
    /*
     * ⚠️ **여기서는 적립하지 않는다** — 이 함수는 **판이 끝난 뒤** 확정분을 보여 주는 연출이다
     *   (PO 2026-08-30 "별이 바로 투데이리그로 들어간다"). 적립은 `settleRoundCollectibles` 가
     *   이미 끝냈고, `before` 는 그 **적립 직전** 상태여야 게이지가 올바른 지점에서 출발한다.
     */

    const target = this.leagueIconAt ?? { x: W - 100, y: 250 };
    const at = { x: sv?.img.x ?? fallback.x, y: sv?.img.y ?? fallback.y };
    const size = sv?.img.displayWidth ?? this.geom.cardW * 0.74;

    /*
     * **한 알씩 채워지는 계단**(PO 2026-08-24) — 별이 리그에 하나 도착할 때마다 게이지가 어디까지
     *   찼는지 미리 계산해 둔다. 단계를 넘기면 1.0(가득)을 한 번 찍고 다음 단계의 분모로 갈아탄다 —
     *   그래야 "채웠다 → 새 칸이 열렸다"가 눈에 보인다.
     */
    /*
     * **누적 계단**(PO 2026-08-24: "게이지는 별을 수집하면서 누적되어 표시되어야 합니다").
     *   단계별 진행(count/goal)만 그리면 단계가 오를 때마다 0 으로 돌아가 "계속 0에서 쌓는 연출"이 된다.
     *   그래서 **오늘 모은 총량 / 다음 단계까지의 누적 목표**로 잰다 — 막대가 한 방향으로만 자란다.
     */
    /*
     * **게이지는 지금 단계의 진행**(PO 2026-08-24: "1단계 완성 후 2단계 식으로 10단계를 완성하면서
     *   소보상을 받습니다").
     *
     * 단계를 채우면 그 자리에서 소보상이 터지고 막대는 **다음 단계**로 넘어간다 — 그래서 "다음 단계"가
     * 늘 보인다. (한때 분모를 하루 총 목표로 뒀는데, 그건 보상이 완주에만 나올 때의 이야기였다.)
     * ⚠️ 단계가 오를 때 막대가 0 으로 돌아가는 것은 **정상**이다 — 라벨에 단계 번호를 함께 적어
     *   "줄어든 것"이 아니라 "다음 칸으로 넘어간 것"으로 읽히게 한다.
     */
    /*
     * **순서: 게이지 100% → 코인 보상 → 남은 게이지**(PO 2026-08-24).
     *   한 별이 단계를 채우는 순간을 표시해 두고(`fullGoal`·`coins`), 그 별이 도착하면 ① 막대를 끝까지
     *   채우고 ② 그 단계 보상을 날린 뒤 ③ 다음 별부터 새 단계를 0 에서 다시 채운다.
     */
    const steps: {
      fill: number;
      count: number;
      goal: number;
      stage: number;
      /** 이 별로 단계를 채웠으면 그 단계의 목표(막대를 끝까지 채워 보여 줄 값). */
      fullGoal?: number;
      /** 이 별로 받은 보상(단계 소보상 + 완주면 그랜드). */
      coins?: number;
      /** 보상을 준 단계 번호(0-based). */
      paidStage?: number;
      /**
       * 이 별이 **얼마나 늦게 도착해야 하는지**(ms). 앞에서 단계를 채운 적이 있으면 그만큼 밀린다 —
       * 보상 연출이 끝난 뒤에 다음 별이 들어와야 "100% → 보상 → 남은 게이지" 순서가 지켜진다.
       */
      holdMs: number;
    }[] = [];
    /** 이 배치에서 지금까지 채운 단계 수 — 뒤따르는 별들을 그만큼 밀어 준다. */
    let completions = 0;
    const HOLD_PER_REWARD = 1200;
    let stg = before.stage;
    let cnt = before.count;
    for (let i = 0; i < n; i++) {
      cnt += 1;
      let fullGoal: number | undefined;
      let coins: number | undefined;
      let paidStage: number | undefined;
      if (cnt >= stageGoal(stg) && stg < LEAGUE_STAGE_COUNT) {
        fullGoal = stageGoal(stg);
        coins = stageCoins(stg);
        paidStage = stg;
        cnt -= stageGoal(stg); // 남는 만큼 이월(logic/dailyLeague.addCollected 와 같은 규칙).
        stg += 1;
        if (stg >= LEAGUE_STAGE_COUNT) coins += leagueGrandCoins(); // 완주 그랜드 프라이즈(배율 반영).
      }
      const g = stageGoal(stg);
      steps.push({
        fill: stg >= LEAGUE_STAGE_COUNT ? 1 : cnt / g,
        count: cnt,
        goal: g,
        stage: stg,
        fullGoal,
        coins,
        paidStage,
        holdMs: completions * HOLD_PER_REWARD,
      });
      if (fullGoal != null) completions += 1; // 이 별이 단계를 채웠다 → 다음 별부터 기다린다.
    }
    const g0 = stageGoal(before.stage);
    const gauge = this.showLeagueMiniGauge(
      before.stage >= LEAGUE_STAGE_COUNT ? 1 : before.count / g0,
      before.count,
      g0,
      before.stage,
    );

    /** 큰 별에서 **한 알씩** 떨어져 나와, 작아지면서 리그 아이콘으로 빨려 들어간다. */
    const emit = (from: { x: number; y: number }): void => {
      if (!this.textures.exists(LEAGUE_STAR_KEY)) {
        gauge?.finish(1);
        // 연출이 없으면 곧바로 전액 — 액수·단계는 위에서 계산한 steps 에서 가져온다(적립 전이라 r 이 없다).
        const last = steps[steps.length - 1];
        this.queueLeagueCoins(steps.reduce((a, st) => a + (st.coins ?? 0), 0), last?.stage ?? before.stage, 120);
        return;
      }
      const shown = Math.min(n, 14); // 시각 방어 — 너무 많으면 줄이 끝나지 않는다(적립은 n 그대로).
      for (let i = 0; i < shown; i++) {
        const stFor = steps[Math.min(steps.length - 1, Math.floor(((i + 1) / shown) * n) - 1)] ?? steps[steps.length - 1];
        const fly = this.add.image(from.x, from.y, LEAGUE_STAR_KEY).setDepth(6901);
        fly.setDisplaySize(size * 1.5, size * 1.5); // 큰 별에서 그대로 떨어져 나온 크기.
        const st = steps[Math.min(steps.length - 1, Math.floor(((i + 1) / shown) * n) - 1)] ?? steps[steps.length - 1];
        this.tweens.add({
          targets: fly,
          x: target.x,
          y: target.y,
          scaleX: fly.scaleX * 0.22, // **하나씩 작아지면서** 리그로 들어간다.
          scaleY: fly.scaleY * 0.22,
          delay: i * 170 + (stFor?.holdMs ?? 0), // 한 알씩 또렷하게 + 보상 연출만큼 기다린다.
          duration: 560,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            if (!fly.active) return;
            fly.destroy();
            if (!this.scene.isActive()) return;
            sfx('coin_tick', { volume: 0.25 });
            if (st?.fullGoal != null && st.paidStage != null) {
              // ① 막대를 그 단계 끝까지 채워 보여 주고 → ② 그 단계 보상을 날린다.
              gauge?.setFill(1, st.fullGoal, st.fullGoal, st.paidStage);
              this.queueLeagueCoins(st.coins ?? 0, st.paidStage, 350); // 가득 찬 걸 보고 **바로** 보상.
              /*
               * ③ 다음 칸은 **보상 연출이 끝난 뒤** 0 부터 다시 찬다. 뒤따르는 별들도 `holdMs` 만큼
               *    밀려 있으므로, 이 전환만 같은 간격으로 맞춰 주면 순서가 어긋나지 않는다.
               */
              this.tweens.addCounter({
                from: 0,
                to: 1,
                duration: 1100,
                onComplete: () => {
                  if (!this.scene.isActive()) return;
                  gauge?.setFill(st.fill, st.count, st.goal, st.stage);
                },
              });
            } else if (st) {
              gauge?.setFill(st.fill, st.count, st.goal, st.stage);
            }
            if (i === shown - 1) gauge?.finish(steps[steps.length - 1]?.fill ?? 1);
          },
        });
      }
    };

    if (sv) {
      // 배지는 먼저 치운다 — 별이 떠오르는데 숫자가 남아 있으면 어긋나 보인다.
      if (sv.label) {
        this.tweens.killTweensOf(sv.label);
        sv.label.destroy();
      }
      /*
       * ⚠️ 진행 중이던 등장 트윈을 **먼저 끊는다**. 안 끊으면 이 확대 트윈과 겹쳐 크기가 튀고,
       *   파괴 뒤에 옛 트윈이 살아 있으면 게임 루프가 멈춘다(전 게임 공통 함정).
       */
      this.tweens.killTweensOf(sv.img);
      const img = sv.img;
      img.setDepth(6900);
      /*
       * **크게 공중으로 떠오른다**(PO 2026-08-24) — 흩뿌리지 않는다. 별 하나가 보드 위로 올라와
       *   크게 머물고, 거기서 낱개가 한 알씩 떨어져 나가 리그로 들어간다. 무엇이 어디로 가는지가
       *   한 줄기로 읽힌다.
       */
      const up = { x: img.x, y: Math.max(H * 0.18, img.y - this.geom.cardH * 1.4) };
      this.tweens.add({
        targets: img,
        x: up.x,
        y: up.y,
        scaleX: img.scaleX * 1.9,
        scaleY: img.scaleY * 1.9,
        duration: 360,
        ease: 'Back.easeOut',
        onComplete: () => {
          if (!img.active) return;
          const p = { x: img.x, y: img.y };
          img.destroy();
          if (!this.scene.isActive()) return;
          emit(p);
        },
      });
    } else {
      emit(at);
    }

  }

  /**
   * **별 연출이 끝난 뒤에** 코인 보상을 터뜨린다(PO 2026-08-24: "동시에 일어나지 않고 순차적으로").
   *
   * 별이 아직 게이지로 날아가는 중에 코인까지 쏟아지면 화면에 두 줄기가 겹쳐, 무엇 때문에 코인을
   * 받았는지가 읽히지 않는다. **게이지가 다 찬 것을 보여 준 다음** 코인이 헤더로 향한다.
   *
   * @param afterMs 게이지가 가득 찬 뒤 코인이 튀기까지의 사이(연출이 겹치지 않게 두는 틈).
   */
  private queueLeagueCoins(coins: number, stage: number, afterMs = 900): void {
    if (coins <= 0) return;
    // ⚠️ delay 트윈 금지(씬 재시작 시 루프 정지) — 대상 없는 카운터 트윈으로 시간만 센다.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: afterMs,
      onComplete: () => {
        if (!this.scene.isActive()) return;
        this.playLeagueCoinBurst(coins, stage);
      },
    });
  }

  /**
   * **리그 단계 완성 보상 연출**(PO 2026-08-24: "코인이 쏟아지면서 코인 표시 상단 헤더로 코인이
   * 수집이동됨. 숫자를 표시").
   *
   * 게이지가 가득 찬 자리(리그 아이콘 아래)에서 코인이 **쏟아져 나와** 흩어졌다가, 하나씩 상단
   * 헤더의 코인 칸으로 빨려 들어간다. 마지막 코인이 도착할 때 잔고를 갱신한다 — 숫자가 먼저 올라
   * 버리면 "이미 받은 뒤 연출"이 되어 인과가 뒤집힌다.
   */
  private playLeagueCoinBurst(coins: number, stage: number, origin?: { x: number; y: number }, label = '⭐ 리그 보상'): void {
    void stage; // 보상 문구에는 단계 번호를 쓰지 않는다(막대가 이미 보여 준다).
    if (coins <= 0) return;
    /*
     * **큰 코인 하나 + 숫자**(PO 2026-08-24: "코인이 너무 작습니다 … 하나만 나타나서 헤더 코인
     *   영역으로 이동하면서 +2000 식으로 숫자로 표현").
     *
     * 예전엔 작은 코인 12개를 뿌렸는데, 개수가 금액과 무관해 "얼마 받았는지"가 안 읽히고 잔상만 남았다.
     * 크게 하나 띄우고 금액을 옆에 붙여 헤더로 보낸다 — 무엇이 얼마나 늘어나는지가 한 줄로 읽힌다.
     */
    const key = 'up_Solitare_UI_2-3'; // 헤더·배너와 같은 골드 코인.
    const from =
      origin ??
      (this.leagueGaugeBox?.active
        ? { x: this.leagueGaugeBox.x, y: this.leagueGaugeBox.y }
        : (this.leagueIconAt ?? { x: W - 100, y: 250 }));
    const to = this.header?.coinAnchor ?? { x: 550, y: 90 };
    const commit = (): void => {
      this.baseCoins += coins;
      this.header?.setCoins(this.baseCoins);
    };

    const box = this.add.container(from.x, from.y).setDepth(6910);
    const COIN = 150; // 크게(예전 56px 은 화면에서 티끌이었다).
    if (this.textures.exists(key)) {
      const img = this.add.image(0, 0, key);
      const src = texSize(img.texture);
      img.setDisplaySize(COIN, COIN * (src.height / src.width)); // ⚠️ 비율 유지.
      box.add(img);
    }
    const amount = this.add
      .text(COIN * 0.62, 0, `+${coins.toLocaleString()}`, {
        fontFamily: PlayScene.TIP_FONT, fontSize: '62px', color: '#ffe9a8', fontStyle: '700',
      })
      .setOrigin(0, 0.5)
      .setStroke('#7a3b00', 10);
    box.add(amount);
    box.setScale(0.4).setAlpha(0);
    sfx('coin_burst', { volume: 0.5 });
    this.toast(`${label} +🪙 ${coins.toLocaleString()}`, true);

    // ① 크게 튀어나온다 → ② 잠깐 머문다 → ③ 헤더 코인 칸으로 빨려 들어간다.
    this.tweens.add({
      targets: box,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      y: from.y - 60,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!box.active) return;
        this.tweens.add({
          targets: box,
          x: to.x,
          y: to.y,
          scaleX: 0.25,
          scaleY: 0.25,
          alpha: 0.9,
          delay: 620,
          duration: 620,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            box.destroy();
            if (!this.scene.isActive()) return;
            sfx('coin_tick', { volume: 0.3 });
            commit(); // 도착한 뒤에 잔고가 오른다.
          },
        });
      },
    });
  }

  /** 게이지 라벨 — 완주하면 단계 번호 대신 **완주** 라고 쓴다(11단계 같은 존재하지 않는 칸 방지). */
  private static gaugeLabel(stage: number, count: number, goal: number): string {
    if (stage >= LEAGUE_STAGE_COUNT) return '완주!';
    return `${stage + 1}단계  ${count}/${goal}`;
  }

  /**
   * **리그 미니 게이지**(PO 2026-08-24) — 별이 회수되는 **그 순간에만** 리그 아이콘에 붙어 뜬다.
   *
   * 리그 패널을 열지 않아도 "지금 이 별이 어디까지 채웠는지"가 보여야, 별을 모을 이유가 생긴다.
   * 상시 표시하면 플레이 화면이 지표로 뒤덮이므로 **수집 중에만** 띄우고 끝나면 사라진다.
   *
   * ⚠️ 아이콘은 화면 폭(가변 캔버스)·상단 인셋에 따라 자리가 바뀌므로 **좌표를 베껴 두지 않는다**.
   *   컨테이너를 아이콘 밑에 두고 `update` 에서 따라붙여, 아이콘이 움직이면 게이지도 함께 움직인다.
   *
   * @returns setFill(비율,현재,목표) 로 채우고 finish() 로 잠시 뒤 사라진다.
   */
  private showLeagueMiniGauge(
    fill0: number,
    count0: number,
    goal0: number,
    stage0: number,
  ): { setFill: (f: number, c: number, g: number, stage: number) => void; finish: (f: number) => void } | null {
    const BAR_W = 150;
    const BAR_H = 40; // 상하 폭을 키운다(PO 2026-08-24 "너무 좁다" 재지적: 30 → 40) — 얇으면 차오르는 게 안 보인다.
    const R = BAR_H / 2; // **양쪽 끝을 라운드**(PO 2026-08-24) — 알약 모양.
    const box = this.add.container(0, 0).setDepth(6902);
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2340, 0.92);
    bg.fillRoundedRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, R);
    bg.lineStyle(3, 0x2e5c94, 1);
    bg.strokeRoundedRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, R);
    const bar = this.add.graphics();
    const inner = BAR_W - 6;
    const innerH = BAR_H - 8;
    /** 채움 막대를 다시 그린다 — 짧을 때도 끝이 둥글게 남도록 최소 길이를 지름으로 잡는다. */
    const draw = (f: number): void => {
      if (!bar.active) return;
      bar.clear();
      const t = Phaser.Math.Clamp(f, 0, 1);
      if (t <= 0) return;
      const w = Math.max(innerH, inner * t);
      bar.fillStyle(0xffc63f, 1);
      bar.fillRoundedRect(-inner / 2, -innerH / 2, w, innerH, innerH / 2);
    };
    draw(fill0);
    const label = this.add
      .text(0, 0, PlayScene.gaugeLabel(stage0, count0, goal0), {
        fontFamily: PlayScene.TIP_FONT, fontSize: '22px', color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#1d3f6b', 6);
    box.add([bg, bar, label]);
    box.setAlpha(0);
    this.leagueGaugeBox = box; // update 가 리그 아이콘에 붙여 준다.
    this.syncLeagueGauge();
    this.tweens.add({ targets: box, alpha: 1, duration: 160 });

    let shown = Phaser.Math.Clamp(fill0, 0, 1);
    /*
     * ⚠️ 채움 보간 트윈은 **한 번에 하나만** 살려 둔다. 별이 빠르게 연달아 도착하면 보간 트윈이
     *   여러 개 겹치는데, 먼저 시작한(낮은 값에서 출발한) 트윈이 나중에 그려져 막대가 **뒤로 튄다**
     *   — PO 가 본 "증가했다 감소했다"의 나머지 절반이다. 새 값이 오면 이전 것을 멈춘다.
     */
    let fillTween: Phaser.Tweens.Tween | undefined;
    return {
      setFill: (f, c, g, stage) => {
        if (!bar.active) return;
        const to = Phaser.Math.Clamp(f, 0, 1);
        // 단계가 오르면 막대는 정상적으로 0 부터 다시 찬다 — 그때만 되돌림을 허용한다.
        const stepUp = label.active && label.text !== PlayScene.gaugeLabel(stage, c, g) && !label.text.startsWith(`${stage + 1}단계`);
        if (to < shown && !stepUp) return;
        if (stepUp) shown = 0;
        fillTween?.stop();
        /*
         * **쭈욱 차오르게**(PO 2026-08-24: "너무 빠르게 연출하여 알아보지 못하도록 하는 게 아니라
         *   쭈욱쭈욱 끝까지 차오르는 게이지 연출로 정확하게 인지"). 200ms 는 눈으로 좇기 전에 끝났다.
         *   많이 오를수록 더 오래 끌어(최대 900ms) "얼마나 찼는지"가 보이게 한다.
         */
        const span = Math.max(0, to - shown);
        fillTween = this.tweens.addCounter({
          from: shown,
          to,
          duration: Math.round(320 + span * 900),
          ease: 'Sine.easeInOut',
          onUpdate: (tw) => draw(tw.getValue() ?? to),
          onComplete: () => draw(to),
        });
        shown = to;
        if (label.active) label.setText(PlayScene.gaugeLabel(stage, c, g));
      },
      finish: (f) => {
        if (!bar.active) return;
        fillTween?.stop();
        draw(Math.max(shown, Phaser.Math.Clamp(f, 0, 1)));
        // 다 들어간 뒤 잠깐 보여 주고 사라진다(연출이 끝나기 전에 없어지면 확인할 틈이 없다).
        this.tweens.add({
          targets: box,
          alpha: 0,
          delay: 1400, // 결과를 읽을 시간(PO 2026-08-24) — 700ms 는 눈이 따라가기 전에 사라졌다.
          duration: 320,
          onComplete: () => {
            box.destroy();
            if (this.leagueGaugeBox === box) this.leagueGaugeBox = undefined;
          },
        });
      },
    };
  }

  /** 게이지를 리그 아이콘 **바로 아래**에 붙여 둔다 — 아이콘이 움직이면 함께 움직인다. */
  private syncLeagueGauge(): void {
    const box = this.leagueGaugeBox;
    if (!box) return;
    if (!box.active) { this.leagueGaugeBox = undefined; return; }
    const icon = this.leagueIconImg;
    const x = icon?.active ? icon.x : (this.leagueIconAt?.x ?? W - 100);
    const y = icon?.active
      ? icon.y + icon.displayHeight * 0.5 + 31 // 아이콘 하단 + 'League' 라벨 아래(게이지 40px 반영 +5).
      : (this.leagueGaugeY ?? (this.leagueIconAt?.y ?? 250) + 82);
    box.setPosition(x, y);
  }

  /**
   * **주간 이벤트 적립**(PO 2026-08-24) — 손님이 **3개 이상** 모으고 떠날 때 그 숫자만큼 들어간다.
   *
   * 무엇을 모으는지는 **지금 열린 최고층의 상품**이다(`openFloorOf`). 층 일치 조건은 없앴다 —
   * 예전 규칙은 층을 올릴수록 이벤트가 멈췄다.
   */
  private creditEventFromCustomer(count: number, src: { x: number; y: number }): void {
    this.creditEventFromPlay(count, src, 'store'); // 손님이 가져가는 것 = 점포 상품.
  }

  /**
   * **주간 이벤트 적립 — 판에서 모은 아이템이면 무엇이든**(PO 2026-08-24: "각 플레이에서 미션으로
   * 수집되는 다이아 · 되돌리기 · 플러스카드 등 다양한 아이템을 위클리 목표 아이템으로").
   *
   * 예전에는 손님이 3개 이상 모아 떠날 때(점포 상품)만 셌다. 그 경로 하나로는 사람 손으로 모으기가
   * 너무 느려 사다리가 멈춰 보였다. 이제 **보드에서 회수하는 것들**도 같은 통에 담는다:
   *   · 점포 상품(손님 3개 이상) · 다이아 · ＋카드 · 와일드 · 컬렉션 카드
   *
   * @param artKey 배너로 날아갈 아이콘. 없으면 그 층의 대표 상품(콜라 등)으로 그린다.
   */
  private creditEventFromPlay(count: number, src: { x: number; y: number }, kind: EventTargetKind): void {
    if (count <= 0) return;
    /*
     * **그 칸의 타겟만 인정한다**(PO 2026-08-24). 목표가 다이아인 칸에서 크루아상이 날아가면
     *   무엇을 모아야 하는지가 화면과 어긋난다. 타겟이 아니면 적립도 연출도 하지 않는다.
     */
    const save = loadSave();
    const stage = eventProgressNow(save.thiefEvent, thiefPeriodId(new Date())).stage;
    if (eventStageTarget(stage) !== kind) return;
    const artKey = eventTargetIconKey(kind, floorItemKey(openFloorOf(save)));
    /*
     * **적립하지 않고 보관한다**(PO 2026-08-30) — 화면에는 지금 모은 만큼 반영된 결과를 보여 주되
     *   저장·지급은 판이 끝날 때 한 번(`settleRoundCollectibles`).
     */
    const r = previewEventItems(this.pendingEventItems, count);
    this.pendingEventItems += count;
    this.labRun.eventItems += count;
    this.labRun.eventKinds[kind] = (this.labRun.eventKinds[kind] ?? 0) + count; // 타겟 종류별 적립.

    const target = this.missionBanner?.itemAnchor ?? { x: W / 2, y: 260 };
    const flyKey = artKey && this.textures.exists(artKey) ? artKey : r.itemKey;
    if (this.textures.exists(flyKey)) {
      const shown = Math.min(count, 10);
      for (let i = 0; i < shown; i++) {
        const fly = this.add
          .image(src.x + Phaser.Math.Between(-12, 12), src.y + Phaser.Math.Between(-10, 10), flyKey)
          .setDisplaySize(76, 76)
          .setDepth(6900);
        this.tweens.add({
          targets: fly,
          x: target.x,
          y: target.y,
          scaleX: fly.scaleX * 0.6,
          scaleY: fly.scaleY * 0.6,
          delay: i * 60,
          duration: 520,
          ease: 'Cubic.easeIn',
          onComplete: () => fly.destroy(),
        });
      }
    }
    this.time.delayedCall(560, () => this.refreshEventBanner());
    /*
     * ⚠️ **판 중에는 보상 연출을 하지 않는다**(PO 2026-08-30 "게임 중간에 지급되는 과정이 아닌").
     *   적립을 미뤘으므로 여기서 코인이 쏟아지면 **주지도 않은 것을 준 것처럼** 보인다 — 실제로
     *   "별이 바로 리그로 들어간다"는 신고의 정체가 이 종류(저장은 미뤘는데 연출은 그대로)였다.
     *   단계 보상은 판이 끝날 때 `settleRoundCollectibles` 가 확정하고, 배너가 그때 갱신된다.
     */
    /*
     * ⚠️ **판 중에는 단계 보상 연출을 하지 않는다.** 예전엔 여기서 코인이 쏟아지고 헤더로 빨려 들어갔는데
     *   (PO 2026-08-24 요청), 적립을 판 끝으로 미룬 지금 그 연출을 남기면 **주지도 않은 것을 준 것처럼**
     *   보인다 — "별이 바로 리그로 들어간다"는 신고의 정체가 정확히 이 종류였다(저장은 미뤘는데 연출은 그대로).
     *   단계 보상은 `settleRoundCollectibles` 가 확정하고 결과 화면이 보여 준다.
     */
  }

  /** 상단 배너를 주간 이벤트 현재 상태로 다시 그린다. */
  private refreshEventBanner(): void {
    const v = eventBannerView(loadSave());
    this.missionBanner?.setView(v);
  }

  private creditMissionStars(count: number, src: { x: number; y: number }): void {
    if (count < 3) return; // 게이트: 3개 미만은 무반응(PO 확정).
    /*
     * **주간 이벤트 적립 지점**(PO 2026-08-24) — 손님이 3개 이상 모으고 떠나는 바로 이 순간이다.
     *   리그(별)와 이벤트(상품)가 서로 다른 행동을 보상하도록 출처를 갈랐다:
     *     · 리그  = 미션(5매치) 완성 보상으로 꽂힌 별을 회수 → "잘 이어 냈는가"
     *     · 이벤트 = 손님을 3개 이상으로 보내기          → "손님을 오래 붙잡았는가"
     */
    /*
     * **상품은 손님 머리 위에서 떠오른다**(PO 2026-08-24: "상단 수집아이템은 캐릭터 머리 위쪽에서
     *   올라가고"). 별(`suckStarsIntoGauge`)은 손님 자리에서 그대로 나가므로, 둘이 같은 점에서
     *   출발하면 겹쳐 보인다. 상품만 머리 위로 올려 두 줄기를 분리한다.
     */
    this.creditEventFromCustomer(count, { x: src.x, y: src.y - PlayScene.CUSTOMER_HEAD_DY });
    const save = loadSave();
    const result = applyMissionStars(missionRewardOf(save, Date.now()), count, Date.now());
    save.missionReward = result.state;
    let grantedCards: Array<{ card: CollectionSlot; entry: BoardCollection | null }> = []; // 티어 박스 컬렉션 카드(연출용).
    if (result.completed && result.reward) {
      const box = result.reward;
      save.coins += box.coins ?? 0;
      save.diamonds = (save.diamonds ?? 0) + (box.diamonds ?? 0);
      this.labRun.tierCoins += box.coins ?? 0; // 실측 원장 — 티어 박스 코인(미기록 시 미상 수입으로 뜬다).
      this.labRun.tierDiamonds += box.diamonds ?? 0;
      if (box.boosters) {
        const cur = itemsOf(save);
        save.items = {
          wild: cur.wild + (box.boosters.wild ?? 0),
          plus5: cur.plus5 + (box.boosters.plus5 ?? 0),
          undo: cur.undo + (box.boosters.undo ?? 0),
        };
      }
      // **티어 박스의 컬렉션 카드**(MISSION_TIERS 3·4티어 collectionCards) — 미보유 카드 중 랜덤 지급.
      //   지금까지 데이터에만 있고 지급되지 않던 항목을 컬렉션 도입(2026-07-26)에 맞춰 배선.
      grantedCards = this.grantCollectionCards(save, box.collectionCards ?? 0);
      this.baseCoins += box.coins ?? 0; // 재화는 즉시 반영(다음 refresh 에서 헤더에 표시).
    }
    writeSave(save);
    this.missionBanner?.animateTo(result.state, src);

    // 재화 회수 연출과 겹치지 않게 살짝 뒤로 미뤄 카드 획득 연출을 재생(여러 장이면 순차).
    grantedCards.forEach((g, i) => this.time.delayedCall(900 + i * 1700, () => this.playCollectionCardReveal(g.card, g.entry)));
  }

  /**
   * 컬렉션 카드 n 장을 **미보유 중 랜덤**으로 지급하고(save 에 반영, 저장은 호출부 책임) 지급된 슬롯을 반환.
   *   남은 카드가 모자라면 있는 만큼만 지급한다(빈 배열 가능).
   */
  private grantCollectionCards(save: SaveData, n: number): Array<{ card: CollectionSlot; entry: BoardCollection | null }> {
    const granted: Array<{ card: CollectionSlot; entry: BoardCollection | null }> = [];
    if (n <= 0) return granted;
    for (let i = 0; i < n; i++) {
      const slot = this.pickCollectionSlot();
      if (!slot) break; // 후보 없음(아트 미로드) — 남은 장수는 지급 불가.
      granted.push({ card: slot, entry: this.awardCollectionCard(save, slot) });
    }
    return granted;
  }



  /** 미션 보상 1건 추첨(가중) — 코인·추가카드 자주, 다이아·부스터·컬렉션카드 드묾(레벨20까지는 부스트). 코인 수량은 게임비 연동. */
  private rollMissionReward(): MissionReward {
    const table = MISSION_REWARD_TABLE.map((row) => (row.kind === 'collection' ? { ...row, weight: collectionWeightForLevel(this.level) } : row));
    const total = table.reduce((s, r) => s + r.weight, 0);
    let r = Phaser.Math.Between(1, total);
    let picked = table[0];
    for (const row of table) {
      r -= row.weight;
      if (r <= 0) {
        picked = row;
        break;
      }
    }
    if (picked.kind === 'collection') {
      // **미보유 카드 중 랜덤 예고** — 아트가 없으면(로딩 실패 등) 그 슬롯은 못 쓰므로 텍스처 유무까지 확인.
      const slot = this.rollCollectionSlot();
      if (!slot) return { kind: 'stars', amount: this.rollStarAmount() }; // 다 모았으면 리그 별로 대체.
      return { kind: 'collection', amount: 1, slot };
    }
    /*
     * **뽑기 공급 억제는 종류가 아니라 장수로**(PO 2026-08-24 "정해진 확률대로 나타나야 한다").
     *   예전에는 뽑기가 넉넉하면(`stockIsAmple`) cards/plus5/wild 를 통째로 stars 로 바꿨다. 그런데 그
     *   조건은 초반(스톡 많음)에도 후반(남은 보드가 작아 기준선이 하한 3으로 내려감)에도 거의 항상 참이라,
     *   보상표의 절반(가중 50/108 = 44.5%)이 화면에 아예 안 나왔다 — 실측 2.9%, 그만큼이 stars 로 몰려 76%.
     *   이제 **종류는 뽑힌 그대로 두고 장수만** 최소로 깎는다(missionStockAmount) — 출현 비율 = 보상표.
     */
    if (STOCK_REWARD_KINDS.has(picked.kind)) {
      return { kind: picked.kind, amount: missionStockAmount(picked.amount, this.stockIsAmple()) };
    }
    return { kind: picked.kind, amount: picked.kind === 'stars' ? this.rollStarAmount() : picked.amount };
  }

  /**
   * **뽑기가 넉넉한가** — 남은 보드 카드를 지금 가진 뽑기로 감당할 수 있는가.
   *   생산적인 뽑기 한 장은 연쇄 덕분에 평균 2장 남짓을 치우므로, `뽑기 ≥ 남은보드 × 0.5` 면 이미 충분하다.
   *   하한(3장)은 보드가 거의 끝난 상황에서 0장이 기준이 되는 걸 막는다.
   */
  private stockIsAmple(): boolean {
    if (!this.state) return false;
    const left = remaining(this.state);
    return stockIsAmple(left, this.state.stock.length); // 판정은 economyRules(시뮬레이터와 공유).
  }

  /** 저장된 보유 상태 기준으로 **아트가 준비된 미보유 카드**를 하나 추첨(전부 모았으면 null). */
  private rollCollectionSlot(): CollectionSlot | null {
    return this.pickCollectionSlot();
  }

  /**
   * 드랍 카드 추첨 — **보유 여부와 무관하게 전체 카드에서 랜덤**(PO 2026-07-26 4차: "매번 새로운 카드가
   *   나와야 하는 건 아니다"). 이미 가진 카드가 또 나오면 **중복 보유**로 쌓이고 카드 우상단에 원문자로
   *   장수가 표시된다. 희귀도 가중치는 logic/collection.ts 의 `cardWeight()` 한 곳에서 정의된다
   *   (⚠️ **희귀 카드를 더 희귀하게** 만드는 설계는 추후 진행 예정 — 지금은 균등).
   *   아트가 실제로 로드된 슬롯만 후보로 남긴다(미이식 세트 방지).
   */
  private pickCollectionSlot(): CollectionSlot | null {
    return pickRandomCard(COLLECTIBLE_SETS, Math.random, (s) => this.textures.exists(collectionArtKey(s.set, s.card)));
  }

  /** 예고된 슬롯을 지급 직전에 재검증 — 아트가 없을 때만 다시 뽑는다(보유 중이어도 그대로 지급=중복). */
  private resolveCollectionSlot(preferred?: CollectionSlot): CollectionSlot | null {
    if (preferred && this.textures.exists(collectionArtKey(preferred.set, preferred.card))) return preferred;
    return this.pickCollectionSlot();
  }

  /**
   * **컬렉션 카드 지급 경로 결정**(PO 2026-07-26 2차) — 기본은 **보드 투입**(가려진 보드 카드에 꽂아두고
   *   열릴 때 획득). 보드에 자리가 없으면(이미 한 장 대기 중·보드 소진) 잃어버리지 않게 **즉시 지급**으로
   *   폴백한다. 반환값이 연출 분기(보드로 날아감 / 보관함으로 날아감)를 결정한다.
   */
  private awardCollectionCard(save: SaveData, card: CollectionSlot): BoardCollection | null {
    const entry = this.attachCollectionToBoard(card);
    if (entry) return entry;
    save.collection = grantCard(collectionOf(save), card.set, card.card); // 폴백 — 즉시 보유 확정.
    return null;
  }

  /**
   * 보드의 **아직 가려진 카드** 하나를 골라 컬렉션 카드를 꽂는다(다이아와 같은 "카드 뒤로 삐져나온" 배치).
   *   ⚠️ **반드시 가려진 카드에만** 꽂는다 — 노출된 카드에 꽂으면 곧바로 낼 수 있어 "보드에 꽂혀 기다리는"
   *   구간이 사라진다(PO 2026-07-26 3차). 가려진 카드가 없으면 false 를 반환해 호출부가 즉시 지급(보관함
   *   연출)으로 폴백한다.
   *   ⚠️ 수집 시점은 **꽂힌 카드를 낼 때**(onCardTap)다 — 노출만으로는 수집되지 않는다(PO 2026-07-27:
   *   "오픈된 상태가 아닌 클릭된 상태, 즉 다른 카드와 동일하게 취급되어야 한다").
   *   와일드·보너스·다이아가 이미 붙은 슬롯은 피한다.
   *   성공 시 boardCollections 에 등록하고 그 엔트리를 반환한다(뱃지는 alpha 0 — 획득 연출이 도착하며 켜진다).
   *   ⚠️ **여러 장 동시 허용**(PO 2026-07-29) — 앞 카드가 아직 안 열렸어도 새 카드는 **다른 슬롯**에 꽂는다.
   *      한 장 제한 때문에 두 번째부터 즉시지급으로 새던 문제를 없앤다.
   */
  private attachCollectionToBoard(card: CollectionSlot): BoardCollection | null {
    const key = collectionArtKey(card.set, card.card);
    if (!this.textures.exists(key)) return null;
    const exposedNow = new Set(this.state.layout.slots.filter((s) => isExposed(this.state, s.id)).map((s) => s.id));
    // 이미 다른 컬렉션 카드가 꽂힌 슬롯도 제외 — 한 카드에 두 장이 겹치지 않게.
    const busy = (id: string): boolean =>
      this.diamondSlots.has(id) || id === this.wildSlotId || id === this.bonusSlot?.id || this.boardCollections.has(id) ||
      this.starSlots.has(id) || this.stockSlots.has(id);
    const pool = [...this.cards.keys()].filter((id) => !busy(id) && !exposedNow.has(id)); // **가려진 카드만**.
    if (!pool.length) return null;
    const slotId = pool[Phaser.Math.Between(0, pool.length - 1)];
    const view = this.cards.get(slotId);
    if (!view) return null;
    // 카드 **뒤**(depth − 0.3)에 두고 위로 삐져나오게 — 카드 앞면을 가리지 않으면서 "꽂혀 있는" 느낌.
    const img = this.add.image(view.x, view.y - this.geom.cardH * 0.5, key).setDepth((view.depth ?? 100) - PlayScene.BADGE_BEHIND);
    const src = texSize(img.texture);
    const h = this.geom.cardH * 0.88; // 보드 카드보다 **조금 작게**(PO 2026-08-24) — 카드를 덜 가린다.
    img.setDisplaySize(h * (src.width / src.height), h);
    img.setAngle(-10).setAlpha(0);
    this.addCardBacking(img); // 흰 카드 판 — 아트의 얇은 테두리를 넓혀 카드처럼 보이게.
    const entry: BoardCollection = { slotId, card, view: img, opened: false, armed: false, played: false };
    this.boardCollections.set(slotId, entry);
    return entry;
  }

  /** 보상 아이콘 텍스처 키 — 컬렉션 카드는 추첨된 실제 카드 아트를 그대로 예고 슬롯에 띄운다. */
  private missionIconKey(rw: MissionReward): string {
    if (rw.kind === 'collection' && rw.slot) return collectionArtKey(rw.slot.set, rw.slot.card);
    return MISSION_ICON[rw.kind];
  }

  /** MISSIONS 패널에 다음 보상 아이콘 예고(수량은 지급 시 토스트). setTexture 후 상자에 **비율 유지 축소**. */
  private showMissionPreview(): void {
    const rw = this.missionReward;
    const img = this.missionRewardImg;
    if (!rw || !img) return;
    const key = this.missionIconKey(rw);
    if (!this.textures.exists(key)) return;
    img.setTexture(key); // ⚠️ displaySize 가 텍스처 원본 크기로 리셋됨 → 아래서 상자에 맞춰 재축소.
    const src = texSize(img.texture);
    const box = this.missionIconBox;
    const scale = Math.min(box.w / src.width, box.h / src.height); // contain(넘치지 않게).
    img.setDisplaySize(src.width * scale, src.height * scale);
  }

  /**
   * **다음 미션 예고 갈아끼우기** — 보상을 **실제로 지급한 뒤에만** 부른다(PO 2026-08-24).
   *   예고 아이콘이 조용히 바뀌면 눈치채기 어려워, **뒤집히듯 축소→교체→확대**하는 짧은 연출로 알린다.
   */
  private rerollMissionPreview(): void {
    const prev = this.missionReward;
    this.missionReward = this.rollMissionReward();
    const img = this.missionRewardImg;
    if (!img) return;
    if (prev && this.missionIconKey(prev) === this.missionIconKey(this.missionReward)) {
      this.showMissionPreview(); // 같은 종류가 다시 뽑혔으면 연출 없이 조용히 갱신.
      return;
    }
    const prevW = img.displayWidth;
    const prevH = img.displayHeight;
    this.tweens.add({
      targets: img,
      displayWidth: 0,
      duration: 110,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.showMissionPreview(); // 폭 0 인 순간 텍스처 교체(뒤집히는 것처럼 보인다) + 상자에 맞는 최종 크기.
        // 텍스처가 없어 갱신이 스킵됐으면(showMissionPreview 의 early return) 원래 크기로 되돌린다.
        const targetW = img.displayWidth > 0 ? img.displayWidth : prevW;
        img.setDisplaySize(0, img.displayHeight > 0 ? img.displayHeight : prevH);
        this.tweens.add({ targets: img, displayWidth: targetW, duration: 150, ease: 'Back.easeOut' });
      },
    });
  }

  /** 에디터 부스터 이미지(+5·되돌리기·와일드)를 탭 가능하게 배선. 코드 텍스트 버튼 대신 사용. */
  private setupEditorBoosters(): void {
    const idx = this.chrome;
    if (!idx) return;
    const wire = (id: string, on: () => void): Phaser.GameObjects.Image | undefined => {
      const img = idx.tryById<Phaser.GameObjects.Image>(id);
      img?.setInteractive({ useHandCursor: true }).on('pointerdown', on);
      return img;
    };
    this.addImg = wire('layer_11', () => this.addCards()); // +5 카드
    // **+5 아이콘을 뽑기 더미보다 위로**(PO 2026-07-28) — 스톡은 왼쪽으로 부채처럼 펼쳐져 +5 자리까지 침범한다.
    //   스톡 컨테이너(80)·탭 존(85)보다 높은 depth 로 올려 아이콘이 카드에 가려지지 않게 한다.
    this.addImg?.setDepth(STOCK_OVERLAP_DEPTH);
    this.undoImg = wire('layer_10_copy', () => this.undo()); // 되돌리기
    this.wildImg = wire('layer_10', () => this.useWild()); // 와일드
    // **부스터 코인 비용 라벨**(+5·와일드) — 각 이미지 하단에 얹는다(비용은 사용 횟수에 따라 상승, updateBoosters 가 갱신).
    this.plus5CostLabel = this.makeBoosterCostLabel(this.addImg);
    this.wildCostLabel = this.makeBoosterCostLabel(this.wildImg);
    this.undoCostLabel = this.makeBoosterCostLabel(this.undoImg); // 되돌리기도 유료(PO) — 가격/원문자 라벨.
  }

  /**
   * **하단 라벨 5개를 한 기준선에 맞춘다**(PO 2026-08-24: "폰트 크기를 약간 키우고 수평정렬을
   * 정확히 하세요. 너무 들쭉날쭉합니다").
   *
   * ＋5·되돌리기·와일드 비용 라벨은 **각자 아이콘 하단**에 붙어 있었고(아이콘 높이가 제각각이라
   * 세로가 어긋났다), 뽑기·기준 카드 라벨은 **카드 하단**을 따랐다. 다섯이 서로 다른 기준을 쓰니
   * 한 줄로 보이지 않았다. 부스터 아이콘의 **가장 아래 모서리**를 공통 기준선으로 삼고, 글자 크기와
   * 외곽선도 하나로 맞춘다.
   */
  private alignBottomLabels(): void {
    const labels = [this.plus5CostLabel, this.wildCostLabel, this.undoCostLabel, this.stockCountText, this.wasteLabel]
      .filter((t): t is Phaser.GameObjects.Text => !!t && t.active);
    if (!labels.length) return;
    const icons = [this.addImg, this.wildImg, this.undoImg].filter(
      (i): i is Phaser.GameObjects.Image => !!i && i.active,
    );
    /*
     * 기준선 = **부스터 아이콘 하단과 카드 하단 중 더 아래**.
     * 아이콘만 기준으로 잡으면 그보다 아래로 내려오는 뽑기·기준 카드 위에 글자가 얹혀 읽히지 않는다.
     */
    const cardBottom = this.geom.cardH / 2;
    const bottoms = [
      ...icons.map((i) => i.y + i.displayHeight / 2),
      STOCK.y + cardBottom,
      WASTE.y + cardBottom,
    ];
    const baseline = bottoms.length
      ? Math.max(...bottoms) + PlayScene.BOTTOM_LABEL_GAP + PlayScene.BOTTOM_LABEL_SIZE / 2
      : Math.max(...labels.map((t) => t.y));
    /*
     * ⚠️ `setFontSize`·`setStroke` 는 그때마다 **텍스트 텍스처를 다시 굽는다**. 예전엔 이 함수를
     *   `updateBoosters`(매 매칭·구매마다 호출)에서도 불러 라벨 5개를 계속 재렌더했다 — 판이 무거워지는
     *   원인 중 하나였다(2026-08-24 점검). 지금은 **판을 만들 때 한 번만** 부른다.
     */
    for (const t of labels) {
      t.setFontSize(PlayScene.BOTTOM_LABEL_SIZE);
      t.setOrigin(0.5);
      t.setStroke('#4a2a10', 6);
      t.setY(baseline);
    }
  }

  /** 부스터 이미지 하단에 코인 비용 라벨 생성(이미지 없으면 undefined). */
  private makeBoosterCostLabel(img?: Phaser.GameObjects.Image): Phaser.GameObjects.Text | undefined {
    if (!img) return undefined;
    const y = img.y + img.displayHeight / 2 - 6; // 이미지 하단 안쪽.
    return this.add
      .text(img.x, y, '', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '26px',
        color: '#ffe9a0',
        stroke: '#4a2a10',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth((img.depth ?? 90) + 2);
  }

  // ── 배경/층/보드(폴백 — 에디터 크롬 미저작 시) ─────────────────────────
  private drawBackground(tint: number): void {
    if (this.textures.exists(BACK_BG_KEY)) {
      const img = this.add.image(W / 2, H / 2, BACK_BG_KEY).setDepth(-100);
      const src = texSize(img.texture);
      const scale = Math.max(W / src.width, H / src.height);
      img.setScale(scale);
      return;
    }
    // 폴백 그라데이션.
    const g = this.add.graphics().setDepth(-100);
    const top = Phaser.Display.Color.IntegerToColor(tint);
    const bot = Phaser.Display.Color.IntegerToColor(0x2a1830);
    const fb = fullBleedBounds(this); // 캔버스 전체를 채운다(저작 크기로 그리면 가장자리가 뚫린다).
    for (let i = 0; i < 48; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, 100, (i / 47) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(fb.x, fb.y + (fb.h / 48) * i, fb.w, fb.h / 48 + 1);
    }
  }

  /**
   * 현재 층 스토어front 를 화면 상단에 배치(하단이 반투명 보드에 붙음, depth 30) + **홈처럼 살아있게**:
   *   **점원(Chr) 애니메이션 + 손님 방문(이모지)**. 점원이 아트에 박힌 up_Solitaire_BG 대신
   *   **홈과 동일한 순수 아트(up_Slitare_BG) + 별도 Chr 점원**을 써서 점원이 실제로 움직이게 한다.
   */
  private drawFloorArt(): void {
    const cy = DARK_TOP - FLOOR_ART_H / 2 + 12; // 12px 정도 패널에 겹쳐 앉음
    const idx = this.floorThemeIdx; // 층 테마(아트 5종 순환, 소유 최고층 기준) 1..5
    const bareKey = [`up_Slitare_BG_0${idx}_v3`, `up_Slitare_BG_0${idx}_v2`, `up_Slitare_BG_0${idx}`].find((k) =>
      this.textures.exists(k),
    );
    if (!bareKey) {
      // 폴백: 예전 baked 아트(up_Solitaire_BG) 또는 색 사각.
      const key = floorArtKey(idx);
      if (this.textures.exists(key)) {
        const src = texSize(this.textures.get(key));
        this.add.image(W / 2, cy, key).setScale(FLOOR_ART_H / src.height).setDepth(30);
      } else {
        this.add.rectangle(W / 2, cy, 900, FLOOR_ART_H, FLOORS[(idx - 1) % FLOORS.length].tint, 0.9).setDepth(30);
      }
      return;
    }
    const src = texSize(this.textures.get(bareKey));
    const scale = FLOOR_ART_H / src.height;
    const artW = src.width * scale;
    const cx = W / 2;
    this.add.image(cx, cy, bareKey).setScale(scale).setDepth(30); // 순수 점포 아트.

    // ── 점원(Chr) — 카운터 좌측에 세우고 **idle 애니**(홈과 동일: 발밑 고정 갸웃+숨쉬기). ──
    const chrKey = `up_Solirare_Chr_0${idx}`;
    let clerkBottom = cy + FLOOR_ART_H * 0.42;
    let clerkH = FLOOR_ART_H * 0.42;
    if (this.textures.exists(chrKey)) {
      const ch = FLOOR_ART_H * 0.44;
      const chr = this.add.image(cx - artW * 0.2, cy + FLOOR_ART_H * 0.12, chrKey).setDepth(31);
      chr.setDisplaySize(chr.width * (ch / chr.height), ch);
      clerkBottom = chr.y + chr.displayHeight / 2; // 발밑(origin 0.5 기준) — animateClerk 이 origin 을 바꾸기 전에 산출.
      clerkH = chr.displayHeight;
      this.animateClerk(chr);
    }

    // ── 손님 방문(이모지) — 카운터 앞에서 등장·주문·퇴장. 점원 반대편(우측)에서 걸어 들어온다. ──
    registerCustomerFrames(this);
    const spot: CustomerSpot = {
      entryX: cx + artW * 0.3,
      centerX: cx + artW * 0.05,
      groundY: clerkBottom,
      height: clerkH * 0.9,
      depth: 32, // 점포 아트(30)·점원(31) 앞.
      floor: this.level,
    };
    startCustomerVisits(this, [spot]);
  }

  /**
   * 에디터 크롬(main.json) 상단 점포를 **홈처럼 살아있게** — 박힌 셰프 아트(up_Slitare_BG_01_v2)를 **순수 아트(BG_02_v2)로 교체**하고
   *   **별도 애니 점원(Chr_02) + 손님 방문(이모지)**을 얹는다. (점원이 실제로 움직이고 손님이 드나든다.)
   */
  private setupStorefrontLife(): void {
    // main.json 저작 storefront(layer_2, 박힌 셰프 포함)는 숨기고 → **홈과 동일한 층 아트+점원+유리**를 **홈 사이즈 그대로** 상단에 배치.
    this.chrome?.tryById('layer_2')?.setVisible(false);
    // 홈 골든크러스트(floor2) 노드값(home.json) — **동일 절대 사이즈/오프셋**.
    const ART_W = 859;
    const ART_H = 518;
    const CLERK_W = 142;
    const CLERK_H = 238;
    const CLERK_DX = -182; // 점원 = 중심서 좌측(홈 floor2 Chr_02 x368, 중심 550).
    const CLERK_DY = 97; // 층 중심 아래.
    const GLASS_W = 690;
    const GLASS_DY = 175;
    const cx = W / 2;
    // **조금 아래로 내리고 플레이보드 뒤로**: 층을 더 내려 하단이 보드 인테리어(BG_01-1, depth 3)에 파묻히게 하고,
    //   점포 일체 depth 를 인테리어보다 **뒤(낮게)** 둔다 → 보드가 앞, 점포/점원/손님이 뒤.
    const cyFloor = DARK_TOP - ART_H / 2 + 80; // 45 → 80(점포 전체를 조금 더 아래로, 사용자 요청).
    // (상단 지붕 layer_5 는 에디터에서 제거됨 — 2026-07-17. 관련 스냅 코드 삭제.)
    const D_ART = 2;
    const D_CLERK = 2.3;
    const D_CUST = 2.5;
    const D_GLASS = 2.7; // 모두 인테리어(3)보다 뒤 → 보드에 하단이 가림.
    // 순수 층 아트 — **지금 층의 점포**(최신 버전 _v3 > _v2 > base 순, 홈과 같은 규칙).
    const artKey = this.floorArtKeyFor();
    if (artKey) {
      this.add.image(cx, cyFloor, artKey).setDisplaySize(ART_W, ART_H).setDepth(D_ART);
    }
    // 점원 — 그 층의 점원(Chr_NN). 층 아트에는 사람이 없어 코드로 카운터에 세운다.
    const clerkKey = this.floorClerkKeyFor();
    let clerkBottom = cyFloor + CLERK_DY + CLERK_H / 2;
    if (clerkKey) {
      const chr = this.add.image(cx + CLERK_DX, cyFloor + CLERK_DY, clerkKey).setDisplaySize(CLERK_W, CLERK_H).setDepth(D_CLERK);
      clerkBottom = chr.y + chr.displayHeight / 2;
      this.animateClerk(chr);
    }
    // **주문 대기열**(orderQueue) — 랜덤 방문(startCustomerVisits) 대체(PO 2026-07-17 주문서 시스템).
    //   손님이 오른쪽에서 줄 서서 카운터로 전진, 콤보가 주문을 채우고 별을 지불하며 떠난다.
    registerCustomerFrames(this);
    this.orderQueue?.destroy();
    this.orderQueue = new OrderQueue(this, {
      counterX: cx - 20, // 점원(cx-182) 맞은편 카운터 앞 — 점원 쪽으로 약간 더(PO 2026-07-17).
      groundY: clerkBottom,
      height: CLERK_H * 0.92,
      depth: D_CUST, // 점원 앞, 유리 뒤, 인테리어(3) 뒤.
      // **점포 이미지와 일치하는 주문 아이템** — 화면의 점포가 곧 이 층이므로 주문도 그 층 상품이다.
      //   위클리 이벤트가 모으는 상품과도 같은 층이라, 손님 주문 → 수집이 한 줄로 이어진다.
      itemFloor: this.playFloor,
      starTarget: this.gaugeGeom.width > 0 ? { x: this.gaugeGeom.left + this.gaugeGeom.width / 2, y: this.gaugeGeom.y } : { x: 200, y: DARK_TOP + 40 },
      // **손님 별 회수(흡입) 연출** — 정산 시 쌓인 정확한 별 개수를 게이지 끝으로 커지며 순차 흡입 + 게이지 동시 변화.
      onCollectStars: (count, src) => this.suckStarsIntoGauge(count, src),
    });
    // **유리팬스**(홈 사이즈) — 점원·손님 하단을 가림.
    if (this.textures.exists('up_Slitare_BG_Glass')) {
      const glass = this.add.image(cx, cyFloor + GLASS_DY, 'up_Slitare_BG_Glass').setDepth(D_GLASS);
      glass.setDisplaySize(GLASS_W, glass.height * (GLASS_W / glass.width));
    }
  }

  /** 층 아트 키 — 최신 버전(_v3 > _v2 > base) 우선. 없으면 undefined(폴백은 호출부 판단). */
  private floorArtKeyFor(): string | undefined {
    return [...this.store.artKeys, 'up_Slitare_BG_02_v2'].find((k) => this.textures.exists(k));
  }

  /** 지금 점포의 점원 키 — 없으면 2층 베이커로 폴백(아트 누락에도 카운터가 비지 않게). */
  private floorClerkKeyFor(): string | undefined {
    return [...this.store.clerkKeys, 'up_Solirare_Chr_02'].find((k) => this.textures.exists(k));
  }

  /** 점원 idle 애니(발밑 고정 + 좌우 갸웃 + 숨쉬기) — 홈과 동일 느낌. */
  private animateClerk(img: Phaser.GameObjects.Image, phase = 0): void {
    const SWAY = 1.1;
    const baseAngle = img.angle;
    const bottom = img.y + img.displayHeight * (1 - img.originY);
    img.setOrigin(img.originX, 1);
    img.y = bottom;
    img.setAngle(baseAngle - SWAY);
    this.tweens.add({ targets: img, angle: baseAngle + SWAY, duration: 1500, delay: phase, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: img, scaleY: img.scaleY * 1.03, duration: 1950, delay: phase + 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** 홈 레이아웃(home.json)의 층 노드 — 레벨 순(1F..)로 {key,x,y,w,h}. */
  private floorNodes(): { key: string; x: number; y: number; w: number; h: number }[] {
    const doc = this.cache.json.get(UI_HOME_KEY) as LayoutDoc | null;
    if (!doc?.nodes) return [];
    return doc.nodes
      .filter((n) => n.type === 'image' && /_BG_0[1-5]$/.test(n.key ?? ''))
      .map((n) => ({ key: n.key ?? '', x: n.x, y: n.y, w: n.w ?? 800, h: n.h ?? 520 }))
      .sort((a, b) => b.y - a.y); // 아래(y 큰)=1F
  }

  /**
   * 타워 렌더 — 홈화면과 **동일 사이즈/위치**의 층들을, 현재 층이 화면 상단에 오도록 세로 오프셋.
   *   현재 층(하단이 보드 상단에 닿음) = 반투명창 위(depth 30). 하위 건설층 = 반투명창 뒤(depth 12).
   *   (이후 상위 층으로 갈수록 오프셋을 키워 위로 스크롤되는 구조로 확장.)
   */
  private drawTower(builtFloors: number): void {
    const floors = this.floorNodes();
    if (!floors.length) {
      this.drawFloorArt(); // 폴백: 홈 레이아웃 없으면 현재 층만
      return;
    }
    // **제일 상단층(최고 건설층)을 화면 상단에** 고정 → 1층이 위로 올라가지 않는다(타워는 아래로 이어짐).
    const topIdx = Math.max(0, Math.min(builtFloors, floors.length) - 1);
    const cur = floors[topIdx];
    const offset = DARK_TOP + 12 - (cur.y + cur.h / 2); // 최고층 하단이 보드 상단에 닿게
    floors.forEach((f, i) => {
      const level = i + 1;
      if (level > builtFloors || !this.textures.exists(f.key)) return;
      const cy = f.y + offset;
      this.add
        .image(f.x, cy, f.key)
        .setDisplaySize(f.w, f.h)
        .setDepth(cy < DARK_TOP ? 30 : 12);
    });
  }

  private drawHud(): void {
    // **에디터 크롬 모드**: 코인/다이아/레벨은 상단 헤더(buildTopHeader)가, 콤보는 미션 박스가, 홈 이동은
    //   헤더 ☰ 메뉴가 대신한다 → 코드 HUD 전부 생략. (예전엔 '남은 카드'·'⌂ 홈' 텍스트가 top-right 헤더
    //   아이콘(✉·☰) 뒤에 겹쳐 유령 텍스트로 비쳤다 → 전면 생략으로 제거.)
    if (this.chromeFromEditor) return;
    this.coinText = this.add
      .text(44, 56, '🪙 30,140', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '44px', color: '#ffe9a0' })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.comboText = this.add
      .text(44, 112, '콤보 x0', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.remainText = this.add
      .text(W - 44, 56, '남은 카드 18', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '34px',
        color: '#ffffff',
        stroke: '#3a1030',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setDepth(60);
    this.add
      .text(W - 44, 112, '⌂ 홈', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        stroke: '#3a1030',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setDepth(60)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.confirmQuit());
  }

  // ── 좌표(동적 — 배치를 보드 영역에 맞춰 스케일·중앙배치) ─────────────────
  private geom = {
    scale: 1,
    cardW: BASE_CARD_W,
    cardH: BASE_CARD_H,
    cx: W / 2,
    absOriginX: 0,
    absOriginY: 0,
    /** 세로 좌표 배율 = scale × 조밀도. 카드 **크기는 그대로** 두고 세로 간격만 조이는 축(fitVertical 참조). */
    absScaleY: 1,
  };

  /**
   * **세로 조밀도 자동 적용**(PO 2026-07-28 "상단 여유를 확보하되, 그러려고 특정 배치는 상하 여백 패딩을 주면서
   *   배치 중첩 밀도를 자동으로 높여라") — 배치가 여백을 포함한 영역에 안 들어갈 때 **카드를 줄이는 대신 세로
   *   간격(중첩)을 조인다**. 카드가 작아지는 것보다 조금 더 겹치는 편이 가독성 손해가 적기 때문.
   *
   *   반환 `compact` = 세로 간격에 곱하는 계수(1=원본 간격, 작을수록 촘촘=많이 겹침). `MIN_VERT_COMPACT`
   *   아래로는 내려가지 않는다 — 그 이상 겹치면 카드 좌상단 랭크가 가려져 무슨 카드인지 못 읽는다.
   *   조밀도만으로도 부족한 극단적 배치에서만 **마지막 수단으로** 카드 크기까지 줄인다.
   *
   *   spread = 카드 중심들의 세로 퍼짐(=콘텐츠 높이 − 카드 1장 높이). 조밀도는 이 퍼짐에만 곱해지고
   *   카드 높이에는 곱하지 않는다 → `drawH = scale × (spread × compact + cardH)`.
   */
  private static fitVertical(spread: number, cardH: number, scale: number, availH: number): { scale: number; compact: number } {
    const drawH = (s: number, k: number): number => s * (spread * k + cardH);
    if (drawH(scale, 1) <= availH || spread <= 0) return { scale, compact: 1 };
    const wanted = (availH / scale - cardH) / spread; // 이 값이면 딱 맞는다.
    const compact = Math.min(1, Math.max(MIN_VERT_COMPACT, wanted));
    if (drawH(scale, compact) <= availH) return { scale, compact }; // 조밀도만으로 해결.
    return { scale: availH / (spread * compact + cardH), compact }; // 하한까지 조여도 넘침 → 카드 축소(최후).
  }

  /**
   * 에디터 절대배치(abs) 기하 — 저작 카드 바운딩(디자인 px)을 보드 영역에 배치한다.
   *   **에디터에서 설정한 카드 크기(최소/저작 크기)를 기준(1:1)으로 표시** — 에디터·게임 모두 1080×2400 이므로
   *   editor px = game px. 남는 폭은 ABS_CARD_MAX_SCALE(1.15) 까지만 확대한다(레벨 간 편차 제한).
   *   세로가 넘치면 카드를 줄이기 전에 **먼저 조밀도**(fitVertical)로 흡수한다.
   */
  private computeAbsGeom(abs: NonNullable<import('../logic/layouts.js').PeakLayout['abs']>): void {
    const contentW = Math.max(1, abs.maxX - abs.minX);
    const contentH = Math.max(1, abs.maxY - abs.minY);
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    // **상하 여백 보장** — 이 패딩 안쪽이 실제로 카드가 놓일 수 있는 범위다.
    const availTop = this.boardTop + BOARD_PAD_TOP;
    const availH = Math.max(1, this.boardBottom - BOARD_PAD_BOTTOM - availTop);
    const spread = Math.max(0, contentH - abs.cardH); // 카드 중심들의 세로 퍼짐.

    // 카드 크기는 **가로 기준**으로만 정한다(세로 때문에 작아지지 않게) → 세로는 조밀도가 맡는다.
    const fit = PlayScene.fitVertical(spread, abs.cardH, Math.min(ABS_CARD_MAX_SCALE, (boardW * ABS_FIT_W_RATIO) / contentW), availH);
    const scale = fit.scale;
    const scaleY = scale * fit.compact;

    const originX = (BOARD_LEFT + BOARD_RIGHT) / 2 - (contentW * scale) / 2 - abs.minX * scale; // 가로 중앙
    const drawH = scale * (spread * fit.compact + abs.cardH);
    const room = Math.max(0, availH - drawH);
    const topEdge = availTop + room / 2 + Math.min(room / 2, BOARD_DOWN_BIAS); // 여백 안에서 세로 중앙 + 아래 바이어스
    // 맨 윗카드의 **위쪽 모서리**가 topEdge 에 오도록 원점을 역산(중심 좌표계 ↔ 모서리 기준 보정).
    const originY = topEdge - (abs.minY + abs.cardH / 2) * scaleY + (abs.cardH * scale) / 2;
    this.geom = {
      ...this.geom,
      scale,
      cardW: abs.cardW * scale,
      cardH: abs.cardH * scale,
      cx: (BOARD_LEFT + BOARD_RIGHT) / 2,
      absOriginX: originX,
      absOriginY: originY,
      absScaleY: scaleY,
    };
  }

  /**
   * 보드 기하 — **에디터 절대배치(abs) 전용**.
   *   게임에 노출되는 레이아웃은 전부 `cardBoardToLayout` 산출이라 `abs` 가 항상 있다
   *   (저작 레벨이 없으면 애초에 플레이가 시작되지 않는다).
   *
   *   예전에는 (row,col) 격자 폴백 경로가 함께 있었으나 **프로덕션에서 도달 불가**였고,
   *   그 경로의 depth 규약이 커버 그래프와 **반대**여서(커버는 아래 행이 앞인데 depth 는 뒤)
   *   되살아나면 곧바로 "보이는 카드가 안 눌리는" 버그가 되는 지뢰였다 → 제거했다.
   */
  private computeGeom(): void {
    const abs = this.state.layout.abs;
    if (!abs) {
      this.logInvariant('layout-without-abs', this.state.layout.id);
      return;
    }
    this.computeAbsGeom(abs);
  }

  private slotPos(slot: LayoutSlot): { x: number; y: number; depth: number } {
    const g = this.geom;
    // 저작 px 를 보드 영역 스케일로 매핑. 높은 레이어(row)=앞(높은 depth) — 커버 그래프와 같은 방향.
    return {
      x: g.absOriginX + (slot.ax ?? 0) * g.scale,
      y: g.absOriginY + (slot.ay ?? 0) * g.absScaleY, // 세로만 조밀도 반영(카드 크기는 scale 그대로).
      depth: 100 + slot.row * 10,
    };
  }

  private buildBoard(): void {
    this.input.topOnly = true;
    this.computeGeom();
    // 아래 행(큰 row) 먼저 생성 → 위 행이 나중(=앞)으로 겹친다.
    const ordered = [...this.state.layout.slots].sort((a, b) => b.row - a.row);
    for (const slot of ordered) {
      if (this.state.cleared.has(slot.id)) continue; // 제거된 슬롯은 뷰 생성 안 함(되돌리기 재구성 대비).
      const p = this.slotPos(slot);
      // CardView 는 생성자에서 픽셀 기반 상호작용(pixelPerfect)을 켠다 → 카드 실제 픽셀에만 반응.
      const view = new CardView(this, p.x, p.y, this.geom.cardW, this.geom.cardH);
      view.setDepth(p.depth);
      view.setAngle(slot.rot ?? 0); // 손맛 회전(있으면). pixelPerfect 히트도 회전을 반영.
      view.setData('slotId', slot.id);
      view.on('pointerdown', () => this.onCardTap(slot.id));
      this.cards.set(slot.id, view);
    }
  }

  /**
   * 최초 딜 연출 — 보드 카드가 한 번에 '툭' 나타나지 않고, **폴드(뒷면) 카드가 먼저 차르륵 빠르게
   * 깔린 뒤, 오픈(앞면) 카드가 좌우에서 날아와** 자리에 안착한다. `refresh()` 로 얼굴/뒷면·알파가
   * 이미 최종값으로 정해진 뒤 호출되므로, 여기서는 그 최종 상태를 시작 상태로 되돌린 다음 트윈으로 복원한다.
   *   · 폴드: 위쪽에서 살짝 비껴 떨어지며 **가속하는 스태거**(뒤로 갈수록 간격이 촘촘)로 리듬을 만든다.
   *   · 오픈: 보드 중심 기준 가까운 쪽 화면 밖에서 가속-감속(easeInOut)으로 날아 들어온다.
   *   되돌리기/보드 재구성(rebuildBoard)에서는 호출하지 않아 즉시 표시된다.
   */
  private dealInAnimation(): void {
    const boardCx = this.geom.cx;
    type DealItem = {
      view: CardView;
      fx: number;
      fy: number;
      fa: number;
      fsx: number;
      fsy: number;
      fAlpha: number;
      exposed: boolean;
    };
    const items: DealItem[] = [];
    for (const [id, view] of this.cards) {
      items.push({
        view,
        fx: view.x,
        fy: view.y,
        fa: view.angle,
        fsx: view.scaleX,
        fsy: view.scaleY,
        fAlpha: view.alpha,
        exposed: isExposed(this.state, id),
      });
      if (view.input) view.input.enabled = false; // 딜 도중 입력 잠금(날아드는 카드 오탭 방지).
    }
    if (items.length === 0) return;
    this.dealing = true;

    const folds = items.filter((it) => !it.exposed);
    const opens = items.filter((it) => it.exposed);

    // ── 폴드(뒷면) — **화면 밖 먼 곳에서** 날아와 제자리에 깔린다(PO 2026-08-22
    //    "주변에서 나타나는 방식이 아니라 화면을 벗어난 먼 곳에서 날아와 배치"). ──
    //    출발점은 위쪽 화면 밖(카드 한 장 높이 + 여유). 좌우로도 살짝 벌려 부채처럼 모이게 한다.
    const FOLD_SPAN = 520; // 폴드 시작딜레이 창(전체)
    const FOLD_DUR = 320; // 개별 비행 시간(먼 거리라 조금 길게)
    const n = Math.max(1, folds.length);
    const offTop = -this.geom.cardH * 1.6; // 화면 위 바깥
    folds.forEach((it, i) => {
      const delay = FOLD_SPAN * (i / n) ** 1.7; // 뒤로 갈수록 촘촘 → 가속하는 리듬
      const side = it.fx < boardCx ? -1 : 1;
      it.view
        .setPosition(it.fx + side * this.geom.cardW * 1.2, offTop)
        .setAlpha(0)
        .setAngle(it.fa - side * 16)
        .setScale(it.fsx * 0.86, it.fsy * 0.86);
      this.tweens.add({
        targets: it.view,
        x: it.fx,
        y: it.fy,
        angle: it.fa,
        alpha: it.fAlpha,
        scaleX: it.fsx,
        scaleY: it.fsy,
        delay,
        duration: FOLD_DUR,
        ease: 'Cubic.easeOut', // 멀리서 빠르게 들어와 슬롯에서 감속
      });
    });

    // ── 오픈(앞면) — 폴드가 거의 깔린 뒤 좌우 화면 밖에서 날아와 안착. ──
    const OPEN_BASE = FOLD_SPAN * 0.8 + 40;
    const OPEN_STAGGER = 78;
    const OPEN_DUR = 380;
    let lastEnd = folds.length > 0 ? FOLD_SPAN + FOLD_DUR : 0;
    opens.forEach((it, i) => {
      const side = it.fx < boardCx ? -1 : 1;
      const startX = side < 0 ? -this.geom.cardW * 2.2 : W + this.geom.cardW * 2.2; // 화면 밖 먼 곳
      const delay = OPEN_BASE + i * OPEN_STAGGER;
      it.view.setPosition(startX, it.fy).setAlpha(it.fAlpha).setAngle(side * 14).setScale(it.fsx, it.fsy);
      this.tweens.add({
        targets: it.view,
        x: it.fx,
        y: it.fy,
        angle: it.fa,
        delay,
        duration: OPEN_DUR,
        ease: 'Cubic.easeInOut', // 날개에서 가속 → 슬롯에서 감속
      });
      lastEnd = Math.max(lastEnd, delay + OPEN_DUR);
    });

    // 딜 종료 후 입력/상태 복원.
    this.time.delayedCall(lastEnd + 20, () => {
      this.dealing = false;
      this.refresh();
    });
  }

  /**
   * 하단 부스터 아이콘들의 **가장 아래 모서리**(디자인 px). 에디터 크롬이 없으면 null(폴백 좌표 유지).
   *   셋 중 최댓값을 쓴다 — 아이콘 높이가 제각각이어도 카드가 모든 아이콘보다 아래로 내려가지 않는다.
   */
  private boosterBottomY(): number | null {
    const idx = this.chrome;
    if (!idx) return null;
    const bottoms = BOOSTER_NODE_IDS.map((id) => idx.nodeById(id))
      .filter((n): n is NonNullable<typeof n> => !!n && typeof n.h === 'number')
      .map((n) => n.y + (n.h as number) / 2);
    return bottoms.length ? Math.max(...bottoms) : null;
  }

  private buildStockAndWaste(): void {
    // 스톡·웨이스트 카드는 보드(상단) 카드와 동일 크기.
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    this.stockContainer = this.add.container(STOCK.x, STOCK.y).setDepth(80);
    this.buildStockPile(); // 보유 수량만큼 카드를 왼쪽으로 펼친다.
    // 탭 입력 Zone — 왼쪽으로 펼쳐진 더미 전체를 덮도록 왼쪽으로 넓게 잡는다(펼친 카드 어디를 눌러도 뽑힘).
    const fanW = Math.max(this.stockFanWidth, (STOCK_STACK_CAP - 1) * STOCK_FAN_MIN_STEP);
    this.add
      .zone(STOCK.x - fanW / 2, STOCK.y + 10, cw + fanW + 60, ch + 120)
      .setDepth(85)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onStockTap());
    this.stockCountText = this.add
      .text(STOCK.x, STOCK.y + ch / 2 + 24, '', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(81);

    this.wasteLabel = this.add
      .text(WASTE.x, WASTE.y + ch / 2 + 24, '기준 카드', {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '24px',
        color: '#e9d9ff',
      })
      .setOrigin(0.5)
      .setDepth(81);

    const wv = new CardView(this, WASTE.x, WASTE.y, cw, ch, false);
    wv.setDepth(82);
    wv.showFace(wasteTop(this.state));
    this.wasteView = wv;
  }

  /**
   * 스톡 더미를 **보유 수량만큼** 카드(뒷면)를 겹쳐 다시 쌓는다 — 남은 장수가 두께로 보인다(상한 STOCK_STACK_CAP).
   *   수량이 바뀔 때만 호출(refresh 에서 캐시 비교). 위로 갈수록 살짝 왼쪽·위로 어긋나 웨이스트와 겹치지 않는다.
   */
  /** 뽑기 더미(왼쪽 펼침 부채)의 **중간 지점** 월드 좌표 — 보너스 카드가 더미 중간으로 회수되는 타깃. */
  private stockMidPoint(): { x: number; y: number } {
    const count = Math.min(this.state.stock.length, STOCK_STACK_CAP);
    const midLocalX = -((count - 1) / 2) * STOCK_FAN_STEP; // 부채 중앙(원점=top, 왼쪽으로 펼침)
    return { x: STOCK.x + midLocalX, y: STOCK.y };
  }

  private buildStockPile(): void {
    const cont = this.stockContainer;
    if (!cont) return;
    cont.removeAll(true);
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const len = this.state.stock.length;
    const count = Math.min(len, STOCK_STACK_CAP, this.stockRevealMax); // 보너스 +N 순차 노출 시 표시 장수 제한.
    // **스톡 내 와일드 위치** — 부채에서 대응하는 팬 인덱스에 와일드 아트를 같은 크기로 노출(중간 프리뷰).
    //   단, 뱅킹 비행 중(wildBanking)에는 아직 표시하지 않는다(도착 후 표시).
    const wildIdx = this.wildBanking ? -1 : this.state.stock.findIndex((c) => c.wild);
    const wildFanI = wildIdx >= 0 ? Math.round((wildIdx / Math.max(1, len - 1)) * (count - 1)) : -1;
    // **왼쪽 ＋5 아이콘을 침범하지 않게** 펼침 폭을 제한한다(PO 2026-08-22).
    //   여유 폭 안에 못 들어가면 ① 간격을 좁히고 ② 그래도 넘치면 **2열**로 나눠 쌓는다.
    const leftLimit = (this.addImg?.getBounds().right ?? STOCK_FAN_LEFT_FALLBACK) + STOCK_FAN_MARGIN;
    const avail = Math.max(0, STOCK.x - cw / 2 - leftLimit);
    const layout = stockFanLayout(count, avail, STOCK_FAN_STEP, STOCK_FAN_MIN_STEP);
    // i=0(맨 아래)=가장 왼쪽, i=count-1(맨 위, 다음에 뽑힐 카드)=원점(뽑기 시작 위치).
    for (let i = 0; i < count; i++) {
      const isWild = i === wildFanI;
      const slot = layout.at(i);
      // 와일드는 살짝 위로 띄워 부채 사이로 확실히 보이게. 크기는 스톡 카드와 동일.
      const back = new CardView(this, slot.x, slot.y * ch + (isWild ? -ch * 0.16 : 0), cw, ch, false);
      if (isWild) back.showWild();
      else back.showBack();
      cont.add(back);
    }
    this.stockFanWidth = layout.width;
    this.lastStockCount = this.state.stock.length;
  }

  // ── 부스터(와일드 · 되돌리기 · 카드5개, 코인 소모) ─────────────────────
  /** 상태 변경 전 히스토리 저장(되돌리기용). kind = 이 다음에 할 행동(무작위 결과 재현 판단용). */
  private pushHistory(kind: HistoryKind = 'other'): void {
    // 수(move) 직전의 GameState + 씬 래치를 함께 저장(undo 가 둘 다 되돌리도록). comboColors 는 얕은 복사.
    this.history.push({
      state: this.state,
      kind,
      wildBanked: this.wildBanked,
      bonusTriggered: this.bonusTriggered,
      starGauge: this.starGauge,
      setsDone: this.setsDone,
      wildActive: this.wildActive, // 기준 위 와일드 활성 상태도 저장(undo 시 복원).
      comboColors: [...this.comboColors], // 얕은 복사 — 되돌리면 콤보도 그 수 직전으로.
      melodyStep: this.melodyStep,
      pendingMissions: this.pendingMissions,
      starSlots: [...this.starSlots.keys()],
      stockSlots: [...this.stockSlots.keys()],
      boardCollections: [...this.boardCollections.keys()],
    });
    if (this.history.length > 40) this.history.shift();
  }

  /** 코인 차감(뱅크된 코인 기준). 부족하면 false. */
  /** 부스터 아이콘 위치 — 코인 부족 안내 창의 꼬리가 그 버튼을 가리키게 한다(없으면 하단 중앙). */
  private boosterAnchor(kind: 'plus5' | 'wild' | 'undo'): { x: number; y: number } {
    const img = kind === 'plus5' ? this.addImg : kind === 'wild' ? this.wildImg : this.undoImg;
    const btn = kind === 'plus5' ? this.addBtn : kind === 'wild' ? this.wildBtn : this.undoBtn;
    const o = img ?? btn;
    return o ? { x: o.x, y: o.y } : { x: W / 2, y: H * 0.82 };
  }

  /**
   * **행운 카드 연출**(PO 2026-08-25) — ＋5 보조 카드가 매칭 랭크로 공개된 순간, 기준 카드 자리에
   * 금빛 링 + "행운 카드!" 라벨을 잠깐 띄운다. 숫자(확률)는 보여주지 않는다 — 체감만 남긴다.
   */
  private luckyCardFx(): void {
    if (this.ended) return;
    const x = WASTE.x;
    const y = WASTE.y;
    const ring = this.add.graphics().setDepth(2300);
    ring.lineStyle(10, 0xffd94a, 0.95).strokeCircle(0, 0, this.geom.cardW * 0.62);
    ring.setPosition(x, y).setAlpha(0.9).setScale(0.6);
    const label = this.add
      .text(x, y - this.geom.cardH * 0.85, '✨ 행운 카드!', {
        fontFamily: PlayScene.TIP_FONT, fontSize: '34px', color: '#ffd94a', fontStyle: '800',
      })
      .setOrigin(0.5)
      .setDepth(2301)
      .setStroke('#5a3210', 8)
      .setAlpha(0);
    this.tweens.add({ targets: ring, scale: 1.25, alpha: 0, duration: 620, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    this.tweens.add({ targets: label, alpha: 1, y: label.y - 26, duration: 240, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, alpha: 0, delay: 760, duration: 260, onComplete: () => label.destroy() });
    sfx('set_complete', { volume: 0.25 });
  }

  private spend(cost: number, at?: { x: number; y: number }): boolean {
    if (this.baseCoins < cost) {
      sfx('no_coin');
      this.labRun.pinch += 1; // **핀치 계측**(PO 2026-08-25) — "코인 부족" 순간(오퍼 노출 시점 튜닝의 근거).
      /*
       * **핀치 순간의 초회 오퍼**(PO 2026-08-25) — 코인이 모자란 바로 그 순간이 최적 접점이다.
       *   스타터 팩(초회 한정)이 남아 있으면 상점 안내 대신 팩을 제안하고, 이미 샀으면 기존 흐름(상점).
       */
      /*
       * ⚠️ **시뮬(계측 봇) 중에는 오퍼를 띄우지 않는다**(2026-08-25 실측: 봇이 와일드/되돌리기를 쓰다
       *   코인이 부족해지면 팝업이 입력을 막아 계측이 멈췄다). 오퍼는 실유저 전용 — 봇은 핀치 계측만 남긴다.
       */
      if (!this.simRunning && openStarterOffer(this, {
        toast: (m) => this.toast(m, true),
        onGranted: () => {
          this.baseCoins = loadSave().coins; // 지급 즉시 잔액 동기화 — 하던 결제를 그대로 이어간다.
          this.header?.setCoins(this.baseCoins);
          this.updateBoosters();
        },
      })) return false;
      // **코인이 없으면 알리고 바로 상점을 연다**(PO 2026-08-22) — 메뉴를 찾아 들어가라고 안내만 하면
      //   거기서 흐름이 끊긴다. 충전하면 onCoins 가 잔액·부스터 상태를 즉시 맞춰 그대로 이어서 할 수 있다.
      this.showMessage('코인이 부족합니다.\n상점에서 충전하고 이어서 하세요.', () => this.openShop(), at);
      return false;
    }
    this.baseCoins -= cost;
    this.labRun.boosterCoins += cost; // 일일 지표 — 부스터 실지출(판 정산 때 합산).
    const s = loadSave();
    s.coins = Math.max(0, s.coins - cost);
    writeSave(s);
    return true;
  }

  private drawBoosters(): void {
    // 에디터 크롬이면 하단 부스터(와일드/되돌리기/+5)는 에디터 이미지(layer_10/10_copy/11)를 쓴다 → 코드 텍스트 버튼 생략.
    if (this.chromeFromEditor) {
      this.updateBoosters();
      return;
    }
    // 하단 스톡/웨이스트(y=1880, 라벨 포함 ~1990) 아래에 배치해 카드와 겹치지 않게(스톡과 함께 위로 이동).
    const y = 2100;
    this.wildBtn = this.mkBooster(W * 0.22, y, `🃏 와일드\n${this.boosterLabel('wild', this.wildPrice())}`, () => this.useWild());
    this.undoBtn = this.mkBooster(W * 0.5, y, `↩ 되돌리기\n${this.boosterLabel('undo', this.undoPrice())}`, () => this.undo());
    this.addBtn = this.mkBooster(W * 0.78, y, `＋5 카드\n${this.boosterLabel('plus5', this.plus5Price())}`, () => this.addCards());
    this.updateBoosters();
  }

  private mkBooster(x: number, y: number, label: string, on: () => void): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '30px',
        color: '#2a1830',
        backgroundColor: '#ffd166',
        align: 'center',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(90)
      .setShadow(0, 3, '#00000055', 5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', on);
  }

  /** 버튼 활성/색 갱신(코인·가용 여부·와일드 활성 반영). */
  private updateBoosters(): void {
    const set = (btn: Phaser.GameObjects.Text | undefined, enabled: boolean, active = false): void => {
      if (!btn) return;
      btn.setAlpha(enabled ? 1 : 0.4);
      btn.setBackgroundColor(active ? '#7ed957' : '#ffd166');
    };
    // 에디터 부스터 이미지: 활성=alpha 1, 비활성=흐림, 와일드 활성=초록 틴트.
    const setImg = (img: Phaser.GameObjects.Image | undefined, enabled: boolean, active = false): void => {
      if (!img) return;
      img.setAlpha(enabled ? 1 : 0.4);
      if (active) img.setTint(0x7ed957);
      else img.clearTint();
    };
    const nextWild = this.wildPrice(); // 다음 사용 비용(사용·레벨·도전 배수 반영).
    const nextPlus5 = this.plus5Price();
    const nextUndo = this.undoPrice();
    // 보유 아이템이 있으면 코인과 무관하게 사용 가능(무료 소모).
    const wildOn = this.wildActive || this.itemCount('wild') > 0 || this.baseCoins >= nextWild;
    const undoOn = this.history.length > 0 && (this.itemCount('undo') > 0 || this.baseCoins >= nextUndo);
    // ＋5 카드 = 재활용할 소모 카드가 있고 **아이템 보유 또는 코인 충분**이면 활성.
    // ＋5 는 **되돌릴 수 있는 카드**(기준·쓴 와일드 제외)가 있어야 의미가 있다 — 없으면 눌러도 아무 일이 없다.
    const addOn = refillableCount(this.state) > 0 && (this.itemCount('plus5') > 0 || this.baseCoins >= nextPlus5);
    set(this.wildBtn, wildOn, this.wildActive);
    set(this.undoBtn, undoOn);
    set(this.addBtn, addOn);
    setImg(this.wildImg, wildOn, false); // 와일드 활성 시에도 우측 하단 버튼 색상 변화는 표시하지 않음(요청)
    setImg(this.undoImg, undoOn);
    setImg(this.addImg, addOn);
    // 에디터 부스터 이미지 옆 라벨 — **보유분은 원문자, 소진 시 코인 가격**(PO 2026-07-16).
    this.plus5CostLabel?.setText(this.boosterLabel('plus5', nextPlus5));
    this.wildCostLabel?.setText(this.boosterLabel('wild', nextWild));
    this.undoCostLabel?.setText(this.boosterLabel('undo', nextUndo));
    // 폴백 텍스트 버튼(비-에디터)도 동일 규칙.
    if (this.wildBtn && !this.wildActive) this.wildBtn.setText(`🃏 와일드\n${this.boosterLabel('wild', nextWild)}`);
    this.undoBtn?.setText(`↩ 되돌리기\n${this.boosterLabel('undo', nextUndo)}`);
    this.addBtn?.setText(`＋5 카드\n${this.boosterLabel('plus5', nextPlus5)}`);
  }

  /**
   * 와일드 — 선택하면 **와일드 카드가 기준(웨이스트) 카드 자리로 날아가** 기준이 와일드가 된다.
   *   기준이 와일드인 동안 아무 노출 카드나 탭해 ±1 무시로 제거할 수 있다(제거하면 그 카드가 새 기준).
   *   다시 누르면 취소(마커 제거, 코인 환불 없음).
   */
  private useWild(): void {
    if (this.busy || this.ended) return;
    if (this.wildActive) {
      this.cancelWild();
      return;
    }
    // 보유 아이템 우선 소모(무료) → 없으면 코인 결제(모델 가격).
    const cost = this.wildPrice();
    const usedItem = this.consumeItem('wild');
    if (!usedItem && !this.spend(cost, this.boosterAnchor('plus5'))) return;
    this.wildUses += 1; // 다음 사용부터 비용 상승.
    sfx('wild_activate');
    this.wildActive = true;
    this.toast(usedItem ? `🃏 와일드 · 아이템 사용 (남음 ${this.itemCount('wild')})` : `🃏 와일드  🪙 ${cost.toLocaleString()}`);
    this.updateBoosters();
    // 와일드 카드가 부스터 버튼 → 기준 카드 자리로 포물선 비행 후, 기준 위에 와일드 마커로 안착.
    const from = this.wildImg ?? this.wildBtn;
    const sx = from?.x ?? W * 0.78;
    const sy = from?.y ?? 2100;
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const flyer = this.textures.exists('up_Solitare_UI_08')
      ? this.add.image(sx, sy, 'up_Solitare_UI_08').setDisplaySize(cw, ch)
      : this.add.rectangle(sx, sy, cw, ch, 0xffd166);
    flyer.setDepth(1200);
    const ctrlX = (sx + WASTE.x) / 2;
    const ctrlY = Math.min(sy, WASTE.y) - 360;
    this.busy = true;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 480,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const u = 1 - t;
        flyer.x = u * u * sx + 2 * u * t * ctrlX + t * t * WASTE.x;
        flyer.y = u * u * sy + 2 * u * t * ctrlY + t * t * WASTE.y;
      },
      onComplete: () => {
        flyer.destroy();
        this.busy = false;
        // 비행 도중 이미 와일드를 소비(카드 탭)했다면 마커를 얹지 않는다.
        if (this.wildActive) {
          this.showWildMarker();
          this.toast('🃏 와일드! 아무 노출 카드나 탭하세요');
          this.tryTip('wildUse');
        }
        this.refresh();
      },
    });
  }

  /** 와일드 활성 취소 — 마커 제거 + 하이라이트 원복. */
  private cancelWild(): void {
    // 끌 와일드가 없으면 **아무것도 하지 않는다** — 예전엔 무조건 refresh() 를 불러, 뽑기처럼 연출이 걸린
    //   경로에서 화면을 앞질러 갱신하는 부작용이 있었다(PO 2026-07-28 기준카드 이중 표시의 공범).
    if (!this.wildActive && !this.wildMarker) return;
    this.wildActive = false;
    this.wildMarker?.destroy();
    this.wildMarker = undefined;
    this.updateBoosters();
    this.refresh();
  }

  /** 기준(웨이스트) 카드 위에 **와일드 카드를 배치**한다 — 기준이 와일드가 됐음을 카드 그대로 표시. */
  private showWildMarker(): void {
    this.wildMarker?.destroy();
    this.wildMarker = undefined;
    if (!this.textures.exists('up_Solitare_UI_08')) return;
    // 와일드 카드(프레임 크롭 아트)를 기준 카드와 같은 크기로, **기준 카드보다 위 depth**에 얹어 실제로 보이게.
    const marker = new CardView(this, WASTE.x, WASTE.y, this.geom.cardW, this.geom.cardH, false);
    marker.showWild();
    marker.setDepth(Math.max(1005, (this.wasteView?.depth ?? 1000) + 5));
    this.wildMarker = marker;
    // 살짝 맥동시켜 활성 상태를 강조.
    this.tweens.add({
      targets: marker,
      scale: marker.scale * 1.06,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 되돌리기 — 직전 상태로 복원(보드 재구성). */
  /**
   * **되돌린 무작위 수의 결과**(뽑기·＋5) — 같은 상태에서 같은 행동을 다시 하면 **똑같은 카드**가 나오게
   *   재현한다. 없거나 상태/행동이 어긋나면 null(= 평소대로 새로 추첨).
   *   ⚠️ 상태 비교는 **참조 동일성**이다 — GameState 는 불변이라 undo 로 복원한 객체가 그대로 유지되는
   *      동안만 매치되고, 그 사이 다른 수를 두면 자동으로 무효가 된다(별도 무효화 코드가 필요 없다).
   */
  private replayUndone(kind: HistoryKind): GameState | null {
    const step = this.undoneRandomStep;
    if (!step || step.kind !== kind || step.from !== this.state) return null;
    this.undoneRandomStep = undefined;
    return step.to;
  }

  private undo(): void {
    if (this.busy || this.ended) return;
    if (this.flyingCards > 0) return; // 카드 비행 연출 중 되돌리기 금지(orphan 뷰가 wasteView 를 덮는 레이스 방지).
    if (this.history.length === 0) {
      this.toast('되돌릴 수 없어요');
      return;
    }
    // 되돌리기도 유료(PO) — 보유 아이템 우선, 없으면 모델 가격.
    if (!this.consumeItem('undo') && !this.spend(this.undoPrice(), this.boosterAnchor('undo'))) return;
    sfx('undo');
    this.labRun.undos += 1;
    const undoneState = this.state; // 되돌리기 **직전** 상태 = 취소되는 수의 결과.
    const prev = this.history.pop();
    if (!prev) return;
    this.state = prev.state;
    // **무작위 수 결과 기억**(PO 2026-07-27) — 되돌린 게 뽑기/＋5 였다면 그 결과를 그대로 들고 있다가,
    //   같은 자리에서 같은 행동을 다시 하면 재현한다(카드가 매번 새로 돌아가 혼란스럽다는 지적).
    this.undoneRandomStep = prev.kind === 'other' ? undefined : { kind: prev.kind, from: prev.state, to: undoneState };
    // **GameState 밖 래치 복원** — 특수카드 트리거·완료 세트를 수 직전 상태로(보너스/와일드 영구 무력화·게이지 파밍 방지).
    this.wildBanked = prev.wildBanked;
    this.bonusTriggered = prev.bonusTriggered;
    this.starGauge = prev.starGauge;
    this.setsDone = prev.setsDone;
    // **와일드 활성 복원**(PO 2026-07-17 버그수정) — 기존엔 cancelWild 로 무조건 껐다 → 되돌린 뒤 기준의 와일드가
    //   사라졌다. 이제 직전 스냅샷의 wildActive 를 되살린다(마커는 아래서 재배치).
    this.wildMarker?.destroy();
    this.wildMarker = undefined;
    this.wildActive = prev.wildActive;
    /*
     * **콤보 복원**(PO 2026-08-24) — 예전엔 여기서 `resetComboRun()` 으로 콤보를 끊었다. 그러면
     *   되돌리기가 "실수를 무르는 도구"가 아니라 "콤보를 버리는 대가"가 되어 쓸 이유가 사라진다.
     *   수 직전에 저장해 둔 콤보를 그대로 되살린다.
     */
    this.comboColors = [...prev.comboColors];
    this.melodyStep = prev.melodyStep;
    this.comboCountText?.setText(`+${this.comboColors.length}`);
    /*
     * 손님 주문 표시도 같이 되돌린다 — 콤보만 되살리고 말풍선 별을 그대로 두면 숫자가 어긋난다.
     * 별 표시를 한 번 비운 뒤(`onRunReset`) 복원할 개수만큼 다시 채운다(기존 API 재사용).
     */
    this.orderQueue?.onRunReset();
    for (let i = 1; i <= this.comboColors.length; i++) this.orderQueue?.onMatch(i);
    this.pendingMissions = prev.pendingMissions;
    this.revertBoardItems(prev);
    this.rebuildBoard(); // 뽑은 와일드는 여기서 와일드 아트로 표시된다.
    // **부스터 와일드**(기준 카드 자체는 와일드 아님)면 기준 위에 와일드 마커를 다시 얹는다.
    if (this.wildActive && !wasteTop(this.state)?.wild) this.showWildMarker();
    this.updateBoosters();
  }

  /**
   * **되돌린 뒤 보드 아이템 정리** — 스냅샷 이후에 꽂힌 별·＋카드·컬렉션 카드를 걷어낸다.
   *
   * 안 걷어내면 같은 콤보를 다시 완성했을 때 **두 개가 겹쳐 꽂힌다**(PO 2026-08-24 신고).
   * ⚠️ 컬렉션 카드는 꽂히는 순간 세이브에 이미 지급됐다 — 보드 표시만 정리하고 **보유는 되돌리지
   *   않는다**(받은 것을 뺏지 않는다). 다시 완성하면 새 카드가 나오지만 중복 표시는 사라진다.
   */
  private revertBoardItems(prev: HistorySnap): void {
    const drop = <T>(map: Map<string, T>, keep: readonly string[], destroy: (id: string) => void): void => {
      const keepSet = new Set(keep);
      for (const id of [...map.keys()]) {
        if (keepSet.has(id)) continue;
        destroy(id);
        map.delete(id);
      }
    };
    drop(this.starSlots, prev.starSlots, (id) => {
      const v = this.starViews.get(id);
      if (v) {
        this.tweens.killTweensOf(v.img);
        v.img.destroy();
        v.label?.destroy();
      }
      this.starViews.delete(id);
    });
    drop(this.stockSlots, prev.stockSlots, (id) => {
      const v = this.stockViews.get(id);
      if (v) {
        this.tweens.killTweensOf(v.img);
        v.img.destroy();
      }
      this.stockViews.delete(id);
    });
    drop(this.boardCollections, prev.boardCollections, (id) => {
      const bc = this.boardCollections.get(id);
      if (bc) {
        this.tweens.killTweensOf(bc.view);
        bc.view.destroy();
      }
    });
  }

  /**
   * ＋5 카드 — 소모 카드(웨이스트) 중 임의 5장을 스톡으로 되돌린다.
   *   **비용 = 게임비 기준 상승 곡선**(plus5Cost). 한 판에서 쓸수록 비싸진다(첫 750·1000·1250…).
   */
  private addCards(): void {
    if (this.busy || this.ended) return;
    if (this.flyingCards > 0) return; // 카드 비행 연출 중 금지(상태 갱신 레이스 방지).
    if (refillableCount(this.state) === 0) {
      this.toast('되돌릴 카드가 없어요');
      return;
    }
    const cost = this.plus5Price();
    const usedItem = this.consumeItem('plus5'); // 보유 아이템 우선(무료).
    if (!usedItem && !this.spend(cost, this.boosterAnchor('plus5'))) return; // 코인 부족 시 spend 가 안내 후 중단.
    this.plus5Uses += 1; // 다음 사용부터 비용 상승.
    this.pushHistory('plus5');
    this.state = this.replayUndone('plus5') ?? refillStock(this.state, ADD5_COUNT, this.rng, plus5AssistFor(this.plus5Uses)); // 회차 보조(1차 0·2차 30%·3차+ 50%).
    sfx('add5');
    this.refresh(); // 즉시 스톡 더미에 반영(바로 배치) + 부스터 비용 라벨 갱신.
    this.toast(usedItem ? `＋${ADD5_COUNT} 카드 · 아이템 사용 (남음 ${this.itemCount('plus5')})` : `＋${ADD5_COUNT} 카드  🪙 ${cost.toLocaleString()}`);
  }

  /**
   * **스톡 소진 → +5 플로팅 카드**(PO 2026-07-17) — 뽑기 더미가 비면 그 자리에 5장(약간 확대·공중 부양) + '+5' + 금액을
   *   띄운다. 탭하면 바닥으로 안착하며 **한 장이 뒤집혀 기준 카드로 이동**(=＋5 채우고 1장 도드로우). 이미 떠 있으면 갱신만.
   */
  private showEmptyStockPlus5(): void {
    if (this.emptyStockPlus5) return; // 이미 떠 있음.
    const cw = this.geom.cardW;
    const ch = this.geom.cardH;
    const cont = this.add.container(STOCK.x, STOCK.y).setDepth(90);
    const SC = 1.15; // 약간 확대.
    // 5장 뒷면을 살짝 부채/겹쳐 공중에 뜬 느낌.
    for (let i = 0; i < ADD5_COUNT; i++) {
      const card = new CardView(this, -(ADD5_COUNT - 1 - i) * 7, -i * 5, cw, ch, false);
      card.showBack();
      card.setScale(card.scaleX * SC, card.scaleY * SC);
      cont.add(card);
    }
    // '+5' 크게.
    const plus = this.add
      .text(6, -ch * 0.06, `+${ADD5_COUNT}`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: `${Math.round(ch * 0.44)}px`, color: '#ffe14d' })
      .setOrigin(0.5)
      .setStroke('#7a3b00', 9);
    cont.add(plus);
    // 하단 금액(보유 아이템 있으면 원문자).
    const owned = this.itemCount('plus5');
    const label = owned > 0 ? `${circledCount(owned)} 보유` : `🪙 ${this.plus5Price().toLocaleString()}`;
    const priceTxt = this.add
      .text(0, ch * 0.64, label, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '30px', color: '#ffd166' })
      .setOrigin(0.5)
      .setStroke('#4a2a00', 6);
    cont.add(priceTxt);
    // 공중 부양(위아래 bob) + 탭 존.
    this.tweens.add({ targets: cont, y: STOCK.y - 16, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const zone = this.add.zone(0, 0, cw * SC + 40, ch * SC + 40).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tapEmptyStockPlus5());
    cont.add(zone);
    this.emptyStockPlus5 = cont;
  }

  private hideEmptyStockPlus5(): void {
    if (!this.emptyStockPlus5) return;
    this.tweens.killTweensOf(this.emptyStockPlus5);
    this.emptyStockPlus5.destroy();
    this.emptyStockPlus5 = undefined;
  }

  /** 플로팅 +5 탭 — ＋5 결제 후 **안착 + 1장 뒤집혀 기준카드로 이동**(도드로우) 연출. */
  private tapEmptyStockPlus5(): void {
    if (this.busy || this.ended || this.flyingCards > 0) return;
    if (refillableCount(this.state) === 0) {
      this.toast('되돌릴 카드가 없어요');
      return;
    }
    const cost = this.plus5Price();
    const usedItem = this.consumeItem('plus5');
    if (!usedItem && !this.spend(cost, this.boosterAnchor('wild'))) return;
    this.plus5Uses += 1;
    this.pushHistory('plus5draw');
    const replayed = this.replayUndone('plus5draw'); // 되돌렸던 ＋5＋도드로우면 같은 결과를 재현.
    if (replayed) {
      this.state = replayed;
    } else {
      this.state = refillStock(this.state, ADD5_COUNT, this.rng, plus5AssistFor(this.plus5Uses)); // ＋5 채움(회차 보조).
      this.state = drawStock(this.state, this.rng); // 그 중 1장을 기준(웨이스트)으로 도드로우.
      this.drawsUsed += 1;
    }
    // 뽑기 계열이므로 **공개 전까지 기준 카드 뷰를 뒷면으로 둔다**(상태상의 기준은 이미 새 카드 — S1).
    let flyGhost: CardView | undefined; // 아래 연출에서 만들어지는 고스트 — 워치독이 치울 수 있게 잡아 둔다.
    const flId = this.beginFlight(() => flyGhost?.destroy(), 'plus5');
    const dfId = this.beginDrawFlight();
    sfx('add5');
    const drawn = wasteTop(this.state);
    // **와일드 상태 전환**(PO 2026-07-28 버그수정) — 이 경로는 도드로우로 **기준 카드가 바뀌는데도**
    //   onStockTap 이 하던 전환이 빠져 있었다. 그래서 ① 뽑힌 카드가 와일드면 아트만 뜨고 `wildActive` 가
    //   꺼져 있어 **작동하지 않았고**, ② 부스터 와일드가 켜져 있었으면 기준이 바뀌었는데도 해제되지 않아
    //   **엉뚱한 새 기준 카드에 와일드가 붙어 보였다**. onStockTap 과 완전히 같은 규칙으로 맞춘다.
    if (drawn?.wild === true) {
      this.wildActive = true;
      sfx('wild_activate');
    } else {
      this.cancelWild();
    }
    const cont = this.emptyStockPlus5;
    this.emptyStockPlus5 = undefined; // hide 대상에서 분리(안착 연출로 소멸).
    this.toast(usedItem ? `＋${ADD5_COUNT} 카드 · 아이템 (남음 ${this.itemCount('plus5')})` : `＋${ADD5_COUNT} 카드  🪙 ${cost.toLocaleString()}`);
    if (!cont) {
      this.endFlight(flId); // 연출 없이 즉시 반영(sync 가 기준 카드 갱신).
      this.endDrawFlight(dfId);
      this.refresh();
      return;
    }
    this.tweens.killTweensOf(cont);
    // ① 바닥(스톡)으로 안착(부양 해제 + 축소).
    this.tweens.add({
      targets: cont,
      y: STOCK.y,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => {
        cont.destroy();
        this.buildStockPile(); // 채워진 스톡 더미 표시.
        // ② 한 장이 뒤집히며 기준 카드로 이동.
        const fly = new CardView(this, STOCK.x, STOCK.y, this.geom.cardW, this.geom.cardH, false);
        flyGhost = fly;
        fly.setDepth(1000);
        fly.showBack();
        const baseSX = fly.scaleX;
        let swapped = false;
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 360,
          ease: 'Cubic.easeOut',
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            fly.x = STOCK.x + (WASTE.x - STOCK.x) * t;
            fly.y = STOCK.y + (WASTE.y - STOCK.y) * t;
            if (!swapped && t >= 0.5) {
              swapped = true;
              fly.showFace(drawn);
            }
            fly.scaleX = baseSX * Math.abs(Math.cos(t * Math.PI)); // 옆으로 뒤집기.
          },
          onComplete: () => {
            // **고스트 파기**(S1) — 2026-07-26 에는 여기서 파괴하면 그 아래 **낡은 기준 카드 뷰**가 드러나는
            //   문제가 있어 승격으로 막았지만, 이제 `wasteView` 는 상태가 바뀐 순간 이미 새 top 을 그린 채
            //   숨어 있다. 파괴하면 그 카드가 그대로 드러난다(같은 그림 → 끊김 없음).
            this.endFlight(flId); // 고스트 파기 포함(정리 콜백).
            this.endDrawFlight(dfId);
            this.refresh(); // 기준 카드 뷰 표시 + 하이라이트·스톡 갱신.
          },
        });
      },
    });
  }

  /** 보드 뷰를 현재 상태로 재구성(되돌리기 후 제거됐던 카드 복원). */
  private rebuildBoard(): void {
    this.stockRevealMax = 999; // 순차 노출 중 undo 시 스톡 전량 표시로 복구.
    for (const v of this.cards.values()) v.destroy();
    this.cards.clear();
    this.buildBoard();
    // 기준(웨이스트) 카드는 여기서 손대지 않는다 — `refresh()` 끝의 `syncWasteView` 가 유일한 갱신 지점(S1).
    //   (와일드 아트 복원도 거기서 함께 처리된다.)
    this.refresh();
  }

  /**
   * @param important 코인 부족처럼 **반드시 보여야 하는** 메시지. 레벨 억제를 무시한다.
   */
  /** 안내 카드 글꼴 — 게임 공통 스택. */
  /** 흰 바탕을 그리는 기준 단위(로컬 좌표) — 실제 크기는 아트에 맞춰 스케일로 맞춘다. */
  /** 층 아트가 준비된 개수(up_Slitare_BG_01..10 · up_Solirare_Chr_01..10). 넘으면 순환한다. */
  private static readonly FLOOR_ART_COUNT = 10;
  /**
   * 보드에 꽂는 물건(다이아·별·＋카드)은 **자기 카드 바로 뒤**에 둔다(PO 2026-08-24: "다이아가 카드
   * 뒤에 배치되어야 합니다").
   *
   * 예전 값(−0.3)은 **다른 카드보다도 뒤로** 밀려, 열이 촘촘한 이 보드에서는 옆 카드가 통째로 덮어
   * 아무 것도 안 보였다. 아주 살짝만(−0.01) 뒤로 두면 **자기 카드에는 가리고 그보다 먼저 그려진
   * 카드들 위로는 드러난다** — "카드 뒤에 꽂혀 있다"와 "보인다"를 둘 다 만족한다.
   * 어느 카드에 꽂을지는 `pickVisibleSlot` 이 **가려지는 정도까지 재서** 고른다.
   */
  private static readonly BADGE_BEHIND = 0.01;
  /** 하단 라벨(부스터 비용·뽑기·기준 카드) 공통 글자 크기 — 예전엔 24·26·28 이 섞여 있었다. */
  /** 손님 정산 지점에서 **머리 위**까지의 거리 — 위클리 상품이 여기서 떠오른다. */
  private static readonly CUSTOMER_HEAD_DY = 130;
  /** 등장 일렁임 대상의 깊이 상한 — 이보다 위는 상단 HUD(헤더·레일·배너)라 흔들지 않는다. */
  private static readonly WINDOW_MAX_DEPTH = 1300;
  /** 하단 라벨(부스터 비용·뽑기·기준 카드) 공통 글자 크기 — 예전엔 24·26·28 이 섞여 있었다. */
  private static readonly BOTTOM_LABEL_SIZE = 30;
  /** 부스터 아이콘 하단에서 라벨까지의 간격. */
  private static readonly BOTTOM_LABEL_GAP = 6;
  private static readonly CARD_BACK_UNIT = 200;
  /**
   * 아트 대비 바탕 배율 — 외곽 여백은 8% → **5%**(PO 2026-08-24: "약간만 더 줄이세요").
   * 카드 아트 자체도 보드 카드 높이의 88% 로 낮춰 카드를 덜 가리게 했다.
   */
  private static readonly CARD_BACK_PAD = 1.05;
  private static readonly TIP_FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';

  /**
   * **상황별 튜토리얼 안내**(logic/tutorial.ts) — 그 요소를 **처음 만나는 순간** 한 번만 설명한다.
   *   기능을 잠그지 않는다(PO 2026-08-22: "배치는 하되 사용법을 순차적으로 안내"). 화면에 실제로
   *   나타난 것만 설명하므로 순서는 플레이가 정한다. 본 안내는 세이브에 남겨 다시 뜨지 않는다.
   */
  /** 특정 위치를 가리키며(꼬리가 그쪽을 향하게) 안내한다 — 아이콘 키를 주면 창 안에도 그 아이콘을 띄운다. */
  private tryTipAt(key: TipKey, at: { x: number; y: number }, iconKey?: string): void {
    if (this.ended || this.tipOpen || this.tipsSeen.includes(key)) return;
    this.tipsSeen = [...this.tipsSeen, key];
    markTipSeen(key);
    const tip = TIPS[key];
    this.showTipCard(tip.title, tip.subtitle, tip.body, [{ x: at.x, y: at.y }], false, iconKey);
  }

  private tryTip(...keys: TipKey[]): void {
    if (this.ended || this.tipOpen) return;
    // **상황성 안내**(그 순간에만 볼 수 있는 것)는 "한 판에 하나" 제한을 받지 않는다 —
    //   다이아·미션·컬렉션은 놓치면 그 판에서 다시 볼 기회가 없다(PO 2026-08-22 "다이아도 최초 발생 시 안내").
    const situational: TipKey[] = ['diamond', 'mission', 'collection', 'customerStar', 'emptyStock', 'wildUse'];
    const budgeted = keys.some((k) => !situational.includes(k)) && this.tipShownThisRound;
    const key = pickTip(this.tipsSeen, keys, budgeted);
    if (!key) return;
    if (!situational.includes(key)) this.tipShownThisRound = true;
    this.tipsSeen = [...this.tipsSeen, key];
    markTipSeen(key);
    const tip = TIPS[key];
    // **즉시 표시** — 예전엔 딜 연출 뒤로 미루려고 time.delayedCall 을 썼는데, 씬 생성 직후에 건 타이머가
    //   환경에 따라 발화하지 않아 안내가 통째로 사라졌다(실측). 안내는 진행을 막지 않는 가벼운 카드이므로
    //   지연 없이 바로 띄운다.
    //   기본 규칙 안내에는 **기준 카드**를 손가락으로 함께 가리킨다(PO 2026-08-22) — 말로만 하면
    //   "기준 카드"가 무엇인지 초보는 못 찾는다.
    const points = key === 'match' ? [{ x: WASTE.x, y: WASTE.y, label: '기준 카드' }] : [];
    this.showTipCard(tip.title, tip.subtitle, tip.body, points, key === 'match');
  }

  /**
   * 아직 안 본 안내면 **정지 안내**를 띄우고 true 를 돌려준다(호출부는 그 동작을 미룬다).
   *   이미 봤거나 안내 중이면 false — 평소처럼 바로 진행한다.
   */
  private coachIfNew(key: TipKey, slotId: string | undefined, onDone: () => void): boolean {
    if (this.coachHold || this.tipsSeen.includes(key)) return false;
    // ⚠️ 특수 카드 안내는 **"한 판에 하나" 예산을 쓰지 않는다** — 이걸 쓰게 했더니 와일드/보너스가 뜬 판에서는
    //   뽑기·미션·손님별 안내가 영영 차례를 못 잡았다(실측: 6레벨을 돌려도 3종만 노출).
    this.tipsSeen = [...this.tipsSeen, key];
    markTipSeen(key);
    const tip = TIPS[key];
    this.showCoachAt(slotId, tip.title, tip.subtitle, tip.body, onDone);
    return true;
  }

  /**
   * **초반 반복 화살표** — "지금 낼 수 있는 카드"를 가리킨다. 한 번 보고 마는 게 아니라
   *   초반 몇 수 동안 반복해 규칙이 손에 익게 한다(PO 2026-08-22 "여러 번 안내").
   */
  private updateMoveHint(): void {
    this.stockArrowActive = false;
    if (this.coachHold || this.ended || this.dealing || this.arrowHintsLeft <= 0) { this.hideArrow(); return; }
    const moves = availableMoves(this.state).filter((id) => this.isTappable(id));
    if (moves.length) {
      const view = this.cards.get(moves[0]);
      if (!view) { this.hideArrow(); return; }
      this.showArrowAt(view.x, view.y, '이 카드를 탭하세요');
      return;
    }
    /*
     * **낼 수 있는 카드가 없으면 뽑기를 가리킨다**(PO 2026-08-22) — 초보는 여기서 손이 멈춘다.
     *   단 **딱 한 번만**(PO 2026-08-24: "뽑기 안내를 반복 표시하지 말 것") — 한 번 뽑아 본 순간
     *   `onStockTap` 이 'drawArrow' 를 영구 기록하고, 그 뒤로는 다시 가리키지 않는다.
     *   ("이 카드를 탭하세요"의 초반 반복과는 별개 예산이다.)
     */
    if (this.state.stock.length > 0 && !this.tipsSeen.includes('drawArrow')) {
      this.showArrowAt(STOCK.x, STOCK.y, '뽑기를 눌러 새 카드를 꺼내세요');
      this.stockArrowActive = true;
      return;
    }
    this.hideArrow();
  }

  /**
   * **안내 말풍선** — 지정 아트(up_Solitare_UI_27)를 쓰고, 없으면 흰 사각형으로 폴백한다.
   *   아트는 **아래쪽에 꼬리**가 있어 대상 위에 놓으면 자연스럽게 그 카드를 가리킨다.
   * @param cx 가로 중심 · @param bottomY 패널 **아래끝**(꼬리 끝)이 놓일 y
   * @returns 텍스트를 얹을 안쪽 영역(제목/본문 y 기준)
   */
  private makeTipPanel(
    layer: Phaser.GameObjects.Container,
    cx: number,
    bottomY: number,
    opts: { widthRatio?: number; example?: boolean } = {},
  ): { titleY: number; subtitleY: number; exampleY: number; bodyY: number; footY: number; width: number } {
    const pw = W * (opts.widthRatio ?? 0.74);
    const ph = pw * TUTORIAL_PANEL_RATIO;
    const top = bottomY - ph;
    const cy = top + ph / 2;
    if (this.textures.exists(TUTORIAL_PANEL_KEY)) {
      layer.add(this.add.image(cx, cy, TUTORIAL_PANEL_KEY).setDisplaySize(pw, ph));
    } else {
      layer.add(this.add.rectangle(cx, cy, pw * 0.92, ph * 0.78, 0xfff2df, 0.98).setStrokeStyle(6, 0x2da9f5));
    }
    // 아트 해부: 파란 **제목 탭**이 세로 5~17%, 크림 안쪽이 13~86%, 아래 꼬리가 86~100%.
    //   제목은 탭 안에, 나머지는 크림 영역에 배치한다. 예시 그림이 없으면 본문을 위로 올려 여백을 줄인다.
    //   **부제**(한 줄 요약)는 크림 영역 맨 위, 본문은 그 아래(PO 2026-08-23 "제목은 짧게 · 아래 부제 · 그 아래 내용").
    return opts.example
      ? { titleY: top + ph * 0.115, subtitleY: top + ph * 0.245, exampleY: top + ph * 0.44, bodyY: top + ph * 0.66, footY: top + ph * 0.79, width: pw * 0.74 }
      : { titleY: top + ph * 0.115, subtitleY: top + ph * 0.265, exampleY: top + ph * 0.44, bodyY: top + ph * 0.50, footY: top + ph * 0.73, width: pw * 0.74 };
  }

  /**
   * 튜토리얼 포인터 — 업로드 아이콘(up_Solitare_UI_26)을 쓰고, 없으면 이모지로 폴백한다.
   *   ⚠️ 원본이 1254×1254 로 커서 **반드시 표시 크기를 지정**한다(PO 2026-08-22 "사이즈를 줄여서 적용").
   */
  private makePointer(x: number, y: number, scale = 0.63): Phaser.GameObjects.GameObject & { y: number } {
    const size = Math.round(this.geom.cardH * scale);
    if (this.textures.exists(TUTORIAL_POINTER_KEY)) {
      return this.add.image(x, y, TUTORIAL_POINTER_KEY).setDisplaySize(size, size).setOrigin(0.5, 0);
    }
    return this.add.text(x, y, '👆', { fontSize: `${size}px` }).setOrigin(0.5, 0);
  }

  /**
   * **가리키기 화살표** — 대상 카드 아래에서 위를 향해 까딱인다(튜토리얼용).
   *   좌표는 저작 좌표계(카드 뷰의 x/y)를 그대로 쓴다.
   */
  private showArrowAt(x: number, y: number, label?: string, depth = 1900): void {
    this.hideArrow();
    const box = this.add.container(0, 0).setDepth(depth);
    const hand = this.makePointer(x, y + this.geom.cardH * 0.3);
    box.add(hand);
    if (label) {
      const t = this.add
        .text(x, y + this.geom.cardH * 1.06, label, {
          fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.label}px`, color: '#ffffff',
          backgroundColor: '#00000099', padding: { x: 16, y: 8 },
        })
        .setOrigin(0.5, 0);
      box.add(t);
    }
    // 위아래로 까딱 — 멈춰 있으면 눈에 안 들어온다.
    this.tweens.add({ targets: hand, y: hand.y - 22, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.coachArrow = box;
  }

  private hideArrow(): void {
    if (!this.coachArrow) return;
    this.tweens.killTweensOf(this.coachArrow.list);
    this.coachArrow.destroy();
    this.coachArrow = undefined;
  }

  /**
   * **정지 안내** — 화면을 덮고(입력 차단) 대상 카드를 밝게 띄운 뒤 화살표+설명을 보여 준다.
   *   탭해야 넘어간다(빠르게 지나가지 않게). 닫히면 `onDone` 이 불린다 — 특수 카드 소비는 그때 진행된다.
   */
  private showCoachAt(slotId: string | undefined, title: string, subtitle: string, body: string, onDone: () => void): void {
    const view = slotId ? this.cards.get(slotId) : undefined;
    this.coachHold = true;
    const layer = overlayLayer(this, 2000).setName('coach');
    const dim = overlayScrim(this, 0x000000, 0.62);
    layer.add(dim);
    // 대상 카드를 딤 위로 복제해 **그 카드만 밝게** 보이도록(원본은 딤 아래에 그대로 둔다).
    if (view) {
      const spot = this.add.image(view.x, view.y, view.texture.key).setDisplaySize(view.displayWidth, view.displayHeight);
      layer.add(spot);
      this.tweens.add({ targets: spot, scaleX: spot.scaleX * 1.08, scaleY: spot.scaleY * 1.08, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      for (const o of this.pointerAt(view.x, view.y)) layer.add(o);
    }
    // **말풍선 꼬리가 설명 대상을 가리키게**(PO 2026-08-22) — 중앙 고정이 아니라 대상 **바로 위**에 놓는다.
    //   아트의 꼬리는 아래쪽 가운데에 있으므로, 패널의 x 를 대상 x 에 맞추고 아래끝을 카드 살짝 위에 둔다.
    //   화면 밖으로 나가지 않게 좌우는 클램프한다(꼬리가 조금 어긋나도 대상은 하이라이트로 구분된다).
    const pwRatio = 0.66;
    const pw = W * pwRatio;
    const ph = pw * TUTORIAL_PANEL_RATIO;
    const cx = view ? Phaser.Math.Clamp(view.x, pw / 2 + 24, W - pw / 2 - 24) : W / 2;
    const bottomY = Math.max(ph + 40, (view ? view.y : H * 0.62) - this.geom.cardH * 0.55);
    const box = this.makeTipPanel(layer, cx, bottomY, { widthRatio: pwRatio });
    const t1 = this.add
      .text(cx, box.titleY, title, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.title}px`, color: '#ffffff', fontStyle: 'bold',
        stroke: '#0f6fb0', strokeThickness: 6,
      })
      .setOrigin(0.5);
    // **부제** — 제목은 탭에 들어갈 만큼 짧으므로, 무엇에 대한 안내인지는 이 한 줄이 말해 준다.
    const tSub = this.add
      .text(cx, box.subtitleY, subtitle, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.label}px`, color: '#c25e00', fontStyle: 'bold',
        align: 'center', wordWrap: { width: box.width },
      })
      .setOrigin(0.5);
    const t2 = this.add
      .text(cx, box.bodyY, body, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.body}px`, color: '#6b4a2a', align: 'center', wordWrap: { width: box.width },
      })
      .setOrigin(0.5);
    const t3 = this.add
      .text(cx, box.footY, '탭해서 계속', { fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.foot}px`, color: '#a98763' })
      .setOrigin(0.5);
    layer.add([t1, tSub, t2, t3]);
    dim.once('pointerdown', () => {
      this.tweens.killTweensOf(layer.list);
      layer.destroy();
      this.coachHold = false;
      onDone();
      this.refresh();
    });
    sfx('button');
  }

  /**
   * 안내 카드 — 말풍선 패널(UI_27) + **가리킬 대상**(손가락 아이콘). 아무 곳이나 탭하면 닫힌다.
   *   `points` 를 주면 그 위치를 손가락으로 가리키고, 패널은 첫 대상 **위**에 놓여 꼬리가 그 카드를 향한다.
   */
  private showTipCard(
    title: string,
    subtitle: string,
    body: string,
    points: ReadonlyArray<{ x: number; y: number; label?: string }> = [],
    example = false,
    iconKey?: string,
  ): void {
    this.tipOpen = true;
    const layer = overlayLayer(this, 2000).setName('tipCard');
    const dim = overlayScrim(this, 0x000000, 0.55);
    layer.add(dim);
    const target = points[0];
    // 패널은 대상 **바로 위**에 — 아트 아래쪽 꼬리가 그 카드를 가리킨다(대상이 없으면 화면 중앙).
    const pwRatio = example || iconKey ? 0.74 : 0.66;
    const pw = W * pwRatio;
    const ph = pw * TUTORIAL_PANEL_RATIO;
    const cx = target ? Phaser.Math.Clamp(target.x, pw / 2 + 24, W - pw / 2 - 24) : W / 2;
    const bottomY = target ? Math.max(ph + 40, target.y - this.geom.cardH * 0.6) : H * 0.72;
    const box = this.makeTipPanel(layer, cx, bottomY, { widthRatio: pwRatio, example: example || !!iconKey });
    const t1 = this.add
      .text(cx, box.titleY, title, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.title}px`, color: '#ffffff', fontStyle: 'bold',
        stroke: '#0f6fb0', strokeThickness: 6,
      })
      .setOrigin(0.5);
    // **부제** — 제목은 탭에 들어갈 만큼 짧으므로, 무엇에 대한 안내인지는 이 한 줄이 말해 준다.
    const tSub = this.add
      .text(cx, box.subtitleY, subtitle, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.label}px`, color: '#c25e00', fontStyle: 'bold',
        align: 'center', wordWrap: { width: box.width },
      })
      .setOrigin(0.5);
    const t2 = this.add
      .text(cx, box.bodyY, body, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.body}px`, color: '#6b4a2a', align: 'center', wordWrap: { width: box.width },
      })
      .setOrigin(0.5);
    const t3 = this.add
      .text(cx, box.footY, '탭해서 계속', { fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.foot}px`, color: '#a98763' })
      .setOrigin(0.5);
    layer.add([t1, tSub, t2, t3]);
    if (example) this.buildMatchExample(layer, cx, box.exampleY);
    // 아이콘 안내(다이아 등) — 창 안에 그 아이템을 크게 띄워 무엇을 말하는지 바로 보이게.
    if (iconKey && this.textures.exists(iconKey)) {
      const size = Math.round(this.geom.cardH * 0.7);
      layer.add(this.add.image(cx, box.exampleY, iconKey).setDisplaySize(size, size));
    }
    for (const pt of points) for (const o of this.pointerAt(pt.x, pt.y, pt.label)) layer.add(o);
    dim.once('pointerdown', () => {
      this.tweens.killTweensOf(layer.list);
      layer.destroy();
      this.tipOpen = false;
      this.updateMoveHint(); // 안내를 닫으면 곧바로 "이 카드를 탭하세요" 화살표로 이어 준다.
    });
    sfx('button');
  }

  /**
   * **매칭 규칙 예시 그림** — 가운데 기준 카드, 좌우에 −1 / +1 카드. "무늬는 달라도 된다"를 그림으로 보인다.
   *   (말로만 설명하면 초보는 무늬까지 맞춰야 하는 줄 안다 — PO 2026-08-22)
   */
  private buildMatchExample(layer: Phaser.GameObjects.Container, cx: number, cy: number): void {
    const cw = W * 0.125; // 카드가 크면 팝업을 잡아먹는다 — 예시는 작게.
    const ch = cw * (164 / 120);
    const gap = cw * 1.55;
    // **지금 화면의 기준 카드**를 그대로 예시로 쓴다(PO 2026-08-22) — 임의의 7♠ 를 보여 주면
    //   플레이어가 화면과 대조하지 못한다. 좌우는 그 랭크의 −1 / +1 (A↔K 순환 포함).
    const top = this.state ? wasteTop(this.state) : undefined;
    const baseRank = (top?.rank ?? 7) as Rank;
    const wrap = (r: number): Rank => (((r - 1 + 13) % 13) + 1) as Rank;
    const mid: Card = { id: 'ex-mid', suit: top?.suit ?? 'S', rank: baseRank };
    const low: Card = { id: 'ex-low', suit: 'H', rank: wrap(baseRank - 1) };
    const high: Card = { id: 'ex-high', suit: 'D', rank: wrap(baseRank + 1) };
    const mk = (x: number, card: Card, highlight = false): void => {
      const v = new CardView(this, x, cy, cw, ch, false);
      v.showFace(card, highlight);
      layer.add(v);
    };
    // 가운데 **기준 카드**는 골드 테두리로 강조(실제 기준 카드와 같은 표시).
    layer.add(this.add.rectangle(cx, cy, cw * 1.36, ch * 1.2, 0xffd166, 0.32).setStrokeStyle(5, 0xffb703));
    mk(cx - gap, low);
    mk(cx, mid, true);
    mk(cx + gap, high);
    // 라벨: 위쪽 한 줄만(겹침 방지). 기준은 조금 더 크게.
    const tag = (x: number, text: string, color: string, size = TIP_FONT_SIZE.tag): void => {
      layer.add(
        this.add
          .text(x, cy - ch * 0.82, text, { fontFamily: PlayScene.TIP_FONT, fontSize: `${size}px`, color, fontStyle: 'bold' })
          .setOrigin(0.5),
      );
    };
    tag(cx - gap, '−1', '#2e9e4f');
    tag(cx, '기준 카드', '#c25e00');
    tag(cx + gap, '+1', '#2e9e4f');
    // 기준에서 **바깥으로** 향하는 화살표 — 양쪽 다 낼 수 있다는 뜻.
    for (const dir of [-1, 1]) {
      layer.add(
        this.add
          .text(cx + dir * gap * 0.52, cy, dir < 0 ? '◀' : '▶', { fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.caption}px`, color: '#2e9e4f' })
          .setOrigin(0.5),
      );
    }
  }

  /**
   * **일반 메시지 팝업**(PO 2026-08-22 "다양한 메시지 출력을 위한 팝업창은 이 창을 쓸 것).
   *   짧은 알림 한 줄용 가로 리본(UI_28). 탭하면 닫히고 `onClose` 가 불린다(예: 상점 열기).
   */
  private showMessage(text: string, onClose?: () => void, at?: { x: number; y: number }): void {
    const layer = overlayLayer(this, 2100).setName('message');
    const dim = overlayScrim(this, 0x000000, 0.5);
    layer.add(dim);
    // **글자 분량에 맞춰 창을 키운다**(PO 2026-08-22) — 먼저 문구를 만들어 크기를 재고 창을 잡는다.
    const body = this.add
      .text(0, 0, text, {
        fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.body}px`, color: '#4a2f14',
        align: 'center', wordWrap: { width: W * 0.66 },
      })
      .setOrigin(0.5);
    // 창의 **안쪽 영역**을 기준으로 키운다 — 글자는 아래 `body.setPosition` 에서 안쪽 한가운데로.
    const fit = fitMessagePanel(GREEN_PANEL, body.width, body.height, { minW: W * 0.8, maxW: W * 0.94, padX: 60, padY: 52 });
    const pw = fit.pw;
    const ph = fit.ph;
    // **꼬리가 사건이 일어난 자리를 가리키게**(PO 2026-08-22) — 이 창도 아래에 꼬리가 있다.
    //   대상 바로 위에 놓고, 화면 밖으로 나가지 않게 좌우·상하를 클램프한다.
    const cx = at ? Phaser.Math.Clamp(at.x, pw / 2 + 16, W - pw / 2 - 16) : W / 2;
    const cy = at ? Phaser.Math.Clamp(at.y - ph * 0.85, ph * 0.6 + 40, H - ph * 0.6 - 40) : H * 0.46;
    if (this.textures.exists(MESSAGE_PANEL_KEY)) {
      layer.add(this.add.image(cx, cy, MESSAGE_PANEL_KEY).setDisplaySize(pw, ph));
    } else {
      layer.add(this.add.rectangle(cx, cy, pw * 0.9, ph * 0.8, 0xfff2df, 0.98).setStrokeStyle(6, 0x2da9f5));
    }
    body.setPosition(cx, cy + fit.textY); // **안쪽 여백의 한가운데**(PO 2026-08-23).
    layer.add(body);
    if (at) for (const o of this.pointerAt(at.x, at.y)) layer.add(o);
    dim.once('pointerdown', () => {
      this.tweens.killTweensOf(layer.list);
      layer.destroy();
      onClose?.();
    });
    sfx('button');
  }

  /** 한 지점을 가리키는 손가락(+선택 라벨) — 위아래로 까딱인다. 만들어진 오브젝트를 돌려준다. */
  private pointerAt(x: number, y: number, label?: string): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    const hand = this.makePointer(x, y + this.geom.cardH * 0.28);
    this.tweens.add({ targets: hand, y: hand.y - 20, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    out.push(hand);
    if (label) {
      out.push(
        this.add
          .text(x, y + this.geom.cardH * 0.95, label, {
            fontFamily: PlayScene.TIP_FONT, fontSize: `${TIP_FONT_SIZE.label}px`, color: '#ffffff',
            backgroundColor: '#000000aa', padding: { x: 16, y: 8 },
          })
          .setOrigin(0.5, 0),
      );
    }
    return out;
  }

  private toast(msg: string, important = false): void {
    // **안내(튜토리얼성) 메시지는 20레벨까지만**(PO 2026-07-18) — 이후엔 숙련 유저라 화면 정리.
    //   ⚠️ 코인 부족 같은 **결과 통보**까지 막으면 안 된다(PO 2026-08-21).
    if (!important && this.level > 20) return;
    // **팝업창은 처음 1~2회만**(PO 2026-08-22) — 그 뒤에도 정보는 필요하므로 **창 없이 예전의 간단한
    //   글자 표시**로 낮춘다(안 띄우는 게 아니라 격을 낮춘다).
    const withPanel = shouldShowMessage(this.msgCounts, msg);
    if (withPanel) saveMessageCounts(this.msgCounts); // 판·세션이 바뀌어도 횟수가 유지되도록 즉시 기록.
    // **뽑기/기준 카드 바로 위**에 표시(화면 중앙 아님).
    const ty = STOCK.y - this.geom.cardH * 0.5 - 66;
    // **노란 창 = 숫자 등 짧은 표시 · 초록 창 = 문장**(PO 2026-08-22). 판정은 logic/messageStyle.ts.
    const panelKey = withPanel ? (isShortMessage(msg) ? SMALL_MSG_PANEL_KEY : MESSAGE_PANEL_KEY) : '';
    const box = this.add.container(W / 2, ty).setDepth(1600);
    const t = this.add
      .text(0, 0, msg, {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '36px',
        color: this.textures.exists(panelKey) ? '#4a2f14' : '#ffffff',
        align: 'center',
        wordWrap: { width: W * 0.7 },
        ...(this.textures.exists(panelKey) ? {} : { backgroundColor: '#2a1830dd', padding: { x: 28, y: 14 } }),
      })
      .setOrigin(0.5);
    if (this.textures.exists(panelKey)) {
      // **창의 안쪽 영역** 기준으로 키우고 글자를 그 한가운데 앉힌다(ui/messagePanel.ts 실측).
      const fit = fitMessagePanel(isShortMessage(msg) ? YELLOW_PANEL : GREEN_PANEL, t.width, t.height, {
        minW: W * 0.42,
        maxW: W * 0.9,
        padX: 52,
        padY: 40,
      });
      t.setY(fit.textY);
      box.add(this.add.image(0, 0, panelKey).setDisplaySize(fit.pw, fit.ph));
    }
    box.add(t);
    // **최소 1.5초는 그대로 보여 준다**(PO 2026-08-22 "너무 빠르게 사라지면 확인이 어렵다").
    this.tweens.add({
      targets: box,
      alpha: 0,
      y: ty - 40,
      duration: 700,
      delay: withPanel ? TOAST_HOLD_MS : Math.round(TOAST_HOLD_MS * 0.55), // 창 없는 반복 표시는 짧게.
      onComplete: () => box.destroy(),
    });
  }

  // ── 상호작용 ────────────────────────────────────────────────────────
  private onCardTap(slotId: string): void {
    if (this.ended || this.dealing) return;
    if (this.coachHold) return; // 안내 중에는 입력을 받지 않는다(화면 정지).
    if (this.arrowHintsLeft > 0) { this.arrowHintsLeft -= 1; this.hideArrow(); } // ⚠️ busy 로 막지 않는다 — 카드가 날아가는 도중에도 다음 카드를 선택할 수 있게(동시 플레이).
    const view = this.cards.get(slotId);
    if (!view) return;
    const wild = this.wildActive;
    // **S2 방어선** — 화면이 상태를 정확히 그리고 있지 않으면 판정하지 않는다. 입력이 이미 잠겨 있어야 하므로
    //   여기 걸리는 건 곧 버그 → 조용히 무시하되 기록에 남긴다(거부 피드백도 주지 않는다: 플레이어 잘못이 아님).
    if (!this.isTappable(slotId)) {
      this.logInvariant('tap-on-unsynced-view', slotId);
      return;
    }
    // 와일드면 노출만 확인(±1 무시), 아니면 ±1 매칭 필요. **여기서의 거부는 규칙(±1 불일치)뿐**이다.
    if (wild ? !isExposed(this.state, slotId) : !isPlayable(this.state, slotId)) {
      sfx('card_invalid');
      this.denyFeedback(view);
      return;
    }
    this.pushHistory();
    const card = this.state.board[slotId];
    // 이 수로 **새로** 열리는 슬롯을 정확히 알아내기 위해 직전 노출 집합을 기억한다(공개 보류 대상).
    const exposedBefore = new Set(this.state.layout.slots.filter((sl) => isExposed(this.state, sl.id)).map((sl) => sl.id));
    this.state = wild ? playWild(this.state, slotId) : playCard(this.state, slotId);
    if (wild) sfx('wild_use');
    else sfxCardPlace(this.state.combo); // 방금 놓은 카드까지 포함된 콤보 길이 → 진동 굵기.
    if (wild) {
      this.wildActive = false;
      this.wildMarker?.destroy();
      this.wildMarker = undefined;
    }
    this.cards.delete(slotId);
    view.disableInteractive();
    view.showFace(card);
    view.setDepth(1000);
    // **수집 상품** — 예전엔 3콤보마다 자동으로 떨어졌다(개수가 콤보 운에 좌우됐다).
    //   지금은 딜 때 카드 뒤에 심어 두고(placeCollectItems) **그 카드를 낼 때** 수집한다 — 아래 참조.
    this.collectRun += 1;
    // **컬렉션 카드 수집**(PO 2026-07-27) — 꽂혀 있던 보드 카드를 **낼 때** 수집된다. 예전엔 그 카드가
    //   노출되기만 해도 자동 수집됐는데, PO 지시대로 "오픈된 상태가 아닌 클릭된 상태 = 다른 카드와 동일한
    //   취급"으로 바꿨다(바로 위 다이아 수집과 완전히 같은 모델).
    const bcHere = this.boardCollections.get(slotId);
    if (bcHere && !bcHere.opened) {
      // 획득 연출(뱃지 비행)이 아직 도착 전이면 도착 시점에 수집한다 — 그 전에 트리거하면 비행 중인
      //   연출이 이미 파괴된 뱃지를 참조하게 된다.
      if (bcHere.armed) this.triggerCollectionOpen(bcHere);
      else bcHere.played = true;
    }
    // **투데이 리그 별 회수** — 이 카드에 별이 꽂혀 있었으면 그 개수만큼 리그로 날려 보낸다.
    // **＋카드 회수** — 꽂혀 있던 뽑기 보충분이 이 카드를 내는 순간 더미로 들어간다.
    const stockHere = this.stockSlots.get(slotId);
    if (stockHere) {
      this.stockSlots.delete(slotId);
      const pv = this.stockViews.get(slotId);
      this.stockViews.delete(slotId);
      this.collectStockCards(stockHere, pv);
    }
    const starsHere = this.starSlots.get(slotId);
    if (starsHere) {
      this.starSlots.delete(slotId);
      const sv = this.starViews.get(slotId);
      this.starViews.delete(slotId);
      // 원본 뷰를 그대로 넘긴다 — 연출이 그걸 **확대했다가 흩뜨린다**(새로 만들면 자리가 튄다).
      this.holdLeagueStars(starsHere, { x: view.x, y: view.y }, sv);
    }
    // **다이아 수집** — 이 카드에 다이아가 끼워져 있었으면 크게 팝업 후 상단으로 회수.
    if (this.diamondSlots.has(slotId)) {
      this.diamondSlots.delete(slotId);
      const gem = this.diamondViews.get(slotId);
      this.diamondViews.delete(slotId);
      if (gem) this.collectDiamond(gem);
      // 다이아도 **위클리 수집 대상**(PO 2026-08-24) — 판에서 모은 아이템이면 무엇이든 센다.
      /*
       * **다이아는 보드에서 회수되는 순간** 위클리에 기록된다(PO 2026-08-24). 건설용 다이아 자체는
       *   기존대로 판이 끝날 때 헤더 다이아 저장소로 들어간다 — 두 흐름은 별개다.
       */
      this.creditEventFromPlay(1, { x: view.x, y: view.y }, 'diamond');
    }
    // (요청) 와일드로 낸 보드 카드에는 와일드 이미지를 얹지 않는다 — 선택 카드가 그대로 회수된다.
    // 상태는 이미 갱신됨 → **즉시 refresh** 로 새 기준(웨이스트 top) 하이라이트/미션 반영.
    //   단, 아래 노출 카드 공개는 **보류**(suppressReveal) — 낸 카드의 토스 회수가 끝날 때 뒤집어 공개.
    this.pushMatch(card.suit);
    // **이 수로 새로 열린 슬롯만** 공개 보류에 넣는다 — 토스가 정점에 닿을 때 뒤집는다.
    //   (기준 카드는 보류하지 않는다: 무엇을 냈는지 플레이어가 이미 알므로 즉시 반영해야 한다.)
    for (const sl of this.state.layout.slots) {
      if (!exposedBefore.has(sl.id) && isExposed(this.state, sl.id)) this.heldReveals.add(sl.id);
    }
    // **기준 카드 잠금은 여기서 건다**(PO 2026-08-22 재수정) — 눌림/팝(약 0.2초) 동안 잠금이 없으면
    //   기준 카드가 새 카드로 먼저 바뀌었다가 비행 시작에 다시 직전 카드로 되돌아가 깜빡였다.
    //   상태가 바뀌는 이 지점에서 바로 잠가야 **착지 때 한 번만** 바뀐다.
    this.matchFlights += 1;
    this.refresh();
    // **역동적 회수 연출** — ①눌림(축소) → ②팝(확대+살짝 뜸) → ③위로 크게 토스하며 1.5바퀴 회전 + 잔상 → ④웨이스트 회수.
    const startAngle = view.angle;
    const baseSX = view.scaleX;
    const baseSY = view.scaleY;
    let stage = 'init';
    const startFly = (): void => {
      stage = 'fly-start';
      // 기준 카드 잠금(matchFlights)은 이미 탭 시점에 걸려 있다 — 여기서 또 올리면 착지해도 안 풀린다.
      const sx = view.x;
      const sy = view.y;
      const flySX = view.scaleX; // 팝 직후 확대 배율 → 비행 중 기본 배율로 수렴
      const flySY = view.scaleY;
      const ctrlX = (sx + WASTE.x) / 2;
      const ctrlY = Math.min(sy, WASTE.y) - 360; // 위로 크게 토스(정점)
      const emitTrail = this.makeTrailEmitter(1000);
      let revealed = false;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 520,
        ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const u = 1 - t;
          view.x = u * u * sx + 2 * u * t * ctrlX + t * t * WASTE.x;
          view.y = u * u * sy + 2 * u * t * ctrlY + t * t * WASTE.y;
          view.setAngle(startAngle + 540 * t); // 1.5바퀴 스핀
          view.setScale(Phaser.Math.Linear(flySX, baseSX, t), Phaser.Math.Linear(flySY, baseSY, t));
          emitTrail(view);
          // **튀어오름 정점(~40%)에서 아래 노출 카드 공개** — 회수 끝까지 기다리지 않고 약간 빠르게 뒤집는다.
          if (!revealed && t >= 0.4) {
            revealed = true;
            this.heldReveals.clear(); // 공개 시작 — 보류 해제(뷰모델이 즉시 뒤집기로 바뀐다).
            this.refresh();
          }
        },
        onComplete: () => {
          this.matchFlights = Math.max(0, this.matchFlights - 1); // 착지 — 이제 기준 카드가 새 카드로 바뀐다.
          this.endFlight(flId); // 비행 종료(undo/+5 재허용) — 고스트 파기는 정리 콜백이 맡는다.
          // **고스트 파기**(S1) — 예전엔 이 뷰를 `wasteView` 로 승격시켰다. 그 탓에 착지 전까지 화면의
          //   기준 카드가 직전 카드로 남아 판정과 어긋났다. 이제 기준 카드는 탭 즉시 갱신돼 있고
          //   (`onCardTap` → refresh → syncWasteView), 이 고스트는 같은 그림 위에 내려앉아 사라진다.
          view.destroy();
          if (!revealed) {
            revealed = true;
            this.heldReveals.clear(); // 연출이 40% 콜백을 못 밟은 경우의 안전망.
          }
          // **회수(튀어오름) 완료 시점** — 이제 아래 노출 카드를 뒤집어 공개(보류 해제).
          this.refresh();
          this.checkEnd();
        },
      });
    };
    // ①눌림(양방향 축소) → ②팝(확대 + 살짝 위로 뜸, Back 오버슛) → 토스 회수.
    //   연출이 중간에 끊겨도 워치독이 잠금을 풀고 고스트를 치운다(beginFlight 참고).
    const flId = this.beginFlight(() => {
      view.destroy();
      this.heldReveals.clear(); // 회수가 끊기면 보류된 공개가 영영 안 풀린다 — 함께 되돌린다.
      this.matchFlights = 0; // 기준 표시 잠금도 함께 해제(연출이 끊겨도 굳지 않게).
    }, () => `toss stage=${stage} alive=${!!view.scene} tweens=${this.tweens.getTweensOf(view).length}`);
    this.tweens.add({
      targets: view,
      scaleX: baseSX * 0.84,
      scaleY: baseSY * 0.84,
      duration: 75,
      ease: 'Quad.easeIn',
      onComplete: () => {
        stage = 'pop';
        this.tweens.add({
          targets: view,
          scaleX: baseSX * 1.2,
          scaleY: baseSY * 1.2,
          y: view.y - 28,
          duration: 150,
          ease: 'Back.easeOut',
          onComplete: () => { stage = 'pop-done'; startFly(); },
        });
      },
    });
  }

  private onStockTap(): void {
    if (this.ended || this.dealing) return;
    if (this.coachHold) return; // 안내 중에는 입력을 받지 않는다(화면 정지).
    if (this.arrowHintsLeft > 0) { this.arrowHintsLeft -= 1; this.hideArrow(); } // busy 로 막지 않음(동시 플레이). 딜 연출 중엔 잠금.
    // 뽑기 화살표를 보고 실제로 뽑았다 → **다시는 안 보여 준다**(영구 기록, PO 2026-08-24).
    if (this.stockArrowActive) {
      this.stockArrowActive = false;
      this.tipsSeen = [...this.tipsSeen, 'drawArrow'];
      markTipSeen('drawArrow');
    }
    if (this.state.stock.length === 0) return;
    this.pushHistory('draw');
    // **동적 드로우**: 뽑는 카드의 랭크는 drawStock 이 결정하므로 뽑은 뒤 웨이스트 top 을 읽어 애니메이션.
    //   되돌리기로 취소했던 뽑기를 같은 자리에서 다시 하는 거면 **그때 나왔던 카드를 그대로** 재현한다.
    this.collectRun = 0; // 뽑으면 콤보가 끊긴다(수집 드랍 기준 — 시뮬과 동일 규칙).
    // **행운 카드 연출 준비**(PO 2026-08-25) — 이 뽑기가 ＋5 보조(2차 30%/3차 50%) 카드였는지 기억해 둔다.
    //   ⚠️ 확률 수치는 화면에 표기하지 않는다(확률형 고지 정책 확정 전) — "행운"이라는 체감만 준다.
    const assistedDraw = (this.state.stock[this.state.stock.length - 1]?.assist ?? 0) > 0;
    this.state = this.replayUndone('draw') ?? drawStock(this.state, this.rng);
    this.drawsUsed += 1; // 별 등급의 '짧은 수순' 축.
    const card = wasteTop(this.state);
    const drewWild = card.wild === true; // 뽑힌 카드가 와일드면 기준이 와일드가 되어 1회 아무 카드나 낼 수 있다.
    // 보조 카드가 실제로 매칭 랭크로 공개됐으면 — 공개 연출이 끝날 즈음 반짝임(살수록 잘 풀린다는 학습).
    if (assistedDraw && !drewWild && availableMoves(this.state).length > 0) {
      this.time.delayedCall(430, () => this.luckyCardFx());
    }
    // ⚠️ **상태를 바꾼 직후 즉시** 공개 대기로 표시한다(PO 2026-07-28 "기준카드에 먼저 나타났다가 다시
    //    배치되는 연출로 헷갈린다") — 아래 `cancelWild()` 는 내부에서 `refresh()` 를 부르고, 그때
    //    `syncWasteView` 가 **아직 날아오지도 않은 새 기준 카드를 목적지에 미리 그려버린다**. 그러면 카드가
    //    한 번 뜬 뒤 비행 연출이 또 배치해 **두 번 바뀌어 보인다**. 예전엔 이 증가가 wild/콤보 처리 뒤에
    //    있어서, 와일드가 아닌 **일반 뽑기(대부분)** 에서 매번 이 현상이 났다.
    const dfId = this.beginDrawFlight(); // 공개 전까지 기준 카드 뷰를 뒷면으로 둔다.
    sfx(drewWild ? 'wild_activate' : 'card_deal');
    // 뽑기 = 콤보 끊김. 기준 카드가 새로 바뀌므로 (와일드가 아니면) 와일드도 해제. **진행 중이던 부분 런(≤4)은
    //   채운 수만큼 소량 적립**(endComboRun) 후 박스 비움.
    if (drewWild) this.wildActive = true;
    else this.cancelWild();
    this.endComboRun();
    this.refresh(); // 스톡 수량·하이라이트 즉시 반영(더미 다시 쌓기 포함).
    const fly = new CardView(this, STOCK.x, STOCK.y, this.geom.cardW, this.geom.cardH, false);
    // 비행 시작(undo/+5 잠금) — 연출이 끊겨도 워치독이 잠금을 풀고 이 고스트를 치운다.
    const flId = this.beginFlight(() => fly.destroy(), 'draw');
    fly.setDepth(1000);
    // **폴드(뒷면)로 시작 → 이동하며 카드가 뒤집혀 오픈되면서 기준 자리에 배치**.
    fly.showBack();
    const baseSX = fly.scaleX; // 정지 시 표시 배율(뒤집기 중 X만 압축/복원)
    let swapped = false;
    // **옆으로 뒤집히는 플립**(scaleX 1→0→1, 중간에 뒷면→앞면 교체) + 잔상 트레일.
    const emitTrail = this.makeTrailEmitter(1000);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 360,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        fly.x = STOCK.x + (WASTE.x - STOCK.x) * t;
        fly.y = STOCK.y + (WASTE.y - STOCK.y) * t;
        // 중간 지점(카드가 옆으로 서는 순간)에서 뒷면→앞면 교체 → 오픈되는 플립.
        if (!swapped && t >= 0.5) {
          swapped = true;
          if (drewWild) fly.showWild();
          else fly.showFace(card);
        }
        fly.scaleX = baseSX * Math.abs(Math.cos(t * Math.PI)); // 1→0→1
        emitTrail(fly);
      },
      onComplete: () => {
        this.endFlight(flId); // 비행 종료(undo/+5 재허용) + 고스트 파기(정리 콜백).
        this.endDrawFlight(dfId); // 공개 완료 → 기준 카드 뷰가 새 카드를 앞면으로 그린다.
        this.refresh(); // 숨겨 뒀던 기준 카드 뷰가 새 top 을 그린 채로 드러난다(끊김 없음).
        if (drewWild) {
          // 기준이 와일드 → 노출 카드 전부 골드 강조(아무거나 1회), 안내 + 살짝 맥동.
          this.toast('🃏 와일드! 아무 노출 카드나 탭하세요');
          this.tryTip('wildUse');
          this.pulseWasteView();
        }
        this.checkEnd();
      },
    });
  }

  // ── S3: 불변식 감시 ────────────────────────────────────────────────
  /**
   * **불변식 위반 기록** — 화면과 상태가 어긋난 순간을 조용히 넘기지 않는다.
   *   콘솔이 닫혀 있어도 남도록 코어 errorLog(localStorage 영구 링버퍼)에 적재한다 → 콘솔에서 `__errors()`.
   *   같은 종류는 판당 1회만 쌓아 로그가 한 종류로 가득 차지 않게 한다.
   */
  private logInvariant(kind: string, detail: string): void {
    if (this.loggedInvariants.has(kind)) return;
    this.loggedInvariants.add(kind);
    appendError('solitaire', {
      type: 'invariant',
      msg: `[play] ${kind}: ${detail}`,
      stack: new Error('invariant').stack,
      ctx: `lv${this.level} 남은${remaining(this.state)} 스톡${this.state.stock.length} fly${this.flyingCards} draw${this.drawFlights}`,
    });
  }

  /**
   * **뽑기 비행 시작/종료** — 토큰으로 관리한다. 연출 트윈이 (씬 전환·예외 등으로) onComplete 를 못 부르면
   *   기준 카드가 숨은 채 남아 보드 입력이 영구히 잠기므로, 워치독이 강제로 풀고 위반을 기록한다.
   */
  /**
   * **비행 연출 토큰**(매칭 토스·뽑기 플립 등) — 시작할 때 잠그고 끝나면 푼다.
   *
   * 예전에는 `flyingCards += 1` / `-= 1` 을 트윈 콜백에서 직접 했다. 그런데 트윈은 여러 이유로
   * onComplete 를 못 부른다(대상이 먼저 파기됨 · onUpdate 예외 · 씬 전환 · 배속 전환). 그러면 카운터가
   * 1 로 굳어 **되돌리기·＋5 가 영구히 잠기고**, 함께 굳은 뽑기 공개 대기 때문에 카드도 안 눌렸다
   * (PO 2026-08-21 "카드가 안 눌린다"의 원인 중 하나 — QA 진단에 `flyingCards: 1` 로 남아 있었다).
   * 이제 토큰마다 워치독을 걸어, 연출이 끝나지 않아도 **반드시** 잠금이 풀리고 정리가 돌게 한다.
   */
  /**
   * **실시간 기준 워치독** — `realMs` 가 지나도 `isDone()` 이 아니면 `onFire()`. 그 전까지는 짧게 폴링한다.
   *   `time.delayedCall` 의 delay 는 게임시간(배속에 나뉨)이라 그것만으로는 배속에서 조기 발동한다.
   */
  private armWatchdog(realMs: number, isDone: () => boolean, onFire: () => void): void {
    const started = performance.now();
    const tick = (): void => {
      if (isDone() || !this.scene.isActive()) return;
      if (performance.now() - started >= realMs) { onFire(); return; }
      this.time.delayedCall(WATCHDOG_POLL_MS, tick);
    };
    this.time.delayedCall(WATCHDOG_POLL_MS, tick);
  }

  private beginFlight(cleanup?: () => void, tag: string | (() => string) = ''): number {
    const id = ++this.flightSeq;
    this.activeFlights.set(id, cleanup);
    this.flyingCards = this.activeFlights.size;
    this.armWatchdog(
      FLIGHT_WATCHDOG_REAL_MS,
      () => !this.activeFlights.has(id),
      () => {
        this.logInvariant('flight-stuck', `id${id} ${typeof tag === 'function' ? tag() : tag}`);
        this.endFlight(id);
        this.refresh();
      },
    );
    return id;
  }

  /** 비행 종료 — 카운터를 내리고 등록된 정리(고스트 파기)를 한 번만 실행한다. */
  private endFlight(id: number): void {
    const cleanup = this.activeFlights.get(id);
    if (!this.activeFlights.delete(id)) return;
    this.flyingCards = this.activeFlights.size;
    try {
      cleanup?.();
    } catch {
      /* 정리 실패보다 잠금 해제가 우선 — 예외를 삼킨다(여기서 던지면 트윈 루프가 죽는다). */
    }
  }

  private beginDrawFlight(): number {
    const id = ++this.drawFlightSeq;
    this.activeDrawFlights.add(id);
    this.drawFlights = this.activeDrawFlights.size;
    this.armWatchdog(
      DRAW_FLIGHT_WATCHDOG_REAL_MS,
      () => !this.activeDrawFlights.has(id),
      () => {
        this.logInvariant('draw-flight-stuck', `id${id}`);
        this.endDrawFlight(id);
        this.refresh();
      },
    );
    return id;
  }

  private endDrawFlight(id: number): void {
    if (!this.activeDrawFlights.delete(id)) return;
    this.drawFlights = this.activeDrawFlights.size;
  }

  /**
   * **목표 화면(뷰모델) == 실제 렌더** 대조(refresh 끝에서 1회). 어긋남은 곧 "플레이어가 본 것과 다른 판정"의 씨앗.
   *   규칙 자체는 boardView 가 테스트로 지키므로, 여기서는 **옮겨 담기가 실패했는지**만 본다.
   *   ① 기준 카드 ② 보드 카드 그림 ③ 입력이 목표와 같은가(특히 "낼 수 있는데 안 눌림").
   */
  private assertViewState(): void {
    const wv = this.wasteView;
    const w = this.view.waste;
    if (wv) {
      // 'hold'(연출 중 직전 카드 유지)는 그 카드가 보이면 정상이다 — 와일드였다면 와일드 아트가 정답.
      const wantCard = w.card as Card | undefined;
      const ok =
        w.kind === 'back'
          ? !wv.isFaceUp()
          : w.kind === 'wild' || (w.kind === 'hold' && wantCard?.wild)
            ? wv.isShowingWild()
            : wantCard != null && wv.isShowingCard(wantCard);
      if (!ok) {
        this.logInvariant('waste-view-desync', `목표=${w.kind}${wantCard ? `${wantCard.rank}${wantCard.suit}` : ''} 표시=${wv.shownSignature()}`);
        this.syncWasteView(); // **자가 치유** — 기록만 하면 기준 카드가 어긋난 채로 남는다.
      }
    }
    for (const [id, view] of this.cards) {
      const want = this.view.slots.get(id);
      if (!want) continue;
      // 뒤집기 중에는 그림이 목표와 다른 게 정상(연출이 진행 중) — 그림 검사만 건너뛴다.
      if (want.kind === 'face' && !view.isFlipping() && !view.isShowingCard(want.card as Card)) {
        this.logInvariant('board-view-desync', `${id} 목표=${want.card!.rank}${want.card!.suit} 표시=${view.shownSignature()}`);
        this.applySlotView(view, id, want); // **자가 치유** — 그림을 목표대로 다시 그린다.
      }
      const enabled = view.input?.enabled === true;
      // **자가 치유**(PO 2026-08-21 "버그를 수정하세요") — 예전엔 어긋남을 **기록만** 했다. 그런데 이 계열의
      //   증상은 "낼 수 있는 카드가 영영 안 눌리는" 것이라, 기록만 하면 플레이어는 판을 버릴 수밖에 없다.
      //   원인(중단된 트윈·놓친 콜백)은 여러 갈래라 하나씩 막아도 새로 생긴다 — 그래서 **결과를 되돌리는**
      //   안전망을 둔다. syncCardInput 은 뷰모델과 현재 그림에서 입력 여부를 다시 계산하므로, 양방향
      //   (열려야 하는데 닫힘 / 닫혀야 하는데 열림) 모두 여기서 교정된다.
      if (enabled && !want.tappable) {
        this.logInvariant('input-open-when-not-tappable', id);
        this.syncCardInput(id);
      }
      // **낼 수 있는데 못 누르는 카드** — 이번 계열 버그의 사용자 체감 증상 그 자체.
      //   목표가 tappable 인데 그림이 아직 안 따라온(뒤집는 중) 경우는 제외한다(곧 콜백이 연다).
      if (!enabled && want.tappable && want.kind === 'face' && view.isShowingCard(want.card as Card)) {
        this.logInvariant('playable-card-not-tappable', `${id} 표시=${view.shownSignature()}`);
        this.syncCardInput(id);
      }
    }
  }

  /** 기준 카드(와일드 등장) 맥동 — 대상은 **언제나 wasteView**(고스트가 아니라). */
  private pulseWasteView(): void {
    const wv = this.wasteView;
    if (!wv) return;
    this.tweens.add({
      targets: wv,
      scaleX: wv.scaleX * 1.06,
      scaleY: wv.scaleY * 1.06,
      duration: 460,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });
  }

  private denyFeedback(view: CardView): void {
    const x0 = view.x;
    this.tweens.add({ targets: view, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => view.setX(x0) });
  }

  /**
   * 이동 중인 카드가 **잔상(고스트)을 연속으로 남기는 트레일** — 레퍼런스처럼 하나의 카드가 경로를 따라
   * 이어져 보인다. 반환한 `emit(view)` 를 트윈 onUpdate 에서 매 프레임 호출하면, 카드가 minDist(px)
   * 이상 이동할 때마다 현재 텍스처/각도/스케일을 복제한 반투명 이미지를 깔고 짧게 페이드아웃한다.
   *   · **거리 기반**이라 프레임레이트와 무관하게 잔상 간격이 일정(등속 스텝에서도 촘촘한 트레일).
   *   · view.texture.key 를 그대로 쓰므로 플립(뒷면↔앞면)·회전이 잔상에도 반영된다.
   */
  private makeTrailEmitter(depth: number, minDist = 58): (view: Phaser.GameObjects.Image) => void {
    let lx = Number.NaN;
    let ly = Number.NaN;
    return (view: Phaser.GameObjects.Image): void => {
      if (!Number.isNaN(lx)) {
        const dx = view.x - lx;
        const dy = view.y - ly;
        if (dx * dx + dy * dy < minDist * minDist) return;
      }
      lx = view.x;
      ly = view.y;
      const g = this.add.image(view.x, view.y, view.texture.key).setDepth(depth - 1);
      g.scaleX = view.scaleX;
      g.scaleY = view.scaleY;
      g.setAngle(view.angle);
      g.setAlpha(0.5);
      this.tweens.add({ targets: g, alpha: 0, duration: 300, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    };
  }

  /** 노출/매칭 상태 반영 — 노출 앞면(입력 ON), 가려진 뒷면(입력 OFF). 플레이 가능 카드는 골드 하이라이트. */
  /**
   * 반투명 막 — **보드 영역 전체**를 덮는 반투명 다크 레이어. 건물(타워, depth 12~30)과 카드(depth 110+) **사이**(depth 50)에
   * 두어 건물이 막 뒤로 은은히 비치고 카드는 앞에서 선명하게 뜬다. HUD/스톡/웨이스트(depth 60~85)는 막 위에 남는다. 1회 생성.
   */
  private drawBoardMask(): void {
    if (this.cardBacking) return;
    const g = this.add.graphics().setDepth(50);
    g.fillStyle(0x0d1424, 0.62);
    const fb = fullBleedBounds(this); // 넓어진 폭까지 덮는다(저작 W 로 그리면 좌우가 뚫린다).
    g.fillRect(fb.x, DARK_TOP, fb.w, fb.y + fb.h - DARK_TOP);
    this.cardBacking = g;
  }

  /**
   * 화면을 현재 상태에 맞춘다. **순서에 의존하지 않는다** — 목표 화면을 순수 함수로 한 번 계산한 뒤
   *   그대로 옮겨 담기 때문. (예전에는 기준 카드/보드/입력을 차례로 갱신해, 그 순서가 곧 정확성이었다.)
   */
  private refresh(): void {
    // 에디터가 암막 패널(layer_4)을 저작했으면 코드 막 생략(중복 방지).
    if (!this.chromeFromEditor) this.drawBoardMask();
    this.computeView();
    this.syncWasteView();
    this.syncBoardViews();
    // 특수 카드 소비 — **뷰를 그린 뒤에** 한다(둘 다 state 를 바꾼다: 슬롯 클리어 + 스톡 변경).
    const before = this.state;
    // **특수 카드는 소비 전에 안내**(PO 2026-08-22 "화면을 멈추고 화살표로 이 카드가 무엇인지 안내").
    //   ⚠️ 안내 중(coachHold)에는 **어떤 소비도 하지 않는다** — 와일드 안내가 떠 있는데 보너스를 소비해
    //   버리면 그 카드는 설명도 못 듣고 사라진다(실측 버그). 미뤄 둔 쪽은 안내를 닫을 때 도는 refresh 가
    //   다시 집어 든다(그때 자기 안내가 또 뜬다).
    if (!this.coachHold && this.view.triggers.bankWild && !this.wildBanked) {
      if (!this.coachIfNew('wildCard', this.wildSlotId, () => this.bankWild())) this.bankWild();
    }
    if (!this.coachHold && this.view.triggers.bonus && !this.bonusTriggered) {
      if (!this.coachIfNew('bonusCard', this.bonusSlot?.id, () => this.triggerBonus())) this.triggerBonus();
    }
    if (this.state !== before) {
      // 소비로 그 아래 카드가 새로 열렸다 → 목표 화면을 다시 계산해 반영(한 번이면 충분: 소비는 1회성).
      this.computeView();
      this.syncWasteView();
      this.syncBoardViews();
    }
    this.syncStockAndHud();
    this.updateBoosters();
    this.assertViewState(); // 화면==상태 불변식(S3) — 위반은 errorLog 에 남긴다.
    this.updateMoveHint(); // 초반 반복 화살표(남은 횟수가 있을 때만).
    // **상황별 튜토리얼 안내** — 화면에 실제로 그 상황이 생겼을 때만 부른다(logic/tutorial.ts).
    if (!this.dealing && !this.ended && !this.coachHold) {
      const triggers: TipKey[] = [];
      if (availableMoves(this.state).length === 0 && this.state.stock.length > 0) triggers.push('draw');
      if (this.comboColors.length >= 3) triggers.push('combo');
      if (this.history.length > 0) triggers.push('undo');
      if (triggers.length) this.tryTip(...triggers);
    }
  }

  /**
   * 보드 카드 뷰 한 패스 — **뷰모델(boardView)이 시킨 대로만** 그린다.
   *   여기에는 "언제 무엇을 보여줄지"에 대한 판단이 없다. 판단은 전부 순수 모듈에 있고, 이 함수는
   *   그 결과를 Phaser 오브젝트에 옮겨 담을 뿐이다 → 갱신 순서 때문에 생기는 버그가 사라진다.
   */
  private syncBoardViews(): void {
    for (const [id, view] of this.cards) {
      const want = this.view.slots.get(id);
      if (!want) continue; // 제거된 슬롯(연출 중) — 건드리지 않는다.
      this.applySlotView(view, id, want);
    }
  }

  /** 카드 한 장에 목표 표시를 적용한다. 뒤집기 연출은 "뒷면 → 앞면"으로 바뀌는 순간에만 건다. */
  private applySlotView(view: CardView, id: string, want: SlotView): void {
    switch (want.kind) {
      case 'wild':
        if (!view.isShowingWild()) view.showWild();
        break;
      case 'bonus':
        view.showArt(BONUS_ART[want.bonusCount ?? 1]);
        break;
      case 'back':
        if (view.isFaceUp()) view.showBack();
        break;
      case 'face': {
        const card = want.card as Card;
        if (!this.dealing && !view.isFaceUp()) {
          // 얼굴이 드러나는 순간 입력을 풀고(중간), 펼침이 끝나면 하이라이트까지 맞춘다.
          view.flipToFace(card, want.highlight, () => this.onCardRevealed(id), () => this.syncCardInput(id));
        } else {
          view.showFace(card, want.highlight);
        }
        break;
      }
    }
    view.setAlpha(want.alpha);
    if (view.input) view.input.enabled = want.tappable && view.isShowingCard(want.card as Card);
  }

  /** 스톡 더미·카운터·＋5 플로팅·HUD 텍스트를 현재 state 로 맞춘다. */
  private syncStockAndHud(): void {
    const stock = this.state.stock.length;
    // 스톡 수량이 바뀌면 더미를 다시 쌓는다(보유 수량만큼 겹쳐 보이게).
    if (stock !== this.lastStockCount) this.buildStockPile();
    this.stockCountText?.setText(stock > 0 ? `👆 뽑기 · ${stock}장` : '🃏 카드가 없어요');
    this.stockContainer?.setAlpha(stock > 0 ? 1 : 0.4);
    // **스톡 소진 → '카드가 없어요' 메시지 후 잠깐 뒤에 +5 플로팅 카드 등장**(즉시 뜨면 너무 급함, PO 2026-07-17).
    // **정말 필요해질 때까지 기다린다**(PO 2026-08-23) — 스톡이 0이어도 보드에 낼 수 있는 수가 남아 있으면
    //   먼저 그것부터 두게 둔다. 예전엔 소진되는 순간 바로 떠서 "아직 할 수 있는데" 안내가 먼저 나왔다.
    const needsRefill = stock === 0 && availableMoves(this.state).length === 0;
    if (needsRefill && refillableCount(this.state) > 0 && !this.ended) {
      if (!this.emptyStockPlus5 && !this.emptyStockPending) {
        this.emptyStockPending = true;
        this.time.delayedCall(850, () => {
          this.emptyStockPending = false;
          // 지연 후에도 여전히 소진 상태면 등장(그새 +5/뽑기로 채워졌으면 취소).
          if (
            this.state.stock.length === 0 &&
            availableMoves(this.state).length === 0 &&
            refillableCount(this.state) > 0 &&
            !this.ended
          ) {
            this.showEmptyStockPlus5();
            this.tryTip('emptyStock');
          }
        });
      }
    } else {
      this.emptyStockPending = false;
      this.hideEmptyStockPlus5();
    }
    this.labRun.maxCombo = Math.max(this.labRun.maxCombo, this.state.combo); // 실측: 이 판 최대 콤보.
    this.comboText?.setText(`콤보 x${this.state.combo}`);
    this.remainText?.setText(`남은 카드 ${remaining(this.state)}`);
    // **코인 = 실제 보유 잔액(baseCoins)만** 표시. (예전엔 baseCoins+state.score 를 더해, 플레이 중 점수만큼
    //   부풀려 보이다가 승리/복귀 시 실지급(starCoins)만 반영돼 확 줄어 '데이터 안 맞음'으로 보였다.
    //   게임비 차감·부스터 비용·승리 보상이 전부 baseCoins 로 일관되므로, 표시도 baseCoins 로 통일.)
    const coins = this.baseCoins.toLocaleString();
    this.coinText?.setText(`🪙 ${coins}`);
    // 공통 상단 헤더에 실시간 반영.
    this.header?.setCoins(this.baseCoins);
  }

  /**
   * **기준(웨이스트) 카드 뷰 동기화 — 이 게임에서 기준 카드 표시를 바꾸는 유일한 지점(S1 단일 소유권).**
   *
   * 예전에는 각 연출의 `onComplete` 가 **날아온 카드를 `wasteView` 로 승격**시켰다. 그래서
   *   ① 연출이 끝날 때까지(카드 내기 0.75초 · 뽑기 0.36초) 화면의 기준 카드가 **직전 카드로 남고**,
   *      그동안의 탭은 이미 바뀐 새 기준으로 판정돼 **"매칭되는데 거부당한다"** 로 체감됐다.
   *   ② 연출 경로를 새로 추가할 때마다 승격을 빠뜨릴 자리가 생겨 같은 계열 버그가 반복됐다.
   *
   * 이제 기준 카드 뷰는 `buildStockAndWaste` 가 만든 **한 장뿐**이고, 내용은 언제나 `wasteTop(state)` 이다.
   *   비행 카드는 전부 **고스트**(착지 시 destroy)로 강등돼 진실을 소유하지 않는다.
   *   `drawFlights > 0`(뽑기 공개 대기) 동안에는 **표시만 숨긴다** — 무엇이 나올지 모르는 연출이라
   *   목적지에 미리 그리면 카드가 두 번 바뀌어 보이기 때문. 내용은 그때도 이미 새 top 이다.
   */
  private syncWasteView(): void {
    const wv = this.wasteView;
    const top = wasteTop(this.state);
    if (!wv || !top) return;
    const want = this.view.waste;
    if (want.kind === 'hold') {
      // **연출 중 — 직전 기준 카드를 그대로 유지**(PO 2026-08-22). 날아온 카드가 도착할 때 한 번만 바뀐다.
      //   표시가 상태보다 늦지만 `wasteShown`=false 라 보드 탭이 함께 잠겨 오판이 생기지 않는다.
      const prev = want.card as Card;
      if (prev.wild) { if (!wv.isShowingWild()) wv.showWild(); }
      else if (!wv.isShowingFace(prev)) wv.showFace(prev);
      return;
    }
    if (this.drawFlights > 0) {
      if (wv.isFaceUp()) wv.showBack(); // 직전 카드가 없는 첫 뽑기 — 뒷면(정직한 '아직 모름').
      return;
    }
    // 이미 같은 내용을 그리고 있으면 건드리지 않는다 — 재그리기는 진행 중인 스케일 연출(와일드 맥동 등)을
    //   리셋해 미세한 튐을 만든다.
    if (top.wild) {
      if (!wv.isShowingWild()) wv.showWild();
    } else if (!wv.isShowingFace(top)) {
      wv.showFace(top);
    }
  }

  /**
   * **기준 카드가 지금 화면에 '진실되게' 보이는가** — 보드 탭을 판정에 넘겨도 되는지의 게이트(S2).
   *   숨김(뽑기 공개 대기) 중이거나 내용이 state 와 다르면 false → 플레이어가 못 본 기준으로는 판정하지 않는다.
   */
  /** 지금 프레임의 목표 화면(순수 계산) — refresh 가 만들어 두고 여러 곳이 함께 읽는다. */
  private view: BoardView = { waste: { kind: 'back' }, slots: new Map(), triggers: { bankWild: false, bonus: false } };

  /** 현재 상태로 목표 화면을 다시 계산한다. **여기 말고 다른 곳에서 표시 규칙을 정하지 말 것.** */
  private computeView(): BoardView {
    this.view = boardView({
      state: this.state,
      wildActive: this.wildActive,
      drawPending: this.drawFlights > 0,
      matchPending: this.matchFlights > 0,
      heldReveals: this.heldReveals,
      dealing: this.dealing,
      ended: this.ended,
      ...(this.wildSlotId ? { wildSlot: this.wildSlotId } : {}),
      wildBanked: this.wildBanked,
      ...(this.bonusSlot ? { bonusSlot: this.bonusSlot } : {}),
      bonusTriggered: this.bonusTriggered,
    });
    return this.view;
  }

  /** 기준 카드가 제 모습으로 보이는가(뷰모델 기준). */
  private wasteTruthful(): boolean {
    // 'hold'(연출 중 직전 카드 유지)도 **뷰모델대로 그린 상태**다 — 시뮬/봇이 여기서 멈추지 않게 참으로 본다.
    //   실제 탭 허용 여부는 boardView 의 tappable 이 이미 판단한다(뽑기 대기 중에는 거기서 닫힌다).
    return this.view.waste.kind !== 'back';
  }

  /** 슬롯 id 기준 탭 가능 여부 — 실제 탭·시뮬 공통 진입점. 규칙은 전부 boardView 안에 있다. */
  private isTappable(id: string): boolean {
    return this.view.slots.get(id)?.tappable === true;
  }

  /**
   * 카드 공개(뒤집기) 완료 콜백 — 뒤집는 동안 `flipToFace` 가 무시했던 하이라이트 갱신을 반영하고
   *   입력 잠금을 푼다. 이게 없으면 공개된 카드가 다음 refresh 까지 눌리지 않는다.
   */
  private onCardRevealed(id: string): void {
    const view = this.cards.get(id);
    if (!view || !view.scene) return;
    view.showFace(this.state.board[id], this.wildActive || isPlayable(this.state, id));
    this.syncCardInput(id);
  }

  /** 카드 한 장의 **입력 허용만** 현재 표시/상태로 다시 계산한다(그림은 건드리지 않는다 — 진행 중인 트윈 보호). */
  private syncCardInput(id: string): void {
    const view = this.cards.get(id);
    const want = this.view.slots.get(id);
    if (!view?.scene || !view.input || !want) return;
    view.input.enabled = want.tappable && want.kind === 'face' && view.isShowingCard(want.card as Card);
  }

  private checkEnd(): void {
    if (this.ended) return;
    // 시뮬레이션 중에는 **결과 화면으로 넘어가지 않는다** — 클리어해도 진행도·보상 정산 없이 바에만 표시.
    if (this.simRunning) {
      if (isWin(this.state)) this.stopSim(`클리어 · 잔여 ${this.state.stock.length}`);
      else if (isStuck(this.state) && this.state.stock.length === 0) this.stopSim('막힘(뽑기 소진)');
      return;
    }
    if (isWin(this.state)) {
      // **게임 종료 = 보드 전멸(모든 카드 매칭)뿐**. 마지막 미완성 콤보 런의 소량도 합산한 뒤 별 등급 산정.
      // 임시 진단 로그(PO 2026-07-29 "실제 게임 잔여뽑기 확인용") — 실측 vs 시뮬레이터 비교용, 정리 예정.
      console.log(`[뽑기진단] lv${this.level} 승리 · 잔여뽑기 ${this.state.stock.length}장 · ＋5사용 ${this.plus5Uses}회`);
      this.ended = true; // 중복 진입 방지(연출 중 재-checkEnd 차단).
      this.endComboRun(); // 클리어 직전 진행 중이던 콤보 런 마감(마지막 손님 정산 → 별 흡입).
      // **최종평가 3축**(PO 2026-07-29) — ① 연속 콤보(플레이 중 누적) ② 남은 카드 수 ③ ＋5 없이 클리어.
      //   ②③은 지금 확정되므로 여기서 한 번에 얹힌다 → 게이지는 축①의 현재값에서 최종 품질까지 **올라가기만** 한다.
      const leftover = this.state.stock.length;
      const beforeQ = this.qualityNow(); // 축①까지만 반영된 지점(손님 흡입이 끝난 자리).
      // ＋5 를 한 번도 안 썼으면 **무조건 3★ 이상**(qualityWithCleanFloor) — 게이지도 이 값으로 채워지므로
      //   팝업 별 수와 게이지가 항상 일치한다.
      const finalQ = qualityWithCleanFloor(
        finalQuality({
          comboScore: this.comboScore,
          boardSize: this.boardSlots,
          leftover,
          stockSize: this.initialStock,
          plus5Uses: this.plus5Uses,
        }),
        this.refQuality,
        this.plus5Uses,
      );
      // **승리 팝업 별 등급** = 최종 품질 기준.
      //   **미션 리워드도 이 동일한 stars 값을 그대로 사용한다**(2026-07-18 수정) — 예전엔 남은 카드 보너스를
      //   뺀 별도의 "순수 별 수"(pureStars)를 미션 리워드에만 썼는데, 팝업엔 3★로 뜨고도 미션 배너는 전혀
      //   반응하지 않는(3개 이상인데 회수가 안 되는) 불일치를 낳았다. 플레이어가 화면에서 본 별 등급 =
      //   미션에 적립되는 별 개수로 통일한다.
      const stars = Phaser.Math.Clamp(this.ratioStars(finalQ), 1, MAX_STARS);
      if (leftover > 0) {
        // **연출**: 손님 흡입이 끝난 뒤(≈0.5s) 남은 카드가 게이지로 빨려올라가며 별로 변환→게이지 채움 → 팝업.
        this.time.delayedCall(520, () => {
          this.gaugeScore = beforeQ; // 손님 흡입 완료 지점부터.
          this.updateGaugeBar();
          this.updateStars();
          this.convertLeftoverToStars(leftover, beforeQ, finalQ, () => {
            this.time.delayedCall(260, () => this.finishMission(stars));
          });
        });
      } else {
        this.gaugeScore = finalQ; // 남은 카드가 없어도 축③(무부스터) 몫은 여기서 반영된다.
        this.updateGaugeBar();
        this.updateStars();
        this.finishMission(stars);
      }
    } else if (isStuck(this.state) && !this.wildActive) {
      // 와일드 활성 중엔 아무 노출 카드나 낼 수 있으므로 교착이 아니다.
      // 교착이어도 **실패 팝업을 띄우지 않는다** — ＋5 카드나 와일드 버튼으로 이어서 풀도록 안내만 한다.
      if (!this.stuckLogged) {
        // 임시 진단 로그(PO 2026-07-29) — 실제 게임엔 '패배' 화면이 없고 이 막힘 상태만 있다는 점 자체가
        // 참고할 데이터라, 잔여뽑기(보통 0)와 함께 남긴다.
        console.log(`[뽑기진단] lv${this.level} 막힘 · 잔여뽑기 ${this.state.stock.length}장 · ＋5사용 ${this.plus5Uses}회`);
        this.stuckLogged = true;
      }
      sfx('stuck');
      this.toast('막혔어요! ＋5 카드나 🃏 와일드를 눌러 이어가세요');
      this.updateBoosters();
    }
  }

  // ── 레벨 점검용 시뮬레이션 바(하단 중앙) ──────────────────────────
  //   요구(PO 2026-07-28): 아주 작은 회색 바 · 자동 시뮬 · 2/4배속 · **결과로 안 넘어감** · 좌우 레벨 이동.
  //   ⚠️ **기본은 항상 숨김**(PO 2026-07-28 "텍스트로 시뮬레이션이나 팩복원 등의 기능은 숨겨주세요") —
  //   예전엔 개발 빌드에서 늘 떠 있어 하단 부스터/카드와 겹쳐 화면을 어지럽혔다. 필요할 때만 주소에
  //   `?sim=1` 을 붙여 켠다(개발·배포 동일 규칙). 레벨 건너뛰기 버튼이라 평소 노출은 진행도 우회이기도 하다.

  private simEnabled(): boolean {
    try { return new URLSearchParams(location.search).get('sim') === '1'; } catch { return false; }
  }

  private drawSimBar(): void {
    if (!this.simEnabled()) return;
    this.simBar?.destroy(); // 재진입 시 이전 바가 남아 겹치지 않도록.
    const y = 2330; // 부스터(y=2100)보다 아래 — 플레이 영역과 겹치지 않는 최하단.
    const mk = (x: number, label: string, on: () => void, w?: number): Phaser.GameObjects.Text => {
      const t = this.add
        .text(x, 0, label, {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '24px',
          color: '#d8d8d8',
          backgroundColor: '#3a3a3acc',
          padding: { x: 10, y: 4 },
          fixedWidth: w,
          align: 'center',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', on);
      return t;
    };
    const prev = mk(-210, '◀', () => this.gotoSimLevel(this.level - 1));
    this.simPlayBtn = mk(-90, '▶ 시뮬', () => (this.simRunning ? this.stopSim('중지') : this.startSim()), 110);
    this.simSpeedBtn = mk(20, `${this.simSpeed}배속`, () => this.toggleSimSpeed(), 90);
    const next = mk(140, '▶', () => this.gotoSimLevel(this.level + 1));
    this.simStatus = this.add
      .text(250, 0, this.simIdleStatus(), { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '20px', color: '#9a9a9a' })
      .setOrigin(0, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [prev, this.simPlayBtn, this.simSpeedBtn, next, this.simStatus];
    if (this.levelOverriddenByLocalStorage()) {
      // 번들 팩이 에디터 사본에 가려진 상태 — 눈에 띄게 알리고 한 번에 지울 수 있게 한다.
      this.simStatus.setColor('#ffb000').setText(`${this.simIdleStatus()} · ⚠에디터본`);
      parts.push(mk(250, '팩복원', () => this.clearLocalLevelOverride(), 110).setY(46));
    }
    this.simBar = this.add.container(W / 2 - 60, y, parts).setDepth(5000).setScrollFactor(0);
  }

  /**
   * 이 레벨이 **localStorage 저작본에 덮여** 있는가.
   * editorLevelNumbers 는 `{...번들팩, ...loadEditorLevelDocs()}` 순서라 **localStorage 가 항상 이긴다**
   * (카드 에디터로 방금 저장한 걸 바로 플레이하려는 의도). 문제는 에디터를 한 번이라도 열어 두면 그 사본이
   * 남아 **번들 팩을 조용히 가린다**는 것 — 서버는 새 팩을 주는데 화면은 옛 레벨이라 원인 찾기가 어렵다
   * (실제로 겪음: 새 팩 lv188 은 뽑기 49장인데 화면엔 9장이었다). 그래서 바에 눈에 띄게 표시한다.
   */
  private levelOverriddenByLocalStorage(): boolean {
    try {
      const raw = localStorage.getItem(EDITOR_LEVELS_KEY);
      if (!raw) return false;
      const docs = JSON.parse(raw) as Record<string, unknown>;
      return docs != null && typeof docs === 'object' && docs[String(this.level)] != null;
    } catch { return false; }
  }

  private simIdleStatus(): string {
    const board = this.state?.layout?.slots?.length ?? 0;
    const stock = this.state?.stock?.length ?? 0;
    return `lv${this.level} · 보드${board} · 뽑기${stock}`;
  }

  /** localStorage 저작본을 지우고 번들 팩으로 되돌린다(에디터 사본이 팩을 가릴 때의 탈출구). */
  private clearLocalLevelOverride(): void {
    try { localStorage.removeItem(EDITOR_LEVELS_KEY); } catch { /* 접근 불가 시 무시 */ }
    this.stopSim();
    this.scene.start('play', { level: this.level, mult: this.chMult });
  }

  private toggleSimSpeed(): void {
    this.simSpeed = this.simSpeed === 1 ? 2 : this.simSpeed === 2 ? 4 : 1;
    this.simSpeedBtn?.setText(`${this.simSpeed}배속`);
    if (this.simRunning) { this.tweens.timeScale = this.simSpeed; this.time.timeScale = this.simSpeed; }
  }

  /** 시뮬 상태를 정리하고 지정 레벨로 이동(시뮬은 꺼진 채로 시작 — 원치 않는 자동 진행 방지). */
  private gotoSimLevel(level: number): void {
    const target = Phaser.Math.Clamp(level, 1, Math.max(1, this.editorLevels));
    if (target === this.level) { this.simStatus?.setText(`lv${this.level} · 끝`); return; }
    this.stopSim();
    this.scene.start('play', { level: target, mult: this.chMult });
  }

  private startSim(): void {
    if (this.dealing) return;
    this.simRunning = true;
    this.tweens.timeScale = this.simSpeed;
    this.time.timeScale = this.simSpeed;
    this.simPlayBtn?.setText('⏸ 정지');
    this.simStatus?.setText(`lv${this.level} · 진행중`);
    this.simTimer?.remove();
    // ⚠️ delay 는 **게임시간** 기준이라 time.timeScale 로 나뉜다 — 즉 실제 간격 = SIM_TICK_MS / 배속.
    //   처음엔 90ms 로 두고 배속까지 곱해 22~45ms 마다 한 수씩 둬서 눈으로 못 따라갔다(PO 지적).
    //   700ms 를 기준으로 잡아 1배속=0.7초/수(사람이 확인 가능), 2배속=0.35초, 4배속=0.175초가 된다.
    // 틱 간격은 **게임시간** 기준이라 timeScale 로 나뉜다(실제 간격 = SIM_TICK_MS / 배속).
    //   실측 러너가 배속 32~64 를 넣으면 실제 간격이 20ms 이하가 되어 최대 속도로 돈다.
    this.simTimer = this.time.addEvent({ delay: SIM_TICK_MS, loop: true, callback: () => this.simTick() });
  }

  private stopSim(reason?: string): void {
    this.simRunning = false;
    this.simTimer?.remove();
    this.simTimer = undefined;
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
    this.simPlayBtn?.setText('▶ 시뮬');
    if (reason) this.simStatus?.setText(`lv${this.level} · ${reason}`);
  }

  /**
   * 시뮬 한 틱 — 자동테스트와 같은 그리디 우선순위(가장 많이 열리는 카드)로 **실제 탭 핸들러**를 부른다.
   * 재구현이 아니라 실제 플레이 경로를 그대로 태우므로 "이 레벨이 실제로 도는지"를 검증할 수 있다.
   * 막히면 뽑고, 뽑을 것도 없으면 종료한다(＋5 구매는 하지 않는다 — 코인을 쓰지 않는 점검 도구).
   */
  private simTick(): void {
    // 가드는 onCardTap 과 동일하게 dealing 만 본다 — busy(카드 비행 중)까지 막으면 동시 플레이를 허용하는
    // 실제 조작과 달라지고, 틱이 헛돌아 진행이 끊긴다.
    if (!this.simRunning || this.dealing) return;
    if (isWin(this.state)) { this.stopSim(`클리어 · 잔여 ${this.state.stock.length}`); return; }
    // **사람과 같은 규칙**(S2) — 기준 카드가 아직 화면에 안 나왔으면(뽑기 공개 연출 중) 다음 틱까지 기다린다.
    if (!this.wasteTruthful()) return;
    const all = availableMoves(this.state);
    const moves = all.filter((id) => this.isTappable(id));
    if (moves.length === 0 && all.length > 0) return; // 카드 공개 연출 대기 — 뽑지 않고 기다린다.
    if (moves.length > 0) {
      // **가장 스마트한 플레이 가정**(PO 2026-08-23) — 정책은 logic/botPolicy.ts 단일 출처
      //   (연쇄 우선 → 오픈 수. 튜닝 시뮬레이터 play-sim 과 동일한 봇이라 실측·예측이 같은 기준).
      const best = pickBotMoves(this.state, moves);
      this.onCardTap(best[Math.floor(this.rng() * best.length)]);
      this.simStatus?.setText(`lv${this.level} · 남은 ${this.state.layout.slots.length - this.state.cleared.size}`);
    } else if (this.state.stock.length > 0) {
      this.onStockTap();
    } else if (this.simBuy && refillableCount(this.state) > 0 && this.simBuys < this.simMaxBuys) {
      // **실측 러너 전용** — 실제 플레이어처럼 ＋5 를 사서 이어간다.
      //   ⚠️ plus5Uses 를 반드시 같이 올릴 것 — 별 판정 3축 중 ②(남은 카드에서 구매분 차감)와
      //   ③(무부스터 클리어)이 이 값만 본다. 빠뜨리면 봇의 구매판이 "클린"으로 채점돼
      //   qualityWithCleanFloor 가 3★ 하한까지 보장해 버린다(2026-08-23 실측: 1★ 0% · 2★ 0.8%).
      if (this.simPayBuys) {
        // 경제 계측 모드 — 실제 구매와 **같은 가격**을 세이브에서 뺀다. 못 내면 거기서 판이 끝난다
        //   (실유저가 막히는 지점 = 런웨이의 끝. 이걸 재려고 켜는 모드다).
        const price = plus5PriceAt(this.level, this.plus5Uses, this.chMult);
        const sv = loadSave();
        if (sv.coins < price) {
          this.labRun.pinch += 1; // 핀치 계측 — 실측 러너도 같은 지점을 센다(핀치 도달 레벨 분포).
          this.stopSim('코인 부족(＋5 구매 불가)');
          return;
        }
        sv.coins = Math.max(0, sv.coins - price);
        writeSave(sv);
      }
      this.simBuys += 1;
      this.plus5Uses += 1;
      this.state = refillStock(this.state, ADD5_COUNT, this.rng, plus5AssistFor(this.plus5Uses)); // 실측도 동일 보조.
      this.refresh();
    } else {
      this.stopSim('막힘(뽑기 소진)');
    }
  }

  // ── 자동 시뮬레이션 테스트(dev 전용) ──────────────────────────────
  //   실제 탭 핸들러(onCardTap/onStockTap)를 그대로 호출해 애니메이션·점수·미션 배선을 재사용하고,
  //   Phaser 타임스케일을 올려 "배속"으로 보이게 한다(재구현 없이 실제 플레이 경로 그대로 검증).

  /** dev 빌드에서만 좌상단에 QA 버튼(자동테스트 시작/중지·자동넘김 토글·내보내기) + 상태 표시를 그린다. */
  private drawAutoTestUI(): void {
    if (!import.meta.env.DEV) return;
    const style = {
      fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
      fontSize: '26px',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { x: 12, y: 6 },
    };
    // ⚠️ 빈 문자열로 만든 뒤 setInteractive() 하면 그 순간의(거의 0에 가까운) 크기로 히트 영역이
    //   고정돼버려서, 이후 setText 로 라벨이 길어져도 클릭 판정 영역은 안 넓어진다(라벨은 멀쩡히 보이는데
    //   눌러도 반응 없음). 그래서 **고정 크기 히트 영역**을 명시로 줘 라벨 텍스트 길이와 무관하게 만든다.
    const hit = (): Phaser.Geom.Rectangle => new Phaser.Geom.Rectangle(0, 0, 360, 46);
    this.autoTestUI = overlayLayer(this, 5000).setVisible(autoTestState.uiVisible);
    this.autoBtn = this.add.text(12, 12, '', style).setDepth(5000);
    this.autoBtn.setInteractive({ hitArea: hit(), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.autoBtn.on('pointerdown', () => {
      if (autoTestState.running) this.stopAutoTest();
      else this.startAutoTest();
    });
    this.autoAdvanceBtn = this.add.text(12, 56, '', style).setDepth(5000);
    this.autoAdvanceBtn.setInteractive({ hitArea: hit(), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.autoAdvanceBtn.on('pointerdown', () => {
      autoTestState.autoAdvance = !autoTestState.autoAdvance;
      this.refreshAutoTestLabels();
    });
    const exportBtn = this.add.text(12, 100, '💾 데이터 내보내기', style).setDepth(5000);
    exportBtn.setInteractive({ hitArea: hit(), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    exportBtn.on('pointerdown', () => {
      const n = autoTestState.results.length;
      if (n === 0) {
        this.toast('수집된 데이터가 없어요 — 자동테스트를 먼저 진행해주세요');
        return;
      }
      exportAutoTestData();
      this.toast(`💾 내보내기 완료(${n}건) — 다운로드 폴더 확인`);
    });
    this.autoStatusText = this.add.text(12, 144, '', { ...style, fontSize: '22px' }).setDepth(5000);
    this.autoTestUI.add([this.autoBtn, this.autoAdvanceBtn, exportBtn, this.autoStatusText]);
    this.refreshAutoTestLabels();
  }

  /** 메뉴의 "자동테스트 표시" 토글 — QA 버튼 묶음을 화면에서 켜고 끈다(자동테스트 동작 자체는 유지). */
  private toggleAutoTestUI(): void {
    autoTestState.uiVisible = !autoTestState.uiVisible;
    this.autoTestUI?.setVisible(autoTestState.uiVisible);
  }

  private refreshAutoTestLabels(): void {
    this.autoBtn?.setText(autoTestState.running ? '⏸ 자동테스트 중지' : '▶ 자동테스트 시작');
    this.autoAdvanceBtn?.setText(autoTestState.autoAdvance ? '⏭ 레벨 자동넘김 ON' : '⏭ 레벨 자동넘김 OFF');
    const n = autoTestState.results.length;
    const wins = autoTestState.results.filter((r) => r.win).length;
    const avgLeft = n ? autoTestState.results.reduce((s, r) => s + r.leftoverStock, 0) / n : 0;
    this.autoStatusText?.setText(`lv${this.level} · 수집 ${n}건(승 ${wins}) · 잔여스톡 평균 ${avgLeft.toFixed(1)}`);
  }

  /** 자동 시뮬레이션 시작 — 타임스케일 상향 + 틱 타이머 등록(레벨 전환 후 재개 시에도 호출). */
  private startAutoTest(): void {
    autoTestState.running = true;
    this.autoTestDone = false;
    this.tweens.timeScale = this.AUTO_SPEED;
    this.time.timeScale = this.AUTO_SPEED;
    this.autoTimer?.remove();
    this.autoTimer = this.time.addEvent({ delay: 90, loop: true, callback: () => this.autoTestTick() });
    this.refreshAutoTestLabels();
    this.toast(`▶ 자동테스트 시작(${this.AUTO_SPEED}배속)`);
  }

  /** 자동 시뮬레이션 중지(수동 중단) — 타임스케일 원복. */
  private stopAutoTest(): void {
    autoTestState.running = false;
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
    this.toast('⏸ 자동테스트 중지');
    this.autoTimer?.remove();
    this.autoTimer = undefined;
    this.refreshAutoTestLabels();
  }

  /**
   * 자동 플레이 한 틱 — design-levels.mts 의 그리디 플레이아웃과 동일한 우선순위(최대 언락 카드 수)로
   *   실제 탭 핸들러를 호출한다. 낼 카드가 없으면 뽑기, 뽑을 카드도 없으면 진짜 교착(패배)으로 종료한다.
   *   (실제 UI 는 교착을 실패로 취급하지 않지만, 자동테스트는 부스터 없이 "순수 승률"을 측정하려는 것이므로
   *   여기서만 교착=패배로 확정한다.)
   */
  private autoTestTick(): void {
    if (!autoTestState.running || this.autoTestDone || this.dealing) return;
    if (isWin(this.state)) {
      this.finalizeAutoRun(true);
      return;
    }
    // **사람과 같은 규칙**(S2) — 화면이 상태를 아직 못 따라잡았으면(뽑기 공개·카드 뒤집기 연출 중)
    //   기다린다. 그래야 자동테스트의 수순·통계가 실제 플레이와 같은 조건에서 나온다.
    if (!this.wasteTruthful()) return;
    const all = availableMoves(this.state);
    const moves = all.filter((id) => this.isTappable(id));
    if (moves.length === 0 && all.length > 0) return;
    if (moves.length > 0) {
      let bestGain = -1;
      let best: string[] = [];
      for (const id of moves) {
        let gain = 0;
        for (const slot of this.state.layout.slots) {
          if (this.state.cleared.has(slot.id) || !slot.coveredBy.includes(id)) continue;
          if (slot.coveredBy.every((c) => c === id || this.state.cleared.has(c))) gain++;
        }
        if (gain > bestGain) {
          bestGain = gain;
          best = [id];
        } else if (gain === bestGain) best.push(id);
      }
      const pick = best[Math.floor(this.rng() * best.length)];
      this.autoRunCombo++;
      this.onCardTap(pick);
    } else if (this.state.stock.length > 0) {
      if (this.autoRunCombo > 0) {
        this.autoComboRuns.push(this.autoRunCombo);
        this.autoRunCombo = 0;
      }
      this.autoDrawCount++;
      this.onStockTap();
    } else {
      this.finalizeAutoRun(false);
    }
  }

  /** 이번 판 결과 확정 — 데이터 기록 + (자동넘김 ON 이면) 다음 레벨로 씬 재시작. */
  private finalizeAutoRun(win: boolean): void {
    if (this.autoTestDone) return;
    this.autoTestDone = true;
    this.autoTimer?.remove();
    this.autoTimer = undefined;
    if (this.autoRunCombo > 0) {
      this.autoComboRuns.push(this.autoRunCombo);
      this.autoRunCombo = 0;
    }
    const result: LevelTestResult = {
      level: this.level,
      win,
      leftoverStock: this.state.stock.length,
      moves: this.state.moves,
      maxCombo: this.autoComboRuns.length ? Math.max(...this.autoComboRuns) : 0,
      comboRuns: [...this.autoComboRuns],
      drawCount: this.autoDrawCount,
      ts: Date.now(),
    };
    recordAutoTestResult(result);
    this.refreshAutoTestLabels();
    if (autoTestState.autoAdvance) {
      const next = this.level + 1; // 자동테스트는 'play' 로 직행하므로 보너스 라운드가 끼어들지 않는다.
      if (next <= this.editorLevels) {
        this.time.delayedCall(260, () => this.scene.start('play', { level: next }));
        return;
      }
      this.toast(`자동테스트 완료 — 전체 ${this.editorLevels}레벨 종료`);
    }
    autoTestState.running = false;
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
  }

  /** 승리 연출 — **전체 덱 52장**을 스톡 위치에서 위로 뿌린 뒤 아래로 떨어뜨린다(포물선 토스). */
  private winScatter(onDone: () => void): void {
    // 전체 덱(4 suit × 13 rank = 52장 고유 카드)을 구성해 흩뿌린다.
    const fullDeck: Card[] = [];
    for (const suit of SUITS)
      for (const rank of RANKS) fullDeck.push({ id: `${suit}${rank}`, suit, rank } as Card);
    const n = fullDeck.length; // = 52
    let done = 0;
    const finish = (): void => {
      if (++done === n) onDone();
    };
    for (let i = 0; i < n; i++) {
      const startX = STOCK.x + (Math.random() * 2 - 1) * 20;
      const startY = STOCK.y;
      const c = new CardView(this, startX, startY, this.geom.cardW, this.geom.cardH, false);
      c.showFace(fullDeck[i], false);
      c.setDepth(1500);

      const driftX = (Math.random() * 2 - 1) * W * 0.55;
      const rise = 320 + Math.random() * 420;
      const spin = (Math.random() * 2 - 1) * 720;
      const upDur = 430 + Math.random() * 240;
      // 1) 위로 솟구침(감속).
      this.tweens.add({
        targets: c,
        x: startX + driftX * 0.4,
        y: startY - rise,
        angle: spin * 0.4,
        duration: upDur,
        delay: i * 24,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // 2) 아래로 낙하(가속) — 화면 밖까지.
          this.tweens.add({
            targets: c,
            x: startX + driftX,
            y: H + 320,
            angle: spin,
            duration: upDur * 1.7,
            ease: 'Quad.easeIn',
            onComplete: () => {
              c.destroy();
              finish();
            },
          });
        },
      });
    }
  }

  // ── 미션 콤보/게이지/보상 ──────────────────────────────────────────

  /**
   * 콤보 런 **종료 + 손님 정산** — 콤보가 끊길 때(뽑기/보드클리어). **누적한 별 전부(무제한)를 손님이 게이지로 지불**하고 퇴장.
   *   손님은 5개를 넘겨도 이 시점까지 나가지 않고 계속 누적했으므로, 여기서 comboColors.length(=누적 별) 전량을 회수한다.
   */
  private endComboRun(): void {
    const filled = this.comboColors.length;
    /*
     * **미션 보상은 여기서 준다** — 콤보가 끊겨 **최종 매칭 수(filled)가 확정된 순간**이다.
     *   같은 런에서 5·10·15… 로 여러 번 완성했으면 그 횟수만큼 지급한다(각각 다른 보상을 뽑는다).
     */
    const granted = this.pendingMissions > 0 && filled >= SET_SIZE;
    if (granted) {
      const times = this.pendingMissions;
      this.pendingMissions = 0;
      for (let i = 0; i < times; i++) this.grantMissionReward(filled);
    }
    if (filled > 0) {
      this.orderQueue?.onBreak(filled); // 정산·퇴장 — 누적 별 전부 게이지로 지불(무제한)·0이면 손님 대기.
      if (filled >= 2) this.tryTip('customerStar'); // 손님이 별을 게이지에 넣는 구조를 처음 볼 때 설명.
    }
    /*
     * **타겟아이템은 시도마다 바뀐다**(PO 2026-08-24 재확정: "시도가 있고 성공이나 실패와 상관 없이
     *   계속 변한다"). 콤보 **진행 중**에는 고정(무엇을 노리는지 유지)하되, 런이 끝나는 순간에는
     *   성공(지급)이든 실패(5매치 미달)든 다음 예고를 새로 뽑는다.
     *   성공 경로는 지급(`placeBoardMissionReward`/`grantMissionReward`)이 이미 갈아끼우므로,
     *   여기서는 **실패한 시도**(매칭이 있었지만 미완성)만 재추첨한다 — 중복 교체 방지.
     *   매칭이 하나도 없던 런(뽑기만 누른 경우)은 시도가 아니므로 그대로 둔다.
     */
    if (!granted && filled > 0) this.rerollMissionPreview();
    this.comboColors = [];
    this.melodyStep = 0;
    this.comboCountText?.setText('+0');
  }

  /**
   * 연속 매칭 멜로디 — 매칭할 때마다 장조 음계를 한 음씩 올려 울린다(미부터 시작: 미파솔라시도레미…).
   *   melodyStep 이 음 인덱스(콤보가 끊기면 resetComboRun 에서 0으로). WebAudio 오실레이터 2개로 "띵-똥" 이중음 합성.
   */
  private playMatchNote(): void {
    if (LAB_SILENT) return; // 계측 모드 — 멜로디는 자체 AudioContext 라 마스터 음소거를 우회한다.
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctx = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      if (!this.audioCtx) this.audioCtx = new Ctx();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();
      // 장조 음계 반음 오프셋(도레미파솔라시) — 옥타브가 올라가며 계속 상승. 과도한 고음 방지로 3옥타브 상한.
      const MAJOR = [0, 2, 4, 5, 7, 9, 11];
      // 시작 음을 도(C)가 아닌 미(E, +4반음)로 올려 전체 멜로디를 장3도 위로 이조(더 밝게 시작).
      const BASE_SEMI = 4;
      const n = Math.min(this.melodyStep, 20);
      const semis = BASE_SEMI + 12 * Math.floor(n / 7) + MAJOR[n % 7];
      const freq = 261.63 * Math.pow(2, semis / 12); // C4 기준
      // "띵-똥" 이중음 — 짧은 어택 후 여운(서스테인)을 늘려 길게 울리는 한 음(tone)을 두 번 겹친다:
      //   띵 = 멜로디 음, 똥 = 완전4도 아래 음을 살짝 늦게(도어벨 느낌). 겹침 클리핑 방지로 피크는 낮춘다.
      const tone = (f: number, delay: number): void => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.09, t + 0.2); // 여운 유지
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.75);
      };
      tone(freq, 0); // 띵
      tone(freq * Math.pow(2, -5 / 12), 0.16); // 똥 — 완전4도 아래, 약간 뒤늦게
    } catch {
      /* 오디오 미지원/차단 시 무시 */
    }
  }

  /**
   * 매칭 성공 1건 기록 — 콤보 1 증가 = 현재 손님 주문 별 1개(무제한 누적, PO 2026-07-17).
   *   **손님은 별 5개를 넘어도 나가지 않고 매칭이 이어지는 한 계속 누적**(6,7,8…). 콤보가 끊길 때(endComboRun)만 정산·퇴장.
   *   **콤보 점수 동기 누적(판정용)** — 매치마다 초선형 가산. 좌측 게이지는 **콤보 중엔 변하지 않고**, 손님이 정산할 때
   *     쌓인 별이 게이지로 흡입되며(suckStarsIntoGauge) 그때 게이지가 오른다(핵심 연출). 5매치마다 미션 보상.
   */
  private pushMatch(suit: Suit): void {
    if (!this.chromeFromEditor) return;
    if (this.finished) return;
    this.playMatchNote(); // 연속 매칭 멜로디.
    this.melodyStep++;
    this.comboColors.push(suit);
    const n = this.comboColors.length;
    this.comboCountText?.setText(`+${n}`); // 'combo +N' 즉시.
    this.orderQueue?.onMatch(n); // 손님 말풍선에 별 무제한 누적(5 초과 시 큰별/작은별 탤리).
    // **축① 연속 콤보 가산**(판정 소스, 동기) — 런이 길수록 한 매치의 가산이 커진다(런 합은 초선형).
    //   더하기만 하므로 게이지가 **되감기지 않는다**(PO 2026-07-29).
    this.comboScore += matchGain(n);
    if (n % SET_SIZE === 0) this.missionTick(); // 5매치마다 미션 보상(손님 유지).
  }

  /** **미션 보상**(5매치 달성마다) — 예고 보상 지급 + 다음 보상 재추첨. 손님/콤보는 그대로 이어진다. */
  private missionTick(): void {
    this.setsDone += 1; // 레벨 클리어 별 판정(내부).
    this.labRun.missionTicks += 1;
    /*
     * **수집 상품은 여기서 깔린다**(PO 2026-08-23). 딜 때 미리 깔면 판이 시작되자마자 보여서
     *   "왜 저게 있지"가 되고, 미션(별 5개)과 아무 관계가 없어 보인다. 미션을 완성한 **보상으로**
     *   보드에 한 개 나타나고, 그 카드를 내야 실제로 회수된다 — 깔림과 회수가 둘 다 플레이어의 행동이다.
     *
     * 그 판의 상한은 `collectItemsForLevel`(레벨당 2~3개). 미션을 아무리 많이 완성해도 그 이상은 안 깐다.
     * ⚠️ 실측 미션 완성은 판당 1.73회(0회 12% · 1회 32% · 2회 34% …)라 실제 배치는 평균 약 1.56개다
     *   → 리그 완주 약 64판(PO 2026-08-23 승인). 40판으로 당기려면 `LEAGUE_TARGET_GAMES` 가 아니라
     *   **미션 완성 빈도**를 손대야 한다 — 상한을 올려도 완성 횟수가 천장이라 안 바뀐다.
     */

    this.tryTip('mission'); // 첫 미션 달성 — 보상 구조를 한 번 설명한다.
    /*
     * **여기서 지급하지 않는다**(PO 2026-08-24: "5개 이상 **최종 숫자가 확정되는 순간** 미션이 바뀌어야
     *   하고 지급시점도 이 시점"). 5매치는 콤보 런 **도중**의 통과점일 뿐이고, 그 런이 몇 매치로
     *   끝날지는 아직 모른다. 별 개수가 매칭 수로 정해지는 이상 **숫자가 확정된 뒤**에 줘야 한다.
     *   → 완성 횟수만 쌓아 두고, 콤보가 끊길 때(`endComboRun`) 확정된 수로 한꺼번에 지급한다.
     */
    this.pendingMissions += 1;
    sfx('set_complete');
  }

  /** **미션 보상 지급**(콤보 5 완성) — 예고된 보상을 재화/아이템으로 지급 + 다음 보상 재추첨·예고. */
  /**
   * **미션 보상 지급** — `endComboRun` 이 **매칭 수가 확정된 뒤에만** 부른다(PO 2026-08-24).
   * @param matched 그 콤보 런의 최종 매칭 수 — 보드로 가는 별 개수가 곧 이 값이다.
   */
  private grantMissionReward(matched: number): void {
    const rw = this.missionReward ?? this.rollMissionReward();
    // 실측 계측 — 미션 보상 종류별 지급 횟수/총량(별은 매칭 수가 곧 개수).
    const amt = rw.kind === 'stars' ? Math.max(SET_SIZE, matched) : rw.amount;
    this.labRun.missionKinds[rw.kind] = (this.labRun.missionKinds[rw.kind] ?? 0) + 1;
    this.labRun.missionAmounts[rw.kind] = (this.labRun.missionAmounts[rw.kind] ?? 0) + amt;
    const save = loadSave();
    let msg = '';
    let granted: CollectionSlot | null = null; // 컬렉션 카드를 실제로 지급했다면 그 슬롯(획득 연출용).
    let grantedEntry: BoardCollection | null = null; // 보드에 꽂혔으면 그 엔트리(연출 목적지 = 그 뱃지), 없으면 보관함.
    switch (rw.kind) {
      case 'stars':
      case 'collection':
      case 'cards': // 뽑기 추가 카드도 **보드에 꽂혔다가** 들어온다(PO 2026-08-24 재지적).
      case 'plus5': // ＋카드도 **보드에 꽂혔다가** 들어온다(PO 2026-08-24) — 바로 스톡에 넣지 않는다.
      case 'wild': // 와일드도 같은 길 — 예전엔 refillStock 이라 아무 것도 안 생기고 사라졌다.
        /*
         * **보드로 내려가는 보상은 미션이 완료된 바로 그 순간에 준다**(PO 2026-08-24).
         *   지급·연출·다음 예고 교체를 `placeBoardMissionReward` 가 한 번에 처리하므로 여기서는
         *   아래 공통 연출/재추첨을 타지 않고 즉시 빠져나간다.
         *   별 개수는 **지금까지 매칭한 수**(콤보 길이) — 길게 이어 5·10·15… 에서 완성할수록 많아진다.
         */
        this.placeBoardMissionReward(rw, Math.max(SET_SIZE, matched));
        this.updateBoosters();
        sfx('coin_burst', { volume: 0.3 });
        return;
      case 'undo': {
        // **되돌리기(리와인드)** — 보드에 꽂을 수 없는 부스터라 보유 아이템으로 바로 적립한다.
        //   부스터 라벨이 원문자(①②…)로 바뀌어 "몇 개 있는지"가 그 자리에서 보인다(updateBoosters).
        const it = itemsOf(save);
        it.undo += rw.amount;
        save.items = it;
        msg = `↩️ 되돌리기 +${rw.amount}`;
        break;
      }
      case 'diamond': // **다이아 → 게임완성 보상풀**(holdDiamond 이 pendingDiamonds 누적 + 보관 배지 — 레벨 클리어 시 지급).
        this.holdDiamond(rw.amount);
        msg = `💎 +${rw.amount} (완성 보상)`;
        break;

    }
    writeSave(save);
    this.header?.setCoins(this.baseCoins);
    // **보상 연출**(PO 2026-07-17) — 미션 아이콘에서 목적지로 별/재화가 튀어 날아간다.
    //   컬렉션 카드는 "무엇을 뽑았는지" 크게 보여주는 전용 연출(playCollectionCardReveal)로 대체.
    if (granted) this.playCollectionCardReveal(granted, grantedEntry);
    else this.missionRewardBurst(rw);
    this.updateBoosters();
    this.toast(`미션 보상  ${msg}`);
    sfx('coin_burst', { volume: 0.3 });
    // **다음 보상 예고**(지급을 마쳤으니 새로 뽑는다 — 완성 전까지는 절대 바뀌지 않는다).
    this.missionReward = this.rollMissionReward();
    this.showMissionPreview();
  }

  /**
   * **미션 보상 지급 연출**(PO 2026-07-17: 아이템을 크게 확대했다가 해당 위치로 이동) — 보상 아이콘 사본을
   *   MISSIONS 자리에서 **화면 중앙으로 크게 확대**(강조) → 잠깐 머문 뒤 **목적지(헤더·스톡·다이아 슬롯)로 축소 이동**.
   */
  private missionRewardBurst(rw: MissionReward, landing?: { x: number; y: number }, onArrive?: () => void): void {
    const img = this.missionRewardImg;
    const key = this.missionIconKey(rw);
    if (!img || !this.textures.exists(key)) return;
    /*
     * 목적지: 별=**실제로 꽂힌 그 카드 자리**(`landing`) · 다이아=완성풀 슬롯 · 카드류=스톡 더미.
     *
     * ⚠️ 별을 보드 **중앙**으로 보내면 안 된다(PO 2026-08-24) — 정작 별은 다른 카드에 꽂히므로
     *   연출과 결과가 어긋나 "어디로 갔지"가 된다. 꽂은 뒤 그 좌표를 받아 정확히 그 지점으로 보낸다.
     *   리그로 곧장 보내는 것도 금지 — 그러면 이미 받은 것으로 읽혀 회수할 이유가 사라진다.
     */
    const dst =
      rw.kind === 'stars' || rw.kind === 'plus5' || rw.kind === 'wild' || rw.kind === 'cards'
        ? (landing ?? { x: this.geom.cx, y: H * 0.5 })
        : rw.kind === 'diamond'
          ? this.diamondHoldTarget()
          : rw.kind === 'undo'
            ? this.boosterAnchor('undo') // 되돌리기는 그 부스터 버튼으로 빨려 들어간다.
            : { x: STOCK.x, y: STOCK.y };
    const big = this.add.image(img.x, img.y, key).setDepth(2200).setDisplaySize(56, 56);
    const src = texSize(big.texture);
    const bigW = 150; // 확대 크기(PO 2026-07-17: 너무 크지 않게 300→150).
    const bigH = bigW * (src.height / src.width);
    // ① 살짝 위로 확대(강조) — 과하지 않게.
    this.tweens.add({
      targets: big,
      x: img.x,
      y: img.y + 120,
      displayWidth: bigW,
      displayHeight: bigH,
      duration: 340,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ② 잠깐 머문 뒤 목적지로 축소 이동.
        this.tweens.add({
          targets: big,
          x: dst.x,
          y: dst.y,
          displayWidth: 44,
          displayHeight: 44 * (src.height / src.width),
          alpha: 0.85,
          delay: 300,
          duration: 620,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            big.destroy();
            if (this.scene.isActive()) onArrive?.(); // 도착한 **그 순간**에 보드의 별이 나타난다.
          },
        });
      },
    });
  }

  /**
   * **컬렉션 카드 획득 연출**(PO 2026-07-26: "획득하는 순간 어떤 카드를 뽑았는지 잠깐 연출로 보여주세요") —
   *   ① MISSIONS 예고 슬롯에서 카드가 튀어나와 화면 중앙에서 **크게 열린다**(빛+별 반짝임, 세트/장수 라벨)
   *   → ② 잠깐 머문 뒤 ③ 목적지로 축소되며 빨려 들어간다.
   *   목적지는 route 로 갈린다(2차 지시) — `board`=꽂힐 **보드 카드**(도착과 함께 보드 뱃지가 켜진다),
   *   `instant`=콜렉션 보관함(헤더 우측, 보드에 자리가 없어 즉시 지급된 경우).
   *   플레이를 오래 끊지 않도록 총 ~1.6초. 연출 중엔 딤이 입력을 막아 오조작(카드 오터치)을 방지한다.
   */
  private playCollectionCardReveal(slot: CollectionSlot, entry: BoardCollection | null = null): void {
    const key = collectionArtKey(slot.set, slot.card);
    if (!this.textures.exists(key)) return;
    const from = this.missionRewardImg ?? { x: 880, y: 470 };
    const cx = W / 2;
    const cy = H * 0.42;
    const DEPTH = 2500;

    // 입력 차단 겸 배경 딤 — **캔버스 전체**(세이프존이 아니라). 폭이 넓어지면 저작 크기로는 가장자리가 뚫린다.
    const fb = fullBleedBounds(this);
    const dim = this.add.rectangle(fb.x, fb.y, fb.w, fb.h, 0x120a1c, 0).setOrigin(0, 0).setDepth(DEPTH).setInteractive();
    /*
     * ⚠️ **카드만 보여 준다**(PO 2026-08-31 "배경 아웃라인과 여유를 없애고 카드만") — 예전에는 흰 바탕판
     *   (addCardBacking: 흰 라운드 사각 + 테두리 + 그림자)을 뒤에 깔았는데, 카드 아트 자체에 프레임이 있어
     *   **바깥으로 흰 여백과 외곽선이 한 겹 더** 보였다. 배킹 없이 아트 그대로 띄운다.
     */
    const card = this.add.image(from.x, from.y, key).setDepth(DEPTH + 2).setDisplaySize(60, 90).setAngle(-14);
    const src = texSize(card.texture);
    /*
     * 확대 시 카드 높이 — 620 → **480**(2026-08-31). 카드 아트를 이 연출 하나 때문에 원본 766px 로 상주시키면
     *   63장이 텍스처 93MB 를 먹어 부팅 예산을 넘긴다(ASTC 롤백 후 실측 184/160MB). 아트를 405px 로 낮추고
     *   연출도 480 으로 줄여 **확대율 1.18배**(거의 티 안 남)로 맞춘다. ⚠️ 이 값을 올리면 카드가 흐려진다.
     */
    const bigH = 400; // 480 → 400(2026-08-31): 카드 아트를 211×320 으로 더 낮췄다(PO 승인). 확대율 1.25배.
    const bigW = bigH * (src.width / src.height);
    // 뒤에서 도는 광채(원형) — 텍스처 없이 그래픽으로 그린다(에셋 의존 없음).
    const glow = this.add.graphics().setDepth(DEPTH + 1).setPosition(cx, cy).setAlpha(0);
    glow.fillStyle(0xffe9a0, 0.18);
    glow.fillCircle(0, 0, bigH * 0.62);
    glow.fillStyle(0xfff6d0, 0.14);
    glow.fillCircle(0, 0, bigH * 0.44);

    // 보드 투입이면 "아직 내 것이 아니다" — 지금 몇 장인지가 아니라 **무엇을 해야 하는지**를 알려준다.
    // **조각 수집**(PO 2026-08-30) — 카드 1종은 조각 10개로 완성된다. 몇 조각째인지를 보여 준다.
    const pieces = cardCount(collectionOf(loadSave()), slot.set, slot.card);
    const titleText = entry ? '컬렉션 조각 등장!' : '컬렉션 조각 획득!';
    const subText = entry ? '보드 카드에서 열면 내 콜렉션으로!' : `${slot.set}번 콜렉션 · 조각 ${Math.min(CARD_COMPLETE_COUNT, pieces)}/${CARD_COMPLETE_COUNT}${pieces >= CARD_COMPLETE_COUNT ? ' 완성!' : ''}`;
    const title = this.add
      .text(cx, cy - bigH / 2 - 66, titleText, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '64px', color: '#ffe27a', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(DEPTH + 3)
      .setAlpha(0);
    title.setStroke('#4a2a10', 10);
    title.setShadow(2, 4, '#000000', 6, false, true);
    const sub = this.add
      .text(cx, cy + bigH / 2 + 54, subText, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '42px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(DEPTH + 3)
      .setAlpha(0);
    sub.setStroke('#4a2a10', 8);

    const cleanup = (): void => {
      this.tweens.killTweensOf([card, glow, title, sub, dim]); // 무한 반복(광채 회전) 트윈이 남지 않게 먼저 정리.
      card.destroy();
      glow.destroy();
      title.destroy();
      sub.destroy();
      dim.destroy();
    };

    sfx('gauge_full', { volume: 0.6 });
    this.tweens.add({ targets: dim, fillAlpha: 0.62, duration: 220 });
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 260, delay: 200 });
    this.tweens.add({ targets: glow, alpha: 1, duration: 300, delay: 120 });
    this.tweens.add({ targets: glow, angle: 360, duration: 6000, repeat: -1 }); // 천천히 도는 광채.
    // ① 예고 슬롯 → 중앙으로 커지며 열림(살짝 오버슈트).
    this.tweens.add({
      targets: card,
      x: cx,
      y: cy,
      displayWidth: bigW,
      displayHeight: bigH,
      angle: 0,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.collectionRevealSparkles(cx, cy, bigW, bigH, DEPTH + 4);
        sfx('star', { volume: 0.5 });
        // ② 잠깐 머문 뒤 ③ 보관함(헤더 우측)으로 축소 흡입.
        this.tweens.add({
          targets: [title, sub, glow],
          alpha: 0,
          delay: 640,
          duration: 240,
        });
        this.tweens.add({ targets: dim, fillAlpha: 0, delay: 700, duration: 380 });
        // 목적지 — 보드 투입이면 꽂힐 보드 카드 자리, 아니면 보관함(헤더 우측).
        //   ⚠️ **그 카드 전용 뱃지**를 가리켜야 한다 — 동시에 여러 장이 꽂혀 있을 수 있어(PO 2026-07-29)
        //      "현재 보드 컬렉션" 같은 전역 참조를 쓰면 엉뚱한 카드로 날아간다.
        const badge = entry && !entry.opened ? entry.view : undefined;
        const dst = badge ? { x: badge.x, y: badge.y, w: badge.displayWidth, angle: badge.angle } : { x: COLLECTION_STORE_TARGET.x, y: COLLECTION_STORE_TARGET.y, w: 44, angle: 22 };
        this.tweens.add({
          targets: card,
          x: dst.x,
          y: dst.y,
          displayWidth: dst.w,
          displayHeight: dst.w * (src.height / src.width),
          angle: dst.angle,
          alpha: badge ? 1 : 0.2,
          delay: 660,
          duration: 560,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            cleanup();
            if (badge) {
              // 보드 뱃지 점등 — 날아온 카드가 그대로 보드에 꽂힌 것처럼 이어붙인다.
              badge.setAlpha(1);
              entry!.armed = true; // 이제부터 수집 트리거 가능.
              this.tweens.add({ targets: badge, scaleX: '*=1.18', scaleY: '*=1.18', duration: 150, yoyo: true, ease: 'Quad.easeOut' });
              sfx('card_deal');
              // ⚠️ 여기서 즉시 수집하지 않는다 — 꽂힌 카드는 **플레이어가 그 카드를 낼 때까지** 보드에 남아
              //   있어야 한다(PO 2026-07-27). 수집 트리거는 onCardTap 이 담당.
              //   단, 뱃지가 날아오는 동안 이미 그 카드를 냈다면 여기서 바로 이어 수집한다.
              if (entry!.played) {
                entry!.played = false;
                this.triggerCollectionOpen(entry!);
              }
            }
          },
        });
      },
    });
  }

  /**
   * **보드 컬렉션 카드 수집 연출**(PO 2026-07-26 2차: "일반적인 카드 오픈보다 1.5배 커졌다가 스타게이지 쪽으로
   *   빨려 들어간다") — 꽂혀 있던 컬렉션 카드가 ① 보드 카드 크기의 **1.5배**로 팝(살짝 부양·수평 복귀)
   *   → ② 스타게이지 중앙으로 회전·축소하며 흡입 → ③ 보관(pendingCollection). 확정 지급은 승리 정산.
   *   호출 시점 = **꽂힌 보드 카드를 낸 순간**(onCardTap) — 노출 감지가 아니다(PO 2026-07-27).
   */
  private triggerCollectionOpen(bc: BoardCollection): void {
    if (bc.opened) return;
    bc.opened = true;
    this.boardCollections.delete(bc.slotId); // 슬롯 해제 — 이 자리에 다음 카드가 꽂힐 수 있게(즉시).

    const img = bc.view;
    img.setAlpha(1).setDepth(1600); // 연출 동안 카드 위로.
    // 컬렉션 카드도 위클리 수집 대상(PO 2026-08-24) — 판에서 모은 아이템이면 무엇이든 센다.
    this.creditEventFromPlay(1, { x: img.x, y: img.y }, 'collection');
    const openW = this.geom.cardH * (img.displayWidth / img.displayHeight) * 1.5; // 카드 오픈 크기의 1.5배.
    const openH = this.geom.cardH * 1.5;
    sfx('star', { volume: 0.6 });
    this.tweens.add({
      targets: img,
      displayWidth: openW,
      displayHeight: openH,
      y: img.y - 40,
      angle: 0,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.collectionRevealSparkles(img.x, img.y, openW, openH, 1601);
        // ② 스타게이지(좌측 5별)로 흡입.
        const target = this.gaugeGeom.width > 0 ? { x: this.gaugeGeom.left + this.gaugeGeom.width / 2, y: this.gaugeGeom.y } : { x: 250, y: GAUGE_STAR_Y };
        this.tweens.add({
          targets: img,
          x: target.x,
          y: target.y,
          displayWidth: openW * 0.24,
          displayHeight: openH * 0.24,
          angle: 380,
          alpha: 0.85,
          duration: 620,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            img.destroy();
            this.holdCollectionCard(bc.card);
          },
        });
      },
    });
  }

  /**
   * **컬렉션 카드 보관**(미확정) — 스타게이지에 흡입된 카드를 pendingCollection 에 쌓는다.
   *   다이아(holdDiamond)와 같은 모델로 **승리 시에만** finishMission 이 save 에 확정한다.
   */
  private holdCollectionCard(card: CollectionSlot): void {
    this.pendingCollection.push(card);
    this.labRun.collection += 1;
    this.labRun.collectionCards.push(`${card.set}-${card.card}`);
    // 게이지 별들이 한 번 커졌다 돌아오며 "여기에 담겼다"를 알린다.
    for (const st of this.comboStars) {
      if (!st) continue;
      this.tweens.add({ targets: st, scaleX: '*=1.25', scaleY: '*=1.25', duration: 130, yoyo: true, ease: 'Quad.easeOut' });
    }
    sfx('gauge_full', { volume: 0.5 });
    this.toast(`🗂 컬렉션 카드 확보! 클리어하면 콜렉션에 추가돼요 (${this.pendingCollection.length}장)`);
  }

  /** 획득 연출 반짝임 — 카드 테두리에서 별이 사방으로 퍼졌다 사라진다(텍스처 없으면 생략). */
  private collectionRevealSparkles(cx: number, cy: number, w: number, h: number, depth: number): void {
    const STAR_KEY = 'up_Solitare_UI_02_v2';
    if (!this.textures.exists(STAR_KEY)) return;
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const r0 = Math.min(w, h) * 0.42;
      const s = this.add
        .image(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, STAR_KEY)
        .setDepth(depth)
        .setDisplaySize(46, 46)
        .setAlpha(0.95);
      this.tweens.add({
        targets: s,
        x: cx + Math.cos(a) * (r0 + Phaser.Math.Between(90, 190)),
        y: cy + Math.sin(a) * (r0 + Phaser.Math.Between(90, 190)),
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        displayWidth: 14,
        displayHeight: 14,
        duration: Phaser.Math.Between(520, 760),
        delay: i * 26,
        ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  /**
   * 레벨 클리어 정산 — 게이지로 얻은 별 수(1~3)만큼 코인 지급 + 진행 레벨 +1, 승리 연출 후 보상 팝업.
   *   (게임 종료 = 보드 전멸뿐. 이 함수는 checkEnd 승리 분기에서만 호출된다.)
   */
  private finishMission(stars: number): void {
    if (this.finished) return;
    this.finished = true;
    endPlaySession(); // 끝까지 마쳤다 — 지급된 보상은 그대로 확정.
    this.ended = true;
    this.cancelWild();
    const s = Math.min(SETS_TARGET, Math.max(1, stars));
    // **남은 카드는 코인이 아니라 스타포인트로 반영**(PO 2026-07-17 일원화) — checkEnd 에서 이미 콤보 점수(별)로 가산.
    //   따라서 코인 보상은 별 등급 코인만(카드당 100/보너스 폐지).
    const leftover = this.state.stock.length;
    const coins = starCoinsAt(this.level, s, this.chMult);
    this.labRun.stars = s; // 실측: 이 판의 최종 별 등급과 지급 코인.
    this.labRun.coins = coins;
    /*
     * **일일 유저 지표**(PO 2026-08-25) — 완주 판만 집계한다(중단 판은 보상이 회수되므로 원장과 일관).
     *   중간 보상(리그/위클리/티어)은 labRun 분해값으로 넣어 하루 단위 원장 어휘를 유지한다.
     */
    bumpMetrics({
      games: 1, wins: 1, starsSum: s, cleanWins: this.plus5Uses === 0 ? 1 : 0,
      starCoins: coins, plus5: this.labRun.boosterCoins,
      leagueCoins: this.labRun.leagueCoins, eventCoins: this.labRun.eventCoins, tierCoins: this.labRun.tierCoins,
      leagueStars: this.labRun.leagueStars, eventItems: this.labRun.eventItems,
      missionTicks: this.labRun.missionTicks, boardDiamonds: this.labRun.diamonds,
      pinch: this.labRun.pinch, levelMax: this.level,
    });
    /**
     * **판 결과 별(1~5)을 투데이 리그에 합산한다**(PO 2026-08-24).
     *
     * 리그는 두 곳에서 별을 받는다:
     *   ① 플레이 중 — 미션(5매치) 보상으로 보드에 꽂혔다가 회수된 별(1~10개)
     *   ② 판 끝 — 여기, 이 판의 **등급 별**(1~5)
     * 잘 이어 낸 판(①)과 잘 끝낸 판(②)이 둘 다 리그로 모인다.
     *
     * ⚠️ 주간 이벤트는 여기서 **적립하지 않는다** — 손님이 3개 이상 모으고 떠날 때만 오른다
     *   (`creditEventFromCustomer`). 승리 시에도 올리면 같은 행동을 두 번 보상하게 된다.
     */
    /*
     * **클리어 정산**(PO 2026-08-30 — 보너스 게임 승리 1판과 같은 자) — `economyRules.clearRewardsForGrade`.
     *   예전엔 등급 별(1~5)만 더했는데, 보너스 승리 1판이 리그 별 ≈41 을 주는 것과 열 배 어긋나 있었다.
     *   리그 별은 판 중 모은 별과 함께 아래에서 한 번에 적립되고, 다이아·컬렉션 카드는 보관분에 합쳐 확정된다.
     */
    const clear = clearRewardsForGrade(s);
    this.pendingStars += clear.leagueStars;
    this.labRun.leagueStars += clear.leagueStars;
    this.pendingDiamonds += clear.diamonds;
    mirrorClearReward(s, this.level, this.chMult); // 서버 원장 미러링(추가만, 로컬 권위는 그대로) — 2026-09-01.
    mirrorRoundReport(this.level, s); // 리그 밴드 집계 신고(P2, 순위표 표시는 여전히 로컬) — 2026-09-01.
    for (let i = 0; i < clear.collectionCards; i++) {
      const slot = this.pickCollectionSlot(); // 아트가 준비된 카드 중 가중 랜덤(보유 여부 무관 — 중복은 보유 수로 쌓인다).
      if (slot) this.pendingCollection.push(slot);
    }
    const starsToPay = this.pendingStars;
    const leagueBefore = leagueStageOf(loadSave()); // 게이지 출발점 — **적립 전**에 읽어야 한다.
    /*
     * **보관해 둔 별·이벤트 아이템을 여기서 확정한다**(PO 2026-08-30). 판 중에는 연출만 했다.
     * ⚠️ 아래 `loadSave()` 스냅샷을 뜨기 **전에** 불러야 한다 — 이 함수가 스스로 저장하므로,
     *   뒤에 부르면 그 결과를 이 스냅샷의 `writeSave` 가 통째로 되돌린다(리그 정산에서 겪은 사고와 동일).
     */
    const settled = this.settleRoundCollectibles();
    /*
     * 리그로 들어가는 연출은 **결과 화면을 확인한 뒤**에 돈다(PO 2026-08-30 "최종 결과 표시후 각각의
     *   해당 공간으로 수집"). 코인·다이아가 카운터로 빨려 들어가는 그 순간과 같은 자리다 — 결과 팝업의
     *   버튼을 누를 때 한 번(`go`). 여기서는 무엇을 얼마나 보낼지만 적어 둔다.
     */
    this.payoutStars = starsToPay;
    this.payoutLeagueBefore = leagueBefore;
    const gotDiamonds = this.pendingDiamonds; // **승리 시에만** 보관 다이아 확정.
    const gotCards = [...this.pendingCollection]; // 보드에서 열어 스타게이지에 담아둔 컬렉션 카드(승리 시 확정).
    const save = loadSave();
    save.coins += coins;
    save.diamonds = (save.diamonds ?? 0) + gotDiamonds; // 코인과 함께 다이아 확정.
    void settled; // 정산분(코인·다이아)은 settleRoundCollectibles 가 이미 저장에 반영했다 — 여기서 또 더하지 않는다.
    // **컬렉션 카드 확정** — 보드에서 오픈해 확보한 카드들을 이제서야 보유로 기록한다(게임플레이 보상).
    if (gotCards.length) {
      let cstate = collectionOf(save);
      for (const c of gotCards) cstate = grantCard(cstate, c.set, c.card);
      save.collection = cstate;
    }
    // 다음 레벨(진행도) — 저작 풀(this.editorLevels)을 넘어도 순환 재사용되므로 여기선 진행도 상한만 클램프.
    save.level = Math.min(MAX_PROGRESS_LEVEL, Math.max(save.level, this.level + 1));
    // **플레이 = 장사**(PO 2026-07-29) — 접속만 해 두는 시간 적립보다 판을 깨는 쪽이 더 벌어야 한다.
    //   한 판 클리어 매출을 점포 수금함에 얹는다(별 등급 비례). 상한은 그대로라 받아야 다시 쌓인다.
    const incomeCap = incomePerPeriod(econ(), entryFeeFor(this.level, this.chMult), save.builtFloors);
    save.storeIncomeBank = addToBank(save.storeIncomeBank ?? 0, playIncomeFor(incomeCap, s), incomeCap).bank;
    // **미션 리워드는 여기서 더 이상 적립하지 않는다**(PO 2026-07-18 3차 수정) — 손님을 정산할 때마다
    //   creditMissionStars 가 이미 실시간으로 저장까지 확정한다(마지막 손님 몫도 checkEnd 의 endComboRun 이
    //   이 함수보다 먼저 정산한다). 여기서는 그 결과가 저장에 반영돼 있는지 배너만 다시 동기화한다.
    this.refreshEventBanner(); // 배너는 **주간 이벤트** 하나만 보여 준다(티어 숫자로 덮지 않는다).
    writeSave(save);
    backupTowerSnapshot(save); // 타워/컬렉션 등 G2 상태 서버 백업(스로틀됨, fire-and-forget) — 2026-09-01.
    this.baseCoins += coins; // 미션 보상 박스 코인은 creditMissionStars 가 발생 시점에 이미 반영했다.
    this.pendingDiamonds = 0; // 확정 후 보관분 비움(중복 지급 방지).
    this.pendingCollection = []; // 컬렉션 카드도 동일(중복 지급 방지).
    sfx('win_fanfare'); // 승리 카드 연출 팡파레.
    sfxWinSting(); // 정산 스팅 레이어.
    if (coins > 0) sfx('coin_burst', { volume: 0.25 }); // 코인 보상 쏟아짐(볼륨 하향).
    this.winScatter(() => this.showMissionReward(s, coins, gotDiamonds, { leftover, collectionCards: gotCards }));
  }


  /**
   * **넥스트(다음 레벨) 진입 팝업**(PO 2026-07-19: "게임비를 지급하는 팝업화면은 동일하므로 타워화면에서
   *   재사용하라") — entryPopup.ts(blank.json SSOT, 홈의 "계속하기" 팝업과 완전히 동일한 화면)를 그린다.
   *   PLAY 에서 게임비 차감 후 다음 레벨 시작 — 무료 입장 없음. 홈에는 없는 "🏠 홈으로"(취소) 링크만 추가.
   */
  private enterNextLevel(): void {
    const next = this.level + 1;
    /*
     * ⛔ **10레벨마다 끼어들던 보너스 라운드(`10-1`)는 없앴다**(PO 2026-08-29).
     *   메인 진행을 끊었고 레벨 번호 체계가 한 겹 늘어(10 → 10-1 → 11) 읽기 어려웠다.
     *   지금은 **홈 좌측 '보너스 게임' 아이콘**으로 언제든 들어가고, 이기면 코인을 받는다
     *   (하루 판수 제한 — `logic/bonusGame.ts`). 여기서는 곧장 다음 메인 레벨로 간다.
     */
    const handle = buildEntryPopup(this, {
      level: next,
      initialMult: this.chMult, // 직전 도전 배수 유지(해금 범위 밖이면 자동 보정).
      toast: (msg) => this.toast(msg, true), // 팝업 메시지는 항상 표시.
      onPlay: ({ level: lv, mult }) => this.scene.start('play', { level: lv, mult }),
      onHome: () => this.scene.start('home'), // 팝업 하단 홈 버튼(공용 모듈이 그린다).
    });
    if (!handle) this.enterNextLevelFallback(next);
  }

  /** blank.json 미저작 시 폴백 — 최소한의 코드 드로우(레벨·게임비·PLAY/홈만). */
  private enterNextLevelFallback(next: number): void {
    const layer = overlayLayer(this, 4000);
    const scrim = overlayScrim(this, 0x140a1e, 0.88);
    layer.add(scrim);
    const cx = W / 2;
    const top = 760;
    layer.add(this.add.rectangle(cx, top + 420, 900, 900, 0xfff3e0).setStrokeStyle(10, 0xe0b070));
    layer.add(this.add.text(cx, top + 90, `lv ${next}`, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '72px', color: '#7a4a1a', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5));
    for (let i = 0; i < 3; i++) {
      if (this.textures.exists('up_Solitare_UI_02_v2')) layer.add(this.add.image(cx + (i - 1) * 100, top + 210, 'up_Solitare_UI_02_v2').setDisplaySize(84, 84));
    }
    const costText = this.add.text(cx, top + 560, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '44px', color: '#7a4a1a' }).setOrigin(0.5);
    layer.add(costText);
    const mult = Math.min(this.chMult, Math.max(...challengeOptions(next).filter((o) => o.unlocked).map((o) => o.mult))); // 직전 배수 유지(해금 범위 내).
    const fee = entryFeeFor(next, mult);
    const ok = loadSave().coins >= fee;
    costText.setText(`COST  🪙 ${fee.toLocaleString()}`).setColor(ok ? '#7a4a1a' : '#c0392b');
    const playBg = this.add.rectangle(cx, top + 700, 520, 130, 0x4caf50).setStrokeStyle(8, 0xffffff).setInteractive({ useHandCursor: true });
    layer.add(playBg);
    layer.add(this.add.text(cx, top + 700, 'PLAY', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '60px', color: '#ffffff', stroke: '#2a6a2a', strokeThickness: 6 }).setOrigin(0.5));
    playBg.on('pointerdown', () => {
      const s = loadSave();
      if (s.coins < fee) {
        sfx('no_coin');
        bumpMetrics({ pinch: 1 }); // 일일 지표 — 입장료 핀치.
        this.toast('코인이 부족해요 — 홈에서 점포 수익을 수령해 보세요');
        return;
      }
      sfx('floor_select');
      bumpMetrics({ fee, starts: 1 }); // 일일 지표 — 다음 판 입장료.
      s.coins = Math.max(0, s.coins - fee);
      writeSave(s);
      layer.destroy();
      this.scene.start('play', { level: next, mult });
    });
    // 보조 액션도 **공용 버튼 아트**로(ui/uiButton.ts) — 맨 텍스트 링크만 남으면 같은 팝업 안에서 격이 달라 보인다.
    layer.add(
      uiButton(this, cx, top + 830, '🏠 홈으로', 'red', () => {
        sfx('level_close');
        this.scene.start('home');
      }, { width: 380, fontSize: 38 }),
    );
  }

  /**
   * 레벨 클리어 결과 팝업 — **에디터 저작 `blank_2.json`(결과화면) 그대로**(resultPopup.ts, 2026-08-30).
   *   그리기는 모듈이 하고, 여기는 값(별·코인·다이아·리그 별·컬렉션 카드)을 넘기고 **넥스트/홈을 누른 뒤의
   *   보상 회수 연출**(코인·다이아 입자가 흩어져 떨어졌다가 상단 헤더로 빨려 올라감)과 이동만 맡는다.
   *   ⚠️ 저작 문서·프레임 아트가 없으면(캐시 미적재) 연출 없이 바로 홈으로 — 보상 적립은 이미 끝나 있다.
   */
  private showMissionReward(
    stars: number,
    coins: number,
    diamonds: number,
    extra?: { leftover: number; collectionCards?: readonly CollectionSlot[] },
  ): void {
    void extra?.leftover; // 남은 카드 → 별 전환 안내는 결과화면에 쓰지 않는다(PO 2026-08-30).
    const cardKeys = (extra?.collectionCards ?? []).map((c) => collectionArtKey(c.set, c.card));
    const hasNext = this.level + 1 <= MAX_PROGRESS_LEVEL;
    // **보상 회수 연출은 이 화면에서 딱 한 번**(PO 2026-07-29) — 넥스트로 진입 팝업을 띄웠다가 ✕ 로 돌아오면
    //   이 결과 화면이 다시 보이는데, 그때마다 버스트가 재생되면 "받은 적 없는 보상을 또 받는" 그림이 된다.
    let rewardsCollected = false;
    let handle: ReturnType<typeof buildResultPopup> = null;
    const leagueStars = this.payoutStars; // 팝업에 적힌 값 — 회수 연출은 이 개수를 날린다.
    const go = (fn: () => void): void => {
      if (rewardsCollected || !handle) {
        fn(); // 두 번째부터는 연출 없이 곧바로 이동.
        return;
      }
      rewardsCollected = true;
      /*
       * **보관해 둔 별을 여기서 리그로 보낸다** — 코인·다이아가 카운터로 빨려 들어가는 것과 같은 순간
       *   (PO 2026-08-30 "최종 결과 표시후 각각의 해당 공간으로"). 적립 자체는 이미 끝났고 이건 연출이다.
       */
      let starsSent = false;
      if (this.payoutStars > 0 && this.payoutLeagueBefore) {
        starsSent = true;
        const hold = this.starHold;
        this.playLeagueStarPayout(this.payoutStars, this.payoutLeagueBefore, handle.starAt);
        this.payoutStars = 0;
        this.payoutLeagueBefore = undefined;
        // 보관 배지는 비운다 — 보낸 뒤에도 "+N" 이 남아 있으면 아직 안 준 것처럼 보인다.
        hold?.icon.destroy();
        hold?.text.destroy();
        this.starHold = undefined;
      }
      // **전부 회수**(공용 rewardCollect) — 코인·다이아·별·컬렉션 카드가 각자의 자리로 날아간 뒤 이동.
      //   별은 위에서 리그 게이지 계단 연출로 보냈으면 건너뛴다(중복 방지).
      //   ⚠️ 예전엔 여기서 **미션 완료(아이템 박스) 팝업**을 한 장 더 띄웠다 — PO 2026-08-23 지시로 제거.
      collectResultRewards(
        this,
        handle,
        { coins, diamonds, stars: leagueStars, starsHandledByCaller: starsSent },
        {
          coin: this.header?.coinAnchor ?? { x: 360, y: 90 },
          gem: this.header?.diamondAnchor ?? { x: W - 260, y: 90 },
          star: this.leagueIconAt ?? { x: W - 100, y: 250 },
          card: COLLECTION_STORE_TARGET,
        },
        fn,
      );
    };
    // 결과화면 아트는 **지연 그룹 `result`**(부팅 상주에서 뺐다, 2026-08-30 예산 164/160MB) — 판 시작 때 미리받기
    //   했으므로 대개 즉시 열리고, 못 맞췄으면 잠깐 로딩 표시 뒤 연다(대기 구간에 표시가 없으면 "안 열린다"로 읽힌다).
    {
      handle = buildResultPopup(this, {
        stars,
        coins,
        diamonds,
        leagueStars: this.payoutStars,
        cardKeys,
        hasNext,
        onHome: () => go(() => this.scene.start('home')),
        onNext: () => go(() => this.enterNextLevel()),
      });
      if (!handle) {
        console.warn('[result] 결과화면 저작(blank_2.json)을 그릴 수 없어 홈으로 이동');
        this.scene.start('home');
      }
    }
  }

}
