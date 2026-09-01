/**
 * PlayKlondikeScene.ts — **클론다이크(고전 솔리테어) 10레벨 보너스 라운드**(2026-07-19 PO).
 *
 * PO 지시 요약: "10레벨 단위로 프리셀을 배치하라" → "이게임을 프리셀대신 삽입하라"(Klondike 스크린샷,
 *   Microsoft Solitaire 참조) → "게임은 이와 같은 구조이다. 왼쪽 상단에서 카드가 뒤집히면서 나타나는
 *   카드를 교차로 하단으로 배치하는 구조이다"(스톡→웨이스트→태블로) → "10레벨 단위로 배치한다"(레벨
 *   10·20·30…, src/logic/klondike.ts 의 `hasBonusAfter`) → 스톡 드로우 "처음에는 한장씩 나중에는
 *   3장씩"(`drawCountForLevel`) → 조작은 **드래그앤드롭**, 승리 별점은 **고정 3★**(미션리워드 파이프라인과
 *   동일 스케일) → "프리셀에서는[=이 보너스 라운드에서는] 되돌리기 아이템 외에는 와일드카드나 +카드
 *   아이템이 없다" — 이 씬은 되돌리기만 제공하고 와일드/+5 부스터는 아예 배선하지 않는다.
 *
 * 별도 Scene 인 이유: PlayScene 은 TriPeaks 전용 상태(와일드/보너스 슬롯·콤보 게이지·손님 등)에 깊이
 *   결합된 단일 3000+줄 씬이라 그 안에 모드 분기를 넣기보다 새 씬이 훨씬 안전하다(2026-07-19 조사 결론).
 *   카드 렌더(CardView)·상단 헤더(topHeader.ts)·진입/다음레벨 팝업(entryPopup.ts)·되돌리기 가격
 *   (econRuntime.ts)·미션리워드 적립(missionReward.ts)은 기존 모듈을 그대로 재사용한다.
 *
 * 로직은 src/logic/klondike.ts(Phaser-free, 순수)에 전부 있다 — 이 씬은 그 상태를 그리고 입력을 받아
 *   move 로 변환할 뿐, 규칙 판정은 하지 않는다.
 *
 * ⚠️ **보너스 라운드**(PO 2026-07-27 "반드시 완료하지 않고도 다음 레벨로 넘어갈 수 있다") — 이 씬의
 *   `level` 은 **직전에 클리어한 메인 레벨**(10·20·30…)이고 화면에는 `10-1` 로 표시된다. 진입은 무료
 *   (게임비 없음)이고, 이기든 ✕로 건너뛰든 **똑같이 다음 메인 레벨 진입 팝업**으로 나간다. 레벨 진행은
 *   PlayScene 이 메인 레벨을 클리어할 때 이미 확정돼 있어, 이 라운드의 결과는 진행에 영향을 주지 않는다.
 */
import Phaser from 'phaser';
import { CardView } from './cardView.js';
import { openItemShop } from './itemShop.js';
import {
  drawFromStock,
  recycleWaste,
  canMove,
  applyMove,
  isWon,
  TABLEAU_COLS,
  type KlondikeState,
  type KlondikeMove,
  type MoveSource,
  type MoveDest,
} from '../logic/klondike.js';
import { dealKlondikeForLevel } from '../logic/klondikeDifficulty.js';
import { canAutoComplete, planAutoComplete, type AutoStep, type AutoStepKind } from '../logic/klondikeAuto.js';
import { isRed, suitSymbol, type Card, type Rank, type Suit } from '../logic/types.js';
import { loadSave, writeSave, itemsOf, missionRewardOf, collectionOf, loadTipsSeen, markTipSeen, type SaveData } from '../save.js';
import { COLLECTIBLE_SETS, grantCard, pickRandomCard, type CollectionSlot } from '../logic/collection.js';
import { collectionArtKey } from './collectionPopup.js';
import { UI_RESULT_KEY, UI_RESULT_PATH, buildResultPopup } from './resultPopup.js';
import { collectResultRewards } from './rewardCollect.js';

import { buildTopHeader, type TopHeader } from './topHeader.js';
import { buildMissionRewardBanner } from './missionRewardBanner.js';
import { anchorDoc, buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { SAFE_W } from '../logic/responsiveFrame.js';
import { currentStore } from '../logic/currentStore.js';
import { DYNAMIC_NODE_IDS } from './PlayScene.js';
import { undoPriceAt, circledCount, setEconFromJson, ECON_JSON_KEY, ECON_JSON_URL } from '../econRuntime.js';
import { loadGameAssets, CARD_BACK_KEY, UI_MAIN_KEY, uploadPath, texSize } from '../assets.js';
import { BONUS_PLAYS_PER_DAY, BONUS_PAID_FEE, BONUS_DRAW_COUNT, bonusWinCoins, bonusTimeLimitForWins, rollBonusBoardDiamond, toBonusMode, toBonusTimed, type BonusMode } from '../logic/bonusGame.js';
import { CIVIC_DESKS, DESK_ROUND_BONUS, DESK_ROUND_CAP, type CivicDesk } from '../logic/civicDesks.js';
import { animateClerkIdle } from './clerkIdle.js';
import { creditEventItems, creditLeagueStars } from '../logic/collectRuntime.js';
import { bonusLeft, bonusFee, startBonusPlay, bonusTimeLimitSec, recordBonusTimeWin } from '../logic/bonusRuntime.js';
import { bonusRoundStars, bonusStarsPreview } from '../logic/bonusStars.js';
import { rollBonusMissionRewardAvoiding } from '../logic/economyRules.js';
import { EMPTY_ROUND_REWARDS, addRewards, type RoundRewards } from '../logic/roundRewards.js';
import { GAUGE_STAR_XS, GAUGE_STAR_Y, GAUGE_STAR_SZ } from '../ui/gaugeGeom.js';
import { OrderQueue } from './orderQueue.js';
import { preloadCustomers, registerCustomerFrames } from './customers.js';
/** 되돌리기 **아이템 아이콘** — 메인 솔리테어의 부스터와 같은 아트(PlayScene BOOSTER_ICON.undo). */
const UNDO_ITEM_KEY = 'up_Solitare_UI_07-1';
/** 보드 다이아 아트 — 메인 게임(PlayScene.placeDiamonds)과 **같은 키**를 쓴다. */
const DIAMOND_KEY = 'up_Solitare_UI_2_2';
/** 리그 별 아트 — 메인과 동일(게이지 별과 같은 그림). */
const LEAGUE_STAR_KEY = 'up_Solitare_UI_02_v2';
const DIAMOND_SIZE = 84; // 62 → 84(PO 2026-08-30 "보드에 배치되는 다이아·별·카드가 너무 작다"). 핀(다이아·별·컬렉션) 공통 크기.
/** 젬이 카드 **아래로 삐져나오는** 양(px) — 이만큼만 보이고 나머지는 카드 뒤에 숨는다. */
const DIAMOND_PEEK = 36; // 크기에 비례해 삐져나오는 양도 26 → 36.
/** 카드 **뒤**로 넣는 깊이차(메인 게임 BADGE_BEHIND 와 같은 규약) — 카드가 치워져야 드러난다. */
const DIAMOND_BEHIND = 0.3;
/** 컬렉션 핀 카드 폭(px) — 실제 카드 아트(505×766)를 이 폭으로(카드 아래로 길게 삐져나온다). */
const PIN_CARD_W = 66;
/** 주문 1건 = 연속 매칭 5회(메인 솔리테어 MISSION_SET_SIZE 와 같은 값). */
const ORDER_SIZE = 5;
/** 보너스 라운드 미션 보상 아이콘 — 메인 솔리테어(PlayScene MISSION_ICON)와 **같은 아트**. */
type BonusMissionKind = 'stars' | 'diamond' | 'collection';
/** 보드 카드 뒤에 끼운 보상 하나. */
interface BoardPin {
  readonly col: number;
  readonly cardId: string;
  readonly view: Phaser.GameObjects.Image;
  readonly kind: BonusMissionKind;
  readonly amount: number;
  /** 컬렉션 핀만 — **꽂을 때 미리 굴린 카드**(PO 2026-08-31). 회수·승리 시 이 카드가 그대로 지급된다. */
  readonly slot?: CollectionSlot;
}
const BONUS_MISSION_ICON: Record<BonusMissionKind, string> = {
  stars: 'up_Solitare_UI_02_v2',
  diamond: DIAMOND_KEY,
  collection: 'up_CollecttionCard_Frame',
};
import { preloadAudio, sfx, cycleVolume, volumeLabel } from '../audio.js';
import { hapticsLabel, toggleHaptics } from '../haptics.js';
import { SAFE_H as H, SAFE_W as W } from '../logic/responsiveFrame.js';
import { MAIN_ANCHOR } from '../ui/mainPins.js';
import { viewBounds, fullBleedBounds, coverScale as coverScaleFor, startCountdown } from '@casual/core';
import { FONT } from '../ui/uiKit.js';
import { overlayLayer, overlayScrim } from '../ui/overlay.js';
import { fitMessagePanel, GREEN_PANEL } from '../ui/messagePanel.js';
import { uiButton, setButtonLabel, type ButtonColor } from '../ui/uiButton.js';
import { centerSafeZone } from '../ui/safeZone.js';
import { topUiShift } from '../ui/safeAreaUi.js';

// 저작(=세이프존) 프레임 — 좌표 계약의 단일 출처는 logic/responsiveFrame.ts 다.
//   ⚠️ 캔버스 크기가 아니라 **저작 크기**. 화면 전체를 덮는 요소는 scene.scale.* 를 쓸 것.

// ── 레이아웃(디자인 좌표, 1080 폭 기준) ─────────────────────────────────
/** 안내 팝업 아트 — PlayScene 과 같은 초록 메시지창·손가락(PO 2026-08-22). */
const RULES_PANEL_KEY = 'up_Solitare_UI_28';
const RULES_POINTER_KEY = 'up_Solitare_UI_26';
/** 이 안내를 봤는지 기록하는 열쇠(save.ts 의 안내 기록과 공유). */
const RULES_TIP_KEY = 'klondikeRules';
/**
 * **진입 안내(보상·남은 판수)를 한 번만** 띄우기 위한 기록 키(PO 2026-08-30 "안내가 한번 출력된 후
 *   계속 반복 출력되지 않도록").
 *
 * 예전엔 씬에 들어올 때마다 무조건 토스트를 띄웠다 — '다시하기'·'다른 판'·'한 번 더'까지 전부
 * 재진입이라 같은 문장이 계속 떴다(실측 2026-08-30: 3회 진입 = 3회 표시).
 * ⚠️ 기록은 세이브가 아니라 **전용 키**(`save.ts` 의 TIPS_KEY)에 남는다 — 본 세이브에 넣으면
 *   다른 곳의 `writeSave({...})` 가 통째로 덮을 때 조용히 지워져 안내가 되살아난다(이미 겪은 함정).
 * ⚠️ 보상 액수는 **홈 선택 팝업의 버튼에 항상 적혀 있다** — 이 토스트를 한 번만 띄워도
 *   "얼마 받는지 모르는" 상태가 되지 않는다(그래서 조합별이 아니라 통째로 한 번이면 충분하다).
 */
const INTRO_TIP_KEY = 'bonusIntro';

const MARGIN = 60;
const CARD_W = 126;
const CARD_H = Math.round(CARD_W * (181 / 132)); // cardView.ts 의 REF 비율(132×181)과 동일 종횡비.
/**
 * 하단 버튼 3개(다시하기·되돌리기·패스) 중심 x — 되돌리기 라벨이 코인가로 길어질 수 있어(≈380px)
 *   가운데를 넓게 쓰고 양옆을 화면 끝에 붙인다. 1080 폭 기준 세 버튼이 겹치지 않는 배치.
 */
const BOTTOM_BTN_XS = [168, 540, 916] as const;
/**
 * 암막 진하기 — **배경이 비쳐 보여야 한다**(PO 2026-08-29 "게임창의 뒷부분이 보이지 않는다").
 * 저작 투명막(layer_4)은 0.85 지만, 이 씬은 그 아래에 인테리어 오버레이(layer_6)가 한 겹 더 있어
 * 같은 값을 쓰면 사실상 검정이 된다. 카드가 읽히면서 **배경 그림이 또렷이 보이는** 선까지 낮췄다
 * (0.85 → 0.45 → 0.25, PO 2026-08-29 "반투명값이 너무 진합니다").
 */
/** 암막 보드 패널 라운드 반경 — PlayScene 과 같은 값. */
const BOARD_PANEL_RADIUS = 36;
/**
 * 점포 전면을 앉히는 기준선 — **PlayScene 의 `DARK_TOP` 과 같은 값**(반투명 보드 상단).
 * ⚠️ 보드 기준(`boardTop`)을 쓰면 안 된다 — 그 값은 패널 상단 +48 이라 메인보다 59px 내려간다(실측).
 */
const STORE_TOP_REF = 728;
/** 빈 슬롯 테두리 모서리 반지름 — 카드 아트의 둥글기와 맞춘다. */
const SLOT_RADIUS = 14;
/**
 * 3장 뽑기에서 웨이스트를 옆으로 겹치는 간격(px).
 * ⚠️ **좌상단 인덱스(랭크 위·무늬 아래)가 다 드러나는 폭**이어야 한다 — 더 좁으면 겹친 카드의
 *   무늬가 잘려 무슨 카드인지 못 읽고(2026-08-29 신고), 더 넓으면 세 장이 넓게 퍼져 지저분하다
 *   (2026-08-29 신고). 그래서 하한은 계산으로 잡는다:
 *     인덱스 오른쪽 끝 = |중심 -0.31w| + maxW/2(0.18w) 를 왼쪽 모서리에서 재면 0.37w ≈ 46.6px.
 *   여기에 최소 여유만 더해 48px. **cardFace.ts 의 'index' 배치와 짝인 값**이라 한쪽만 바꾸면
 *   글자가 잘린다 — 인덱스를 옮기거나 키울 땐 위 식을 다시 계산할 것.
 */
const WASTE_FAN_STEP = 48;
/** 타임어택 시계 y — 첫 줄 카드 상단에서 이만큼 위(PO 2026-08-30 "시간표시를 아래로": 패널 상단(+52)은 미션 배너에 붙어 보였다). */
const TIMER_ABOVE_CARDS = 56;
/**
 * 이 씬의 카드 앞면 배치 — **좌상단 모서리 인덱스**(랭크 위·무늬 아래).
 * ⚠️ 메인 솔리테어는 원래 배치('classic')를 그대로 쓴다(PO 2026-08-29 "원래 솔리테어 게임의
 *   카드디자인은 변경하지 마세요"). 여기만 바꾸는 이유는 **3장 뽑기에서 카드를 옆으로 겹치기**
 *   때문이다 — 좁은 띠 하나로 카드를 읽으려면 랭크와 무늬가 왼쪽에 세로로 붙어 있어야 한다.
 */
const CARD_FACE_STYLE = 'index' as const;

const PITCH = (W - 2 * MARGIN - CARD_W) / (TABLEAU_COLS - 1);
const FACE_DOWN_STEP = 16;
const FACE_UP_STEP = 44;

function colX(i: number): number {
  return MARGIN + CARD_W / 2 + i * PITCH;
}

/** 이 컬럼에 카드를 한 장 더 놓는다면 놓일 y 좌표(기존 카드들 누적 오프셋 다음 자리). tabTopY=그 씬의 태블로 첫 행 y. */
function columnNextY(col: ReadonlyArray<{ faceUp: boolean }>, tabTopY: number): number {
  let y = tabTopY;
  let prevFaceUp = false;
  col.forEach((tc, idx) => {
    if (idx > 0) y += prevFaceUp ? FACE_UP_STEP : FACE_DOWN_STEP;
    prevFaceUp = tc.faceUp;
  });
  if (col.length > 0) y += prevFaceUp ? FACE_UP_STEP : FACE_DOWN_STEP;
  return y;
}

// 자석(스냅) 감지 반경 — pickDropTarget 근접 판정과 onDrag 의 당김 세기 감쇠가 같은 반경을 공유한다.
//   PO 2026-07-19: "자석이 작동하는 범위를 조금 더 확장" — PITCH(컬럼 1칸 간격)의 2.0배로 확장(1.7→2.0,
//   "빠르게 움직였을 때 자리를 잘 찾지 못하는 문제" 재지적 반영 — 빠른 플릭은 손을 뗄 때 이미 목표를
//   지나쳐 있는 경우가 많아 판정 반경을 더 넉넉히 잡는다).
const SNAP_RADIUS = PITCH * 2.0;

/**
 * **완전 흡착(락) 반경** — PO 2026-07-27 "카드를 전체 옮기는 구조가 너무 느리고 무겁다. 자석을 더 강화".
 *   컬럼 중심에서 가로로 이 안이면 손끝 위치와 무관하게 목적지에 **딱 붙는다**(당김 세기 1.0). 컬럼 간격의
 *   절반이라, 어느 컬럼 위에 있든 그 컬럼에 확실히 흡착된다 — 미세 조준이 필요 없어진다.
 */
const SNAP_LOCK_RADIUS = PITCH * 0.5;

/**
 * 자석 추종 시간상수(ms) — 작을수록 즉각적. 기존 지수 보간은 실효 시간상수가 **약 140ms**(60fps 에서
 *   프레임당 11%만 수렴 → 90% 따라잡는 데 20프레임/330ms)라 카드가 손끝을 눈에 띄게 끌려다녔다 =
 *   PO 가 말한 "무거움"의 정체. 45ms 로 낮춰 즉각 붙되 딱딱하지 않을 만큼의 감속만 남긴다.
 */
const MAGNET_FOLLOW_TAU_MS = 45;

/**
 * **자동 완성 한 수당 간격(ms) — 수의 종류별로 다르게**(PO 2026-07-28 "자동 진행되다 멈추는 현상").
 *   예전엔 90ms 균일이었는데, 손패를 도는 `draw`/`recycle` 수는 **화면 변화가 거의 없다**(웨이스트 1장만 바뀌고
 *   리사이클은 아무 변화도 없음). 올릴 카드가 없으면 손패를 한 바퀴 이상 돌리므로 그런 수가 **20~48개 연속**으로
 *   나오고, 90ms×N = 1.8~4.3초 동안 보드가 정지한 것처럼 보였다(그 사이 토스트는 이미 사라지고 입력은 잠김).
 *   → 보여줘야 할 수(`foundation`)는 천천히, 손패 돌리는 수는 빠르게 훑는다.
 *   `foundation` 130ms 는 카드 이동 트윈(자동 완성 중 100ms 고정)보다 길어 **트윈 중첩도 함께 해소**한다.
 */
const AUTO_DELAY_MS: Record<AutoStepKind, number> = {
  foundation: 130,
  draw: 45,
  recycle: 220, // 화면 변화가 없는 수 — 여기서만 잠깐 쉬며 재순환 아이콘을 돌려 보여준다.
};
/**
 * 워치독 여유 — `delayedCall` 은 "지연 경과 후 **다음 프레임**"에 발화하므로 스텝마다 최대 한 프레임씩
 *   밀린다(30fps 기기 ≈34ms). 고정 여유만 쓰면 스텝이 많은 판에서 **정상 재생을 워치독이 오인해 끊는다**
 *   → 스텝 수에 비례하는 몫 + 마지막 트윈/승리 팝업용 기본 몫으로 나눈다.
 */
const AUTO_WATCHDOG_PER_STEP_MS = 34;
const AUTO_WATCHDOG_BASE_MS = 2000;

/**
 * 목적지까지의 **가로 거리**로 계산하는 당김 세기 0..1.
 *   ⚠️ 예전엔 직선(유클리드) 거리를 썼는데, 드롭 판정(`pickDropTarget`)은 **가로 거리만** 보기 때문에
 *      카드가 많이 쌓인 컬럼(목표 y 가 아래로 멀어짐)일수록 판정은 되는데 자석은 약해지는 불일치가 있었다.
 *      판정과 같은 축을 쓰도록 통일 — 컬럼이 잡히면 세로로도 확실히 끌어당겨진다.
 */
function magnetStrength(dxToTarget: number): number {
  if (dxToTarget <= SNAP_LOCK_RADIUS) return 1; // 락 존 = 완전 흡착.
  const t = 1 - Phaser.Math.Clamp((dxToTarget - SNAP_LOCK_RADIUS) / (SNAP_RADIUS - SNAP_LOCK_RADIUS), 0, 1);
  return t * t; // 락 밖에서는 제곱 감쇠(PO 2026-07-19 "너무 딱딱하지 않게").
}

interface DragCtx {
  readonly source: MoveSource;
  readonly views: CardView[]; // [0]=실제로 잡은 카드(런의 기준점) … [끝]=컬럼 맨 앞 카드. 드래그 좌표는 [0] 기준.
  readonly origPos: ReadonlyArray<{ x: number; y: number }>;
  /** 폴드 영역 프록시 보정 — Phaser 드래그 좌표(잡은 카드 기준)에 더해 런 기준 카드 좌표계로 옮긴다. 일반 드래그는 0. */
  readonly offX: number;
  readonly offY: number;
  desiredX: number; // 이번 프레임에 향해야 할 목표(자석 존이면 손끝↔목적지 혼합, 아니면 손끝 그대로).
  desiredY: number;
  visualX: number; // 실제로 화면에 그려지는 좌표(자석 존 안에서만 desired 를 향해 서서히 수렴).
  visualY: number;
  magnetized: boolean; // 자석 존 안(true)이면 update() 가 매 프레임 visual→desired 로 감속 추종.
  // **빠른 드래그 보정**(PO 2026-07-20 "빠르게 움직였을 때 자리를 잘 찾지 못하는 문제") — 드래그 도중
  //   한 번이라도 유효했던 마지막 목적지를 기억해둔다. 빠른 플릭은 손을 뗀 순간의 좌표가 이미 목표 반경을
  //   지나쳐 있는 경우가 많아, 정확한 릴리스 지점 판정이 실패하면 이 값으로 대신 커밋한다.
  lastValidDest: MoveDest | null;
}

export class PlayKlondikeScene extends Phaser.Scene {
  private level = 1;
  private chMult = 1;
  private floorThemeIdx = 1;
  private state!: KlondikeState;
  /**
   * 이 판을 깐 직후의 상태 — **'다시하기'가 되돌아갈 지점**.
   * 상태는 불변(applyMove 가 새 객체를 낸다)이라 시작 시점을 한 번 붙잡아 두면 그대로 복원된다.
   * ⚠️ 새로 배분할 때(`newDealGame`)는 **여기도 같이 갱신**해야 한다 — 안 하면 '다시하기'가
   *   화면에 없는 예전 판으로 돌아간다.
   */
  private initialState!: KlondikeState;
  private history: { s: KlondikeState; fanFrom: number }[] = [];
  /**
   * 지금 화면에 펼쳐진 웨이스트 부채꼴의 **시작 인덱스**(= 마지막으로 뽑기 직전의 waste 길이).
   *
   * ⚠️ 이 값이 없으면 부채꼴을 "맨 위에서 drawCount 장"으로 잡게 되는데, 그러면 맨 위 한 장을 낼
   *   때마다 남은 카드가 **옆으로 밀려오고 아래에 있던 카드가 새로 튀어나온다**(2026-08-29 신고).
   *   실제 클론다이크는 한 번에 뽑은 세 장이 제자리를 지키다가, 세 장이 다 없어지면 그때 이전에
   *   뽑았던 카드가 한 장 드러난다. 기준점을 고정해야 그 동작이 나온다.
   *   되돌리기로도 되살아나야 하므로 `history` 에 상태와 **함께** 실린다.
   */
  private wasteFanFrom = 0;
  private header?: TopHeader;
  private chrome?: LayoutIndex;
  private ended = false;

  // **보드 배치 y 기준**(PO 2026-07-19: "이 게임도 표시한 공간에 배치해야 한다") — PlayScene 의 암막 보드
  //   패널(main.json layer_4)과 동일한 영역 안에 클론다이크 보드를 놓는다. 기본값은 챙기지 못했을 때(챙김
  //   폴백)의 값이고, applyChrome() 이 실제 패널 위치로 재계산한다.
  private boardTop = 763;
  /** 보드 패널 상단에서 첫 줄(스톡·파운데이션) 중심까지의 여유(카드 반높이 제외). */
  private static readonly BOARD_TOP_GAP = 200;
  private topY = 310; // 스톡·웨이스트·파운데이션 행.
  private tabTopY = 560; // 태블로 첫 행.

  private views = new Map<string, CardView>(); // card.id → view(재사용).
  // ── 보드 다이아(PO 2026-08-30) — 뒷면 카드 하나에 끼워 두고, 그 카드가 **뒤집히는 순간** 회수한다.
  /**
   * **보드 핀** — 카드 뒤·하단에 끼워 둔 보상(판 시작 다이아 + 미션 보상). 그 카드가 컬럼을 떠나는 순간 회수.
   *   PO 2026-08-30 "프리셀의 경우 미션리워드가 보드에 들어가는 연출이 없다" → 메인처럼 미션 보상도 보드에 꽂는다.
   */
  private boardPins: BoardPin[] = [];
  /** 이번 판에 핀으로 보여 주고 회수한 컬렉션 카드(승리 시 이대로 지급 — 남는 수만 랜덤). */
  private pinnedSlots: CollectionSlot[] = [];
  /**
   * **판에서 모은 리워드 원장**(PO 2026-08-30) — 별·다이아·컬렉션 카드가 여기 쌓이고,
   *   **승리 결과 화면에서만** 지급된다. 지면 통째로 사라진다. 규칙은 logic/roundRewards.ts.
   */
  private rewards: RoundRewards = EMPTY_ROUND_REWARDS;
  private comboRun = 0; // 연속 성공 수(뽑기에서 끊긴다) — 주문 진행도.
  private pendingMissions = 0; // 완성된 주문 수(정산 대기).
  /** **판 전체에서 낸 연속 5매칭 횟수** — 리그 별 등급의 근거(자동 완성 구간은 세지 않는다). */
  private missionsDone = 0;
  private orderQueue?: OrderQueue; // 상단 점포 손님 대기열(연출).
  private comboStars: Phaser.GameObjects.Image[] = []; // 좌측 5칸 게이지 별.
  private comboCountText?: Phaser.GameObjects.Text; // MISSIONS 패널 'combo +N'.
  private missionRewardImg?: Phaser.GameObjects.Image; // 다음 보상 예고 아이콘.
  private missionIconBox = { w: 50, h: 68 };
  private missionNext: BonusMissionKind = 'stars'; // 예고된 다음 보상(지급 전까지 고정).
  private diamondHold?: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text };
  private stockBackView?: CardView;
  private stockCountText?: Phaser.GameObjects.Text;
  private wasteCountText?: Phaser.GameObjects.Text; // 웨이스트 장수 — 맨 위 한 장만 렌더돼 아래 카드가 안 보이는 걸 보완.
  private recycleIcon?: Phaser.GameObjects.Text;
  private undoBtn?: Phaser.GameObjects.Container;
  /** 이번 판을 센 **뒤** 남은 **무료** 판 수 — 헤더와 결과 팝업이 같은 값을 쓴다. */
  private playsLeft = 0;
  /** 타임어택인가 — 규칙은 같고 제한시간만 얹는다(보상 3배). */
  private timed = false;
  /** 이번 판의 제한시간(초). `?bonusTime=` 으로 덮어쓸 수 있다(테스트 플레이용). */
  private timeLimitSec = 0;
  /** 남은 시간(ms). 0 이하가 되면 패배. */
  private timeLeftMs = 0;
  /** 카운트다운이 끝나기 전에는 시계가 돌지 않는다. */
  private timerRunning = false;
  private timerText?: Phaser.GameObjects.Text;
  /** 이 판을 연 민원 창구(공공건물 층). 창구 밖 경로면 undefined. */
  private desk?: CivicDesk;
  /** 창구 진행 보상 배수(1.0~2.0) — 기본 승리 코인에만 곱한다. */
  private deskMult = 1;
  /** 하단 '다시하기'·'다른 판' 아래에 붙는 비용 안내 — 판을 쓸 때마다 다시 칠한다. */
  private resetFeeTexts: Phaser.GameObjects.Text[] = [];
  /** 다음 판의 게임비(0 = 아직 무료 판이 남았다). */
  private nextFee = 0;
  /** 이 판의 뽑기 모드 — 딜(장수)·보상·재시작이 모두 이 값을 따른다. */
  private mode: BonusMode = 'draw1';

  private dragCtx?: DragCtx;
  private snapGhost?: Phaser.GameObjects.Rectangle;
  private autoPlaying = false; // 자동 완성 재생 중 — 이 동안은 모든 조작 입력을 막는다.
  /** 이기지 못한 채 끝난 뒤 재시작 차단 — 플레이어가 한 수 둘 때까지 같은 수순을 다시 걸지 않는다. */
  private autoRetryBlocked = false;
  private autoTimer?: Phaser.Time.TimerEvent; // 재생 예약(한 수마다 다시 건다) — 중단/정리용 핸들.
  private autoWatchdog?: Phaser.Time.TimerEvent; // 재생이 끝나지 않을 때 강제 해제하는 안전망.
  /** 카드별 이동 트윈 핸들 — 새로 걸기 전에 이전 것을 멈춰 좌표 경합(카드가 되돌아가/떠는 현상)을 막는다. */
  private arcTweens = new Map<CardView, Phaser.Tweens.Tween>();
  private suppressTap = false;

  constructor() {
    super('playKlondike');
  }

  init(data: { level?: number; mult?: number; mode?: BonusMode; timed?: boolean; desk?: string; deskMult?: number }): void {
    /*
     * **진행 보상 배수** — 그 창구를 오래 다닐수록 커진다(`civicDesks.deskRewardMult`).
     * ⚠️ 깨진 값은 1.0 으로 접고 **상한도 여기서 다시 건다** — 씬 데이터는 밖에서 오는 값이라,
     *   설계 상한을 넘는 배수가 실수로 열리지 않게 방어한다.
     */
    const dm = Number(data?.deskMult);
    this.deskMult = Number.isFinite(dm) ? Math.min(Math.max(1, dm), 1 + DESK_ROUND_CAP * DESK_ROUND_BONUS) : 1;
    // **어느 민원 창구에서 왔나** — 창구별 추가 보상(perk)을 승리 시 준다(logic/civicDesks.ts).
    //   값이 깨져 오면 창구 없음으로 접는다(추가 보상 없이 기본 보상만 나간다).
    this.desk = CIVIC_DESKS.find((d) => d.role === data?.desk);
    // **뽑기 모드**(1장/3장) — 홈에서 고른 값이 여기로 온다. 없거나 깨졌으면 기본(1장).
    this.mode = toBonusMode(data?.mode);
    // **타임어택 여부** — 깨진 값은 일반 모드로 접는다(3배 보상이 실수로 열리지 않게).
    this.timed = toBonusTimed(data?.timed);
    this.timeLimitSec = bonusTimeLimitSec(this.mode);
    this.timeLeftMs = this.timeLimitSec * 1000;
    this.timerRunning = false;
    this.level = data?.level ?? loadSave().level;
    this.chMult = Math.max(1, Math.floor(data?.mult ?? 1));
    /*
     * 남은 판수는 **읽기만** 한다. 차감은 `logic/bonusRuntime.startBonusPlay()` 단일 지점이다.
     * ⚠️ 예전엔 여기서 차감했는데, 결과 팝업의 '한 번 더'(같은 씬 재시작) 경로에서는 이 init 이
     *   기대대로 다시 돌지 않아 **차감이 빠졌다**(실측 2026-08-29). 씬 재시작 동작에 기대지 않는다.
     */
    this.playsLeft = bonusLeft();
    this.nextFee = bonusFee(); // 다음 판(=한 번 더)의 게임비 — 0 이면 무료 판이 남았다.
    // 점포 테마 = 소유 최고층(PlayScene 과 동일 규칙) — 층별 인테리어 표시에 사용.
    const ownedFloors = Math.max(1, loadSave().ownedFloors ?? 1);
    this.floorThemeIdx = ((ownedFloors - 1) % 5) + 1;
  }

  preload(): void {
    loadGameAssets(this); // main.json(UI_MAIN_KEY) 포함 — PlayScene 과 동일 크롬을 재사용한다.
    if (!this.cache.json.exists(ECON_JSON_KEY)) this.load.json(ECON_JSON_KEY, ECON_JSON_URL);
    // **결과화면 저작**(blank_2.json) — 메인과 같은 결과 팝업(resultPopup.ts, PO 2026-08-30).
    if (!this.cache.json.exists(UI_RESULT_KEY)) this.load.json(UI_RESULT_KEY, UI_RESULT_PATH);
    preloadAudio();
    if (!this.textures.exists(CARD_BACK_KEY)) this.load.image(CARD_BACK_KEY, uploadPath('up_Solitaire_CARD_back'));
    // 보드 다이아 — 매니페스트 밖(수동 이식)이라 직접 로드한다(PlayScene 과 동일 처리).
    if (!this.textures.exists(DIAMOND_KEY)) this.load.image(DIAMOND_KEY, uploadPath(DIAMOND_KEY));
    preloadCustomers(this); // 손님 시트·말풍선·주문 아이템(주문 대기열 연출).
  }

  create(): void {
    centerSafeZone(this); // 세이프존을 화면 가운데로(PlayScene 과 동일 규약).
    setEconFromJson(this.cache.json.get(ECON_JSON_KEY));
    this.ended = false;
    this.autoPlaying = false; // 씬 재사용 대비(이전 판 자동 완성 중 나갔을 수 있다).
    this.autoRetryBlocked = false;
    this.autoTimer?.remove(false);
    this.autoTimer = undefined;
    this.autoWatchdog?.remove(false);
    this.autoWatchdog = undefined;
    this.arcTweens.clear();
    // 씬을 떠날 때 예약이 죽은 씬을 건드리지 않게 정리(전환 중 콜백 방어).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearBoardPins(); // 젬·보관분을 함께 비운다(다음 진입에 이전 판이 새지 않게).
      this.autoTimer?.remove(false);
      this.autoWatchdog?.remove(false);
      this.autoPlaying = false;
      this.arcTweens.clear();
    });
    this.history = [];
    this.wasteFanFrom = 0;
    /*
     * ⚠️ **씬 인스턴스는 재사용된다** — 재시작하면 이전 판의 오브젝트는 파괴되는데 필드는 그대로
     *   남는다. 시계 표시를 비우지 않으면 `startTimeAttack` 이 "이미 있다"고 판단해 **파괴된 Text 를
     *   건드리다 예외**가 난다(실측 2026-08-30: `setColor` → `Frame.setSize` 에서 터짐).
     *   그 프레임에서 루프가 끊기므로 화면이 통째로 멈추는 종류의 사고다.
     */
    this.timerText = undefined;
    this.timerRunning = false;
    this.views.clear();
    this.dragCtx = undefined; // 씬 재사용 대비(파괴된 이전 판 카드 참조가 남아있지 않게).
    this.input.dragDistanceThreshold = 12; // 이 미만 이동은 드래그가 아니라 탭(파운데이션 자동 이동)으로 처리.

    this.applyChrome(); // 배경/보드 패널(this.topY·this.tabTopY 확정) + 닫기 버튼 + 미션 배너.
    // PO 2026-07-19: "게임을 다시 실행할 때마다 새로운 게임으로 카드 배치" — TriPeaks(레벨 시드 고정, 난이도
    //   재현성 목적)와 달리 클론다이크는 재입장할 때마다 매번 새로 셔플한다(Math.random, 결정적 시드 아님).
    // PO 2026-07-27: 딜은 **레벨 난이도에 맞춰** 고른다 — 저레벨일수록 쉬운 판(klondikeDifficulty.ts).
    this.setupMissionChrome(); // 저작 HUD(별 게이지·다이아 배지·MISSIONS 패널) 배선.
    this.buildOrderQueue(); // 점포 앞 손님 대기열 — 주문이 곧 미션이다.
    this.state = dealKlondikeForLevel(Math.random, this.level, undefined, BONUS_DRAW_COUNT[this.mode]);
    this.initialState = this.state; // '다시하기'가 돌아갈 지점.
    // 헤더 레벨 표시는 보너스 라벨(`10-1`) — 메인 레벨과 구분되게(PO 2026-07-27).
    // 헤더 레벨 자리 — 예전엔 `10-1`(메인 레벨에 딸린 보너스). 이제는 레벨 밖의 독립 게임이라
    //   붙일 번호가 없어 **오늘 남은 판수**를 보여준다.
    const headerTag = (this.timed ? '⏱' : '') + `${BONUS_DRAW_COUNT[this.mode]}장 `;
    this.header = buildTopHeader(this, loadSave().coins, loadSave().diamonds ?? 0, headerTag + (this.playsLeft > 0 ? `${this.playsLeft}/${BONUS_PLAYS_PER_DAY}` : '유료'), () => this.openMenu());
    this.drawSlots();
    this.drawUndoButton();
    this.placeBoardDiamond(); // 뒷면 카드 하나에 다이아를 끼운다(모드별 확률 — bonusGame 표).
    this.syncViews(true);
    // 보너스라는 것 · **게임비가 없다는 것** · **패스할 수 있다는 것**을 진입 순간에 알린다(PO 2026-07-27·29).
    const modeLabel = `${BONUS_DRAW_COUNT[this.mode]}장 뽑기` + (this.timed ? ' ⏱타임어택' : '');
    const prize = bonusWinCoins(this.mode, this.timed).toLocaleString();
    if (!loadTipsSeen().includes(INTRO_TIP_KEY)) {
      markTipSeen(INTRO_TIP_KEY);
      this.toast(
        this.playsLeft > 0
          ? `🎁 보너스 ${modeLabel} — 이기면 🪙${prize} · 오늘 무료 ${this.playsLeft}판 남음`
          : `🎁 보너스 ${modeLabel} — 이기면 🪙${prize} · 다음 판부터 게임비 🪙${BONUS_PAID_FEE.toLocaleString()}`,
      );
    }
    // **이 라운드의 진행 방식을 처음 한 번 안내**(PO 2026-08-22) — 특히 **탭하면 자동 이동**.
    if (!loadTipsSeen().includes(RULES_TIP_KEY)) this.time.delayedCall(600, () => this.showRules());
    if (this.timed) this.startTimeAttack();
  }

  /**
   * 화면 크롬 = **PlayScene 과 동일한 main.json SSOT**(스토어프론트+암막 보드 패널)를 그대로 재사용하고,
   *   그 패널 영역 안에 클론다이크 보드가 오도록 `this.topY`/`this.tabTopY` 를 확정한다(PO 2026-07-19
   *   "이 게임도 표시한 공간에 배치해야 한다"). 와일드/+5 부스터 배선(setupEditorBoosters)·손님 연출
   *   (setupStorefrontLife)·보행자(spawnPedestrians)는 TriPeaks 전용이라 가져오지 않는다 — 이 라운드엔
   *   되돌리기만 있고 손님/보행자는 필요 없다. 디자인 미저작(main.json 없음) 시 코드 배경으로 폴백.
   */
  private applyChrome(): void {
    // 앵커 변환은 여기 한 번뿐(PlayScene 과 동일 규약) — 렌더와 측정이 같은 좌표를 본다.
    const rawMainDoc = (this.cache.json.get(UI_MAIN_KEY) ?? null) as LayoutDoc | null;
    const mainDoc = rawMainDoc ? anchorDoc(this, rawMainDoc, MAIN_ANCHOR) : null;
    const hasChrome = !!mainDoc?.nodes?.some((n) => n.type === 'image' && this.textures.exists(n.key ?? ''));
    if (!hasChrome) {
      this.drawBackground();
      return;
    }
    const staticDoc: LayoutDoc = { ...mainDoc!, nodes: mainDoc!.nodes.filter((n) => !DYNAMIC_NODE_IDS.has(n.id)) };
    this.chrome = buildLayout(this, staticDoc);

    // 층별 인테리어(현재 소유 최고층 테마) — PlayScene.applyFloorInterior 와 동일 로직(코드 재사용은
    //   private 메서드라 불가 — 텍스처 키 규칙만 동일하게 유지).
    const interior = this.chrome.tryById<Phaser.GameObjects.Image>('layer_3');
    const interiorNode = this.chrome.nodeById('layer_3');
    if (interior && interiorNode) {
      const floorKey = `up_Slitare_BG_01-${this.floorThemeIdx}`;
      const key = this.textures.exists(floorKey) ? floorKey : 'up_Slitare_BG_01-1';
      interior.setTexture(key);
      // 저작 표시 크기 유지(텍스처 교체가 크기를 리셋하므로 재적용) — PlayScene.applyFloorInterior 와 동일.
      if (interiorNode.w && interiorNode.h) interior.setDisplaySize(interiorNode.w, interiorNode.h);
    }
    /*
     * **배경은 메인 솔리테어와 똑같이 만든다**(PO 2026-08-29 "동일한 배경 배치 · 동일한 에셋").
     *   · 배경(layer_1)은 폭을 늘리는 게 아니라 **cover 로 확대**한다 — 늘리면 비율이 깨진다.
     *   · 나머지 층(layer_3 매장 · layer_6 오버레이)은 **저작 크기 그대로** 둔다.
     *   · 암막은 저작 `layer_4`(투명막)가 이미 그린다 — **코드로 따로 깔지 않는다**.
     * ⚠️ 예전엔 여기서 층들을 캔버스 폭까지 늘리고 암막을 한 겹 더 깔았다 — 메인과 화면이 달라졌고
     *   암막이 이중으로 겹쳐 배경이 안 보였다. 메인의 절차와 어긋나지 않게 같은 두 가지만 한다.
     */
    this.applyBackgroundCover();
    this.roundBoardPanelCorners();

    // 암막 보드 패널(가장 큰 rect 노드) 범위 → 그 안쪽에 보드 y 기준을 잡는다.
    const panel = mainDoc!.nodes.filter((n) => n.type === 'rect' && (n.h ?? 0) >= 800).sort((a, b) => (b.h ?? 0) - (a.h ?? 0))[0];
    if (panel?.h) this.boardTop = Math.round(panel.y - panel.h / 2 + 48);
    // ⚠️ **boardTop 이 정해진 뒤에** 그린다 — 점포 y 가 그 값에서 나온다(먼저 부르면 0 기준으로 앉는다).
    this.drawStorefront();
    // PO 2026-07-19: "약간 위치를 조금 내려 주세요" — 스토어프론트 하단(미션 리워드 배너)에 너무 붙어
    //   보여서 여백을 더 키움(30→110). PO 2026-08-30 "보드를 약간 아래로, 아래 여유가 충분하다" → 110→200.
    this.topY = this.boardTop + CARD_H / 2 + PlayKlondikeScene.BOARD_TOP_GAP;
    this.tabTopY = this.topY + CARD_H + 60;

    // 닫기(✕) 버튼 = layer_20 — **보너스 건너뛰기**(PO 2026-07-27 "반드시 완료하지 않고도 다음 레벨로").
    //   PlayScene 의 ✕(홈으로)와 달리 여기서는 다음 메인 레벨 진입 팝업으로 넘어간다(그 팝업에 홈 링크가 있다).
    this.chrome.tryById<Phaser.GameObjects.Image>('layer_20')?.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.skipBonus());

    // 와일드(layer_10)·+5카드(layer_11) 부스터 아트 — 이 라운드는 되돌리기만 지원하므로 숨긴다
    //   (PO 2026-07-19 "하단에 와일드카드랑 플러스 카드 아이콘 지워 주세요"). 정적 크롬 렌더는 main.json
    //   전체를 그대로 가져오다 보니 TriPeaks 전용 부스터 아트까지 같이 딸려 왔었다.
    //   ⚠️ 짝 노드(layer_10_copy = 아이콘 원판 · layer_12 = "+1" 뱃지)까지 같이 숨겨야 한다 —
    //     하단 버튼 줄(y≈2240)과 겹쳐 **패스 버튼 뒤로 파란 원판이 삐져나왔다**(실측 2026-08-23).
    for (const id of ['layer_10', 'layer_10_copy', 'layer_11', 'layer_12']) this.chrome.tryById(id)?.setVisible(false);

    /*
     * 미션 리워드 배너 — 홈/PlayScene 과 동일 위치/구성. **읽기 전용 표시다.**
     * ⚠️ 2026-08-29부터 이 게임은 미션 별점을 적립하지 않는다(레벨 체계 밖의 독립 보너스로 분리).
     *   배너는 진행 상황을 보여줄 뿐이니, 헷갈린다는 의견이 나오면 이 줄을 지우면 된다.
     */
    //   제한시간이 여기서 끝나면 리셋 상태를 즉시 반영한다(PlayScene 과 동일 규칙).
    const banner = buildMissionRewardBanner(this, missionRewardOf(loadSave(), Date.now()), topUiShift(this), 1580, () => {
      const save = loadSave();
      const next = missionRewardOf(save, Date.now());
      save.missionReward = next;
      writeSave(save);
      banner.setState(next);
    });
  }

  // ── 배경/슬롯 ──────────────────────────────────────────────────────
  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x1f5c37, 0x1f5c37, 0x123521, 0x123521, 1);
    const fb = fullBleedBounds(this); // 캔버스 전체(저작 W/H 로 그리면 넓어진 가장자리가 뚫린다).
    g.fillRect(fb.x, fb.y, fb.w, fb.h);
  }

  private drawSlots(): void {
    // 자석 착지 미리보기 — 드래그 중에만 보이고 위치가 바뀐다(카드 depth 500 아래, 슬롯 윤곽 위).
    this.snapGhost = this.add
      .rectangle(0, 0, CARD_W, CARD_H, 0xffe27a, 0.16)
      .setStrokeStyle(4, 0xffe27a, 0.9)
      .setDepth(400)
      .setVisible(false);

    /**
     * 빈 슬롯 테두리 — **라운드 사각형**(PO 2026-08-29 "라운드사각형 라인으로 만들어져야 합니다").
     * ⚠️ `add.rectangle().setStrokeStyle()` 은 **직각만** 그린다 — 카드는 모서리가 둥근데 슬롯만
     *   각져 보였다. 둥근 테두리는 Graphics 의 `strokeRoundedRect` 로만 나온다.
     * 반지름은 카드 뷰(cardView)의 모서리와 눈으로 맞춘 값.
     */
    const outline = (x: number, y: number): Phaser.GameObjects.Graphics => {
      const g = this.add.graphics().setDepth(5);
      g.lineStyle(3, 0xffffff, 0.32);
      g.strokeRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, SLOT_RADIUS);
      return g;
    };
    outline(colX(0), this.topY); // 스톡.
    const suits: readonly Suit[] = ['S', 'H', 'D', 'C'];
    suits.forEach((s, i) => {
      outline(colX(3 + i), this.topY);
      this.add
        .text(colX(3 + i), this.topY, suitSymbol(s), { fontFamily: 'Arial, sans-serif', fontSize: '48px', color: isRed(s) ? '#e8402f55' : '#00000055' })
        .setOrigin(0.5)
        .setDepth(6);
    });
    for (let i = 0; i < TABLEAU_COLS; i++) outline(colX(i), this.tabTopY);

    // 스톡 뒷면 더미(탭=드로우/재순환) + 장수 표시 + 재순환 아이콘.
    this.stockBackView = new CardView(this, colX(0), this.topY, CARD_W, CARD_H, false, CARD_FACE_STYLE);
    this.stockBackView.showBack();
    this.stockBackView.setDepth(10);
    this.stockCountText = this.add.text(colX(0), this.topY + CARD_H / 2 + 32, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5).setDepth(20);
    // **웨이스트 장수**(PO 2026-07-29) — 이 씬은 웨이스트 **맨 위 한 장만** 그리므로 그 아래 깔린 카드가
    //   화면에서 완전히 사라진다("♠5·6이 없어졌다"는 제보의 실제 원인). 스톡과 같은 형식으로 장수를 알린다.
    this.wasteCountText = this.add
      .text(colX(1), this.topY + CARD_H / 2 + 32, '', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(20);
    this.recycleIcon = this.add.text(colX(0), this.topY, '↻', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '64px', color: '#ffe066' }).setOrigin(0.5).setDepth(20).setVisible(false);
    const stockZone = this.add.zone(colX(0), this.topY, CARD_W + 24, CARD_H + 24).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(21);
    // 스톡 더미도 **같은 탭 피드백**을 준다 — 클론다이크에서 가장 자주 누르는 곳이라 여기가 딱딱하면
    //   보드 전체가 딱딱하게 느껴진다(PO 2026-08-30). 뒷면 카드가 눌렸다가 튀어오른다.
    stockZone.on('pointerdown', () => {
      if (!this.ended && !this.autoPlaying) this.stockBackView?.pressIn();
      this.onStockTap();
    });
    stockZone.on('pointerup', () => this.stockBackView?.pressOut());
    stockZone.on('pointerout', () => this.stockBackView?.pressCancel());
  }

  /**
   * 하단 알약 버튼 1개 — 저작 에셋(UI_30) 배경 + 라벨. 텍스트 폭에 맞춰 알약을 늘린다.
   *
   * 에셋이 없으면 라벨만 그린다(빌드 순서나 에셋 누락으로 버튼이 통째로 사라지는 일 방지).
   */
  /**
   * **보드 암막** — 배경(층 인테리어) 위에 반투명 막을 깔아 카드가 배경에 묻히지 않게 한다
   * (PO 2026-08-29 "백그라운드 이미지 전체에 반투명 레이어가 표시되도록").
   *
   * 저작(main.json `layer_4` "투명막", 검정 85%)과 **같은 톤**을 쓰되 **폭은 캔버스 전체**로 깐다.
   * ⚠️ 저작 폭(1106) 그대로 그리면 화면비가 낮은 기기에서 캔버스가 넓어질 때(실측 1195) **좌우로
   *   막이 안 닿아 배경이 그대로 드러난다** — 화면을 채워야 하는 것은 `fullBleedBounds` 로 그린다
   *   (packages/core/docs/RESPONSIVE_STANDARD.md).
   * ⚠️ 위쪽 스토어프론트·헤더는 덮지 않는다(막의 위 끝 = 저작 패널의 위 끝). 아래는 화면 끝까지 —
   *   하단 버튼 줄까지 같은 톤이어야 배경이 얼룩덜룩해 보이지 않는다.
   * ⚠️ depth 는 크롬(저작 최대 35)보다 위, 카드(500+)·버튼(800)보다 아래여야 한다.
   */
  /**
   * **지금 층의 점포 전면** — 메인 솔리테어와 같은 아트·같은 자리(PlayScene 의 점포 블록과 동일 규칙).
   *
   * 저작 `layer_2`(고정 점포 그림)를 끄고, 세이브의 현재 점포 아트(`logic/currentStore`)를 그 자리에
   * 같은 크기로 올린다 — 메인에서 베이커리를 보다가 보너스에 들어오면 편의점이 나오는 어긋남을 없앤다
   * (PO 2026-08-29 "동일한 배경 배치 · 동일한 에셋").
   * ⚠️ depth 는 보드 인테리어(layer_3, depth 3)보다 **뒤(2)** 여야 한다 — 앞에 두면 점포가 카드판을 덮는다.
   * ⚠️ 크기·위치 상수는 메인과 **같은 값**이다(`STORE_TOP_REF` = PlayScene 의 `DARK_TOP`).
   *   한쪽만 고치면 두 화면이 다시 어긋난다 — 실제로 보드 기준(boardTop)을 쓰다가 59px 어긋났다.
   */
  private drawStorefront(): void {
    const ART_W = 859;
    const ART_H = 518;
    // **민원 창구에서 들어왔으면 그 공공건물 층을 올린다**(PO 2026-08-30) — 점포 대신 관공서가 보인다.
    if (this.desk && this.drawCivicFront(ART_W, ART_H)) return;
    const store = currentStore(loadSave());
    const key = [...store.artKeys, 'up_Slitare_BG_02_v2'].find((k) => this.textures.exists(k));
    if (!key) return; // 아트가 없으면 저작 점포를 그대로 둔다(빈 자리를 만들지 않는다).
    this.chrome?.tryById('layer_2')?.setVisible(false);
    this.add
      .image(W / 2, STORE_TOP_REF - ART_H / 2 + 80, key)
      .setDisplaySize(ART_W, ART_H)
      .setDepth(2);
  }

  /**
   * 배경(layer_1)을 화면이 비지 않을 만큼만 **cover 로 확대** — PlayScene.applyBackgroundCover 와 같은 절차.
   * ⚠️ 폭만 늘리면 비율이 깨져 그림이 옆으로 퍼진다. 두 축을 같은 배율로 키운다.
   */
  private applyBackgroundCover(): void {
    const bg = this.chrome?.tryById<Phaser.GameObjects.Image>('layer_1');
    const node = this.chrome?.nodeById('layer_1');
    if (!bg || !node?.w || !node?.h) return;
    const v = viewBounds(this); // 줌이 걸리면 "화면 전체"는 캔버스 크기가 아니다.
    const s = coverScaleFor(node.w, node.h, v.w, v.h);
    if (s === 1) return; // 여분 0 — 저작 그대로.
    bg.setDisplaySize(node.w * s, node.h * s);
  }

  /**
   * 암막 보드 패널(layer_4)의 귀퉁이 라운드 — PlayScene.roundBoardPanelCorners 와 같은 절차.
   * 캔버스가 저작 폭보다 넓을 때만, 같은 자리에 둥근 모서리로 다시 그린다(저작 radius 는 0이라 각져 보인다).
   */
  private roundBoardPanelCorners(): void {
    if (viewBounds(this).w <= SAFE_W) return; // 보이는 폭이 저작 폭 이하면 귀퉁이가 화면 밖이다.
    const node = this.chrome?.nodeById('layer_4');
    const g = this.chrome?.tryById<Phaser.GameObjects.Graphics>('layer_4');
    if (!node || !g || node.type !== 'rect' || !node.w || !node.h) return;
    const r = Math.min(BOARD_PANEL_RADIUS, node.w / 2, node.h / 2);
    g.clear();
    g.fillStyle(Phaser.Display.Color.HexStringToColor(node.fill ?? '#000000').color, node.fillAlpha ?? 1);
    g.fillRoundedRect(node.x - node.w / 2, node.y - node.h / 2, node.w, node.h, r);
  }

  /**
   * 하단 버튼 줄(다시하기 · 되돌리기 · 패스) — **공용 버튼**(`ui/uiButton.ts`)으로 그린다.
   * 폭을 고정해 세 버튼의 크기가 라벨 길이에 따라 들쭉날쭉하지 않게 한다(되돌리기는 라벨이 변한다).
   */
  private drawUndoButton(): void {
    const y = H - 160;
    const W_BTN = 300;
    /*
     * ⚠️ **저작 크롬보다 위로 올린다.** 버튼은 기본 depth 0 인데 에디터 main.json 의 층 인테리어
     *   (layer_3, depth 3)와 **암막 보드 패널**(layer_4, depth 5)이 y=2240 자리를 덮는다 →
     *   버튼이 그려지긴 하는데 **화면에서 안 보인다**(실측 2026-08-29 신고: "하단에 재실행·되돌리기
     *   아이콘이 없다"). 저작 최대 depth 는 35 이고 카드는 500+ 를 쓰므로 그 위로 둔다.
     */
    const BTN_DEPTH = 800;
    // **게임 전체 다시하기** — **공용 버튼**(ui/uiButton.ts)으로 만든다(PO 2026-08-29
    //   "게임 전체 다시하기 아이콘은 공용 버튼을 이용하여 제작할 것").
    //   ⚠️ **판을 한 번 더 쓴다**(PO 2026-08-30) — 비용을 버튼 아래에 미리 드러낸다.
    this.add.existing(uiButton(this, BOTTOM_BTN_XS[0], y, '🔄 다시하기', 'blue', () => this.restartGame(), { width: W_BTN, fontSize: 34 })).setDepth(BTN_DEPTH);
    /*
     * **되돌리기 — 솔리테어의 되돌리기 아이템 아이콘을 얹는다**(PO 2026-08-29
     *   "되돌리기 버튼은 솔리테어 게임의 되돌리기 아이템을 쓰고").
     *   버튼 자체는 공용 아트(uiButton) 그대로 두고 그 **위에 아이템 그림만** 올려, 어느 화면에서든
     *   "이게 그 되돌리기다" 가 한눈에 읽히게 한다. 아트가 없으면 라벨의 ↩ 만 남는다(방어).
     */
    this.undoBtn = uiButton(this, BOTTOM_BTN_XS[1], y, this.undoLabel(), 'orange', () => this.doUndo(), { width: 380, fontSize: 34 }).setDepth(BTN_DEPTH);
    if (this.textures.exists(UNDO_ITEM_KEY)) {
      const src = texSize(this.textures.get(UNDO_ITEM_KEY));
      const ih = 74; // 버튼 높이(380 × 724/2172 ≈ 127)의 절반 남짓 — 라벨과 겹치지 않는 크기.
      // 버튼 컨테이너 기준 좌측에 아이콘, 라벨은 원래 자리를 지킨다(컨테이너 좌표계라 x 는 중심 기준).
      this.undoBtn.add(this.add.image(-140, 0, UNDO_ITEM_KEY).setDisplaySize(ih * (src.width / src.height), ih));
      // 아이콘이 들어온 만큼 라벨을 오른쪽으로 — 안 밀면 글자가 그림 위에 겹친다.
      (this.undoBtn.getData('label') as Phaser.GameObjects.Text | undefined)?.setX(34);
    }
    /*
     * **다른 판** — 카드를 새로 섞는다(PO 2026-08-29).
     *   이 자리는 '⏭ 패스' → '🏠 나가기' 를 거쳐 여기까지 왔다. 나가는 길은 ✕(우상단)·☰ 메뉴·
     *   결과 팝업에 이미 셋이나 있어 하단 줄을 나가기에 쓸 이유가 없었다. 대신 왼쪽의 '다시하기'
     *   (같은 판)와 짝을 이루게 두 갈래로 나눴다 — **같은 판 vs 다른 판**.
     */
    this.add.existing(uiButton(this, BOTTOM_BTN_XS[2], y, '🎲 다른 판', 'purple', () => this.newDealGame(), { width: W_BTN, fontSize: 34 })).setDepth(BTN_DEPTH);
    // 두 버튼 다 **새 판으로 계산**되므로 비용을 버튼 아래 작게 붙인다 — 눌러 보고 그제서야
    //   코인이 빠지는 일이 없게(결과 팝업의 '한 번 더'와 같은 원칙).
    this.resetFeeTexts = [BOTTOM_BTN_XS[0], BOTTOM_BTN_XS[2]].map((bx) =>
      this.add.text(bx, y + 74, '', { fontFamily: FONT, fontSize: '26px', color: '#ffe7a8' }).setOrigin(0.5).setDepth(BTN_DEPTH),
    );
    this.paintResetFees();
  }

  /** 하단 두 버튼의 비용 표시 — 판을 쓸 때마다 값이 바뀌므로 그때마다 다시 칠한다. */
  private paintResetFees(): void {
    const fee = bonusFee();
    const label = fee === 0 ? `무료 ${bonusLeft()}판` : `🪙${fee.toLocaleString()}`;
    this.resetFeeTexts.forEach((t) => t.setText(label));
  }

  /**
   * **나가기** — 판을 버리고 홈으로. ✕ 와 '🏠 나가기' 버튼이 공유한다.
   *   ⚠️ 이미 차감된 판수는 **돌려주지 않는다**(시작 시 차감 규약 — logic/bonusGame.ts 참고).
   */
  private skipBonus(): void {
    if (this.autoPlaying || this.ended) return;
    sfx('level_close');
    this.ended = true; // 이후 자동 완성·입력이 끼어들지 않게 잠근다.
    this.scene.start('home');
  }

  /**
   * **다시하기** — **지금 이 판을 처음부터**(PO 2026-08-29 "새로운 판을 만들지 말고 현재 판을
   *   다시 시작"). 카드 배치는 그대로라, 진 수순을 알고 다시 풀어 볼 수 있다.
   *   카드를 새로 섞고 싶으면 '🎲 다른 판'(`newDealGame`)이다 — 두 버튼의 차이가 이것뿐이다.
   * ⚠️ **판을 한 번 더 쓴다**(PO 2026-08-30 "다시하기나 다른 판을 할 경우 게임이 다시 시작되는
   *   것으로 간주되며 추가 게임비가 소요된다"). 예전에는 공짜였는데, 그러면 하루 2회가
   *   "이길 때까지 무제한"이 되어 이론상 보상이 무한이었다.
   */
  private restartGame(): boolean {
    return this.resetBoard(this.initialState);
  }

  /** **다른 판** — 같은 난이도·같은 모드로 카드를 새로 섞는다. 이쪽도 **판을 한 번 더 쓴다**. */
  private newDealGame(): boolean {
    return this.resetBoard(dealKlondikeForLevel(Math.random, this.level, undefined, BONUS_DRAW_COUNT[this.mode]));
  }

  /**
   * 두 버튼의 공통 뒷정리 — 히스토리·부채꼴 기준점까지 판 시작 시점으로 되돌린다.
   *
   * ⚠️ **여기가 두 버튼의 차감 지점이다.** 판을 세는 곳은 `logic/bonusRuntime.startBonusPlay()`
   *   하나뿐이라는 규약을 그대로 따른다 — 새 진입 경로를 만들면 반드시 여기를 지나게 할 것.
   * ⚠️ 차감이 실패하면(코인 부족) **판을 건드리지 않고** 그대로 둔다 — 보드만 리셋되고 돈은
   *   안 빠지거나 그 반대가 되면 안 된다.
   */
  private resetBoard(next: KlondikeState): boolean {
    if (this.ended || this.autoPlaying) return false;
    const started = startBonusPlay();
    if (started === null) {
      sfx('no_coin');
      this.toast(`코인이 부족합니다 — 게임비 🪙${BONUS_PAID_FEE.toLocaleString()}`);
      return false;
    }
    if (started.paid > 0) this.toast(`게임비 🪙${started.paid.toLocaleString()} 지불`);
    this.header?.setCoins(loadSave().coins);
    this.playsLeft = bonusLeft();
    this.nextFee = bonusFee();
    this.paintResetFees();
    sfx('button');
    this.history = [];
    this.wasteFanFrom = 0;
    this.state = next;
    this.initialState = next; // '다른 판'이면 여기가 새 기준점이 된다('다시하기'면 값이 같다).
    this.resetRoundRewards(); // 새 판 = 원장·콤보 초기화(이전 판에서 모은 것은 지지 않았어도 넘어가지 않는다).
    this.placeBoardDiamond(); // 새 판 = 새 추첨.
    this.syncViews(true); // 배치가 통째로 바뀐다 — 순간이동(트윈 없이) 표시.
    // **타임어택은 시계도 처음부터**(PO 2026-08-30 "다른판을 시작할 때나 다시 하기의 경우
    //   타임어택은 게임비를 지불하고 시간이 리셋된다"). 게임비를 냈으니 새 판과 같은 조건이어야 한다 —
    //   남은 시간을 이어받으면 판을 새로 깔아 주고도 사실상 못 푸는 판이 된다.
    if (this.timed) this.startTimeAttack();
    return true;
  }

  private undoLabel(): string {
    const n = itemsOf(loadSave()).undo;
    return n > 0 ? `↩ 되돌리기 ${circledCount(n)}` : `↩ 되돌리기  🪙${this.undoPrice().toLocaleString()}`;
  }

  /**
   * 카드 이동 연출(PO 2026-07-19: "카드 움직임이 너무 직선적입니다. 부드럽게 움직이도록") — 직선 트윈
   *   대신 살짝 떠오르는 2차 베지어 곡선으로 이동시킨다(rewardBurstFly 와 동일 기법, PlayScene.ts 참고).
   */
  private moveCardArc(v: CardView, toX: number, toY: number): void {
    // **이전 이동 트윈을 먼저 멈춘다**(PO 2026-07-28) — 이 트윈은 카운터를 타깃으로 잡고 onUpdate 에서 v.x/v.y 를
    //   직접 쓰기 때문에 `killTweensOf(v)` 로는 안 잡힌다. 겹치면 한 카드에 여러 트윈이 좌표를 써서 카드가
    //   되돌아가거나 제자리에서 떠는 것처럼 보인다(자동 완성처럼 연속 갱신될 때 특히).
    this.arcTweens.get(v)?.stop();
    this.arcTweens.delete(v);
    const fromX = v.x;
    const fromY = v.y;
    const dist = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    if (dist < 2) {
      v.setPosition(toX, toY);
      return;
    }
    const lift = this.autoPlaying ? 0 : Math.min(52, dist * 0.16); // 자동 완성 중엔 아치 없이 직선(연속 재생에 과함).
    const ctrlX = (fromX + toX) / 2;
    const ctrlY = (fromY + toY) / 2 - lift;
    // PO 2026-07-27 "전체 옮기는 구조가 너무 느리고 무겁다" — 런 전체가 매번 최대 380ms 를 쓰던 걸 절반 이하로.
    //   아치 높이도 함께 낮춰(0.22→0.16) 떠다니는 느낌 대신 착 붙는 느낌으로 바꾼다.
    const duration = this.autoPlaying ? 100 : Phaser.Math.Clamp(Math.round(dist * 0.5), 100, 210);
    const tw = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: (counter) => {
        if (!v.scene) return; // 이미 파괴된 뷰 — 좌표를 쓰면 안 된다(정리 전 남은 트윈 방어).
        const t = counter.getValue() ?? 0;
        const u = 1 - t;
        v.x = u * u * fromX + 2 * u * t * ctrlX + t * t * toX;
        v.y = u * u * fromY + 2 * u * t * ctrlY + t * t * toY;
      },
      onComplete: () => this.arcTweens.delete(v),
    });
    this.arcTweens.set(v, tw);
  }

  // ── 상태 ↔ 화면 동기화(항상 전체 재계산 — 카드 최대 52장이라 비용 무시 가능) ──────────
  private syncViews(initial = false): void {
    const seen = new Set<string>();

    const place = (card: Card, x: number, y: number, depth: number, faceUp: boolean, drag: MoveSource | null, proxy?: MoveSource): void => {
      seen.add(card.id);
      let v = this.views.get(card.id);
      const isNew = !v;
      if (!v) {
        v = new CardView(this, x, y, CARD_W, CARD_H, false, CARD_FACE_STYLE);
        this.views.set(card.id, v);
      }
      v.setDepth(depth);
      if (faceUp) {
        if (v.isShowingFace(card)) {
          // 이미 같은 앞면 — 다시 그리지 않는다(setTexture 가 진행 중인 배율 트윈을 리셋한다).
        } else if (!v.isFaceUp()) {
          // **자동 완성 중엔 뒤집기 연출을 쓰지 않는다**(PO 2026-07-28) — 이 구간은 게이트상 뒷면 카드가
          //   0장이라 논리적으로 뒤집을 카드가 없고, 화면의 뒤집기는 "새 뷰는 뒷면으로 시작한다"는 렌더
          //   아티팩트일 뿐이다. 105ms 짜리 뒤집기가 45ms 간격 재생과 겹치면 뷰가 파괴된 뒤 콜백이 도는
          //   위험 구간이 생긴다(그 사고 자체는 cardView.preDestroy 로 막았지만, 애초에 만들지 않는다).
          if (this.autoPlaying) v.showFaceNow(card);
          else v.flipToFace(card);
        } else {
          v.showFace(card);
        }
      } else {
        v.showBack();
      }
      if (initial || isNew) v.setPosition(x, y);
      else this.moveCardArc(v, x, y);
      // 자동 완성 중에는 배선하지 않는다 — 모든 입력 핸들러가 `autoPlaying` 가드로 즉시 반환하므로
      //   52장 전량 재배선(removeAllListeners+setInteractive+setDraggable)은 순수한 낭비다.
      //   재생이 끝나면 finishAutoPlay 의 syncViews() 가 한 번에 복구한다.
      if (!this.autoPlaying) this.wireCard(v, drag, proxy);
    };

    // 태블로.
    this.state.tableau.forEach((col, ci) => {
      let y = this.tabTopY;
      // **폴드(뒷면) 영역 드래그 프록시**(PO 2026-07-28) — 뒷면 카드의 드러난 띠를 잡아 끌면 그 컬럼의
      //   **오픈된 런 전체**가 끌려오게 한다. 뒷면 카드 자체는 원래 입력이 꺼져 있어 그 영역을 잡으면
      //   아무것도 안 잡혔고, 결과적으로 "맨 위 오픈 카드가 안 끌려온다"는 문제가 됐다.
      const faceUpLen = col.filter((c) => c.faceUp).length; // 뒷면은 항상 앞쪽에 몰려 있다.
      const proxy: MoveSource | undefined = faceUpLen > 0 ? { kind: 'tableau', col: ci, count: faceUpLen } : undefined;
      col.forEach((tc, idx) => {
        if (idx > 0) y += col[idx - 1].faceUp ? FACE_UP_STEP : FACE_DOWN_STEP;
        const src: MoveSource | null = tc.faceUp ? { kind: 'tableau', col: ci, count: col.length - idx } : null;
        place(tc.card, colX(ci), y, 10 + idx, tc.faceUp, src, tc.faceUp ? undefined : proxy);
      });
    });

    /*
     * **웨이스트** — 클론다이크 기본대로 그린다(PO 2026-08-29 "3장씩 뽑힐때 2장은 겹쳐지고 1장은 오픈").
     *
     * 한 장 뽑기면 맨 위 한 장만, **세 장 뽑기면 최근 3장을 옆으로 조금씩 겹쳐** 보여 준다 —
     * 앞의 두 장은 일부만 드러나고 **맨 위 한 장만 완전히 열려** 그것만 낼 수 있다.
     * ⚠️ 낼 수 있는 것은 **맨 위 한 장뿐**이다 — 겹친 카드에는 입력을 달지 않는다(`null`).
     *   달면 "보이는데 안 눌리는" 것이 아니라 **규칙상 못 내는 카드가 눌리는** 더 나쁜 버그가 된다.
     * ⚠️ depth 는 왼쪽부터 커져야 오른쪽(맨 위)이 앞에 온다.
     */
    if (this.state.waste.length > 0) {
      const wl = this.state.waste.length;
      // 부채꼴이 다 소진되면(min 이 걸리면) 이전에 뽑아 둔 카드 한 장만 제자리에 드러난다.
      const from = Math.min(this.wasteFanFrom, wl - 1);
      for (let i = from; i < wl; i++) {
        const slot = i - from; // 기준점 고정 — 낸 카드의 자리를 남은 카드가 넘겨받지 않는다.
        place(this.state.waste[i], colX(1) + slot * WASTE_FAN_STEP, this.topY, 200 + slot, true, i === wl - 1 ? { kind: 'waste' } : null);
      }
    }

    // 파운데이션(무늬별 top 카드만 — 그 아래 카드들은 흡수된 것으로 취급, 별도 뷰 불필요).
    (['S', 'H', 'D', 'C'] as const).forEach((s, i) => {
      const rank = this.state.foundations[s];
      if (rank > 0) {
        const card: Card = { id: `${s}${rank}`, suit: s, rank: rank as Rank };
        place(card, colX(3 + i), this.topY, 200, true, null); // 파운데이션에서 다시 꺼내는 건 지원하지 않는다(스코프 최소화).
      }
    });

    // 더 이상 어디에도 없는(=이번 프레임에 안 보인) 뷰 정리 — 파운데이션에 흡수된 하위 랭크 카드 등.
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.arcTweens.get(v)?.stop(); // 파괴 전에 이동 트윈부터 멈춘다(죽은 뷰에 좌표 쓰기 방지).
        this.arcTweens.delete(v);
        v.destroy();
        this.views.delete(id);
      }
    }

    this.stockCountText?.setText(this.state.stock.length > 0 ? `${this.state.stock.length}` : '');
    // 웨이스트는 2장 이상일 때만 표시 — 1장이면 그 카드가 곧 전부라 숫자가 군더더기다.
    this.wasteCountText?.setText(this.state.waste.length > 1 ? `${this.state.waste.length}` : '');
    this.stockBackView?.setVisible(this.state.stock.length > 0);
    this.recycleIcon?.setVisible(this.state.stock.length === 0 && this.state.waste.length > 0);
    if (this.undoBtn) setButtonLabel(this.undoBtn, this.undoLabel());

    this.syncBoardPins(); // 젬을 끼운 카드 옆에 계속 붙여 둔다(카드가 움직이면 따라간다).

    if (!this.ended && isWon(this.state)) this.onWin();
    else this.maybeAutoComplete();
  }

  /**
   * **자동 완성**(PO 2026-07-27 "카드가 대부분 맞춰졌을 때 자동플레이") — 태블로 뒷면이 0장이 되면 남은 게
   *   파운데이션에 올리는 순서뿐이라 나머지를 알아서 끝낸다. 수순 계산은 순수 로직(`planAutoComplete`)이
   *   맡고 여기서는 한 수씩 재생만 한다.
   *
   *   ⚠️ **끝까지 이기는 수순일 때만 시작한다**(PO 2026-07-27 "자동 최종 플레이시 멈추는 문제") — 예전엔
   *      뒷면 0장이면 무조건 시작해서, 올릴 카드가 떨어지면 중간에 멈춰 화면이 굳은 것처럼 보였다.
   *      이제 못 끝내는 판에서는 **아예 시작하지 않고** 조작권을 그대로 둔다.
   *   ⚠️ 재생 중 `syncViews()` 가 이 함수를 다시 부르므로 `autoPlaying` 으로 재진입을 막는다(플래그 해제는
   *      마지막 `syncViews()` **뒤에**).
   */
  private maybeAutoComplete(): void {
    if (this.ended || this.autoPlaying || this.autoRetryBlocked) return;
    if (!canAutoComplete(this.state)) return; // 싼 1차 게이트(뒷면 0장).
    const steps = planAutoComplete(this.state); // 승리로 끝나는 수순이 아니면 null.
    if (!steps) return;

    this.autoPlaying = true;
    this.hideSnapGhost();
    this.toast('자동 완성!');
    // **잠금 불가 보장** — 예상 총 소요 + 여유 안에 안 끝나면 강제로 조작권을 돌려준다(원인 불문).
    const expected = steps.reduce((ms, st) => ms + AUTO_DELAY_MS[st.kind], 0);
    const slack = steps.length * AUTO_WATCHDOG_PER_STEP_MS + AUTO_WATCHDOG_BASE_MS;
    this.autoWatchdog = this.time.delayedCall(expected + slack, () => this.finishAutoPlay(true));
    this.playAutoStep(steps, 0);
  }

  /**
   * 자동 완성 한 수 재생 — **다음 수를 그 수의 종류에 맞는 간격으로 다시 예약**한다(고정 간격 타이머 대신).
   *   손패를 도는 수(draw/recycle)는 빠르게 훑되, 화면이 멈춘 것처럼 보이지 않게 **스톡 더미를 눌러 준다**.
   */
  private playAutoStep(steps: readonly AutoStep[], i: number): void {
    if (!this.autoPlaying || i >= steps.length) {
      this.finishAutoPlay(false);
      return;
    }
    const step = steps[i];
    this.state = step.state;
    sfx('card_place');
    if (step.kind === 'foundation') this.onComboMatch(); // 자동 완성도 한 수는 한 수다.
    else this.breakCombo(); // 자동 완성 중의 뽑기/재순환도 콤보를 끊는다(수동과 같은 규칙).
    if (step.kind !== 'foundation') this.pulseStock(step.kind); // 손패 도는 중이라는 신호(무변화 구간 제거).
    this.syncViews();
    // 마지막 수로 승리 — **종료 절차를 반드시 탄다**. 예전엔 여기서 그냥 return 해 `autoPlaying` 이 true 로
    //   남았고, ✕(건너뛰기)가 워치독이 깨울 때까지 먹통이었다.
    if (this.ended) {
      this.finishAutoPlay(false);
      return;
    }
    this.autoTimer = this.time.delayedCall(AUTO_DELAY_MS[step.kind], () => this.playAutoStep(steps, i + 1));
  }

  // ── 미션 HUD·주문 대기열(메인 솔리테어와 같은 방식) ────────────────
  /**
   * 저작 HUD(main.json)를 이 라운드의 상태에 연결한다 — **메인 솔리테어와 같은 노드**를 쓴다.
   *   · 좌측 5칸 별 게이지 = **지금 주문 진행도**(연속 매칭 수). 5칸이 차면 미션 완수.
   *   · layer_5 + layer_8_copy = 모은 **다이아 개수**(즉시 확보가 아니라 숫자로만 쌓인다).
   *   · layer_8 = 'combo +N' · layer_8_copy3 = 다음 보상 예고 아이콘.
   */
  private setupMissionChrome(): void {
    const idx = this.chrome;
    if (!idx) return;
    const bgDepth = idx.nodeById('layer_9')?.depth ?? 8;
    this.comboStars = [];
    if (this.textures.exists(LEAGUE_STAR_KEY)) {
      for (let i = 0; i < ORDER_SIZE; i++) {
        this.comboStars.push(
          this.add
            .image(GAUGE_STAR_XS[i] ?? GAUGE_STAR_XS[0], GAUGE_STAR_Y, LEAGUE_STAR_KEY)
            .setDisplaySize(GAUGE_STAR_SZ, GAUGE_STAR_SZ)
            .setDepth(bgDepth + 0.5)
            .setScale(0),
        );
      }
    }
    const dIcon = idx.tryById<Phaser.GameObjects.Image>('layer_5');
    const dText = idx.tryById<Phaser.GameObjects.Text>('layer_8_copy');
    if (dIcon && dText) this.diamondHold = { icon: dIcon, text: dText };
    this.comboCountText = idx.tryById<Phaser.GameObjects.Text>('layer_8');
    this.missionRewardImg = idx.tryById<Phaser.GameObjects.Image>('layer_8_copy3');
    idx.tryById('layer_8_copy3__shadow')?.setVisible(false);
    const rn = idx.nodeById('layer_8_copy3');
    this.missionIconBox = { w: rn?.w ?? 50, h: rn?.h ?? 68 };
    this.missionNext = rollBonusMissionRewardAvoiding(this.level, Math.random, undefined) as BonusMissionKind;
    this.showMissionPreview();
    this.paintDiamondHold();
    this.paintComboHud();
  }

  /**
   * **공공건물 층을 상단에 올린다** — 민원 창구에서 들어온 판의 윗그림.
   *
   * PO 2026-08-30: "프리셀도 상단에 각 공공건물을 표시하라." 메인 솔리테어가 위에 점포를 두고 아래에서
   * 게임이 도는 구조를 그대로 따르되, **그 창구의 관공서**(소방서·경찰서·세무서…)를 올린다.
   *
   * 자리·크기는 점포와 **완전히 같다**(`STORE_TOP_REF` 기준 859×518) — 두 화면이 어긋나지 않게.
   * 캐릭터 위치는 홈과 같은 소스(`ui_office` = home_copy2.json 의 Officer 노드 오프셋)를 읽어
   * **홈에서 보던 그 자리 그대로** 세운다. 문서가 없으면(직접 씬 진입 등) 중앙 약간 아래로 폴백한다.
   *
   * ⚠️ 공공건물 아트는 `office` 그룹인데 **STANDING_GROUPS 라 축출되지 않는다** — 홈을 지나온
   *   경로에서는 항상 상주한다. 그래도 텍스처 유무를 확인하고, 없으면 false 를 돌려 점포로 폴백한다
   *   (빈 자리를 만드는 것이 가장 나쁘다).
   * @returns 공공건물을 그렸으면 true(호출부가 점포 경로를 건너뛴다).
   */
  private drawCivicFront(artW: number, artH: number): boolean {
    const desk = this.desk;
    if (!desk) return false;
    const pad2 = (n: number): string => String(n).padStart(2, '0');
    const floorKey = `up_Slitare_Office_${pad2(desk.floor)}`;
    if (!this.textures.exists(floorKey)) return false;
    this.chrome?.tryById('layer_2')?.setVisible(false); // 저작 고정 점포 그림을 끈다.
    const cy = STORE_TOP_REF - artH / 2 + 80;
    this.add.image(W / 2, cy, floorKey).setDisplaySize(artW, artH).setDepth(2);

    // 담당 공무원 — 홈(home_copy2)의 저작 오프셋을 그대로 환산해 같은 자리에 세운다.
    const chrKey = `up_Solirare_Officer_${pad2(desk.floor)}`;
    if (!this.textures.exists(chrKey)) return true; // 건물만이라도 올린다.
    const doc = (this.cache.json.get('ui_office') ?? null) as {
      nodes?: Array<{ key?: string; x: number; y: number; w?: number; h?: number }>;
    } | null;
    const nodes = doc?.nodes ?? [];
    const find = (part: string): (typeof nodes)[number] | undefined => nodes.find((n) => (n.key ?? '').includes(part));
    const bNode = find(`Office_${pad2(desk.floor)}_v2`) ?? find(`Office_${pad2(desk.floor)}`);
    const oNode = find(`Officer_${pad2(desk.floor)}`);
    const k = artH / (bNode?.h ?? artH); // 저작 빌딩 높이 → 이 화면의 표시 높이 스케일.
    const offX = bNode && oNode ? (oNode.x - bNode.x) * k : 0;
    const offY = bNode && oNode ? (oNode.y - bNode.y) * k : artH * 0.1;
    const chr = this.add
      .image(W / 2 + offX, cy + offY, chrKey)
      .setDisplaySize((oNode?.w ?? 110) * k, (oNode?.h ?? 240) * k)
      .setDepth(2.5); // 건물(2) 앞 · 암막 패널(4.5) 뒤 — 손님이 서던 자리와 같은 깊이.
    // **홈과 같은 idle 연출**(PO 2026-08-30 "캐릭터가 움직이지 않는다") — 홈에서는 움직이는데
    //   플레이 화면에서만 굳어 있으면 같은 인물이 딴 사람처럼 보인다. 구현은 공용 모듈 한 곳.
    animateClerkIdle(this, chr, desk.floor * 430); // 층마다 위상차 — 여러 화면을 오갈 때 리듬이 겹치지 않게.
    return true;
  }

  /**
   * **주문 대기열** — 상단 점포 앞에 손님이 줄을 선다(PO 2026-08-30 "가게에 손님도 없고").
   * ⚠️ **공공건물(민원 창구) 판에는 손님이 오지 않는다**(PO 2026-08-30 "손님은 방문하지 않는다") —
   *   관공서는 장사하는 곳이 아니다. 대기열은 **연출 전용**이라(별·코인은 판 결과가 정산한다)
   *   빼도 보상에는 영향이 없다.
   *   연출 모듈(orderQueue.ts)은 메인과 **같은 것**을 그대로 쓴다. 좌표만 이 화면의 점포에 맞춘다.
   */
  private buildOrderQueue(): void {
    if (this.desk) return; // 관공서에는 손님이 오지 않는다.
    if (!this.textures.exists('cust_01')) return; // 손님 아트가 없으면 조용히 생략.
    registerCustomerFrames(this);
    this.orderQueue?.destroy();
    const storeBottom = STORE_TOP_REF + 80; // 점포 아트 하단(drawStorefront 와 같은 식).
    this.orderQueue = new OrderQueue(this, {
      counterX: W / 2 - 20,
      groundY: storeBottom,
      height: 238 * 0.92, // 메인의 점원 크기와 같은 비율.
      depth: 2.5, // 점포 아트(2) 앞 · 암막 패널 뒤 — 메인의 D_CUST 와 같은 값.
      itemFloor: this.floorThemeIdx,
      orderSize: ORDER_SIZE,
      starTarget: { x: GAUGE_STAR_XS[2], y: GAUGE_STAR_Y },
      /*
       * ⚠️ **손님 정산으로 별을 적립하지 않는다**(PO 2026-08-30 "리그 별은 최종 점수와 완료에 따른
       *   보상으로 최대 5개"). 손님이 별을 지불하는 것은 **연출**이고, 실제 리그 별은 판이 끝날 때
       *   `bonusRoundStars` 가 한 번 산출한다. 여기서 적립하면 한 판에 30~40개가 나온다(실측).
       */
    });
  }

  /**
   * 게이지·콤보 텍스트 갱신.
   *   좌측 5칸 = **이 판에서 받을 리그 별 등급**(지금 끝내면 몇 별인지). 상한이 5라 칸 수와 정확히 맞는다.
   *   ⚠️ 예전에는 여기에 "주문 진행도"를 그렸는데, 별이 판당 최대 5개로 바뀌면서 **게이지가 곧 등급**이
   *     되는 편이 읽기 쉽다(주문 진행은 손님 말풍선의 별이 이미 보여 준다).
   */
  private paintComboHud(): void {
    const grade = bonusStarsPreview(this.missionsDone);
    this.comboStars.forEach((st, i) => {
      const on = i < grade;
      st.setScale(on ? 1 : 0);
      if (on) st.setDisplaySize(GAUGE_STAR_SZ, GAUGE_STAR_SZ);
    });
    this.comboCountText?.setText(`+${this.comboRun}`);
  }

  /** 모은 다이아를 **별 수집 UI 옆에 숫자로만** 표시(지급은 결과 화면). */
  private paintDiamondHold(): void {
    this.diamondHold?.text.setText(`+${this.rewards.diamonds}`);
  }

  /** 다음 보상 예고 아이콘 — 상자에 비율 유지로 맞춘다(메인 showMissionPreview 와 같은 규약). */
  private showMissionPreview(): void {
    const img = this.missionRewardImg;
    if (!img) return;
    const key = BONUS_MISSION_ICON[this.missionNext];
    if (!this.textures.exists(key)) return;
    img.setTexture(key);
    const src = texSize(img.texture);
    const scale = Math.min(this.missionIconBox.w / src.width, this.missionIconBox.h / src.height);
    img.setDisplaySize(src.width * scale, src.height * scale);
  }

  // ── 콤보(연속 매칭) ────────────────────────────────────────────────
  /**
   * **성공한 수 1회** — 연속 카운터를 올리고 손님 주문을 한 칸 채운다.
   *   메인 솔리테어와 같은 규칙: **뽑기를 하면 끊긴다**(breakCombo).
   */
  private onComboMatch(): void {
    if (this.ended) return;
    this.comboRun += 1;
    this.orderQueue?.onMatch(this.comboRun);
    if (this.comboRun % ORDER_SIZE === 0) {
      this.pendingMissions += 1; // 주문 1건 완성 — 아이템 정산은 콤보가 끝나는 시점.
      this.missionsDone += 1; // 리그 별 등급의 근거(판 전체 누적 — 콤보가 끊겨도 줄지 않는다).
      sfx('set_complete');
    }
    this.paintComboHud();
  }

  /**
   * **콤보 종료(뽑기·재순환·판 종료)** — 여기서 미션을 정산한다.
   *   완성한 주문 수만큼 보상을 뽑아 **원장에 적립**하고(즉시 지급 아님), 손님은 쌓인 별을 지불하고 떠난다.
   */
  private breakCombo(): void {
    const filled = this.comboRun;
    if (this.pendingMissions > 0) {
      const times = this.pendingMissions;
      this.pendingMissions = 0;
      /*
       * 별 보상의 개수는 **그 콤보에서 맞춘 연속 숫자**다(메인 `finishMission` 의
       *   `Math.max(SET_SIZE, matched)` 와 같은 규약). 한 콤보에서 주문이 여러 건 완성됐으면
       *   그 길이를 건수로 나눠 **합이 콤보 길이가 되게** 나눠 준다 — 건별로 전체 길이를 주면
       *   긴 콤보에서 별이 제곱으로 불어난다.
       */
      const starsEach = Math.max(ORDER_SIZE, Math.floor(filled / times));
      for (let i = 0; i < times; i++) this.grantMissionReward(starsEach);
    }
    if (filled > 0) this.orderQueue?.onBreak(filled);
    this.comboRun = 0;
    this.paintComboHud();
  }

  /**
   * 미션 1건 정산 — 예고된 보상을 **원장에 적립**한다. 풀은 순수 수집 아이템만
   *   (별·다이아·컬렉션 카드 — ＋카드/와일드/되돌리기 같은 진행 아이템은 제외, PO 2026-08-30).
   *   별 개수는 **그 콤보에서 한번에 맞춘 연속 숫자**다(최소 ORDER_SIZE).
   */
  private grantMissionReward(starsEach: number): void {
    const kind = this.missionNext;
    const amount = kind === 'stars' ? starsEach : 1;
    /*
     * **보드에 꽂는다**(PO 2026-08-30) — 메인 게임처럼 예고 아이콘이 보드 카드 뒤로 날아가 꽂히고, 그 카드를
     *   치울 때 회수된다(원장 적립도 그때). 꽂을 자리가 없을 때만 예전처럼 즉시 적립 + 게이지로 날린다.
     * ⚠️ 세 종류를 모두 처리해야 한다 — 예전엔 `diamond` 만 분기하고 나머지를 전부 컬렉션으로 보냈다
     *   (추첨 별 66% 인데 지급 별 0%, 실측 2026-08-30).
     */
    const pin = this.addBoardPin(kind, amount);
    if (pin) {
      pin.view.setAlpha(0); // 날아온 아이콘이 도착할 때 등장 — 먼저 보이면 두 개처럼 읽힌다.
      /*
       * **컬렉션 조각은 카드를 크게 보여 준 뒤 보드로 들어간다**(PO 2026-08-31 "프리셀에서도 솔리테어와 같이
       *   나타났다가 보드로"). 어떤 카드를 받았는지 읽을 틈을 주는 연출이라 아이콘이 날아가는 것으로는 부족하다.
       *   다른 종류(별·다이아)는 지금처럼 아이콘이 날아간다.
       */
      if (pin.kind === 'collection' && pin.slot) {
        this.revealCollectionCard(pin.slot, { x: pin.view.x, y: pin.view.y }, () => {
          if (!pin.view.active) return;
          const sx = pin.view.scaleX;
          const sy = pin.view.scaleY;
          pin.view.setScale(sx * 1.7, sy * 1.7);
          this.tweens.add({ targets: pin.view, alpha: 1, scaleX: sx, scaleY: sy, duration: 240, ease: 'Back.easeOut' });
        });
        this.missionNext = rollBonusMissionRewardAvoiding(this.level, Math.random, kind) as BonusMissionKind;
        this.showMissionPreview();
        return;
      }
      this.flyMissionIcon(kind, { x: pin.view.x, y: pin.view.y }, () => {
        if (!pin.view.active) return;
        const sx = pin.view.scaleX;
        const sy = pin.view.scaleY;
        pin.view.setScale(sx * 1.7, sy * 1.7);
        this.tweens.add({ targets: pin.view, alpha: 1, scaleX: sx, scaleY: sy, duration: 240, ease: 'Back.easeOut' });
      });
    } else {
      if (kind === 'diamond') {
        this.rewards = addRewards(this.rewards, { diamonds: 1 });
        this.paintDiamondHold();
      } else if (kind === 'stars') {
        this.rewards = addRewards(this.rewards, { stars: starsEach });
        this.paintComboHud();
      } else {
        this.rewards = addRewards(this.rewards, { collectionCards: 1 });
      }
      this.flyMissionIcon(kind);
    }
    // 지급했으니 다음 예고 — **직전과 같은 종류는 한 번 다시 뽑는다**(같은 그림이 이어지면 멈춘 것처럼 보인다).
    this.missionNext = rollBonusMissionRewardAvoiding(this.level, Math.random, kind) as BonusMissionKind;
    this.showMissionPreview();
  }

  /**
   * 컬렉션 카드 n 장 지급(승리 정산에서만) — 보유 여부와 무관하게 전체에서 랜덤(메인과 같은 규칙:
   *   이미 가진 카드가 또 나오면 중복 보유로 쌓인다). 아트가 로드된 슬롯만 후보로 둔다.
   *   @returns 실제로 지급한 장수.
   */
  private grantCollectionCards(save: SaveData, n: number): readonly string[] {
    const given: string[] = []; // 지급된 카드 아트 키 — 결과화면이 그 그림을 보여 준다.
    let state = collectionOf(save);
    for (let i = 0; i < n; i++) {
      // **핀으로 보여 준 카드부터**(PO 2026-08-31 — 보여 준 것과 받는 것이 어긋나면 안 된다). 남는 수만 랜덤.
      const slot = this.pinnedSlots[i] ?? pickRandomCard(COLLECTIBLE_SETS, Math.random, (sl) => this.textures.exists(collectionArtKey(sl.set, sl.card)));
      if (!slot) break;
      state = grantCard(state, slot.set, slot.card);
      given.push(collectionArtKey(slot.set, slot.card));
    }
    save.collection = state;
    return given;
  }

  /** 새 판 — 원장·콤보·주문을 통째로 초기화한다(이전 판의 적립분은 넘어가지 않는다). */
  private resetRoundRewards(): void {
    this.rewards = EMPTY_ROUND_REWARDS;
    this.pinnedSlots = [];
    this.comboRun = 0;
    this.pendingMissions = 0;
    this.missionsDone = 0;
    this.orderQueue?.onRunReset();
    this.paintComboHud();
    this.paintDiamondHold();
  }

  /**
   * **컬렉션 조각 등장 연출**(메인 솔리테어 `playCollectionCardReveal` 과 같은 문법, 2026-08-31) —
   *   예고 슬롯에서 카드가 화면 가운데로 **크게 열렸다가**, 보드에 꽂힐 자리로 축소되며 들어간다.
   *   ⚠️ 카드 아트에 이미 프레임이 있어 **바탕판·외곽선을 덧대지 않는다**(PO: "카드만 표시").
   *   ⚠️ 연출 동안 입력을 막는다(딤 Zone) — 그 사이 보드를 만지면 꽂히는 자리와 어긋난다.
   */
  private revealCollectionCard(slot: CollectionSlot, landing: { x: number; y: number }, onArrive: () => void): void {
    const key = collectionArtKey(slot.set, slot.card);
    if (!this.textures.exists(key)) {
      onArrive();
      return;
    }
    const DEPTH = 3500;
    const from = this.missionRewardImg ?? { x: W - 200, y: 470 };
    const cx = W / 2;
    const cy = H * 0.42;
    const fb = fullBleedBounds(this);
    const dim = this.add.rectangle(fb.x, fb.y, fb.w, fb.h, 0x120a1c, 0).setOrigin(0, 0).setDepth(DEPTH).setInteractive();
    const card = this.add.image(from.x, from.y, key).setDepth(DEPTH + 2).setDisplaySize(60, 90).setAngle(-14);
    const src = texSize(card.texture);
    const bigH = 400;
    const bigW = bigH * (src.width / src.height);
    sfx('gauge_full', { volume: 0.6 });
    this.tweens.add({ targets: dim, fillAlpha: 0.62, duration: 220 });
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
        sfx('star', { volume: 0.5 });
        this.tweens.add({ targets: dim, fillAlpha: 0, delay: 620, duration: 320 });
        this.tweens.add({
          targets: card,
          x: landing.x,
          y: landing.y,
          displayWidth: PIN_CARD_W,
          displayHeight: PIN_CARD_W * (src.height / src.width),
          delay: 620,
          duration: 520,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            card.destroy();
            dim.destroy();
            onArrive();
            sfx('card_deal');
          },
        });
      },
    });
  }

  /**
   * 보상 아이콘이 예고 슬롯에서 튀어나와 **꽂힌 자리**(landing)로 — 없으면 좌측 게이지로 — 빨려 들어간다.
   *   보드로 갈 때는 잠깐 **크게 커졌다가** 내려앉는다(메인 missionRewardBurst 와 같은 읽힘).
   */
  private flyMissionIcon(kind: BonusMissionKind, landing?: { x: number; y: number }, onArrive?: () => void): void {
    const from = this.missionRewardImg;
    const key = BONUS_MISSION_ICON[kind];
    if (!from || !this.textures.exists(key)) {
      onArrive?.();
      return;
    }
    const fly = this.add.image(from.x, from.y, key).setDepth(2200).setDisplaySize(56, 56);
    if (landing) {
      this.tweens.add({
        targets: fly,
        x: W / 2,
        y: this.tabTopY - 40,
        displayWidth: 120,
        displayHeight: 120,
        duration: 320,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (!fly.scene) return;
          this.tweens.add({
            targets: fly,
            x: landing.x,
            y: landing.y,
            displayWidth: DIAMOND_SIZE,
            displayHeight: DIAMOND_SIZE,
            duration: 380,
            delay: 220,
            ease: 'Cubic.easeIn',
            onComplete: () => {
              fly.destroy();
              onArrive?.();
            },
          });
        },
      });
      sfx('coin_burst', { volume: 0.3 });
      return;
    }
    const to = kind === 'diamond' && this.diamondHold ? this.diamondHold.icon : { x: GAUGE_STAR_XS[2], y: GAUGE_STAR_Y };
    this.tweens.add({
      targets: fly,
      x: to.x,
      y: to.y,
      displayWidth: 34,
      displayHeight: 34,
      alpha: 0.9,
      duration: 620,
      ease: 'Cubic.easeIn',
      onComplete: () => fly.destroy(),
    });
    sfx('coin_burst', { volume: 0.3 });
  }

  // ── 보드 다이아 ────────────────────────────────────────────────────
  /**
   * **판을 깔 때 다이아 1개를 뒷면 카드에 끼운다**(PO 2026-08-30). 배치 여부는 모드별 확률
   *   (`rollBonusBoardDiamond` — 3장+타임 1판당 1개 … 1장+일반 3판당 1개).
   *
   * ⚠️ 끼우는 자리는 **태블로의 뒷면 카드**다 — 뒤집히는 순간이 곧 회수 순간이라 "파 보니 나왔다"가 된다.
   * ⚠️ 마지막 컬럼(6)은 제외한다 — 젬을 카드 **오른쪽으로 내밀어** 보여 주는데 거기선 화면 밖으로 나간다.
   */
  private placeBoardDiamond(): void {
    this.clearBoardPins();
    if (!rollBonusBoardDiamond(this.mode, this.timed, Math.random)) return;
    this.addBoardPin('diamond', 1);
  }

  /**
   * **핀을 꽂을 카드를 고른다** — 아직 핀이 없는 컬럼의 **가장 아래 카드**(그 아래로 아무것도 없어 핀이 하단으로
   *   살짝 삐져나오고 나머지는 카드에 가린다). 회수는 그 카드가 컬럼을 떠날 때 — "치웠더니 밑에 있었다".
   */
  private pickPinCard(): { col: number; cardId: string } | null {
    const used = new Set(this.boardPins.map((p) => p.col));
    const cols = this.state.tableau.map((c, i) => ({ c, i })).filter(({ c, i }) => c.length > 0 && !used.has(i));
    if (!cols.length) return null;
    const { c, i } = cols[Math.floor(Math.random() * cols.length)];
    return { col: i, cardId: c[c.length - 1].card.id };
  }

  /**
   * 보드에 보상을 꽂는다. 자리가 없거나 아트가 없으면 null — 호출부가 즉시 지급으로 대비한다.
   *   ⚠️ 카드 **뒤**(depth − 0.3)라 카드 앞면을 가리지 않는다(메인 게임 배지와 같은 규약).
   */
  private addBoardPin(kind: BonusMissionKind, amount: number): BoardPin | null {
    /*
     * **컬렉션 핀은 실제 카드 아트**(PO 2026-08-31) — 예전엔 빈 프레임(up_CollecttionCard_Frame)이 카드 밑에서
     *   삐져나와 무엇인지 읽히지 않았다. 꽂는 순간 조각 카드를 **미리 굴려** 그 그림을 보여 주고, 회수·승리 시
     *   **바로 그 카드**를 지급한다(보여 준 것 = 받는 것 — 메인 게임 보드 투입과 같은 문법).
     */
    const slot = kind === 'collection'
      ? pickRandomCard(COLLECTIBLE_SETS, Math.random, (sl) => this.textures.exists(collectionArtKey(sl.set, sl.card)))
      : null;
    const key = kind === 'collection' && slot ? collectionArtKey(slot.set, slot.card) : BONUS_MISSION_ICON[kind];
    if (!this.textures.exists(key)) return null;
    const at = this.pickPinCard();
    if (!at) return null;
    const view = this.add.image(0, 0, key);
    const src = texSize(view.texture);
    if (kind === 'collection') view.setDisplaySize(PIN_CARD_W, PIN_CARD_W * (src.height / src.width)); // 카드는 폭 기준(세로로 길게).
    else view.setDisplaySize(DIAMOND_SIZE, DIAMOND_SIZE * (src.height / src.width));
    const pin: BoardPin = { ...at, view, kind, amount, ...(slot ? { slot } : {}) };
    this.boardPins = [...this.boardPins, pin];
    this.syncBoardPins();
    return pin;
  }

  /**
   * 핀을 **끼운 카드 뒤·하단**에 붙여 둔다(syncViews 끝에서 매번). 카드가 움직이면 따라가고,
   *   그 카드가 원래 컬럼을 떠나면(파운데이션·다른 컬럼) **그 순간이 회수 시점**이다.
   */
  private syncBoardPins(): void {
    for (const pin of this.boardPins) {
      const stillThere = this.state.tableau[pin.col]?.some((tc) => tc.card.id === pin.cardId) ?? false;
      if (!stillThere) {
        this.collectBoardPin(pin);
        continue;
      }
      const v = this.views.get(pin.cardId);
      if (!v) {
        pin.view.setVisible(false);
        continue;
      }
      pin.view.setDepth((v.depth ?? 10) - DIAMOND_BEHIND);
      pin.view.setVisible(true).setPosition(v.x, v.y + CARD_H / 2 - pin.view.displayHeight / 2 + DIAMOND_PEEK);
    }
  }

  /**
   * **회수** — 끼운 카드가 컬럼을 떠나는 순간. 크게 팝했다가 제자리(다이아 배지·별 게이지)로 빨려 들어가고
   *   **원장에 적립**된다(확정은 승리 시 — 메인 게임과 같은 모델).
   */
  private collectBoardPin(pin: BoardPin): void {
    this.boardPins = this.boardPins.filter((p) => p !== pin);
    const gem = pin.view;
    if (pin.kind === 'diamond') {
      this.rewards = addRewards(this.rewards, { diamonds: pin.amount });
      this.paintDiamondHold();
    } else if (pin.kind === 'stars') {
      this.rewards = addRewards(this.rewards, { stars: pin.amount });
      this.paintComboHud();
    } else {
      this.rewards = addRewards(this.rewards, { collectionCards: pin.amount });
      if (pin.slot) this.pinnedSlots.push(pin.slot); // 승리 정산에서 **이 카드부터** 지급(보여 준 것 = 받는 것).
    }
    sfx('coin_burst', { volume: 0.4 });
    const to = pin.kind === 'diamond' && this.diamondHold ? this.diamondHold.icon : { x: GAUGE_STAR_XS[2], y: GAUGE_STAR_Y };
    const bw = gem.displayWidth;
    const bh = gem.displayHeight;
    gem.setDepth(2200); // 회수 연출 동안만 최상단으로(카드 뒤에서 꺼내 보여 준다).
    this.tweens.add({
      targets: gem,
      displayWidth: bw * 2.1,
      displayHeight: bh * 2.1,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        // ⚠️ 씬이 내려갔으면 2단을 걸지 않는다 — 파괴된 오브젝트를 문 트윈이 루프를 멈춘 전례가 있다.
        if (!gem.scene) return;
        this.tweens.add({ targets: gem, x: to.x, y: to.y, displayWidth: bw * 0.6, displayHeight: bh * 0.6, alpha: 0.9, duration: 520, ease: 'Cubic.easeIn', onComplete: () => gem.destroy() });
      },
    });
    const label = pin.kind === 'diamond' ? `💎 +${pin.amount}` : pin.kind === 'stars' ? `⭐ 리그 별 +${pin.amount}` : '🧩 컬렉션 조각 +1';
    this.toast(`${label}  (승리하면 받아요)`);
  }

  /** 판을 새로 깔거나 씬을 떠날 때 — 핀과 보관분을 함께 비운다(이전 판의 보상이 넘어오지 않게). */
  private clearBoardPins(): void {
    for (const p of this.boardPins) p.view.destroy();
    this.boardPins = [];
    this.paintDiamondHold();
  }

  /** 스톡 더미(또는 재순환 아이콘)를 짧게 눌렀다 놓아 "돌아가고 있다"를 보여준다. */
  private pulseStock(kind: AutoStepKind): void {
    if (kind === 'recycle') {
      // 재순환 아이콘은 Text 라 정상 배율이 1 이다.
      const icon = this.recycleIcon;
      if (!icon) return;
      this.tweens.killTweensOf(icon);
      icon.setScale(1);
      this.tweens.add({ targets: icon, scaleX: 0.88, scaleY: 0.88, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
      return;
    }
    // ⚠️ 카드 뷰는 **정상 배율이 1 이 아니다**(텍스처가 슈퍼샘플+여백까지 구워져 있어 ≈0.48).
    //   `setScale(1)` 을 쓰면 스톡 더미가 2배 이상으로 커진 채 남는다 → CardView.pulse 가 기준 배율을 지킨다.
    this.stockBackView?.pulse();
  }

  /**
   * 자동 완성 종료 — **정상 종료와 강제 해제가 같은 경로**를 타게 해 조작권 복귀를 한 곳에서 보장한다.
   *   `forced` = 워치독이 깨운 경우(예상 시간 안에 안 끝남). 그때만 사용자에게 알린다.
   */
  private finishAutoPlay(forced: boolean): void {
    this.autoTimer?.remove(false);
    this.autoTimer = undefined;
    this.autoWatchdog?.remove(false);
    this.autoWatchdog = undefined;
    if (!this.autoPlaying) return;
    this.autoPlaying = false;
    this.hideSnapGhost();
    // 이기지 못한 채 끝났다면 **플레이어가 한 수 둘 때까지** 다시 걸지 않는다 — 같은 수순을 즉시 재시도해
    //   무한 재시작·토스트 도배가 되는 걸 막는다(해제는 아래 조작 진입점들에서).
    this.autoRetryBlocked = !this.ended && !isWon(this.state);
    this.syncViews(); // 조작권 복귀 + 자동 완성 중 건너뛴 입력 배선을 여기서 전량 복구.
    if (forced && !this.ended) this.toast('자동 완성을 끝내지 못했어요 — 계속 진행해 주세요');
  }

  /**
   * 카드 뷰의 입력 배선 — 매 sync 마다 다시 건다(리스너 누적 방지 위해 먼저 clear).
   *   `drag` = 이 카드 자신을 잡는 소스(오픈 카드). `proxy` = 이 카드를 잡으면 **대신** 끌릴 소스
   *   (뒷면 카드의 폴드 영역 → 그 컬럼의 오픈 런). 둘 다 없으면 입력을 끈다.
   */
  private wireCard(view: CardView, drag: MoveSource | null, proxy?: MoveSource): void {
    view.removeAllListeners();
    view.disableInteractive();
    view.pressCancel(); // 재배선 = 리스너가 통째로 사라지는 시점 — 눌린 채로 남은 카드를 여기서 원복한다.
    const source = drag ?? proxy;
    if (!source) return;
    const isProxy = !drag;
    view.setInteractive({ useHandCursor: true });
    this.input.setDraggable(view);
    /*
     * **탭 피드백**(PO 2026-08-30 "카드가 눌리는 느낌이 없어 딱딱하다") — 누르면 살짝 눌려 들어가고,
     *   손을 떼면 정상 배율을 잠깐 넘어서며 튀어오른다(cardView.pressIn/pressOut).
     *   ⚠️ 배율만 건드린다 — 좌표는 moveCardArc 가 카운터 트윈으로 직접 쓰므로 서로 간섭하지 않는다.
     *   ⚠️ 드래그로 넘어가면 반드시 pressCancel — 안 그러면 잡힌 카드만 작아진 채 끌려다닌다.
     */
    view.on('pointerdown', () => {
      if (this.ended || this.autoPlaying) return;
      view.pressIn();
    });
    view.on('pointerout', () => view.pressCancel()); // 손가락이 카드 밖으로 미끄러진 경우.
    view.on('dragstart', () => {
      view.pressCancel();
      this.onDragStart(view, source, isProxy);
    });
    // 프록시로 잡았을 때는 Phaser 가 주는 좌표가 **잡은 뒷면 카드 기준**이라, 실제로 끌리는 런의
    //   기준 카드 좌표계로 보정해서 넘긴다(offX/offY 는 dragstart 에서 계산).
    view.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) =>
      this.onDrag(dragX + (this.dragCtx?.offX ?? 0), dragY + (this.dragCtx?.offY ?? 0)),
    );
    view.on('dragend', (p: Phaser.Input.Pointer) => this.onDragEnd(p));
    view.on('pointerup', () => {
      view.pressOut(); // 눌림 해제 — 탭이 수(手)로 이어지든 아니든 손을 뗀 느낌은 항상 준다.
      if (this.suppressTap) {
        this.suppressTap = false;
        return;
      }
      this.tryTapToFoundation(source);
    });
  }

  // ── 드래그 ─────────────────────────────────────────────────────────
  //   ⚠️ 태블로에서 잡는 카드는 **그 컬럼의 맨 앞(프론트) 카드가 아닐 수 있다** — 유효한 런(runLengthAt)
  //   안이면 중간 카드를 잡아도 그 지점부터 앞까지 전부 같이 옮겨진다(고전 규칙). `sourceCards(source)`가
  //   반환하는 배열의 **[0]이 실제로 손가락이 닿은 카드**(count 계산 기준점), 마지막이 컬럼 맨 앞 카드다.
  private onDragStart(view: CardView, source: MoveSource, isProxy = false): void {
    if (this.ended || this.autoPlaying) return;
    const cards = this.sourceCards(source);
    if (!cards) return;
    const views = cards.map((c) => this.views.get(c.id)).filter((v): v is CardView => !!v);
    if (views.length === 0) return;
    // 자기 자신을 잡은 경우만 기준점 검사(프록시는 애초에 다른 카드를 잡은 것이라 통과시킨다).
    if (!isProxy && views[0] !== view) return; // 잡은 카드가 이 런의 기준점(뒤쪽)이 아니면 무시(방어적).
    const origPos = views.map((v) => ({ x: v.x, y: v.y }));
    views.forEach((v, i) => v.setDepth(500 + i));
    this.dragCtx = {
      source,
      views,
      origPos,
      // 프록시(폴드 영역)로 잡았으면 Phaser 좌표가 그 뒷면 카드 기준이라 런 기준 카드까지의 차이를 보정한다.
      offX: isProxy ? origPos[0].x - view.x : 0,
      offY: isProxy ? origPos[0].y - view.y : 0,
      desiredX: origPos[0].x,
      desiredY: origPos[0].y,
      visualX: origPos[0].x,
      visualY: origPos[0].y,
      magnetized: false,
      lastValidDest: null,
    };
  }

  /**
   * 자석(스냅) 기능(PO 2026-07-19) — 유효한 목적지 근처로 옮기면 손끝 위치 대신 그 목적지 쪽으로
   *   끌어당겨진다. **딱딱한 즉시 잠금이 아니라**(PO "가속도 등을 연출하여 너무 딱딱하지 않게") 목적지에
   *   가까워질수록 당김이 제곱으로 강해지는 혼합 위치를 목표로 잡고, `update()` 가 매 프레임 그 목표를
   *   향해 감속 추종(지수 보간)한다 — 자석 존 밖에서는 손끝을 지연 없이 그대로 따라간다.
   */
  private onDrag(dragX: number, dragY: number): void {
    const ctx = this.dragCtx;
    if (!ctx) return;
    const dest = this.pickDropTarget(dragX, dragY, ctx.views.length === 1);
    const validDest = dest && canMove(this.state, { from: ctx.source, to: dest });
    if (validDest) {
      ctx.lastValidDest = dest; // 이후 손을 뗀 지점이 반경을 벗어나도 이 목적지로 커밋할 수 있게 기억.
      const target = this.targetPosFor(dest, ctx.source);
      const strength = magnetStrength(Math.abs(dragX - target.x));
      ctx.desiredX = Phaser.Math.Linear(dragX, target.x, strength);
      ctx.desiredY = Phaser.Math.Linear(dragY, target.y, strength);
      ctx.magnetized = true;
      this.showSnapGhost(target); // 어디에 놓이는지 미리 보여준다(자석이 걸렸다는 신호).
    } else {
      ctx.desiredX = dragX;
      ctx.desiredY = dragY;
      ctx.magnetized = false;
      ctx.visualX = dragX; // 자석 존 밖 = 지연 없이 손끝 그대로(반응성 유지).
      ctx.visualY = dragY;
      this.applyDragVisual(ctx);
      this.hideSnapGhost();
    }
  }

  /** 자석이 걸린 목적지에 착지 미리보기(고스트) 표시 — 강해진 흡착을 눈으로 확인시켜 준다(PO 2026-07-27). */
  private showSnapGhost(target: { x: number; y: number }): void {
    this.snapGhost?.setPosition(target.x, target.y).setVisible(true);
  }

  private hideSnapGhost(): void {
    this.snapGhost?.setVisible(false);
  }

  /** 매 프레임 자석 당김 추종(자석 존 안에 있는 동안만) — Phaser 씬 생명주기 훅. */
  update(_time: number, delta: number): void {
    this.tickTimeAttack();
    const ctx = this.dragCtx;
    if (!ctx || !ctx.magnetized) return;
    // 프레임레이트 무관 지수 보간 — delta(ms) 가 커도 같은 시간상수(MAGNET_FOLLOW_TAU_MS)를 유지한다.
    const k = 1 - Math.exp(-delta / MAGNET_FOLLOW_TAU_MS);
    ctx.visualX = Phaser.Math.Linear(ctx.visualX, ctx.desiredX, k);
    ctx.visualY = Phaser.Math.Linear(ctx.visualY, ctx.desiredY, k);
    this.applyDragVisual(ctx);
  }

  private applyDragVisual(ctx: DragCtx): void {
    const dx = ctx.visualX - ctx.origPos[0].x;
    const dy = ctx.visualY - ctx.origPos[0].y;
    ctx.views.forEach((v, i) => {
      v.x = ctx.origPos[i].x + dx;
      v.y = ctx.origPos[i].y + dy;
    });
  }

  /** dest 에 카드를 놓았을 때의 정확한 목표 좌표(자석 스냅용) — 파운데이션은 옮기는 카드의 무늬 열, 태블로는 그 컬럼의 다음 자리. */
  private targetPosFor(dest: MoveDest, source: MoveSource): { x: number; y: number } {
    if (dest.kind === 'foundation') {
      const cards = this.sourceCards(source);
      const suit = cards ? cards[0].suit : 'S';
      const suits: readonly Suit[] = ['S', 'H', 'D', 'C'];
      const i = Math.max(0, suits.indexOf(suit));
      return { x: colX(3 + i), y: this.topY };
    }
    return { x: colX(dest.col), y: columnNextY(this.state.tableau[dest.col], this.tabTopY) };
  }

  private onDragEnd(pointer: Phaser.Input.Pointer): void {
    const ctx = this.dragCtx;
    this.dragCtx = undefined;
    this.hideSnapGhost();
    if (!ctx) return;
    this.suppressTap = true;
    let dest = this.pickDropTarget(pointer.x, pointer.y, ctx.views.length === 1);
    if ((!dest || !canMove(this.state, { from: ctx.source, to: dest })) && ctx.lastValidDest && canMove(this.state, { from: ctx.source, to: ctx.lastValidDest })) {
      // 릴리스 지점이 정확한 반경을 벗어났어도, 드래그 도중 유효했던 마지막 목적지로 대신 커밋한다
      // (PO 2026-07-20 "카드를 빠르게 움직였을 때 자리를 잘 찾지 못하는 문제").
      dest = ctx.lastValidDest;
    }
    if (dest) this.tryApply({ from: ctx.source, to: dest });
    this.syncViews(); // 실패해도 무해 — 정확한 원위치로 스냅.
  }

  private pickDropTarget(px: number, py: number, singleCardOnly: boolean): MoveDest | null {
    if (singleCardOnly && py < this.tabTopY - CARD_H / 2) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < 4; i++) {
        const d = Math.abs(px - colX(3 + i));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0 && bestD < SNAP_RADIUS) return { kind: 'foundation' };
    }
    if (py < this.tabTopY - CARD_H) return null; // 스톡/웨이스트 행 근처에 놓은 건 태블로로 스냅되지 않게(파운데이션도 아니면 무효).
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < TABLEAU_COLS; i++) {
      const d = Math.abs(px - colX(i));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 && bestD < SNAP_RADIUS ? { kind: 'tableau', col: best } : null;
  }

  private sourceCards(source: MoveSource): Card[] | null {
    if (source.kind === 'waste') {
      return this.state.waste.length > 0 ? [this.state.waste[this.state.waste.length - 1]] : null;
    }
    const col = this.state.tableau[source.col];
    if (!col || source.count <= 0 || source.count > col.length) return null;
    return col.slice(col.length - source.count).map((tc) => tc.card);
  }

  /** 탭(드래그 없이) — 단일 카드일 때만 파운데이션 자동 이동 시도. */
  /**
   * **탭 = 자동 배치**(PO 2026-08-22 "각 라인을 탭하면 자동 배치되도록. 잡아 끌어서 이동이 아니라").
   *
   * 끌어다 놓기는 모바일에서 손이 많이 가고, 어디에 놓을 수 있는지도 직접 찾아야 한다. 탭 한 번으로
   * **갈 수 있는 가장 좋은 자리**를 찾아 보낸다. 우선순위:
   *   ① 파운데이션(에이스 더미) — 최종 목적지이므로 갈 수 있으면 무조건 먼저.
   *   ② 카드가 있는 태블로 컬럼 — 그중 **뒷면 카드를 새로 여는 쪽**을 먼저(진행에 도움).
   *   ③ 빈 컬럼 — 마지막(빈 자리는 아껴야 한다).
   * 드래그도 그대로 남겨 둔다 — 특정 자리를 직접 고르고 싶을 때가 있다.
   */
  private tryTapToFoundation(source: MoveSource): void {
    if (this.ended || this.autoPlaying) return;
    if (this.autoPlace(source)) this.syncViews();
  }

  /** 탭 자동 배치 — 성공하면 true. */
  private autoPlace(source: MoveSource): boolean {
    // ① 파운데이션 — 최종 목적지라 갈 수 있으면 무조건 먼저.
    if (source.kind === 'tableau' && source.count > 1) {
      // 여러 장을 잡았어도 **한 장씩 차례로 다 올라간다면** 승리패로 보낸다(PO 2026-08-29).
      if (this.tryRunToFoundation(source.col, source.count)) return true;
    } else if (this.tryApply({ from: source, to: { kind: 'foundation' } })) {
      return true;
    }
    // ②·③ 태블로 — 뒷면을 여는 쪽 > 그냥 놓이는 쪽 > 빈 컬럼.
    const fromCol = source.kind === 'tableau' ? source.col : -1;
    const cands: Array<{ dest: MoveDest; score: number }> = [];
    for (let col = 0; col < this.state.tableau.length; col++) {
      if (col === fromCol) continue;
      const dest: MoveDest = { kind: 'tableau', col };
      if (!canMove(this.state, { from: source, to: dest })) continue;
      const pile = this.state.tableau[col];
      const empty = pile.length === 0;
      // 옮기면 원래 컬럼의 뒷면이 새로 열리는가(가장 값진 수).
      const opens =
        source.kind === 'tableau' &&
        this.state.tableau[source.col].length > source.count &&
        !this.state.tableau[source.col][this.state.tableau[source.col].length - source.count - 1].faceUp;
      cands.push({ dest, score: (opens ? 100 : 0) + (empty ? 0 : 10) });
    }
    if (!cands.length) return false;
    cands.sort((a, b) => b.score - a.score);
    return this.tryApply({ from: source, to: cands[0].dest });
  }

  /**
   * **런 전체를 파운데이션으로** — 컬럼 중간을 탭해 2장 이상이 잡혔을 때(PO 2026-08-29
   *   "옮기는 패가 두개 나올 수 있습니다. 이 경우 승리패로 옮겨지도록").
   *
   * 파운데이션은 한 번에 한 장만 받으므로 **맨 앞부터 한 장씩** 올린다. 런은 색이 엇갈리는
   * 내림차순이라(예: ♥3 위에 ♠2) 위에서부터 올리는 순서가 곧 랭크 오름차순이 되어, 파운데이션이
   * 받아 줄 수 있는 유일한 순서다.
   *
   * ⚠️ **전부 올라갈 때만 적용한다.** 앞의 한 장만 올리고 나머지를 두면 "런째 옮긴다"는 조작 감각이
   *   깨지고, 남은 카드가 어디로 갔는지 읽기 어려워진다. 일부만 가능하면 그냥 실패로 두고
   *   태블로 자동 배치(②·③)로 넘긴다.
   * ⚠️ 되돌리기는 **이 이동 전체가 한 번**이다 — 중간 상태로는 되돌아가지 않는다(`pushHistory` 1회).
   */
  private tryRunToFoundation(col: number, count: number): boolean {
    let sim = this.state;
    for (let i = 0; i < count; i++) {
      const mv: KlondikeMove = { from: { kind: 'tableau', col, count: 1 }, to: { kind: 'foundation' } };
      if (!canMove(sim, mv)) return false;
      const next = applyMove(sim, mv);
      if (!next) return false;
      sim = next;
    }
    this.autoRetryBlocked = false;
    this.pushHistory();
    this.state = sim;
    sfx('card_place');
    // ⚠️ 이 경로는 tryApply 를 거치지 않는다 — **옮긴 장수만큼** 콤보를 직접 센다(빠뜨리면 런으로
    //    올릴 때만 미션이 안 차서 "가끔 안 오른다"가 된다).
    for (let i = 0; i < count; i++) this.onComboMatch();
    return true;
  }

  private tryApply(move: KlondikeMove): boolean {
    if (!canMove(this.state, move)) return false;
    this.autoRetryBlocked = false; // 플레이어가 한 수 뒀다 — 자동 완성을 다시 평가할 가치가 생겼다.
    this.pushHistory();
    const next = applyMove(this.state, move);
    if (!next) {
      this.history.pop();
      return false;
    }
    this.state = next;
    sfx('card_place');
    this.onComboMatch(); // 성공한 수 1회 = 손님 주문 한 칸(연속으로 이을수록 미션이 빨리 찬다).
    return true;
  }

  // ── 스톡/웨이스트 ──────────────────────────────────────────────────
  private onStockTap(): void {
    if (this.ended || this.autoPlaying) return;
    if (this.state.stock.length === 0 && this.state.waste.length === 0) return; // 둘 다 비었으면 무반응.
    this.autoRetryBlocked = false; // 뽑기/재순환도 상태 변경 — 자동 완성 재평가 가능.
    this.breakCombo(); // **뽑으면 콤보가 끊긴다**(메인 솔리테어와 같은 규칙) — 여기서 미션을 정산한다.
    this.pushHistory();
    if (this.state.stock.length > 0) {
      this.wasteFanFrom = this.state.waste.length; // 지금 뽑는 장들이 새 부채꼴의 시작이다.
      this.state = drawFromStock(this.state);
    } else {
      this.wasteFanFrom = 0;
      this.state = recycleWaste(this.state);
    }
    sfx('card_deal');
    this.syncViews();
  }

  // ── 되돌리기(유일한 부스터 — PO: "되돌리기 아이템 외에는 와일드카드나 +카드 아이템이 없다") ──
  private pushHistory(): void {
    this.history.push({ s: this.state, fanFrom: this.wasteFanFrom });
    if (this.history.length > 60) this.history.shift();
  }

  private undoPrice(): number {
    return undoPriceAt(this.level, this.chMult);
  }

  private doUndo(): void {
    if (this.ended || this.autoPlaying) return;
    if (this.history.length === 0) {
      this.toast('되돌릴 수 없어요');
      return;
    }
    const s = loadSave();
    const it = itemsOf(s);
    if (it.undo > 0) {
      it.undo -= 1;
      s.items = it;
      writeSave(s);
    } else {
      const price = this.undoPrice();
      if (s.coins < price) {
        sfx('no_coin');
        this.toast('코인이 부족해요 — ☰ 메뉴 › 🛒 상점에서 충전할 수 있어요');
        return;
      }
      s.coins -= price;
      writeSave(s);
      this.header?.setCoins(s.coins);
    }
    this.autoRetryBlocked = false; // 되돌리기로 상태가 바뀌었다.
    const prev = this.history.pop()!;
    this.state = prev.s;
    this.wasteFanFrom = prev.fanFrom; // 부채꼴 기준점도 같이 되감아야 카드가 제자리로 돌아온다.
    /*
     * **되돌리면 콤보 런은 끊긴다**(메인 솔리테어와 같은 규칙). 되감은 수를 다시 세면 같은 카드로
     *   미션을 무한히 채울 수 있다 — 되돌리기 아이템만 있으면 별이 무한 생산된다.
     * ⚠️ 이미 완성돼 원장에 들어간 보상은 되돌리지 않는다(지급 시점이 아니라 적립 시점 기준).
     */
    this.comboRun = 0;
    this.pendingMissions = 0;
    this.orderQueue?.onRunReset();
    this.paintComboHud();
    sfx('undo');
    this.syncViews();
  }

  // ── 승리 ───────────────────────────────────────────────────────────
  /**
   * 승리 — **정액 코인**을 준다(PO 2026-08-29 "게임 승리시 5천코인").
   *
   * ⚠️ 예전에는 메인 레벨의 별점 보상표(`starCoinsAt`)를 따랐고 **레벨 진행과 미션 별점까지** 건드렸다.
   *   이제 이 게임은 레벨 체계 밖의 독립 보너스라 그 둘을 **떼어냈다** — 안 그러면 보너스로 메인
   *   진행도가 오르고 미션 트랙이 이중 적립된다. 여기서 움직이는 것은 **코인 하나뿐**이다.
   */
  private onWin(): void {
    this.ended = true;
    sfx('win_fanfare');
    this.timerRunning = false; // 이겼으면 시계를 세운다(팝업 중에 시간이 흐르면 안 된다).
    // 타임어택 승리만 **사다리를 한 칸 민다**(5승마다 −5초) — 제한시간 없는 판은 난이도 진행과 무관하다.
    if (this.timed) {
      const wins = recordBonusTimeWin(this.mode);
      const next = bonusTimeLimitForWins(this.mode, wins);
      if (next < this.timeLimitSec) {
        this.toast(`⏱ 다음 판부터 제한시간 ${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')}`);
      }
    }
    /*
     * **진행 보상 배수는 기본 승리 보상에만** 곱한다 — 창구 perk(세무 환급·이벤트 진행)는 별도 설계값이라
     *   거기에 배수를 또 얹으면 두 축이 곱해져 후반에 발산한다(perk 는 `deskPerkRewards` 로 따로 더해진다).
     */
    const coins = Math.round(bonusWinCoins(this.mode, this.timed) * this.deskMult);
    /*
     * **보드에서 모은 다이아는 승리해야 확정된다** — 메인 게임(PlayScene.pendingDiamonds)과 같은 모델.
     *   판을 깔았다가 지거나 나가면 사라지므로 "끝까지 푼다"가 보상으로 이어진다.
     */
    this.breakCombo(); // 판이 끝났다 — 남은 주문을 여기서 마지막으로 정산한다.
    /*
     * **원장을 여기서 한 번에 확정한다**(PO 2026-08-30 "별을 포함하여 모든 리워드는 게임 결과를 통하여
     *   수집되는 구조"). 지면 `rewards` 는 지급되지 않고 사라진다 — 그래서 "끝까지 푼다"가 곧 보상이다.
     */
    /*
     * **리그 별은 여기서 한 번 산출된다**(PO 2026-08-30) — 완료(승리)했는가 + 중간에 **연속 맞춤**을
     *   몇 번 냈는가(연속 5매칭 = 주문 1건). 상한은 5. 규칙은 logic/bonusStars.ts 단일 출처.
     * ⚠️ 판 도중에는 별을 적립하지 않는다 — 예전엔 손님 정산·미션마다 쌓아 한 판에 30~40개가 나왔다.
     */
    const stars = bonusRoundStars({ won: true, missionsCompleted: this.missionsDone });
    const earned = addRewards(this.rewards, { coins, stars, ...this.deskPerkRewards() });
    this.rewards = EMPTY_ROUND_REWARDS;
    const save = loadSave();
    save.coins += earned.coins;
    if (earned.diamonds > 0) save.diamonds = (save.diamonds ?? 0) + earned.diamonds;
    const grantedCards = earned.collectionCards > 0 ? this.grantCollectionCards(save, earned.collectionCards) : [];
    writeSave(save);
    /*
     * ⚠️ 리그 별은 **addLeaguePoints 를 거쳐야 한다** — 자정을 넘겨 판이 끝나면 기간(leaguePeriodId)이
     *   바뀌어 있어 점수를 0부터 다시 쌓아야 한다. save.leaguePoints 에 직접 더하면 지난 기간 점수에
     *   얹혀 리그 순위가 어긋난다. 이 함수가 loadSave/writeSave 를 자체적으로 하므로 **위 writeSave 뒤에** 부른다.
     */
    /*
     * **단계 보상까지 같은 길로**(2026-08-30 보상구조 재설계) — 예전엔 순위 점수(addLeaguePoints)만 올리고
     *   투데이 리그 **단계(칸) 보상**은 메인 게임만 받았다. 보너스 승리 1판이 기준 단위가 된 이상 같은 별은 같은
     *   대접을 받아야 한다. `creditLeagueStars` 가 순위 점수 + 단계 진행 + 칸 보상(코인)을 함께 확정한다
     *   (기간 전환·자체 저장 규칙은 addLeaguePoints 와 동일).
     */
    if (earned.stars > 0) {
      const r = creditLeagueStars(earned.stars);
      if (r.coins > 0) this.toast(`🏆 투데이 리그 ${r.stage}단계 달성  🪙+${r.coins.toLocaleString()}`);
    }
    // ⚠️ 창구 부수효과도 **writeSave 뒤에** — 자체적으로 loadSave/writeSave 하므로 위 저장을 덮으면 안 된다
    //   (리그 별과 같은 이유).
    this.applyDeskSideEffects();
    this.header?.setCoins(save.coins);
    this.header?.setDiamonds(save.diamonds ?? 0);
    this.paintDiamondHold();
    this.time.delayedCall(500, () => this.showWinPopup(earned, grantedCards));
  }

  /**
   * **창구별 추가 보상 — 원장에 얹는 몫**(`logic/civicDesks.ts`의 `perk`).
   *
   * 판 결과 원장(`RoundRewards`)에 그대로 더해지므로 **지면 사라진다** — "끝까지 푼다"가 보상이라는
   * 이 게임의 규약을 창구 보상도 똑같이 따른다.
   *
   * ⚠️ **다이아는 넣지 않는다.** 층 건설 다이아 비용이 "레벨 구간 수입"을 기준으로 계산되는데,
   *   창구에서 다이아가 새로 들어오면 그 계산이 조용히 어긋난다(민원 창구 설계 C절).
   *   판당 보드 다이아(`rollBonusBoardDiamond`)는 **모드 기준**이라 창구와 무관하게 이미 정해져 있다.
   */
  private deskPerkRewards(): Partial<RoundRewards> {
    const perk = this.desk?.perk;
    if (!perk) return {};
    if (perk.kind === 'coins') return { coins: perk.amount };
    if (perk.kind === 'collectionCard') return { collectionCards: 1 };
    return {}; // thiefProgress 는 원장이 아니라 부수효과(applyDeskSideEffects).
  }

  /**
   * **창구별 추가 보상 — 원장 밖 부수효과.** 지금은 경찰서의 '도둑 추적'(일일 이벤트 진행)뿐이다.
   * ⚠️ `creditEventItems` 는 스스로 저장하므로 **onWin 의 writeSave 뒤에** 불러야 한다.
   */
  private applyDeskSideEffects(): void {
    const perk = this.desk?.perk;
    if (perk?.kind !== 'thiefProgress') return;
    const r = creditEventItems(perk.steps);
    this.header?.setCoins(loadSave().coins);
    this.toast(`👮 도둑 추적 +${perk.steps}${r.coins > 0 ? ` · 이벤트 보상 🪙${r.coins.toLocaleString()}` : ''}`);
  }

  // ── 타임어택 ───────────────────────────────────────────────────────
  /**
   * 제한시간 표시 + 3·2·1 카운트다운 뒤 시계 시작(PO 2026-08-30).
   *
   * ⚠️ **카운트다운이 끝난 뒤에 시계를 켠다.** 화면이 뜨자마자 재면 판을 훑어볼 1~2초를 그냥 잃는다.
   *   코어 `startCountdown` 이 그동안 입력까지 흡수하므로 별도 잠금이 필요 없다(전 게임 공용).
   * ⚠️ 시계는 **첫 줄 카드 바로 위**(topY − CARD_H/2 − TIMER_ABOVE_CARDS)에 둔다 — 보드가 내려간 뒤(2026-08-30) 그 사이 띠가 넓어졌다 —
   *   헤더·미션 배너와 겹치지 않는 유일하게 비어 있는 자리다.
   * ⚠️ depth 800 — 저작 인테리어(3)·암막 패널(5)이 이 자리를 덮는다(하단 버튼과 같은 이유).
   */
  private startTimeAttack(): void {
    /*
     * ⚠️ **다시 부를 수 있어야 한다.** '다시하기'·'다른 판'·시간 초과 뒤 '같은 판 다시'가 전부
     *   여기로 돌아온다 — 매번 새 텍스트를 만들면 시계가 겹쳐 쌓인다. 그래서 표시는 **재사용**하고
     *   시계 값만 다시 세운다.
     * ⚠️ 제한시간을 **그때 다시 읽는다**(`bonusTimeLimitSec`) — 사다리(5승마다 −5초)가 움직였을 수
     *   있고, `?bonusTime=` 으로 시험 중이라면 그 값이 이어져야 한다.
     */
    this.timerRunning = false;
    this.timeLimitSec = bonusTimeLimitSec(this.mode);
    this.timeLeftMs = this.timeLimitSec * 1000;
    if (!this.timerText) {
      this.timerText = this.add
        .text(W / 2, this.topY - CARD_H / 2 - TIMER_ABOVE_CARDS, '', { fontFamily: FONT, fontSize: '52px', color: '#ffe066', stroke: '#3a1d5c', strokeThickness: 7 })
        .setOrigin(0.5)
        .setDepth(800);
    }
    this.paintTimer();
    startCountdown(this, { onStep: () => sfx('button') }).then(() => {
      if (!this.scene.isActive() || this.ended) return; // 카운트 도중 나갔을 수 있다.
      this.timerRunning = true;
    });
  }

  /**
   * 매 프레임 시계 — ⚠️ **`rawDelta` 를 쓴다.** Phaser 의 `delta` 는 목표 FPS 로 고정된 값이라
   *   저사양 기기에서 실제보다 천천히 흐른다(전 게임 공통 함정). 실시간 규칙은 항상 rawDelta.
   */
  private tickTimeAttack(): void {
    if (!this.timerRunning || this.ended) return;
    this.timeLeftMs -= this.game.loop.rawDelta;
    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0;
      this.timerRunning = false;
      this.paintTimer();
      this.onTimeUp();
      return;
    }
    this.paintTimer();
  }

  private paintTimer(): void {
    const left = Math.max(0, Math.ceil(this.timeLeftMs / 1000));
    const warn = left <= 30; // 마지막 30초는 빨갛게 — 시간을 정하려면 압박 구간이 보여야 한다.
    this.timerText?.setText(`⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`).setColor(warn ? '#ff6b6b' : '#ffe066');
  }

  /** 시간 초과 = 패배. ⚠️ 게임비는 돌려주지 않는다(차감은 시작 시점 — 결과와 무관하다). */
  private onTimeUp(): void {
    if (this.ended) return;
    this.ended = true;
    sfx('no_coin');
    this.time.delayedCall(300, () => this.showTimeUpPopup());
  }

  private showTimeUpPopup(): void {
    const layer = overlayLayer(this, 3000);
    layer.add(overlayScrim(this, 0x0a0a1a, 0.85));
    const cx = W / 2;
    const cy = H / 2;
    layer.add(
      this.add
        .text(cx, cy - 260, '⏰ TIME UP', { fontFamily: FONT, fontSize: '78px', color: '#ff8a8a', stroke: '#4b1020', strokeThickness: 10 })
        .setOrigin(0.5),
    );
    layer.add(this.add.text(cx, cy - 150, '시간 안에 못 끝냈어요', { fontFamily: FONT, fontSize: '42px', color: '#ffffff' }).setOrigin(0.5));
    // **같은 판을 다시** — 배치를 아니까 시간 안에 되는지 재볼 수 있다. 판수는 차감하지 않는다
    //   (하단 '다시하기'와 같은 성격 — 이미 시작한 한 판 안에서 되감는 것이다).
    // ⚠️ '같은 판 다시'도 **새 판으로 계산된다**(PO 2026-08-30) — 비용을 라벨에 먼저 드러낸다.
    const sameLabel = this.nextFee === 0 ? `🔄 같은 판 다시 (무료 ${this.playsLeft})` : `🔄 같은 판 다시 (🪙${this.nextFee.toLocaleString()})`;
    layer.add(
      uiButton(this, cx, cy - 20, sameLabel, 'blue', () => {
        // ⚠️ **차감에 성공한 뒤에** 팝업을 닫는다 — 먼저 닫으면 코인이 모자랄 때 보드도 팝업도
        //   없는 상태로 남는다.
        this.ended = false; // 시계는 restartGame → resetBoard 안에서 다시 세운다.
        if (!this.restartGame()) {
          this.ended = true;
          return;
        }
        layer.destroy();
      }, { width: 620, fontSize: 40 }),
    );
    const againLabel = this.nextFee === 0 ? `🎁 새 판 (무료 ${this.playsLeft})` : `🎁 새 판 (🪙${this.nextFee.toLocaleString()})`;
    layer.add(
      uiButton(this, cx, cy + 100, againLabel, 'green', () => {
        const started = startBonusPlay();
        if (started === null) {
          this.toast(`코인이 부족합니다 — 게임비 🪙${BONUS_PAID_FEE.toLocaleString()}`);
          return;
        }
        layer.destroy();
        this.scene.restart({ mode: this.mode, timed: this.timed });
      }, { width: 620 }),
    );
    layer.add(
      uiButton(this, cx, cy + 220, '🏠 홈으로', 'red', () => {
        sfx('level_close');
        layer.destroy();
        this.scene.start('home');
      }),
    );
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 200 });
  }

  /**
   * 결과 화면 — **메인 게임과 같은 저작 결과화면**(blank_2.json · resultPopup.ts, PO 2026-08-30 "프리셀에서도
   *   동일한 결과표시"). 여기가 수집 지점이다 — 지면 이 화면이 뜨지 않으므로 아무것도 지급되지 않는다.
   *   ⚠️ 컬렉션 카드는 후보가 없으면 못 줄 수 있어 **실제 지급된 카드**를 보여 준다(표시와 지급 일치).
   *
   * 버튼도 메인과 같다(HOME / NEXT). 이 게임은 레벨 흐름 밖이라 **NEXT = 한 번 더**(같은 모드·같은 압박) —
   *   차감은 `startBonusPlay()` **한 곳**에서, 코인이 모자라면 보드·팝업을 그대로 두고 안내만 한다.
   */
  private showWinPopup(earned: RoundRewards, grantedCards: readonly string[]): void {
    let collected = false;
    let handle: ReturnType<typeof buildResultPopup> = null;
    /** 회수 연출 뒤 이동 — 두 번째부터는 곧바로(메인과 같은 규칙). */
    const go = (fn: () => void): void => {
      if (collected || !handle) {
        fn();
        return;
      }
      collected = true;
      collectResultRewards(
        this,
        handle,
        { coins: earned.coins, diamonds: earned.diamonds, stars: earned.stars },
        {
          coin: this.header?.coinAnchor ?? { x: 360, y: 90 },
          gem: this.header?.diamondAnchor ?? { x: W - 260, y: 90 },
          star: { x: W - 100, y: 250 }, // 헤더 우측(리그 아이콘 자리) — 이 씬엔 리그 아이콘 좌표가 없다.
          card: { x: 1005, y: 90 }, // 컬렉션 보관함(메인 COLLECTION_STORE_TARGET 과 동일).
        },
        fn,
        3100, // 팝업(3000) 위.
      );
    };
    // 결과화면 아트는 지연 그룹 `result`(PlayScene 과 동일) — 판 시작 때 미리받기, 못 맞췄으면 로딩 표시 뒤 연다.
    {
      handle = buildResultPopup(this, {
        stars: earned.stars,
        coins: earned.coins,
        diamonds: earned.diamonds,
        leagueStars: earned.stars,
        cardKeys: grantedCards,
        hasNext: true,
        depth: 3000,
        onHome: () => go(() => this.scene.start('home')),
        onNext: () => {
          // 차감이 **먼저** — 모자라면 연출도 이동도 없이 안내만(보드·팝업은 그대로).
          const started = startBonusPlay();
          if (started === null) {
            this.toast(`코인이 부족합니다 — 게임비 🪙${BONUS_PAID_FEE.toLocaleString()}`);
            return;
          }
          go(() => this.scene.restart({ mode: this.mode, timed: this.timed }));
        },
      });
      if (!handle) {
        console.warn('[bonus] 결과화면 저작(blank_2.json)을 그릴 수 없어 홈으로 이동');
        this.scene.start('home');
      }
    }
  }

  // ── 메뉴(☰) — 사운드 토글 + 홈으로. 와일드/+5 부스터 없음(되돌리기만 지원). ──
  private openMenu(): void {
    if (this.autoPlaying) return; // 다른 진입점과 동일 — 재생 중 홈 이탈 차단(상태 꼬임 방지).
    sfx('button');
    const layer = overlayLayer(this, 3000);
    layer.add(overlayScrim(this, 0x140a1e, 0.88));
    layer.add(
      this.add
        .text(W / 2, 620, '⚙ 메뉴', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '80px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 })
        .setOrigin(0.5),
    );
    const mk = (y: number, label: string, color: ButtonColor, fn: () => void): Phaser.GameObjects.Container => {
      const b = uiButton(this, W / 2, y, label, color, fn, { width: 620, fontSize: 50 });
      layer.add(b);
      return b;
    };
    // **상점**(PO 2026-07-29 "게임플레이시 숍메뉴에 접근할 수 있어야 함") — 보너스 라운드도 되돌리기에
    //   코인을 쓰므로 PlayScene 과 동일하게 메뉴에서 연다(같은 itemShop.ts 화면).
    mk(760, '🛒 상점', 'orange', () => {
      sfx('button');
      openItemShop(this, {
        depth: 4500,
        onCoins: (total) => {
          this.header?.setCoins(total);
          if (this.undoBtn) setButtonLabel(this.undoBtn, this.undoLabel()); // 살 수 있게 된 되돌리기 가격 표기 갱신.
        },
        onDiamonds: (total) => this.header?.setDiamonds(total),
        toast: (msg) => this.toast(msg),
      });
    });
    // **사운드 볼륨**(PO 2026-07-28) — PlayScene 메뉴와 동일하게 단계 순환(100→75→50→25→꺼짐).
    const snd = mk(880, volumeLabel(), 'purple', () => {
      const v = cycleVolume();
      setButtonLabel(snd, volumeLabel());
      if (v > 0) sfx('button');
    });
    // **진동**(2026-08-25) — PlayScene 메뉴와 동일한 토글.
    const hap = mk(1000, hapticsLabel(), 'purple', () => {
      toggleHaptics();
      setButtonLabel(hap, hapticsLabel());
      sfx('button');
    });
    mk(1120, '🏠 홈으로', 'red', () => {
      sfx('level_close');
      layer.destroy();
      this.scene.start('home');
    });
    mk(1240, '▶ 계속하기', 'green', () => {
      sfx('level_close');
      layer.destroy();
    });
  }

  /**
   * **보너스 라운드 사용법 안내**(PO 2026-08-22 "간단하게 표시할 것 · 클릭해서 이동하는 것도").
   *   처음 들어온 판에서만 한 번 뜨고, 닫으면 손가락이 실제 카드 위를 짚어 탭 이동을 보여 준다.
   */
  private showRules(): void {
    if (this.ended || !this.scene.isActive()) return;
    markTipSeen(RULES_TIP_KEY);
    const layer = overlayLayer(this, 2100).setName('klondike-rules');
    const dim = overlayScrim(this, 0x000000, 0.55);
    layer.add(dim);
    const cx = W / 2;
    const cy = H * 0.44;
    const body = this.add
      .text(cx, cy, [
        '위 칸은 같은 무늬로 A → K 순서로 채워요.',
        '아래 줄은 색이 다른 카드로 K → A 로 쌓아요.',
        '',
        '카드를 탭하면 갈 수 있는 자리로 알아서 옮겨져요.',
      ].join(String.fromCharCode(10)), {
        fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
        fontSize: '40px', color: '#4a2f14', align: 'center', wordWrap: { width: W * 0.66 },
      })
      .setOrigin(0.5);
    // 글자 분량에 맞춰 **안쪽 영역**을 기준으로 키우고, 글자는 그 한가운데(ui/messagePanel.ts).
    const fit = fitMessagePanel(GREEN_PANEL, body.width, body.height, { minW: W * 0.8, maxW: W * 0.94, padX: 60, padY: 52 });
    const pw = fit.pw;
    const ph = fit.ph;
    body.setY(cy + fit.textY);
    if (this.textures.exists(RULES_PANEL_KEY)) {
      layer.add(this.add.image(cx, cy, RULES_PANEL_KEY).setDisplaySize(pw, ph));
    } else {
      layer.add(this.add.rectangle(cx, cy, pw * 0.9, ph * 0.85, 0xfff2df, 0.98).setStrokeStyle(6, 0x8ac46b));
    }
    layer.add(body);
    layer.add(
      this.add
        .text(cx, cy + ph * 0.34, '화면을 탭하면 시작합니다', {
          fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif',
          fontSize: '32px', color: '#6b5a3a',
        })
        .setOrigin(0.5),
    );
    dim.once('pointerdown', () => {
      layer.destroy();
      this.showTapHint();
    });
  }

  /** 탭 이동을 **실제 카드 위에서** 한 번 짚어 준다 — 말보다 손가락이 빠르다. */
  private showTapHint(): void {
    if (this.ended || !this.scene.isActive() || !this.textures.exists(RULES_POINTER_KEY)) return;
    // 가장 오른쪽(가장 긴) 열의 맨 위 앞면 카드 — 탭으로 옮길 수 있는 대표 자리.
    let target: CardView | undefined;
    for (let col = TABLEAU_COLS - 1; col >= 0 && !target; col -= 1) {
      const pile = this.state.tableau[col];
      const top = pile[pile.length - 1];
      if (top?.faceUp) target = this.views.get(top.card.id);
    }
    if (!target) return;
    const hand = this.add
      .image(target.x + CARD_W * 0.28, target.y + CARD_H * 0.34, RULES_POINTER_KEY)
      .setDisplaySize(132, 132)
      .setDepth(2200);
    this.toast('카드를 탭하면 갈 수 있는 자리로 이동해요');
    this.tweens.add({ targets: hand, y: hand.y + 26, duration: 480, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.time.delayedCall(4200, () => hand.destroy());
  }

  private toast(msg: string): void {
    const t = this.add
      .text(W / 2, H - 320, msg, { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '36px', color: '#ffffff', backgroundColor: '#2a1830dd', padding: { x: 28, y: 14 }, align: 'center' })
      .setOrigin(0.5)
      .setDepth(1600);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 40, duration: 1100, delay: 800, onComplete: () => t.destroy() });
  }
}
