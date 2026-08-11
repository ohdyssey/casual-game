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
  uploadPath,
  MISSION_BOX_PANEL_KEY,
} from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { Pedestrian, pathToWaypoints } from './pedestrians.js';
import { CardView } from './cardView.js';
import { levelDef, editorLevelCount, MAX_PROGRESS_LEVEL, FLOORS } from '../logic/levels.js';
import { hasBonusAfter } from '../logic/klondike.js';
import { preloadAudio, playBgm, sfx, sfxCardPlace, sfxStar, sfxWinSting, cycleVolume, volumeLabel } from '../audio.js';
import { buildTopHeader, type TopHeader } from './topHeader.js';
import { openItemShop } from './itemShop.js';
import { buildMissionRewardBanner, type MissionRewardBanner } from './missionRewardBanner.js';
import { buildEntryPopup } from './entryPopup.js';
import { preloadCustomers, registerCustomerFrames, startCustomerVisits, type CustomerSpot } from './customers.js';
import { OrderQueue } from './orderQueue.js';
import type { CardBoardDoc } from '../logic/editorLevels.js';
import { EDITOR_LEVELS_KEY } from '../logic/editorLevels.js';
import { seededRng } from '../logic/deck.js';
import { dealDynamic } from '../logic/solvable.js';
import type { Grade } from '../logic/difficulty.js';
import { loadSave, writeSave, itemsOf, missionRewardOf, collectionOf, type SaveData } from '../save.js';
import { applyStars as applyMissionStars, type MissionRewardBox } from '../logic/missionReward.js';
import { CARDS_PER_SET, COLLECTIBLE_SETS, grantCard, ownedCount, pickRandomCard, type CollectionSlot } from '../logic/collection.js';
import { CARD_ART_SETS, collectionArtKey, collectionCardKey } from './collectionPopup.js';
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
import { STAR_CUTS, STAR_RATIO_CUTS, MAX_STARS, starsForQuality, starsForRatio, referenceQuality, matchGain, playingQuality, finalQuality } from '../logic/starRating.js';
import { SUITS, RANKS, type Card, type Suit } from '../logic/types.js';
import {
  type GameState,
  wasteTop,
  isExposed,
  isPlayable,
  availableMoves,
  playCard,
  playWild,
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

const W = 1080;
const H = 2400;
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
// 보너스 값 **역빈도(∝ 1/N) 정확 할당 패턴** — 확률 추첨은 표본 노이즈로 +5 가 +3 보다 자주 나오는
//   역전이 생길 수 있어, 주기에 +1×30 · +2×15 · +3×10 · +5×6 (= 1/1:1/2:1/3:1/5)
//   을 결정적 셔플로 미리 배치한다. 레벨→패턴 인덱스 고정 → 주기 안에서 비율이 정확히 역빈도.
const BONUS_PATTERN: readonly number[] = (() => {
  const counts: ReadonlyArray<readonly [number, number]> = [[1, 30], [2, 15], [3, 10], [5, 6]];
  const arr: number[] = [];
  for (const [v, c] of counts) for (let i = 0; i < c; i++) arr.push(v);
  const rng = seededRng(424242); // 고정 시드 — 모든 클라에서 동일 패턴.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

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
}

// ── 미션 콤보(에디터 크롬 전용) ────────────────────────────────────────
// 콤보로 카드를 연속 매칭 → 오른쪽 상단 박스(PLAY MISSION)의 5칸이 맞춘 카드 색으로 채워진다.
// 5칸이 다 차면 한 세트 완료. **별 = 완성 세트 수**(아래 SETS_FOR_*), 게이지는 시각 연출용.
const SET_SIZE = 5; // 미션 1틱 = 5매칭(5·10·15…마다 미션 보상). 손님 주문 별은 이 배수로 큰별(=5) 탤리.
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

type MissionRewardKind = 'coins' | 'cards' | 'diamond' | 'wild' | 'plus5' | 'collection';
interface MissionReward {
  readonly kind: MissionRewardKind;
  readonly amount: number;
  /** kind='collection' 일 때만 — 추첨된(예고된) 컬렉션 카드 슬롯. 지급 시 이미 보유했으면 재추첨. */
  readonly slot?: CollectionSlot;
}
// **보상 축소**(PO 2026-07-17 "보상이 너무 크다"·경제 시뮬 H안 하향) — 매 5-콤보 지급이라 인플레 유발 → 수량↓.
//   경제 모델 정합(src/logic/economy.ts): 코인 40%·게임비×0.08, 다이아 6%(가중 6/100).
const MISSION_REWARD_TABLE: readonly { kind: MissionRewardKind; weight: number; amount: number }[] = [
  { kind: 'coins', weight: 38, amount: 0 }, // 자주 — amount 0 = 런타임 게임비 연동(×0.08).
  { kind: 'cards', weight: 34, amount: 2 }, // 자주 — 스톡 +2(추가 카드).
  { kind: 'plus5', weight: 8, amount: 3 }, // 드묾 — **뽑기 카드로 적용**(스톡 +3).
  { kind: 'wild', weight: 8, amount: 2 }, // 드묾 — **뽑기 카드로 적용**(스톡 +2).
  { kind: 'diamond', weight: 6, amount: 1 }, // 드묾 — **게임완성 보상풀**(pendingDiamonds, 레벨 클리어 시 지급).
  // 드묾 — **컬렉션 카드 1장**(미보유 중 랜덤). 다 모았으면 rollMissionReward 가 코인으로 대체한다.
  { kind: 'collection', weight: 6, amount: 1 },
];
/**
 * **콜렉션 드랍 가중치**(PO 2026-07-20 "초기 발생 확률을 높일 것" → 2026-07-27 "콜렉션 카드가 잘 안 나옵니다").
 *   레벨1은 기본치의 배수로 시작해 COLLECTION_BOOST_UNTIL_LEVEL 부터 기본치로 선형 감소.
 *
 * ⚠️ 체감 드랍률은 가중치만으로 정해지지 않는다 — **판당 미션 틱 수 × 추첨 확률 × 승률**이다(승리해야 확정).
 *   실측(2026-07-27, 저작 100레벨·레벨당 60판 시뮬): 판당 미션 틱 3.8회 · 승률 43% →
 *     기본 6  → 1틱당 6.0% → 확정 0.131장/판 = **1장에 7.6판**(PO 가 "잘 안 나온다"고 한 상태)
 *     기본 14 → 1틱당 13.0% → 확정 0.28장/판 = **1장에 3.6판**  ← 현재
 *   가중치를 만질 땐 이 세 요소를 같이 볼 것(승률이 반이면 체감 드랍률도 반이다).
 */
const COLLECTION_WEIGHT_EARLY = 34;
const COLLECTION_WEIGHT_BASE = 14;
const COLLECTION_BOOST_UNTIL_LEVEL = 20;
function collectionWeightForLevel(level: number): number {
  if (level >= COLLECTION_BOOST_UNTIL_LEVEL) return COLLECTION_WEIGHT_BASE;
  const t = Math.max(0, level - 1) / (COLLECTION_BOOST_UNTIL_LEVEL - 1);
  return Math.round(COLLECTION_WEIGHT_EARLY - t * (COLLECTION_WEIGHT_EARLY - COLLECTION_WEIGHT_BASE));
}
const MISSION_ICON: Record<MissionRewardKind, string> = {
  coins: 'up_Solitare_UI_2_3',
  cards: 'up_Solitare_UI_08-2_v2',
  diamond: 'up_Solitare_UI_2_2',
  wild: 'up_Solitare_UI_08',
  plus5: 'up_Solitare_UI_07',
  collection: 'up_CollecttionCard_Frame', // 폴백(슬롯 추첨 전) — 실제로는 추첨된 카드 아트로 대체된다.
};
// 컬렉션 카드가 "보관되는" 곳 — 콜렉션은 홈 상단 우측(Pass 아이콘)에서 열린다. 플레이 화면엔 아이콘이
//   없으므로 헤더 우측 끝(메뉴 근처)을 보관함 방향으로 삼아 카드가 그쪽으로 빨려 들어간다.
const COLLECTION_STORE_TARGET = { x: 1005, y: 90 } as const;
// 좌측 5별 게이지 위치 — HUD 배경 UI_10-1_v3 의 별 외곽선 5개 중심(정밀 측정, layer_15_copy3 x=104 정합).
const GAUGE_STAR_XS = [104, 192, 280, 370, 459] as const;
const GAUGE_STAR_Y = 760; // layer_15_copy3 y=760(2026-07-18 전체 하향 조정 반영).
const GAUGE_STAR_SZ = 51; // layer_15_copy3 w=51.
// 전체 스타 게이지(파란 바) 기하 — 에디터 layer_7(x=135 w=177 y=761 h=58 radius=17, #006eff) 값 하드코딩.
//   (layer_7 은 DYNAMIC_NODE_IDS 로 정적 렌더 제외돼 chrome 에서 조회 불가 → 값 고정.)
const GAUGE_BAR_GEOM = { left: 46, y: 761, h: 58, r: 17 };
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

/** 실제 적용 상한 = 저작 카드 크기 그대로(1:1) × 미세조정 배수. 보드 여유 부족 레벨만 fit 으로 축소(오버플로 방지). */
const ABS_CARD_MAX_SCALE = 1.0 * CARD_SIZE;

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
const STOCK_STACK_CAP = 26;
const STOCK_FAN_STEP = 9; // 카드 한 장당 왼쪽 이동(px) — 좁게 겹치되 왼쪽 가장자리가 드러나 셀 수 있게.

export class PlayScene extends Phaser.Scene {
  private level = 1;
  // **점포(층) 테마 = 소유한 최고층 기준**(PO 2026-07-19) — 레벨 번호와 무관. 2층을 아직 매입 안 했으면
  //   몇 레벨을 플레이하든 항상 1층(편의점)에서 진행하고, 매입/건설로 최고 소유층이 오르면 그 층에서 진행한다.
  //   FLOORS 아트가 5종뿐이라 6층 이상은 순환(6층→1층 테마, …).
  private floorThemeIdx = 1;
  private chMult = 1; // **도전 배수**(진입 팝업 선택) — 보상·부스터 가격에 적용. '베팅' 용어 금지.
  private orderQueue?: OrderQueue; // **주문 대기열**(상단 점포 손님 줄 — 주문서 시스템 연출).
  private state!: GameState;
  private cards = new Map<string, CardView>();
  // **다이아**(게임 중 카드에서 수집 — 판당 ~2개). 건물 업그레이드 재화.
  private diamondSlots = new Set<string>(); // 다이아가 끼워진 슬롯.
  private diamondViews = new Map<string, Phaser.GameObjects.Image>(); // 슬롯별 다이아 아이콘.
  private pendingDiamonds = 0; // **보관(미확정) 다이아** — 게임 중 수집분. **승리 시에만** save 에 확정.
  private diamondHold?: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }; // 다이아 완성 보상풀 표시(중앙 고정 슬롯).
  private missionDiamondPos?: { x: number; y: number }; // 중앙 다이아 슬롯 좌표(회수 목표점).
  // **컬렉션 카드 = 보드 투입형 보상**(PO 2026-07-26 2차) — 미션으로 뽑힌 카드는 즉시 지급되지 않고 보드의
  //   가려진 카드에 꽂혀 있다가, 그 카드가 **열리는 순간** 일반 카드 오픈보다 1.5배로 커졌다 스타게이지로
  //   빨려 들어간다. 실제 확정 지급은 **레벨 클리어(승리) 시** — 다이아(pendingDiamonds)와 같은 모델.
  //   ⚠️ **동시 여러 장**(PO 2026-07-29) — 예전엔 한 번에 한 장만 허용해, 먼저 꽂힌 카드가 깊이 묻혀 있으면
  //   그 판의 이후 컬렉션 카드가 전부 즉시지급(instant)으로 새어 나갔다(우상단으로 날아가 사라지는 것처럼
  //   보이던 그 현상). 이제 슬롯별로 독립 관리한다 — 상태 플래그도 카드마다 따로 가진다.
  private boardCollections = new Map<string, BoardCollection>();
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
  private suppressReveal = false;
  // 에디터에 저작된 레벨 수(1부터 연속) — 승리 진행/다음 레벨 버튼을 이 범위로 클램프.
  private editorLevels = 1;
  // 부스터: 되돌리기 히스토리(**GameState 밖 래치까지 스냅샷** — undo 가 미션게이지·특수카드 상태를 정확히 되돌리도록) + 와일드 활성 + 버튼.
  private history: HistorySnap[] = [];
  /** 되돌리기로 취소된 **무작위 결과가 있는 수** 1건(뽑기/＋5) — 같은 자리에서 다시 하면 재현할 결과. */
  private undoneRandomStep?: { readonly kind: HistoryKind; readonly from: GameState; readonly to: GameState };
  // **비행 중 카드 수**(매칭 토스·스톡 플립) — >0 이면 undo/+5 를 막아 orphan 뷰가 wasteView 를 덮는 레이스를 방지(카드 탭 자체는 계속 허용=동시 플레이).
  private flyingCards = 0;
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
  private pendingMissionBox?: MissionRewardBox; // 이번 판에 미션 티어가 완료됐으면 결과 팝업 뒤에 보여줄 보상.
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
  private pendingBankWild = false; // refresh 중 노출 감지 → 루프 후 뱅킹 트리거
  private wildBanking = false; // 뱅킹 비행 진행 중 — 스톡 더미에 와일드 아트를 아직 표시하지 않음(도착 후 표시)
  // **보드 보너스(+N) 카드** — 노출되면 스톡에 N장 추가(뒷면 흡입 연출) 후 사라진다.
  private bonusSlot?: { id: string; count: number };
  private bonusTriggered = false;
  private pendingBonus = false;
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
  private simSpeed: 1 | 2 | 4 = 1;
  private simTimer?: Phaser.Time.TimerEvent;
  private simBar?: Phaser.GameObjects.Container;
  private simPlayBtn?: Phaser.GameObjects.Text;
  private simSpeedBtn?: Phaser.GameObjects.Text;
  private simStatus?: Phaser.GameObjects.Text;
  private autoRunCombo = 0; // 현재 진행 중인 콤보 런 길이(뽑기/승리 시 comboRuns 로 확정).
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

  init(data: { level?: number; mult?: number }): void {
    // 명시 레벨이 없으면 저장된 진행 레벨로 이어서 플레이.
    this.level = data?.level ?? loadSave().level;
    // **도전 배수**(진입 팝업에서 선택) — 보상·부스터 가격에 함께 적용. 미지정=x1.
    this.chMult = Math.max(1, Math.floor(data?.mult ?? 1));
    // **점포 테마 = 소유 최고층**(1층은 항상 소유) — 매입/건설 전이면 무조건 1층에서 진행.
    const ownedFloors = Math.max(1, loadSave().ownedFloors ?? 1);
    this.floorThemeIdx = ((ownedFloors - 1) % 5) + 1;
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
        .text(x, y, '버튼', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#2a1830', backgroundColor: '#ffd166', padding: { x: 40, y: 16 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', on);
    }
    const img = this.add.image(x, y, key).setInteractive({ useHandCursor: true });
    const src = img.texture.getSourceImage() as { width: number; height: number };
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
    setEconFromJson(this.cache.json.get(ECON_JSON_KEY)); // 경제 SSOT 적용(없으면 기본값).
    playBgm('play'); // 플레이 BGM 으로 전환(첫 제스처에서 시작·홈 BGM 크로스페이드).
    this.cards.clear();
    this.busy = false;
    this.flyingCards = 0; // 씬 재사용 대비: 비행 카운터 리셋(중단된 애니의 onComplete 미발화 대비).
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
    this.pendingBankWild = false;
    this.wildBanking = false;
    this.bonusSlot = undefined;
    this.bonusTriggered = false;
    this.pendingBonus = false;
    this.emptyStockPlus5 = undefined;
    this.emptyStockPending = false;
    this.wildImg = undefined;
    this.undoImg = undefined;
    // 다이아 상태 초기화(씬 재사용 대비).
    this.diamondSlots.clear();
    this.diamondViews.clear();
    this.pendingDiamonds = 0;
    this.diamondHold = undefined;
    this.missionDiamondPos = undefined;
    // 컬렉션 카드(보드 투입) 상태 초기화 — 보관분은 승리에서만 확정되므로 씬 재시작 시 전부 버린다.
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
    const mainDoc = (this.cache.json.get(UI_MAIN_KEY) ?? null) as LayoutDoc | null;
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
        stockCount: layout.initialDeal.stock.length,
      });
    } else {
      this.state = dealDynamic(layout, rng, grade, { stockCount: layout.stock ?? undefined });
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
    this.placeDiamonds(); // 카드 2장에 다이아 끼우기(수집 시 별 게이지 옆에 보관).
    this.designateWild(); // 보드 카드 하나를 와일드로 지정(노출 시 자동으로 스톡에 삽입).
    this.refresh();
    // 최초 딜 연출 — 폴드 먼저 차르륵, 오픈 카드는 좌우에서 날아와 안착(가속 리듬).
    this.dealInAnimation();
    // 자동 시뮬레이션 QA 도구(dev 빌드 전용) — 버튼 배치 + 이전 판에서 켜둔 상태면 이어서 진행.
    this.drawAutoTestUI();
    if (autoTestState.running) this.startAutoTest();
    // 레벨 점검용 시뮬레이션 바(하단 중앙) — 켠 채로 레벨을 옮겨도 자동 진행되지 않게 항상 꺼진 상태로 시작.
    this.drawSimBar();
  }

  /**
   * **다이아 배치** — 보드 카드 중 2장에 다이아를 끼운다(초기 노출 팁은 피해 '중간에 낀' 느낌).
   *   위치: 카드 **오른쪽**에 자리가 있으면 옆, 없으면 왼쪽, 그것도 없으면 **위/아래**.
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
    const picked = pool
      .map((id) => ({ id, r: rng() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, count)
      .map((o) => o.id);
    picked.forEach((id, i) => {
      const view = this.cards.get(id);
      if (!view) return;
      this.diamondSlots.add(id);
      // **카드 뒤**(depth − 0.3)에 배치 → 카드가 사라지면(플레이) 드러나 획득. 위/아래로 살짝 삐져나오게.
      const gem = this.add.image(0, 0, 'up_Solitare_UI_2_2').setDepth((view.depth ?? 100) - 0.3);
      const src = gem.texture.getSourceImage() as { width: number; height: number };
      const gs = this.geom.cardW * 0.62; // 조금 더 크게.
      gem.setDisplaySize(gs, gs * (src.height / src.width));
      const ch = this.geom.cardH;
      const top = i % 2 === 0; // 번갈아 위/아래로 삐져나옴.
      gem.setPosition(view.x, view.y + (top ? -ch * 0.6 : ch * 0.6)); // 카드 위/아래로 **더 많이 삐져나옴**(중심이 가장자리 바깥).
      gem.setAngle(top ? -13 : 13); // 살짝 기울임.
      gem.setAlpha(0); // 딜 연출 후 페이드인(카드 안착 뒤 드러나게).
      this.tweens.add({ targets: gem, alpha: 1, delay: 900, duration: 300 });
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
    const covered = [...this.cards.keys()].filter((id) => !exposedNow.has(id) && !this.diamondSlots.has(id));
    let pool = (covered.length ? covered : [...this.cards.keys()].filter((id) => !exposedNow.has(id))).slice();
    if (!pool.length) return;
    // **가장 늦게(=거의 다 클리어된 시점) 노출되는 구간은 후보에서 뺀다**(PO 2026-07-29 "와일드/보너스가
    // 가장 아래쪽에 나와 사실상 쓸 필요가 없다 — 마지막에 뽑힌 와일드·추가 카드가 무슨 의미가 있나").
    // 커버 그래프 깊이(=노출까지 남은 단계)를 BFS 로 계산해 남은 깊이의 마지막 35%는 제외한다.
    // 걸러지고 남는 후보가 없으면(아주 얕은 보드) 원래 후보 전체로 되돌린다.
    const depth = new Map<string, number>();
    {
      const cleared = new Set(exposedNow);
      let frontier = [...exposedNow];
      for (const id of frontier) depth.set(id, 0);
      let d = 0;
      while (frontier.length) {
        d++;
        const next: string[] = [];
        for (const s of this.state.layout.slots) {
          if (cleared.has(s.id)) continue;
          if (s.coveredBy.every((c) => cleared.has(c))) next.push(s.id);
        }
        for (const id of next) { cleared.add(id); depth.set(id, d); }
        frontier = next;
      }
    }
    const maxDepth = Math.max(0, ...pool.map((id) => depth.get(id) ?? 0));
    const cutoff = Math.floor(maxDepth * 0.65);
    const shallow = pool.filter((id) => (depth.get(id) ?? 0) <= cutoff);
    if (shallow.length) pool = shallow;
    const rng = seededRng(this.level * 733 + 991);
    const shuffled = pool.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.id);
    // 첫 슬롯 = 와일드.
    this.wildSlotId = shuffled[0];
    this.wildBanked = false;
    // 둘째 슬롯(있으면) = 보너스 +N. 값은 레벨 시드로 결정적 선택.
    const values = BONUS_VALUES.filter((v) => this.textures.exists(BONUS_ART[v]));
    if (shuffled.length >= 2 && values.length) {
      // **역빈도 패턴 할당** — 레벨→패턴 인덱스 고정(+1 최다 … +10 최희귀, 64레벨 주기 비율 보장).
      const want = BONUS_PATTERN[(this.level - 1) % BONUS_PATTERN.length];
      const count = values.includes(want) ? want : values[0]; // 아트 미로드 시 +1 폴백.
      this.bonusSlot = { id: shuffled[1], count };
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
    const view = this.cards.get(slot);
    this.cards.delete(slot);
    const preStock = this.state.stock.length; // 보너스 전 스톡 수(순차 노출 시작점).
    this.state = consumeBonusCard(this.state, slot, count); // 스톡 N 추가 + 슬롯 클리어
    // **순차 노출** — 회수 카드가 하나씩 도착할 때마다 스톡 부채가 한 장씩 늘어난다(전량 즉시 표시 방지).
    this.stockRevealMax = preStock;
    this.buildStockPile();
    sfx('card_deal');
    this.toast(`🎁 +${count} 카드! 뽑기 더미가 늘어났어요`);
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
    this.wildBanking = true; // 비행 도착 전까지 더미에 와일드 아트를 표시하지 않음
    const view = this.cards.get(slot);
    this.cards.delete(slot);
    this.state = bankWildToStock(this.state, slot, this.rng); // 스톡 중간(임의 순서) 삽입 + 슬롯 클리어
    sfx('card_deal');
    this.toast('🃏 와일드 카드 발견! 뽑기 더미 속으로 들어갔어요');
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
    const t = this.diamondHoldTarget();
    if (!this.diamondHold) {
      const icon = this.add.image(t.x, t.y, 'up_Solitare_UI_2_2').setDepth(75);
      if (this.textures.exists('up_Solitare_UI_2_2')) {
        const src = icon.texture.getSourceImage() as { width: number; height: number };
        icon.setDisplaySize(46, 46 * (src.height / src.width));
      }
      const text = this.add
        .text(t.x + 26, t.y, '', { fontFamily: '"Jua", sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#5a1a6a', strokeThickness: 6 })
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
  private applyEditorChrome(doc: LayoutDoc): void {
    // 동적 노드(게이지 채움·박스 칸·보상 팝업 목업)는 코드가 직접 제어하므로 정적 렌더에서 제외.
    const staticDoc: LayoutDoc = { ...doc, nodes: doc.nodes.filter((n) => !DYNAMIC_NODE_IDS.has(n.id)) };
    this.chrome = buildLayout(this, staticDoc);
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
    // 플레이 화면 닫기(✕) 버튼 = layer_20(up_DailyMission_08-1_v3, 우상단) — 저작만 돼 있고 미배선이었다
    //   (2026-07-19 PO 지시). ☰메뉴의 "홈으로"와 동일 동작 — 별도 확인창 없이 바로 홈으로.
    this.chrome?.tryById<Phaser.GameObjects.Image>('layer_20')?.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('level_close');
      this.scene.start('home');
    });
    // **미션 리워드 배너**(연속 플레이 별 수집) — 홈과 동일 위치/구성. 만료됐으면 여기서도 즉시 리셋 반영.
    //   손님을 정산할 때마다 creditMissionStars 가 실시간으로 저장까지 확정한다(PO 2026-07-18 3차) — 여기서는
    //   이번 판 진입 시점의 확정 진행도로 배너를 초기 표시만 한다.
    const mrSave = loadSave();
    const mrState = missionRewardOf(mrSave, Date.now());
    mrSave.missionReward = mrState;
    writeSave(mrSave);
    this.missionBanner = buildMissionRewardBanner(this, mrState, 0, 1580, () => this.resetExpiredMissionTier());
  }

  /**
   * **아이템샵 열기**(플레이 중) — 홈과 **같은 화면**(itemShop.ts 공용 모듈). 구매로 코인/다이아가 늘면
   *   이 씬의 잔액 캐시(`baseCoins`)와 헤더·부스터 활성 상태까지 즉시 맞춘다 — 안 그러면 코인을 샀는데도
   *   부스터가 계속 비활성으로 보인다.
   *   depth 는 플레이 메뉴(3000)보다 높게 잡아 메뉴 위에 뜬다.
   */
  private openShop(): void {
    openItemShop(this, {
      depth: 4500,
      onCoins: (total) => {
        this.baseCoins = total;
        this.header?.setCoins(total);
        this.updateBoosters(); // 살 수 있게 된 부스터를 즉시 활성화.
      },
      onDiamonds: (total) => this.header?.setDiamonds(total),
      toast: (msg) => this.toast(msg),
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
    this.missionBanner?.setState(next);
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

  /** 플레이 상단 헤더의 메뉴(☰) — 사운드 토글 + 홈으로. */
  private openPlayMenu(): void {
    sfx('button');
    const layer = this.add.container(0, 0).setDepth(3000);
    layer.add(this.add.rectangle(0, 0, W, H, 0x140a1e, 0.88).setOrigin(0, 0).setInteractive());
    layer.add(
      this.add
        .text(W / 2, 620, '⚙ 메뉴', { fontFamily: '"Jua", sans-serif', fontSize: '80px', color: '#ffe066', stroke: '#7a2d9a', strokeThickness: 9 })
        .setOrigin(0.5),
    );
    const mk = (y: number, label: string, bg: string, fn: () => void): Phaser.GameObjects.Text => {
      const t = this.add
        .text(W / 2, y, label, {
          fontFamily: '"Jua", sans-serif',
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
    mk(760, '🛒 상점', '#c25e00', () => {
      sfx('button');
      this.openShop();
    });
    // **사운드 볼륨**(PO 2026-07-28) — 누를 때마다 100→75→50→25→꺼짐 순환. 마지막 단계가 음소거라 별도 on/off 없음.
    const snd = mk(880, volumeLabel(), '#4a3a5a', () => {
      const v = cycleVolume();
      snd.setText(volumeLabel());
      if (v > 0) sfx('button'); // 바뀐 볼륨을 바로 귀로 확인시켜 준다(꺼짐이면 무음).
    });
    // **자동테스트 표시 토글**(dev 빌드 전용) — QA 버튼 묶음을 화면에서 켜고 끈다.
    let autoUiBtn: Phaser.GameObjects.Text | undefined;
    if (import.meta.env.DEV) {
      const autoUiLabel = (): string => `🧪 자동테스트 표시: ${autoTestState.uiVisible ? '켜짐' : '꺼짐'}`;
      autoUiBtn = mk(1000, autoUiLabel(), '#4a3a5a', () => {
        this.toggleAutoTestUI();
        autoUiBtn?.setText(autoUiLabel());
        sfx('button');
      });
    }
    // **친절한 이미지 버튼**(UI_23) — 홈(주황)·계속(핑크). 사운드 토글만 텍스트(온/오프 상태 표시).
    layer.add(
      this.uiButton(W / 2, 1160, 'up_Solitare_UI_23_2', () => {
        sfx('button');
        this.scene.start('home');
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
          // **수직 오픈/폴드 반복** — scaleY 를 |cos(3π·u)| 로(높이가 위아래로 접혔다 열렸다, u=0.5 에서 엣지온).
          const flip = Math.abs(Math.cos(u * Math.PI * 3));
          if (u < 0.5) {
            // 카드 단계 — 떨어졌다 솟으며 **약간 작아지고** 세로로 오픈/폴드(위아래 접힘).
            const shrink = cardSX * (1 - 0.22 * (u / 0.5));
            card.setPosition(x, y);
            card.setScale(shrink, Math.max(0.001, shrink * flip));
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
   * **미션 리워드 실시간 정산**(PO 2026-07-18 3차 수정) — 손님이 모은 별이 **3개 미만이면 무반응**, 3개
   *   이상이면 그 정확한 개수(3,4,5,6…)를 레벨 등급과 무관하게(무제한) **지금 즉시 저장까지 확정**한다.
   *   손님을 정산하는 매 순간이 적립 시점 — 여러 판(레벨)에 걸쳐 계속 쌓이고, 이 판 도중에 티어(35)를
   *   완료해도 재화는 즉시 지급(보상 박스 팝업만 다음 승리 화면에서 노출).
   */
  private creditMissionStars(count: number, src: { x: number; y: number }): void {
    if (count < 3) return; // 게이트: 3개 미만은 무반응(PO 확정).
    const save = loadSave();
    const result = applyMissionStars(missionRewardOf(save, Date.now()), count, Date.now());
    save.missionReward = result.state;
    let grantedCards: Array<{ card: CollectionSlot; entry: BoardCollection | null }> = []; // 티어 박스 컬렉션 카드(연출용).
    if (result.completed && result.reward) {
      const box = result.reward;
      save.coins += box.coins ?? 0;
      save.diamonds = (save.diamonds ?? 0) + (box.diamonds ?? 0);
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
      this.pendingMissionBox = box; // 다음 승리 팝업(showMissionReward 이후)에서 노출.
      this.baseCoins += box.coins ?? 0; // 재화는 즉시 반영(다음 refresh 에서 헤더에 표시).
    }
    writeSave(save);
    this.missionBanner?.animateTo(result.state, src);
    if (result.completed && result.reward) this.playMissionBoxRewardBurst(result.reward);
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

  /**
   * **미션 티어 완료 보상 연출**(PO 2026-07-18: "다이아가 커졌다가 저장소로 빨려들어가는 연출, 코인도
   *   마찬가지") — 배너의 보상 미리보기 아이콘(rewardAnchor, 이미 커졌다 작아지는 펄스 재생 중)에서
   *   출발해 헤더의 재화 카운터로 낙하→상승 회수되는 입자를 날린다(rewardBurstFly 재사용).
   *   ⚠️ **이 티어의 대표 보상 하나만** 연출한다(2026-07-18 QA "다이아 내려오는데 코인도 같이 내려온다") —
   *   배너 미리보기도 한 번에 한 아이템만 보여주므로, 박스에 코인+다이아가 함께 들어있어도 연출은
   *   미리보기에 표시된 것과 동일한 하나만 재생한다(재화 지급 자체는 creditMissionStars 에서 이미
   *   전부 반영됨 — 여기서 하나만 스킵해도 안 준 게 아니라 "연출만" 생략).
   */
  private playMissionBoxRewardBurst(box: MissionRewardBox): void {
    const from = this.missionBanner?.rewardAnchor;
    if (!from) return;
    this.time.delayedCall(220, () => {
      const diamonds = box.diamonds ?? 0;
      const coins = box.coins ?? 0;
      if (diamonds > 0) {
        // 배너 미리보기가 현재 다이아만 표시하므로(코인 미리보기 아트 미저작) 다이아를 우선.
        const diamondTarget = this.header?.diamondAnchor ?? { x: 780, y: 90 };
        this.rewardBurstFly(from.x, from.y, 'up_Solitare_UI_2-2_v3', Math.min(diamonds, 10), diamondTarget, 44);
        sfx('coin_burst', { volume: 0.3 });
      } else if (coins > 0) {
        const coinTarget = this.header?.coinAnchor ?? { x: 550, y: 90 };
        const coinN = Phaser.Math.Clamp(Math.round(coins / 250), 6, 12);
        this.rewardBurstFly(from.x, from.y, 'up_Solitare_UI_2-3_v2', coinN, coinTarget, 40);
        sfx('coin_burst', { volume: 0.3 });
      }
    });
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
    const coinAmount = (): number => Math.max(100, Math.round((entryFeeFor(this.level, 1) * 0.08) / 100) * 100); // 게임비×0.08(경제 H안 하향), 100 단위.
    if (picked.kind === 'collection') {
      // **미보유 카드 중 랜덤 예고** — 아트가 없으면(로딩 실패 등) 그 슬롯은 못 쓰므로 텍스처 유무까지 확인.
      const slot = this.rollCollectionSlot();
      if (!slot) return { kind: 'coins', amount: coinAmount() }; // 다 모았으면 코인으로 대체.
      return { kind: 'collection', amount: 1, slot };
    }
    return { kind: picked.kind, amount: picked.kind === 'coins' ? coinAmount() : picked.amount };
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
      this.diamondSlots.has(id) || id === this.wildSlotId || id === this.bonusSlot?.id || this.boardCollections.has(id);
    const pool = [...this.cards.keys()].filter((id) => !busy(id) && !exposedNow.has(id)); // **가려진 카드만**.
    if (!pool.length) return null;
    const slotId = pool[Phaser.Math.Between(0, pool.length - 1)];
    const view = this.cards.get(slotId);
    if (!view) return null;
    // 카드 **뒤**(depth − 0.3)에 두고 위로 삐져나오게 — 카드 앞면을 가리지 않으면서 "꽂혀 있는" 느낌.
    const img = this.add.image(view.x, view.y - this.geom.cardH * 0.5, key).setDepth((view.depth ?? 100) - 0.3);
    const src = img.texture.getSourceImage() as { width: number; height: number };
    const h = this.geom.cardH; // 기본 크기 = 보드 카드 높이(오픈 시 1.5배의 기준).
    img.setDisplaySize(h * (src.width / src.height), h);
    img.setAngle(-10).setAlpha(0);
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
    const src = img.texture.getSourceImage() as { width: number; height: number };
    const box = this.missionIconBox;
    const scale = Math.min(box.w / src.width, box.h / src.height); // contain(넘치지 않게).
    img.setDisplaySize(src.width * scale, src.height * scale);
  }

  /**
   * **미션 실패 재추첨**(PO 2026-07-27) — 5매치를 못 채우고 콤보가 끊기면 예고 보상을 새로 뽑아 갈아끼운다.
   *   예고 아이콘이 조용히 바뀌면 눈치채기 어려워, **뒤집히듯 축소→교체→확대**하는 짧은 연출로 바뀐 걸 알린다.
   *   ⚠️ 지급은 없다 — 실패했으니 보상은 못 받고 **목표(예고 보상)만** 바뀐다.
   */
  private rerollMissionOnFail(): void {
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

  /** 부스터 이미지 하단에 코인 비용 라벨 생성(이미지 없으면 undefined). */
  private makeBoosterCostLabel(img?: Phaser.GameObjects.Image): Phaser.GameObjects.Text | undefined {
    if (!img) return undefined;
    const y = img.y + img.displayHeight / 2 - 6; // 이미지 하단 안쪽.
    return this.add
      .text(img.x, y, '', {
        fontFamily: '"Jua", sans-serif',
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
      const src = img.texture.getSourceImage() as { width: number; height: number };
      const scale = Math.max(W / src.width, H / src.height);
      img.setScale(scale);
      return;
    }
    // 폴백 그라데이션.
    const g = this.add.graphics().setDepth(-100);
    const top = Phaser.Display.Color.IntegerToColor(tint);
    const bot = Phaser.Display.Color.IntegerToColor(0x2a1830);
    for (let i = 0; i < 48; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, 100, (i / 47) * 100);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (H / 48) * i, W, H / 48 + 1);
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
        const src = this.textures.get(key).getSourceImage() as { width: number; height: number };
        this.add.image(W / 2, cy, key).setScale(FLOOR_ART_H / src.height).setDepth(30);
      } else {
        this.add.rectangle(W / 2, cy, 900, FLOOR_ART_H, FLOORS[(idx - 1) % FLOORS.length].tint, 0.9).setDepth(30);
      }
      return;
    }
    const src = this.textures.get(bareKey).getSourceImage() as { width: number; height: number };
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
    // 순수 층 아트(홈 사이즈).
    if (this.textures.exists('up_Slitare_BG_02_v2')) {
      this.add.image(cx, cyFloor, 'up_Slitare_BG_02_v2').setDisplaySize(ART_W, ART_H).setDepth(D_ART);
    }
    // 점원(베이커) — 홈 사이즈·오프셋 + idle 애니.
    let clerkBottom = cyFloor + CLERK_DY + CLERK_H / 2;
    if (this.textures.exists('up_Solirare_Chr_02')) {
      const chr = this.add.image(cx + CLERK_DX, cyFloor + CLERK_DY, 'up_Solirare_Chr_02').setDisplaySize(CLERK_W, CLERK_H).setDepth(D_CLERK);
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
      // **점포 이미지와 일치하는 주문 아이템**(PO) — 플레이 점포 아트=골든크러스트 베이커리(floor2)
      //   이므로 아이템도 베이커리 세트(Item_01_02-N: 빵·크루아상 등). 층 테마 연동 확장 시 함께 변경.
      itemFloor: 2,
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
      .text(44, 56, '🪙 30,140', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#ffe9a0' })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.comboText = this.add
      .text(44, 112, '콤보 x0', { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0, 0.5)
      .setDepth(60);
    this.remainText = this.add
      .text(W - 44, 56, '남은 카드 18', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '34px',
        color: '#ffffff',
        stroke: '#3a1030',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setDepth(60);
    this.add
      .text(W - 44, 112, '⌂ 홈', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '32px',
        color: '#ffffff',
        stroke: '#3a1030',
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setDepth(60)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('home'));
  }

  // ── 좌표(동적 — 배치를 보드 영역에 맞춰 스케일·중앙배치) ─────────────────
  private geom = {
    scale: 1,
    cardW: BASE_CARD_W,
    cardH: BASE_CARD_H,
    cx: W / 2,
    topY: BOARD_TOP,
    colMid: 0,
    minRow: 0,
    pxUnit: BASE_CARD_W,
    pyUnit: BASE_CARD_H,
    // 에디터 절대배치 렌더용(abs 레이아웃일 때만).
    absMode: false,
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
   *   editor px = game px. 남아도 확대하지 않는다(레벨마다 카드 크기가 달라지지 않게).
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
    const fit = PlayScene.fitVertical(spread, abs.cardH, Math.min(ABS_CARD_MAX_SCALE, boardW / contentW), availH);
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
      absMode: true,
      absOriginX: originX,
      absOriginY: originY,
      absScaleY: scaleY,
    };
  }

  private computeGeom(): void {
    if (this.state.layout.abs) {
      this.computeAbsGeom(this.state.layout.abs);
      return;
    }
    this.geom = { ...this.geom, absMode: false };
    const slots = this.state.layout.slots;
    const cols = slots.map((s) => s.col);
    const rows = slots.map((s) => s.row);
    const minC = Math.min(...cols);
    const maxC = Math.max(...cols);
    const minR = Math.min(...rows);
    const maxR = Math.max(...rows);
    // 세로(커버 관계)만 겹치고, **같은 행 가로 이웃은 미세 간격 유지**(겹침 금지).
    //   col 1칸 간격 = pxUnit0 > 카드폭 → 같은 행 카드 사이에 흰 프레임(±6px)까지 안 닿는 작은 틈.
    const pxUnit0 = BASE_CARD_W * 1.03; // col 1칸당 x 간격 — 가로 이웃 비겹침(헤어라인 미세 틈)
    const pyUnit0 = BASE_CARD_H * 0.58; // row 1칸당 y 간격 — 그룹 내부 세로 겹침(커버, 의도)
    const neededW = (maxC - minC) * pxUnit0 + BASE_CARD_W;
    const boardW = BOARD_RIGHT - BOARD_LEFT;
    // **상하 여백 보장 + 세로 조밀도**(abs 경로와 동일 규칙, PO 2026-07-28).
    const availTop = this.boardTop + BOARD_PAD_TOP;
    const availH = Math.max(1, this.boardBottom - BOARD_PAD_BOTTOM - availTop);
    const spread = (maxR - minR) * pyUnit0; // 행 간격의 총 퍼짐(카드 1장 높이는 별도).
    // **카드 크기 상한(1.35)** — 종전 0.91 대비 +48%(체감 강화 피드백으로 상향). 가로 기준으로만 정하고,
    //   세로가 넘치면 카드를 줄이기 전에 행 간격(pyUnit)을 조인다.
    const fit = PlayScene.fitVertical(spread, BASE_CARD_H, Math.min(1.35, boardW / neededW), availH);
    const scale = fit.scale;
    const room = Math.max(0, availH - scale * (spread * fit.compact + BASE_CARD_H));
    this.geom = {
      scale,
      cardW: BASE_CARD_W * scale,
      cardH: BASE_CARD_H * scale,
      cx: (BOARD_LEFT + BOARD_RIGHT) / 2,
      topY: availTop + room / 2 + Math.min(room / 2, BOARD_DOWN_BIAS) + (BASE_CARD_H * scale) / 2,
      colMid: (minC + maxC) / 2,
      minRow: minR,
      pxUnit: pxUnit0 * scale,
      pyUnit: pyUnit0 * scale * fit.compact, // 행 간격에만 조밀도 반영(카드 크기는 그대로).
      absMode: false,
      absOriginX: 0,
      absOriginY: 0,
      absScaleY: scale,
    };
  }

  private slotPos(slot: LayoutSlot): { x: number; y: number; depth: number } {
    const g = this.geom;
    if (g.absMode && slot.ax != null && slot.ay != null) {
      // 에디터 절대배치 — 저작 px 를 보드 영역 스케일로 매핑. 높은 레이어(row)=앞(높은 depth).
      return {
        x: g.absOriginX + slot.ax * g.scale,
        y: g.absOriginY + slot.ay * g.absScaleY, // 세로만 조밀도 반영(카드 크기는 scale 그대로).
        depth: 100 + slot.row * 10,
      };
    }
    return {
      x: g.cx + (slot.col - g.colMid) * g.pxUnit,
      y: g.topY + (slot.row - g.minRow) * g.pyUnit,
      // 위 행(작은 row)이 앞(높은 depth) — 상단 카드가 아래 카드를 덮는다.
      depth: 100 + (this.state.layout.rowCount - slot.row) * 10,
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

    // ── 폴드(뒷면) — 위에서 비껴 떨어지며 가속 스태거로 차르륵 깔린다. ──
    const FOLD_SPAN = 500; // 폴드 시작딜레이 창(전체)
    const FOLD_DUR = 175; // 개별 낙하 시간
    const n = Math.max(1, folds.length);
    folds.forEach((it, i) => {
      const delay = FOLD_SPAN * (i / n) ** 1.7; // 뒤로 갈수록 촘촘 → 가속하는 리듬
      it.view
        .setPosition(it.fx - 44, it.fy - 62)
        .setAlpha(0)
        .setAngle(it.fa - 9)
        .setScale(it.fsx * 0.92, it.fsy * 0.92);
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
        ease: 'Quad.easeIn', // 낙하가 가속되며 안착
      });
    });

    // ── 오픈(앞면) — 폴드가 거의 깔린 뒤 좌우 화면 밖에서 날아와 안착. ──
    const OPEN_BASE = FOLD_SPAN * 0.8 + 40;
    const OPEN_STAGGER = 78;
    const OPEN_DUR = 300;
    let lastEnd = folds.length > 0 ? FOLD_SPAN + FOLD_DUR : 0;
    opens.forEach((it, i) => {
      const side = it.fx < boardCx ? -1 : 1;
      const startX = side < 0 ? -this.geom.cardW : W + this.geom.cardW;
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
    const fanW = (STOCK_STACK_CAP - 1) * STOCK_FAN_STEP;
    this.add
      .zone(STOCK.x - fanW / 2, STOCK.y + 10, cw + fanW + 60, ch + 120)
      .setDepth(85)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onStockTap());
    this.stockCountText = this.add
      .text(STOCK.x, STOCK.y + ch / 2 + 24, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(81);

    this.add
      .text(WASTE.x, WASTE.y + ch / 2 + 24, '기준 카드', {
        fontFamily: '"Jua", sans-serif',
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
    // 왼쪽으로 펼친 부채 — i=0(맨 아래)=가장 왼쪽, i=count-1(맨 위, 다음에 뽑힐 카드)=원점(뽑기 시작 위치).
    for (let i = 0; i < count; i++) {
      const isWild = i === wildFanI;
      // 와일드는 살짝 위로 띄워(y=-ch*0.16) 부채 사이로 확실히 보이게. 크기는 스톡 카드와 동일.
      const back = new CardView(this, -(count - 1 - i) * STOCK_FAN_STEP, isWild ? -ch * 0.16 : 0, cw, ch, false);
      if (isWild) back.showWild();
      else back.showBack();
      cont.add(back);
    }
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
    });
    if (this.history.length > 40) this.history.shift();
  }

  /** 코인 차감(뱅크된 코인 기준). 부족하면 false. */
  private spend(cost: number): boolean {
    if (this.baseCoins < cost) {
      sfx('no_coin');
      this.toast('코인이 부족해요 — ☰ 메뉴 › 🛒 상점에서 충전할 수 있어요');
      return false;
    }
    this.baseCoins -= cost;
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
        fontFamily: '"Jua", sans-serif',
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
    if (!usedItem && !this.spend(cost)) return;
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
    if (!this.consumeItem('undo') && !this.spend(this.undoPrice())) return;
    sfx('undo');
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
    this.resetComboRun(); // 되돌리면 콤보 런은 끊긴다(원 설계 유지): comboColors=[] + 게이지 별 리셋.
    this.rebuildBoard(); // 뽑은 와일드는 여기서 와일드 아트로 표시된다.
    // **부스터 와일드**(기준 카드 자체는 와일드 아님)면 기준 위에 와일드 마커를 다시 얹는다.
    if (this.wildActive && !wasteTop(this.state)?.wild) this.showWildMarker();
    this.updateBoosters();
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
    if (!usedItem && !this.spend(cost)) return; // 코인 부족 시 spend 가 토스트 후 중단.
    this.plus5Uses += 1; // 다음 사용부터 비용 상승.
    this.pushHistory('plus5');
    this.state = this.replayUndone('plus5') ?? refillStock(this.state, ADD5_COUNT, this.rng);
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
      .text(6, -ch * 0.06, `+${ADD5_COUNT}`, { fontFamily: '"Jua", sans-serif', fontSize: `${Math.round(ch * 0.44)}px`, color: '#ffe14d' })
      .setOrigin(0.5)
      .setStroke('#7a3b00', 9);
    cont.add(plus);
    // 하단 금액(보유 아이템 있으면 원문자).
    const owned = this.itemCount('plus5');
    const label = owned > 0 ? `${circledCount(owned)} 보유` : `🪙 ${this.plus5Price().toLocaleString()}`;
    const priceTxt = this.add
      .text(0, ch * 0.64, label, { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffd166' })
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
    if (!usedItem && !this.spend(cost)) return;
    this.plus5Uses += 1;
    this.pushHistory('plus5draw');
    const replayed = this.replayUndone('plus5draw'); // 되돌렸던 ＋5＋도드로우면 같은 결과를 재현.
    if (replayed) {
      this.state = replayed;
    } else {
      this.state = refillStock(this.state, ADD5_COUNT, this.rng); // ＋5 채움.
      this.state = drawStock(this.state, this.rng); // 그 중 1장을 기준(웨이스트)으로 도드로우.
      this.drawsUsed += 1;
    }
    // 상태는 이미 바뀌었지만 화면의 기준 카드는 **연출이 끝나야** 바뀐다 — 그 사이 다른 refresh 가
    //   syncWasteView 로 먼저 바꿔버리지 않도록 지금부터 비행 중으로 표시한다.
    this.flyingCards += 1;
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
      this.flyingCards = Math.max(0, this.flyingCards - 1); // 연출 없이 즉시 반영(sync 가 기준 카드 갱신).
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
            // ⚠️ **여기서 fly 를 파괴하면 안 된다**(2026-07-26 버그 수정) — 파괴하면 그 아래 남아 있던
            //   **직전 기준 카드 뷰**가 다시 드러나, 방금 뒤집어 보여준 카드가 아닌 **다른 카드가 잠깐
            //   나타났다가** 다음 수에서야 바뀌는 문제가 있었다(refresh 는 기준 카드 뷰를 갱신하지 않는다).
            //   onStockTap 과 동일하게 **날아온 카드를 그대로 새 기준 카드 뷰로 승격**한다.
            fly.setPosition(WASTE.x, WASTE.y);
            fly.scaleX = baseSX;
            if (this.wasteView && this.wasteView !== fly) this.wasteView.destroy();
            this.wasteView = fly;
            this.flyingCards = Math.max(0, this.flyingCards - 1);
            this.refresh(); // 하이라이트·스톡 갱신.
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
    // 기준(웨이스트) 카드 — **뽑은 와일드면 와일드 아트로**(showFace 는 와일드를 안 그려 undo 후 사라지던 문제 수정).
    const top = wasteTop(this.state);
    if (top?.wild) this.wasteView?.showWild();
    else this.wasteView?.showFace(top);
    this.refresh();
  }

  private toast(msg: string): void {
    // **안내 메시지는 20레벨까지만**(PO 2026-07-18) — 이후엔 숙련 유저라 화면 정리.
    if (this.level > 20) return;
    // **뽑기/기준 카드 바로 위**에 표시(화면 중앙 아님).
    const ty = STOCK.y - this.geom.cardH * 0.5 - 66;
    const t = this.add
      .text(W / 2, ty, msg, {
        fontFamily: '"Jua", sans-serif',
        fontSize: '36px',
        color: '#ffffff',
        backgroundColor: '#2a1830dd',
        padding: { x: 28, y: 14 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(1600);
    this.tweens.add({ targets: t, alpha: 0, y: ty - 40, duration: 1100, delay: 800, onComplete: () => t.destroy() });
  }

  // ── 상호작용 ────────────────────────────────────────────────────────
  private onCardTap(slotId: string): void {
    if (this.ended || this.dealing) return; // ⚠️ busy 로 막지 않는다 — 카드가 날아가는 도중에도 다음 카드를 선택할 수 있게(동시 플레이).
    const view = this.cards.get(slotId);
    if (!view) return;
    const wild = this.wildActive;
    // 와일드면 노출만 확인(±1 무시), 아니면 ±1 매칭 필요.
    if (wild ? !isExposed(this.state, slotId) : !isPlayable(this.state, slotId)) {
      sfx('card_invalid');
      this.denyFeedback(view);
      return;
    }
    this.pushHistory();
    const card = this.state.board[slotId];
    this.state = wild ? playWild(this.state, slotId) : playCard(this.state, slotId);
    if (wild) sfx('wild_use');
    else sfxCardPlace();
    if (wild) {
      this.wildActive = false;
      this.wildMarker?.destroy();
      this.wildMarker = undefined;
    }
    this.cards.delete(slotId);
    view.disableInteractive();
    view.showFace(card);
    view.setDepth(1000);
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
    // **다이아 수집** — 이 카드에 다이아가 끼워져 있었으면 크게 팝업 후 상단으로 회수.
    if (this.diamondSlots.has(slotId)) {
      this.diamondSlots.delete(slotId);
      const gem = this.diamondViews.get(slotId);
      this.diamondViews.delete(slotId);
      if (gem) this.collectDiamond(gem);
    }
    // (요청) 와일드로 낸 보드 카드에는 와일드 이미지를 얹지 않는다 — 선택 카드가 그대로 회수된다.
    // 상태는 이미 갱신됨 → **즉시 refresh** 로 새 기준(웨이스트 top) 하이라이트/미션 반영.
    //   단, 아래 노출 카드 공개는 **보류**(suppressReveal) — 낸 카드의 토스 회수가 끝날 때 뒤집어 공개.
    this.pushMatch(card.suit);
    this.suppressReveal = true;
    this.refresh();
    this.suppressReveal = false;
    // **역동적 회수 연출** — ①눌림(축소) → ②팝(확대+살짝 뜸) → ③위로 크게 토스하며 1.5바퀴 회전 + 잔상 → ④웨이스트 회수.
    const startAngle = view.angle;
    const baseSX = view.scaleX;
    const baseSY = view.scaleY;
    const startFly = (): void => {
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
            this.refresh();
          }
        },
        onComplete: () => {
          this.flyingCards = Math.max(0, this.flyingCards - 1); // 비행 종료(undo/+5 재허용).
          view.setPosition(WASTE.x, WASTE.y);
          view.setAngle(0);
          view.setScale(baseSX, baseSY);
          // 도착한 카드가 새 기준. 이전 기준 뷰는 파기(동시 여러 장이 날아와도 마지막 도착이 기준으로 남음).
          if (this.wasteView && this.wasteView !== view) this.wasteView.destroy();
          this.wasteView = view;
          // **회수(튀어오름) 완료 시점** — 이제 아래 노출 카드를 뒤집어 공개(보류 해제).
          this.refresh();
          this.checkEnd();
        },
      });
    };
    // ①눌림(양방향 축소) → ②팝(확대 + 살짝 위로 뜸, Back 오버슛) → 토스 회수.
    this.flyingCards += 1; // 비행 시작(undo/+5 잠금) — startFly 의 onComplete 에서 감소.
    this.tweens.add({
      targets: view,
      scaleX: baseSX * 0.84,
      scaleY: baseSY * 0.84,
      duration: 75,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.add({
          targets: view,
          scaleX: baseSX * 1.2,
          scaleY: baseSY * 1.2,
          y: view.y - 28,
          duration: 150,
          ease: 'Back.easeOut',
          onComplete: () => startFly(),
        });
      },
    });
  }

  private onStockTap(): void {
    if (this.ended || this.dealing) return; // busy 로 막지 않음(동시 플레이). 딜 연출 중엔 잠금.
    if (this.state.stock.length === 0) return;
    this.pushHistory('draw');
    // **동적 드로우**: 뽑는 카드의 랭크는 drawStock 이 결정하므로 뽑은 뒤 웨이스트 top 을 읽어 애니메이션.
    //   되돌리기로 취소했던 뽑기를 같은 자리에서 다시 하는 거면 **그때 나왔던 카드를 그대로** 재현한다.
    this.state = this.replayUndone('draw') ?? drawStock(this.state, this.rng);
    this.drawsUsed += 1; // 별 등급의 '짧은 수순' 축.
    const card = wasteTop(this.state);
    const drewWild = card.wild === true; // 뽑힌 카드가 와일드면 기준이 와일드가 되어 1회 아무 카드나 낼 수 있다.
    // ⚠️ **상태를 바꾼 직후 즉시** 비행 중으로 표시한다(PO 2026-07-28 "기준카드에 먼저 나타났다가 다시
    //    배치되는 연출로 헷갈린다") — 아래 `cancelWild()` 는 내부에서 `refresh()` 를 부르고, 그때
    //    `syncWasteView` 가 **아직 날아오지도 않은 새 기준 카드를 목적지에 미리 그려버린다**. 그러면 카드가
    //    한 번 뜬 뒤 비행 연출이 또 배치해 **두 번 바뀌어 보인다**. 예전엔 이 증가가 wild/콤보 처리 뒤에
    //    있어서, 와일드가 아닌 **일반 뽑기(대부분)** 에서 매번 이 현상이 났다.
    this.flyingCards += 1; // 비행 시작(undo/+5 잠금) — onComplete 에서 감소.
    sfx(drewWild ? 'wild_activate' : 'card_deal');
    // 뽑기 = 콤보 끊김. 기준 카드가 새로 바뀌므로 (와일드가 아니면) 와일드도 해제. **진행 중이던 부분 런(≤4)은
    //   채운 수만큼 소량 적립**(endComboRun) 후 박스 비움.
    if (drewWild) this.wildActive = true;
    else this.cancelWild();
    this.endComboRun();
    this.refresh(); // 스톡 수량·하이라이트 즉시 반영(더미 다시 쌓기 포함).
    const fly = new CardView(this, STOCK.x, STOCK.y, this.geom.cardW, this.geom.cardH, false);
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
        this.flyingCards = Math.max(0, this.flyingCards - 1); // 비행 종료(undo/+5 재허용).
        fly.setPosition(WASTE.x, WASTE.y);
        fly.scaleX = baseSX;
        if (this.wasteView && this.wasteView !== fly) this.wasteView.destroy();
        this.wasteView = fly;
        if (drewWild) {
          // 기준이 와일드 → 노출 카드 전부 골드 강조(아무거나 1회), 안내 + 살짝 맥동.
          this.updateBoosters();
          this.toast('🃏 와일드! 아무 노출 카드나 탭하세요');
          this.tweens.add({
            targets: fly,
            scaleX: baseSX * 1.06,
            scaleY: fly.scaleY * 1.06,
            duration: 460,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
          });
          this.refresh();
        }
        this.checkEnd();
      },
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
    g.fillRect(0, DARK_TOP, W, H - DARK_TOP);
    this.cardBacking = g;
  }

  private refresh(): void {
    // 에디터가 암막 패널(layer_4)을 저작했으면 코드 막 생략(중복 방지).
    if (!this.chromeFromEditor) this.drawBoardMask();
    const moves = new Set(availableMoves(this.state));
    for (const [id, view] of this.cards) {
      const exposed = isExposed(this.state, id);
      // 가려진(뒷면) 카드는 입력 비활성 → 앞면 아래 겹치는 영역을 눌러도 뒷면이 잡히지 않는다.
      if (view.input) view.input.enabled = exposed;
      // **보드 와일드 노출 감지** — 아트 유지(탭 잠금)하고 루프 후 자동 뱅킹으로 스톡에 삽입.
      if (exposed && id === this.wildSlotId && !this.wildBanked) {
        view.showWild(); // 미리보기와 동일하게 와일드 아트 유지(뒷면 플리커 방지)
        if (view.input) view.input.enabled = false;
        if (!this.dealing && !this.suppressReveal) this.pendingBankWild = true;
        continue;
      }
      // **보드 보너스(+N) 노출 감지** — 아트 유지하고 루프 후 흡입 연출 트리거.
      if (exposed && this.bonusSlot && id === this.bonusSlot.id && !this.bonusTriggered) {
        view.showArt(BONUS_ART[this.bonusSlot.count]);
        if (view.input) view.input.enabled = false;
        if (!this.dealing && !this.suppressReveal) this.pendingBonus = true;
        continue;
      }
      // ⚠️ 컬렉션 카드는 **노출만으로는 수집되지 않는다**(PO 2026-07-27) — 꽂힌 보드 카드를 실제로 **낼 때**
      //   수집된다(onCardTap, 다이아와 같은 모델). 여기서는 아무것도 하지 않는다.
      if (exposed) {
        // 와일드 활성 시 노출 카드 전부 골드 강조(아무거나 탭 가능), 아니면 ±1 가능 카드만.
        const hl = this.wildActive || moves.has(id);
        // 딜 중이 아니고 방금 노출된(아직 뒷면) 카드: 공개 보류 중이면 뒷면 유지(입력 잠금),
        //   아니면 **뒤집기 연출**로 공개. 이미 앞면이면 즉시 갱신.
        if (!this.dealing && !view.isFaceUp()) {
          if (this.suppressReveal) {
            view.showBack();
            if (view.input) view.input.enabled = false; // 공개 전까지 탭 불가
          } else {
            view.flipToFace(this.state.board[id], hl);
          }
        } else {
          view.showFace(this.state.board[id], hl);
        }
        view.setAlpha(1);
      } else {
        // **가려진 특수 카드는 뒷면 대신 아트를 미리 보여준다**(상단 보드에 와일드/+N 위치 프리뷰).
        if (id === this.wildSlotId && !this.wildBanked) {
          view.showWild();
        } else if (this.bonusSlot && id === this.bonusSlot.id && !this.bonusTriggered) {
          view.showArt(BONUS_ART[this.bonusSlot.count]);
        } else {
          view.showBack();
        }
        view.setAlpha(0.98);
      }
    }
    // 루프 중 보드 와일드 노출을 감지했으면 뱅킹(스톡 삽입 + 비행 연출). wildBanked 로 1회만.
    if (this.pendingBankWild) {
      this.pendingBankWild = false;
      this.bankWild();
    }
    // 보드 보너스(+N) 노출 감지 → 흡입 연출. bonusTriggered 로 1회만.
    if (this.pendingBonus) {
      this.pendingBonus = false;
      this.triggerBonus();
    }
    const stock = this.state.stock.length;
    // 스톡 수량이 바뀌면 더미를 다시 쌓는다(보유 수량만큼 겹쳐 보이게).
    if (stock !== this.lastStockCount) this.buildStockPile();
    this.stockCountText?.setText(stock > 0 ? `👆 뽑기 · ${stock}장` : '🃏 카드가 없어요');
    this.stockContainer?.setAlpha(stock > 0 ? 1 : 0.4);
    // **스톡 소진 → '카드가 없어요' 메시지 후 잠깐 뒤에 +5 플로팅 카드 등장**(즉시 뜨면 너무 급함, PO 2026-07-17).
    if (stock === 0 && refillableCount(this.state) > 0 && !this.ended) {
      if (!this.emptyStockPlus5 && !this.emptyStockPending) {
        this.emptyStockPending = true;
        this.time.delayedCall(850, () => {
          this.emptyStockPending = false;
          // 지연 후에도 여전히 소진 상태면 등장(그새 +5/뽑기로 채워졌으면 취소).
          if (this.state.stock.length === 0 && refillableCount(this.state) > 0 && !this.ended) this.showEmptyStockPlus5();
        });
      }
    } else {
      this.emptyStockPending = false;
      this.hideEmptyStockPlus5();
    }
    this.comboText?.setText(`콤보 x${this.state.combo}`);
    this.remainText?.setText(`남은 카드 ${remaining(this.state)}`);
    // **코인 = 실제 보유 잔액(baseCoins)만** 표시. (예전엔 baseCoins+state.score 를 더해, 플레이 중 점수만큼
    //   부풀려 보이다가 승리/복귀 시 실지급(starCoins)만 반영돼 확 줄어 '데이터 안 맞음'으로 보였다.
    //   게임비 차감·부스터 비용·승리 보상이 전부 baseCoins 로 일관되므로, 표시도 baseCoins 로 통일.)
    const coins = this.baseCoins.toLocaleString();
    this.coinText?.setText(`🪙 ${coins}`);
    // 공통 상단 헤더에 실시간 반영.
    this.header?.setCoins(this.baseCoins);
    this.updateBoosters();
    this.syncWasteView(); // 기준 카드 뷰가 상태와 어긋나 있으면 바로잡는다(안전망).
  }

  /**
   * **기준(웨이스트) 카드 뷰 동기화**(2026-07-26 신설) — 기준 카드 뷰는 지금까지 각 연출의 onComplete 에서만
   *   교체돼, 어느 한 경로라도 교체를 빠뜨리면 **화면의 기준 카드와 실제 state 의 top 이 어긋난 채로**
   *   남았다(＋5 플로팅 카드 탭에서 실제로 발생 — 방금 뒤집은 카드가 사라지고 이전 카드가 다시 보임).
   *   refresh 끝에서 마지막으로 한 번 맞춰 준다.
   *   ⚠️ **비행 연출 중(flyingCards>0)·공개 보류 중(suppressReveal)·딜 중에는 건너뛴다** — 그때 미리 맞추면
   *   아직 날아오는 중인 카드가 목적지에 먼저 나타나 플립 연출이 스포일된다.
   */
  private syncWasteView(): void {
    if (this.flyingCards > 0 || this.suppressReveal || this.dealing) return;
    const wv = this.wasteView;
    const top = wasteTop(this.state);
    if (!wv || !top) return;
    // 이미 같은 내용을 그리고 있으면 건드리지 않는다 — 재그리기는 진행 중인 스케일 연출(와일드 맥동 등)을
    //   리셋해 미세한 튐을 만든다.
    if (top.wild) {
      if (!wv.isShowingWild()) wv.showWild();
    } else if (!wv.isShowingFace(top)) {
      wv.showFace(top);
    }
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
      const finalQ = finalQuality({
        comboScore: this.comboScore,
        boardSize: this.boardSlots,
        leftover,
        stockSize: this.initialStock,
        plus5Uses: this.plus5Uses,
      });
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
          fontFamily: '"Jua", sans-serif',
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
      .text(250, 0, this.simIdleStatus(), { fontFamily: '"Jua", sans-serif', fontSize: '20px', color: '#9a9a9a' })
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
    const moves = availableMoves(this.state);
    if (moves.length > 0) {
      let bestGain = -1;
      let best: string[] = [];
      for (const id of moves) {
        let gain = 0;
        for (const slot of this.state.layout.slots) {
          if (this.state.cleared.has(slot.id) || !slot.coveredBy.includes(id)) continue;
          if (slot.coveredBy.every((c) => c === id || this.state.cleared.has(c))) gain++;
        }
        if (gain > bestGain) { bestGain = gain; best = [id]; }
        else if (gain === bestGain) best.push(id);
      }
      this.onCardTap(best[Math.floor(this.rng() * best.length)]);
      this.simStatus?.setText(`lv${this.level} · 남은 ${this.state.layout.slots.length - this.state.cleared.size}`);
    } else if (this.state.stock.length > 0) {
      this.onStockTap();
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
      fontFamily: '"Jua", sans-serif',
      fontSize: '26px',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { x: 12, y: 6 },
    };
    // ⚠️ 빈 문자열로 만든 뒤 setInteractive() 하면 그 순간의(거의 0에 가까운) 크기로 히트 영역이
    //   고정돼버려서, 이후 setText 로 라벨이 길어져도 클릭 판정 영역은 안 넓어진다(라벨은 멀쩡히 보이는데
    //   눌러도 반응 없음). 그래서 **고정 크기 히트 영역**을 명시로 줘 라벨 텍스트 길이와 무관하게 만든다.
    const hit = (): Phaser.Geom.Rectangle => new Phaser.Geom.Rectangle(0, 0, 360, 46);
    this.autoTestUI = this.add.container(0, 0).setDepth(5000).setVisible(autoTestState.uiVisible);
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
    const moves = availableMoves(this.state);
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
  /** 콤보 런(현 주문) **비우기** — undo/재구성 등. 주문 진행만 0(축적 게이지는 불변 — 이미 지불된 별은 은행). */
  private resetComboRun(): void {
    this.comboColors = [];
    this.melodyStep = 0;
    this.comboCountText?.setText('+0');
    this.orderQueue?.onRunReset(); // undo 등 — 손님 유지, 주문 진행만 0으로(누적 별 탤리는 불변).
  }

  /**
   * 콤보 런 **종료 + 손님 정산** — 콤보가 끊길 때(뽑기/보드클리어). **누적한 별 전부(무제한)를 손님이 게이지로 지불**하고 퇴장.
   *   손님은 5개를 넘겨도 이 시점까지 나가지 않고 계속 누적했으므로, 여기서 comboColors.length(=누적 별) 전량을 회수한다.
   */
  private endComboRun(): void {
    const filled = this.comboColors.length;
    if (filled > 0) {
      this.orderQueue?.onBreak(filled); // 정산·퇴장 — 누적 별 전부 게이지로 지불(무제한)·0이면 손님 대기.
    }
    // **미션 실패 → 다른 미션으로 교체**(PO 2026-07-27: "완성하지 못하면 계속 반복된다. 실패하면 다른
    //   미션으로 바뀌어야 한다") — 5매치를 채우지 못한 채 콤보가 끊겼으면 예고 보상을 새로 뽑는다.
    //   `filled % SET_SIZE !== 0` 이 곧 "진행 중이던 세트를 못 채웠다" — 0 이면 직전 세트를 정확히 완성해
    //   grantMissionReward 가 이미 재추첨했으므로 여기서 또 바꾸지 않는다(연속 교체 방지).
    if (!this.finished && filled % SET_SIZE !== 0) this.rerollMissionOnFail();
    this.comboColors = [];
    this.melodyStep = 0;
    this.comboCountText?.setText('+0');
  }

  /**
   * 연속 매칭 멜로디 — 매칭할 때마다 장조 음계를 한 음씩 올려 울린다(미부터 시작: 미파솔라시도레미…).
   *   melodyStep 이 음 인덱스(콤보가 끊기면 resetComboRun 에서 0으로). WebAudio 오실레이터 2개로 "띵-똥" 이중음 합성.
   */
  private playMatchNote(): void {
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
    this.grantMissionReward();
    sfx('set_complete');
  }

  /** **미션 보상 지급**(콤보 5 완성) — 예고된 보상을 재화/아이템으로 지급 + 다음 보상 재추첨·예고. */
  private grantMissionReward(): void {
    const rw = this.missionReward ?? this.rollMissionReward();
    const save = loadSave();
    let msg = '';
    let granted: CollectionSlot | null = null; // 컬렉션 카드를 실제로 지급했다면 그 슬롯(획득 연출용).
    let grantedEntry: BoardCollection | null = null; // 보드에 꽂혔으면 그 엔트리(연출 목적지 = 그 뱃지), 없으면 보관함.
    switch (rw.kind) {
      case 'coins':
        this.baseCoins += rw.amount;
        save.coins += rw.amount;
        msg = `🪙 +${rw.amount.toLocaleString()}`;
        break;
      case 'cards': // 추가 카드 → 스톡(뽑기) 추가.
        this.state = refillStock(this.state, rw.amount, this.rng);
        this.refresh();
        msg = `🃏 뽑기 +${rw.amount}`;
        break;
      case 'plus5': // **+5카드 → 뽑기 카드로 적용**(스톡 추가, PO 2026-07-17).
        this.state = refillStock(this.state, rw.amount, this.rng);
        this.refresh();
        msg = `➕ 뽑기 +${rw.amount}`;
        break;
      case 'wild': // **와일드 → 뽑기 카드로 적용**(스톡 추가).
        this.state = refillStock(this.state, rw.amount, this.rng);
        this.refresh();
        msg = `🃏 뽑기 +${rw.amount}`;
        break;
      case 'diamond': // **다이아 → 게임완성 보상풀**(holdDiamond 이 pendingDiamonds 누적 + 보관 배지 — 레벨 클리어 시 지급).
        this.holdDiamond(rw.amount);
        msg = `💎 +${rw.amount} (완성 보상)`;
        break;
      case 'collection': {
        // **컬렉션 카드 1장** — 예고된 슬롯을 지급(그 사이 이미 보유했으면 즉시 재추첨). 저장은 save 에 반영.
        const slot = this.resolveCollectionSlot(rw.slot);
        if (!slot) {
          // 다 모았다 → 코인으로 대체 지급(빈손 방지).
          const fallback = Math.max(100, Math.round((entryFeeFor(this.level, 1) * 0.08) / 100) * 100);
          this.baseCoins += fallback;
          save.coins += fallback;
          msg = `🪙 +${fallback.toLocaleString()}`;
          break;
        }
        // **보드 투입**(기본) — 카드가 보드의 가려진 카드에 꽂히고, 열릴 때 스타게이지로 획득된다.
        grantedEntry = this.awardCollectionCard(save, slot);
        granted = slot;
        msg = grantedEntry ? '🗂 컬렉션 카드 → 보드에 꽂혔어요' : `🗂 컬렉션 카드 ${slot.set}-${slot.card}`;
        break;
      }
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
    // **다음 보상 예고**(재추첨 — 완성 전까지 고정).
    this.missionReward = this.rollMissionReward();
    this.showMissionPreview();
  }

  /**
   * **미션 보상 지급 연출**(PO 2026-07-17: 아이템을 크게 확대했다가 해당 위치로 이동) — 보상 아이콘 사본을
   *   MISSIONS 자리에서 **화면 중앙으로 크게 확대**(강조) → 잠깐 머문 뒤 **목적지(헤더·스톡·다이아 슬롯)로 축소 이동**.
   */
  private missionRewardBurst(rw: MissionReward): void {
    const img = this.missionRewardImg;
    const key = this.missionIconKey(rw);
    if (!img || !this.textures.exists(key)) return;
    // 목적지: 코인=헤더 코인 · 다이아=완성풀 슬롯 · 카드류=스톡 더미.
    const dst =
      rw.kind === 'coins'
        ? { x: 360, y: 90 }
        : rw.kind === 'diamond'
          ? this.diamondHoldTarget()
          : { x: STOCK.x, y: STOCK.y };
    const big = this.add.image(img.x, img.y, key).setDepth(2200).setDisplaySize(56, 56);
    const src = big.texture.getSourceImage() as { width: number; height: number };
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
          onComplete: () => big.destroy(),
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

    const dim = this.add.rectangle(cx, H / 2, W, H, 0x120a1c, 0).setDepth(DEPTH).setInteractive(); // 입력 차단 겸 배경 딤.
    const card = this.add.image(from.x, from.y, key).setDepth(DEPTH + 2).setDisplaySize(60, 90).setAngle(-14);
    const src = card.texture.getSourceImage() as { width: number; height: number };
    const bigH = 620; // 확대 시 카드 높이(세로 기준 — 카드 아트는 세로가 길다).
    const bigW = bigH * (src.width / src.height);
    // 뒤에서 도는 광채(원형) — 텍스처 없이 그래픽으로 그린다(에셋 의존 없음).
    const glow = this.add.graphics().setDepth(DEPTH + 1).setPosition(cx, cy).setAlpha(0);
    glow.fillStyle(0xffe9a0, 0.18);
    glow.fillCircle(0, 0, bigH * 0.62);
    glow.fillStyle(0xfff6d0, 0.14);
    glow.fillCircle(0, 0, bigH * 0.44);

    // 보드 투입이면 "아직 내 것이 아니다" — 지금 몇 장인지가 아니라 **무엇을 해야 하는지**를 알려준다.
    const owned = ownedCount(collectionOf(loadSave()), slot.set);
    const titleText = entry ? '컬렉션 카드 등장!' : '컬렉션 카드 획득!';
    const subText = entry ? '보드 카드에서 열면 내 콜렉션으로!' : `${slot.set}번 콜렉션 · ${owned}/${CARDS_PER_SET}`;
    const title = this.add
      .text(cx, cy - bigH / 2 - 66, titleText, { fontFamily: '"Jua", sans-serif', fontSize: '64px', color: '#ffe27a', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(DEPTH + 3)
      .setAlpha(0);
    title.setStroke('#4a2a10', 10);
    title.setShadow(2, 4, '#000000', 6, false, true);
    const sub = this.add
      .text(cx, cy + bigH / 2 + 54, subText, { fontFamily: '"Jua", sans-serif', fontSize: '42px', color: '#ffffff' })
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
    this.ended = true;
    this.cancelWild();
    const s = Math.min(SETS_TARGET, Math.max(1, stars));
    // **남은 카드는 코인이 아니라 스타포인트로 반영**(PO 2026-07-17 일원화) — checkEnd 에서 이미 콤보 점수(별)로 가산.
    //   따라서 코인 보상은 별 등급 코인만(카드당 100/보너스 폐지).
    const leftover = this.state.stock.length;
    const coins = starCoinsAt(this.level, s, this.chMult);
    const gotDiamonds = this.pendingDiamonds; // **승리 시에만** 보관 다이아 확정.
    const gotCards = [...this.pendingCollection]; // 보드에서 열어 스타게이지에 담아둔 컬렉션 카드(승리 시 확정).
    const save = loadSave();
    save.coins += coins;
    save.diamonds = (save.diamonds ?? 0) + gotDiamonds; // 코인과 함께 다이아 확정.
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
    this.missionBanner?.setState(missionRewardOf(save, Date.now()));
    writeSave(save);
    this.baseCoins += coins; // 미션 보상 박스 코인은 creditMissionStars 가 발생 시점에 이미 반영했다.
    this.pendingDiamonds = 0; // 확정 후 보관분 비움(중복 지급 방지).
    this.pendingCollection = []; // 컬렉션 카드도 동일(중복 지급 방지).
    sfx('win_fanfare'); // 승리 카드 연출 팡파레.
    sfxWinSting(); // 정산 스팅 레이어.
    if (coins > 0) sfx('coin_burst', { volume: 0.25 }); // 코인 보상 쏟아짐(볼륨 하향).
    this.winScatter(() => this.showMissionReward(s, coins, gotDiamonds, { leftover, collectionCards: gotCards }));
  }

  /**
   * **보상 버스트 회수** — 아이콘 자리에서 count 개의 입자가 사방으로 튀며 **아래로 떨어지듯** 흩어졌다가,
   *   잠깐 머문 뒤 하나씩 스태거로 **위(헤더 카운터)로 빨려 올라간다**. (낙하 → 상승 회수)
   */
  private rewardBurstFly(
    srcX: number,
    srcY: number,
    texKey: string,
    count: number,
    target: { x: number; y: number },
    dispW: number,
  ): void {
    if (!this.textures.exists(texKey) || count <= 0) return;
    for (let i = 0; i < count; i++) {
      const img = this.add.image(srcX, srcY, texKey).setDepth(2100);
      const src = img.texture.getSourceImage() as { width: number; height: number };
      img.setDisplaySize(dispW, dispW * (src.height / src.width));
      const bsx = img.scaleX;
      const bsy = img.scaleY;
      // ① 낙하 — 좌우로 흩어지며 살짝 떠올랐다가(포물선 정점) 아래로 떨어진다.
      const dx = Phaser.Math.Between(-190, 190);
      const rise = Phaser.Math.Between(20, 110);
      const drop = Phaser.Math.Between(110, 300);
      const ex = srcX + dx;
      const ey = srcY + drop;
      const ctrlX = srcX + dx * 0.55;
      const ctrlY = srcY - rise;
      const GROW = 1.75; // 낙하하며 이 배율까지 **크게 확대** → 상승 회수에서 축소.
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: Phaser.Math.Between(320, 460),
        delay: i * 18,
        ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          const u = 1 - t;
          img.x = u * u * srcX + 2 * u * t * ctrlX + t * t * ex;
          img.y = u * u * srcY + 2 * u * t * ctrlY + t * t * ey;
          img.setAngle(dx * 0.35 * t);
          // 떨어지는 동안 점점 커진다(확대) — 회수 직전이 가장 크다.
          const s = Phaser.Math.Linear(1, GROW, t);
          img.setScale(bsx * s, bsy * s);
        },
        onComplete: () => {
          // ② 상승 회수 — 확대된 상태에서 잠깐 머문 뒤, **축소되며** 헤더 카운터로 날아간다(하나씩 타라락).
          this.tweens.add({
            targets: img,
            x: target.x,
            y: target.y,
            scaleX: bsx * 0.25,
            scaleY: bsy * 0.25,
            angle: 0,
            alpha: 0.9,
            duration: Phaser.Math.Between(420, 540),
            delay: 70 + i * 34,
            ease: 'Cubic.easeIn',
            onComplete: () => img.destroy(),
          });
        },
      });
    }
  }

  /**
   * **넥스트(다음 레벨) 진입 팝업**(PO 2026-07-19: "게임비를 지급하는 팝업화면은 동일하므로 타워화면에서
   *   재사용하라") — entryPopup.ts(blank.json SSOT, 홈의 "계속하기" 팝업과 완전히 동일한 화면)를 그린다.
   *   PLAY 에서 게임비 차감 후 다음 레벨 시작 — 무료 입장 없음. 홈에는 없는 "🏠 홈으로"(취소) 링크만 추가.
   */
  private enterNextLevel(): void {
    const next = this.level + 1;
    // **보너스 라운드**(PO 2026-07-27) — 10레벨 단위를 깬 직후엔 클론다이크 `10-1` 이 끼어든다.
    //   **게임비 차감 없음**(BONUS_ENTRY_FEE = 0, PO 2026-07-29) — 메인 레벨과 달리 진입 팝업 자체를 띄우지
    //   않는다. 완료 여부와 무관하게 그 씬이 끝나면 다음 메인 레벨 진입 팝업으로 이어진다(진행을 막지 않는다).
    if (hasBonusAfter(this.level)) {

      this.scene.start('playKlondike', { level: this.level, mult: this.chMult });
      return;
    }
    const handle = buildEntryPopup(this, {
      level: next,
      initialMult: this.chMult, // 직전 도전 배수 유지(해금 범위 밖이면 자동 보정).
      toast: (msg) => this.toast(msg),
      onPlay: ({ level: lv, mult }) => this.scene.start('play', { level: lv, mult }),
      onHome: () => this.scene.start('home'), // 팝업 하단 홈 버튼(공용 모듈이 그린다).
    });
    if (!handle) this.enterNextLevelFallback(next);
  }

  /** blank.json 미저작 시 폴백 — 최소한의 코드 드로우(레벨·게임비·PLAY/홈만). */
  private enterNextLevelFallback(next: number): void {
    const layer = this.add.container(0, 0).setDepth(4000);
    const scrim = this.add.rectangle(0, 0, W, H, 0x140a1e, 0.88).setOrigin(0, 0).setInteractive();
    layer.add(scrim);
    const cx = W / 2;
    const top = 760;
    layer.add(this.add.rectangle(cx, top + 420, 900, 900, 0xfff3e0).setStrokeStyle(10, 0xe0b070));
    layer.add(this.add.text(cx, top + 90, `lv ${next}`, { fontFamily: '"Jua", sans-serif', fontSize: '72px', color: '#7a4a1a', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5));
    for (let i = 0; i < 3; i++) {
      if (this.textures.exists('up_Solitare_UI_02_v2')) layer.add(this.add.image(cx + (i - 1) * 100, top + 210, 'up_Solitare_UI_02_v2').setDisplaySize(84, 84));
    }
    const costText = this.add.text(cx, top + 560, '', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#7a4a1a' }).setOrigin(0.5);
    layer.add(costText);
    const mult = Math.min(this.chMult, Math.max(...challengeOptions(next).filter((o) => o.unlocked).map((o) => o.mult))); // 직전 배수 유지(해금 범위 내).
    const fee = entryFeeFor(next, mult);
    const ok = loadSave().coins >= fee;
    costText.setText(`COST  🪙 ${fee.toLocaleString()}`).setColor(ok ? '#7a4a1a' : '#c0392b');
    const playBg = this.add.rectangle(cx, top + 700, 520, 130, 0x4caf50).setStrokeStyle(8, 0xffffff).setInteractive({ useHandCursor: true });
    layer.add(playBg);
    layer.add(this.add.text(cx, top + 700, 'PLAY', { fontFamily: '"Jua", sans-serif', fontSize: '60px', color: '#ffffff', stroke: '#2a6a2a', strokeThickness: 6 }).setOrigin(0.5));
    playBg.on('pointerdown', () => {
      const s = loadSave();
      if (s.coins < fee) {
        sfx('no_coin');
        this.toast('코인이 부족해요 — 홈에서 점포 수익을 수령해 보세요');
        return;
      }
      sfx('floor_select');
      s.coins = Math.max(0, s.coins - fee);
      writeSave(s);
      layer.destroy();
      this.scene.start('play', { level: next, mult });
    });
    const homeBtn = this.add.text(cx, top + 810, '🏠 홈으로', { fontFamily: '"Jua", sans-serif', fontSize: '36px', color: '#7a4a1a' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    homeBtn.on('pointerdown', () => {
      sfx('level_close');
      this.scene.start('home');
    });
    layer.add(homeBtn);
  }

  /**
   * 레벨 클리어 보상 팝업 — **크게 묘사**(잘했어요! · 별 3 · 큰 코인/다이아 값). 넥스트/홈을 누르면
   *   그 시점에 **코인·다이아 입자가 흩어져 떨어졌다가 상단 헤더로 빨려 올라가고**(버스트 회수) 이동한다.
   */
  private showMissionReward(
    stars: number,
    coins: number,
    diamonds: number,
    extra?: { leftover: number; collectionCards?: readonly CollectionSlot[] },
  ): void {
    const layer = this.add.container(0, 0).setDepth(2000);
    // 반투명 막 — 화면보다 **사방 90px 크게**(버튼 탭 시 카메라 셰이크로 흔들려도 가장자리로 밝은 게임 화면이
    //   새지 않게). ⚠️2026-07-26: Shape(rectangle) 대신 **Graphics 로 그린다** — 컨테이너 안 Shape 가 기기에
    //   따라 렌더되지 않아 뒤 화면이 그대로 비쳐 보상 정보가 묻히는 문제가 있었다. 입력 차단은 별도 Zone.
    const DIM_PAD = 90;
    const dim = this.add.graphics();
    dim.fillStyle(0x0a0a1a, 0.88);
    dim.fillRect(-DIM_PAD, -DIM_PAD, W + DIM_PAD * 2, H + DIM_PAD * 2);
    layer.add(dim);
    layer.add(this.add.zone(W / 2, H / 2, W + DIM_PAD * 2, H + DIM_PAD * 2).setInteractive()); // 하부 입력 차단.
    const cx = W / 2;
    // ── **세로 스택 레이아웃**(PO 2026-07-26 3·5차) — 별(상단) → 잘했어요! → 컬렉션 카드(크게) →
    //   코인·다이아 → 남은카드 안내 → 버튼. 각 블록의 높이에서 다음 블록 위치를 **순차 계산**하므로
    //   카드 유무·장수가 달라져도 겹치지 않는다(예전엔 고정 y 상수라 카드가 생기면 서로 겹쳤다).
    const gotCards = (extra?.collectionCards ?? []).filter((c) => this.textures.exists(collectionArtKey(c.set, c.card)));
    const hasCards = gotCards.length > 0;
    const CARD_H_MAX = 380; // 컬렉션 카드 높이(1~2장은 이 크기, 더 많으면 폭에 맞춰 축소).
    const CARD_GAP = 26;
    const CARD_ROW_W = 940;
    const cardAspect = hasCards
      ? (() => {
          const src = this.textures.get(collectionArtKey(gotCards[0].set, gotCards[0].card)).getSourceImage() as { width: number; height: number };
          return src.width / src.height;
        })()
      : 0.667;
    const cardCountN = gotCards.length;
    const cardH = hasCards && cardCountN * CARD_H_MAX * cardAspect + (cardCountN - 1) * CARD_GAP > CARD_ROW_W
      ? (CARD_ROW_W - (cardCountN - 1) * CARD_GAP) / (cardCountN * cardAspect)
      : CARD_H_MAX;
    const cardW = cardH * cardAspect;
    const starY = hasCards ? 400 : 470; // 별(상단) — 카드 줄 자리를 만들 때만 위로.
    const titleY = starY + 220; // "잘했어요!"(128px) — 별 바로 아래.
    const cardsLabelY = titleY + 150; // 컬렉션 카드 줄 라벨.
    const cardsTop = cardsLabelY + 40; // 카드 줄 상단.
    const cardsY = cardsTop + cardH / 2;
    const cardsBottom = cardsTop + cardH;
    // ── 별 **5개**(상단) — 획득만 골드, 나머지 흐림. 가운데가 약간 위로. ──
    const mid = (SETS_TARGET - 1) / 2;
    for (let i = 0; i < SETS_TARGET; i++) {
      if (!this.textures.exists('up_Solitare_UI_02_v2')) break;
      const sx = cx + (i - mid) * 128;
      const sy = starY - Math.round((1 - Math.abs(i - mid) / mid) * 40); // 가운데가 위로 아치.
      const st = this.add.image(sx, sy, 'up_Solitare_UI_02_v2').setDisplaySize(108, 108);
      const got = i < stars;
      if (!got) st.setTint(0x555566).setAlpha(0.55);
      const tsx = st.scaleX;
      const tsy = st.scaleY;
      st.setScale(0);
      layer.add(st);
      this.tweens.add({ targets: st, scaleX: tsx, scaleY: tsy, duration: 340, delay: 200 + i * 200, ease: 'Back.easeOut' });
      if (got) this.time.delayedCall(200 + i * 200, () => sfxStar(i + 1));
    }
    // ── 제목 ──
    layer.add(this.add.text(cx, titleY, '잘했어요!', { fontFamily: '"Jua", sans-serif', fontSize: '128px', color: '#ffd23f', stroke: '#a6510c', strokeThickness: 14 }).setOrigin(0.5).setShadow(0, 8, '#00000066', 12));

    // ── **컬렉션 카드 획득분**(보드에서 열어 스타게이지에 담아둔 카드) — 제목 다음 줄에 **크게**. ──
    //   ⚠️ 획득 장수(원문자)는 여기 표시하지 않는다(PO 2026-07-26 5차) — 보유 장수는 콜렉션 화면에서만.
    if (hasCards) {
      layer.add(
        this.add
          .text(cx, cardsLabelY, '🗂 컬렉션 카드 획득!', { fontFamily: '"Jua", sans-serif', fontSize: '46px', color: '#ffe27a', stroke: '#5a3210', strokeThickness: 7 })
          .setOrigin(0.5),
      );
      gotCards.forEach((c, i) => {
        const x = cx + (i - (cardCountN - 1) / 2) * (cardW + CARD_GAP);
        const img = this.add.image(x, cardsY, collectionArtKey(c.set, c.card)).setDisplaySize(cardW, cardH);
        const bsx = img.scaleX;
        const bsy = img.scaleY;
        img.setScale(0).setAngle(-12);
        layer.add(img);
        this.tweens.add({ targets: img, scaleX: bsx, scaleY: bsy, angle: 0, duration: 400, delay: 900 + i * 160, ease: 'Back.easeOut' });
        this.time.delayedCall(900 + i * 160, () => sfx('star', { volume: 0.45 }));
      });
    }

    // ── 큰 보상: 코인(좌) · 다이아(우) — 앞 블록 아래로 순차 배치(겹침 방지). ──
    const hasGem = diamonds > 0;
    const COIN_ICON_H = 190; // 코인 아이콘 표시 높이(아래 숫자·안내문 간격 계산 기준).
    const rewardY = hasCards ? cardsBottom + 60 + COIN_ICON_H / 2 : 1180; // 카드가 없으면 기존 배치 유지.
    const coinX = hasGem ? cx - 210 : cx;
    const coinIcon = this.add.image(coinX, rewardY, 'up_Solitare_UI_2_3');
    if (this.textures.exists('up_Solitare_UI_2_3')) {
      const cs = coinIcon.texture.getSourceImage() as { width: number; height: number };
      coinIcon.setDisplaySize(190, 190 * (cs.height / cs.width));
    }
    const coinNum = this.add.text(coinX, rewardY + 150, coins.toLocaleString(), { fontFamily: '"Jua", sans-serif', fontSize: '66px', color: '#ffffff', stroke: '#5a3210', strokeThickness: 9 }).setOrigin(0.5);
    layer.add(coinIcon);
    layer.add(coinNum);
    // **남은 카드 → 별 반영 안내**(코인 아님·별로 일원화) — 방금 남은 카드가 별 게이지로 변환됐음을 학습.
    const hasLeftover = !!extra && extra.leftover > 0;
    if (hasLeftover && extra) {
      layer.add(
        this.add
          .text(cx, rewardY + 236, `🃏 남은 카드 ${extra.leftover}장 → ⭐ 별로 전환`, {
            fontFamily: '"Jua", sans-serif',
            fontSize: '38px',
            color: '#ffe14d',
            stroke: '#5a3210',
            strokeThickness: 6,
          })
          .setOrigin(0.5),
      );
    }
    let gemIcon: Phaser.GameObjects.Image | undefined;
    if (hasGem && this.textures.exists('up_Solitare_UI_2_2')) {
      const gx = cx + 210;
      gemIcon = this.add.image(gx, rewardY, 'up_Solitare_UI_2_2');
      const gs = gemIcon.texture.getSourceImage() as { width: number; height: number };
      gemIcon.setDisplaySize(180, 180 * (gs.height / gs.width));
      layer.add(gemIcon);
      layer.add(this.add.text(gx, rewardY + 150, `${diamonds}`, { fontFamily: '"Jua", sans-serif', fontSize: '66px', color: '#ffffff', stroke: '#5a1a6a', strokeThickness: 9 }).setOrigin(0.5));
    }
    // 보상 아이콘 등장 팝.
    for (const o of [coinIcon, gemIcon].filter(Boolean) as Phaser.GameObjects.GameObject[]) {
      const g = o as Phaser.GameObjects.Image;
      const bsx = g.scaleX;
      const bsy = g.scaleY;
      g.setScale(0);
      this.tweens.add({ targets: g, scaleX: bsx, scaleY: bsy, duration: 360, delay: 700, ease: 'Back.easeOut' });
    }

    // ── 넥스트/홈 버튼 → **보상 버스트 회수**(입자 낙하 → 헤더로 상승) 뒤 이동. ──
    //   저작 풀(editorLevels)을 넘어도 순환 재사용되므로, 다음 버튼은 진행도 상한까지만 체크한다.
    const hasNext = this.level + 1 <= MAX_PROGRESS_LEVEL;
    // **보상 회수 연출은 이 화면에서 딱 한 번**(PO 2026-07-29) — 넥스트로 진입 팝업을 띄웠다가 ✕ 로 돌아오면
    //   이 결과 화면이 다시 보이는데, 그때 넥스트/홈을 누를 때마다 코인·다이아 버스트가 재생되고 있었다.
    //   보상은 이미 회수됐고 큰 아이콘도 소멸한 뒤라, 재실행은 "받은 적 없는 보상을 또 받는" 그림이 된다.
    let rewardsCollected = false;
    const go = (fn: () => void): void => {
      if (rewardsCollected) {
        fn(); // 두 번째부터는 연출 없이 곧바로 이동.
        return;
      }
      rewardsCollected = true;
      const coinTarget = { x: 360, y: 90 }; // 좌상단 코인 카운터.
      const gemTarget = this.header?.diamondAnchor ?? { x: W - 260, y: 90 }; // 우상단 다이아 카운터.
      sfx('coin_burst', { volume: 0.35 });
      this.cameras.main.shake(160, 0.004); // 살짝 임팩트.
      // 큰 아이콘·숫자는 팝하며 소멸 — 그 자리에서 입자 버스트로 교대.
      this.tweens.add({
        targets: [coinIcon, coinNum, ...(gemIcon ? [gemIcon] : [])],
        scaleX: '*=1.5',
        scaleY: '*=1.5',
        alpha: 0,
        duration: 260,
        ease: 'Quad.easeOut',
      });
      // 코인: 금액 비례 여러 개(8~16) 가 흩어져 떨어졌다가 → 좌상단으로 하나씩 상승 회수.
      const coinN = Phaser.Math.Clamp(Math.round(coins / 125), 8, 16);
      this.rewardBurstFly(coinX, rewardY, 'up_Solitare_UI_2_3', coinN, coinTarget, 92);
      // 다이아: **보상 갯수만큼** 생성되어 떨어졌다가 → 우상단 다이아 카운터로 상승 회수.
      if (diamonds > 0) this.rewardBurstFly(cx + 210, rewardY, 'up_Solitare_UI_2_2', diamonds, gemTarget, 96);
      // 낙하+스태거 상승이 끝난 뒤 이동 — **미션 티어 완료분이 있으면 먼저 박스 팝업**을 보여주고 그 다음 이동.
      this.time.delayedCall(1900, () => {
        const box = this.pendingMissionBox;
        this.pendingMissionBox = undefined;
        if (box) this.showMissionBoxPopup(box, fn);
        else fn();
      });
    };
    const btns: Array<{ key: string; on: () => void }> = [
      ...(hasNext ? [{ key: 'up_Solitare_UI_23_1', on: () => this.enterNextLevel() }] : []),
      { key: 'up_Solitare_UI_23_2', on: () => this.scene.start('home') },
    ];
    // 버튼도 앞 블록(코인·다이아 숫자 / 남은카드 안내) 아래로 순차 배치 — 카드 줄이 있으면 자연히 내려온다.
    let by = hasLeftover ? rewardY + 346 : rewardY + 320;
    for (const b of btns) {
      layer.add(this.uiButton(W / 2, by, b.key, () => go(b.on), 440));
      by += 150;
    }
  }

  /**
   * **미션 티어 완료 팝업** — 아이템 박스 보상(코인·다이아·부스터) 요약. 배경은 공통에셋(Pannel_03) 이식.
   *   화면 아무 곳이나 탭하면 onDone(원래 넥스트/홈 이동)으로 이어진다.
   */
  private showMissionBoxPopup(box: MissionRewardBox, onDone: () => void): void {
    const cx = W / 2;
    const cy = H / 2;
    const layer = this.add.container(0, 0).setDepth(2200);
    // 딤은 Graphics 로(컨테이너 안 Shape 미렌더 이슈 회피 — showMissionReward 와 동일), 입력 차단은 Zone 으로 분리.
    const dim = this.add.graphics();
    dim.fillStyle(0x0a0a1a, 0.86);
    dim.fillRect(0, 0, W, H);
    layer.add(dim);
    const scrim = this.add.zone(W / 2, H / 2, W, H).setInteractive();
    layer.add(scrim);
    if (this.textures.exists(MISSION_BOX_PANEL_KEY)) {
      layer.add(this.add.image(cx, cy, MISSION_BOX_PANEL_KEY).setDisplaySize(760, 950));
    }
    layer.add(
      this.add
        .text(cx, cy - 340, '미션 완료!', { fontFamily: '"Jua", sans-serif', fontSize: '86px', color: '#ffd23f', stroke: '#a6510c', strokeThickness: 12 })
        .setOrigin(0.5)
        .setShadow(0, 6, '#00000066', 10),
    );
    if (this.textures.exists('up_Item_01_01-4')) {
      layer.add(this.add.image(cx, cy - 160, 'up_Item_01_01-4').setDisplaySize(140, 226));
    }
    layer.add(this.add.text(cx, cy - 40, '아이템 박스 획득!', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#7a4a1a' }).setOrigin(0.5));
    const rows: string[] = [];
    if (box.coins) rows.push(`🪙 코인 +${box.coins.toLocaleString()}`);
    if (box.diamonds) rows.push(`💎 다이아 +${box.diamonds}`);
    if (box.boosters?.wild) rows.push(`🃏 와일드 +${box.boosters.wild}`);
    if (box.boosters?.plus5) rows.push(`🎴 +5카드 +${box.boosters.plus5}`);
    if (box.boosters?.undo) rows.push(`↩️ 되돌리기 +${box.boosters.undo}`);
    if (box.collectionCards) rows.push(`🗂 컬렉션 카드 +${box.collectionCards}`);
    layer.add(
      this.add
        .text(cx, cy + 60, rows.join('\n'), { fontFamily: '"Jua", sans-serif', fontSize: '38px', color: '#5a3210', align: 'center', lineSpacing: 14 })
        .setOrigin(0.5),
    );
    layer.add(this.add.text(cx, cy + 300, '탭하여 계속', { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#a08060' }).setOrigin(0.5));
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
    layer.once(Phaser.GameObjects.Events.DESTROY, onDone);
    scrim.once('pointerdown', () => {
      sfx('button');
      layer.destroy();
    });
  }
}
